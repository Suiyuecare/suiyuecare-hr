import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/session";
import {
  getConsoleModuleDetail,
  hasConsoleModuleDefinition,
  type ConsoleTone,
} from "@/server/console/modules";

type Params = Promise<{
  moduleId: string;
}>;

export default async function ConsoleModuleDetailPage({ params }: { params: Params }) {
  const { moduleId } = await params;
  const session = await getDemoSession();
  const detail = getConsoleModuleDetail(session.role, moduleId);

  if (!detail) {
    if (!hasConsoleModuleDefinition(moduleId)) {
      notFound();
    }

    return (
      <main className="page">
        <section className="page-header">
          <h1>需要後台權限</h1>
          <p>此模組只開放給具備相對權限的管理角色；員工日常任務請使用員工前台。</p>
        </section>
        <EmptyState
          title="無法開啟此後台模組"
          body="請切換為執行長、人資或主管示範角色；薪資與公司設定等敏感模組需要更高權限。"
        />
      </main>
    );
  }

  const { module: consoleModule } = detail;
  const sectionCount = consoleModule.sections.length;
  const linkCount = consoleModule.sections.reduce((sum, section) => sum + section.links.length, 0);

  return (
    <main className="page console-module-detail-page">
      <section className="console-module-detail-hero">
        <div>
          <Link className="back-link" href="/console">
            返回後台工作台
          </Link>
          <span className="muted">HR One 後台模組</span>
          <h1>{consoleModule.title}</h1>
          <p>{consoleModule.summary}</p>
          <div className="module-role-row" aria-label="適用角色">
            {detail.roles.map((role) => (
              <span key={role}>{role}</span>
            ))}
          </div>
        </div>
        <div className="module-hero-action">
          <span className="badge">{consoleModule.statusLabel}</span>
          <Link className="button primary" href={consoleModule.primary.href}>
            {consoleModule.primary.label}
          </Link>
          <small>目前角色可看到 {linkCount} 個入口、{sectionCount} 個區塊。</small>
        </div>
      </section>

      <section className="module-kpi-strip" aria-label={`${consoleModule.title} KPI`}>
        {detail.kpis.map((kpi) => (
          <div className={`module-kpi-card ${toneClass(kpi.tone)}`} key={kpi.label}>
            <span>{kpi.label}</span>
            <strong>{kpi.target}</strong>
            <small>{kpi.current}</small>
          </div>
        ))}
      </section>

      <section className="grid module-detail-grid">
        <section className="panel span-8 module-task-panel">
          <div className="section-heading">
            <div>
              <h2>今日優先</h2>
              <p className="muted">先處理會阻擋月結、上線或日常營運的事項。</p>
            </div>
            <span className={`badge ${detail.tasks.some((task) => task.tone === "danger") ? "danger" : "warning"}`}>
              {detail.tasks.length} 項任務
            </span>
          </div>
          <ol className="module-task-list">
            {detail.tasks.map((task, index) => (
              <li className={`module-task ${toneClass(task.tone)}`} key={task.title}>
                <span className="module-task-index">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{task.title}</strong>
                  <p>{task.detail}</p>
                </div>
                <div className="module-task-action">
                  <span className={`badge ${badgeToneClass(task.tone)}`}>{task.status}</span>
                  <Link className="button" href={task.href}>
                    開啟
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <aside className="panel span-4 module-guardrail-panel">
          <div className="section-heading compact-heading">
            <div>
              <h2>護欄</h2>
              <p className="muted">法遵、資安與 audit 要先守住。</p>
            </div>
          </div>
          <ul className="module-guardrail-list">
            {detail.guardrails.map((guardrail) => (
              <li className={toneClass(guardrail.tone)} key={guardrail.title}>
                <strong>{guardrail.title}</strong>
                <p>{guardrail.detail}</p>
              </li>
            ))}
          </ul>
        </aside>

        <section className="panel span-8 module-work-panel">
          <div className="section-heading">
            <div>
              <h2>常用作業</h2>
              <p className="muted">依照實際工作區分入口，避免使用者在深層選單裡找功能。</p>
            </div>
          </div>
          <div className="module-work-grid">
            {consoleModule.sections.map((section) => (
              <section className="module-work-section" key={section.title}>
                <h3>
                  {section.title}
                  {section.badge ? <span className="console-new-badge">{section.badge}</span> : null}
                </h3>
                <ul>
                  {section.links.map((link) => (
                    <li key={`${section.title}-${link.label}`}>
                      <Link href={link.href}>
                        <span>{link.label}</span>
                        {link.badge ? <strong>{link.badge}</strong> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </section>

        <aside className="panel span-4 module-setup-panel">
          <div className="section-heading compact-heading">
            <div>
              <h2>設定入口</h2>
              <p className="muted">此模組常用的管理與設定頁。</p>
            </div>
          </div>
          <div className="module-setup-links">
            {detail.setupLinks.map((link) => (
              <Link className="button" href={link.href} key={link.href}>
                {link.label}
              </Link>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}

function toneClass(tone: ConsoleTone) {
  if (tone === "danger") return "danger";
  if (tone === "warning") return "warning";
  return "ready";
}

function badgeToneClass(tone: ConsoleTone) {
  if (tone === "danger") return "danger";
  if (tone === "warning") return "warning";
  return "";
}
