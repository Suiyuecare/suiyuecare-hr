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

export type TaiwanLaborComplianceCoverageStatus = "covered" | "needs_review" | "blocked";

export type TaiwanLaborComplianceCoverageItem = {
  id: string;
  title: string;
  legalBasis: string;
  owner: "HR" | "Payroll" | "Owner";
  status: TaiwanLaborComplianceCoverageStatus;
  sourceIds: string[];
  missingSourceIds: string[];
  staleSourceIds: string[];
  controlCount: number;
  configuredControlCount: number;
  controls: Array<{
    label: string;
    configured: boolean;
  }>;
  evidence: string;
  nextAction: string;
};

export type TaiwanLaborComplianceCoverageSummary = {
  status: TaiwanLaborRuleCenterReadiness["status"];
  coveredCount: number;
  needsReviewCount: number;
  blockedCount: number;
  totalCount: number;
  blockedItems: string[];
  needsReviewItems: string[];
};

export type TaiwanLaborRuleCenter = {
  config: TaiwanLaborStandardsConfig;
  validation: ReturnType<typeof validateTaiwanLaborStandardsRuleSet>;
  sourceFreshness: ReturnType<typeof evaluateLegalSourceFreshness>;
  complianceCoverage: TaiwanLaborComplianceCoverageItem[];
  complianceCoverageSummary: TaiwanLaborComplianceCoverageSummary;
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
  const complianceCoverage = buildTaiwanLaborComplianceCoverage(config, sourceFreshness);
  const complianceCoverageSummary = summarizeTaiwanLaborComplianceCoverage(complianceCoverage);
  const versionHistory = session && canUseDatabase(session)
    ? await getDbTaiwanLaborRuleVersionHistory(session)
    : getRuleSettingsDemoState().versionHistory;

  return {
    config,
    validation,
    sourceFreshness,
    complianceCoverage,
    complianceCoverageSummary,
    versionHistory,
    readiness: buildRuleCenterReadiness(
      config,
      validation,
      sourceFreshness,
      versionHistory,
      complianceCoverageSummary,
    ),
  };
}

export function buildTaiwanLaborComplianceCoverage(
  config: TaiwanLaborStandardsConfig,
  sourceFreshness = evaluateLegalSourceFreshness(config.sources),
): TaiwanLaborComplianceCoverageItem[] {
  return [
    coverageItem(config, sourceFreshness, {
      id: "minimum_wage",
      title: "最低工資",
      legalBasis: "最低工資法與年度公告",
      owner: "HR",
      sourceIds: ["tw-minimum-wage-2026"],
      controls: [
        ["最低月薪", config.minimumMonthlyWage > 0],
        ["最低時薪", config.minimumHourlyWage > 0],
        ["薪資 profile 儲存前檢查", true],
      ],
      evidence: `${formatMoneyForEvidence(config.minimumMonthlyWage)} / ${formatMoneyForEvidence(config.minimumHourlyWage)}`,
      nextAction: "確認年度最低工資公告與薪資 profile 檢查仍為最新版本。",
    }),
    coverageItem(config, sourceFreshness, {
      id: "working_time",
      title: "正常工時與延長工時上限",
      legalBasis: "勞基法第 30、32 條",
      owner: "HR",
      sourceIds: ["tw-lsa-article-30", "tw-lsa-article-32"],
      controls: [
        ["每日正常工時", config.normalDailyMinutes > 0],
        ["每週正常工時", config.normalWeeklyMinutes > 0],
        ["每日含加班上限", config.maxDailyWorkMinutesIncludingOvertime >= config.normalDailyMinutes],
        ["月加班上限", config.maxMonthlyOvertimeMinutes > 0],
      ],
      evidence: `${config.normalDailyMinutes / 60}h/day, ${config.normalWeeklyMinutes / 60}h/week`,
      nextAction: "複核工時上限與勞資會議加班上限，並同步排班與出勤異常 Gate。",
    }),
    coverageItem(config, sourceFreshness, {
      id: "overtime_pay",
      title: "加班費與休息日出勤",
      legalBasis: "勞基法第 24、32、36 條",
      owner: "Payroll",
      sourceIds: ["tw-lsa-article-24", "tw-lsa-article-32", "tw-lsa-article-36"],
      controls: [
        ["平日加班級距", config.regularDayOvertimeTiers.length >= 2],
        ["休息日加班級距", config.restDayOvertimeTiers.length >= 2],
        ["加班單與薪資計算共用 rule version", true],
      ],
      evidence: `${config.regularDayOvertimeTiers.length} regular tier(s), ${config.restDayOvertimeTiers.length} rest-day tier(s)`,
      nextAction: "用本版本規則重新試算未鎖定薪資草稿，避免加班費沿用舊倍率。",
    }),
    coverageItem(config, sourceFreshness, {
      id: "rest_holiday_pay",
      title: "例假、休息日與國定假日",
      legalBasis: "勞基法第 36、37、39 條",
      owner: "HR",
      sourceIds: ["tw-lsa-article-36", "tw-lsa-article-37", "tw-lsa-article-39"],
      controls: [
        ["七日週期", config.restDayCycleDays >= 7],
        ["例假日數", config.requiredRegularLeaveDaysPerCycle >= 1],
        ["休息日數", config.requiredRestDaysPerCycle >= 1],
        ["假日出勤倍率", config.holidayWorkMultiplier > 0 && config.regularLeaveWorkMultiplier > 0],
      ],
      evidence: `${config.requiredRegularLeaveDaysPerCycle} regular leave + ${config.requiredRestDaysPerCycle} rest day / ${config.restDayCycleDays} days`,
      nextAction: "確認公司行事曆、排班與假日出勤薪資倍率使用同一個版本來源。",
    }),
    coverageItem(config, sourceFreshness, {
      id: "annual_leave",
      title: "特休與未休工資",
      legalBasis: "勞基法第 38 條、施行細則第 24-1 條",
      owner: "HR",
      sourceIds: ["tw-lsa-article-38", "tw-lsa-enforcement-article-24-1"],
      controls: [
        ["特休級距", config.annualLeaveTiers.length >= 6],
        ["滿半年給假", config.annualLeaveTiers.some((tier) => tier.serviceMonthsFrom === 6 && tier.days > 0)],
        ["未休工資結算", true],
      ],
      evidence: `${config.annualLeaveTiers.length} tier(s), cap ${config.annualLeaveTiers.at(-1)?.maxDays ?? "review"} day(s)`,
      nextAction: "用特休結算工作台複核到期提醒、結清與薪資項目，不讓 payroll 靜默加項。",
    }),
    coverageItem(config, sourceFreshness, {
      id: "statutory_leave",
      title: "法定假別",
      legalBasis: "勞工請假規則、性別平等工作法",
      owner: "HR",
      sourceIds: ["tw-worker-leave-rules", "tw-gender-equality-employment-act"],
      controls: [
        ["假別政策工作台", true],
        ["HR/法務複核旗標", true],
        ["員工三步內請假", true],
      ],
      evidence: "Leave policy workspace controls statutory categories and review flags.",
      nextAction: "在假別政策工作台維持法定假別覆蓋，避免員工端流程變複雜。",
    }),
    coverageItem(config, sourceFreshness, {
      id: "termination",
      title: "離職、預告與資遣",
      legalBasis: "勞基法第 16、17 條、勞退條例第 12 條",
      owner: "HR",
      sourceIds: ["tw-lsa-article-16-17", "tw-labor-pension-act-article-12"],
      controls: [
        ["預告期級距", config.terminationCompliance.advanceNoticeTiers.length >= 3],
        ["新制資遣費倍率", config.terminationCompliance.laborPensionSeveranceMultiplierPerServiceYear > 0],
        ["舊制資遣費倍率", config.terminationCompliance.laborStandardsSeveranceMultiplierPerServiceYear > 0],
        ["離職人工審核", true],
      ],
      evidence: `${config.terminationCompliance.advanceNoticeTiers.length} notice tier(s); severance human review required`,
      nextAction: "離職流程需保留人工審核、服務證明、最終工資與特休結清證據。",
    }),
    coverageItem(config, sourceFreshness, {
      id: "insurance_onboarding",
      title: "勞保、就保、職災加退保",
      legalBasis: "勞保局加退保時點、職災保險規則",
      owner: "HR",
      sourceIds: ["tw-labor-insurance-enrollment", "tw-occupational-accident-insurance-2026"],
      controls: [
        ["到職勞保期限", config.statutoryOnboarding.laborInsuranceEnrollmentDueDaysFromHire >= 0],
        ["到職就保期限", config.statutoryOnboarding.employmentInsuranceEnrollmentDueDaysFromHire >= 0],
        ["到職職災保險期限", config.statutoryOnboarding.occupationalAccidentInsuranceEnrollmentDueDaysFromHire >= 0],
        ["離職退保期限", config.statutoryOnboarding.insuranceWithdrawalDueDaysFromTermination >= 0],
      ],
      evidence: `hire due ${config.statutoryOnboarding.laborInsuranceEnrollmentDueDaysFromHire} day(s), withdrawal ${config.statutoryOnboarding.insuranceWithdrawalDueDaysFromTermination} day(s)`,
      nextAction: "投保工作台需對每位在職員工保存 hash 證據並在上線 Gate 檢查覆蓋率。",
    }),
    coverageItem(config, sourceFreshness, {
      id: "statutory_payroll",
      title: "勞健保、勞退與補充保費",
      legalBasis: "勞保、健保、職災保險與勞退級距",
      owner: "Payroll",
      sourceIds: [
        "tw-labor-insurance-grades-2026",
        "tw-nhi-premium-2026",
        "tw-nhi-supplementary-premium-2026",
        "tw-occupational-accident-insurance-2026",
      ],
      controls: [
        ["勞保級距", config.statutoryPayroll.laborInsuranceSalaryGrades.length > 0],
        ["健保級距", config.statutoryPayroll.healthInsuranceSalaryGrades.length > 0],
        ["勞退級距", config.statutoryPayroll.laborPensionContributionGrades.length > 0],
        ["補充保費設定", config.statutoryPayroll.nationalHealthInsuranceSupplementaryPremiumRate >= 0],
      ],
      evidence: `${config.statutoryPayroll.laborInsuranceSalaryGrades.length}/${config.statutoryPayroll.healthInsuranceSalaryGrades.length}/${config.statutoryPayroll.laborPensionContributionGrades.length} grade rows`,
      nextAction: "薪資月結前檢查投保級距 override，低報風險只能由 HR/Payroll 人工處理。",
    }),
    coverageItem(config, sourceFreshness, {
      id: "income_tax",
      title: "所得稅扣繳",
      legalBasis: "財政部扣繳與累進稅率來源",
      owner: "Payroll",
      sourceIds: ["tw-income-tax-brackets-2026"],
      controls: [
        ["累進稅率級距", config.statutoryPayroll.incomeTaxWithholding.brackets.length > 0],
        ["非居住者扣繳率", config.statutoryPayroll.nonResidentIncomeTaxWithholdingRate > 0],
        ["扣繳結果需 HR 複核", true],
      ],
      evidence: `${config.statutoryPayroll.incomeTaxWithholding.brackets.length} bracket(s), non-resident ${Math.round(config.statutoryPayroll.nonResidentIncomeTaxWithholdingRate * 100)}%`,
      nextAction: "薪資鎖定前保留扣繳試算與人工複核，不讓系統自動完成稅務判斷。",
    }),
    coverageItem(config, sourceFreshness, {
      id: "filing_package",
      title: "法定申報與勞檢封存",
      legalBasis: "勞保、健保、勞退、所得稅申報包",
      owner: "Owner",
      sourceIds: ["tw-labor-insurance-grades-2026", "tw-nhi-premium-2026", "tw-income-tax-brackets-2026"],
      controls: [
        ["申報包對應表", config.statutoryPayroll.statutoryFilingReports.length >= 5],
        ["薪資封存 manifest", true],
        ["勞檢匯出不含原始敏感資料", true],
      ],
      evidence: `${config.statutoryPayroll.statutoryFilingReports.length} statutory filing package(s)`,
      nextAction: "確認申報包欄位、下載期限、內容 hash 與 audit log 覆蓋率。",
    }),
  ];
}

export function summarizeTaiwanLaborComplianceCoverage(
  items: TaiwanLaborComplianceCoverageItem[],
): TaiwanLaborComplianceCoverageSummary {
  const coveredCount = items.filter((item) => item.status === "covered").length;
  const needsReviewItems = items.filter((item) => item.status === "needs_review").map((item) => item.title);
  const blockedItems = items.filter((item) => item.status === "blocked").map((item) => item.title);
  return {
    status: blockedItems.length ? "blocked" : needsReviewItems.length ? "needs_review" : "ready",
    coveredCount,
    needsReviewCount: needsReviewItems.length,
    blockedCount: blockedItems.length,
    totalCount: items.length,
    blockedItems,
    needsReviewItems,
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

function coverageItem(
  config: TaiwanLaborStandardsConfig,
  sourceFreshness: ReturnType<typeof evaluateLegalSourceFreshness>,
  definition: {
    id: string;
    title: string;
    legalBasis: string;
    owner: TaiwanLaborComplianceCoverageItem["owner"];
    sourceIds: string[];
    controls: Array<[string, boolean]>;
    evidence: string;
    nextAction: string;
  },
): TaiwanLaborComplianceCoverageItem {
  const configuredSourceIds = new Set(config.sources.map((source) => source.id));
  const missingSourceIds = definition.sourceIds.filter((sourceId) => !configuredSourceIds.has(sourceId));
  const staleSourceIds = definition.sourceIds.filter((sourceId) =>
    sourceFreshness.staleSourceIds.includes(sourceId) ||
    sourceFreshness.invalidSourceIds.includes(sourceId)
  );
  const controls = definition.controls.map(([label, configured]) => ({ label, configured }));
  const configuredControlCount = controls.filter((control) => control.configured).length;
  const hasControlGaps = configuredControlCount < controls.length;
  const status: TaiwanLaborComplianceCoverageStatus =
    missingSourceIds.length > 0 || hasControlGaps
      ? "blocked"
      : staleSourceIds.length > 0 ||
          config.changeControl.reviewStatus !== "approved" ||
          config.changeControl.requiresPayrollRecalculation
      ? "needs_review"
      : "covered";

  return {
    id: definition.id,
    title: definition.title,
    legalBasis: definition.legalBasis,
    owner: definition.owner,
    status,
    sourceIds: definition.sourceIds,
    missingSourceIds,
    staleSourceIds,
    controlCount: controls.length,
    configuredControlCount,
    controls,
    evidence: definition.evidence,
    nextAction: status === "blocked"
      ? buildCoverageBlockedAction(definition, missingSourceIds, controls)
      : definition.nextAction,
  };
}

function buildCoverageBlockedAction(
  definition: { nextAction: string },
  missingSourceIds: string[],
  controls: Array<{ label: string; configured: boolean }>,
) {
  const missingControls = controls.filter((control) => !control.configured).map((control) => control.label);
  const actionParts = [
    missingSourceIds.length ? `補來源 ${missingSourceIds.join(", ")}` : null,
    missingControls.length ? `補設定 ${missingControls.join("、")}` : null,
  ].filter((part): part is string => Boolean(part));
  return actionParts.length ? `${actionParts.join("；")}。${definition.nextAction}` : definition.nextAction;
}

function formatMoneyForEvidence(value: number) {
  return `NT$${new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(value)}`;
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
  complianceCoverageSummary: TaiwanLaborComplianceCoverageSummary = summarizeTaiwanLaborComplianceCoverage(
    buildTaiwanLaborComplianceCoverage(config, sourceFreshness),
  ),
): TaiwanLaborRuleCenterReadiness {
  const blockers = [
    !validation.passed ? "法規規則測試案例未全部通過" : null,
    complianceCoverageSummary.blockedCount > 0
      ? `台灣法遵覆蓋矩陣有 ${complianceCoverageSummary.blockedCount} 個阻擋項`
      : null,
    versionHistory.length === 0 ? "缺少 rule_versions 版本紀錄" : null,
  ].filter((item): item is string => Boolean(item));
  const warnings = [
    config.changeControl.reviewStatus !== "approved" ? "目前版本尚待法務或人資負責人審核" : null,
    !sourceFreshness.passed ? "官方來源超過檢查期限或有日期格式問題" : null,
    complianceCoverageSummary.needsReviewCount > 0
      ? `台灣法遵覆蓋矩陣有 ${complianceCoverageSummary.needsReviewCount} 項需複核`
      : null,
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
      complianceCoverageSummary.blockedCount > 0
        ? `補齊法遵覆蓋矩陣阻擋項：${complianceCoverageSummary.blockedItems.join("、")}。`
        : null,
      complianceCoverageSummary.needsReviewCount > 0
        ? `複核法遵覆蓋矩陣警示項：${complianceCoverageSummary.needsReviewItems.join("、")}。`
        : null,
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
