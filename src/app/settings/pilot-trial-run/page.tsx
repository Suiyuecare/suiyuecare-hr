import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/session";
import { hasPermission } from "@/server/auth/rbac";
import {
  getBetaPilotTrialWorkspace,
  type BetaPilotTrialReadinessStatus,
  type BetaPilotTrialRunStatus,
} from "@/server/readiness/beta-pilot-trial-run";
import {
  getPilotOperationsReport,
  type PilotOperationsPhaseStatus,
  type PilotOperationsStatus,
  type PilotOperationsTodayGateStatus,
} from "@/server/readiness/pilot-operations";

type SearchParams = Promise<{
  error?: string;
  success?: string;
}>;

export default async function PilotTrialRunPage({ searchParams }: { searchParams: SearchParams }) {
  const [params, session] = await Promise.all([searchParams, getDemoSession()]);
  if (!hasPermission(session.role, "settings:read")) {
    return (
      <main className="page">
        <EmptyState
          title="需要管理權限"
          body="請切換為老闆或人資管理員角色，再管理 20-50 人兩週試用批次。"
        />
      </main>
    );
  }

  const canManagePilot = hasPermission(session.role, "pilot:manage");
  const trialWorkspace = await getBetaPilotTrialWorkspace(session);
  const operations = await getPilotOperationsReport(session, {
    trialDay: trialWorkspace.trialRun?.currentDay ?? null,
  });
  const activeCount = trialWorkspace.trialRun?.expectedEmployeeCount ?? trialWorkspace.employeeCount;
  const managerCount = trialWorkspace.trialRun?.managerCount ?? trialWorkspace.managerCount;

  return (
    <main className="page">
      <section className="page-header">
        <h1>試用批次控制台</h1>
        <p>把 20-50 人、2 週試用變成可追蹤的日常作戰節奏：先發邀請，再收 Day 1/3/7/14 證據，最後才能結案。</p>
      </section>

      {params.error ? (
        <div className="panel danger-panel">
          <strong>無法同步試用批次</strong>
          <p>{params.error}</p>
        </div>
      ) : null}
      {params.success === "beta-trial-run" ? (
        <div className="panel success-panel">
          <strong>試用批次已同步</strong>
          <p>系統已依目前 readiness 建立或更新批次，只保存狀態、人數與 hash-only 證據摘要。</p>
        </div>
      ) : null}

      <section className="grid">
        <section className={`panel span-12 risk-box ${trialWorkspace.readyForPilot ? "success-box" : trialWorkspace.openBlockedCount ? "danger-box" : "warning-box"}`}>
          <div className="section-heading">
            <div>
              <h2>{trialWorkspace.trialRun ? `${trialStatusLabel(trialWorkspace.trialRun.status)} · 第 ${trialWorkspace.trialRun.currentDay} 天` : "尚未建立正式試用批次"}</h2>
              <p className="muted">
                目前批次保存模式：{persistenceModeLabel(trialWorkspace.persistence.mode)}。{trialWorkspace.persistence.detail}
              </p>
            </div>
            <span className={`badge ${trialWorkspace.openBlockedCount ? "danger" : trialWorkspace.openActionRequiredCount ? "warning" : ""}`}>
              {trialWorkspace.openBlockedCount} blocker / {trialWorkspace.openActionRequiredCount} 待處理
            </span>
          </div>
        </section>

        <div className="panel span-3 metric">
          <span className="muted">試用人數</span>
          <strong>{activeCount}</strong>
          <span className={`badge ${activeCount >= 20 && activeCount <= 50 ? "" : "warning"}`}>20-50 目標</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">主管數</span>
          <strong>{managerCount}</strong>
          <span className={`badge ${managerCount > 0 ? "" : "danger"}`}>簽核線</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">今日 Gate</span>
          <strong>{todayGateLabel(operations.todayGate.status)}</strong>
          <span className={`badge ${todayGateBadgeClass(operations.todayGate.status)}`}>{operations.todayGate.timing}</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">批次事件</span>
          <strong>{trialWorkspace.trialRun?.eventCount ?? 0}</strong>
          <span className="badge">audit snapshots</span>
        </div>

        <section className={`panel span-8 risk-box ${todayGateBoxClass(operations.todayGate.status)}`}>
          <div className="section-heading">
            <div>
              <h2>今日焦點</h2>
              <p className="muted">{operations.todayGate.detail}</p>
            </div>
            <Link className="button primary" href={operations.todayGate.actionHref}>
              {operations.todayGate.actionLabel}
            </Link>
          </div>
          <ul className="task-list">
            <li className="task">
              <span>
                <strong>{operations.todayGate.timing} · {operations.todayGate.title}</strong>
                <small>{operations.todayGate.nextStep}</small>
                <small>
                  缺少證據：
                  {operations.todayGate.missingEvidenceTypes.length
                    ? operations.todayGate.missingEvidenceTypes.join(", ")
                    : "無"}
                </small>
              </span>
              <span className={`badge ${todayGateBadgeClass(operations.todayGate.status)}`}>
                {todayGateLabel(operations.todayGate.status)}
              </span>
            </li>
          </ul>
        </section>

        <section className="panel span-4">
          <h2>批次期間</h2>
          <ul className="task-list">
            <li className="task">
              <span>
                <strong>開始日</strong>
                <small>{formatDate(trialWorkspace.trialRun?.startsAt ?? trialWorkspace.suggestedStartsAt)}</small>
              </span>
            </li>
            <li className="task">
              <span>
                <strong>結束日</strong>
                <small>{formatDate(trialWorkspace.trialRun?.endsAt ?? trialWorkspace.suggestedEndsAt)}</small>
              </span>
            </li>
            <li className="task">
              <span>
                <strong>最近同步</strong>
                <small>{trialWorkspace.trialRun?.lastEventAt ? formatDateTime(trialWorkspace.trialRun.lastEventAt) : "尚未同步"}</small>
              </span>
            </li>
            {trialWorkspace.trialRun?.evidenceSummaryHash ? (
              <li className="task">
                <span>
                  <strong>證據摘要</strong>
                  <small>{shortHash(trialWorkspace.trialRun.evidenceSummaryHash)}</small>
                </span>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>批次同步</h2>
              <p className="muted">同步會建立或更新試用批次，並把目前 readiness 摘要寫入 audit log；備註只存 hash，請勿輸入姓名、薪資、身分證或銀行帳號。</p>
            </div>
            <span className={`badge ${readinessBadgeClass(trialWorkspace.readinessStatus)}`}>
              {readinessStatusLabel(trialWorkspace.readinessStatus)}
            </span>
          </div>
          {canManagePilot ? (
            <form action="/api/settings/beta-pilot-trial-run" method="post" className="mini-form compact-form">
              <input type="hidden" name="returnTo" value="/settings/pilot-trial-run?success=beta-trial-run" />
              <div className="field-grid">
                <label>
                  試用開始日
                  <input
                    name="startsAt"
                    type="date"
                    defaultValue={formatInputDate(trialWorkspace.trialRun?.startsAt ?? trialWorkspace.suggestedStartsAt)}
                  />
                </label>
                <label>
                  HR 備註代碼
                  <input name="notes" placeholder="例如 PILOT-2026-06-A；只保存 hash。" />
                </label>
              </div>
              <button className="button primary" type="submit">
                {trialWorkspace.persistence.readyForLiveTrial ? "建立/同步正式試用批次" : "演練同步試用批次"}
              </button>
            </form>
          ) : (
            <EmptyState title="只能檢視" body="目前角色可以查看試用批次，但不能同步或建立新的 readiness snapshot。" />
          )}
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>兩週節奏</h2>
              <p className="muted">HR 每天只看今天該補什麼；如果 Today Gate 指回較早 checkpoint，先補舊證據再往後走。</p>
            </div>
            <span className={`badge ${operationsBadgeClass(operations.status)}`}>
              {operationsStatusLabel(operations.status)}
            </span>
          </div>
          <ol className="close-steps">
            {operations.phases.map((phase) => (
              <li key={phase.checkpointId} className={`close-step ${phase.status === "verified" ? "done" : phase.status}`}>
                <strong>{phase.timing} · {phase.title}</strong>
                <span>{phase.owner} · {phase.goal}</span>
                <span>必要證據：{phase.requiredEvidenceTypes.join(", ")}</span>
                <span>已收 {phase.recordedCount} 筆；缺少 {phase.missingEvidenceTypes.length ? phase.missingEvidenceTypes.join(", ") : "無"}</span>
                <span className={`badge ${phaseBadgeClass(phase.status)}`}>{phaseStatusLabel(phase.status)}</span>
                <Link className="button" href={phase.actionHref}>
                  {phase.actionLabel}
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>關鍵入口</h2>
              <p className="muted">用四個入口完成試用開跑、日常追蹤與 Day 14 結案，不需要 HR 在深層選單裡找功能。</p>
            </div>
          </div>
          <div className="invite-prep-grid">
            <TrialLinkCard href="/settings/pilot-invite-readiness" title="試用邀請就緒" detail="確認 20-50 人名單、登入、角色、主管線、班表、假別與薪資單 self-only 規則。" />
            <TrialLinkCard href="/settings/pilot-go-no-go" title="開跑 Go/No-Go" detail="發邀請前確認正式環境、匯入預檢、核心流程與 evidence scan 都可接受。" />
            <TrialLinkCard href="/settings/pilot-operations" title="每日戰情" detail="Day 0、Day 1、Day 3、Day 7、Day 14 收 hash-only checkpoint 證據。" />
            <TrialLinkCard href="/settings/pilot-completion" title="試用結案檢查" detail="Day 14 檢查 KPI、audit、權限與證據隱私，通過後才討論擴大試用。" />
            <TrialLinkCard href="/settings/pilot-evidence" title="試用證據包" detail="整理 redacted reports、audit package、handoff 與 evidence scan 缺口，通過後才可交付。" />
          </div>
        </section>
      </section>
    </main>
  );
}

function TrialLinkCard({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <Link className="invite-prep-card" href={href}>
      <span className="badge">Gate</span>
      <h3>{title}</h3>
      <p>{detail}</p>
      <small>開啟</small>
    </Link>
  );
}

function readinessStatusLabel(status: BetaPilotTrialReadinessStatus) {
  if (status === "ready") return "可開始試用";
  if (status === "blocked") return "有阻擋項";
  return "需先處理";
}

function readinessBadgeClass(status: BetaPilotTrialReadinessStatus) {
  if (status === "blocked") return "danger";
  if (status === "action_required") return "warning";
  return "";
}

function trialStatusLabel(status: BetaPilotTrialRunStatus) {
  if (status === "active") return "試用中";
  if (status === "completed") return "已結案";
  if (status === "blocked") return "阻擋中";
  if (status === "cancelled") return "已取消";
  return "準備中";
}

function persistenceModeLabel(mode: string) {
  if (mode === "database") return "PostgreSQL 證據保存";
  if (mode === "production_missing_database") return "Production 缺少資料庫";
  return "Demo 暫存模式";
}

function todayGateLabel(status: PilotOperationsTodayGateStatus) {
  if (status === "ready_to_continue") return "可繼續";
  if (status === "needs_evidence") return "補證據";
  return "阻擋";
}

function todayGateBadgeClass(status: PilotOperationsTodayGateStatus) {
  if (status === "blocked") return "danger";
  if (status === "needs_evidence") return "warning";
  return "";
}

function todayGateBoxClass(status: PilotOperationsTodayGateStatus) {
  if (status === "ready_to_continue") return "success-box";
  if (status === "needs_evidence") return "warning-box";
  return "danger-box";
}

function operationsStatusLabel(status: PilotOperationsStatus) {
  if (status === "complete") return "全部完成";
  if (status === "in_progress") return "進行中";
  if (status === "blocked") return "有阻擋";
  return "未開始";
}

function operationsBadgeClass(status: PilotOperationsStatus) {
  if (status === "blocked") return "danger";
  if (status === "in_progress") return "warning";
  return "";
}

function phaseStatusLabel(status: PilotOperationsPhaseStatus) {
  if (status === "verified") return "已驗證";
  if (status === "in_progress") return "處理中";
  if (status === "blocked") return "阻擋";
  return "未開始";
}

function phaseBadgeClass(status: PilotOperationsPhaseStatus) {
  if (status === "blocked") return "danger";
  if (status === "in_progress" || status === "not_started") return "warning";
  return "";
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium" }).format(date);
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatInputDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function shortHash(hash: string) {
  return `${hash.slice(0, 10)}...`;
}
