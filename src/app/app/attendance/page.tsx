import { DashboardLink } from "@/components/DashboardLink";
import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/demo-session";
import { getEmployeeAttendanceRecordWorkspace } from "@/server/attendance/employee-records";
import { getEmployeeAttendanceSignoffWorkspace } from "@/server/attendance/signoffs";

type SearchParams = Promise<{
  error?: string;
}>;

export default async function EmployeeAttendancePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getDemoSession();
  const [workspace, signoffWorkspace] = await Promise.all([
    getEmployeeAttendanceRecordWorkspace(session),
    getEmployeeAttendanceSignoffWorkspace(session),
  ]);
  const { policy, records } = workspace;

  return (
    <>
      <main className="page mobile-page">
        <section className="page-header">
          <h1>出勤紀錄</h1>
          <p>{session.employee?.displayName ?? "示範員工"} 可直接查看近期出勤，不必另外詢問人資。</p>
        </section>

        <section className="grid">
          {params.error ? (
            <div className="panel span-12 risk-box danger-box">
              <strong>出勤確認失敗</strong>
              <p>{params.error}</p>
            </div>
          ) : null}

          <div className="panel span-12 today-card">
            <div>
              <span className="muted">紀錄查詢</span>
              <h2>{policy.employeeSelfServiceEnabled ? "員工自助查詢已開啟" : "員工自助查詢暫停"}</h2>
              <p className="muted">
                保留 {policy.attendanceRecordRetentionDays} 天 · 匯出{" "}
                {policy.employeeExportEnabled ? "可使用" : "暫停"}
              </p>
            </div>
            <span className={`badge ${policy.employeeSelfServiceEnabled ? "" : "danger"}`}>
              {policy.employeeSelfServiceEnabled ? "員工可查看" : "需人資處理"}
            </span>
          </div>

          <section className="panel span-12">
            <div className="section-heading">
              <div>
                <h2>月度出勤確認</h2>
                <p className="muted">
                  {formatDate(signoffWorkspace.periodStart)} 至 {formatDate(signoffWorkspace.periodEnd)}
                </p>
              </div>
              <span className={`badge ${signoffWorkspace.signoff ? "" : "warning"}`}>
                {signoffWorkspace.signoff ? "已確認" : "待確認"}
              </span>
            </div>
            <div className="payroll-preview">
              <div className="metric">
                <span className="muted">紀錄</span>
                <strong>{signoffWorkspace.recordCount}</strong>
              </div>
              <div className="metric">
                <span className="muted">異常</span>
                <strong>{signoffWorkspace.exceptionCount}</strong>
              </div>
              <div className="metric">
                <span className="muted">未處理</span>
                <strong>{signoffWorkspace.openExceptionCount}</strong>
              </div>
            </div>
            {signoffWorkspace.signoff ? (
              <p className="muted">
                已於 {signoffWorkspace.signoff.signedAt.toLocaleDateString("zh-TW")} 確認 · hash{" "}
                {signoffWorkspace.signoff.summaryHash.slice(0, 12)}
              </p>
            ) : (
              <form action="/api/attendance/signoffs" method="post">
                <input type="hidden" name="periodStart" value={formatDate(signoffWorkspace.periodStart)} />
                <input type="hidden" name="periodEnd" value={formatDate(signoffWorkspace.periodEnd)} />
                <button className="button primary" type="submit" disabled={signoffWorkspace.openExceptionCount > 0}>
                  確認本月出勤
                </button>
              </form>
            )}
          </section>

          <section className="panel span-12">
            <div className="section-heading">
              <div>
                <h2>近期紀錄</h2>
                <p className="muted">最近 31 個有出勤紀錄的工作日。</p>
              </div>
              <span className="badge">{records.length} 天</span>
            </div>

            {!policy.employeeSelfServiceEnabled ? (
              <EmptyState
                title="出勤查詢暫停"
                body="人資需在出勤政策中開啟員工自助查詢。"
              />
            ) : records.length === 0 ? (
              <EmptyState title="尚無出勤紀錄" body="完成打卡後，或由人資補正紀錄後，這裡會顯示出勤資料。" />
            ) : (
              <ul className="task-list">
                {records.map((record) => (
                  <li className="task" key={record.id}>
                    <span>
                      <strong>{formatDate(record.workDate)}</strong>
                      <small>
                        {formatTime(record.clockInAt)} / {formatTime(record.clockOutAt)}
                      </small>
                      <small>
                        來源 {labelPunchSource(record.clockInSource)} / {labelPunchSource(record.clockOutSource)}
                      </small>
                    </span>
                    <span className={`badge ${record.status === "complete" ? "" : "warning"}`}>
                      {labelAttendanceStatus(record.status)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </section>
      </main>

      <nav className="bottom-nav" aria-label="員工手機導覽">
        <DashboardLink href="/app" label="首頁" />
        <DashboardLink href="/app/attendance" label="出勤" />
        <DashboardLink href="/app/documents" label="文件" />
        <DashboardLink href="/app/payslip" label="薪資單" />
        <DashboardLink href="/manager/inbox" label="簽核" />
      </nav>
    </>
  );
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatTime(date: Date | null) {
  if (!date) return "--:--";
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Taipei",
  }).format(date);
}

function labelPunchSource(source: string | null) {
  if (source === "mobile") return "手機";
  if (source === "web") return "網頁";
  if (source === "manual") return "人工補登";
  return "缺漏";
}

function labelAttendanceStatus(status: string) {
  if (status === "complete") return "已完成";
  if (status === "clocked_in") return "已上班打卡";
  if (status === "corrected") return "已補正";
  return "待處理";
}
