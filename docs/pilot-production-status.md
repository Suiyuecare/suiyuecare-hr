# HR One Production Pilot Status

Last checked: 2026-06-17 Asia/Taipei

## Current State

- Live domain: `https://hr.suiyuecare.com`
- GitHub repository: `Suiyuecare/suiyuecare-hr`
- Vercel project in repo metadata: `prj_QY0hzJ4hFzLX8XYO5ljIffLnH99N` (`suiyuecare-hr2`)
- Latest GitHub `main` includes the production SSO login guard, the pilot doctor env handoff update, the expanded Supabase pilot readiness seed, the `/settings/pilot-invite-readiness` management screen, and the `/settings/pilot-operations` daily trial war room.
- `suiyuecare-hr2` may lag behind GitHub `main` when Vercel deployment rate limits are active; check the latest commit status before treating `hr.suiyuecare.com` as current.
- Vercel Production now has all required bootstrap values, backup restore evidence, and a server-side `DATABASE_URL`.
- The server-side `DATABASE_URL` has been rotated to a verified direct Supabase custom-role URL for `hr_one_app_runtime`; the remaining blocker is network reachability from Vercel to Supabase direct Postgres.
- Legacy Vercel status context `Vercel - suiyuecare-hr` may still appear. Use `suiyuecare-hr2` as the active project.
- Supabase project `aruncclorusswpfnpgsn`, private schema `hr_one`, now contains a synthetic 25-person pilot tenant with expanded trial readiness controls.

## UI Evidence

GitHub `main` contains the new pilot UI. The live site may lag behind `main` while Vercel deployment rate limits or production readiness blockers are active:

- `/app` includes the employee mobile task cards: `主要任務`, `今日常用任務`, and `薪資單`.
- `/console` includes the backend pilot flow strip: `兩週試用核心流程`, `打卡 · 請假 · 薪資單`, `HR 月結`, and `安全上線`.
- `/hr`, after switching to the HR demo role, includes the updated module board: `後台模組`, `員工與任用`, `打卡與假勤`, `月結與發薪`, `表單與公告`, and `分析與稽核`.
- `/settings/pilot-invite-readiness` shows the pre-invitation gate for login identity, role coverage, manager lines, 14-day schedules, leave balances, and self-only payslip visibility without exposing names, emails, salaries, bank accounts, SSO subjects, or private notes.
- `/settings/pilot-operations` shows Day 0, Day 1, Day 3, Day 7, and Day 14 checkpoint coverage, missing evidence, next actions, and hash-only evidence forms for the 20-50 person trial.

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

- Overall readiness is `fail`.
- The currently aliased production deployment was created before `HR_ONE_BACKUP_RESTORE_TESTED_AT` was added, so production must be redeployed before the live environment check can turn green.
- Runtime database ping still fails from Vercel when using `db.aruncclorusswpfnpgsn.supabase.co:5432`.
- Supabase's direct Postgres endpoint is IPv6-only unless the project has the IPv4 add-on. Vercel/serverless runtime needs either a compatible Supavisor pooler URL or Supabase IPv4 add-on for the direct host.
- The custom runtime role `hr_one_app_runtime` works against the direct host, but the shared Supavisor pooler did not currently recognize `hr_one_app_runtime.aruncclorusswpfnpgsn` as a tenant/user. Do not switch production to the pooler until that pooler user path is verified.

Supabase checks completed on 2026-06-17:

- `pnpm db:supabase:verify-schema -- --project-ref=aruncclorusswpfnpgsn --schema=hr_one --allow-tenant-data` passed: 76 tables, 11 enum types, 48/48 migrations, browser roles blocked, 1 tenant, 1 company, 25 employees.
- `pnpm db:supabase:seed-pilot -- --project-ref=aruncclorusswpfnpgsn --schema=hr_one --verify-only` passed: 25 active employees, 3 managers, 4 departments, 375 schedules, 11 leave policies, 275 leave balances, 25 payslips, announcement receipts, form workflow, rules, telemetry, audit coverage, browser-role isolation, and no callable public security-definer RPC exposure.
- `pnpm db:supabase:restore-drill -- --project-ref=aruncclorusswpfnpgsn --schema=hr_one --tenant-slug=suiyuecare-pilot --tested-at=2026-06-17 --ticket=RESTORE-20260617-SCHEMA --apply` passed and recorded schema-only restore evidence without exporting tenant data.
- `pnpm db:verify:production -- --tenant-slug=suiyuecare-pilot` was run with a temporary verification login and passed every database gate, including operational resilience. The temporary verification login was removed after the check.
- `pnpm pilot:doctor -- --skip-local-env` passed Vercel Production env, local env draft skip, and Supabase pilot rehearsal data; it is blocked only by the live production gate.

## Required Before Real 20-50 Person Trial

1. Choose and verify the production database network path:
   - preferred: configure a Supabase pooler user that works for `hr_one_app_runtime` and use the transaction pooler URL with `schema=hr_one`, `connection_limit=1`, and prepared statements disabled for Prisma
   - alternate: enable the Supabase IPv4 add-on, keep the verified direct custom-role URL, and rerun the live DB ping
   - avoid: using broad `postgres` database credentials as the long-term app runtime credential
2. Redeploy Vercel Production so the deployment includes the latest `DATABASE_URL` and `HR_ONE_BACKUP_RESTORE_TESTED_AT`.
3. Confirm `https://hr.suiyuecare.com/api/health/ready` returns `ok`.
4. Run:

```bash
pnpm pilot:gate:production -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com
pnpm db:supabase:verify-schema -- --project-ref=aruncclorusswpfnpgsn --schema=hr_one --allow-tenant-data
pnpm db:verify:production -- --tenant-slug=<customer-slug>
pnpm pilot:customer-import -- --tenant-slug=<customer-slug> --employee-csv=<employee.csv> --identity-csv=<identity.csv> --payroll-csv=<payroll.csv> --output=/tmp/hr-one-pilot-customer-import.md
pnpm pilot:invite-readiness -- --tenant-slug=<customer-slug> --output=/tmp/hr-one-pilot-invite-readiness.md
pnpm pilot:go-no-go -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --project-ref=aruncclorusswpfnpgsn --schema=hr_one --env-file=.env.vercel.production --tenant-slug=<customer-slug> --employee-csv=<employee.csv> --identity-csv=<identity.csv> --payroll-csv=<payroll.csv> --evidence-path=<pilot-evidence-folder> --recursive --output=/tmp/hr-one-pilot-go-no-go.md
```

Do not invite real employees until the production gate and go/no-go report pass.

## Next Foundation Phase

After the live production gate passes, focus on the parts that make a 20-50 person two-week trial safe and usable:

1. Complete the production database network path and redeploy once Vercel quota allows it.
2. Create a guided company setup wizard for departments, managers, work schedules, leave policies, punch rules, announcements, and payslip release.
3. Use `/settings/pilot-operations` to capture real trial evidence for daily completion: punches, leave submissions, manager approvals, announcement receipts, HR month-close rehearsal, payslip views, audit coverage, and unauthorized salary access attempts.
4. Run `pilot:invite-readiness` and `pilot:go-no-go` for the actual customer tenant before inviting staff, then run a daily pilot health check during the two-week trial.
5. Build the guided company setup wizard for departments, managers, work schedules, leave policies, punch rules, announcements, and payslip release so HR can onboard without engineering support.
