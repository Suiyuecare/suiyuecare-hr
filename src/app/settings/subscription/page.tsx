import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/demo-session";
import { getSubscriptionWorkspace } from "@/server/subscriptions/service";

type SearchParams = Promise<{
  error?: string;
}>;

export default async function SubscriptionSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getDemoSession();
  const workspace = await getSubscriptionWorkspace(session);
  const { subscription, readiness } = workspace;

  if (!workspace) {
    return (
      <main className="page">
        <EmptyState title="No subscription workspace" body="Switch to the owner demo role to manage commercial readiness." />
      </main>
    );
  }

  return (
    <main className="page">
      <section className="page-header">
        <h1>Subscription</h1>
        <p>Owner-only commercial controls for customer plan, seats, contract evidence, and launch readiness.</p>
      </section>

      <section className="grid">
        {params.error ? (
          <div className="panel span-12 risk-box danger-box">
            <strong>Unable to update subscription</strong>
            <p>{params.error}</p>
          </div>
        ) : null}

        <div className="panel span-3 metric">
          <span className="muted">Plan</span>
          <strong>{labelize(subscription.plan)}</strong>
          <span className={`badge ${subscription.status === "active" ? "" : "warning"}`}>{subscription.status}</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Seats</span>
          <strong>
            {subscription.activeSeatCount}/{subscription.seatLimit}
          </strong>
          <span className={`badge ${readiness.seatUtilizationPercent > 100 ? "danger" : ""}`}>
            {readiness.seatUtilizationPercent}%
          </span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Trial ends</span>
          <strong>{readiness.daysUntilTrialEnd ?? "n/a"}</strong>
          <span className="badge">days</span>
        </div>
        <div className="panel span-3 metric">
          <span className="muted">Contract ends</span>
          <strong>{readiness.daysUntilContractEnd ?? "n/a"}</strong>
          <span className="badge">days</span>
        </div>

        <section className={`panel span-12 risk-box ${readiness.ready ? "success-box" : "danger-box"}`}>
          <div className="section-heading">
            <div>
              <h2>{readiness.ready ? "Ready for commercial launch" : "Commercial gaps remain"}</h2>
              <p className="muted">{readiness.detail}</p>
            </div>
            <span className={`badge ${readiness.ready ? "" : "danger"}`}>{readiness.ready ? "Ready" : "Blocked"}</span>
          </div>
          {readiness.missing.length > 0 ? (
            <ul className="task-list">
              {readiness.missing.map((item) => (
                <li className="task" key={item}>
                  <span>{item}</span>
                  <span className="badge danger">Required</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>Customer plan, seats, billing contact, contract evidence, and verification are ready.</p>
          )}
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Commercial setup</h2>
              <p className="muted">
                Store only references and hashes here. Do not paste raw contracts, bank data, card data, or private customer notes.
              </p>
            </div>
            <span className="badge">Owner only</span>
          </div>

          <form action="/api/settings/subscription" method="post" className="mini-form">
            <div className="field-grid">
              <label>
                Plan
                <select name="plan" defaultValue={subscription.plan}>
                  <option value="demo">Demo</option>
                  <option value="team">Team</option>
                  <option value="business">Business</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </label>
              <label>
                Status
                <select name="status" defaultValue={subscription.status}>
                  <option value="trial">Trial</option>
                  <option value="active">Active</option>
                  <option value="past_due">Past due</option>
                  <option value="suspended">Suspended</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>
              <label>
                Seat limit
                <input name="seatLimit" type="number" min="1" defaultValue={subscription.seatLimit} />
              </label>
              <label>
                Renewal notice days
                <input name="renewalNoticeDays" type="number" min="1" max="180" defaultValue={subscription.renewalNoticeDays} />
              </label>
              <label>
                Trial ends
                <input name="trialEndsAt" type="date" defaultValue={formatDateInput(subscription.trialEndsAt)} />
              </label>
              <label>
                Contract starts
                <input name="contractStartsAt" type="date" defaultValue={formatDateInput(subscription.contractStartsAt)} />
              </label>
              <label>
                Contract ends
                <input name="contractEndsAt" type="date" defaultValue={formatDateInput(subscription.contractEndsAt)} />
              </label>
              <label>
                Billing contact email
                <input name="billingContactEmail" type="email" defaultValue={subscription.billingContactEmail ?? ""} />
              </label>
              <label>
                Contract reference
                <input name="contractRef" defaultValue={subscription.contractRef ?? ""} placeholder="contract://customer/hrone-2026" />
              </label>
              <label>
                Contract hash
                <input name="contractHash" defaultValue={subscription.contractHash ?? ""} placeholder="Auto-generated if blank" />
              </label>
              <label>
                Payment collection mode
                <select name="paymentCollectionMode" defaultValue={subscription.paymentCollectionMode}>
                  <option value="manual_invoice">Manual invoice</option>
                  <option value="stripe_placeholder">Stripe placeholder</option>
                  <option value="partner_reseller">Partner reseller</option>
                </select>
              </label>
              <label>
                Verification status
                <select name="verificationStatus" defaultValue={subscription.verificationStatus}>
                  <option value="unverified">Unverified</option>
                  <option value="verified">Verified</option>
                  <option value="failed">Failed</option>
                </select>
              </label>
            </div>
            <button className="button primary" type="submit">
              Save subscription
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}

function formatDateInput(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "";
}

function labelize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
