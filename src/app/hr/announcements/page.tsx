import { getAnnouncementWorkspace } from "@/server/announcements/service";
import { getDemoSession } from "@/server/auth/demo-session";

type SearchParams = Promise<{ error?: string }>;

export default async function HrAnnouncementsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getDemoSession();
  const workspace = await getAnnouncementWorkspace(session);

  return (
    <main className="page">
      <section className="page-header">
        <h1>公告與回條</h1>
        <p>發布公司公告，並追蹤員工是否已讀與回傳回條。</p>
      </section>

      <section className="grid">
        {params.error ? (
          <div className="panel span-12 risk-box danger-box">
            <strong>公告處理失敗</strong>
            <p>{params.error}</p>
          </div>
        ) : null}

        <section className="panel span-8 wizard-form">
          <h2>發布公告</h2>
          <form action="/api/announcements" method="post" className="mini-form">
            <div className="field-grid">
              <label>
                標題
                <input name="title" defaultValue="六月薪資月結與出勤補正提醒" required />
              </label>
              <label>
                類別
                <input name="category" defaultValue="薪資月結" required />
              </label>
            </div>
            <label>
              公告內容
              <textarea
                name="body"
                rows={5}
                defaultValue="請同仁於月底前確認出勤紀錄、補打卡與請假申請狀態；有缺漏請盡快送出申請。"
                required
              />
            </label>
            <label className="check-row">
              <input name="requireReceipt" type="checkbox" defaultChecked />
              需要員工回傳回條
            </label>
            <button className="button primary" type="submit">
              發布公告
            </button>
          </form>
        </section>

        <section className="panel span-4">
          <h2>公告成效</h2>
          <ul className="task-list">
            {workspace.announcements.map((announcement) => (
              <li className="task" key={announcement.id}>
                <span>
                  <strong>{announcement.title}</strong>
                  <small>
                    {announcement.category} · {formatDate(announcement.publishedAt)}
                  </small>
                  <small>
                    回條 {announcement.receiptCount}/{announcement.employeeCount}
                  </small>
                </span>
                <span className={`badge ${announcement.requireReceipt && announcement.receiptCount < announcement.employeeCount ? "warning" : ""}`}>
                  {announcement.requireReceipt ? "需回條" : "不需回條"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}

function formatDate(date: Date) {
  return date.toLocaleDateString("zh-TW");
}
