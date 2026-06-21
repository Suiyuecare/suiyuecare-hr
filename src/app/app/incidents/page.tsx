import { getDemoSession } from "@/server/auth/session";
import { getIncidentWorkspace } from "@/server/incidents/workplace";

type SearchParams = Promise<{
  error?: string;
}>;

export default async function EmployeeIncidentsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getDemoSession();
  const workspace = await getIncidentWorkspace(session);
  const openReportCount = workspace.incidents.filter((incident) => !["closed", "rejected"].includes(incident.status)).length;
  const nextAction = workspace.settings.reportingEnabled
    ? openReportCount
      ? "追蹤 HR 處理進度"
      : "用三步送出事件回報"
    : "回報入口暫停";

  return (
    <main className="page mobile-page">
      <section className="employee-hero" aria-label="職場事件回報">
        <div className="employee-hero-main">
          <div className="employee-hero-topline">
            <span className="muted">員工前台</span>
            <span className={`badge ${workspace.settings.reportingEnabled ? "" : "danger"}`}>
              {workspace.settings.reportingEnabled ? "可回報" : "暫停"}
            </span>
          </div>
          <h1>職場事件回報</h1>
          <p>安全危害、職災、性騷擾或職場暴力都可以從手機回報；請填事實、時間與地點，不需要填身分證、銀行、病歷或無關個資。</p>
        </div>
        <aside className="employee-hero-status" aria-label="事件回報下一步">
          <span className={`badge ${workspace.settings.reportingEnabled ? "focus" : "danger"}`}>下一步</span>
          <div>
            <small>目前狀態</small>
            <strong>{nextAction}</strong>
            <p>{workspace.settings.reportingEnabled ? "選類型、填時間地點、送出摘要即可。" : "請改聯絡 HR 或行政主管。"}</p>
          </div>
          <a className="button primary" href="#incident-report-form">
            開始回報
          </a>
        </aside>
      </section>

      <section className="employee-signal-board" aria-label="事件回報訊號板">
        <a className={`employee-signal-card ${workspace.settings.reportingEnabled ? "focus" : "warning"}`} href="#incident-report-form">
          <span>回報入口</span>
          <strong>{workspace.settings.reportingEnabled ? "開放" : "暫停"}</strong>
          <small>{workspace.settings.anonymousReportingEnabled ? "可匿名佔位" : "由 HR 保密處理"}</small>
        </a>
        <a className={`employee-signal-card ${openReportCount ? "focus" : "done"}`} href="#my-incident-reports">
          <span>我的回報</span>
          <strong>{workspace.incidents.length}</strong>
          <small>{openReportCount ? `${openReportCount} 件處理中` : "沒有處理中事件"}</small>
        </a>
        <a className="employee-signal-card done" href="#incident-report-form">
          <span>處理時限</span>
          <strong>{workspace.settings.investigationTargetDays} 天</strong>
          <small>HR 初步調查目標</small>
        </a>
        <a className="employee-signal-card warning" href="#incident-report-form">
          <span>嚴重事件</span>
          <strong>{workspace.settings.severeIncidentNotifyHours} 小時</strong>
          <small>需追蹤外部通報</small>
        </a>
      </section>

      <section className="employee-pilot-strip" aria-label="三步事件回報流程">
        <a className="employee-flow-step focus" href="#incident-report-form">
          <span>01</span>
          <strong>選類型</strong>
          <small>安全、職災、不當對待</small>
        </a>
        <a className="employee-flow-step ready" href="#incident-report-form">
          <span>02</span>
          <strong>填事實</strong>
          <small>時間、地點、發生經過</small>
        </a>
        <a className="employee-flow-step done" href="#my-incident-reports">
          <span>03</span>
          <strong>看進度</strong>
          <small>HR 會保密追蹤</small>
        </a>
      </section>

      <section className="grid">
        {params.error ? (
          <div className="panel span-12 risk-box danger-box">
            <strong>無法送出事件回報</strong>
            <p>{params.error}</p>
          </div>
        ) : null}

        <section className="panel span-12" id="incident-report-form">
          <div className="section-heading">
            <div>
              <h2>新的事件回報</h2>
              <p className="muted">三步內完成：選類型、填事實、送出。請不要填身分證、銀行帳號、醫療診斷或無關私人資料。</p>
            </div>
            <span className={`badge ${workspace.settings.reportingEnabled ? "" : "danger"}`}>
              {workspace.settings.reportingEnabled ? "開放" : "暫停"}
            </span>
          </div>
          <form action="/api/incidents" method="post" className="wizard-form employee-incident-report-form" aria-label="三步事件回報">
            <input type="hidden" name="intent" value="report" />
            <div className="field-grid">
              <label>
                類型
                <select name="incidentType" defaultValue="safety_hazard">
                  <option value="safety_hazard">安全危害</option>
                  <option value="near_miss">虛驚事件</option>
                  <option value="occupational_accident">職業災害</option>
                  <option value="harassment">性騷擾/不當對待</option>
                  <option value="workplace_violence">職場暴力</option>
                </select>
              </label>
              <label>
                風險程度
                <select name="severity" defaultValue="medium">
                  <option value="low">低風險</option>
                  <option value="medium">中風險</option>
                  <option value="high">高風險</option>
                  <option value="severe">嚴重</option>
                </select>
              </label>
              <label>
                發生時間
                <input name="occurredAt" type="datetime-local" defaultValue={toDateTimeLocal(new Date())} required />
              </label>
              <label>
                地點
                <input name="location" placeholder="例：辦公室茶水間、照服站、外勤途中" />
              </label>
            </div>
            <label>
              發生經過
              <textarea name="summary" rows={4} placeholder="請用事實描述發生了什麼、是否需要立即處理；不要填無關個資。" required />
            </label>
            <label className="check-row">
              <input name="confidential" type="checkbox" defaultChecked />
              標記為機密，由 HR 保密處理
            </label>
            <button className="button primary" type="submit" disabled={!workspace.settings.reportingEnabled}>
              送出回報
            </button>
          </form>
        </section>

        <section className="panel span-12" id="my-incident-reports">
          <div className="section-heading">
            <div>
              <h2>我的回報</h2>
              <p className="muted">不用找選單，送出後直接在這裡追蹤 HR 處理狀態。</p>
            </div>
            <span className="badge">{workspace.incidents.length}</span>
          </div>
          <ul className="task-list">
            {workspace.incidents.length === 0 ? (
              <li className="task">
                <span>尚未送出事件回報。</span>
                <span className="badge">Clear</span>
              </li>
            ) : null}
            {workspace.incidents.map((incident) => (
              <li className="task" key={incident.id}>
                <span>
                  <strong>{labelIncidentType(incident.incidentType)}</strong>
                  <small>
                    {labelSeverity(incident.severity)} · {labelStatus(incident.status)} · HR 目標 {formatDate(incident.investigationDueAt)} 前回覆
                  </small>
                  <small>{incident.correctiveAction ?? incident.summary}</small>
                </span>
                <span className={`badge ${incident.status === "submitted" ? "warning" : ""}`}>{labelStatus(incident.status)}</span>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}

function toDateTimeLocal(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function labelIncidentType(type: string) {
  const labels: Record<string, string> = {
    occupational_accident: "職業災害",
    near_miss: "虛驚事件",
    safety_hazard: "安全危害",
    harassment: "性騷擾/不當對待",
    workplace_violence: "職場暴力",
  };
  return labels[type] ?? type;
}

function labelSeverity(severity: string) {
  const labels: Record<string, string> = {
    low: "低風險",
    medium: "中風險",
    high: "高風險",
    severe: "嚴重",
  };
  return labels[severity] ?? severity;
}

function labelStatus(status: string) {
  const labels: Record<string, string> = {
    submitted: "已送出",
    in_review: "調查中",
    authority_reported: "已通報主管機關",
    corrective_action: "改善措施中",
    closed: "已結案",
    rejected: "不成立",
  };
  return labels[status] ?? status;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
