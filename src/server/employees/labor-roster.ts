import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { stableHash } from "@/server/audit/redaction";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";
import { getFallbackCompanyOverview } from "@/server/demo/fallback";

type SessionLike = {
  role: RoleKey;
  tenantId?: string | null;
  companyId?: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type LaborRosterVerificationStatus = "unverified" | "needs_review" | "verified";
export type LaborRosterStatus = "incomplete" | "needs_review" | "complete";

export type LaborRosterProfileInput = {
  employeeId: string;
  legalName: string;
  nationalId: string;
  birthDate?: Date | null;
  gender: string;
  nationality: string;
  registeredAddress: string;
  emergencyContact: string;
  educationSummary?: string | null;
  workExperienceSummary?: string | null;
  rosterSourceRef?: string | null;
  verificationStatus: LaborRosterVerificationStatus;
};

export type LaborRosterProfileView = {
  id: string;
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  departmentName: string | null;
  jobTitle: string;
  hireDate: Date;
  status: LaborRosterStatus;
  legalNameHash: string | null;
  nationalIdHash: string | null;
  birthDate: Date | null;
  gender: string | null;
  nationality: string | null;
  registeredAddressHash: string | null;
  emergencyContactHash: string | null;
  educationSummary: string | null;
  workExperienceSummary: string | null;
  rosterSourceRef: string | null;
  requiredFields: string[];
  missingFields: string[];
  verificationStatus: LaborRosterVerificationStatus;
  lastReviewedAt: Date | null;
};

export type LaborRosterWorkspace = {
  employees: Array<{ id: string; employeeNo: string; displayName: string; jobTitle: string }>;
  profiles: LaborRosterProfileView[];
  coverage: {
    employeeCount: number;
    completeCount: number;
    verifiedCount: number;
    missingCount: number;
    coverageRate: number;
  };
};

const requiredRosterFields = [
  "legal_name",
  "national_id",
  "birth_date",
  "gender",
  "nationality",
  "registered_address",
  "emergency_contact",
  "hire_date",
  "job_title",
  "department",
] as const;

type DemoState = {
  profiles: LaborRosterProfileView[];
};

const globalForLaborRoster = globalThis as unknown as {
  hrOneLaborRosterDemoState?: DemoState;
};

export async function getLaborRosterWorkspace(session: SessionLike): Promise<LaborRosterWorkspace> {
  assertPermission(session.role, "labor_roster:manage");
  if (canUseDatabase(session)) {
    try {
      const [employees, profiles] = await Promise.all([
        getDb().employee.findMany({
          where: { tenantId: session.tenantId!, companyId: session.companyId!, employmentStatus: "active" },
          include: { department: true },
          orderBy: { employeeNo: "asc" },
        }),
        getDb().employeeLaborRosterProfile.findMany({
          where: { tenantId: session.tenantId!, companyId: session.companyId! },
          include: { employee: { include: { department: true } } },
          orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
        }),
      ]);
      const profileViews = profiles.map(mapDbProfile);
      return {
        employees: employees.map((employee) => ({
          id: employee.id,
          employeeNo: employee.employeeNo,
          displayName: employee.displayName,
          jobTitle: employee.jobTitle,
        })),
        profiles: mergeMissingEmployeeProfiles(employees.map(mapEmployeeForRoster), profileViews),
        coverage: summarizeCoverage(employees.length, profileViews),
      };
    } catch {
      return getDemoWorkspace();
    }
  }
  return getDemoWorkspace();
}

export async function saveLaborRosterProfile(session: SessionLike, input: LaborRosterProfileInput) {
  assertPermission(session.role, "labor_roster:manage");
  const normalized = normalizeInput(input);
  if (canUseDatabase(session)) {
    try {
      return saveDbProfile(session, normalized);
    } catch {
      return saveDemoProfile(session, normalized);
    }
  }
  return saveDemoProfile(session, normalized);
}

export function resetLaborRosterDemoState() {
  const overview = getFallbackCompanyOverview();
  const employees = overview.company.employees;
  const profileInputs = employees.slice(0, 3).map((employee, index) => ({
    employee,
    legalName: employee.displayName,
    nationalId: `A12345678${index}`,
    birthDate: new Date(`199${index}-01-01T00:00:00.000Z`),
    gender: index === 1 ? "male" : "female",
    nationality: "TW",
    registeredAddress: `Taipei demo address ${index + 1}`,
    emergencyContact: `Emergency contact ${index + 1}`,
    educationSummary: "University degree on file",
    workExperienceSummary: "Prior experience reviewed",
    rosterSourceRef: "demo://labor-roster/2026.01",
    verificationStatus: index === 2 ? "needs_review" as const : "verified" as const,
  }));
  globalForLaborRoster.hrOneLaborRosterDemoState = {
    profiles: profileInputs.map((item, index) => buildProfileView({
      id: `demo-labor-roster-${index + 1}`,
      employeeId: item.employee.id,
      employeeNo: item.employee.employeeNo,
      employeeName: item.employee.displayName,
      departmentName: item.employee.department?.name ?? null,
      jobTitle: item.employee.jobTitle,
      hireDate: new Date("2025-01-01T00:00:00.000Z"),
      input: item,
      lastReviewedAt: index === 2 ? null : new Date("2026-06-01T00:00:00.000Z"),
    })),
  };
}

async function saveDbProfile(session: SessionLike, input: ReturnType<typeof normalizeInput>) {
  return getDb().$transaction(async (tx) => {
    const employee = await tx.employee.findFirstOrThrow({
      where: { id: input.employeeId, tenantId: session.tenantId!, companyId: session.companyId! },
      include: { department: true },
    });
    const requiredFields = [...requiredRosterFields];
    const missingFields = missingFieldsFor({
      legalNameHash: hashOptional(input.legalName),
      nationalIdHash: hashOptional(input.nationalId),
      birthDate: input.birthDate,
      gender: input.gender,
      nationality: input.nationality,
      registeredAddressHash: hashOptional(input.registeredAddress),
      emergencyContactHash: hashOptional(input.emergencyContact),
      employee,
    });
    const status = statusFor(missingFields, input.verificationStatus);
    const record = await tx.employeeLaborRosterProfile.upsert({
      where: { employeeId: employee.id },
      create: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        employeeId: employee.id,
        status,
        legalNameHash: hashOptional(input.legalName),
        nationalIdHash: hashOptional(input.nationalId),
        birthDate: input.birthDate,
        gender: input.gender,
        nationality: input.nationality,
        registeredAddressHash: hashOptional(input.registeredAddress),
        emergencyContactHash: hashOptional(input.emergencyContact),
        educationSummary: input.educationSummary,
        workExperienceSummary: input.workExperienceSummary,
        rosterSourceRef: input.rosterSourceRef,
        requiredFieldsJson: requiredFields,
        missingFieldsJson: missingFields,
        verificationStatus: input.verificationStatus,
        lastReviewedAt: input.verificationStatus === "verified" ? new Date() : null,
        reviewedByUserId: session.user?.id,
      },
      update: {
        status,
        legalNameHash: hashOptional(input.legalName),
        nationalIdHash: hashOptional(input.nationalId),
        birthDate: input.birthDate,
        gender: input.gender,
        nationality: input.nationality,
        registeredAddressHash: hashOptional(input.registeredAddress),
        emergencyContactHash: hashOptional(input.emergencyContact),
        educationSummary: input.educationSummary,
        workExperienceSummary: input.workExperienceSummary,
        rosterSourceRef: input.rosterSourceRef,
        requiredFieldsJson: requiredFields,
        missingFieldsJson: missingFields,
        verificationStatus: input.verificationStatus,
        lastReviewedAt: input.verificationStatus === "verified" ? new Date() : null,
        reviewedByUserId: session.user?.id,
      },
      include: { employee: { include: { department: true } } },
    });
    const view = mapDbProfile(record);
    await writeAuditLog(tx, {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "update",
      entityType: "employee_labor_roster_profile",
      entityId: record.id,
      after: auditPayload(view),
      metadata: auditMetadata(view),
    });
    return view;
  });
}

function saveDemoProfile(session: SessionLike, input: ReturnType<typeof normalizeInput>) {
  const overview = getFallbackCompanyOverview();
  const employee = overview.company.employees.find((item) => item.id === input.employeeId);
  if (!employee) throw new Error("Employee not found.");
  const state = getDemoState();
  const index = state.profiles.findIndex((profile) => profile.employeeId === employee.id);
  const view = buildProfileView({
    id: index >= 0 ? state.profiles[index].id : crypto.randomUUID(),
    employeeId: employee.id,
    employeeNo: employee.employeeNo,
    employeeName: employee.displayName,
    departmentName: employee.department?.name ?? null,
    jobTitle: employee.jobTitle,
    hireDate: new Date("2025-01-01T00:00:00.000Z"),
    input,
    lastReviewedAt: input.verificationStatus === "verified" ? new Date() : null,
  });
  if (index >= 0) state.profiles[index] = view;
  else state.profiles.unshift(view);
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: "update",
    entityType: "employee_labor_roster_profile",
    entityId: view.id,
    after: auditPayload(view),
    metadata: auditMetadata(view),
  });
  return view;
}

function getDemoWorkspace(): LaborRosterWorkspace {
  const overview = getFallbackCompanyOverview();
  const employees = overview.company.employees.map((employee) => ({
    id: employee.id,
    employeeNo: employee.employeeNo,
    displayName: employee.displayName,
    jobTitle: employee.jobTitle,
    departmentName: employee.department?.name ?? null,
    hireDate: new Date("2025-01-01T00:00:00.000Z"),
  }));
  const profiles = mergeMissingEmployeeProfiles(employees, getDemoState().profiles);
  return {
    employees: employees.map((employee) => ({
      id: employee.id,
      employeeNo: employee.employeeNo,
      displayName: employee.displayName,
      jobTitle: employee.jobTitle,
    })),
    profiles,
    coverage: summarizeCoverage(employees.length, getDemoState().profiles),
  };
}

function getDemoState() {
  if (!globalForLaborRoster.hrOneLaborRosterDemoState) resetLaborRosterDemoState();
  return globalForLaborRoster.hrOneLaborRosterDemoState!;
}

function mergeMissingEmployeeProfiles(
  employees: Array<{ id: string; employeeNo: string; displayName: string; jobTitle: string; departmentName: string | null; hireDate: Date }>,
  profiles: LaborRosterProfileView[],
) {
  const profileByEmployee = new Map(profiles.map((profile) => [profile.employeeId, profile]));
  return employees.map((employee) => profileByEmployee.get(employee.id) ?? emptyProfileForEmployee(employee));
}

function emptyProfileForEmployee(employee: { id: string; employeeNo: string; displayName: string; jobTitle: string; departmentName: string | null; hireDate: Date }): LaborRosterProfileView {
  return {
    id: `missing-${employee.id}`,
    employeeId: employee.id,
    employeeNo: employee.employeeNo,
    employeeName: employee.displayName,
    departmentName: employee.departmentName,
    jobTitle: employee.jobTitle,
    hireDate: employee.hireDate,
    status: "incomplete",
    legalNameHash: null,
    nationalIdHash: null,
    birthDate: null,
    gender: null,
    nationality: null,
    registeredAddressHash: null,
    emergencyContactHash: null,
    educationSummary: null,
    workExperienceSummary: null,
    rosterSourceRef: null,
    requiredFields: [...requiredRosterFields],
    missingFields: [...requiredRosterFields],
    verificationStatus: "unverified",
    lastReviewedAt: null,
  };
}

function buildProfileView(input: {
  id: string;
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  departmentName: string | null;
  jobTitle: string;
  hireDate: Date;
  input: ReturnType<typeof normalizeInput> | {
    legalName: string;
    nationalId: string;
    birthDate: Date | null;
    gender: string;
    nationality: string;
    registeredAddress: string;
    emergencyContact: string;
    educationSummary: string | null;
    workExperienceSummary: string | null;
    rosterSourceRef: string | null;
    verificationStatus: LaborRosterVerificationStatus;
  };
  lastReviewedAt: Date | null;
}): LaborRosterProfileView {
  const hashes = {
    legalNameHash: hashOptional(input.input.legalName),
    nationalIdHash: hashOptional(input.input.nationalId),
    registeredAddressHash: hashOptional(input.input.registeredAddress),
    emergencyContactHash: hashOptional(input.input.emergencyContact),
  };
  const employee = {
    hireDate: input.hireDate,
    jobTitle: input.jobTitle,
    department: input.departmentName ? { name: input.departmentName } : null,
  };
  const missingFields = missingFieldsFor({
    ...hashes,
    birthDate: input.input.birthDate,
    gender: input.input.gender,
    nationality: input.input.nationality,
    employee,
  });
  return {
    id: input.id,
    employeeId: input.employeeId,
    employeeNo: input.employeeNo,
    employeeName: input.employeeName,
    departmentName: input.departmentName,
    jobTitle: input.jobTitle,
    hireDate: input.hireDate,
    status: statusFor(missingFields, input.input.verificationStatus),
    ...hashes,
    birthDate: input.input.birthDate,
    gender: input.input.gender,
    nationality: input.input.nationality,
    educationSummary: input.input.educationSummary,
    workExperienceSummary: input.input.workExperienceSummary,
    rosterSourceRef: input.input.rosterSourceRef,
    requiredFields: [...requiredRosterFields],
    missingFields,
    verificationStatus: input.input.verificationStatus,
    lastReviewedAt: input.lastReviewedAt,
  };
}

function summarizeCoverage(employeeCount: number, persistedProfiles: LaborRosterProfileView[]) {
  const completeCount = persistedProfiles.filter((profile) => profile.status === "complete").length;
  const verifiedCount = persistedProfiles.filter((profile) => profile.verificationStatus === "verified").length;
  return {
    employeeCount,
    completeCount,
    verifiedCount,
    missingCount: Math.max(employeeCount - completeCount, 0),
    coverageRate: employeeCount ? Math.round((completeCount / employeeCount) * 100) : 100,
  };
}

function missingFieldsFor(input: {
  legalNameHash: string | null;
  nationalIdHash: string | null;
  birthDate: Date | null;
  gender: string | null;
  nationality: string | null;
  registeredAddressHash: string | null;
  emergencyContactHash: string | null;
  employee: { hireDate?: Date | null; jobTitle?: string | null; department?: { name: string } | null };
}) {
  const missing: string[] = [];
  if (!input.legalNameHash) missing.push("legal_name");
  if (!input.nationalIdHash) missing.push("national_id");
  if (!input.birthDate) missing.push("birth_date");
  if (!input.gender) missing.push("gender");
  if (!input.nationality) missing.push("nationality");
  if (!input.registeredAddressHash) missing.push("registered_address");
  if (!input.emergencyContactHash) missing.push("emergency_contact");
  if (!input.employee.hireDate) missing.push("hire_date");
  if (!input.employee.jobTitle) missing.push("job_title");
  if (!input.employee.department?.name) missing.push("department");
  return missing;
}

function statusFor(missingFields: string[], verificationStatus: LaborRosterVerificationStatus): LaborRosterStatus {
  if (missingFields.length > 0) return "incomplete";
  return verificationStatus === "verified" ? "complete" : "needs_review";
}

function auditPayload(profile: LaborRosterProfileView) {
  return {
    employeeId: profile.employeeId,
    status: profile.status,
    verificationStatus: profile.verificationStatus,
    missingFields: profile.missingFields,
    sourceConfigured: Boolean(profile.rosterSourceRef),
    legalNameHash: profile.legalNameHash,
    nationalIdHash: profile.nationalIdHash,
    registeredAddressHash: profile.registeredAddressHash,
    emergencyContactHash: profile.emergencyContactHash,
  };
}

function auditMetadata(profile: LaborRosterProfileView) {
  return {
    employeeId: profile.employeeId,
    status: profile.status,
    verificationStatus: profile.verificationStatus,
    missingFieldCount: profile.missingFields.length,
    hasLegalNameHash: Boolean(profile.legalNameHash),
    hasNationalIdHash: Boolean(profile.nationalIdHash),
    hasAddressHash: Boolean(profile.registeredAddressHash),
    hasEmergencyContactHash: Boolean(profile.emergencyContactHash),
    rawRosterPiiIncluded: false,
  };
}

function normalizeInput(input: LaborRosterProfileInput) {
  return {
    employeeId: cleanText(input.employeeId, 120),
    legalName: cleanText(input.legalName, 160),
    nationalId: cleanText(input.nationalId, 40),
    birthDate: validOptionalDate(input.birthDate),
    gender: cleanText(input.gender, 40),
    nationality: cleanText(input.nationality, 80) || "TW",
    registeredAddress: cleanText(input.registeredAddress, 300),
    emergencyContact: cleanText(input.emergencyContact, 240),
    educationSummary: cleanText(input.educationSummary, 240) || null,
    workExperienceSummary: cleanText(input.workExperienceSummary, 240) || null,
    rosterSourceRef: cleanText(input.rosterSourceRef, 240) || null,
    verificationStatus: normalizeVerificationStatus(input.verificationStatus),
  };
}

function mapDbProfile(record: {
  id: string;
  employeeId: string;
  employee: {
    employeeNo: string;
    displayName: string;
    jobTitle: string;
    hireDate: Date;
    department: { name: string } | null;
  };
  status: string;
  legalNameHash: string | null;
  nationalIdHash: string | null;
  birthDate: Date | null;
  gender: string | null;
  nationality: string | null;
  registeredAddressHash: string | null;
  emergencyContactHash: string | null;
  educationSummary: string | null;
  workExperienceSummary: string | null;
  rosterSourceRef: string | null;
  requiredFieldsJson: unknown;
  missingFieldsJson: unknown;
  verificationStatus: string;
  lastReviewedAt: Date | null;
}): LaborRosterProfileView {
  return {
    id: record.id,
    employeeId: record.employeeId,
    employeeNo: record.employee.employeeNo,
    employeeName: record.employee.displayName,
    departmentName: record.employee.department?.name ?? null,
    jobTitle: record.employee.jobTitle,
    hireDate: record.employee.hireDate,
    status: normalizeStatus(record.status),
    legalNameHash: record.legalNameHash,
    nationalIdHash: record.nationalIdHash,
    birthDate: record.birthDate,
    gender: record.gender,
    nationality: record.nationality,
    registeredAddressHash: record.registeredAddressHash,
    emergencyContactHash: record.emergencyContactHash,
    educationSummary: record.educationSummary,
    workExperienceSummary: record.workExperienceSummary,
    rosterSourceRef: record.rosterSourceRef,
    requiredFields: stringArray(record.requiredFieldsJson, [...requiredRosterFields]),
    missingFields: stringArray(record.missingFieldsJson, []),
    verificationStatus: normalizeVerificationStatus(record.verificationStatus),
    lastReviewedAt: record.lastReviewedAt,
  };
}

function mapEmployeeForRoster(employee: {
  id: string;
  employeeNo: string;
  displayName: string;
  jobTitle: string;
  hireDate: Date;
  department: { name: string } | null;
}) {
  return {
    id: employee.id,
    employeeNo: employee.employeeNo,
    displayName: employee.displayName,
    jobTitle: employee.jobTitle,
    departmentName: employee.department?.name ?? null,
    hireDate: employee.hireDate,
  };
}

function hashOptional(value: string | null | undefined) {
  const cleaned = cleanText(value, 500);
  return cleaned ? stableHash(cleaned) : null;
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validOptionalDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeVerificationStatus(value: unknown): LaborRosterVerificationStatus {
  if (value === "verified" || value === "needs_review" || value === "unverified") return value;
  return "unverified";
}

function normalizeStatus(value: string): LaborRosterStatus {
  if (value === "complete" || value === "needs_review" || value === "incomplete") return value;
  return "incomplete";
}

function stringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  return value.filter((item): item is string => typeof item === "string");
}

function canUseDatabase(session: SessionLike): session is SessionLike & { tenantId: string; companyId: string } {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
