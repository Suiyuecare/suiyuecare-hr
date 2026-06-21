import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { hasPermission } from "@/server/auth/rbac";
import { getDemoSession } from "@/server/auth/session";
import {
  evaluateAttendanceRecordkeepingReadiness,
  getAttendancePolicySettings,
  minimumAttendanceRetentionDays,
  type AttendancePolicyView,
} from "@/server/attendance/policies";

type SearchParams = Promise<{
  error?: string;
}>;

type AttendancePolicyFocus = {
  title: string;
  detail: string;
  note: string;
  tone: "danger" | "warning" | "ready";
  href: string;
  actionLabel: string;
};

export default async function AttendancePoliciesPage({ searchParams }: { searchParams: SearchParams }) {
  const [params, session] = await Promise.all([searchParams, getDemoSession()]);

  if (!hasPermission(session.role, "settings:read")) {
    return (
      <main className="page attendance-policy-page">
        <section className="hr-monthly-hero attendance-policy-hero" aria-label="打卡與出勤政策工作台">
          <div className="hr-monthly-hero-main">
            <div className="hr-monthly-hero-topline">
              <span className="badge">出勤管理</span>
              <span className="badge danger">權限不足</span>
            </div>
            <h1>打卡與出勤政策工作台</h1>
            <p>這是後台政策頁，只開放 Owner、HR 或授權行政管理角色維護。一般員工只在前台查看自己的出勤與打卡提示。</p>
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
            <strong>出勤設定已保護</strong>
            <p>打卡限制會影響員工手機任務、出勤異常、加班判斷與薪資月結，因此未授權角色不顯示政策內容。</p>
            <small>請切換 HR 或 Owner 後再進入設定。</small>
          </aside>
        </section>
      </main>
    );
  }

  const policies = await getAttendancePolicySettings(session);
  const activePolicy = policies.find((policy) => policy.status === "active");
  const recordkeeping = evaluateAttendanceRecordkeepingReadiness(activePolicy);
  const inactivePolicyCount = policies.filter((policy) => policy.status === "inactive").length;
  const punchGuardrailCount = activePolicy ? countPunchGuardrails(activePolicy) : 0;
  const focus = buildAttendanceFocus(activePolicy, recordkeeping);

  return (
    <main className="page attendance-policy-page">
      <section className="hr-monthly-hero attendance-policy-hero" aria-label="打卡與出勤政策工作台">
        <div className="hr-monthly-hero-main">
          <div className="hr-monthly-hero-topline">
            <span className="badge">勞基法第 30 條</span>
            <span className="badge">打卡設定</span>
            <span className={`badge ${recordkeeping.ready ? "done" : "warning"}`}>
              {recordkeeping.ready ? "保存 Gate 已過" : "保存 Gate 待補"}
            </span>
          </div>
          <h1>打卡與出勤政策工作台</h1>
          <p>
            將工作時間門檻、打卡方式、補卡與加班簽核、員工自助查看、出勤紀錄五年保存集中成一個月結前工作台。HR
            只調整政策，員工端仍維持清楚的手機打卡任務。
          </p>
          <div className="hr-monthly-hero-actions">
            <Link className="button primary" href="#attendance-policy-wizard">
              更新打卡政策
            </Link>
            <Link className="button" href="/app/attendance">
              員工出勤頁
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
        <section className="attendance-policy-alerts" aria-live="polite">
          <div className="panel danger-panel">
            <strong>出勤政策未儲存</strong>
            <p>{localizeAttendancePolicyError(params.error)}</p>
          </div>
        </section>
      ) : null}

      <section className="hr-monthly-signal-board attendance-policy-signal-board" aria-label="出勤政策訊號板">
        <article className={`hr-monthly-signal-card ${activePolicy ? "done" : "warning"}`}>
          <span>啟用政策</span>
          <strong>{activePolicy?.name ?? "尚未設定"}</strong>
          <small>{activePolicy ? `生效 ${formatDate(activePolicy.effectiveFrom)}，停用政策 ${inactivePolicyCount} 筆。` : "請先建立啟用政策，員工端才有一致提示。"}</small>
        </article>
        <article className={`hr-monthly-signal-card ${recordkeeping.ready ? "done" : "danger"}`}>
          <span>保存 Gate</span>
          <strong>{activePolicy ? `${activePolicy.attendanceRecordRetentionDays} 天` : "缺政策"}</strong>
          <small>出勤紀錄需保存五年、逐日記載至分鐘，員工申請副本時不得拒絕。</small>
        </article>
        <article className={`hr-monthly-signal-card ${punchGuardrailCount ? "focus" : "warning"}`}>
          <span>打卡護欄</span>
          <strong>{punchGuardrailCount} 項</strong>
          <small>{activePolicy ? describePunchControls(activePolicy) : "尚無打卡限制設定。"}</small>
        </article>
        <article className={`hr-monthly-signal-card ${activePolicy?.requireOvertimeApproval && activePolicy?.requirePunchCorrectionApproval ? "done" : "warning"}`}>
          <span>簽核護欄</span>
          <strong>{activePolicy?.requireOvertimeApproval && activePolicy?.requirePunchCorrectionApproval ? "完整" : "待補"}</strong>
          <small>加班與補卡應進入統一 Inbox，避免月底才發現未核准資料。</small>
        </article>
      </section>

      <section className="settings-command-grid attendance-policy-command-grid" aria-label="出勤政策作業卡">
        <article className={`settings-command-card ${activePolicy ? "ready" : "warning"}`}>
          <span className={`badge ${activePolicy ? "done" : "warning"}`}>
            {activePolicy ? "已啟用" : "需建立"}
          </span>
          <h2>員工出勤規則</h2>
          <p>設定每日工時門檻、加班警示、上下班寬限，讓 Today Card、異常與月結使用同一份政策。</p>
          <Link className="button primary" href="#attendance-policy-wizard">
            更新規則
          </Link>
        </article>
        <article className={`settings-command-card ${activePolicy?.allowMobilePunch ? "ready" : "warning"}`}>
          <span className={`badge ${activePolicy?.allowMobilePunch ? "done" : "warning"}`}>
            {activePolicy?.allowMobilePunch ? "手機可用" : "手機關閉"}
          </span>
          <h2>打卡設定</h2>
          <p>可限制遠端、公司網路或 GPS 範圍；員工端只顯示明確提示，不讓非技術員工猜錯流程。</p>
          <Link className="button" href="#attendance-policy-wizard">
            設定打卡
          </Link>
        </article>
        <article className={`settings-command-card ${recordkeeping.ready ? "ready" : "danger"}`}>
          <span className={`badge ${recordkeeping.ready ? "done" : "danger"}`}>
            {recordkeeping.ready ? "保存就緒" : "月結前必補"}
          </span>
          <h2>出勤紀錄保存</h2>
          <p>勞基法第 30 條要求出勤紀錄保存五年、逐日到分鐘，並提供員工副本或影本。</p>
          <Link className="button" href="#attendance-recordkeeping-gate">
            查看 Gate
          </Link>
        </article>
        <article className="settings-command-card warning">
          <span className="badge warning">月結護欄</span>
          <h2>異常要提前清</h2>
          <p>政策更新後回到出勤異常工作台，確認缺卡、遲到、加班與補卡不會卡住薪資月結。</p>
          <Link className="button" href="/hr/attendance-exceptions">
            出勤異常
          </Link>
        </article>
      </section>

      <section className="grid">
        <section className={`panel span-12 attendance-policy-recordkeeping ${recordkeeping.ready ? "ready" : "danger"}`} id="attendance-recordkeeping-gate" aria-label="出勤紀錄保存 Gate">
          <div className="section-heading">
            <div>
              <h2>{recordkeeping.ready ? "出勤紀錄保存 Gate 已就緒" : "出勤紀錄保存 Gate 尚未完成"}</h2>
              <p className="muted">{localizeRecordkeepingDetail(recordkeeping.detail)}</p>
            </div>
            <a className="button" href="https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?flno=30&id=FL014930" target="_blank" rel="noreferrer">
              勞基法第 30 條
            </a>
          </div>
          {recordkeeping.missing.length ? (
            <ul className="task-list compact">
              {recordkeeping.missing.map((item) => (
                <li className="task" key={item}>
                  <span>{localizeRecordkeepingMissing(item)}</span>
                  <span className="badge danger">必要</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">保存天數、員工自助查看與匯出已符合 production Gate。薪資鎖定前仍需確認異常處理與員工月結簽收。</p>
          )}
        </section>

        <section className="panel span-7" id="attendance-policy-wizard">
          <div className="section-heading">
            <div>
              <h2>打卡與出勤政策精靈</h2>
              <p className="muted">更新會寫入 audit log；請勿在提示或備註中輸入個資、薪資、身分證字號、銀行帳號或健康資料。</p>
            </div>
            <Link className="button" href="/hr/worktime-compliance">
              工時法遵
            </Link>
          </div>

          <form action="/api/attendance/policies" method="post" className="wizard-form" aria-label="出勤政策設定精靈">
            <input name="id" type="hidden" defaultValue={activePolicy?.id ?? ""} />
            <div className="section-heading compact-heading">
              <div>
                <h3>1. 生效政策</h3>
                <p className="muted">維護目前啟用的政策，避免同公司有多套規則讓員工混淆。</p>
              </div>
              <span className="badge">必要</span>
            </div>
            <div className="field-grid">
              <label>
                政策名稱
                <input name="name" defaultValue={activePolicy?.name ?? "標準出勤政策"} required />
              </label>
              <label>
                狀態
                <select name="status" defaultValue={activePolicy?.status ?? "active"}>
                  <option value="active">啟用</option>
                  <option value="inactive">停用</option>
                </select>
              </label>
              <label>
                生效日
                <input name="effectiveFrom" type="date" defaultValue={formatDate(activePolicy?.effectiveFrom ?? new Date())} required />
              </label>
            </div>

            <div className="section-heading compact-heading">
              <div>
                <h3>2. 工時門檻</h3>
                <p className="muted">正常工時與法定上限仍應由 law_rules/rule_versions 管理；這裡設定公司營運門檻與警示。</p>
              </div>
              <span className="badge">分鐘</span>
            </div>
            <div className="field-grid">
              <label>
                每日正常工時分鐘數
                <input
                  name="regularDailyMinutes"
                  type="number"
                  min="1"
                  step="1"
                  defaultValue={activePolicy?.regularDailyMinutes ?? 480}
                  required
                />
              </label>
              <label>
                加班警示分鐘數
                <input
                  name="overtimeWarningDailyMinutes"
                  type="number"
                  min="1"
                  step="1"
                  defaultValue={activePolicy?.overtimeWarningDailyMinutes ?? 720}
                  required
                />
              </label>
              <label>
                上班打卡寬限分鐘
                <input name="clockInGraceMinutes" type="number" min="0" step="1" defaultValue={activePolicy?.clockInGraceMinutes ?? 5} />
              </label>
              <label>
                下班打卡寬限分鐘
                <input name="clockOutGraceMinutes" type="number" min="0" step="1" defaultValue={activePolicy?.clockOutGraceMinutes ?? 5} />
              </label>
            </div>

            <div className="toggle-row">
              <label>
                <input name="requireOvertimeApproval" type="checkbox" defaultChecked={activePolicy?.requireOvertimeApproval ?? true} />
                加班必須簽核
              </label>
              <label>
                <input name="requirePunchCorrectionApproval" type="checkbox" defaultChecked={activePolicy?.requirePunchCorrectionApproval ?? true} />
                補打卡必須簽核
              </label>
              <label>
                <input name="allowMobilePunch" type="checkbox" defaultChecked={activePolicy?.allowMobilePunch ?? true} />
                允許手機打卡
              </label>
            </div>

            <div className="section-heading compact-heading">
              <div>
                <h3>3. 打卡方式</h3>
                <p className="muted">限制越多，員工端提示越要白話；常見任務仍需三步內完成。</p>
              </div>
              <span className="badge">員工端會提示</span>
            </div>
            <div className="toggle-row">
              <label>
                <input name="allowRemotePunch" type="checkbox" defaultChecked={activePolicy?.allowRemotePunch ?? true} />
                允許遠端打卡
              </label>
              <label>
                <input
                  name="requireOfficeNetworkPunch"
                  type="checkbox"
                  defaultChecked={activePolicy?.requireOfficeNetworkPunch ?? false}
                />
                必須連公司網路
              </label>
              <label>
                <input
                  name="requireGpsProximityPunch"
                  type="checkbox"
                  defaultChecked={activePolicy?.requireGpsProximityPunch ?? false}
                />
                必須 GPS 靠近公司
              </label>
            </div>
            <div className="field-grid">
              <label>
                允許的公司 IP/CIDR
                <textarea
                  name="allowedOfficeIpCidrs"
                  rows={3}
                  defaultValue={(activePolicy?.allowedOfficeIpCidrs ?? ["10.0.0.0/8", "192.168.0.0/16"]).join("\n")}
                  placeholder="每行一筆，例如 203.0.113.0/24"
                />
              </label>
              <label>
                公司緯度
                <input name="officeLatitude" type="number" step="0.0000001" defaultValue={activePolicy?.officeLatitude ?? 25.033} />
              </label>
              <label>
                公司經度
                <input name="officeLongitude" type="number" step="0.0000001" defaultValue={activePolicy?.officeLongitude ?? 121.5654} />
              </label>
              <label>
                GPS 允許半徑（公尺）
                <input name="gpsRadiusMeters" type="number" min="50" max="5000" defaultValue={activePolicy?.gpsRadiusMeters ?? 300} />
              </label>
            </div>
            <label>
              員工端打卡提示
              <textarea
                name="punchPolicyNote"
                rows={3}
                defaultValue={activePolicy?.punchPolicyNote ?? "請依公司核准的工作地點打卡；若需遠端或居家辦公，請先送出申請。"}
              />
            </label>

            <div className="section-heading compact-heading">
              <div>
                <h3>4. 紀錄保存與員工自助</h3>
                <p className="muted">出勤紀錄要能讓員工查看與匯出，減少 HR 人工查詢。</p>
              </div>
              <span className="badge">勞動紀錄</span>
            </div>
            <div className="field-grid">
              <label>
                出勤紀錄保存天數
                <input
                  name="attendanceRecordRetentionDays"
                  type="number"
                  min={minimumAttendanceRetentionDays}
                  step="1"
                  defaultValue={activePolicy?.attendanceRecordRetentionDays ?? minimumAttendanceRetentionDays}
                />
              </label>
            </div>
            <div className="toggle-row">
              <label>
                <input name="employeeSelfServiceEnabled" type="checkbox" defaultChecked={activePolicy?.employeeSelfServiceEnabled ?? true} />
                員工可自行查看出勤
              </label>
              <label>
                <input name="employeeExportEnabled" type="checkbox" defaultChecked={activePolicy?.employeeExportEnabled ?? true} />
                員工可匯出出勤
              </label>
            </div>

            <button className="button primary" type="submit">
              儲存出勤政策
            </button>
          </form>
        </section>

        <section className="panel span-5">
          <div className="section-heading">
            <div>
              <h2>政策清單</h2>
              <p className="muted">保留停用政策是為了歷史追溯；新打卡只使用啟用政策。</p>
            </div>
            <span className="badge">{policies.length} 筆</span>
          </div>
          {policies.length === 0 ? (
            <EmptyState title="尚無出勤政策" body="請先建立一筆政策，再開始出勤作業。" />
          ) : (
            <ul className="task-list attendance-policy-list">
              {policies.map((policy) => (
                <li className={`task attendance-policy-task ${policy.status === "inactive" ? "warning" : "ready"}`} key={policy.id}>
                  <span className="attendance-policy-copy">
                    <strong>
                      {policy.name} · {policy.status === "active" ? "啟用" : "停用"}
                    </strong>
                    <small>
                      正常 {formatHours(policy.regularDailyMinutes)} · 警示 {formatHours(policy.overtimeWarningDailyMinutes)} · 生效 {formatDate(policy.effectiveFrom)}
                    </small>
                    <small>打卡方式：{describePunchControls(policy)}</small>
                    <small>
                      保存 {policy.attendanceRecordRetentionDays} 天 · 員工查看 {policy.employeeSelfServiceEnabled ? "開" : "關"} · 匯出 {policy.employeeExportEnabled ? "開" : "關"}
                    </small>
                  </span>
                  <span className={`badge ${policy.status === "inactive" ? "warning" : "done"}`}>
                    寬限 {policy.clockInGraceMinutes}/{policy.clockOutGraceMinutes}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>出勤設定治理原則</h2>
              <p className="muted">讓打卡政策可調整，但不讓月底薪資、工時法遵與員工體驗失控。</p>
            </div>
            <Link className="button" href="/settings/audit">
              查看 audit log
            </Link>
          </div>
          <div className="attendance-policy-guardrail-grid">
            <article>
              <span className="badge">同一政策</span>
              <strong>員工端與 HR 月結共用</strong>
              <p>Today Card、打卡提示、加班警示、補卡簽核與月結檢查要引用同一份啟用政策。</p>
            </article>
            <article>
              <span className="badge warning">法規版本</span>
              <strong>工時上限不藏在表單</strong>
              <p>勞基法正常工時、加班費與延長工時上限由 law_rules/rule_versions 管理，政策只設定公司操作門檻。</p>
            </article>
            <article>
              <span className="badge danger">敏感資料</span>
              <strong>提示文字不可寫個資</strong>
              <p>打卡提示與 audit log 不應包含薪資、身分證字號、銀行帳號、健康資訊或私人員工備註。</p>
            </article>
            <article>
              <span className="badge done">員工自助</span>
              <strong>少讓 HR 被查勤拖住</strong>
              <p>員工可查看與匯出自己的出勤紀錄，降低 HR 月底人工查詢，並支持導入第一週低教學成本。</p>
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}

function buildAttendanceFocus(
  activePolicy: AttendancePolicyView | undefined,
  recordkeeping: ReturnType<typeof evaluateAttendanceRecordkeepingReadiness>,
): AttendancePolicyFocus {
  if (!activePolicy) {
    return {
      title: "先建立啟用政策",
      detail: "沒有啟用政策時，員工端打卡提示、出勤異常與月結 Gate 都缺少共同依據。",
      note: "先建立一筆標準政策，再開放員工正式打卡。",
      tone: "danger",
      href: "#attendance-policy-wizard",
      actionLabel: "建立政策",
    };
  }
  if (!recordkeeping.ready) {
    return {
      title: "補齊保存 Gate",
      detail: `${recordkeeping.missing.length} 項出勤紀錄保存或員工自助設定未完成，會阻擋 production readiness。`,
      note: "勞基法第 30 條要求出勤紀錄保存五年且員工申請副本不得拒絕。",
      tone: "danger",
      href: "#attendance-recordkeeping-gate",
      actionLabel: "查看缺口",
    };
  }
  if (!activePolicy.allowMobilePunch) {
    return {
      title: "確認手機打卡策略",
      detail: "目前手機打卡未開放，可能降低員工手機端任務完成率，請確認是否只限特定場域。",
      note: "若關閉手機打卡，需要提供員工清楚替代流程。",
      tone: "warning",
      href: "#attendance-policy-wizard",
      actionLabel: "檢查打卡",
    };
  }
  if (!activePolicy.requireOvertimeApproval || !activePolicy.requirePunchCorrectionApproval) {
    return {
      title: "補齊簽核護欄",
      detail: "加班與補卡最好進入統一 Inbox，避免月底才發現未核准資料卡住薪資。",
      note: "簽核流程會寫 audit log 並通知員工與主管。",
      tone: "warning",
      href: "#attendance-policy-wizard",
      actionLabel: "檢查簽核",
    };
  }
  return {
    title: "可回員工端驗證",
    detail: "打卡政策、保存 Gate 與簽核護欄已完整，可以用員工前台檢查提示是否足夠白話。",
    note: "下一步是從出勤異常頁確認月結前自動解決率。",
    tone: "ready",
    href: "/app",
    actionLabel: "看員工前台",
  };
}

function countPunchGuardrails(policy: AttendancePolicyView) {
  return [
    policy.allowMobilePunch,
    !policy.allowRemotePunch,
    policy.requireOfficeNetworkPunch,
    policy.requireGpsProximityPunch,
  ].filter(Boolean).length;
}

function localizeRecordkeepingMissing(item: string) {
  const labels: Record<string, string> = {
    "active attendance policy": "尚未建立啟用的出勤政策",
    "5-year attendance record retention": "出勤紀錄保存未達五年",
    "employee self-service attendance access": "員工尚未開放自行查看出勤",
    "employee attendance export access": "員工尚未開放匯出出勤紀錄",
  };
  return labels[item] ?? item;
}

function localizeRecordkeepingDetail(detail: string) {
  return detail
    .replace("No active attendance policy configured.", "尚未建立啟用的出勤政策。")
    .replace(/(\d+) retention day\(s\)/, "保存 $1 天")
    .replace("employee self-service enabled", "員工自助查看已開啟")
    .replace("employee self-service disabled", "員工自助查看未開啟")
    .replace("export enabled", "匯出已開啟")
    .replace("export disabled", "匯出未開啟")
    .replaceAll("; ", "；");
}

function localizeAttendancePolicyError(error: string) {
  if (error.includes("permission") || error.includes("Forbidden")) {
    return "目前角色沒有維護出勤政策的權限，請切換 HR 或 Owner 後再試。";
  }
  if (error.includes("Overtime warning minutes cannot be below regular daily minutes")) {
    return "加班警示分鐘數不能低於每日正常工時分鐘數。";
  }
  if (error.includes("Attendance record retention days")) {
    return "出勤紀錄保存天數必須大於零，且上線前需達五年。";
  }
  if (error.includes("outside the allowed range")) {
    return "公司 GPS 座標超出允許範圍，請確認緯度與經度。";
  }
  return error;
}

function formatHours(minutes: number) {
  if (!minutes) return "未設定";
  return `${Math.round((minutes / 60) * 10) / 10} 小時`;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function describePunchControls(policy: Pick<
  AttendancePolicyView,
  "allowRemotePunch" | "requireOfficeNetworkPunch" | "requireGpsProximityPunch" | "gpsRadiusMeters"
>) {
  const controls = [
    policy.allowRemotePunch ? "遠端可打卡" : "不可遠端打卡",
    policy.requireOfficeNetworkPunch ? "需公司網路" : null,
    policy.requireGpsProximityPunch ? `需 GPS ${policy.gpsRadiusMeters} 公尺內` : null,
  ].filter(Boolean);
  return controls.join("、");
}
