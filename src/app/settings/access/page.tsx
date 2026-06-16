import { EmptyState } from "@/components/EmptyState";
import { getDemoSession } from "@/server/auth/session";
import { getUserAccessWorkspace } from "@/server/auth/access-management";
import { roleKeys, type RoleKey } from "@/server/auth/rbac";

type SearchParams = Promise<{ error?: string }>;

export default async function AccessSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ error }, session] = await Promise.all([searchParams, getDemoSession()]);
  const workspace = await getUserAccessWorkspace(session);

  return (
    <main className="page">
      <section className="page-header">
        <h1>User Access</h1>
        <p>Invite users, assign roles, and suspend access from one audited owner workspace.</p>
      </section>

      {error ? (
        <div className="panel danger-panel">
          <strong>Unable to update user access</strong>
          <p>{error}</p>
        </div>
      ) : null}

      <section className="grid">
        <div className="panel span-4 metric">
          <span className="muted">Users</span>
          <strong>{workspace.users.length}</strong>
          <span className="badge">Tenant scoped</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Suspended</span>
          <strong>{workspace.users.filter((user) => user.status === "suspended").length}</strong>
          <span className="badge warning">Blocked</span>
        </div>
        <div className="panel span-4 metric">
          <span className="muted">Privileged SSO</span>
          <strong>{workspace.ssoEnabled ? "Required" : "Optional"}</strong>
          <span className={`badge ${workspace.ssoEnabled ? "" : "warning"}`}>Policy</span>
        </div>

        <section className="panel span-12">
          <div className="section-heading">
            <div>
              <h2>Invite user</h2>
              <p className="muted">
                Invites create an account record and roles only. Invite tokens are not stored in raw form.
              </p>
            </div>
            <span className="badge">Audited</span>
          </div>
          <form action="/api/settings/access" method="post" className="mini-form">
            <input type="hidden" name="action" value="invite" />
            <div className="field-grid">
              <label>
                Email
                <input name="email" type="email" placeholder="new.user@hrone.test" required />
              </label>
              <label>
                Display name
                <input name="displayName" placeholder="New User" required />
              </label>
            </div>
            <RoleCheckboxes defaultRoles={["employee"]} />
            <p className="muted">Allowed domains: {workspace.allowedEmailDomains.join(", ") || "Any domain"}</p>
            <button className="button primary" type="submit">
              Send invite
            </button>
          </form>
        </section>

        <section className="panel span-12">
          <h2>Users</h2>
          {workspace.users.length === 0 ? (
            <EmptyState title="No users" body="Invite the first owner or HR admin to begin." />
          ) : (
            <ul className="task-list">
              {workspace.users.map((user) => (
                <li className="task request-task" key={user.id}>
                  <span>
                    <strong>{user.displayName}</strong>
                    <small>{user.email}</small>
                    <small>
                      roles {user.roles.join(", ")} · auth {user.authRequirement.replace("_", " ")}
                    </small>
                    <small>
                      SSO identities{" "}
                      {user.externalIdentities.length > 0
                        ? user.externalIdentities.map((identity) => `${identity.provider}:${identity.subject}`).join(", ")
                        : "not linked"}
                    </small>
                  </span>
                  <div className="stacked-actions">
                    <span className={`badge ${user.status === "suspended" ? "danger" : user.status === "invited" ? "warning" : ""}`}>
                      {user.status}
                    </span>
                    <form action="/api/settings/access" method="post" className="inline-actions">
                      <input type="hidden" name="action" value="status" />
                      <input type="hidden" name="userId" value={user.id} />
                      <input type="hidden" name="status" value={user.status === "suspended" ? "active" : "suspended"} />
                      <button className="button" type="submit">
                        {user.status === "suspended" ? "Reactivate" : "Suspend"}
                      </button>
                    </form>
                  </div>
                  <form action="/api/settings/access" method="post" className="mini-form compact-form">
                    <input type="hidden" name="action" value="roles" />
                    <input type="hidden" name="userId" value={user.id} />
                    <RoleCheckboxes defaultRoles={user.roles} />
                    <button className="button" type="submit">
                      Save roles
                    </button>
                  </form>
                  <form action="/api/settings/access" method="post" className="mini-form compact-form">
                    <input type="hidden" name="action" value="identity" />
                    <input type="hidden" name="userId" value={user.id} />
                    <div className="field-grid">
                      <label>
                        SSO provider
                        <input name="provider" placeholder="Entra ID" defaultValue={user.externalIdentities[0]?.provider ?? ""} required />
                      </label>
                      <label>
                        Issuer URL
                        <input name="issuer" type="url" placeholder="https://login.example.com/customer/v2.0" defaultValue={user.externalIdentities[0]?.issuer ?? ""} required />
                      </label>
                      <label>
                        Immutable subject
                        <input name="subject" placeholder="IdP subject / object id" defaultValue={user.externalIdentities[0]?.subject ?? ""} required />
                      </label>
                    </div>
                    <button className="button" type="submit">
                      Link SSO identity
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}

function RoleCheckboxes({ defaultRoles }: { defaultRoles: RoleKey[] }) {
  return (
    <div className="toggle-row">
      {roleKeys.map((role) => (
        <label className="check-row" key={role}>
          <input name="roles" type="checkbox" value={role} defaultChecked={defaultRoles.includes(role)} />
          {role}
        </label>
      ))}
    </div>
  );
}
