import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { hasPermission } from "@/server/auth/rbac";
import { getDemoSession } from "@/server/auth/session";
import {
  getPilotImportPreflightWorkspace,
  type PilotImportPreflightSnapshot,
} from "@/server/readiness/pilot-import-preflight-ui";
import type { PilotImportPreflightCheck } from "@/server/readiness/pilot-import-preflight";

type SearchParams = Promise<{
  error?: string;
  success?: string;
}>;

export default async function PilotImportPreflightPage({ searchParams }: { searchParams: SearchParams }) {
  const [params, session] = await Promise.all([searchParams, getDemoSession()]);
  if (!hasPermission(session.role, "settings:read")) {
    return (
      <main className="page">
        <EmptyState
          title="需要管理權限"
          body="請切換為老闆或人資管理員角色，再檢查試用 CSV 匯入資料。"
        />
      </main>
    );
  }

  const canManagePilot = hasPermission(session.role, "pilot:manage");
  const workspace = await getPilotImportPreflightWorkspace(session);
  const latest = workspace.latestSnapshot;

  return (
    <main className="page">
      <section className="page-header">
        <h1>試用 CSV 預檢</h1>
        <p>在匯入 20-50 人真實試用資料前，先檢查員工、登入/SSO 與薪資 profile 是否一致；畫面不保存、不回顯 CSV 原文。</p>
      </section>

      {params.error ? (
        <div className="panel danger-panel">
          <strong>CSV 預檢失敗</strong>
          <p>{params.error}</p>
        </div>
      ) : null}
      {params.success === "import-preflight" ? (
        <div className="panel success-panel">
          <strong>CSV 預檢已完成</strong>
          <p>結果已更新；audit log 只保存彙總與 content hash，不保存姓名、email、薪資、銀行帳號或身份識別值。</p>
        </div>
      ) : null}

      <section className="grid">
        <section className={`panel span-12 risk-box ${workspace.readyForCustomerImport ? "success-box" : latest ? "danger-box" : "warning-box"}`}>
          <div className="section-heading">
            <div>
              <h2>{workspace.readyForCustomerImport ? "CSV 預檢已通過，可以進入正式匯入" : latest ? "CSV 還不能匯入" : "尚未執行 CSV 預檢"}</h2>
              <p className="muted">
                保存模式：{persistenceModeLabel(workspace.persistence.mode)}。{workspace.persistence.detail}
              </p>
            </div>
            <span className={`badge ${latest?.report.blockers ? "danger" : latest?.report.warnings ? "warning" : ""}`}>
              {latest ? `${latest.report.blockers} 阻擋 / ${latest.report.warnings} 提醒` : "待預檢"}
            </span>
          </div>
        </section>

        <MetricCard label="員工列數" value={latest?.report.employeeRows ?? 0} badge="20-50 目標" warning={!latest || latest.report.employeeRows < 20 || latest.report.employeeRows > 50} />
        <MetricCard label="登入列數" value={latest?.report.identityRows ?? 0} badge="SSO 對齊" warning={!latest || latest.report.identityRows !== latest.report.employeeRows} />
        <MetricCard label="薪資 profile" value={latest?.report.payrollRows ?? 0} badge="權限保護" warning={!latest || latest.report.payrollRows !== latest.report.employeeRows} />
        <MetricCard label="主管線" value={latest?.report.managerWithDirectReportsCount ?? 0} badge="Inbox 測試" warning={!latest || latest.report.managerWithDirectReportsCount < 1} />

        <section className="panel span-7">
          <div className="section-heading">
            <div>
              <h2>貼上三份 CSV 做預檢</h2>
              <p className="muted">原文只用於這次 request。送出後欄位會清空，頁面只顯示去識別化摘要。</p>
            </div>
            <span className={`badge ${canManagePilot ? "" : "warning"}`}>
              {canManagePilot ? "可執行" : "只能檢視"}
            </span>
          </div>

          {canManagePilot ? (
            <form
              action="/api/settings/pilot-import-preflight"
              aria-label="試用 CSV 預檢表單"
              method="post"
              className="mini-form compact-form"
            >
              <input type="hidden" name="returnTo" value="/settings/pilot-import-preflight" />
              {workspace.requiredFiles.map((file) => (
                <label key={file.fieldName}>
                  {file.title}
                  <small>{file.description}</small>
                  <textarea
                    name={file.fieldName}
                    placeholder={file.placeholder}
                    rows={file.fieldName === "payrollCsv" ? 8 : 5}
                    required
                  />
                </label>
              ))}
              <button className="button primary" type="submit">
                執行 CSV 預檢
              </button>
            </form>
          ) : (
            <EmptyState title="只能檢視" body="目前角色可以查看預檢結果，但不能處理含有薪資或身份資料的 CSV。" />
          )}
        </section>

        <section className="panel span-5">
          <h2>預檢後下一步</h2>
          <ul className="task-list">
            <li className="task">
              <span>
                <strong>員工匯入</strong>
                <small>先匯入員工主檔與部門/主管線。</small>
              </span>
              <Link className="button" href="/hr/employee-import">
                開啟
              </Link>
            </li>
            <li className="task">
              <span>
                <strong>薪資 profile 匯入</strong>
                <small>只限 payroll 權限角色，匯入後寫入 audit。</small>
              </span>
              <Link className="button" href="/hr/payroll-profile-import">
                開啟
              </Link>
            </li>
            <li className="task">
              <span>
                <strong>Go/No-Go</strong>
                <small>預檢通過後回到開跑總檢查。</small>
              </span>
              <Link className="button" href="/settings/pilot-go-no-go">
                檢查
              </Link>
            </li>
          </ul>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>最新預檢結果</h2>
              <p className="muted">{latest ? `檢查時間 ${formatDateTime(latest.checkedAt)}；content hash ${shortHash(latest.contentHash)}` : "尚未有瀏覽器預檢 snapshot。"}</p>
            </div>
            {latest ? (
              <span className={`badge ${latest.report.status === "blocked" ? "danger" : latest.report.status === "action_required" ? "warning" : ""}`}>
                {statusLabel(latest.report.status)}
              </span>
            ) : null}
          </div>
          {latest ? (
            <div className="go-no-go-check-grid" aria-label="CSV 預檢結果">
              {latest.report.checks.map((check) => (
                <PreflightCheckCard check={check} key={check.name} />
              ))}
            </div>
          ) : (
            <EmptyState title="尚未預檢" body="請先貼上三份完成版 CSV，或用 CLI 產生 redacted 預檢報告後再回到 Go/No-Go。" />
          )}
        </section>

        <section className="panel span-7">
          <h2>隱私護欄</h2>
          <ul className="task-list">
            {workspace.privacyGuardrails.map((guardrail) => (
              <li className="task" key={guardrail}>
                <span>{guardrail}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-5">
          <h2>CLI 備援</h2>
          <ul className="task-list">
            {workspace.commands.map((command) => (
              <li className="task" key={command}>
                <span>
                  <small>{command}</small>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}

function MetricCard({
  label,
  value,
  badge,
  warning,
}: {
  label: string;
  value: number;
  badge: string;
  warning: boolean;
}) {
  return (
    <div className="panel span-3 metric">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
      <span className={`badge ${warning ? "warning" : ""}`}>{badge}</span>
    </div>
  );
}

function PreflightCheckCard({ check }: { check: PilotImportPreflightCheck }) {
  return (
    <article className={`go-no-go-check-card ${check.status}`}>
      <div>
        <span className={`badge ${check.status === "block" ? "danger" : check.status === "warn" ? "warning" : ""}`}>
          {checkStatusLabel(check.status)}
        </span>
        <h3>{checkLabel(check.name)}</h3>
        <p>{check.detail}</p>
      </div>
    </article>
  );
}

function statusLabel(status: PilotImportPreflightSnapshot["report"]["status"]) {
  if (status === "ready") return "通過";
  if (status === "action_required") return "需處理";
  return "阻擋";
}

function checkStatusLabel(status: PilotImportPreflightCheck["status"]) {
  if (status === "pass") return "通過";
  if (status === "warn") return "提醒";
  return "阻擋";
}

function checkLabel(name: string) {
  const labels: Record<string, string> = {
    "employee CSV headers": "員工欄位",
    "identity CSV headers": "登入欄位",
    "payroll CSV headers": "薪資欄位",
    "20-50 active employee rows": "20-50 人名單",
    "payroll rows match employee rows": "薪資列數一致",
    "identity rows match employee rows": "登入列數一致",
    "employee numbers are unique and present": "員工編號唯一",
    "payroll employee numbers match employee CSV": "薪資員編對齊",
    "identity employee numbers match employee CSV": "登入員編對齊",
    "identity emails are valid and unique": "公司 Email",
    "identity SSO subjects are present and unique": "SSO Subject",
    "department coverage": "部門覆蓋",
    "manager reporting lines": "主管簽核線",
    "synthetic template markers": "範例資料",
    "non-resident tax setup": "非居住者稅務",
    "required payroll values present": "薪資必要欄位",
  };
  return labels[name] ?? name;
}

function persistenceModeLabel(mode: string) {
  if (mode === "database") return "正式資料庫";
  if (mode === "production_missing_database") return "Production 缺 DB";
  return "Demo 暫存";
}

function shortHash(hash: string) {
  return hash.slice(0, 12);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Taipei",
  }).format(new Date(value));
}
