import Link from "next/link";
import { redirect } from "next/navigation";
import { dashboardPathForRole, hasPermission } from "@/server/auth/rbac";
import { getDemoSession } from "@/server/auth/session";
import {
  getAnnualLeaveExpiryWorkspace,
  type AnnualLeaveExpiryRisk,
  type AnnualLeaveExpiryWorkspace,
} from "@/server/leave/annual-leave-expiry";

type SearchParams = Promise<{
  asOfDate?: string;
  warningDays?: string;
  error?: string;
}>;

export default async function AnnualLeaveExpiryPage({ searchParams }: { searchParams: SearchParams }) {
  const [params, session] = await Promise.all([searchParams, getDemoSession()]);
  if (!hasPermission(session.role, "employee:write")) {
    redirect(dashboardPathForRole(session.role));
  }

  const asOfDate = parseDate(params.asOfDate) ?? new Date();
  const warningDays = parseInteger(params.warningDays) ?? 60;
  const workspace = await getAnnualLeaveExpiryWorkspace(session, { asOfDate, warningDays });
  const warningRisks = workspace.risks.filter((risk) => risk.severity === "warning");
  const overdueRisks = workspace.risks.filter((risk) => risk.severity === "overdue");
  const carryoverRisks = workspace.risks.filter((risk) => risk.carryoverRemainingUnits > 0);
  const totalRemainingUnits = workspace.risks.reduce((sum, risk) => sum + risk.remainingUnits, 0);
  const focus = buildExpiryFocus(workspace, warningRisks.length, overdueRisks.length, carryoverRisks.length);

  return (
    <main className="page annual-leave-expiry-page">
      <section className="hr-monthly-hero annual-leave-expiry-hero" aria-label="特休到期提醒工作台">
        <div className="hr-monthly-hero-main">
          <div className="hr-monthly-hero-topline">
            <span className="badge">特休到期</span>
            <span className="badge">勞基法第 38 條</span>
            <span className="badge">施行細則第 24-1 條</span>
            <span className={`badge ${overdueRisks.length ? "danger" : warningRisks.length ? "warning" : "done"}`}>
              {overdueRisks.length ? "已有逾期" : warningRisks.length ? "需提醒" : "可追蹤"}
            </span>
          </div>
          <h1>特休到期提醒工作台</h1>
          <p>
            年底前先掃描未休特休與遞延日數，HR 複核後才發提醒。員工仍可自行排定特休；年度終結或契約終止仍未休時，再接到特休未休工資結清流程。
          </p>
          <div className="hr-monthly-hero-actions">
            <a className="button primary" href="#annual-leave-expiry-form">
              發送到期提醒
            </a>
            <Link className="button" href="/hr/annual-leave-grants">
              年度給假
            </Link>
            <Link className="button" href="/hr/annual-leave-settlements">
              未休結清
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
        <section className="annual-leave-expiry-alerts" aria-live="polite">
          <div className="panel danger-panel">
            <strong>特休到期提醒未送出</strong>
            <p>{localizeExpiryError(params.error)}</p>
          </div>
        </section>
      ) : null}

      <section className="hr-monthly-signal-board annual-leave-expiry-signal-board" aria-label="特休到期訊號板">
        <article className={`hr-monthly-signal-card ${overdueRisks.length ? "danger" : warningRisks.length ? "warning" : "done"}`}>
          <span>提醒風險</span>
          <strong>{warningRisks.length + overdueRisks.length}</strong>
          <small>{overdueRisks.length} 逾期 / {warningRisks.length} 接近到期。</small>
        </article>
        <article className="hr-monthly-signal-card done">
          <span>掃描基準日</span>
          <strong>{formatDate(workspace.asOfDate)}</strong>
          <small>提醒門檻 {workspace.warningDays} 天；表單送出後會保留同一個掃描條件。</small>
        </article>
        <article className={`hr-monthly-signal-card ${carryoverRisks.length ? "warning" : "done"}`}>
          <span>遞延假</span>
          <strong>{carryoverRisks.length}</strong>
          <small>遞延特休在次年度請休時應優先扣除，仍未休則接結清。</small>
        </article>
        <article className="hr-monthly-signal-card done">
          <span>audit log</span>
          <strong>{workspace.auditCount}</strong>
          <small>提醒批次只存風險筆數、門檻與來源，不存薪資或敏感資料。</small>
        </article>
      </section>

      <section className="settings-command-grid annual-leave-expiry-command-grid" aria-label="特休到期作業卡">
        <article className={`settings-command-card ${warningRisks.length || overdueRisks.length ? "warning" : "ready"}`}>
          <span className={`badge ${warningRisks.length || overdueRisks.length ? "warning" : "done"}`}>
            {warningRisks.length + overdueRisks.length} 筆
          </span>
          <h2>到期掃描</h2>
          <p>用基準日與提醒天數找出年底前需要先排休或準備結清的員工。</p>
          <a className="button primary" href="#annual-leave-expiry-form">
            發送提醒
          </a>
        </article>
        <article className={`settings-command-card ${carryoverRisks.length ? "warning" : "ready"}`}>
          <span className={`badge ${carryoverRisks.length ? "warning" : "done"}`}>{carryoverRisks.length} 位</span>
          <h2>遞延假優先扣</h2>
          <p>施行細則 24-1 要求遞延日數在次年度請休時優先扣除，HR 需在年底前看見。</p>
          <Link className="button" href="/hr/annual-leave-grants">
            年度給假
          </Link>
        </article>
        <article className="settings-command-card ready">
          <span className="badge done">HR 複核</span>
          <h2>提醒不自動結清</h2>
          <p>提醒只通知員工與留下紀錄；未休工資仍需進薪資月結與 HR 複核。</p>
          <Link className="button" href="/hr/annual-leave-settlements">
            結清工作台
          </Link>
        </article>
        <article className="settings-command-card warning">
          <span className="badge warning">{formatUnits(totalRemainingUnits)} 日</span>
          <h2>年底前解決率</h2>
          <p>把特休到期提醒接到 KPI，目標是月底前出勤與假勤異常自動解決率超過 90%。</p>
          <Link className="button" href="/hr/kpis">
            KPI 指揮台
          </Link>
        </article>
      </section>

      <section className="grid">
        <section className="panel span-7" id="annual-leave-expiry-form">
          <div className="section-heading">
            <div>
              <h2>三步到期提醒批次</h2>
              <p className="muted">先設定掃描門檻、複核風險清單，再由 HR 明確發出站內提醒。</p>
            </div>
            <span className="badge">{workspace.risks.length} 筆風險</span>
          </div>
          <form action="/api/leave/annual-expiry/remind" method="post" className="wizard-form annual-leave-expiry-form" aria-label="特休到期提醒批次">
            <fieldset className="form-card annual-leave-expiry-fieldset">
              <legend>1. 設定掃描條件</legend>
              <p className="muted">建議在年度終結前 60 到 90 天先提醒；試用或年底尖峰可拉長。</p>
              <div className="field-grid">
                <label>
                  掃描基準日
                  <input name="asOfDate" type="date" defaultValue={formatDateInput(workspace.asOfDate)} required />
                </label>
                <label>
                  提醒天數
                  <input name="warningDays" type="number" min="1" step="1" defaultValue={workspace.warningDays} required />
                </label>
              </div>
            </fieldset>
            <fieldset className="form-card annual-leave-expiry-fieldset">
              <legend>2. 複核風險清單</legend>
              <p className="muted">
                目前 {warningRisks.length} 筆接近到期、{overdueRisks.length} 筆逾期、{carryoverRisks.length} 位有遞延假。
              </p>
            </fieldset>
            <fieldset className="form-card annual-leave-expiry-fieldset">
              <legend>3. 發送提醒並留痕</legend>
              <p className="muted">系統會發出站內通知並寫入提醒批次 audit log；提醒不會自動核准請假或結清薪資。</p>
            </fieldset>
            <button className="button primary" type="submit">
              發送特休到期提醒
            </button>
          </form>
        </section>

        <aside className="panel span-5" id="annual-leave-expiry-law">
          <div className="section-heading">
            <div>
              <h2>法規來源</h2>
              <p className="muted">提醒文案與後續結清都要能追溯官方法源。</p>
            </div>
            <Link className="button" href="/settings/law-rules">
              規則版本
            </Link>
          </div>
          <ul className="task-list compact">
            <li className="task annual-leave-expiry-mini-task">
              <span>
                <strong>勞基法第 38 條</strong>
                <small>年度終結或契約終止未休特休需發給工資，且需清冊與書面通知。</small>
              </span>
              <a className="button" href="https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?flno=38&id=FL014930" rel="noreferrer" target="_blank">
                官方法源
              </a>
            </li>
            <li className="task annual-leave-expiry-mini-task">
              <span>
                <strong>施行細則第 24-1 條</strong>
                <small>遞延特休優先扣除；年度終結未休工資有發給期限。</small>
              </span>
              <a className="button" href="https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?flno=24-1&id=FL014931" rel="noreferrer" target="_blank">
                官方法源
              </a>
            </li>
          </ul>
        </aside>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>特休到期風險清單</h2>
              <p className="muted">HR 發提醒前，先確認每位員工的剩餘日數、遞延日數與到期狀態。</p>
            </div>
            <span className="badge">{workspace.risks.length} 筆</span>
          </div>
          {workspace.risks.length === 0 ? (
            <p className="muted">目前沒有特休到期風險。年底前仍建議定期掃描，避免未休工資在月結時才被發現。</p>
          ) : (
            <ul className="task-list annual-leave-expiry-list">
              {workspace.risks.map((risk) => (
                <li className={`task annual-leave-expiry-task ${riskTone(risk)}`} key={risk.employeeId}>
                  <span>
                    <strong>{risk.employeeName}</strong>
                    <small>
                      剩餘 {formatUnits(risk.remainingUnits)} 日 · 遞延 {formatUnits(risk.carryoverRemainingUnits)} 日 · 到期 {formatDate(risk.expiryDate)}
                    </small>
                    <small>{riskDescription(risk)}</small>
                  </span>
                  <span className={`badge ${riskTone(risk)}`}>
                    {riskDaysLabel(risk)} · {riskSeverityLabel(risk.severity)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel span-12" id="annual-leave-expiry-guardrails">
          <div className="section-heading">
            <div>
              <h2>到期提醒治理原則</h2>
              <p className="muted">提醒員工休假，但不替員工排假、不自動結清，也不把薪資資料暴露在提醒流程。</p>
            </div>
            <Link className="button" href="/settings/audit">
              audit log
            </Link>
          </div>
          <div className="annual-leave-expiry-guardrail-grid">
            <article>
              <span className="badge done">員工自主</span>
              <strong>提醒不等於強制排休</strong>
              <p>第 38 條原則上由勞工排定特休；提醒只提供資訊與下一步，不替員工提交請假。</p>
            </article>
            <article>
              <span className="badge warning">遞延特休</span>
              <strong>次年度優先扣除</strong>
              <p>有遞延日數的員工會被標示，後續請假、月結與結清都能追蹤。</p>
            </article>
            <article>
              <span className="badge done">不碰薪資</span>
              <strong>提醒不產生薪資項目</strong>
              <p>未休工資只在特休結清與薪資試算流程處理，提醒流程不顯示薪資值。</p>
            </article>
            <article>
              <span className="badge">Audit</span>
              <strong>批次留痕</strong>
              <p>發送提醒會寫入批次 audit log，保留門檻、風險筆數與來源 ID。</p>
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}

function buildExpiryFocus(
  workspace: AnnualLeaveExpiryWorkspace,
  warningCount: number,
  overdueCount: number,
  carryoverCount: number,
) {
  if (overdueCount > 0) {
    return {
      tone: "danger",
      title: "先處理逾期特休",
      detail: `${overdueCount} 筆特休已超過年度終結日，請確認是否要進未休工資結清。`,
      note: "提醒已不是主要動作，請銜接薪資月結與工資清冊。",
      href: "/hr/annual-leave-settlements",
      actionLabel: "進結清流程",
    };
  }
  if (warningCount > 0) {
    return {
      tone: "warning",
      title: "先發送到期提醒",
      detail: `${warningCount} 筆特休在 ${workspace.warningDays} 天門檻內，請 HR 複核後發提醒。`,
      note: "提醒不自動結清，也不替員工排假。",
      href: "#annual-leave-expiry-form",
      actionLabel: "發送提醒",
    };
  }
  if (carryoverCount > 0) {
    return {
      tone: "warning",
      title: "追蹤遞延特休",
      detail: `${carryoverCount} 位員工仍有遞延日數，年底前請持續提醒與月結追蹤。`,
      note: "遞延特休在次年度請休時應優先扣除。",
      href: "#annual-leave-expiry-form",
      actionLabel: "調整門檻",
    };
  }
  return {
    tone: "ready",
    title: "目前無到期風險",
    detail: "可維持每月掃描，年底前再拉高提醒門檻，避免未休特休集中到薪資月結。",
    note: "提醒批次仍會寫 audit log，方便日後證明 HR 有定期通知。",
    href: "#annual-leave-expiry-form",
    actionLabel: "建立提醒",
  };
}

function riskTone(risk: AnnualLeaveExpiryRisk) {
  if (risk.severity === "overdue") return "danger";
  if (risk.severity === "warning" || risk.carryoverRemainingUnits > 0) return "warning";
  return "done";
}

function riskDescription(risk: AnnualLeaveExpiryRisk) {
  if (risk.severity === "overdue") return "已超過年度終結日，請確認結清或更正資料。";
  if (risk.severity === "warning") return "接近年度終結，請提醒員工排休或準備結清複核。";
  if (risk.carryoverRemainingUnits > 0) return "尚未到提醒門檻，但仍有遞延特休需追蹤。";
  return "目前僅保留在追蹤清單。";
}

function riskDaysLabel(risk: AnnualLeaveExpiryRisk) {
  if (risk.daysUntilExpiry < 0) return `逾期 ${Math.abs(risk.daysUntilExpiry)} 天`;
  return `${risk.daysUntilExpiry} 天`;
}

function riskSeverityLabel(severity: AnnualLeaveExpiryRisk["severity"]) {
  if (severity === "overdue") return "已逾期";
  if (severity === "warning") return "接近到期";
  return "追蹤中";
}

function localizeExpiryError(error: string) {
  return error.replace("Unable to send annual leave expiry reminders.", "無法發送特休到期提醒。");
}

function parseDate(value?: string) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseInteger(value?: string) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatUnits(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
