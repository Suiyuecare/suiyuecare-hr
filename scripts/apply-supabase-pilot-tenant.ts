import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildSupabasePilotTenantSeedPlan,
  buildSupabasePilotTenantVerificationChecks,
  buildSupabasePilotTenantVerificationSql,
  supabasePilotTenantVerificationPassed,
  type SupabasePilotTenantVerificationSnapshot,
} from "../src/server/readiness/supabase-pilot-tenant";

type SupabaseCliQueryResult = {
  rows?: unknown[];
};

function main() {
  const args = process.argv.slice(2);
  const schemaName = readArg(args, "--schema") ?? "hr_one";
  const projectRef = readArg(args, "--project-ref") ?? process.env.SUPABASE_PROJECT_REF;
  const referenceDate = readDateArg(args, "--reference-date");
  const shouldApply = args.includes("--apply");
  const verifyOnly = args.includes("--verify-only");
  const printSql = args.includes("--print-sql");
  const plan = buildSupabasePilotTenantSeedPlan({ schemaName, referenceDate });

  if (printSql) {
    process.stdout.write(plan.sql);
    return;
  }

  if (!shouldApply && !verifyOnly) {
    console.log("HR One Supabase pilot tenant seed dry run.");
    console.log(formatSeedSummary(plan.summary));
    console.log("No database changes were made. Re-run with --apply to seed, or --verify-only to inspect an existing seed.");
    return;
  }

  if (!projectRef) {
    throw new Error("Missing --project-ref or SUPABASE_PROJECT_REF.");
  }

  if (shouldApply) {
    runSupabaseLinkedQueryFile(projectRef, plan.sql);
    console.log("HR One Supabase pilot tenant seed applied.");
    console.log(formatSeedSummary(plan.summary));
  }

  const snapshot = runSupabaseLinkedQuery(
    projectRef,
    buildSupabasePilotTenantVerificationSql(schemaName),
  );
  const checks = buildSupabasePilotTenantVerificationChecks(snapshot);

  console.log(`HR One Supabase pilot tenant verification: ${schemaName}`);
  for (const item of checks) {
    console.log(`${item.passed ? "PASS" : "FAIL"} ${item.name}: ${item.detail}`);
  }

  if (!supabasePilotTenantVerificationPassed(checks)) {
    console.error("Supabase pilot tenant verification failed.");
    process.exit(1);
  }

  console.log("Supabase pilot tenant verification passed.");
}

function runSupabaseLinkedQuery(projectRef: string, sql: string): SupabasePilotTenantVerificationSnapshot {
  const result = runSupabaseLinkedQueryFile(projectRef, sql);
  const queryResult = JSON.parse(extractFirstJsonObject(result.stdout)) as SupabaseCliQueryResult;
  const row = queryResult.rows?.[0];
  return parseSnapshot(row);
}

function runSupabaseLinkedQueryFile(projectRef: string, sql: string) {
  const workdir = mkdtempSync(join(tmpdir(), "hrone-supabase-"));
  const tempDir = join(workdir, "supabase", ".temp");
  const sqlFile = join(workdir, "query.sql");
  mkdirSync(tempDir, { recursive: true });
  writeFileSync(join(tempDir, "project-ref"), projectRef, "utf8");
  writeFileSync(sqlFile, sql, "utf8");

  try {
    const supabaseBinary = process.env.SUPABASE_CLI ?? "supabase";
    const result = spawnSync(supabaseBinary, [
      "db",
      "query",
      "--linked",
      "--file",
      sqlFile,
      "--workdir",
      workdir,
      "--output",
      "json",
    ], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 25,
    });

    if (result.status !== 0) {
      const stderr = result.stderr.trim();
      throw new Error(stderr || `Supabase CLI exited with status ${result.status ?? "unknown"}.`);
    }
    return result;
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
}

function parseSnapshot(row: unknown): SupabasePilotTenantVerificationSnapshot {
  if (!row || typeof row !== "object") {
    throw new Error("Supabase pilot tenant verification query returned no rows.");
  }
  const record = row as Record<string, unknown>;
  return {
    tenantCount: readNumber(record, "tenantCount"),
    companyCount: readNumber(record, "companyCount"),
    employeeCount: readNumber(record, "employeeCount"),
    managerCount: readNumber(record, "managerCount"),
    departmentCount: readNumber(record, "departmentCount"),
    userCount: readNumber(record, "userCount"),
    userRoleCount: readNumber(record, "userRoleCount"),
    roleKeys: readStringArray(record, "roleKeys"),
    roleAssignmentKeys: readStringArray(record, "roleAssignmentKeys"),
    attendancePolicyCount: readNumber(record, "attendancePolicyCount"),
    shiftTemplateCount: readNumber(record, "shiftTemplateCount"),
    workScheduleCount: readNumber(record, "workScheduleCount"),
    leavePolicyCount: readNumber(record, "leavePolicyCount"),
    leaveBalanceCount: readNumber(record, "leaveBalanceCount"),
    salaryProfileCount: readNumber(record, "salaryProfileCount"),
    payrollComplianceProfileCount: readNumber(record, "payrollComplianceProfileCount"),
    statutoryInsuranceReadyEmployeeCount: readNumber(record, "statutoryInsuranceReadyEmployeeCount"),
    paymentProfileCount: readNumber(record, "paymentProfileCount"),
    releasedPayrollRunCount: readNumber(record, "releasedPayrollRunCount"),
    payrollItemCount: readNumber(record, "payrollItemCount"),
    releasedPayslipCount: readNumber(record, "releasedPayslipCount"),
    announcementCount: readNumber(record, "announcementCount"),
    announcementReceiptCount: readNumber(record, "announcementReceiptCount"),
    formTemplateCount: readNumber(record, "formTemplateCount"),
    workflowStepCount: readNumber(record, "workflowStepCount"),
    activeRuleVersionCount: readNumber(record, "activeRuleVersionCount"),
    telemetryEventCount: readNumber(record, "telemetryEventCount"),
    betaPilotTrialRunCount: readNumber(record, "betaPilotTrialRunCount"),
    auditLogCount: readNumber(record, "auditLogCount"),
    auditEntityTypes: readStringArray(record, "auditEntityTypes"),
    exposedTablePrivilegeCount: readNumber(record, "exposedTablePrivilegeCount"),
    anonUsage: readBoolean(record, "anonUsage"),
    authenticatedUsage: readBoolean(record, "authenticatedUsage"),
  };
}

function formatSeedSummary(summary: ReturnType<typeof buildSupabasePilotTenantSeedPlan>["summary"]) {
  return [
    `tenant=${summary.tenantSlug}`,
    `company=${summary.companyCode}`,
    `employees=${summary.employeeCount}`,
    `managers=${summary.managerCount}`,
    `departments=${summary.departmentCount}`,
    `workSchedules=${summary.workScheduleCount}`,
    `leaveBalances=${summary.leaveBalanceCount}`,
    `releasedPayslips=${summary.releasedPayslipCount}`,
    `auditEvents=${summary.auditLogCount}`,
  ].join(" ");
}

function extractFirstJsonObject(output: string): string {
  const start = output.indexOf("{");
  if (start < 0) throw new Error("Supabase CLI did not return JSON output.");

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < output.length; index += 1) {
    const char = output[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return output.slice(start, index + 1);
    }
  }

  throw new Error("Could not parse Supabase CLI JSON output.");
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) throw new Error(`Invalid numeric value for ${key}.`);
  return numberValue;
}

function readBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") throw new Error(`Invalid boolean value for ${key}.`);
  return value;
}

function readStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value.startsWith("{") && value.endsWith("}")) {
    return value.slice(1, -1).split(",").filter(Boolean);
  }
  throw new Error(`Invalid string array value for ${key}.`);
}

function readDateArg(args: string[], name: string) {
  const value = readArg(args, name);
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${name} must use YYYY-MM-DD.`);
  }
  return new Date(`${value}T00:00:00.000Z`);
}

function readArg(args: string[], name: string) {
  const equalsArg = args.find((arg) => arg.startsWith(`${name}=`));
  if (equalsArg) return equalsArg.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;
  return null;
}

main();
