import Link from "next/link";
import { getDemoSession } from "@/server/auth/session";
import { getTaiwanLaborRuleCenter } from "@/server/rules/settings";

type SearchParams = Promise<{
  error?: string;
  success?: string;
}>;

export default async function LawRulesSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getDemoSession();
  const center = await getTaiwanLaborRuleCenter(session);
  const config = center.config;
  const needsAttention = center.readiness.blockers.length + center.readiness.warnings.length;

  return (
    <main className="page console-page">
      <section className="console-hero">
        <div>
          <span className="muted">台灣法規規則中心</span>
          <h1>勞基法與薪資規則</h1>
          <p>所有薪資、假勤、加班與離職檢查都使用版本化規則；HR 可調整設定，但每次變更都要留下來源、審核與 audit log。</p>
        </div>
        <div className="console-hero-actions">
          <Link className="button" href="/settings#law-rules-setup">
            完整設定表
          </Link>
          <Link className="button primary" href="/hr">
            月結工作台
          </Link>
        </div>
      </section>

      <section className="grid">
        {params.error ? (
          <div className="panel span-12 risk-box danger-box">
            <strong>無法更新法規規則</strong>
            <p>{params.error}</p>
          </div>
        ) : null}
        {params.success ? (
          <div className="panel span-12 success-box">
            <strong>法規規則已更新</strong>
            <p className="muted">系統已建立新版本、執行規則測試，並保留變更稽核紀錄。</p>
          </div>
        ) : null}

        <section className={`panel span-12 finance-strip ${center.readiness.status}`} aria-label="法規規則狀態">
          <div>
            <span className="muted">目前狀態</span>
            <strong>{center.readiness.label}</strong>
          </div>
          <div>
            <span className="muted">啟用版本</span>
            <strong>{config.version}</strong>
          </div>
          <div className="finance-strip-meta">
            <span className={`badge ${center.readiness.status === "ready" ? "" : "warning"}`}>
              {needsAttention} 項待處理
            </span>
            <span className="badge">{config.changeControl.reviewStatus === "approved" ? "已審核" : "待審核"}</span>
          </div>
        </section>

        <div className="panel span-3 metric">
          <span className="muted">最低月薪</span>
          <strong>{formatMoney(config.minimumMonthlyWage)}</strong>
          <span className="badge">2026 基準</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">最低時薪</span>
          <strong>{formatMoney(config.minimumHourlyWage)}</strong>
          <span className="badge">最低工資</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">單日工時上限</span>
          <strong>{config.maxDailyWorkMinutesIncludingOvertime / 60} 小時</strong>
          <span className="badge">含加班</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">月加班上限</span>
          <strong>{config.maxMonthlyOvertimeMinutes / 60} 小時</strong>
          <span className="badge">一般情境</span>
        </div>

        <section className="panel span-8" id="source-review">
          <div className="section-heading">
            <div>
              <h2>官方來源檢查</h2>
              <p className="muted">
                來源必須定期檢查；超過 {center.sourceFreshness.maxAgeDays} 天或日期格式錯誤時，薪資與假勤規則會被標示為需審核。
              </p>
            </div>
            <span className={`badge ${center.sourceFreshness.passed ? "" : "warning"}`}>
              {center.sourceFreshness.freshSourceCount}/{center.sourceFreshness.totalSourceCount} 有效
            </span>
          </div>
          <ul className="task-list">
            {config.sources.map((source) => {
              const stale = center.sourceFreshness.staleSourceIds.includes(source.id);
              const invalid = center.sourceFreshness.invalidSourceIds.includes(source.id);
              return (
                <li className="task" key={source.id}>
                  <span>
                    <strong>{source.title}</strong>
                    <small>{source.id} · {source.url}</small>
                  </span>
                  <span className="inline-actions">
                    <span className={`badge ${stale || invalid ? "warning" : ""}`}>
                      {invalid ? "日期錯誤" : stale ? "需複核" : "有效"}
                    </span>
                    <span className="badge">{source.checkedAt}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="panel span-4">
          <div className="section-heading">
            <div>
              <h2>下一步</h2>
              <p className="muted">阻擋與警示會影響月結、薪資鎖定與正式上線 Gate。</p>
            </div>
          </div>
          {center.readiness.nextActions.length ? (
            <ul className="task-list">
              {center.readiness.nextActions.map((action) => (
                <li className="task" key={action}>
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="panel-subtle success-box">
              <strong>目前沒有待處理事項</strong>
              <p className="muted">規則測試、來源檢查與審核狀態都可用於下一次薪資試算。</p>
            </div>
          )}
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>來源更新精靈</h2>
              <p className="muted">只更新官方來源與審核狀態，不需要工程師改程式；原有薪資與假勤參數會沿用目前版本。</p>
            </div>
            <span className="badge">會建立新版本</span>
          </div>
          <form action="/api/settings/law-rules" method="post" className="wizard-form">
            <input type="hidden" name="returnTo" value="/settings/law-rules?success=law-rules#source-review" />
            <div className="field-grid">
              <label>
                變更原因
                <textarea name="changeReason" rows={3} defaultValue={config.changeControl.reason} required />
              </label>
              <label>
                來源 URL
                <input
                  name="changeSourceUrl"
                  type="url"
                  defaultValue={config.changeControl.sourceUrl ?? ""}
                  placeholder="https://laws.mol.gov.tw/..."
                />
              </label>
              <label>
                審核人
                <input name="reviewedBy" defaultValue={config.changeControl.reviewedBy ?? ""} />
              </label>
              <label>
                審核狀態
                <select name="reviewStatus" defaultValue={config.changeControl.reviewStatus}>
                  <option value="pending_legal_review">待法務或 HR 負責人審核</option>
                  <option value="approved">已核准</option>
                </select>
              </label>
            </div>
            <label className="check-row">
              <input
                name="requiresPayrollRecalculation"
                type="checkbox"
                defaultChecked={config.changeControl.requiresPayrollRecalculation}
              />
              標記既有薪資草稿需重新試算
            </label>
            <label>
              官方來源清單
              <textarea name="legalSourcesCsv" rows={12} defaultValue={formatLegalSourcesCsv(config.sources)} />
            </label>
            <p className="muted">格式：id,title,url,checkedAt。checkedAt 使用 YYYY-MM-DD；不可貼上員工姓名、薪資、身分證字號或銀行帳號。</p>
            <button className="button primary" type="submit">
              儲存並建立新版本
            </button>
          </form>
        </section>

        <section className="panel span-7">
          <div className="section-heading">
            <div>
              <h2>版本歷史</h2>
              <p className="muted">每次規則變更都會產生 rule_versions，可回溯來源、審核與是否需要重算薪資。</p>
            </div>
          </div>
          <ul className="task-list">
            {center.versionHistory.map((version) => (
              <li className="task" key={version.id}>
                <span>
                  <strong>{version.version}</strong>
                  <small>
                    {formatDateTime(version.createdAt)} · {version.reviewedBy ?? "未填審核人"} · {version.sourceCount} 個來源
                  </small>
                </span>
                <span className="inline-actions">
                  <span className={`badge ${version.status === "active" ? "" : "warning"}`}>{version.status}</span>
                  <span className={`badge ${version.validationPassed ? "" : "danger"}`}>
                    {version.validationPassed ? "測試通過" : "待驗證"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-5">
          <div className="section-heading">
            <div>
              <h2>可調設定範圍</h2>
              <p className="muted">複雜表格仍在完整設定表維護；這裡先呈現 HR 最常確認的類別。</p>
            </div>
          </div>
          <ul className="task-list">
            <li className="task">
              <span>
                <strong>加班與休息日</strong>
                <small>第 24、32、36 條：加班倍率、單日與月度上限、勞資會議上限。</small>
              </span>
            </li>
            <li className="task">
              <span>
                <strong>特休與未休工資</strong>
                <small>第 38、39 條與施行細則：特休級距、未休結算與假日工資。</small>
              </span>
            </li>
            <li className="task">
              <span>
                <strong>薪資法定扣繳</strong>
                <small>勞保、健保、勞退、所得稅級距與申報包對應。</small>
              </span>
            </li>
            <li className="task">
              <span>
                <strong>離職與資遣檢查</strong>
                <small>預告期、資遣費倍率、舊制與新制差異都保留人工審核。</small>
              </span>
            </li>
          </ul>
        </section>
      </section>
    </main>
  );
}

function formatLegalSourcesCsv(
  sources: Array<{ id: string; title: string; url: string; checkedAt: string }>,
) {
  return sources
    .map((source) => [
      source.id,
      source.title,
      source.url,
      source.checkedAt,
    ].map(escapeCsvCell).join(","))
    .join("\n");
}

function escapeCsvCell(value: string) {
  return /[",\n]/.test(value) ? `"${value.replaceAll("\"", "\"\"")}"` : value;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Taipei",
  }).format(date);
}
