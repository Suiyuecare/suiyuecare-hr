import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/session";
import { hasPermission } from "@/server/auth/rbac";
import { getBetaPilotReadinessReport } from "@/server/readiness/beta-pilot";
import type { BetaPilotCheckpointStatus, BetaPilotEvidenceType } from "@/server/readiness/beta-pilot-checkpoints";
import { getBetaPilotTrialWorkspace } from "@/server/readiness/beta-pilot-trial-run";
import { buildSaleReadinessRoadmap } from "@/server/readiness/commercialization-roadmap";
import { getLaunchReadinessReport } from "@/server/readiness/launch";

type SearchParams = Promise<{ error?: string; success?: string }>;

export default async function LaunchReadinessPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error, success }, session] = await Promise.all([searchParams, getDemoSession()]);
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
  const trialWorkspace = await getBetaPilotTrialWorkspace(session, betaPilot);
  const saleRoadmap = buildSaleReadinessRoadmap({
    launchReport: report,
    betaPilot,
    trialWorkspace,
  });

  return (
    <main className="page settings-control-page">
      <section className="page-header">
        <h1>上線與試用準備度</h1>
        <p>把 HR One 從展示環境推進到 20-50 人、2 週可試用的客戶導入狀態。</p>
      </section>
      {error ? (
        <div className="panel danger-panel">
          <strong>無法更新試用資料</strong>
          <p>{error}</p>
        </div>
      ) : null}
      {success === "beta-rehearsal" ? (
        <div className="panel success-panel">
          <strong>Beta 試用流程演練完成</strong>
          <p>已跑過打卡、請假簽核、公告回條、HR 月結預演與員工薪資單查看；checkpoint 會顯示最新 hash 證據。</p>
        </div>
      ) : null}
      {success === "beta-trial-run" ? (
        <div className="panel success-panel">
          <strong>試用批次已同步</strong>
          <p>已依目前 readiness 與 20-50 人試用名單建立或更新批次；正式資料庫模式會寫入 hash-only audit log。</p>
        </div>
      ) : null}
      {success?.startsWith("beta-final-review") ? (
        <div className={`panel ${success === "beta-final-review-verified" ? "success-panel" : success === "beta-final-review-blocked" ? "danger-panel" : ""}`}>
          <strong>第 14 天試用結案檢查已記錄</strong>
          <p>
            系統已依目前 readiness 產生 hash-only checkpoint；
            {success === "beta-final-review-verified"
              ? "目前判定可進入下一階段。"
              : success === "beta-final-review-blocked"
                ? "仍有 blocker，請先清掉阻擋項。"
                : "仍有待處理項，請完成後再重跑結案檢查。"}
          </p>
        </div>
      ) : null}

      <section className="settings-control-hero" aria-label="販售上線戰情室">
        <div className="settings-control-hero-main">
          <div className="settings-control-hero-topline">
            <span className="muted">Owner / HR 下一階段路線圖</span>
            <span className={`badge ${saleRoadmap.readyForSale ? "" : saleRoadmap.blockedCount ? "danger" : "warning"}`}>
              {saleRoadmap.readyForSale ? "可販售" : `${saleRoadmap.blockedCount} 個階段阻擋`}
            </span>
          </div>
          <h1>販售上線戰情室</h1>
          <p>
            {saleRoadmap.summary}
            {" "}
            系統會把 production DB、Finance-style 體驗、真實 20-50 人試用、台灣法遵、薪資月結與商務證據包排成同一條路線。
          </p>
          <div className="settings-control-hero-actions">
            <a className="button primary" href={saleRoadmap.currentStage.actionHref}>
              {saleRoadmap.currentStage.actionLabel}
            </a>
            <a className="button" href="/settings/production-database">
              修正式資料庫 Gate
            </a>
            <a className="button" href="/hr/kpis">
              查看販售 KPI
            </a>
          </div>
        </div>
        <aside className={`settings-control-focus ${roadmapTone(saleRoadmap.currentStage.status)}`}>
          <span className="muted">今日最重要</span>
          <strong>
            第 {saleRoadmap.currentStage.step} 階段 · {saleRoadmap.currentStage.title}
          </strong>
          <p>{saleRoadmap.currentStage.nextStep}</p>
          <span className={`badge ${badgeClass(saleRoadmap.currentStage.status)}`}>
            {roadmapStatusLabel(saleRoadmap.currentStage.status)}
          </span>
        </aside>
      </section>

      <section className="settings-signal-board sale-roadmap-grid" aria-label="下一階段販售路線圖">
        {saleRoadmap.stages.map((stage) => (
          <a className={`settings-signal-card ${roadmapTone(stage.status)}`} href={stage.actionHref} key={stage.id}>
            <span>
              第 {stage.step} 階段 · {stage.owner}
            </span>
            <strong>{stage.title}</strong>
            <small>{stage.signal}</small>
            <small>{stage.kpiTarget}</small>
          </a>
        ))}
      </section>

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

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>試用批次</h2>
              <p className="muted">
                把 20-50 人、2 週試用變成可追蹤批次；每次同步只保存 readiness 摘要 hash、狀態與人數，不保存薪資、身分證、銀行帳號或私人備註原文。
              </p>
            </div>
            <span className="inline-actions">
              <a className="button" href="/settings/pilot-trial-run">
                開啟控制台
              </a>
              <span className={`badge ${trialWorkspace.readyForPilot ? "" : trialWorkspace.openBlockedCount ? "danger" : "warning"}`}>
                {readinessStatusLabel(trialWorkspace.readinessStatus)}
              </span>
            </span>
          </div>
          <div className={`panel-subtle ${trialWorkspace.persistence.readyForLiveTrial ? "" : "danger-panel"}`}>
            <strong>{persistenceModeLabel(trialWorkspace.persistence.mode)}</strong>
            <span className="muted">{trialWorkspace.persistence.detail}</span>
          </div>
          <div className="trial-summary-grid">
            <div className="trial-summary-stat">
              <span className="muted">批次狀態</span>
              <strong>{trialWorkspace.trialRun ? trialStatusLabel(trialWorkspace.trialRun.status) : "尚未建立"}</strong>
              <span className="badge">{trialWorkspace.trialRun ? `第 ${trialWorkspace.trialRun.currentDay} 天` : "planned"}</span>
            </div>
            <div className="trial-summary-stat">
              <span className="muted">試用人數</span>
              <strong>{trialWorkspace.trialRun?.expectedEmployeeCount ?? trialWorkspace.employeeCount}</strong>
              <span className={`badge ${(trialWorkspace.trialRun?.expectedEmployeeCount ?? trialWorkspace.employeeCount) >= 20 && (trialWorkspace.trialRun?.expectedEmployeeCount ?? trialWorkspace.employeeCount) <= 50 ? "" : "warning"}`}>
                目標 20-50
              </span>
            </div>
            <div className="trial-summary-stat">
              <span className="muted">主管數</span>
              <strong>{trialWorkspace.trialRun?.managerCount ?? trialWorkspace.managerCount}</strong>
              <span className={`badge ${(trialWorkspace.trialRun?.managerCount ?? trialWorkspace.managerCount) > 0 ? "" : "danger"}`}>
                簽核負責人
              </span>
            </div>
            <div className="trial-summary-stat">
              <span className="muted">批次事件</span>
              <strong>{trialWorkspace.trialRun?.eventCount ?? 0}</strong>
              <span className="badge">audit snapshots</span>
            </div>
          </div>
          <div className="task-list">
            <div className="task">
              <span>
                <strong>試用期間</strong>
                <small>
                  {formatDate(trialWorkspace.trialRun?.startsAt ?? trialWorkspace.suggestedStartsAt)}
                  {" - "}
                  {formatDate(trialWorkspace.trialRun?.endsAt ?? trialWorkspace.suggestedEndsAt)}
                </small>
                <small>
                  {trialWorkspace.trialRun?.lastEventAt
                    ? `最後同步 ${formatDateTime(trialWorkspace.trialRun.lastEventAt)}`
                    : "建立批次後，系統會保留每次 readiness 同步的 hash-only 證據。"}
                </small>
                {trialWorkspace.trialRun?.evidenceSummaryHash ? (
                  <small>證據摘要 hash · {shortHash(trialWorkspace.trialRun.evidenceSummaryHash)}</small>
                ) : null}
              </span>
              <span className="inline-actions">
                <span className={`badge ${trialWorkspace.openBlockedCount ? "danger" : trialWorkspace.openActionRequiredCount ? "warning" : ""}`}>
                  {trialWorkspace.openBlockedCount} blocker / {trialWorkspace.openActionRequiredCount} 待處理
                </span>
              </span>
            </div>
          </div>
          {hasPermission(session.role, "pilot:manage") ? (
            <form action="/api/settings/beta-pilot-trial-run" method="post" className="mini-form compact-form">
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
                  <input name="notes" placeholder="例如 PILOT-2026-06-A；內容只存 hash，請勿輸入個資或薪資。" />
                </label>
              </div>
              <button className="button primary" type="submit">
                {trialWorkspace.persistence.readyForLiveTrial ? "建立/同步試用批次" : "演練同步試用批次"}
              </button>
            </form>
          ) : null}
        </section>

        <section className="panel span-12" id="pilot-runbook">
          <div className="section-heading">
            <div>
              <h2>2 週試用 Gate</h2>
              <p className="muted">
                目標是讓一家公司 20-50 人實際試用 2 週，完成打卡、請假、簽核、公告、HR 月結預演、薪資單查看，且不發生權限與敏感資料外洩。
              </p>
            </div>
            <div className="inline-actions">
              <a className="button" href="/settings/company-setup">
                導入精靈
              </a>
              <span className={`badge ${betaPilot.readyForPilot ? "" : betaPilot.blockedCount ? "danger" : "warning"}`}>
                {betaPilot.readyForPilot ? "可開始試用" : "尚未可試用"}
              </span>
              {hasPermission(session.role, "pilot:manage") ? (
                <form action="/api/settings/beta-pilot-rehearsal" method="post" className="compact-form">
                  <button className="button primary" type="submit">
                    跑 Beta 演練
                  </button>
                </form>
              ) : null}
              <a className="button" href="/settings/pilot-operations">
                每日戰情
              </a>
            </div>
          </div>
          <p className="muted">
            Demo 模式會自動串接員工端與後台流程；正式資料庫模式會保守阻擋，避免對真實客戶資料產生假操作。
          </p>
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
            <span className="inline-actions">
              <a className="button" href="/settings/pilot-operations">
                開啟每日戰情
              </a>
              <span className={`badge ${betaPilot.runbook.some((step) => step.status === "blocked") ? "danger" : betaPilot.runbook.some((step) => step.status === "action_required") ? "warning" : ""}`}>
                {betaPilot.runbook.filter((step) => step.status === "ready").length}/{betaPilot.runbook.length} ready
              </span>
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
                {step.id === "preflight" ? (
                  <form action="/api/settings/beta-pilot-access-review" method="post" className="mini-form compact-form">
                    <span className="muted">自動檢查薪資與個資防漏，不讀取薪資金額或銀行帳號。</span>
                    <button className="button primary" type="submit">
                      跑權限防漏檢查
                    </button>
                  </form>
                ) : null}
                {step.id === "day_14" ? (
                  <form action="/api/settings/beta-pilot-final-review" method="post" className="mini-form compact-form">
                    <span className="muted">依目前 gate 產生第 14 天結案 checkpoint；未過關會記錄 blocked 或處理中，不會存 raw 個資或薪資。</span>
                    <button className="button primary" type="submit">
                      跑試用結案檢查
                    </button>
                  </form>
                ) : null}
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
                <strong>0. Complete company setup wizard</strong>
                <small>確認公司、員工、帳號、班表、打卡、假別、公告與薪資單設定。</small>
              </span>
              <a className="button" href="/settings/company-setup">
                開啟精靈
              </a>
            </li>
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
            <li className="task">
              <span>
                <strong>6. Verify invite readiness</strong>
                <small>pnpm pilot:invite-readiness -- --tenant-slug=&lt;customer-slug&gt;</small>
              </span>
              <a className="button" href="/settings/pilot-invite-readiness">
                開啟畫面
              </a>
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

function roadmapStatusLabel(status: string) {
  if (status === "ready") return "已就緒";
  if (status === "blocked") return "阻擋";
  return "需處理";
}

function roadmapTone(status: string) {
  if (status === "blocked") return "danger";
  if (status === "action_required") return "warning";
  return "done";
}

function readinessStatusLabel(status: string) {
  if (status === "ready") return "可開始試用";
  if (status === "blocked") return "有阻擋項";
  return "需先處理";
}

function trialStatusLabel(status: string) {
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

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatInputDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
