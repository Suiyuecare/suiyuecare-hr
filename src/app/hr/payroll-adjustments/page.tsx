import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";
import { dashboardPathForRole, hasPermission } from "@/server/auth/rbac";
import { getDemoSession } from "@/server/auth/session";
import {
  getPayrollAdjustmentWorkspace,
  type PayrollAdjustmentView,
  type PayrollAdjustmentWorkspace,
} from "@/server/payroll/adjustments";

type SearchParams = Promise<{
  error?: string;
}>;

export default async function PayrollAdjustmentsPage({ searchParams }: { searchParams: SearchParams }) {
  const [params, session] = await Promise.all([searchParams, getDemoSession()]);
  if (!hasPermission(session.role, "payroll:manage")) {
    redirect(dashboardPathForRole(session.role));
  }

  const workspace = await getPayrollAdjustmentWorkspace(session);
  if (!workspace.payrollRun) {
    return (
      <main className="page payroll-adjustment-page">
        <section className="hr-monthly-hero payroll-adjustment-hero" aria-label="薪資鎖定後調整工作台">
          <div className="hr-monthly-hero-main">
            <div className="hr-monthly-hero-topline">
              <span className="badge">薪資調整</span>
              <span className="badge danger">尚未有薪資 run</span>
            </div>
            <h1>薪資鎖定後調整工作台</h1>
            <p>請先建立、試算、確認並鎖定薪資 run，才可走顯式調整單。HR One 不允許直接改已鎖定薪資。</p>
            <div className="hr-monthly-hero-actions">
              <Link className="button primary" href="/hr">
                回 HR 月結
              </Link>
              <Link className="button" href="/hr/salary-profiles">
                薪資資料
              </Link>
            </div>
          </div>
          <aside className="hr-monthly-hero-focus danger" aria-label="今日先處理">
            <span className="badge">今日先處理</span>
            <strong>先建立並鎖定薪資 run</strong>
            <p>沒有薪資 run 時不能申請調整，避免在沒有月結上下文的情況下產生錯帳。</p>
            <small>調整單只適用 locked 或 released 狀態。</small>
          </aside>
        </section>
        <EmptyState
          title="尚未有可調整的薪資 run"
          body="請先完成薪資試算、HR 確認與薪資鎖定，再從這裡建立調整單。"
        />
      </main>
    );
  }

  const canAdjust = workspace.payrollRun.status === "locked" || workspace.payrollRun.status === "released";
  const canApprove = hasPermission(session.role, "payroll_adjustment:approve");
  const pendingAdjustments = workspace.adjustments.filter((adjustment) => adjustment.status === "pending");
  const appliedAdjustments = workspace.adjustments.filter((adjustment) => adjustment.status === "applied");
  const rejectedAdjustments = workspace.adjustments.filter((adjustment) => adjustment.status === "rejected");
  const summary = buildAdjustmentSummary(workspace, canAdjust);
  const focus = buildAdjustmentFocus(workspace, canAdjust, pendingAdjustments.length, canApprove);

  return (
    <main className="page payroll-adjustment-page">
      <section className="hr-monthly-hero payroll-adjustment-hero" aria-label="薪資鎖定後調整工作台">
        <div className="hr-monthly-hero-main">
          <div className="hr-monthly-hero-topline">
            <span className="badge">薪資調整</span>
            <span className="badge">顯式流程</span>
            <span className="badge">Owner 核准</span>
            <span className={`badge ${canAdjust ? "done" : "danger"}`}>
              {canAdjust ? "可建立調整單" : "尚未鎖定"}
            </span>
          </div>
          <h1>薪資鎖定後調整工作台</h1>
          <p>
            已鎖定或已釋出的薪資不得靜默修改。HR 只能建立有原因的調整單，Owner 從統一 Inbox 核准後才會套用到 payroll item / payslip，所有步驟都寫 audit log。
          </p>
          <div className="hr-monthly-hero-actions">
            <Link className="button primary" href="#payroll-adjustment-request">
              建立調整單
            </Link>
            <Link className="button" href="/manager/inbox">
              Owner Inbox
            </Link>
            <Link className="button" href="/settings/audit">
              audit log
            </Link>
          </div>
        </div>

        <aside className={`hr-monthly-hero-focus ${focus.tone}`} aria-label="今日先處理">
          <span className="badge">今日先處理</span>
          <strong>{focus.title}</strong>
          <p>{focus.detail}</p>
          <small>{focus.note}</small>
          <a className="button primary" href={focus.href}>
            {focus.actionLabel}
          </a>
        </aside>
      </section>

      {params.error ? (
        <section className="payroll-adjustment-alerts" aria-live="polite">
          <div className="panel danger-panel">
            <strong>薪資調整未送出</strong>
            <p>{localizeAdjustmentError(params.error)}</p>
          </div>
        </section>
      ) : null}

      <section className="hr-monthly-signal-board payroll-adjustment-signal-board" aria-label="薪資調整訊號板">
        <article className={`hr-monthly-signal-card ${canAdjust ? "done" : "danger"}`}>
          <span>薪資 run 狀態</span>
          <strong>{payrollRunStatusLabel(workspace.payrollRun.status)}</strong>
          <small>{workspace.payrollRun.periodLabel} · {canAdjust ? "可走調整單" : "請先完成鎖定或釋出"}</small>
        </article>
        <article className={`hr-monthly-signal-card ${pendingAdjustments.length ? "warning" : "done"}`}>
          <span>待 Owner 核准</span>
          <strong>{pendingAdjustments.length}</strong>
          <small>薪資敏感變更需由 Owner 明確核准，不提供快速自動套用。</small>
        </article>
        <article className="hr-monthly-signal-card done">
          <span>已入帳調整</span>
          <strong>{appliedAdjustments.length}</strong>
          <small>核准後才會新增 payroll item 並更新已釋出的 payslip。</small>
        </article>
        <article className={`hr-monthly-signal-card ${rejectedAdjustments.length ? "warning" : "done"}`}>
          <span>已退回</span>
          <strong>{rejectedAdjustments.length}</strong>
          <small>退回不改薪資，只保留決議與稽核紀錄。</small>
        </article>
      </section>

      <section className="settings-command-grid payroll-adjustment-command-grid" aria-label="薪資調整作業卡">
        <article className={`settings-command-card ${canAdjust ? "ready" : "danger"}`}>
          <span className={`badge ${canAdjust ? "done" : "danger"}`}>{canAdjust ? "開放" : "封鎖"}</span>
          <h2>鎖定後調整 Gate</h2>
          <p>只有 locked / released 狀態能建立調整單；draft 或 calculated 不該用調整單修資料。</p>
          <a className="button primary" href="#payroll-adjustment-request">
            建立調整單
          </a>
        </article>
        <article className={`settings-command-card ${pendingAdjustments.length ? "warning" : "ready"}`}>
          <span className={`badge ${pendingAdjustments.length ? "warning" : "done"}`}>{pendingAdjustments.length} 筆</span>
          <h2>Owner 核准</h2>
          <p>所有待核准薪資調整會進統一 Inbox，避免 HR 自己送出又自己套用。</p>
          <Link className="button" href="/manager/inbox">
            開啟 Inbox
          </Link>
        </article>
        <article className="settings-command-card ready">
          <span className="badge done">全留痕</span>
          <h2>Audit log 覆蓋</h2>
          <p>create、approve、reject 都寫 audit log，metadata 只存狀態與參照，不輸出薪資原文。</p>
          <Link className="button" href="/settings/audit">
            查看稽核
          </Link>
        </article>
        <article className="settings-command-card warning">
          <span className="badge warning">敏感資料</span>
          <h2>薪資資料護欄</h2>
          <p>原因欄只填業務原因與安全參照，不填身分證、銀行帳號、健康資料或私密備註。</p>
          <a className="button" href="#payroll-adjustment-guardrails">
            查看護欄
          </a>
        </article>
      </section>

      <section className="grid">
        <section className={`panel span-12 payroll-adjustment-gate ${canAdjust ? "ready" : "danger"}`} aria-label="鎖定後調整 Gate">
          <div className="section-heading">
            <div>
              <h2>{canAdjust ? "鎖定後調整 Gate 已開放" : "鎖定後調整 Gate 未開放"}</h2>
              <p className="muted">{summary.gateDetail}</p>
            </div>
            <span className={`badge ${canAdjust ? "done" : "danger"}`}>
              {payrollRunStatusLabel(workspace.payrollRun.status)}
            </span>
          </div>
          <div className="payroll-adjustment-flow" aria-label="薪資調整流程">
            {[
              ["1", "HR 建立調整單", "填員工、加給/扣款、金額與原因。"],
              ["2", "Owner Inbox 核准", "Owner 確認原因與支持證據後核准或退回。"],
              ["3", "套用並封存", "核准後新增 payroll item / payslip 變更並寫 audit log。"],
            ].map(([step, title, detail]) => (
              <article key={step}>
                <span className="badge">{step}</span>
                <strong>{title}</strong>
                <small>{detail}</small>
              </article>
            ))}
          </div>
        </section>

        <section className="panel span-7" id="payroll-adjustment-request">
          <div className="section-heading">
            <div>
              <h2>三步薪資調整單</h2>
              <p className="muted">建立後只會進待核准，不會直接改薪資或薪資單。</p>
            </div>
            <span className={`badge ${canAdjust ? "done" : "danger"}`}>
              {canAdjust ? "可送出" : "需先鎖定"}
            </span>
          </div>

          <form action="/api/payroll/adjustments/apply" method="post" className="wizard-form payroll-adjustment-form" aria-label="薪資調整單">
            <input type="hidden" name="payrollRunId" value={workspace.payrollRun.id} />
            <fieldset className="form-card payroll-adjustment-fieldset">
              <legend>1. 選擇員工</legend>
              <p className="muted">只列出目前公司員工；跨 tenant/company 的員工不會被接受。</p>
              <label>
                員工
                <select name="employeeId" required disabled={!canAdjust}>
                  {workspace.employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.employeeNo} · {employee.displayName}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>

            <fieldset className="form-card payroll-adjustment-fieldset">
              <legend>2. 調整類型與金額</legend>
              <p className="muted">加給會增加淨薪，扣款會增加扣除；金額需由 HR 人工確認。</p>
              <div className="field-grid">
                <label>
                  調整類型
                  <select name="kind" defaultValue="allowance" disabled={!canAdjust}>
                    <option value="allowance">加給</option>
                    <option value="deduction">扣款</option>
                  </select>
                </label>
                <label>
                  金額
                  <input name="amount" type="number" min="1" step="1" required disabled={!canAdjust} />
                </label>
              </div>
            </fieldset>

            <fieldset className="form-card payroll-adjustment-fieldset">
              <legend>3. 原因與證據</legend>
              <p className="muted">請填可稽核的業務原因或證據編號；不要輸入完整薪資明細、銀行帳號、身分證或健康資料。</p>
              <label>
                調整原因
                <input name="reason" minLength={4} required disabled={!canAdjust} placeholder="例：補發交通津貼，證據單號 HR-ADJ-2026-001" />
              </label>
            </fieldset>

            <button className="button primary" type="submit" disabled={!canAdjust}>
              送出 Owner 核准
            </button>
          </form>
        </section>

        <aside className="panel span-5">
          <div className="section-heading">
            <div>
              <h2>Owner 核准狀態</h2>
              <p className="muted">薪資敏感調整集中在 Inbox，避免散落各頁。</p>
            </div>
            <span className={`badge ${pendingAdjustments.length ? "warning" : "done"}`}>
              {pendingAdjustments.length} 待處理
            </span>
          </div>
          {pendingAdjustments.length === 0 ? (
            <p className="muted">目前沒有待 Owner 核准的薪資調整。</p>
          ) : (
            <ul className="task-list compact">
              {pendingAdjustments.map((adjustment) => (
                <li className="task payroll-adjustment-mini-task" key={adjustment.id}>
                  <span>
                    <strong>
                      {adjustment.employeeName} · {adjustmentKindLabel(adjustment.kind)}
                    </strong>
                    <small>{adjustment.reason}</small>
                  </span>
                  <span className="badge warning">{formatMoney(adjustment.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          <Link className="button primary" href="/manager/inbox">
            到 Owner Inbox 處理
          </Link>
        </aside>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>薪資調整紀錄</h2>
              <p className="muted">狀態、原因與決議會保留；已核准才代表 payroll item / payslip 已變更。</p>
            </div>
            <span className="badge">{workspace.adjustments.length} 筆</span>
          </div>
          {workspace.adjustments.length === 0 ? (
            <p className="muted">目前尚無薪資調整紀錄。</p>
          ) : (
            <ul className="task-list payroll-adjustment-log">
              {workspace.adjustments.map((adjustment) => (
                <li className="task payroll-adjustment-log-task" key={adjustment.id}>
                  <span>
                    <strong>
                      {adjustment.employeeName} · {adjustmentKindLabel(adjustment.kind)}
                    </strong>
                    <small>
                      {adjustment.reason}
                      {adjustment.decisionComment ? ` · 決議：${adjustment.decisionComment}` : ""}
                    </small>
                    <small>{adjustmentDateLabel(adjustment)}</small>
                  </span>
                  <span className={`badge ${badgeClassForAdjustment(adjustment.status, adjustment.kind)}`}>
                    {adjustmentStatusLabel(adjustment.status)} · {formatMoney(adjustment.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel span-12" id="payroll-adjustment-guardrails">
          <div className="section-heading">
            <div>
              <h2>薪資調整治理原則</h2>
              <p className="muted">讓 HR 可以修正錯帳，但不讓已關帳薪資被靜默竄改。</p>
            </div>
            <Link className="button" href="/hr/payroll-exports">
              發薪封存
            </Link>
          </div>
          <div className="payroll-adjustment-guardrail-grid">
            <article>
              <span className="badge danger">不得靜默修改</span>
              <strong>locked payroll 只能走調整單</strong>
              <p>已鎖定或已釋出的薪資不能直接改 payroll item；所有更正需建立明確調整單。</p>
            </article>
            <article>
              <span className="badge warning">雙人控制</span>
              <strong>HR 送出，Owner 核准</strong>
              <p>HR 可以提出調整，Owner 才能核准套用，降低薪資敏感操作風險。</p>
            </article>
            <article>
              <span className="badge done">Audit 100%</span>
              <strong>create / approve / reject 全留痕</strong>
              <p>稽核紀錄只保存狀態、參照與遮罩 metadata，不把薪資細節寫進 log。</p>
            </article>
            <article>
              <span className="badge">AI 限制</span>
              <strong>AI 不得決定薪資調整</strong>
              <p>AI 可協助摘要原因或列出待查資料，但不得自動建議最終薪資加扣款決策。</p>
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}

function buildAdjustmentSummary(workspace: PayrollAdjustmentWorkspace, canAdjust: boolean) {
  return {
    gateDetail: canAdjust
      ? `${workspace.payrollRun?.periodLabel} 薪資 run 已是 ${payrollRunStatusLabel(workspace.payrollRun?.status ?? "")}，可以建立顯式調整單。`
      : `${workspace.payrollRun?.periodLabel} 薪資 run 仍是 ${payrollRunStatusLabel(workspace.payrollRun?.status ?? "")}，請先完成薪資確認與鎖定。`,
  };
}

function buildAdjustmentFocus(
  workspace: PayrollAdjustmentWorkspace,
  canAdjust: boolean,
  pendingCount: number,
  canApprove: boolean,
) {
  if (!canAdjust) {
    return {
      tone: "danger",
      title: "先完成薪資鎖定",
      detail: "目前薪資 run 尚未 locked/released，應回月結流程修正資料，不要建立鎖定後調整單。",
      note: "調整單是關帳後的明確修正流程。",
      href: "/hr",
      actionLabel: "回月結流程",
    };
  }
  if (pendingCount > 0 && canApprove) {
    return {
      tone: "warning",
      title: "先處理待核准調整",
      detail: `${pendingCount} 筆薪資調整等待 Owner 核准，請先確認原因與支持證據。`,
      note: "核准後才會套用到 payroll item / payslip。",
      href: "/manager/inbox",
      actionLabel: "開啟 Inbox",
    };
  }
  if (pendingCount > 0) {
    return {
      tone: "warning",
      title: "等待 Owner 核准",
      detail: `${pendingCount} 筆調整已送出，HR 不可自行套用。`,
      note: "Owner 核准前薪資金額不會改變。",
      href: "#payroll-adjustment-request",
      actionLabel: "查看申請",
    };
  }
  return {
    tone: "ready",
    title: "可建立必要調整",
    detail: "目前沒有待核准調整；若發現鎖定後錯帳，請建立調整單並送 Owner 核准。",
    note: "請先準備安全證據參照，避免在原因欄放敏感資料。",
    href: "#payroll-adjustment-request",
    actionLabel: "建立調整單",
  };
}

function payrollRunStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "草稿",
    calculated: "已試算",
    blocked: "有阻擋",
    confirmed: "HR 已確認",
    locked: "已鎖定",
    released: "已釋出",
  };
  return labels[status] ?? status;
}

function adjustmentKindLabel(kind: PayrollAdjustmentView["kind"]) {
  return kind === "deduction" ? "扣款" : "加給";
}

function adjustmentStatusLabel(status: PayrollAdjustmentView["status"]) {
  if (status === "pending") return "待核准";
  if (status === "applied") return "已入帳";
  return "已退回";
}

function badgeClassForAdjustment(status: PayrollAdjustmentView["status"], kind: PayrollAdjustmentView["kind"]) {
  if (status === "rejected") return "danger";
  if (status === "pending" || kind === "deduction") return "warning";
  return "done";
}

function adjustmentDateLabel(adjustment: PayrollAdjustmentView) {
  if (adjustment.decidedAt) return `決議 ${formatDate(adjustment.decidedAt)}`;
  if (adjustment.appliedAt) return `入帳 ${formatDate(adjustment.appliedAt)}`;
  return "尚未決議";
}

function localizeAdjustmentError(error: string) {
  return error
    .replace("Payroll run not found.", "找不到薪資 run。")
    .replace("Adjustments are only allowed after payroll is locked.", "只有薪資鎖定或釋出後才能建立調整單。")
    .replace("Employee not found for payroll adjustment.", "找不到要調整的員工。")
    .replace("Employee is required.", "請選擇員工。")
    .replace("Adjustment amount must be greater than zero.", "調整金額必須大於 0。")
    .replace("Adjustment reason is required.", "請填寫調整原因。")
    .replace("Payroll adjustment not found.", "找不到薪資調整單。")
    .replace("Only pending payroll adjustments can be decided.", "只有待核准的薪資調整單可以決議。")
    .replace("Unable to apply payroll adjustment.", "無法送出薪資調整單。");
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}
