import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";
import { dashboardPathForRole, hasPermission } from "@/server/auth/rbac";
import { getDemoSession } from "@/server/auth/session";
import {
  getNotificationAdminWorkspace,
  type NotificationChannel,
  type NotificationChannelSettings,
  type NotificationDeliveryRow,
} from "@/server/notifications/service";

type SearchParams = Promise<{ error?: string; success?: string }>;

type ChannelToggle = {
  name: keyof Pick<
    NotificationChannelSettings,
    "inAppEnabled" | "emailEnabled" | "lineEnabled" | "slackEnabled" | "teamsEnabled"
  >;
  channel: NotificationChannel;
  label: string;
  summary: string;
  external: boolean;
};

type EventToggle = {
  name: keyof Pick<
    NotificationChannelSettings,
    "approvalSubmittedEnabled" | "approvalDecisionEnabled" | "payrollReleasedEnabled" | "systemAlertEnabled"
  >;
  label: string;
  summary: string;
};

const channelToggles: ChannelToggle[] = [
  {
    name: "inAppEnabled",
    channel: "in_app",
    label: "站內通知",
    summary: "員工、主管與 HR 登入 HR One 後看到完整任務。",
    external: false,
  },
  {
    name: "emailEnabled",
    channel: "email",
    label: "Email",
    summary: "適合公告、薪資單釋出提醒與管理者通知。",
    external: true,
  },
  {
    name: "lineEnabled",
    channel: "line",
    label: "LINE",
    summary: "適合台灣員工常用即時提醒；外部 payload 只送摘要。",
    external: true,
  },
  {
    name: "slackEnabled",
    channel: "slack",
    label: "Slack",
    summary: "適合後台行政、人資與主管群組提醒。",
    external: true,
  },
  {
    name: "teamsEnabled",
    channel: "teams",
    label: "Teams",
    summary: "適合 Microsoft 365 客戶的企業通知。",
    external: true,
  },
];

const eventToggles: EventToggle[] = [
  {
    name: "approvalSubmittedEnabled",
    label: "簽核送出",
    summary: "員工送出請假、加班、補打卡或表單時通知主管。",
  },
  {
    name: "approvalDecisionEnabled",
    label: "簽核結果",
    summary: "主管核准、駁回或補件後通知申請人。",
  },
  {
    name: "payrollReleasedEnabled",
    label: "薪資單釋出",
    summary: "HR 釋出薪資單後提醒員工自行登入查看。",
  },
  {
    name: "systemAlertEnabled",
    label: "系統警示",
    summary: "上線 Gate、薪資月結、稽核與法遵風險提醒。",
  },
];

export default async function NotificationSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error, success }, session] = await Promise.all([searchParams, getDemoSession()]);
  if (!hasPermission(session.role, "settings:read")) {
    redirect(dashboardPathForRole(session.role));
  }

  const workspace = await getNotificationAdminWorkspace(session);
  const focus = buildNotificationFocus(workspace.settings);
  const externalEnabledCount = enabledExternalChannelCount(workspace.settings);
  const failedDeliveryCount = workspace.deliveries.filter((delivery) => delivery.status === "failed").length;
  const queuedDeliveryCount = workspace.deliveries.filter((delivery) => delivery.status === "queued").length;
  const checklist = buildNotificationChecklist(workspace.settings);
  const setupCards = buildNotificationSetupCards(workspace.settings, workspace.deliveries);

  return (
    <main className="page notification-settings-page">
      <section className="settings-control-hero notification-settings-hero" aria-label="通知管道工作台">
        <div className="settings-control-hero-main">
          <div className="settings-control-hero-topline">
            <span className="muted">Owner、人資與行政主管使用</span>
            <span className={`badge ${focus.tone === "ready" ? "" : "warning"}`}>{focus.badge}</span>
          </div>
          <h1>通知管道工作台</h1>
          <p>
            把站內通知、Email、LINE、Slack 與 Teams 變成可稽核的提醒政策；外部管道只保存 delivery hash 與狀態，不把請假理由、薪資、身分證、銀行帳號或私密人事內容送出 HR One。
          </p>
          <div className="settings-control-hero-actions">
            <a className="button primary" href="#notification-settings-form">
              調整通知
            </a>
            <Link className="button" href="/manager/inbox">
              主管 Inbox
            </Link>
            <Link className="button" href="/settings/readiness">
              上線閘門
            </Link>
          </div>
        </div>

        <aside className={`settings-control-focus ${focus.tone}`} aria-label="今日先處理">
          <span className="muted">今日先處理</span>
          <strong>{focus.title}</strong>
          <p>{focus.detail}</p>
          <a className="button primary" href={focus.href}>
            {focus.label}
          </a>
        </aside>
      </section>

      {success ? (
        <section className="notification-settings-alerts" aria-live="polite">
          <div className="panel success-panel">
            <strong>{successMessage(success)}</strong>
            <p>已寫入 notification_settings audit log；delivery 紀錄只顯示 hash、狀態與錯誤代碼，不顯示原始訊息內容。</p>
          </div>
        </section>
      ) : null}

      {error ? (
        <section className="notification-settings-alerts" aria-live="polite">
          <div className="panel danger-panel">
            <strong>通知設定未儲存</strong>
            <p>{localizeNotificationError(error)}</p>
          </div>
        </section>
      ) : null}

      <section className="settings-signal-board notification-settings-signal-board" aria-label="通知安全訊號板">
        <article className={`settings-signal-card ${workspace.settings.inAppEnabled ? "done" : "danger"}`}>
          <span>站內通知</span>
          <strong>{workspace.settings.inAppEnabled ? "已啟用" : "已停用"}</strong>
          <small>HR One 內部任務與狀態時間軸應保留完整通知內容。</small>
        </article>
        <article className={`settings-signal-card ${externalEnabledCount ? "done" : "warning"}`}>
          <span>外部管道</span>
          <strong>{externalEnabledCount} 個外部</strong>
          <small>{externalEnabledCount ? enabledExternalLabels(workspace.settings).join("、") : "正式上線前至少設定 Email、LINE、Slack 或 Teams 其中一項。"}</small>
        </article>
        <article className={`settings-signal-card ${workspace.settings.externalSummaryOnly ? "done" : "danger"}`}>
          <span>敏感內容</span>
          <strong>{workspace.settings.externalSummaryOnly ? "只送摘要" : "可能外送全文"}</strong>
          <small>外部管道不得收到薪資、個資、銀行帳號、身分證或私密人事內容。</small>
        </article>
        <article className={`settings-signal-card ${failedDeliveryCount ? "danger" : queuedDeliveryCount ? "warning" : "done"}`}>
          <span>Delivery 證據</span>
          <strong>{workspace.deliveries.length} 筆</strong>
          <small>{failedDeliveryCount ? `${failedDeliveryCount} 筆失敗需處理。` : queuedDeliveryCount ? `${queuedDeliveryCount} 筆等待 provider 設定。` : "目前沒有失敗 delivery。"}</small>
        </article>
      </section>

      <section className="settings-command-grid notification-settings-command-grid" aria-label="通知設定作業區">
        {setupCards.map((card) => (
          <article className={`settings-command-card notification-settings-command-card ${card.tone}`} key={card.title}>
            <div>
              <span className="muted">{card.stage}</span>
              <h2>{card.title}</h2>
            </div>
            <span className={`badge ${card.badgeClass}`}>{card.status}</span>
            <p>{card.detail}</p>
            <a className="button primary" href={card.href}>
              {card.actionLabel}
            </a>
            <div className="settings-command-links">
              {card.links.map((link) => (
                <Link href={link.href} key={link.href}>
                  {link.label}
                </Link>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="grid">
        <section className="panel span-12" id="notification-settings-form">
          <div className="section-heading">
            <div>
              <h2>三步通知設定精靈</h2>
              <p className="muted">先決定可用管道，再開啟事件觸發，最後檢查外部摘要與 delivery hash；儲存會寫入稽核紀錄。</p>
            </div>
            <span className="badge">Audited</span>
          </div>

          <form action="/api/settings/notifications" method="post" className="wizard-form notification-settings-form" aria-label="三步通知設定精靈">
            <fieldset className="form-card notification-settings-fieldset">
              <legend>1. 通知管道</legend>
              <p className="muted">站內通知保存完整任務內容；外部管道只送摘要，provider token、webhook 與密鑰請放在部署保管庫。</p>
              <div className="notification-channel-grid" aria-label="通知管道選項">
                {channelToggles.map((channel) => (
                  <label className={`notification-channel-card ${workspace.settings[channel.name] ? "enabled" : ""}`} key={channel.name}>
                    <span>
                      <strong>{channel.label}</strong>
                      <small>{channel.summary}</small>
                    </span>
                    <input name={channel.name} type="checkbox" defaultChecked={workspace.settings[channel.name]} />
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="form-card notification-settings-fieldset">
              <legend>2. 觸發事件</legend>
              <p className="muted">這些事件對員工三步完成任務與主管 15 秒簽核很重要；關閉後不會建立對應通知。</p>
              <div className="notification-event-grid" aria-label="通知事件選項">
                {eventToggles.map((event) => (
                  <label className={`notification-event-card ${workspace.settings[event.name] ? "enabled" : ""}`} key={event.name}>
                    <span>
                      <strong>{event.label}</strong>
                      <small>{event.summary}</small>
                    </span>
                    <input name={event.name} type="checkbox" defaultChecked={workspace.settings[event.name]} />
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="form-card notification-settings-fieldset">
              <legend>3. 安全與稽核</legend>
              <p className="muted">外部通知要快，但不能把敏感 HR 內容帶出受控系統。</p>
              <label className="check-row notification-summary-toggle">
                <input name="externalSummaryOnly" type="checkbox" defaultChecked={workspace.settings.externalSummaryOnly} />
                外部管道只接收摘要
              </label>
              <ul className="task-list notification-settings-checklist">
                {checklist.map((item) => (
                  <li className="task" key={item.title}>
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.detail}</small>
                    </span>
                    <span className={`badge ${item.ready ? "" : "warning"}`}>{item.ready ? "完成" : "待補"}</span>
                  </li>
                ))}
              </ul>
              <div className="notification-policy-note">
                <strong>安全提醒</strong>
                <p>請勿在外部通知 provider、webhook、範本或備註貼上薪資、銀行帳號、身分證字號、健康資料、請假私密理由或員工私下備註。</p>
              </div>
              <button className="button primary" type="submit">
                儲存通知設定
              </button>
            </fieldset>
          </form>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>最近 delivery 證據</h2>
              <p className="muted">只顯示管道、狀態、payload hash、destination hash 與錯誤代碼；不顯示通知原文。</p>
            </div>
            <span className="badge">Hash only</span>
          </div>
          {workspace.deliveries.length === 0 ? (
            <EmptyState title="尚無 delivery 紀錄" body="員工送出申請、主管簽核或 HR 釋出薪資單後，這裡會出現不含原文的 delivery metadata。" />
          ) : (
            <div className="notification-delivery-grid" aria-label="最近 delivery 紀錄">
              {workspace.deliveries.map((delivery) => (
                <article className={`notification-delivery-card ${delivery.status}`} key={delivery.id}>
                  <div className="notification-delivery-head">
                    <span className="notification-channel-pill">{channelLabel(delivery.channel)}</span>
                    <span className={`badge ${deliveryBadgeClass(delivery.status)}`}>{deliveryStatusLabel(delivery.status)}</span>
                  </div>
                  <div className="notification-delivery-meta">
                    <span>payload {delivery.payloadHash.slice(0, 12)}</span>
                    <span>destination {delivery.destinationHash?.slice(0, 12) ?? "n/a"}</span>
                    <span>{formatDeliveryDate(delivery.createdAt)}</span>
                  </div>
                  {delivery.errorCode ? <small className="warning-text">{delivery.errorCode}</small> : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function buildNotificationFocus(settings: NotificationChannelSettings) {
  if (!settings.inAppEnabled) {
    return {
      badge: "站內通知關閉",
      tone: "warning" as const,
      title: "先恢復站內通知",
      detail: "站內通知是員工時間軸、主管 Inbox 與 HR 月結提醒的基礎，不應在正式導入前關閉。",
      href: "#notification-settings-form",
      label: "開啟站內通知",
    };
  }

  if (!enabledExternalChannelCount(settings)) {
    return {
      badge: "外部通知待補",
      tone: "warning" as const,
      title: "補一個外部提醒管道",
      detail: "正式試用前至少要有 Email、LINE、Slack 或 Teams，主管與 HR 才不會漏掉簽核和月結警示。",
      href: "#notification-settings-form",
      label: "設定外部管道",
    };
  }

  if (!settings.externalSummaryOnly) {
    return {
      badge: "外部 payload 風險",
      tone: "warning" as const,
      title: "外部管道改成只送摘要",
      detail: "外部系統不應收到薪資、請假理由、身分證、銀行帳號或私密人事內容。",
      href: "#notification-settings-form",
      label: "啟用摘要",
    };
  }

  if (enabledEventToggleCount(settings) < eventToggles.length) {
    return {
      badge: "事件通知待補",
      tone: "warning" as const,
      title: "補齊核心事件通知",
      detail: "簽核送出、簽核結果、薪資單釋出與系統警示都會影響員工任務完成率。",
      href: "#notification-settings-form",
      label: "開啟事件",
    };
  }

  return {
    badge: "通知政策已就緒",
    tone: "ready" as const,
    title: "檢查 delivery 與上線 Gate",
    detail: "管道、事件與摘要護欄都已啟用，下一步確認 provider 設定與 production readiness。",
    href: "/settings/readiness",
    label: "看上線閘門",
  };
}

function buildNotificationSetupCards(
  settings: NotificationChannelSettings,
  deliveries: NotificationDeliveryRow[],
) {
  const externalCount = enabledExternalChannelCount(settings);
  const eventCount = enabledEventToggleCount(settings);
  const failedCount = deliveries.filter((delivery) => delivery.status === "failed").length;
  const queuedCount = deliveries.filter((delivery) => delivery.status === "queued").length;

  return [
    {
      stage: "Step 1",
      title: "外部管道",
      status: externalCount ? `${externalCount} 個` : "待補",
      badgeClass: externalCount ? "" : "warning",
      tone: externalCount ? "ready" : "warning",
      detail: "正式上線前至少要有一個外部提醒管道；provider token 與 webhook 不保存於 HR One。",
      href: "#notification-settings-form",
      actionLabel: "設定管道",
      links: [
        { href: "/settings/security", label: "資安政策" },
        { href: "/settings/readiness", label: "上線 Gate" },
      ],
    },
    {
      stage: "Step 2",
      title: "敏感摘要",
      status: settings.externalSummaryOnly ? "安全" : "需修正",
      badgeClass: settings.externalSummaryOnly ? "" : "danger",
      tone: settings.externalSummaryOnly ? "ready" : "danger",
      detail: "外部 Email、LINE、Slack、Teams 僅接收摘要，員工需回 HR One 查看完整內容。",
      href: "#notification-settings-form",
      actionLabel: "檢查摘要",
      links: [
        { href: "/settings/privacy", label: "個資治理" },
        { href: "/settings/audit", label: "Audit log" },
      ],
    },
    {
      stage: "Step 3",
      title: "事件觸發",
      status: `${eventCount}/${eventToggles.length}`,
      badgeClass: eventCount === eventToggles.length ? "" : "warning",
      tone: eventCount === eventToggles.length ? "ready" : "warning",
      detail: "簽核與薪資單通知會直接影響員工任務完成率、主管簽核速度與 HR 月結節奏。",
      href: "#notification-settings-form",
      actionLabel: "開啟事件",
      links: [
        { href: "/manager/inbox", label: "主管 Inbox" },
        { href: "/hr", label: "HR 月結" },
      ],
    },
    {
      stage: "Evidence",
      title: "Delivery 證據",
      status: failedCount ? `${failedCount} 失敗` : queuedCount ? `${queuedCount} queued` : "正常",
      badgeClass: failedCount ? "danger" : queuedCount ? "warning" : "",
      tone: failedCount ? "danger" : queuedCount ? "warning" : "ready",
      detail: "delivery metadata 只保留 hash、狀態與錯誤代碼，可供上線 Gate 與稽核檢查。",
      href: "#notification-settings-form",
      actionLabel: "查看證據",
      links: [
        { href: "/settings/readiness", label: "Readiness" },
        { href: "/settings/audit", label: "Audit log" },
      ],
    },
  ];
}

function buildNotificationChecklist(settings: NotificationChannelSettings) {
  const externalLabels = enabledExternalLabels(settings);
  return [
    {
      title: "站內通知已啟用",
      detail: settings.inAppEnabled ? "HR One 內部任務可保留完整內容與狀態時間軸。" : "站內通知關閉會讓員工與主管漏掉任務。",
      ready: settings.inAppEnabled,
    },
    {
      title: "至少一個外部管道",
      detail: externalLabels.length ? `目前啟用 ${externalLabels.join("、")}。` : "正式上線前需啟用 Email、LINE、Slack 或 Teams 其中一項。",
      ready: externalLabels.length > 0,
    },
    {
      title: "外部管道只接收摘要",
      detail: settings.externalSummaryOnly ? "外部訊息只含摘要與回 HR One 查看提示。" : "外部通知可能帶出敏感內容，正式上線前需修正。",
      ready: settings.externalSummaryOnly,
    },
    {
      title: "核心事件通知已覆蓋",
      detail: `目前啟用 ${enabledEventToggleCount(settings)}/${eventToggles.length} 類事件。`,
      ready: enabledEventToggleCount(settings) === eventToggles.length,
    },
  ];
}

function enabledExternalChannelCount(settings: NotificationChannelSettings) {
  return channelToggles.filter((channel) => channel.external && settings[channel.name]).length;
}

function enabledEventToggleCount(settings: NotificationChannelSettings) {
  return eventToggles.filter((event) => settings[event.name]).length;
}

function enabledExternalLabels(settings: NotificationChannelSettings) {
  return channelToggles
    .filter((channel) => channel.external && settings[channel.name])
    .map((channel) => channel.label);
}

function channelLabel(channel: NotificationChannel) {
  const labels: Record<NotificationChannel, string> = {
    in_app: "站內",
    email: "Email",
    line: "LINE",
    slack: "Slack",
    teams: "Teams",
  };
  return labels[channel];
}

function deliveryStatusLabel(status: NotificationDeliveryRow["status"]) {
  if (status === "sent") return "已送達";
  if (status === "skipped") return "略過";
  if (status === "failed") return "失敗";
  return "待送";
}

function deliveryBadgeClass(status: NotificationDeliveryRow["status"]) {
  if (status === "failed") return "danger";
  if (status === "skipped" || status === "queued") return "warning";
  return "";
}

function formatDeliveryDate(date: Date) {
  return date.toISOString().slice(0, 16).replace("T", " ");
}

function successMessage(success: string) {
  if (success === "notifications") return "通知設定已儲存";
  return "通知設定已更新";
}

function localizeNotificationError(error: string) {
  if (/settings:write/i.test(error)) return "目前角色沒有權限變更通知設定。";
  return "請確認通知管道與事件設定後再試一次。";
}
