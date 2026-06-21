import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/session";
import { hasPermission } from "@/server/auth/rbac";
import { summarizeAttendanceExceptionResolution } from "@/server/attendance/exceptions";
import { getCompanyOverview } from "@/server/dashboard/queries";
import { getHrOneKpis, summarizeHrOneKpis } from "@/server/kpis/hr-one";
import { getOnboardingReadinessReport } from "@/server/onboarding/readiness";
import { getPayrollDashboard } from "@/server/payroll/service";
import { getHrAttendanceExceptions } from "@/server/workflows/service";

export default async function HrDashboardPage() {
  const [session, overview] = await Promise.all([getDemoSession(), getCompanyOverview()]);
  if (!hasPermission(session.role, "payroll:manage")) {
    return (
      <main className="page">
        <section className="page-header">
          <h1>需要人資權限</h1>
          <p>這裡是 HR 月結與薪資作業後台，員工日常任務請使用員工前台。</p>
        </section>
        <EmptyState
          title="無法開啟 HR 月結"
          body="請切換為人資管理員或老闆示範角色；一般員工與主管預設不能讀取薪資與月結資料。"
        />
      </main>
    );
  }

  const [exceptions, payroll, onboardingReadiness, kpis] = await Promise.all([
    getHrAttendanceExceptions(session),
    getPayrollDashboard(session),
    getOnboardingReadinessReport(session),
    getHrOneKpis(),
  ]);
  const kpiSummary = summarizeHrOneKpis(kpis);
  const focusKpis = kpis.filter((kpi) => kpi.status !== "passing").slice(0, 3);
  const attendanceSummary = summarizeAttendanceExceptionResolution(exceptions);
  const pendingExceptionCount = exceptions.filter((item) => item.status === "pending").length;
  const attendanceDayline = buildAttendanceDayline(attendanceSummary);
  const nextActions = buildNextActions({
    attendanceExceptionCount: pendingExceptionCount,
    onboardingReadiness,
    payroll,
  });
  const closeHealth = buildCloseHealth(payroll.checklist.steps);
  const payrollRunway = buildPayrollRunway(payroll);
  const workspaceGroups = buildWorkspaceGroups({
    pendingExceptionCount,
    payrollStatus: payroll.run?.status ?? "not started",
    onboardingOpenCount: onboardingReadiness.checks.filter((check) => check.status !== "ready").length,
    kpiOpenCount: kpiSummary.watch + kpiSummary.failing,
  });
  const adminModuleGroups = buildAdminModuleGroups({
    pendingExceptionCount,
    payrollStatus: payroll.run?.status ?? "not started",
    onboardingOpenCount: onboardingReadiness.checks.filter((check) => check.status !== "ready").length,
  });

  if (!overview) {
    return (
      <main className="page">
        <EmptyState
          title="尚未建立示範資料"
          body="請先依 README 執行資料庫 migration 與 seed 指令，再開啟人資儀表板。"
        />
      </main>
    );
  }

  return (
    <main className="page">
      <section className="hr-monthly-hero" aria-label="HR 月結指揮台">
        <div className="hr-monthly-hero-main">
          <div className="hr-monthly-hero-topline">
            <span className="muted">財務系統風格人資營運台</span>
            <span className={`badge ${kpiSummary.readyForSale ? "" : "warning"}`}>
              {kpiSummary.passing}/{kpiSummary.total} KPI 達標
            </span>
          </div>
          <h1>HR 月結指揮台</h1>
          <p>
            把出勤異常、待簽核、薪資試算、鎖定與薪資單發布收斂成同一條月結路線；HR 今天只需要先處理會阻擋發薪與上線販售的事項。
          </p>
          <div className="hr-monthly-hero-actions">
            <a className="button primary" href="/hr/attendance-exceptions">
              處理出勤異常
            </a>
            <a className="button" href="/manager/inbox">
              開啟簽核 Inbox
            </a>
            <a className="button" href="/settings/readiness">
              檢查上線閘門
            </a>
          </div>
        </div>

        <aside className={`hr-monthly-hero-focus ${payrollRunway.tone}`}>
          <div>
            <span className="muted">今日先處理</span>
            <strong>{payrollRunway.title}</strong>
            <p>{payrollRunway.detail}</p>
          </div>
          <div className="hr-monthly-focus-footer">
            <span className={`badge ${payrollRunway.tone === "ready" ? "" : payrollRunway.tone}`}>
              {payrollRunway.status}
            </span>
            {payrollRunway.formAction ? (
              <form action={payrollRunway.formAction} method="post">
                <button className="button primary" type="submit" aria-label={`今日先處理：${payrollRunway.actionLabel}`}>
                  {payrollRunway.actionLabel}
                </button>
              </form>
            ) : (
              <a className="button primary" href={payrollRunway.href}>
                {payrollRunway.actionLabel}
              </a>
            )}
          </div>
          <small>{payrollRunway.actionNote}</small>
        </aside>
      </section>

      <section className="hr-monthly-signal-board" aria-label="HR 月結訊號板">
        <a className={`hr-monthly-signal-card ${pendingExceptionCount ? "danger" : "done"}`} href="/hr/attendance-exceptions">
          <span>出勤完整性</span>
          <strong>{pendingExceptionCount ? `${pendingExceptionCount} 筆異常` : "已清空"}</strong>
          <small>漏打卡、工時風險與員工出勤確認先於薪資試算。</small>
        </a>
        <a className="hr-monthly-signal-card focus" href="/manager/inbox">
          <span>簽核集中</span>
          <strong>統一 Inbox</strong>
          <small>請假、加班、補打卡與自訂表單集中處理。</small>
        </a>
        <a className={`hr-monthly-signal-card ${payroll.run?.status === "released" ? "done" : "warning"}`} href="/hr">
          <span>月結閘門</span>
          <strong>{closeHealth.ready}/{closeHealth.total} 步</strong>
          <small>{labelStatus(payroll.run?.status ?? "not started")}；鎖定前不得靜默修改薪資。</small>
        </a>
        <a className={`hr-monthly-signal-card ${kpiSummary.readyForSale ? "done" : "warning"}`} href="/hr/kpis">
          <span>販售 KPI</span>
          <strong>{kpiSummary.watch + kpiSummary.failing} 項待改善</strong>
          <small>持續追蹤 60 秒請假、15 秒簽核與薪資月結時間。</small>
        </a>
      </section>

      <section className="hr-attendance-dayline" aria-label="出勤日清路線">
        <div className="hr-attendance-dayline-copy">
          <span className="muted">出勤日清路線</span>
          <strong>{attendanceSummary.kpiReady ? "出勤異常接近可月結" : "先把出勤異常清到 90% 以上"}</strong>
          <small>HR 首頁直接看到解決率、安全建議與高風險工時；真正處理仍回到異常工作台並寫入 audit。</small>
        </div>
        {attendanceDayline.map((item) => (
          <a className={`hr-attendance-dayline-card ${item.tone}`} href={item.href} key={item.step}>
            <span>{item.step}</span>
            <strong>{item.title}</strong>
            <small>{item.detail}</small>
          </a>
        ))}
      </section>

      <section className="hr-close-command-band" aria-label="HR 月結任務帶">
        <div className="hr-close-command-copy">
          <span className="muted">HR 月結預演</span>
          <strong>{closeHealth.ready}/{closeHealth.total} 步完成</strong>
          <small>出勤、簽核、薪資草稿、鎖定與薪資單發布都要留下 audit。</small>
        </div>
        <a className={`hr-close-command-card ${pendingExceptionCount ? "danger" : "ready"}`} href="/hr/attendance-exceptions">
          <span>01 出勤</span>
          <strong>{pendingExceptionCount ? `${pendingExceptionCount} 筆異常` : "已清空"}</strong>
          <small>月底前先處理漏打卡與工時風險</small>
        </a>
        <a className="hr-close-command-card focus" href="/manager/inbox">
          <span>02 簽核</span>
          <strong>統一 Inbox</strong>
          <small>請假、加班、補打卡集中處理</small>
        </a>
        <a className={`hr-close-command-card ${payroll.run?.status === "released" ? "ready" : ""}`} href="/hr">
          <span>03 薪資</span>
          <strong>{labelStatus(payroll.run?.status ?? "not started")}</strong>
          <small>HR 確認後才能鎖定與發布</small>
        </a>
        <a className={`hr-close-command-card ${kpiSummary.readyForSale ? "ready" : "warning"}`} href="/settings/readiness">
          <span>04 安全</span>
          <strong>{kpiSummary.readyForSale ? "接近通過" : "需檢查"}</strong>
          <small>薪資權限、audit 與敏感資料防漏</small>
        </a>
      </section>

      <section className="pilot-trial-board" aria-label="兩週試用指揮列">
        <div className="pilot-trial-copy">
          <span className="muted">20-50 人試用</span>
          <strong>本週要讓公司完整跑過日常、簽核、公告、月結預演與薪資單查看。</strong>
        </div>
        <div className="pilot-trial-steps">
          <a href="/app/attendance">
            <span>01</span>
            <strong>打卡</strong>
            <small>{pendingExceptionCount ? `${pendingExceptionCount} 筆異常` : "可試用"}</small>
          </a>
          <a href="/manager/inbox">
            <span>02</span>
            <strong>簽核</strong>
            <small>統一 Inbox</small>
          </a>
          <a href="/hr/announcements">
            <span>03</span>
            <strong>公告</strong>
            <small>回條追蹤</small>
          </a>
          <a href="/hr">
            <span>04</span>
            <strong>月結預演</strong>
            <small>{labelStatus(payroll.run?.status ?? "not started")}</small>
          </a>
          <a href="/app/payslip">
            <span>05</span>
            <strong>薪資單</strong>
            <small>本人可讀</small>
          </a>
          <a href="/settings/readiness">
            <span>06</span>
            <strong>安全 Gate</strong>
            <small>{kpiSummary.readyForSale ? "已接近" : "待檢查"}</small>
          </a>
        </div>
      </section>

      <section className="grid hr-command-center">
        <div className="panel span-4 metric">
          <span className="muted">員工數</span>
          <strong>{overview.employeeCount}</strong>
          <span className="badge">{overview.company.name}</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">出勤阻擋項</span>
          <strong>{pendingExceptionCount}</strong>
          <span className="badge warning">薪資前需處理</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">KPI 待改善</span>
          <strong>{kpiSummary.watch + kpiSummary.failing}</strong>
          <span className={`badge ${kpiSummary.readyForSale ? "" : "warning"}`}>販售門檻</span>
        </div>

        <section className="panel span-12 finance-strip hr-close-strip">
          <div>
            <span className="muted">月結健康度</span>
            <strong>{closeHealth.ready}/{closeHealth.total} 已完成</strong>
          </div>
          <div className="health-meter" aria-label={`薪資月結健康度 ${closeHealth.percent}%`}>
            <span style={{ width: `${closeHealth.percent}%` }} />
          </div>
          <div className="finance-strip-meta">
            <span className="badge">{labelStatus(payroll.run?.status ?? "not started")}</span>
            <span className={`badge ${kpiSummary.readyForSale ? "" : "warning"}`}>
              {kpiSummary.passing}/{kpiSummary.total} 個 KPI 達標
            </span>
            <span className="badge">規則 {overview.activeRuleCount}</span>
          </div>
        </section>

        <section className="panel span-12 command-panel hr-next-actions">
          <div className="section-heading">
            <div>
              <h2>下一步</h2>
              <p className="muted">優先處理會影響薪資月結與上線販售的事項。</p>
            </div>
            <span className={`badge ${nextActions.some((action) => action.tone === "danger") ? "danger" : nextActions.some((action) => action.tone === "warning") ? "warning" : ""}`}>
              {nextActions.filter((action) => action.tone !== "ready").length} 項未完成
            </span>
          </div>
          <ul className="task-list next-action-list">
            {nextActions.map((action) => (
              <li className="task next-action" key={action.id}>
                <span>
                  <strong>{action.title}</strong>
                  <small>{action.detail}</small>
                </span>
                <span className="inline-actions">
                  <a className={`button ${action.primary ? "primary" : ""}`} href={action.href}>
                    {action.label}
                  </a>
                  <span className={`badge ${action.tone === "danger" ? "danger" : action.tone === "warning" ? "warning" : ""}`}>
                    {action.status}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="span-12 workspace-grid hr-workspace-grid" aria-label="人資作業工作區">
          {workspaceGroups.map((group) => (
            <article className="panel workflow-card" key={group.id}>
              <div className="workflow-card-header">
                <div>
                  <span className="muted">{group.area}</span>
                  <h2>{group.title}</h2>
                </div>
                <span className={`badge ${group.tone === "warning" ? "warning" : group.tone === "danger" ? "danger" : ""}`}>
                  {group.status}
                </span>
              </div>
              <p className="muted">{group.summary}</p>
              <div className="workflow-card-primary">
                <a className="button primary" href={group.primary.href}>
                  {group.primary.label}
                </a>
              </div>
              <div className="inline-actions compact-link-row">
                {group.links.map((link) => (
                  <a className="button" href={link.href} key={link.href}>
                    {link.label}
                  </a>
                ))}
              </div>
            </article>
          ))}
        </section>

        <section className="panel span-12 admin-module-board">
          <div className="section-heading">
            <div>
              <h2>後台模組</h2>
              <p className="muted">人資、行政主任與老闆從模組進入設定；日常阻擋項仍以上方工作卡優先。</p>
            </div>
            <a className="button primary" href="/console">
              開啟完整後台
            </a>
          </div>
          <div className="admin-module-grid">
            {adminModuleGroups.map((group) => (
              <article className="admin-module-card" key={group.id}>
                <div>
                  <span className="muted">{group.area}</span>
                  <h3>{group.title}</h3>
                </div>
                <span className={`badge ${group.tone === "danger" ? "danger" : group.tone === "warning" ? "warning" : ""}`}>
                  {group.status}
                </span>
                <p>{group.summary}</p>
                <a className="button primary" href={group.primary.href}>
                  {group.primary.label}
                </a>
                <ul>
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <a href={link.href}>{link.label}</a>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        {focusKpis.length > 0 ? (
          <section className="panel span-12">
            <div className="section-heading">
              <div>
                <h2>KPI 待改善</h2>
                <p className="muted">用這些產品成效確保 HR One 不只功能完整，也足夠好用、能販售。</p>
              </div>
              <a className="button" href="/hr/kpis">
                開啟 KPI 看板
              </a>
            </div>
            <ul className="task-list">
              {focusKpis.map((kpi) => (
                <li className="task" key={kpi.id}>
                  <span>
                    <strong>{translateKpiName(kpi.name)}</strong>
                    <small>目標 {kpi.target} · 目前 {kpi.current}</small>
                    <small>{translateKpiNextStep(kpi.nextStep)}</small>
                  </span>
                  <span className={`badge ${kpi.status === "failing" ? "danger" : "warning"}`}>
                    {labelStatus(kpi.status)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="panel span-12 payroll-console">
          <div className="section-heading">
            <div>
              <h2>薪資月結</h2>
              <p className="muted">
                人資需先清除阻擋項，再試算、確認、鎖定，最後發布薪資單。
              </p>
            </div>
            <div className="inline-actions">
              <a className="button" href="/hr/salary-profiles">
                薪資資料
              </a>
              <a className="button" href="/hr/payroll-profile-import">
                薪資匯入
              </a>
              <a className="button" href="/hr/payment-profiles">
                付款資料
              </a>
              <a className="button" href="/hr/payroll-payment-security">
                付款安全
              </a>
              <a className="button" href="/hr/payroll-compliance">
                合規資料
              </a>
              <a className="button" href="/hr/insurance">
                保險
              </a>
              <a className="button" href="/hr/payroll-recordkeeping">
                工資紀錄
              </a>
              <a className="button" href="/hr/annual-leave-settlements">
                特休結算
              </a>
              <a className="button" href="/hr/payroll-accounting">
                會計科目
              </a>
              <a className="button" href="/hr/payroll-adjustments">
                調整
              </a>
              <a className="button" href="/hr/payroll-exports">
                匯出
              </a>
              <span className="badge">{labelStatus(payroll.run?.status ?? "not started")}</span>
            </div>
          </div>

          <section className="payroll-day7-guide" aria-label="Day 7 月結預演">
            <div className="payroll-day7-main">
              <span className="muted">Day 7 月結預演</span>
              <h3>{payrollRunway.title}</h3>
              <p>{payrollRunway.detail}</p>
              <div className="payroll-day7-safety">
                <span className="badge">薪資資料不在摘要外洩</span>
                <span className="badge">每一步都寫入 audit log</span>
                <span className="badge">鎖定後需走調整流程</span>
              </div>
            </div>
            <div className="payroll-day7-action">
              <span className={`badge ${payrollRunway.tone === "ready" ? "" : payrollRunway.tone}`}>
                {payrollRunway.status}
              </span>
              {payrollRunway.formAction ? (
                <form action={payrollRunway.formAction} method="post">
                  <button className="button primary" type="submit" aria-label={`Day 7 下一步：${payrollRunway.actionLabel}`}>
                    {payrollRunway.actionLabel}
                  </button>
                </form>
              ) : (
                <a className="button primary" href={payrollRunway.href}>
                  {payrollRunway.actionLabel}
                </a>
              )}
              <small>{payrollRunway.actionNote}</small>
            </div>
            <div className="payroll-runway" aria-label="薪資月結安全跑道">
              {payrollRunway.stages.map((stage) => (
                <div className={`payroll-runway-stage ${stage.status}`} key={stage.id}>
                  <span>{stage.step}</span>
                  <strong>{stage.title}</strong>
                  <small>{stage.detail}</small>
                </div>
              ))}
            </div>
          </section>

          <section className="payroll-legal-gate" aria-label="薪資法遵鎖薪 Gate">
            <div className={`payroll-legal-gate-copy ${payroll.checklist.legalGate.status === "blocked" ? "danger" : "ready"}`}>
              <span>薪資法遵鎖薪 Gate</span>
              <strong>{payroll.checklist.legalGate.headline}</strong>
              <small>
                {payroll.checklist.legalGate.readyCount}/{payroll.checklist.legalGate.totalCount} 步可用；
                {payroll.checklist.legalGate.blockedCount} 個阻擋。{payroll.checklist.legalGate.nextAction}
              </small>
            </div>
            {payroll.checklist.legalGate.steps.map((step) => (
              <article className={`payroll-legal-gate-step ${payrollGateTone(step.status)}`} key={step.id}>
                <div className="payroll-legal-gate-step-top">
                  <span>{step.step}</span>
                  <span className={`badge ${step.status === "done" ? "done" : step.status === "blocked" ? "danger" : "warning"}`}>
                    {labelPayrollGateStatus(step.status)}
                  </span>
                </div>
                <h3>{step.title}</h3>
                <p>{translatePayrollDetail(step.detail)}</p>
                <small>{step.metric}</small>
                <small>證據：{translatePayrollGateEvidence(step.evidence)}</small>
                <a className="button" href={step.actionHref}>
                  {step.actionLabel}
                </a>
              </article>
            ))}
          </section>

          <div className="action-row payroll-actions">
            <form action="/api/payroll/create" method="post">
              <button className="button primary" type="submit">
                建立薪資批次
              </button>
            </form>
            <form action="/api/payroll/resolve-blockers" method="post">
              <button className="button" type="submit">
                標記阻擋項已檢查
              </button>
            </form>
            <form action="/api/payroll/recalculate" method="post">
              <button className="button" type="submit">
                試算草稿
              </button>
            </form>
            <form action="/api/payroll/confirm" method="post">
              <button className="button" type="submit">
                人資確認
              </button>
            </form>
            <form action="/api/payroll/lock" method="post">
              <button className="button" type="submit">
                鎖定薪資
              </button>
            </form>
            <form action="/api/payroll/release" method="post">
              <button className="button" type="submit">
                發布薪資單
              </button>
            </form>
          </div>

          {payroll.checklist.ruleReview.blocksLock ? (
            <div className="risk-box danger-box">
              <strong>鎖定薪資前需完成規則檢查</strong>
              <p>{translatePayrollDetail(payroll.checklist.ruleReview.detail)}</p>
              <p className="muted">
                啟用規則 {payroll.checklist.ruleReview.activeRuleVersion}；薪資草稿規則{" "}
                {payroll.checklist.ruleReview.payrollRuleVersionId ?? "尚未試算"}。
              </p>
            </div>
          ) : (
            <div className="risk-box">
              <strong>規則版本已就緒</strong>
              <p>{translatePayrollDetail(payroll.checklist.ruleReview.detail)}</p>
            </div>
          )}

          <ol className="close-steps payroll-track">
            {payroll.checklist.steps.map((step) => (
              <li key={step.step} className={`close-step ${step.status}`}>
                <strong>
                  {step.step}. {translatePayrollStepTitle(step.title)}
                </strong>
                <span>{translatePayrollDetail(step.detail)}</span>
              </li>
            ))}
          </ol>

          {payroll.run ? (
            <div className="payroll-preview payroll-ledger-preview">
              <div className="metric">
                <span className="muted">應發草稿</span>
                <strong>{formatMoney(payroll.run.grossTotal)}</strong>
              </div>
              <div className="metric">
                <span className="muted">扣項</span>
                <strong>{formatMoney(payroll.run.deductionTotal)}</strong>
              </div>
              <div className="metric">
                <span className="muted">實發草稿</span>
                <strong>{formatMoney(payroll.run.netTotal)}</strong>
              </div>
              <div className="metric">
                <span className="muted">雇主法定成本</span>
                <strong>{formatMoney(payroll.run.employerContributionTotal ?? 0)}</strong>
              </div>
            </div>
          ) : null}

          {payroll.run && payroll.run.items.length > 0 ? (
            <ul className="task-list">
              {payroll.run.items.slice(0, 10).map((item) => (
                <li className="task" key={`${item.employeeId}-${item.kind}-${item.code}`}>
                  <span>
                    <strong>
                      {item.employeeName} · {item.name}
                    </strong>
                    <small>{labelPayrollItemKind(item.kind)} · 規則 {item.ruleVersionId ?? "不適用"}</small>
                  </span>
                  <span className={`badge ${item.kind === "deduction" ? "warning" : ""}`}>
                    {formatMoney(item.amount)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <div className="panel span-8 exception-console">
          <div className="section-heading">
            <div>
              <h2>出勤異常</h2>
              <p className="muted">薪資月結前需先處理會阻擋結算的異常。</p>
            </div>
            <a className="button" href="/hr/attendance-exceptions">
              開啟佇列
            </a>
          </div>
          {exceptions.length === 0 ? (
            <p className="muted">目前沒有出勤異常。</p>
          ) : (
            <ul className="task-list">
              {exceptions.map((exception) => (
                <li className="task" key={exception.id}>
                  <span>
                    <strong>{exception.employeeName}</strong>
                    <small>{translateExceptionType(exception.exceptionType)}</small>
                  </span>
                  <span className={`badge ${exception.severity === "warning" ? "warning" : "danger"}`}>
                    {labelStatus(exception.status)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel span-4 department-console">
          <h2>部門</h2>
          <ul className="task-list">
            {overview.company.departments.map((department) => (
              <li className="task" key={department.id}>
                <span>{translateDepartmentName(department.name)}</span>
                <span className="badge">{department._count.employees}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}

type NextAction = {
  id: string;
  title: string;
  detail: string;
  href: string;
  label: string;
  status: string;
  tone: "ready" | "warning" | "danger";
  primary?: boolean;
};

type WorkspaceGroup = {
  id: string;
  area: string;
  title: string;
  summary: string;
  status: string;
  tone: "ready" | "warning" | "danger";
  primary: {
    href: string;
    label: string;
  };
  links: Array<{
    href: string;
    label: string;
  }>;
};

type AdminModuleGroup = {
  id: string;
  area: string;
  title: string;
  summary: string;
  status: string;
  tone: "ready" | "warning" | "danger";
  primary: {
    href: string;
    label: string;
  };
  links: Array<{
    href: string;
    label: string;
  }>;
};

type PayrollDashboard = Awaited<ReturnType<typeof getPayrollDashboard>>;
type AttendanceResolutionSummary = ReturnType<typeof summarizeAttendanceExceptionResolution>;
type AttendanceDaylineItem = {
  step: string;
  title: string;
  detail: string;
  href: string;
  tone: "ready" | "warning" | "danger" | "focus";
};
type PayrollRunway = {
  title: string;
  detail: string;
  status: string;
  tone: "ready" | "warning" | "danger";
  actionLabel: string;
  actionNote: string;
  href: string;
  formAction?: string;
  stages: Array<{
    id: string;
    step: string;
    title: string;
    detail: string;
    status: "done" | "current" | "blocked" | "todo";
  }>;
};

type CloseStep = Awaited<ReturnType<typeof getPayrollDashboard>>["checklist"]["steps"][number];

function buildAttendanceDayline(summary: AttendanceResolutionSummary): AttendanceDaylineItem[] {
  return [
    {
      step: "01 解決率",
      title: `${summary.resolutionRate}%`,
      detail: summary.kpiReady ? "已達 90% 以上，仍需保留月結證據。" : "未達 90%，月結前先清安全建議與高風險。",
      href: "/hr/attendance-exceptions",
      tone: summary.kpiReady ? "ready" : summary.highRiskCount ? "danger" : "warning",
    },
    {
      step: "02 待處理",
      title: `${summary.pendingCount} 筆`,
      detail: summary.pendingCount ? "漏打卡、重複打卡與工時風險會阻擋薪資鎖定。" : "目前沒有待處理出勤異常。",
      href: "/hr/attendance-exceptions#attendance-exception-queue",
      tone: summary.pendingCount ? "danger" : "ready",
    },
    {
      step: "03 安全建議",
      title: `${summary.autoResolvableCount} 筆`,
      detail: summary.autoResolvableCount ? "可由 HR 到異常工作台確認後套用，不會自動關閉。" : "沒有低風險批次建議。",
      href: "/hr/attendance-exceptions",
      tone: summary.autoResolvableCount ? "focus" : "ready",
    },
    {
      step: "04 高風險",
      title: `${summary.highRiskCount} 筆`,
      detail: summary.highRiskCount ? "涉及工時或法遵風險，需人工追溯班表、假勤與加班。" : "沒有高風險工時阻擋。",
      href: summary.highRiskCount ? "/hr/worktime-compliance" : "/hr/attendance-exceptions",
      tone: summary.highRiskCount ? "danger" : "ready",
    },
  ];
}

function buildPayrollRunway(payroll: PayrollDashboard): PayrollRunway {
  const runStatus = payroll.run?.status ?? "not started";
  const blockedStep = payroll.checklist.steps.find((step) => step.status === "blocked");
  const currentStep = findCurrentPayrollStep(payroll);
  const stages = payroll.checklist.steps.map((step) => {
    let status: PayrollRunway["stages"][number]["status"] = "todo";
    if (step.status === "done") status = "done";
    if (step.status === "blocked") status = "blocked";
    if (step.step === currentStep.step && step.status !== "done" && step.status !== "blocked") status = "current";
    return {
      id: step.title,
      step: `0${step.step}`,
      title: translatePayrollStepTitle(step.title),
      detail: translatePayrollDetail(step.detail),
      status,
    };
  });

  if (!payroll.run) {
    return {
      title: "建立本月薪資批次",
      detail: "先產生月結批次，系統會匯入出勤、請假、加班與薪資主檔，並在進入鎖定前擋下缺漏。",
      status: "尚未開始",
      tone: "warning",
      actionLabel: "建立薪資批次",
      actionNote: "建立後會先進入阻擋項檢查，不會直接發薪。",
      href: "/hr",
      formAction: "/api/payroll/create",
      stages,
    };
  }

  if (runStatus === "blocked" && blockedStep) {
    return {
      title: translatePayrollStepTitle(blockedStep.title),
      detail: translatePayrollDetail(blockedStep.detail),
      status: "目前有阻擋項",
      tone: "danger",
      actionLabel: "標記阻擋項已檢查",
      actionNote: "只在 HR 確認缺漏已處理後使用；仍會保留 audit trail。",
      href: "/hr/attendance-exceptions",
      formAction: "/api/payroll/resolve-blockers",
      stages,
    };
  }

  if (runStatus === "draft") {
    return {
      title: "進行薪資試算草稿",
      detail: "阻擋項已檢查，接著用目前規則版本產生可審核草稿，讓 HR 先看例外再確認。",
      status: "可試算",
      tone: "warning",
      actionLabel: "試算草稿",
      actionNote: "試算會綁定規則版本，避免月底公式被靜默更改。",
      href: "/hr",
      formAction: "/api/payroll/recalculate",
      stages,
    };
  }

  if (runStatus === "calculated") {
    return {
      title: "HR 檢查例外後確認",
      detail: "草稿已產生，請確認出勤、加班、假勤、加扣項與規則版本，確認後才可進入鎖定。",
      status: "待 HR 確認",
      tone: "warning",
      actionLabel: "人資確認",
      actionNote: "確認代表 HR 已看過例外，不代表薪資單已發布。",
      href: "/hr",
      formAction: "/api/payroll/confirm",
      stages,
    };
  }

  if (runStatus === "confirmed") {
    return {
      title: "鎖定薪資批次",
      detail: "HR 已確認草稿。鎖定後不可靜默異動，後續若有修正必須走明確調整流程。",
      status: "可鎖定",
      tone: "warning",
      actionLabel: "鎖定薪資",
      actionNote: "鎖定是正式發布薪資單前的最後安全閘門。",
      href: "/hr",
      formAction: "/api/payroll/lock",
      stages,
    };
  }

  if (runStatus === "locked") {
    return {
      title: "發布員工薪資單",
      detail: "薪資已鎖定，可以發布薪資單；員工只能查看自己的薪資單，主管預設不能看部屬薪資。",
      status: "可發布",
      tone: "warning",
      actionLabel: "發布薪資單",
      actionNote: "發布後請抽查員工端本人可讀、主管不可讀。",
      href: "/app/payslip",
      formAction: "/api/payroll/release",
      stages,
    };
  }

  return {
    title: "月結預演完成",
    detail: "薪資單已發布，下一步是讓員工查看薪資單、保存證據，並跑未授權存取測試。",
    status: "已發布",
    tone: "ready",
    actionLabel: "查看員工薪資單",
    actionNote: "薪資明細只應出現在授權角色與本人薪資單頁面。",
    href: "/app/payslip",
    stages,
  };
}

function findCurrentPayrollStep(payroll: PayrollDashboard): CloseStep {
  return payroll.checklist.steps.find((step) => step.status !== "done") ?? payroll.checklist.steps[payroll.checklist.steps.length - 1];
}

function buildNextActions(input: {
  attendanceExceptionCount: number;
  onboardingReadiness: Awaited<ReturnType<typeof getOnboardingReadinessReport>>;
  payroll: Awaited<ReturnType<typeof getPayrollDashboard>>;
}): NextAction[] {
  const actions: NextAction[] = [];
  const onboardingBlocker = input.onboardingReadiness.checks.find((check) => check.status === "blocked");
  const blockedPayrollStep = input.payroll.checklist.steps.find((step) => step.status === "blocked");

  if (onboardingBlocker) {
    actions.push({
      id: "onboarding",
      title: translateReadinessTitle(onboardingBlocker.title),
      detail: translateReadinessDetail(onboardingBlocker.detail),
      href: onboardingBlocker.actionHref,
      label: translateActionLabel(onboardingBlocker.actionLabel),
      status: "已阻擋",
      tone: "danger",
      primary: true,
    });
  }

  if (input.attendanceExceptionCount > 0) {
    actions.push({
      id: "attendance",
      title: "處理出勤異常",
      detail: `${input.attendanceExceptionCount} 筆待處理異常可能影響薪資月結。`,
      href: "/hr/attendance-exceptions",
      label: "開啟佇列",
      status: "薪資前需完成",
      tone: "warning",
      primary: actions.length === 0,
    });
  }

  if (blockedPayrollStep) {
    actions.push({
      id: "payroll",
      title: translatePayrollStepTitle(blockedPayrollStep.title),
      detail: translatePayrollDetail(blockedPayrollStep.detail),
      href: "/hr",
      label: "檢查月結",
      status: "月結步驟",
      tone: "warning",
      primary: actions.length === 0,
    });
  }

  if (actions.length === 0) {
    return [{
      id: "ready",
      title: "可進入上線檢查",
      detail: "目前沒有由人資負責的到職、出勤或薪資阻擋項。",
      href: "/settings/readiness",
      label: "開啟上線門檻",
      status: "已就緒",
      tone: "ready",
      primary: true,
    }];
  }

  return actions.slice(0, 3);
}

function buildCloseHealth(steps: CloseStep[]) {
  const ready = steps.filter((step) => step.status === "done").length;
  const total = steps.length || 1;
  return {
    ready,
    total,
    percent: Math.round((ready / total) * 100),
  };
}

function buildWorkspaceGroups(input: {
  pendingExceptionCount: number;
  payrollStatus: string;
  onboardingOpenCount: number;
  kpiOpenCount: number;
}): WorkspaceGroup[] {
  return [
    {
      id: "payroll",
      area: "月結",
      title: "薪資月結駕駛艙",
      summary: "清除阻擋項、試算草稿、鎖定薪資、發布薪資單，最後準備匯出檔。",
      status: labelStatus(input.payrollStatus),
      tone: input.payrollStatus === "released" ? "ready" : "warning",
      primary: { href: "/hr", label: "繼續月結" },
      links: [
        { href: "/hr/payroll-compliance", label: "合規" },
        { href: "/hr/payment-profiles", label: "付款" },
        { href: "/hr/payroll-exports", label: "銀行檔" },
      ],
    },
    {
      id: "time",
      area: "出勤",
      title: "異常佇列",
      summary: "月底前處理漏打卡、工時風險、班表、特休給假與出勤確認。",
      status: input.pendingExceptionCount ? `${input.pendingExceptionCount} 筆待處理` : "已清除",
      tone: input.pendingExceptionCount ? "danger" : "ready",
      primary: { href: "/hr/attendance-exceptions", label: "處理異常" },
      links: [
        { href: "/hr/attendance-policies", label: "政策" },
        { href: "/hr/worktime-compliance", label: "工時" },
        { href: "/hr/calendar", label: "行事曆" },
      ],
    },
    {
      id: "people",
      area: "人員作業",
      title: "員工資料準備度",
      summary: "匯入員工資料、補齊勞工名卡證據、發布文件並關閉到職缺口。",
      status: input.onboardingOpenCount ? `${input.onboardingOpenCount} 個缺口` : "已就緒",
      tone: input.onboardingOpenCount ? "warning" : "ready",
      primary: { href: "/hr/onboarding-readiness", label: "檢查缺口" },
      links: [
        { href: "/hr/employee-import", label: "匯入" },
        { href: "/hr/labor-roster", label: "勞工名卡" },
        { href: "/hr/documents", label: "文件" },
      ],
    },
    {
      id: "outcomes",
      area: "營運 KPI",
      title: "販售驗證",
      summary: "追蹤 HR One 對員工、主管、人資與資安審查是否真的更快、更安全。",
      status: input.kpiOpenCount ? `${input.kpiOpenCount} 項待改善` : "已就緒",
      tone: input.kpiOpenCount ? "warning" : "ready",
      primary: { href: "/hr/kpis", label: "開啟 KPI 看板" },
      links: [
        { href: "/settings/readiness", label: "上線門檻" },
        { href: "/settings/audit", label: "稽核" },
        { href: "/hr/forms", label: "表單" },
      ],
    },
  ];
}

function buildAdminModuleGroups(input: {
  pendingExceptionCount: number;
  payrollStatus: string;
  onboardingOpenCount: number;
}): AdminModuleGroup[] {
  return [
    {
      id: "people",
      area: "人事管理",
      title: "員工與任用",
      summary: "匯入員工、管理異動、文件、勞工名卡、訓練與離職任務。",
      status: input.onboardingOpenCount ? `${input.onboardingOpenCount} 個缺口` : "資料齊全",
      tone: input.onboardingOpenCount ? "warning" : "ready",
      primary: { href: "/hr/onboarding-readiness", label: "檢查到職準備" },
      links: [
        { href: "/hr/employee-import", label: "員工匯入" },
        { href: "/hr/employee-lifecycle", label: "人事異動" },
        { href: "/hr/documents", label: "文件證明" },
        { href: "/hr/offboarding", label: "離職作業" },
      ],
    },
    {
      id: "attendance",
      area: "出勤管理",
      title: "打卡與假勤",
      summary: "管理打卡政策、出勤異常、特休、假別、工時合規與員工出勤確認。",
      status: input.pendingExceptionCount ? `${input.pendingExceptionCount} 筆異常` : "異常清空",
      tone: input.pendingExceptionCount ? "danger" : "ready",
      primary: { href: "/hr/attendance-exceptions", label: "處理異常" },
      links: [
        { href: "/hr/attendance-policies", label: "打卡設定" },
        { href: "/hr/leave-policies", label: "假勤設定" },
        { href: "/hr/annual-leave-grants", label: "特休管理" },
        { href: "/hr/worktime-compliance", label: "工時分析" },
      ],
    },
    {
      id: "scheduling",
      area: "排班作業",
      title: "班別與行事曆",
      summary: "維護班別、公司行事曆、工時約定與排班發布前的合規條件。",
      status: "可設定",
      tone: "ready",
      primary: { href: "/hr/shift-templates", label: "開啟排班" },
      links: [
        { href: "/hr/calendar", label: "行事曆" },
        { href: "/hr/worktime-agreements", label: "工時約定" },
        { href: "/hr/attendance-signoffs", label: "出勤確認" },
      ],
    },
    {
      id: "payroll",
      area: "薪資作業",
      title: "月結與發薪",
      summary: "薪資 profile、加扣項、保險、所得稅、付款安全、匯出與薪資單發布。",
      status: labelStatus(input.payrollStatus),
      tone: input.payrollStatus === "released" ? "ready" : "warning",
      primary: { href: "/hr", label: "繼續月結" },
      links: [
        { href: "/hr/salary-profiles", label: "薪資資料" },
        { href: "/hr/payroll-profile-import", label: "薪資匯入" },
        { href: "/hr/payment-profiles", label: "付款資料" },
        { href: "/hr/payroll-exports", label: "發薪紀錄" },
      ],
    },
    {
      id: "forms",
      area: "表單簽核",
      title: "表單與公告",
      summary: "自訂表單、簽核設定、公告發布、回條追蹤與通知管道。",
      status: "統一 Inbox",
      tone: "ready",
      primary: { href: "/hr/forms", label: "建立表單" },
      links: [
        { href: "/manager/inbox", label: "簽核查詢" },
        { href: "/hr/announcements", label: "公告發布" },
        { href: "/settings/notifications", label: "簽核通知" },
        { href: "/hr/copilot", label: "AI 草稿" },
      ],
    },
    {
      id: "reports",
      area: "報表工具",
      title: "分析與稽核",
      summary: "人事、出勤、薪酬 KPI、稽核紀錄、證據包與上線準備度。",
      status: "可檢查",
      tone: "ready",
      primary: { href: "/hr/reports", label: "開啟報表" },
      links: [
        { href: "/hr/kpis", label: "KPI 指標" },
        { href: "/settings/audit", label: "稽核紀錄" },
        { href: "/settings/readiness", label: "上線檢查" },
        { href: "/settings/privacy", label: "個資治理" },
      ],
    },
  ];
}

function translateActionLabel(label: string) {
  const labels: Record<string, string> = {
    Review: "檢查",
    "Import payroll profiles": "匯入薪資資料",
    "Open readiness": "開啟準備度",
    "Open launch gate": "開啟上線門檻",
    "Open labor roster": "開啟勞工名卡",
  };
  return labels[label] ?? label;
}

function translateReadinessTitle(title: string) {
  const labels: Record<string, string> = {
    "Labor roster profiles": "勞工名卡資料",
    "Payment profiles": "付款資料",
    "Salary profiles": "薪資資料",
    "Salary profile coverage": "薪資資料",
    "Work rules": "工作規則",
  };
  return labels[title] ?? title;
}

function translateReadinessDetail(detail: string) {
  const labels: Record<string, string> = {
    "2/5 active employee(s) have complete and verified Taiwan labor roster profiles.":
      "5 位在職員工中，已有 2 位完成並驗證台灣勞工名卡資料。",
    "5/25 active employee(s) have current salary profiles.":
      "25 位在職員工中，已有 5 位具備目前生效的薪資資料。",
    "Missing punches must be resolved.": "漏打卡需先補正，才能進入薪資鎖定。",
  };
  return labels[detail] ?? detail;
}

function translateKpiName(name: string) {
  const labels: Record<string, string> = {
    "HR monthly payroll close time reduction": "HR 每月薪資結算時間降低",
    "Attendance exceptions auto-resolved before month end": "出勤異常月底前自動解決率",
    "Employee mobile task completion rate": "員工手機端任務完成率",
    "New employee first successful leave request": "新員工首次請假成功時間",
    "Manager average leave approval time": "主管平均簽核時間",
  };
  return labels[name] ?? name;
}

function translateKpiNextStep(nextStep: string) {
  const labels: Record<string, string> = {
    "Automate remaining payroll blockers: unresolved punches, pending approvals, and payment profile gaps.":
      "自動處理剩餘薪資阻擋項：漏打卡、待簽核與付款資料缺口。",
    "Turn worktime compliance findings into employee/manager nudges before payroll close.":
      "在薪資月結前，把工時合規發現轉成員工與主管提醒。",
    "Instrument task start/complete events for punch, leave, overtime, correction, forms, and payslip views.":
      "補齊打卡、請假、加班、補打卡、表單與薪資單瀏覽的開始/完成事件。",
  };
  return labels[nextStep] ?? nextStep;
}

function translateExceptionType(type: string) {
  const labels: Record<string, string> = {
    missing_clock_out: "缺少下班打卡",
    missing_clock_in: "缺少上班打卡",
    overtime_risk: "超時工時風險",
  };
  return labels[type] ?? type;
}

function translateDepartmentName(name: string) {
  const labels: Record<string, string> = {
    "People Operations": "人事營運",
    "Product Engineering": "產品工程",
  };
  return labels[name] ?? name;
}

function labelPayrollItemKind(kind: string) {
  if (kind === "earning") return "給付";
  if (kind === "deduction") return "扣項";
  if (kind === "employer_contribution") return "雇主負擔";
  return kind;
}

function translatePayrollStepTitle(title: string) {
  const labels: Record<string, string> = {
    "Attendance completeness check": "出勤完整性檢查",
    "Pending approvals check": "待簽核檢查",
    "Payroll calculation draft": "薪資試算草稿",
    "Exception review": "例外審查",
    "HR confirmation": "人資確認",
    "Payroll lock": "薪資鎖定",
    "Payslip generation": "薪資單產生",
  };
  return labels[title] ?? title;
}

function translatePayrollDetail(detail: string) {
  const labels: Record<string, string> = {
    "No payroll calculation has selected a rule version yet.": "尚未試算，因此薪資草稿還沒有綁定規則版本。",
    "Missing punches must be resolved.": "漏打卡需先補正。",
    "0 pending approval(s).": "目前沒有待簽核申請。",
    "Calculate after blockers are clear.": "阻擋項清除後即可試算。",
    "0 payroll exception(s).": "目前沒有薪資例外。",
    "HR confirmation required.": "需要人資確認。",
    "Lock prevents silent mutation.": "鎖定後不可靜默異動。",
    "Release after lock.": "鎖定後才能發布。",
  };
  return labels[detail] ?? detail;
}

function payrollGateTone(status: string) {
  if (status === "done") return "ready";
  if (status === "blocked") return "danger";
  return "warning";
}

function labelPayrollGateStatus(status: string) {
  if (status === "done") return "已完成";
  if (status === "blocked") return "阻擋";
  return "可處理";
}

function translatePayrollGateEvidence(evidence: string) {
  const labels: Record<string, string> = {
    "payrollRun.ruleVersionId, payrollItem.ruleVersionId": "薪資批次與薪資項目的規則版本",
    "attendance exceptions, approval inbox, payroll blockers": "出勤異常、簽核 Inbox 與月結阻擋項",
    "payroll item count, statutory payroll metadata, ruleVersionId": "薪資項目數、法定扣繳 metadata 與規則版本",
    "payroll confirmation audit log": "人資確認 audit log",
    "payroll lock audit log, adjustment flow": "薪資鎖定 audit log 與調整流程",
    "payslip self-access smoke, unauthorized payroll access test": "本人薪資單讀取與未授權存取測試",
  };
  return labels[evidence] ?? evidence;
}

function labelStatus(status: string) {
  const labels: Record<string, string> = {
    "not started": "尚未開始",
    draft: "草稿",
    calculated: "已試算",
    confirmed: "已確認",
    locked: "已鎖定",
    released: "已發布",
    pending: "待處理",
    reviewed: "已檢查",
    resolved: "已解決",
    blocked: "已阻擋",
    done: "已完成",
    ready: "已就緒",
    warning: "需注意",
    failing: "未達標",
  };
  return labels[status] ?? status;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}
