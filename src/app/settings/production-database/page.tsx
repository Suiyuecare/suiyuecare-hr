import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { getAuditEvidenceWorkspace } from "@/server/audit/evidence-packages";
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
const privateSchemaVerifyCommand =
  "pnpm db:supabase:verify-schema -- --project-ref=aruncclorusswpfnpgsn --schema=hr_one --allow-tenant-data";

type SearchParams = Promise<{
  error?: string;
  success?: string;
}>;

export default async function ProductionDatabasePage({ searchParams }: { searchParams: SearchParams }) {
  const [params, session] = await Promise.all([searchParams, getDemoSession()]);
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

  const [report, auditEvidence] = await Promise.all([
    getProductionDatabaseRemediationReport({
      appUrl: "https://hr.suiyuecare.com",
      expectedHost: "hr.suiyuecare.com",
    }),
    getAuditEvidenceWorkspace(session),
  ]);
  const latestEvidence = auditEvidence.latestProductionDatabase;
  const focus = buildDatabaseFocus(report);
  const databaseReady = checkPassed(report, "production database");
  const environmentReady = checkPassed(report, "production environment");
  const overallReady = checkPassed(report, "overall readiness");
  const demoAuthOff = checkPassed(report, "demo auth disabled");
  const privateSchemaReady = report.privateSchema.status === "ready";
  const vercelInventoryReady = report.vercelEnvInventory.status === "ready";

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
            <Link className="button" href="#production-database-private-schema">
              RLS Gate
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

      {params.error ? (
        <div className="panel danger-panel">
          <strong>無法保存正式資料庫證據</strong>
          <p>{params.error}</p>
        </div>
      ) : null}
      {params.success === "production-database-evidence" ? (
        <div className="panel success-panel">
          <strong>正式資料庫 Gate 證據已保存</strong>
          <p>只保存彙總、warning、hash 與 audit log；沒有保存完整 DATABASE_URL、密碼、員工資料、薪資、銀行、身分證或健康資料。</p>
        </div>
      ) : null}

      <section className="hr-monthly-signal-board production-database-signal-board" aria-label="正式資料庫訊號板">
        <SignalCard label="Live readiness" value={overallReady ? "OK" : "FAIL"} detail={report.readinessUrl} tone={overallReady ? "done" : "danger"} />
        <SignalCard label="Production env" value={environmentReady ? "OK" : "FAIL"} detail={report.environmentDetail} tone={environmentReady ? "done" : "danger"} />
        <SignalCard label="Database ping" value={databaseReady ? "OK" : "FAIL"} detail={report.databaseDetail} tone={databaseReady ? "done" : "danger"} />
        <SignalCard label="Private schema / RLS" value={privateSchemaReady ? "OK" : "CHECK"} detail={report.privateSchema.summary} tone={privateSchemaTone(report.privateSchema.status)} />
        <SignalCard label="Vercel env inventory" value={vercelInventoryReady ? "OK" : "CHECK"} detail={report.vercelEnvInventory.summary} tone={vercelInventorySignalTone(report.vercelEnvInventory.status)} />
        <SignalCard label="Demo auth" value={demoAuthOff ? "OFF" : "RISK"} detail="正式 runtime 不可開 demo auth" tone={demoAuthOff ? "done" : "danger"} />
      </section>

      <section className="grid" aria-label="正式資料庫證據封存">
        <section className="panel span-7 production-database-evidence-panel" id="production-database-evidence">
          <div className="section-heading">
            <div>
              <h2>上線證據封存</h2>
              <p className="muted">把 live readiness、Vercel cutover、private schema/RLS verifier 結果收成 hash-only evidence package。</p>
            </div>
            <span className={`badge ${latestEvidence ? "done" : "warning"}`}>
              {latestEvidence ? "已有證據" : "待保存"}
            </span>
          </div>
          {latestEvidence ? (
            <div className="production-database-diagnostic-grid">
              <article className={`production-database-mini-card ${latestEvidence.warnings.length ? "warning" : "ready"}`}>
                <span className="badge">latest evidence</span>
                <h3>{formatDateTime(latestEvidence.generatedAt.toISOString())}</h3>
                <p>content hash：{latestEvidence.contentHash}</p>
                <ul className="task-list">
                  <li className="task">
                    <span>
                      <strong>Record count</strong>
                      <small>{latestEvidence.recordCount}</small>
                    </span>
                  </li>
                  <li className="task">
                    <span>
                      <strong>Warnings</strong>
                      <small>{latestEvidence.warnings.length ? latestEvidence.warnings.join(" · ") : "無"}</small>
                    </span>
                  </li>
                  <li className="task">
                    <span>
                      <strong>Covered evidence</strong>
                      <small>{latestEvidence.coveredEntityTypes.join("、")}</small>
                    </span>
                  </li>
                </ul>
              </article>
            </div>
          ) : (
            <EmptyState
              title="尚未保存正式資料庫 Gate 證據"
              body="通過或阻擋狀態都可以先保存；Owner/HR 會看到目前阻擋點、hash 與 audit log，而不是靠截圖追蹤。"
            />
          )}
        </section>

        <section className="panel span-5">
          <div className="section-heading">
            <div>
              <h2>保存目前 Gate</h2>
              <p className="muted">可貼上 `verify-schema --json` 輸出；系統只保存解析後的 counts/check names/hash。</p>
            </div>
            <span className="badge warning">hash-only</span>
          </div>
          <form action="/api/settings/production-database/evidence" method="post" className="mini-form">
            <input name="schemaName" type="hidden" value="hr_one" />
            <label>
              Private schema verifier JSON
              <textarea
                name="privateSchemaJson"
                placeholder='貼上 pnpm db:supabase:verify-schema --json 的輸出；留空則保存「尚未驗證」狀態。'
                rows={7}
              />
            </label>
            <label className="checkbox-row">
              <input name="allowTenantData" type="checkbox" defaultChecked />
              正式 tenant 已匯入，允許 verifier 接受 tenant/company/employee 聚合筆數
            </label>
            <button className="button primary" type="submit">
              保存 Gate 證據
            </button>
          </form>
        </section>
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
        <article className={`settings-command-card ${privateSchemaReady ? "ready" : "warning"}`}>
          <span className="eyebrow">Private schema</span>
          <h2>RLS / grant 也要通過</h2>
          <p>DB ping 成功只是第一步；正式資料表必須在 hr_one private schema，且 browser roles 不可直接讀寫 HR 資料。</p>
          <a className="button" href="#production-database-private-schema">
            看 RLS Gate
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

        <section className="panel span-12 production-database-env-repair" aria-label="Production env 修復矩陣">
          <div className="section-heading">
            <div>
              <h2>Production env 修復矩陣</h2>
              <p className="muted">
                把 production verifier 失敗項整理成 Owner/工程可處理的群組；只列 key 名稱、負責人、下一步與證據，不回顯任何 secret value。
              </p>
            </div>
            <span className={`badge ${report.envRepairPlan.some((group) => group.status === "blocked") ? "danger" : "done"}`}>
              {report.envRepairPlan.filter((group) => group.status === "ready").length}/{report.envRepairPlan.length}
            </span>
          </div>
          <div className="production-database-track-grid">
            {report.envRepairPlan.map((group) => (
              <article className={`production-database-track ${envRepairTone(group.status)}`} key={group.id}>
                <span className={`badge ${envRepairBadgeClass(group.status)}`}>
                  {envRepairStatusLabel(group.status)}
                </span>
                <h3>{group.title}</h3>
                <p>{group.detail}</p>
                <ul className="task-list">
                  <li className="task production-database-task">
                    <span>
                      <strong>負責人</strong>
                      <small>{group.owner}</small>
                    </span>
                  </li>
                  <li className="task production-database-task">
                    <span>
                      <strong>Failed checks</strong>
                      <small>{group.failedCheckNames.length ? group.failedCheckNames.join(", ") : "無"}</small>
                    </span>
                  </li>
                  <li className="task production-database-task">
                    <span>
                      <strong>Env keys</strong>
                      <small>{group.affectedEnvKeys.join(", ")}</small>
                    </span>
                  </li>
                  <li className="task production-database-task">
                    <span>
                      <strong>下一步</strong>
                      <small>{group.nextStep}</small>
                    </span>
                  </li>
                  <li className="task production-database-task">
                    <span>
                      <strong>證據</strong>
                      <small>{group.evidence}</small>
                    </span>
                  </li>
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="panel span-12 production-database-env-inventory" aria-label="Vercel Production env key inventory">
          <div className="section-heading">
            <div>
              <h2>Vercel Production env key inventory</h2>
              <p className="muted">
                只讀取 key metadata，確認必要 key 是否在 production target、是否使用 secret-safe type；不讀、不保存、不顯示 env value。
              </p>
            </div>
            <span className={`badge ${vercelInventoryBadgeClass(report.vercelEnvInventory.status)}`}>
              {vercelInventoryStatusLabel(report.vercelEnvInventory.status)}
            </span>
          </div>
          <div className={`production-database-cutover-focus ${vercelInventoryTone(report.vercelEnvInventory.status)}`}>
            <div>
              <span className="eyebrow">只讀 inventory 命令</span>
              <strong>{report.vercelEnvInventory.summary}</strong>
              <code>{report.vercelEnvInventory.command}</code>
            </div>
            <a className="button primary" href="#production-database-commands">
              看完整命令
            </a>
          </div>
          <div className="production-database-diagnostic-grid" aria-label="Vercel env inventory 摘要">
            <article className={`production-database-mini-card ${vercelInventoryTone(report.vercelEnvInventory.status)}`}>
              <span className="badge">Required keys</span>
              <h3>{report.vercelEnvInventory.presentRequiredCount}/{report.vercelEnvInventory.requiredKeyCount}</h3>
              <ul className="task-list">
                <li className="task">
                  <span>
                    <strong>Inspected keys</strong>
                    <small>{report.vercelEnvInventory.totalKeyCount} total · {report.vercelEnvInventory.productionKeyCount} production</small>
                  </span>
                </li>
                <li className="task">
                  <span>
                    <strong>Missing</strong>
                    <small>{report.vercelEnvInventory.missingKeys.length ? report.vercelEnvInventory.missingKeys.join(", ") : "無"}</small>
                  </span>
                </li>
                <li className="task">
                  <span>
                    <strong>Wrong target / unsafe type</strong>
                    <small>
                      {report.vercelEnvInventory.wrongTargetKeys.length + report.vercelEnvInventory.unsafeTypeKeys.length
                        ? [...report.vercelEnvInventory.wrongTargetKeys, ...report.vercelEnvInventory.unsafeTypeKeys].join(", ")
                        : "無"}
                    </small>
                  </span>
                </li>
              </ul>
            </article>
            <article className="production-database-mini-card warning">
              <span className="badge warning">證據限制</span>
              <h3>Key 存在仍不等於值可用</h3>
              <p>inventory 只能證明 key 名稱、target 與 type；DATABASE_URL 是否是 pooler、密碼是否正確，仍以 redeploy 後 live health ready 為準。</p>
            </article>
          </div>
          <div className="production-database-track-grid">
            {report.vercelEnvInventory.groups.map((group) => (
              <article className={`production-database-track ${vercelInventoryTone(group.status)}`} key={group.id}>
                <span className={`badge ${vercelInventoryBadgeClass(group.status)}`}>
                  {vercelInventoryStatusLabel(group.status)}
                </span>
                <h3>{group.title}</h3>
                <p>{group.nextStep}</p>
                <ul className="task-list">
                  <li className="task production-database-task">
                    <span>
                      <strong>負責人</strong>
                      <small>{group.owner}</small>
                    </span>
                  </li>
                  <li className="task production-database-task">
                    <span>
                      <strong>Required keys</strong>
                      <small>{group.presentCount}/{group.requiredCount}</small>
                    </span>
                  </li>
                  <li className="task production-database-task">
                    <span>
                      <strong>Missing</strong>
                      <small>{group.missingKeys.length ? group.missingKeys.join(", ") : "無"}</small>
                    </span>
                  </li>
                  <li className="task production-database-task">
                    <span>
                      <strong>Wrong target / unsafe</strong>
                      <small>
                        {group.wrongTargetKeys.length + group.unsafeTypeKeys.length
                          ? [...group.wrongTargetKeys, ...group.unsafeTypeKeys].join(", ")
                          : "無"}
                      </small>
                    </span>
                  </li>
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section
          className={`panel span-12 production-database-gate ${privateSchemaReady ? "ready" : "danger"}`}
          id="production-database-private-schema"
          aria-label="Supabase private schema and RLS gate"
        >
          <div className="section-heading">
            <div>
              <h2>Supabase private schema / RLS Gate</h2>
              <p className="muted">
                這裡檢查 hr_one private schema、RLS、anon/authenticated grants、public shadow table 與 security definer RPC exposure；DB 連線成功但這裡未過，仍不能開真實試用。
              </p>
            </div>
            <span className={`badge ${privateSchemaReady ? "done" : "danger"}`}>
              {privateSchemaStatusLabel(report.privateSchema.status)}
            </span>
          </div>
          <div className="production-database-diagnostic-grid" aria-label="Supabase private schema 診斷摘要">
            <article className={`production-database-mini-card ${privateSchemaReady ? "ready" : "warning"}`}>
              <span className="badge">Schema</span>
              <h3>{report.privateSchema.schemaName}</h3>
              <p>{report.privateSchema.summary}</p>
              <ul className="task-list">
                <li className="task">
                  <span>
                    <strong>資料表 / enum</strong>
                    <small>{metricLabel(report.privateSchema.metrics.tableCount)} / {metricLabel(report.privateSchema.metrics.enumTypeCount)}</small>
                  </span>
                </li>
                <li className="task">
                  <span>
                    <strong>Migration baseline</strong>
                    <small>{metricLabel(report.privateSchema.metrics.prismaMigrationCount)}</small>
                  </span>
                </li>
                <li className="task">
                  <span>
                    <strong>正式 tenant 資料</strong>
                    <small>
                      {metricLabel(report.privateSchema.metrics.tenantCount)} tenant · {metricLabel(report.privateSchema.metrics.companyCount)} company · {metricLabel(report.privateSchema.metrics.employeeCount)} employee
                    </small>
                  </span>
                </li>
              </ul>
            </article>
            <article className={`production-database-mini-card ${privateSchemaReady ? "ready" : "warning"}`}>
              <span className="badge warning">RLS / Exposure</span>
              <h3>瀏覽器角色不可直通 HR 表</h3>
              <ul className="task-list">
                <li className="task">
                  <span>
                    <strong>RLS enabled / disabled</strong>
                    <small>{metricLabel(report.privateSchema.metrics.rlsEnabledTableCount)} / {metricLabel(report.privateSchema.metrics.rlsDisabledTableCount)}</small>
                  </span>
                </li>
                <li className="task">
                  <span>
                    <strong>anon/auth table grants</strong>
                    <small>{metricLabel(report.privateSchema.metrics.exposedTablePrivilegeCount)}</small>
                  </span>
                </li>
                <li className="task">
                  <span>
                    <strong>public shadow / RPC exposure</strong>
                    <small>
                      {metricLabel(report.privateSchema.metrics.publicSchemaShadowTableCount)} / {metricLabel(report.privateSchema.metrics.publicSecurityDefinerExecuteCount)}
                    </small>
                  </span>
                </li>
                <li className="task">
                  <span>
                    <strong>anon/auth schema usage</strong>
                    <small>{booleanMetricLabel(report.privateSchema.metrics.anonUsage)} / {booleanMetricLabel(report.privateSchema.metrics.authenticatedUsage)}</small>
                  </span>
                </li>
              </ul>
            </article>
          </div>
          {report.privateSchema.checks.length ? (
            <ul className="task-list production-database-check-list">
              {report.privateSchema.checks.map((check) => (
                <li className={`task production-database-task ${check.passed ? "done" : "danger"}`} key={check.name}>
                  <span>
                    <strong>{privateSchemaCheckLabel(check.name)}</strong>
                    <small>{check.detail}</small>
                  </span>
                  <span className={`badge ${check.passed ? "done" : "danger"}`}>
                    {check.passed ? "通過" : "阻擋"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="production-database-cutover-focus warning">
              <div>
                <span className="eyebrow">尚未取得 verifier 結果</span>
                <strong>請先執行 RLS / grant verifier</strong>
                <code>{report.privateSchema.command}</code>
              </div>
              <a className="button primary" href="#production-database-commands">
                看命令區
              </a>
            </div>
          )}
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
            <CommandTask title="Vercel env inventory" command="pnpm vercel:inventory:production -- --team-id=team_LGag47eU8tKbsK6ixAmVa5Uq --output=/tmp/hr-one-vercel-production-env-inventory.md" />
            <CommandTask title="寫入 Vercel Production env" command={vercelEnvApplyCommand} />
            <CommandTask title="重新部署 Production" command={productionDeployCommand} />
            <CommandTask title="Production health" command="curl -fsS https://hr.suiyuecare.com/api/health/ready" />
            <CommandTask title="Supabase private schema / RLS verifier" command={privateSchemaVerifyCommand} />
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
  if (report.rootCause === "private_schema_unverified" || report.rootCause === "private_schema_security") {
    return {
      action: "看 RLS Gate",
      copy: "正式站連線已接近可用，但 Supabase private schema、RLS、browser role grants 或 public exposure 還沒有通過證據。",
      href: "#production-database-private-schema",
      meta: report.privateSchema.summary,
      title: "補齊 private schema Gate",
      tone: "danger",
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
    private_schema_unverified: "RLS 未驗證",
    private_schema_security: "RLS 安全阻擋",
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

function envRepairStatusLabel(status: ProductionDatabaseRemediationReport["envRepairPlan"][number]["status"]) {
  if (status === "ready") return "已就緒";
  if (status === "blocked") return "阻擋";
  return "未檢查";
}

function envRepairBadgeClass(status: ProductionDatabaseRemediationReport["envRepairPlan"][number]["status"]) {
  if (status === "ready") return "done";
  if (status === "blocked") return "danger";
  return "warning";
}

function envRepairTone(status: ProductionDatabaseRemediationReport["envRepairPlan"][number]["status"]) {
  if (status === "ready") return "ready";
  if (status === "blocked") return "danger";
  return "warning";
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

function privateSchemaStatusLabel(status: ProductionDatabaseRemediationReport["privateSchema"]["status"]) {
  if (status === "ready") return "RLS 已通過";
  if (status === "blocked") return "RLS 阻擋";
  return "尚未驗證";
}

function privateSchemaTone(status: ProductionDatabaseRemediationReport["privateSchema"]["status"]) {
  if (status === "ready") return "done";
  if (status === "blocked") return "danger";
  return "warning";
}

function vercelInventoryStatusLabel(status: ProductionDatabaseRemediationReport["vercelEnvInventory"]["status"]) {
  if (status === "ready") return "Inventory OK";
  if (status === "blocked") return "Inventory 阻擋";
  return "尚未檢查";
}

function vercelInventoryBadgeClass(status: ProductionDatabaseRemediationReport["vercelEnvInventory"]["status"]) {
  if (status === "ready") return "done";
  if (status === "blocked") return "danger";
  return "warning";
}

function vercelInventoryTone(status: ProductionDatabaseRemediationReport["vercelEnvInventory"]["status"]) {
  if (status === "ready") return "ready";
  if (status === "blocked") return "danger";
  return "warning";
}

function vercelInventorySignalTone(status: ProductionDatabaseRemediationReport["vercelEnvInventory"]["status"]) {
  if (status === "ready") return "done";
  if (status === "blocked") return "danger";
  return "warning";
}

function privateSchemaCheckLabel(name: string) {
  const labels: Record<string, string> = {
    "HR One table count": "HR One 資料表數",
    "HR One enum count": "HR One enum 數",
    "Prisma migration baseline": "Prisma migration baseline",
    "Supabase private schema RLS defense": "Private schema RLS",
    "Supabase public schema shadow tables": "Public shadow tables",
    "Supabase browser role schema usage": "Browser role schema usage",
    "Supabase browser table grants": "Browser table grants",
    "Supabase private security-definer exposure": "Private security-definer exposure",
    "Supabase public security-definer RPC exposure": "Public security-definer RPC exposure",
    "Tenant data allowed": "正式 tenant seed",
    "Tenant data not accidentally seeded": "未誤植 tenant seed",
  };
  return labels[name] ?? name;
}

function metricLabel(value: number | null) {
  return value === null ? "未檢查" : String(value);
}

function booleanMetricLabel(value: boolean | null) {
  if (value === null) return "未檢查";
  return value ? "允許" : "阻擋";
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
