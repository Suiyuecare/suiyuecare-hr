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

  return (
    <main className="page">
      <section className="page-header">
        <h1>公司導入精靈</h1>
        <p>把正式試用前的設定收斂成 9 個步驟：公司、人員、帳號、班表、打卡、假別、簽核、公告、薪資與 audit。</p>
      </section>

      <section className="grid">
        {params.error ? (
          <div className="panel span-12 risk-box danger-box">
            <strong>無法執行導入動作</strong>
            <p>{params.error}</p>
          </div>
        ) : null}

        {params.success && isCompanySetupActionId(params.success) ? (
          <div className={`panel span-12 risk-box ${params.status === "needs_review" ? "warning-box" : "success-box"}`}>
            <strong>{companySetupActionLabels[params.success]}</strong>
            <p>{actionSuccessMessage(params.success, params.status)}</p>
          </div>
        ) : null}

        <section className={`panel span-12 risk-box ${statusBoxClass(report.status)}`}>
          <div className="section-heading">
            <div>
              <h2>{statusTitle(report.status)}</h2>
              <p className="muted">
                {report.companyName ?? "尚未建立公司"} · 目標是讓 20-50 人可以試用兩週，完成打卡、請假、簽核、公告、月結預演與薪資單查看。
              </p>
            </div>
            <span className={`badge ${report.blockedStepCount ? "danger" : report.warningStepCount ? "warning" : ""}`}>
              {report.completedStepCount}/{report.totalStepCount} 完成
            </span>
          </div>
        </section>

        <div className="panel span-3 metric">
          <span className="muted">完成</span>
          <strong>{report.completedStepCount}</strong>
          <span className="badge">導入步驟</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">阻擋</span>
          <strong>{report.blockedStepCount}</strong>
          <span className={`badge ${report.blockedStepCount ? "danger" : ""}`}>不可發邀請</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">提醒</span>
          <strong>{report.warningStepCount}</strong>
          <span className={`badge ${report.warningStepCount ? "warning" : ""}`}>需說明</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">試用人數</span>
          <strong>{report.pilotEmployeeRangeReady ? "OK" : "未達"}</strong>
          <span className={`badge ${report.pilotEmployeeRangeReady ? "" : "danger"}`}>20-50 人</span>
        </div>

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
          <ol className="close-steps">
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

        <section className="panel span-12">
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
  return "";
}

function statusBoxClass(status: CompanySetupStepStatus) {
  if (status === "complete") return "success-box";
  if (status === "blocked") return "danger-box";
  return "";
}
