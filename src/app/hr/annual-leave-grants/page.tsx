import Link from "next/link";
import { redirect } from "next/navigation";
import { dashboardPathForRole, hasPermission } from "@/server/auth/rbac";
import { getDemoSession } from "@/server/auth/session";
import {
  getAnnualLeaveGrantWorkspace,
  type AnnualLeaveGrantWorkspace,
} from "@/server/leave/annual-leave-grants";

type SearchParams = Promise<{
  asOfDate?: string;
  error?: string;
}>;

export default async function AnnualLeaveGrantsPage({ searchParams }: { searchParams: SearchParams }) {
  const [params, session] = await Promise.all([searchParams, getDemoSession()]);
  if (!hasPermission(session.role, "employee:write")) {
    redirect(dashboardPathForRole(session.role));
  }

  const asOfDate = parseDate(params.asOfDate) ?? new Date();
  const workspace = await getAnnualLeaveGrantWorkspace(session, asOfDate);
  const focus = buildGrantFocus(workspace);
  const totalEntitlementUnits = workspace.rows.reduce((sum, row) => sum + row.entitlementUnits, 0);
  const totalCarryoverUnits = workspace.rows.reduce((sum, row) => sum + row.carryoverUnits, 0);
  const carryoverCount = workspace.rows.filter((row) => row.carryoverUnits > 0).length;

  return (
    <main className="page annual-leave-grant-page">
      <section className="hr-monthly-hero annual-leave-grant-hero" aria-label="特休年度給假工作台">
        <div className="hr-monthly-hero-main">
          <div className="hr-monthly-hero-topline">
            <span className="badge">特休給假</span>
            <span className="badge">勞基法第 38 條</span>
            <span className="badge">年度批次</span>
            <span className={`badge ${workspace.lastRunAt ? "done" : "warning"}`}>
              {workspace.lastRunAt ? "已建立批次" : "待建立批次"}
            </span>
          </div>
          <h1>特休年度給假工作台</h1>
          <p>
            用第 38 條年資級距預覽每位員工的特休額度，將前一年度未休可遞延日數帶入新年度，再由 HR 明確建立批次、通知員工並寫入 audit log。
          </p>
          <div className="hr-monthly-hero-actions">
            <a className="button primary" href="#annual-leave-grant-form">
              建立年度給假批次
            </a>
            <Link className="button" href="/hr/annual-leave-expiry">
              到期提醒
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
        <section className="annual-leave-grant-alerts" aria-live="polite">
          <div className="panel danger-panel">
            <strong>特休給假批次未建立</strong>
            <p>{localizeGrantError(params.error)}</p>
          </div>
        </section>
      ) : null}

      <section className="hr-monthly-signal-board annual-leave-grant-signal-board" aria-label="特休給假訊號板">
        <article className="hr-monthly-signal-card done">
          <span>給假基準日</span>
          <strong>{formatDate(workspace.asOfDate)}</strong>
          <small>依此日期計算年資月數與第 38 條特休級距。</small>
        </article>
        <article className="hr-monthly-signal-card done">
          <span>員工預覽</span>
          <strong>{workspace.rows.length}</strong>
          <small>只處理目前 active 員工；離職與留停異動需走人事異動流程。</small>
        </article>
        <article className={`hr-monthly-signal-card ${carryoverCount ? "warning" : "done"}`}>
          <span>遞延假</span>
          <strong>{formatUnits(totalCarryoverUnits)} 日</strong>
          <small>{carryoverCount} 位員工有前年度可遞延日數，請先確認公司政策與協議。</small>
        </article>
        <article className="hr-monthly-signal-card done">
          <span>audit log</span>
          <strong>{workspace.auditCount}</strong>
          <small>年度批次與每位員工 leave balance 變更都需留痕。</small>
        </article>
      </section>

      <section className="settings-command-grid annual-leave-grant-command-grid" aria-label="特休給假作業卡">
        <article className="settings-command-card ready">
          <span className="badge done">第 38 條</span>
          <h2>年資級距 Gate</h2>
          <p>滿 6 個月、1 年、2 年、3 年、5 年、10 年以上級距都由規則版本計算。</p>
          <a className="button primary" href="#annual-leave-grant-form">
            建立批次
          </a>
        </article>
        <article className={`settings-command-card ${carryoverCount ? "warning" : "ready"}`}>
          <span className={`badge ${carryoverCount ? "warning" : "done"}`}>{carryoverCount} 位</span>
          <h2>遞延假先看</h2>
          <p>前年度未休特休若協議遞延，下一年度請休時應優先扣除，月結前要能追蹤。</p>
          <Link className="button" href="/hr/annual-leave-expiry">
            到期提醒
          </Link>
        </article>
        <article className="settings-command-card ready">
          <span className="badge done">通知員工</span>
          <h2>餘額同步</h2>
          <p>批次建立後員工會收到站內通知，手機首頁可看到最新特休餘額。</p>
          <Link className="button" href="/app">
            員工前台
          </Link>
        </article>
        <article className="settings-command-card warning">
          <span className="badge warning">法遵鏈</span>
          <h2>結清銜接</h2>
          <p>給假、到期提醒、未休結清應串成同一條月結流程，避免月底才發現未休工資。</p>
          <Link className="button" href="/hr/annual-leave-settlements">
            特休結清
          </Link>
        </article>
      </section>

      <section className="grid">
        <section className="panel span-7" id="annual-leave-grant-form">
          <div className="section-heading">
            <div>
              <h2>三步年度給假批次</h2>
              <p className="muted">先預覽年資與遞延日數，再由 HR 明確建立 leave balance 批次。</p>
            </div>
            <span className="badge">{formatUnits(totalEntitlementUnits)} 日新額度</span>
          </div>
          <form action="/api/leave/annual-grants" method="post" className="wizard-form annual-leave-grant-form" aria-label="特休年度給假批次">
            <fieldset className="form-card annual-leave-grant-fieldset">
              <legend>1. 設定給假基準日</legend>
              <p className="muted">通常使用年度起始日或公司約定的特休年度切點；系統會用該日期計算服務年資。</p>
              <label>
                給假基準日
                <input name="asOfDate" type="date" defaultValue={formatDateInput(workspace.asOfDate)} required />
              </label>
            </fieldset>
            <fieldset className="form-card annual-leave-grant-fieldset">
              <legend>2. 複核級距與遞延</legend>
              <p className="muted">
                本次預覽 {workspace.rows.length} 位員工，新增特休 {formatUnits(totalEntitlementUnits)} 日，遞延 {formatUnits(totalCarryoverUnits)} 日。
              </p>
            </fieldset>
            <fieldset className="form-card annual-leave-grant-fieldset">
              <legend>3. 建立批次與通知</legend>
              <p className="muted">建立後會 upsert 員工特休餘額、重置年度使用桶、通知員工並寫 audit log。</p>
            </fieldset>
            <button className="button primary" type="submit">
              建立特休給假批次
            </button>
          </form>
        </section>

        <aside className="panel span-5" id="annual-leave-grant-law">
          <div className="section-heading">
            <div>
              <h2>法規與規則版本</h2>
              <p className="muted">特休級距不硬寫在頁面，由台灣勞基法規則版本提供。</p>
            </div>
            <Link className="button" href="/settings/law-rules">
              規則版本
            </Link>
          </div>
          <ul className="task-list compact">
            <li className="task annual-leave-grant-mini-task">
              <span>
                <strong>勞基法第 38 條</strong>
                <small>特休級距、勞工排定、年度終結或契約終止未休工資。</small>
              </span>
              <a className="button" href="https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?flno=38&id=FL014930" rel="noreferrer" target="_blank">
                官方法源
              </a>
            </li>
            <li className="task annual-leave-grant-mini-task">
              <span>
                <strong>施行細則第 24-1 條</strong>
                <small>遞延特休在次年度請休時優先扣除，未休仍需接到結清流程。</small>
              </span>
              <a className="button" href="https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?flno=24-1&id=FL014931" rel="noreferrer" target="_blank">
                官方法源
              </a>
            </li>
          </ul>
          {workspace.lastRunAt ? (
            <p className="muted">最近批次：{formatDateTime(workspace.lastRunAt)}</p>
          ) : (
            <p className="muted">尚未建立年度給假批次。</p>
          )}
        </aside>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>給假預覽清單</h2>
              <p className="muted">HR 建立批次前，先確認服務年資、特休級距、遞延日數與總可用日數。</p>
            </div>
            <span className="badge">{workspace.rows.length} 位</span>
          </div>
          <ul className="task-list annual-leave-grant-list">
            {workspace.rows.map((row) => (
              <li className={`task annual-leave-grant-task ${row.carryoverUnits ? "warning" : "done"}`} key={row.employeeId}>
                <span>
                  <strong>{row.employeeName}</strong>
                  <small>
                    到職 {formatDate(row.hireDate)} · 年資 {row.serviceMonths} 個月 · 來源 {row.sourceIds.map(sourceLabel).join("、") || "待補來源"}
                  </small>
                  <small>
                    本年度 {formatUnits(row.entitlementUnits)} 日 · 遞延 {formatUnits(row.carryoverUnits)} 日
                  </small>
                </span>
                <span className={`badge ${row.carryoverUnits ? "warning" : "done"}`}>
                  共 {formatUnits(row.totalAvailableUnits)} 日
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-12" id="annual-leave-grant-guardrails">
          <div className="section-heading">
            <div>
              <h2>特休給假治理原則</h2>
              <p className="muted">讓 HR 能批次給假，但每個數字都有來源、員工通知與可追溯紀錄。</p>
            </div>
            <Link className="button" href="/settings/audit">
              audit log
            </Link>
          </div>
          <div className="annual-leave-grant-guardrail-grid">
            <article>
              <span className="badge done">規則版本</span>
              <strong>級距不硬寫在 UI</strong>
              <p>頁面只呈現結果；特休級距由 law_rules / rule_versions 與測試過的規則引擎計算。</p>
            </article>
            <article>
              <span className="badge warning">遞延假</span>
              <strong>前年度日數獨立追蹤</strong>
              <p>carryoverUnits 和 currentYearUnits 分開保存，後續請假與結清才能先扣遞延日數。</p>
            </article>
            <article>
              <span className="badge done">通知</span>
              <strong>員工看得到餘額更新</strong>
              <p>批次建立會發出站內通知，員工前台不需要進複雜選單就能看到最新假別餘額。</p>
            </article>
            <article>
              <span className="badge">月結</span>
              <strong>年底前接到期與結清</strong>
              <p>年度給假不是終點；到期提醒與未休工資結清會接到薪資月結 Gate。</p>
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}

function buildGrantFocus(workspace: AnnualLeaveGrantWorkspace) {
  if (!workspace.lastRunAt) {
    return {
      tone: "warning",
      title: "先建立年度給假批次",
      detail: `目前預覽 ${workspace.rows.length} 位員工，請確認年資級距與遞延日數後建立批次。`,
      note: "批次建立後才會更新 leave balance 並通知員工。",
      href: "#annual-leave-grant-form",
      actionLabel: "建立批次",
    };
  }
  return {
    tone: "ready",
    title: "批次已建立，追蹤到期",
    detail: `最近批次 ${formatDateTime(workspace.lastRunAt)}，下一步請追蹤遞延假與年底到期提醒。`,
    note: "月底月結前請確認未休特休是否需要結清。",
    href: "/hr/annual-leave-expiry",
    actionLabel: "到期提醒",
  };
}

function sourceLabel(sourceId: string) {
  const labels: Record<string, string> = {
    "tw-lsa-article-38": "勞基法第 38 條",
    "tw-lsa-enforcement-article-24-1": "施行細則第 24-1 條",
  };
  return labels[sourceId] ?? sourceId;
}

function localizeGrantError(error: string) {
  return error
    .replace("Active annual leave policy is required before grant batch.", "請先建立啟用中的特休假別政策，再執行給假批次。")
    .replace("Unable to run annual leave grant batch.", "無法建立特休給假批次。");
}

function parseDate(value?: string) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatUnits(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
