import Link from "next/link";
import { getDemoSession } from "@/server/auth/session";
import { hasPermission } from "@/server/auth/rbac";
import {
  getWorktimeComplianceWorkspace,
  type WorktimeComplianceRisk,
  type WorktimeComplianceWorkspace,
} from "@/server/attendance/worktime-compliance";

type SearchParams = Promise<{
  periodStart?: string;
  periodEnd?: string;
  error?: string;
}>;

type WorktimeFocus = {
  title: string;
  detail: string;
  note: string;
  tone: "danger" | "warning" | "ready";
  href: string;
  actionLabel: string;
};

export default async function WorktimeCompliancePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const periodStart = parseDate(params.periodStart);
  const periodEnd = parseDate(params.periodEnd);
  const session = await getDemoSession();
  if (!hasPermission(session.role, "employee:read")) {
    return (
      <main className="page worktime-compliance-page">
        <section className="hr-monthly-hero worktime-compliance-hero" aria-label="工時法遵工作台">
          <div className="hr-monthly-hero-main">
            <div className="hr-monthly-hero-topline">
              <span className="badge">台灣勞基法</span>
              <span className="badge danger">權限不足</span>
            </div>
            <h1>工時法遵工作台</h1>
            <p>這是 HR 後台頁面，只開放具備員工與出勤資料檢視權限的角色使用。一般員工請回到前台處理打卡、請假與薪資單。</p>
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
            <span className="badge">安全控管</span>
            <strong>敏感資料已保護</strong>
            <p>工時風險會牽涉出勤與薪資月結，未授權角色不顯示任何員工資料或法遵掃描結果。</p>
            <small>請由 HR、Owner 或具備後台權限的角色進入。</small>
          </aside>
        </section>
      </main>
    );
  }
  const workspace = await getWorktimeComplianceWorkspace(session, {
    periodStart: periodStart ?? undefined,
    periodEnd: periodEnd ?? undefined,
  });
  const dangerCount = workspace.risks.filter((risk) => risk.severity === "danger").length;
  const warningCount = workspace.risks.length - dangerCount;
  const focus = buildWorktimeFocus(workspace, dangerCount);

  return (
    <main className="page worktime-compliance-page">
      <section className="hr-monthly-hero worktime-compliance-hero" aria-label="工時法遵工作台">
        <div className="hr-monthly-hero-main">
          <div className="hr-monthly-hero-topline">
            <span className="badge">台灣勞基法</span>
            <span className={`badge ${workspace.risks.length ? "warning" : "done"}`}>
              {workspace.risks.length ? "月結前需處理" : "可進入月結"}
            </span>
          </div>
          <h1>工時法遵工作台</h1>
          <p>
            薪資月結前先掃描單日總工時、月加班上限與七日一例一休風險。系統只協助找出疑點與建立出勤異常，不會自動替人資關閉法遵風險或改動薪資。
          </p>
          <div className="hr-monthly-hero-actions">
            <Link className="button primary" href="#worktime-scan-form">
              月結前掃描
            </Link>
            <Link className="button" href="#worktime-risk-list">
              查看風險
            </Link>
            <Link className="button" href="/hr/attendance-exceptions">
              出勤異常
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

      {params.error ? (
        <section className="worktime-compliance-alerts" aria-live="polite">
          <div className="panel danger-panel">
            <strong>工時異常未建立</strong>
            <p>{localizeWorktimeError(params.error)}</p>
          </div>
        </section>
      ) : null}

      <section className="hr-monthly-signal-board worktime-compliance-signal-board" aria-label="工時法遵訊號板">
        <article className={`hr-monthly-signal-card ${workspace.risks.length ? "warning" : "done"}`}>
          <span>工時風險</span>
          <strong>{workspace.risks.length} 筆</strong>
          <small>月結鎖薪前必須確認，避免把未處理工時風險帶入薪資計算。</small>
        </article>
        <article className={`hr-monthly-signal-card ${dangerCount ? "danger" : "done"}`}>
          <span>高風險</span>
          <strong>{dangerCount} 筆</strong>
          <small>{dangerCount ? "涉及單日工時或例休循環，需人工追溯班表與打卡。" : "目前沒有高風險工時項目。"}</small>
        </article>
        <article className={`hr-monthly-signal-card ${workspace.agreementReady ? "done" : "warning"}`}>
          <span>工時約定</span>
          <strong>{workspace.agreementReady ? "可套用" : "需補證據"}</strong>
          <small>延長加班上限只能在約定證據完整時使用，否則採基本上限檢查。</small>
        </article>
        <article className="hr-monthly-signal-card focus">
          <span>掃描稽核</span>
          <strong>{workspace.auditCount} 次</strong>
          <small>每次建立異常都會寫入稽核紀錄，保留期間與風險數量。</small>
        </article>
      </section>

      <section className="settings-command-grid worktime-compliance-command-grid" aria-label="工時法遵作業卡">
        <article className={`settings-command-card ${workspace.risks.length ? "warning" : "ready"}`}>
          <span className={`badge ${workspace.risks.length ? "warning" : "done"}`}>
            {workspace.risks.length ? `${workspace.risks.length} 筆待確認` : "目前安全"}
          </span>
          <h2>月結前掃描</h2>
          <p>選擇薪資期間後掃描工時風險，再由人資確認是否建立出勤異常，不自動修改資料。</p>
          <Link className="button primary" href="#worktime-scan-form">
            開始掃描
          </Link>
        </article>
        <article className={`settings-command-card ${workspace.agreementReady ? "ready" : "warning"}`}>
          <span className={`badge ${workspace.agreementReady ? "done" : "warning"}`}>
            {workspace.agreementReady ? "約定完整" : "需補約定"}
          </span>
          <h2>延長工時約定</h2>
          <p>檢查勞資會議、工會或主管機關備查證據，決定月加班上限是否能採延長規則。</p>
          <Link className="button" href="/hr/worktime-agreements">
            檢查約定
          </Link>
        </article>
        <article className={`settings-command-card ${dangerCount ? "danger" : "ready"}`}>
          <span className={`badge ${dangerCount ? "danger" : "done"}`}>
            {dangerCount ? "需法遵複核" : "高風險清空"}
          </span>
          <h2>高風險人工處理</h2>
          <p>超過單日總工時、例休循環不足等風險不批次結案，先回到出勤異常追蹤證據。</p>
          <Link className="button" href="/hr/attendance-exceptions">
            處理異常
          </Link>
        </article>
        <article className="settings-command-card warning">
          <span className="badge warning">版本化規則</span>
          <h2>法規來源要可追</h2>
          <p>工時檢查引用 law_rules/rule_versions；公司調整上限或來源日期時需建立新版本。</p>
          <Link className="button" href="/settings/law-rules">
            法規規則
          </Link>
        </article>
      </section>

      <section className="grid">
        <section className="panel span-7" id="worktime-scan-form">
          <div className="section-heading">
            <div>
              <h2>月結掃描表單</h2>
              <p className="muted">建立出勤異常前，請確認掃描期間與薪資月結期間一致。</p>
            </div>
            <span className={`badge ${workspace.risks.length ? "warning" : "done"}`}>
              {formatDateForDisplay(workspace.periodStart)} - {formatDateForDisplay(workspace.periodEnd)}
            </span>
          </div>
          <form
            action="/api/attendance/worktime-compliance"
            method="post"
            className="mini-form worktime-compliance-scan-form"
            aria-label="建立工時法遵異常"
          >
            <div className="field-grid">
              <label>
                期間開始
                <input name="periodStart" type="date" defaultValue={formatDate(workspace.periodStart)} required />
              </label>
              <label>
                期間結束
                <input name="periodEnd" type="date" defaultValue={formatDate(workspace.periodEnd)} required />
              </label>
            </div>
            <button className="button primary" type="submit">
              建立出勤異常
            </button>
          </form>
          <p className="muted worktime-compliance-note">
            建立後會產生待處理出勤異常與稽核紀錄；人資仍需逐筆確認，不會自動影響薪資。
          </p>
        </section>

        <section className="panel span-5">
          <div className="section-heading">
            <div>
              <h2>工時約定狀態</h2>
              <p className="muted">{localizeAgreementDetail(workspace.agreementDetail)}</p>
            </div>
            <span className={`badge ${workspace.agreementReady ? "done" : "warning"}`}>
              {workspace.agreementReady ? "延長規則可用" : "採基本上限"}
            </span>
          </div>
          <div className="worktime-compliance-agreement-card">
            <strong>{workspace.agreementReady ? "可使用延長加班規則" : "先補工時約定證據"}</strong>
            <p>
              {workspace.agreementReady
                ? "系統會在月加班檢查中納入已生效的勞資約定與版本化規則。"
                : "若未完成約定、備查或有效期間證據，月加班檢查會使用較保守的基本上限。"}
            </p>
            <Link className="button" href="/hr/worktime-agreements">
              管理工時約定
            </Link>
          </div>
        </section>

        <section className="panel span-12" id="worktime-risk-list">
          <div className="section-heading">
            <div>
              <h2>風險清單</h2>
              <p className="muted">每筆風險都附上規則來源，讓 HR 可以回溯班表、打卡、加班與 law_rules 版本。</p>
            </div>
            <span className={`badge ${dangerCount ? "danger" : warningCount ? "warning" : "done"}`}>
              {dangerCount ? `${dangerCount} 筆高風險` : warningCount ? `${warningCount} 筆警示` : "無風險"}
            </span>
          </div>
          {workspace.risks.length === 0 ? (
            <div className="panel-subtle success-box">
              <strong>目前沒有工時法遵風險</strong>
              <p className="muted">仍建議在薪資鎖定前重新掃描一次，並保存月結稽核證據。</p>
            </div>
          ) : (
            <ul className="task-list worktime-compliance-risk-list">
              {workspace.risks.map((risk, index) => (
                <li className={`task worktime-compliance-risk-task ${riskTone(risk)}`} key={`${risk.employeeId}-${risk.riskType}-${index}`}>
                  <span className="worktime-compliance-risk-copy">
                    <strong>
                      {risk.employeeName} · {localizeRiskType(risk.riskType)}
                    </strong>
                    <small>{localizeRiskDetail(risk.detail)}</small>
                    <small>來源：{risk.sourceIds.map(localizeSourceId).join("、")}</small>
                  </span>
                  <span className={`badge ${risk.severity === "danger" ? "danger" : "warning"}`}>
                    {localizeSeverity(risk.severity)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>法遵處理原則</h2>
              <p className="muted">讓工時風險處理能快，但不犧牲台灣勞基法、薪資安全與稽核證據。</p>
            </div>
            <Link className="button" href="/settings/audit">
              查看稽核
            </Link>
          </div>
          <div className="worktime-compliance-guardrail-grid">
            <article>
              <span className="badge warning">人資確認</span>
              <strong>系統只建立待處理異常</strong>
              <p>工時掃描不會自動結案、不會調薪、不會改薪資單；所有處理都要 HR 明確確認。</p>
            </article>
            <article>
              <span className="badge">規則來源</span>
              <strong>法規規則不可硬寫死</strong>
              <p>單日工時、月加班與例休循環都引用版本化規則，方便日後因法規或公司政策更新而追溯。</p>
            </article>
            <article>
              <span className="badge danger">敏感資料</span>
              <strong>不要在備註寫個資薪資</strong>
              <p>處理證據只放來源編號、期間與決策理由，不輸出身分證、銀行帳號、薪資或健康資料。</p>
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}

function buildWorktimeFocus(workspace: WorktimeComplianceWorkspace, dangerCount: number): WorktimeFocus {
  if (dangerCount > 0) {
    return {
      title: "先看高風險工時",
      detail: `${dangerCount} 筆涉及單日總工時或例休循環，月結前要先追溯班表、打卡與加班來源。`,
      note: "高風險不批次關閉，避免薪資月結帶入未確認法遵疑點。",
      tone: "danger",
      href: "#worktime-risk-list",
      actionLabel: "查看風險",
    };
  }
  if (workspace.risks.length > 0) {
    return {
      title: "建立月結前異常",
      detail: `${workspace.risks.length} 筆工時警示可以轉成出勤異常，交由 HR 在月結前逐筆處理。`,
      note: "建立異常會寫入 audit log，但不會自動修改薪資或打卡資料。",
      tone: "warning",
      href: "#worktime-scan-form",
      actionLabel: "建立異常",
    };
  }
  if (!workspace.agreementReady) {
    return {
      title: "先補工時約定",
      detail: "目前沒有風險，但延長加班規則仍需約定與備查證據，否則會使用保守上限。",
      note: "先完成約定證據，月加班檢查與薪資月結才有完整依據。",
      tone: "warning",
      href: "/hr/worktime-agreements",
      actionLabel: "檢查約定",
    };
  }
  return {
    title: "工時掃描可封存",
    detail: "目前期間沒有工時法遵風險，工時約定也可用，可以進入月結證據封存。",
    note: "薪資鎖定前仍建議再掃描一次，保持月結證據最新。",
    tone: "ready",
    href: "/hr",
    actionLabel: "回月結",
  };
}

function riskTone(risk: WorktimeComplianceRisk) {
  return risk.severity === "danger" ? "danger" : "warning";
}

function localizeRiskType(riskType: WorktimeComplianceRisk["riskType"]) {
  const labels: Record<WorktimeComplianceRisk["riskType"], string> = {
    daily_worktime: "單日總工時",
    monthly_overtime: "月加班上限",
    rest_day_cycle: "七日一例一休",
  };
  return labels[riskType];
}

function localizeSeverity(severity: WorktimeComplianceRisk["severity"]) {
  return severity === "danger" ? "高風險" : "警示";
}

function localizeAgreementDetail(detail: string) {
  return detail
    .replace("Demo agreement evidence is not configured.", "尚未設定工時約定證據。")
    .replace("Extended overtime agreement is ready.", "延長工時約定證據已可用。")
    .replace("Agreement evidence is not configured.", "尚未設定工時約定證據。")
    .replace("Agreement evidence is incomplete.", "工時約定證據尚未完整。")
    .replace("labor-management conference approval", "勞資會議同意")
    .replace("labor union approval", "工會同意")
    .replace("other approval", "其他約定")
    .replace("unverified", "未驗證")
    .replace("verified", "已驗證")
    .replace("approval evidence on file", "同意證據已留存")
    .replace("approval evidence missing", "同意證據缺漏")
    .replace(/monthly ([\d.]+)h/g, "月加班上限 $1 小時")
    .replace(/3-month ([\d.]+)h/g, "三個月加班上限 $1 小時")
    .replaceAll("; ", "；");
}

function localizeRiskDetail(detail: string) {
  return detail
    .replace("Regular daily work exceeds configured", "正常工時超過設定")
    .replace("Regular weekly work exceeds configured", "每週正常工時超過設定")
    .replace("Daily work including overtime exceeds configured", "單日含加班總工時超過設定")
    .replace("Monthly overtime exceeds configured", "月加班時數超過設定")
    .replace("Three-month overtime exceeds configured", "三個月加班總時數超過設定")
    .replace("cycle has fewer than", "週期內少於")
    .replace("regular leave day(s).", "個例假日。")
    .replace("rest day(s).", "個休息日。")
    .replace("hours.", "小時。");
}

function localizeSourceId(sourceId: string) {
  const labels: Record<string, string> = {
    "tw-lsa-article-24": "勞基法第 24 條",
    "tw-lsa-article-30": "勞基法第 30 條",
    "tw-lsa-article-32": "勞基法第 32 條",
    "tw-lsa-article-36": "勞基法第 36 條",
  };
  return labels[sourceId] ?? sourceId;
}

function localizeWorktimeError(error: string) {
  if (error.includes("permission") || error.includes("Forbidden")) {
    return "目前角色沒有建立工時異常的權限，請切換 HR 或 Owner 權限後再試。";
  }
  if (error.includes("Unable to create worktime compliance exceptions")) {
    return "目前無法建立工時異常，請稍後再試或檢查資料庫連線。";
  }
  return error;
}

function parseDate(value?: string) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatDateForDisplay(date: Date) {
  return new Intl.DateTimeFormat("zh-TW", { month: "2-digit", day: "2-digit" }).format(date);
}
