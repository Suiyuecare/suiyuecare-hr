import Link from "next/link";
import { getDemoSession } from "@/server/auth/demo-session";
import { getConsoleModules } from "@/server/console/modules";

export default async function ConsolePage() {
  const session = await getDemoSession();
  const modules = getConsoleModules(session.role);
  const pinnedCount = modules.reduce((sum, module) => sum + module.pinned.length, 0);

  return (
    <main className="page console-page">
      <section className="console-hero">
        <div>
          <span className="muted">後端管理系統</span>
          <h1>管理後台</h1>
          <p>給執行長、人資、行政部門主任使用；員工日常操作維持在手機前台。</p>
        </div>
        <div className="console-hero-actions">
          <Link className="button" href="/app">
            員工前台
          </Link>
          <Link className="button primary" href="/hr">
            月結工作台
          </Link>
        </div>
      </section>

      <section className="console-summary" aria-label="後台摘要">
        <div>
          <span className="muted">可用模組</span>
          <strong>{modules.length}</strong>
        </div>
        <div>
          <span className="muted">釘選工具</span>
          <strong>{pinnedCount}</strong>
        </div>
        <div>
          <span className="muted">目前角色</span>
          <strong>{roleLabel(session.role)}</strong>
        </div>
      </section>

      <section className="console-module-stack" aria-label="後台功能模組">
        {modules.map((module) => (
          <article className="console-module" key={module.id}>
            <div className="console-module-main">
              {module.sections.map((section) => (
                <section className="console-section" key={`${module.id}-${section.title}`}>
                  <h2>
                    {section.title}
                    {section.badge ? <span className="console-new-badge">{section.badge}</span> : null}
                  </h2>
                  <ul>
                    {section.links.map((link) => (
                      <li key={`${module.id}-${section.title}-${link.label}`}>
                        <Link href={link.href}>
                          {link.label}
                          {link.badge ? <span className="console-new-badge">{link.badge}</span> : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            {module.pinned.length > 0 ? (
              <div className="console-pinned">
                <button type="button" className="console-collapse" aria-label={`${module.title} 收合`}>
                  收合⌃
                </button>
                <ul>
                  {module.pinned.map((link) => (
                    <li key={`${module.id}-pinned-${link.label}`}>
                      <Link href={link.href}>
                        <span aria-hidden="true">⌘</span>
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </main>
  );
}

function roleLabel(role: string) {
  if (role === "owner") return "執行長 / 老闆";
  if (role === "hr_admin") return "人資";
  if (role === "manager") return "行政部門主任 / 主管";
  return "員工";
}
