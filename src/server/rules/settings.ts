import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { writeAuditLog } from "@/server/audit/audit";
import { getDb } from "@/server/db/client";
import type { Prisma } from "@prisma/client";
import {
  defaultTaiwanLaborStandardsConfig,
  type InsuranceSalaryGrade,
  type LegalSource,
  type RuleChangeControl,
  type StatutoryFilingReportDefinition,
  type TaiwanStatutoryPayrollConfig,
  type TaiwanLaborStandardsConfig,
} from "./taiwan-labor-standards";
import {
  buildRuleVersionTestCases,
  evaluateLegalSourceFreshness,
  readRuleValidationSummary,
  summarizeLegalSourceFreshness,
  validateTaiwanLaborStandardsRuleSet,
} from "./validation";

const taiwanLaborSettingsRuleKey = "tw_labor_standards_settings";

type RuleSettingsDemoState = {
  taiwanLaborStandards: TaiwanLaborStandardsConfig;
  versionHistory: TaiwanLaborRuleVersionSummary[];
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

export type TaiwanLaborRuleVersionSummary = {
  id: string;
  version: string;
  status: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
  reviewStatus: RuleChangeControl["reviewStatus"];
  reviewedBy: string | null;
  requiresPayrollRecalculation: boolean;
  sourceCount: number;
  validationPassed: boolean | null;
};

export type TaiwanLaborRuleCenterReadiness = {
  status: "ready" | "needs_review" | "blocked";
  label: string;
  blockers: string[];
  warnings: string[];
  nextActions: string[];
};

export type TaiwanLaborRuleCenter = {
  config: TaiwanLaborStandardsConfig;
  validation: ReturnType<typeof validateTaiwanLaborStandardsRuleSet>;
  sourceFreshness: ReturnType<typeof evaluateLegalSourceFreshness>;
  versionHistory: TaiwanLaborRuleVersionSummary[];
  readiness: TaiwanLaborRuleCenterReadiness;
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
  terminationCompliance?: Partial<TaiwanLaborStandardsConfig["terminationCompliance"]>;
  statutoryOnboarding?: Partial<TaiwanLaborStandardsConfig["statutoryOnboarding"]>;
  statutoryPayroll?: Omit<Partial<TaiwanStatutoryPayrollConfig>, "incomeTaxWithholding"> & {
    incomeTaxWithholding?: Partial<TaiwanStatutoryPayrollConfig["incomeTaxWithholding"]>;
  };
  sources?: LegalSource[];
};

export function getRuleSettingsDemoState() {
  if (!globalForRuleSettings.hrOneRuleSettingsDemoState) {
    globalForRuleSettings.hrOneRuleSettingsDemoState = {
      taiwanLaborStandards: structuredClone(defaultTaiwanLaborStandardsConfig),
      versionHistory: [buildRuleVersionSummary("demo-baseline", defaultTaiwanLaborStandardsConfig, {
        status: "active",
        effectiveFrom: defaultTaiwanLaborStandardsConfig.effectiveFrom,
        effectiveTo: null,
        createdAt: defaultTaiwanLaborStandardsConfig.effectiveFrom,
      })],
      auditCount: 0,
    };
  }
  return globalForRuleSettings.hrOneRuleSettingsDemoState;
}

export function resetRuleSettingsDemoState() {
  globalForRuleSettings.hrOneRuleSettingsDemoState = {
    taiwanLaborStandards: structuredClone(defaultTaiwanLaborStandardsConfig),
    versionHistory: [buildRuleVersionSummary("demo-baseline", defaultTaiwanLaborStandardsConfig, {
      status: "active",
      effectiveFrom: defaultTaiwanLaborStandardsConfig.effectiveFrom,
      effectiveTo: null,
      createdAt: defaultTaiwanLaborStandardsConfig.effectiveFrom,
    })],
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

export async function getTaiwanLaborRuleCenter(session?: SessionLike): Promise<TaiwanLaborRuleCenter> {
  const config = await getTaiwanLaborStandardsConfig(session);
  const validation = validateTaiwanLaborStandardsRuleSet(config);
  const sourceFreshness = evaluateLegalSourceFreshness(config.sources);
  const versionHistory = session && canUseDatabase(session)
    ? await getDbTaiwanLaborRuleVersionHistory(session)
    : getRuleSettingsDemoState().versionHistory;

  return {
    config,
    validation,
    sourceFreshness,
    versionHistory,
    readiness: buildRuleCenterReadiness(config, validation, sourceFreshness, versionHistory),
  };
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
  state.versionHistory = [
    buildRuleVersionSummary(`demo-company-${state.auditCount}`, state.taiwanLaborStandards, {
      status: "active",
      effectiveFrom: state.taiwanLaborStandards.effectiveFrom,
      effectiveTo: null,
      createdAt: new Date().toISOString(),
    }),
    ...state.versionHistory.map((version) => (
      version.status === "active"
        ? { ...version, status: "superseded", effectiveTo: new Date().toISOString() }
        : version
    )),
  ].slice(0, 12);
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

async function getDbTaiwanLaborRuleVersionHistory(session: SessionLike) {
  try {
    const versions = await getDb().ruleVersion.findMany({
      where: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        lawRule: {
          ruleKey: taiwanLaborSettingsRuleKey,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 12,
    });
    return versions.map((version) => {
      const config = readTaiwanLaborConfig(version.definitionJson);
      return buildRuleVersionSummary(version.id, config, {
        status: version.status,
        effectiveFrom: version.effectiveFrom.toISOString(),
        effectiveTo: version.effectiveTo?.toISOString() ?? null,
        createdAt: version.createdAt.toISOString(),
        validationPassed: readRuleValidationSummary(version.definitionJson)?.passed ?? null,
      });
    });
  } catch {
    return getRuleSettingsDemoState().versionHistory;
  }
}

function buildRuleVersionSummary(
  id: string,
  config: TaiwanLaborStandardsConfig,
  options: {
    status: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    createdAt: string;
    validationPassed?: boolean | null;
  },
): TaiwanLaborRuleVersionSummary {
  return {
    id,
    version: config.version,
    status: options.status,
    effectiveFrom: options.effectiveFrom,
    effectiveTo: options.effectiveTo,
    createdAt: options.createdAt,
    reviewStatus: config.changeControl.reviewStatus,
    reviewedBy: config.changeControl.reviewedBy,
    requiresPayrollRecalculation: config.changeControl.requiresPayrollRecalculation,
    sourceCount: config.sources.length,
    validationPassed: options.validationPassed ?? validateTaiwanLaborStandardsRuleSet(config).passed,
  };
}

function buildRuleCenterReadiness(
  config: TaiwanLaborStandardsConfig,
  validation: ReturnType<typeof validateTaiwanLaborStandardsRuleSet>,
  sourceFreshness: ReturnType<typeof evaluateLegalSourceFreshness>,
  versionHistory: TaiwanLaborRuleVersionSummary[],
): TaiwanLaborRuleCenterReadiness {
  const blockers = [
    !validation.passed ? "法規規則測試案例未全部通過" : null,
    versionHistory.length === 0 ? "缺少 rule_versions 版本紀錄" : null,
  ].filter((item): item is string => Boolean(item));
  const warnings = [
    config.changeControl.reviewStatus !== "approved" ? "目前版本尚待法務或人資負責人審核" : null,
    !sourceFreshness.passed ? "官方來源超過檢查期限或有日期格式問題" : null,
    config.changeControl.requiresPayrollRecalculation ? "薪資草稿需重新試算檢查" : null,
  ].filter((item): item is string => Boolean(item));
  const status = blockers.length > 0 ? "blocked" : warnings.length > 0 ? "needs_review" : "ready";

  return {
    status,
    label: status === "ready" ? "可用於薪資與假勤試算" : status === "blocked" ? "阻擋上線" : "需審核",
    blockers,
    warnings,
    nextActions: [
      !validation.passed ? "修正法規設定後重新儲存，直到所有測試案例通過。" : null,
      !sourceFreshness.passed ? "更新官方來源檢查日與 URL，並由 HR/法務確認。" : null,
      config.changeControl.reviewStatus !== "approved" ? "補上審核人並將狀態改為已核准。" : null,
      config.changeControl.requiresPayrollRecalculation ? "重新試算尚未鎖定的薪資草稿。" : null,
      versionHistory.length === 0 ? "建立第一筆 rule_versions 紀錄。" : null,
    ].filter((item): item is string => Boolean(item)),
  };
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
      return {
        ...defaultTaiwanLaborStandardsConfig,
        ...config,
        statutoryOnboarding: {
          ...defaultTaiwanLaborStandardsConfig.statutoryOnboarding,
          ...config.statutoryOnboarding,
        },
        statutoryPayroll: {
          ...defaultTaiwanLaborStandardsConfig.statutoryPayroll,
          ...config.statutoryPayroll,
          statutoryFilingReports: normalizeStatutoryFilingReports(
            config.statutoryPayroll.statutoryFilingReports,
            defaultTaiwanLaborStandardsConfig.statutoryPayroll.statutoryFilingReports,
          ),
          incomeTaxWithholding: {
            ...defaultTaiwanLaborStandardsConfig.statutoryPayroll.incomeTaxWithholding,
            ...config.statutoryPayroll.incomeTaxWithholding,
          },
        },
        sources: Array.isArray(config.sources) ? config.sources : defaultTaiwanLaborStandardsConfig.sources,
      };
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
    terminationCompliance: normalizeTerminationCompliance(input.terminationCompliance, base.terminationCompliance),
    statutoryOnboarding: normalizeStatutoryOnboarding(input.statutoryOnboarding, base.statutoryOnboarding),
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
      nationalHealthInsuranceSupplementaryPremiumEnabled:
        input.statutoryPayroll?.nationalHealthInsuranceSupplementaryPremiumEnabled ??
        base.statutoryPayroll.nationalHealthInsuranceSupplementaryPremiumEnabled,
      nationalHealthInsuranceSupplementaryPremiumRate: nonNegativeRate(
        input.statutoryPayroll?.nationalHealthInsuranceSupplementaryPremiumRate,
        base.statutoryPayroll.nationalHealthInsuranceSupplementaryPremiumRate,
      ),
      nationalHealthInsuranceSupplementaryBonusThresholdMultiplier: positiveNumber(
        input.statutoryPayroll?.nationalHealthInsuranceSupplementaryBonusThresholdMultiplier,
        base.statutoryPayroll.nationalHealthInsuranceSupplementaryBonusThresholdMultiplier,
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
      statutoryFilingReports: normalizeStatutoryFilingReports(
        input.statutoryPayroll?.statutoryFilingReports,
        base.statutoryPayroll.statutoryFilingReports,
      ),
    },
    sources: normalizeLegalSources(input.sources, base.sources),
  };
}

function normalizeLegalSources(value: LegalSource[] | undefined, fallback: LegalSource[]) {
  if (!Array.isArray(value) || value.length === 0) return fallback;
  const seen = new Set<string>();
  const sources: LegalSource[] = [];
  for (const source of value) {
    const normalized = {
      id: cleanSourceId(source.id),
      title: cleanText(source.title, ""),
      url: cleanOptionalText(source.url) ?? "",
      checkedAt: cleanDateOnly(source.checkedAt),
    };
    if (!normalized.id || !normalized.title || !normalized.url || !normalized.checkedAt || seen.has(normalized.id)) {
      continue;
    }
    seen.add(normalized.id);
    sources.push({
      id: normalized.id,
      title: normalized.title,
      url: normalized.url,
      checkedAt: normalized.checkedAt,
    });
  }
  return sources.length > 0 ? sources : fallback;
}

function normalizeStatutoryOnboarding(
  input: TaiwanLaborSettingsInput["statutoryOnboarding"],
  base: TaiwanLaborStandardsConfig["statutoryOnboarding"],
) {
  return {
    laborInsuranceEnrollmentDueDaysFromHire: nonNegativeInteger(
      input?.laborInsuranceEnrollmentDueDaysFromHire,
      base.laborInsuranceEnrollmentDueDaysFromHire,
    ),
    employmentInsuranceEnrollmentDueDaysFromHire: nonNegativeInteger(
      input?.employmentInsuranceEnrollmentDueDaysFromHire,
      base.employmentInsuranceEnrollmentDueDaysFromHire,
    ),
    occupationalAccidentInsuranceEnrollmentDueDaysFromHire: nonNegativeInteger(
      input?.occupationalAccidentInsuranceEnrollmentDueDaysFromHire,
      base.occupationalAccidentInsuranceEnrollmentDueDaysFromHire,
    ),
    insuranceWithdrawalDueDaysFromTermination: nonNegativeInteger(
      input?.insuranceWithdrawalDueDaysFromTermination,
      base.insuranceWithdrawalDueDaysFromTermination,
    ),
  };
}

function normalizeStatutoryFilingReports(
  value: StatutoryFilingReportDefinition[] | undefined,
  fallback: StatutoryFilingReportDefinition[],
) {
  if (!Array.isArray(value) || value.length === 0) return fallback;
  const reports: StatutoryFilingReportDefinition[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const report = cleanText(item.report, "");
    const authority = cleanText(item.authority, "");
    const payrollItemCodes = Array.isArray(item.payrollItemCodes)
      ? [...new Set(item.payrollItemCodes.map((code) => cleanText(code, "")).filter(Boolean))]
      : [];
    const key = `${report}:${authority}`;
    if (!report || !authority || payrollItemCodes.length === 0 || seen.has(key)) {
      continue;
    }
    seen.add(key);
    reports.push({ report, authority, payrollItemCodes });
  }
  return reports.length > 0 ? reports : fallback;
}

function normalizeTerminationCompliance(
  input: TaiwanLaborSettingsInput["terminationCompliance"],
  base: TaiwanLaborStandardsConfig["terminationCompliance"],
) {
  const advanceNoticeTiers = Array.isArray(input?.advanceNoticeTiers) && input.advanceNoticeTiers.length > 0
    ? input.advanceNoticeTiers
        .map((tier) => ({
          serviceMonthsFrom: nonNegativeInteger(tier.serviceMonthsFrom, 0),
          serviceMonthsTo: tier.serviceMonthsTo === null ? null : nonNegativeInteger(tier.serviceMonthsTo, 0),
          noticeDays: nonNegativeInteger(tier.noticeDays, 0),
        }))
        .sort((a, b) => a.serviceMonthsFrom - b.serviceMonthsFrom)
    : base.advanceNoticeTiers;

  return {
    advanceNoticeTiers,
    laborPensionSeveranceMultiplierPerServiceYear: positiveNumber(
      input?.laborPensionSeveranceMultiplierPerServiceYear,
      base.laborPensionSeveranceMultiplierPerServiceYear,
    ),
    laborPensionSeveranceMaxAverageWageMonths: positiveNumber(
      input?.laborPensionSeveranceMaxAverageWageMonths,
      base.laborPensionSeveranceMaxAverageWageMonths,
    ),
    laborStandardsSeveranceMultiplierPerServiceYear: positiveNumber(
      input?.laborStandardsSeveranceMultiplierPerServiceYear,
      base.laborStandardsSeveranceMultiplierPerServiceYear,
    ),
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

function cleanSourceId(value: string | null | undefined) {
  const normalized = cleanOptionalText(value);
  if (!normalized) return null;
  return normalized
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || null;
}

function cleanDateOnly(value: string | null | undefined) {
  const normalized = cleanOptionalText(value);
  if (!normalized) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : normalized;
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
    ...Object.keys(input.terminationCompliance).map((key) => `terminationCompliance.${key}`),
    ...Object.keys(input.statutoryOnboarding).map((key) => `statutoryOnboarding.${key}`),
    ...Object.keys(input.statutoryPayroll).map((key) => `statutoryPayroll.${key}`),
    "sources",
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
    typeof record.terminationCompliance === "object" &&
    (record.statutoryOnboarding === undefined || typeof record.statutoryOnboarding === "object") &&
    typeof record.statutoryPayroll === "object" &&
    Array.isArray(record.sources)
  );
}

function canUseDatabase(session: SessionLike) {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
