import Link from "next/link";
import { hasPermission } from "@/server/auth/rbac";
import { getDemoSession } from "@/server/auth/session";
import {
  getPayrollRecordkeepingReadiness,
  getPayrollRecordkeepingSettings,
  minimumWageRosterRetentionDays,
} from "@/server/payroll/recordkeeping";

type SearchParams = Promise<{ error?: string }>;

type PayrollRecordkeepingFocus = {
  title: string;
  detail: string;
  note: string;
  tone: "danger" | "warning" | "ready";
  href: string;
  actionLabel: string;
};

export default async function PayrollRecordkeepingPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error }, session] = await Promise.all([searchParams, getDemoSession()]);

  if (!hasPermission(session.role, "payroll:manage")) {
    return (
      <main className="page payroll-recordkeeping-page">
        <section className="hr-monthly-hero payroll-recordkeeping-hero" aria-label="工資清冊與薪資明細工作台">
          <div className="hr-monthly-hero-main">
            <div className="hr-monthly-hero-topline">
              <span className="badge">薪資法遵</span>
              <span className="badge danger">權限不足</span>
            </div>
            <h1>工資清冊與薪資明細工作台</h1>
            <p>薪資紀錄牽涉薪資明細、工資清冊、勞檢證據與敏感薪資資料，只開放 HR/Owner 或薪資授權角色維護。</p>
            <div className="hr-monthly-hero-actions">
              <Link className="button primary" href="/app">
                回員工前台
              </Link>
              <Link className="button" href="/console">
                切換後台角色
              </Link>
            </div>
          </div>
          <aside className="hr-monthly-hero-focus danger" aria-label="今日先處理">
            <span className="badge">薪資資料保護</span>
            <strong>先確認薪資權限</strong>
            <p>未授權角色不顯示薪資紀錄保存、薪資明細或勞檢匯出狀態，避免薪資資料外洩。</p>
            <small>請使用 HR、Owner 或薪資授權角色操作。</small>
          </aside>
        </section>
      </main>
    );
  }

  const [settings, readiness] = await Promise.all([
    getPayrollRecordkeepingSettings(session),
    getPayrollRecordkeepingReadiness(session),
  ]);
  const focus = buildPayrollRecordkeepingFocus(readiness);
  const retentionReady = settings.wageRosterRetentionDays >= minimumWageRosterRetentionDays;

  return (
    <main className="page payroll-recordkeeping-page">
      <section className="hr-monthly-hero payroll-recordkeeping-hero" aria-label="工資清冊與薪資明細工作台">
        <div className="hr-monthly-hero-main">
          <div className="hr-monthly-hero-topline">
            <span className="badge">勞基法第 23 條</span>
            <span className="badge">施行細則第 14-1 條</span>
            <span className={`badge ${readiness.ready ? "done" : "warning"}`}>
              {readiness.ready ? "可進月結封存" : "薪資鎖定前需補"}
            </span>
          </div>
          <h1>工資清冊與薪資明細工作台</h1>
          <p>
            在薪資鎖定前確認工資清冊保存五年、員工可取得薪資明細、明細包含計算方式與扣款項目，並準備勞檢匯出證據。頁面只顯示設定狀態，不揭露薪資金額。
          </p>
          <div className="hr-monthly-hero-actions">
            <Link className="button primary" href="#payroll-recordkeeping-wizard">
              更新保存設定
            </Link>
            <Link className="button" href="/hr">
              回月結主控台
            </Link>
            <Link className="button" href="/settings/audit">
              查看 audit log
            </Link>
          </div>
        </div>

        <aside className={`hr-monthly-hero-focus ${focus.tone}`} aria-label="今日先處理">
          <span className="badge">今日先處理</span>
          <strong>{focus.title}</strong>
          <p>{focus.detail}</p>
          <small>{focus.note}</small>
          <Link className="button primary" href={focus.href}>
            {focus.actionLabel}
          </Link>
        </aside>
      </section>

      {error ? (
        <section className="payroll-recordkeeping-alerts" aria-live="polite">
          <div className="panel danger-panel">
            <strong>薪資紀錄保存設定未更新</strong>
            <p>{localizePayrollRecordkeepingError(error)}</p>
          </div>
        </section>
      ) : null}

      <section className="hr-monthly-signal-board payroll-recordkeeping-signal-board" aria-label="薪資紀錄訊號板">
        <article className={`hr-monthly-signal-card ${retentionReady ? "done" : "danger"}`}>
          <span>工資清冊保存</span>
          <strong>{settings.wageRosterRetentionDays} 天</strong>
          <small>勞基法第 23 條要求工資清冊保存五年，這是薪資月結與 production readiness 的硬 Gate。</small>
        </article>
        <article className={`hr-monthly-signal-card ${settings.employeePayslipEnabled ? "done" : "warning"}`}>
          <span>員工薪資明細</span>
          <strong>{settings.employeePayslipEnabled ? "已開放" : "暫停"}</strong>
          <small>員工需能取得工資各項目計算方式明細；薪資資料仍由權限控管。</small>
        </article>
        <article className={`hr-monthly-signal-card ${settings.wageCalculationDetailsEnabled ? "done" : "warning"}`}>
          <span>計算方式明細</span>
          <strong>{settings.wageCalculationDetailsEnabled ? "完整" : "缺漏"}</strong>
          <small>施行細則第 14-1 條要求包含工資總額、各項給付、扣除項目與實發金額。</small>
        </article>
        <article className={`hr-monthly-signal-card ${settings.laborInspectionExportEnabled ? "focus" : "warning"}`}>
          <span>勞檢匯出</span>
          <strong>{settings.laborInspectionExportEnabled ? "可封存" : "未啟用"}</strong>
          <small>匯出只應提供授權勞檢證據包，不在一般頁面顯示個人薪資值。</small>
        </article>
      </section>

      <section className="settings-command-grid payroll-recordkeeping-command-grid" aria-label="薪資紀錄作業卡">
        <article className={`settings-command-card ${retentionReady ? "ready" : "danger"}`}>
          <span className={`badge ${retentionReady ? "done" : "danger"}`}>
            {retentionReady ? "五年保存" : "保存不足"}
          </span>
          <h2>工資清冊 Gate</h2>
          <p>工資清冊需記載發放工資、各項目計算方式明細與工資總額，保存至少五年。</p>
          <Link className="button primary" href="#payroll-recordkeeping-wizard">
            補保存設定
          </Link>
        </article>
        <article className={`settings-command-card ${settings.employeePayslipEnabled ? "ready" : "warning"}`}>
          <span className={`badge ${settings.employeePayslipEnabled ? "done" : "warning"}`}>
            {settings.employeePayslipEnabled ? "員工可取" : "需開放"}
          </span>
          <h2>薪資明細自助</h2>
          <p>員工可在前台取得自己的薪資單，管理者不因主管身分看得到下屬薪資。</p>
          <Link className="button" href="/app/payslip">
            員工薪資單
          </Link>
        </article>
        <article className={`settings-command-card ${settings.wageCalculationDetailsEnabled ? "ready" : "warning"}`}>
          <span className={`badge ${settings.wageCalculationDetailsEnabled ? "done" : "warning"}`}>
            {settings.wageCalculationDetailsEnabled ? "明細完整" : "明細不足"}
          </span>
          <h2>計算方式明細</h2>
          <p>明細需涵蓋工資總額、給付項目、法定或約定扣除項目、實發金額與計算依據。</p>
          <a className="button" href="https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?flno=14-1&id=FL014931" target="_blank" rel="noreferrer">
            官方來源
          </a>
        </article>
        <article className={`settings-command-card ${settings.laborInspectionExportEnabled ? "ready" : "warning"}`}>
          <span className={`badge ${settings.laborInspectionExportEnabled ? "done" : "warning"}`}>
            {settings.laborInspectionExportEnabled ? "可匯出" : "待啟用"}
          </span>
          <h2>勞檢證據包</h2>
          <p>勞檢匯出需搭配 audit log、薪資月結鎖定與報表權限，不把原始薪資資料散落到一般報表。</p>
          <Link className="button" href="/settings/audit">
            audit log
          </Link>
        </article>
      </section>

      <section className="grid">
        <section className={`panel span-12 payroll-recordkeeping-gate ${readiness.ready ? "ready" : "danger"}`} aria-label="薪資紀錄保存 Gate">
          <div className="section-heading">
            <div>
              <h2>{readiness.ready ? "薪資紀錄保存 Gate 已就緒" : "薪資紀錄保存 Gate 尚未完成"}</h2>
              <p className="muted">{localizeReadinessDetail(readiness.detail)}</p>
            </div>
            <a className="button" href="https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?flno=23&id=FL014930" target="_blank" rel="noreferrer">
              勞基法第 23 條
            </a>
          </div>
          {readiness.missing.length ? (
            <ul className="task-list compact">
              {readiness.missing.map((item) => (
                <li className="task" key={item}>
                  <span>{localizeMissing(item)}</span>
                  <span className="badge danger">必要</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">工資清冊保存、薪資明細、計算方式明細與勞檢匯出都已開啟；薪資鎖定前仍需確認薪資單釋出與薪資資料權限測試。</p>
          )}
        </section>

        <section className="panel span-7" id="payroll-recordkeeping-wizard">
          <div className="section-heading">
            <div>
              <h2>三步薪資紀錄保存精靈</h2>
              <p className="muted">只調整保存與開放狀態；不要在此頁輸入薪資金額、銀行帳號、身分證字號或私人員工備註。</p>
            </div>
            <span className={`badge ${readiness.ready ? "done" : "warning"}`}>
              {readiness.ready ? "已就緒" : `${readiness.missing.length} 項缺口`}
            </span>
          </div>

          <form className="wizard-form" action="/api/payroll/recordkeeping" method="post" aria-label="薪資紀錄保存設定精靈">
            <div className="section-heading compact-heading">
              <div>
                <h3>1. 工資清冊保存</h3>
                <p className="muted">保存天數不可低於五年，正式上線前會被 production verification 檢查。</p>
              </div>
              <span className="badge">必要</span>
            </div>
            <div className="field-grid">
              <label>
                工資清冊保存天數
                <input
                  name="wageRosterRetentionDays"
                  type="number"
                  min={minimumWageRosterRetentionDays}
                  step="1"
                  defaultValue={settings.wageRosterRetentionDays}
                />
              </label>
            </div>

            <div className="section-heading compact-heading">
              <div>
                <h3>2. 員工薪資明細</h3>
                <p className="muted">員工應能取得自己的明細，且明細需包含各項給付、扣除與實發。</p>
              </div>
              <span className="badge">員工自助</span>
            </div>
            <div className="toggle-row">
              <label>
                <input name="employeePayslipEnabled" type="checkbox" defaultChecked={settings.employeePayslipEnabled} />
                開放員工薪資明細
              </label>
              <label>
                <input
                  name="wageCalculationDetailsEnabled"
                  type="checkbox"
                  defaultChecked={settings.wageCalculationDetailsEnabled}
                />
                包含工資計算方式明細
              </label>
            </div>

            <div className="section-heading compact-heading">
              <div>
                <h3>3. 勞檢匯出與證據</h3>
                <p className="muted">勞檢匯出需受權限控管，並與 audit log、薪資鎖定狀態一起封存。</p>
              </div>
              <span className="badge">audit log</span>
            </div>
            <div className="toggle-row">
              <label>
                <input
                  name="laborInspectionExportEnabled"
                  type="checkbox"
                  defaultChecked={settings.laborInspectionExportEnabled}
                />
                勞檢匯出已準備
              </label>
            </div>

            <button className="button primary" type="submit">
              儲存薪資紀錄設定
            </button>
          </form>
        </section>

        <aside className="panel span-5">
          <div className="section-heading">
            <div>
              <h2>法規來源與月結提醒</h2>
              <p className="muted">把法規要求轉成 HR 可操作的月結 Gate，但薪資計算仍走版本化規則。</p>
            </div>
            <span className="badge">官方來源</span>
          </div>
          <ul className="task-list compact">
            <li className="task">
              <span>
                <strong>勞基法第 23 條</strong>
                <small>工資需定期給付並提供計算方式明細；工資清冊要記載工資與明細並保存五年。</small>
              </span>
              <a className="button" href="https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?flno=23&id=FL014930" target="_blank" rel="noreferrer">
                開啟
              </a>
            </li>
            <li className="task">
              <span>
                <strong>施行細則第 14-1 條</strong>
                <small>明細包含議定工資總額、給付項目、扣除項目與實發金額，且可用電子方式提供。</small>
              </span>
              <a className="button" href="https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?flno=14-1&id=FL014931" target="_blank" rel="noreferrer">
                開啟
              </a>
            </li>
          </ul>
        </aside>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>薪資紀錄治理原則</h2>
              <p className="muted">讓 HR 可以通過勞檢與月結，但不讓薪資資料擴散。</p>
            </div>
            <Link className="button" href="/hr/payroll-exports">
              發薪匯出
            </Link>
          </div>
          <div className="payroll-recordkeeping-guardrail-grid">
            <article>
              <span className="badge">不顯示金額</span>
              <strong>設定頁只顯示狀態</strong>
              <p>本頁不列出員工薪資金額、銀行帳號或身分證字號；薪資值只在授權薪資流程中查看。</p>
            </article>
            <article>
              <span className="badge warning">人工確認</span>
              <strong>薪資不可靜默 finalized</strong>
              <p>薪資單釋出、勞檢匯出與月結鎖定都應由 HR 明確確認並寫 audit log。</p>
            </article>
            <article>
              <span className="badge done">員工自助</span>
              <strong>降低 HR 查薪資單工時</strong>
              <p>員工能查看自己的薪資明細，是降低導入教學與月結查詢量的重要基礎。</p>
            </article>
            <article>
              <span className="badge danger">權限測試</span>
              <strong>主管不看下屬薪資</strong>
              <p>薪資明細與匯出要通過未授權存取測試，目標是 0 個可通過漏洞。</p>
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}

function buildPayrollRecordkeepingFocus(
  readiness: Awaited<ReturnType<typeof getPayrollRecordkeepingReadiness>>,
): PayrollRecordkeepingFocus {
  if (readiness.missing.includes("5-year wage roster retention")) {
    return {
      title: "先補工資清冊保存",
      detail: "保存天數未達五年時，薪資月結與 production readiness 不應放行。",
      note: "請先把保存天數調整到五年以上，再進行薪資鎖定。",
      tone: "danger",
      href: "#payroll-recordkeeping-wizard",
      actionLabel: "補保存天數",
    };
  }
  if (
    readiness.missing.includes("employee wage statement access") ||
    readiness.missing.includes("wage calculation details")
  ) {
    return {
      title: "補薪資明細自助",
      detail: "員工薪資明細或計算方式明細未開啟，會增加 HR 查詢負擔，也不符合第 23 條精神。",
      note: "開啟後仍由薪資權限控管，不開放主管看下屬薪資。",
      tone: "warning",
      href: "#payroll-recordkeeping-wizard",
      actionLabel: "開啟明細",
    };
  }
  if (readiness.missing.includes("labor inspection export readiness")) {
    return {
      title: "補勞檢匯出證據",
      detail: "勞檢匯出尚未啟用，請先確認證據包與 audit log 流程再鎖薪。",
      note: "匯出需要受權限控管，不可讓一般報表下載原始薪資資料。",
      tone: "warning",
      href: "#payroll-recordkeeping-wizard",
      actionLabel: "啟用匯出",
    };
  }
  return {
    title: "可進薪資封存",
    detail: "工資清冊、薪資明細、計算方式與勞檢匯出 Gate 都已就緒，可以進入薪資月結封存流程。",
    note: "薪資單釋出前仍要完成權限測試與 HR 確認。",
    tone: "ready",
    href: "/hr",
    actionLabel: "回月結",
  };
}

function localizeMissing(item: string) {
  const labels: Record<string, string> = {
    "payroll recordkeeping settings": "尚未建立薪資紀錄保存設定",
    "5-year wage roster retention": "工資清冊保存未達五年",
    "employee wage statement access": "尚未開放員工薪資明細",
    "wage calculation details": "薪資明細缺少計算方式",
    "labor inspection export readiness": "尚未啟用勞檢匯出準備",
  };
  return labels[item] ?? item;
}

function localizeReadinessDetail(detail: string) {
  return detail
    .replace("No payroll recordkeeping settings configured.", "尚未建立薪資紀錄保存設定。")
    .replace(/(\d+) retention day\(s\)/, "保存 $1 天")
    .replace("payslip enabled", "薪資明細已開放")
    .replace("payslip disabled", "薪資明細未開放")
    .replace("calculation details enabled", "計算方式明細已開啟")
    .replace("calculation details disabled", "計算方式明細未開啟")
    .replace("labor inspection export enabled", "勞檢匯出已啟用")
    .replace("labor inspection export disabled", "勞檢匯出未啟用")
    .replaceAll("; ", "；");
}

function localizePayrollRecordkeepingError(error: string) {
  if (error.includes("permission") || error.includes("Forbidden")) {
    return "目前角色沒有維護薪資紀錄保存設定的權限，請切換 HR、Owner 或薪資授權角色後再試。";
  }
  if (error.includes("Unable to update payroll recordkeeping")) {
    return "目前無法更新薪資紀錄保存設定，請稍後再試或檢查資料庫連線。";
  }
  return error;
}
