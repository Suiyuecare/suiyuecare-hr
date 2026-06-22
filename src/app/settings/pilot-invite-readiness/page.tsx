import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/session";
import { hasPermission } from "@/server/auth/rbac";
import {
  buildPilotInviteReadinessReport,
  readPilotInviteReadinessSnapshotFromDatabase,
} from "@/server/readiness/pilot-invite-readiness";
import {
  getPilotOperationsReport,
  type PilotOperationsPhase,
  type PilotOperationsPhaseStatus,
  type PilotOperationsStatus,
} from "@/server/readiness/pilot-operations";
import {
  getProductionDatabaseRemediationReport,
  type ProductionDatabaseRemediationReport,
} from "@/server/readiness/production-database-remediation";
import type { BetaPilotEvidenceType } from "@/server/readiness/beta-pilot-checkpoints";

type SearchParams = Promise<{
  tenantSlug?: string;
  companyId?: string;
  error?: string;
  success?: string;
}>;

export default async function PilotInviteReadinessPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [params, session] = await Promise.all([searchParams, getDemoSession()]);
  if (!hasPermission(session.role, "settings:read")) {
    return (
      <main className="page">
        <EmptyState
          title="需要管理權限"
          body="請切換為老闆或人資管理員角色，再檢查試用邀請就緒狀態。"
        />
      </main>
    );
  }

  const canManagePilot = hasPermission(session.role, "pilot:manage");
  const tenantSlug = normalizeTenantSlug(params.tenantSlug);
  const companyId = normalizeOptionalParam(params.companyId);
  const [snapshot, operationsReport, productionDatabaseReport] = await Promise.all([
    readPilotInviteReadinessSnapshotFromDatabase({
      tenantSlug,
      companyId,
    }),
    getPilotOperationsReport(session),
    getProductionDatabaseRemediationReport({
      appUrl: "https://hr.suiyuecare.com",
      expectedHost: "hr.suiyuecare.com",
    }),
  ]);
  const report = buildPilotInviteReadinessReport({ snapshot });
  const preflightPhase = operationsReport.phases.find((phase) => phase.checkpointId === "preflight");
  const productionDatabaseGateReady = productionDatabaseReport.status === "ready";
  const inviteGate = buildInviteGate({ report, preflightPhase, productionDatabaseGateReady });
  const inviteNextActions = buildInviteNextActions(
    report.nextActions,
    inviteGate.preflightAccessReviewReady,
    productionDatabaseReport,
  );
  const preparationAreas = [
    buildProductionDatabasePreparationArea(productionDatabaseReport),
    ...report.preparationAreas,
    buildPreflightPreparationArea(inviteGate.preflightAccessReviewReady),
  ];
  const accessReviewReturnTo = buildInviteReturnPath({
    tenantSlug,
    companyId,
    success: "access-review",
    hash: "preflight-access-review",
  });

  return (
    <main className="page">
      <section className="page-header">
        <h1>試用邀請就緒</h1>
        <p>在發出第一封邀請前，確認 20-50 人都有登入、角色、主管線、班表、假別餘額與薪資單自助查看規則。</p>
      </section>

      {params.error ? (
        <div className="panel danger-panel">
          <strong>權限防漏檢查未通過</strong>
          <p>{params.error}</p>
        </div>
      ) : null}
      {params.success === "access-review" ? (
        <div className="panel success-panel">
          <strong>權限防漏已寫入 preflight 證據</strong>
          <p>系統只保存檢查結果與證據 hash，不保存薪資金額、銀行帳號、身分證字號、健康資料或私人備註。</p>
        </div>
      ) : null}

      <section className="grid">
        <section className={`panel span-12 risk-box ${inviteGate.status === "ready" ? "success-box" : inviteGate.status === "blocked" ? "danger-box" : ""}`}>
          <div className="section-heading">
            <div>
              <h2>{inviteGate.title}</h2>
              <p className="muted">
                目前檢查租戶：{tenantSlug}
                {companyId ? ` · 公司 ${companyId}` : ""}。報表只保留彙總數字與狀態，不輸出個資、薪資、銀行帳號、SSO subject 或私人備註。
              </p>
              <p className="muted">
                {inviteGate.detail} 正式資料庫 Gate：
                {productionDatabaseGateReady
                  ? "已驗證"
                  : `阻擋：${productionDatabaseRootCauseLabel(productionDatabaseReport.rootCause)}`}
                。
                Preflight 權限防漏：{inviteGate.preflightAccessReviewReady ? "已驗證" : "未完成"}。
              </p>
            </div>
            <span className={`badge ${inviteGate.blockers ? "danger" : inviteGate.warnings ? "warning" : ""}`}>
              {inviteGate.blockers} 阻擋 / {inviteGate.warnings} 提醒
            </span>
          </div>
        </section>

        <div className="panel span-3 metric">
          <span className="muted">試用人數</span>
          <strong>{report.activeEmployeeCount}</strong>
          <span className={`badge ${report.activeEmployeeCount >= 20 && report.activeEmployeeCount <= 50 ? "" : "danger"}`}>
            目標 20-50
          </span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">主管簽核線</span>
          <strong>{report.managerWithDirectReportsCount}</strong>
          <span className={`badge ${report.managerWithDirectReportsCount ? "" : "danger"}`}>至少 1 位</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">14 天班表</span>
          <strong>{report.scheduledEmployeeCount}</strong>
          <span className={`badge ${report.scheduledEmployeeCount === report.activeEmployeeCount && report.activeEmployeeCount > 0 ? "" : "warning"}`}>
            覆蓋員工
          </span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">假別餘額</span>
          <strong>{report.leaveBalanceEmployeeCount}</strong>
          <span className={`badge ${report.leaveBalanceEmployeeCount === report.activeEmployeeCount && report.activeEmployeeCount > 0 ? "" : "warning"}`}>
            可請假
          </span>
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>20-50 人資料準備看板</h2>
              <p className="muted">只用彙總缺口協助 HR 開跑，不顯示姓名、Email、薪資、銀行帳號、身分證或私人備註。</p>
            </div>
            <span className={`badge ${preparationAreas.some((area) => area.status === "blocked") ? "danger" : preparationAreas.some((area) => area.status === "warning") ? "warning" : ""}`}>
              {preparationAreas.filter((area) => area.status !== "ready").length} 項待處理
            </span>
          </div>
          <div className="invite-prep-grid" aria-label="20-50 人資料準備看板">
            {preparationAreas.map((area) => (
              <article className={`invite-prep-card ${area.status}`} key={area.id}>
                <div>
                  <span className="muted">{area.targetLabel}</span>
                  <h3>{area.title}</h3>
                  <strong>{area.readyCount}</strong>
                  <p>{area.detail}</p>
                </div>
                <div className="invite-prep-card-footer">
                  <span className={`badge ${area.status === "blocked" ? "danger" : area.status === "warning" ? "warning" : ""}`}>
                    缺口 {area.gapCount}
                  </span>
                  <Link className="button" href={area.href}>
                    {area.status === "ready" ? "查看" : "處理"}
                  </Link>
                </div>
                <small>{area.nextStep}</small>
              </article>
            ))}
          </div>
        </section>

        <section className={`panel span-12 risk-box ${operationsStatusBoxClass(operationsReport.status)}`}>
          <div className="section-heading">
            <div>
              <h2>邀請前核心流程 Gate</h2>
              <p className="muted">
                發邀請前先確認 Day 0 到 Day 14 的證據路徑：打卡、請假、主管簽核、公告、月結預演、薪資單查看與權限防漏都不能只靠口頭確認。
              </p>
            </div>
            <div className="inline-actions">
              <span className={`badge ${operationsReport.blockedPhaseCount ? "danger" : operationsReport.inProgressPhaseCount ? "warning" : ""}`}>
                {operationsReport.completedPhaseCount}/5 checkpoint
              </span>
              <Link className="button" href="/settings/pilot-operations">
                開啟每日戰情
              </Link>
            </div>
          </div>
          <ol className="close-steps pilot-invite-flow">
            {operationsReport.phases.map((phase) => (
              <li key={phase.checkpointId} className={`close-step ${phase.status === "verified" ? "done" : phase.status}`}>
                <strong>{phase.timing}</strong>
                <span>{phase.title}</span>
                <span>
                  必要證據：{phase.requiredEvidenceTypes.map(evidenceTypeLabel).join("、")}
                </span>
                <span>
                  缺少：{phase.missingEvidenceTypes.length ? phase.missingEvidenceTypes.map(evidenceTypeLabel).join("、") : "無"}
                </span>
                <span className={`badge ${phase.status === "blocked" ? "danger" : phase.status === "in_progress" ? "warning" : ""}`}>
                  {phaseStatusLabel(phase.status)}
                </span>
              </li>
            ))}
          </ol>
          <div className="task-list">
            <div className="task">
              <span>
                <strong>今日先處理：{operationsReport.todayGate.timing} · {operationsReport.todayGate.title}</strong>
                <small>{operationsReport.todayGate.nextStep}</small>
                <small>證據只存 hash-only 代碼；不要貼姓名、Email、薪資、身分證、銀行帳號、健康資料或私人 HR 備註。</small>
              </span>
              <Link className="button primary" href={operationsReport.todayGate.actionHref}>
                {operationsReport.todayGate.actionLabel}
              </Link>
            </div>
            <div className="task" id="preflight-access-review">
              <span>
                <strong>發邀請前權限防漏</strong>
                <small>
                  自動驗證員工與主管不能讀 payroll dashboard 或他人薪資單；檢查不讀取薪資金額、銀行帳號、身分證或健康資料。
                </small>
                <small>
                  目前 preflight：
                  {preflightPhase ? `${phaseStatusLabel(preflightPhase.status)} · 缺少 ${preflightPhase.missingEvidenceTypes.length ? preflightPhase.missingEvidenceTypes.map(evidenceTypeLabel).join("、") : "無"}` : "尚未建立"}
                </small>
              </span>
              {canManagePilot ? (
                <form action="/api/settings/beta-pilot-access-review" method="post" className="compact-form">
                  <input type="hidden" name="returnTo" value={accessReviewReturnTo} />
                  <button className="button primary" type="submit">
                    跑權限防漏
                  </button>
                </form>
              ) : (
                <span className="badge warning">需要 owner/HR</span>
              )}
            </div>
          </div>
        </section>

        <section className="panel span-8">
          <div className="section-heading">
            <div>
              <h2>邀請前檢查</h2>
              <p className="muted">所有 block 都要清掉；warning 可先安排負責人，但不能在沒風險說明的情況下發邀請。</p>
            </div>
            <Link className="button" href="/settings/readiness">
              回上線準備度
            </Link>
          </div>
          <ul className="task-list">
            {report.checks.map((check) => (
              <li className="task" key={check.name}>
                <span>
                  <strong>{checkLabel(check.name)}</strong>
                  <small>{checkDetail(check.name, check.status, check.detail, report)}</small>
                </span>
                <span className="inline-actions">
                  <span className={`badge ${badgeClass(check.status)}`}>{statusLabel(check.status)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-4">
          <h2>檢查其他租戶</h2>
          <form className="mini-form" action="/settings/pilot-invite-readiness">
            <label>
              租戶代碼
              <input name="tenantSlug" defaultValue={tenantSlug} placeholder="customer-slug" />
            </label>
            <label>
              公司 ID
              <input name="companyId" defaultValue={companyId ?? ""} placeholder="選填；不填使用第一家公司" />
            </label>
            <button className="button primary" type="submit">
              重新檢查
            </button>
          </form>
          <div className="panel-subtle">
            <strong>CLI 檢查指令</strong>
            <span className="muted">
              pnpm pilot:invite-readiness -- --tenant-slug={tenantSlug} --output=/tmp/hr-one-pilot-invite-readiness.md
            </span>
          </div>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>下一步</h2>
              <p className="muted">這些項目清完後，再跑 Go/No-Go，把匯入、邀請、證據掃描與正式環境準備度串在一起。</p>
            </div>
            <Link className="button primary" href={`/settings/pilot-invite-readiness?tenantSlug=${encodeURIComponent(tenantSlug)}`}>
              更新狀態
            </Link>
          </div>
          <ul className="task-list">
            {inviteNextActions.length ? (
              inviteNextActions.map((action) => (
                <li className="task" key={action}>
                  <span>{nextActionLabel(action)}</span>
                  <span className="badge warning">待辦</span>
                </li>
              ))
            ) : (
              <li className="task">
                <span>可以進入 Go/No-Go 快照，並由 HR 確認正式 CLI 報告與發邀請時間。</span>
                <Link className="button primary" href={`/settings/pilot-go-no-go?tenantSlug=${encodeURIComponent(tenantSlug)}`}>
                  開啟 Go/No-Go
                </Link>
              </li>
            )}
          </ul>
        </section>
      </section>
    </main>
  );
}

function normalizeTenantSlug(value: string | undefined) {
  const normalized =
    value?.trim() ||
    process.env.HR_ONE_PILOT_TENANT_SLUG?.trim() ||
    process.env.HR_ONE_TENANT_SLUG?.trim() ||
    "suiyuecare-pilot";
  return normalized || "suiyuecare-pilot";
}

function normalizeOptionalParam(value: string | undefined) {
  const normalized = value?.trim();
  return normalized || null;
}

function buildInviteReturnPath(input: {
  tenantSlug: string;
  companyId: string | null;
  success: string;
  hash?: string;
}) {
  const params = new URLSearchParams({
    tenantSlug: input.tenantSlug,
    success: input.success,
  });
  if (input.companyId) params.set("companyId", input.companyId);
  return `/settings/pilot-invite-readiness?${params.toString()}${input.hash ? `#${input.hash}` : ""}`;
}

type InviteGateStatus = "ready" | "action_required" | "blocked";

const preflightAccessReviewAction =
  "Run the preflight access review before sending employee invitations.";

const productionDatabaseGateAction =
  "Run the production database gate and full Go/No-Go before sending employee invitations.";

function buildInviteGate(input: {
  report: ReturnType<typeof buildPilotInviteReadinessReport>;
  preflightPhase: PilotOperationsPhase | undefined;
  productionDatabaseGateReady: boolean;
}) {
  const preflightAccessReviewReady = isPreflightAccessReviewReady(input.preflightPhase);
  const blockers =
    input.report.blockers +
    (input.productionDatabaseGateReady ? 0 : 1) +
    (preflightAccessReviewReady ? 0 : 1);
  const warnings = input.report.warnings;
  const status: InviteGateStatus = blockers > 0 ? "blocked" : warnings > 0 ? "action_required" : "ready";

  return {
    status,
    title: inviteGateTitle(status),
    detail: inviteGateDetail(input.report, preflightAccessReviewReady, input.productionDatabaseGateReady),
    blockers,
    warnings,
    preflightAccessReviewReady,
  };
}

function isPreflightAccessReviewReady(preflightPhase: PilotOperationsPhase | undefined) {
  return Boolean(
    preflightPhase?.status === "verified" &&
      preflightPhase.recordedEvidenceTypes.includes("access_review") &&
      !preflightPhase.missingEvidenceTypes.includes("access_review"),
  );
}

function inviteGateTitle(status: InviteGateStatus) {
  if (status === "ready") return "可以準備發出試用邀請";
  if (status === "action_required") return "可排程邀請，但要先處理提醒";
  return "尚未可以邀請員工";
}

function inviteGateDetail(
  report: ReturnType<typeof buildPilotInviteReadinessReport>,
  preflightAccessReviewReady: boolean,
  productionDatabaseGateReady: boolean,
) {
  if (!productionDatabaseGateReady) {
    return "正式資料庫 Gate 與 Go/No-Go CLI 報告尚未附上；即使名單看似完成，仍不能發出真實員工邀請。";
  }
  if (report.blockers > 0 && !preflightAccessReviewReady) {
    return "名單、登入、角色、主管線、班表或薪資單可見性仍有 blocker，且發邀請前權限防漏尚未完成。";
  }
  if (!preflightAccessReviewReady) {
    return "名單與帳號之外，仍需先完成 preflight 權限防漏，確認薪資 dashboard 與薪資單權限邊界。";
  }
  if (report.blockers > 0) {
    return "preflight 權限防漏已通過，但仍需清掉名單、登入、角色、主管線、班表或薪資單可見性 blocker。";
  }
  if (report.warnings > 0) {
    return "邀請前硬性檢查已通過；warning 需指派負責人與風險說明後再排程。";
  }
  return "名單、登入、角色、主管線、班表、假勤餘額、薪資單可見性與權限防漏都已通過。";
}

function buildInviteNextActions(
  actions: string[],
  preflightAccessReviewReady: boolean,
  productionDatabaseReport: ProductionDatabaseRemediationReport,
) {
  const productionDatabaseGateReady = productionDatabaseReport.status === "ready";
  const productionDatabaseNextAction =
    productionDatabaseReport.launchChecklist.find((item) => item.status !== "done")?.title ?? null;
  const gateActions = [
    ...(productionDatabaseGateReady
      ? []
      : [productionDatabaseGateAction, ...(productionDatabaseNextAction ? [productionDatabaseNextAction] : [])]),
    ...(preflightAccessReviewReady ? [] : [preflightAccessReviewAction]),
  ];
  const nextActions = [...gateActions, ...actions];
  return [...new Set(nextActions)];
}

function buildProductionDatabasePreparationArea(productionDatabaseReport: ProductionDatabaseRemediationReport) {
  const productionDatabaseGateReady = productionDatabaseReport.status === "ready";
  const nextChecklistItem = productionDatabaseReport.launchChecklist.find((item) => item.status !== "done");
  return {
    id: "production_database_gate",
    title: "正式資料庫 Gate",
    status: productionDatabaseGateReady ? "ready" : "blocked",
    readyCount: productionDatabaseGateReady ? 1 : 0,
    targetLabel: productionDatabaseGateReady
      ? "hard gate"
      : productionDatabaseRootCauseLabel(productionDatabaseReport.rootCause),
    gapCount: productionDatabaseGateReady ? 0 : 1,
    detail: productionDatabaseGateReady
      ? "正式資料庫與 production env 已由 live readiness 驗證，仍需保留 redacted Go/No-Go 證據。"
      : `正式站仍未通過 live readiness：${productionDatabaseReport.summary}`,
    nextStep: productionDatabaseGateReady
      ? "正式資料庫 Gate 已完成，請保留報告到試用 evidence folder。"
      : nextChecklistItem
        ? `下一步：${nextChecklistItem.title}。${nextChecklistItem.evidence}`
        : "先跑 production database gate 與 Go/No-Go；live DB 與 env draft 都 ready 才能發邀請。",
    href: "/settings/production-database",
  } as const;
}

function buildPreflightPreparationArea(preflightAccessReviewReady: boolean) {
  return {
    id: "preflight_access_review",
    title: "權限防漏",
    status: preflightAccessReviewReady ? "ready" : "blocked",
    readyCount: preflightAccessReviewReady ? 1 : 0,
    targetLabel: "hard gate",
    gapCount: preflightAccessReviewReady ? 0 : 1,
    detail: preflightAccessReviewReady
      ? "員工、主管與 HR 薪資資料邊界已通過 hash-only preflight 證據。"
      : "發邀請前必須先驗證員工與主管不能讀 payroll dashboard 或他人薪資單。",
    nextStep: preflightAccessReviewReady
      ? "權限防漏已完成，請保留 checkpoint 證據。"
      : "由 Owner/HR 跑權限防漏；檢查不讀取薪資金額、銀行帳號、身分證或健康資料。",
    href: "#preflight-access-review",
  } as const;
}

function checkLabel(name: string) {
  const labels: Record<string, string> = {
    "tenant and company": "租戶與公司",
    "20-50 active employees": "20-50 位有效員工",
    "active user link for every employee": "每位員工都有有效登入帳號",
    "employee role coverage": "員工角色覆蓋",
    "manager reporting line": "主管簽核線",
    "manager login and role coverage": "主管登入與角色",
    "SSO identity coverage": "SSO 身分綁定",
    "allowed email domain": "公司 Email 網域",
    "department coverage": "部門覆蓋",
    "14-day schedule coverage": "前 14 天班表覆蓋",
    "leave balance coverage": "假別餘額覆蓋",
    "payslip visibility rule": "薪資單可見性規則",
    "released payslip rehearsal coverage": "薪資單釋出演練",
  };
  return labels[name] ?? name;
}

function checkDetail(
  name: string,
  status: string,
  detail: string,
  report: ReturnType<typeof buildPilotInviteReadinessReport>,
) {
  const firstRatio = ratioText(detail);
  const ratios = ratioTexts(detail);
  const pass = status === "pass";
  const labels: Record<string, string> = {
    "tenant and company": pass ? "已找到租戶與公司。" : "找不到租戶或公司，請先建立正式客戶 tenant。",
    "20-50 active employees": `${report.activeEmployeeCount} 位有效員工；試用目標是 20-50 位。`,
    "active user link for every employee": firstRatio
      ? `${firstRatio} 位員工已有有效登入帳號。`
      : "每位有效員工都需要一個有效登入帳號。",
    "employee role coverage": firstRatio
      ? `${firstRatio} 位員工已有 employee 角色。`
      : "每位有效員工都需要 employee 角色。",
    "manager reporting line": `${report.managerWithDirectReportsCount} 位主管有直屬員工；至少需要 1 條簽核線。`,
    "manager login and role coverage": ratios.length >= 2
      ? `${ratios[0]} 位主管已有有效帳號，${ratios[1]} 位主管已有 manager 角色。`
      : "有直屬員工的主管都需要有效帳號與 manager 角色。",
    "SSO identity coverage": pass
      ? "已啟用 SSO，且員工外部身分綁定完整。"
      : "正式試用應啟用 SSO，並替每位員工綁定外部身分。",
    "allowed email domain": pass
      ? "公司 Email 網域已設定，且沒有越界帳號。"
      : "請設定允許的公司 Email 網域，並修正不在網域內的帳號。",
    "department coverage": pass
      ? "每位有效員工都有部門。"
      : "仍有有效員工缺少部門，會影響後台篩選與簽核責任。",
    "14-day schedule coverage": `${report.scheduledEmployeeCount}/${report.activeEmployeeCount} 位有效員工已有前 14 天班表。`,
    "leave balance coverage": `${report.leaveBalanceEmployeeCount}/${report.activeEmployeeCount} 位有效員工已有至少一筆有效假別餘額。`,
    "payslip visibility rule": pass
      ? "員工薪資單自助查看已啟用，且 self-only RBAC 規則通過。"
      : "員工薪資單自助查看未啟用，或 self-only RBAC 規則不安全。",
    "released payslip rehearsal coverage": `${report.releasedPayslipEmployeeCount}/${report.activeEmployeeCount} 位有效員工已有薪資單釋出演練證據；至少要在第 7 天月結預演前完成。`,
  };
  return labels[name] ?? detail;
}

function nextActionLabel(action: string) {
  const labels: Record<string, string> = {
    "Provision the real customer tenant and company before preparing invitations.":
      "先建立正式客戶 tenant 與公司，再準備邀請員工。",
    "Import the real pilot cohort so there are 20-50 active employees.":
      "匯入正式試用名單，讓有效員工數落在 20-50 人。",
    "Create or link one active user account for every active employee before sending invitations.":
      "發邀請前，替每位有效員工建立或綁定一個有效登入帳號。",
    "Assign the employee role to every active employee user.":
      "替每位有效員工的使用者帳號指派 employee 角色。",
    "Import managerEmployeeNo reporting lines so at least one manager has direct reports.":
      "匯入 managerEmployeeNo 主管線，至少要有一位主管帶直屬員工。",
    "Make every manager with direct reports an active linked user with the manager role.":
      "有直屬員工的主管都要有有效登入帳號，且具備 manager 角色。",
    "Enable production SSO and link external identities for every pilot employee user.":
      "啟用正式 SSO，並為每位試用員工綁定外部身分。",
    "Configure allowed company email domains and fix linked user emails outside those domains.":
      "設定允許的公司 Email 網域，並修正不在網域內的使用者帳號。",
    "Assign every active employee to a department before the first invitation.":
      "第一封邀請前，確認每位有效員工都有部門。",
    "Publish work schedules for every active pilot employee covering the first 14 trial days.":
      "發布每位試用員工前 14 天的班表。",
    "Create at least one active leave balance for every active pilot employee.":
      "替每位試用員工建立至少一筆有效假別餘額。",
    "Enable employee payslip self-service and keep the self-only payslip RBAC rule enforced.":
      "啟用員工薪資單自助查看，並維持只能看本人薪資單的 RBAC 規則。",
    "Complete a payroll release rehearsal so every active pilot employee has released payslip evidence before Day 7.":
      "第 7 天前完成薪資單釋出演練，讓每位有效員工都有薪資單查看證據。",
    [preflightAccessReviewAction]:
      "發第一封邀請前，先由 Owner/HR 跑 preflight 權限防漏，確認員工、主管與 HR 的薪資資料邊界。",
    [productionDatabaseGateAction]:
      "發第一封邀請前，先保存 production database gate 與 Go/No-Go redacted 報告，確認正式資料庫、env draft、匯入、流程與證據掃描都通過。",
    "產生 pooler URL redacted handoff":
      "正式資料庫下一步：由 Owner 產生 Supabase transaction pooler URL 的 redacted handoff，不保存密碼或完整 URL。",
    "寫入 Vercel Production env":
      "正式資料庫下一步：把 server-only DATABASE_URL 與正式 env 寫入 Vercel Production，然後重新部署。",
    "重新部署 Production":
      "正式資料庫下一步：Production env 寫入後重新部署，讓 Vercel runtime 使用新連線。",
    "確認 live /api/health/ready":
      "正式資料庫下一步：確認 https://hr.suiyuecare.com/api/health/ready 回 ok，且 payload 不含敏感資料。",
    "驗證正式 tenant 與 hr_one schema":
      "正式資料庫下一步：通過 live DB 後，驗證正式 tenant、角色、規則、薪資與 audit 覆蓋不是 demo fallback。",
    "跑完整 pilot Go/No-Go":
      "正式資料庫下一步：跑完整 Go/No-Go，確認匯入、邀請、workflow 與 evidence scan 全部可開跑。",
  };
  return labels[action] ?? action;
}

function productionDatabaseRootCauseLabel(rootCause: ProductionDatabaseRemediationReport["rootCause"]) {
  const labels: Record<ProductionDatabaseRemediationReport["rootCause"], string> = {
    ready: "可用",
    supabase_direct_network: "Direct host 網路阻擋",
    pooler_configuration: "Pooler 設定",
    missing_database_url: "缺 DATABASE_URL",
    environment_configuration: "Env 未通過",
    private_schema_unverified: "RLS 未驗證",
    private_schema_security: "RLS 安全阻擋",
    health_unreachable: "Health 不可讀",
    unknown: "待定位",
  };
  return labels[rootCause];
}

function ratioText(value: string) {
  const match = value.match(/(\d+)\/(\d+)/);
  return match ? `${match[1]}/${match[2]}` : null;
}

function ratioTexts(value: string) {
  return [...value.matchAll(/(\d+)\/(\d+)/g)].map((match) => `${match[1]}/${match[2]}`);
}

function badgeClass(status: string) {
  if (status === "block") return "danger";
  if (status === "warn") return "warning";
  return "";
}

function statusLabel(status: string) {
  if (status === "block") return "阻擋";
  if (status === "warn") return "提醒";
  return "通過";
}

function operationsStatusBoxClass(status: PilotOperationsStatus) {
  if (status === "blocked") return "danger-box";
  if (status === "complete") return "success-box";
  return "";
}

function phaseStatusLabel(status: PilotOperationsPhaseStatus) {
  if (status === "verified") return "已驗證";
  if (status === "in_progress") return "補證據";
  if (status === "blocked") return "阻擋";
  return "未開始";
}

function evidenceTypeLabel(type: BetaPilotEvidenceType) {
  const labels: Record<BetaPilotEvidenceType, string> = {
    smoke_test: "打卡 smoke",
    announcement_receipt: "公告回條",
    approval_flow: "請假/簽核",
    payroll_rehearsal: "月結預演",
    payslip_access: "薪資單查看",
    access_review: "權限防漏",
    audit_export: "audit 匯出",
    backup_restore: "備份還原",
  };
  return labels[type];
}
