import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/session";
import { getCompanyCalendarWorkspace } from "@/server/calendar/company-calendar";

type SearchParams = Promise<{
  error?: string;
}>;

export default async function HrCalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getDemoSession();
  const workspace = await getCompanyCalendarWorkspace(session);
  const { days, reviews, readiness } = workspace;
  const activeReview = readiness.review;

  return (
    <main className="page">
      <section className="page-header">
        <h1>Company Calendar</h1>
        <p>Configure holidays, makeup workdays, and company rest days that affect attendance and payroll close.</p>
      </section>

      <section className="grid">
        {params.error ? (
          <div className="panel span-12 risk-box danger-box">
            <strong>Unable to save calendar day</strong>
            <p>{params.error}</p>
          </div>
        ) : null}

        <div className="panel span-4 metric">
          <span className="muted">Configured days</span>
          <strong>{days.length}</strong>
          <span className="badge">Audited</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Annual review</span>
          <strong>{readiness.ready ? "Ready" : "Needs review"}</strong>
          <span className={`badge ${readiness.ready ? "" : "warning"}`}>{readiness.calendarYear}</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Holidays</span>
          <strong>{days.filter((day) => day.dayType !== "makeup_workday" && !day.requiresWork).length}</strong>
          <span className="badge">No work</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Makeup workdays</span>
          <strong>{days.filter((day) => day.requiresWork).length}</strong>
          <span className="badge warning">Requires work</span>
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Annual calendar review</h2>
              <p className="muted">{readiness.detail}</p>
            </div>
            <span className={`badge ${readiness.ready ? "" : "warning"}`}>
              {readiness.ready ? "Production ready" : "Blocks launch"}
            </span>
          </div>
          {readiness.missing.length > 0 ? (
            <ul className="task-list">
              {readiness.missing.map((item) => (
                <li className="task" key={item}>
                  <span>{item}</span>
                  <span className="badge warning">Needed</span>
                </li>
              ))}
            </ul>
          ) : null}
          <form action="/api/calendar/days" method="post" className="mini-form">
            <input type="hidden" name="action" value="review" />
            <div className="field-grid">
              <label>
                Calendar year
                <input name="calendarYear" type="number" min="2020" max="2100" defaultValue={readiness.calendarYear} required />
              </label>
              <label>
                Review status
                <select name="reviewStatus" defaultValue={activeReview?.reviewStatus ?? "pending_review"}>
                  <option value="pending_review">Pending review</option>
                  <option value="approved">Approved</option>
                </select>
              </label>
              <label>
                Source title
                <input name="sourceTitle" defaultValue={activeReview?.sourceTitle ?? "DGPA annual work calendar"} required />
              </label>
              <label>
                Source URL
                <input name="sourceUrl" type="url" defaultValue={activeReview?.sourceUrl ?? "https://www.dgpa.gov.tw/"} required />
              </label>
              <label>
                Source checked date
                <input name="sourceCheckedAt" type="date" defaultValue={formatInputDate(activeReview?.sourceCheckedAt)} required />
              </label>
              <label>
                Reviewed by
                <input name="reviewedBy" defaultValue={activeReview?.reviewedBy ?? session.user?.displayName ?? ""} required />
              </label>
              <label>
                Reviewed date
                <input name="reviewedAt" type="date" defaultValue={formatInputDate(activeReview?.reviewedAt)} required />
              </label>
              <label>
                National holidays
                <input name="nationalHolidayCount" type="number" min="0" defaultValue={activeReview?.nationalHolidayCount ?? readiness.counts.nationalHolidays} required />
              </label>
              <label>
                Makeup workdays
                <input name="makeupWorkdayCount" type="number" min="0" defaultValue={activeReview?.makeupWorkdayCount ?? readiness.counts.makeupWorkdays} required />
              </label>
              <label>
                Company holidays
                <input name="companyHolidayCount" type="number" min="0" defaultValue={activeReview?.companyHolidayCount ?? readiness.counts.companyHolidays} required />
              </label>
            </div>
            <label>
              Review notes
              <textarea name="reviewNotes" defaultValue={activeReview?.notes ?? "Reviewed against official annual calendar before schedule/payroll launch."} />
            </label>
            <button className="button primary" type="submit">
              Save annual review
            </button>
          </form>
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Calendar setup</h2>
              <p className="muted">Use official or company-reviewed sources. These records should drive scheduling, leave conflict checks, and payroll close.</p>
            </div>
            <a className="button" href="/hr">
              Monthly close
            </a>
          </div>

          <form action="/api/calendar/days" method="post" className="wizard-form">
            <div className="section-heading compact-heading">
              <div>
                <h3>1. Date and type</h3>
              </div>
              <span className="badge">Required</span>
            </div>
            <div className="field-grid">
              <label>
                Calendar date
                <input name="calendarDate" type="date" defaultValue={defaultDate()} required />
              </label>
              <label>
                Day type
                <select name="dayType" defaultValue="national_holiday">
                  <option value="national_holiday">National holiday</option>
                  <option value="company_holiday">Company holiday</option>
                  <option value="makeup_workday">Makeup workday</option>
                  <option value="regular_workday">Regular workday override</option>
                </select>
              </label>
              <label>
                Name
                <input name="name" defaultValue="Company reviewed holiday" required />
              </label>
              <label>
                Source
                <select name="source" defaultValue="company">
                  <option value="company">Company</option>
                  <option value="government">Government</option>
                  <option value="import">Import</option>
                </select>
              </label>
            </div>

            <div className="toggle-row">
              <label>
                <input name="paid" type="checkbox" defaultChecked />
                Paid day
              </label>
              <label>
                <input name="requiresWork" type="checkbox" />
                Requires work
              </label>
            </div>

            <label>
              Notes
              <textarea name="notes" defaultValue="Review against company calendar before payroll close." />
            </label>

            <button className="button primary" type="submit">
              Save calendar day
            </button>
          </form>
        </section>

        <section className="panel span-12">
          <h2>Calendar days</h2>
          {days.length === 0 ? (
            <EmptyState title="No calendar days" body="Add holidays or makeup workdays before schedule generation." />
          ) : (
            <ul className="task-list">
              {days.map((day) => (
                <li className="task" key={day.id}>
                  <span>
                    <strong>
                      {formatDate(day.calendarDate)} · {day.name}
                    </strong>
                    <small>
                      {day.dayType} · {day.source}
                      {day.notes ? ` · ${day.notes}` : ""}
                    </small>
                  </span>
                  <span className={`badge ${day.requiresWork ? "warning" : ""}`}>
                    {day.requiresWork ? "workday" : "holiday"} · {day.paid ? "paid" : "unpaid"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel span-12">
          <h2>Recent reviews</h2>
          {reviews.length === 0 ? (
            <EmptyState title="No annual review" body="Add a reviewed annual calendar source before production verification." />
          ) : (
            <ul className="task-list">
              {reviews.map((review) => (
                <li className="task" key={review.id}>
                  <span>
                    <strong>{review.calendarYear} · {review.sourceTitle}</strong>
                    <small>
                      {review.reviewStatus} · checked {formatInputDate(review.sourceCheckedAt)} · reviewed by {review.reviewedBy}
                    </small>
                  </span>
                  <span className={`badge ${review.reviewStatus === "approved" ? "" : "warning"}`}>
                    {review.nationalHolidayCount} holidays · {review.makeupWorkdayCount} makeup
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}

function defaultDate() {
  const now = new Date();
  now.setDate(now.getDate() + 7);
  return now.toISOString().slice(0, 10);
}

function formatDate(date: Date) {
  return date.toLocaleDateString("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatInputDate(date?: Date | null) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date ?? new Date());
}
