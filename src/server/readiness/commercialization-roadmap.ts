import type { BetaPilotReadinessReport, BetaPilotReadinessStatus } from "@/server/readiness/beta-pilot";
import type { BetaPilotTrialWorkspace } from "@/server/readiness/beta-pilot-trial-run";
import type { LaunchReadinessItem, LaunchReadinessReport, LaunchReadinessStatus } from "@/server/readiness/launch";

type RoadmapStatus = LaunchReadinessStatus;

type RoadmapSource = {
  type: "launch" | "pilot" | "trial";
  id: string;
};

export type SaleReadinessRoadmapStage = {
  id: string;
  step: number;
  title: string;
  owner: "Owner" | "HR" | "HR + Engineering" | "Owner + HR" | "HR + Manager";
  status: RoadmapStatus;
  signal: string;
  kpiTarget: string;
  summary: string;
  nextStep: string;
  actionLabel: string;
  actionHref: string;
  sourceIds: RoadmapSource[];
};

export type SaleReadinessFoundationTask = {
  id: string;
  priority: number;
  title: string;
  owner: "Engineering" | "Owner" | "HR" | "HR + Engineering" | "Owner + HR" | "HR + Manager";
  status: RoadmapStatus;
  outcome: string;
  acceptanceEvidence: string;
  nextStep: string;
  actionLabel: string;
  actionHref: string;
  sourceIds: RoadmapSource[];
};

export type SaleReadinessBlockerSeverity = "hard_blocker" | "needs_work" | "cleared";

export type SaleReadinessBlocker = {
  id: string;
  rank: number;
  title: string;
  owner: "Engineering" | "Owner" | "HR" | "HR + Engineering" | "Owner + HR" | "HR + Manager";
  severity: SaleReadinessBlockerSeverity;
  status: RoadmapStatus;
  saleImpact: string;
  evidenceNeeded: string;
  nextStep: string;
  actionLabel: string;
  actionHref: string;
  sourceTaskId: SaleReadinessFoundationTask["id"];
};

export type SaleReadinessRoadmap = {
  readyForSale: boolean;
  currentStage: SaleReadinessRoadmapStage;
  currentFoundationTask: SaleReadinessFoundationTask;
  stages: SaleReadinessRoadmapStage[];
  foundationTasks: SaleReadinessFoundationTask[];
  blockerRadar: SaleReadinessBlocker[];
  blockedCount: number;
  actionRequiredCount: number;
  readyCount: number;
  summary: string;
};

type RoadmapInput = {
  launchReport: Pick<LaunchReadinessReport, "readyForSale" | "blockedCount" | "actionRequiredCount" | "items">;
  betaPilot: Pick<
    BetaPilotReadinessReport,
    "readyForPilot" | "blockedCount" | "actionRequiredCount" | "items" | "targetEmployeeRange"
  >;
  trialWorkspace: Pick<
    BetaPilotTrialWorkspace,
    "readyForPilot" | "readinessStatus" | "persistence" | "employeeCount" | "managerCount" | "openBlockedCount" | "openActionRequiredCount"
  >;
};

export function buildSaleReadinessRoadmap(input: RoadmapInput): SaleReadinessRoadmap {
  const launchItems = new Map(input.launchReport.items.map((item) => [item.id, item]));
  const pilotItems = new Map(input.betaPilot.items.map((item) => [item.id, item]));

  const stages: SaleReadinessRoadmapStage[] = [
    stage({
      id: "production_foundation",
      step: 1,
      title: "修好正式環境與租戶基礎",
      owner: "HR + Engineering",
      kpiTarget: "/api/health/ready = ok",
      signal: input.trialWorkspace.persistence.readyForLiveTrial
        ? "正式資料庫可試用"
        : input.trialWorkspace.persistence.mode === "production_missing_database"
          ? "production DB 未連通"
          : "仍在 demo / local 模式",
      summary:
        "先讓 Vercel、Supabase、PostgreSQL persistence、SSO、正式檔案儲存、備份還原與維護排程一起過 Gate，避免拿 demo 狀態邀請客戶。",
      launchItems,
      pilotItems,
      launchIds: ["database", "tenant_seed", "security", "sso_identities", "file_storage", "operational_resilience", "operational_maintenance"],
      extraStatus: input.trialWorkspace.persistence.readyForLiveTrial ? "ready" : "blocked",
      extraNextStep: input.trialWorkspace.persistence.readyForLiveTrial
        ? null
        : "把 Vercel production DATABASE_URL 改成 Supabase transaction pooler，重新部署後確認 /api/health/ready 通過。",
      fallbackAction: {
        label: "修復正式資料庫 Gate",
        href: "/settings/production-database",
      },
    }),
    stage({
      id: "finance_style_workflows",
      step: 2,
      title: "收斂 Finance-style 前後台體驗",
      owner: "HR + Manager",
      kpiTarget: "員工手機任務完成率 > 95%",
      signal: `${input.betaPilot.actionRequiredCount} 個試用體驗待處理`,
      summary:
        "把員工今日卡、三步請假、主管 Inbox、HR 月結與自建表單都做成任務式工作台，減少功能選單與深層導覽。",
      launchItems,
      pilotItems,
      launchIds: ["kpis", "notifications"],
      pilotIds: ["employee_frontstage", "attendance_leave_approval", "announcements", "hr_self_service"],
      fallbackAction: {
        label: "開啟員工前台",
        href: "/app",
      },
    }),
    stage({
      id: "real_pilot_data",
      step: 3,
      title: "匯入 20-50 人真實試用資料",
      owner: "Owner + HR",
      kpiTarget: "第一週教學 < 10 分鐘",
      signal: `${input.trialWorkspace.employeeCount} 位員工 / ${input.trialWorkspace.managerCount} 位主管`,
      summary:
        "用真實部門、主管線、登入身份、班表、假別餘額、薪資 profile 與付款 profile 跑兩週試用，而不是只看種子資料。",
      launchItems,
      pilotItems,
      pilotIds: ["cohort_size", "tenant_auth", "two_week_operating_loop", "sensitive_data_guardrails"],
      extraStatus: input.betaPilot.readyForPilot && input.trialWorkspace.readyForPilot ? "ready" : input.betaPilot.blockedCount > 0 ? "blocked" : "action_required",
      extraNextStep: input.trialWorkspace.readyForPilot
        ? null
        : `完成 ${input.betaPilot.targetEmployeeRange.min}-${input.betaPilot.targetEmployeeRange.max} 人資料、主管簽核線、正式登入與試用批次同步。`,
      fallbackAction: {
        label: "匯入試用員工",
        href: "/hr/employee-import",
      },
    }),
    stage({
      id: "payroll_compliance",
      step: 4,
      title: "完成薪資月結與台灣法遵閉環",
      owner: "HR",
      kpiTarget: "HR 月結時間降低 70%",
      signal: `${input.launchReport.blockedCount} 個正式上線 blocker`,
      summary:
        "薪資、出勤、請假、加班、投保、所得稅、工作規則、勞工名卡與法規規則都要可版本化、可追溯、可由 HR 調整。",
      launchItems,
      pilotItems,
      launchIds: ["law_rules", "calendar", "work_rules", "labor_roster", "payment_security", "audit"],
      pilotIds: ["payroll_dry_run", "payslip_access"],
      fallbackAction: {
        label: "檢查台灣法規規則",
        href: "/settings/law-rules",
      },
    }),
    stage({
      id: "commercial_handoff",
      step: 5,
      title: "整理可販售證據與商務交付",
      owner: "Owner",
      kpiTarget: "audit log 覆蓋率 100%",
      signal: input.launchReport.readyForSale ? "可進入販售" : "尚未可販售",
      summary:
        "把訂閱、合約、支援存取、個資治理、KPI、兩週試用證據包與未授權薪資存取測試整理成客戶可驗收的交付資料。",
      launchItems,
      pilotItems,
      launchIds: ["subscription", "support_access", "privacy", "kpis", "audit"],
      fallbackAction: {
        label: "開啟試用證據包",
        href: "/settings/pilot-evidence",
      },
    }),
  ];

  const readyCount = stages.filter((item) => item.status === "ready").length;
  const actionRequiredCount = stages.filter((item) => item.status === "action_required").length;
  const blockedCount = stages.filter((item) => item.status === "blocked").length;
  const currentStage = stages.find((item) => item.status !== "ready") ?? stages[stages.length - 1];
  const foundationTasks = buildFoundationTasks(input, { launchItems, pilotItems });
  const currentFoundationTask =
    foundationTasks.find((task) => task.status !== "ready") ?? foundationTasks[foundationTasks.length - 1];
  const blockerRadar = buildBlockerRadar(foundationTasks);

  return {
    readyForSale: input.launchReport.readyForSale && input.betaPilot.readyForPilot && input.trialWorkspace.readyForPilot,
    currentStage,
    currentFoundationTask,
    stages,
    foundationTasks,
    blockerRadar,
    readyCount,
    actionRequiredCount,
    blockedCount,
    summary: `${readyCount}/${stages.length} 個販售階段已就緒；${blockedCount} 個階段阻擋，${actionRequiredCount} 個階段需處理。`,
  };
}

function buildBlockerRadar(tasks: SaleReadinessFoundationTask[]): SaleReadinessBlocker[] {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const specs: Array<{
    sourceTaskId: SaleReadinessFoundationTask["id"];
    title: string;
    saleImpact: string;
    evidenceNeeded: string;
  }> = [
    {
      sourceTaskId: "production_database_pooler",
      title: "正式站資料庫與 live readiness",
      saleImpact: "未通過時不可邀請真實員工，也不可把 demo fallback 當成客戶試用環境。",
      evidenceNeeded: "Live /api/health/ready OK、production database gate ready、Supabase private schema/RLS verification、db:verify:production、redacted env handoff。",
    },
    {
      sourceTaskId: "identity_rbac_sso_boundary",
      title: "正式登入、RBAC 與薪資防漏",
      saleImpact: "未通過時無法證明 Owner、HR、主管、員工與支援存取的資料邊界，薪資資料風險過高。",
      evidenceNeeded: "SSO metadata、privileged subject hash bindings、tenant API boundary guardrail、preflight access review、unauthorized payroll access KPI = 0。",
    },
    {
      sourceTaskId: "real_pilot_import_pipeline",
      title: "20-50 人真實試用資料與批次",
      saleImpact: "未通過時只能展示種子資料，無法證明真實部門、主管線、班表、假勤、薪資 profile 可導入。",
      evidenceNeeded: "CSV preflight hashes、customer import dry-run、trial run batch、Day 0 checkpoint。",
    },
    {
      sourceTaskId: "finance_style_core_workflows",
      title: "Finance-style 日常任務體驗",
      saleImpact: "未通過時即使功能完整，員工與主管仍可能覺得難用，KPI 無法支撐販售。",
      evidenceNeeded: "員工請假 < 60 秒、主管簽核 < 15 秒、手機任務完成率 > 95%、通知送達證據。",
    },
    {
      sourceTaskId: "taiwan_compliance_control_plane",
      title: "台灣勞基法與規則版本控制",
      saleImpact: "未通過時 HR 無法自行調整法規來源與規則版本，也無法向客戶或勞檢說明計算依據。",
      evidenceNeeded: "law rule coverage、official source freshness、rule validation fixtures、work rules approval、labor roster verification。",
    },
    {
      sourceTaskId: "payroll_close_security",
      title: "薪資月結、付款安全與薪資單權限",
      saleImpact: "未通過時不可承諾薪資月結，因為付款檔、薪資單、鎖薪調整與未授權查看仍可能出問題。",
      evidenceNeeded: "payroll dry run、pending approvals = 0、payment security gate、payslip self-only access test、audit package。",
    },
    {
      sourceTaskId: "commercial_evidence_package",
      title: "商務交付與可販售證據包",
      saleImpact: "未通過時銷售只能靠口頭承諾，無法交付訂閱、KPI、資安、audit、試用與 Day 14 結案證據。",
      evidenceNeeded: "subscription readiness、pilot evidence package、invitation release、Day 14 completion review、privacy scan hashes。",
    },
    {
      sourceTaskId: "operational_maintenance_automation",
      title: "正式維護、報表封存與 AI 暫存清理",
      saleImpact: "未通過時正式試用期間的報表佇列、到期封存、AI 暫存結果與維護 audit 無法被 Owner/HR 追蹤。",
      evidenceNeeded: "Cron secret/scope、report queue/archive cleanup counts、AI temporary result cleanup、hash-only maintenance audit。",
    },
  ];

  return specs
    .map((spec) => {
      const task = taskById.get(spec.sourceTaskId);
      if (!task) return null;
      return {
        id: spec.sourceTaskId,
        rank: task.priority,
        title: spec.title,
        owner: task.owner,
        severity: blockerSeverity(task.status),
        status: task.status,
        saleImpact: spec.saleImpact,
        evidenceNeeded: spec.evidenceNeeded,
        nextStep: task.nextStep,
        actionLabel: task.actionLabel,
        actionHref: task.actionHref,
        sourceTaskId: task.id,
      };
    })
    .filter(isDefined)
    .sort((left, right) => severityWeight(left.severity) - severityWeight(right.severity) || left.rank - right.rank);
}

function buildFoundationTasks(
  input: RoadmapInput,
  sources: {
    launchItems: Map<string, LaunchReadinessItem>;
    pilotItems: Map<string, { id: string; status: BetaPilotReadinessStatus; nextStep: string; actionLabel: string; actionHref: string }>;
  },
): SaleReadinessFoundationTask[] {
  return [
    foundationTask({
      id: "production_database_pooler",
      priority: 1,
      title: "正式資料庫與租戶持久化",
      owner: "Engineering",
      outcome: "正式站不再依賴 demo fallback，Vercel runtime 能連上 Supabase PostgreSQL，並可驗證正式 customer tenant 與維護排程 scope。",
      acceptanceEvidence: "/api/health/ready = ok、production database gate ready、Supabase private schema/RLS/browser-role verifier、db:verify:production report、redacted env handoff、maintenance scope ready。",
      launchItems: sources.launchItems,
      pilotItems: sources.pilotItems,
      launchIds: ["database", "tenant_seed", "operational_resilience", "operational_maintenance"],
      extraStatus: input.trialWorkspace.persistence.readyForLiveTrial ? "ready" : "blocked",
      extraNextStep: input.trialWorkspace.persistence.readyForLiveTrial
        ? null
        : "把 Vercel production DATABASE_URL 換成 Supabase transaction pooler，redeploy 後跑 health ready、production gate 與 tenant verification。",
      fallbackAction: {
        label: "修正式資料庫 Gate",
        href: "/settings/production-database",
      },
    }),
    foundationTask({
      id: "identity_rbac_sso_boundary",
      priority: 2,
      title: "正式登入、RBAC 與權限防漏",
      owner: "Owner + HR",
      outcome: "Owner、HR、主管、員工都用正式身份登入，薪資、個資、支援存取與跨租戶資料邊界可被測試證明。",
      acceptanceEvidence: "SSO metadata、privileged issuer/subject bindings、tenant API boundary guardrail、preflight access review、unauthorized payroll access KPI、support access review。",
      launchItems: sources.launchItems,
      pilotItems: sources.pilotItems,
      launchIds: ["security", "sso_identities", "support_access", "privacy"],
      pilotIds: ["tenant_auth", "sensitive_data_guardrails"],
      fallbackAction: {
        label: "檢查權限中樞",
        href: "/settings/access",
      },
    }),
    foundationTask({
      id: "finance_style_core_workflows",
      priority: 3,
      title: "Finance-style 核心日常流程",
      owner: "HR + Manager",
      outcome: "員工手機、主管 Inbox、HR 月結與自建表單都以任務卡和三步流程完成，不再像功能選單。",
      acceptanceEvidence: "employee mobile smoke、manager 15 秒簽核、leave under 60 秒、HR self-service form KPI、notification delivery evidence。",
      launchItems: sources.launchItems,
      pilotItems: sources.pilotItems,
      launchIds: ["kpis", "notifications"],
      pilotIds: ["employee_frontstage", "attendance_leave_approval", "announcements", "hr_self_service"],
      fallbackAction: {
        label: "開啟員工前台",
        href: "/app",
      },
    }),
    foundationTask({
      id: "real_pilot_import_pipeline",
      priority: 4,
      title: "20-50 人真實資料匯入與試用批次",
      owner: "Owner + HR",
      outcome: "能用客戶提供的員工、身份、主管線、班表、假別、薪資與付款資料建立兩週試用，不靠假資料展示。",
      acceptanceEvidence: "CSV preflight hashes、customer import dry-run、pilot invite readiness、trial run batch、Day 0 checkpoint。",
      launchItems: sources.launchItems,
      pilotItems: sources.pilotItems,
      launchIds: ["tenant_seed"],
      pilotIds: ["cohort_size", "tenant_auth", "two_week_operating_loop"],
      extraStatus: input.betaPilot.readyForPilot && input.trialWorkspace.readyForPilot
        ? "ready"
        : input.betaPilot.blockedCount > 0 || input.trialWorkspace.openBlockedCount > 0
          ? "blocked"
          : "action_required",
      extraNextStep: input.trialWorkspace.readyForPilot
        ? null
        : `完成 ${input.betaPilot.targetEmployeeRange.min}-${input.betaPilot.targetEmployeeRange.max} 人匯入、主管線、正式身份、14 天班表與試用批次同步。`,
      fallbackAction: {
        label: "匯入試用資料",
        href: "/settings/pilot-import-preflight",
      },
    }),
    foundationTask({
      id: "taiwan_compliance_control_plane",
      priority: 5,
      title: "台灣法遵控制台與版本化規則",
      owner: "HR",
      outcome: "HR 可以調整法規來源、規則版本、工作規則、行事曆、勞工名卡、投保與離職證據，且不需要工程改程式。",
      acceptanceEvidence: "law rule coverage 11/11、source freshness、rule validation fixtures、work rules approval、labor roster verification、calendar annual review。",
      launchItems: sources.launchItems,
      pilotItems: sources.pilotItems,
      launchIds: ["law_rules", "calendar", "work_rules", "labor_roster", "training", "offboarding", "incidents"],
      fallbackAction: {
        label: "檢查台灣法規規則",
        href: "/settings/law-rules",
      },
    }),
    foundationTask({
      id: "payroll_close_security",
      priority: 6,
      title: "薪資月結、付款安全與薪資單權限",
      owner: "HR",
      outcome: "HR 能安全建立月結、匯入出勤/假勤/加班、試算、審核、鎖定與釋出薪資單，且薪資付款資料不外洩。",
      acceptanceEvidence: "payroll dry run、pending approval = 0、exception review、payslip self-only access test、payment security gate、audit package。",
      launchItems: sources.launchItems,
      pilotItems: sources.pilotItems,
      launchIds: ["payment_security", "audit", "privacy"],
      pilotIds: ["payroll_dry_run", "payslip_access", "sensitive_data_guardrails"],
      fallbackAction: {
        label: "開啟 HR 月結",
        href: "/hr",
      },
    }),
    foundationTask({
      id: "commercial_evidence_package",
      priority: 7,
      title: "可販售證據包與交付節奏",
      owner: "Owner",
      outcome: "銷售前能拿出訂閱、合約、KPI、資安、audit、試用證據、Go/No-Go 與 Day 14 handoff，不靠口頭保證。",
      acceptanceEvidence: "subscription readiness、KPI dashboard、pilot evidence package、invitation release、Day 14 completion review、privacy scan hashes。",
      launchItems: sources.launchItems,
      pilotItems: sources.pilotItems,
      launchIds: ["subscription", "kpis", "audit", "support_access", "privacy"],
      fallbackAction: {
        label: "整理試用證據包",
        href: "/settings/pilot-evidence",
      },
    }),
    foundationTask({
      id: "operational_maintenance_automation",
      priority: 8,
      title: "正式維護與清理自動化",
      owner: "HR + Engineering",
      outcome: "Owner/HR 能在 readiness 看到 Cron scope、報表佇列/封存、AI 暫存清理與 hash-only 維護 audit，而不是靠工程師查 log。",
      acceptanceEvidence: "maintenance readiness ready、Cron tenant/company scope、report cleanup aggregate counts、AI cleanup aggregate counts、hash-only audit evidence。",
      launchItems: sources.launchItems,
      pilotItems: sources.pilotItems,
      launchIds: ["operational_maintenance"],
      fallbackAction: {
        label: "查看維護看板",
        href: "/settings/readiness#operational-maintenance",
      },
    }),
  ];
}

function foundationTask(input: {
  id: string;
  priority: number;
  title: string;
  owner: SaleReadinessFoundationTask["owner"];
  outcome: string;
  acceptanceEvidence: string;
  launchItems: Map<string, LaunchReadinessItem>;
  pilotItems: Map<string, { id: string; status: BetaPilotReadinessStatus; nextStep: string; actionLabel: string; actionHref: string }>;
  launchIds?: string[];
  pilotIds?: string[];
  extraStatus?: RoadmapStatus;
  extraNextStep?: string | null;
  fallbackAction: {
    label: string;
    href: string;
  };
}): SaleReadinessFoundationTask {
  const launchIds = input.launchIds ?? [];
  const pilotIds = input.pilotIds ?? [];
  const launchMatched = launchIds.map((id) => input.launchItems.get(id)).filter(isDefined);
  const pilotMatched = pilotIds.map((id) => input.pilotItems.get(id)).filter(isDefined);
  const statuses = [
    ...launchMatched.map((item) => item.status),
    ...pilotMatched.map((item) => item.status),
    input.extraStatus,
  ].filter(Boolean) as RoadmapStatus[];
  const firstOpenItem =
    launchMatched.find((item) => item.status !== "ready") ??
    pilotMatched.find((item) => item.status !== "ready") ??
    null;

  return {
    id: input.id,
    priority: input.priority,
    title: input.title,
    owner: input.owner,
    status: worstStatus(statuses),
    outcome: input.outcome,
    acceptanceEvidence: input.acceptanceEvidence,
    nextStep: input.extraStatus && input.extraStatus !== "ready" && input.extraNextStep
      ? input.extraNextStep
      : firstOpenItem?.nextStep ?? "維持目前 Gate 與證據；此基礎工程可進入試用或販售驗證。",
    actionLabel: firstOpenItem?.actionLabel ?? input.fallbackAction.label,
    actionHref: firstOpenItem?.actionHref ?? input.fallbackAction.href,
    sourceIds: [
      ...launchIds.map((id) => ({ type: "launch" as const, id })),
      ...pilotIds.map((id) => ({ type: "pilot" as const, id })),
      ...(input.extraStatus ? [{ type: "trial" as const, id: input.id }] : []),
    ],
  };
}

function stage(input: {
  id: string;
  step: number;
  title: SaleReadinessRoadmapStage["title"];
  owner: SaleReadinessRoadmapStage["owner"];
  signal: string;
  kpiTarget: string;
  summary: string;
  launchItems: Map<string, LaunchReadinessItem>;
  pilotItems: Map<string, { id: string; status: BetaPilotReadinessStatus; nextStep: string; actionLabel: string; actionHref: string }>;
  launchIds?: string[];
  pilotIds?: string[];
  extraStatus?: RoadmapStatus;
  extraNextStep?: string | null;
  fallbackAction: {
    label: string;
    href: string;
  };
}): SaleReadinessRoadmapStage {
  const launchIds = input.launchIds ?? [];
  const pilotIds = input.pilotIds ?? [];
  const launchMatched = launchIds.map((id) => input.launchItems.get(id)).filter(isDefined);
  const pilotMatched = pilotIds.map((id) => input.pilotItems.get(id)).filter(isDefined);
  const statuses = [
    ...launchMatched.map((item) => item.status),
    ...pilotMatched.map((item) => item.status),
    input.extraStatus,
  ].filter(Boolean) as RoadmapStatus[];
  const status = worstStatus(statuses);
  const firstOpenItem =
    launchMatched.find((item) => item.status !== "ready") ??
    pilotMatched.find((item) => item.status !== "ready") ??
    null;
  const sourceIds: RoadmapSource[] = [
    ...launchIds.map((id) => ({ type: "launch" as const, id })),
    ...pilotIds.map((id) => ({ type: "pilot" as const, id })),
  ];

  if (input.extraStatus) {
    sourceIds.push({ type: "trial", id: input.id });
  }

  return {
    id: input.id,
    step: input.step,
    title: input.title,
    owner: input.owner,
    status,
    signal: input.signal,
    kpiTarget: input.kpiTarget,
    summary: input.summary,
    nextStep: input.extraStatus && input.extraStatus !== "ready" && input.extraNextStep
      ? input.extraNextStep
      : firstOpenItem?.nextStep ?? "維持目前證據與 Gate，下一階段可進入試用或正式販售檢查。",
    actionLabel: firstOpenItem?.actionLabel ?? input.fallbackAction.label,
    actionHref: firstOpenItem?.actionHref ?? input.fallbackAction.href,
    sourceIds,
  };
}

function worstStatus(statuses: RoadmapStatus[]): RoadmapStatus {
  if (statuses.some((status) => status === "blocked")) return "blocked";
  if (statuses.some((status) => status === "action_required")) return "action_required";
  return "ready";
}

function blockerSeverity(status: RoadmapStatus): SaleReadinessBlockerSeverity {
  if (status === "blocked") return "hard_blocker";
  if (status === "action_required") return "needs_work";
  return "cleared";
}

function severityWeight(severity: SaleReadinessBlockerSeverity) {
  if (severity === "hard_blocker") return 0;
  if (severity === "needs_work") return 1;
  return 2;
}

function isDefined<T>(value: T | undefined | null): value is T {
  return value != null;
}
