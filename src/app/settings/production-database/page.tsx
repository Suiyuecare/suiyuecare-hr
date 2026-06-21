import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { hasPermission } from "@/server/auth/rbac";
import { getDemoSession } from "@/server/auth/session";
import {
  getProductionDatabaseRemediationReport,
  type ProductionDatabaseEnvDraftReport,
  type ProductionDatabaseRemediationReport,
  type ProductionDatabaseRemediationStep,
} from "@/server/readiness/production-database-remediation";

const teamId = "team_LGag47eU8tKbsK6ixAmVa5Uq";
const projectId = "prj_QY0hzJ4hFzLX8XYO5ljIffLnH99N";
const poolerHandoffCommand =
  "printf '%s' \"$SUPABASE_TRANSACTION_POOLER_DATABASE_URL\" | pnpm vercel:database-url-handoff -- --env-file=.env.vercel.production --output=/tmp/hr-one-vercel-database-url-handoff.md";
const poolerDraftCommand =
  "printf '%s' \"$SUPABASE_TRANSACTION_POOLER_DATABASE_URL\" | pnpm vercel:refresh-production-env-draft -- --env-file=.env.vercel.production --database-url-stdin --apply";
const vercelEnvListCommand =
  `pnpm dlx vercel@latest env ls production --format json --scope ${teamId}`;
const vercelEnvApplyCommand =
  "pnpm vercel:apply-production-env -- --env-file=.env.vercel.production --method=cli";
const productionDeployCommand =
  `pnpm dlx vercel@latest --prod --scope ${teamId}`;

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
  const focus = buildDatabaseFocus(report);
  const databaseReady = checkPassed(report, "production database");
  const environmentReady = checkPassed(report, "production environment");
  const overallReady = checkPassed(report, "overall readiness");
  const demoAuthOff = checkPassed(report, "demo auth disabled");

  return (
    <main className="page production-database-page">
      <section className="hr-monthly-hero production-database-hero" aria-label="正式環境資料庫 Gate">
        <div className="hr-monthly-hero-main">
          <div className="hr-monthly-hero-topline">
            <span className="eyebrow">Owner 上線 Gate · Vercel / Supabase</span>
            <span className={`badge ${report.status === "ready" ? "done" : "danger"}`}>
              {report.status === "ready" ? "可開跑" : "阻擋販售"}
            </span>
          </div>
          <h1>正式環境資料庫 Gate</h1>
          <p>
            20-50 人兩週試用前，正式站必須從 Vercel runtime 連上 Supabase PostgreSQL。
            這裡只顯示 redacted 診斷、修復路線與安全命令，不顯示任何密碼、完整資料庫 URL 或員工資料。
          </p>
          <div className="hr-monthly-hero-actions">
            <Link className="button primary" href="#production-database-fix">
              修復路線
            </Link>
            <Link className="button" href="#production-database-pooler">
              Pooler 形狀
            </Link>
            <Link className="button" href="/settings/pilot-go-no-go">
              Go/No-Go
            </Link>
            <Link className="button" href="/settings/readiness">
              上線戰情室
            </Link>
          </div>
        </div>

        <aside className={`hr-monthly-hero-focus ${focus.tone}`} aria-label="今日先處理">
          <span className="eyebrow">今日先處理</span>
          <strong>{focus.title}</strong>
          <p>{focus.copy}</p>
          <small>{focus.meta}</small>
          <div className="hr-monthly-focus-footer">
            <a className="button primary" href={focus.href}>
              {focus.action}
            </a>
          </div>
        </aside>
      </section>

      <section className="hr-monthly-signal-board production-database-signal-board" aria-label="正式資料庫訊號板">
        <SignalCard label="Live readiness" value={overallReady ? "OK" : "FAIL"} detail={report.readinessUrl} tone={overallReady ? "done" : "danger"} />
        <SignalCard label="Production env" value={environmentReady ? "OK" : "FAIL"} detail={report.environmentDetail} tone={environmentReady ? "done" : "danger"} />
        <SignalCard label="Database ping" value={databaseReady ? "OK" : "FAIL"} detail={report.databaseDetail} tone={databaseReady ? "done" : "danger"} />
        <SignalCard label="Demo auth" value={demoAuthOff ? "OFF" : "RISK"} detail="正式 runtime 不可開 demo auth" tone={demoAuthOff ? "done" : "danger"} />
      </section>

      <section className="settings-command-grid production-database-command-grid" aria-label="資料庫修復作業卡">
        <article className={`settings-command-card ${report.status === "ready" ? "ready" : "danger"}`}>
          <span className="eyebrow">Hard Gate</span>
          <h2>Production database {report.status === "ready" ? "已可用" : "仍阻擋"}</h2>
          <p>{report.summary}</p>
          <a className="button" href="#production-database-diagnosis">
            看診斷
          </a>
        </article>
        <article className="settings-command-card warning">
          <span className="eyebrow">Vercel Secret</span>
          <h2>Key 存在不等於可用</h2>
          <p>Vercel CLI 可以列出 key，但 sensitive value 不能被 pull 回來驗值；仍要靠 live ready 與 redeploy 後的 gate 判斷。</p>
          <a className="button" href="#production-database-vercel">
            看命令
          </a>
        </article>
        <article className={`settings-command-card ${report.rootCause === "supabase_direct_network" ? "danger" : "ready"}`}>
          <span className="eyebrow">Supabase</span>
          <h2>改用 Transaction Pooler</h2>
          <p>Vercel/serverless 不應依賴 Supabase direct host；建議用 port 6543 pooler 並加上 Prisma pooler 參數。</p>
          <a className="button" href="#production-database-pooler">
            看安全形狀
          </a>
        </article>
        <article className="settings-command-card warning">
          <span className="eyebrow">Deploy</span>
          <h2>改 env 後要重部署</h2>
          <p>Production env 寫入後，不會自動修復既有 lambda runtime；必須 redeploy，再跑 health ready 與 pilot gate。</p>
          <a className="button" href="#production-database-commands">
            看必跑命令
          </a>
        </article>
      </section>

      <section className="grid">
        <section className="panel span-12 production-database-launch-checklist" aria-label="正式資料庫開跑核對單">
          <div className="section-heading">
            <div>
              <h2>開跑前核對單</h2>
              <p className="muted">照這條順序收斂 production database，所有證據都只能是 redacted 或 hash-only。</p>
            </div>
            <span className={`badge ${report.status === "ready" ? "done" : "danger"}`}>
              {report.launchChecklist.filter((item) => item.status === "done").length}/{report.launchChecklist.length}
            </span>
          </div>
          <ol className="production-database-checklist-flow">
            {report.launchChecklist.map((item, index) => (
              <li className={`production-database-checklist-item ${item.status}`} key={item.id}>
                <span className="production-database-checklist-index">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <span className="eyebrow">{checklistStatusLabel(item.status)}</span>
                  <h3>{item.title}</h3>
                  <p>{item.detail}</p>
                  <small>證據：{item.evidence}</small>
                  {item.command ? <code>{item.command}</code> : null}
                </div>
                <span className={`badge ${stepBadgeClass(item.status)}`}>
                  {stepStatusLabel(item.status)}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="panel span-12 production-database-cutover-board" aria-label="Vercel Production env cutover">
          <div className="section-heading">
            <div>
              <h2>Vercel Production env 切換預檢</h2>
              <p className="muted">
                從本地草稿、DATABASE_URL handoff、Vercel 寫入、重新部署到 live health，逐步確認；沒有 redeploy 與 health ready，就不能當作完成。
              </p>
            </div>
            <span className={`badge ${cutoverBadgeClass(report.vercelCutover.status)}`}>
              {cutoverStatusLabel(report.vercelCutover.status)}
            </span>
          </div>
          <div className={`production-database-cutover-focus ${cutoverTone(report.vercelCutover.status)}`}>
            <div>
              <span className="eyebrow">下一個不可跳過的命令</span>
              <strong>{report.vercelCutover.summary}</strong>
              <code>{report.vercelCutover.nextCommand}</code>
            </div>
            <a className="button primary" href="#production-database-commands">
              看命令區
            </a>
          </div>
          <ol className="production-database-checklist-flow">
            {report.vercelCutover.steps.map((step, index) => (
              <li className={`production-database-checklist-item ${step.status}`} key={step.id}>
                <span className="production-database-checklist-index">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <span className="eyebrow">{checklistStatusLabel(step.status)}</span>
                  <h3>{step.title}</h3>
                  <p>{step.detail}</p>
                  <small>證據：{step.evidence}</small>
                  {step.command ? <code>{step.command}</code> : null}
                </div>
                <span className={`badge ${stepBadgeClass(step.status)}`}>
                  {stepStatusLabel(step.status)}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section
          className={`panel span-12 production-database-gate ${report.status === "ready" ? "ready" : "danger"}`}
          id="production-database-diagnosis"
          aria-label="Production database diagnosis"
        >
          <div className="section-heading">
            <div>
              <h2>{report.status === "ready" ? "Production database 已可用" : "Production database 仍阻擋試用開跑"}</h2>
              <p className="muted">
                根因：{rootCauseLabel(report.rootCause)} · 產生時間 {formatDateTime(report.generatedAt)}
              </p>
            </div>
            <span className={`badge ${report.status === "ready" ? "done" : "danger"}`}>
              {rootCauseLabel(report.rootCause)}
            </span>
          </div>
          <ul className="task-list production-database-check-list">
            {report.gate.checks.map((check) => (
              <li className={`task production-database-task ${check.passed ? "done" : "danger"}`} key={check.name}>
                <span>
                  <strong>{gateCheckLabel(check.name)}</strong>
                  <small>{check.detail}</small>
                </span>
                <span className={`badge ${check.passed ? "done" : "danger"}`}>
                  {check.passed ? "通過" : "阻擋"}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-7">
          <div className="section-heading">
            <div>
              <h2>Runtime env 診斷</h2>
              <p className="muted">從目前執行此頁面的 server runtime 產生，只顯示連線形狀與失敗檢查。</p>
            </div>
            <span className={`badge ${report.envDraft?.status === "ready" ? "done" : "danger"}`}>
              {report.envDraft ? envDraftStatusLabel(report.envDraft.status) : "未附加"}
            </span>
          </div>
          {report.envDraft ? (
            <div className="production-database-diagnostic-grid" aria-label="Runtime env redacted 診斷">
              <article className={`production-database-mini-card ${report.envDraft.status === "ready" ? "ready" : "warning"}`}>
                <span className="badge">DB shape</span>
                <h3>{report.envDraft.databaseUrlShape}</h3>
                <p>{report.envDraft.source}</p>
                <ul className="task-list">
                  <li className="task">
                    <span>
                      <strong>連線姿態</strong>
                      <small>{databasePostureLabel(report.envDraft.databaseConnectionPosture)}</small>
                    </span>
                  </li>
                  <li className="task">
                    <span>
                      <strong>未替換 placeholder</strong>
                      <small>{report.envDraft.unresolvedPlaceholderKeys.length ? report.envDraft.unresolvedPlaceholderKeys.join(", ") : "無"}</small>
                    </span>
                  </li>
                  <li className="task">
                    <span>
                      <strong>失敗檢查</strong>
                      <small>{report.envDraft.failedCheckNames.length ? report.envDraft.failedCheckNames.join(", ") : "無"}</small>
                    </span>
                  </li>
                </ul>
              </article>
              <article className="production-database-mini-card">
                <span className="badge warning">下一步</span>
                <h3>修到這些項目歸零</h3>
                <ul className="task-list">
                  {report.envDraft.nextActions.map((action) => (
                    <li className="task" key={action}>
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          ) : (
            <EmptyState
              title="尚未附加 runtime env 診斷"
              body="若要檢查套用前的 env 草稿，請用 pnpm pilot:production-database 指定 --env-file 產生 redacted report。"
            />
          )}
        </section>

        <section className="panel span-5" id="production-database-vercel">
          <div className="section-heading">
            <div>
              <h2>Vercel env 現況</h2>
              <p className="muted">CLI 可確認 key inventory；sensitive value 會被 Vercel 保護，不可用 pull 驗明文。</p>
            </div>
            <span className="badge warning">secret-safe</span>
          </div>
          <ul className="task-list">
            <li className="task production-database-task warning">
              <span>
                <strong>Project</strong>
                <small>{projectId}</small>
              </span>
            </li>
            <li className="task production-database-task warning">
              <span>
                <strong>Team</strong>
                <small>{teamId}</small>
              </span>
            </li>
            <li className="task production-database-task warning">
              <span>
                <strong>Key inventory</strong>
                <small>{vercelEnvListCommand}</small>
              </span>
            </li>
            <li className="task production-database-task danger">
              <span>
                <strong>判斷準則</strong>
                <small>DATABASE_URL key 已存在仍不代表值正確；以 /api/health/ready 與 production gate 通過為準。</small>
              </span>
            </li>
          </ul>
        </section>

        <section className="panel span-12" id="production-database-pooler">
          <div className="section-heading">
            <div>
              <h2>Supabase Transaction Pooler 形狀</h2>
              <p className="muted">只列安全欄位，協助 Owner 在 Vercel Production 填入正確 server-only DATABASE_URL；密碼仍只從 Supabase Connect 或密碼管理器取得。</p>
            </div>
            <span className="badge done">不含密碼</span>
          </div>
          <div className="production-database-pooler-grid" aria-label="Supabase transaction pooler 安全形狀">
            <article className="production-database-mini-card ready">
              <span className="badge">Project</span>
              <h3>{report.supabasePooler.projectRef}</h3>
              <p>Region {report.supabasePooler.region}</p>
              <ul className="task-list">
                <li className="task">
                  <span>
                    <strong>Username</strong>
                    <small>{report.supabasePooler.username}</small>
                  </span>
                </li>
                <li className="task">
                  <span>
                    <strong>Host</strong>
                    <small>{report.supabasePooler.host}</small>
                  </span>
                </li>
                <li className="task">
                  <span>
                    <strong>Port / Database</strong>
                    <small>{report.supabasePooler.port} / {report.supabasePooler.database}</small>
                  </span>
                </li>
              </ul>
            </article>
            <article className="production-database-mini-card">
              <span className="badge warning">Prisma params</span>
              <h3>必要 query 參數</h3>
              <ul className="task-list">
                {report.supabasePooler.requiredQueryParams.map((param) => (
                  <li className="task" key={param}>
                    <span>{param}</span>
                  </li>
                ))}
                <li className="task">
                  <span>
                    <strong>Password source</strong>
                    <small>{report.supabasePooler.passwordSource}</small>
                  </span>
                </li>
              </ul>
            </article>
          </div>
        </section>

        <section className="panel span-12" id="production-database-fix">
          <div className="section-heading">
            <div>
              <h2>修復路線</h2>
              <p className="muted">選一條路線修正 Vercel Production env，修完後必須 redeploy，再跑 production gate。</p>
            </div>
          </div>
          <div className="production-database-track-grid" aria-label="正式環境資料庫修復路線">
            {report.tracks.map((track) => (
              <article className={`production-database-track ${track.recommended ? "ready" : "warning"}`} key={track.id}>
                <span className={`badge ${track.recommended ? "done" : "warning"}`}>
                  {track.recommended ? "建議" : "備選"}
                </span>
                <h3>{track.title}</h3>
                <p>{track.detail}</p>
                <ul className="task-list">
                  {track.steps.map((step) => (
                    <li className={`task production-database-task ${step.status === "done" ? "done" : step.status === "blocked" ? "danger" : "warning"}`} key={step.id}>
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

        <section className="panel span-7" id="production-database-commands">
          <div className="section-heading">
            <div>
              <h2>必跑命令</h2>
              <p className="muted">命令只接受 secret from stdin 或在 Vercel 端寫入；不要把完整 DATABASE_URL 貼到聊天或文件。</p>
            </div>
            <span className="badge">operator</span>
          </div>
          <ul className="task-list">
            <CommandTask title="Pooler handoff" command={poolerHandoffCommand} />
            <CommandTask title="更新本地 env 草稿" command={poolerDraftCommand} />
            <CommandTask title="寫入 Vercel Production env" command={vercelEnvApplyCommand} />
            <CommandTask title="重新部署 Production" command={productionDeployCommand} />
            <CommandTask title="Production health" command="curl -fsS https://hr.suiyuecare.com/api/health/ready" />
            <CommandTask title="Production pilot gate" command="pnpm pilot:gate:production -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com" />
            <CommandTask title="Full Go/No-Go" command="pnpm pilot:go-no-go -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --tenant-slug=<customer-slug>" />
          </ul>
        </section>

        <section className="panel span-5">
          <div className="section-heading">
            <div>
              <h2>隱私護欄</h2>
              <p className="muted">這個 Gate 本身也不能成為 secret 或員工資料外洩來源。</p>
            </div>
            <span className="badge done">redacted</span>
          </div>
          <ul className="task-list">
            {report.privacyGuardrails.map((guardrail) => (
              <li className="task production-database-task" key={guardrail}>
                <span>{guardrail}</span>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}

function SignalCard({
  detail,
  label,
  tone,
  value,
}: {
  detail: string;
  label: string;
  tone: "danger" | "done" | "warning";
  value: string;
}) {
  return (
    <article className={`hr-monthly-signal-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function CommandTask({ command, title }: { command: string; title: string }) {
  return (
    <li className="task production-database-task warning">
      <span>
        <strong>{title}</strong>
        <small>{command}</small>
      </span>
    </li>
  );
}

function buildDatabaseFocus(report: ProductionDatabaseRemediationReport) {
  if (report.status === "ready") {
    return {
      action: "前往 Go/No-Go",
      copy: "Production database gate 已通過，可以進入真實 tenant 匯入、邀請 readiness 與完整 Go/No-Go。",
      href: "/settings/pilot-go-no-go",
      meta: "Health ready 已通過，仍需保存 redacted evidence。",
      title: "正式資料庫已可用",
      tone: "ready",
    } as const;
  }
  if (report.rootCause === "supabase_direct_network") {
    return {
      action: "看 Pooler 形狀",
      copy: "目前正式站仍使用 Supabase direct host 或等效連線，Vercel/serverless 需要 transaction pooler 或 IPv4 add-on。",
      href: "#production-database-pooler",
      meta: "建議路線：transaction pooler + pgbouncer=true + connection_limit=1 + schema=hr_one。",
      title: "先修 DATABASE_URL",
      tone: "danger",
    } as const;
  }
  if (report.rootCause === "environment_configuration") {
    return {
      action: "看 env 診斷",
      copy: "Production env 尚未通過完整檢查，需補齊 DB、OIDC、vault/KMS、備份或 rate limit 設定。",
      href: "#production-database-diagnosis",
      meta: report.environmentDetail,
      title: "Production env 未完成",
      tone: "warning",
    } as const;
  }
  return {
    action: "看修復路線",
    copy: "先依 live health、runtime env 診斷與 Vercel runtime logs 定位，再套用修復路線。",
    href: "#production-database-fix",
    meta: `Root cause: ${rootCauseLabel(report.rootCause)}`,
    title: "Gate 還沒放行",
    tone: "warning",
  } as const;
}

function checkPassed(report: ProductionDatabaseRemediationReport, name: string) {
  return Boolean(report.gate.checks.find((check) => check.name === name)?.passed);
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
  return "done";
}

function envDraftStatusLabel(status: ProductionDatabaseEnvDraftReport["status"]) {
  if (status === "ready") return "READY";
  if (status === "blocked") return "BLOCK";
  if (status === "missing") return "缺檔";
  return "略過";
}

function databasePostureLabel(posture: ProductionDatabaseEnvDraftReport["databaseConnectionPosture"]) {
  const labels: Record<ProductionDatabaseEnvDraftReport["databaseConnectionPosture"], string> = {
    "supabase-direct": "Supabase direct host",
    "supabase-pooler-session": "Supabase session pooler",
    "supabase-pooler-transaction": "Supabase transaction pooler",
    "supabase-pooler-unknown": "Supabase pooler port 待確認",
    other: "其他 PostgreSQL URL",
    invalid: "缺少或無效",
    not_checked: "未檢查",
  };
  return labels[posture];
}

function cutoverStatusLabel(status: ProductionDatabaseRemediationReport["vercelCutover"]["status"]) {
  const labels: Record<ProductionDatabaseRemediationReport["vercelCutover"]["status"], string> = {
    waiting_for_env: "待補 env",
    ready_to_apply: "可寫入",
    waiting_for_redeploy: "待重部署",
    verified: "已驗證",
  };
  return labels[status];
}

function cutoverBadgeClass(status: ProductionDatabaseRemediationReport["vercelCutover"]["status"]) {
  if (status === "verified") return "done";
  if (status === "waiting_for_env") return "danger";
  return "warning";
}

function cutoverTone(status: ProductionDatabaseRemediationReport["vercelCutover"]["status"]) {
  if (status === "verified") return "done";
  if (status === "waiting_for_env") return "danger";
  return "warning";
}

function checklistStatusLabel(status: ProductionDatabaseRemediationStep["status"]) {
  if (status === "done") return "已完成";
  if (status === "blocked") return "目前阻擋";
  return "下一步";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Taipei",
  }).format(new Date(value));
}
