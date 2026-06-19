import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { hasPermission } from "@/server/auth/rbac";
import { getDemoSession } from "@/server/auth/session";
import { getHrOneKpis, summarizeHrOneKpis, type HrOneKpi, type HrOneKpiStatus } from "@/server/kpis/hr-one";

export default async function HrOneKpiPage() {
  const session = await getDemoSession();
  if (!hasPermission(session.role, "dashboard:hr")) {
    return (
      <main className="page">
        <EmptyState
          title="需要 HR 或老闆權限"
          body="KPI 指揮台會影響上線與銷售決策，請切換為人資管理員或老闆示範角色。"
        />
      </main>
    );
  }

  const kpis = await getHrOneKpis(session);
  const summary = summarizeHrOneKpis(kpis);
  const focusKpi = getFocusKpi(kpis);
  const ownerGroups = buildOwnerGroups(kpis);
  const quickKpis = {
    firstLeave: findKpi(kpis, "first_leave_success_time"),
    managerApproval: findKpi(kpis, "manager_leave_approval_time"),
    audit: findKpi(kpis, "audit_log_coverage"),
    payrollAccess: findKpi(kpis, "unauthorized_payroll_access"),
    aiSources: findKpi(kpis, "ai_answers_with_sources"),
  };

  return (
    <main className="page hr-kpi-page">
      <section className="hr-monthly-hero hr-kpi-hero" aria-label="HR One KPI 指揮台">
        <div className="hr-monthly-hero-main">
          <div className="hr-monthly-hero-topline">
            <span className="badge">上線販售指標</span>
            <span className={`badge ${summary.readyForSale ? "done" : summary.failing ? "danger" : "warning"}`}>
              {summary.passing}/{summary.total} 達標
            </span>
          </div>
          <h1>HR One 贏面 KPI 指揮台</h1>
          <p>
            這裡不是一般報表清單，而是判斷產品能不能導入、能不能賣的十個關鍵指標：員工要快、主管要省力、HR 月結要降工時，敏感資料與 AI 則必須零容忍。
          </p>
          <div className="hr-monthly-hero-actions">
            <Link className="button primary" href="/hr">
              回 HR 月結
            </Link>
            <Link className="button" href="/settings/readiness">
              檢查上線 Gate
            </Link>
            <Link className="button" href="/settings/company-setup">
              公司導入精靈
            </Link>
          </div>
        </div>

        <aside className={`hr-monthly-hero-focus ${focusClass(focusKpi.status)}`} aria-label="今日先看">
          <span className="badge">今日先看</span>
          <strong>{kpiName(focusKpi)}</strong>
          <p>
            目前 {localizeValue(focusKpi.current)}，目標 {targetLabel(focusKpi)}。{nextStepLabel(focusKpi)}
          </p>
          <small>
            狀態：{statusLabel(focusKpi.status)} · 負責：{ownerLabel(focusKpi.owner)} · 不顯示員工姓名、薪資、銀行帳號或身分證。
          </small>
          <Link className="button primary" href={ownerActionHref(focusKpi.owner)}>
            {ownerActionLabel(focusKpi.owner)}
          </Link>
        </aside>
      </section>

      <section className="hr-monthly-signal-board hr-kpi-signal-board" aria-label="KPI 訊號板">
        <article className={`hr-monthly-signal-card ${summary.readyForSale ? "done" : summary.failing ? "danger" : "warning"}`}>
          <span>銷售 readiness</span>
          <strong>{summary.readyForSale ? "接近可販售" : "尚未可販售"}</strong>
          <small>{summary.failing} 未達標 / {summary.watch} 觀察；watch 不可超過 2 項。</small>
        </article>
        <article className={`hr-monthly-signal-card ${signalTone(quickKpis.firstLeave?.status)}`}>
          <span>員工速度</span>
          <strong>{localizeValue(quickKpis.firstLeave?.current ?? "尚無資料")}</strong>
          <small>第一次請假目標小於 60 秒，保持手機三步內完成。</small>
        </article>
        <article className={`hr-monthly-signal-card ${signalTone(quickKpis.managerApproval?.status)}`}>
          <span>主管效率</span>
          <strong>{localizeValue(quickKpis.managerApproval?.current ?? "尚無資料")}</strong>
          <small>請假平均簽核目標小於 15 秒，維持統一 Inbox。</small>
        </article>
        <article className={`hr-monthly-signal-card ${securitySignalTone([
          quickKpis.audit,
          quickKpis.payrollAccess,
          quickKpis.aiSources,
        ])}`}>
          <span>安全與 AI</span>
          <strong>{securitySignalLabel([quickKpis.audit, quickKpis.payrollAccess, quickKpis.aiSources])}</strong>
          <small>audit 覆蓋、薪資權限測試與 AI 來源引用都必須 100%。</small>
        </article>
      </section>

      <section className="settings-command-grid hr-kpi-owner-grid" aria-label="KPI 責任工作區">
        {ownerGroups.map((group) => (
          <article className={`settings-command-card ${group.tone}`} key={group.owner}>
            <span className={`badge ${group.badgeClass}`}>{group.status}</span>
            <h2>{ownerLabel(group.owner)}</h2>
            <p>{group.summary}</p>
            <Link className="button primary" href={ownerActionHref(group.owner)}>
              {ownerActionLabel(group.owner)}
            </Link>
            <div className="settings-command-links">
              {group.kpis.map((kpi) => (
                <Link href={`#${kpi.id}`} key={kpi.id}>
                  {kpiName(kpi)}
                </Link>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="grid">
        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>10 個贏面指標</h2>
              <p className="muted">所有數據都來自 privacy-safe telemetry、測試矩陣或 audit 覆蓋摘要；不得用原始個資、薪資或私密人事內容做展示。</p>
            </div>
            <span className={`badge ${summary.readyForSale ? "done" : "warning"}`}>
              {summary.readyForSale ? "可進入銷售 Gate" : "仍需改善"}
            </span>
          </div>

          <ol className="hr-kpi-list">
            {kpis.map((kpi, index) => (
              <li className={`hr-kpi-list-item ${signalTone(kpi.status)}`} id={kpi.id} key={kpi.id}>
                <span className="hr-kpi-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="hr-kpi-copy">
                  <strong>{kpiName(kpi)}</strong>
                  <small>
                    {ownerLabel(kpi.owner)} · 目標 {targetLabel(kpi)} · 目前 {localizeValue(kpi.current)}
                  </small>
                  <small>{nextStepLabel(kpi)}</small>
                </span>
                <span className="hr-kpi-evidence">
                  <small>證據來源</small>
                  <strong>{evidenceLabel(kpi)}</strong>
                </span>
                <span className={`badge ${badgeClass(kpi.status)}`}>{statusLabel(kpi.status)}</span>
              </li>
            ))}
          </ol>
        </section>
      </section>
    </main>
  );
}

function getFocusKpi(kpis: HrOneKpi[]): HrOneKpi {
  const focus =
    kpis.find((kpi) => kpi.status === "failing") ??
    kpis.find((kpi) => kpi.status === "watch") ??
    kpis[0];
  if (!focus) throw new Error("HR One KPI scorecard is empty.");
  return focus;
}

function findKpi(kpis: HrOneKpi[], id: string) {
  return kpis.find((kpi) => kpi.id === id);
}

function buildOwnerGroups(kpis: HrOneKpi[]) {
  const owners: HrOneKpi["owner"][] = ["Employee UX", "Manager UX", "HR Ops", "Security", "AI Safety"];
  return owners.map((owner) => {
    const ownerKpis = kpis.filter((kpi) => kpi.owner === owner);
    const failing = ownerKpis.filter((kpi) => kpi.status === "failing").length;
    const watch = ownerKpis.filter((kpi) => kpi.status === "watch").length;
    const tone = failing ? "danger" : watch ? "warning" : "ready";
    return {
      owner,
      kpis: ownerKpis,
      tone,
      badgeClass: tone === "ready" ? "done" : tone,
      status: failing ? `${failing} 未達標` : watch ? `${watch} 觀察` : "全數達標",
      summary: ownerSummary(owner, ownerKpis),
    };
  });
}

function ownerSummary(owner: HrOneKpi["owner"], kpis: HrOneKpi[]) {
  const count = kpis.length;
  switch (owner) {
    case "Employee UX":
      return `${count} 個指標看員工是否能不用教也會用，包含 60 秒請假、手機任務完成率與第一週訓練時間。`;
    case "Manager UX":
      return `${count} 個指標盯主管簽核速度，確保 Inbox 可以在 15 秒內處理常見請假。`;
    case "HR Ops":
      return `${count} 個指標看 HR 是否省工，包含薪資月結時間、出勤異常解決率與表單自助率。`;
    case "Security":
      return `${count} 個指標守薪資、audit 與未授權存取；任何漏洞都不能進入銷售 Gate。`;
    case "AI Safety":
      return `${count} 個指標確保 AI 只做輔助，回答必須有來源且不得替人做敏感決策。`;
  }
}

function kpiName(kpi: HrOneKpi) {
  return kpiNames[kpi.id] ?? kpi.name;
}

const kpiNames: Record<string, string> = {
  first_leave_success_time: "新員工第一次請假成功時間",
  manager_leave_approval_time: "主管平均請假簽核時間",
  payroll_close_reduction: "HR 每月薪資結算時間降低幅度",
  attendance_exception_auto_resolution: "出勤異常月底前自動解決率",
  employee_mobile_task_completion: "員工手機端任務完成率",
  hr_self_serve_form_creation: "HR 自建表單不需工程支援比例",
  audit_log_coverage: "重要資料修改 audit log 覆蓋率",
  unauthorized_payroll_access: "薪資資料未授權存取測試漏洞",
  ai_answers_with_sources: "AI 回答有來源比例",
  first_week_training_time: "導入第一週員工教學時間",
};

function targetLabel(kpi: HrOneKpi) {
  return targetLabels[kpi.id] ?? localizeValue(kpi.target);
}

const targetLabels: Record<string, string> = {
  first_leave_success_time: "小於 60 秒",
  manager_leave_approval_time: "小於 15 秒",
  payroll_close_reduction: "降低 70% 以上",
  attendance_exception_auto_resolution: "高於 90%",
  employee_mobile_task_completion: "高於 95%",
  hr_self_serve_form_creation: "高於 80%",
  audit_log_coverage: "100%",
  unauthorized_payroll_access: "0 個通過漏洞",
  ai_answers_with_sources: "100% 有來源",
  first_week_training_time: "小於 10 分鐘",
};

function nextStepLabel(kpi: HrOneKpi) {
  return nextSteps[kpi.id] ?? kpi.nextStep;
}

const nextSteps: Record<string, string> = {
  first_leave_success_time: "把請假入口固定在今日卡，避免增加必填欄位。",
  manager_leave_approval_time: "所有請假、加班、補卡都留在統一 Inbox，保留快速核准。",
  payroll_close_reduction: "持續自動化漏打卡、待簽核與付款資料缺口。",
  attendance_exception_auto_resolution: "把工時與漏打卡風險在月底前推成員工/主管提醒。",
  employee_mobile_task_completion: "補齊打卡、請假、加班、補卡、表單與薪資單的開始/完成 telemetry。",
  hr_self_serve_form_creation: "補常用欄位 preset 與台灣 HR 常見流程樣板。",
  audit_log_coverage: "敏感 create/update/delete 都要有 audit 測試守住。",
  unauthorized_payroll_access: "新增薪資 API、匯出或支援代入時同步擴充權限矩陣。",
  ai_answers_with_sources: "每個檢索型 AI 功能接 provider 前都必須強制引用來源。",
  first_week_training_time: "第一週仍用任務卡與短訓練，不把新人推進深層選單。",
};

function evidenceLabel(kpi: HrOneKpi) {
  if (kpi.owner === "Security") return "權限測試 + audit";
  if (kpi.owner === "AI Safety") return "AI 安全測試";
  if (kpi.owner === "HR Ops") return "HR 流程 telemetry";
  if (kpi.owner === "Manager UX") return "簽核 telemetry";
  return "員工手機 telemetry";
}

function ownerLabel(owner: HrOneKpi["owner"]) {
  switch (owner) {
    case "Employee UX":
      return "員工體驗";
    case "Manager UX":
      return "主管簽核";
    case "HR Ops":
      return "HR 營運";
    case "Security":
      return "資安稽核";
    case "AI Safety":
      return "AI 安全";
  }
}

function ownerActionHref(owner: HrOneKpi["owner"]) {
  switch (owner) {
    case "Employee UX":
      return "/app";
    case "Manager UX":
      return "/manager/inbox";
    case "HR Ops":
      return "/hr";
    case "Security":
      return "/settings/readiness";
    case "AI Safety":
      return "/hr/copilot";
  }
}

function ownerActionLabel(owner: HrOneKpi["owner"]) {
  switch (owner) {
    case "Employee UX":
      return "檢查員工前台";
    case "Manager UX":
      return "檢查簽核 Inbox";
    case "HR Ops":
      return "回 HR 指揮台";
    case "Security":
      return "檢查上線 Gate";
    case "AI Safety":
      return "檢查 AI Copilot";
  }
}

function statusLabel(status: HrOneKpiStatus) {
  if (status === "passing") return "達標";
  if (status === "watch") return "觀察";
  return "未達標";
}

function badgeClass(status: HrOneKpiStatus) {
  if (status === "passing") return "done";
  if (status === "watch") return "warning";
  return "danger";
}

function signalTone(status?: HrOneKpiStatus) {
  if (status === "passing") return "done";
  if (status === "watch") return "warning";
  return "danger";
}

function focusClass(status: HrOneKpiStatus) {
  if (status === "passing") return "";
  if (status === "watch") return "warning";
  return "danger";
}

function securitySignalTone(kpis: Array<HrOneKpi | undefined>) {
  if (kpis.some((kpi) => kpi?.status === "failing")) return "danger";
  if (kpis.some((kpi) => kpi?.status === "watch")) return "warning";
  return "done";
}

function securitySignalLabel(kpis: Array<HrOneKpi | undefined>) {
  const failing = kpis.filter((kpi) => kpi?.status === "failing").length;
  const watch = kpis.filter((kpi) => kpi?.status === "watch").length;
  if (failing) return `${failing} 項未達`;
  if (watch) return `${watch} 項觀察`;
  return "全數達標";
}

function localizeValue(value: string) {
  return value
    .replace("No telemetry yet", "尚無 telemetry")
    .replace("No audit events yet", "尚無 audit 事件")
    .replace("100% covered in guarded demo flows", "受保護流程 100% 覆蓋")
    .replace("0 known escapes in payroll access matrix tests", "權限矩陣 0 個已知漏洞")
    .replace("100% for policy Q&A tests", "政策 Q&A 測試 100% 有來源")
    .replace("under ", "小於 ")
    .replace("above ", "高於 ")
    .replace("seconds", "秒")
    .replace("second", "秒")
    .replace("minutes", "分鐘")
    .replace("minute", "分鐘");
}
