import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/demo-session";
import { getCompanyOverview } from "@/server/dashboard/queries";
import { getHrOneKpis, summarizeHrOneKpis } from "@/server/kpis/hr-one";
import { getOnboardingReadinessReport } from "@/server/onboarding/readiness";
import { getPayrollDashboard } from "@/server/payroll/service";
import { getHrAttendanceExceptions } from "@/server/workflows/service";

export default async function HrDashboardPage() {
  const [session, overview] = await Promise.all([getDemoSession(), getCompanyOverview()]);
  const [exceptions, payroll, onboardingReadiness, kpis] = await Promise.all([
    getHrAttendanceExceptions(session),
    getPayrollDashboard(session),
    getOnboardingReadinessReport(session),
    getHrOneKpis(),
  ]);
  const kpiSummary = summarizeHrOneKpis(kpis);
  const focusKpis = kpis.filter((kpi) => kpi.status !== "passing").slice(0, 3);
  const pendingExceptionCount = exceptions.filter((item) => item.status === "pending").length;
  const nextActions = buildNextActions({
    attendanceExceptionCount: pendingExceptionCount,
    onboardingReadiness,
    payroll,
  });
  const closeHealth = buildCloseHealth(payroll.checklist.steps);
  const workspaceGroups = buildWorkspaceGroups({
    pendingExceptionCount,
    payrollStatus: payroll.run?.status ?? "not started",
    onboardingOpenCount: onboardingReadiness.checks.filter((check) => check.status !== "ready").length,
    kpiOpenCount: kpiSummary.watch + kpiSummary.failing,
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
      <section className="page-header">
        <h1>月結主控台</h1>
        <p>人資首頁以待處理流程與異常為核心，而不是一長串功能選單。</p>
      </section>

      <section className="grid">
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

        <section className="panel span-12 finance-strip">
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

        <section className="panel span-12 command-panel">
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

        <section className="span-12 workspace-grid" aria-label="人資作業工作區">
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

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>員工與表單</h2>
              <p className="muted">員工生命週期工具集中在此，日常優先事項仍以上方工作卡為主。</p>
            </div>
            <div className="inline-actions">
              <a className="button" href="/hr/employee-import">
                匯入
              </a>
              <a className="button" href="/hr/onboarding-readiness">
                到職準備
              </a>
              <a className="button" href="/hr/employee-lifecycle">
                生命週期
              </a>
              <a className="button" href="/hr/employment-terms">
                勞動條件
              </a>
              <a className="button" href="/hr/labor-roster">
                勞工名卡
              </a>
              <a className="button" href="/hr/offboarding">
                離職
              </a>
              <a className="button" href="/hr/documents">
                文件
              </a>
              <a className="button" href="/hr/announcements">
                公告
              </a>
              <a className="button" href="/hr/work-rules">
                工作規則
              </a>
              <a className="button" href="/hr/training">
                訓練
              </a>
              <a className="button" href="/hr/incidents">
                職安通報
              </a>
              <a className="button" href="/hr/copilot">
                AI Copilot
              </a>
              <a className="button" href="/hr/policy-sources">
                政策來源
              </a>
              <a className="button" href="/hr/kpis">
                KPIs
              </a>
              <a className="button primary" href="/hr/forms">
                開啟表單建立器
              </a>
            </div>
          </div>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>出勤假勤</h2>
              <p className="muted">政策設定與異常處理可由後台調整，不需改程式。</p>
            </div>
            <div className="inline-actions">
              <a className="button" href="/hr/shift-templates">
                班別範本
              </a>
              <a className="button" href="/hr/attendance-policies">
                出勤政策
              </a>
              <a className="button" href="/hr/attendance-exceptions">
                異常
              </a>
              <a className="button" href="/hr/attendance-signoffs">
                出勤確認
              </a>
              <a className="button" href="/hr/worktime-compliance">
                工時合規
              </a>
              <a className="button" href="/hr/worktime-agreements">
                工時約定
              </a>
              <a className="button" href="/hr/calendar">
                公司行事曆
              </a>
              <a className="button" href="/hr/annual-leave-grants">
                特休給假
              </a>
              <a className="button" href="/hr/annual-leave-expiry">
                特休到期
              </a>
              <a className="button primary" href="/hr/leave-policies">
                假別政策
              </a>
            </div>
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
                    <strong>{kpi.name}</strong>
                    <small>目標 {kpi.target} · 目前 {kpi.current}</small>
                    <small>{kpi.nextStep}</small>
                  </span>
                  <span className={`badge ${kpi.status === "failing" ? "danger" : "warning"}`}>
                    {labelStatus(kpi.status)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="panel span-12">
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
                Insurance
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
              <p>{payroll.checklist.ruleReview.detail}</p>
              <p className="muted">
                啟用規則 {payroll.checklist.ruleReview.activeRuleVersion}；薪資草稿規則{" "}
                {payroll.checklist.ruleReview.payrollRuleVersionId ?? "尚未試算"}。
              </p>
            </div>
          ) : (
            <div className="risk-box">
              <strong>規則版本已就緒</strong>
              <p>{payroll.checklist.ruleReview.detail}</p>
            </div>
          )}

          <ol className="close-steps">
            {payroll.checklist.steps.map((step) => (
              <li key={step.step} className={`close-step ${step.status}`}>
                <strong>
                  {step.step}. {step.title}
                </strong>
                <span>{step.detail}</span>
              </li>
            ))}
          </ol>

          {payroll.run ? (
            <div className="payroll-preview">
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

        <div className="panel span-8">
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
                    <small>{exception.exceptionType}</small>
                  </span>
                  <span className={`badge ${exception.severity === "warning" ? "warning" : "danger"}`}>
                    {labelStatus(exception.status)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel span-4">
          <h2>部門</h2>
          <ul className="task-list">
            {overview.company.departments.map((department) => (
              <li className="task" key={department.id}>
                <span>{department.name}</span>
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

type CloseStep = Awaited<ReturnType<typeof getPayrollDashboard>>["checklist"]["steps"][number];

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
      title: onboardingBlocker.title,
      detail: onboardingBlocker.detail,
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
      title: blockedPayrollStep.title,
      detail: blockedPayrollStep.detail,
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

function translateActionLabel(label: string) {
  const labels: Record<string, string> = {
    Review: "檢查",
    "Open readiness": "開啟準備度",
    "Open launch gate": "開啟上線門檻",
  };
  return labels[label] ?? label;
}

function labelPayrollItemKind(kind: string) {
  if (kind === "earning") return "給付";
  if (kind === "deduction") return "扣項";
  if (kind === "employer_contribution") return "雇主負擔";
  return kind;
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
