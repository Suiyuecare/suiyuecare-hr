# HR One 20-50 Person Beta Pilot Runbook

This runbook is the execution checklist for turning HR One from a demo-ready app into a real two-week trial for one company with 20-50 employees.

## Current State

- Production URL: `https://hr.suiyuecare.com`
- Public liveness check: `/api/health/live` returns `ok`.
- Public readiness check: `/api/health/ready` is still `degraded` because Vercel Production has not been configured with the required production environment variables and database connection.
- Supabase project: `aruncclorusswpfnpgsn`
- Supabase private schema: `hr_one` exists and has a verified synthetic pilot rehearsal tenant.
- Supabase private schema exposure: `anon` and `authenticated` do not have `USAGE` on `hr_one`.
- Supabase pilot rehearsal data: 25 active employees, 3 managers with direct reports, 4 departments, attendance schedules, leave balances, salary/payment/statutory profile coverage, released payroll rehearsal, 25 payslips, announcement receipts, starter form workflow, active rule versions, telemetry baseline, and audit coverage.
- Vercel Production env: currently blocked until the 28 required production keys are written and the app is redeployed.
- GitHub `main` includes the private-schema SQL generator, Prisma migration baseline support, pilot acceptance matrix, daily pilot status gate, handoff generator, and 20-50 person import template pack.

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

   - `DATABASE_URL`, server-only, Supabase Postgres URL with `?schema=hr_one`.
   - `HR_ONE_ENV=production`
   - `HR_ONE_DATABASE_PROVIDER=supabase_postgres`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - Required production secrets listed in `README.md`, stored as secret values or vault references.

   Prepare and apply the values with:

   ```bash
   pnpm vercel:create-production-env-draft
   pnpm vercel:bootstrap-known-env -- --env-file=.env.vercel.production
   pnpm vercel:apply-production-env -- --env-file=.env.vercel.production --dry-run
   VERCEL_TOKEN=<token> pnpm vercel:apply-production-env -- --env-file=.env.vercel.production
   ```

   `vercel:bootstrap-known-env` defaults to dry-run and only lists safe known values plus generated secrets; it skips database URL, OIDC placeholders, vault references, and restore-drill evidence. Use `--apply` only when intentionally preloading those known values. The full `vercel:apply-production-env` dry run must pass before writing the complete production env to Vercel. Neither script prints secret values.

5. Verify:

   ```bash
   pnpm db:supabase:verify-schema -- --project-ref=<supabase-project-ref> --schema=hr_one
   pnpm env:verify:production
   curl -fsS https://hr.suiyuecare.com/api/health/ready
   ```

Expected evidence:

- `hr_one` has HR One tables and a complete `_prisma_migrations` baseline.
- `anon` and `authenticated` have no schema usage or table privileges on `hr_one`.
- `/api/health/ready` returns `ok`.
- No database URL, salary, national ID, bank account, or health values appear in logs or command output.

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
3. Run the redacted import preflight:

   ```bash
   pnpm pilot:import-preflight -- --employee-csv=/secure/customer/employee-import.csv --payroll-csv=/secure/customer/payroll-profile-import.csv --output=/tmp/hr-one-pilot-import-preflight.md
   ```

4. Import employees from `/hr/employee-import` only after preflight returns `ready`.
5. Complete onboarding gaps from `/hr/onboarding-readiness`.
6. Import salary/payment/compliance data from `/hr/payroll-profile-import`.
7. Review labor roster from `/hr/labor-roster`.
8. Review statutory insurance from `/hr/insurance`.
9. Configure announcements, notifications, and work rules.
10. Run production verification again.
11. Run the acceptance matrix with the real tenant slug so cohort evidence comes from PostgreSQL, not manual CLI counts:

   ```bash
   pnpm pilot:acceptance -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --project-ref=<supabase-project-ref> --schema=hr_one --env-file=.env.vercel.production --tenant-slug=<customer-slug>
   ```

Expected evidence:

- Employee import audit log has aggregate counts only.
- Salary/payment changes have audit logs without raw salary or bank account values.
- HR onboarding readiness has no blocker for the pilot company.
- `pilot:acceptance` reports `real_customer` cohort evidence from aggregate active employee and manager counts.
- `pilot:import-preflight` returns `ready` and the Markdown report contains no names, salary amounts, bank accounts, national IDs, health data, or private HR notes.

## Phase 3: Two-Week Trial Operations

Goal: prove real users can complete core HR work without permission leaks.

Preflight:

- Run `/settings/readiness`.
- Create the persisted 20-50 person trial run.
- Complete the access review checkpoint.
- Confirm unauthorized payroll access tests pass.
- Run the daily status gate for Day 0:

  ```bash
  pnpm pilot:daily-status -- --day=0 --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --project-ref=<supabase-project-ref> --schema=hr_one --env-file=.env.vercel.production --tenant-slug=<customer-slug> --output=/tmp/hr-one-pilot-day-0.md
  ```

Day 1:

- Send announcement.
- Employees acknowledge announcement.
- Employees clock in/out from mobile.
- Employees submit at least one leave request.
- Run `pnpm pilot:daily-status -- --day=1 ... --tenant-slug=<customer-slug> --output=/tmp/hr-one-pilot-day-1.md`.

Day 3:

- Managers approve/reject from one Inbox.
- HR clears attendance exceptions.
- Employees verify request timelines and notifications.
- Run `pnpm pilot:daily-status -- --day=3 ... --tenant-slug=<customer-slug> --output=/tmp/hr-one-pilot-day-3.md`.

Day 7:

- HR runs payroll close rehearsal.
- HR reviews attendance completeness and pending approvals.
- HR previews payroll items.
- HR releases a test payslip only when permitted.
- Employees view their own released payslip.
- Run `pnpm pilot:daily-status -- --day=7 ... --tenant-slug=<customer-slug> --output=/tmp/hr-one-pilot-day-7.md`.

Day 14:

- HR runs final readiness review.
- Export or review redacted audit evidence.
- Confirm no unresolved security, payroll, or attendance blockers remain.
- Run `pnpm pilot:daily-status -- --day=14 ... --tenant-slug=<customer-slug> --final-review=verified --output=/tmp/hr-one-pilot-day-14.md` only after the final review checkpoint is genuinely verified.

Expected evidence:

- Trial run and checkpoint records are persisted in PostgreSQL.
- Daily status reports are redacted and contain only aggregate or hash-only evidence references.
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
