# HR One Production Pilot Status

Last checked: 2026-06-17 13:01 Asia/Taipei

## Current State

- Live domain: `https://hr.suiyuecare.com`
- GitHub repository: `Suiyuecare/suiyuecare-hr`
- Vercel project in repo metadata: `prj_QY0hzJ4hFzLX8XYO5ljIffLnH99N` (`suiyuecare-hr2`)
- GitHub `main` includes the production SSO login guard, the pilot doctor env handoff update, the expanded Supabase pilot readiness seed, the `/settings/company-setup` guided setup wizard, the `/settings/pilot-invite-readiness` management screen, the `/settings/pilot-operations` daily trial war room with Today Gate, the `/console` two-week trial Gate summary, employee 60-second quick leave presets, manager 15-second quick approval actions, the redacted `pilot:morning-brief` command, the `pilot:workflow-readiness` core-flow evidence matrix, Finance-style pilot workspace UI refinements, stricter trial completion gating that requires zero blockers and zero warnings, and a go/no-go start gate that now embeds core workflow readiness.
- Active Vercel project `suiyuecare-hr2` deployed GitHub `main` commit `0435a71` successfully on 2026-06-17 12:50 Asia/Taipei. Legacy `suiyuecare-hr` is rate limited and should not be treated as the active production project.
- Vercel Production now has all required bootstrap values, backup restore evidence, and a server-side `DATABASE_URL`.
- The server-side `DATABASE_URL` has been rotated to a verified direct Supabase custom-role URL for `hr_one_app_runtime`; the remaining blocker is network reachability from Vercel to Supabase direct Postgres.
- Local `.env.vercel.production` verification now supports `pnpm env:verify:production -- --env-file=.env.vercel.production`. The current draft has been refreshed with known non-secret Supabase Auth values and the 2026-06-17 restore drill date, so OIDC issuer/login/JWKS and restore drill evidence now pass locally. The draft is still blocked only because `DATABASE_URL` remains a placeholder/invalid value. Do not apply this draft to Vercel until the Supabase transaction pooler URL or IPv4 add-on attestation is configured.
- Legacy Vercel status context `Vercel - suiyuecare-hr` may still appear. Use `suiyuecare-hr2` as the active project.
- Supabase project `aruncclorusswpfnpgsn`, private schema `hr_one`, now contains a synthetic 25-person pilot tenant with expanded trial readiness controls.

## UI Evidence

GitHub `main` contains the new pilot UI. The live site may lag behind `main` while Vercel deployment rate limits or production readiness blockers are active:

- `/app` includes the employee mobile task cards plus the new `打卡 -> 申請 -> 公告 -> 薪資單` pilot flow strip.
- `/app` now includes `60 秒請假` presets for full-day, morning half-day, and afternoon half-day leave. They use the existing audited leave request endpoint, manager approval flow, notifications, and telemetry instead of bypassing workflow controls.
- `/console` includes the backend pilot flow strip and the new Finance-style command board for `今日戰情`, `待簽核`, and `上線 Gate`.
- `/console` now also shows a data-driven `兩週試用 Gate` that summarizes Day 0, Day 1, Day 3, Day 7, and Day 14 checkpoint status, missing evidence count, next action, and hash-only evidence posture without exposing employee names or salary data.
- `/manager/inbox` now includes `15 秒簽核` quick approve and needs-more-information actions after the risk summary. These submit through the shared audited approval route and keep the full comment form for non-standard reviews.
- `/hr`, after switching to the HR demo role, includes the new HR close command band for `出勤`, `簽核`, `薪資`, and `安全`, plus the updated module board: `後台模組`, `員工與任用`, `打卡與假勤`, `月結與發薪`, `表單與公告`, and `分析與稽核`. The payroll area now includes a Day 7 monthly-close rehearsal guide that shows the current stage, next safe action, blocker context, seven-step runway, and privacy/audit guardrails before payroll is calculated, locked, or released.
- `/settings/company-setup` gives HR a guided setup wizard for company structure, user access, schedules, punch policy, leave balances, manager Inbox, announcements, payroll/payslip readiness, and audit/privacy coverage without exposing raw sensitive data. It now includes audited setup actions for 14-day schedules, leave balance synchronization, trial announcements, and demo payroll rehearsal; production payroll blockers still require HR review.
- `/settings/pilot-invite-readiness` shows the pre-invitation gate for login identity, role coverage, manager lines, 14-day schedules, leave balances, self-only payslip visibility, and preflight access review without exposing names, emails, salaries, bank accounts, SSO subjects, or private notes. It now also includes a 20-50 person aggregate data preparation board for cohort, login/SSO, manager lines, schedules/leave, payslip readiness, and access review gaps, embeds the core workflow Gate for Day 0, Day 1, Day 3, Day 7, and Day 14 evidence gaps before HR sends real employee invitations, and treats Owner/HR preflight access review as a hard invitation blocker until hash-only evidence is recorded.
- `/settings/pilot-operations` shows Day 0, Day 1, Day 3, Day 7, and Day 14 checkpoint coverage, missing evidence, next actions, a Today Gate that follows the persisted trial day and earliest unfinished checkpoint, a three-card daily task board for the current operating focus, and hash-only evidence forms for the 20-50 person trial.

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
- The active deployment now includes the stricter Supabase/Vercel database network environment gate. Because production still uses the direct Supabase host without the IPv4 add-on attestation, the environment check fails closed instead of allowing a known-unreachable database path.
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
   - preferred: configure a Supabase pooler user that works for `hr_one_app_runtime` and use the transaction pooler URL with `pgbouncer=true&connection_limit=1&schema=hr_one`
   - alternate: enable the Supabase IPv4 add-on, keep the verified direct custom-role URL, set `HR_ONE_SUPABASE_IPV4_ADDON_ENABLED=true`, and rerun the live DB ping
   - avoid: using broad `postgres` database credentials as the long-term app runtime credential
2. Redeploy Vercel Production after changing the database network path so the deployment receives the corrected `DATABASE_URL` or `HR_ONE_SUPABASE_IPV4_ADDON_ENABLED=true` attestation.
3. Confirm `https://hr.suiyuecare.com/api/health/ready` returns `ok`.
4. Run:

```bash
pnpm pilot:gate:production -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com
pnpm db:supabase:verify-schema -- --project-ref=aruncclorusswpfnpgsn --schema=hr_one --allow-tenant-data
pnpm db:verify:production -- --tenant-slug=<customer-slug>
pnpm pilot:customer-import -- --tenant-slug=<customer-slug> --employee-csv=<employee.csv> --identity-csv=<identity.csv> --payroll-csv=<payroll.csv> --output=/tmp/hr-one-pilot-customer-import.md
pnpm pilot:invite-readiness -- --tenant-slug=<customer-slug> --output=/tmp/hr-one-pilot-invite-readiness.md
pnpm pilot:go-no-go -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --project-ref=aruncclorusswpfnpgsn --schema=hr_one --env-file=.env.vercel.production --tenant-slug=<customer-slug> --employee-csv=<employee.csv> --identity-csv=<identity.csv> --payroll-csv=<payroll.csv> --evidence-path=<pilot-evidence-folder> --recursive --output=/tmp/hr-one-pilot-go-no-go.md
pnpm pilot:workflow-readiness -- --require-production-evidence --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --project-ref=aruncclorusswpfnpgsn --schema=hr_one --env-file=.env.vercel.production --tenant-slug=<customer-slug> --output=/tmp/hr-one-pilot-workflow-readiness-day-3.md
pnpm pilot:morning-brief -- --day=0 --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --project-ref=aruncclorusswpfnpgsn --schema=hr_one --env-file=.env.vercel.production --tenant-slug=<customer-slug> --output=/tmp/hr-one-pilot-morning-day-0.md
```

Do not invite real employees until the production gate and go/no-go report pass.

## Next Foundation Phase

After the live production gate passes, focus on the parts that make a 20-50 person two-week trial safe and usable:

1. Complete the production database network path and redeploy after setting the corrected Supabase pooler URL or IPv4 add-on attestation.
2. Use `/settings/company-setup` to clear departments, managers, work schedules, leave policies, punch rules, announcements, and payslip release blockers for the actual customer tenant.
3. Use `/settings/pilot-operations` to capture real trial evidence for daily completion: punches, leave submissions, manager approvals, announcement receipts, HR month-close rehearsal, payslip views, audit coverage, and unauthorized salary access attempts.
4. Run `pilot:invite-readiness` and `pilot:go-no-go` for the actual customer tenant before inviting staff; `pilot:go-no-go` now includes core workflow readiness, while standalone `pilot:workflow-readiness --require-production-evidence` should be used during Day 3, Day 7, and Day 14 evidence reviews.
5. Add guided one-click setup actions where safe, starting with schedule generation, leave-balance sync, announcement template creation, and payslip rehearsal release.
