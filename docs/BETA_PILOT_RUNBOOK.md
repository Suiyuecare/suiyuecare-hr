# HR One 20-50 Person Beta Pilot Runbook

This runbook is the execution checklist for turning HR One from a demo-ready app into a real two-week trial for one company with 20-50 employees.

## Current State

- Production URL: `https://hr.suiyuecare.com`
- Public liveness check: `/api/health/live` returns `ok`.
- Public readiness check: `/api/health/ready` is still `degraded` because the production deployment does not have a database configured.
- Supabase project: `aruncclorusswpfnpgsn`
- Supabase private schema: `hr_one` exists.
- Supabase private schema exposure: `anon` and `authenticated` do not have `USAGE` on `hr_one`.
- Supabase private schema relation count: `0`, so HR One tables have not yet been bootstrapped.
- GitHub `main` includes the private-schema SQL generator and Prisma migration baseline support.

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
   cp .env.vercel.production.example .env.vercel.production
   pnpm vercel:apply-production-env -- --env-file=.env.vercel.production --dry-run
   VERCEL_TOKEN=<token> pnpm vercel:apply-production-env -- --env-file=.env.vercel.production
   ```

   The dry run must pass before writing to Vercel. The script does not print secret values.

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

1. Import employees from `/hr/employee-import`.
2. Complete onboarding gaps from `/hr/onboarding-readiness`.
3. Import salary/payment/compliance data from `/hr/payroll-profile-import`.
4. Review labor roster from `/hr/labor-roster`.
5. Review statutory insurance from `/hr/insurance`.
6. Configure announcements, notifications, and work rules.
7. Run production verification again.

Expected evidence:

- Employee import audit log has aggregate counts only.
- Salary/payment changes have audit logs without raw salary or bank account values.
- HR onboarding readiness has no blocker for the pilot company.

## Phase 3: Two-Week Trial Operations

Goal: prove real users can complete core HR work without permission leaks.

Preflight:

- Run `/settings/readiness`.
- Create the persisted 20-50 person trial run.
- Complete the access review checkpoint.
- Confirm unauthorized payroll access tests pass.

Day 1:

- Send announcement.
- Employees acknowledge announcement.
- Employees clock in/out from mobile.
- Employees submit at least one leave request.

Day 3:

- Managers approve/reject from one Inbox.
- HR clears attendance exceptions.
- Employees verify request timelines and notifications.

Day 7:

- HR runs payroll close rehearsal.
- HR reviews attendance completeness and pending approvals.
- HR previews payroll items.
- HR releases a test payslip only when permitted.
- Employees view their own released payslip.

Day 14:

- HR runs final readiness review.
- Export or review redacted audit evidence.
- Confirm no unresolved security, payroll, or attendance blockers remain.

Expected evidence:

- Trial run and checkpoint records are persisted in PostgreSQL.
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
