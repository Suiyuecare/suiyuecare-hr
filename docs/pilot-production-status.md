# HR One Production Pilot Status

Last checked: 2026-06-17 Asia/Taipei

## Current State

- Live domain: `https://hr.suiyuecare.com`
- GitHub repository: `Suiyuecare/suiyuecare-hr`
- Vercel project in repo metadata: `prj_QY0hzJ4hFzLX8XYO5ljIffLnH99N` (`suiyuecare-hr2`)
- Latest GitHub `main` includes the production SSO login guard and the pilot doctor env handoff update.
- `suiyuecare-hr2` may lag behind GitHub `main` when Vercel deployment rate limits are active; check the latest commit status before treating `hr.suiyuecare.com` as current.
- Vercel Production now has 22 environment variables, including the 22 known bootstrap values written through `pnpm vercel:bootstrap-known-env -- --env-file=.env.vercel.production --apply`.
- Legacy Vercel status context `Vercel - suiyuecare-hr` may still appear. Use `suiyuecare-hr2` as the active project.

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
- The deployed app is still reporting a non-production environment.
- Production database is not configured; demo fallback is available.
- New production readiness now also requires the `demo auth` check to report `demo auth disabled for production runtime`.
- `pnpm pilot:doctor` reports Vercel Production env at `20/29` required keys, with these 9 keys still missing: `DATABASE_URL`, `HR_ONE_OBJECT_STORAGE_SECRET_REF`, `HR_ONE_AUTH_PROVIDER`, `HR_ONE_AUTH_ISSUER_URL`, `HR_ONE_AUTH_LOGIN_URL`, `HR_ONE_AUTH_JWKS_URL`, `HR_ONE_RATE_LIMIT_SECRET_REF`, `HR_ONE_BACKUP_ENCRYPTION_KEY_REF`, and `HR_ONE_BACKUP_RESTORE_TESTED_AT`.
- Supabase pilot rehearsal data passes for project `aruncclorusswpfnpgsn`, schema `hr_one`.

## Required Before Real 20-50 Person Trial

1. Configure Vercel Production env for the active `suiyuecare-hr2` project:
   - server-only Supabase PostgreSQL `DATABASE_URL` with `?schema=hr_one`
   - production OIDC/SSO provider, issuer, login URL, and JWKS settings
   - object storage, rate limit, and backup/KMS vault references
   - backup restore drill evidence date
2. Redeploy Vercel Production.
3. Confirm `https://hr.suiyuecare.com/api/health/ready` returns `ok`.
4. Run:

```bash
pnpm pilot:gate:production -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com
pnpm db:supabase:verify-schema -- --project-ref=aruncclorusswpfnpgsn --schema=hr_one --allow-tenant-data
pnpm db:verify:production -- --tenant-slug=<customer-slug>
pnpm pilot:customer-import -- --tenant-slug=<customer-slug> --employee-csv=<employee.csv> --identity-csv=<identity.csv> --payroll-csv=<payroll.csv> --output=/tmp/hr-one-pilot-customer-import.md
pnpm pilot:go-no-go -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --project-ref=aruncclorusswpfnpgsn --schema=hr_one --env-file=.env.vercel.production --tenant-slug=<customer-slug> --employee-csv=<employee.csv> --identity-csv=<identity.csv> --payroll-csv=<payroll.csv> --evidence-path=<pilot-evidence-folder> --recursive --output=/tmp/hr-one-pilot-go-no-go.md
```

Do not invite real employees until the production gate and go/no-go report pass.
