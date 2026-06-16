import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { confirmEmployeeImport, previewEmployeeImport } from "../src/server/employees/imports";
import {
  applyPilotIdentityImport,
  buildPilotIdentityImportPlan,
  projectPilotIdentityImportContext,
  readPilotIdentityImportContext,
} from "../src/server/provisioning/pilot-identity-import";
import {
  buildPilotImportPreflightReport,
  pilotImportPreflightPassed,
} from "../src/server/readiness/pilot-import-preflight";
import {
  buildPilotInviteReadinessReport,
  pilotInviteReadinessPassed,
  readPilotInviteReadinessSnapshotFromDatabase,
} from "../src/server/readiness/pilot-invite-readiness";
import { redactSensitiveDetail } from "../src/server/readiness/production-pilot-gate";
import {
  confirmPayrollProfileImport,
  previewPayrollProfileImport,
  previewPayrollProfileImportRows,
} from "../src/server/payroll/profile-imports";

const prisma = new PrismaClient();

type ImportStage = {
  name: string;
  status: "pass" | "block" | "applied" | "skipped";
  detail: string;
};

type ImportReport = {
  status: "ready_to_apply" | "applied" | "blocked";
  generatedAt: string;
  apply: boolean;
  stages: ImportStage[];
  nextActions: string[];
};

async function main() {
  const args = process.argv.slice(2);
  const tenantSlug = readArg(args, "--tenant-slug");
  const companyId = readArg(args, "--company-id");
  const employeeCsvPath = readArg(args, "--employee-csv");
  const identityCsvPath = readArg(args, "--identity-csv");
  const payrollCsvPath = readArg(args, "--payroll-csv");
  const output = readArg(args, "--output");
  const apply = args.includes("--apply");
  const json = args.includes("--json");
  if (!tenantSlug) throw new Error("Missing --tenant-slug=<customer-slug>.");
  if (!employeeCsvPath) throw new Error("Missing --employee-csv=<path>.");
  if (!identityCsvPath) throw new Error("Missing --identity-csv=<path>.");
  if (!payrollCsvPath) throw new Error("Missing --payroll-csv=<path>.");
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes("REPLACE_WITH_")) {
    throw new Error("DATABASE_URL is required for pilot customer import.");
  }

  const employeeCsv = readFileSync(resolve(employeeCsvPath), "utf8");
  const identityCsv = readFileSync(resolve(identityCsvPath), "utf8");
  const payrollCsv = readFileSync(resolve(payrollCsvPath), "utf8");
  const context = await readTenantCompany(tenantSlug, companyId);
  const session = {
    role: "hr_admin" as const,
    tenantId: context.tenantId,
    companyId: context.companyId,
    user: null,
    employee: null,
  };
  const stages: ImportStage[] = [];

  const preflight = buildPilotImportPreflightReport({ employeeCsv, identityCsv, payrollCsv });
  stages.push({
    name: "employee/identity/payroll import preflight",
    status: pilotImportPreflightPassed(preflight) ? "pass" : "block",
    detail: `${preflight.status}; ${preflight.employeeRows} employee row(s), ${preflight.identityRows} identity row(s), ${preflight.payrollRows} payroll row(s), ${preflight.blockers} blocker(s), ${preflight.warnings} warning(s)`,
  });

  const employeePreview = await previewEmployeeImport(session, employeeCsv);
  stages.push({
    name: "employee import preview",
    status: employeePreview.invalidCount === 0 ? "pass" : "block",
    detail: `${employeePreview.validCount}/${employeePreview.rows.length} valid row(s); pilot ${employeePreview.pilotReadiness.status}; projected ${employeePreview.pilotReadiness.projectedEmployeeCount} employee(s)`,
  });

  if (!pilotImportPreflightPassed(preflight) || employeePreview.invalidCount > 0) {
    return writeReport({
      status: "blocked",
      generatedAt: new Date().toISOString(),
      apply,
      stages,
      nextActions: [
        "Fix import preflight and employee preview blockers before applying customer pilot data.",
      ],
    }, output, json, 1);
  }

  const existingIdentityContext = await readPilotIdentityImportContext(prisma, {
    tenantSlug,
    companyId,
  });
  const projectedIdentityContext = projectPilotIdentityImportContext({
    context: existingIdentityContext,
    employees: employeePreview.rows
      .filter((row) => row.status === "valid")
      .map((row) => ({
        id: `projected:${row.employeeNo}`,
        employeeNo: row.employeeNo,
        displayName: row.displayName,
        managerEmployeeNo: row.managerEmployeeNo,
      })),
  });

  let identityPlan: ReturnType<typeof buildPilotIdentityImportPlan> | null = null;
  try {
    identityPlan = buildPilotIdentityImportPlan({
      rawCsv: identityCsv,
      context: projectedIdentityContext,
    });
    const blockedChecks = identityPlan.checks.filter((check) => check.status === "block").length;
    stages.push({
      name: "identity import projected preview",
      status: identityPlan.status === "ready" ? "pass" : "block",
      detail: `${identityPlan.status}; ${identityPlan.validCount}/${identityPlan.csvRowCount} valid identity row(s); ${identityPlan.managerRoleCount} manager role assignment(s); ${blockedChecks} blocker check(s)`,
    });
  } catch (error) {
    stages.push({
      name: "identity import projected preview",
      status: "block",
      detail: errorDetail(error),
    });
  }

  let projectedPayrollPreview: ReturnType<typeof previewPayrollProfileImportRows> | null = null;
  try {
    projectedPayrollPreview = previewPayrollProfileImportRows(
      payrollCsv,
      projectedIdentityContext.employees.map((employee) => ({
        id: employee.id,
        employeeNo: employee.employeeNo,
        displayName: employee.displayName,
      })),
    );
    stages.push({
      name: "payroll profile projected preview",
      status: projectedPayrollPreview.invalidCount === 0 ? "pass" : "block",
      detail: `${projectedPayrollPreview.validCount}/${projectedPayrollPreview.rows.length} valid payroll profile row(s)`,
    });
  } catch (error) {
    stages.push({
      name: "payroll profile projected preview",
      status: "block",
      detail: errorDetail(error),
    });
  }

  if (identityPlan?.status !== "ready" || !projectedPayrollPreview || projectedPayrollPreview.invalidCount > 0) {
    return writeReport({
      status: "blocked",
      generatedAt: new Date().toISOString(),
      apply,
      stages,
      nextActions: [
        ...(!identityPlan
          ? ["Fix identity import projected preview blockers before applying customer pilot data."]
          : identityPlan.status === "blocked"
            ? identityPlan.nextActions
            : []),
        ...(!projectedPayrollPreview || projectedPayrollPreview.invalidCount > 0
          ? ["Fix projected payroll profile blockers before applying customer pilot data."]
          : []),
        "Re-run the same dry-run after fixing the completed employee, identity, and payroll CSV files.",
      ],
    }, output, json, 1);
  }

  if (!apply) {
    return writeReport({
      status: "ready_to_apply",
      generatedAt: new Date().toISOString(),
      apply,
      stages: [
        ...stages,
        {
          name: "database writes",
          status: "skipped",
          detail: "dry-run only; pass --apply after HR verifies the redacted report",
        },
      ],
      nextActions: [
        "Run the same command with --apply only after HR verifies the redacted dry-run report and source CSV files are in approved secure storage.",
      ],
    }, output, json, 0);
  }

  const employeeResult = await confirmEmployeeImport(session, employeePreview.id);
  stages.push({
    name: "employee import apply",
    status: "applied",
    detail: `${employeeResult.importedCount} employee row(s) imported`,
  });

  const appliedIdentityContext = await readPilotIdentityImportContext(prisma, {
    tenantSlug,
    companyId,
  });
  const identityResult = await applyPilotIdentityImport(prisma, {
    rawCsv: identityCsv,
    context: appliedIdentityContext,
  });
  stages.push({
    name: "identity import apply",
    status: identityResult.plan.status === "ready" ? "applied" : "block",
    detail: `${identityResult.employeesLinked} employee link(s), ${identityResult.roleAssignmentsEnsured} role assignment(s), ${identityResult.externalIdentitiesLinked} SSO identity link(s)`,
  });

  const payrollPreview = await previewPayrollProfileImport(session, payrollCsv);
  stages.push({
    name: "payroll profile import preview",
    status: payrollPreview.invalidCount === 0 ? "pass" : "block",
    detail: `${payrollPreview.validCount}/${payrollPreview.rows.length} valid payroll profile row(s)`,
  });
  if (payrollPreview.invalidCount > 0) {
    return writeReport({
      status: "blocked",
      generatedAt: new Date().toISOString(),
      apply,
      stages,
      nextActions: [
        "Fix payroll profile import blockers. Employee and identity imports may already have been applied; review audit logs before retrying payroll profiles.",
      ],
    }, output, json, 1);
  }

  const payrollResult = await confirmPayrollProfileImport(session, payrollPreview.id);
  stages.push({
    name: "payroll profile import apply",
    status: "applied",
    detail: `${payrollResult.importedCount} payroll profile row(s), ${payrollResult.salaryProfilesCreated} salary profile(s), ${payrollResult.paymentProfilesCreated} payment profile(s)`,
  });

  const inviteReadiness = buildPilotInviteReadinessReport({
    snapshot: await readPilotInviteReadinessSnapshotFromDatabase({ tenantSlug, companyId }),
  });
  stages.push({
    name: "invite readiness",
    status: pilotInviteReadinessPassed(inviteReadiness) ? "pass" : "block",
    detail: `${inviteReadiness.status}; ${inviteReadiness.activeEmployeeCount} active employee(s), ${inviteReadiness.managerWithDirectReportsCount} manager(s), ${inviteReadiness.blockers} blocker(s), ${inviteReadiness.warnings} warning(s)`,
  });

  return writeReport({
    status: pilotInviteReadinessPassed(inviteReadiness) ? "applied" : "blocked",
    generatedAt: new Date().toISOString(),
    apply,
    stages,
    nextActions: pilotInviteReadinessPassed(inviteReadiness)
      ? ["Run pnpm pilot:go-no-go before inviting pilot employees."]
      : ["Fix invite readiness blockers before inviting pilot employees."],
  }, output, json, pilotInviteReadinessPassed(inviteReadiness) ? 0 : 1);
}

async function readTenantCompany(tenantSlug: string, companyId: string | null) {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug.trim() },
    include: {
      companies: companyId ? { where: { id: companyId } } : { take: 1 },
    },
  });
  const company = tenant?.companies[0] ?? null;
  if (!tenant || !company) throw new Error("Tenant or company not found for pilot customer import.");
  return { tenantId: tenant.id, companyId: company.id };
}

function writeReport(report: ImportReport, output: string | null, json: boolean, exitCode: number) {
  const content = json ? `${JSON.stringify(report, null, 2)}\n` : formatReport(report);
  if (output) {
    const outputPath = resolve(output);
    writeFileSync(outputPath, content, { encoding: "utf8", mode: 0o600 });
    console.log(`Created ${outputPath}.`);
    console.log("Customer import output is redacted; keep raw CSV files in approved secure storage.");
  } else {
    process.stdout.write(content);
  }
  process.exit(exitCode);
}

function formatReport(report: ImportReport) {
  return [
    "# HR One Pilot Customer Import",
    "",
    `Generated at: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Mode: ${report.apply ? "apply" : "dry-run"}`,
    "",
    "## Stages",
    "",
    ...report.stages.map((stage) => `- [${stage.status.toUpperCase()}] ${stage.name}: ${redactSensitiveDetail(stage.detail)}`),
    "",
    "## Next Actions",
    "",
    ...report.nextActions.map((action) => `- ${redactSensitiveDetail(action)}`),
    "",
    "## Privacy",
    "",
    "- This report intentionally excludes employee names, emails, SSO subjects, salary amounts, bank accounts, national IDs, health data, and private HR notes.",
    "- Raw CSV files must stay in approved secure storage and must not be pasted into chat, tickets, logs, or screenshots.",
    "",
  ].join("\n");
}

function readArg(args: string[], name: string) {
  const equalsArg = args.find((arg) => arg.startsWith(`${name}=`));
  if (equalsArg) return equalsArg.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;
  return null;
}

function errorDetail(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Pilot customer import failed unexpectedly: ${redactSensitiveDetail(message)}`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
