import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/session";
import { hasPermission } from "@/server/auth/rbac";
import {
  buildPilotCompletionUiSnapshot,
} from "@/server/readiness/pilot-completion-ui";
import type { PilotTrialCompletionCheck } from "@/server/readiness/pilot-trial-completion";

export default async function PilotCompletionPage() {
  const session = await getDemoSession();
  if (!hasPermission(session.role, "settings:read")) {
    return (
      <main className="page">
        <EmptyState
          title="需要管理權限"
          body="請切換為老闆或人資管理員角色，再檢查兩週試用結案狀態。"
        />
      </main>
    );
  }

  const snapshot = await buildPilotCompletionUiSnapshot(session);

  return (
    <main className="page">
      <section className="page-header">
        <h1>試用結案檢查</h1>
        <p>第 14 天用來判斷 20-50 人兩週試用是否可結案、是否可擴大，不顯示個資或薪資內容。</p>
      </section>

      <section className="grid">
        <section className={`panel span-12 risk-box ${snapshot.report.completed ? "success-box" : "danger-box"}`}>
          <div className="section-heading">
            <div>
              <h2>{snapshot.report.completed ? "可以結案並討論擴大試用" : "尚未可以結案"}</h2>
              <p className="muted">
                任何 Day 0/1/3/7/14 證據、KPI 或 evidence scan 未通過，都不能把試用標記為成功。
              </p>
            </div>
            <span className={`badge ${snapshot.report.blockers ? "danger" : snapshot.report.warnings ? "warning" : ""}`}>
              {snapshot.report.blockers} 阻擋 / {snapshot.report.warnings} 提醒
            </span>
          </div>
        </section>

        <div className="panel span-3 metric">
          <span className="muted">結案狀態</span>
          <strong>{snapshot.report.completed ? "完成" : "未完成"}</strong>
          <span className={`badge ${snapshot.report.completed ? "" : "danger"}`}>{snapshot.report.status}</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Checkpoint 證據</span>
          <strong>{snapshot.checkpoints.reduce((sum, item) => sum + item.recordedCount, 0)}</strong>
          <span className="badge">hash-only</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">KPI 通過</span>
          <strong>{snapshot.kpiSummary.passing}</strong>
          <span className="badge">/ {snapshot.kpiSummary.total}</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">KPI 待處理</span>
          <strong>{snapshot.kpiSummary.watch + snapshot.kpiSummary.failing}</strong>
          <span className={`badge ${snapshot.kpiSummary.failing ? "danger" : snapshot.kpiSummary.watch ? "warning" : ""}`}>
            watch/failing
          </span>
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>結案 Gate</h2>
              <p className="muted">結案只看彙總狀態、證據類型與 KPI 結果；不要把截圖原文、薪資金額或員工個資貼進報告。</p>
            </div>
            <div className="inline-actions">
              <Link className="button" href="/settings/pilot-operations">
                回每日戰情
              </Link>
              <Link className="button" href="/settings/pilot-evidence">
                整理證據包
              </Link>
              <Link className="button primary" href="/hr/kpis">
                查看 KPI
              </Link>
            </div>
          </div>
          <div className="go-no-go-check-grid" aria-label="試用結案 Gate">
            {snapshot.report.checks.map((check) => (
              <CompletionCheckCard check={check} key={check.id} />
            ))}
          </div>
        </section>

        <section className="panel span-7">
          <h2>下一步</h2>
          <ul className="task-list">
            {snapshot.report.nextActions.length ? (
              snapshot.report.nextActions.map((action) => (
                <li className="task" key={action}>
                  <span>{action}</span>
                  <span className="badge warning">待處理</span>
                </li>
              ))
            ) : (
              <li className="task">
                <span>結案 Gate 已全部通過，請保存 redacted handoff 後再討論擴大試用。</span>
                <span className="badge">完成</span>
              </li>
            )}
          </ul>
        </section>

        <section className="panel span-5">
          <h2>仍需外部證據</h2>
          <ul className="task-list">
            {snapshot.externalEvidenceGaps.map((gap) => (
              <li className="task" key={gap.title}>
                <span>
                  <strong>{gap.title}</strong>
                  <small>{gap.detail}</small>
                  <small>{gap.command}</small>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}

function CompletionCheckCard({ check }: { check: PilotTrialCompletionCheck }) {
  return (
    <article className={`go-no-go-check-card ${completionStatusClass(check.status)}`}>
      <div>
        <span className={`badge ${check.status === "block" ? "danger" : check.status === "warn" ? "warning" : ""}`}>
          {completionStatusLabel(check.status)}
        </span>
        <h3>{completionCheckTitle(check.id, check.title)}</h3>
        <p>{check.detail}</p>
      </div>
      <small>{check.nextStep}</small>
      <Link className="button" href={completionCheckHref(check.id)}>
        {completionCheckAction(check.id)}
      </Link>
    </article>
  );
}

function completionStatusClass(status: PilotTrialCompletionCheck["status"]) {
  if (status === "block") return "block";
  if (status === "warn") return "warn";
  return "pass";
}

function completionStatusLabel(status: PilotTrialCompletionCheck["status"]) {
  if (status === "block") return "阻擋";
  if (status === "warn") return "提醒";
  return "通過";
}

function completionCheckTitle(
  id: PilotTrialCompletionCheck["id"],
  fallback: string,
) {
  const labels: Record<PilotTrialCompletionCheck["id"], string> = {
    preflight_access: "權限防漏",
    day_1_employee_rollout: "Day 1 員工上線",
    day_3_leave_approval: "Day 3 打卡請假簽核",
    day_7_payroll_payslip: "Day 7 月結薪資單",
    day_14_final_review: "Day 14 audit 結案",
    kpi_targets: "KPI 目標",
    evidence_privacy: "證據隱私掃描",
  };
  return labels[id] ?? fallback;
}

function completionCheckHref(id: PilotTrialCompletionCheck["id"]) {
  const hrefs: Record<PilotTrialCompletionCheck["id"], string> = {
    preflight_access: "/settings/pilot-invite-readiness#preflight-access-review",
    day_1_employee_rollout: "/hr/announcements",
    day_3_leave_approval: "/manager/inbox",
    day_7_payroll_payslip: "/hr",
    day_14_final_review: "/settings/pilot-operations#day_14",
    kpi_targets: "/hr/kpis",
    evidence_privacy: "/settings/readiness#pilot-runbook",
  };
  return hrefs[id];
}

function completionCheckAction(id: PilotTrialCompletionCheck["id"]) {
  const labels: Record<PilotTrialCompletionCheck["id"], string> = {
    preflight_access: "看邀請 Gate",
    day_1_employee_rollout: "看公告",
    day_3_leave_approval: "開啟 Inbox",
    day_7_payroll_payslip: "看月結",
    day_14_final_review: "記錄 Day 14",
    kpi_targets: "看 KPI",
    evidence_privacy: "看安全規則",
  };
  return labels[id];
}
