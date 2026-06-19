import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/session";
import { hasPermission } from "@/server/auth/rbac";
import {
  getEmployeeMasterWorkspace,
  type EmployeeMasterRow,
  type EmployeeMasterWorkspace,
} from "@/server/employees/master";

type SearchParams = Promise<{
  success?: string;
  error?: string;
}>;

export default async function EmployeeMasterPage({ searchParams }: { searchParams: SearchParams }) {
  const [params, session] = await Promise.all([searchParams, getDemoSession()]);
  if (!hasPermission(session.role, "employee:read")) {
    return (
      <main className="page">
        <section className="hr-monthly-hero employee-master-hero" aria-label="人事主檔工作台">
          <div className="hr-monthly-hero-main">
            <span className="badge danger">權限不足</span>
            <h1>人事主檔工作台</h1>
            <p>員工主檔會牽動個資、主管線、簽核、假勤、薪資與法定名卡；未授權角色不可開啟後台名冊。</p>
          </div>
        </section>
        <EmptyState title="無法開啟人事主檔" body="請切換為執行長、人資或主管示範角色；員工日常任務請回前台。" />
      </main>
    );
  }

  const workspace = await getEmployeeMasterWorkspace(session);
  const writable = hasPermission(session.role, "employee:write");
  const focus = buildMasterFocus(workspace);
  const urgentRows = workspace.employees.filter((employee) => employee.profileGapLabels.length > 0).slice(0, 6);
  const defaultEmployee = workspace.employees.find((employee) => employee.profileGapLabels.length > 0) ?? workspace.employees[0];

  return (
    <main className="page employee-master-page">
      <section className="hr-monthly-hero employee-master-hero" aria-label="人事主檔工作台">
        <div className="hr-monthly-hero-main">
          <div className="hr-monthly-hero-topline">
            <span className="badge">人事建檔</span>
            <span className={`badge ${readinessBadgeClass(workspace.readiness.status)}`}>
              {readinessLabel(workspace.readiness.status)}
            </span>
          </div>
          <span className="muted">People Master · {workspace.scopeLabel}</span>
          <h1>人事主檔工作台</h1>
          <p>
            用一個頁面掌握員工、部門、主管線、登入、標準職務、勞工名卡、工作條件與薪資前置缺口，讓後台不再像功能選單。
          </p>
          <div className="hr-monthly-hero-actions">
            <Link className="button primary" href="/hr/employee-import">
              匯入員工
            </Link>
            <Link className="button" href="/settings/organization">
              組織與職務
            </Link>
            <Link className="button" href="/hr/employee-lifecycle">
              人事異動
            </Link>
          </div>
        </div>

        <div className={`hr-monthly-hero-focus ${focus.tone}`}>
          <span className="muted">今日先處理</span>
          <strong>{focus.title}</strong>
          <p>{focus.detail}</p>
          <small>{focus.note}</small>
          <Link className="button primary" href={focus.href}>
            {focus.actionLabel}
          </Link>
        </div>
      </section>

      <section className="hr-monthly-signal-board employee-master-signal-board" aria-label="人事主檔訊號板">
        <article className="hr-monthly-signal-card done">
          <span>可見員工</span>
          <strong>{workspace.summary.visibleEmployeeCount}</strong>
          <small>{workspace.summary.activeCount} 位在職 · {workspace.summary.managerCount} 位主管。</small>
        </article>
        <article className={`hr-monthly-signal-card ${workspace.summary.missingLoginCount ? "danger" : "done"}`}>
          <span>登入/SSO</span>
          <strong>{workspace.summary.missingLoginCount ? `${workspace.summary.missingLoginCount} 缺口` : "完成"}</strong>
          <small>不顯示員工 Email，只看連結與帳號狀態。</small>
        </article>
        <article className={`hr-monthly-signal-card ${workspace.summary.laborRosterGapCount ? "warning" : "done"}`}>
          <span>勞工名卡</span>
          <strong>{workspace.summary.laborRosterGapCount ? `${workspace.summary.laborRosterGapCount} 待補` : "完整"}</strong>
          <small>符合勞基法第 7 條的欄位以 hash/狀態追蹤。</small>
        </article>
        <article className={`hr-monthly-signal-card ${workspace.summary.payrollSetupGapCount ? "warning" : "done"}`}>
          <span>薪資前置</span>
          <strong>{workspace.summary.payrollSetupGapCount ? `${workspace.summary.payrollSetupGapCount} 待補` : "可月結"}</strong>
          <small>只顯示設定完整度，不顯示薪資金額或銀行帳號。</small>
        </article>
      </section>

      {params.error ? (
        <section className="panel risk-box danger-box" aria-live="polite">
          <strong>無法更新人事主檔</strong>
          <p>{localizeMasterError(params.error)}</p>
        </section>
      ) : null}
      {params.success ? (
        <section className="panel risk-box success-box" aria-live="polite">
          <strong>人事主檔已更新</strong>
          <p>部門、主管線、標準職務或職稱修正已保存，並寫入 audit log。</p>
        </section>
      ) : null}

      <section className="settings-command-grid employee-master-command-grid" aria-label="人事主檔作業卡">
        <article className={`settings-command-card ${workspace.summary.visibleEmployeeCount ? "ready" : "danger"}`}>
          <span className={`badge ${workspace.summary.visibleEmployeeCount ? "done" : "danger"}`}>
            {workspace.summary.visibleEmployeeCount ? "可管理" : "缺資料"}
          </span>
          <h2>員工名冊</h2>
          <p>先確認員工編號、姓名、到職日、狀態、部門與主管線，這是簽核、假勤與薪資的源頭。</p>
          <Link className="button" href="/hr/employee-import">
            批次匯入
          </Link>
        </article>
        <article className={`settings-command-card ${workspace.summary.missingJobArchitectureCount ? "warning" : "ready"}`}>
          <span className={`badge ${workspace.summary.missingJobArchitectureCount ? "warning" : "done"}`}>
            {workspace.summary.missingJobArchitectureCount ? "待對應" : "已對應"}
          </span>
          <h2>組織與職務</h2>
          <p>把自由文字職稱收斂成標準職務/職等，報表、權限、薪資與人事異動才不會各說各話。</p>
          <Link className="button" href="/settings/organization">
            開啟設定
          </Link>
        </article>
        <article className={`settings-command-card ${workspace.summary.laborRosterGapCount ? "warning" : "ready"}`}>
          <span className={`badge ${workspace.summary.laborRosterGapCount ? "warning" : "done"}`}>
            {workspace.summary.laborRosterGapCount ? "法遵缺口" : "可備查"}
          </span>
          <h2>法定資料</h2>
          <p>勞工名卡、工作條件、投保與離職資料要能被 HR 複核，但敏感原文不進 audit log。</p>
          <Link className="button" href="/hr/labor-roster">
            名卡複核
          </Link>
        </article>
        <article className={`settings-command-card ${workspace.summary.payrollSetupGapCount ? "warning" : "ready"}`}>
          <span className={`badge ${workspace.summary.payrollSetupGapCount ? "warning" : "done"}`}>
            {workspace.summary.payrollSetupGapCount ? "月結前補" : "可接月結"}
          </span>
          <h2>薪資前置</h2>
          <p>薪資 profile、付款 profile、所得稅與法定投保只顯示完整度，避免主管或清單洩漏薪資資料。</p>
          <Link className="button" href="/hr/payroll-profile-import">
            批次補齊
          </Link>
        </article>
      </section>

      <section className="grid employee-master-grid">
        <section className="panel span-12 employee-master-update-panel" id="employee-master-update">
          <div className="section-heading">
            <div>
              <h2>主檔修正精靈</h2>
              <p className="muted">三步修正員工的部門、主管線、標準職務與職稱。離職、留停與薪資仍需走各自受控流程。</p>
            </div>
            <span className={`badge ${writable ? "warning" : "danger"}`}>
              {writable ? "會寫入稽核" : "只讀模式"}
            </span>
          </div>
          {writable && defaultEmployee ? (
            <form action="/api/employees/master" method="post" className="wizard-form employee-master-update-form" aria-label="人事主檔修正">
              <fieldset className="form-card">
                <legend>1. 選擇員工</legend>
                <p className="muted">先選要修正的員工；若是新員工，請先走員工匯入。</p>
                <label>
                  修正員工
                  <select name="employeeId" defaultValue={defaultEmployee.id} required>
                    {workspace.employees.map((employee) => (
                      <option value={employee.id} key={employee.id}>
                        {employee.employeeNo} · {employee.displayName}
                      </option>
                    ))}
                  </select>
                </label>
              </fieldset>

              <fieldset className="form-card">
                <legend>2. 組織與職務</legend>
                <p className="muted">這裡只修正營運主檔。薪資金額、付款資料、身分證與健康資料不會出現在此表單。</p>
                <div className="employee-master-update-grid">
                  <label>
                    修正後部門
                    <select name="departmentId" defaultValue={defaultEmployee.departmentId ?? ""}>
                      <option value="">未指定</option>
                      {workspace.departments.map((department) => (
                        <option value={department.id} key={department.id}>
                          {department.code} · {department.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    直屬主管
                    <select name="managerId" defaultValue={defaultEmployee.managerId ?? ""}>
                      <option value="">未指定</option>
                      {workspace.employees.map((employee) => (
                        <option value={employee.id} key={employee.id}>
                          {employee.employeeNo} · {employee.displayName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    標準職務
                    <select name="jobPositionId" defaultValue={defaultEmployee.jobPositionId ?? ""}>
                      <option value="">未指定</option>
                      {workspace.jobPositions.map((position) => (
                        <option value={position.id} key={position.id}>
                          {position.code} · {position.title}
                          {position.levelCode ? ` · ${position.levelCode}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    職稱顯示名稱
                    <input name="jobTitle" defaultValue={defaultEmployee.jobTitle} maxLength={80} required />
                  </label>
                </div>
              </fieldset>

              <fieldset className="form-card">
                <legend>3. 修正原因</legend>
                <p className="muted">原因原文不寫入 audit metadata；系統只保存 hash、異動欄位與操作者。</p>
                <label>
                  修正原因
                  <textarea name="changeReason" rows={3} placeholder="例：匯入後補正主管線與標準職務對應。" />
                </label>
                <button className="button primary" type="submit">
                  儲存主檔修正
                </button>
              </fieldset>
            </form>
          ) : (
            <div className="employee-master-readonly-note">
              <strong>{defaultEmployee ? "目前角色只能檢視" : "尚無員工可修正"}</strong>
              <p>{defaultEmployee ? "主管可查看團隊主檔狀態，但不可直接改部門、主管線或職務。" : "請先匯入員工後再進行主檔修正。"}</p>
            </div>
          )}
        </section>

        <section className="panel span-8" id="employee-master-list">
          <div className="section-heading">
            <div>
              <h2>員工主檔清單</h2>
              <p className="muted">日常管理只看營運必要欄位；薪資、身分證、銀行與健康資料在各自受控模組處理。</p>
            </div>
            <span className="badge">{workspace.scopeLabel}</span>
          </div>
          {workspace.employees.length === 0 ? (
            <EmptyState title="尚無可見員工" body="請先匯入員工，或確認目前角色是否具備查看這些員工的權限。" />
          ) : (
            <div className="employee-master-table" role="table" aria-label="員工主檔清單">
              <div className="employee-master-table-row header" role="row">
                <span role="columnheader">員工</span>
                <span role="columnheader">組織</span>
                <span role="columnheader">主管線</span>
                <span role="columnheader">法遵/薪資前置</span>
              </div>
              {workspace.employees.map((employee) => (
                <article className={`employee-master-table-row ${employeeTone(employee)}`} role="row" key={employee.id}>
                  <div role="cell" className="employee-master-person">
                    <strong>{employee.employeeNo} · {employee.displayName}</strong>
                    <small>{statusLabel(employee.employmentStatus)} · 到職 {formatDate(employee.hireDate)}</small>
                    <small>{employee.userLinked ? `登入 ${accountLabel(employee.userStatus)}` : "尚未連結登入/SSO"}</small>
                  </div>
                  <div role="cell">
                    <strong>{employee.departmentCode ? `${employee.departmentCode} · ${employee.departmentName}` : "未歸屬部門"}</strong>
                    <small>
                      {employee.jobPositionTitle
                        ? `${employee.jobPositionTitle}${employee.jobLevelCode ? ` · ${employee.jobLevelCode}` : ""}`
                        : employee.jobTitle}
                    </small>
                    <small>{employee.jobPositionTitle ? "已對應標準職務" : "尚未對應標準職務/職等"}</small>
                  </div>
                  <div role="cell">
                    <strong>{employee.managerName ?? (employee.directReportCount ? "組織上層主管" : "未設定主管")}</strong>
                    <small>{employee.directReportCount ? `直屬 ${employee.directReportCount} 人` : "無直屬員工"}</small>
                    <small>{employee.roleLabels.length ? employee.roleLabels.join(" · ") : "尚未設定角色"}</small>
                  </div>
                  <div role="cell" className="employee-master-status-cell">
                    <div className="employee-master-chip-row">
                      <span className={`badge ${rosterBadgeClass(employee.laborRosterStatus)}`}>
                        名卡 {rosterLabel(employee.laborRosterStatus)}
                      </span>
                      <span className={`badge ${termsBadgeClass(employee.employmentTermsStatus)}`}>
                        工作條件 {termsLabel(employee.employmentTermsStatus)}
                      </span>
                      <span className={`badge ${setupBadgeClass(employee.payrollSetupStatus)}`}>
                        薪資 {setupLabel(employee.payrollSetupStatus)}
                      </span>
                    </div>
                    <small>
                      投保 {setupLabel(employee.statutoryInsuranceStatus)} · {employee.externalIdentityLinked ? "SSO 已連結" : "SSO 待連結"}
                    </small>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="panel span-4 employee-master-side-panel">
          <div className="section-heading compact-heading">
            <div>
              <h2>今日缺口</h2>
              <p className="muted">先處理會卡簽核、月結或上線 Gate 的項目。</p>
            </div>
          </div>
          {urgentRows.length === 0 ? (
            <EmptyState title="沒有立即缺口" body="目前可見員工的主檔狀態都已通過這一層檢查。" />
          ) : (
            <ul className="task-list employee-master-gap-list">
              {urgentRows.map((employee) => (
                <li className={`task employee-master-gap-task ${employeeTone(employee)}`} key={employee.id}>
                  <span>
                    <strong>{employee.displayName}</strong>
                    <small>{employee.employeeNo} · {employee.departmentName ?? "未歸屬部門"}</small>
                    <small>{employee.profileGapLabels.slice(0, 4).join("、")}</small>
                  </span>
                  <Link className="button" href={gapHref(employee)}>
                    處理
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="panel span-12" id="employee-master-departments">
          <div className="section-heading">
            <div>
              <h2>部門與人力分布</h2>
              <p className="muted">排班、簽核與報表會引用同一份部門資料；調整請回組織設定或人事異動流程。</p>
            </div>
            <Link className="button" href="/settings/organization">
              維護部門
            </Link>
          </div>
          <div className="employee-master-department-grid">
            {workspace.departments.map((department) => (
              <article key={department.id}>
                <span>{department.code}</span>
                <strong>{department.name}</strong>
                <small>{department.employeeCount} 位員工</small>
              </article>
            ))}
          </div>
        </section>

        <section className="panel span-12" id="employee-master-guardrails">
          <div className="section-heading">
            <div>
              <h2>人事主檔護欄</h2>
              <p className="muted">要讓後台彈性調整，但不犧牲台灣法遵、權限與敏感資料安全。</p>
            </div>
            <Link className="button" href="/settings/access">
              權限管理
            </Link>
          </div>
          <div className="employee-master-guardrail-grid">
            <article>
              <strong>主管只能看必要範圍</strong>
              <p>主管視圖限制在本人與直屬團隊；HR 與 Owner 才能看全公司主檔。</p>
            </article>
            <article>
              <strong>薪資與銀行不在清單</strong>
              <p>此頁只顯示薪資前置完整度，不回顯薪資金額、銀行帳號、身分證或健康資料。</p>
            </article>
            <article>
              <strong>異動走 workflow</strong>
              <p>調部、升遷、留停、復職與離職應走人事異動流程，並同步權限、薪資、保險與 audit。</p>
            </article>
            <article>
              <strong>法規資料可版本化</strong>
              <p>勞工名卡、工作條件與投保資料以狀態與 hash 追蹤，規則來源由 law_rules/rule_versions 管理。</p>
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}

function buildMasterFocus(workspace: EmployeeMasterWorkspace) {
  const summary = workspace.summary;
  if (workspace.readiness.status === "blocked") {
    return {
      title: workspace.readiness.title,
      detail: workspace.readiness.detail,
      note: workspace.readiness.nextActions[0],
      tone: "danger" as const,
      href: summary.missingLoginCount ? "/settings/pilot-invite-readiness" : "/hr/labor-roster",
      actionLabel: summary.missingLoginCount ? "檢查登入" : "補名卡",
    };
  }
  if (summary.missingManagerCount || summary.missingJobArchitectureCount) {
    return {
      title: "先整理主管線與標準職務",
      detail: `${summary.missingManagerCount} 位缺主管線、${summary.missingJobArchitectureCount} 位缺標準職務，會影響簽核、排班與報表。`,
      note: "先回組織設定建立標準職務，再用人事異動流程維護員工歸屬。",
      tone: "warning" as const,
      href: "/settings/organization",
      actionLabel: "整理組織",
    };
  }
  if (summary.payrollSetupGapCount || summary.statutoryInsuranceGapCount) {
    return {
      title: "月結前補齊薪資與投保前置",
      detail: `${summary.payrollSetupGapCount} 位薪資前置待補、${summary.statutoryInsuranceGapCount} 位投保待補。`,
      note: "此頁只看缺口，不顯示薪資金額或銀行帳號。",
      tone: "warning" as const,
      href: "/hr/payroll-profile-import",
      actionLabel: "批次補齊",
    };
  }
  return {
    title: workspace.readiness.title,
    detail: workspace.readiness.detail,
    note: workspace.readiness.nextActions[0],
    tone: "ready" as const,
    href: "/hr/employee-lifecycle",
    actionLabel: "維護異動",
  };
}

function employeeTone(employee: EmployeeMasterRow) {
  if (!employee.userLinked || employee.laborRosterStatus === "missing" || employee.payrollSetupStatus === "missing") {
    return "danger";
  }
  if (employee.profileGapLabels.length > 0) return "warning";
  return "ready";
}

function gapHref(employee: EmployeeMasterRow) {
  if (!employee.userLinked) return "/settings/pilot-invite-readiness";
  if (employee.laborRosterStatus !== "complete") return "/hr/labor-roster";
  if (employee.employmentTermsStatus !== "acknowledged") return "/hr/employment-terms";
  if (employee.payrollSetupStatus !== "ready") return "/hr/payroll-profile-import";
  if (employee.statutoryInsuranceStatus !== "ready") return "/hr/insurance";
  return "/hr/employee-lifecycle";
}

function readinessLabel(status: EmployeeMasterWorkspace["readiness"]["status"]) {
  if (status === "blocked") return "未達 Gate";
  if (status === "warning") return "需整理";
  return "可營運";
}

function readinessBadgeClass(status: EmployeeMasterWorkspace["readiness"]["status"]) {
  if (status === "blocked") return "danger";
  if (status === "warning") return "warning";
  return "done";
}

function statusLabel(status: EmployeeMasterRow["employmentStatus"]) {
  if (status === "terminated") return "已離職";
  if (status === "on_leave") return "留停中";
  return "在職";
}

function accountLabel(status: string | null) {
  if (status === "active") return "啟用";
  if (status === "suspended") return "停用";
  return status ?? "未啟用";
}

function rosterLabel(status: EmployeeMasterRow["laborRosterStatus"]) {
  if (status === "complete") return "完成";
  if (status === "needs_review") return "待複核";
  if (status === "incomplete") return "未完整";
  return "缺資料";
}

function termsLabel(status: EmployeeMasterRow["employmentTermsStatus"]) {
  if (status === "acknowledged") return "已確認";
  if (status === "published") return "待員工確認";
  if (status === "draft") return "草稿";
  return "缺資料";
}

function setupLabel(status: EmployeeMasterRow["payrollSetupStatus"] | EmployeeMasterRow["statutoryInsuranceStatus"]) {
  if (status === "ready") return "完成";
  if (status === "partial") return "部分";
  return "缺資料";
}

function rosterBadgeClass(status: EmployeeMasterRow["laborRosterStatus"]) {
  if (status === "complete") return "done";
  if (status === "missing") return "danger";
  return "warning";
}

function termsBadgeClass(status: EmployeeMasterRow["employmentTermsStatus"]) {
  if (status === "acknowledged") return "done";
  if (status === "missing") return "danger";
  return "warning";
}

function setupBadgeClass(status: EmployeeMasterRow["payrollSetupStatus"] | EmployeeMasterRow["statutoryInsuranceStatus"]) {
  if (status === "ready") return "done";
  if (status === "missing") return "danger";
  return "warning";
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function localizeMasterError(error: string) {
  if (error.includes("employee:write")) return "目前角色沒有修正員工主檔的權限，請切換 HR 或 Owner。";
  if (error.includes("Employee is required")) return "請選擇要修正的員工。";
  if (error.includes("Employee not found")) return "找不到指定員工，請重新整理後再試。";
  if (error.includes("Department not found")) return "找不到指定部門，請先確認組織設定。";
  if (error.includes("Job position not found")) return "找不到指定標準職務，請先確認組織與職務設定。";
  if (error.includes("Manager not found")) return "找不到指定主管，請確認主管仍為在職員工。";
  if (error.includes("own manager")) return "員工不能設定自己為自己的主管。";
  if (error.includes("reporting cycle")) return "主管線不能形成循環，請重新選擇直屬主管。";
  if (error.includes("Job title")) return "職稱必填，且長度不可超過 80 字。";
  return "人事主檔修正失敗，請確認欄位、權限與主管線後再試一次。";
}
