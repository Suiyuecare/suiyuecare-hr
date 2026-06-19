import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { hasPermission, type Permission, type RoleKey } from "@/server/auth/rbac";
import { getDemoSession } from "@/server/auth/session";
import {
  companySetupActionLabels,
  companySetupActionPermission,
  isCompanySetupActionId,
  type CompanySetupActionId,
} from "@/server/readiness/company-setup-actions";
import {
  getCompanySetupWizardReport,
  type CompanySetupWizardReport,
  type CompanySetupWizardStep,
  type CompanySetupStepStatus,
} from "@/server/readiness/company-setup-wizard";

type SearchParams = Promise<{
  success?: string;
  status?: string;
  error?: string;
}>;

export default async function CompanySetupPage({ searchParams }: { searchParams: SearchParams }) {
  const [params, session] = await Promise.all([searchParams, getDemoSession()]);
  if (!hasPermission(session.role, "settings:read")) {
    return (
      <main className="page">
        <EmptyState
          title="需要管理權限"
          body="請切換為老闆或人資管理員角色，再開啟公司導入精靈。"
        />
      </main>
    );
  }

  const report = await getCompanySetupWizardReport(session);
  const completionPercent = Math.round((report.completedStepCount / report.totalStepCount) * 100);
  const focusStep = getFocusStep(report);
  const focusStatus = focusStep?.status ?? report.status;
  const commandCards = buildSetupCommandCards(report);

  return (
    <main className="page settings-control-page company-setup-page">
      <section className="settings-control-hero company-setup-hero" aria-label="公司導入工作台">
        <div className="settings-control-hero-main">
          <div className="settings-control-hero-topline">
            <span className="badge">20-50 人兩週試用</span>
            <span className={`badge ${badgeClass(report.status)}`}>{statusTitle(report.status)}</span>
          </div>
          <h1>公司導入精靈</h1>
          <p>
            把正式試用前的設定收斂成 HR 能每天操作的導入工作台：公司、人員、帳號、班表、打卡、假別、簽核、公告、月結預演、薪資單與 audit 證據都在同一條路徑上。
          </p>
          <div className="settings-control-hero-actions">
            <Link className="button primary" href="/settings/pilot-import-preflight">
              先做匯入預檢
            </Link>
            <Link className="button" href="/settings/pilot-invite-readiness">
              檢查邀請就緒
            </Link>
            <Link className="button" href="/settings/pilot-operations">
              開啟每日戰情
            </Link>
          </div>
        </div>
        <aside className={`settings-control-focus ${focusBoxClass(focusStatus)}`} aria-label="今日先處理">
          <span className="badge">今日先處理</span>
          <strong>{focusStep ? focusStep.title : "可以準備邀請員工"}</strong>
          <p>
            {focusStep
              ? `${focusStep.owner} 負責。${focusStep.missing[0] ?? focusStep.detail}`
              : "導入條件已達最低門檻，請跑邀請就緒與 Go/No-Go，再發出第一批員工邀請。"}
          </p>
          <small>
            {report.companyName ?? "尚未建立公司"} · {report.completedStepCount}/{report.totalStepCount} 步完成 ·
            導入進度 {completionPercent}%
          </small>
          <Link className="button primary" href={focusStep?.primaryHref ?? "/settings/pilot-go-no-go"}>
            {focusStep?.primaryLabel ?? "跑 Go/No-Go"}
          </Link>
        </aside>
      </section>

      <section className="company-setup-alerts" aria-live="polite">
        {params.error ? (
          <div className="panel risk-box danger-box">
            <strong>無法執行導入動作</strong>
            <p>{params.error}</p>
          </div>
        ) : null}

        {params.success && isCompanySetupActionId(params.success) ? (
          <div className={`panel risk-box ${params.status === "needs_review" ? "warning-box" : "success-box"}`}>
            <strong>{companySetupActionLabels[params.success]}</strong>
            <p>{actionSuccessMessage(params.success, params.status)}</p>
          </div>
        ) : null}
      </section>

      <section className="settings-signal-board" aria-label="導入狀態訊號板">
        <article className={`settings-signal-card ${signalCardClass(report.status)}`}>
          <span>導入進度</span>
          <strong>{completionPercent}%</strong>
          <small>{report.completedStepCount}/{report.totalStepCount} 個導入步驟已完成</small>
        </article>
        <article className={`settings-signal-card ${report.pilotEmployeeRangeReady ? "done" : "danger"}`}>
          <span>試用名單</span>
          <strong>{report.pilotEmployeeRangeReady ? "人數 OK" : "未達門檻"}</strong>
          <small>目標為 20-50 人，足夠驗證手機任務、簽核與月結。</small>
        </article>
        <article className={`settings-signal-card ${report.blockedStepCount ? "danger" : report.warningStepCount ? "warning" : "done"}`}>
          <span>阻擋與提醒</span>
          <strong>
            {report.blockedStepCount} 阻擋 / {report.warningStepCount} 提醒
          </strong>
          <small>紅色阻擋清掉前，不建議邀請真實員工。</small>
        </article>
        <article className="settings-signal-card focus">
          <span>下一個動作</span>
          <strong>{focusStep?.primaryLabel ?? "跑邀請 Gate"}</strong>
          <small>{focusStep?.detail ?? "確認邀請就緒、Go/No-Go 與證據掃描都完成。"}</small>
        </article>
      </section>

      <section className="settings-command-grid" aria-label="導入作業區">
        {commandCards.map((card) => (
          <article className={`settings-command-card ${card.tone}`} key={card.title}>
            <span className={`badge ${card.badgeClass}`}>{card.kicker}</span>
            <h2>{card.title}</h2>
            <p>{card.body}</p>
            <Link className="button primary" href={card.href}>
              {card.action}
            </Link>
            <div className="settings-command-links">
              {card.links.map((link) => (
                <Link href={link.href} key={link.href}>
                  {link.label}
                </Link>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="grid">
        <section className="panel span-8">
          <div className="section-heading">
            <div>
              <h2>導入步驟</h2>
              <p className="muted">依順序清掉紅色阻擋；黃色提醒要指定負責人與處理期限。</p>
            </div>
            <div className="inline-actions">
              <Link className="button" href="/settings/pilot-invite-readiness">
                邀請就緒
              </Link>
              <Link className="button" href="/settings/pilot-operations">
                每日戰情
              </Link>
            </div>
          </div>
          <ol className="close-steps company-setup-steps">
            {report.steps.map((step, index) => {
              const setupAction = setupActionForStep(step.id, session.role);
              return (
                <li key={step.id} className={`close-step ${step.status === "complete" ? "done" : step.status}`}>
                  <div className="section-heading compact-heading">
                    <span>
                      <strong>
                        {index + 1}. {step.title}
                      </strong>
                      <small>
                        {step.owner} · {step.detail}
                      </small>
                    </span>
                    <span className={`badge ${badgeClass(step.status)}`}>{statusLabel(step.status)}</span>
                  </div>
                  {step.missing.length ? (
                    <span>待處理：{step.missing.join("、")}</span>
                  ) : (
                    <span>這一步已具備兩週試用所需的最低條件。</span>
                  )}
                  <div className="inline-actions setup-step-actions">
                    <Link className="button" href={step.primaryHref}>
                      {step.primaryLabel}
                    </Link>
                    {setupAction ? (
                      <form action="/api/settings/company-setup/action" method="post">
                        <input type="hidden" name="actionId" value={setupAction.actionId} />
                        <button className="button primary" type="submit">
                          {setupAction.label}
                        </button>
                      </form>
                    ) : null}
                  </div>
                  {setupAction ? <small className="setup-step-hint">{setupAction.helper}</small> : null}
                </li>
              );
            })}
          </ol>
        </section>

        <section className="panel span-4">
          <h2>下一步</h2>
          <ul className="task-list">
            {report.nextActions.length ? (
              report.nextActions.slice(0, 6).map((action) => (
                <li className="task" key={action}>
                  <span>{action}</span>
                  <span className="badge warning">待辦</span>
                </li>
              ))
            ) : (
              <li className="task">
                <span>可以跑試用邀請就緒與 Go/No-Go，準備正式邀請員工。</span>
                <span className="badge">ready</span>
              </li>
            )}
          </ul>
        </section>

        <section className="panel span-12 company-setup-guardrails">
          <div className="section-heading">
            <div>
              <h2>隱私與權限護欄</h2>
              <p className="muted">導入精靈只顯示覆蓋率與狀態；實際名單、薪資與帳號資料留在各自權限頁處理。</p>
            </div>
            <Link className="button primary" href="/settings/readiness">
              回上線準備度
            </Link>
          </div>
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

function setupActionForStep(stepId: string, role: RoleKey) {
  const action = setupActionsByStep[stepId];
  if (!action) return null;
  if (!hasPermission(role, action.permission)) return null;
  return action;
}

const setupActionsByStep: Record<string, {
  actionId: CompanySetupActionId;
  label: string;
  permission: Permission;
  helper: string;
}> = {
  shift_schedule: {
    actionId: "generate_14_day_schedules",
    label: companySetupActionLabels.generate_14_day_schedules,
    permission: companySetupActionPermission("generate_14_day_schedules"),
    helper: "不覆蓋既有班表，只補未來 14 天缺口。",
  },
  leave_balance: {
    actionId: "sync_leave_balances",
    label: companySetupActionLabels.sync_leave_balances,
    permission: companySetupActionPermission("sync_leave_balances"),
    helper: "依啟用中的假別政策同步員工餘額。",
  },
  announcement_receipts: {
    actionId: "publish_trial_announcement",
    label: companySetupActionLabels.publish_trial_announcement,
    permission: companySetupActionPermission("publish_trial_announcement"),
    helper: "建立一則需要回條的兩週試用公告。",
  },
  payroll_payslip: {
    actionId: "run_payroll_rehearsal",
    label: companySetupActionLabels.run_payroll_rehearsal,
    permission: companySetupActionPermission("run_payroll_rehearsal"),
    helper: "Demo 會完整演練；正式資料若有阻擋會停在 HR 月結確認。",
  },
};

function actionSuccessMessage(actionId: CompanySetupActionId, status?: string) {
  if (status === "needs_review") {
    return "已執行可安全自動處理的部分，剩餘項目需要 HR 到對應流程人工確認。";
  }
  if (status === "skipped") {
    return "這個項目已經具備最低條件，系統沒有重複建立資料。";
  }
  if (actionId === "run_payroll_rehearsal") {
    return "已完成月結演練動作；導入精靈會重新計算薪資單釋出覆蓋率。";
  }
  return "已完成導入動作，精靈狀態已重新整理。";
}

function statusTitle(status: CompanySetupStepStatus) {
  if (status === "complete") return "公司已具備兩週試用的導入條件";
  if (status === "warning") return "可準備試用，但仍有提醒要處理";
  return "尚未可以邀請真實員工試用";
}

function statusLabel(status: CompanySetupStepStatus) {
  if (status === "complete") return "完成";
  if (status === "warning") return "提醒";
  return "阻擋";
}

function badgeClass(status: CompanySetupStepStatus) {
  if (status === "blocked") return "danger";
  if (status === "warning") return "warning";
  return "done";
}

function signalCardClass(status: CompanySetupStepStatus) {
  if (status === "complete") return "done";
  if (status === "warning") return "warning";
  return "danger";
}

function focusBoxClass(status: CompanySetupStepStatus) {
  if (status === "blocked") return "danger";
  if (status === "warning") return "warning";
  return "";
}

function getFocusStep(report: CompanySetupWizardReport) {
  return (
    report.steps.find((step) => step.status === "blocked") ??
    report.steps.find((step) => step.status === "warning") ??
    null
  );
}

type SetupCommandCard = {
  kicker: string;
  title: string;
  body: string;
  action: string;
  href: string;
  tone: "ready" | "warning" | "danger";
  badgeClass: "done" | "warning" | "danger";
  links: Array<{ label: string; href: string }>;
};

function buildSetupCommandCards(report: CompanySetupWizardReport): SetupCommandCard[] {
  const cardInputs = [
    {
      kicker: "公司基礎",
      title: "試用名單與匯入",
      body: "先把公司、部門、主管線、員工登入與 RBAC 收斂，避免後續簽核、薪資或公告找不到負責人。",
      action: "開啟匯入預檢",
      href: "/settings/pilot-import-preflight",
      stepIds: ["company_structure", "employee_access"],
      links: [
        { label: "員工資料", href: "/hr/employee-lifecycle" },
        { label: "權限管理", href: "/settings/access" },
      ],
    },
    {
      kicker: "員工任務",
      title: "假勤、排班與簽核",
      body: "員工手機打卡、請假、加班與補打卡都要能在三步內完成，主管只從統一 Inbox 處理。",
      action: "設定打卡與假別",
      href: "/hr/attendance-policies",
      stepIds: ["shift_schedule", "attendance_punch", "leave_balance", "approval_inbox"],
      links: [
        { label: "排班規則", href: "/hr/shift-templates" },
        { label: "假別餘額", href: "/hr/leave-policies" },
        { label: "簽核 Inbox", href: "/manager/inbox" },
      ],
    },
    {
      kicker: "Day 1 啟用",
      title: "公告、教學與回條",
      body: "發布第一則試用公告與員工回條，讓第一週教學時間壓在 10 分鐘內，且每筆回覆可追蹤。",
      action: "準備試用公告",
      href: "/hr/announcements",
      stepIds: ["announcement_receipts"],
      links: [
        { label: "邀請就緒檢查", href: "/settings/pilot-invite-readiness" },
        { label: "每日戰情", href: "/settings/pilot-operations" },
      ],
    },
    {
      kicker: "Day 7-14",
      title: "月結預演與證據",
      body: "月結前先看出勤完整性、待簽核、薪資單釋出與 audit 覆蓋，不讓系統靜默鎖薪。",
      action: "開啟試用批次",
      href: "/settings/pilot-trial-run",
      stepIds: ["payroll_payslip", "audit_privacy"],
      links: [
        { label: "HR 月結", href: "/hr" },
        { label: "證據包", href: "/settings/pilot-evidence" },
        { label: "上線 Gate", href: "/settings/readiness" },
      ],
    },
  ];

  return cardInputs.map((card) => {
    const { stepIds, ...commandCard } = card;
    const status = worstStatus(stepIds.map((id) => report.steps.find((step) => step.id === id)).filter(isStep));
    return {
      ...commandCard,
      tone: status === "complete" ? "ready" : status === "warning" ? "warning" : "danger",
      badgeClass: badgeClass(status) as "done" | "warning" | "danger",
    };
  });
}

function worstStatus(steps: CompanySetupWizardStep[]) {
  if (steps.some((step) => step.status === "blocked")) return "blocked";
  if (steps.some((step) => step.status === "warning")) return "warning";
  return "complete";
}

function isStep(step: CompanySetupWizardStep | undefined): step is CompanySetupWizardStep {
  return Boolean(step);
}
