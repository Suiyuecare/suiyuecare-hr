import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/demo-session";
import { hasPermission } from "@/server/auth/rbac";
import { getBetaPilotReadinessReport } from "@/server/readiness/beta-pilot";
import type { BetaPilotCheckpointStatus, BetaPilotEvidenceType } from "@/server/readiness/beta-pilot-checkpoints";
import { getLaunchReadinessReport } from "@/server/readiness/launch";

type SearchParams = Promise<{ error?: string }>;

export default async function LaunchReadinessPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error }, session] = await Promise.all([searchParams, getDemoSession()]);
  if (!hasPermission(session.role, "settings:read")) {
    return (
      <main className="page">
        <EmptyState
          title="需要管理權限"
          body="請切換為老闆或人資管理員角色，再檢查上線與 Beta 試用準備度。"
        />
      </main>
    );
  }
  const report = await getLaunchReadinessReport(session);
  const betaPilot = await getBetaPilotReadinessReport(session, report);

  return (
    <main className="page">
      <section className="page-header">
        <h1>上線與試用準備度</h1>
        <p>把 HR One 從展示環境推進到 20-50 人、2 週可試用的客戶導入狀態。</p>
      </section>
      {error ? (
        <div className="panel danger-panel">
          <strong>無法更新試用 checkpoint</strong>
          <p>{error}</p>
        </div>
      ) : null}

      <section className="grid">
        <div className="panel span-3 metric">
          <span className="muted">Beta 試用</span>
          <strong>{betaPilot.readyForPilot ? "Ready" : "Not ready"}</strong>
          <span className={`badge ${betaPilot.readyForPilot ? "" : betaPilot.blockedCount ? "danger" : "warning"}`}>
            {betaPilot.trialDays} 天 / {betaPilot.targetEmployeeRange.min}-{betaPilot.targetEmployeeRange.max} 人
          </span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Beta Ready</span>
          <strong>{betaPilot.readyCount}</strong>
          <span className="badge">checks</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Beta 待處理</span>
          <strong>{betaPilot.actionRequiredCount}</strong>
          <span className="badge warning">before trial</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Beta 阻擋</span>
          <strong>{betaPilot.blockedCount}</strong>
          <span className={`badge ${betaPilot.blockedCount > 0 ? "danger" : ""}`}>hard gate</span>
        </div>

        <section className="panel span-12" id="pilot-runbook">
          <div className="section-heading">
            <div>
              <h2>2 週試用 Gate</h2>
              <p className="muted">
                目標是讓一家公司 20-50 人實際試用 2 週，完成打卡、請假、簽核、公告、HR 月結預演、薪資單查看，且不發生權限與敏感資料外洩。
              </p>
            </div>
            <span className={`badge ${betaPilot.readyForPilot ? "" : betaPilot.blockedCount ? "danger" : "warning"}`}>
              {betaPilot.readyForPilot ? "可開始試用" : "尚未可試用"}
            </span>
          </div>
          <ol className="close-steps">
            {betaPilot.phases.map((phase) => (
              <li key={phase.step} className={`close-step ${phase.status === "ready" ? "done" : phase.status}`}>
                <strong>
                  {phase.step}. {phase.title}
                </strong>
                <span>{phase.summary}</span>
                <a className="button" href={phase.actionHref}>
                  {phase.actionLabel}
                </a>
              </li>
            ))}
          </ol>
          <ul className="task-list">
            {betaPilot.items.map((item) => (
              <li className="task" key={item.id}>
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {item.area} · {item.detail}
                  </small>
                  <small>{item.nextStep}</small>
                </span>
                <span className="inline-actions">
                  <a className="button" href={item.actionHref}>
                    {item.actionLabel}
                  </a>
                  <span className={`badge ${badgeClass(item.status)}`}>
                    {statusLabel(item.status)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>2 週試用操作台</h2>
              <p className="muted">
                把試用切成試用前、第 1 天、第 3 天、第 7 天、第 14 天，HR 照順序清掉 blocker，就能驗證日常流程與薪資安全。
              </p>
            </div>
            <span className={`badge ${betaPilot.runbook.some((step) => step.status === "blocked") ? "danger" : betaPilot.runbook.some((step) => step.status === "action_required") ? "warning" : ""}`}>
              {betaPilot.runbook.filter((step) => step.status === "ready").length}/{betaPilot.runbook.length} ready
            </span>
          </div>
          <ol className="close-steps">
            {betaPilot.runbook.map((step) => (
              <li key={step.id} className={`close-step ${step.status === "ready" ? "done" : step.status}`}>
                <strong>
                  {step.timing} · {step.title}
                </strong>
                <span>
                  {step.owner} · {step.objective}
                </span>
                <span>{step.checklist.join(" / ")}</span>
                <span>{step.openItems.length ? `待處理：${step.openItems.map((item) => item.title).join("、")}` : step.evidence}</span>
                <span>
                  Checkpoint · {checkpointStatusLabel(step.checkpoint?.status ?? "not_started")}
                  {step.checkpoint
                    ? ` · ${evidenceTypeLabel(step.checkpoint.evidenceType)} · ${formatDateTime(step.checkpoint.recordedAt)} · ${step.checkpoint.actorName}`
                    : ""}
                </span>
                {step.checkpoint?.evidenceRefHash ? <span>證據 hash · {shortHash(step.checkpoint.evidenceRefHash)}</span> : null}
                <a className="button" href={step.actionHref}>
                  {step.actionLabel}
                </a>
                <form action="/api/settings/beta-pilot-checkpoints" method="post" className="mini-form compact-form">
                  <input type="hidden" name="checkpointId" value={step.id} />
                  <div className="field-grid">
                    <label>
                      狀態
                      <select name="status" defaultValue={step.checkpoint?.status ?? "in_progress"}>
                        <option value="in_progress">處理中</option>
                        <option value="verified">已驗證</option>
                        <option value="blocked">阻擋</option>
                        <option value="not_started">未開始</option>
                      </select>
                    </label>
                    <label>
                      證據類型
                      <select name="evidenceType" defaultValue={step.checkpoint?.evidenceType ?? defaultEvidenceType(step.id)}>
                        <option value="smoke_test">Smoke test</option>
                        <option value="announcement_receipt">公告回條</option>
                        <option value="approval_flow">簽核流程</option>
                        <option value="payroll_rehearsal">月結預演</option>
                        <option value="payslip_access">薪資單查看</option>
                        <option value="access_review">權限檢查</option>
                        <option value="audit_export">Audit 匯出</option>
                        <option value="backup_restore">備份還原</option>
                      </select>
                    </label>
                    <label>
                      證據代碼
                      <input name="evidenceRef" placeholder="例如 TICKET-123 或 smoke-2026-06-16" />
                    </label>
                    <label>
                      下一步
                      <input name="nextStep" placeholder="只填代碼或短句，內容會以 hash 保存" />
                    </label>
                  </div>
                  <label>
                    驗證摘要
                    <textarea name="reviewerNote" rows={2} placeholder="請避免輸入姓名、薪資、身分證、銀行帳號或健康資料；系統只保存 hash。" />
                  </label>
                  <button className="button primary" type="submit">
                    記錄 checkpoint
                  </button>
                </form>
              </li>
            ))}
          </ol>
        </section>

        <div className="panel span-3 metric">
          <span className="muted">Launch Ready</span>
          <strong>{report.readyCount}</strong>
          <span className="badge">checks</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Launch 待處理</span>
          <strong>{report.actionRequiredCount}</strong>
          <span className="badge warning">before launch</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Launch 阻擋</span>
          <strong>{report.blockedCount}</strong>
          <span className={`badge ${report.blockedCount > 0 ? "danger" : ""}`}>hard gate</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">正式販售</span>
          <strong>{report.readyForSale ? "Ready" : "Not ready"}</strong>
          <span className={`badge ${report.readyForSale ? "" : "warning"}`}>launch gate</span>
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Production setup wizard</h2>
              <p className="muted">
                Beta 試用過關後，再依序清掉正式販售與 production tenant 的完整上線 gate。
              </p>
            </div>
            <span className="badge">Guided path</span>
          </div>
          <ol className="close-steps">
            {report.setupSteps.map((step) => (
              <li key={step.step} className={`close-step ${step.status === "ready" ? "done" : step.status}`}>
                <strong>
                  {step.step}. {step.title}
                </strong>
                <span>{step.summary}</span>
                <a className="button" href={step.actionHref}>
                  {step.actionLabel}
                </a>
              </li>
            ))}
          </ol>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Readiness checks</h2>
              <p className="muted">
                These checks focus on persistence, security, compliance governance, operational delivery, auditability, and KPI proof.
              </p>
            </div>
            <a className="button" href="/settings">
              Settings
            </a>
          </div>

          <ul className="task-list">
            {report.items.map((item) => (
              <li className="task" key={item.id}>
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {item.area} · {item.detail}
                  </small>
                  <small>{item.nextStep}</small>
                </span>
                <span className="inline-actions">
                  <a className="button" href={item.actionHref}>
                    {item.actionLabel}
                  </a>
                <span className={`badge ${badgeClass(item.status)}`}>
                    {statusLabel(item.status)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-12" id="database-setup">
          <div className="section-heading">
            <div>
              <h2>Database setup path</h2>
              <p className="muted">
                Run these commands in a production-like environment with PostgreSQL before onboarding a customer tenant.
              </p>
            </div>
            <span className="badge">Required</span>
          </div>
          <ul className="task-list">
            <li className="task">
              <span>
                <strong>1. Apply migrations</strong>
                <small>pnpm db:migrate</small>
              </span>
              <span className="badge">Schema</span>
            </li>
            <li className="task">
              <span>
                <strong>2. Load baseline data</strong>
                <small>pnpm db:seed</small>
              </span>
              <span className="badge">Tenant</span>
            </li>
            <li className="task">
              <span>
                <strong>3. Provision customer foundation</strong>
                <small>pnpm db:provision:tenant -- --tenant-slug=&lt;customer-slug&gt; ...</small>
              </span>
              <span className="badge warning">Customer</span>
            </li>
            <li className="task">
              <span>
                <strong>4. Verify demo baseline</strong>
                <small>pnpm db:verify</small>
              </span>
              <span className="badge">Demo gate</span>
            </li>
            <li className="task">
              <span>
                <strong>5. Verify production tenant</strong>
                <small>pnpm db:verify:production -- --tenant-slug=&lt;customer-slug&gt;</small>
              </span>
              <span className="badge danger">Launch gate</span>
            </li>
          </ul>
        </section>
      </section>
    </main>
  );
}

function badgeClass(status: string) {
  if (status === "blocked") return "danger";
  if (status === "action_required") return "warning";
  return "";
}

function statusLabel(status: string) {
  if (status === "action_required") return "Action required";
  return status;
}

function checkpointStatusLabel(status: BetaPilotCheckpointStatus) {
  if (status === "verified") return "已驗證";
  if (status === "blocked") return "阻擋";
  if (status === "in_progress") return "處理中";
  return "未開始";
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

function defaultEvidenceType(stepId: string): BetaPilotEvidenceType {
  if (stepId === "day_1") return "announcement_receipt";
  if (stepId === "day_3") return "approval_flow";
  if (stepId === "day_7") return "payroll_rehearsal";
  if (stepId === "day_14") return "audit_export";
  return "access_review";
}

function shortHash(hash: string) {
  return `${hash.slice(0, 10)}...`;
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
