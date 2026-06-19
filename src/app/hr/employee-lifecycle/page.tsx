import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { hasPermission } from "@/server/auth/rbac";
import { getDemoSession } from "@/server/auth/session";
import {
  getEmployeeLifecycleWorkspace,
  type EmployeeLifecycleWorkspace,
  type LifecycleEventRow,
} from "@/server/employees/lifecycle";

type SearchParams = Promise<{ error?: string }>;

type LifecycleFocus = {
  title: string;
  detail: string;
  note: string;
  tone: "danger" | "warning" | "ready";
  href: string;
  actionLabel: string;
};

type EmployeeView = EmployeeLifecycleWorkspace["employees"][number];

export default async function EmployeeLifecyclePage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error }, session] = await Promise.all([searchParams, getDemoSession()]);

  if (!hasPermission(session.role, "employee:write")) {
    return (
      <main className="page employee-lifecycle-page">
        <section className="hr-monthly-hero employee-lifecycle-hero" aria-label="人事異動工作台">
          <div className="hr-monthly-hero-main">
            <div className="hr-monthly-hero-topline">
              <span className="badge">人事管理</span>
              <span className="badge danger">權限不足</span>
            </div>
            <h1>人事異動工作台</h1>
            <p>這是 HR 後台頁面，只開放可維護員工主檔與人事異動的角色使用。一般員工請回前台查看自己的申請與任務。</p>
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
            <strong>員工主檔已保護</strong>
            <p>人事異動會牽動組織、權限、薪資、勞健保與離職法遵，未授權角色不顯示員工異動資料。</p>
            <small>請由 HR、Owner 或被授權的行政主管進入。</small>
          </aside>
        </section>
      </main>
    );
  }

  const workspace = await getEmployeeLifecycleWorkspace(session);
  const activeCount = workspace.employees.filter((employee) => employee.employmentStatus === "active").length;
  const onLeaveCount = workspace.employees.filter((employee) => employee.employmentStatus === "on_leave").length;
  const terminatedCount = workspace.employees.filter((employee) => employee.employmentStatus === "terminated").length;
  const terminationEvents = workspace.events.filter((event) => event.eventType === "termination");
  const offboardingReviewCount = terminationEvents.filter((event) => event.terminationOffboarding && !event.terminationOffboarding.ready).length;
  const humanReviewCount = terminationEvents.filter((event) => event.terminationCompliance?.requiresHumanReview).length;
  const focus = buildLifecycleFocus({
    eventCount: workspace.events.length,
    onLeaveCount,
    offboardingReviewCount,
    humanReviewCount,
  });

  return (
    <main className="page employee-lifecycle-page">
      <section className="hr-monthly-hero employee-lifecycle-hero" aria-label="人事異動工作台">
        <div className="hr-monthly-hero-main">
          <div className="hr-monthly-hero-topline">
            <span className="badge">人事管理</span>
            <span className={`badge ${offboardingReviewCount ? "warning" : "done"}`}>
              {offboardingReviewCount ? "離職待複核" : "流程有稽核"}
            </span>
          </div>
          <h1>人事異動工作台</h1>
          <p>
            用一個入口處理調部、升遷、留停、復職與離職，讓員工主檔、組織、薪資月結、權限移除與台灣勞基法離職檢查保持一致。
          </p>
          <div className="hr-monthly-hero-actions">
            <Link className="button primary" href="#employee-lifecycle-wizard">
              新增異動
            </Link>
            <Link className="button" href="#employee-status-board">
              員工狀態
            </Link>
            <Link className="button" href="/hr/offboarding">
              離職交接
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
        <section className="employee-lifecycle-alerts" aria-live="polite">
          <div className="panel danger-panel">
            <strong>人事異動未建立</strong>
            <p>{localizeLifecycleError(error)}</p>
          </div>
        </section>
      ) : null}

      <section className="hr-monthly-signal-board employee-lifecycle-signal-board" aria-label="人事異動訊號板">
        <article className="hr-monthly-signal-card done">
          <span>在職員工</span>
          <strong>{activeCount} 人</strong>
          <small>目前會進入排班、假勤、薪資與公告流程的人員；另保留 {terminatedCount} 位離職紀錄。</small>
        </article>
        <article className={`hr-monthly-signal-card ${onLeaveCount ? "warning" : "done"}`}>
          <span>留停追蹤</span>
          <strong>{onLeaveCount} 人</strong>
          <small>留停與復職會影響薪資、保險、假勤餘額與權限。</small>
        </article>
        <article className={`hr-monthly-signal-card ${offboardingReviewCount ? "danger" : humanReviewCount ? "warning" : "done"}`}>
          <span>離職法遵</span>
          <strong>{humanReviewCount} 筆</strong>
          <small>{offboardingReviewCount ? `${offboardingReviewCount} 筆離職交接清單尚未完成。` : "離職事件保留人工複核與來源證據。"}</small>
        </article>
        <article className={`hr-monthly-signal-card ${workspace.events.length ? "focus" : "warning"}`}>
          <span>稽核事件</span>
          <strong>{workspace.events.length} 筆</strong>
          <small>每次人事異動都要保留生效日、原因與 audit log。</small>
        </article>
      </section>

      <section className="settings-command-grid employee-lifecycle-command-grid" aria-label="人事異動作業卡">
        <article className="settings-command-card ready">
          <span className="badge done">組織同步</span>
          <h2>調部與升遷</h2>
          <p>更新部門、職務與生效日，讓組織圖、主管線、報表與簽核路由使用同一份人事證據。</p>
          <Link className="button primary" href="#employee-lifecycle-wizard">
            記錄異動
          </Link>
        </article>
        <article className={`settings-command-card ${onLeaveCount ? "warning" : "ready"}`}>
          <span className={`badge ${onLeaveCount ? "warning" : "done"}`}>{onLeaveCount ? "需追蹤" : "可用"}</span>
          <h2>留停與復職</h2>
          <p>留停、復職必須同步假勤、保險、薪資月結與系統權限，避免月底才發現資料斷點。</p>
          <Link className="button" href="#employee-status-board">
            查看狀態
          </Link>
        </article>
        <article className={`settings-command-card ${offboardingReviewCount ? "danger" : "warning"}`}>
          <span className={`badge ${offboardingReviewCount ? "danger" : "warning"}`}>人工複核</span>
          <h2>離職法遵</h2>
          <p>資遣、退休、契約期滿與其他離職都只提供法遵輔助，最終決定必須由授權人員審查。</p>
          <Link className="button" href="#employee-lifecycle-guardrails">
            查看護欄
          </Link>
        </article>
        <article className="settings-command-card warning">
          <span className="badge warning">敏感聯動</span>
          <h2>薪資與權限不裸露</h2>
          <p>異動可觸發薪資與權限檢查，但此頁不顯示薪資金額、銀行帳號、身分證或私人 HR 備註。</p>
          <Link className="button" href="/settings/audit">
            查看稽核
          </Link>
        </article>
      </section>

      <section className="grid">
        <form
          action="/api/employees/lifecycle"
          method="post"
          className="panel span-7 wizard-form employee-lifecycle-wizard"
          id="employee-lifecycle-wizard"
          aria-label="人事異動精靈"
        >
          <div className="section-heading">
            <div>
              <h2>人事異動精靈</h2>
              <p className="muted">用四步留下生效日、異動內容、離職法遵資訊與 HR 核准原因。</p>
            </div>
            <span className="badge">會寫入稽核</span>
          </div>

          <fieldset>
            <legend>1. 選擇員工與異動類型</legend>
            <label>
              員工
              <select name="employeeId" required>
                {workspace.employees.map((employee) => (
                  <option value={employee.id} key={employee.id}>
                    {employee.employeeNo} · {employee.displayName} · {statusLabel(employee.employmentStatus)}
                  </option>
                ))}
              </select>
            </label>
            <div className="field-grid">
              <label>
                異動類型
                <select name="eventType" required>
                  <option value="transfer">調部</option>
                  <option value="promotion">升遷</option>
                  <option value="leave">留職停薪</option>
                  <option value="return">復職</option>
                  <option value="termination">離職</option>
                </select>
              </label>
              <label>
                生效日
                <input name="effectiveDate" type="date" defaultValue="2026-07-01" required />
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>2. 組織與職務</legend>
            <div className="field-grid">
              <label>
                新部門
                <select name="nextDepartmentId">
                  <option value="">維持目前部門</option>
                  {workspace.departments.map((department) => (
                    <option value={department.id} key={department.id}>
                      {department.code} · {department.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                新職稱
                <input name="nextJobTitle" placeholder="留空代表維持目前職稱" />
              </label>
            </div>
            <p className="muted">部門與職稱會影響主管線、表單簽核、報表分類與人事主檔。</p>
          </fieldset>

          <fieldset>
            <legend>3. 離職法遵資料</legend>
            <div className="field-grid">
              <label>
                離職原因類別
                <select name="terminationReasonCategory" defaultValue="layoff">
                  <option value="layoff">資遣 / 業務緊縮</option>
                  <option value="resignation">自願離職</option>
                  <option value="retirement">退休</option>
                  <option value="contract_end">契約期滿</option>
                  <option value="misconduct">懲戒相關</option>
                  <option value="other">其他，需 HR/法務複核</option>
                </select>
              </label>
              <label>
                退休金制度
                <select name="pensionScheme" defaultValue="labor_pension_new">
                  <option value="labor_pension_new">勞退新制</option>
                  <option value="labor_standards_old">勞基法舊制</option>
                </select>
              </label>
              <label>
                平均工資
                <input name="averageMonthlyWage" type="number" min="0" step="1" placeholder="僅供離職法遵估算" />
              </label>
            </div>
            <p className="muted">此欄位送出後只用於法遵估算與稽核 metadata；頁面與 log 不顯示薪資明細。</p>
          </fieldset>

          <fieldset>
            <legend>4. 離職交接與原因</legend>
            <div className="toggle-row employee-lifecycle-checklist">
              <label>
                <input name="finalPayPrepared" type="checkbox" />
                最終工資已準備複核
              </label>
              <label>
                <input name="unusedLeaveSettlementPrepared" type="checkbox" />
                未休特休結清已準備
              </label>
              <label>
                <input name="insuranceWithdrawalPrepared" type="checkbox" />
                勞健保退保已準備
              </label>
              <label>
                <input name="accessRevocationPrepared" type="checkbox" />
                系統權限移除已準備
              </label>
              <label>
                <input name="documentRetentionPrepared" type="checkbox" />
                人事紀錄留存已準備
              </label>
              <label>
                <input name="employeeCertificatePrepared" type="checkbox" />
                服務證明準備狀態已確認
              </label>
            </div>
            <label>
              HR 核准原因或證據編號
              <textarea name="reason" placeholder="請輸入 HR 已核准的原因、簽呈編號或證據位置；不要填入身分證、銀行帳號、健康資料或私人備註。" required />
            </label>
          </fieldset>

          <button className="button primary" type="submit">
            記錄人事異動
          </button>
        </form>

        <section className="panel span-5" id="employee-status-board">
          <div className="section-heading">
            <div>
              <h2>員工狀態</h2>
              <p className="muted">快速確認目前哪些人會進入排班、薪資、權限與公告流程。</p>
            </div>
            <span className="badge">{workspace.employees.length} 人</span>
          </div>
          <ul className="task-list employee-lifecycle-status-list">
            {workspace.employees.map((employee) => (
              <li className={`task employee-lifecycle-task ${employeeStatusTone(employee)}`} key={employee.id}>
                <span className="employee-lifecycle-copy">
                  <strong>{employee.displayName} · {employee.employeeNo}</strong>
                  <small>{employee.jobTitle} · 到職 {formatDate(employee.hireDate)}</small>
                </span>
                <span className={`badge ${employee.employmentStatus === "on_leave" ? "warning" : employee.employmentStatus === "terminated" ? "danger" : "done"}`}>
                  {statusLabel(employee.employmentStatus)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-12" id="employee-lifecycle-timeline">
          <div className="section-heading">
            <div>
              <h2>異動時間軸</h2>
              <p className="muted">依建立時間排序，保留人事異動、離職法遵與交接狀態；敏感薪資金額在此頁一律遮罩。</p>
            </div>
            <span className={`badge ${workspace.events.length ? "done" : "warning"}`}>
              {workspace.events.length ? `${workspace.events.length} 筆異動` : "尚無異動"}
            </span>
          </div>
          {workspace.events.length === 0 ? (
            <EmptyState title="尚無人事異動" body="先用精靈記錄調部、升遷、留停、復職或離職，讓薪資、權限與 audit log 有共同證據。" />
          ) : (
            <ul className="task-list employee-lifecycle-timeline">
              {workspace.events.map((event) => (
                <li className={`task request-task employee-lifecycle-task ${eventTone(event)}`} key={event.id}>
                  <span className="employee-lifecycle-copy">
                    <strong>
                      {event.employeeName} · {eventTypeLabel(event.eventType)}
                    </strong>
                    <small>{formatDate(event.effectiveDate)} 生效 · {event.reason}</small>
                    <small>
                      {event.previousJobTitle ?? "未記錄"} → {event.nextJobTitle ?? "未記錄"}
                      {event.nextDepartmentName ? ` · ${event.nextDepartmentName}` : ""}
                    </small>
                    {event.terminationCompliance ? (
                      <small>
                        離職法遵：預告 {event.terminationCompliance.requiredAdvanceNoticeDays} 天 ·{" "}
                        {event.terminationCompliance.severancePayEstimate === null
                          ? "資遣費估算待補平均工資"
                          : "資遣費估算已建立，金額在此頁遮罩"}
                        {" "}· 必須人工複核
                      </small>
                    ) : null}
                    {event.terminationCompliance?.warnings.length ? (
                      <small>風險：{event.terminationCompliance.warnings.map(localizeTerminationWarning).join("；")}</small>
                    ) : null}
                    {event.terminationOffboarding ? (
                      <small>
                        離職交接：{event.terminationOffboarding.ready ? "已準備" : "需補件"} · 勞健保退保期限{" "}
                        {formatDate(event.terminationOffboarding.dueDate)}
                        {event.terminationOffboarding.missing.length
                          ? ` · 缺少 ${event.terminationOffboarding.missing.map(localizeOffboardingMissing).join("、")}`
                          : ""}
                      </small>
                    ) : null}
                  </span>
                  <span className={`badge ${eventBadgeClass(event)}`}>
                    {event.terminationOffboarding
                      ? event.terminationOffboarding.ready ? "交接已準備" : "交接待複核"
                      : event.nextStatus ? statusLabel(event.nextStatus) : eventTypeLabel(event.eventType)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel span-12" id="employee-lifecycle-guardrails">
          <div className="section-heading">
            <div>
              <h2>人事異動治理原則</h2>
              <p className="muted">讓後台可彈性處理各種異動，但避免破壞台灣法遵、薪資權限與敏感資料保護。</p>
            </div>
            <Link className="button" href="/settings/audit">
              查看稽核
            </Link>
          </div>
          <div className="employee-lifecycle-guardrail-grid">
            <article>
              <span className="badge done">生效日</span>
              <strong>異動必須可追溯</strong>
              <p>每筆調部、升遷、留停、復職與離職都要有生效日、原因與 audit log。</p>
            </article>
            <article>
              <span className="badge warning">勞基法</span>
              <strong>離職只做法遵輔助</strong>
              <p>預告日、資遣費與來源條文只能輔助 HR 複核，不可自動完成解僱或裁員決策。</p>
            </article>
            <article>
              <span className="badge danger">薪資遮罩</span>
              <strong>金額回薪資流程查看</strong>
              <p>人事頁不顯示薪資、銀行帳號、身分證或健康資料，避免越權瀏覽。</p>
            </article>
            <article>
              <span className="badge">跨模組</span>
              <strong>異動要同步權限與月結</strong>
              <p>留停、復職與離職要串接排班、假勤、保險、薪資、文件留存與存取權限。</p>
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}

function buildLifecycleFocus(input: {
  eventCount: number;
  onLeaveCount: number;
  offboardingReviewCount: number;
  humanReviewCount: number;
}): LifecycleFocus {
  if (input.offboardingReviewCount > 0) {
    return {
      title: "先補離職交接清單",
      detail: `${input.offboardingReviewCount} 筆離職事件還有最終工資、特休結清、退保、權限移除或紀錄留存待複核。`,
      note: "離職流程牽動法遵與薪資，不能只更新員工狀態。",
      tone: "danger",
      href: "/hr/offboarding",
      actionLabel: "處理交接",
    };
  }
  if (input.eventCount === 0) {
    return {
      title: "先建立第一筆異動",
      detail: "目前尚無人事異動紀錄；試用上線前要能記錄調部、升遷、留停、復職與離職。",
      note: "先用精靈建立一筆低風險的調部或升遷紀錄。",
      tone: "warning",
      href: "#employee-lifecycle-wizard",
      actionLabel: "新增異動",
    };
  }
  if (input.onLeaveCount > 0) {
    return {
      title: "追蹤留停與復職影響",
      detail: `${input.onLeaveCount} 位員工目前留停，需確認薪資、保險、排班與權限是否同步。`,
      note: "月底前請回月結與權限檢查確認沒有資料斷點。",
      tone: "warning",
      href: "#employee-status-board",
      actionLabel: "查看狀態",
    };
  }
  if (input.humanReviewCount > 0) {
    return {
      title: "離職事件已留人工複核",
      detail: "離職法遵資料已建立，請確認交接、退保、文件留存與權限移除都已接上。",
      note: "敏感決策仍需 HR/Owner 人工確認。",
      tone: "warning",
      href: "#employee-lifecycle-timeline",
      actionLabel: "查看時間軸",
    };
  }
  return {
    title: "人事異動流程可試用",
    detail: "目前員工狀態與異動紀錄可支援後台日常維護，下一步可串接正式匯入與權限稽核。",
    note: "試用時請追蹤異動是否正確影響主管線、薪資月結與通知。",
    tone: "ready",
    href: "#employee-status-board",
    actionLabel: "查看員工",
  };
}

function employeeStatusTone(employee: EmployeeView) {
  if (employee.employmentStatus === "terminated") return "muted";
  if (employee.employmentStatus === "on_leave") return "warning";
  return "ready";
}

function eventTone(event: LifecycleEventRow) {
  if (event.terminationOffboarding && !event.terminationOffboarding.ready) return "danger";
  if (event.eventType === "termination") return "warning";
  if (event.nextStatus === "on_leave") return "warning";
  return "ready";
}

function eventBadgeClass(event: LifecycleEventRow) {
  if (event.terminationOffboarding && !event.terminationOffboarding.ready) return "danger";
  if (event.eventType === "termination" || event.nextStatus === "on_leave") return "warning";
  return "done";
}

function eventTypeLabel(type: string) {
  switch (type) {
    case "promotion":
      return "升遷";
    case "leave":
      return "留職停薪";
    case "return":
      return "復職";
    case "termination":
      return "離職";
    default:
      return "調部";
  }
}

function statusLabel(status: string | null | undefined) {
  switch (status) {
    case "on_leave":
      return "留停";
    case "terminated":
      return "已離職";
    default:
      return "在職";
  }
}

function localizeLifecycleError(error: string) {
  if (error.includes("permission") || error.includes("cannot")) {
    return "目前角色沒有建立人事異動的權限，請切換 HR 或 Owner 角色。";
  }
  if (error.includes("Employee is required")) return "請選擇員工。";
  if (error.includes("Employee not found")) return "找不到指定員工，請重新整理後再試。";
  if (error.includes("Department not found")) return "找不到指定部門，請先確認公司組織設定。";
  if (error.includes("Reason is required")) return "請填寫 HR 核准原因或證據編號。";
  if (error.includes("Average monthly wage")) return "平均工資必須是 0 以上的數字。";
  if (error.includes("Invalid effective date")) return "請輸入有效的生效日。";
  return error;
}

function localizeTerminationWarning(warning: string) {
  if (warning.includes("Average monthly wage")) return "需補平均工資後才能確認法定資遣費";
  if (warning.includes("before hire date")) return "離職生效日早於到職日";
  if (warning.includes("reason category")) return "離職原因需 HR/法務複核";
  return warning;
}

function localizeOffboardingMissing(item: string) {
  if (item.includes("final wage")) return "最終工資";
  if (item.includes("unused annual leave")) return "未休特休結清";
  if (item.includes("statutory insurance")) return "勞健保退保";
  if (item.includes("access revocation")) return "權限移除";
  if (item.includes("record retention")) return "紀錄留存";
  if (item.includes("employment certificate")) return "服務證明";
  return item;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
