import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { hasPermission } from "@/server/auth/rbac";
import { getDemoSession } from "@/server/auth/session";
import {
  buildPilotEvidencePackageWorkspace,
  type PilotEvidencePackageItem,
} from "@/server/readiness/pilot-evidence-package";

type SearchParams = Promise<{
  error?: string;
  success?: string;
}>;

export default async function PilotEvidencePage({ searchParams }: { searchParams: SearchParams }) {
  const [params, session] = await Promise.all([searchParams, getDemoSession()]);
  if (!hasPermission(session.role, "audit:read")) {
    return (
      <main className="page">
        <EmptyState
          title="需要稽核權限"
          body="請切換為老闆或人資管理員角色，再檢查試用證據包。"
        />
      </main>
    );
  }

  const workspace = await buildPilotEvidencePackageWorkspace(session);
  const report = workspace.report;

  return (
    <main className="page">
      <section className="page-header">
        <h1>試用證據包</h1>
        <p>把 20-50 人兩週試用的開跑、每日 checkpoint、月結預演、薪資單權限、audit 與 evidence scan 收成可交付清單。</p>
      </section>

      {params.error ? (
        <div className="panel danger-panel">
          <strong>無法產生 audit evidence package</strong>
          <p>{params.error}</p>
        </div>
      ) : null}
      {params.success === "audit-evidence" ? (
        <div className="panel success-panel">
          <strong>Audit evidence package 已產生</strong>
          <p>頁面已重新整理；證據包仍需通過 completion review 與 evidence scan 才能對外交付。</p>
        </div>
      ) : null}

      <section className="grid">
        <section className={`panel span-12 risk-box ${report.readyToShare ? "success-box" : "danger-box"}`}>
          <div className="section-heading">
            <div>
              <h2>{report.readyToShare ? "可以交付 redacted 試用證據包" : "尚未可以交付試用證據包"}</h2>
              <p className="muted">
                任何缺失都不能用截圖或口頭確認替代；外部 evidence folder 必須掃描到 0 finding。
              </p>
            </div>
            <span className={`badge ${report.blockers ? "danger" : report.warnings ? "warning" : ""}`}>
              {report.blockers} 阻擋 / {report.warnings} 提醒
            </span>
          </div>
        </section>

        <div className="panel span-3 metric">
          <span className="muted">證據包狀態</span>
          <strong>{report.readyToShare ? "READY" : "BLOCKED"}</strong>
          <span className={`badge ${report.readyToShare ? "" : "danger"}`}>{report.status}</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">試用批次</span>
          <strong>{workspace.trialWorkspace.trialRun?.currentDay ?? 0}</strong>
          <span className="badge">{workspace.trialWorkspace.trialRun ? "目前天數" : "未建立"}</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Checkpoint 證據</span>
          <strong>{workspace.operations.totalRecordedEvidenceCount}</strong>
          <span className="badge">hash-only</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Audit package</span>
          <strong>{workspace.auditPackageCount}</strong>
          <span className="badge">redacted</span>
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>交付 Gate</h2>
              <p className="muted">每一項都只能保存彙總、狀態、hash 或 redacted report，不放 raw 名單、薪資或個資。</p>
            </div>
            <div className="inline-actions">
              <Link className="button" href="/settings/pilot-trial-run">
                批次控制台
              </Link>
              <Link className="button primary" href="/settings/pilot-completion">
                結案檢查
              </Link>
            </div>
          </div>
          <div className="go-no-go-check-grid" aria-label="試用證據包 Gate">
            {report.items.map((item) => (
              <EvidenceItemCard item={item} key={item.id} />
            ))}
          </div>
        </section>

        <section className="panel span-7" id="audit">
          <div className="section-heading">
            <div>
              <h2>補 audit evidence package</h2>
              <p className="muted">產生勞檢與敏感異動摘要；內容只含 entity/action/count/warning/hash，不輸出原始薪資或個資。</p>
            </div>
          </div>
          <form action="/api/settings/audit-evidence" method="post" className="mini-form">
            <input type="hidden" name="returnTo" value="/settings/pilot-evidence?success=audit-evidence#audit" />
            <div className="field-grid">
              <label>
                期間開始
                <input name="periodStart" type="date" defaultValue={defaultPeriodStart()} />
              </label>
              <label>
                期間結束
                <input name="periodEnd" type="date" defaultValue={defaultPeriodEnd()} />
              </label>
            </div>
            <button className="button primary" type="submit">
              產生 audit package
            </button>
          </form>
        </section>

        <section className="panel span-5">
          <h2>必要 CLI</h2>
          <ul className="task-list">
            {report.commands.map((command) => (
              <li className="task" key={command}>
                <span>
                  <small>{command}</small>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-12">
          <h2>隱私護欄</h2>
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

function EvidenceItemCard({ item }: { item: PilotEvidencePackageItem }) {
  return (
    <article className={`go-no-go-check-card ${item.status}`}>
      <div>
        <span className={`badge ${item.status === "block" ? "danger" : item.status === "warn" ? "warning" : ""}`}>
          {statusLabel(item.status)}
        </span>
        <h3>{itemTitle(item)}</h3>
        <p>{item.detail}</p>
      </div>
      <small>{item.nextStep}</small>
      {item.command ? <small>{item.command}</small> : null}
      <Link className="button" href={item.href}>
        開啟
      </Link>
    </article>
  );
}

function itemTitle(item: PilotEvidencePackageItem) {
  const labels: Record<PilotEvidencePackageItem["id"], string> = {
    trial_run: "試用批次",
    go_no_go: "開跑 Go/No-Go",
    checkpoint_evidence: "每日 checkpoint",
    audit_evidence: "Audit package",
    completion_review: "Day 14 結案",
    evidence_privacy_scan: "證據隱私掃描",
    redacted_handoff: "Redacted handoff",
  };
  return labels[item.id] ?? item.title;
}

function statusLabel(status: PilotEvidencePackageItem["status"]) {
  if (status === "block") return "阻擋";
  if (status === "warn") return "提醒";
  return "通過";
}

function defaultPeriodStart() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function defaultPeriodEnd() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
}
