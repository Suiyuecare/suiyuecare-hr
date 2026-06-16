import type { PrismaClient } from "@prisma/client";
import { writeAuditLog } from "@/server/audit/audit";
import { stableHash } from "@/server/audit/redaction";
import type { RoleKey } from "@/server/auth/rbac";

export const pilotIdentityImportTemplateHeaders = [
  "employeeNo",
  "email",
  "externalSubject",
] as const;

export type PilotIdentityEmployee = {
  id: string;
  employeeNo: string;
  displayName: string;
  userId: string | null;
  hasDirectReports: boolean;
};

export type PilotIdentityExistingUser = {
  id: string;
  email: string;
  status: string;
  linkedEmployeeId: string | null;
};

export type PilotIdentityExistingIdentity = {
  issuer: string;
  subject: string;
  userId: string;
};

export type PilotIdentityImportContext = {
  tenantId: string;
  companyId: string;
  tenantSlug: string;
  ssoProvider: string | null;
  ssoIssuer: string | null;
  allowedEmailDomains: string[];
  employees: PilotIdentityEmployee[];
  existingUsers: PilotIdentityExistingUser[];
  existingIdentities: PilotIdentityExistingIdentity[];
};

export type PilotIdentityImportRow = {
  rowNumber: number;
  employeeNo: string;
  email: string;
  externalSubject: string;
  employeeId: string | null;
  roles: RoleKey[];
  status: "valid" | "invalid";
  errors: string[];
};

export type PilotIdentityImportPlan = {
  id: string;
  generatedAt: string;
  status: "ready" | "blocked";
  activeEmployeeCount: number;
  csvRowCount: number;
  validCount: number;
  invalidCount: number;
  managerRoleCount: number;
  employeeRoleCount: number;
  checks: Array<{
    name: string;
    status: "pass" | "block";
    detail: string;
  }>;
  rows: PilotIdentityImportRow[];
  nextActions: string[];
};

export type PilotIdentityImportApplyResult = {
  plan: PilotIdentityImportPlan;
  usersUpserted: number;
  employeesLinked: number;
  roleAssignmentsEnsured: number;
  externalIdentitiesLinked: number;
};

const minPilotEmployees = 20;
const maxPilotEmployees = 50;

export async function readPilotIdentityImportContext(
  db: PrismaClient,
  options: { tenantSlug: string; companyId?: string | null },
): Promise<PilotIdentityImportContext> {
  const tenant = await db.tenant.findUnique({
    where: { slug: options.tenantSlug.trim() },
    include: {
      companies: options.companyId
        ? { where: { id: options.companyId }, include: { securitySettings: true } }
        : { take: 1, include: { securitySettings: true } },
    },
  });
  const company = tenant?.companies[0] ?? null;
  if (!tenant || !company) {
    throw new Error("Tenant or company not found for pilot identity import.");
  }
  const [employees, users, identities] = await Promise.all([
    db.employee.findMany({
      where: {
        tenantId: tenant.id,
        companyId: company.id,
        employmentStatus: "active",
      },
      select: {
        id: true,
        employeeNo: true,
        displayName: true,
        userId: true,
        directReports: {
          where: { employmentStatus: "active" },
          select: { id: true },
        },
      },
      orderBy: { employeeNo: "asc" },
    }),
    db.user.findMany({
      where: { tenantId: tenant.id },
      select: {
        id: true,
        email: true,
        status: true,
        employee: { select: { id: true } },
      },
    }),
    db.userExternalIdentity.findMany({
      where: { tenantId: tenant.id },
      select: {
        issuer: true,
        subject: true,
        userId: true,
      },
    }),
  ]);

  return {
    tenantId: tenant.id,
    companyId: company.id,
    tenantSlug: tenant.slug,
    ssoProvider: company.securitySettings?.ssoProvider ?? null,
    ssoIssuer: company.securitySettings?.ssoIssuerUrl ?? null,
    allowedEmailDomains: parseAllowedEmailDomains(company.securitySettings?.allowedEmailDomainsJson),
    employees: employees.map((employee) => ({
      id: employee.id,
      employeeNo: employee.employeeNo,
      displayName: employee.displayName,
      userId: employee.userId,
      hasDirectReports: employee.directReports.length > 0,
    })),
    existingUsers: users.map((user) => ({
      id: user.id,
      email: user.email,
      status: user.status,
      linkedEmployeeId: user.employee?.id ?? null,
    })),
    existingIdentities: identities,
  };
}

export function buildPilotIdentityImportPlan(input: {
  rawCsv: string;
  context: PilotIdentityImportContext;
  ssoProvider?: string | null;
  ssoIssuer?: string | null;
  generatedAt?: Date;
}): PilotIdentityImportPlan {
  const generatedAt = (input.generatedAt ?? new Date()).toISOString();
  const records = parseCsv(input.rawCsv);
  const employeeByNo = new Map(input.context.employees.map((employee) => [employee.employeeNo.toLowerCase(), employee]));
  const userByEmail = new Map(input.context.existingUsers.map((user) => [normalizeEmail(user.email), user]));
  const identityBySubject = new Map(
    input.context.existingIdentities.map((identity) => [identityKey(identity.issuer, identity.subject), identity]),
  );
  const ssoIssuer = input.ssoIssuer ?? input.context.ssoIssuer;
  const ssoProvider = input.ssoProvider ?? input.context.ssoProvider;
  const seenEmployeeNos = new Set<string>();
  const seenEmails = new Set<string>();
  const seenSubjects = new Set<string>();
  const rows = records.map((record, index) => {
    const rowNumber = index + 2;
    const employeeNo = text(record.employeeNo);
    const email = normalizeEmail(text(record.email));
    const externalSubject = text(record.externalSubject);
    const employee = employeeByNo.get(employeeNo.toLowerCase()) ?? null;
    const existingUser = userByEmail.get(email) ?? null;
    const existingIdentity = ssoIssuer && externalSubject
      ? identityBySubject.get(identityKey(ssoIssuer, externalSubject)) ?? null
      : null;
    const roles: RoleKey[] = employee?.hasDirectReports ? ["employee", "manager"] : ["employee"];
    const errors = [
      ...validateEmployeeNo(employeeNo, employee, seenEmployeeNos),
      ...validateEmail(email, input.context.allowedEmailDomains, seenEmails),
      ...validateExternalSubject(externalSubject, ssoProvider, ssoIssuer, seenSubjects),
      ...validateExistingUserLink(existingUser, employee?.id ?? null),
      ...validateExistingIdentityLink(existingIdentity, existingUser?.id ?? employee?.userId ?? null),
    ];
    if (employeeNo) seenEmployeeNos.add(employeeNo.toLowerCase());
    if (email) seenEmails.add(email);
    if (externalSubject) seenSubjects.add(externalSubject.toLowerCase());
    return {
      rowNumber,
      employeeNo,
      email,
      externalSubject,
      employeeId: employee?.id ?? null,
      roles,
      status: errors.length === 0 ? "valid" : "invalid",
      errors,
    } satisfies PilotIdentityImportRow;
  });

  const missingEmployeeNos = input.context.employees
    .map((employee) => employee.employeeNo.toLowerCase())
    .filter((employeeNo) => !seenEmployeeNos.has(employeeNo));
  const checks = [
    check(
      "20-50 active employees",
      input.context.employees.length >= minPilotEmployees && input.context.employees.length <= maxPilotEmployees,
      `${input.context.employees.length} active employee(s)`,
    ),
    check(
      "identity rows cover every active employee",
      rows.length === input.context.employees.length && missingEmployeeNos.length === 0,
      `${rows.length}/${input.context.employees.length} identity row(s); ${missingEmployeeNos.length} missing active employee(s)`,
    ),
    check(
      "identity CSV rows are valid",
      rows.every((row) => row.status === "valid") && rows.length > 0,
      `${rows.filter((row) => row.status === "valid").length}/${rows.length} valid row(s)`,
    ),
    check(
      "SSO configuration",
      Boolean(ssoProvider && ssoIssuer?.startsWith("https://")),
      ssoProvider && ssoIssuer ? "SSO provider and issuer configured" : "missing SSO provider or HTTPS issuer",
    ),
    check(
      "allowed email domains",
      input.context.allowedEmailDomains.length > 0,
      `${input.context.allowedEmailDomains.length} allowed domain(s) configured`,
    ),
  ];
  const invalidCount = rows.filter((row) => row.status === "invalid").length;

  return {
    id: crypto.randomUUID(),
    generatedAt,
    status: checks.every((item) => item.status === "pass") ? "ready" : "blocked",
    activeEmployeeCount: input.context.employees.length,
    csvRowCount: rows.length,
    validCount: rows.length - invalidCount,
    invalidCount,
    managerRoleCount: rows.filter((row) => row.roles.includes("manager")).length,
    employeeRoleCount: rows.filter((row) => row.roles.includes("employee")).length,
    checks,
    rows,
    nextActions: buildNextActions(checks, invalidCount),
  };
}

export async function applyPilotIdentityImport(
  db: PrismaClient,
  input: {
    rawCsv: string;
    context: PilotIdentityImportContext;
    actorUserId?: string | null;
    ssoProvider?: string | null;
    ssoIssuer?: string | null;
  },
): Promise<PilotIdentityImportApplyResult> {
  const plan = buildPilotIdentityImportPlan(input);
  if (plan.status !== "ready") {
    throw new Error("Pilot identity import is blocked. Fix the preview before applying.");
  }
  const provider = input.ssoProvider ?? input.context.ssoProvider;
  const issuer = input.ssoIssuer ?? input.context.ssoIssuer;
  if (!provider || !issuer) throw new Error("SSO provider and issuer are required.");
  const employeeByNo = new Map(input.context.employees.map((employee) => [employee.employeeNo.toLowerCase(), employee]));

  const result = await db.$transaction(async (tx) => {
    let roleAssignmentsEnsured = 0;
    let externalIdentitiesLinked = 0;
    let employeesLinked = 0;

    const roles = await tx.role.findMany({
      where: {
        tenantId: input.context.tenantId,
        key: { in: ["employee", "manager"] },
      },
    });
    const roleIdByKey = new Map(roles.map((role) => [role.key, role.id]));

    for (const row of plan.rows) {
      const employee = employeeByNo.get(row.employeeNo.toLowerCase());
      if (!employee) throw new Error(`Missing employee for row ${row.rowNumber}.`);
      const user = await tx.user.upsert({
        where: {
          tenantId_email: {
            tenantId: input.context.tenantId,
            email: row.email,
          },
        },
        create: {
          tenantId: input.context.tenantId,
          email: row.email,
          displayName: employee.displayName,
          status: "active",
        },
        update: {
          displayName: employee.displayName,
          status: "active",
        },
      });
      await tx.employee.update({
        where: { id: employee.id },
        data: { userId: user.id },
      });
      employeesLinked += 1;

      const roleCreates = row.roles.flatMap((roleKey) => {
        const roleId = roleIdByKey.get(roleKey);
        return roleId
          ? [{
              tenantId: input.context.tenantId,
              companyId: input.context.companyId,
              userId: user.id,
              roleId,
              scopeType: "company",
            }]
          : [];
      });
      if (roleCreates.length !== row.roles.length) {
        throw new Error("Required employee/manager roles are missing for the tenant.");
      }
      await tx.userRole.createMany({
        data: roleCreates,
        skipDuplicates: true,
      });
      roleAssignmentsEnsured += roleCreates.length;

      const existingIdentity = await tx.userExternalIdentity.findUnique({
        where: {
          tenantId_issuer_subject: {
            tenantId: input.context.tenantId,
            issuer,
            subject: row.externalSubject,
          },
        },
      });
      if (existingIdentity && existingIdentity.userId !== user.id) {
        throw new Error("SSO subject is already linked to another user.");
      }
      const identity = await tx.userExternalIdentity.upsert({
        where: {
          tenantId_issuer_subject: {
            tenantId: input.context.tenantId,
            issuer,
            subject: row.externalSubject,
          },
        },
        create: {
          tenantId: input.context.tenantId,
          userId: user.id,
          provider,
          issuer,
          subject: row.externalSubject,
          emailAtLink: row.email,
        },
        update: {
          userId: user.id,
          provider,
          emailAtLink: row.email,
        },
      });
      externalIdentitiesLinked += 1;

      await writeAuditLog(tx, {
        tenantId: input.context.tenantId,
        companyId: input.context.companyId,
        actorUserId: input.actorUserId ?? undefined,
        action: "update",
        entityType: "employee_identity_link",
        entityId: employee.id,
        after: {
          employeeId: employee.id,
          userId: user.id,
          roles: row.roles,
          emailHash: hashValue(row.email),
          externalSubjectHash: hashValue(row.externalSubject),
        },
        metadata: {
          source: "pilot_identity_csv_import",
          rowNumber: row.rowNumber,
          userId: user.id,
          identityId: identity.id,
          roleKeys: row.roles,
          rawEmailStoredInAudit: false,
          rawSubjectStoredInAudit: false,
        },
      });
    }

    await writeAuditLog(tx, {
      tenantId: input.context.tenantId,
      companyId: input.context.companyId,
      actorUserId: input.actorUserId ?? undefined,
      action: "create",
      entityType: "pilot_identity_import",
      entityId: plan.id,
      after: {
        activeEmployeeCount: plan.activeEmployeeCount,
        importedCount: plan.validCount,
        employeeRoleCount: plan.employeeRoleCount,
        managerRoleCount: plan.managerRoleCount,
      },
      metadata: {
        source: "pilot_identity_csv_import",
        rowCount: plan.csvRowCount,
        roleAssignmentsEnsured,
        externalIdentitiesLinked,
        employeesLinked,
        rawEmailStoredInAudit: false,
        rawSubjectStoredInAudit: false,
      },
    });

    return {
      usersUpserted: plan.validCount,
      employeesLinked,
      roleAssignmentsEnsured,
      externalIdentitiesLinked,
    };
  });

  return { plan, ...result };
}

export function formatPilotIdentityImportReport(plan: PilotIdentityImportPlan, applied = false) {
  return [
    "# HR One Pilot Identity Import",
    "",
    `Generated at: ${plan.generatedAt}`,
    `Status: ${plan.status}`,
    `Mode: ${applied ? "applied" : "dry-run"}`,
    `Rows: ${plan.validCount}/${plan.csvRowCount} valid`,
    `Cohort: ${plan.activeEmployeeCount} active employee(s)`,
    `Roles: ${plan.employeeRoleCount} employee assignment(s), ${plan.managerRoleCount} manager assignment(s)`,
    "",
    "## Checks",
    "",
    ...plan.checks.map((item) => `- [${item.status.toUpperCase()}] ${item.name}: ${redactReportText(item.detail)}`),
    "",
    "## Invalid Rows",
    "",
    ...formatInvalidRows(plan),
    "",
    "## Next Actions",
    "",
    ...formatList(plan.nextActions, applied ? "Run pilot:invite-readiness before employee invitations." : "Pass --apply only after HR verifies this dry-run report."),
    "",
    "## Privacy",
    "",
    "- This report intentionally excludes employee names, email addresses, SSO subjects, salary amounts, bank accounts, national IDs, health data, and private HR notes.",
    "- The import writes audit metadata with hashes and aggregate counts only.",
    "",
  ].join("\n");
}

function validateEmployeeNo(
  employeeNo: string,
  employee: PilotIdentityEmployee | null,
  seenEmployeeNos: Set<string>,
) {
  const errors: string[] = [];
  if (!employeeNo) errors.push("Employee number is required.");
  if (employeeNo && seenEmployeeNos.has(employeeNo.toLowerCase())) errors.push("Duplicate employee number in identity CSV.");
  if (employeeNo && !employee) errors.push("Employee number was not found among active employees.");
  return errors;
}

function validateEmail(email: string, allowedDomains: string[], seenEmails: Set<string>) {
  const errors: string[] = [];
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Valid email is required.");
  if (email && seenEmails.has(email)) errors.push("Duplicate email in identity CSV.");
  if (allowedDomains.length > 0 && (!domain || !allowedDomains.includes(domain))) {
    errors.push("Email domain is not allowed for this company.");
  }
  return errors;
}

function validateExternalSubject(
  subject: string,
  provider: string | null | undefined,
  issuer: string | null | undefined,
  seenSubjects: Set<string>,
) {
  const errors: string[] = [];
  if (!provider) errors.push("SSO provider is required.");
  if (!issuer?.startsWith("https://")) errors.push("HTTPS SSO issuer is required.");
  if (!subject) errors.push("External SSO subject is required.");
  if (subject && seenSubjects.has(subject.toLowerCase())) errors.push("Duplicate external SSO subject in identity CSV.");
  return errors;
}

function validateExistingUserLink(
  existingUser: PilotIdentityExistingUser | null,
  employeeId: string | null,
) {
  if (existingUser?.linkedEmployeeId && employeeId && existingUser.linkedEmployeeId !== employeeId) {
    return ["Email is already linked to another employee."];
  }
  return [];
}

function validateExistingIdentityLink(
  existingIdentity: PilotIdentityExistingIdentity | null,
  expectedUserId: string | null,
) {
  if (existingIdentity?.userId && (!expectedUserId || existingIdentity.userId !== expectedUserId)) {
    return ["SSO subject is already linked to another user."];
  }
  return [];
}

function check(name: string, passed: boolean, detail: string) {
  return {
    name,
    status: passed ? "pass" as const : "block" as const,
    detail,
  };
}

function buildNextActions(
  checks: PilotIdentityImportPlan["checks"],
  invalidCount: number,
) {
  const actions = checks
    .filter((item) => item.status === "block")
    .map((item) => {
      switch (item.name) {
        case "20-50 active employees":
          return "Import the real 20-50 person employee cohort before identity import.";
        case "identity rows cover every active employee":
          return "Add exactly one identity row for every active pilot employee.";
        case "identity CSV rows are valid":
          return `Fix ${invalidCount} invalid identity row(s) before applying.`;
        case "SSO configuration":
          return "Configure production SSO provider and HTTPS issuer before identity import.";
        case "allowed email domains":
          return "Configure allowed company email domains before importing pilot identities.";
        default:
          return `Fix identity import check: ${item.name}.`;
      }
    });
  return [...new Set(actions)];
}

function parseCsv(rawCsv: string) {
  const lines = rawCsv.trim().split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) throw new Error("Identity CSV content is required.");
  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  for (const header of pilotIdentityImportTemplateHeaders) {
    if (!headers.includes(header)) throw new Error(`Missing required CSV header: ${header}`);
  }
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""]));
  });
}

function parseAllowedEmailDomains(value: unknown) {
  return Array.isArray(value)
    ? value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
    : [];
}

function formatInvalidRows(plan: PilotIdentityImportPlan) {
  const invalidRows = plan.rows.filter((row) => row.status === "invalid");
  if (invalidRows.length === 0) return ["- none"];
  return invalidRows.map((row) =>
    `- Row ${row.rowNumber}: ${row.errors.map(redactReportText).join("; ")}`,
  );
}

function formatList(items: string[], emptyText: string) {
  if (items.length === 0) return [`- ${emptyText}`];
  return items.map((item) => `- ${redactReportText(item)}`);
}

function redactReportText(value: string) {
  return value
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[REDACTED_EMAIL]")
    .replace(/[A-Z][12]\d{8}/gi, "[REDACTED]");
}

function splitCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function identityKey(issuer: string, subject: string) {
  return `${issuer.trim()}::${subject.trim()}`;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function hashValue(value: string) {
  return stableHash({ value });
}

export function toPilotIdentityCsv(rows: Array<{ employeeNo: string; email: string; externalSubject: string }>) {
  return `${[
    [...pilotIdentityImportTemplateHeaders],
    ...rows.map((row) => [row.employeeNo, row.email, row.externalSubject]),
  ].map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function csvCell(value: string) {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replaceAll("\"", "\"\"")}"`;
}
