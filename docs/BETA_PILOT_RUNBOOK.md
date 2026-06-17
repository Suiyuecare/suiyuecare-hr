# HR One 20-50 Person Beta Pilot Runbook

This runbook is the execution checklist for turning HR One from a demo-ready app into a real two-week trial for one company with 20-50 employees.

## Current State

- Production URL: `https://hr.suiyuecare.com`
- Public liveness check: `/api/health/live` returns `ok`.
- Public readiness check: `/api/health/ready` is still blocked until Vercel Production uses a Supabase-compatible database connection. For Vercel + Prisma this should be the Supabase Transaction Pooler URL on port `6543` with `pgbouncer=true&connection_limit=1&schema=hr_one`, not the session pooler on port `5432`, or a direct host only when the Supabase IPv4 add-on is enabled.
- Supabase project: `aruncclorusswpfnpgsn`
- Supabase private schema: `hr_one` exists and has a verified synthetic pilot rehearsal tenant.
- Supabase private schema exposure: `anon` and `authenticated` do not have `USAGE` on `hr_one`.
- Supabase pilot rehearsal data: 25 active employees, 3 managers with direct reports, 4 departments, attendance schedules, leave balances, salary/payment/statutory profile coverage, released payroll rehearsal, 25 payslips, announcement receipts, starter form workflow, active rule versions, telemetry baseline, and audit coverage.
- Vercel Production env: required bootstrap values are present, but the live readiness gate is blocked until the server-side `DATABASE_URL` uses a Vercel-compatible Supabase network path: transaction pooler with `pgbouncer=true&connection_limit=1&schema=hr_one`, or direct host plus the Supabase IPv4 add-on and `HR_ONE_SUPABASE_IPV4_ADDON_ENABLED=true`.
- GitHub `main` includes the private-schema SQL generator, Prisma migration baseline support, pilot acceptance matrix, daily pilot status gate, daily operations Today Gate, handoff generator, customer import orchestrator, identity import gate, invite readiness gate, go/no-go start gate, trial completion gate, and 20-50 person import template pack.

Do not call the product production-pilot-ready until `/api/health/ready` is `ok` in production and a non-demo tenant passes production verification.

## Phase 0: Production Persistence

Goal: production data must survive deploys and must not fall back to in-memory demo state.

1. Generate the Supabase private-schema bootstrap SQL:

   ```bash
   pnpm db:supabase:bootstrap-sql -- --schema=hr_one > /tmp/hr-one-supabase-bootstrap.sql
   ```

2. Review the generated SQL before applying it:

   - It must create objects under `hr_one`.
   - It must not contain destructive statements such as `DROP`, `TRUNCATE`, or `DELETE FROM`.
   - It must baseline `_prisma_migrations` with the current Prisma migration checksums.
   - It must not grant `anon` or `authenticated` access to HR One tables.

3. Apply the SQL to the Supabase project only after review.

4. Configure Vercel production environment variables:

   - `DATABASE_URL`, server-only, Supabase Transaction Pooler URL with `pgbouncer=true&connection_limit=1&schema=hr_one`. Do not use the direct `db.<project-ref>.supabase.co:5432` host on Vercel unless the Supabase IPv4 add-on is enabled and `HR_ONE_SUPABASE_IPV4_ADDON_ENABLED=true` is set, and do not use the session pooler on port `5432` for Vercel/serverless runtime traffic.
   - `HR_ONE_ENV=production`
   - `HR_ONE_DATABASE_PROVIDER=supabase_postgres`
   - `HR_ONE_AUTH_SESSION_SOURCE=oidc`
   - `HR_ONE_AUTH_LOGIN_URL`, HTTPS company SSO login URL for unauthenticated production visitors.
   - For Supabase Auth as the pilot IdP: `HR_ONE_AUTH_PROVIDER=supabase_auth`, `HR_ONE_AUTH_ISSUER_URL=https://<project-ref>.supabase.co/auth/v1`, `HR_ONE_AUTH_JWKS_URL=https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json`, `HR_ONE_AUTH_AUDIENCE=authenticated`, plus `HR_ONE_AUTH_DEFAULT_TENANT` and `HR_ONE_AUTH_DEFAULT_COMPANY` for the pilot tenant/company when Supabase tokens do not include custom tenant claims.
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - Required production secrets listed in `README.md`, stored as secret values or vault references.

   Prepare and apply the values with:

   ```bash
   pnpm vercel:create-production-env-draft
   pnpm vercel:refresh-production-env-draft -- --env-file=.env.vercel.production --restore-tested-at=2026-06-17
   printf '%s' "$SUPABASE_TRANSACTION_POOLER_DATABASE_URL" | pnpm vercel:refresh-production-env-draft -- --env-file=.env.vercel.production --database-url-stdin --apply
   pnpm vercel:bootstrap-known-env -- --env-file=.env.vercel.production
   pnpm vercel:apply-production-env -- --env-file=.env.vercel.production --dry-run
   VERCEL_TOKEN=<token> pnpm vercel:apply-production-env -- --env-file=.env.vercel.production
   ```

   `vercel:refresh-production-env-draft` defaults to dry-run and repairs known non-secret local draft values without touching `DATABASE_URL`, generated secrets, or vault refs. It preserves restore-drill evidence unless `--restore-tested-at=YYYY-MM-DD` is explicitly provided, which updates only `HR_ONE_BACKUP_RESTORE_TESTED_AT`. It updates `DATABASE_URL` only when `--database-url-stdin` is provided, validates the Supabase transaction pooler URL before writing, and never prints the value. Pass `--supabase-ipv4-addon-enabled` only for a direct-host URL after the Supabase IPv4 add-on is actually enabled. Pass `--apply` only to update the gitignored local draft. `vercel:bootstrap-known-env` also defaults to dry-run and only lists safe known values plus generated secrets; it skips database URL, vault references, and restore-drill evidence. Use `--apply` only when intentionally preloading those known values. The full `vercel:apply-production-env` dry run must pass before writing the complete production env to Vercel. None of these scripts prints secret values. When `HR_ONE_ENV=production`, demo auth, demo reset, and demo role switching fail closed; do not rely on demo role switching for production checks.

   For browser/mobile access, configure the SSO gateway or callback handler to exchange a verified OIDC token through `POST /api/auth/session` with `Authorization: Bearer <token>`. HR One will set an encrypted HttpOnly `hrone_oidc_session` cookie after the token maps to an active tenant user and role. The cookie is minimal and must not be used to carry raw email, names, salary, bank, national ID, health, or private HR note data.

5. Verify:

   ```bash
   pnpm db:supabase:verify-schema -- --project-ref=<supabase-project-ref> --schema=hr_one
   pnpm env:verify:production
   curl -fsS https://hr.suiyuecare.com/api/health/ready
   ```

   Owner/HR can also open `/settings/production-database` to see the same hard blocker in the management UI. The page explains whether the current root cause is a Supabase direct-host network path, pooler configuration, missing `DATABASE_URL`, production env posture, or an unreachable health endpoint. It never displays the actual database URL or secret values.

Expected evidence:

- `hr_one` has HR One tables and a complete `_prisma_migrations` baseline.
- `anon` and `authenticated` have no schema usage or table privileges on `hr_one`.
- `/api/health/ready` returns `ok`.
- `/api/health/ready` includes `demo auth: ok` with `demo auth disabled for production runtime`.
- No database URL, salary, national ID, bank account, or health values appear in logs or command output.
- `/settings/production-database` reports `Production database 已可用` before HR starts inviting real employees.

## Phase 1: Pilot Tenant Foundation

Goal: create a real customer tenant, not demo seed data.

1. Provision the customer tenant:

   ```bash
   pnpm db:provision:tenant -- \
     --tenant-name="<customer name>" \
     --tenant-slug=<customer-slug> \
     --plan=enterprise \
     --company-name="<company name>" \
     --company-legal-name="<company legal name>" \
     --company-tax-id=<taiwan-tax-id> \
     --owner-email=<owner-email> \
     --owner-display-name="<owner name>" \
     --owner-external-subject=<oidc-subject-or-stable-id> \
     --allowed-email-domain=<company-domain> \
     --sso-provider="<provider>" \
     --sso-issuer-url=<issuer-url> \
     --sso-client-id=<client-id> \
     --sso-jwks-url=<jwks-url> \
     --storage-provider=<provider> \
     --storage-bucket=<bucket> \
     --storage-region=<region> \
     --storage-kms-key-ref=<kms-ref> \
     --notification-channel=email
   ```

2. Confirm owner and HR access through `/settings/access`.

3. Run:

   ```bash
   pnpm db:verify:production -- --tenant-slug=<customer-slug>
   ```

Expected evidence:

- Tenant slug is not `demo`.
- Owner, HR admin, manager, and employee role assignments exist.
- Production SSO metadata and privileged identity bindings exist.
- Audit logs include tenant provisioning and access changes.

## Phase 2: Pilot Company Data

Goal: load enough real data for a 20-50 person two-week trial.

Required data:

- 20-50 active employees.
- At least two departments.
- At least one manager approval line.
- Attendance policy and shift templates.
- Company calendar and annual calendar review.
- Leave policies and balances.
- Salary profiles.
- Payroll compliance profiles.
- Payment profiles with masked/hash account data only.
- Statutory insurance records.
- Work rules or employee handbook.
- Approved AI policy sources if policy Q&A is used.

Recommended sequence:

1. Generate the CSV template pack with `pnpm pilot:import-template-pack -- --output=/tmp/hr-one-pilot-import-template --cohort-size=25 --force`.
2. Replace every sample employee, salary, tax, and payment value from approved customer source records.
3. Run the redacted import preflight from `/settings/pilot-import-preflight`, or run the CLI when files must stay on an approved secure workstation. The browser flow must show only aggregate counts, check results, and content hashes:

   ```bash
   pnpm pilot:import-preflight -- --employee-csv=/secure/customer/employee-import.csv --identity-csv=/secure/customer/identity-import.csv --payroll-csv=/secure/customer/payroll-profile-import.csv --output=/tmp/hr-one-pilot-import-preflight.md
   ```

4. If HR wants one production-only import sequence, dry-run the customer import orchestrator:

   ```bash
   pnpm pilot:customer-import -- --tenant-slug=<customer-slug> --employee-csv=/secure/customer/employee-import.csv --identity-csv=/secure/customer/identity-import.csv --payroll-csv=/secure/customer/payroll-profile-import.csv --output=/tmp/hr-one-pilot-customer-import.md
   ```

5. Apply the orchestrated import only after the dry-run is verified:

   ```bash
   pnpm pilot:customer-import -- --tenant-slug=<customer-slug> --employee-csv=/secure/customer/employee-import.csv --identity-csv=/secure/customer/identity-import.csv --payroll-csv=/secure/customer/payroll-profile-import.csv --apply --output=/tmp/hr-one-pilot-customer-import-applied.md
   ```

6. If HR uses the staged UI/CLI path instead, import employees from `/hr/employee-import` only after preflight returns `ready`.
7. Dry-run the identity import:

   ```bash
   pnpm pilot:identity-import -- --tenant-slug=<customer-slug> --csv=/secure/customer/identity-import.csv --output=/tmp/hr-one-pilot-identity-import.md
   ```

8. Apply the identity import only after the dry-run is `ready`:

   ```bash
   pnpm pilot:identity-import -- --tenant-slug=<customer-slug> --csv=/secure/customer/identity-import.csv --apply --output=/tmp/hr-one-pilot-identity-import-applied.md
   ```

9. Complete onboarding gaps from `/hr/onboarding-readiness`.
10. Import salary/payment/compliance data from `/hr/payroll-profile-import` if the orchestrated import was not used.
11. Review labor roster from `/hr/labor-roster`.
12. Review statutory insurance from `/hr/insurance`.
13. Configure announcements, notifications, and work rules.
14. Run production verification again.
15. Run the acceptance matrix with the real tenant slug so cohort evidence comes from PostgreSQL, not manual CLI counts:

   ```bash
   pnpm pilot:acceptance -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --project-ref=<supabase-project-ref> --schema=hr_one --env-file=.env.vercel.production --tenant-slug=<customer-slug>
   ```

16. Run the invite readiness check after employee users and SSO identities are linked:

   ```bash
   pnpm pilot:invite-readiness -- --tenant-slug=<customer-slug> --output=/tmp/hr-one-pilot-invite-readiness.md
   ```

  HR admins can use `/settings/company-setup` first to finish company, employee, account, schedule, attendance, leave, announcement, payroll, and audit setup in one guided flow. Use `/settings/pilot-import-preflight` before any real import to confirm the employee, identity/SSO, and payroll profile CSV files align without persisting raw personal or salary values. The wizard includes audited actions for generating 14-day schedules, syncing leave balances, publishing the two-week trial announcement, and running the demo payroll rehearsal; database-backed payroll blockers are routed back to HR review instead of being silently cleared. They can then review `/settings/pilot-invite-readiness` before sending invitations. The screens show aggregate counts and statuses only. Use `/settings/pilot-operations` during the trial to record Day 0, Day 1, Day 3, Day 7, and Day 14 evidence without storing raw sensitive data, then use `/settings/pilot-completion` on Day 14 before final handoff.

17. Run the start/stop go-no-go report before inviting employees:

   ```bash
   pnpm pilot:go-no-go -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --project-ref=<supabase-project-ref> --schema=hr_one --env-file=.env.vercel.production --tenant-slug=<customer-slug> --employee-csv=/secure/customer/employee-import.csv --identity-csv=/secure/customer/identity-import.csv --payroll-csv=/secure/customer/payroll-profile-import.csv --evidence-path=/tmp/hr-one-pilot-evidence --recursive --output=/tmp/hr-one-pilot-go-no-go.md
   ```

   Do not use `--skip-import-preflight`, `--skip-invite-readiness`, `--skip-workflow-readiness`, or `--skip-evidence-scan` to approve a real trial. Skipped checks remain warnings, but any warning keeps the go/no-go report blocked for employee invitations. The default start gate allows rehearsed-only workflow items when none are blocked; use `--require-workflow-production-evidence` after Day 3 or Day 7 when production checkpoint evidence is mandatory.

Expected evidence:

- Employee import audit log has aggregate counts only.
- Salary/payment changes have audit logs without raw salary or bank account values.
- Identity import audit logs have user/employee/role/SSO linkage evidence without raw emails or SSO subjects.
- HR onboarding readiness has no blocker for the pilot company.
- `pilot:acceptance` reports `real_customer` cohort evidence from aggregate active employee and manager counts.
- `/settings/pilot-import-preflight` or `pilot:import-preflight` returns `ready`; the saved snapshot/report contains no names, emails, SSO subjects, salary amounts, bank accounts, national IDs, health data, or private HR notes.
- `pilot:invite-readiness` returns `ready` only when all active employees have active linked users, employee roles, required SSO identities, allowed email-domain coverage, departments, 14-day schedule coverage, leave balance coverage, self-only payslip visibility rules, and every manager with direct reports has login plus manager role coverage.
- `pilot:go-no-go` returns `ready_to_start` only when production acceptance, Day 0 status, import preflight, invite readiness, core workflow readiness, and pilot evidence scan are all acceptable, with zero blockers and zero warnings.
- `pilot:workflow-readiness` is also embedded in `pilot:go-no-go`; run it separately during Day 3, Day 7, and Day 14 with `--require-production-evidence` to prove production checkpoint evidence for the core workflows.
- `pnpm pilot:evidence-scan -- --path=<pilot-evidence-folder> --recursive` passes before any generated pilot report is shared outside the implementation team.

## Phase 3: Two-Week Trial Operations

Goal: prove real users can complete core HR work without permission leaks.

Preflight:

- Run `/settings/company-setup`.
- Run `/settings/readiness`.
- Run `/settings/pilot-invite-readiness`.
- Open `/settings/pilot-trial-run` to create or sync the persisted 20-50 person trial batch, confirm the start/end dates, current day, participant counts, manager counts, and Today Gate.
- Open `/settings/pilot-operations` and use it as the daily war room for checkpoint evidence. Treat the Today Gate at the top as the daily stop/go signal; if it points back to an earlier checkpoint, fix that evidence before recording later-day proof.
- Complete the access review checkpoint.
- Confirm unauthorized payroll access tests pass.
- Run `pnpm pilot:invite-readiness -- --tenant-slug=<customer-slug> --output=/tmp/hr-one-pilot-invite-readiness.md` and fix every blocker before invitations.
- Run `pnpm pilot:go-no-go -- ... --output=/tmp/hr-one-pilot-go-no-go.md` and keep the redacted report in the pilot evidence folder. This report now includes the core workflow readiness matrix.
- Optionally run the workflow readiness matrix separately and keep it with the pilot evidence folder if HR wants a standalone Day 0 artifact:

  ```bash
  pnpm pilot:workflow-readiness -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --project-ref=<supabase-project-ref> --schema=hr_one --env-file=.env.vercel.production --tenant-slug=<customer-slug> --output=/tmp/hr-one-pilot-workflow-readiness-day-0.md
  ```

- Generate the Day 0 morning brief for the pilot operations huddle:

  ```bash
  pnpm pilot:morning-brief -- --day=0 --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --project-ref=<supabase-project-ref> --schema=hr_one --env-file=.env.vercel.production --tenant-slug=<customer-slug> --output=/tmp/hr-one-pilot-morning-day-0.md
  ```

- Run the daily status gate for Day 0:

  ```bash
  pnpm pilot:daily-status -- --day=0 --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --project-ref=<supabase-project-ref> --schema=hr_one --env-file=.env.vercel.production --tenant-slug=<customer-slug> --output=/tmp/hr-one-pilot-day-0.md
  ```

Day 1:

- Send announcement.
- Employees acknowledge announcement.
- Employees clock in/out from mobile.
- Employees submit at least one leave request.
- Record the announcement receipt and smoke-test evidence in `/settings/pilot-operations`, then confirm the Today Gate no longer shows missing Day 1 evidence.
- Run `pnpm pilot:morning-brief -- --day=1 ... --tenant-slug=<customer-slug> --output=/tmp/hr-one-pilot-morning-day-1.md` before the daily standup.
- Run `pnpm pilot:daily-status -- --day=1 ... --tenant-slug=<customer-slug> --output=/tmp/hr-one-pilot-day-1.md`.

Day 3:

- Managers approve/reject from one Inbox.
- HR clears attendance exceptions.
- Employees verify request timelines and notifications.
- Run `pnpm pilot:morning-brief -- --day=3 ... --tenant-slug=<customer-slug> --output=/tmp/hr-one-pilot-morning-day-3.md` before the daily standup.
- Run `pnpm pilot:workflow-readiness -- --require-production-evidence ... --tenant-slug=<customer-slug> --output=/tmp/hr-one-pilot-workflow-readiness-day-3.md`; Day 3 should have production evidence for clock in/out, leave request, and manager approval. It may still show payroll and payslip as missing until Day 7.
- Confirm the Today Gate is not pointing back to Day 1 or Day 3 missing evidence, then run `pnpm pilot:daily-status -- --day=3 ... --tenant-slug=<customer-slug> --output=/tmp/hr-one-pilot-day-3.md`.

Day 7:

- HR runs payroll close rehearsal.
- HR reviews attendance completeness and pending approvals.
- HR previews payroll items.
- HR releases a test payslip only when permitted.
- Employees view their own released payslip.
- Run `pnpm pilot:morning-brief -- --day=7 ... --tenant-slug=<customer-slug> --output=/tmp/hr-one-pilot-morning-day-7.md` before the payroll rehearsal meeting.
- Run `pnpm pilot:workflow-readiness -- --require-production-evidence ... --tenant-slug=<customer-slug> --output=/tmp/hr-one-pilot-workflow-readiness-day-7.md` and fix any remaining `blocked` or `rehearsed_only` item before calling the payroll/payslip checkpoint complete.
- Confirm the Today Gate shows Day 7 payroll/payslip evidence as complete or explicitly lists only remaining Day 7 evidence, then run `pnpm pilot:daily-status -- --day=7 ... --tenant-slug=<customer-slug> --output=/tmp/hr-one-pilot-day-7.md`.

Day 14:

- HR runs final readiness review.
- Export or review redacted audit evidence.
- Confirm no unresolved security, payroll, or attendance blockers remain.
- Open `/settings/pilot-completion` to review the Day 14 redacted closeout Gate before generating the final handoff.
- Open `/settings/pilot-evidence` to assemble the redacted pilot evidence package checklist and generate the audit evidence package from the same screen.
- Run `pnpm pilot:morning-brief -- --day=14 ... --tenant-slug=<customer-slug> --final-review=verified --output=/tmp/hr-one-pilot-morning-day-14.md` before the final review.
- Run `pnpm pilot:workflow-readiness -- --require-production-evidence ... --tenant-slug=<customer-slug> --final-review=verified --output=/tmp/hr-one-pilot-workflow-readiness-day-14.md` and require `production_ready` before final handoff.
- Run `pnpm pilot:daily-status -- --day=14 ... --tenant-slug=<customer-slug> --final-review=verified --output=/tmp/hr-one-pilot-day-14.md` only after the final review checkpoint is genuinely verified.
- Run `pnpm pilot:evidence-scan -- --path=<pilot-evidence-folder> --recursive` and fix every finding before the final handoff.
- Run the trial completion gate:

  ```bash
  pnpm pilot:trial-completion -- --tenant-slug=<customer-slug> --evidence-path=<pilot-evidence-folder> --recursive --output=/tmp/hr-one-pilot-completion.md
  ```

Expected evidence:

- Trial run and checkpoint records are persisted in PostgreSQL.
- Daily status reports are redacted and contain only aggregate or hash-only evidence references.
- Workflow readiness reports show production evidence for clock in/out, leave request, manager approval, announcement receipt, payroll rehearsal, payslip access, and preflight access review before final handoff.
- Evidence scan passes for the pilot report folder and reports zero sensitive-value findings.
- `/settings/pilot-evidence` shows the evidence package as blocked until the persisted trial run, Go/No-Go report, checkpoint evidence, audit package, completion review, evidence privacy scan, and redacted handoff are all present.
- `pilot:trial-completion` reports `completed` only when preflight access review, Day 1 announcement receipt, Day 3 clock/leave/manager approval evidence, Day 7 payroll rehearsal plus payslip access, Day 14 final review, KPI status, and evidence privacy scan are all acceptable with zero blockers and zero warnings. `--skip-evidence-scan` is diagnostic only and cannot approve final handoff.
- Audit logs exist for create, approve, reject, payroll close, payslip release, and sensitive settings.
- Employees cannot see other employees' payslips.
- Managers cannot see subordinate salary unless explicitly granted.
- AI outputs, if used, have sources and are labeled as suggestions.

## Completion Criteria

The beta pilot objective is complete only when all of these are true:

- A real company with 20-50 users has used production for two weeks.
- Employees completed clock in/out, leave request, announcement acknowledgement, and payslip view.
- Managers completed approvals from the unified Inbox.
- HR completed attendance exception handling and monthly payroll close rehearsal.
- Production readiness and database verification pass for the tenant.
- Audit log coverage for important changes is complete.
- No unauthorized salary, national ID, bank account, health, or private HR note exposure is found.
- KPI evidence is collected for task completion, approval time, payroll close effort, attendance exception resolution, and first-week training time.

If any item lacks evidence, the goal is still in progress.
