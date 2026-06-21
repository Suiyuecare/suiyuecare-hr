# HR One

HR One is the initial foundation for a Taiwan-focused AI Native HR Operating System. This repository starts with a production-oriented TypeScript skeleton: Next.js App Router, PostgreSQL, Prisma, RBAC, audit logging, demo auth, mobile-first employee UI, manager Inbox, HR dashboard, owner settings, unit tests, and Playwright smoke tests.

AI features are intentionally implemented as a safe Copilot layer first. The current assistant is deterministic and advisory so permissions, auditability, source references, and blocked sensitive decisions can be verified before connecting an external model provider.

## 中文功能盤點

- 前端員工日常使用：Finance-style 手機優先首頁、今日任務板、下一步提示、今日班表與打卡狀態、上下班打卡、60 秒快速請假、加班、補打卡、公告簽收、表單送出、職場事件回報、申請進度時間軸、薪資單自助查看、中文訓練任務、文件、工作條件與公司規章確認。
- 主管工作台：Finance-style 統一簽核 Inbox，可處理請假、加班、補打卡、自訂表單與薪資調整，先顯示今日優先、風險分布、簽核類型與 15 秒快速核准/需補件，再進入簽核意見與員工通知。
- HR 後台：員工匯入、單筆新增員工、人事主檔、組織與部門、標準職務/職等、任用異動、文件庫、出勤異常處理工作台、班表、假別政策工作台、薪資設定、薪資月結、薪資單釋出、公告、表單建置、工作規則、訓練、職場事件處理台、勞健保/勞退與台灣法規規則管理；`/console` 會先顯示上線缺口雷達，把各模組 KPI、今日任務、法遵護欄、live launch readiness 與 audit evidence 摘要彙整成阻擋/待收斂/可用狀態，並產生「阻擋處理順序」，讓 CEO/HR 先照序修正式資料庫、稽核證據、通知、薪資付款 Gate 等會卡試用、販售或月結的缺口。後台模組可從 `/console/modules/[moduleId]` 進入 Finance-style 模組總覽，查看今日優先任務、常用作業、KPI 與法遵/稽核護欄。人事主檔工作台可從 `/hr/employees` 進入，集中檢查並受控新增/修正員工、部門、主管線、登入/SSO、標準職務、勞工名卡、工作條件、薪資前置與投保缺口。公司組織設定可從 `/settings/organization` 管理公司資料、部門、職等、標準職務與主管線治理，並阻擋主管線循環。報表分析工作台可從 `/hr/reports` 進入，集中自訂報表設定、人事分析、出勤分析、薪酬分析、報表設定與下載封存資料。
- 老闆/Owner 管理：公司設定、Finance-style 權限與登入中樞、正式登入切換 Gate、資安與登入政策工作台、通知管道工作台、支援存取工作台、RBAC 角色、使用者邀請、員工主檔綁定、SSO subject hash 綁定、停用/復用帳號原因 hash、最後 active Owner 防呆、訂閱與商務狀態、備份還原證據、上線 readiness、audit log 與勞檢證據包。
- AI Copilot 安全層：政策 Q&A、表單草稿、簽核摘要、薪資異常解釋；只做輔助與來源引用，不做招募拒絕、裁員、薪資、績效或懲戒決策。
- 試用與上線工具：Supabase private schema 驗證、Vercel production env 草稿、20-50 人 pilot 匯入模板、匯入預檢、身份/SSO 匯入、邀請 readiness、核心流程 readiness、每日晨會摘要、每日狀態、每日戰情 today gate、證據掃描、go/no-go 開跑總檢查、邀請釋放 Gate、兩週試用結案檢查、證據包交付 Gate。
- 販售上線戰情室：`/settings/readiness` 會把 production DB、Finance-style 使用體驗、20-50 人真實試用資料、薪資月結、台灣法遵、KPI 與商務證據包整理成 Owner/HR 可執行的下一階段路線圖，並新增「下一階段基礎工程」看板，列出正式資料庫、SSO/RBAC、核心流程 UX、真實試用匯入、台灣法遵控制台、薪資安全與商務證據包的負責人、狀態、下一步與驗收證據。

## 下一階段

- UI/UX 持續升級：員工前台首頁已加入 Finance-style 今日任務板與下一步提示，主管 Inbox 已加入簽核指揮台、風險先看與類型分布，HR 月結首頁已改成 Finance-style 指揮台、今日先處理、月結訊號板與安全閘門，出勤異常頁已改成月結前清異常工作台，打卡與出勤政策頁已改成員工出勤規則、打卡限制、簽核護欄、出勤紀錄五年保存 Gate 與員工自助查看/匯出的工作台，工時法遵頁已改成月結前掃描、工時約定、風險清單與法規來源的工作台，工時約定頁已改成同意證據、有效期間、46/54/138 小時上限、30 人以上備查與 audit log 的三步設定台，排班設定頁已改成班別管理、一日排班、跨日班複核與月結護欄的工作台，假別政策頁已改成法定假別 Gate、台灣請假法源、餘額同步、HR/法務複核與三步設定精靈的工作台，特休年度給假頁已改成第 38 條級距、遞延假、員工通知與 audit log 工作台，特休到期提醒頁已改成提醒門檻、遞延假追蹤、員工自主排休與結清銜接工作台，文件庫已改成文件金庫、正式儲存 Gate、掃描/加密/保存訊號、metadata 精靈與員工手機自助文件頁，人事主檔已改成員工、主管線、登入/SSO、標準職務、法定名卡、工作條件、薪資前置與投保缺口的 Finance-style 工作台，並加入三步單筆新增員工、三步主檔修正精靈與 audit log，公司行事曆頁已改成年度官方來源審核、假日/補班日設定、月結護欄與 readiness 缺口工作台，表單中心已改成自建表單精靈、條件欄位、統一 Inbox 與敏感流程治理工作台，人事異動頁已改成調部/升遷、留停/復職、離職法遵、權限與薪資聯動的人事工作台，勞工名卡頁已改成勞基法第 7 條欄位、敏感 hash、HR 複核與保存五年的法定名卡工作台，工作條件頁已改成勞基法施行細則第 7 條欄位、薪資 hash、員工確認與來源證據的工作條件工作台，工作規則頁已改成公司規章工作台、勞基法第 70 條 12 類項目覆蓋、HR/法務複核、三步內容 hash 精靈與員工手機確認，法定投保頁已改成勞保/就保/職災/健保/勞退提繳、逾期待補、證據 hash 與上線 Gate 的投保作業工作台，離職交接頁已改成最終工資、特休結清、勞健保退保、權限移除、紀錄留存與服務證明的今日優先工作台，後台設定首頁已改成設定中樞、狀態訊號板與設定作業區，資安設定頁已改成登入政策、MFA、SSO、session 與允許網域的工作台，通知管道頁已改成站內/Email/LINE/Slack/Teams、事件觸發、摘要護欄與 delivery hash 的工作台，支援存取頁已改成 Owner-only、ticket、scope、72 小時期限、撤銷與 production gate 的工作台，法規規則頁已改成台灣法規規則控制台，公司導入精靈已改成 20-50 人試用導入工作台，HR KPI 頁已改成上線販售指標指揮台，報表分析頁已改成自訂報表、人事/出勤/薪酬分析與下載封存的工作台，發薪匯出頁已改成封存與下載中心，付款安全頁已改成銀行檔上線 Gate 工作台，薪資紀錄保存頁已改成工資清冊五年保存、薪資明細自助、計算方式明細、勞檢匯出與權限護欄工作台，薪資法遵頁已改成稅務身分、非居住者扣繳、勞健保/勞退級距 Gate 與人工覆寫治理工作台，特休結清頁已改成第 38 條 Gate、24-1 一日工資、發給期限、工資清冊/書面通知、三步草稿與 audit log 護欄工作台，薪資調整頁已改成鎖定後調整 Gate、HR 送單、Owner Inbox 核准、入帳紀錄與 audit log 護欄工作台，薪資科目頁已改成會計分錄封存工作台，薪資資料頁已改成敏感薪資設定檔工作台，付款資料頁已改成發薪帳戶安全工作台，薪資/付款批次匯入頁已改成遮罩預覽精靈；下一步要把公司管理與剩餘後台細節統一成同一套色彩、資訊密度、卡片層級、文字大小、表格/工作流元件。
- 報表基礎工程：`/hr/reports` 已串接 report_datasets、report_fields、report_permissions、report_jobs 與 export archives。HR/Owner 可建立遮罩封存報表，也可在報表權限矩陣調整角色、資料集、匯出、遮罩與用途理由設定；系統會記錄欄位政策、下載期限、內容 hash、申請人、manifest 下載與 audit log。manifest 下載會再次檢查 RBAC/權限矩陣、期限與 tenant/company，不輸出原始個資、薪資、銀行帳號、身分證或健康資料。下一步是背景匯出佇列、物件儲存短效下載 URL、欄位級覆寫與雙人覆核。
- 補齊人事基礎資料閉環：把員工主檔、任用異動、權限、薪資 profile、報表與匯入精靈全部改為引用標準部門、職務、職等與主管線，避免每個模組各自使用自由文字職稱。
- 強化後台管理系統：完成公司規章、權限矩陣、打卡設定、排班規則、薪資科目、薪資計算規則、保險/所得稅規則、報表設定與下載封存等管理工具的 wizard 化設定。
- 修復 production gate：設定 Supabase transaction pooler `DATABASE_URL` 或 IPv4 add-on attestation、正式 OIDC/SSO、vault/KMS 參照、備份還原演練證據，讓 `https://hr.suiyuecare.com/api/health/ready` 變成 ok。`/settings/access` 也會顯示正式登入切換 Gate，把 SSO metadata、高權限 subject hash、員工帳號覆蓋、薪資防漏、支援存取與 demo auth 關閉整理成可驗收任務。
- 匯入一家公司 20-50 人的真實試用資料：員工、部門、主管線、user/SSO identity、薪資 profile、付款 profile、勞健保/勞退、假勤餘額與班表，再跑 `pnpm pilot:go-no-go`。
- 進行 2 週小規模實測：每天用 `pnpm pilot:morning-brief` 和 `pnpm pilot:daily-status` 管控 stop/go，追蹤第一次請假時間、主管簽核時間、手機端任務完成率、出勤異常解決率、薪資月結演練時間與權限/敏感資料測試。

Current live production-pilot status and blockers are tracked in [`docs/pilot-production-status.md`](docs/pilot-production-status.md).

## MVP Workflows

- Employee clock in/out with punch source.
- Daily Finance-style employee Today workspace with next-step guidance, task board, shift, punch status, leave balance, notifications, and pending requests.
- 60-second quick leave presets on the employee mobile home page for full-day, morning half-day, and afternoon half-day leave. These presets still submit through the audited leave request, manager approval, notification, and telemetry flow.
- 15-second manager approval actions in the Finance-style unified Inbox. The page now starts with priority approval, risk summary, request-type mix, quick approve and needs-more-information buttons; actions still submit through the shared approval endpoint, write approval events/audit logs, notify employees, and preserve the full comment form for non-standard cases.
- HR command center with Next Actions that prioritizes onboarding, attendance, payroll close, and launch-readiness handoff before showing functional menus.
- Finance-style management console module pages for company, people, attendance, scheduling, payroll, forms, reports, and announcements. Each module page is role-filtered through the same RBAC-aware console module registry and shows role context, KPI targets, priority tasks, guardrails, frequent operations, and setup links without exposing payroll or sensitive modules to unauthorized roles.
- Finance-style sale-ready radar on `/console` aggregates each visible module's KPI signals, priority tasks, legal/security guardrails, live launch-readiness checks, and audit evidence package posture into blocker/warning/ready counts, then points CEO/HR/Admin users to the next highest-impact action and a ranked fix-order queue without exposing restricted payroll modules to unauthorized roles.
- Report analytics workspace at `/hr/reports` for CEO/HR/Admin use: custom report setup, people analytics, attendance analytics, payroll-status analytics, report settings, and archive download shortcuts in a Finance-style task page. Salary amounts and payroll details stay out of the report summary; payroll analytics shows process status only unless the user enters authorized payroll pages.
- Organization settings center at `/settings/organization` for company profile, department maintenance, standard job levels, standard job positions, manager-line governance, job-title inventory, readiness warnings, and audited company/department/job-architecture/manager-line mutations. The manager-line wizard highlights missing managers, overloaded managers, department manager coverage, and cycle risks, then blocks self-manager or cyclic reporting lines before saving.
- Finance-style settings command center at `/settings` for Owner/HR/Admin users, turning company setup, RBAC, security, file storage, Taiwan labor rules, production gates, and pilot evidence into a task-first configuration workspace instead of a long settings menu.
- Finance-style file storage workspace at `/settings/file-storage` for production document storage: provider, bucket, base prefix, KMS reference, malware scanning, signed URL TTL, file size, MIME allowlist, retention days, and smoke-test verification are handled as a three-step audited Gate without storing object bytes or provider secrets in HR One.
- Finance-style company setup workspace at `/settings/company-setup` for 20-50 person pilot onboarding, combining a dark command hero, today-first focus, setup signal board, import/attendance/announcement/payroll work cards, guided setup actions, invitation readiness, daily operations, and privacy/audit guardrails without exposing raw employee or salary data.
- Finance-style Taiwan labor rule command center at `/settings/law-rules`, showing today-first rule actions, source freshness, active version, payroll recalculation risk, rule governance cards, rule-change impact tasks, source-refresh wizard, and version history without requiring engineering support.
- Taiwan compliance coverage matrix in the law rule command center checks minimum wage, working time, overtime, rest/holidays, annual leave, statutory leave, termination, insurance onboarding, statutory payroll, income tax, and filing/archive coverage against the active rule version; source or control gaps block launch readiness.
- HR Day 7 payroll rehearsal guide inside `/hr`: the page now shows the current monthly-close stage, the next safe action, blocker context, a seven-step runway, and privacy/audit guardrails before HR creates, calculates, confirms, locks, or releases payslips.
- Finance-style attendance exception workspace at `/hr/attendance-exceptions` for HR monthly close: today-first focus, exception signal board, safe-suggestion cards, high-risk working-time guardrails, Chinese resolution forms, and audit/privacy reminders. Low-risk suggestions still require HR confirmation, while legal working-time risks remain manual-only.
- Pilot invitation readiness now embeds the production database hard gate and the core workflow Gate, so HR sees the live production database readiness result, root cause, next launch-checklist item, and whether the redacted production database / Go-No-Go evidence is still missing. It also shows Day 0, Day 1, Day 3, Day 7, and Day 14 evidence gaps for clock-in, leave, manager approval, announcements, monthly close, payslip access, and sensitive-data guardrails before inviting real employees. The 20-50 person data preparation board covers cohort size, login/SSO, manager lines, schedules/leave, payslip self-service, and preflight access review using aggregate counts only. Preflight access review is a hard invitation Gate: Owner/HR must run it before the page reports invitations as safe. It verifies payroll dashboard and payslip permission boundaries and writes hash-only evidence without reading salary, bank account, national ID, or health values.
- Pilot trial run control at `/settings/pilot-trial-run` turns the 20-50 person, two-week trial into an HR-operable batch with start/end dates, current-day focus, participant and manager counts, readiness blockers, hash-only evidence snapshots, Day 0/1/3/7/14 phases, and shortcuts to invite readiness, Go/No-Go, daily operations, and completion review.
- Pilot Go/No-Go UI snapshot at `/settings/pilot-go-no-go` combines production database gate, production acceptance, Day 0 status, import preflight, invite readiness, workflow readiness, and evidence privacy scan into a single redacted start/stop view. It fails closed when browser-only context is missing live database verification, completed CSV preflight, or evidence-folder scanning, and points HR back to the required `pnpm pilot:go-no-go` command before real employee invitations.
- Pilot invitation release gate `pnpm pilot:invitation-release` reads the redacted production database, Go/No-Go, invite-readiness, and rollout-kit reports before HR sends the first invitation. It releases only when all four reports are ready and the attached evidence scan has zero sensitive findings; output contains status, next actions, and hashes only.
- Pilot rollout kit `pnpm pilot:rollout-kit` generates the safe Day 1 Chinese announcement, employee quick-start, manager quick-start, and HR day-by-day checklist. It keeps employee onboarding under 10 minutes, caps common employee tasks at three steps, blocks unsafe non-HTTPS rollout URLs, and redacts sensitive inputs. `/settings/company-setup` uses the same kit when HR creates the receipt-required trial announcement.
- Pilot CSV preflight UI at `/settings/pilot-import-preflight` lets HR paste completed employee, identity/SSO, and payroll profile CSV files before import. The browser flow writes only aggregate status, check results, and content hashes to audit logs; it does not persist or display raw names, emails, salary values, bank accounts, national IDs, health data, or private HR notes.
- Finance-style production database Gate at `/settings/production-database` shows Owner/HR why the live site is blocked from a real 20-50 person pilot, including the Vercel-to-Supabase network root cause, redacted current runtime env diagnostics, the Vercel sensitive-env limitation where key presence does not prove the value is usable, transaction pooler vs IPv4 add-on remediation routes, a launch checklist from pooler handoff through Go/No-Go, mandatory redeploy and production gate checks, and secret-safe guardrails.
- Pilot completion UI at `/settings/pilot-completion` gives Owner/HR a Day 14 redacted closeout view across access review, Day 1 rollout, Day 3 attendance/leave/approval, Day 7 payroll rehearsal/payslip access, final audit review, KPI targets, and evidence privacy scan. It fails closed until external evidence scanning and redacted handoff evidence are attached outside the browser.
- Pilot evidence package UI at `/settings/pilot-evidence` gives Owner/HR a redacted delivery checklist for the two-week trial evidence folder: persisted trial run, Go/No-Go report, Day 0/1/3/7/14 checkpoint evidence, audit evidence package, Day 14 completion review, evidence privacy scan, and redacted handoff. It can generate the audit package in-place and remains blocked until external evidence scan and handoff artifacts are present.
- Pilot evidence package CLI `pnpm pilot:evidence-package` validates the final evidence folder before sharing. It requires redacted production database, Go/No-Go, invitation release, Day 0/1/3/7/14 daily status, trial completion, audit evidence, and handoff artifacts, scans the folder for sensitive values, and outputs hashes only.
- HR employee CSV import wizard with preview validation, department-code mapping, managerEmployeeNo reporting-line checks, 20-50 person Beta pilot readiness scoring, confirmation step, RBAC, and audit logs.
- HR onboarding readiness workspace that turns customer setup gaps into missing employee, manager, labor roster, salary, payment, payroll compliance, statutory insurance enrollment, time setup, and Taiwan rule action lists before production verification.
- HR payroll profile CSV import wizard for salary, payment, and payroll compliance profiles with preview validation, per-profile audit logs, and a redacted batch import audit log.
- Finance-style HR employee lifecycle workspace for transfers, promotions, leave of absence, return to work, and termination with today-first focus, status signals, guided change wizard, employee status board, lifecycle timeline, Taiwan termination compliance guardrails, salary/severance amount masking, and audit logs.
- Employment Terms Center for versioned working-condition summaries, Taiwan Article 7 implementation-rule coverage, wage-basis hashes, employee acknowledgement, source references, and redacted audit evidence.
- Finance-style Labor Roster Center at `/hr/labor-roster` for Taiwan Labor Standards Act Article 7 worker roster completeness: legal name, gender, birth date, hometown, education, address, national ID, hire date, wage summary hash, labor insurance enrollment date, reward/discipline summary hash, injury/sickness summary hash, other necessary item hash, HR verification, source references, redacted audit evidence, and five-year retention guardrails.
- HR termination compliance foundation for Taiwan advance notice and severance review: lifecycle termination events capture reason category, labor pension/legacy scheme, optional average monthly wage, sourced notice/severance estimates, offboarding readiness for final wage review, unused leave settlement, statutory insurance withdrawal, access revocation, record retention, employment certificate readiness, human-review flags, and redacted audit metadata.
- Finance-style HR Offboarding Center at `/hr/offboarding` turns termination events into a today-first workspace for final wage review, unused leave settlement, statutory insurance withdrawal, access revocation, record retention, and employment certificate tasks with due dates, readiness blockers, redacted evidence hashes, audit logs, and launch-gate readiness.
- HR employee document vault for contracts, certificates, HR attachments, employee self-service visibility, configurable object-storage metadata, scan status, retention policy, and audit logs.
- Privacy Center for employee personal data notices, acknowledgement coverage, data subject requests, retention controls, cross-border/subprocessor posture, launch readiness, and redacted audit evidence.
- Finance-style HR training launch workspace for short onboarding courses, first-week training-minute KPI control, required assignment, employee completion acknowledgement, and audited launch evidence.
- Finance-style Work Rules Center for versioned employee handbook/company work rules, Labor Standards Act Article 70 coverage checks, HR/legal review status, content hashes, employee mobile acknowledgement evidence, and launch-readiness coverage.
- Workplace Incident Center for safety hazards, near misses, occupational accidents, harassment, and workplace violence reports with confidential employee intake, HR investigation tracking, 8-hour severe incident notification target, corrective action evidence, and redacted audit logs.
- Finance-style HR shift template workspace at `/hr/shift-templates` for reusable day/night/cross-midnight shifts, one-day schedule generation, cross-midnight review, audit-safe schedule overwrites, and payroll-close guardrails.
- Leave request with balance reservation, safe attachment evidence metadata, and shift conflict warning.
- Overtime request with daily work-hour threshold warning.
- Punch correction request for missing punches.
- HR attendance policy settings for regular daily minutes, overtime warning thresholds, punch grace minutes, mobile punch, and approval guardrails.
- Finance-style HR worktime compliance workspace at `/hr/worktime-compliance` for daily total work, weekly regular work, monthly overtime, rest-day cycle risks, labor-management agreement readiness, rule-source traceability, and audited attendance-exception creation before payroll close.
- HR leave policy settings for leave codes, statutory category, eligibility rule, pay-rate percent, annual units, accrual method, documentation requirements, paid/unpaid status, legal-review flag, and balance provisioning.
- HR Taiwan statutory leave coverage checks for annual leave, sick leave, personal leave, family care, menstrual leave, maternity leave, paternity/checkup accompaniment leave, marriage leave, bereavement leave, official leave, and occupational injury/sickness leave.
- Finance-style HR company calendar workspace for Taiwan national holidays, company holidays, makeup workdays, paid/unpaid days, annual official-source review evidence, readiness gaps, schedule/payroll review sources, and audited calendar mutations.
- Unified Inbox for leave, overtime, punch correction, and custom HR forms.
- Approve/reject with manager comment.
- Employee request timeline and in-app notifications.
- Notification channel settings and delivery metadata for in-app, email, LINE, Slack, and Teams, with external payload hashes instead of raw sensitive content.
- HR attendance exception view.
- HR monthly close command center with a Finance-style hero, today-first action, signal board, close health, attendance exception queue, employee readiness gaps, payroll close cockpit, and KPI focus instead of a deep function menu.
- Finance-style HR winning KPI command center at `/hr/kpis` for leave speed, manager approval speed, payroll close reduction, attendance auto-resolution, mobile task completion, form self-service, audit coverage, payroll access security, sourced AI answers, and rollout training time. The page is HR/Owner-gated, Chinese-first, organized by today-first focus, sales readiness, signal board, responsible owner work cards, and privacy-safe evidence labels instead of a raw English scorecard.
- Privacy-safe product telemetry for KPI measurement, automatically recording key leave, approval, mobile self-service, and HR form-builder events as workflow, step, duration, success, and redacted metadata instead of raw HR content, salary, national IDs, or bank data.
- Database verification script checks migrated/seeded PostgreSQL readiness for tenant/company, users, core role assignment coverage, employees, security settings, operational backup/restore evidence, attendance policy, shift template, annual Taiwan calendar review, statutory leave policy coverage, rule versions, rule validation evidence, executable Taiwan rule-engine checks, legal-source freshness evidence, per-active-employee labor roster/leave/payroll profile coverage, form workflows, audit baseline, sensitive onboarding audit coverage, support access governance, and product telemetry. Production mode additionally blocks demo tenant identity, demo storage, missing SSO metadata, missing privileged SSO identity bindings, default email domains, missing external notifications, missing backup/restore drill evidence, missing or unreviewed statutory leave categories, unsafe support access grants, and payroll rule recalculation gaps.
- Audit log writes for create/approve/reject paths when PostgreSQL is configured.
- Salary profile, payroll run, seven-step monthly close, payroll draft, lock, release, and employee payslip demo flow.
- Payroll close tracks the active Taiwan labor/payroll rule version used by each draft. If rules are pending legal review or marked for recalculation after a company override, payroll lock is blocked until HR recalculates with the reviewed active version.
- Finance-style salary profile workspace at `/hr/salary-profiles` for sensitive salary setup, effective-dated base salary/hourly wage, recurring allowance/deduction entries, Taiwan minimum wage readiness, profile coverage, payroll-only page access, and redacted audit logging. The page uses a today-first focus card, salary signal board, guided setup form, sensitive-data warnings, and current/history list while keeping salary data restricted to payroll roles.
- HR salary profile minimum wage readiness checks compare current profiles against the active configurable Taiwan labor rule version, block below-minimum saves, and keep production verification details aggregate-only so raw salary values do not leak into logs.
- Finance-style payment profile workspace at `/hr/payment-profiles` for sensitive employee bank-transfer destinations, payment coverage tracking, three-step account setup, masked account display, account and account-name hashes in audit evidence, bank-export blockers, payroll-only access, and redacted audit logs. Payment profile reads/writes do not silently fall back to demo state in database mode.
- Finance-style payroll profile import workspace at `/hr/payroll-profile-import` for HR-run batch onboarding of salary, payroll compliance, insurance grade, and payment destination data. The page uses a today-first focus card, import signal board, guided CSV preview wizard, employee-number reference, masked preview results, and confirm-only import action; UI previews do not return raw CSV, full bank account numbers, account names, or salary amounts.
- Finance-style payroll export and archive center at `/hr/payroll-exports` for locked/released payroll runs, including a today-first export focus, payroll/payment/security/archive signal board, bank-transfer package readiness, accounting-journal archive package, Taiwan statutory filing review drafts driven by versioned labor/payroll rule settings, recent archive packages, manifest preview, and downloadable redacted manifest CSVs with content hashes and audit metadata. Bank-transfer package generation is blocked until payment security and every employee payment destination are ready, and export operations do not silently fall back to demo state in database mode.
- Finance-style payment security gate at `/hr/payroll-payment-security` for token-vault references, KMS key references, customer bank-file formats, bank-transfer column order, verification status, and evidence notes. The page uses a today-first focus card, payment-safety signal board, three-step setup wizard, readiness checklist, payroll-only RBAC, and audited updates while keeping bank account values, provider secrets, national IDs, salary details, and health data out of UI text and logs.
- Finance-style payroll accounting mapping workspace at `/hr/payroll-accounting` for salary expense debit, employer statutory contribution debit, employee deduction/withholding credit, and net salary payable credit accounts. It adds page-level payroll RBAC, a today-first focus card, accounting signal board, four mapping cards, a guided mapping form, accounting-journal preview, audited updates, and aggregate-only copy that avoids employee-level salary, bank account, national ID, and private HR content.
- PostgreSQL-backed payroll run creation, recalculation, HR confirmation, lock, payslip release, and employee payslip reads are available when `DATABASE_URL` is configured. Payroll operations do not silently fall back to demo state in database mode; demo fallback is reserved for local UI smoke tests without `DATABASE_URL`.
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
- Payroll compliance readiness recommends labor insurance, NHI, and labor pension insured salary grades from active salary profiles plus fixed allowances, flags explicit overrides below the configured grade tables, blocks production verification with aggregate-only details, and does not silently fall back to demo compliance rows in database mode.
- Finance-style HR statutory insurance center tracks labor insurance, employment insurance, occupational accident insurance, NHI, and labor pension enrollment/withdrawal evidence with due dates, redacted evidence hashes, audit logs, and production verification coverage. Database mode fails closed instead of silently falling back to demo insurance records.
- Employer statutory payroll cost now separates labor insurance employer premium, NHI employer premium, occupational accident insurance, and labor pension contribution from employee net pay.
- Income tax withholding uses a versioned annualized progressive estimate with 2026 eTax rate brackets and is flagged for HR review before payroll lock.
- Payroll recordkeeping settings track 5-year wage roster retention, employee wage statement access, wage calculation details, and labor-inspection export readiness with audited changes.
- Attendance Exception Center tracks monthly close queues, safe missing-punch resolution suggestions, HR-reviewed working-time risks, KPI resolution rate, and redacted audit evidence before payroll lock.
- Monthly attendance sign-off lets employees confirm attendance summaries from mobile before payroll close, while HR tracks coverage and audit hashes without exposing raw attendance logs.
- Worktime agreement settings track labor union/labor-management conference approval evidence, effective periods, local authority filing status, and audited readiness before extended monthly overtime limits are used.
- Finance-style low-code HR form center at `/hr/forms` with text, number, date, select, file evidence metadata, checkbox, textarea, conditional field visibility, conditional HR review, unified Inbox routing, sensitive-flow guardrails, and HR self-service KPI support.
- Workflow template steps for direct manager and HR review, including a simple no-code condition so HR review can run only when the first submitted field equals a configured value.
- Safe AI Copilot layer for sourced policy Q&A, HR-reviewed form drafts with confirmable workflow conditions and field visibility proposals, approval summaries, and payroll exception explanations.
- HR-managed policy source library for AI Copilot. Policy Q&A only cites active approved company policy excerpts and configured rules; draft or inactive sources are excluded.
- AI usage logging stores category, actor, referenced record IDs, and output/prompt hashes without raw sensitive prompts.
- Finance-style company security posture workspace at `/settings/security` for admin/employee MFA requirements, SSO enforcement boundary, SSO metadata, password policy, session timeout, allowed email domains, readiness checklist, and audit logs.
- Finance-style Owner user access workspace at `/settings/access` for inviting users, assigning RBAC roles, linking accounts to employee master records, linking SSO identities with subject hashes, suspending/reactivating accounts, checking unlinked employees, and auditing access changes without storing raw invite tokens or raw SSO subjects. The workspace now includes a production access cutover Gate that aggregates SSO/MFA posture, privileged identity coverage, employee-user links, four-role RBAC coverage, payroll/payslip permission boundaries, support access governance, and demo-auth shutdown status using counts and hash-only evidence requirements.
- Finance-style support access workspace at `/settings/support-access` for Owner-approved customer support grants: every grant is ticket-bound, scoped, limited to 72 hours, revocable, audited with redacted metadata, and checked by production verification so customer support cannot become silent impersonation.
- Owner Subscription Center for customer plan, status, seat limits, trial/contract dates, billing contact, contract reference/hash, payment collection mode, and commercial verification before sale.
- Owner operational resilience workspace for recording backup provider, encrypted retention, last successful backup, restore drill status, RTO/RPO, and verification evidence before production launch.
- Taiwan labor standards v1 rule settings for 2026 minimum wage, regular working time, Labor Standards Act Article 24 overtime tiers, Article 36 rest-day cycle controls, Article 37/39 holiday work pay controls, Article 38 annual leave entitlement and unused-leave payout, Article 16/17 termination notice and severance review settings, Labor Pension Act Article 12 severance settings, statutory onboarding/offboarding due-day settings for labor/employment/occupational accident insurance, configurable statutory payroll rates, NHI average dependent count, NHI supplementary premium bonus threshold/rate, occupational accident rates, income tax withholding estimate settings, and versioned insurance salary grade tables for labor insurance, NHI, and labor pension.
- Taiwan labor rule change control requires every company override to keep a change reason, source URL, reviewer, legal-review status, payroll recalculation flag, versioned rule record, deterministic fixture validation summary, and redacted audit metadata.
- Taiwan legal source monitor lets owner/admin users review and refresh official law, MOL, BLI, NHI, and tax source URLs plus checked dates from the settings wizard; stale or invalid source reviews block launch readiness through the shared rule governance gate.
- Audit log console for reviewing sensitive mutations as redacted metadata and before/after hashes, plus labor-inspection evidence packages with period filters, entity/action summaries, coverage warnings, and content hashes.
- DB-backed Taiwan labor rule settings through `law_rules` and `rule_versions` when PostgreSQL is configured, with superseded version history and audit logs.
- Shared tenant/session guard for sensitive API routes, enforcing tenant/company context, RBAC permission, employee context when required, and company authentication policy.
- Tenant isolation guardrail tests require every non-demo API route to call `requireTenantSession`, forbid direct DB imports in API routes, and ensure DB fallback helpers require tenant and company context together.
- Global Next.js security headers set clickjacking, MIME sniffing, referrer, permissions, COOP/CORP, and CSP report-only baselines; production mode also enables HSTS.
- API middleware blocks explicit cross-origin mutation requests before they reach HR, payroll, approval, form, AI, or settings handlers.
- Public operational health endpoints expose `/api/health/live` for liveness and `/api/health/ready` for readiness without returning secrets, database URLs, PII, salary, or tenant data.
- Owner launch-readiness dashboard checks PostgreSQL persistence, tenant foundation, commercial subscription readiness, SSO/MFA posture, privileged SSO identity bindings, support access governance, personal data governance, labor roster completeness, onboarding training evidence, workplace incident response, production document storage, external notification readiness, Taiwan rule governance, audit evidence, and KPI gates before sale.
- Beta pilot readiness gate, one-command go/no-go report, guided company setup actions, trial completion review, persisted trial runs, and two-week operations runbook for the next implementation phase: checks whether a 20-50 person trial can safely run through employee mobile tasks, clock in/out, leave request, manager approval, announcements, HR payroll close rehearsal, released payslip viewing, audit coverage, import preflight, invite readiness, evidence privacy scan, and unauthorized payroll-access guardrails before a customer trial begins, lets HR generate 14-day schedules, sync leave balances, publish the trial announcement, and run the demo payroll rehearsal from `/settings/company-setup`, then shows HR the preflight, day 1, day 3, day 7, and day 14 operating checkpoints with hash-only evidence recording. `/settings/pilot-operations` also surfaces a daily today gate and a three-card task board based on the persisted trial day and the earliest unfinished checkpoint, so HR knows whether today is blocked, missing evidence, or safe to continue, and what to do before noon, during the day, and at evidence close.
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

11. For Vercel + Supabase deployment, configure Vercel project `prj_QY0hzJ4hFzLX8XYO5ljIffLnH99N` with production environment variables:

- `DATABASE_URL`: Supabase Transaction Pooler connection string from the Supabase dashboard, not the direct `db.<project-ref>.supabase.co:5432` host and not the session pooler on port `5432`. For Vercel + Prisma it should use the pooler host on port `6543` and include `pgbouncer=true&connection_limit=1&schema=hr_one`. Use a server-side secret only; do not expose the database password as a public variable. If you intentionally use the direct host, enable the Supabase IPv4 add-on and set `HR_ONE_SUPABASE_IPV4_ADDON_ENABLED=true`; the runtime database ping must still pass.
- `HR_ONE_DEPLOYMENT_TARGET=vercel`
- `VERCEL_PROJECT_ID=prj_QY0hzJ4hFzLX8XYO5ljIffLnH99N`
- `HR_ONE_DATABASE_PROVIDER=supabase_postgres`
- `NEXT_PUBLIC_SUPABASE_URL=https://aruncclorusswpfnpgsn.supabase.co`
- `HR_ONE_SUPABASE_REGION=ap-northeast-2`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_yScyXz-bOUu7W5geHggd4A_9FcGwU7M`
- `HR_ONE_AUTH_SESSION_SOURCE=oidc`; demo auth, demo reset, and demo role switching are disabled when `HR_ONE_ENV=production`.
- `HR_ONE_AUTH_LOGIN_URL=https://hr.suiyuecare.com/auth/sign-in`: HTTPS formal login URL shown on `/auth/required`; placeholders, demo/example hosts, and local URLs are blocked.
- For Supabase Auth as the pilot IdP, use issuer `https://aruncclorusswpfnpgsn.supabase.co/auth/v1`, JWKS `https://aruncclorusswpfnpgsn.supabase.co/auth/v1/.well-known/jwks.json`, audience `authenticated`, and `HR_ONE_AUTH_DEFAULT_TENANT=tenant_suiyuecare_pilot` / `HR_ONE_AUTH_DEFAULT_COMPANY=company_suiyuecare_pilot` unless tokens carry custom tenant/company claims. In Supabase Auth URL Configuration, add `https://hr.suiyuecare.com/auth/callback` as an allowed redirect URL before inviting pilot users.
- All `HR_ONE_*` production secrets and vault references listed in `.env.example`.

Then run `pnpm env:verify:production` in the deployment environment before running migrations and production tenant verification.

Before starting a 20-50 person two-week pilot, run the production pilot gate against the live domain:

```bash
printf '%s' "$SUPABASE_TRANSACTION_POOLER_DATABASE_URL" | pnpm vercel:database-url-handoff -- --env-file=.env.vercel.production --output=/tmp/hr-one-vercel-database-url-handoff.md
pnpm pilot:production-database -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --env-file=.env.vercel.production --output=/tmp/hr-one-production-database-gate.md
pnpm pilot:gate:production -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com
```

The production database report gives Owner/HR a redacted remediation checklist for Vercel-to-Supabase connectivity. The `/settings/production-database` page reads the live `/api/health/ready` payload and adds a redacted current runtime env diagnosis, while the CLI inspects `.env.vercel.production` for local draft posture by default. These env sections show only safe diagnostics such as database connection shape, unresolved placeholder keys, failed verifier check names, and the safe Supabase transaction pooler shape for the Suiyuecare project: username `postgres.aruncclorusswpfnpgsn`, host `aws-0-ap-northeast-2.pooler.supabase.com`, port `6543`, database `postgres`, and query params `pgbouncer=true&connection_limit=1&schema=hr_one`. They never print the complete database URL, password, salary data, bank data, national IDs, or health data. Use `--skip-env-file` only when you intentionally want a live-health-only CLI report.

The same `/settings/production-database` page also shows a Vercel Production env cutover preflight. It walks Owner/HR through the non-skippable sequence: local env draft verification, redacted `DATABASE_URL` handoff, Vercel env dry-run, Vercel env write, production redeploy, live `/api/health/ready`, and saved production pilot evidence. The page exposes only the next safe command and redacted evidence labels; it never treats a Vercel key inventory as proof that production runtime has the new secret.

The Vercel database URL handoff command validates the operator-provided Supabase transaction pooler URL from stdin and emits a redacted Markdown/JSON handoff that lists connection posture, changed env keys, Vercel variable key names, sensitivity types, and next actions. It never writes the env draft and never prints the URL, username, or password; after the handoff is ready, use `pnpm vercel:refresh-production-env-draft -- --database-url-stdin --apply`, `pnpm vercel:apply-production-env -- --dry-run`, then the actual Vercel env write and production redeploy.

The production pilot gate reads `/api/health/ready` from the deployed app and blocks the pilot when the site is still non-production, using demo fallback, exposing demo auth, missing the production database, or exposing sensitive health payload values. It must pass after the Vercel production env vars are configured and the production deployment is redeployed.

For the full pilot go/no-go view, run the doctor command:

```bash
pnpm pilot:doctor -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --project-ref=aruncclorusswpfnpgsn --schema=hr_one --env-file=.env.vercel.production
```

It checks Vercel Production env key presence, the local production env draft, the live readiness endpoint, and the Supabase pilot tenant seed without printing secret values. If Vercel env read access or Supabase CLI database reachability fails, the doctor fails closed but still prints a redacted report and next action instead of crashing. The two-week trial should not start until this returns `ready`.

For an objective-by-objective acceptance matrix, run:

```bash
pnpm pilot:acceptance -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --project-ref=aruncclorusswpfnpgsn --schema=hr_one --env-file=.env.vercel.production --tenant-slug=<customer-slug>
```

This wraps the doctor checks and demo-safe workflow rehearsal into a matrix for production readiness, real 20-50 person cohort, clock in/out, leave request, manager approval, announcement receipt, HR monthly close rehearsal, payslip viewing, and sensitive-data guardrails. When `--tenant-slug` is provided, the real-company cohort is read from PostgreSQL as aggregate counts only; employee names, salaries, bank accounts, and private HR fields are not returned. Synthetic Supabase seed data is reported as rehearsal evidence only; it does not satisfy the real-company cohort requirement.

To create a redacted Markdown handoff for the pilot team, run:

```bash
pnpm pilot:handoff -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --project-ref=aruncclorusswpfnpgsn --schema=hr_one --env-file=.env.vercel.production --tenant-slug=<customer-slug> --output=/tmp/hr-one-pilot-handoff.md
```

The handoff is derived from `pilot:acceptance` and is safe to review with HR/operations, but it should still be checked before sharing outside the pilot team.

During the two-week trial, run the redacted morning brief before the daily standup, then run the daily status check for preflight, day 1, day 3, day 7, and day 14:

```bash
pnpm pilot:workflow-readiness -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --project-ref=aruncclorusswpfnpgsn --schema=hr_one --env-file=.env.vercel.production --tenant-slug=<customer-slug> --output=/tmp/hr-one-pilot-workflow-readiness-day-1.md
pnpm pilot:morning-brief -- --day=1 --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --project-ref=aruncclorusswpfnpgsn --schema=hr_one --env-file=.env.vercel.production --tenant-slug=<customer-slug> --output=/tmp/hr-one-pilot-morning-day-1.md
pnpm pilot:daily-status -- --day=1 --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --project-ref=aruncclorusswpfnpgsn --schema=hr_one --env-file=.env.vercel.production --tenant-slug=<customer-slug> --output=/tmp/hr-one-pilot-day-1.md
```

Workflow readiness separates `production_ready`, `rehearsed_only`, and `blocked` for clock in/out, leave request, manager approval, announcement, payroll rehearsal, payslip view, and sensitive-data guardrails. The morning brief gives HR/ops a short stop/go agenda for the day. The daily status report maps the acceptance matrix to the active trial day, flags blockers, separates demo rehearsal from production evidence, and repeats the privacy guardrails for payroll, bank, national ID, health, database URL, and private HR note data.

To prepare a real 20-50 person customer's import workbook, generate the synthetic template pack:

```bash
pnpm pilot:import-template-pack -- --output=/tmp/hr-one-pilot-import-template --cohort-size=25 --force
```

The pack contains employee, identity, and payroll profile CSV templates aligned to the current HR import services, plus a short README. It intentionally contains synthetic sample data only. Replace every employee, login identity, salary, tax, and payment value from the customer's secure source data before import, and never share completed identity, payroll, or bank files through logs, chat, screenshots, or support tickets.

Before uploading completed customer CSV files, run the redacted import preflight:

```bash
pnpm pilot:import-preflight -- --employee-csv=/secure/customer/employee-import.csv --identity-csv=/secure/customer/identity-import.csv --payroll-csv=/secure/customer/payroll-profile-import.csv --output=/tmp/hr-one-pilot-import-preflight.md
```

The preflight checks headers, 20-50 employee count, employee/identity/payroll row matching, unique employee numbers, identity email/SSO subject uniqueness, department coverage, manager reporting lines, non-resident tax setup, required payroll fields, and generated-template placeholders. It returns non-zero until blockers and template-sample warnings are resolved, and its report intentionally omits names, emails, SSO subjects, salary amounts, bank accounts, national IDs, health data, and private HR notes.

After employee import, dry-run the identity and SSO linking CSV:

```bash
pnpm pilot:identity-import -- --tenant-slug=<customer-slug> --csv=/secure/customer/identity-import.csv --output=/tmp/hr-one-pilot-identity-import.md
```

After HR verifies the redacted dry-run report, apply it:

```bash
pnpm pilot:identity-import -- --tenant-slug=<customer-slug> --csv=/secure/customer/identity-import.csv --apply --output=/tmp/hr-one-pilot-identity-import-applied.md
```

The identity import creates or updates active users, links `Employee.userId`, ensures employee roles, assigns manager roles based on actual direct reports, and links OIDC subjects. Audit metadata stores hashes and aggregate counts only; it does not store raw emails or SSO subjects.

For a single production-only import sequence after all three CSVs are ready, run:

```bash
pnpm pilot:customer-import -- --tenant-slug=<customer-slug> --employee-csv=/secure/customer/employee-import.csv --identity-csv=/secure/customer/identity-import.csv --payroll-csv=/secure/customer/payroll-profile-import.csv --output=/tmp/hr-one-pilot-customer-import.md
```

After the dry-run report is verified, apply the sequence:

```bash
pnpm pilot:customer-import -- --tenant-slug=<customer-slug> --employee-csv=/secure/customer/employee-import.csv --identity-csv=/secure/customer/identity-import.csv --payroll-csv=/secure/customer/payroll-profile-import.csv --apply --output=/tmp/hr-one-pilot-customer-import-applied.md
```

This command fails closed without `DATABASE_URL`. Its dry-run first validates the employee CSV, the projected identity/SSO links, and the projected payroll profiles against the same 20-50 person cohort before any database write. Apply mode then imports employees first, applies identity/SSO links second, imports payroll profiles third, and finishes by checking invite readiness. If an apply-stage failure still occurs, review audit logs before retrying the remaining stage.

After importing employee users and SSO identities, run the invite readiness check:

```bash
pnpm pilot:invite-readiness -- --tenant-slug=<customer-slug> --output=/tmp/hr-one-pilot-invite-readiness.md
```

It verifies aggregate-only coverage for 20-50 active employees, linked active users, employee roles, manager users, manager roles, SSO identities, allowed email domains, and department assignments. It intentionally omits employee names, emails, SSO subjects, salaries, bank accounts, national IDs, health data, and private HR notes.

Before inviting real pilot employees, run the full go/no-go gate:

```bash
pnpm pilot:rollout-kit -- --company-name="<customer-name>" --app-url=https://hr.suiyuecare.com --support-contact="HR 試用窗口" --output=/tmp/hr-one-pilot-rollout-kit.md
pnpm pilot:go-no-go -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --project-ref=aruncclorusswpfnpgsn --schema=hr_one --env-file=.env.vercel.production --tenant-slug=<customer-slug> --employee-csv=/secure/customer/employee-import.csv --identity-csv=/secure/customer/identity-import.csv --payroll-csv=/secure/customer/payroll-profile-import.csv --evidence-path=/tmp/hr-one-pilot-evidence --recursive --output=/tmp/hr-one-pilot-go-no-go.md
pnpm pilot:invitation-release -- --production-database-report=/tmp/hr-one-production-database-gate.md --go-no-go-report=/tmp/hr-one-pilot-go-no-go.md --invite-readiness-report=/tmp/hr-one-pilot-invite-readiness.md --rollout-kit-report=/tmp/hr-one-pilot-rollout-kit.md --output=/tmp/hr-one-pilot-invitation-release.md
```

This aggregates `pilot:acceptance`, Day 0 `pilot:daily-status`, customer import preflight, invite readiness, core workflow readiness, and pilot evidence scan into one redacted start/stop report. It exits non-zero until production readiness, real cohort data, CSV import readiness, employee invitation readiness, core workflow readiness, and privacy scanning are all acceptable. The default gate allows rehearsed-only workflow items before the first invitation when there are no blocked workflows; add `--require-workflow-production-evidence` when the same go/no-go command is used after Day 3 or Day 7 and production checkpoint evidence must exist.

After the two-week trial, run the completion review:

```bash
pnpm pilot:trial-completion -- --tenant-slug=<customer-slug> --evidence-path=/tmp/hr-one-pilot-evidence --recursive --output=/tmp/hr-one-pilot-completion.md
pnpm pilot:evidence-package -- --path=/tmp/hr-one-pilot-evidence --recursive --output=/tmp/hr-one-pilot-evidence-package.md
```

This checks production checkpoint evidence for preflight access review, Day 1 announcements, Day 3 clock/leave/manager approval, Day 7 payroll rehearsal plus payslip access, Day 14 final review, KPI status, and the final evidence privacy scan. It fails closed when the tenant, database, checkpoint evidence, KPI telemetry, or evidence scan is missing.
It reports `completed` only with zero blockers and zero warnings. `--skip-evidence-scan` is diagnostic only and cannot complete a real trial.
The final evidence package gate separately verifies that the redacted evidence folder contains the required production database, Go/No-Go, invitation release, Day 0/1/3/7/14 daily status, completion, audit evidence, and handoff reports, then scans the folder for sensitive values before anything is shared with customer stakeholders.

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

Seed data includes one tenant, one company, two departments, one owner, one HR admin, one manager, and a 25-person Beta pilot employee cohort with manager reporting lines, salary profiles, leave balances, schedules, payment profiles, statutory insurance records, privacy acknowledgements, training assignments, and payroll compliance profiles with resident/non-resident examples.
HR admins can open `/hr/forms` to create custom forms from a Finance-style workspace with today-first focus, form signals, category cards, a guided builder, template library, conditional visibility, conditional HR review, sensitive-flow guardrails, and manager/HR approval workflows. Employees submit active forms from `/app`; approvers process them from `/manager/inbox`.
The form wizard supports conditional field visibility and conditional HR review in plain language: HR can keep employee forms short by showing extra fields only for specific answers, keep manager review as the first step, and only route to HR when the first submitted field matches a configured answer.
HR admins can open `/hr/employees` as the day-to-day employee master workspace. It shows a Finance-style today focus, employee master signal board, action cards, employee roster, department distribution, and guardrails for employee data, manager lines, login/SSO, standard job architecture, labor roster, working-condition acknowledgement, payroll prerequisites, and statutory insurance readiness. HR users with `employee:write` can use the three-step employee master correction wizard to update department, manager line, standard job position, and display job title; each correction writes redacted audit metadata with before/after hashes and never stores the raw correction reason. Managers with `employee:read` see only themselves and direct reports; salary amounts, bank accounts, national IDs, health data, and private HR notes are not rendered on this workspace.
HR admins can open `/hr/onboarding-readiness` to clear customer setup gaps before running production verification, including labor roster profile coverage and statutory insurance enrollment coverage based on the active Taiwan rule settings. They can then open `/hr/employee-import` to preview, validate, and import employee CSV data without engineering support. The employee import preview checks department codes, duplicate employee numbers, `managerEmployeeNo` reporting lines, and whether the projected company size reaches the 20-50 person Beta pilot range before HR confirms the import; employee and import audit logs include aggregate pilot-readiness metadata. After employees exist, HR can open `/hr/labor-roster` to complete Taiwan worker roster profiles, `/hr/employment-terms` to publish versioned working conditions with Taiwan Article 7 coverage and employee acknowledgement, and `/hr/payroll-profile-import` to batch import salary, payment destination, and payroll compliance profiles from one CSV instead of editing each employee one at a time. The payroll import workspace now masks preview results so the browser does not return raw CSV, full bank account numbers, account names, or salary amounts after preview.
HR admins can open `/hr/employee-lifecycle` to record employee transfers, promotions, leave, return, and termination events. Events update the employee profile and write audit logs. Termination events include a Taiwan compliance review snapshot for notice days and severance estimates using the active versioned labor rule settings, plus an offboarding readiness checklist for final wage review, unused annual leave settlement, statutory insurance withdrawal due date, access revocation, employee record retention, and employment certificate readiness; the output is advisory and always marked for human HR/legal review.
HR admins can open `/hr/employment-terms` to publish structured working-condition summaries for employees, including job title, workplace, regular work schedule, wage payment day, source reference, and a wage-basis hash linked to salary profiles. Employees can open `/app/employment-terms` to acknowledge active terms from mobile. Audit logs store hashes and status metadata rather than raw wage terms.
HR admins can open `/hr/labor-roster` to review Taiwan worker roster readiness for active employees from a Finance-style signal board, Article 7 field wizard, readiness list, and governance cards. The module tracks required roster fields, missing items, HR verification status, source references, and hashes for legal name, national ID, registered address, emergency contact, wage summary, reward/discipline summary, injury/sickness summary, and other necessary items so audit evidence never stores raw roster PII, salary, or health content.
HR admins can open `/hr/offboarding` after recording a termination to close final wage, unused leave settlement, statutory insurance withdrawal, access revocation, record retention, and employment certificate tasks from a Finance-style signal board and task list. Evidence references and private notes are hashed before audit storage, and production verification requires completed or waived offboarding tasks for every termination event.
HR admins can open `/hr/documents` to manage the employee document vault from a Finance-style Chinese workspace with today-first guidance, storage Gate, scan/encryption/retention signals, a three-step metadata wizard, guarded document list, and governance cards. Selected documents can be released to employee self-service at `/app/documents`, now localized for mobile employees. File bytes are not stored in the database; object keys are reserved through the configured storage policy, while the UI shows only short refs and scan/retention evidence instead of full storage paths.
Owner、HR 與行政管理角色可從 `/hr/shift-templates` 進入排班設定工作台，維護可重用班別、產生日排班、複核跨日班，並以 audit log 追蹤排班覆蓋與重發。
Owners and HR admins can open `/hr/attendance-policies` as a Finance-style Chinese punch and attendance policy workspace. It starts with today-first focus, signal cards for active policy, recordkeeping Gate, punch guardrails, and approval guardrails; it includes command cards for employee attendance rules, punch settings, Labor Standards Act Article 30 five-year attendance record retention, and attendance exceptions; and it updates the active policy through a guided wizard with audit logs. Overtime risk summaries use the active policy instead of hidden constants, and production verification requires 5-year attendance record retention with employee self-service and export access enabled. Employees can open `/app/attendance` from the mobile Time tab to review their recent attendance records without asking HR.
Employees can sign off the current monthly attendance period from `/app/attendance` after pending exceptions are cleared. HR admins can open `/hr/attendance-signoffs` to track coverage before payroll close; sign-off audit logs store period counts and summary hashes instead of raw clock details.
Owners and HR admins can open `/hr/worktime-compliance` to scan monthly working-time risks against configured Taiwan labor standards and create attendance exceptions before payroll close. The scan evaluates daily worktime, weekly regular worktime, monthly overtime limits, and Article 36 rest-day cycles from company calendars, employee schedules, and actual attendance evidence instead of assuming a fixed weekend.
Owners and HR admins can open `/hr/worktime-agreements` as a Finance-style Chinese worktime agreement control desk. The page starts with today-first focus, agreement signal board, evidence/effective-period/filing/monthly-close command cards, a three-step wizard for consent source, evidence reference, 46/54/138 hour limits, local authority filing, HR verification notes, official Ministry of Labor source links, and audit/privacy guardrails. Production verification requires a verified agreement record with evidence before extended monthly overtime limits are considered ready.
HR admins can open `/hr/leave-policies` to create or update leave policies without code changes from a Finance-style Chinese workspace. Policy changes are audited and can provision missing employee balances. The page starts with today-first guidance, statutory leave coverage, HR/legal review counts, attachment rules, and a Taiwan leave-law Gate before the three-step wizard. The wizard keeps Taiwan leave-type compliance configurable through statutory category, eligibility rule, pay-rate percent, annual limit notes, and a legal-review flag rather than hardcoding every leave law into request handling.
HR admins can open `/hr/annual-leave-grants` as a Finance-style Chinese annual leave grant workspace. It shows a today-first focus, Article 38 tier Gate, active employee preview, carryover warning, employee notification and audit-log guardrails, official source links, and a three-step yearly grant batch form. The batch carries forward prior remaining units, resets current-year usage buckets, sends employee notifications, preserves the selected as-of date after submit, and writes audit logs.
HR admins can open `/hr/annual-leave-expiry` as a Finance-style Chinese annual leave expiry reminder workspace. It shows a reminder-risk signal board, warning-day threshold, carried-over leave tracking, employee-autonomy guardrails, official Article 38/24-1 source links, and a three-step reminder batch form. Reminders are sent only after HR review, preserve the selected scan criteria after submit, write audited reminder batches, and do not create payroll items or expose salary data.
Owners and HR admins can open `/hr/calendar` to maintain company-reviewed holidays and makeup workdays. The page also stores an audited annual calendar review with source URL, source checked date, reviewer, approval status, expected national holiday count, makeup workday count, and company holiday count. Calendar changes and annual reviews are audited and must be approved before schedule generation, payroll close, and production verification.
HR admins can open `/hr/policy-sources` to manage approved policy excerpts that AI Copilot may cite. HR admins can then open `/hr/copilot` for AI-assisted policy answers, form drafts, and payroll explanations. Form drafts include editable field proposals, conditional visibility suggestions, and workflow review conditions that HR must confirm before saving. AI outputs are suggestions only and blocked from final hiring, firing, compensation, performance, or disciplinary decisions.
HR admins can open `/hr/work-rules` as a Finance-style company rules workspace with today-first focus, rule signal board, Labor Standards Act Article 70 twelve-item coverage, official source link, HR/legal review status, source/filing reference, content hash wizard, and employee acknowledgement evidence. Employees can open `/app/work-rules` from the mobile UI to acknowledge active rules in one action. Work-rule mutations and acknowledgements write audit logs without storing raw rule content.

HR admins can open `/hr/training` as a Finance-style Chinese training launch workspace. It shows a today-first focus, training KPI signal board, 10-minute first-week Gate, three-step training controls, short-course wizard, required assignment evidence, and privacy/audit guardrails. Employees can open `/app/training` as a Chinese mobile task page with a today focus card, training progress board, three-step completion guide, assignment cards, and one-tap completion. Training settings, assignment batches, and employee completions write audit logs without storing raw private notes.
HR admins can open `/hr/incidents` to configure workplace incident response controls, keep severe incident notification targets at 8 hours or less, review employee reports, track investigations, mark authority follow-up, and record corrective action. Employees can open `/app/incidents` from the mobile UI to confidentially report safety hazards, near misses, occupational accidents, harassment, or workplace violence. Incident audit logs keep hashes, status, type, severity, and due dates instead of raw incident descriptions.
HR admins can open `/hr/kpis` to review the product winning KPI scorecard. It reads privacy-safe product telemetry for leave success time, manager approval time, mobile task completion, and HR form self-service. Employee and manager workflow actions now emit redacted telemetry automatically, and the sale gate still fails when production data is missing or below target.
HR admins land on `/hr` as a monthly-close command center: it surfaces close health, KPI focus, attendance blockers, onboarding gaps, payroll status, and guided next actions before showing detailed tool links.
Owners/admins can open `/settings/law-rules` for the Taiwan labor/payroll rule center, then use `/settings#law-rules-setup` for the full advanced form. The rule center shows readiness, validation status, official-source freshness, version history, and a source-refresh wizard so HR/legal can refresh `id,title,url,checkedAt` rows without engineering support. Updates create a new versioned rule record and audit log, and launch readiness blocks stale, invalid, unreviewed, or payroll-recalculation-pending rule versions.
HR admins can open `/hr/payroll-compliance` as a Finance-style Chinese payroll compliance workspace for tax residency, dependent counts, non-resident withholding, labor insurance, NHI, and labor pension insured-wage override review. The page uses a today-first focus card, payroll compliance signal board, insurance-grade Gate, employee-level three-step forms, rule-version links, and sensitive-data guardrails; all changes continue to write audit logs and keep salary, bank account, national ID, and health data out of page notes and logs. Monthly close also shows whether the payroll draft was calculated with the active reviewed Taiwan labor/payroll rule version; stale drafts or pending legal-review rules block payroll lock and require recalculation or rule approval first.
HR admins can open `/hr/insurance` to track Taiwan statutory labor insurance, employment insurance, occupational accident insurance, NHI, and labor pension enrollment evidence from a Finance-style today-first workspace. Due dates come from versioned rule settings where available, evidence references are hashed in audit metadata, raw portal receipt IDs/private notes are not returned to the workbench, and production verification requires every active employee to have ready statutory insurance records.
HR admins can open `/hr/annual-leave-settlements` from monthly close as a Finance-style Chinese unused annual leave settlement workspace. The page shows a today-first focus, payroll-run signal board, Labor Standards Act Article 38 Gate, Enforcement Rule Article 24-1 daily-wage guidance, payment-deadline and wage-roster/written-notice guardrails, a three-step settlement draft form, official source links, and a review list for HR before recalculation. Drafts are audited as redacted settlement batches, included in payroll only after recalculation, and applied to leave balances only when payroll is locked. Carried-over annual leave is tracked separately and consumed before current-year leave for both approved leave and year-end settlement.
HR admins can open `/hr/salary-profiles` from monthly close to maintain employee salary profiles. Managers cannot read or write salary profiles.
HR admins can open `/hr/payment-profiles` from monthly close to maintain employee payment destinations. The app stores account hashes and last four digits only; production account tokens must live in the configured payment token vault.
HR admins can open `/hr/payroll-recordkeeping` as a Finance-style Chinese wage roster and payroll statement workspace. The page starts with today-first focus, Article 23 / Enforcement Rule 14-1 source references, signal cards for wage roster retention, employee payslip access, calculation-detail completeness, and labor-inspection export readiness, plus a three-step audited wizard. Production verification requires at least 5-year wage roster retention and employee-accessible wage calculation details while keeping salary amounts, bank accounts, national IDs, and private HR notes out of this settings surface.
HR admins can open `/hr/attendance-exceptions` to resolve missing-punch and working-time exceptions before payroll close. Warning-level missing-punch items receive safe suggestions that HR can confirm in bulk or one by one, while working-time risks remain manual HR/legal review items. Resolution evidence references and comments are hashed before audit storage so private employee notes or chat links do not appear in logs.
HR admins can open `/hr/payroll-payment-security` to configure token-vault references, KMS references, customer bank file format, required bank-transfer columns, and verification evidence before bank upload readiness is considered production-ready. Payment-security reads/writes do not silently fall back to demo state in database mode.
HR admins can open `/hr/payroll-adjustments` after payroll lock/release as a Finance-style Chinese post-lock correction workspace. The page exposes a locked-payroll adjustment Gate, today-first focus, adjustment signal cards, a three-step HR request form, Owner Inbox handoff, adjustment log, and guardrails that prohibit silent mutation of locked payroll. Owners approve or reject pending adjustments from `/manager/inbox` before payroll items or payslips change; create/approve/reject actions are audited with payroll values redacted.
HR admins can open `/hr/payroll-accounting` to map payroll export summaries to the company chart of accounts, then open `/hr/payroll-exports` after payroll lock/release to generate audited bank-transfer packages, accounting-journal packages, and Taiwan statutory filing review drafts for labor insurance, NHI, occupational accident insurance, labor pension, income tax withholding, and NHI supplementary premium items. Accounting export settings do not silently fall back to demo state in database mode. Payment destinations are tracked with masked/hash data, bank packages are blocked until payment security is verified and every employee destination is configured, and generated bank rows use the configured column order. Production readiness requires token-vault, KMS, verified customer bank format, account token, and amount columns. Statutory filing report definitions come from the active versioned Taiwan labor/payroll rule settings instead of hidden code constants, so customer filing packages can be reviewed and changed through `/settings/law-rules` and persisted in `law_rules` / `rule_versions`. Statutory filing drafts are for HR/accounting review and do not submit to authorities automatically. Downloaded manifests update the export status and audit log while excluding employee-level salary, national ID, and bank account values.
Owners can open `/settings/law-rules` or `/settings#law-rules-setup` to review and adjust Taiwan labor rule settings. Defaults are versioned and include official law/source references for minimum wage, regular working time, overtime, rest days, national holidays, holiday work pay, annual leave entitlement, unused annual leave payout, statutory onboarding/offboarding timing, statutory payroll, NHI supplementary premium, tax estimates, and statutory filing report definitions. Company overrides should stay at or above legal minimums and must carry change-control metadata: reason, source URL, reviewer, legal-review status, and whether existing payroll drafts need recalculation review. Statutory payroll rates, filing report mappings, work-time limits, rest-day cycle controls, holiday multipliers, annual-leave payout basis, statutory insurance due-day settings, NHI supplementary premium settings, and salary grade tables live in rule records so payroll formulas use configured versions instead of hidden constants. Salary grade table CSV lines use `level, insured salary, salary from, salary to`; income tax bracket CSV lines use `taxable from, taxable to, rate percent, progressive difference`. Occupational accident industry rates, NHI supplementary premium settings, statutory filing mappings, and income tax withholding estimates should be reviewed before payroll launch.
Every Taiwan labor rule update runs deterministic validation fixtures for minimum wage boundaries, Article 24 overtime tiers, rest-day/holiday work, working-time caps, seven-day rest cycles, Article 38 annual leave tiers, termination compliance, and NHI supplementary premium before the version is accepted. The validation summary is stored with the rule version and audit metadata. Launch readiness also checks official legal source review freshness with a 180-day default window, so stale source reviews block production approval even when formulas still pass.
Owners can open `/settings/readiness` to review launch gates before selling or onboarding a customer. The page intentionally marks demo-only persistence/storage, missing backup and restore evidence, missing production SSO, missing privileged SSO identity bindings, unsafe support access grants, unverified payroll payment vault/bank formats, pending legal-review rules, missing audit evidence, notification gaps, and KPI failures as action items or blockers, then turns them into a guided production setup wizard with links to the relevant setup page or database verification path. HR can use `/settings/company-setup` to run audited setup actions for 14-day schedules, leave balance synchronization, a receipt-required trial announcement, and demo payroll rehearsal; setup action audit metadata is aggregate-only and redacted, and database-backed payroll blockers are not silently cleared. The same page also lets HR create or synchronize a persisted 20-50 person trial run with start/end dates, current day, cohort counts, readiness status, event count, and evidence summary hash. Trial-run updates write `beta_pilot_trial_run` audit events and `BetaPilotTrialEvent` readiness snapshots in database mode; notes and evidence summaries are hash-only. Production deployments without `DATABASE_URL` are fail-closed for trial-run creation so HR cannot accidentally treat in-memory demo evidence as a real two-week pilot record. The same page also shows the Beta pilot operations runbook so HR can run preflight, day 1 employee/announcement rollout, day 3 attendance and approval fixes, day 7 payroll rehearsal, and day 14 safety/readiness review from one place. Checkpoint updates write append-only `beta_pilot_checkpoint` audit events with status, evidence type, and evidence/note/next-step hashes only, so trial proof can be retained without storing raw payroll, PII, or private HR notes. The preflight step includes an owner/HR-only access review that verifies payroll dashboard and payslip permission boundaries without reading salary, bank account, national ID, or health values, then writes an `access_review` checkpoint. Day 1 announcement receipts, Day 3 clock-out plus leave approval, and Day 7 payroll release plus employee payslip self-view now create system checkpoint evidence automatically. Day 14 has a final review action that reads the current readiness gates and writes a hash-only `audit_export` checkpoint as verified, in progress, or blocked; it cannot falsely close a trial while blockers remain.
Owners can open `/settings/subscription` to manage customer commercial readiness. The page keeps plan/status, seat limits, trial and contract dates, billing contact, contract reference/hash, payment collection mode, and verification status owner-only. Audit logs store hashes and posture metadata instead of raw contract text, payment data, or customer private notes.
Owners can also configure company security posture from `/settings/security` or the settings command center, including MFA policy, SSO provider metadata, password requirements, session timeout, and allowed email domains. SSO setup stores non-secret issuer, client ID, and JWKS URL metadata only; provider secrets belong in the deployment vault. Sensitive API guards evaluate session assurance claims against these settings so a production auth provider can plug in SSO/MFA claims without rewriting business modules.
Owners can open `/settings/access` to invite users, assign roles, suspend/reactivate accounts, and link users to stable OIDC issuer/subject identities for production SSO. Access and SSO identity changes are audited, invite tokens are not stored in raw form, and privileged roles show when SSO is required by company policy.
Owners can open the Finance-style `/settings/support-access` workspace to approve or revoke temporary customer support access. Grants are ticket-bound, scoped, limited to 72 hours, audited, and included in production database verification. The page shows active, expired, customer-approved-record, and revoked posture without exposing raw support reasons or customer-sensitive HR data.
Owners and HR admins can open `/settings/privacy` to manage the employee personal data notice, acknowledgement requirement, HR record retention target, data subject request response target, deletion-review requirement, cross-border transfer/subprocessor posture, and legal/HR verification status. Employees can open `/app/privacy` to acknowledge the current notice, submit access/correction/export/restriction/deletion-review requests, and track outcomes. Privacy actions write audit logs with hashes and status metadata rather than raw request notes.
Owners can open `/settings/operational-resilience` to record backup and restore readiness. The production gate requires enabled backups, a non-demo provider, 30+ day retention, an encryption key reference, last backup evidence, a passed restore drill within 90 days, a restore drill ticket, and verified status. Audit metadata stores posture flags and hashes, not raw backup credentials or secret values.
Owners can open the Finance-style `/settings/file-storage` workspace to configure file storage posture, including object storage provider, bucket, base prefix, KMS reference, allowed MIME types, maximum size, malware scan requirement, signed URL TTL, retention days, and verification evidence. Secrets stay in the provider vault and are not stored in this app. Launch readiness requires non-demo storage, KMS, malware scanning, and a verified smoke-test status. Database-mode storage reads, writes, and upload reservations fail closed instead of silently falling back to demo object storage.
Owners can open the Finance-style `/settings/notifications` workspace to configure in-app, email, LINE, Slack, and Teams notification channels, core approval/payroll/system events, and delivery evidence. External channels default to summary-only payloads, and delivery records store hashes/status rather than raw sensitive message bodies.
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
pnpm db:supabase:bootstrap-sql > /tmp/hr-one-supabase-bootstrap.sql
pnpm db:supabase:verify-schema -- --project-ref=<supabase-project-ref> --schema=hr_one
pnpm db:supabase:seed-pilot -- --project-ref=<supabase-project-ref> --schema=hr_one --verify-only
pnpm db:supabase:seed-pilot -- --project-ref=<supabase-project-ref> --schema=hr_one --apply
pnpm vercel:create-production-env-draft
pnpm vercel:refresh-production-env-draft -- --env-file=.env.vercel.production --restore-tested-at=2026-06-17
printf '%s' "$SUPABASE_TRANSACTION_POOLER_DATABASE_URL" | pnpm vercel:refresh-production-env-draft -- --env-file=.env.vercel.production --database-url-stdin --apply
pnpm vercel:bootstrap-known-env -- --env-file=.env.vercel.production
pnpm vercel:apply-production-env -- --env-file=.env.vercel.production --dry-run
pnpm pilot:doctor -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --project-ref=<supabase-project-ref> --schema=hr_one --env-file=.env.vercel.production
pnpm pilot:acceptance -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --project-ref=<supabase-project-ref> --schema=hr_one --env-file=.env.vercel.production --tenant-slug=<customer-slug>
pnpm pilot:handoff -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --project-ref=<supabase-project-ref> --schema=hr_one --env-file=.env.vercel.production --tenant-slug=<customer-slug> --output=/tmp/hr-one-pilot-handoff.md
pnpm pilot:workflow-readiness -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --project-ref=<supabase-project-ref> --schema=hr_one --env-file=.env.vercel.production --tenant-slug=<customer-slug> --output=/tmp/hr-one-pilot-workflow-readiness.md
pnpm pilot:rollout-kit -- --company-name="<customer-name>" --app-url=https://hr.suiyuecare.com --support-contact="HR 試用窗口" --output=/tmp/hr-one-pilot-rollout-kit.md
pnpm pilot:morning-brief -- --day=1 --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --project-ref=<supabase-project-ref> --schema=hr_one --env-file=.env.vercel.production --tenant-slug=<customer-slug> --output=/tmp/hr-one-pilot-morning-day-1.md
pnpm pilot:daily-status -- --day=1 --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --project-ref=<supabase-project-ref> --schema=hr_one --env-file=.env.vercel.production --tenant-slug=<customer-slug> --output=/tmp/hr-one-pilot-day-1.md
pnpm pilot:import-template-pack -- --output=/tmp/hr-one-pilot-import-template --cohort-size=25 --force
pnpm pilot:import-preflight -- --employee-csv=/secure/customer/employee-import.csv --identity-csv=/secure/customer/identity-import.csv --payroll-csv=/secure/customer/payroll-profile-import.csv --output=/tmp/hr-one-pilot-import-preflight.md
pnpm pilot:customer-import -- --tenant-slug=<customer-slug> --employee-csv=/secure/customer/employee-import.csv --identity-csv=/secure/customer/identity-import.csv --payroll-csv=/secure/customer/payroll-profile-import.csv --output=/tmp/hr-one-pilot-customer-import.md
pnpm pilot:customer-import -- --tenant-slug=<customer-slug> --employee-csv=/secure/customer/employee-import.csv --identity-csv=/secure/customer/identity-import.csv --payroll-csv=/secure/customer/payroll-profile-import.csv --apply --output=/tmp/hr-one-pilot-customer-import-applied.md
pnpm pilot:identity-import -- --tenant-slug=<customer-slug> --csv=/secure/customer/identity-import.csv --output=/tmp/hr-one-pilot-identity-import.md
pnpm pilot:identity-import -- --tenant-slug=<customer-slug> --csv=/secure/customer/identity-import.csv --apply --output=/tmp/hr-one-pilot-identity-import-applied.md
pnpm pilot:invite-readiness -- --tenant-slug=<customer-slug> --output=/tmp/hr-one-pilot-invite-readiness.md
pnpm pilot:go-no-go -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --project-ref=<supabase-project-ref> --schema=hr_one --env-file=.env.vercel.production --tenant-slug=<customer-slug> --employee-csv=/secure/customer/employee-import.csv --identity-csv=/secure/customer/identity-import.csv --payroll-csv=/secure/customer/payroll-profile-import.csv --evidence-path=/tmp/hr-one-pilot-evidence --recursive --output=/tmp/hr-one-pilot-go-no-go.md
pnpm pilot:invitation-release -- --production-database-report=/tmp/hr-one-production-database-gate.md --go-no-go-report=/tmp/hr-one-pilot-go-no-go.md --invite-readiness-report=/tmp/hr-one-pilot-invite-readiness.md --rollout-kit-report=/tmp/hr-one-pilot-rollout-kit.md --output=/tmp/hr-one-pilot-invitation-release.md
pnpm pilot:trial-completion -- --tenant-slug=<customer-slug> --evidence-path=/tmp/hr-one-pilot-evidence --recursive --output=/tmp/hr-one-pilot-completion.md
pnpm pilot:evidence-package -- --path=/tmp/hr-one-pilot-evidence --recursive --output=/tmp/hr-one-pilot-evidence-package.md
pnpm pilot:evidence-scan -- --path=/tmp/hr-one-pilot-evidence --recursive
pnpm release:gate
pnpm release:gate:production -- --tenant-slug=<customer-slug>
```

If PostgreSQL is not running yet, the dashboard pages fall back to non-persistent demo data so role switching and UI smoke tests still work. Once `DATABASE_URL` is set and the database is migrated/seeded, the app reads from PostgreSQL.
For Supabase on Vercel, use a server-side Supavisor Transaction Pooler Postgres connection string with private schema and Prisma pooler parameters, for example host `aws-0-ap-northeast-2.pooler.supabase.com`, port `6543`, username `postgres.aruncclorusswpfnpgsn`, and query params `?pgbouncer=true&connection_limit=1&schema=hr_one`. Do not use the direct `db.<project-ref>.supabase.co:5432` host on Vercel unless the Supabase IPv4 add-on is enabled and `HR_ONE_SUPABASE_IPV4_ADDON_ENABLED=true` is set, and do not use the session pooler on port `5432` for Vercel/serverless runtime traffic. The publishable key is only for browser-safe Supabase APIs and must not be used as a replacement for Prisma's `DATABASE_URL`. The existing Suiyuecare HR Supabase project currently contains an older snake_case HRIS schema, so HR One should be bootstrapped into a clean/private schema or a clean project before Vercel production is pointed at it.

To prepare the current Supabase project safely, generate the private-schema bootstrap SQL and review it before applying:

```bash
pnpm db:supabase:bootstrap-sql -- --schema=hr_one > /tmp/hr-one-supabase-bootstrap.sql
```

The generator creates `hr_one`, revokes browser API roles from the schema/default privileges, strips Prisma's original `public` schema bootstrap line, sets `search_path` to `hr_one`, baselines `_prisma_migrations` with the original migration checksums, and refuses destructive statements such as `DROP`, `TRUNCATE`, or `DELETE FROM`. After the SQL is applied to an empty private schema, configure Vercel production with a server-only Supabase transaction pooler `DATABASE_URL` that includes `pgbouncer=true&connection_limit=1&schema=hr_one`, then run future schema changes through `pnpm exec prisma migrate deploy`, followed by `pnpm db:provision:tenant`, employee/identity/payroll imports, `pnpm db:verify:production -- --tenant-slug=<customer-slug>`, and `pnpm release:gate:production -- --tenant-slug=<customer-slug>`.

After applying the bootstrap SQL, run `pnpm db:supabase:verify-schema -- --project-ref=<supabase-project-ref> --schema=hr_one`. It uses Supabase CLI linked queries to verify the private schema has HR One tables, Prisma migration baseline rows, no accidentally seeded tenant/company/employee data, and no `anon`/`authenticated` schema usage or table privileges. After provisioning a real tenant, add `--allow-tenant-data` so the same verifier still checks the schema and exposure posture without requiring empty tenant tables.

For a safe 20-50 person trial rehearsal in the Suiyuecare Supabase project, use `pnpm db:supabase:seed-pilot -- --project-ref=<supabase-project-ref> --schema=hr_one --apply`. The command writes a synthetic 25-person pilot tenant into the private `hr_one` schema through Supabase CLI linked queries, then verifies the cohort, manager reporting line, RBAC assignments, attendance schedule, leave balances, salary/payment/compliance profile coverage, released payslips, announcement receipts, form workflow, rule versions, telemetry baseline, audit coverage, and browser-role isolation. It prints only aggregate counts; salary amounts, payment hashes, employee details, and private notes are not logged. If Supabase CLI reports IPv6/no-route database reachability, run `supabase link --project-ref=<supabase-project-ref>` or rerun from a network path that can reach the database host before relying on the verification. This pilot seed is for operational rehearsal only and does not replace real customer employee import, SSO setup, Vercel `DATABASE_URL`, backup/restore evidence, or `pnpm db:verify:production`.

For a real customer's HR data collection, use `pnpm pilot:import-template-pack -- --output=/tmp/hr-one-pilot-import-template --cohort-size=25 --force` to generate employee, identity, and payroll profile CSV templates. The generated rows are synthetic placeholders only. HR must replace them from approved source records, run `pnpm pilot:import-preflight -- --employee-csv=<employee.csv> --identity-csv=<identity.csv> --payroll-csv=<payroll.csv>`, then either run the staged UI imports or use `pnpm pilot:customer-import -- --tenant-slug=<customer-slug> --employee-csv=<employee.csv> --identity-csv=<identity.csv> --payroll-csv=<payroll.csv>` as a dry-run before applying. The combined dry-run validates the projected employee cohort, identity/SSO coverage, manager role derivation, and payroll profile rows before employee records are written. After import, run `pnpm pilot:invite-readiness -- --tenant-slug=<customer-slug>` and treat completed payroll/payment CSV plus identity-provider exports as sensitive data.

Before sending the first employee invitation, run `pnpm pilot:rollout-kit -- --company-name=<customer-name> --app-url=https://hr.suiyuecare.com --support-contact=<safe-contact> --output=/tmp/hr-one-pilot-rollout-kit.md`, then run `pnpm pilot:go-no-go -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --project-ref=<supabase-project-ref> --schema=hr_one --env-file=.env.vercel.production --tenant-slug=<customer-slug> --employee-csv=<employee.csv> --identity-csv=<identity.csv> --payroll-csv=<payroll.csv> --evidence-path=<pilot-evidence-folder> --recursive --output=/tmp/hr-one-pilot-go-no-go.md`. The go/no-go report combines production database gate, production acceptance, Day 0 status, import preflight, invite readiness, core workflow readiness, and evidence privacy scanning into one redacted start/stop decision. It also reports whether each core workflow is production-ready or only rehearsed so HR does not miss production evidence work. Any warning is a no-go for real employee invitations; `--skip-production-database`, `--skip-import-preflight`, `--skip-invite-readiness`, `--skip-workflow-readiness`, and `--skip-evidence-scan` are diagnostic only and cannot approve a real trial. Then run `pnpm pilot:invitation-release -- --production-database-report=<production-database.md> --go-no-go-report=<go-no-go.md> --invite-readiness-report=<invite-readiness.md> --rollout-kit-report=<rollout-kit.md> --output=<invitation-release.md>` and send the first invitation only when it returns `released`.

During the two-week pilot, use the approved rollout kit or `/settings/company-setup` to publish the Day 1 receipt-required announcement, then use `pnpm pilot:morning-brief -- --day=<0-14> ... --tenant-slug=<customer-slug>` before the daily standup and `pnpm pilot:daily-status -- --day=<0-14> ... --tenant-slug=<customer-slug>` as the daily operating gate. Day 0 checks preflight, Day 1 checks employee rollout and announcements, Day 3 checks leave and manager approvals, Day 7 checks payroll rehearsal and payslip access, and Day 14 checks final review. Run `pnpm pilot:workflow-readiness -- --require-production-evidence ... --tenant-slug=<customer-slug>` after Day 3 and Day 7 evidence is recorded; it must reach `production_ready` before the pilot is called successful. These reports are redacted and should contain only aggregate or hash-only evidence references. Before sharing the pilot folder, run `pnpm pilot:evidence-scan -- --path=<pilot-evidence-folder> --recursive`; it fails when it detects database URLs, bearer tokens, Supabase secret keys, private keys, raw `DATABASE_URL`, labeled national IDs, bank accounts, salary amounts, or health data, and it reports only category counts without echoing matched values. After Day 14, run `pnpm pilot:trial-completion -- --tenant-slug=<customer-slug> --evidence-path=<pilot-evidence-folder> --recursive` to prove the trial completed required workflows and KPI/safety checks before calling it successful, then run `pnpm pilot:evidence-package -- --path=<pilot-evidence-folder> --recursive` to verify the final folder contains every required redacted report and hash-only handoff artifact. Any warning keeps the completion report blocked; `--skip-evidence-scan` is diagnostic only and cannot approve final handoff.

To connect Vercel production to Supabase, run `pnpm vercel:create-production-env-draft` to create a gitignored `.env.vercel.production` draft with generated local secrets, then replace every `REPLACE_WITH_*` placeholder with real production values. At minimum this requires the server-side Supabase transaction pooler `DATABASE_URL` with `pgbouncer=true&connection_limit=1&schema=hr_one`, production OIDC issuer/login/JWKS details, and real backup/restore drill evidence.

Before the operator-managed values are available, `pnpm vercel:refresh-production-env-draft -- --env-file=.env.vercel.production` can repair known non-secret draft values such as app URL, Vercel project ID, Supabase public URL/key, Supabase Auth issuer/login/JWKS, rate-limit posture, and backup retention while preserving `DATABASE_URL`, generated secrets, vault refs, and restore-drill evidence. When a real restore drill has already been recorded, pass `--restore-tested-at=YYYY-MM-DD` to update only `HR_ONE_BACKUP_RESTORE_TESTED_AT` as well. When the Supabase transaction pooler URL is ready, pipe it through stdin with `--database-url-stdin --apply`; the tool validates `schema=hr_one`, transaction pooler port `6543`, `pgbouncer=true`, and `connection_limit=1` before writing, and it never prints the URL. For the direct-host path, pass `--supabase-ipv4-addon-enabled` only after the Supabase IPv4 add-on is actually enabled. The refresh command defaults to dry-run; pass `--apply` only to update the local gitignored draft. Then `pnpm vercel:bootstrap-known-env -- --env-file=.env.vercel.production` can dry-run a safe subset of known Production variables and generated secrets. It skips `DATABASE_URL`, vault references, and restore-drill evidence, and prints only key names plus sensitivity type. Pass `--apply` only when you intentionally want those known values written to Vercel; a later production deployment is still blocked until the operator-managed values are configured.

After all real values are filled, run `pnpm vercel:apply-production-env -- --env-file=.env.vercel.production --dry-run`. The script runs the production environment verifier before it writes anything. When the dry run passes, rerun without `--dry-run`; by default it uses `VERCEL_TOKEN` with Vercel's `/v10/projects/<project>/env` API when a token is present, otherwise it uses the logged-in Vercel CLI session (`pnpm dlx vercel@latest env add`). You can force either path with `--method=api` or `--method=cli`. Secret-like values are marked as sensitive and CLI writes pass values through stdin so database URLs and secrets are not printed in command arguments. Vercel applies environment variable changes only to new deployments, so trigger a new production deployment after the env write succeeds. The Vercel Production env cutover preflight on `/settings/production-database` should move from `待補 env` to `可寫入`, then to `待重部署`, and finally `已驗證` only after the live readiness endpoint passes.

`pnpm db:verify` validates the demo seed foundation. `pnpm db:verify:production -- --tenant-slug=<customer-slug>` is the launch gate for a real customer tenant; it requires non-demo tenant/company identity, verified commercial subscription terms, assigned owner/hr_admin/manager/employee roles, production SSO metadata, stable SSO issuer/subject bindings for privileged users, non-default email domains, verified object storage with KMS and malware scanning, verified operational resilience settings with encrypted backup retention and a recent passed restore drill, verified payroll payment token vault/KMS/customer bank format posture, external summary-only notifications, approved annual Taiwan holiday/makeup-workday calendar review, active and reviewed Taiwan statutory leave policies, approved work rules/employee handbook acknowledgement coverage, complete and verified labor roster profiles for every active employee, approved AI policy sources for sourced Copilot answers, approved Taiwan rule change control, passing validation evidence for every active rule version, executable Taiwan rule-engine checks for minimum wage, working time, overtime, and annual leave, fresh official source review evidence for active rule versions, complete 11/11 Taiwan compliance coverage for minimum wage, working time, overtime, rest/holidays, annual leave, statutory leave, termination, insurance onboarding, statutory payroll, income tax, and filing/archive controls, no pending payroll recalculation requirement, no unapproved active support access grants, no expired support access grants still marked approved, current salary/payment/compliance/statutory-insurance profile coverage for every active employee, completed or waived offboarding tasks for every termination event, no payroll compliance override below the configured labor insurance/NHI/labor pension salary grade tables, categorized audit evidence for employee import plus salary, payment, payroll compliance, payroll-profile import, and labor roster profile events, and KPI telemetry baseline. `pnpm release:gate:production -- --tenant-slug=<customer-slug>` wraps this production database gate with schema validation, typecheck, lint, unit tests, E2E smoke tests, and production build so release approval cannot skip app-level checks.

`pnpm db:provision:tenant` creates only the customer foundation. It intentionally does not create fake employees, fake salaries, fake payment destinations, or fake KPI telemetry. Pass `--owner-external-subject` with the IdP's immutable user subject when available; otherwise the CLI falls back to the owner email for the initial binding. After provisioning, HR must import real organization data, configure employee salary/payment/compliance profiles manually or through `/hr/payroll-profile-import`, run workflow smoke tests, verify storage smoke-test evidence from `/settings`, then run the production verification command.

Use `/hr/onboarding-readiness` after provisioning and employee import. It shows exactly which active employees are missing salary, payment, or explicit payroll compliance profiles, plus department/manager, time setup, and Taiwan rule-version blockers that would cause `pnpm db:verify:production` to fail.

## CI and Release Gates

- `.github/workflows/ci.yml` runs Prisma schema validation, typecheck, lint, unit tests, and production build on pull requests and `main`.
- `.github/workflows/e2e-smoke.yml` runs Playwright smoke tests on UI/server workflow changes and can be manually triggered before release.
- `.github/workflows/production-release-gate.yml` is manual-only. Configure the `HR_ONE_PRODUCTION_DATABASE_URL` repository secret, then run it with the customer `tenant_slug` and optional `company_id`.
- Production release verification requires these GitHub secrets: `HR_ONE_PRODUCTION_DATABASE_URL`, `HR_ONE_SESSION_SECRET`, `HR_ONE_ENCRYPTION_KEY`, `HR_ONE_AUDIT_LOG_SIGNING_KEY`, `HR_ONE_OBJECT_STORAGE_SECRET_REF`, `HR_ONE_RATE_LIMIT_SECRET_REF`, `HR_ONE_BACKUP_ENCRYPTION_KEY_REF`, and optionally `HR_ONE_AI_SECRET_REF` when an AI provider is enabled. If `HR_ONE_RATE_LIMIT_PROVIDER=external_http`, also configure `HR_ONE_RATE_LIMIT_HTTP_TOKEN`.
- Production release verification requires these GitHub variables: `HR_ONE_APP_URL`, `HR_ONE_DEPLOYMENT_TARGET`, `VERCEL_PROJECT_ID`, `HR_ONE_DATABASE_PROVIDER`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `HR_ONE_AUTH_PROVIDER`, `HR_ONE_AUTH_SESSION_SOURCE`, `HR_ONE_AUTH_ISSUER_URL`, `HR_ONE_AUTH_LOGIN_URL`, `HR_ONE_AUTH_AUDIENCE`, `HR_ONE_AUTH_JWKS_URL`, `HR_ONE_AUTH_MAX_TOKEN_AGE_SECONDS`, `HR_ONE_AI_PROVIDER`, `HR_ONE_AI_PROMPT_STORAGE`, `HR_ONE_RATE_LIMIT_ENABLED`, `HR_ONE_RATE_LIMIT_PROVIDER`, `HR_ONE_RATE_LIMIT_WINDOW_SECONDS`, `HR_ONE_RATE_LIMIT_MAX_REQUESTS`, `HR_ONE_BACKUP_ENABLED`, `HR_ONE_BACKUP_RETENTION_DAYS`, and `HR_ONE_BACKUP_RESTORE_TESTED_AT`. If `HR_ONE_RATE_LIMIT_PROVIDER=external_http`, also configure `HR_ONE_RATE_LIMIT_HTTP_ENDPOINT`.
- `pnpm env:verify:production` checks production environment posture without printing secret values. Pass `-- --env-file=.env.vercel.production` to verify the local Vercel env draft before writing it to Vercel. It blocks local/demo database URLs, invalid or placeholder database URLs, Supabase direct database hosts on Vercel unless `HR_ONE_SUPABASE_IPV4_ADDON_ENABLED=true` is explicitly set, Supabase session pooler URLs on Vercel, Supabase transaction pooler URLs missing `pgbouncer=true&connection_limit=1`, non-HTTPS app/auth URLs, unsafe auth login URLs, missing/invalid Vercel project binding when Vercel is selected, missing/invalid Supabase project URL or publishable key when Supabase Postgres is selected, weak placeholder secrets, missing storage secret references, demo auth session sources, missing OIDC audience/token-age settings, enabled AI providers without vault references, raw AI prompt storage, disabled application rate limiting, missing or invalid rate limit posture, missing external HTTP rate limit endpoint/token when that provider is selected, disabled backups, short backup retention, missing backup encryption references, and stale restore drill evidence.
- `pnpm release:gate:production` intentionally runs app quality checks with `DATABASE_URL` cleared so E2E uses demo fallback state; only the environment verification and final production tenant verification command use production deployment context.

## Security Guardrails

- Do not log PII, payroll values, bank account data, national IDs, or health data.
- Product telemetry must store only workflow names, steps, duration, success flags, and redacted metadata; never raw HR request text, salary, bank account, national ID, or health data.
- Use `safeLogFields` or `redactSensitivePayload` for structured logging.
- Sensitive mutations should use a transaction and `writeAuditLog`.
- RBAC starts with `owner`, `hr_admin`, `manager`, and `employee`.
- API routes that read or mutate tenant data should call `requireTenantSession()` before business logic.
- Non-demo API routes must not import the DB client directly; use service modules that scope all DB reads/writes by tenant and company.
- Production SSO uses provider-neutral OIDC JWT verification against configured issuer, audience, JWKS, expiry, issued-at, not-before, and maximum token age. `RS256` and `ES256` signing keys are supported, including Supabase Auth projects that expose asymmetric JWT signing keys through JWKS. When `HR_ONE_AUTH_SESSION_SOURCE=oidc`, guarded API routes accept either an `Authorization: Bearer <token>` header or the encrypted `hrone_oidc_session` HttpOnly cookie. Demo role cookies are only for local/demo flows. Verified tokens identify the tenant/company and external identity; HR One first maps `issuer + subject` through `UserExternalIdentity`, then resolves the active user account and role assignment from its own database before granting access, so IdP role claims cannot self-elevate payroll, HR, or owner permissions. MFA evidence is derived from standard `amr`/`acr` claims and raw tokens are never stored in logs or audit payloads.
- App Router pages use a current-session adapter: local development keeps demo role cookies, while `HR_ONE_AUTH_SESSION_SOURCE=oidc` resolves tenant sessions from the production bearer token or encrypted session cookie and sends unauthenticated visitors to `/auth/required` instead of falling back to demo identities. `/auth/required` only shows the formal login button when `HR_ONE_AUTH_LOGIN_URL` is a safe HTTPS production URL, otherwise it falls back to the built-in Supabase Email magic-link page at `/auth/sign-in`.
- SSO gateways can establish browser sessions by posting a verified OIDC token to `POST /api/auth/session` as `Authorization: Bearer <token>`. The route resolves the tenant user in the database, then sets an encrypted HttpOnly cookie containing only issuer, subject, tenant/company context, MFA evidence, and timestamps. It does not store email, names, salary data, bank accounts, national IDs, or private HR data in the cookie. `DELETE /api/auth/session` clears the cookie.
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
- `docs/BETA_PILOT_RUNBOOK.md`: execution checklist for taking one 20-50 person company through a real two-week pilot.
- `prisma/schema.prisma`: PostgreSQL data model, including salary profiles and payroll compliance profiles.
- `prisma/seed.ts`: demo tenant/company/departments/25-person Beta pilot cohort/roles/rule seed.
- `prisma/provision-tenant.ts`: production customer tenant foundation CLI.
- `prisma/verify.ts`: demo and production database readiness verification CLI.
- `scripts/release-gate.ts`: release gate CLI that runs app quality checks and production tenant verification in sequence.
- `scripts/build-supabase-private-schema-bootstrap.ts`: Supabase private-schema bootstrap SQL generator for deploying HR One into `hr_one` without touching an older `public` HRIS schema.
- `scripts/verify-supabase-private-schema.ts`: Supabase CLI-backed private-schema verifier for table count, Prisma baseline, and browser-role exposure checks.
- `scripts/apply-supabase-pilot-tenant.ts`: Supabase CLI-backed synthetic 25-person pilot tenant seed and verifier for the private `hr_one` schema.
- `scripts/pilot-daily-status.ts`: redacted day 0-14 pilot operating status gate built from the acceptance matrix.
- `scripts/pilot-rollout-kit.ts`: redacted Day 1 employee/manager/HR rollout kit generator for short Chinese onboarding, safe announcement copy, and task-card instructions.
- `scripts/create-pilot-import-template-pack.ts`: synthetic 20-50 person employee/identity/payroll CSV template pack generator for real customer onboarding preparation.
- `scripts/pilot-import-preflight.ts`: redacted employee/identity/payroll CSV preflight before customer pilot import.
- `scripts/pilot-customer-import.ts`: production-only dry-run/apply orchestrator for employee, projected identity/SSO, projected payroll profile import, and invite readiness.
- `scripts/pilot-identity-import.ts`: dry-run/apply CLI for linking active employees to users, employee/manager roles, and SSO subjects without logging raw identities.
- `scripts/pilot-invite-readiness.ts`: aggregate-only invitation readiness gate for linked active users, employee/manager roles, SSO identities, allowed email domains, and department coverage.
- `scripts/vercel-database-url-handoff.ts`: redacted Supabase pooler DATABASE_URL handoff report for the Vercel Production database blocker. It reads the real URL from stdin, validates shape/Prisma pooler params, and outputs only key names, connection posture, and next actions.
- `scripts/pilot-go-no-go.ts`: one-command redacted pilot start/stop gate that aggregates production database, acceptance, Day 0, import preflight, invite readiness, workflow readiness, and evidence scan.
- `scripts/pilot-invitation-release.ts`: final redacted invitation release gate that verifies production database, Go/No-Go, invite readiness, rollout kit, and evidence privacy reports before the first employee invitation.
- `scripts/pilot-trial-completion.ts`: two-week pilot completion gate for checkpoint evidence, KPI status, and evidence privacy scan.
- `scripts/pilot-evidence-package.ts`: final evidence folder gate that requires redacted production database, Go/No-Go, invitation release, Day 0/1/3/7/14, completion, audit evidence, and handoff artifacts before sharing.
- `scripts/pilot-evidence-scan.ts`: scans pilot reports/evidence files for sensitive values without printing matched secrets or PII.
- `scripts/apply-vercel-production-env.ts`: Vercel production env writer that validates `.env.vercel.production` before creating project env variables.
- `scripts/bootstrap-vercel-known-production-env.ts`: dry-run/apply helper for known safe Vercel Production env values before operator-managed secrets are available.
- `src/server/provisioning/tenant.ts`: customer tenant provisioning service and validation rules.
- `src/server/onboarding/readiness.ts`: HR onboarding completeness checks before production tenant verification.
- `src/server/readiness/health.ts`: liveness/readiness health report service used by operational probe endpoints.
- `src/server/readiness/operational-resilience.ts`: backup, retention, restore drill, RTO/RPO, verification, and audit service used by launch readiness.
- `src/server/readiness/pilot-daily-status.ts`: daily trial phase mapping, blocker summary, production-evidence reminders, and privacy guardrails.
- `src/server/readiness/pilot-rollout-kit.ts`: safe rollout announcement and quick-start builder that keeps first-week employee training under 10 minutes and common tasks within three steps.
- `src/server/readiness/pilot-cohort.ts`: aggregate-only real customer cohort reader for pilot acceptance.
- `src/server/readiness/pilot-import-template.ts`: safe synthetic employee, identity, and payroll import template pack builder.
- `src/server/readiness/pilot-import-preflight.ts`: aggregate-only customer CSV preflight for cohort, identity, manager, department, payroll, tax, and template-placeholder readiness.
- `src/server/provisioning/pilot-identity-import.ts`: pilot identity import planner/applicator for user, role, employee link, and OIDC subject setup with redacted audit metadata.
- `src/server/readiness/pilot-invite-readiness.ts`: aggregate-only invite readiness report for 20-50 person pilot login, role, SSO, manager, and department coverage.
- `src/server/readiness/pilot-go-no-go.ts`: pure start/stop decision builder for 20-50 person pilot readiness.
- `src/server/readiness/pilot-trial-completion.ts`: pure completion decision builder for trial checkpoint, KPI, and privacy evidence.
- `src/server/readiness/pilot-evidence-scan.ts`: category-count scanner for DB URLs, tokens, salary, bank, national ID, and health-data leaks in pilot artifacts.
- `src/server/subscriptions/service.ts`: owner-only customer subscription posture, commercial readiness checks, and redacted audit logging.
- `src/server/auth/rbac.ts`: RBAC permissions.
- `src/server/auth/access-management.ts`: owner user invitation, role assignment, account status management, and access audit service.
- `src/server/auth/guards.ts`: shared tenant/session/permission guard for server routes.
- `src/server/auth/tenant-isolation.test.ts`: static tenant isolation regression tests for API guard usage, service-layer DB access, and tenant/company fallback requirements.
- `src/server/security/request-origin.ts`: cross-origin mutation guard used by global API middleware.
- `src/server/security/rate-limit.ts`: application-level API rate limiter used by global middleware as a final abuse-protection boundary.
- `src/server/kpis/hr-one.ts`: HR One winning KPI scorecard definitions and sale-readiness summary.
- `src/server/telemetry/product.ts`: privacy-safe product telemetry service for KPI measurement with DB/demo fallback.
- `src/server/employees/employment-terms.ts`: structured employment terms, Taiwan Article 7 coverage checks, wage-basis hashes, source references, employee acknowledgement, RBAC, audit logs, local demo previews, and database-mode fail-closed behavior for working-condition records.
- `src/server/employees/labor-roster.ts`: Taiwan worker roster completeness, sensitive-field hashes, HR verification, RBAC, audit logs, local demo previews, and database-mode fail-closed behavior for statutory roster records.
- `src/server/attendance/exceptions.ts`: monthly attendance exception queue, safe resolution suggestions, KPI summary, redacted audit logs, and DB/demo fallback.
- `src/server/attendance/signoffs.ts`: employee monthly attendance sign-off, HR coverage tracking, redacted audit logs, and DB/demo fallback.
- `src/server/privacy/governance.ts`: personal data notice settings, employee acknowledgements, data subject request workflow, privacy readiness, RBAC, audit logs, and DB/demo fallback.
- `src/server/work-rules/service.ts`: company work rules/employee handbook versions, HR/legal review readiness, employee acknowledgement evidence, RBAC, audit logs, and DB/demo fallback.
- `src/server/training/compliance.ts`: onboarding training controls, required course assignments, employee completion acknowledgements, readiness scoring, RBAC, audit logs, and DB/demo fallback.
- `src/server/incidents/workplace.ts`: workplace incident settings, confidential employee reporting, HR follow-up workflow, severe incident notification due dates, readiness scoring, RBAC, audit logs, and DB/demo fallback.
- `src/server/insurance/statutory.ts`: Taiwan statutory insurance enrollment/withdrawal evidence, due-date readiness, RBAC, audit logs, local demo previews, and database-mode fail-closed behavior.
- `src/server/auth/policy.ts`: authentication assurance policy for SSO, MFA, allowed email domains, session lifetime, and idle timeout.
- `src/server/auth/oidc.ts`: provider-neutral OIDC JWT verifier for production SSO token validation.
- `src/server/auth/oidc-session.ts`: DB-backed OIDC session resolver that maps verified identity claims to active HR One users, employees, and company role assignments.
- `src/server/notifications/service.ts`: notification channel settings, delivery metadata, payload hashing, and DB/demo fallback.
- `src/server/audit`: redaction and audit foundations.
- `src/server/audit/queries.ts`: audit log query boundary for DB and demo audit trails.
- `src/server/employees/documents.ts`: employee document vault with storage object metadata, self-service visibility, RBAC, audit logs, local demo previews, and database-mode fail-closed behavior for sensitive HR documents.
- `src/server/files/storage.ts`: configurable file storage policy and object reservation abstraction for HR documents and future attachments, with database-mode fail-closed behavior to avoid accidental demo storage use.
- `src/server/employees/imports.ts`: employee CSV import wizard service with validation, RBAC, audit logs, local demo previews, and database-mode fail-closed behavior for employee master-data imports.
- `src/server/employees/lifecycle.ts`: effective-dated employee lifecycle event service with profile updates, Taiwan termination compliance snapshots, RBAC, audit logs, local demo previews, and database-mode fail-closed behavior.
- `src/server/employees/offboarding.ts`: termination offboarding task readiness, redacted evidence hashes, RBAC, audit logs, local demo previews, and database-mode fail-closed behavior for termination close tasks.
- `src/server/attendance/policies.ts`: attendance policy settings for overtime thresholds, punch controls, record retention, RBAC, audit logs, local demo previews, and database-mode fail-closed behavior.
- `src/server/attendance/worktime-compliance.ts`: monthly working-time compliance scanner for daily worktime, weekly regular worktime, monthly overtime, and rest-day cycle risks.
- `src/server/calendar/company-calendar.ts`: company calendar settings and annual Taiwan calendar review readiness for holidays and makeup workdays with RBAC, audit logs, local demo previews, and database-mode fail-closed behavior.
- `src/server/leave/policies.ts`: leave policy settings service with Taiwan leave category metadata, eligibility/pay-rate controls, RBAC, audit logs, balance provisioning, local demo previews, and database-mode fail-closed behavior.
- `src/server/leave/statutory.ts`: Taiwan statutory leave coverage requirements and readiness evaluator used by HR leave settings and production verification.
- `src/server/leave/annual-leave-grants.ts`: annual leave yearly grant batch preview/apply service using Article 38 entitlement tiers with audit logs and notifications.
- `src/server/leave/annual-leave-expiry.ts`: annual leave expiry risk scanner and audited reminder service with DB/demo fallback.
- `src/server/leave/annual-leave-settlements.ts`: HR-reviewed unused annual leave settlement drafts for payroll close with audit logs and DB/demo fallback.
- `src/server/scheduling/shift-templates.ts`: shift template and daily schedule generation service with RBAC, audit logs, and DB/demo fallback.
- `src/server/rules/interfaces.ts`: typed rule registry engine for versioned Taiwan labor checks and payroll/leave calculations.
- `src/server/rules/taiwan-labor-standards.ts`: Taiwan labor standards v1 calculation helpers, work-time/rest-day/holiday validations, and official source references.
- `src/server/rules/settings.ts`: Taiwan labor rule setting read/update service with DB-backed `rule_versions` and demo fallback.
- `src/server/rules/validation.ts`: deterministic Taiwan labor rule fixture validation and legal-source freshness checks used by settings, provisioning, seed data, launch readiness, and production database verification.
- `src/server/settings/security.ts`: company security posture settings with DB persistence, demo mode for local previews, RBAC, and audit logs. Database-mode reads/writes fail closed instead of silently falling back to demo settings.
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
