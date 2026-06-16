import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/demo-session";
import type { EmployeeImportPilotReadiness } from "@/server/employees/imports";
import { getEmployeeImportWorkspace } from "@/server/employees/imports";

type SearchParams = Promise<{ error?: string; imported?: string; preview?: string }>;

const sampleCsv = `employeeNo,displayName,jobTitle,departmentCode,hireDate,managerEmployeeNo
E006,王小明,QA Engineer,ENG,2026-07-01,E002
E007,鄭小美,HR Specialist,POPS,2026-07-01,E001
E008,林宜庭,Frontend Engineer,ENG,2026-07-01,E002
E009,何建宏,Backend Engineer,ENG,2026-07-01,E002
E010,吳佩珊,Product Designer,ENG,2026-07-01,E002
E011,劉冠廷,Customer Success,POPS,2026-07-01,E001
E012,周庭安,QA Engineer,ENG,2026-07-01,E002
E013,蔡宗翰,DevOps Engineer,ENG,2026-07-01,E002
E014,洪雅雯,People Specialist,POPS,2026-07-01,E001
E015,許哲維,Data Analyst,ENG,2026-07-01,E002
E016,郭品妤,Project Manager,ENG,2026-07-01,E002
E017,謝承恩,Support Specialist,POPS,2026-07-01,E001
E018,方怡君,Content Specialist,POPS,2026-07-01,E001
E019,廖俊廷,Mobile Engineer,ENG,2026-07-01,E002
E020,羅佳穎,Payroll Specialist,POPS,2026-07-01,E001`;

export default async function EmployeeImportPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error, imported, preview }, session] = await Promise.all([searchParams, getDemoSession()]);
  const workspace = await getEmployeeImportWorkspace(session);

  return (
    <main className="page">
      <section className="page-header">
        <h1>試用員工匯入</h1>
        <p>貼上 CSV 後先檢查部門、主管線與 20-50 人 Beta 試用條件，再寫入員工主檔與 audit log。</p>
      </section>

      {error ? (
        <div className="panel danger-panel">
          <strong>無法匯入員工</strong>
          <p>{error}</p>
        </div>
      ) : null}
      {imported ? (
        <div className="panel success-panel">
          <strong>員工已匯入</strong>
          <p>員工主檔已建立，主管線與 audit log 也已同步處理。</p>
        </div>
      ) : null}
      {preview ? (
        <div className="panel">
          <strong>預覽已完成</strong>
          <p className="muted">請先確認錯誤列與試用檢查，再正式匯入。</p>
        </div>
      ) : null}

      <section className="grid">
        <section className="panel span-7">
          <div className="section-heading">
            <div>
              <h2>步驟 1：貼上員工 CSV</h2>
              <p className="muted">必要欄位：employeeNo, displayName, jobTitle, departmentCode, hireDate；建議填 managerEmployeeNo。</p>
            </div>
          </div>
          <form action="/api/employees/import" method="post" className="wizard-form">
            <input type="hidden" name="intent" value="preview" />
            <label>
              CSV 內容
              <textarea name="rawCsv" defaultValue={workspace.preview?.rawCsv ?? sampleCsv} rows={8} required />
            </label>
            <button className="button primary" type="submit">
              檢查匯入資料
            </button>
          </form>
        </section>

        <section className="panel span-5">
          <h2>可用部門代碼</h2>
          <ul className="task-list">
            {workspace.departments.map((department) => (
              <li className="task" key={department.id}>
                <span>
                  <strong>{department.code}</strong>
                  <small>{department.name}</small>
                </span>
                <span className="badge">可使用</span>
              </li>
            ))}
          </ul>
        </section>

        {workspace.preview ? <PilotReadinessCard readiness={workspace.preview.pilotReadiness} /> : null}

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>步驟 2：確認檢查結果</h2>
              <p className="muted">有錯誤的列必須先修正；Beta 試用檢查會協助判斷這批資料是否足夠讓 20-50 人公司試跑。</p>
            </div>
            {workspace.preview ? (
              <span className={`badge ${workspace.preview.invalidCount ? "warning" : ""}`}>
                {workspace.preview.validCount} 筆可匯入 · {workspace.preview.invalidCount} 筆需修正
              </span>
            ) : null}
          </div>

          {!workspace.preview ? (
            <EmptyState title="尚未產生預覽" body="先貼上 CSV 並執行檢查，確認無誤後再匯入。" />
          ) : (
            <>
              <ul className="task-list">
                {workspace.preview.rows.map((row) => (
                  <li className="task request-task" key={`${row.rowNumber}-${row.employeeNo}`}>
                    <span>
                      <strong>
                        第 {row.rowNumber} 列 · {row.employeeNo || "缺少員編"} · {row.displayName || "缺少姓名"}
                      </strong>
                      <small>
                        {row.jobTitle || "缺少職稱"} · {(row.departmentName ?? row.departmentCode) || "未知部門"} · {row.hireDate ? formatDate(row.hireDate) : "日期錯誤"}
                        {row.managerEmployeeNo ? ` · 主管 ${row.managerEmployeeNo}` : " · 未填主管"}
                      </small>
                      {row.errors.map((message) => (
                        <small className="warning-text" key={message}>{translateImportError(message)}</small>
                      ))}
                    </span>
                    <span className={`badge ${row.status === "invalid" ? "warning" : ""}`}>
                      {row.status === "valid" ? "可匯入" : "需修正"}
                    </span>
                  </li>
                ))}
              </ul>

              <form action="/api/employees/import" method="post" className="mini-form">
                <input type="hidden" name="intent" value="import" />
                <input type="hidden" name="previewId" value={workspace.preview.id} />
                <button className="button primary" type="submit" disabled={workspace.preview.invalidCount > 0}>
                  確認匯入員工
                </button>
              </form>
            </>
          )}
        </section>
      </section>
    </main>
  );
}

function PilotReadinessCard({ readiness }: { readiness: EmployeeImportPilotReadiness }) {
  return (
    <section className="panel span-12">
      <div className="section-heading">
        <div>
          <h2>Beta 試用匯入檢查</h2>
          <p className="muted">目標是 20-50 位員工，且至少有一條主管簽核線，才能完整試跑打卡、請假、簽核與月結。</p>
        </div>
        <span className={`badge ${pilotReadinessBadgeClass(readiness.status)}`}>
          {pilotReadinessLabel(readiness.status)}
        </span>
      </div>
      <div className="grid compact-stat-grid">
        <div className="panel-subtle">
          <small className="muted">現有人數</small>
          <strong>{readiness.existingEmployeeCount}</strong>
        </div>
        <div className="panel-subtle">
          <small className="muted">匯入後人數</small>
          <strong>{readiness.projectedEmployeeCount}</strong>
        </div>
        <div className="panel-subtle">
          <small className="muted">試用目標</small>
          <strong>
            {readiness.targetMin}-{readiness.targetMax}
          </strong>
        </div>
        <div className="panel-subtle">
          <small className="muted">主管線筆數</small>
          <strong>{readiness.managerAssignmentCount}</strong>
        </div>
      </div>
      {readiness.issues.length ? (
        <ul className="task-list">
          {readiness.issues.map((issue) => (
            <li className="task" key={issue}>
              <span>
                <strong>需要處理</strong>
                <small className="warning-text">{translateImportReadinessIssue(issue)}</small>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">這批匯入後的人數與主管線足以支援 2 週 Beta 試用。</p>
      )}
    </section>
  );
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function pilotReadinessBadgeClass(status: EmployeeImportPilotReadiness["status"]) {
  if (status === "blocked") return "danger";
  if (status === "action_required") return "warning";
  return "";
}

function pilotReadinessLabel(status: EmployeeImportPilotReadiness["status"]) {
  if (status === "blocked") return "無法匯入試用";
  if (status === "action_required") return "需補齊資料";
  return "可支援試用";
}

function translateImportError(message: string) {
  const translations: Record<string, string> = {
    "Employee number is required.": "員工編號為必填。",
    "Employee number already exists.": "員工編號已存在。",
    "Duplicate employee number in CSV.": "CSV 內有重複的員工編號。",
    "Display name is required.": "姓名為必填。",
    "Job title is required.": "職稱為必填。",
    "Department code was not found.": "找不到部門代碼。",
    "Hire date must be YYYY-MM-DD.": "到職日格式需為 YYYY-MM-DD。",
    "Manager cannot be the same employee.": "主管不可填自己。",
    "Manager employee number was not found in existing employees or CSV.": "找不到主管員編，請確認主管已存在或也在本次 CSV 內。",
    "Manager employee number points to an invalid CSV row.": "主管員編指向的 CSV 列本身有錯誤，請先修正主管資料。",
  };
  return translations[message] ?? message;
}

function translateImportReadinessIssue(message: string) {
  if (message === "No valid employee rows are ready to import.") return "目前沒有可匯入的員工列。";
  if (message.includes("invalid row")) return message.replace("invalid row(s) must be fixed before this can support a pilot.", "筆錯誤資料需先修正，才適合進入試用。");
  if (message.includes("Projected employee count is") && message.includes("import at least")) {
    return message
      .replace("Projected employee count is", "匯入後員工數為")
      .replace("; import at least", "；至少還要匯入")
      .replace("more employee(s) to reach a 20-person pilot.", "位員工，才能達到 20 人試用門檻。");
  }
  if (message.includes("split the import so the pilot stays within 50 people.")) {
    return message
      .replace("Projected employee count is", "匯入後員工數為")
      .replace("; split the import so the pilot stays within 50 people.", "；請拆分匯入，讓 Beta 試用維持在 50 人以內。");
  }
  if (message === "No managerEmployeeNo values were provided; manager approvals need at least one reporting line.") {
    return "未提供主管員編；主管簽核至少需要一條員工對主管的關係。";
  }
  return message;
}
