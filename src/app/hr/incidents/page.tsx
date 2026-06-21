import { getDemoSession } from "@/server/auth/session";
import { getIncidentWorkspace, type WorkplaceIncidentView } from "@/server/incidents/workplace";

type SearchParams = Promise<{
  error?: string;
}>;

export default async function HrIncidentsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getDemoSession();
  const workspace = await getIncidentWorkspace(session);
  const { settings, readiness } = workspace;
  const severeOpenCount = workspace.incidents.filter((incident) =>
    incident.severity === "severe" && !["closed", "rejected"].includes(incident.status),
  ).length;
  const authorityDueCount = workspace.incidents.filter((incident) =>
    incident.authorityReportNeeded && !incident.authorityReportedAt && !["closed", "rejected"].includes(incident.status),
  ).length;
  const focus = buildIncidentFocus({ readiness, severeOpenCount, authorityDueCount });
  const commandCards = buildIncidentCommandCards({
    reportingEnabled: settings.reportingEnabled,
    severeIncidentNotifyHours: settings.severeIncidentNotifyHours,
    investigationTargetDays: settings.investigationTargetDays,
    authorityReportRequired: settings.authorityReportRequired,
    verificationStatus: settings.verificationStatus,
    readiness,
  });

  return (
    <main className="page settings-control-page">
      <section className="settings-control-hero" aria-label="職場事件處理台">
        <div className="settings-control-hero-main">
          <div className="settings-control-hero-topline">
            <span className="muted">HR / 行政主管</span>
            <span className={`badge ${readiness.ready ? "" : readiness.overdueAuthorityReportCount || readiness.overdueInvestigationCount ? "danger" : "warning"}`}>
              {readiness.ready ? "可進上線 Gate" : "事件 Gate 待處理"}
            </span>
          </div>
          <h1>職場事件處理台</h1>
          <p>
            集中處理職場安全危害、職災、性騷擾、職場暴力、調查期限與主管機關通報；HR 只看安全處理所需摘要，audit log 只保存 hash 與狀態。
          </p>
          <div className="settings-control-hero-actions">
            <a className="button primary" href="#incident-settings-wizard">
              調整處理規則
            </a>
            <a className="button" href="#incident-queue">
              查看事件佇列
            </a>
            <a className="button" href="/settings/readiness">
              回上線 Gate
            </a>
          </div>
        </div>
        <aside className={`settings-control-focus ${focus.tone}`}>
          <span className="muted">今日先處理</span>
          <strong>{focus.title}</strong>
          <p>{focus.detail}</p>
          <a className="button primary" href={focus.href}>
            {focus.action}
          </a>
        </aside>
      </section>

      <section className="settings-signal-board" aria-label="事件風險訊號板">
        <a className={`settings-signal-card ${readiness.ready ? "done" : "warning"}`} href="#incident-readiness">
          <span>事件 Gate</span>
          <strong>{readiness.ready ? "通過" : "待複核"}</strong>
          <small>{labelVerificationStatus(settings.verificationStatus)} · {readiness.missing.length} 個缺口。</small>
        </a>
        <a className={`settings-signal-card ${readiness.openIncidentCount ? "warning" : "done"}`} href="#incident-queue">
          <span>開放事件</span>
          <strong>{readiness.openIncidentCount}</strong>
          <small>{severeOpenCount} 件嚴重事件仍需追蹤。</small>
        </a>
        <a className={`settings-signal-card ${readiness.overdueInvestigationCount ? "danger" : "done"}`} href="#incident-queue">
          <span>調查期限</span>
          <strong>{readiness.overdueInvestigationCount}</strong>
          <small>目標 {settings.investigationTargetDays} 天內完成初步調查。</small>
        </a>
        <a className={`settings-signal-card ${readiness.overdueAuthorityReportCount ? "danger" : authorityDueCount ? "warning" : "done"}`} href="#incident-queue">
          <span>主管機關通報</span>
          <strong>{authorityDueCount}</strong>
          <small>嚴重/職災事件目標 {settings.severeIncidentNotifyHours} 小時內追蹤。</small>
        </a>
      </section>

      <section className="settings-command-grid incident-command-grid" aria-label="事件處理作業區">
        {commandCards.map((card) => (
          <article className={`settings-command-card ${card.tone}`} key={card.title}>
            <div>
              <span className="muted">{card.area}</span>
              <h2>{card.title}</h2>
            </div>
            <span className={`badge ${card.tone === "danger" ? "danger" : card.tone === "warning" ? "warning" : ""}`}>
              {card.badge}
            </span>
            <p>{card.detail}</p>
            <a className="button primary" href={card.href}>
              {card.action}
            </a>
            <div className="settings-command-links">
              {card.links.map((link) => (
                <a href={link.href} key={link.href}>
                  {link.label}
                </a>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="grid">
        {params.error ? (
          <div className="panel span-12 risk-box danger-box">
            <strong>無法更新事件處理台</strong>
            <p>{params.error}</p>
          </div>
        ) : null}

        <div className="panel span-3 metric">
          <span className="muted">事件 Gate</span>
          <strong>{readiness.ready ? "Ready" : "Open"}</strong>
          <span className={`badge ${readiness.ready ? "" : "warning"}`}>{labelVerificationStatus(settings.verificationStatus)}</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">未結事件</span>
          <strong>{readiness.openIncidentCount}</strong>
          <span className="badge">處理中</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">調查逾期</span>
          <strong>{readiness.overdueInvestigationCount}</strong>
          <span className={`badge ${readiness.overdueInvestigationCount > 0 ? "danger" : ""}`}>overdue</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">通報逾期</span>
          <strong>{readiness.overdueAuthorityReportCount}</strong>
          <span className={`badge ${readiness.overdueAuthorityReportCount > 0 ? "danger" : ""}`}>主管機關</span>
        </div>

        <section className="panel span-12" id="incident-readiness">
          <div className="section-heading">
            <div>
              <h2>事件 readiness 清單</h2>
              <p className="muted">{translateReadinessDetail(readiness.detail)}</p>
            </div>
            <span className={`badge ${readiness.ready ? "" : "warning"}`}>{readiness.ready ? "完成" : "待複核"}</span>
          </div>
          {readiness.missing.length > 0 ? (
            <ul className="task-list">
              {readiness.missing.map((item) => (
                <li className="task" key={item}>
                  <span>{translateReadinessMissing(item)}</span>
                  <span className="badge warning">待補</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">事件通報、調查期限、通報追蹤與政策複核都已在目標內。</p>
          )}
        </section>

        <section className="panel span-5" id="incident-settings-wizard">
          <div className="section-heading">
            <div>
              <h2>三步事件處理設定</h2>
              <p className="muted">先開通回報，再設定通報/調查時限，最後由 HR 或法務複核版本。</p>
            </div>
            <span className="badge">Audited</span>
          </div>
          <form action="/api/incidents" method="post" className="wizard-form incident-settings-form" aria-label="三步事件處理設定">
            <input type="hidden" name="intent" value="settings" />
            <label className="check-row">
              <input name="reportingEnabled" type="checkbox" defaultChecked={settings.reportingEnabled} />
              開放員工事件回報
            </label>
            <label className="check-row">
              <input name="anonymousReportingEnabled" type="checkbox" defaultChecked={settings.anonymousReportingEnabled} />
              允許匿名回報佔位
            </label>
            <label className="check-row">
              <input name="authorityReportRequired" type="checkbox" defaultChecked={settings.authorityReportRequired} />
              嚴重/職災事件需要主管機關通報追蹤
            </label>
            <div className="field-grid">
              <label>
                嚴重事件通報時限
                <input name="severeIncidentNotifyHours" type="number" min="1" max="24" defaultValue={settings.severeIncidentNotifyHours} />
              </label>
              <label>
                調查目標天數
                <input name="investigationTargetDays" type="number" min="1" max="30" defaultValue={settings.investigationTargetDays} />
              </label>
              <label>
                性騷擾防治版本
                <input name="harassmentPolicyVersion" defaultValue={settings.harassmentPolicyVersion} />
              </label>
              <label>
                職安政策版本
                <input name="safetyPolicyVersion" defaultValue={settings.safetyPolicyVersion} />
              </label>
              <label>
                複核狀態
                <select name="verificationStatus" defaultValue={settings.verificationStatus}>
                  <option value="unverified">尚未複核</option>
                  <option value="verified">已複核</option>
                  <option value="failed">複核未通過</option>
                </select>
              </label>
              <label>
                最近複核
                <input value={settings.lastReviewedAt ? formatDateTime(settings.lastReviewedAt) : "尚未複核"} readOnly />
              </label>
            </div>
            <button className="button primary" type="submit">
              儲存事件處理設定
            </button>
          </form>
        </section>

        <section className="panel span-7" id="incident-queue">
          <div className="section-heading">
            <div>
              <h2>事件處理佇列</h2>
              <p className="muted">用狀態、通報與改善措施推進事件；audit log 不保存原始細節、地點或私人備註。</p>
            </div>
            <span className="badge">{workspace.incidents.length}</span>
          </div>
          <ul className="task-list incident-queue-list">
            {workspace.incidents.length === 0 ? (
              <li className="task">
                <span>目前沒有員工回報事件。</span>
                <span className="badge">Clear</span>
              </li>
            ) : null}
            {workspace.incidents.map((incident) => (
              <li className={`task incident-queue-card ${incidentTone(incident)}`} key={incident.id}>
                <span className="incident-queue-summary">
                  <strong>
                    {incident.reporterName} · {labelIncidentType(incident.incidentType)}
                  </strong>
                  <small>
                    {labelSeverity(incident.severity)} · {labelStatus(incident.status)} · 調查期限 {formatDate(incident.investigationDueAt)}
                  </small>
                  <small>
                    {incident.confidential ? "機密事件" : "一般事件"} · {incident.location ?? "未填地點"} ·{" "}
                    {incident.authorityReportNeeded
                      ? incident.authorityReportedAt
                        ? `已通報 ${formatDateTime(incident.authorityReportedAt)}`
                        : `待通報，期限 ${incident.authorityReportDueAt ? formatDateTime(incident.authorityReportDueAt) : "未設定"}`
                      : "不需主管機關通報"}
                  </small>
                  <small>{incident.correctiveAction ? `改善措施：${incident.correctiveAction}` : `摘要：${incident.summary}`}</small>
                </span>
                <form action="/api/incidents" method="post" className="incident-update-form" aria-label={`處理事件 ${labelIncidentType(incident.incidentType)}`}>
                  <input type="hidden" name="intent" value="update" />
                  <input type="hidden" name="incidentId" value={incident.id} />
                  <select name="status" defaultValue={incident.status} aria-label={`狀態 ${incident.reporterName}`}>
                    <option value="in_review">調查中</option>
                    <option value="authority_reported">已通報主管機關</option>
                    <option value="corrective_action">改善措施中</option>
                    <option value="closed">已結案</option>
                    <option value="rejected">不成立</option>
                  </select>
                  <label className="check-row compact-check">
                    <input name="authorityReported" type="checkbox" defaultChecked={Boolean(incident.authorityReportedAt)} />
                    已通報
                  </label>
                  <input name="correctiveAction" placeholder="改善措施代碼或短句，送出後 audit 只保存 hash" aria-label={`改善措施 ${incident.reporterName}`} />
                  <button className="button" type="submit">
                    更新處理
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}

function buildIncidentFocus(input: {
  readiness: { ready: boolean; overdueInvestigationCount: number; overdueAuthorityReportCount: number; missing: string[] };
  severeOpenCount: number;
  authorityDueCount: number;
}) {
  if (input.readiness.overdueAuthorityReportCount > 0) {
    return {
      title: "先補主管機關通報追蹤",
      detail: `${input.readiness.overdueAuthorityReportCount} 件通報已逾期，先確認職災/嚴重事件是否完成外部通報與證據保存。`,
      action: "處理通報",
      href: "#incident-queue",
      tone: "danger",
    };
  }
  if (input.readiness.overdueInvestigationCount > 0) {
    return {
      title: "先完成逾期調查",
      detail: `${input.readiness.overdueInvestigationCount} 件調查逾期，請補狀態、改善措施與結案判斷。`,
      action: "處理調查",
      href: "#incident-queue",
      tone: "danger",
    };
  }
  if (input.authorityDueCount > 0 || input.severeOpenCount > 0) {
    return {
      title: "追蹤嚴重事件",
      detail: `${input.severeOpenCount} 件嚴重事件、${input.authorityDueCount} 件待通報追蹤，先確認時限與負責人。`,
      action: "查看事件佇列",
      href: "#incident-queue",
      tone: "warning",
    };
  }
  if (!input.readiness.ready) {
    return {
      title: "補政策複核",
      detail: input.readiness.missing.map(translateReadinessMissing).join("、"),
      action: "調整設定",
      href: "#incident-settings-wizard",
      tone: "warning",
    };
  }
  return {
    title: "維持事件 Gate",
    detail: "目前沒有逾期事件；維持員工回報、調查時限、主管機關通報與政策版本複核。",
    action: "查看 readiness",
    href: "#incident-readiness",
    tone: "done",
  };
}

function buildIncidentCommandCards(input: {
  reportingEnabled: boolean;
  severeIncidentNotifyHours: number;
  investigationTargetDays: number;
  authorityReportRequired: boolean;
  verificationStatus: string;
  readiness: { openIncidentCount: number; overdueInvestigationCount: number; overdueAuthorityReportCount: number };
}) {
  return [
    {
      area: "員工回報",
      title: "開通安全回報入口",
      badge: input.reportingEnabled ? "已開通" : "已暫停",
      tone: input.reportingEnabled ? "ready" : "danger",
      detail: "員工可從手機前台回報安全危害、職災、性騷擾或職場暴力；系統會限制不必要個資。",
      action: "調整入口",
      href: "#incident-settings-wizard",
      links: [
        { label: "員工前台", href: "/app/incidents" },
        { label: "稽核紀錄", href: "/settings/audit" },
      ],
    },
    {
      area: "時限",
      title: "嚴重事件 8 小時內追蹤",
      badge: input.severeIncidentNotifyHours <= 8 ? `${input.severeIncidentNotifyHours} 小時` : "超過 8 小時",
      tone: input.severeIncidentNotifyHours <= 8 ? "ready" : "danger",
      detail: "嚴重事件與職災需要清楚的外部通報追蹤時限，避免月結或試用 Gate 才發現缺口。",
      action: "設定時限",
      href: "#incident-settings-wizard",
      links: [
        { label: "事件佇列", href: "#incident-queue" },
        { label: "上線 Gate", href: "/settings/readiness" },
      ],
    },
    {
      area: "調查",
      title: "調查與改善措施閉環",
      badge: input.readiness.overdueInvestigationCount ? `${input.readiness.overdueInvestigationCount} 逾期` : `${input.investigationTargetDays} 天`,
      tone: input.readiness.overdueInvestigationCount ? "danger" : input.readiness.openIncidentCount ? "warning" : "ready",
      detail: "每件事件都要有狀態、負責追蹤與改善措施；結案前不能只留下口頭紀錄。",
      action: "處理事件",
      href: "#incident-queue",
      links: [
        { label: "待處理事件", href: "#incident-queue" },
        { label: "支援存取", href: "/settings/support-access" },
      ],
    },
    {
      area: "政策",
      title: "HR/法務複核",
      badge: labelVerificationStatus(input.verificationStatus),
      tone: input.verificationStatus === "verified" ? "ready" : "warning",
      detail: "性騷擾防治、職安政策、主管機關通報與匿名回報設定都要有複核版本。",
      action: "補複核",
      href: "#incident-settings-wizard",
      links: [
        { label: "工作規則", href: "/hr/work-rules" },
        { label: "法規規則", href: "/settings/law-rules" },
      ],
    },
  ];
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

function labelVerificationStatus(status: string) {
  const labels: Record<string, string> = {
    unverified: "尚未複核",
    verified: "已複核",
    failed: "複核未通過",
  };
  return labels[status] ?? status;
}

function incidentTone(incident: WorkplaceIncidentView) {
  if (incident.status === "closed" || incident.status === "rejected") return "done";
  if (incident.severity === "severe" || incident.authorityReportNeeded) return "danger";
  if (incident.severity === "high") return "warning";
  return "";
}

function translateReadinessMissing(item: string) {
  const labels: Record<string, string> = {
    "employee incident reporting enabled": "開放員工事件回報",
    "incident response policy HR/legal review": "事件處理政策 HR/法務複核",
    "8-hour severe incident notification target": "嚴重事件 8 小時內通報目標",
    "overdue incident investigations": "逾期事件調查",
    "overdue authority report follow-up": "逾期主管機關通報追蹤",
  };
  return labels[item] ?? item;
}

function translateReadinessDetail(detail: string) {
  return detail
    .replace("open incident(s)", "件未結事件")
    .replace("overdue investigation(s)", "件調查逾期")
    .replace("overdue authority report(s)", "件通報逾期")
    .replace("review verified", "政策已複核")
    .replace("review unverified", "政策尚未複核")
    .replace("review failed", "政策複核未通過");
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
