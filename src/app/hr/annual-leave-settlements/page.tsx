import Link from "next/link";
import { redirect } from "next/navigation";
import { dashboardPathForRole, hasPermission } from "@/server/auth/rbac";
import { getDemoSession } from "@/server/auth/session";
import {
  getAnnualLeaveSettlementWorkspace,
  type AnnualLeaveSettlementView,
  type AnnualLeaveSettlementWorkspace,
} from "@/server/leave/annual-leave-settlements";

type SearchParams = Promise<{
  error?: string;
}>;

export default async function AnnualLeaveSettlementsPage({ searchParams }: { searchParams: SearchParams }) {
  const [params, session] = await Promise.all([searchParams, getDemoSession()]);
  if (!hasPermission(session.role, "payroll:manage")) {
    redirect(dashboardPathForRole(session.role));
  }

  const workspace = await getAnnualLeaveSettlementWorkspace(session);
  if (!workspace.payrollRun) {
    return (
      <main className="page annual-leave-settlement-page">
        <section className="hr-monthly-hero annual-leave-settlement-hero" aria-label="特休未休工資結清工作台">
          <div className="hr-monthly-hero-main">
            <div className="hr-monthly-hero-topline">
              <span className="badge">特休結清</span>
              <span className="badge danger">尚未有薪資 run</span>
            </div>
            <h1>特休未休工資結清工作台</h1>
            <p>
              年度終結或契約終止前，先建立薪資 run，再把未休特休日數轉成 HR 可複核的薪資草稿。HR One 不會在沒有月結上下文時產生結清金額。
            </p>
            <div className="hr-monthly-hero-actions">
              <Link className="button primary" href="/hr">
                回 HR 月結
              </Link>
              <Link className="button" href="/settings/law-rules">
                法規規則
              </Link>
            </div>
          </div>
          <aside className="hr-monthly-hero-focus danger" aria-label="今日先處理">
            <span className="badge">今日先處理</span>
            <strong>先建立薪資 run</strong>
            <p>特休未休工資需要和當月薪資試算、工資清冊與薪資單一起複核，請先回月結流程建立薪資 run。</p>
            <small>結清草稿只會在薪資鎖定前建立，避免關帳後被靜默修改。</small>
            <Link className="button primary" href="/hr">
              回月結流程
            </Link>
          </aside>
        </section>
      </main>
    );
  }

  const canPrepare = workspace.payrollRun.status !== "locked" && workspace.payrollRun.status !== "released";
  const draftCount = workspace.settlements.filter((settlement) => settlement.status === "draft").length;
  const includedCount = workspace.settlements.filter((settlement) => settlement.status === "included").length;
  const focus = buildSettlementFocus(workspace, canPrepare, draftCount, includedCount);

  return (
    <main className="page annual-leave-settlement-page">
      <section className="hr-monthly-hero annual-leave-settlement-hero" aria-label="特休未休工資結清工作台">
        <div className="hr-monthly-hero-main">
          <div className="hr-monthly-hero-topline">
            <span className="badge">特休結清</span>
            <span className="badge">勞基法第 38 條</span>
            <span className="badge">施行細則第 24-1 條</span>
            <span className={`badge ${canPrepare ? "done" : "danger"}`}>
              {canPrepare ? "可準備草稿" : "薪資已鎖定"}
            </span>
          </div>
          <h1>特休未休工資結清工作台</h1>
          <p>
            年度終結或契約終止前，先把未休特休日數轉成 HR 複核的薪資草稿。草稿進薪資試算後才會 included，薪資鎖定時才扣減假別餘額，所有批次都寫 audit log 並遮罩薪資值。
          </p>
          <div className="hr-monthly-hero-actions">
            <a className="button primary" href="#annual-leave-settlement-form">
              準備結清草稿
            </a>
            <Link className="button" href="/hr">
              回 HR 月結
            </Link>
            <Link className="button" href="/settings/law-rules">
              法規規則
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
        <section className="annual-leave-settlement-alerts" aria-live="polite">
          <div className="panel danger-panel">
            <strong>特休結清草稿未建立</strong>
            <p>{localizeSettlementError(params.error)}</p>
          </div>
        </section>
      ) : null}

      <section className="hr-monthly-signal-board annual-leave-settlement-signal-board" aria-label="特休結清訊號板">
        <article className={`hr-monthly-signal-card ${canPrepare ? "done" : "danger"}`}>
          <span>薪資 run 狀態</span>
          <strong>{payrollRunStatusLabel(workspace.payrollRun.status)}</strong>
          <small>{workspace.payrollRun.periodLabel} · {canPrepare ? "仍可準備結清草稿" : "已不可新增結清草稿"}</small>
        </article>
        <article className={`hr-monthly-signal-card ${draftCount ? "warning" : "done"}`}>
          <span>草稿待試算</span>
          <strong>{draftCount}</strong>
          <small>需重新試算薪資後才會列入 payroll item。</small>
        </article>
        <article className={`hr-monthly-signal-card ${includedCount ? "done" : "warning"}`}>
          <span>已納入薪資</span>
          <strong>{includedCount}</strong>
          <small>included 代表已被薪資計算引用，但假別餘額仍等鎖定才扣減。</small>
        </article>
        <article className="hr-monthly-signal-card done">
          <span>audit log</span>
          <strong>{workspace.auditCount}</strong>
          <small>結清批次只存狀態、來源與遮罩 metadata，不存薪資原文。</small>
        </article>
      </section>

      <section className="settings-command-grid annual-leave-settlement-command-grid" aria-label="特休結清作業卡">
        <article className={`settings-command-card ${canPrepare ? "ready" : "danger"}`}>
          <span className={`badge ${canPrepare ? "done" : "danger"}`}>{canPrepare ? "開放" : "封鎖"}</span>
          <h2>第 38 條 Gate</h2>
          <p>年度終結或契約終止仍未休的特休，需要轉成工資並讓 HR 複核。</p>
          <a className="button primary" href="#annual-leave-settlement-form">
            建立草稿
          </a>
        </article>
        <article className="settings-command-card ready">
          <span className="badge done">24-1</span>
          <h2>一日工資基準</h2>
          <p>月薪制以年度終結或契約終止前最近一個月正常工時工資除以 30。</p>
          <a className="button" href="#annual-leave-settlement-law">
            查看法源
          </a>
        </article>
        <article className="settings-command-card warning">
          <span className="badge warning">期限</span>
          <h2>發給期限</h2>
          <p>年度終結於約定工資給付日或年度終結後 30 日內發給；契約終止依第 9 條處理。</p>
          <Link className="button" href="/hr/payroll-recordkeeping">
            工資清冊
          </Link>
        </article>
        <article className="settings-command-card ready">
          <span className="badge done">書面通知</span>
          <h2>清冊與通知</h2>
          <p>特休期日、未休日數與工資數額需記入工資清冊，並每年書面通知員工。</p>
          <Link className="button" href="/hr/payroll-recordkeeping">
            保存紀錄
          </Link>
        </article>
      </section>

      <section className="grid">
        <section className={`panel span-12 annual-leave-settlement-gate ${canPrepare ? "ready" : "danger"}`} aria-label="特休結清 Gate">
          <div className="section-heading">
            <div>
              <h2>{canPrepare ? "特休結清 Gate 可準備" : "特休結清 Gate 已關閉"}</h2>
              <p className="muted">
                {canPrepare
                  ? `${workspace.payrollRun.periodLabel} 薪資 run 尚未鎖定，HR 可先準備年度終結或契約終止結清草稿。`
                  : `${workspace.payrollRun.periodLabel} 薪資 run 已是 ${payrollRunStatusLabel(workspace.payrollRun.status)}，請改走薪資調整流程，不可靜默重算。`}
              </p>
            </div>
            <span className={`badge ${canPrepare ? "done" : "danger"}`}>{payrollRunStatusLabel(workspace.payrollRun.status)}</span>
          </div>
          <div className="annual-leave-settlement-flow" aria-label="特休結清流程">
            {[
              ["1", "HR 準備草稿", "選擇年度終結或契約終止，系統讀取未休特休與薪資規則版本。"],
              ["2", "薪資試算納入", "重新計算 payroll run 後，草稿才會成為薪資項目。"],
              ["3", "鎖定時扣減餘額", "薪資鎖定才扣減 leave balance，避免草稿階段影響員工假別。"],
            ].map(([step, title, detail]) => (
              <article key={step}>
                <span className="badge">{step}</span>
                <strong>{title}</strong>
                <small>{detail}</small>
              </article>
            ))}
          </div>
        </section>

        <section className="panel span-7" id="annual-leave-settlement-form">
          <div className="section-heading">
            <div>
              <h2>三步特休結清草稿</h2>
              <p className="muted">建立後只會進入待試算草稿，不會直接修改薪資單或扣減假別餘額。</p>
            </div>
            <span className={`badge ${canPrepare ? "done" : "danger"}`}>
              {canPrepare ? "可送出" : "需走調整單"}
            </span>
          </div>
          <form
            action="/api/leave/annual-settlements"
            method="post"
            className="wizard-form annual-leave-settlement-form"
            aria-label="特休結清草稿"
          >
            <input type="hidden" name="payrollRunId" value={workspace.payrollRun.id} />
            <fieldset className="form-card annual-leave-settlement-fieldset">
              <legend>1. 選擇結清事由</legend>
              <p className="muted">年度終結與契約終止都會使用同一套來源追溯與 audit log。</p>
              <label>
                結清事由
                <select name="reason" defaultValue="year_end" disabled={!canPrepare}>
                  <option value="year_end">年度終結未休</option>
                  <option value="contract_termination">契約終止未休</option>
                </select>
              </label>
            </fieldset>
            <fieldset className="form-card annual-leave-settlement-fieldset">
              <legend>2. 確認薪資 run</legend>
              <p className="muted">
                目前 run：{workspace.payrollRun.periodLabel} · {payrollRunStatusLabel(workspace.payrollRun.status)}。草稿建立後請重新試算薪資。
              </p>
            </fieldset>
            <fieldset className="form-card annual-leave-settlement-fieldset">
              <legend>3. 法規與稽核</legend>
              <p className="muted">系統會掛上第 38 條與施行細則第 24-1 條來源，audit metadata 只保存批次狀態與來源 ID。</p>
            </fieldset>
            <button className="button primary" type="submit" disabled={!canPrepare}>
              準備特休結清草稿
            </button>
          </form>
        </section>

        <aside className="panel span-5" id="annual-leave-settlement-law">
          <div className="section-heading">
            <div>
              <h2>法規來源</h2>
              <p className="muted">每次結清草稿都需要能追溯到規則版本與官方法源。</p>
            </div>
            <Link className="button" href="/settings/law-rules">
              規則版本
            </Link>
          </div>
          <ul className="task-list compact">
            <li className="task annual-leave-settlement-mini-task">
              <span>
                <strong>勞基法第 38 條</strong>
                <small>未休特休工資、工資清冊與書面通知。</small>
              </span>
              <a className="button" href="https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?flno=38&id=FL014930" rel="noreferrer" target="_blank">
                官方法源
              </a>
            </li>
            <li className="task annual-leave-settlement-mini-task">
              <span>
                <strong>施行細則第 24-1 條</strong>
                <small>一日工資、發給期限與遞延特休優先扣除。</small>
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
              <h2>特休結清複核清單</h2>
              <p className="muted">HR 應在薪資試算、鎖定與薪資單釋出前逐筆確認。</p>
            </div>
            <span className="badge">{workspace.settlements.length} 筆</span>
          </div>
          {workspace.settlements.length === 0 ? (
            <p className="muted">尚未建立特休結清草稿。若月結前有年度終結或契約終止未休特休，請先建立草稿再重算薪資。</p>
          ) : (
            <ul className="task-list annual-leave-settlement-list">
              {workspace.settlements.map((settlement) => (
                <li className={`task annual-leave-settlement-task ${statusBadgeClass(settlement.status)}`} key={settlement.id}>
                  <span>
                    <strong>
                      {settlement.employeeName} · {formatUnits(settlement.unusedUnits)} 日
                    </strong>
                    <small>
                      {reasonLabel(settlement.reason)} · 一日工資 {formatMoney(settlement.dailyRegularWage)} ·{" "}
                      {settlement.carriedFromPreviousYear ? "遞延特休" : "當年度特休"}
                    </small>
                    <small>來源：{settlement.sourceIds.map(sourceLabel).join("、") || "待補來源"}</small>
                  </span>
                  <span className={`badge ${statusBadgeClass(settlement.status)}`}>
                    {statusLabel(settlement.status)} · {formatMoney(settlement.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel span-12" id="annual-leave-settlement-guardrails">
          <div className="section-heading">
            <div>
              <h2>特休結清治理原則</h2>
              <p className="muted">把台灣法遵、薪資月結與假別餘額拆成可檢查的安全步驟。</p>
            </div>
            <Link className="button" href="/hr/payroll-recordkeeping">
              薪資紀錄保存
            </Link>
          </div>
          <div className="annual-leave-settlement-guardrail-grid">
            <article>
              <span className="badge warning">第 38 條</span>
              <strong>清冊與書面通知</strong>
              <p>特休期日、未休日數與工資數額應進入工資清冊，並定期書面通知員工。</p>
            </article>
            <article>
              <span className="badge done">24-1</span>
              <strong>一日工資可追溯</strong>
              <p>月薪制以最近一個月正常工作時間所得工資除以 30；結果需可追溯到規則版本。</p>
            </article>
            <article>
              <span className="badge done">Audit</span>
              <strong>薪資值遮罩</strong>
              <p>批次 audit log 只記錄來源、狀態與筆數，不把薪資、身分證或銀行帳號寫進 log。</p>
            </article>
            <article>
              <span className="badge">月結安全</span>
              <strong>鎖定才扣餘額</strong>
              <p>草稿與試算不改員工假別餘額；只有 payroll lock 時才把 included 結清寫回 leave balance。</p>
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}

function buildSettlementFocus(
  workspace: AnnualLeaveSettlementWorkspace,
  canPrepare: boolean,
  draftCount: number,
  includedCount: number,
) {
  if (!canPrepare) {
    return {
      tone: "danger",
      title: "薪資已鎖定，停止新增草稿",
      detail: `${workspace.payrollRun?.periodLabel} 薪資 run 已是 ${payrollRunStatusLabel(workspace.payrollRun?.status ?? "")}，不得重新產生結清草稿。`,
      note: "若已關帳後發現錯誤，請走薪資調整單與 Owner 核准。",
      href: "/hr/payroll-adjustments",
      actionLabel: "走調整流程",
    };
  }
  if (draftCount > 0) {
    return {
      tone: "warning",
      title: "先重算薪資草稿",
      detail: `${draftCount} 筆特休結清仍是草稿，請重新試算薪資，讓結清項目進入 payroll item。`,
      note: "草稿階段不扣假別餘額，避免影響員工自助查詢。",
      href: "/hr",
      actionLabel: "回月結重算",
    };
  }
  if (includedCount > 0) {
    return {
      tone: "ready",
      title: "已納入薪資，等待鎖定",
      detail: `${includedCount} 筆特休結清已納入薪資試算，鎖定時才會扣減假別餘額。`,
      note: "請確認工資清冊與書面通知資料也準備完成。",
      href: "/hr/payroll-recordkeeping",
      actionLabel: "看清冊保存",
    };
  }
  return {
    tone: "ready",
    title: "月結前先準備草稿",
    detail: "若本月有年度終結或契約終止未休特休，請先建立結清草稿，再讓薪資試算引用。",
    note: "系統會掛上第 38 條與 24-1 來源，並寫入遮罩 audit log。",
    href: "#annual-leave-settlement-form",
    actionLabel: "建立草稿",
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

function reasonLabel(reason: AnnualLeaveSettlementView["reason"]) {
  return reason === "contract_termination" ? "契約終止未休" : "年度終結未休";
}

function statusLabel(status: AnnualLeaveSettlementView["status"]) {
  if (status === "included") return "已納入";
  if (status === "voided") return "已作廢";
  return "草稿";
}

function statusBadgeClass(status: AnnualLeaveSettlementView["status"]) {
  if (status === "included") return "done";
  if (status === "voided") return "danger";
  return "warning";
}

function sourceLabel(sourceId: string) {
  const labels: Record<string, string> = {
    "tw-lsa-article-38": "勞基法第 38 條",
    "tw-lsa-enforcement-article-24-1": "施行細則第 24-1 條",
  };
  return labels[sourceId] ?? sourceId;
}

function localizeSettlementError(error: string) {
  return error
    .replace("Create a payroll run before preparing annual leave settlement.", "請先建立薪資 run，再準備特休結清草稿。")
    .replace("Annual leave settlement must be prepared before payroll lock.", "特休結清草稿必須在薪資鎖定前準備。")
    .replace("Unable to prepare annual leave settlements.", "無法準備特休結清草稿。");
}

function formatUnits(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}
