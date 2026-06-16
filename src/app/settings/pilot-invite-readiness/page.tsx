import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/session";
import { hasPermission } from "@/server/auth/rbac";
import {
  buildPilotInviteReadinessReport,
  readPilotInviteReadinessSnapshotFromDatabase,
} from "@/server/readiness/pilot-invite-readiness";

type SearchParams = Promise<{
  tenantSlug?: string;
  companyId?: string;
}>;

export default async function PilotInviteReadinessPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [params, session] = await Promise.all([searchParams, getDemoSession()]);
  if (!hasPermission(session.role, "settings:read")) {
    return (
      <main className="page">
        <EmptyState
          title="需要管理權限"
          body="請切換為老闆或人資管理員角色，再檢查試用邀請就緒狀態。"
        />
      </main>
    );
  }

  const tenantSlug = normalizeTenantSlug(params.tenantSlug);
  const companyId = normalizeOptionalParam(params.companyId);
  const snapshot = await readPilotInviteReadinessSnapshotFromDatabase({
    tenantSlug,
    companyId,
  });
  const report = buildPilotInviteReadinessReport({ snapshot });

  return (
    <main className="page">
      <section className="page-header">
        <h1>試用邀請就緒</h1>
        <p>在發出第一封邀請前，確認 20-50 人都有登入、角色、主管線、班表、假別餘額與薪資單自助查看規則。</p>
      </section>

      <section className="grid">
        <section className={`panel span-12 risk-box ${report.status === "ready" ? "success-box" : report.blockers ? "danger-box" : ""}`}>
          <div className="section-heading">
            <div>
              <h2>{statusTitle(report.status)}</h2>
              <p className="muted">
                目前檢查租戶：{tenantSlug}
                {companyId ? ` · 公司 ${companyId}` : ""}。報表只保留彙總數字與狀態，不輸出個資、薪資、銀行帳號、SSO subject 或私人備註。
              </p>
            </div>
            <span className={`badge ${report.blockers ? "danger" : report.warnings ? "warning" : ""}`}>
              {report.blockers} 阻擋 / {report.warnings} 提醒
            </span>
          </div>
        </section>

        <div className="panel span-3 metric">
          <span className="muted">試用人數</span>
          <strong>{report.activeEmployeeCount}</strong>
          <span className={`badge ${report.activeEmployeeCount >= 20 && report.activeEmployeeCount <= 50 ? "" : "danger"}`}>
            目標 20-50
          </span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">主管簽核線</span>
          <strong>{report.managerWithDirectReportsCount}</strong>
          <span className={`badge ${report.managerWithDirectReportsCount ? "" : "danger"}`}>至少 1 位</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">14 天班表</span>
          <strong>{report.scheduledEmployeeCount}</strong>
          <span className={`badge ${report.scheduledEmployeeCount === report.activeEmployeeCount && report.activeEmployeeCount > 0 ? "" : "warning"}`}>
            覆蓋員工
          </span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">假別餘額</span>
          <strong>{report.leaveBalanceEmployeeCount}</strong>
          <span className={`badge ${report.leaveBalanceEmployeeCount === report.activeEmployeeCount && report.activeEmployeeCount > 0 ? "" : "warning"}`}>
            可請假
          </span>
        </div>

        <section className="panel span-8">
          <div className="section-heading">
            <div>
              <h2>邀請前檢查</h2>
              <p className="muted">所有 block 都要清掉；warning 可先安排負責人，但不能在沒風險說明的情況下發邀請。</p>
            </div>
            <Link className="button" href="/settings/readiness">
              回上線準備度
            </Link>
          </div>
          <ul className="task-list">
            {report.checks.map((check) => (
              <li className="task" key={check.name}>
                <span>
                  <strong>{checkLabel(check.name)}</strong>
                  <small>{checkDetail(check.name, check.status, check.detail, report)}</small>
                </span>
                <span className="inline-actions">
                  <span className={`badge ${badgeClass(check.status)}`}>{statusLabel(check.status)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-4">
          <h2>檢查其他租戶</h2>
          <form className="mini-form" action="/settings/pilot-invite-readiness">
            <label>
              租戶代碼
              <input name="tenantSlug" defaultValue={tenantSlug} placeholder="customer-slug" />
            </label>
            <label>
              公司 ID
              <input name="companyId" defaultValue={companyId ?? ""} placeholder="選填；不填使用第一家公司" />
            </label>
            <button className="button primary" type="submit">
              重新檢查
            </button>
          </form>
          <div className="panel-subtle">
            <strong>CLI 檢查指令</strong>
            <span className="muted">
              pnpm pilot:invite-readiness -- --tenant-slug={tenantSlug} --output=/tmp/hr-one-pilot-invite-readiness.md
            </span>
          </div>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>下一步</h2>
              <p className="muted">這些項目清完後，再跑 Go/No-Go，把匯入、邀請、證據掃描與正式環境準備度串在一起。</p>
            </div>
            <Link className="button primary" href={`/settings/pilot-invite-readiness?tenantSlug=${encodeURIComponent(tenantSlug)}`}>
              更新狀態
            </Link>
          </div>
          <ul className="task-list">
            {report.nextActions.length ? (
              report.nextActions.map((action) => (
                <li className="task" key={action}>
                  <span>{nextActionLabel(action)}</span>
                  <span className="badge warning">待辦</span>
                </li>
              ))
            ) : (
              <li className="task">
                <span>可以進入 pilot:go-no-go，並由 HR 確認正式發邀請時間。</span>
                <span className="badge">ready</span>
              </li>
            )}
          </ul>
        </section>
      </section>
    </main>
  );
}

function normalizeTenantSlug(value: string | undefined) {
  const normalized =
    value?.trim() ||
    process.env.HR_ONE_PILOT_TENANT_SLUG?.trim() ||
    process.env.HR_ONE_TENANT_SLUG?.trim() ||
    "suiyuecare-pilot";
  return normalized || "suiyuecare-pilot";
}

function normalizeOptionalParam(value: string | undefined) {
  const normalized = value?.trim();
  return normalized || null;
}

function statusTitle(status: string) {
  if (status === "ready") return "可以準備發出試用邀請";
  if (status === "action_required") return "可排程邀請，但要先處理提醒";
  return "尚未可以邀請員工";
}

function checkLabel(name: string) {
  const labels: Record<string, string> = {
    "tenant and company": "租戶與公司",
    "20-50 active employees": "20-50 位有效員工",
    "active user link for every employee": "每位員工都有有效登入帳號",
    "employee role coverage": "員工角色覆蓋",
    "manager reporting line": "主管簽核線",
    "manager login and role coverage": "主管登入與角色",
    "SSO identity coverage": "SSO 身分綁定",
    "allowed email domain": "公司 Email 網域",
    "department coverage": "部門覆蓋",
    "14-day schedule coverage": "前 14 天班表覆蓋",
    "leave balance coverage": "假別餘額覆蓋",
    "payslip visibility rule": "薪資單可見性規則",
    "released payslip rehearsal coverage": "薪資單釋出演練",
  };
  return labels[name] ?? name;
}

function checkDetail(
  name: string,
  status: string,
  detail: string,
  report: ReturnType<typeof buildPilotInviteReadinessReport>,
) {
  const firstRatio = ratioText(detail);
  const ratios = ratioTexts(detail);
  const pass = status === "pass";
  const labels: Record<string, string> = {
    "tenant and company": pass ? "已找到租戶與公司。" : "找不到租戶或公司，請先建立正式客戶 tenant。",
    "20-50 active employees": `${report.activeEmployeeCount} 位有效員工；試用目標是 20-50 位。`,
    "active user link for every employee": firstRatio
      ? `${firstRatio} 位員工已有有效登入帳號。`
      : "每位有效員工都需要一個有效登入帳號。",
    "employee role coverage": firstRatio
      ? `${firstRatio} 位員工已有 employee 角色。`
      : "每位有效員工都需要 employee 角色。",
    "manager reporting line": `${report.managerWithDirectReportsCount} 位主管有直屬員工；至少需要 1 條簽核線。`,
    "manager login and role coverage": ratios.length >= 2
      ? `${ratios[0]} 位主管已有有效帳號，${ratios[1]} 位主管已有 manager 角色。`
      : "有直屬員工的主管都需要有效帳號與 manager 角色。",
    "SSO identity coverage": pass
      ? "已啟用 SSO，且員工外部身分綁定完整。"
      : "正式試用應啟用 SSO，並替每位員工綁定外部身分。",
    "allowed email domain": pass
      ? "公司 Email 網域已設定，且沒有越界帳號。"
      : "請設定允許的公司 Email 網域，並修正不在網域內的帳號。",
    "department coverage": pass
      ? "每位有效員工都有部門。"
      : "仍有有效員工缺少部門，會影響後台篩選與簽核責任。",
    "14-day schedule coverage": `${report.scheduledEmployeeCount}/${report.activeEmployeeCount} 位有效員工已有前 14 天班表。`,
    "leave balance coverage": `${report.leaveBalanceEmployeeCount}/${report.activeEmployeeCount} 位有效員工已有至少一筆有效假別餘額。`,
    "payslip visibility rule": pass
      ? "員工薪資單自助查看已啟用，且 self-only RBAC 規則通過。"
      : "員工薪資單自助查看未啟用，或 self-only RBAC 規則不安全。",
    "released payslip rehearsal coverage": `${report.releasedPayslipEmployeeCount}/${report.activeEmployeeCount} 位有效員工已有薪資單釋出演練證據；至少要在第 7 天月結預演前完成。`,
  };
  return labels[name] ?? detail;
}

function nextActionLabel(action: string) {
  const labels: Record<string, string> = {
    "Provision the real customer tenant and company before preparing invitations.":
      "先建立正式客戶 tenant 與公司，再準備邀請員工。",
    "Import the real pilot cohort so there are 20-50 active employees.":
      "匯入正式試用名單，讓有效員工數落在 20-50 人。",
    "Create or link one active user account for every active employee before sending invitations.":
      "發邀請前，替每位有效員工建立或綁定一個有效登入帳號。",
    "Assign the employee role to every active employee user.":
      "替每位有效員工的使用者帳號指派 employee 角色。",
    "Import managerEmployeeNo reporting lines so at least one manager has direct reports.":
      "匯入 managerEmployeeNo 主管線，至少要有一位主管帶直屬員工。",
    "Make every manager with direct reports an active linked user with the manager role.":
      "有直屬員工的主管都要有有效登入帳號，且具備 manager 角色。",
    "Enable production SSO and link external identities for every pilot employee user.":
      "啟用正式 SSO，並為每位試用員工綁定外部身分。",
    "Configure allowed company email domains and fix linked user emails outside those domains.":
      "設定允許的公司 Email 網域，並修正不在網域內的使用者帳號。",
    "Assign every active employee to a department before the first invitation.":
      "第一封邀請前，確認每位有效員工都有部門。",
    "Publish work schedules for every active pilot employee covering the first 14 trial days.":
      "發布每位試用員工前 14 天的班表。",
    "Create at least one active leave balance for every active pilot employee.":
      "替每位試用員工建立至少一筆有效假別餘額。",
    "Enable employee payslip self-service and keep the self-only payslip RBAC rule enforced.":
      "啟用員工薪資單自助查看，並維持只能看本人薪資單的 RBAC 規則。",
    "Complete a payroll release rehearsal so every active pilot employee has released payslip evidence before Day 7.":
      "第 7 天前完成薪資單釋出演練，讓每位有效員工都有薪資單查看證據。",
  };
  return labels[action] ?? action;
}

function ratioText(value: string) {
  const match = value.match(/(\d+)\/(\d+)/);
  return match ? `${match[1]}/${match[2]}` : null;
}

function ratioTexts(value: string) {
  return [...value.matchAll(/(\d+)\/(\d+)/g)].map((match) => `${match[1]}/${match[2]}`);
}

function badgeClass(status: string) {
  if (status === "block") return "danger";
  if (status === "warn") return "warning";
  return "";
}

function statusLabel(status: string) {
  if (status === "block") return "阻擋";
  if (status === "warn") return "提醒";
  return "通過";
}
