# HR One Production Pilot Status

Last checked: 2026-06-17 Asia/Taipei

## Current State

- Live domain: `https://hr.suiyuecare.com`
- GitHub repository: `Suiyuecare/suiyuecare-hr`
- Vercel project in repo metadata: `prj_QY0hzJ4hFzLX8XYO5ljIffLnH99N` (`suiyuecare-hr2`)
- Latest verified Git commit: `092245f Refine pilot trial UI workspaces`
- GitHub commit status for `Vercel - suiyuecare-hr2`: success, deployment completed
- Legacy Vercel status context `Vercel - suiyuecare-hr`: failed because the old project is deployment-rate-limited. Use `suiyuecare-hr2` as the active project.

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

## Required Before Real 20-50 Person Trial

1. Configure Vercel Production env for the active `suiyuecare-hr2` project:
   - `HR_ONE_ENV=production`
   - server-only Supabase PostgreSQL `DATABASE_URL` with `?schema=hr_one`
   - production OIDC/SSO issuer, JWKS, client ID, and audience settings
   - vault/KMS references for sensitive storage
   - backup and restore drill evidence settings
2. Redeploy Vercel Production.
3. Confirm `https://hr.suiyuecare.com/api/health/ready` returns `ok`.
4. Run:

```bash
pnpm pilot:gate:production -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com
pnpm db:supabase:verify-schema -- --project-ref=aruncclorusswpfnpgsn --schema=hr_one --allow-tenant-data
pnpm db:verify:production -- --tenant-slug=<customer-slug>
pnpm pilot:customer-import -- --tenant-slug=<customer-slug> --employee-csv=<employee.csv> --identity-csv=<identity.csv> --payroll-csv=<payroll.csv> --output=/tmp/hr-one-pilot-customer-import.md
pnpm pilot:go-no-go -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --project-ref=aruncclorusswpfnpgsn --schema=hr_one --env-file=.env.vercel.production --tenant-slug=<customer-slug> --employee-csv=<employee.csv> --payroll-csv=<payroll.csv> --evidence-path=<pilot-evidence-folder> --recursive --output=/tmp/hr-one-pilot-go-no-go.md
```

Do not invite real employees until the production gate and go/no-go report pass.
