import { getDb } from "@/server/db/client";
import type { RoleKey } from "@/server/auth/rbac";

export type OperationalMaintenanceStatus = "ready" | "action_required" | "blocked";

export type OperationalMaintenanceSignal = {
  id: "cron_scope" | "report_exports" | "ai_result_retention" | "audit_evidence";
  title: string;
  status: OperationalMaintenanceStatus;
  metric: string;
  detail: string;
  nextStep: string;
  actionLabel: string;
  actionHref: string;
};

export type OperationalMaintenanceCounts = {
  queuedReportJobs: number;
  failedReportJobs: number;
  expiredReportArchives: number;
  expiredAiResults: number;
  activeAiResults: number;
  maintenanceAuditEvents: number;
};

export type OperationalMaintenanceReport = {
  status: OperationalMaintenanceStatus;
  readyForAutomatedMaintenance: boolean;
  generatedAt: Date;
  summary: string;
  routePath: "/api/reports/maintenance/run";
  databaseConfigured: boolean;
  production: boolean;
  cronSecretConfigured: boolean;
  tenantScopeConfigured: boolean;
  companyScopeConfigured: boolean;
  countStatus: "not_applicable" | "ready" | "failed";
  counts: OperationalMaintenanceCounts;
  signals: OperationalMaintenanceSignal[];
};

type SessionLike = {
  role: RoleKey;
  tenantId: string | null;
  companyId: string | null;
};

type OperationalMaintenanceOptions = {
  now?: Date;
  env?: Record<string, string | undefined>;
  loadCounts?: (
    session: SessionLike & { tenantId: string; companyId: string },
    now: Date,
  ) => Promise<OperationalMaintenanceCounts>;
};

const routePath = "/api/reports/maintenance/run" as const;
const aiResultTtlHours = 24;
const emptyCounts: OperationalMaintenanceCounts = {
  queuedReportJobs: 0,
  failedReportJobs: 0,
  expiredReportArchives: 0,
  expiredAiResults: 0,
  activeAiResults: 0,
  maintenanceAuditEvents: 0,
};

export async function getOperationalMaintenanceReport(
  session: SessionLike,
  options: OperationalMaintenanceOptions = {},
): Promise<OperationalMaintenanceReport> {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const production = env.HR_ONE_ENV === "production";
  const databaseConfigured = Boolean(env.DATABASE_URL?.trim());
  const cronSecretConfigured = Boolean(env.CRON_SECRET?.trim());
  const tenantScopeConfigured = Boolean(readCronTenantId(env));
  const companyScopeConfigured = Boolean(readCronCompanyId(env));

  let counts = emptyCounts;
  let countStatus: OperationalMaintenanceReport["countStatus"] = "not_applicable";

  if (databaseConfigured) {
    if (session.tenantId && session.companyId) {
      try {
        counts = await (options.loadCounts ?? loadDatabaseMaintenanceCounts)(
          { ...session, tenantId: session.tenantId, companyId: session.companyId },
          now,
        );
        countStatus = "ready";
      } catch {
        countStatus = "failed";
      }
    } else {
      countStatus = "failed";
    }
  }

  const signals = buildSignals({
    production,
    databaseConfigured,
    cronSecretConfigured,
    tenantScopeConfigured,
    companyScopeConfigured,
    countStatus,
    counts,
  });
  const status = summarizeMaintenanceStatus(signals.map((signal) => signal.status));

  return {
    status,
    readyForAutomatedMaintenance: status === "ready",
    generatedAt: now,
    summary: buildSummary(status, signals, databaseConfigured, countStatus),
    routePath,
    databaseConfigured,
    production,
    cronSecretConfigured,
    tenantScopeConfigured,
    companyScopeConfigured,
    countStatus,
    counts,
    signals,
  };
}

async function loadDatabaseMaintenanceCounts(
  session: SessionLike & { tenantId: string; companyId: string },
  now: Date,
): Promise<OperationalMaintenanceCounts> {
  const db = getDb();
  const [
    queuedReportJobs,
    failedReportJobs,
    expiredReportArchives,
    expiredAiResults,
    activeAiResults,
    maintenanceAuditEvents,
  ] = await Promise.all([
    db.reportJob.count({
      where: {
        tenantId: session.tenantId,
        companyId: session.companyId,
        status: "queued",
      },
    }),
    db.reportJob.count({
      where: {
        tenantId: session.tenantId,
        companyId: session.companyId,
        status: "failed",
      },
    }),
    db.reportExportArchive.count({
      where: {
        tenantId: session.tenantId,
        companyId: session.companyId,
        status: { not: "expired" },
        downloadExpiresAt: { lte: now },
      },
    }),
    db.aiCopilotResult.count({
      where: {
        tenantId: session.tenantId,
        companyId: session.companyId,
        expiresAt: { lte: now },
      },
    }),
    db.aiCopilotResult.count({
      where: {
        tenantId: session.tenantId,
        companyId: session.companyId,
        expiresAt: { gt: now },
      },
    }),
    db.auditLog.count({
      where: {
        tenantId: session.tenantId,
        companyId: session.companyId,
        entityType: {
          in: ["report_export_queue", "report_export_archive", "ai_copilot_result"],
        },
      },
    }),
  ]);

  return {
    queuedReportJobs,
    failedReportJobs,
    expiredReportArchives,
    expiredAiResults,
    activeAiResults,
    maintenanceAuditEvents,
  };
}

function buildSignals(input: {
  production: boolean;
  databaseConfigured: boolean;
  cronSecretConfigured: boolean;
  tenantScopeConfigured: boolean;
  companyScopeConfigured: boolean;
  countStatus: OperationalMaintenanceReport["countStatus"];
  counts: OperationalMaintenanceCounts;
}): OperationalMaintenanceSignal[] {
  const cronReady = input.cronSecretConfigured && input.tenantScopeConfigured && input.companyScopeConfigured;
  const databaseCountsReady = input.databaseConfigured && input.countStatus === "ready";
  const countsUnavailable = input.databaseConfigured && input.countStatus === "failed";
  const reportOpenCount = input.counts.queuedReportJobs + input.counts.failedReportJobs + input.counts.expiredReportArchives;
  const aiOpenCount = input.counts.expiredAiResults;
  const auditReady = databaseCountsReady && input.counts.maintenanceAuditEvents > 0;

  return [
    {
      id: "cron_scope",
      title: "排程授權與租戶範圍",
      status: cronReady ? "ready" : input.production ? "blocked" : "action_required",
      metric: `${[input.cronSecretConfigured, input.tenantScopeConfigured, input.companyScopeConfigured].filter(Boolean).length}/3`,
      detail: cronReady
        ? "Cron secret、tenant scope 與 company scope 都已設定；維護入口會限制在指定租戶公司。"
        : "正式維護需要 CRON_SECRET、HR_ONE_CRON_TENANT_ID 與 HR_ONE_CRON_COMPANY_ID，避免跨租戶清理。",
      nextStep: cronReady
        ? "維持 Vercel Cron 與維護 route 設定，定期檢查清理結果。"
        : "補齊 Cron secret 與租戶/公司 scope，重新跑 production env verification。",
      actionLabel: "檢查環境 Gate",
      actionHref: "/settings/production-database",
    },
    {
      id: "report_exports",
      title: "報表維護與封存清理",
      status: countsUnavailable ? "blocked" : !input.databaseConfigured ? "action_required" : reportOpenCount > 0 ? "action_required" : "ready",
      metric: input.databaseConfigured
        ? `${input.counts.queuedReportJobs} 佇列 / ${input.counts.failedReportJobs} 失敗 / ${input.counts.expiredReportArchives} 到期`
        : "Demo",
      detail: input.databaseConfigured
        ? "只統計 job、狀態、期限與 hash metadata；不讀取或輸出報表原始資料列。"
        : "目前沒有 DATABASE_URL，報表維護只能以 demo 狀態演練，不能作為正式客戶證據。",
      nextStep: countsUnavailable
        ? "修復資料庫連線或 tenant/company context 後再重新載入維護狀態。"
        : reportOpenCount > 0
          ? "從報表分析工作台執行維護，處理 queued/failed 匯出與到期封存。"
          : "維持報表維護排程，下載 manifest 前仍需權限與短效 token 檢查。",
      actionLabel: "開啟報表分析",
      actionHref: "/hr/reports#report-jobs",
    },
    {
      id: "ai_result_retention",
      title: "AI Copilot 暫存結果清理",
      status: countsUnavailable ? "blocked" : !input.databaseConfigured ? "action_required" : aiOpenCount > 0 ? "action_required" : "ready",
      metric: input.databaseConfigured
        ? `${input.counts.expiredAiResults} 待清 / ${input.counts.activeAiResults} 暫存`
        : "Demo",
      detail: `Copilot UI 結果只保留 ${aiResultTtlHours} 小時；清理 audit 只保存 result id、category、output hash 與期限。`,
      nextStep: countsUnavailable
        ? "先修復資料庫維護查詢，避免 AI 清理狀態失真。"
        : aiOpenCount > 0
          ? "執行維護 route 清掉過期 Copilot 結果，確認 audit 不含 AI 原文。"
          : "維持短期保留策略；不要把 AI 回答原文放進 log 或 audit metadata。",
      actionLabel: "開啟 AI Copilot",
      actionHref: "/hr/copilot",
    },
    {
      id: "audit_evidence",
      title: "維護 audit 證據",
      status: countsUnavailable ? "blocked" : auditReady ? "ready" : "action_required",
      metric: input.databaseConfigured ? `${input.counts.maintenanceAuditEvents} 筆` : "Demo",
      detail: "報表佇列、封存清理與 AI 暫存清理都應留下 hash-only audit evidence，不能保存個資、薪資或 AI 原文。",
      nextStep: auditReady
        ? "把維護 audit 納入試用證據包與正式上線 Gate。"
        : "先跑一次報表/AI 維護流程，確認 audit log 有 hash-only 維護事件。",
      actionLabel: "查看 audit log",
      actionHref: "/settings/audit",
    },
  ];
}

function buildSummary(
  status: OperationalMaintenanceStatus,
  signals: OperationalMaintenanceSignal[],
  databaseConfigured: boolean,
  countStatus: OperationalMaintenanceReport["countStatus"],
) {
  if (!databaseConfigured) {
    return "目前仍是 demo 維護狀態；正式販售前必須接上 PostgreSQL，才能追蹤報表封存、AI 暫存與 hash-only audit。";
  }
  if (countStatus === "failed") {
    return "維護狀態查詢失敗；正式上線前需修復資料庫連線或 tenant/company context，避免營運狀態失真。";
  }
  const blocked = signals.filter((signal) => signal.status === "blocked").length;
  const actionRequired = signals.filter((signal) => signal.status === "action_required").length;
  if (status === "ready") {
    return "正式營運維護已可追蹤：排程 scope、報表清理、AI 短期保留與 audit evidence 都有可查狀態。";
  }
  return `${blocked} 個維護阻擋、${actionRequired} 個維護項目需處理；清完後再把證據納入試用與販售 Gate。`;
}

function summarizeMaintenanceStatus(statuses: OperationalMaintenanceStatus[]): OperationalMaintenanceStatus {
  if (statuses.includes("blocked")) return "blocked";
  if (statuses.includes("action_required")) return "action_required";
  return "ready";
}

function readCronTenantId(env: Record<string, string | undefined>) {
  return env.HR_ONE_CRON_TENANT_ID?.trim() || env.HR_ONE_MAINTENANCE_TENANT_ID?.trim() || "";
}

function readCronCompanyId(env: Record<string, string | undefined>) {
  return env.HR_ONE_CRON_COMPANY_ID?.trim() || env.HR_ONE_MAINTENANCE_COMPANY_ID?.trim() || "";
}
