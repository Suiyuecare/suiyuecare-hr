import { redirect } from "next/navigation";
import { getDemoSession } from "@/server/auth/demo-session";
import { dashboardPathForRole, hasPermission } from "@/server/auth/rbac";
import {
  getPayrollPaymentSecurityReadiness,
  getPayrollPaymentSecuritySettings,
} from "@/server/payroll/payment-security";

type SearchParams = Promise<{ error?: string }>;

export default async function PayrollPaymentSecurityPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error }, session] = await Promise.all([searchParams, getDemoSession()]);
  if (!hasPermission(session.role, "payroll:manage")) {
    redirect(dashboardPathForRole(session.role));
  }

  const [settings, readiness] = await Promise.all([
    getPayrollPaymentSecuritySettings(session),
    getPayrollPaymentSecurityReadiness(session),
  ]);

  return (
    <main className="page">
      <section className="page-header">
        <h1>Payment Security</h1>
        <p>Configure token vault references and customer bank format verification before payroll bank uploads.</p>
      </section>

      {error ? (
        <div className="panel danger-panel">
          <strong>Unable to update payment security</strong>
          <p>{error}</p>
        </div>
      ) : null}

      <section className="grid">
        <div className="panel span-4 metric">
          <span className="muted">Token vault</span>
          <strong>{settings.tokenVaultProvider}</strong>
          <span className={`badge ${settings.tokenVaultRef ? "" : "warning"}`}>
            {settings.tokenVaultRef ? "Reference stored" : "Missing"}
          </span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Bank format</span>
          <strong>{settings.bankFileFormat}</strong>
          <span className={`badge ${settings.bankFormatVerified ? "" : "warning"}`}>
            {settings.bankFormatVerified ? "Verified" : "Unverified"}
          </span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Export readiness</span>
          <strong>{readiness.ready ? "Ready" : "Not ready"}</strong>
          <span className={`badge ${readiness.ready ? "" : "danger"}`}>{settings.verificationStatus}</span>
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Vault and bank file setup</h2>
              <p className="muted">
                Store only references here. Actual account tokens and provider secrets must stay in the customer-approved vault.
              </p>
            </div>
            <span className="badge">Audited</span>
          </div>
          <form action="/api/payroll/payment-security" method="post" className="mini-form">
            <div className="field-grid">
              <label>
                Token vault provider
                <select name="tokenVaultProvider" defaultValue={settings.tokenVaultProvider}>
                  <option value="not_configured">Not configured</option>
                  <option value="aws_secrets_manager">AWS Secrets Manager</option>
                  <option value="gcp_secret_manager">Google Secret Manager</option>
                  <option value="azure_key_vault">Azure Key Vault</option>
                  <option value="hashicorp_vault">HashiCorp Vault</option>
                  <option value="custom_vault">Custom vault</option>
                </select>
              </label>
              <label>
                Token vault reference
                <input name="tokenVaultRef" placeholder="vault://customer/payroll-payment" defaultValue={settings.tokenVaultRef ?? ""} />
              </label>
              <label>
                KMS key reference
                <input name="kmsKeyRef" placeholder="alias/customer-payroll-payment" defaultValue={settings.kmsKeyRef ?? ""} />
              </label>
              <label>
                Bank file format
                <input name="bankFileFormat" placeholder="customer_bank_csv" defaultValue={settings.bankFileFormat} />
              </label>
              <label>
                Format version
                <input name="bankFormatVersion" placeholder="v1" defaultValue={settings.bankFormatVersion} />
              </label>
              <label>
                Verification status
                <select name="verificationStatus" defaultValue={settings.verificationStatus}>
                  <option value="unverified">Unverified</option>
                  <option value="verified">Verified</option>
                  <option value="failed">Failed</option>
                </select>
              </label>
            </div>
            <label className="check-row">
              <input name="bankFormatVerified" type="checkbox" defaultChecked={settings.bankFormatVerified} />
              Customer bank format has been tested
            </label>
            <label>
              Verification note
              <textarea
                name="verificationNote"
                placeholder="Record customer bank sandbox test reference, approver, or cutover note."
                defaultValue={settings.verificationNote ?? ""}
              />
            </label>
            <button className="button primary" type="submit">
              Save payment security
            </button>
          </form>
        </section>

        <section className="panel span-12">
          <h2>Readiness detail</h2>
          <p className="muted">{readiness.detail}</p>
          <a className="button" href="/hr/payroll-exports">
            Open payroll exports
          </a>
        </section>
      </section>
    </main>
  );
}
