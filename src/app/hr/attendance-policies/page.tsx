import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/demo-session";
import {
  evaluateAttendanceRecordkeepingReadiness,
  getAttendancePolicySettings,
  minimumAttendanceRetentionDays,
} from "@/server/attendance/policies";

type SearchParams = Promise<{
  error?: string;
}>;

export default async function AttendancePoliciesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getDemoSession();
  const policies = await getAttendancePolicySettings(session);
  const activePolicy = policies.find((policy) => policy.status === "active");
  const recordkeeping = evaluateAttendanceRecordkeepingReadiness(activePolicy);

  return (
    <main className="page">
      <section className="page-header">
        <h1>出勤政策</h1>
        <p>設定工時門檻、加班警示、打卡方式與假勤簽核護欄。</p>
      </section>

      <section className="grid">
        {params.error ? (
          <div className="panel span-12 risk-box danger-box">
            <strong>Unable to save attendance policy</strong>
            <p>{params.error}</p>
          </div>
        ) : null}

        <div className="panel span-4 metric">
          <span className="muted">啟用政策</span>
          <strong>{activePolicy?.name ?? "尚未設定"}</strong>
          <span className="badge">版本化</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">每日正常工時</span>
          <strong>{formatHours(activePolicy?.regularDailyMinutes ?? 0)}</strong>
          <span className="badge">可設定</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">加班警示</span>
          <strong>{formatHours(activePolicy?.overtimeWarningDailyMinutes ?? 0)}</strong>
          <span className="badge warning">風險提示</span>
        </div>
        <div className="panel span-12 risk-box">
          <div className="section-heading">
            <div>
              <h2>出勤紀錄保存</h2>
              <p className="muted">{recordkeeping.detail}</p>
            </div>
            <span className={`badge ${recordkeeping.ready ? "" : "danger"}`}>
              {recordkeeping.ready ? "已就緒" : "需處理"}
            </span>
          </div>
          {recordkeeping.missing.length ? (
            <ul className="task-list compact">
              {recordkeeping.missing.map((item) => (
                <li className="task" key={item}>
                  <span>{item}</span>
                  <span className="badge danger">必要</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>政策設定精靈</h2>
              <p className="muted">建立新的生效政策，不需要改程式；啟用前請確認公司規則與法規要求。</p>
            </div>
            <a className="button" href="/hr">
              回月結主控台
            </a>
          </div>

          <form action="/api/attendance/policies" method="post" className="wizard-form">
            <div className="section-heading compact-heading">
              <div>
                <h3>1. 生效政策</h3>
              </div>
              <span className="badge">必要</span>
            </div>
            <div className="field-grid">
              <label>
                政策名稱
                <input name="name" defaultValue="標準出勤政策" required />
              </label>
              <label>
                狀態
                <select name="status" defaultValue="active">
                  <option value="active">啟用</option>
                  <option value="inactive">停用</option>
                </select>
              </label>
              <label>
                生效日
                <input name="effectiveFrom" type="date" defaultValue={today()} required />
              </label>
            </div>

            <div className="section-heading compact-heading">
              <div>
                <h3>2. 工時門檻</h3>
              </div>
              <span className="badge">分鐘</span>
            </div>
            <div className="field-grid">
              <label>
                每日正常工時分鐘數
                <input name="regularDailyMinutes" type="number" min="1" step="1" defaultValue="540" required />
              </label>
              <label>
                加班警示分鐘數
                <input name="overtimeWarningDailyMinutes" type="number" min="1" step="1" defaultValue="720" required />
              </label>
              <label>
                上班打卡寬限分鐘
                <input name="clockInGraceMinutes" type="number" min="0" step="1" defaultValue="5" />
              </label>
              <label>
                下班打卡寬限分鐘
                <input name="clockOutGraceMinutes" type="number" min="0" step="1" defaultValue="5" />
              </label>
            </div>

            <div className="toggle-row">
              <label>
                <input name="requireOvertimeApproval" type="checkbox" defaultChecked />
                加班必須簽核
              </label>
              <label>
                <input name="requirePunchCorrectionApproval" type="checkbox" defaultChecked />
                補打卡必須簽核
              </label>
              <label>
                <input name="allowMobilePunch" type="checkbox" defaultChecked />
                允許手機打卡
              </label>
            </div>

            <div className="section-heading compact-heading">
              <div>
                <h3>3. 打卡方式</h3>
                <p className="muted">可依公司政策限制遠端、辦公室網路或 GPS 靠近公司才能打卡。</p>
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
                <h3>4. 紀錄保存</h3>
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

        <section className="panel span-12">
          <h2>已設定政策</h2>
          {policies.length === 0 ? (
            <EmptyState title="尚無出勤政策" body="請先建立一筆政策，再開始出勤作業。" />
          ) : (
            <ul className="task-list">
              {policies.map((policy) => (
                <li className="task" key={policy.id}>
                  <span>
                    <strong>
                      {policy.name} · {policy.status}
                    </strong>
                    <small>
                      正常 {formatHours(policy.regularDailyMinutes)} · 警示 {formatHours(policy.overtimeWarningDailyMinutes)} · 生效 {formatDate(policy.effectiveFrom)}
                    </small>
                    <small>
                      打卡方式：{describePunchControls(policy)}
                    </small>
                    <small>
                      保存 {policy.attendanceRecordRetentionDays} 天 · 員工查看 {policy.employeeSelfServiceEnabled ? "開" : "關"} · 匯出 {policy.employeeExportEnabled ? "開" : "關"}
                    </small>
                  </span>
                  <span className={`badge ${policy.status === "inactive" ? "warning" : ""}`}>
                    寬限 {policy.clockInGraceMinutes}/{policy.clockOutGraceMinutes}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatHours(minutes: number) {
  if (!minutes) return "未設定";
  return `${Math.round((minutes / 60) * 10) / 10} 小時`;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function describePunchControls(policy: {
  allowRemotePunch: boolean;
  requireOfficeNetworkPunch: boolean;
  requireGpsProximityPunch: boolean;
  gpsRadiusMeters: number;
}) {
  const controls = [
    policy.allowRemotePunch ? "遠端可打卡" : "不可遠端打卡",
    policy.requireOfficeNetworkPunch ? "需公司網路" : null,
    policy.requireGpsProximityPunch ? `需 GPS ${policy.gpsRadiusMeters} 公尺內` : null,
  ].filter(Boolean);
  return controls.join("、");
}
