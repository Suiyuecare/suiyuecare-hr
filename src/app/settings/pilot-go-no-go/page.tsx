import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/session";
import { hasPermission } from "@/server/auth/rbac";
import {
  buildPilotGoNoGoUiSnapshot,
} from "@/server/readiness/pilot-go-no-go-ui";
import type { PilotGoNoGoCheck } from "@/server/readiness/pilot-go-no-go";

type SearchParams = Promise<{
  tenantSlug?: string;
  companyId?: string;
}>;

export default async function PilotGoNoGoPage({ searchParams }: { searchParams: SearchParams }) {
  const [params, session] = await Promise.all([searchParams, getDemoSession()]);
  if (!hasPermission(session.role, "settings:read")) {
    return (
      <main className="page">
        <EmptyState
          title="需要管理權限"
          body="請切換為老闆或人資管理員角色，再檢查試用 Go/No-Go。"
        />
      </main>
    );
  }

  const tenantSlug = normalizeTenantSlug(params.tenantSlug);
  const companyId = normalizeOptionalParam(params.companyId);
  const snapshot = await buildPilotGoNoGoUiSnapshot(session, { tenantSlug, companyId });

  return (
    <main className="page">
      <section className="page-header">
        <h1>試用 Go/No-Go</h1>
        <p>把正式環境、匯入預檢、邀請就緒、核心流程與證據安全合成一個保守開跑判斷。</p>
      </section>

      <section className="grid">
        <section className={`panel span-12 risk-box ${snapshot.report.readyToStart ? "success-box" : "danger-box"}`}>
          <div className="section-heading">
            <div>
              <h2>{snapshot.report.readyToStart ? "可以發出試用邀請" : "尚未可以發出試用邀請"}</h2>
              <p className="muted">
                目前檢查租戶：{snapshot.tenantSlug}
                {snapshot.companyId ? ` · 公司 ${snapshot.companyId}` : ""}。這是 UI 快照；正式開跑仍需保存 `pnpm pilot:go-no-go` 產生的 redacted 報告。
              </p>
            </div>
            <span className={`badge ${snapshot.report.blockers ? "danger" : snapshot.report.warnings ? "warning" : ""}`}>
              {snapshot.report.blockers} 阻擋 / {snapshot.report.warnings} 提醒
            </span>
          </div>
        </section>

        <div className="panel span-3 metric">
          <span className="muted">Go/No-Go</span>
          <strong>{snapshot.report.readyToStart ? "GO" : "NO-GO"}</strong>
          <span className={`badge ${snapshot.report.readyToStart ? "" : "danger"}`}>
            {snapshot.report.status}
          </span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">試用人數</span>
          <strong>{snapshot.inviteReadiness.activeEmployeeCount}</strong>
          <span className="badge">20-50 目標</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">核心流程</span>
          <strong>{snapshot.workflowReadiness.productionReadyCount}</strong>
          <span className="badge">production evidence</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Checkpoint 證據</span>
          <strong>{snapshot.checkpointCoverage.reduce((sum, item) => sum + item.recordedCount, 0)}</strong>
          <span className="badge">hash-only</span>
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>開跑判斷</h2>
              <p className="muted">任何 block 或 warning 都不得用來核准真實員工邀請；skip 類檢查只能診斷，不能放行。</p>
            </div>
            <Link className="button primary" href="/settings/pilot-invite-readiness">
              回邀請就緒
            </Link>
          </div>
          <div className="go-no-go-check-grid" aria-label="Go/No-Go 檢查">
            {snapshot.report.checks.map((check) => (
              <GoNoGoCheckCard check={check} key={check.id} />
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
                <span>所有 Go/No-Go 檢查已通過，請保存 redacted 報告後再發邀請。</span>
                <span className="badge">ready</span>
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

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>重新檢查</h2>
              <p className="muted">可切換正式客戶 tenant；畫面仍只顯示彙總狀態與 hash-only 證據，不輸出個資或薪資。</p>
            </div>
          </div>
          <form className="mini-form" action="/settings/pilot-go-no-go">
            <label>
              租戶代碼
              <input name="tenantSlug" defaultValue={snapshot.tenantSlug} placeholder="customer-slug" />
            </label>
            <label>
              公司 ID
              <input name="companyId" defaultValue={snapshot.companyId ?? ""} placeholder="選填；不填使用第一家公司" />
            </label>
            <button className="button primary" type="submit">
              重新檢查
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}

function GoNoGoCheckCard({ check }: { check: PilotGoNoGoCheck }) {
  return (
    <article className={`go-no-go-check-card ${check.status}`}>
      <div>
        <span className={`badge ${check.status === "block" ? "danger" : check.status === "warn" ? "warning" : ""}`}>
          {statusLabel(check.status)}
        </span>
        <h3>{checkTitle(check.id, check.title)}</h3>
        <p>{check.detail}</p>
      </div>
      <small>{check.nextStep}</small>
      <Link className="button" href={checkHref(check.id)}>
        {checkActionLabel(check.id)}
      </Link>
    </article>
  );
}

function normalizeTenantSlug(value: string | undefined) {
  const normalized =
    value?.trim() ||
    process.env.HR_ONE_PILOT_TENANT_SLUG?.trim() ||
    process.env.HR_ONE_TENANT_SLUG?.trim() ||
    "suiyuecare-pilot";
  return normalized || "suiyuecare-pilot";
}

function normalizeOptionalParam(value: string | undefined) {
  const normalized = value?.trim();
  return normalized || null;
}

function statusLabel(status: PilotGoNoGoCheck["status"]) {
  if (status === "block") return "阻擋";
  if (status === "warn") return "提醒";
  return "通過";
}

function checkTitle(id: PilotGoNoGoCheck["id"], fallback: string) {
  const labels: Record<PilotGoNoGoCheck["id"], string> = {
    acceptance: "正式環境驗收",
    production_database: "正式資料庫",
    day_0_status: "Day 0 邀請 Gate",
    import_preflight: "匯入預檢",
    invite_readiness: "邀請就緒",
    workflow_readiness: "核心流程",
    evidence_scan: "證據安全掃描",
  };
  return labels[id] ?? fallback;
}

function checkHref(id: PilotGoNoGoCheck["id"]) {
  const hrefs: Record<PilotGoNoGoCheck["id"], string> = {
    acceptance: "/settings/production-database",
    production_database: "/settings/production-database",
    day_0_status: "/settings/pilot-operations",
    import_preflight: "/settings/pilot-import-preflight",
    invite_readiness: "/settings/pilot-invite-readiness",
    workflow_readiness: "/settings/pilot-operations",
    evidence_scan: "/settings/readiness#pilot-runbook",
  };
  return hrefs[id];
}

function checkActionLabel(id: PilotGoNoGoCheck["id"]) {
  const labels: Record<PilotGoNoGoCheck["id"], string> = {
    acceptance: "修正式環境",
    production_database: "修資料庫 Gate",
    day_0_status: "看每日戰情",
    import_preflight: "預檢 CSV",
    invite_readiness: "檢查邀請",
    workflow_readiness: "補流程證據",
    evidence_scan: "看證據規則",
  };
  return labels[id];
}
