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
  const ruleFocus = buildRuleFocus(center);
  const ruleSignals = buildRuleSignals(center);
  const governanceCards = buildRuleGovernanceCards(center);
  const coverageSummary = center.complianceCoverageSummary;
  const launchGate = center.launchGate;

  return (
    <main className="page law-rules-page">
      <section className="law-rules-hero" aria-label="台灣法規規則控制台">
        <div className="law-rules-hero-main">
          <div className="law-rules-hero-topline">
            <span className="muted">台灣法規規則中心</span>
            <span className={`badge ${center.readiness.status === "ready" ? "" : "warning"}`}>
              {needsAttention} 項待處理
            </span>
          </div>
          <h1>勞基法與薪資規則</h1>
          <p>所有薪資、假勤、加班與離職檢查都使用版本化規則；人資可調整設定，但每次變更都要留下來源、審核與稽核紀錄。</p>
          <div className="law-rules-hero-actions">
            <Link className="button primary" href="#source-review">
              檢查官方來源
            </Link>
            <Link className="button" href="/settings#law-rules-setup">
              完整設定表
            </Link>
            <Link className="button" href="/hr">
              月結工作台
            </Link>
          </div>
        </div>

        <aside className={`law-rules-focus ${ruleFocus.tone}`}>
          <span className="muted">今日先處理</span>
          <strong>{ruleFocus.title}</strong>
          <p>{ruleFocus.detail}</p>
          <Link className="button primary" href={ruleFocus.href}>
            {ruleFocus.label}
          </Link>
        </aside>
      </section>

      <section className="law-rule-signal-board" aria-label="法規規則訊號板">
        {ruleSignals.map((signal) => (
          <Link className={`law-rule-signal-card ${signal.tone}`} href={signal.href} key={signal.id}>
            <span>{signal.label}</span>
            <strong>{signal.value}</strong>
            <small>{signal.detail}</small>
          </Link>
        ))}
      </section>

      <section className="law-rule-launch-gate" aria-label="台灣法遵上線 Gate">
        <div className={`law-rule-launch-copy ${toneFromReadiness(launchGate.status)}`}>
          <span>台灣法遵上線 Gate</span>
          <strong>{launchGate.headline}</strong>
          <small>
            {launchGate.readyCount}/{launchGate.totalCount} 步完成；{launchGate.blockedCount} 個阻擋、{launchGate.needsReviewCount} 個需複核。
            {launchGate.nextAction}
          </small>
        </div>
        {launchGate.steps.map((step) => (
          <article className={`law-rule-launch-step ${coverageTone(step.status)}`} key={step.id}>
            <div className="law-rule-launch-step-top">
              <span>{step.step} · {step.owner}</span>
              <span className={`badge ${step.status === "covered" ? "done" : step.status === "blocked" ? "danger" : "warning"}`}>
                {coverageStatusLabel(step.status)}
              </span>
            </div>
            <h2>{step.title}</h2>
            <p>{step.detail}</p>
            <small>{step.metric}</small>
            <small>證據：{step.evidence}</small>
            <Link className="button" href={step.actionHref}>
              {step.actionLabel}
            </Link>
          </article>
        ))}
      </section>

      <section className="law-rule-governance-grid" aria-label="法規治理作業區">
        {governanceCards.map((card) => (
          <article className={`law-rule-governance-card ${card.tone}`} key={card.id}>
            <div>
              <span className="muted">{card.area}</span>
              <h2>{card.title}</h2>
            </div>
            <span className={`badge ${card.tone === "warning" ? "warning" : card.tone === "danger" ? "danger" : ""}`}>
              {card.status}
            </span>
            <p>{card.summary}</p>
            <Link className="button primary" href={card.primary.href}>
              {card.primary.label}
            </Link>
          </article>
        ))}
      </section>

      <section className="panel span-12 law-rule-impact-panel" id="rule-impact" aria-label="法規異動影響清單">
        <div className="section-heading">
          <div>
            <h2>法規異動影響清單</h2>
            <p className="muted">
              HR 更新來源或規則後，先看這裡決定要重跑哪個流程；薪資、假勤、出勤、離職、公告與稽核都必須有可追溯證據。
            </p>
          </div>
          <span className={`badge ${center.impactTasks.some((task) => task.status === "blocked") ? "danger" : center.impactTasks.some((task) => task.status === "needs_review") ? "warning" : "done"}`}>
            {center.impactTasks.filter((task) => task.status !== "covered").length} 項待處理
          </span>
        </div>
        <div className="law-rule-impact-grid">
          {center.impactTasks.map((task) => (
            <article className={`law-rule-impact-card ${coverageTone(task.status)}`} key={task.id}>
              <div className="law-rule-impact-card-top">
                <span className="eyebrow">{task.owner}</span>
                <span className={`badge ${task.status === "covered" ? "done" : task.status === "blocked" ? "danger" : "warning"}`}>
                  {coverageStatusLabel(task.status)}
                </span>
              </div>
              <h3>{task.title}</h3>
              <p>{task.trigger}</p>
              <div className="law-rule-impact-tags">
                {task.affectedWorkflows.map((workflow) => (
                  <span key={workflow}>{workflow}</span>
                ))}
              </div>
              <small>驗收：{task.evidence}</small>
              <small>來源：{task.sourceCoverage.covered}/{task.sourceCoverage.total}</small>
              <strong>{task.nextAction}</strong>
              <Link className="button" href={task.actionHref}>
                {task.actionLabel}
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="panel span-12 law-rule-coverage-panel" id="compliance-coverage" aria-label="台灣法遵覆蓋矩陣">
        <div className="section-heading">
          <div>
            <h2>台灣法遵覆蓋矩陣</h2>
            <p className="muted">
              用同一份 rule version 檢查法源、可調參數與人工複核狀態；缺來源或缺設定會阻擋上線 Gate。
            </p>
          </div>
          <span className={`badge ${coverageSummary.status === "ready" ? "done" : coverageSummary.status === "blocked" ? "danger" : "warning"}`}>
            {coverageSummary.coveredCount}/{coverageSummary.totalCount} 覆蓋
          </span>
        </div>
        <div className="law-rule-coverage-grid">
          {center.complianceCoverage.map((item) => (
            <article className={`law-rule-coverage-card ${coverageTone(item.status)}`} key={item.id}>
              <div className="law-rule-coverage-card-top">
                <span className="muted">{item.owner}</span>
                <span className={`badge ${item.status === "covered" ? "done" : item.status === "blocked" ? "danger" : "warning"}`}>
                  {coverageStatusLabel(item.status)}
                </span>
              </div>
              <h3>{item.title}</h3>
              <p>{item.legalBasis}</p>
              <div className="law-rule-coverage-meta">
                <span>{item.configuredControlCount}/{item.controlCount} 控制項</span>
                <span>{item.sourceIds.length - item.missingSourceIds.length}/{item.sourceIds.length} 來源</span>
              </div>
              <small>{item.evidence}</small>
              {item.status !== "covered" ? <strong>{item.nextAction}</strong> : null}
            </article>
          ))}
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
          <span className="badge">目前設定值</span>
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
              <p className="muted">阻擋與警示會影響月結、薪資鎖定與正式上線閘門。</p>
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
              <p className="muted">每次規則變更都會產生版本紀錄，可回溯來源、審核與是否需要重算薪資。</p>
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

type LawRuleCenter = Awaited<ReturnType<typeof getTaiwanLaborRuleCenter>>;
type RuleTone = "ready" | "warning" | "danger";

function toneFromReadiness(status: LawRuleCenter["readiness"]["status"]): RuleTone {
  if (status === "blocked") return "danger";
  if (status === "needs_review") return "warning";
  return "ready";
}

function buildRuleFocus(center: LawRuleCenter) {
  if (center.readiness.blockers.length > 0) {
    return {
      title: center.readiness.blockers[0],
      detail: "這會阻擋正式上線與薪資鎖定。先修正設定並重新儲存，讓規則測試通過。",
      href: "#source-review",
      label: "處理阻擋項",
      tone: "danger" as const,
    };
  }

  if (!center.sourceFreshness.passed) {
    return {
      title: "官方來源需要複核",
      detail: `目前 ${center.sourceFreshness.staleSourceCount + center.sourceFreshness.invalidSourceCount} 個來源需要更新或修正日期。`,
      href: "#source-review",
      label: "更新來源",
      tone: "warning" as const,
    };
  }

  if (center.config.changeControl.reviewStatus !== "approved") {
    return {
      title: "等待 HR 或法務審核",
      detail: "規則已可檢視，但月結鎖定前仍需要填寫審核人並核准目前版本。",
      href: "#source-review",
      label: "補審核",
      tone: "warning" as const,
    };
  }

  if (center.config.changeControl.requiresPayrollRecalculation) {
    return {
      title: "薪資草稿需要重新試算",
      detail: "規則已變更，尚未鎖定的薪資草稿需要重新計算，避免使用舊版本規則。",
      href: "/hr",
      label: "回月結試算",
      tone: "warning" as const,
    };
  }

  return {
    title: "規則可用於月結",
    detail: "目前版本已有來源、審核與測試證據，可用於薪資、假勤與出勤檢查。",
    href: "/hr",
    label: "前往月結",
    tone: "ready" as const,
  };
}

function buildRuleSignals(center: LawRuleCenter) {
  const latestVersion = center.versionHistory[0];
  return [
    {
      id: "readiness",
      label: "規則健康度",
      value: center.readiness.label,
      detail: center.readiness.blockers.length
        ? `${center.readiness.blockers.length} 個阻擋項會擋下上線。`
        : `${center.readiness.warnings.length} 個警示需月結前確認。`,
      href: "#source-review",
      tone: toneFromReadiness(center.readiness.status),
    },
    {
      id: "coverage",
      label: "法遵覆蓋",
      value: `${center.complianceCoverageSummary.coveredCount}/${center.complianceCoverageSummary.totalCount}`,
      detail: center.complianceCoverageSummary.status === "ready"
        ? "核心台灣法遵領域都有來源與可調控制。"
        : `${center.complianceCoverageSummary.blockedCount} 阻擋、${center.complianceCoverageSummary.needsReviewCount} 待複核。`,
      href: "#compliance-coverage",
      tone: toneFromReadiness(center.complianceCoverageSummary.status),
    },
    {
      id: "sources",
      label: "官方來源",
      value: `${center.sourceFreshness.freshSourceCount}/${center.sourceFreshness.totalSourceCount}`,
      detail: center.sourceFreshness.passed
        ? "來源檢查仍在有效期限內。"
        : `${center.sourceFreshness.staleSourceCount + center.sourceFreshness.invalidSourceCount} 個來源需要更新。`,
      href: "#source-review",
      tone: center.sourceFreshness.passed ? "ready" as const : "warning" as const,
    },
    {
      id: "version",
      label: "啟用版本",
      value: center.config.version,
      detail: latestVersion
        ? `${formatDateTime(latestVersion.createdAt)} 建立，${latestVersion.sourceCount} 個來源。`
        : "尚未建立版本紀錄。",
      href: "#source-review",
      tone: center.versionHistory.length ? "ready" as const : "danger" as const,
    },
    {
      id: "payroll",
      label: "薪資重算",
      value: center.config.changeControl.requiresPayrollRecalculation ? "需要" : "不需要",
      detail: center.config.changeControl.requiresPayrollRecalculation
        ? "月結鎖定前要重新試算未鎖定草稿。"
        : "目前薪資草稿不需要因規則變更而重算。",
      href: "/hr",
      tone: center.config.changeControl.requiresPayrollRecalculation ? "warning" as const : "ready" as const,
    },
  ];
}

function coverageTone(status: LawRuleCenter["complianceCoverage"][number]["status"]) {
  if (status === "blocked") return "danger";
  if (status === "needs_review") return "warning";
  return "ready";
}

function coverageStatusLabel(status: LawRuleCenter["complianceCoverage"][number]["status"]) {
  if (status === "blocked") return "缺口";
  if (status === "needs_review") return "需複核";
  return "已覆蓋";
}

function buildRuleGovernanceCards(center: LawRuleCenter) {
  const sourceIssueCount = center.sourceFreshness.staleSourceCount + center.sourceFreshness.invalidSourceCount;
  return [
    {
      id: "source",
      area: "來源治理",
      title: "官方來源與檢查日",
      summary: "人資或法務可直接更新官方法規來源、檢查日期與變更原因；不可貼入員工個資或薪資資料。",
      status: sourceIssueCount ? `${sourceIssueCount} 項需複核` : "來源有效",
      tone: sourceIssueCount ? "warning" as const : "ready" as const,
      primary: { href: "#source-review", label: "更新來源" },
    },
    {
      id: "review",
      area: "審核控管",
      title: "審核人與版本核准",
      summary: "每個規則版本都要知道誰審核、何時審核、是否會影響既有薪資草稿。",
      status: center.config.changeControl.reviewStatus === "approved" ? "已核准" : "待審核",
      tone: center.config.changeControl.reviewStatus === "approved" ? "ready" as const : "warning" as const,
      primary: { href: "#source-review", label: "補審核" },
    },
    {
      id: "advanced",
      area: "彈性設定",
      title: "薪資、工時與假勤參數",
      summary: "最低工資、加班倍率、工時上限、特休、勞健保與所得稅等進階表格集中在完整設定表。",
      status: `${center.validation.passedCount}/${center.validation.fixtureCount} 測試通過`,
      tone: center.validation.passed ? "ready" as const : "danger" as const,
      primary: { href: "/settings#law-rules-setup", label: "完整設定表" },
    },
  ];
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
