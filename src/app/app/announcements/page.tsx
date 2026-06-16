import { DashboardLink } from "@/components/DashboardLink";
import { getAnnouncementWorkspace } from "@/server/announcements/service";
import { getDemoSession } from "@/server/auth/demo-session";

type SearchParams = Promise<{ error?: string }>;

export default async function EmployeeAnnouncementsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getDemoSession();
  const workspace = await getAnnouncementWorkspace(session);

  return (
    <>
      <main className="page mobile-page">
        <section className="page-header">
          <h1>公告</h1>
          <p>查看公司公告，需要回條的公告可直接在手機確認。</p>
        </section>

        {params.error ? (
          <div className="panel span-12 risk-box danger-box">
            <strong>回條送出失敗</strong>
            <p>{params.error}</p>
          </div>
        ) : null}

        <section className="grid">
          {workspace.announcements.map((announcement) => (
            <article className="panel span-12" key={announcement.id}>
              <div className="section-heading">
                <div>
                  <span className="muted">{announcement.category}</span>
                  <h2>{announcement.title}</h2>
                </div>
                <span className={`badge ${announcement.requireReceipt && !announcement.acknowledgedByCurrentEmployee ? "warning" : ""}`}>
                  {announcement.acknowledgedByCurrentEmployee ? "已回條" : announcement.requireReceipt ? "需回條" : "公告"}
                </span>
              </div>
              <p>{announcement.body}</p>
              <p className="muted">發布日期：{announcement.publishedAt.toLocaleDateString("zh-TW")}</p>
              {announcement.requireReceipt && !announcement.acknowledgedByCurrentEmployee ? (
                <form action="/api/announcements/receipt" method="post">
                  <input type="hidden" name="announcementId" value={announcement.id} />
                  <button className="button primary" type="submit">
                    我已閱讀並確認
                  </button>
                </form>
              ) : null}
            </article>
          ))}
        </section>
      </main>

      <nav className="bottom-nav" aria-label="員工手機導覽">
        <DashboardLink href="/app" label="首頁" />
        <DashboardLink href="/app/announcements" label="公告" />
        <DashboardLink href="/app/attendance" label="出勤" />
        <DashboardLink href="/app/payslip" label="薪資單" />
        <DashboardLink href="/manager/inbox" label="簽核" />
      </nav>
    </>
  );
}
