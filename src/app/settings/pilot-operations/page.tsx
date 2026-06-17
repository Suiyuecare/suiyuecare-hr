import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/session";
import { hasPermission } from "@/server/auth/rbac";
import { getBetaPilotTrialWorkspace } from "@/server/readiness/beta-pilot-trial-run";
import type { BetaPilotEvidenceType } from "@/server/readiness/beta-pilot-checkpoints";
import {
  getPilotOperationsReport,
  type PilotOperationsPhase,
  type PilotOperationsPhaseStatus,
  type PilotOperationsStatus,
  type PilotOperationsTodayGateStatus,
} from "@/server/readiness/pilot-operations";

type SearchParams = Promise<{
  error?: string;
  success?: string;
}>;

export default async function PilotOperationsPage({ searchParams }: { searchParams: SearchParams }) {
  const [params, session] = await Promise.all([searchParams, getDemoSession()]);
  if (!hasPermission(session.role, "settings:read")) {
    return (
      <main className="page">
        <EmptyState
          title="需要管理權限"
          body="請切換為老闆或人資管理員角色，再查看兩週試用每日戰情。"
        />
      </main>
    );
  }

  const canManagePilot = hasPermission(session.role, "pilot:manage");
  const trialWorkspace = await getBetaPilotTrialWorkspace(session);
  const report = await getPilotOperationsReport(session, {
    trialDay: trialWorkspace.trialRun?.currentDay ?? null,
  });

  return (
    <main className="page">
      <section className="page-header">
        <h1>試用每日戰情</h1>
        <p>把 20-50 人兩週試用拆成 Day 0、Day 1、Day 3、Day 7、Day 14，逐日收齊 hash-only 證據。</p>
      </section>

      {params.error ? (
        <div className="panel danger-panel">
          <strong>無法更新戰情</strong>
          <p>{params.error}</p>
        </div>
      ) : null}
      {params.success ? (
        <div className="panel success-panel">
          <strong>戰情已更新</strong>
          <p>checkpoint 已寫入 audit log；系統只保存證據代碼與摘要的 hash，不保存原文敏感資料。</p>
        </div>
      ) : null}

      <section className="grid">
        <section className={`panel span-12 risk-box ${statusBoxClass(report.status)}`}>
          <div className="section-heading">
            <div>
              <h2>{statusTitle(report.status)}</h2>
              <p className="muted">
                目前優先處理：
                {report.currentPhase
                  ? `${report.currentPhase.timing} · ${report.currentPhase.title}`
                  : "所有主要 checkpoint 已完成"}
              </p>
            </div>
            <span className={`badge ${report.status === "blocked" ? "danger" : report.status === "in_progress" ? "warning" : ""}`}>
              {report.completedPhaseCount}/5 完成
            </span>
          </div>
        </section>

        <div className="panel span-3 metric">
          <span className="muted">完成階段</span>
          <strong>{report.completedPhaseCount}</strong>
          <span className="badge">5 個 checkpoint</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">處理中</span>
          <strong>{report.inProgressPhaseCount}</strong>
          <span className="badge warning">待補證據</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">阻擋</span>
          <strong>{report.blockedPhaseCount}</strong>
          <span className={`badge ${report.blockedPhaseCount ? "danger" : ""}`}>hard gate</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">證據紀錄</span>
          <strong>{report.totalRecordedEvidenceCount}</strong>
          <span className="badge">audit events</span>
        </div>

        <section className={`panel span-12 risk-box ${todayGateBoxClass(report.todayGate.status)}`}>
          <div className="section-heading">
            <div>
              <h2>今日 Gate · {todayGateStatusLabel(report.todayGate.status)}</h2>
              <p className="muted">{report.todayGate.detail}</p>
            </div>
            <div className="inline-actions">
              <span className={`badge ${todayGateBadgeClass(report.todayGate.status)}`}>
                {report.todayGate.trialDay === null ? "未建立批次" : `第 ${report.todayGate.trialDay} 天`}
              </span>
              <Link className="button" href={report.todayGate.actionHref}>
                {report.todayGate.actionLabel}
              </Link>
            </div>
          </div>
          <div className="task-list">
            <div className="task">
              <span>
                <strong>{report.todayGate.timing} · {report.todayGate.title}</strong>
                <small>{report.todayGate.nextStep}</small>
                <small>
                  缺少證據：
                  {report.todayGate.missingEvidenceTypes.length
                    ? report.todayGate.missingEvidenceTypes.map(evidenceTypeLabel).join("、")
                    : "無"}
                </small>
              </span>
              <span className="badge">
                依序補證
              </span>
            </div>
          </div>
          <div className="section-heading compact-heading">
            <div>
              <h3>今日任務板</h3>
              <p className="muted">照三個時段處理，收尾時只記錄 hash-only 證據與代碼。</p>
            </div>
          </div>
          <div className="pilot-day-task-grid" aria-label="今日任務板">
            {report.todayGate.dailyTasks.map((task) => (
              <article className={`pilot-day-task ${task.tone}`} key={task.id}>
                <div>
                  <span className="muted">{task.timing}</span>
                  <h3>{task.title}</h3>
                  <p>{task.detail}</p>
                </div>
                <small>證據：{task.evidence}</small>
                <Link className="button" href={task.actionHref}>
                  {task.actionLabel}
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>每日 checkpoint</h2>
              <p className="muted">每一筆手動證據只存 hash；實際截圖、報表與名單請放在核准的安全資料夾。</p>
            </div>
            <div className="inline-actions">
              <Link className="button" href="/settings/pilot-invite-readiness">
                邀請就緒
              </Link>
              <Link className="button" href="/settings/readiness">
                上線準備度
              </Link>
            </div>
          </div>
          <ol className="close-steps">
            {report.phases.map((phase) => (
              <li key={phase.checkpointId} id={phase.checkpointId} className={`close-step ${phase.status === "verified" ? "done" : phase.status}`}>
                <div className="section-heading compact-heading">
                  <span>
                    <strong>{phase.timing} · {phase.title}</strong>
                    <small>{phase.owner} · {phase.goal}</small>
                  </span>
                  <span className={`badge ${phase.status === "blocked" ? "danger" : phase.status === "in_progress" ? "warning" : ""}`}>
                    {phaseStatusLabel(phase.status)}
                  </span>
                </div>
                <span>{phase.checklist.join(" / ")}</span>
                <span>
                  必要證據：{phase.requiredEvidenceTypes.map(evidenceTypeLabel).join("、")}
                  {phase.optionalEvidenceTypes.length ? `；選填：${phase.optionalEvidenceTypes.map(evidenceTypeLabel).join("、")}` : ""}
                </span>
                <span>
                  已收：{phase.recordedEvidenceTypes.length ? phase.recordedEvidenceTypes.map(evidenceTypeLabel).join("、") : "尚無"}
                  {phase.missingEvidenceTypes.length ? `；缺少：${phase.missingEvidenceTypes.map(evidenceTypeLabel).join("、")}` : ""}
                </span>
                <span>
                  最近紀錄：{phase.latestRecordedAt ? formatDateTime(phase.latestRecordedAt) : "尚未紀錄"}
                  {" · "}
                  紀錄數：{phase.recordedCount}
                </span>
                <div className="inline-actions">
                  <Link className="button" href={phase.actionHref}>
                    {phase.actionLabel}
                  </Link>
                  {phase.checkpointId === "preflight" && canManagePilot ? (
                    <form action="/api/settings/beta-pilot-access-review" method="post" className="compact-form">
                      <input type="hidden" name="returnTo" value="/settings/pilot-operations?success=access-review#preflight" />
                      <button className="button primary" type="submit">
                        跑權限防漏
                      </button>
                    </form>
                  ) : null}
                  {phase.checkpointId === "day_14" && canManagePilot ? (
                    <form action="/api/settings/beta-pilot-final-review" method="post" className="compact-form">
                      <input type="hidden" name="returnTo" value="/settings/pilot-operations?success=final-review#day_14" />
                      <button className="button primary" type="submit">
                        跑結案檢查
                      </button>
                    </form>
                  ) : null}
                </div>
                {canManagePilot ? <CheckpointForm phase={phase} /> : null}
              </li>
            ))}
          </ol>
        </section>

        <section className="panel span-7">
          <h2>下一步</h2>
          <ul className="task-list">
            {report.nextActions.length ? (
              report.nextActions.map((action) => (
                <li className="task" key={action}>
                  <span>{action}</span>
                  <span className="badge warning">待辦</span>
                </li>
              ))
            ) : (
              <li className="task">
                <span>五個 checkpoint 已完成，可進入試用結案與證據掃描。</span>
                <span className="badge">完成</span>
              </li>
            )}
          </ul>
        </section>

        <section className="panel span-5">
          <h2>隱私護欄</h2>
          <ul className="task-list">
            {report.privacyGuardrails.map((guardrail) => (
              <li className="task" key={guardrail}>
                <span>{guardrail}</span>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}

function CheckpointForm({ phase }: { phase: PilotOperationsPhase }) {
  return (
    <form action="/api/settings/beta-pilot-checkpoints" method="post" className="mini-form compact-form">
      <input type="hidden" name="checkpointId" value={phase.checkpointId} />
      <input type="hidden" name="returnTo" value={`/settings/pilot-operations?success=checkpoint#${phase.checkpointId}`} />
      <div className="field-grid">
        <label>
          狀態
          <select name="status" defaultValue={phase.missingEvidenceTypes.length ? "in_progress" : "verified"}>
            <option value="in_progress">處理中</option>
            <option value="verified">已驗證</option>
            <option value="blocked">阻擋</option>
            <option value="not_started">未開始</option>
          </select>
        </label>
        <label>
          證據類型
          <select name="evidenceType" defaultValue={defaultEvidenceType(phase)}>
            {allEvidenceTypes.map((evidenceType) => (
              <option value={evidenceType} key={evidenceType}>
                {evidenceTypeLabel(evidenceType)}
              </option>
            ))}
          </select>
        </label>
        <label>
          證據代碼
          <input name="evidenceRef" placeholder="例如 pilot-day3-approval 或 TICKET-123" />
        </label>
        <label>
          下一步
          <input name="nextStep" placeholder="只填代碼或短句，系統只保存 hash" />
        </label>
      </div>
      <label>
        驗證摘要
        <textarea name="reviewerNote" rows={2} placeholder="請勿輸入姓名、Email、薪資、身分證、銀行帳號或健康資料。" />
      </label>
      <button className="button primary" type="submit">
        記錄每日證據
      </button>
    </form>
  );
}

const allEvidenceTypes: BetaPilotEvidenceType[] = [
  "smoke_test",
  "announcement_receipt",
  "approval_flow",
  "payroll_rehearsal",
  "payslip_access",
  "access_review",
  "audit_export",
  "backup_restore",
];

function defaultEvidenceType(phase: PilotOperationsPhase) {
  return phase.missingEvidenceTypes[0] ?? phase.requiredEvidenceTypes[0] ?? "smoke_test";
}

function statusBoxClass(status: PilotOperationsStatus) {
  if (status === "blocked") return "danger-box";
  if (status === "complete") return "success-box";
  return "";
}

function statusTitle(status: PilotOperationsStatus) {
  if (status === "complete") return "兩週試用主要證據已收齊";
  if (status === "blocked") return "試用戰情有阻擋項";
  if (status === "in_progress") return "試用戰情處理中";
  return "尚未開始收每日證據";
}

function phaseStatusLabel(status: PilotOperationsPhaseStatus) {
  if (status === "verified") return "已驗證";
  if (status === "blocked") return "阻擋";
  if (status === "in_progress") return "處理中";
  return "未開始";
}

function todayGateStatusLabel(status: PilotOperationsTodayGateStatus) {
  if (status === "ready_to_continue") return "可繼續";
  if (status === "blocked") return "阻擋";
  return "待補證據";
}

function todayGateBoxClass(status: PilotOperationsTodayGateStatus) {
  if (status === "blocked") return "danger-box";
  if (status === "ready_to_continue") return "success-box";
  return "";
}

function todayGateBadgeClass(status: PilotOperationsTodayGateStatus) {
  if (status === "blocked") return "danger";
  if (status === "needs_evidence") return "warning";
  return "";
}

function evidenceTypeLabel(type: BetaPilotEvidenceType) {
  const labels: Record<BetaPilotEvidenceType, string> = {
    smoke_test: "Smoke test",
    announcement_receipt: "公告回條",
    approval_flow: "簽核流程",
    payroll_rehearsal: "月結預演",
    payslip_access: "薪資單查看",
    access_review: "權限檢查",
    audit_export: "Audit 匯出",
    backup_restore: "備份還原",
  };
  return labels[type];
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
