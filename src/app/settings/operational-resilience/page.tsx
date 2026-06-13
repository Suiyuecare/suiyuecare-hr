import { getDemoSession } from "@/server/auth/demo-session";
import { getOperationalResilienceReadiness } from "@/server/readiness/operational-resilience";

type SearchParams = Promise<{ error?: string }>;

export default async function OperationalResiliencePage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error }, session] = await Promise.all([searchParams, getDemoSession()]);
  const readiness = await getOperationalResilienceReadiness(session);
  const settings = readiness.settings;

  return (
    <main className="page">
      <section className="page-header">
        <h1>Operational Resilience</h1>
        <p>Configure backup and restore drill evidence before production launch.</p>
      </section>

      <section className="grid">
        {error ? (
          <div className="panel span-12 risk-box danger-box">
            <strong>Unable to update operational resilience</strong>
            <p>{error}</p>
          </div>
        ) : null}

        <div className="panel span-4 metric">
          <span className="muted">Launch gate</span>
          <strong>{readiness.ready ? "Ready" : "Blocked"}</strong>
          <span className={`badge ${readiness.ready ? "" : "danger"}`}>{settings.verificationStatus}</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Backup retention</span>
          <strong>{settings.backupRetentionDays}</strong>
          <span className="badge">days</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Restore drill</span>
          <strong>{settings.restoreDrillStatus}</strong>
          <span className={`badge ${settings.restoreDrillStatus === "passed" ? "" : "warning"}`}>
            {formatDate(settings.restoreDrillTestedAt)}
          </span>
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Readiness summary</h2>
              <p className="muted">{readiness.detail}</p>
            </div>
            <span className={`badge ${readiness.ready ? "" : "warning"}`}>
              {readiness.ready ? "Production ready" : "Action needed"}
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
        </section>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Backup and restore evidence</h2>
              <p className="muted">Store only references and evidence metadata. Provider credentials belong in the deployment vault.</p>
            </div>
            <span className="badge">Audited</span>
          </div>
          <form action="/api/settings/operational-resilience" method="post" className="mini-form">
            <div className="toggle-row">
              <label className="check-row">
                <input name="backupEnabled" type="checkbox" defaultChecked={settings.backupEnabled} />
                Backups enabled
              </label>
            </div>
            <div className="field-grid">
              <label>
                Backup provider
                <select name="backupProvider" defaultValue={settings.backupProvider}>
                  <option value="not_configured">Not configured</option>
                  <option value="managed_postgres">Managed PostgreSQL</option>
                  <option value="aws_rds">AWS RDS</option>
                  <option value="gcp_cloud_sql">Google Cloud SQL</option>
                  <option value="azure_database">Azure Database</option>
                  <option value="neon">Neon</option>
                  <option value="supabase">Supabase</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              <label>
                Backup region
                <input name="backupRegion" defaultValue={settings.backupRegion ?? ""} placeholder="asia-east1, ap-northeast-1" />
              </label>
              <label>
                Schedule
                <select name="backupSchedule" defaultValue={settings.backupSchedule}>
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </label>
              <label>
                Retention days
                <input name="backupRetentionDays" type="number" min="0" max="3650" defaultValue={settings.backupRetentionDays} />
              </label>
              <label>
                Backup encryption key reference
                <input name="backupEncryptionKeyRef" defaultValue={settings.backupEncryptionKeyRef ?? ""} placeholder="vault://customer/hrone/backup-key" />
              </label>
              <label>
                Last backup completed
                <input name="lastBackupCompletedAt" type="date" defaultValue={formatInputDate(settings.lastBackupCompletedAt)} />
              </label>
              <label>
                Restore drill tested
                <input name="restoreDrillTestedAt" type="date" defaultValue={formatInputDate(settings.restoreDrillTestedAt)} />
              </label>
              <label>
                Restore drill status
                <select name="restoreDrillStatus" defaultValue={settings.restoreDrillStatus}>
                  <option value="not_tested">Not tested</option>
                  <option value="failed">Failed</option>
                  <option value="passed">Passed</option>
                </select>
              </label>
              <label>
                Restore drill ticket
                <input name="restoreDrillTicket" defaultValue={settings.restoreDrillTicket ?? ""} placeholder="OPS-1234" />
              </label>
              <label>
                RTO hours
                <input name="recoveryTimeObjectiveHours" type="number" min="1" max="168" defaultValue={settings.recoveryTimeObjectiveHours} />
              </label>
              <label>
                RPO hours
                <input name="recoveryPointObjectiveHours" type="number" min="1" max="168" defaultValue={settings.recoveryPointObjectiveHours} />
              </label>
              <label>
                Verification status
                <select name="verificationStatus" defaultValue={settings.verificationStatus}>
                  <option value="unverified">Unverified</option>
                  <option value="verified">Verified</option>
                </select>
              </label>
            </div>
            <label>
              Verification note
              <textarea name="verificationNote" rows={3} defaultValue={settings.verificationNote ?? ""} placeholder="Record restore drill evidence. Do not paste secrets." />
            </label>
            <button className="button primary" type="submit">
              Save operational resilience
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}

function formatDate(date: Date | null) {
  return date ? formatInputDate(date) : "missing";
}

function formatInputDate(date: Date | null) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
