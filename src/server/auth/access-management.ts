import type { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { stableHash } from "@/server/audit/redaction";
import { getCompanySecuritySettingsForAuth, hasSsoMetadata } from "@/server/settings/security";
import { getDb } from "@/server/db/client";
import { getFallbackCompanyOverview } from "@/server/demo/fallback";
import { assertPermission, roleKeys, type RoleKey } from "./rbac";

type SessionLike = {
  role: RoleKey;
  tenantId?: string | null;
  companyId?: string | null;
  user?: { id: string; email?: string | null; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type UserAccessStatus = "invited" | "active" | "suspended";

export type UserAccessRow = {
  id: string;
  email: string;
  displayName: string;
  status: UserAccessStatus;
  roles: RoleKey[];
  externalIdentities: UserExternalIdentityRow[];
  employee: UserAccessEmployeeLink | null;
  authRequirement: "sso" | "password_or_sso";
  createdAt: Date;
  updatedAt: Date;
};

export type UserExternalIdentityRow = {
  id: string;
  provider: string;
  issuer: string;
  subjectHash: string;
  emailAtLink: string | null;
  lastSeenAt: Date | null;
};

export type UserAccessWorkspace = {
  users: UserAccessRow[];
  employees: UserAccessEmployeeOption[];
  allowedEmailDomains: string[];
  ssoEnabled: boolean;
  ssoMetadataConfigured: boolean;
  adminMfaRequired: boolean;
  employeeMfaRequired: boolean;
  passwordMinLength: number;
};

export type UserAccessEmployeeLink = {
  id: string;
  employeeNo: string;
  displayName: string;
  departmentName: string | null;
};

export type UserAccessEmployeeOption = UserAccessEmployeeLink & {
  userId: string | null;
};

export type InviteUserInput = {
  email: string;
  displayName: string;
  roles: RoleKey[];
};

export type UpdateUserAccessInput = {
  userId: string;
  status?: UserAccessStatus;
  statusReason?: string | null;
  roles?: RoleKey[];
};

export type LinkUserExternalIdentityInput = {
  userId: string;
  provider: string;
  issuer: string;
  subject: string;
};

export type LinkUserEmployeeInput = {
  userId: string;
  employeeId?: string | null;
};

type AccessDemoState = {
  users: UserAccessRow[];
};

const globalForAccess = globalThis as unknown as {
  hrOneAccessDemoState?: AccessDemoState;
};

const privilegedRoles = new Set<RoleKey>(["owner", "hr_admin", "manager"]);

export async function getUserAccessWorkspace(session: SessionLike): Promise<UserAccessWorkspace> {
  assertPermission(session.role, "settings:read");
  const securitySettings = await getCompanySecuritySettingsForAuth(session);
  const { users, employees } = canUseDatabase(session)
    ? await readDbWorkspace(session)
    : readDemoWorkspace();

  return {
    users: users.map((user) => ({
      ...user,
      roles: normalizeRoles(user.roles),
      authRequirement: requiresSso(user.roles, securitySettings.ssoEnabled) ? "sso" : "password_or_sso",
    })),
    employees,
    allowedEmailDomains: securitySettings.allowedEmailDomains,
    ssoEnabled: securitySettings.ssoEnabled,
    ssoMetadataConfigured: hasSsoMetadata(securitySettings),
    adminMfaRequired: securitySettings.mfaRequiredForAdmins,
    employeeMfaRequired: securitySettings.mfaRequiredForEmployees,
    passwordMinLength: securitySettings.passwordMinLength,
  };
}

export async function inviteUser(session: SessionLike, input: InviteUserInput) {
  assertPermission(session.role, "settings:write");
  const securitySettings = await getCompanySecuritySettingsForAuth(session);
  const normalized = {
    email: normalizeEmail(input.email),
    displayName: cleanName(input.displayName),
    roles: normalizeRoles(input.roles),
  };
  if (!normalized.email) throw new Error("Email is required.");
  if (!normalized.displayName) throw new Error("Display name is required.");
  assertAllowedEmailDomain(normalized.email, securitySettings.allowedEmailDomains);

  if (canUseDatabase(session)) {
    return inviteDbUser(session, normalized);
  }
  return inviteDemoUser(session, normalized);
}

export async function updateUserAccess(session: SessionLike, input: UpdateUserAccessInput) {
  assertPermission(session.role, "settings:write");
  const normalized = {
    userId: input.userId,
    status: normalizeStatus(input.status),
    statusReason: normalizeStatus(input.status) ? cleanStatusReason(input.statusReason) : undefined,
    roles: input.roles ? normalizeRoles(input.roles) : undefined,
  };
  if (!normalized.userId) throw new Error("User is required.");

  if (canUseDatabase(session)) {
    return updateDbUserAccess(session, normalized);
  }
  return updateDemoUserAccess(session, normalized);
}

export async function linkUserExternalIdentity(session: SessionLike, input: LinkUserExternalIdentityInput) {
  assertPermission(session.role, "settings:write");
  const normalized = {
    userId: input.userId.trim(),
    provider: cleanName(input.provider),
    issuer: cleanUrl(input.issuer),
    subject: input.subject.trim(),
  };
  if (!normalized.userId) throw new Error("User is required.");
  if (!normalized.provider) throw new Error("Provider is required.");
  if (!normalized.issuer) throw new Error("Issuer must be an HTTPS URL.");
  if (!normalized.subject) throw new Error("Subject is required.");

  if (canUseDatabase(session)) {
    return linkDbUserExternalIdentity(session, normalized);
  }
  return linkDemoUserExternalIdentity(session, normalized);
}

export async function linkUserEmployee(session: SessionLike, input: LinkUserEmployeeInput) {
  assertPermission(session.role, "settings:write");
  const normalized = {
    userId: input.userId.trim(),
    employeeId: input.employeeId?.trim() || null,
  };
  if (!normalized.userId) throw new Error("User is required.");

  if (canUseDatabase(session)) {
    return linkDbUserEmployee(session, normalized);
  }
  return linkDemoUserEmployee(session, normalized);
}

export function resetAccessDemoState() {
  const now = new Date();
  globalForAccess.hrOneAccessDemoState = {
    users: [
      row("demo-user-owner", "owner@hrone.test", "王執行長", "active", ["owner"], now),
      row("demo-user-hr_admin", "hr_admin@hrone.test", "林人資", "active", ["hr_admin"], now, demoEmployeeLink("demo-hr-employee")),
      row("demo-user-manager", "manager@hrone.test", "陳主管", "active", ["manager"], now, demoEmployeeLink("demo-manager-employee")),
      row("demo-user-employee", "employee@hrone.test", "張小安", "active", ["employee"], now, demoEmployeeLink("demo-employee-1")),
    ],
  };
}

async function readDbWorkspace(session: SessionLike & { tenantId: string; companyId: string }) {
  const [users, employees] = await Promise.all([listDbUsers(session), listDbEmployees(session)]);
  return { users, employees };
}

function readDemoWorkspace() {
  return {
    users: getDemoState().users,
    employees: demoEmployeeOptions(),
  };
}

async function listDbUsers(session: SessionLike & { tenantId: string; companyId: string }) {
  const users = await getDb().user.findMany({
    where: { tenantId: session.tenantId },
    include: {
      employee: {
        include: { department: true },
      },
      userRoles: {
        where: { companyId: session.companyId },
        include: { role: true },
      },
      externalIdentities: true,
    },
    orderBy: { email: "asc" },
  });
  return users.map((user) => ({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    status: normalizeStatus(user.status) ?? "active",
    roles: normalizeRoles(user.userRoles.map((item) => item.role.key)),
    externalIdentities: mapExternalIdentities(user.externalIdentities),
    employee: mapEmployeeLink(user.employee),
    authRequirement: "password_or_sso" as const,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }));
}

async function listDbEmployees(session: SessionLike & { tenantId: string; companyId: string }): Promise<UserAccessEmployeeOption[]> {
  const employees = await getDb().employee.findMany({
    where: {
      tenantId: session.tenantId,
      companyId: session.companyId,
      employmentStatus: "active",
    },
    include: { department: true },
    orderBy: [{ employeeNo: "asc" }],
  });
  return employees.map((employee) => ({
    id: employee.id,
    employeeNo: employee.employeeNo,
    displayName: employee.displayName,
    departmentName: employee.department?.name ?? null,
    userId: employee.userId,
  }));
}

async function inviteDbUser(
  session: SessionLike & { tenantId: string; companyId: string },
  input: Required<InviteUserInput>,
) {
  const db = getDb();
  return db.$transaction(async (tx) => {
    const before = await tx.user.findUnique({
      where: { tenantId_email: { tenantId: session.tenantId, email: input.email } },
      include: { userRoles: { where: { companyId: session.companyId }, include: { role: true } } },
    });
    const user = await tx.user.upsert({
      where: { tenantId_email: { tenantId: session.tenantId, email: input.email } },
      create: {
        tenantId: session.tenantId,
        email: input.email,
        displayName: input.displayName,
        status: "invited",
      },
      update: {
        displayName: input.displayName,
        status: before?.status === "suspended" ? "suspended" : "invited",
      },
    });
    await replaceDbRoles(tx, session, user.id, input.roles);
    const after = await readDbUser(tx, session, user.id);
    await writeAuditLog(tx, {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: before ? "update" : "create",
      entityType: "user_access",
      entityId: user.id,
      before: before ? mapDbUser(before) : null,
      after,
      metadata: {
        operation: before ? "reinvite" : "invite",
        roles: input.roles,
        rawInviteTokenStored: false,
      },
    });
    return after;
  });
}

async function updateDbUserAccess(
  session: SessionLike & { tenantId: string; companyId: string },
  input: { userId: string; status?: UserAccessStatus; statusReason?: string; roles?: RoleKey[] },
) {
  const db = getDb();
  return db.$transaction(async (tx) => {
    const before = await readDbUser(tx, session, input.userId);
    if (!before) throw new Error("User not found.");
    const users = await listDbUsersForOwnerGuard(tx, session);
    assertActiveOwnerWouldRemain(users, input);
    if (input.status) {
      await tx.user.update({
        where: { id: input.userId },
        data: { status: input.status },
      });
    }
    if (input.roles) {
      await replaceDbRoles(tx, session, input.userId, input.roles);
    }
    const after = await readDbUser(tx, session, input.userId);
    await writeAuditLog(tx, {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "update",
      entityType: "user_access",
      entityId: input.userId,
      before,
      after,
      metadata: userAccessUpdateMetadata(input),
    });
    return after;
  });
}

async function linkDbUserExternalIdentity(
  session: SessionLike & { tenantId: string; companyId: string },
  input: LinkUserExternalIdentityInput,
) {
  const db = getDb();
  return db.$transaction(async (tx) => {
    const beforeUser = await tx.user.findFirst({
      where: { id: input.userId, tenantId: session.tenantId },
      include: { externalIdentities: true },
    });
    if (!beforeUser) throw new Error("User not found.");

    const identity = await tx.userExternalIdentity.upsert({
      where: {
        tenantId_issuer_subject: {
          tenantId: session.tenantId,
          issuer: input.issuer,
          subject: input.subject,
        },
      },
      create: {
        tenantId: session.tenantId,
        userId: input.userId,
        provider: input.provider,
        issuer: input.issuer,
        subject: input.subject,
        emailAtLink: beforeUser.email,
      },
      update: {
        userId: input.userId,
        provider: input.provider,
        emailAtLink: beforeUser.email,
      },
    });
    const afterUser = await tx.user.findFirst({
      where: { id: input.userId, tenantId: session.tenantId },
      include: { externalIdentities: true },
    });

    await writeAuditLog(tx, {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "update",
      entityType: "user_external_identity",
      entityId: identity.id,
      before: beforeUser.externalIdentities,
      after: afterUser?.externalIdentities ?? [],
      metadata: {
        operation: "link_sso_identity",
        provider: input.provider,
        issuer: input.issuer,
        subjectHash: stableIdentitySubject(input.subject),
        rawTokenStored: false,
      },
    });

    return readDbUser(tx, session, input.userId);
  });
}

async function linkDbUserEmployee(
  session: SessionLike & { tenantId: string; companyId: string },
  input: { userId: string; employeeId: string | null },
) {
  const db = getDb();
  return db.$transaction(async (tx) => {
    const before = await readDbUser(tx, session, input.userId);
    if (!before) throw new Error("User not found.");

    let operation: "link_employee" | "unlink_employee" = "unlink_employee";
    if (input.employeeId) {
      const employee = await tx.employee.findFirst({
        where: {
          id: input.employeeId,
          tenantId: session.tenantId,
          companyId: session.companyId,
        },
        select: {
          id: true,
          userId: true,
        },
      });
      if (!employee) throw new Error("Employee not found.");
      if (employee.userId && employee.userId !== input.userId) {
        throw new Error("Employee is already linked to another user.");
      }
      await tx.employee.updateMany({
        where: {
          tenantId: session.tenantId,
          companyId: session.companyId,
          userId: input.userId,
        },
        data: { userId: null },
      });
      await tx.employee.update({
        where: { id: employee.id },
        data: { userId: input.userId },
      });
      operation = "link_employee";
    } else {
      await tx.employee.updateMany({
        where: {
          tenantId: session.tenantId,
          companyId: session.companyId,
          userId: input.userId,
        },
        data: { userId: null },
      });
    }

    const after = await readDbUser(tx, session, input.userId);
    await writeAuditLog(tx, {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "update",
      entityType: "user_employee_link",
      entityId: input.userId,
      before,
      after,
      metadata: {
        operation,
        employeeRefHash: input.employeeId ? stableHash({ employeeId: input.employeeId }) : null,
        rawEmployeePersonalDataStored: false,
      },
    });

    return after;
  });
}

function inviteDemoUser(session: SessionLike, input: Required<InviteUserInput>) {
  const state = getDemoState();
  const before = state.users.find((user) => user.email === input.email);
  const now = new Date();
  const user = before ?? row(crypto.randomUUID(), input.email, input.displayName, "invited", input.roles, now);
  user.displayName = input.displayName;
  user.roles = input.roles;
  user.status = before?.status === "suspended" ? "suspended" : "invited";
  user.updatedAt = now;
  if (!before) state.users.unshift(user);
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: before ? "update" : "create",
    entityType: "user_access",
    entityId: user.id,
    before: before ? { ...before } : null,
    after: { ...user },
    metadata: {
      operation: before ? "reinvite" : "invite",
      roles: input.roles,
      rawInviteTokenStored: false,
    },
  });
  return user;
}

function updateDemoUserAccess(
  session: SessionLike,
  input: { userId: string; status?: UserAccessStatus; statusReason?: string; roles?: RoleKey[] },
) {
  const state = getDemoState();
  const user = state.users.find((item) => item.id === input.userId);
  if (!user) throw new Error("User not found.");
  assertActiveOwnerWouldRemain(state.users, input);
  const before = { ...user, roles: [...user.roles] };
  if (input.status) user.status = input.status;
  if (input.roles) user.roles = input.roles;
  user.updatedAt = new Date();
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: "update",
    entityType: "user_access",
    entityId: user.id,
    before,
    after: { ...user, roles: [...user.roles] },
    metadata: userAccessUpdateMetadata(input),
  });
  return user;
}

function linkDemoUserExternalIdentity(session: SessionLike, input: LinkUserExternalIdentityInput) {
  const state = getDemoState();
  const user = state.users.find((item) => item.id === input.userId);
  if (!user) throw new Error("User not found.");
  const before = { ...user, roles: [...user.roles], externalIdentities: [...user.externalIdentities] };
  const subjectHash = stableIdentitySubject(input.subject);
  const existing = user.externalIdentities.find(
    (identity) => identity.issuer === input.issuer && identity.subjectHash === subjectHash,
  );
  if (existing) {
    existing.provider = input.provider;
    existing.emailAtLink = user.email;
  } else {
    user.externalIdentities.push({
      id: crypto.randomUUID(),
      provider: input.provider,
      issuer: input.issuer,
      subjectHash,
      emailAtLink: user.email,
      lastSeenAt: null,
    });
  }
  user.updatedAt = new Date();
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: "update",
    entityType: "user_external_identity",
    entityId: input.userId,
    before,
    after: { ...user, roles: [...user.roles], externalIdentities: [...user.externalIdentities] },
    metadata: {
      operation: "link_sso_identity",
      provider: input.provider,
      issuer: input.issuer,
      subjectHash: stableIdentitySubject(input.subject),
      rawTokenStored: false,
    },
  });
  return user;
}

function linkDemoUserEmployee(session: SessionLike, input: { userId: string; employeeId: string | null }) {
  const state = getDemoState();
  const user = state.users.find((item) => item.id === input.userId);
  if (!user) throw new Error("User not found.");
  const before = userAccessAuditSnapshot(user);

  if (input.employeeId) {
    const employee = demoEmployeeOptions().find((item) => item.id === input.employeeId);
    if (!employee) throw new Error("Employee not found.");
    const linkedByAnotherUser = state.users.find(
      (item) => item.id !== user.id && item.employee?.id === employee.id,
    );
    if (linkedByAnotherUser) throw new Error("Employee is already linked to another user.");
    user.employee = {
      id: employee.id,
      employeeNo: employee.employeeNo,
      displayName: employee.displayName,
      departmentName: employee.departmentName,
    };
  } else {
    user.employee = null;
  }

  user.updatedAt = new Date();
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: "update",
    entityType: "user_employee_link",
    entityId: user.id,
    before,
    after: userAccessAuditSnapshot(user),
    metadata: {
      operation: input.employeeId ? "link_employee" : "unlink_employee",
      employeeRefHash: input.employeeId ? stableHash({ employeeId: input.employeeId }) : null,
      rawEmployeePersonalDataStored: false,
    },
  });
  return user;
}

async function replaceDbRoles(
  tx: Prisma.TransactionClient,
  session: SessionLike & { tenantId: string; companyId: string },
  userId: string,
  roles: RoleKey[],
) {
  await tx.userRole.deleteMany({
    where: { tenantId: session.tenantId, companyId: session.companyId, userId },
  });
  const roleRecords = await tx.role.findMany({
    where: { tenantId: session.tenantId, key: { in: roles } },
  });
  await tx.userRole.createMany({
    data: roleRecords.map((role) => ({
      tenantId: session.tenantId,
      companyId: session.companyId,
      userId,
      roleId: role.id,
      scopeType: "company",
    })),
    skipDuplicates: true,
  });
}

async function readDbUser(
  tx: Prisma.TransactionClient,
  session: SessionLike & { tenantId: string; companyId: string },
  userId: string,
) {
  const user = await tx.user.findFirst({
    where: { id: userId, tenantId: session.tenantId },
    include: {
      employee: {
        include: { department: true },
      },
      userRoles: {
        where: { companyId: session.companyId },
        include: { role: true },
      },
      externalIdentities: true,
    },
  });
  return user ? mapDbUser(user) : null;
}

async function listDbUsersForOwnerGuard(
  tx: Prisma.TransactionClient,
  session: SessionLike & { tenantId: string; companyId: string },
) {
  const users = await tx.user.findMany({
    where: { tenantId: session.tenantId },
    select: {
      id: true,
      status: true,
      userRoles: {
        where: { companyId: session.companyId },
        include: { role: true },
      },
    },
  });
  return users.map((user) => ({
    id: user.id,
    status: normalizeStatus(user.status) ?? "active",
    roles: normalizeRoles(user.userRoles.map((item) => item.role.key)),
  }));
}

function mapDbUser(user: {
  id: string;
  email: string;
  displayName: string;
  status: string;
  userRoles: Array<{ role: { key: RoleKey } }>;
  externalIdentities?: Array<{
    id: string;
    provider: string;
    issuer: string;
    subject: string;
    emailAtLink: string | null;
    lastSeenAt: Date | null;
  }>;
  employee?: {
    id: string;
    employeeNo: string;
    displayName: string;
    department?: { name: string } | null;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}): UserAccessRow {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    status: normalizeStatus(user.status) ?? "active",
    roles: normalizeRoles(user.userRoles.map((item) => item.role.key)),
    externalIdentities: mapExternalIdentities(user.externalIdentities ?? []),
    employee: mapEmployeeLink(user.employee),
    authRequirement: "password_or_sso",
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function getDemoState() {
  if (!globalForAccess.hrOneAccessDemoState) {
    resetAccessDemoState();
  }
  return globalForAccess.hrOneAccessDemoState!;
}

function row(
  id: string,
  email: string,
  displayName: string,
  status: UserAccessStatus,
  roles: RoleKey[],
  date: Date,
  employee: UserAccessEmployeeLink | null = null,
): UserAccessRow {
  return {
    id,
    email,
    displayName,
    status,
    roles,
    externalIdentities: [],
    employee,
    authRequirement: "password_or_sso",
    createdAt: date,
    updatedAt: date,
  };
}

function normalizeRoles(values: RoleKey[]) {
  const roles = values.filter((role) => roleKeys.includes(role));
  return roles.length > 0 ? [...new Set(roles)] : ["employee" as const];
}

function normalizeStatus(value: unknown): UserAccessStatus | undefined {
  if (value === "active" || value === "suspended" || value === "invited") return value;
  return value === undefined ? undefined : "active";
}

function cleanStatusReason(value: string | null | undefined) {
  const reason = (value ?? "").trim().replace(/\s+/g, " ").slice(0, 500);
  if (!reason) throw new Error("Status change reason is required.");
  return reason;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function cleanName(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 80);
}

function cleanUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("https://")) return "";
  try {
    return new URL(trimmed).toString();
  } catch {
    return "";
  }
}

function mapExternalIdentities(identities: Array<{
  id: string;
  provider: string;
  issuer: string;
  subject: string;
  emailAtLink: string | null;
  lastSeenAt: Date | null;
}>): UserExternalIdentityRow[] {
  return identities.map((identity) => ({
    id: identity.id,
    provider: identity.provider,
    issuer: identity.issuer,
    subjectHash: stableIdentitySubject(identity.subject),
    emailAtLink: identity.emailAtLink,
    lastSeenAt: identity.lastSeenAt,
  }));
}

function mapEmployeeLink(employee: {
  id: string;
  employeeNo: string;
  displayName: string;
  department?: { name: string } | null;
} | null | undefined): UserAccessEmployeeLink | null {
  if (!employee) return null;
  return {
    id: employee.id,
    employeeNo: employee.employeeNo,
    displayName: employee.displayName,
    departmentName: employee.department?.name ?? null,
  };
}

function demoEmployeeLink(employeeId: string): UserAccessEmployeeLink | null {
  const employee = getFallbackCompanyOverview().company.employees.find((item) => item.id === employeeId);
  return employee
    ? {
        id: employee.id,
        employeeNo: employee.employeeNo,
        displayName: employee.displayName,
        departmentName: employee.department?.name ?? null,
      }
    : null;
}

function demoEmployeeOptions(): UserAccessEmployeeOption[] {
  const linkedUserIdByEmployeeId = new Map(
    getDemoState().users.flatMap((user) => user.employee ? [[user.employee.id, user.id] as const] : []),
  );
  return getFallbackCompanyOverview().company.employees.map((employee) => ({
    id: employee.id,
    employeeNo: employee.employeeNo,
    displayName: employee.displayName,
    departmentName: employee.department?.name ?? null,
    userId: linkedUserIdByEmployeeId.get(employee.id) ?? null,
  }));
}

function userAccessAuditSnapshot(user: UserAccessRow | null) {
  if (!user) return null;
  return {
    id: user.id,
    emailHash: stableHash({ email: user.email.toLowerCase() }),
    displayNameHash: stableHash({ displayName: user.displayName }),
    status: user.status,
    roles: user.roles,
    employeeIdHash: user.employee ? stableHash({ employeeId: user.employee.id }) : null,
    externalIdentityCount: user.externalIdentities.length,
  };
}

function assertActiveOwnerWouldRemain(
  users: Array<Pick<UserAccessRow, "id" | "status" | "roles">>,
  input: { userId: string; status?: UserAccessStatus; roles?: RoleKey[] },
) {
  const projected = users.map((user) =>
    user.id === input.userId
      ? {
          ...user,
          status: input.status ?? user.status,
          roles: input.roles ?? user.roles,
        }
      : user,
  );
  if (!projected.some((user) => user.status === "active" && user.roles.includes("owner"))) {
    throw new Error("At least one active Owner must remain.");
  }
}

function userAccessUpdateMetadata(input: {
  status?: UserAccessStatus;
  statusReason?: string;
  roles?: RoleKey[];
}) {
  return {
    operation: input.status ? "status" : "roles",
    targetStatus: input.status ?? null,
    targetRoles: input.roles ?? null,
    statusReasonProvided: Boolean(input.statusReason),
    statusReasonHash: input.statusReason ? stableHash({ statusReason: input.statusReason }) : null,
    rawStatusReasonStored: false,
    rawInviteTokenStored: false,
    activeOwnerGuardChecked: true,
  };
}

function stableIdentitySubject(subject: string) {
  return String(stableHash({ subject })).slice(0, 16);
}

function assertAllowedEmailDomain(email: string, allowedDomains: string[]) {
  if (allowedDomains.length === 0) return;
  const domain = email.split("@").pop();
  if (!domain || !allowedDomains.includes(domain)) {
    throw new Error("Email domain is not allowed by company policy.");
  }
}

function requiresSso(roles: RoleKey[], ssoEnabled: boolean) {
  return ssoEnabled && roles.some((role) => privilegedRoles.has(role));
}

function canUseDatabase(
  session: SessionLike,
): session is SessionLike & { tenantId: string; companyId: string } {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
