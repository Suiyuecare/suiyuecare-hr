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

export type SaleReadinessRoadmap = {
  readyForSale: boolean;
  currentStage: SaleReadinessRoadmapStage;
  stages: SaleReadinessRoadmapStage[];
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
        "先讓 Vercel、Supabase、PostgreSQL persistence、SSO、正式檔案儲存與備份還原一起過 Gate，避免拿 demo 狀態邀請客戶。",
      launchItems,
      pilotItems,
      launchIds: ["database", "tenant_seed", "security", "sso_identities", "file_storage", "operational_resilience"],
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

  return {
    readyForSale: input.launchReport.readyForSale && input.betaPilot.readyForPilot && input.trialWorkspace.readyForPilot,
    currentStage,
    stages,
    readyCount,
    actionRequiredCount,
    blockedCount,
    summary: `${readyCount}/${stages.length} 個販售階段已就緒；${blockedCount} 個階段阻擋，${actionRequiredCount} 個階段需處理。`,
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

function isDefined<T>(value: T | undefined | null): value is T {
  return value != null;
}
