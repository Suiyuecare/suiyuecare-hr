# HR One

HR One is the initial foundation for a Taiwan-focused AI Native HR Operating System. This repository starts with a production-oriented TypeScript skeleton: Next.js App Router, PostgreSQL, Prisma, RBAC, audit logging, demo auth, mobile-first employee UI, manager Inbox, HR dashboard, owner settings, unit tests, and Playwright smoke tests.

AI features are intentionally implemented as a safe Copilot layer first. The current assistant is deterministic and advisory so permissions, auditability, source references, and blocked sensitive decisions can be verified before connecting an external model provider.

## MVP Workflows

- Employee clock in/out with punch source.
- Daily Today Card with shift, punch status, leave balance, and pending requests.
- HR employee CSV import wizard with preview validation, department-code mapping, confirmation step, RBAC, and audit logs.
- HR onboarding readiness workspace that turns customer setup gaps into missing employee, manager, salary, payment, payroll compliance, statutory insurance enrollment, time setup, and Taiwan rule action lists before production verification.
- HR payroll profile CSV import wizard for salary, payment, and payroll compliance profiles with preview validation, per-profile audit logs, and a redacted batch import audit log.
- HR employee lifecycle management for transfers, promotions, leave of absence, return to work, and termination with effective dates and audit logs.
- Employment Terms Center for versioned working-condition summaries, wage-basis hashes, employee acknowledgement, and redacted audit evidence.
- HR termination compliance foundation for Taiwan advance notice and severance review: lifecycle termination events capture reason category, labor pension/legacy scheme, optional average monthly wage, sourced notice/severance estimates, offboarding readiness for final wage review, unused leave settlement, statutory insurance withdrawal, access revocation, record retention, employment certificate readiness, human-review flags, and redacted audit metadata.
- HR Offboarding Center turns termination events into final wage, unused leave settlement, statutory insurance withdrawal, access revocation, record retention, and employment certificate tasks with due dates, redacted evidence hashes, audit logs, and launch-gate readiness.
- HR employee document vault for contracts, certificates, HR attachments, employee self-service visibility, configurable object-storage metadata, scan status, retention policy, and audit logs.
- Privacy Center for employee personal data notices, acknowledgement coverage, data subject requests, retention controls, cross-border/subprocessor posture, launch readiness, and redacted audit evidence.
- Training Center for short onboarding courses, first-week training-minute KPI control, required assignment, employee completion acknowledgement, and audited launch evidence.
- Work Rules Center for versioned employee handbook/company work rules, HR/legal review status, content hashes, employee acknowledgement evidence, and launch-readiness coverage.
- Workplace Incident Center for safety hazards, near misses, occupational accidents, harassment, and workplace violence reports with confidential employee intake, HR investigation tracking, 8-hour severe incident notification target, corrective action evidence, and redacted audit logs.
- HR shift template settings for reusable day/night/cross-midnight shifts and audited daily schedule generation.
- Leave request with balance reservation, attachment placeholder, and shift conflict warning.
- Overtime request with daily work-hour threshold warning.
- Punch correction request for missing punches.
- HR attendance policy settings for regular daily minutes, overtime warning thresholds, punch grace minutes, mobile punch, and approval guardrails.
- HR worktime compliance scan for daily total work, monthly overtime, and rest-day cycle risks before payroll close.
- HR leave policy settings for leave codes, statutory category, eligibility rule, pay-rate percent, annual units, accrual method, documentation requirements, paid/unpaid status, legal-review flag, and balance provisioning.
- HR Taiwan statutory leave coverage checks for annual leave, sick leave, personal leave, family care, menstrual leave, maternity leave, paternity/checkup accompaniment leave, marriage leave, bereavement leave, official leave, and occupational injury/sickness leave.
- HR company calendar settings for national holidays, company holidays, makeup workdays, paid/unpaid days, annual source review evidence, and schedule/payroll review sources.
- Unified Inbox for leave, overtime, punch correction, and custom HR forms.
- Approve/reject with manager comment.
- Employee request timeline and in-app notifications.
- Notification channel settings and delivery metadata for in-app, email, LINE, Slack, and Teams, with external payload hashes instead of raw sensitive content.
- HR attendance exception view.
- HR winning KPI scorecard for leave speed, manager approval speed, payroll close reduction, attendance auto-resolution, mobile task completion, form self-service, audit coverage, payroll access security, sourced AI answers, and rollout training time.
- Privacy-safe product telemetry foundation for KPI measurement, storing workflow, step, duration, success, and redacted metadata instead of raw HR content, salary, national IDs, or bank data.
- Database verification script checks migrated/seeded PostgreSQL readiness for tenant/company, users, core role assignment coverage, employees, security settings, operational backup/restore evidence, attendance policy, shift template, annual Taiwan calendar review, statutory leave policy coverage, rule versions, rule validation evidence, legal-source freshness evidence, per-active-employee leave/payroll profile coverage, form workflows, audit baseline, sensitive onboarding audit coverage, support access governance, and product telemetry. Production mode additionally blocks demo tenant identity, demo storage, missing SSO metadata, missing privileged SSO identity bindings, default email domains, missing external notifications, missing backup/restore drill evidence, missing or unreviewed statutory leave categories, unsafe support access grants, and payroll rule recalculation gaps.
- Audit log writes for create/approve/reject paths when PostgreSQL is configured.
- Salary profile, payroll run, seven-step monthly close, payroll draft, lock, release, and employee payslip demo flow.
- Payroll close tracks the active Taiwan labor/payroll rule version used by each draft. If rules are pending legal review or marked for recalculation after a company override, payroll lock is blocked until HR recalculates with the reviewed active version.
- HR salary profile management with effective dates, recurring allowances/deductions, payroll-only RBAC, and redacted audit logs.
- HR salary profile minimum wage readiness checks compare current profiles against the active configurable Taiwan labor rule version, block below-minimum saves, and keep production verification details aggregate-only so raw salary values do not leak into logs.
- HR employee payment profile management with payment coverage tracking, masked account display, account hashes, and redacted audit logs.
- Audited payroll export packages for locked/released payroll runs, including bank-transfer readiness, configurable token-vault/KMS/bank-format verification posture, and configurable accounting-journal summaries with content hashes and redacted audit metadata.
- PostgreSQL-backed payroll run creation, recalculation, HR confirmation, lock, payslip release, and employee payslip reads are available when `DATABASE_URL` is configured, with demo fallback for local UI smoke tests.
- Locked payroll changes go through an explicit adjustment approval flow: HR requests the correction, Owner approval from the unified Inbox applies payroll items/payslip updates, and every step writes audit logs instead of silently mutating closed payroll.
- Payroll calculations reference configurable rule versions, select Taiwan insurance/contribution salary grades before statutory deductions/employer contributions, calculate NHI supplementary premium for configured bonus items, and keep manager salary access denied by default.
- Payroll access matrix tests keep payroll dashboards payroll-only, employees limited to their own released payslip, managers out of salary data by default, and AI payroll explanations amount-redacted.
- Payroll calculations can generate sourced unused annual leave payout items for year-end or contract-termination settlement, using Labor Standards Act Article 38 and Enforcement Rule Article 24-1 daily-wage rules.
- HR annual leave settlement workspace prepares audited unused-leave payout drafts before payroll calculation, so payroll never silently adds statutory settlement pay without HR review. Payroll lock then applies included settlement units to leave balances through audited balance updates.
- Annual leave balances track carried-over units separately from current-year units. Approved leave and settlement application consume carried-over units first, matching Enforcement Rule Article 24-1.
- HR annual leave grant workspace previews and creates yearly annual leave balances from Article 38 service-month tiers, carrying forward prior remaining units and notifying employees.
- HR annual leave expiry workspace scans upcoming annual-leave expiry risks and sends audited employee reminders after HR review.
- Employee payroll compliance profiles store tax residency, dependent count, insurance wage overrides, withholding method, and effective dates separately from salary amounts.
- HR can review and update employee payroll compliance profiles from the monthly close flow; each sensitive change is audited.
- Payroll compliance readiness recommends labor insurance, NHI, and labor pension insured salary grades from active salary profiles plus fixed allowances, flags explicit overrides below the configured grade tables, and blocks production verification with aggregate-only details.
- HR statutory insurance center tracks labor insurance, employment insurance, occupational accident insurance, NHI, and labor pension enrollment/withdrawal evidence with due dates, redacted evidence hashes, audit logs, and production verification coverage.
- Employer statutory payroll cost now separates labor insurance employer premium, NHI employer premium, occupational accident insurance, and labor pension contribution from employee net pay.
- Income tax withholding uses a versioned annualized progressive estimate with 2026 eTax rate brackets and is flagged for HR review before payroll lock.
- Payroll recordkeeping settings track 5-year wage roster retention, employee wage statement access, wage calculation details, and labor-inspection export readiness with audited changes.
- Attendance Exception Center tracks monthly close queues, safe missing-punch resolution suggestions, HR-reviewed working-time risks, KPI resolution rate, and redacted audit evidence before payroll lock.
- Monthly attendance sign-off lets employees confirm attendance summaries from mobile before payroll close, while HR tracks coverage and audit hashes without exposing raw attendance logs.
- Worktime agreement settings track labor union/labor-management conference approval evidence, effective periods, local authority filing status, and audited readiness before extended monthly overtime limits are used.
- Low-code HR form builder with text, number, date, select, file placeholder, checkbox, and textarea fields.
- Workflow template steps for direct manager and HR review, with placeholders for visibility and conditional logic.
- Safe AI Copilot layer for sourced policy Q&A, HR-reviewed form drafts, approval summaries, and payroll exception explanations.
- HR-managed policy source library for AI Copilot. Policy Q&A only cites active approved company policy excerpts and configured rules; draft or inactive sources are excluded.
- AI usage logging stores category, actor, referenced record IDs, and output/prompt hashes without raw sensitive prompts.
- Company security posture settings for admin/employee MFA requirements, SSO enforcement boundary, password policy, session timeout, allowed email domains, and audit logs.
- Owner user access workspace for inviting users, assigning RBAC roles, suspending/reactivating accounts, and auditing access changes.
- Owner-approved support access grants are ticket-bound, scoped, limited to 72 hours, revocable, audited with redacted metadata, and checked by production verification so customer support cannot become silent impersonation.
- Owner Subscription Center for customer plan, status, seat limits, trial/contract dates, billing contact, contract reference/hash, payment collection mode, and commercial verification before sale.
- Owner operational resilience workspace for recording backup provider, encrypted retention, last successful backup, restore drill status, RTO/RPO, and verification evidence before production launch.
- Taiwan labor standards v1 rule settings for 2026 minimum wage, regular working time, Labor Standards Act Article 24 overtime tiers, Article 36 rest-day cycle controls, Article 37/39 holiday work pay controls, Article 38 annual leave entitlement and unused-leave payout, Article 16/17 termination notice and severance review settings, Labor Pension Act Article 12 severance settings, statutory onboarding/offboarding due-day settings for labor/employment/occupational accident insurance, configurable statutory payroll rates, NHI average dependent count, NHI supplementary premium bonus threshold/rate, occupational accident rates, income tax withholding estimate settings, and versioned insurance salary grade tables for labor insurance, NHI, and labor pension.
- Taiwan labor rule change control requires every company override to keep a change reason, source URL, reviewer, legal-review status, payroll recalculation flag, versioned rule record, deterministic fixture validation summary, and redacted audit metadata.
- Audit log console for reviewing sensitive mutations as redacted metadata and before/after hashes, plus labor-inspection evidence packages with period filters, entity/action summaries, coverage warnings, and content hashes.
- DB-backed Taiwan labor rule settings through `law_rules` and `rule_versions` when PostgreSQL is configured, with superseded version history and audit logs.
- Shared tenant/session guard for sensitive API routes, enforcing tenant/company context, RBAC permission, employee context when required, and company authentication policy.
- Tenant isolation guardrail tests require every non-demo API route to call `requireTenantSession`, forbid direct DB imports in API routes, and ensure DB fallback helpers require tenant and company context together.
- Global Next.js security headers set clickjacking, MIME sniffing, referrer, permissions, COOP/CORP, and CSP report-only baselines; production mode also enables HSTS.
- API middleware blocks explicit cross-origin mutation requests before they reach HR, payroll, approval, form, AI, or settings handlers.
- Public operational health endpoints expose `/api/health/live` for liveness and `/api/health/ready` for readiness without returning secrets, database URLs, PII, salary, or tenant data.
- Owner launch-readiness dashboard checks PostgreSQL persistence, tenant foundation, commercial subscription readiness, SSO/MFA posture, privileged SSO identity bindings, support access governance, personal data governance, onboarding training evidence, workplace incident response, production document storage, external notification readiness, Taiwan rule governance, audit evidence, and KPI gates before sale.
- Customer tenant provisioning CLI creates a non-demo tenant foundation with owner access, core roles, production SSO posture, object-storage settings, external notification posture, Taiwan rule baselines, default HR policies, starter form workflow, and audit evidence before employee import.
- GitHub Actions CI runs schema validation, typecheck, lint, unit tests, and build on pull requests and `main`; E2E smoke and production release gates are available as separate workflows.

## Stack

- TypeScript
- Next.js App Router
- PostgreSQL
- Prisma
- Tailwind CSS
- Vitest
- Playwright

## Local Setup

1. Install dependencies:

```bash
pnpm install
```

2. Create local env:

```bash
cp .env.example .env
```

3. Start PostgreSQL:

```bash
docker compose up -d
```

4. Create database tables:

```bash
pnpm db:migrate
```

5. Load demo seed data:

```bash
pnpm db:seed
```

6. Verify the database foundation:

```bash
pnpm db:verify
```

7. Provision a customer tenant foundation:

```bash
pnpm db:provision:tenant -- \
  --tenant-name="Customer A" \
  --tenant-slug=customer-a \
  --plan=enterprise \
  --company-name="Customer A" \
  --company-legal-name="Customer A Co., Ltd." \
  --company-tax-id=12345678 \
  --owner-email=owner@customer.example \
  --owner-display-name="Customer Owner" \
  --owner-external-subject=00000000-0000-0000-0000-000000000001 \
  --allowed-email-domain=customer.example \
  --sso-provider="Entra ID" \
  --sso-issuer-url=https://login.example.com/customer/v2.0 \
  --sso-client-id=hr-one-client \
  --sso-jwks-url=https://login.example.com/customer/keys \
  --storage-provider=s3 \
  --storage-bucket=customer-a-hrone-documents \
  --storage-region=ap-northeast-1 \
  --storage-kms-key-ref=alias/customer-a-hrone \
  --notification-channel=email
```

8. Import production employees, managers, salary profiles, payroll compliance profiles, and payment profiles through the HR import workspaces so employee, payroll, payment, and compliance audit evidence is created.

9. For a customer tenant, run the production onboarding gate:

```bash
pnpm db:verify:production -- --tenant-slug=<customer-slug>
```

10. Run the full release gate before go-live. Local mode runs schema validation, typecheck, lint, unit tests, E2E smoke tests, and production build. Production mode runs the same checks and then verifies the customer tenant database:

```bash
pnpm release:gate
pnpm release:gate:production -- --tenant-slug=<customer-slug>
```

11. For Vercel + Supabase deployment, configure Vercel project `prj_Ueh6m200Y21GRuTjXKWZxTWc6IQa` with production environment variables:

- `DATABASE_URL`: Supabase PostgreSQL connection string from the Supabase dashboard. Use a server-side secret only; do not expose the database password as a public variable.
- `HR_ONE_DEPLOYMENT_TARGET=vercel`
- `VERCEL_PROJECT_ID=prj_Ueh6m200Y21GRuTjXKWZxTWc6IQa`
- `HR_ONE_DATABASE_PROVIDER=supabase_postgres`
- `NEXT_PUBLIC_SUPABASE_URL=https://aruncclorusswpfnpgsn.supabase.co`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_yScyXz-bOUu7W5geHggd4A_9FcGwU7M`
- All `HR_ONE_*` production secrets and vault references listed in `.env.example`.

Then run `pnpm env:verify:production` in the deployment environment before running migrations and production tenant verification.

12. Start the app:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Demo Roles

Use the role switcher in the top bar:

- `employee` opens `/app`
- `manager` opens `/manager/inbox`
- `hr_admin` opens `/hr`
- `owner` opens `/settings`

Seed data includes one tenant, one company, two departments, one owner, one HR admin, one manager, three normal employees, salary profiles, and payroll compliance profiles with resident/non-resident examples.
HR admins can open `/hr/forms` to create custom forms and attach manager/HR approval workflows. Employees submit active forms from `/app`; approvers process them from `/manager/inbox`.
HR admins can open `/hr/onboarding-readiness` to clear customer setup gaps before running production verification, including statutory insurance enrollment coverage based on the active Taiwan rule settings. They can then open `/hr/employee-import` to preview, validate, and import employee CSV data without engineering support. After employees exist, HR can open `/hr/payroll-profile-import` to batch import salary, payment destination, and payroll compliance profiles from one CSV instead of editing each employee one at a time.
HR admins can open `/hr/employee-lifecycle` to record employee transfers, promotions, leave, return, and termination events. Events update the employee profile and write audit logs. Termination events include a Taiwan compliance review snapshot for notice days and severance estimates using the active versioned labor rule settings, plus an offboarding readiness checklist for final wage review, unused annual leave settlement, statutory insurance withdrawal due date, access revocation, employee record retention, and employment certificate readiness; the output is advisory and always marked for human HR/legal review.
HR admins can open `/hr/employment-terms` to publish structured working-condition summaries for employees, including job title, workplace, regular work schedule, wage payment day, source reference, and a wage-basis hash linked to salary profiles. Employees can open `/app/employment-terms` to acknowledge active terms from mobile. Audit logs store hashes and status metadata rather than raw wage terms.
HR admins can open `/hr/offboarding` after recording a termination to close final wage, unused leave settlement, statutory insurance withdrawal, access revocation, record retention, and employment certificate tasks. Evidence references and private notes are hashed before audit storage, and production verification requires completed or waived offboarding tasks for every termination event.
HR admins can open `/hr/documents` to register employee document metadata and release selected documents to employee self-service at `/app/documents`. File bytes are not stored in the database; object keys are reserved through the configured storage policy with scan status, retention, encryption mode, and audit requirements.
Owners and HR admins can open `/hr/shift-templates` to maintain reusable shifts and generate daily work schedules for active employees with audit logs.
Owners and HR admins can open `/hr/attendance-policies` to maintain attendance thresholds, punch guardrails, attendance record retention, and employee self-service/export access. Overtime risk summaries use the active policy instead of hidden constants, and production verification requires 5-year attendance record retention with employee record access enabled. Employees can open `/app/attendance` from the mobile Time tab to review their recent attendance records without asking HR.
Employees can sign off the current monthly attendance period from `/app/attendance` after pending exceptions are cleared. HR admins can open `/hr/attendance-signoffs` to track coverage before payroll close; sign-off audit logs store period counts and summary hashes instead of raw clock details.
Owners and HR admins can open `/hr/worktime-compliance` to scan monthly working-time risks against configured Taiwan labor standards and create attendance exceptions before payroll close.
Owners and HR admins can open `/hr/worktime-agreements` to maintain the approval evidence, effective dates, configured overtime limits, local authority filing status, and HR verification note used by worktime compliance. Production verification requires a verified agreement record with evidence before extended monthly overtime limits are considered ready.
HR admins can open `/hr/leave-policies` to create or update leave policies without code changes. Policy changes are audited and can provision missing employee balances. The page also shows Taiwan statutory leave coverage and flags missing or still-under-review categories before rollout. The wizard keeps Taiwan leave-type compliance configurable through statutory category, eligibility rule, pay-rate percent, annual limit notes, and a legal-review flag rather than hardcoding every leave law into request handling.
HR admins can open `/hr/annual-leave-grants` to preview and create yearly annual leave balances from employee hire dates and Article 38 entitlement tiers. The batch carries forward prior remaining units, resets current-year usage buckets, sends employee notifications, and writes audit logs.
HR admins can open `/hr/annual-leave-expiry` to review employees with annual leave approaching year-end expiry and send audited reminders before close.
Owners and HR admins can open `/hr/calendar` to maintain company-reviewed holidays and makeup workdays. The page also stores an audited annual calendar review with source URL, source checked date, reviewer, approval status, expected national holiday count, makeup workday count, and company holiday count. Calendar changes and annual reviews are audited and must be approved before schedule generation, payroll close, and production verification.
HR admins can open `/hr/policy-sources` to manage approved policy excerpts that AI Copilot may cite. HR admins can then open `/hr/copilot` for AI-assisted policy answers, form drafts, and payroll explanations. AI outputs are suggestions only and blocked from final hiring, firing, compensation, performance, or disciplinary decisions.
HR admins can open `/hr/work-rules` to publish versioned company work rules or an employee handbook, store a source reference and content hash, mark HR/legal review status, and track employee acknowledgement evidence. Employees can open `/app/work-rules` from the mobile UI to acknowledge active rules in one action. Work-rule mutations and acknowledgements write audit logs without storing raw rule content.

HR admins can open `/hr/training` to keep first-week onboarding training under the KPI target, maintain short required courses, assign required training to active employees, and track completion evidence. Employees can open `/app/training` from the mobile UI to complete assigned training with one acknowledgement action. Training settings, assignment batches, and employee completions write audit logs without storing raw private notes.
HR admins can open `/hr/incidents` to configure workplace incident response controls, keep severe incident notification targets at 8 hours or less, review employee reports, track investigations, mark authority follow-up, and record corrective action. Employees can open `/app/incidents` from the mobile UI to confidentially report safety hazards, near misses, occupational accidents, harassment, or workplace violence. Incident audit logs keep hashes, status, type, severity, and due dates instead of raw incident descriptions.
HR admins can open `/hr/kpis` to review the product winning KPI scorecard. It reads privacy-safe product telemetry for leave success time, manager approval time, mobile task completion, and HR form self-service. It intentionally flags sale readiness as not ready while operational KPIs still need deeper production telemetry or improvement.
HR admins can open `/hr/payroll-compliance` from monthly close to maintain tax residency, dependents, insurance wage overrides, and non-resident withholding rates with audit logs. Monthly close also shows whether the payroll draft was calculated with the active reviewed Taiwan labor/payroll rule version; stale drafts or pending legal-review rules block payroll lock and require recalculation or rule approval first.
HR admins can open `/hr/insurance` to track Taiwan statutory labor insurance, employment insurance, occupational accident insurance, NHI, and labor pension enrollment evidence. Due dates come from versioned rule settings where available, evidence references are hashed in audit metadata, and production verification requires every active employee to have ready statutory insurance records.
HR admins can open `/hr/annual-leave-settlements` from monthly close to prepare unused annual leave payout drafts before payroll calculation. Drafts are sourced to Labor Standards Act Article 38 and Enforcement Rule Article 24-1, audited as redacted settlement batches, included in payroll only after recalculation, and applied to leave balances only when payroll is locked. Carried-over annual leave is tracked separately and consumed before current-year leave for both approved leave and year-end settlement.
HR admins can open `/hr/salary-profiles` from monthly close to maintain employee salary profiles. Managers cannot read or write salary profiles.
HR admins can open `/hr/payment-profiles` from monthly close to maintain employee payment destinations. The app stores account hashes and last four digits only; production account tokens must live in the configured payment token vault.
HR admins can open `/hr/payroll-recordkeeping` from monthly close to maintain wage roster retention, employee wage statement access, calculation-detail availability, and labor-inspection export readiness. Production verification requires at least 5-year wage roster retention and employee-accessible wage calculation details.
HR admins can open `/hr/attendance-exceptions` to resolve missing-punch and working-time exceptions before payroll close. Warning-level missing-punch items receive safe suggestions that HR can confirm in bulk or one by one, while working-time risks remain manual HR/legal review items. Resolution evidence references and comments are hashed before audit storage so private employee notes or chat links do not appear in logs.
HR admins can open `/hr/payroll-payment-security` to configure token-vault references, KMS references, customer bank file format, and verification evidence before bank upload readiness is considered production-ready.
HR admins can open `/hr/payroll-adjustments` after payroll lock/release to request audited post-close allowances or deductions. Owners can approve or reject pending adjustments from `/manager/inbox` or the same adjustment page before payroll items or payslips change.
HR admins can open `/hr/payroll-accounting` to map payroll export summaries to the company chart of accounts, then open `/hr/payroll-exports` after payroll lock/release to generate audited bank-transfer readiness and accounting-journal packages. Payment destinations are tracked with masked/hash data, and bank packages stay marked as readiness-only until the payment token vault and customer bank format are verified.
Owners can open `/settings` to review and adjust Taiwan labor rule settings. Defaults are versioned and include official law/source references for minimum wage, regular working time, overtime, rest days, national holidays, holiday work pay, annual leave entitlement, unused annual leave payout, statutory onboarding/offboarding timing, statutory payroll, NHI supplementary premium, and tax estimates. Company overrides should stay at or above legal minimums and must carry change-control metadata: reason, source URL, reviewer, legal-review status, and whether existing payroll drafts need recalculation review. Statutory payroll rates, work-time limits, rest-day cycle controls, holiday multipliers, annual-leave payout basis, statutory insurance due-day settings, NHI supplementary premium settings, and salary grade tables live in rule records so payroll formulas use configured versions instead of hidden constants. Salary grade table CSV lines use `level, insured salary, salary from, salary to`; income tax bracket CSV lines use `taxable from, taxable to, rate percent, progressive difference`. Occupational accident industry rates, NHI supplementary premium settings, and income tax withholding estimates should be reviewed before payroll launch.
Every Taiwan labor rule update runs deterministic validation fixtures for minimum wage boundaries, Article 24 overtime tiers, rest-day/holiday work, working-time caps, seven-day rest cycles, Article 38 annual leave tiers, termination compliance, and NHI supplementary premium before the version is accepted. The validation summary is stored with the rule version and audit metadata. Launch readiness also checks official legal source review freshness with a 180-day default window, so stale source reviews block production approval even when formulas still pass.
Owners can open `/settings/readiness` to review launch gates before selling or onboarding a customer. The page intentionally marks demo-only persistence/storage, missing backup and restore evidence, missing production SSO, missing privileged SSO identity bindings, unsafe support access grants, unverified payroll payment vault/bank formats, pending legal-review rules, missing audit evidence, notification gaps, and KPI failures as action items or blockers, then turns them into a guided production setup wizard with links to the relevant setup page or database verification path.
Owners can open `/settings/subscription` to manage customer commercial readiness. The page keeps plan/status, seat limits, trial and contract dates, billing contact, contract reference/hash, payment collection mode, and verification status owner-only. Audit logs store hashes and posture metadata instead of raw contract text, payment data, or customer private notes.
Owners can also configure company security posture from `/settings`, including MFA policy, SSO provider metadata, password requirements, session timeout, and allowed email domains. SSO setup stores non-secret issuer, client ID, and JWKS URL metadata only; provider secrets belong in the deployment vault. Sensitive API guards evaluate session assurance claims against these settings so a production auth provider can plug in SSO/MFA claims without rewriting business modules.
Owners can open `/settings/access` to invite users, assign roles, suspend/reactivate accounts, and link users to stable OIDC issuer/subject identities for production SSO. Access and SSO identity changes are audited, invite tokens are not stored in raw form, and privileged roles show when SSO is required by company policy.
Owners can open `/settings/support-access` to approve or revoke temporary customer support access. Grants are ticket-bound, scoped, limited to 72 hours, audited, and included in production database verification.
Owners and HR admins can open `/settings/privacy` to manage the employee personal data notice, acknowledgement requirement, HR record retention target, data subject request response target, deletion-review requirement, cross-border transfer/subprocessor posture, and legal/HR verification status. Employees can open `/app/privacy` to acknowledge the current notice, submit access/correction/export/restriction/deletion-review requests, and track outcomes. Privacy actions write audit logs with hashes and status metadata rather than raw request notes.
Owners can open `/settings/operational-resilience` to record backup and restore readiness. The production gate requires enabled backups, a non-demo provider, 30+ day retention, an encryption key reference, last backup evidence, a passed restore drill within 90 days, a restore drill ticket, and verified status. Audit metadata stores posture flags and hashes, not raw backup credentials or secret values.
Owners can configure file storage posture from `/settings`, including object storage provider, bucket, base prefix, KMS reference, allowed MIME types, maximum size, malware scan requirement, signed URL TTL, retention days, and verification evidence. Secrets stay in the provider vault and are not stored in this app. Launch readiness requires non-demo storage, KMS, malware scanning, and a verified smoke-test status.
Owners can open `/settings/notifications` to configure in-app, email, LINE, Slack, and Teams notification channels. External channels default to summary-only payloads, and delivery records store hashes/status rather than raw sensitive message bodies.
Owners and HR admins with audit permission can open `/settings/audit` to review recent sensitive events without exposing raw private payloads and generate redacted labor-inspection evidence packages for a selected period. Package generation is itself audited and the package stores summary rows, warnings, and hashes instead of raw PII, salary, bank account, national ID, or health values.

## Commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
DATABASE_URL="postgresql://hrone:hrone@localhost:5432/hrone?schema=public" pnpm exec prisma validate
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm db:provision:tenant -- --tenant-name="Customer A" --tenant-slug=customer-a --plan=enterprise --company-name="Customer A" --company-legal-name="Customer A Co., Ltd." --company-tax-id=12345678 --owner-email=owner@customer.example --owner-display-name="Customer Owner" --owner-external-subject=00000000-0000-0000-0000-000000000001 --allowed-email-domain=customer.example --sso-provider="Entra ID" --sso-issuer-url=https://login.example.com/customer/v2.0 --sso-client-id=hr-one-client --sso-jwks-url=https://login.example.com/customer/keys --storage-provider=s3 --storage-bucket=customer-a-hrone-documents --storage-region=ap-northeast-1 --storage-kms-key-ref=alias/customer-a-hrone --notification-channel=email
pnpm env:verify
pnpm env:verify:production
pnpm db:verify
pnpm db:verify:production -- --tenant-slug=<customer-slug>
pnpm release:gate
pnpm release:gate:production -- --tenant-slug=<customer-slug>
```

If PostgreSQL is not running yet, the dashboard pages fall back to non-persistent demo data so role switching and UI smoke tests still work. Once `DATABASE_URL` is set and the database is migrated/seeded, the app reads from PostgreSQL.

`pnpm db:verify` validates the demo seed foundation. `pnpm db:verify:production -- --tenant-slug=<customer-slug>` is the launch gate for a real customer tenant; it requires non-demo tenant/company identity, verified commercial subscription terms, assigned owner/hr_admin/manager/employee roles, production SSO metadata, stable SSO issuer/subject bindings for privileged users, non-default email domains, verified object storage with KMS and malware scanning, verified operational resilience settings with encrypted backup retention and a recent passed restore drill, verified payroll payment token vault/KMS/customer bank format posture, external summary-only notifications, approved annual Taiwan holiday/makeup-workday calendar review, active and reviewed Taiwan statutory leave policies, approved work rules/employee handbook acknowledgement coverage, approved AI policy sources for sourced Copilot answers, approved Taiwan rule change control, passing validation evidence for every active rule version, fresh official source review evidence for active rule versions, no pending payroll recalculation requirement, no unapproved active support access grants, no expired support access grants still marked approved, current salary/payment/compliance/statutory-insurance profile coverage for every active employee, completed or waived offboarding tasks for every termination event, no payroll compliance override below the configured labor insurance/NHI/labor pension salary grade tables, categorized audit evidence for employee import plus salary, payment, payroll compliance, and payroll-profile import events, and KPI telemetry baseline. `pnpm release:gate:production -- --tenant-slug=<customer-slug>` wraps this production database gate with schema validation, typecheck, lint, unit tests, E2E smoke tests, and production build so release approval cannot skip app-level checks.

`pnpm db:provision:tenant` creates only the customer foundation. It intentionally does not create fake employees, fake salaries, fake payment destinations, or fake KPI telemetry. Pass `--owner-external-subject` with the IdP's immutable user subject when available; otherwise the CLI falls back to the owner email for the initial binding. After provisioning, HR must import real organization data, configure employee salary/payment/compliance profiles manually or through `/hr/payroll-profile-import`, run workflow smoke tests, verify storage smoke-test evidence from `/settings`, then run the production verification command.

Use `/hr/onboarding-readiness` after provisioning and employee import. It shows exactly which active employees are missing salary, payment, or explicit payroll compliance profiles, plus department/manager, time setup, and Taiwan rule-version blockers that would cause `pnpm db:verify:production` to fail.

## CI and Release Gates

- `.github/workflows/ci.yml` runs Prisma schema validation, typecheck, lint, unit tests, and production build on pull requests and `main`.
- `.github/workflows/e2e-smoke.yml` runs Playwright smoke tests on UI/server workflow changes and can be manually triggered before release.
- `.github/workflows/production-release-gate.yml` is manual-only. Configure the `HR_ONE_PRODUCTION_DATABASE_URL` repository secret, then run it with the customer `tenant_slug` and optional `company_id`.
- Production release verification requires these GitHub secrets: `HR_ONE_PRODUCTION_DATABASE_URL`, `HR_ONE_SESSION_SECRET`, `HR_ONE_ENCRYPTION_KEY`, `HR_ONE_AUDIT_LOG_SIGNING_KEY`, `HR_ONE_OBJECT_STORAGE_SECRET_REF`, `HR_ONE_RATE_LIMIT_SECRET_REF`, `HR_ONE_BACKUP_ENCRYPTION_KEY_REF`, and optionally `HR_ONE_AI_SECRET_REF` when an AI provider is enabled. If `HR_ONE_RATE_LIMIT_PROVIDER=external_http`, also configure `HR_ONE_RATE_LIMIT_HTTP_TOKEN`.
- Production release verification requires these GitHub variables: `HR_ONE_APP_URL`, `HR_ONE_DEPLOYMENT_TARGET`, `VERCEL_PROJECT_ID`, `HR_ONE_DATABASE_PROVIDER`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `HR_ONE_AUTH_PROVIDER`, `HR_ONE_AUTH_SESSION_SOURCE`, `HR_ONE_AUTH_ISSUER_URL`, `HR_ONE_AUTH_AUDIENCE`, `HR_ONE_AUTH_JWKS_URL`, `HR_ONE_AUTH_MAX_TOKEN_AGE_SECONDS`, `HR_ONE_AI_PROVIDER`, `HR_ONE_AI_PROMPT_STORAGE`, `HR_ONE_RATE_LIMIT_ENABLED`, `HR_ONE_RATE_LIMIT_PROVIDER`, `HR_ONE_RATE_LIMIT_WINDOW_SECONDS`, `HR_ONE_RATE_LIMIT_MAX_REQUESTS`, `HR_ONE_BACKUP_ENABLED`, `HR_ONE_BACKUP_RETENTION_DAYS`, and `HR_ONE_BACKUP_RESTORE_TESTED_AT`. If `HR_ONE_RATE_LIMIT_PROVIDER=external_http`, also configure `HR_ONE_RATE_LIMIT_HTTP_ENDPOINT`.
- `pnpm env:verify:production` checks production environment posture without printing secret values. It blocks local/demo database URLs, non-HTTPS app/auth URLs, missing/invalid Vercel project binding when Vercel is selected, missing/invalid Supabase project URL or publishable key when Supabase Postgres is selected, weak placeholder secrets, missing storage secret references, demo auth session sources, missing OIDC audience/token-age settings, enabled AI providers without vault references, raw AI prompt storage, disabled application rate limiting, missing or invalid rate limit posture, missing external HTTP rate limit endpoint/token when that provider is selected, disabled backups, short backup retention, missing backup encryption references, and stale restore drill evidence.
- `pnpm release:gate:production` intentionally runs app quality checks with `DATABASE_URL` cleared so E2E uses demo fallback state; only the environment verification and final production tenant verification command use production deployment context.

## Security Guardrails

- Do not log PII, payroll values, bank account data, national IDs, or health data.
- Product telemetry must store only workflow names, steps, duration, success flags, and redacted metadata; never raw HR request text, salary, bank account, national ID, or health data.
- Use `safeLogFields` or `redactSensitivePayload` for structured logging.
- Sensitive mutations should use a transaction and `writeAuditLog`.
- RBAC starts with `owner`, `hr_admin`, `manager`, and `employee`.
- API routes that read or mutate tenant data should call `requireTenantSession()` before business logic.
- Non-demo API routes must not import the DB client directly; use service modules that scope all DB reads/writes by tenant and company.
- Production SSO uses provider-neutral OIDC JWT verification against configured issuer, audience, JWKS, expiry, issued-at, not-before, and maximum token age. When `HR_ONE_AUTH_SESSION_SOURCE=oidc`, guarded API routes require an `Authorization: Bearer <token>` header; demo role cookies are only for local/demo flows. Verified tokens identify the tenant/company and external identity; HR One first maps `issuer + subject` through `UserExternalIdentity`, then resolves the active user account and role assignment from its own database before granting access, so IdP role claims cannot self-elevate payroll, HR, or owner permissions. MFA evidence is derived from standard `amr`/`acr` claims and raw tokens are never stored in logs or audit payloads.
- Support access must be explicitly approved by a customer owner, tied to a ticket/reason, scoped, time-limited, and revoked when work ends. Production verification fails if active support access is unapproved or if expired grants are still marked approved.
- AI cannot make hiring, firing, performance, layoff, or compensation decisions.
- AI prompts are safety-checked, redacted, source-bound where required, and audited without storing raw sensitive prompt text by default.
- Browser security headers are applied globally from `next.config.ts`. `Strict-Transport-Security` is emitted only when `HR_ONE_ENV=production`; keep local and preview environments on non-production mode unless they are served over stable HTTPS.
- API mutation requests pass through `src/middleware.ts`, which rejects unsafe methods with cross-origin or malformed `Origin` headers. Server-to-server clients without browser `Origin` headers remain allowed and must still pass route-level auth/RBAC.
- API mutation requests also pass through application-level fixed-window rate limiting. AI, import, and authentication-adjacent endpoints use stricter buckets and return generic `429` responses without exposing client identifiers or request details.
- For multi-instance production deployments, set `HR_ONE_RATE_LIMIT_PROVIDER=external_http` and configure a private HTTPS rate-limit service. HR One sends only bucket metadata and a SHA-256 client key hash, not raw IP addresses or request bodies. If the provider is unavailable, unsafe API requests fail closed with a generic `503`.
- Production release gates require application rate limiting plus an upstream, edge, or distributed rate limit provider for API mutation, AI, import, and authentication-adjacent endpoints before go-live.
- Session/demo cookies use HttpOnly and SameSite=Lax, and automatically add Secure when `HR_ONE_ENV=production`.
- `/api/health/live` is for load balancer liveness probes. `/api/health/ready` checks production environment posture and database availability, returns `503` when production readiness fails, and must never reveal secret values or connection strings.
- Taiwan labor/payroll rules should live in rule settings or `law_rules` / `rule_versions`, not scattered through business logic.
- `src/server/payroll/access.test.ts` is the explicit regression guard for unauthorized payroll data access; it must stay green before release.

## Important Files

- `PLAN.md`: product and implementation plan.
- `prisma/schema.prisma`: PostgreSQL data model, including salary profiles and payroll compliance profiles.
- `prisma/seed.ts`: demo tenant/company/departments/employees/roles/rule seed.
- `prisma/provision-tenant.ts`: production customer tenant foundation CLI.
- `prisma/verify.ts`: demo and production database readiness verification CLI.
- `scripts/release-gate.ts`: release gate CLI that runs app quality checks and production tenant verification in sequence.
- `src/server/provisioning/tenant.ts`: customer tenant provisioning service and validation rules.
- `src/server/onboarding/readiness.ts`: HR onboarding completeness checks before production tenant verification.
- `src/server/readiness/health.ts`: liveness/readiness health report service used by operational probe endpoints.
- `src/server/readiness/operational-resilience.ts`: backup, retention, restore drill, RTO/RPO, verification, and audit service used by launch readiness.
- `src/server/subscriptions/service.ts`: owner-only customer subscription posture, commercial readiness checks, and redacted audit logging.
- `src/server/auth/rbac.ts`: RBAC permissions.
- `src/server/auth/access-management.ts`: owner user invitation, role assignment, account status management, and access audit service.
- `src/server/auth/guards.ts`: shared tenant/session/permission guard for server routes.
- `src/server/auth/tenant-isolation.test.ts`: static tenant isolation regression tests for API guard usage, service-layer DB access, and tenant/company fallback requirements.
- `src/server/security/request-origin.ts`: cross-origin mutation guard used by global API middleware.
- `src/server/security/rate-limit.ts`: application-level API rate limiter used by global middleware as a final abuse-protection boundary.
- `src/server/kpis/hr-one.ts`: HR One winning KPI scorecard definitions and sale-readiness summary.
- `src/server/telemetry/product.ts`: privacy-safe product telemetry service for KPI measurement with DB/demo fallback.
- `src/server/employees/employment-terms.ts`: structured employment terms, wage-basis hashes, employee acknowledgement, RBAC, audit logs, and DB/demo fallback.
- `src/server/attendance/exceptions.ts`: monthly attendance exception queue, safe resolution suggestions, KPI summary, redacted audit logs, and DB/demo fallback.
- `src/server/attendance/signoffs.ts`: employee monthly attendance sign-off, HR coverage tracking, redacted audit logs, and DB/demo fallback.
- `src/server/privacy/governance.ts`: personal data notice settings, employee acknowledgements, data subject request workflow, privacy readiness, RBAC, audit logs, and DB/demo fallback.
- `src/server/work-rules/service.ts`: company work rules/employee handbook versions, HR/legal review readiness, employee acknowledgement evidence, RBAC, audit logs, and DB/demo fallback.
- `src/server/training/compliance.ts`: onboarding training controls, required course assignments, employee completion acknowledgements, readiness scoring, RBAC, audit logs, and DB/demo fallback.
- `src/server/incidents/workplace.ts`: workplace incident settings, confidential employee reporting, HR follow-up workflow, severe incident notification due dates, readiness scoring, RBAC, audit logs, and DB/demo fallback.
- `src/server/insurance/statutory.ts`: Taiwan statutory insurance enrollment/withdrawal evidence, due-date readiness, RBAC, audit logs, and DB/demo fallback.
- `src/server/auth/policy.ts`: authentication assurance policy for SSO, MFA, allowed email domains, session lifetime, and idle timeout.
- `src/server/auth/oidc.ts`: provider-neutral OIDC JWT verifier for production SSO token validation.
- `src/server/auth/oidc-session.ts`: DB-backed OIDC session resolver that maps verified identity claims to active HR One users, employees, and company role assignments.
- `src/server/notifications/service.ts`: notification channel settings, delivery metadata, payload hashing, and DB/demo fallback.
- `src/server/audit`: redaction and audit foundations.
- `src/server/audit/queries.ts`: audit log query boundary for DB and demo audit trails.
- `src/server/employees/documents.ts`: employee document vault with storage object metadata, self-service visibility, RBAC, audit logs, and DB/demo fallback.
- `src/server/files/storage.ts`: configurable file storage policy and object reservation abstraction for HR documents and future attachments.
- `src/server/employees/imports.ts`: employee CSV import wizard service with validation, RBAC, audit logs, and DB/demo fallback.
- `src/server/employees/lifecycle.ts`: effective-dated employee lifecycle event service with profile updates, RBAC, audit logs, and DB/demo fallback.
- `src/server/employees/offboarding.ts`: termination offboarding task readiness, redacted evidence hashes, RBAC, audit logs, and DB/demo fallback.
- `src/server/attendance/policies.ts`: attendance policy settings for overtime thresholds, punch controls, RBAC, audit logs, and DB/demo fallback.
- `src/server/attendance/worktime-compliance.ts`: monthly working-time compliance scanner for daily worktime, monthly overtime, and rest-day cycle risks.
- `src/server/calendar/company-calendar.ts`: company calendar settings and annual Taiwan calendar review readiness for holidays and makeup workdays with RBAC, audit logs, and DB/demo fallback.
- `src/server/leave/policies.ts`: leave policy settings service with Taiwan leave category metadata, eligibility/pay-rate controls, RBAC, audit logs, balance provisioning, and DB/demo fallback.
- `src/server/leave/statutory.ts`: Taiwan statutory leave coverage requirements and readiness evaluator used by HR leave settings and production verification.
- `src/server/leave/annual-leave-grants.ts`: annual leave yearly grant batch preview/apply service using Article 38 entitlement tiers with audit logs and notifications.
- `src/server/leave/annual-leave-expiry.ts`: annual leave expiry risk scanner and audited reminder service with DB/demo fallback.
- `src/server/leave/annual-leave-settlements.ts`: HR-reviewed unused annual leave settlement drafts for payroll close with audit logs and DB/demo fallback.
- `src/server/scheduling/shift-templates.ts`: shift template and daily schedule generation service with RBAC, audit logs, and DB/demo fallback.
- `src/server/rules/interfaces.ts`: rule-engine placeholder.
- `src/server/rules/taiwan-labor-standards.ts`: Taiwan labor standards v1 calculation helpers, work-time/rest-day/holiday validations, and official source references.
- `src/server/rules/settings.ts`: Taiwan labor rule setting read/update service with DB-backed `rule_versions` and demo fallback.
- `src/server/rules/validation.ts`: deterministic Taiwan labor rule fixture validation and legal-source freshness checks used by settings, provisioning, seed data, launch readiness, and production database verification.
- `src/server/settings/security.ts`: company security posture settings with DB/demo fallback, RBAC, and audit logs.
- `src/server/payroll/db-store.ts`: PostgreSQL-backed payroll run close adapter for create, recalculate, confirm, lock, release, and payslip reads.
- `src/server/payroll/adjustments.ts`: locked payroll adjustment approval flow with RBAC, audit logs, DB/demo fallback, and post-approval payslip updates.
- `src/server/payroll/salary-profiles.ts`: salary profile management with payroll RBAC, effective dates, redacted audit logs, and DB/demo fallback.
- `src/server/payroll/payment-profiles.ts`: employee payment destination profiles with masked account display, account hashes, RBAC, audit logs, and DB/demo fallback.
- `src/server/payroll/profile-imports.ts`: payroll profile CSV import service for salary, payment, and compliance onboarding data.
- `src/server/payroll/accounting-settings.ts`: company payroll accounting export mappings with RBAC, audit logs, and DB/demo fallback.
- `src/server/payroll/exports.ts`: audited payroll export package generation with content hashes, redacted metadata, RBAC, and DB/demo fallback.
- `src/server/payroll/calculation.ts`: payroll calculation logic for salary, overtime, employee-specific compliance profiles, employee deductions, and employer statutory contributions.
- `src/server/payroll/compliance.ts`: payroll compliance profile query/update service with RBAC, DB/demo fallback, and audit logs.
- `src/server/payroll/access.test.ts`: payroll data access matrix for dashboard, payslip, manager restrictions, and AI amount redaction.
- `src/server/workflows`: attendance, leave, overtime, punch correction, custom forms, and approval workflow logic.
- `src/server/ai`: Copilot safety checks, policy-source retrieval, AI audit logging, and deterministic assistant services.
- `src/app/app/page.tsx`: employee mobile-first home.
- `src/app/manager/inbox/page.tsx`: manager approval Inbox.
- `src/app/hr/page.tsx`: HR monthly close dashboard.
- `src/app/hr/forms/page.tsx`: HR low-code form builder.
- `src/app/hr/copilot/page.tsx`: HR AI Copilot surface.
- `src/app/settings/page.tsx`: owner/admin settings.
- `src/app/settings/audit/page.tsx`: redacted audit log console.
