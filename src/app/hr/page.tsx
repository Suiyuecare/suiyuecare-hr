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
          title="No seed data yet"
          body="Run the database migration and seed commands from README before opening the HR dashboard."
        />
      </main>
    );
  }

  return (
    <main className="page">
      <section className="page-header">
        <h1>Monthly Close</h1>
        <p>HR starts from closing blockers and exceptions, not a function menu.</p>
      </section>

      <section className="grid">
        <div className="panel span-4 metric">
          <span className="muted">Employees</span>
          <strong>{overview.employeeCount}</strong>
          <span className="badge">{overview.company.name}</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Attendance blockers</span>
          <strong>{pendingExceptionCount}</strong>
          <span className="badge warning">Before payroll</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">KPI focus</span>
          <strong>{kpiSummary.watch + kpiSummary.failing}</strong>
          <span className={`badge ${kpiSummary.readyForSale ? "" : "warning"}`}>Sale gate</span>
        </div>

        <section className="panel span-12 finance-strip">
          <div>
            <span className="muted">Close health</span>
            <strong>{closeHealth.ready}/{closeHealth.total} ready</strong>
          </div>
          <div className="health-meter" aria-label={`Payroll close health ${closeHealth.percent}%`}>
            <span style={{ width: `${closeHealth.percent}%` }} />
          </div>
          <div className="finance-strip-meta">
            <span className="badge">{payroll.run?.status ?? "not started"}</span>
            <span className={`badge ${kpiSummary.readyForSale ? "" : "warning"}`}>
              {kpiSummary.passing}/{kpiSummary.total} KPIs passing
            </span>
            <span className="badge">Rules {overview.activeRuleCount}</span>
          </div>
        </section>

        <section className="panel span-12 command-panel">
          <div className="section-heading">
            <div>
              <h2>Next Actions</h2>
              <p className="muted">The shortest path to payroll close and customer launch readiness.</p>
            </div>
            <span className={`badge ${nextActions.some((action) => action.tone === "danger") ? "danger" : nextActions.some((action) => action.tone === "warning") ? "warning" : ""}`}>
              {nextActions.filter((action) => action.tone !== "ready").length} open
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

        <section className="span-12 workspace-grid" aria-label="HR operations workspace">
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
              <h2>Employee forms</h2>
              <p className="muted">Fast access for employee lifecycle tools; day-to-day priorities stay above in the workspace cards.</p>
            </div>
            <div className="inline-actions">
              <a className="button" href="/hr/employee-import">
                Import
              </a>
              <a className="button" href="/hr/onboarding-readiness">
                Readiness
              </a>
              <a className="button" href="/hr/employee-lifecycle">
                Lifecycle
              </a>
              <a className="button" href="/hr/employment-terms">
                Terms
              </a>
              <a className="button" href="/hr/labor-roster">
                Labor roster
              </a>
              <a className="button" href="/hr/offboarding">
                Offboarding
              </a>
              <a className="button" href="/hr/documents">
                Documents
              </a>
              <a className="button" href="/hr/work-rules">
                Work rules
              </a>
              <a className="button" href="/hr/training">
                Training
              </a>
              <a className="button" href="/hr/incidents">
                Incidents
              </a>
              <a className="button" href="/hr/copilot">
                AI Copilot
              </a>
              <a className="button" href="/hr/policy-sources">
                Policy sources
              </a>
              <a className="button" href="/hr/kpis">
                KPIs
              </a>
              <a className="button primary" href="/hr/forms">
                Open builder
              </a>
            </div>
          </div>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Time operations</h2>
              <p className="muted">Policy setup and exception tools stay configurable without code changes.</p>
            </div>
            <div className="inline-actions">
              <a className="button" href="/hr/shift-templates">
                Shift templates
              </a>
              <a className="button" href="/hr/attendance-policies">
                Attendance policies
              </a>
              <a className="button" href="/hr/attendance-exceptions">
                Exceptions
              </a>
              <a className="button" href="/hr/attendance-signoffs">
                Sign-offs
              </a>
              <a className="button" href="/hr/worktime-compliance">
                Worktime compliance
              </a>
              <a className="button" href="/hr/worktime-agreements">
                Worktime agreements
              </a>
              <a className="button" href="/hr/calendar">
                Company calendar
              </a>
              <a className="button" href="/hr/annual-leave-grants">
                Annual grants
              </a>
              <a className="button" href="/hr/annual-leave-expiry">
                Leave expiry
              </a>
              <a className="button primary" href="/hr/leave-policies">
                Leave policies
              </a>
            </div>
          </div>
        </section>

        {focusKpis.length > 0 ? (
          <section className="panel span-12">
            <div className="section-heading">
              <div>
                <h2>KPI focus</h2>
                <p className="muted">Use these product outcomes to keep HR One fast enough to sell, not just feature-complete.</p>
              </div>
              <a className="button" href="/hr/kpis">
                Open scorecard
              </a>
            </div>
            <ul className="task-list">
              {focusKpis.map((kpi) => (
                <li className="task" key={kpi.id}>
                  <span>
                    <strong>{kpi.name}</strong>
                    <small>Target {kpi.target} · current {kpi.current}</small>
                    <small>{kpi.nextStep}</small>
                  </span>
                  <span className={`badge ${kpi.status === "failing" ? "danger" : "warning"}`}>
                    {kpi.status}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Payroll close</h2>
              <p className="muted">
                HR must clear blockers, calculate, confirm, lock, then release payslips.
              </p>
            </div>
            <div className="inline-actions">
              <a className="button" href="/hr/salary-profiles">
                Salary profiles
              </a>
              <a className="button" href="/hr/payroll-profile-import">
                Profile import
              </a>
              <a className="button" href="/hr/payment-profiles">
                Payment profiles
              </a>
              <a className="button" href="/hr/payroll-payment-security">
                Payment security
              </a>
              <a className="button" href="/hr/payroll-compliance">
                Compliance profiles
              </a>
              <a className="button" href="/hr/insurance">
                Insurance
              </a>
              <a className="button" href="/hr/payroll-recordkeeping">
                Recordkeeping
              </a>
              <a className="button" href="/hr/annual-leave-settlements">
                Annual leave
              </a>
              <a className="button" href="/hr/payroll-accounting">
                Accounting
              </a>
              <a className="button" href="/hr/payroll-adjustments">
                Adjustments
              </a>
              <a className="button" href="/hr/payroll-exports">
                Exports
              </a>
              <span className="badge">{payroll.run?.status ?? "not started"}</span>
            </div>
          </div>

          <div className="action-row payroll-actions">
            <form action="/api/payroll/create" method="post">
              <button className="button primary" type="submit">
                Create run
              </button>
            </form>
            <form action="/api/payroll/resolve-blockers" method="post">
              <button className="button" type="submit">
                Mark blockers reviewed
              </button>
            </form>
            <form action="/api/payroll/recalculate" method="post">
              <button className="button" type="submit">
                Calculate draft
              </button>
            </form>
            <form action="/api/payroll/confirm" method="post">
              <button className="button" type="submit">
                HR confirm
              </button>
            </form>
            <form action="/api/payroll/lock" method="post">
              <button className="button" type="submit">
                Lock payroll
              </button>
            </form>
            <form action="/api/payroll/release" method="post">
              <button className="button" type="submit">
                Release payslips
              </button>
            </form>
          </div>

          {payroll.checklist.ruleReview.blocksLock ? (
            <div className="risk-box danger-box">
              <strong>Rule review required before payroll lock</strong>
              <p>{payroll.checklist.ruleReview.detail}</p>
              <p className="muted">
                Active rule {payroll.checklist.ruleReview.activeRuleVersion}; payroll draft rule{" "}
                {payroll.checklist.ruleReview.payrollRuleVersionId ?? "not calculated yet"}.
              </p>
            </div>
          ) : (
            <div className="risk-box">
              <strong>Rule version ready</strong>
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
                <span className="muted">Gross draft</span>
                <strong>{formatMoney(payroll.run.grossTotal)}</strong>
              </div>
              <div className="metric">
                <span className="muted">Deductions</span>
                <strong>{formatMoney(payroll.run.deductionTotal)}</strong>
              </div>
              <div className="metric">
                <span className="muted">Net draft</span>
                <strong>{formatMoney(payroll.run.netTotal)}</strong>
              </div>
              <div className="metric">
                <span className="muted">Employer statutory cost</span>
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
                    <small>{item.kind} · rule {item.ruleVersionId ?? "n/a"}</small>
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
              <h2>Attendance exceptions</h2>
              <p className="muted">Resolve blockers before payroll close.</p>
            </div>
            <a className="button" href="/hr/attendance-exceptions">
              Open queue
            </a>
          </div>
          {exceptions.length === 0 ? (
            <p className="muted">No attendance exceptions.</p>
          ) : (
            <ul className="task-list">
              {exceptions.map((exception) => (
                <li className="task" key={exception.id}>
                  <span>
                    <strong>{exception.employeeName}</strong>
                    <small>{exception.exceptionType}</small>
                  </span>
                  <span className={`badge ${exception.severity === "warning" ? "warning" : "danger"}`}>
                    {exception.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel span-4">
          <h2>Departments</h2>
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
      label: onboardingBlocker.actionLabel,
      status: "Blocked",
      tone: "danger",
      primary: true,
    });
  }

  if (input.attendanceExceptionCount > 0) {
    actions.push({
      id: "attendance",
      title: "Clear attendance exceptions",
      detail: `${input.attendanceExceptionCount} pending exception(s) can affect payroll close.`,
      href: "/hr/attendance-exceptions",
      label: "Open queue",
      status: "Before payroll",
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
      label: "Review close",
      status: "Close step",
      tone: "warning",
      primary: actions.length === 0,
    });
  }

  if (actions.length === 0) {
    return [{
      id: "ready",
      title: "Ready for controlled launch review",
      detail: "No HR-owned onboarding, attendance, or payroll blockers are currently open.",
      href: "/settings/readiness",
      label: "Open launch gate",
      status: "Ready",
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
      area: "Monthly close",
      title: "Payroll close cockpit",
      summary: "Clear blockers, calculate draft, lock payroll, release payslips, then prepare exports.",
      status: input.payrollStatus,
      tone: input.payrollStatus === "released" ? "ready" : "warning",
      primary: { href: "/hr", label: "Continue close" },
      links: [
        { href: "/hr/payroll-compliance", label: "Compliance" },
        { href: "/hr/payment-profiles", label: "Payment" },
        { href: "/hr/payroll-exports", label: "Bank packages" },
      ],
    },
    {
      id: "time",
      area: "Attendance",
      title: "Exception queue",
      summary: "Resolve missing punches, worktime risks, schedules, leave grants, and sign-offs before month end.",
      status: input.pendingExceptionCount ? `${input.pendingExceptionCount} pending` : "clear",
      tone: input.pendingExceptionCount ? "danger" : "ready",
      primary: { href: "/hr/attendance-exceptions", label: "Resolve exceptions" },
      links: [
        { href: "/hr/attendance-policies", label: "Policies" },
        { href: "/hr/worktime-compliance", label: "Worktime" },
        { href: "/hr/calendar", label: "Calendar" },
      ],
    },
    {
      id: "people",
      area: "People ops",
      title: "Employee readiness",
      summary: "Import employee data, collect labor roster evidence, publish documents, and close onboarding gaps.",
      status: input.onboardingOpenCount ? `${input.onboardingOpenCount} gaps` : "ready",
      tone: input.onboardingOpenCount ? "warning" : "ready",
      primary: { href: "/hr/onboarding-readiness", label: "Review gaps" },
      links: [
        { href: "/hr/employee-import", label: "Import" },
        { href: "/hr/labor-roster", label: "Labor roster" },
        { href: "/hr/documents", label: "Documents" },
      ],
    },
    {
      id: "outcomes",
      area: "Operating KPIs",
      title: "Sales proof",
      summary: "Track whether HR One is faster for employees, managers, HR admins, and security reviewers.",
      status: input.kpiOpenCount ? `${input.kpiOpenCount} focus` : "ready",
      tone: input.kpiOpenCount ? "warning" : "ready",
      primary: { href: "/hr/kpis", label: "Open scorecard" },
      links: [
        { href: "/settings/readiness", label: "Launch gate" },
        { href: "/settings/audit", label: "Audit" },
        { href: "/hr/forms", label: "Forms" },
      ],
    },
  ];
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}
