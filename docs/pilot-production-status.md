# HR One Production Pilot Status

Last checked: 2026-06-17 Asia/Taipei

## Current State

- Live domain: `https://hr.suiyuecare.com`
- GitHub repository: `Suiyuecare/suiyuecare-hr`
- Vercel project in repo metadata: `prj_QY0hzJ4hFzLX8XYO5ljIffLnH99N` (`suiyuecare-hr2`)
- Latest GitHub `main` includes the production SSO login guard and the pilot doctor env handoff update.
- `suiyuecare-hr2` may lag behind GitHub `main` when Vercel deployment rate limits are active; check the latest commit status before treating `hr.suiyuecare.com` as current.
- Vercel Production has the known bootstrap values and a server-side `DATABASE_URL`; the deployed app still needs a fresh deployment before live health can prove it is using the database.
- Legacy Vercel status context `Vercel - suiyuecare-hr` may still appear. Use `suiyuecare-hr2` as the active project.
- Supabase project `aruncclorusswpfnpgsn`, private schema `hr_one`, now contains a synthetic 25-person pilot tenant with expanded trial readiness controls.

## Live UI Evidence

The live site serves the new pilot UI:

- `/app` includes the employee mobile task cards: `主要任務`, `今日常用任務`, and `薪資單`.
- `/console` includes the backend pilot flow strip: `兩週試用核心流程`, `打卡 · 請假 · 薪資單`, `HR 月結`, and `安全上線`.
- `/hr`, after switching to the HR demo role, includes the updated module board: `後台模組`, `員工與任用`, `打卡與假勤`, `月結與發薪`, `表單與公告`, and `分析與稽核`.

## Production Gate Result

Command:

```bash
pnpm pilot:gate:production -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com
```

Current result: blocked.

Passing:

- HTTPS production URL is valid.
- `/api/health/ready` returns an HR One health payload.
- Health payload redaction does not expose database URLs, Supabase keys, salary, national ID, or bank data.

Blocking:

- Overall readiness is `degraded`.
- The deployed app may still be running an older build that reports a non-production environment and missing database until Vercel is redeployed.
- Production environment verification still requires real restore-drill evidence via `HR_ONE_BACKUP_RESTORE_TESTED_AT`.
- Manual Vercel redeploys may be delayed by the free daily deployment quota; use the next successful Git/Vercel deployment as the live proof point.

Supabase checks completed on 2026-06-17:

- `pnpm db:supabase:verify-schema -- --project-ref=aruncclorusswpfnpgsn --schema=hr_one --allow-tenant-data` passed: 76 tables, 11 enum types, 48/48 migrations, browser roles blocked, 1 tenant, 1 company, 25 employees.
- `pnpm db:supabase:seed-pilot -- --project-ref=aruncclorusswpfnpgsn --schema=hr_one --verify-only` passed: 25 active employees, 3 managers, 4 departments, 375 schedules, 11 leave policies, 275 leave balances, 25 payslips, announcement receipts, form workflow, rules, telemetry, audit coverage, browser-role isolation, and no callable public security-definer RPC exposure.
- `pnpm db:verify:production -- --tenant-slug=suiyuecare-pilot` was run with a temporary verification login and passed every database gate except operational resilience: restore drill remains `not_tested` and verification is `pending_restore_drill`. The temporary verification login was removed after the check.

## Required Before Real 20-50 Person Trial

1. Configure Vercel Production env for the active `suiyuecare-hr2` project:
   - confirm server-only Supabase PostgreSQL `DATABASE_URL` with `?schema=hr_one` is present
   - confirm production OIDC/SSO provider, issuer, login URL, and JWKS settings are present
   - confirm object storage, rate limit, and backup/KMS vault references are present
   - add backup restore drill evidence date after a real restore drill is completed
2. Complete a real backup restore drill and record evidence without exposing database credentials or tenant data.
3. Redeploy Vercel Production.
4. Confirm `https://hr.suiyuecare.com/api/health/ready` returns `ok`.
5. Run:

```bash
pnpm pilot:gate:production -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com
pnpm db:supabase:verify-schema -- --project-ref=aruncclorusswpfnpgsn --schema=hr_one --allow-tenant-data
pnpm db:verify:production -- --tenant-slug=<customer-slug>
pnpm pilot:customer-import -- --tenant-slug=<customer-slug> --employee-csv=<employee.csv> --identity-csv=<identity.csv> --payroll-csv=<payroll.csv> --output=/tmp/hr-one-pilot-customer-import.md
pnpm pilot:go-no-go -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --project-ref=aruncclorusswpfnpgsn --schema=hr_one --env-file=.env.vercel.production --tenant-slug=<customer-slug> --employee-csv=<employee.csv> --identity-csv=<identity.csv> --payroll-csv=<payroll.csv> --evidence-path=<pilot-evidence-folder> --recursive --output=/tmp/hr-one-pilot-go-no-go.md
```

Do not invite real employees until the production gate and go/no-go report pass.
