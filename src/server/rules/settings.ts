import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { writeAuditLog } from "@/server/audit/audit";
import { getDb } from "@/server/db/client";
import type { Prisma } from "@prisma/client";
import {
  defaultTaiwanLaborStandardsConfig,
  type InsuranceSalaryGrade,
  type RuleChangeControl,
  type TaiwanStatutoryPayrollConfig,
  type TaiwanLaborStandardsConfig,
} from "./taiwan-labor-standards";
import {
  buildRuleVersionTestCases,
  evaluateLegalSourceFreshness,
  summarizeLegalSourceFreshness,
  validateTaiwanLaborStandardsRuleSet,
} from "./validation";

const taiwanLaborSettingsRuleKey = "tw_labor_standards_settings";

type RuleSettingsDemoState = {
  taiwanLaborStandards: TaiwanLaborStandardsConfig;
  auditCount: number;
};

const globalForRuleSettings = globalThis as unknown as {
  hrOneRuleSettingsDemoState?: RuleSettingsDemoState;
};

type SessionLike = {
  role: RoleKey;
  tenantId: string | null;
  companyId: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

type TaiwanLaborSettingsInput = Partial<Pick<
  TaiwanLaborStandardsConfig,
  | "minimumMonthlyWage"
  | "minimumHourlyWage"
  | "payrollStandardMonthlyHours"
  | "holidayWorkMultiplier"
  | "regularLeaveWorkMultiplier"
  | "emergencyOvertimeMultiplier"
  | "maxDailyWorkMinutesIncludingOvertime"
  | "maxMonthlyOvertimeMinutes"
  | "maxMonthlyOvertimeMinutesWithAgreement"
  | "maxThreeMonthOvertimeMinutesWithAgreement"
  | "restDayCycleDays"
  | "requiredRegularLeaveDaysPerCycle"
  | "requiredRestDaysPerCycle"
>> & {
  changeControl?: Partial<RuleChangeControl>;
  statutoryPayroll?: Omit<Partial<TaiwanStatutoryPayrollConfig>, "incomeTaxWithholding"> & {
    incomeTaxWithholding?: Partial<TaiwanStatutoryPayrollConfig["incomeTaxWithholding"]>;
  };
};

export function getRuleSettingsDemoState() {
  if (!globalForRuleSettings.hrOneRuleSettingsDemoState) {
    globalForRuleSettings.hrOneRuleSettingsDemoState = {
      taiwanLaborStandards: structuredClone(defaultTaiwanLaborStandardsConfig),
      auditCount: 0,
    };
  }
  return globalForRuleSettings.hrOneRuleSettingsDemoState;
}

export function resetRuleSettingsDemoState() {
  globalForRuleSettings.hrOneRuleSettingsDemoState = {
    taiwanLaborStandards: structuredClone(defaultTaiwanLaborStandardsConfig),
    auditCount: 0,
  };
}

export function getActiveTaiwanLaborStandardsConfig() {
  return getRuleSettingsDemoState().taiwanLaborStandards;
}

export async function getTaiwanLaborStandardsConfig(session?: SessionLike) {
  if (session && canUseDatabase(session)) {
    try {
      const activeVersion = await getDb().ruleVersion.findFirst({
        where: {
          tenantId: session.tenantId!,
          companyId: session.companyId!,
          status: "active",
          lawRule: {
            ruleKey: taiwanLaborSettingsRuleKey,
          },
        },
        orderBy: { effectiveFrom: "desc" },
      });
      if (activeVersion) {
        return readTaiwanLaborConfig(activeVersion.definitionJson);
      }
    } catch {
      return getActiveTaiwanLaborStandardsConfig();
    }
  }

  return getActiveTaiwanLaborStandardsConfig();
}

export async function updateTaiwanLaborStandardsConfig(
  session: SessionLike,
  input: TaiwanLaborSettingsInput,
) {
  assertPermission(session.role, "settings:write");
  if (canUseDatabase(session)) {
    return updateDbTaiwanLaborStandardsConfig(session, input);
  }

  const state = getRuleSettingsDemoState();
  const before = state.taiwanLaborStandards;
  const normalized = normalizeRuleSettings(input, before);
  const after: TaiwanLaborStandardsConfig = {
    ...state.taiwanLaborStandards,
    ...normalized,
    version: `${state.taiwanLaborStandards.version}+company-${state.auditCount + 1}`,
  };
  const validation = validateTaiwanLaborStandardsRuleSet(after);
  const sourceFreshness = evaluateLegalSourceFreshness(after.sources);
  assertRuleValidationPassed(validation);
  state.taiwanLaborStandards = {
    ...after,
  };
  state.auditCount += 1;
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.employee?.displayName ?? session.user?.displayName ?? "System",
    action: "update",
    entityType: "rule_settings",
    entityId: "taiwan_labor_standards",
    before,
    after: state.taiwanLaborStandards,
    metadata: {
      category: "taiwan_labor_standards",
      version: state.taiwanLaborStandards.version,
      changeControl: state.taiwanLaborStandards.changeControl,
      validationSummary: summarizeRuleValidation(validation),
      sourceFreshness: summarizeLegalSourceFreshness(sourceFreshness),
      changedFields: getChangedFields(normalized),
    },
  });
  return state.taiwanLaborStandards;
}

async function updateDbTaiwanLaborStandardsConfig(
  session: SessionLike,
  input: TaiwanLaborSettingsInput,
) {
  const db = getDb();
  return db.$transaction(async (tx) => {
    const lawRule = await tx.lawRule.upsert({
      where: {
        companyId_ruleKey: {
          companyId: session.companyId!,
          ruleKey: taiwanLaborSettingsRuleKey,
        },
      },
      create: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        jurisdiction: "TW",
        ruleKey: taiwanLaborSettingsRuleKey,
        name: "Taiwan labor standards settings",
        description: "Company-adjustable Taiwan labor standards configuration with official source references.",
        category: "labor_standards",
        status: "active",
      },
      update: {
        status: "active",
      },
    });
    const activeVersion = await tx.ruleVersion.findFirst({
      where: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        lawRuleId: lawRule.id,
        status: "active",
      },
      orderBy: { effectiveFrom: "desc" },
    });
    const before = activeVersion
      ? readTaiwanLaborConfig(activeVersion.definitionJson)
      : defaultTaiwanLaborStandardsConfig;
    const normalized = normalizeRuleSettings(input, before);
    const after: TaiwanLaborStandardsConfig = {
      ...before,
      ...normalized,
      version: `${before.version}+company-${Date.now()}`,
    };
    const validation = validateTaiwanLaborStandardsRuleSet(after);
    const sourceFreshness = evaluateLegalSourceFreshness(after.sources);
    assertRuleValidationPassed(validation);
    if (activeVersion) {
      await tx.ruleVersion.update({
        where: { id: activeVersion.id },
        data: {
          status: "superseded",
          effectiveTo: new Date(),
        },
      });
    }
    const createdVersion = await tx.ruleVersion.create({
      data: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        lawRuleId: lawRule.id,
        version: after.version,
        effectiveFrom: new Date(),
        definitionJson: buildRuleDefinition(after) as Prisma.InputJsonValue,
        testCasesJson: buildRuleVersionTestCases(validation) as Prisma.InputJsonValue,
        status: "active",
      },
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "update",
      entityType: "rule_version",
      entityId: createdVersion.id,
      before,
      after,
      metadata: {
        category: "taiwan_labor_standards",
        lawRuleId: lawRule.id,
        previousRuleVersionId: activeVersion?.id ?? null,
        ruleVersionId: createdVersion.id,
        changeControl: after.changeControl,
        validationSummary: summarizeRuleValidation(validation),
        sourceFreshness: summarizeLegalSourceFreshness(sourceFreshness),
        changedFields: getChangedFields(normalized),
      },
    });
    return after;
  });
}

function buildRuleDefinition(config: TaiwanLaborStandardsConfig) {
  const validation = validateTaiwanLaborStandardsRuleSet(config);
  const sourceFreshness = evaluateLegalSourceFreshness(config.sources);
  return {
    type: "taiwan_labor_standards_settings",
    taiwanLaborStandards: config,
    sources: config.sources,
    validationSummary: summarizeRuleValidation(validation),
    sourceFreshness: summarizeLegalSourceFreshness(sourceFreshness),
  };
}

function assertRuleValidationPassed(validation: ReturnType<typeof validateTaiwanLaborStandardsRuleSet>) {
  if (!validation.passed) {
    const failed = validation.fixtures
      .filter((fixture) => !fixture.passed)
      .map((fixture) => fixture.name)
      .join(", ");
    throw new Error(`Taiwan labor rule validation failed: ${failed}`);
  }
}

function summarizeRuleValidation(validation: ReturnType<typeof validateTaiwanLaborStandardsRuleSet>) {
  return {
    passed: validation.passed,
    passedCount: validation.passedCount,
    failedCount: validation.failedCount,
    fixtureCount: validation.fixtureCount,
    validatedAt: validation.validatedAt,
    fixtureSetVersion: validation.fixtureSetVersion,
  };
}

function readTaiwanLaborConfig(value: Prisma.JsonValue): TaiwanLaborStandardsConfig {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const config = record.taiwanLaborStandards ?? record;
    if (isTaiwanLaborStandardsConfig(config)) {
      return config;
    }
  }
  return getActiveTaiwanLaborStandardsConfig();
}

function normalizeRuleSettings(input: TaiwanLaborSettingsInput, base: TaiwanLaborStandardsConfig) {
  return {
    changeControl: normalizeChangeControl(input.changeControl, base.changeControl),
    minimumMonthlyWage: positiveNumber(input.minimumMonthlyWage, base.minimumMonthlyWage),
    minimumHourlyWage: positiveNumber(input.minimumHourlyWage, base.minimumHourlyWage),
    payrollStandardMonthlyHours: positiveNumber(
      input.payrollStandardMonthlyHours,
      base.payrollStandardMonthlyHours,
    ),
    holidayWorkMultiplier: positiveNumber(input.holidayWorkMultiplier, base.holidayWorkMultiplier),
    regularLeaveWorkMultiplier: positiveNumber(input.regularLeaveWorkMultiplier, base.regularLeaveWorkMultiplier),
    emergencyOvertimeMultiplier: positiveNumber(input.emergencyOvertimeMultiplier, base.emergencyOvertimeMultiplier),
    maxDailyWorkMinutesIncludingOvertime: positiveWholeNumber(
      input.maxDailyWorkMinutesIncludingOvertime,
      base.maxDailyWorkMinutesIncludingOvertime,
    ),
    maxMonthlyOvertimeMinutes: positiveWholeNumber(input.maxMonthlyOvertimeMinutes, base.maxMonthlyOvertimeMinutes),
    maxMonthlyOvertimeMinutesWithAgreement: positiveWholeNumber(
      input.maxMonthlyOvertimeMinutesWithAgreement,
      base.maxMonthlyOvertimeMinutesWithAgreement,
    ),
    maxThreeMonthOvertimeMinutesWithAgreement: positiveWholeNumber(
      input.maxThreeMonthOvertimeMinutesWithAgreement,
      base.maxThreeMonthOvertimeMinutesWithAgreement,
    ),
    restDayCycleDays: positiveWholeNumber(input.restDayCycleDays, base.restDayCycleDays),
    requiredRegularLeaveDaysPerCycle: nonNegativeInteger(
      input.requiredRegularLeaveDaysPerCycle,
      base.requiredRegularLeaveDaysPerCycle,
    ),
    requiredRestDaysPerCycle: nonNegativeInteger(input.requiredRestDaysPerCycle, base.requiredRestDaysPerCycle),
    statutoryPayroll: {
      ...base.statutoryPayroll,
      laborInsuranceEmployeeRate: positiveRate(
        input.statutoryPayroll?.laborInsuranceEmployeeRate,
        base.statutoryPayroll.laborInsuranceEmployeeRate,
      ),
      laborInsuranceEmployerShare: boundedRate(
        input.statutoryPayroll?.laborInsuranceEmployerShare,
        base.statutoryPayroll.laborInsuranceEmployerShare,
      ),
      nationalHealthInsuranceRate: positiveRate(
        input.statutoryPayroll?.nationalHealthInsuranceRate,
        base.statutoryPayroll.nationalHealthInsuranceRate,
      ),
      nationalHealthInsuranceEmployeeShare: boundedRate(
        input.statutoryPayroll?.nationalHealthInsuranceEmployeeShare,
        base.statutoryPayroll.nationalHealthInsuranceEmployeeShare,
      ),
      nationalHealthInsuranceEmployerShare: boundedRate(
        input.statutoryPayroll?.nationalHealthInsuranceEmployerShare,
        base.statutoryPayroll.nationalHealthInsuranceEmployerShare,
      ),
      nationalHealthInsuranceAverageDependentCount: nonNegativeNumber(
        input.statutoryPayroll?.nationalHealthInsuranceAverageDependentCount,
        base.statutoryPayroll.nationalHealthInsuranceAverageDependentCount,
      ),
      nationalHealthInsuranceDependentLimit: positiveInteger(
        input.statutoryPayroll?.nationalHealthInsuranceDependentLimit,
        base.statutoryPayroll.nationalHealthInsuranceDependentLimit,
      ),
      occupationalAccidentIndustryRate: nonNegativeRate(
        input.statutoryPayroll?.occupationalAccidentIndustryRate,
        base.statutoryPayroll.occupationalAccidentIndustryRate,
      ),
      occupationalAccidentCommuteRate: nonNegativeRate(
        input.statutoryPayroll?.occupationalAccidentCommuteRate,
        base.statutoryPayroll.occupationalAccidentCommuteRate,
      ),
      laborPensionEmployerContributionRate: positiveRate(
        input.statutoryPayroll?.laborPensionEmployerContributionRate,
        base.statutoryPayroll.laborPensionEmployerContributionRate,
      ),
      incomeTaxWithholdingRate: nonNegativeRate(
        input.statutoryPayroll?.incomeTaxWithholdingRate,
        base.statutoryPayroll.incomeTaxWithholdingRate,
      ),
      incomeTaxWithholding: {
        ...base.statutoryPayroll.incomeTaxWithholding,
        monthsPerYear: positiveWholeNumber(
          input.statutoryPayroll?.incomeTaxWithholding?.monthsPerYear,
          base.statutoryPayroll.incomeTaxWithholding.monthsPerYear,
        ),
        monthlyExemptionAmount: nonNegativeNumber(
          input.statutoryPayroll?.incomeTaxWithholding?.monthlyExemptionAmount,
          base.statutoryPayroll.incomeTaxWithholding.monthlyExemptionAmount,
        ),
        monthlyStandardDeductionAmount: nonNegativeNumber(
          input.statutoryPayroll?.incomeTaxWithholding?.monthlyStandardDeductionAmount,
          base.statutoryPayroll.incomeTaxWithholding.monthlyStandardDeductionAmount,
        ),
        annualSalarySpecialDeductionAmount: nonNegativeNumber(
          input.statutoryPayroll?.incomeTaxWithholding?.annualSalarySpecialDeductionAmount,
          base.statutoryPayroll.incomeTaxWithholding.annualSalarySpecialDeductionAmount,
        ),
        minimumMonthlyWithholding: nonNegativeNumber(
          input.statutoryPayroll?.incomeTaxWithholding?.minimumMonthlyWithholding,
          base.statutoryPayroll.incomeTaxWithholding.minimumMonthlyWithholding,
        ),
        brackets: Array.isArray(input.statutoryPayroll?.incomeTaxWithholding?.brackets) &&
          input.statutoryPayroll.incomeTaxWithholding.brackets.length > 0
          ? input.statutoryPayroll.incomeTaxWithholding.brackets
          : base.statutoryPayroll.incomeTaxWithholding.brackets,
      },
      laborInsuranceSalaryGrades: normalizeSalaryGrades(
        input.statutoryPayroll?.laborInsuranceSalaryGrades,
        base.statutoryPayroll.laborInsuranceSalaryGrades,
      ),
      healthInsuranceSalaryGrades: normalizeSalaryGrades(
        input.statutoryPayroll?.healthInsuranceSalaryGrades,
        base.statutoryPayroll.healthInsuranceSalaryGrades,
      ),
      laborPensionContributionGrades: normalizeSalaryGrades(
        input.statutoryPayroll?.laborPensionContributionGrades,
        base.statutoryPayroll.laborPensionContributionGrades,
      ),
    },
  };
}

function normalizeChangeControl(
  input: Partial<RuleChangeControl> | undefined,
  fallback: RuleChangeControl,
): RuleChangeControl {
  const now = new Date().toISOString();
  const reason = cleanText(input?.reason, fallback.reason);
  const reviewedBy = cleanOptionalText(input?.reviewedBy) ?? fallback.reviewedBy;
  const sourceUrl = cleanOptionalText(input?.sourceUrl) ?? fallback.sourceUrl;
  const reviewStatus = input?.reviewStatus === "approved" ? "approved" : "pending_legal_review";
  return {
    reason,
    sourceUrl,
    reviewedBy,
    reviewedAt: reviewStatus === "approved" ? cleanOptionalText(input?.reviewedAt) ?? now : null,
    reviewStatus,
    requiresPayrollRecalculation: input?.requiresPayrollRecalculation ?? true,
  };
}

function cleanText(value: string | null | undefined, fallback: string) {
  const normalized = cleanOptionalText(value);
  return normalized ?? fallback;
}

function cleanOptionalText(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized.slice(0, 500) : null;
}

function positiveNumber(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegativeNumber(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function positiveInteger(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback;
}

function positiveWholeNumber(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function nonNegativeInteger(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback;
}

function positiveRate(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 1 ? value : fallback;
}

function nonNegativeRate(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
}

function boundedRate(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
}

function normalizeSalaryGrades(
  value: InsuranceSalaryGrade[] | undefined,
  fallback: InsuranceSalaryGrade[],
) {
  if (!Array.isArray(value) || value.length === 0) return fallback;
  const validGrades = value
    .filter((gradeItem) => (
      Number.isInteger(gradeItem.level) &&
      Number.isFinite(gradeItem.insuredSalary) &&
      Number.isFinite(gradeItem.salaryFrom) &&
      (gradeItem.salaryTo === null || Number.isFinite(gradeItem.salaryTo))
    ))
    .map((gradeItem) => ({
      level: gradeItem.level,
      insuredSalary: gradeItem.insuredSalary,
      salaryFrom: gradeItem.salaryFrom,
      salaryTo: gradeItem.salaryTo,
    }))
    .sort((a, b) => a.level - b.level);
  return validGrades.length > 0 ? validGrades : fallback;
}

function getChangedFields(input: ReturnType<typeof normalizeRuleSettings>) {
  return [
    "minimumMonthlyWage",
    "changeControl",
    "minimumHourlyWage",
    "payrollStandardMonthlyHours",
    "holidayWorkMultiplier",
    "regularLeaveWorkMultiplier",
    "emergencyOvertimeMultiplier",
    "maxDailyWorkMinutesIncludingOvertime",
    "maxMonthlyOvertimeMinutes",
    "maxMonthlyOvertimeMinutesWithAgreement",
    "maxThreeMonthOvertimeMinutesWithAgreement",
    "restDayCycleDays",
    "requiredRegularLeaveDaysPerCycle",
    "requiredRestDaysPerCycle",
    ...Object.keys(input.statutoryPayroll).map((key) => `statutoryPayroll.${key}`),
  ];
}

function isTaiwanLaborStandardsConfig(value: unknown): value is TaiwanLaborStandardsConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.jurisdiction === "TW" &&
    typeof record.version === "string" &&
    typeof record.minimumMonthlyWage === "number" &&
    typeof record.minimumHourlyWage === "number" &&
    typeof record.payrollStandardMonthlyHours === "number" &&
    typeof record.statutoryPayroll === "object" &&
    Array.isArray(record.sources)
  );
}

function canUseDatabase(session: SessionLike) {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
