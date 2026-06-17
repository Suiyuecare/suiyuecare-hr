import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { hasPermission } from "@/server/auth/rbac";
import { getDemoSession } from "@/server/auth/session";
import {
  getProductionDatabaseRemediationReport,
  type ProductionDatabaseRemediationReport,
  type ProductionDatabaseRemediationStep,
} from "@/server/readiness/production-database-remediation";

export default async function ProductionDatabasePage() {
  const session = await getDemoSession();
  if (!hasPermission(session.role, "settings:read")) {
    return (
      <main className="page">
        <EmptyState
          title="需要管理權限"
          body="請切換為老闆或人資管理員角色，再檢查正式環境資料庫 Gate。"
        />
      </main>
    );
  }

  const report = await getProductionDatabaseRemediationReport({
    appUrl: "https://hr.suiyuecare.com",
    expectedHost: "hr.suiyuecare.com",
  });

  return (
    <main className="page">
      <section className="page-header">
        <h1>正式環境資料庫 Gate</h1>
        <p>20-50 人兩週試用前，正式站必須能從 Vercel runtime 連到 Supabase PostgreSQL；這裡只顯示狀態與修復路線，不顯示任何 secret。</p>
      </section>

      <section className="grid">
        <section className={`panel span-12 risk-box ${report.status === "ready" ? "success-box" : "danger-box"}`}>
          <div className="section-heading">
            <div>
              <h2>{report.status === "ready" ? "Production database 已可用" : "Production database 仍阻擋試用開跑"}</h2>
              <p className="muted">{report.summary}</p>
            </div>
            <span className={`badge ${report.status === "ready" ? "" : "danger"}`}>
              {rootCauseLabel(report.rootCause)}
            </span>
          </div>
        </section>

        <MetricCard label="Live readiness" value={report.gate.checks.find((check) => check.name === "overall readiness")?.passed ? "OK" : "FAIL"} danger={!report.gate.checks.find((check) => check.name === "overall readiness")?.passed} />
        <MetricCard label="Production env" value={report.gate.checks.find((check) => check.name === "production environment")?.passed ? "OK" : "FAIL"} danger={!report.gate.checks.find((check) => check.name === "production environment")?.passed} />
        <MetricCard label="Database ping" value={report.gate.checks.find((check) => check.name === "production database")?.passed ? "OK" : "FAIL"} danger={!report.gate.checks.find((check) => check.name === "production database")?.passed} />
        <MetricCard label="Demo auth" value={report.gate.checks.find((check) => check.name === "demo auth disabled")?.passed ? "OFF" : "RISK"} danger={!report.gate.checks.find((check) => check.name === "demo auth disabled")?.passed} />

        <section className="panel span-7">
          <div className="section-heading">
            <div>
              <h2>目前診斷</h2>
              <p className="muted">來源：{report.readinessUrl}；產生時間 {formatDateTime(report.generatedAt)}</p>
            </div>
            <Link className="button" href="/settings/pilot-go-no-go">
              回 Go/No-Go
            </Link>
          </div>
          <ul className="task-list">
            {report.gate.checks.map((check) => (
              <li className="task" key={check.name}>
                <span>
                  <strong>{gateCheckLabel(check.name)}</strong>
                  <small>{check.detail}</small>
                </span>
                <span className={`badge ${check.passed ? "" : "danger"}`}>
                  {check.passed ? "通過" : "阻擋"}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-5">
          <h2>下一步</h2>
          <ul className="task-list">
            {report.nextActions.map((action) => (
              <li className="task" key={action}>
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>修復路線</h2>
              <p className="muted">選一條路線修正 Vercel Production env，修完後必須 redeploy，再跑 production gate。</p>
            </div>
          </div>
          <div className="invite-prep-grid" aria-label="正式環境資料庫修復路線">
            {report.tracks.map((track) => (
              <article className={`invite-prep-card ${track.recommended ? "ready" : ""}`} key={track.id}>
                <span className={`badge ${track.recommended ? "" : "warning"}`}>
                  {track.recommended ? "建議" : "備選"}
                </span>
                <h3>{track.title}</h3>
                <p>{track.detail}</p>
                <ul className="task-list">
                  {track.steps.map((step) => (
                    <li className="task" key={step.id}>
                      <span>
                        <strong>{step.title}</strong>
                        <small>{step.detail}</small>
                        {step.command ? <small>{step.command}</small> : null}
                      </span>
                      <span className={`badge ${stepBadgeClass(step.status)}`}>
                        {stepStatusLabel(step.status)}
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="panel span-7">
          <h2>必跑命令</h2>
          <ul className="task-list">
            <li className="task">
              <span>
                <strong>Production health</strong>
                <small>curl -fsS https://hr.suiyuecare.com/api/health/ready</small>
              </span>
            </li>
            <li className="task">
              <span>
                <strong>Production pilot gate</strong>
                <small>pnpm pilot:gate:production -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com</small>
              </span>
            </li>
            <li className="task">
              <span>
                <strong>Full Go/No-Go</strong>
                <small>pnpm pilot:go-no-go -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --tenant-slug=&lt;customer-slug&gt;</small>
              </span>
            </li>
          </ul>
        </section>

        <section className="panel span-5">
          <h2>隱私護欄</h2>
          <ul className="task-list">
            {report.privacyGuardrails.map((guardrail) => (
              <li className="task" key={guardrail}>
                <span>{guardrail}</span>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}

function MetricCard({ label, value, danger }: { label: string; value: string; danger: boolean }) {
  return (
    <div className="panel span-3 metric">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
      <span className={`badge ${danger ? "danger" : ""}`}>{danger ? "blocked" : "ready"}</span>
    </div>
  );
}

function rootCauseLabel(rootCause: ProductionDatabaseRemediationReport["rootCause"]) {
  const labels: Record<ProductionDatabaseRemediationReport["rootCause"], string> = {
    ready: "可用",
    supabase_direct_network: "Direct host 網路阻擋",
    pooler_configuration: "Pooler 設定",
    missing_database_url: "缺 DATABASE_URL",
    environment_configuration: "Env 未通過",
    health_unreachable: "Health 不可讀",
    unknown: "待定位",
  };
  return labels[rootCause];
}

function gateCheckLabel(name: string) {
  const labels: Record<string, string> = {
    "production URL": "正式網址",
    "readiness payload": "Health payload",
    "overall readiness": "整體 readiness",
    "production environment": "Production env",
    "production database": "資料庫連線",
    "demo auth disabled": "Demo auth 關閉",
    "health payload redaction": "Health redaction",
  };
  return labels[name] ?? name;
}

function stepStatusLabel(status: ProductionDatabaseRemediationStep["status"]) {
  if (status === "done") return "完成";
  if (status === "blocked") return "阻擋";
  return "待辦";
}

function stepBadgeClass(status: ProductionDatabaseRemediationStep["status"]) {
  if (status === "blocked") return "danger";
  if (status === "todo") return "warning";
  return "";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Taipei",
  }).format(new Date(value));
}
