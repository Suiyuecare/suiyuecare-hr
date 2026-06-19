import Link from "next/link";
import { redirect } from "next/navigation";
import { dashboardPathForRole, hasPermission } from "@/server/auth/rbac";
import { getDemoSession } from "@/server/auth/session";
import {
  getPayrollAccountingSettings,
  type PayrollAccountingSettings,
} from "@/server/payroll/accounting-settings";

type SearchParams = Promise<{ error?: string }>;

type AccountRow = {
  id: "gross" | "employer" | "deduction" | "net";
  title: string;
  shortTitle: string;
  direction: "借方" | "貸方";
  codeName: keyof Pick<
    PayrollAccountingSettings,
    | "grossPayrollDebitAccountCode"
    | "employerContributionDebitAccountCode"
    | "deductionCreditAccountCode"
    | "netPayableCreditAccountCode"
  >;
  nameName: keyof Pick<
    PayrollAccountingSettings,
    | "grossPayrollDebitAccountName"
    | "employerContributionDebitAccountName"
    | "deductionCreditAccountName"
    | "netPayableCreditAccountName"
  >;
  note: string;
  source: string;
};

const accountRows: AccountRow[] = [
  {
    id: "gross",
    title: "薪資費用借方",
    shortTitle: "薪資費用",
    direction: "借方",
    codeName: "grossPayrollDebitAccountCode",
    nameName: "grossPayrollDebitAccountName",
    note: "本薪、固定津貼、加班費與其他薪資成本彙總到這個費用科目。",
    source: "會計分錄封存 · 薪資總額",
  },
  {
    id: "employer",
    title: "雇主法定負擔借方",
    shortTitle: "雇主負擔",
    direction: "借方",
    codeName: "employerContributionDebitAccountCode",
    nameName: "employerContributionDebitAccountName",
    note: "勞保、健保、職災保險、勞退等雇主負擔彙總到這個費用科目。",
    source: "會計分錄封存 · 雇主法定負擔",
  },
  {
    id: "deduction",
    title: "員工扣款與代扣貸方",
    shortTitle: "扣款代扣",
    direction: "貸方",
    codeName: "deductionCreditAccountCode",
    nameName: "deductionCreditAccountName",
    note: "員工自付保費、所得稅扣繳、福利金或其他扣款彙總到這個負債/抵減科目。",
    source: "會計分錄封存 · 員工扣款與代扣",
  },
  {
    id: "net",
    title: "應付淨薪貸方",
    shortTitle: "應付淨薪",
    direction: "貸方",
    codeName: "netPayableCreditAccountCode",
    nameName: "netPayableCreditAccountName",
    note: "薪資扣款後實際應付員工的淨薪，彙總到應付薪資科目。",
    source: "會計分錄封存 · 應付淨薪",
  },
];

export default async function PayrollAccountingPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error }, session] = await Promise.all([searchParams, getDemoSession()]);
  if (!hasPermission(session.role, "payroll:manage")) {
    redirect(dashboardPathForRole(session.role));
  }

  const settings = await getPayrollAccountingSettings(session);
  const focus = buildAccountingFocus(settings);
  const completedRows = accountRows.filter((row) => hasAccountMapping(settings, row));
  const rowsNeedingReview = accountRows.filter((row) => needsHumanReview(settings, row));

  return (
    <main className="page payroll-accounting-page">
      <section className="hr-monthly-hero payroll-accounting-hero" aria-label="薪資科目映射工作台">
        <div className="hr-monthly-hero-main">
          <div className="hr-monthly-hero-topline">
            <span className="badge">薪資科目設定</span>
            <span className={`badge ${completedRows.length === accountRows.length ? "done" : "warning"}`}>
              {completedRows.length}/{accountRows.length} 科目完成
            </span>
          </div>
          <h1>薪資科目映射工作台</h1>
          <p>
            將薪資總額、雇主法定負擔、員工扣款與應付淨薪映射到公司會計科目，讓 HR 月結後的會計分錄封存可被財務審核；本頁只保存科目代碼與名稱，不保存員工薪資明細或銀行資料。
          </p>
          <div className="hr-monthly-hero-actions">
            <Link className="button primary" href="/hr/payroll-exports">
              回發薪封存
            </Link>
            <Link className="button" href="/hr">
              HR 月結
            </Link>
            <Link className="button" href="/settings/audit">
              稽核紀錄
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

      {error ? (
        <section className="payroll-accounting-alerts" aria-live="polite">
          <div className="panel danger-panel">
            <strong>薪資科目未儲存</strong>
            <p>{localizeAccountingError(error)}</p>
          </div>
        </section>
      ) : null}

      <section className="hr-monthly-signal-board payroll-accounting-signal-board" aria-label="薪資科目訊號板">
        <article className={`hr-monthly-signal-card ${completedRows.length === accountRows.length ? "done" : "warning"}`}>
          <span>科目完整度</span>
          <strong>{completedRows.length}/{accountRows.length}</strong>
          <small>{completedRows.length === accountRows.length ? "四個薪資匯出科目都已設定。" : "仍有科目代碼或名稱待補。"}</small>
        </article>
        <article className="hr-monthly-signal-card done">
          <span>借貸方向</span>
          <strong>2 借 / 2 貸</strong>
          <small>薪資成本與雇主負擔走借方，扣款與應付淨薪走貸方。</small>
        </article>
        <article className={`hr-monthly-signal-card ${rowsNeedingReview.length ? "warning" : "done"}`}>
          <span>財務審核</span>
          <strong>{rowsNeedingReview.length ? `${rowsNeedingReview.length} 項待確認` : "可送審"}</strong>
          <small>{rowsNeedingReview.length ? "仍使用預設英文科目名稱，建議改成公司正式科目。" : "科目名稱已適合封存預覽。"}</small>
        </article>
        <article className="hr-monthly-signal-card done">
          <span>敏感資料</span>
          <strong>不含明細</strong>
          <small>會計分錄封存只用彙總摘要，不輸出員工薪資、銀行帳號或身分證。</small>
        </article>
      </section>

      <section className="settings-command-grid payroll-accounting-map-grid" aria-label="薪資科目映射卡">
        {accountRows.map((row) => {
          const ready = hasAccountMapping(settings, row);
          return (
            <article className={`settings-command-card payroll-accounting-map-card ${ready ? "ready" : "warning"}`} key={row.id}>
              <span className={`badge ${ready ? "done" : "warning"}`}>{ready ? "已設定" : "待補"}</span>
              <h2>{row.shortTitle}</h2>
              <p>{row.note}</p>
              <div className="payroll-accounting-code-card">
                <strong>{settings[row.codeName]}</strong>
                <small>{displayAccountName(settings[row.nameName])}</small>
                <span className="badge">{row.direction}</span>
              </div>
              <a className="button" href="#payroll-accounting-form">
                調整科目
              </a>
            </article>
          );
        })}
      </section>

      <section className="grid">
        <section className="panel span-12" id="payroll-accounting-form">
          <div className="section-heading">
            <div>
              <h2>科目映射精靈</h2>
              <p className="muted">請依照公司會計科目表填入代碼與正式名稱；儲存後會寫入稽核紀錄並影響新的會計分錄封存包。</p>
            </div>
            <span className={`badge ${completedRows.length === accountRows.length ? "done" : "warning"}`}>
              {completedRows.length === accountRows.length ? "可產生會計分錄封存" : "仍有科目待補"}
            </span>
          </div>

          <form className="wizard-form payroll-accounting-form" action="/api/payroll/accounting-settings" method="post">
            {accountRows.map((row) => (
              <fieldset className="form-card payroll-accounting-fieldset" key={row.codeName}>
                <legend>{row.title}</legend>
                <p className="muted">{row.note}</p>
                <div className="field-grid">
                  <label>
                    科目代碼
                    <input
                      name={row.codeName}
                      defaultValue={settings[row.codeName]}
                      required
                      inputMode="text"
                      maxLength={32}
                    />
                  </label>
                  <label>
                    科目名稱
                    <input
                      name={row.nameName}
                      defaultValue={displayAccountName(settings[row.nameName])}
                      required
                      maxLength={80}
                    />
                  </label>
                </div>
                <div className="payroll-accounting-field-note">
                  <span className="badge">{row.direction}</span>
                  <small>{row.source}</small>
                </div>
              </fieldset>
            ))}

            <div className="payroll-accounting-note">
              <strong>安全提醒</strong>
              <p>這裡只放會計科目。不要把員工姓名、薪資金額、銀行帳號、身分證字號或私密備註放進科目名稱。</p>
            </div>

            <button className="button primary" type="submit">
              儲存薪資科目映射
            </button>
          </form>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>會計分錄封存預覽</h2>
              <p className="muted">預覽只顯示科目與彙總分類；金額保留在受控薪資計算與封存雜湊中。</p>
            </div>
            <Link className="button" href="/hr/payroll-exports">
              開啟發薪封存
            </Link>
          </div>
          <ul className="task-list payroll-accounting-preview-list">
            {accountRows.map((row) => (
              <li className="task payroll-accounting-preview-task" key={`preview-${row.codeName}`}>
                <span>
                  <strong>{settings[row.codeName]} · {displayAccountName(settings[row.nameName])}</strong>
                  <small>{row.source} · {row.note}</small>
                </span>
                <span className={`badge ${row.direction === "借方" ? "done" : "warning"}`}>{row.direction}</span>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}

function buildAccountingFocus(settings: PayrollAccountingSettings) {
  const incomplete = accountRows.filter((row) => !hasAccountMapping(settings, row));
  if (incomplete.length) {
    return {
      tone: "danger",
      title: `先補 ${incomplete[0].shortTitle}`,
      detail: `${incomplete[0].title} 缺少科目代碼或名稱，會計分錄封存前需要補齊。`,
      note: "沒有完整科目時，HR 月結仍可試算，但財務封存會缺審核依據。",
      href: "#payroll-accounting-form",
      actionLabel: "補科目",
    };
  }
  const review = accountRows.filter((row) => needsHumanReview(settings, row));
  if (review.length) {
    return {
      tone: "warning",
      title: "確認正式科目名稱",
      detail: "目前仍有預設英文科目名稱。建議改成公司會計科目表的正式中文或內部慣用名稱，再交給財務審核。",
      note: "系統會先在畫面中文化顯示，但封存設定仍應由 HR/財務確認。",
      href: "#payroll-accounting-form",
      actionLabel: "檢查科目",
    };
  }
  return {
    tone: "",
    title: "可產生會計分錄封存",
    detail: "四個薪資匯出科目都已完成，下一步可回發薪封存中心產生會計分錄封存包。",
    note: "產生封存包只輸出彙總分類與雜湊，不輸出薪資明細。",
    href: "/hr/payroll-exports",
    actionLabel: "回發薪封存",
  };
}

function hasAccountMapping(settings: PayrollAccountingSettings, row: AccountRow) {
  return Boolean(settings[row.codeName]?.trim() && settings[row.nameName]?.trim());
}

function needsHumanReview(settings: PayrollAccountingSettings, row: AccountRow) {
  const name = settings[row.nameName];
  return displayAccountName(name) !== name;
}

function displayAccountName(name: string) {
  return name
    .replace("Payroll expense", "薪資費用")
    .replace("Employer statutory expense", "雇主法定負擔")
    .replace("Payroll deductions payable", "薪資扣款應付")
    .replace("Salary payable", "應付薪資");
}

function localizeAccountingError(error: string) {
  return error
    .replace("Unable to update payroll accounting settings.", "無法更新薪資科目設定。")
    .replace("Role employee cannot payroll:manage", "目前角色沒有薪資管理權限。")
    .replace("Role manager cannot payroll:manage", "主管預設不能管理薪資科目。");
}
