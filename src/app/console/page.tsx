import Link from "next/link";
import { getDemoSession } from "@/server/auth/session";
import { filterConsoleModules, getConsoleModules } from "@/server/console/modules";

type SearchParams = Promise<{ q?: string }>;

export default async function ConsolePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = params.q ?? "";
  const session = await getDemoSession();
  const allModules = getConsoleModules(session.role);
  const modules = filterConsoleModules(allModules, query);
  const pinnedCount = allModules.reduce((sum, module) => sum + module.pinned.length, 0);
  const linkCount = allModules.reduce(
    (sum, module) => sum + module.sections.reduce((sectionSum, section) => sectionSum + section.links.length, 0),
    0,
  );

  return (
    <main className="page console-page">
      <section className="console-hero">
        <div>
          <span className="muted">HR One Operating Console</span>
          <h1>試用營運總覽</h1>
          <p>前台處理員工日常任務，後台處理主管簽核、人資月結、公告與安全上線。</p>
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

      <section className="console-product-lanes" aria-label="產品分流">
        <Link className="console-lane employee-lane" href="/app">
          <span>1. 前端員工日常使用</span>
          <strong>打卡、請假、補打卡、公告、薪資單</strong>
          <small>手機第一屏只放員工今天需要完成的任務。</small>
        </Link>
        <Link className="console-lane admin-lane" href="/hr">
          <span>2. 後端管理系統</span>
          <strong>執行長、人資、行政部門主任</strong>
          <small>月結、異常、簽核、權限與稽核集中處理。</small>
        </Link>
      </section>

      <section className="console-command-board" aria-label="試用後台指揮板">
        <div className="console-command-copy">
          <span className="muted">Finance-style 操作台</span>
          <strong>先看今日能不能跑，再處理打卡、簽核、公告、月結與安全 Gate。</strong>
        </div>
        <Link className="console-command-card focus" href="/settings/pilot-operations">
          <span>今日戰情</span>
          <strong>Day 0-14 checkpoint</strong>
          <small>只存彙總與 hash-only 證據</small>
        </Link>
        <Link className="console-command-card" href="/manager/inbox">
          <span>待簽核</span>
          <strong>統一 Inbox</strong>
          <small>主管不用進深層選單</small>
        </Link>
        <Link className="console-command-card" href="/settings/readiness">
          <span>上線 Gate</span>
          <strong>權限與敏感資料</strong>
          <small>未通過就不邀請員工</small>
        </Link>
      </section>

      <section className="pilot-operating-strip" aria-label="兩週試用核心流程">
        <Link href="/app">
          <span>員工日常</span>
          <strong>打卡 · 請假 · 薪資單</strong>
        </Link>
        <Link href="/manager/inbox">
          <span>主管作業</span>
          <strong>統一簽核 Inbox</strong>
        </Link>
        <Link href="/hr/announcements">
          <span>行政發布</span>
          <strong>公告與回條</strong>
        </Link>
        <Link href="/hr">
          <span>HR 月結</span>
          <strong>出勤異常 · 薪資預演</strong>
        </Link>
        <Link href="/settings/readiness">
          <span>安全上線</span>
          <strong>權限 · 稽核 · readiness</strong>
        </Link>
      </section>

      <section className="console-toolbar" aria-label="後台工具列">
        <form className="console-search" action="/console">
          <label htmlFor="console-search-input">搜尋功能</label>
          <div>
            <input
              id="console-search-input"
              name="q"
              type="search"
              placeholder="搜尋薪資、打卡、公告、表單..."
              defaultValue={query}
            />
            <button className="button primary" type="submit">
              搜尋
            </button>
            {query ? (
              <Link className="button" href="/console">
                清除
              </Link>
            ) : null}
          </div>
        </form>
        <div className="console-summary" aria-label="後台摘要">
          <div>
            <span className="muted">可用模組</span>
            <strong>{allModules.length}</strong>
          </div>
          <div>
            <span className="muted">功能入口</span>
            <strong>{linkCount}</strong>
          </div>
          <div>
            <span className="muted">釘選捷徑</span>
            <strong>{pinnedCount}</strong>
          </div>
          <div>
            <span className="muted">目前角色</span>
            <strong>{roleLabel(session.role)}</strong>
          </div>
        </div>
      </section>

      <div className="console-layout">
        <aside className="console-sidebar" aria-label="後台模組導覽">
          <strong>模組</strong>
          <nav>
            {allModules.map((module) => (
              <a href={`#${module.id}`} key={module.id}>
                <span>{module.title}</span>
                <small>{module.statusLabel}</small>
              </a>
            ))}
          </nav>
        </aside>

        <section className="console-module-stack" aria-label="後台功能模組">
          {modules.length === 0 ? (
            <div className="panel">
              <h2>找不到符合的功能</h2>
              <p className="muted">請換一個關鍵字，或清除搜尋後查看全部後台模組。</p>
            </div>
          ) : null}
          {modules.map((module) => (
            <article className="console-module" id={module.id} key={module.id}>
              <div className="console-module-header">
                <div>
                  <span className="muted">{module.statusLabel}</span>
                  <h2>{module.title}</h2>
                  <p>{module.summary}</p>
                </div>
                <Link className="button primary" href={module.primary.href}>
                  {module.primary.label}
                </Link>
              </div>
              <div className="console-module-main">
                {module.sections.map((section) => (
                  <section className="console-section" key={`${module.id}-${section.title}`}>
                    <h3>
                      {section.title}
                      {section.badge ? <span className="console-new-badge">{section.badge}</span> : null}
                    </h3>
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
      </div>
    </main>
  );
}

function roleLabel(role: string) {
  if (role === "owner") return "執行長 / 老闆";
  if (role === "hr_admin") return "人資";
  if (role === "manager") return "行政部門主任 / 主管";
  return "員工";
}
