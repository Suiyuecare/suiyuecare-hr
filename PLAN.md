# HR One PLAN

## 0. Vision

HR One is an AI Native HR Operating System for Taiwan companies. It should unify core HR, attendance, leave, overtime, payroll preparation, approvals, employee self-service, compliance rules, and operational alerts into one simple task-driven product.

The product goal is not to become another feature menu. HR One should feel like an operating layer where employees, managers, HR, and executives only see the tasks, exceptions, approvals, and decisions that matter to them today.

## 1. Product Positioning

### 1.1 Target Market

- Taiwan SMB and mid-market companies that need local labor-law awareness, payroll preparation, attendance workflows, and employee self-service.
- Companies moving from spreadsheets, fragmented punch-clock tools, or legacy HR systems.
- Companies that need HR workflows to support multiple legal entities, departments, locations, shifts, and approval policies.

### 1.2 Product Thesis

HR One is an AI Native HR Operating System:

- Task-first: every role starts from pending work, exceptions, and next actions.
- Compliance-aware: labor rules are versioned and configurable instead of hard-coded.
- Workflow-native: attendance, leave, overtime, missed punches, payroll adjustments, and HR changes all flow through approvals and audit logs.
- Mobile-first for employees: clock in, request leave, check approvals, read payslips, and receive announcements from a PWA.
- AI-assisted but human-controlled: AI can summarize, detect anomalies, draft explanations, and help configure rules, but cannot make high-impact employment decisions automatically.

### 1.3 Competitive References

HR One should learn from the strengths of MAYO Apollo/STAYFUN, SWINGVY, NUEiP, 104企業大師, Radar, and Femas HR:

- MAYO Apollo/STAYFUN: enterprise HR coverage, employee engagement, workflow depth, and mature HR operations.
- SWINGVY: approachable UX, cloud HRIS simplicity, employee self-service, and SME-friendly onboarding.
- NUEiP: Taiwan-local attendance, scheduling, leave, payroll-adjacent workflows, and practical operational fit.
- 104企業大師: recruiting and HR ecosystem awareness, Taiwan market familiarity, and employer-side workflows.
- Radar: modern HR workflow orientation, process visibility, and data-driven management experience.
- Femas HR: local HR/payroll domain depth, enterprise configuration, and compliance-oriented operations.

HR One's differentiation:

- Simpler UX: users see work queues and guided flows, not modules.
- Stronger AI-native operations: AI assists HR exception handling, policy lookup, anomaly detection, and employee Q&A with strict governance.
- Rule-versioned legal model: labor-law and company-policy rules are data-managed through `law_rules` and `rule_versions`.
- Audit-first architecture: sensitive changes are traceable from day one.

## 2. Core Roles And Experience

### 2.1 Roles

- Employee: handles personal attendance, leave, overtime, missed punches, payslips, profile checks, announcements, and pending tasks.
- Manager: approves team leave, overtime, missed punches, shift changes, profile changes, and reviews team exceptions.
- HR Admin: manages employee records, organizations, attendance closing, payroll preparation, rule versions, approvals, notices, and exceptions.
- Payroll Admin: prepares payroll calculations, verifies adjustments, publishes payslips, and reviews payroll audit trails.
- Company Admin: manages tenant settings, users, roles, integrations, locations, and security settings.
- Executive/Owner: sees business-level HR health, headcount, labor cost preview, exceptions, and monthly closing status.
- System Admin: operates the SaaS platform, tenant provisioning, support access controls, and system health.

### 2.2 UX Principle By Role

- Employee: mobile-first daily tasks.
- Manager: one approval Inbox for everything.
- HR: monthly closing and exception resolution dashboard.
- Payroll: calculation, review, lock, publish.
- Owner: concise operational summary and risk indicators.
- Admin: configuration wizards, not dense settings tables.

## 3. MVP Scope

### 3.1 In Scope

- Multi-tenant tenant/company model.
- Login, sessions, RBAC, and ABAC permission checks.
- Employee master data and organization structure.
- Employee mobile-first home page.
- Attendance clock-in and clock-out.
- Work schedules and shift assignments.
- Leave request and leave balance tracking.
- Overtime request and approval.
- Missed punch correction request.
- Unified approval Inbox.
- Payroll calculation preview.
- Payslip publication and employee payslip view.
- Announcements and notifications.
- Audit logs for sensitive changes.
- `law_rules` and `rule_versions` rule-engine foundation.

### 3.2 Explicitly Out Of MVP

- Full recruiting ATS.
- Performance management scoring.
- Learning management.
- Expense reimbursement.
- Benefits marketplace.
- Advanced workforce analytics.
- Complex multi-country payroll.
- Bank transfer file generation.
- Tax filing automation.
- Native iOS/Android apps.
- AI decision automation for hiring, firing, performance rating, or compensation.

### 3.3 MVP Success Criteria

- A Taiwan company can onboard employees and departments.
- Employees can clock in/out, request leave, request overtime, and view payslips from mobile.
- Managers can approve all request types from one Inbox.
- HR can close monthly attendance exceptions and run payroll preview.
- Payroll Admin can publish payslips.
- Sensitive changes are permission-gated and auditable.
- Law and company-policy rules are versioned and testable.

## 4. Technical Architecture

### 4.1 Stack

- Language: TypeScript full-stack.
- Frontend: Next.js App Router.
- Backend: Node.js through Next.js route handlers or a separate Node service if the domain grows.
- Database: PostgreSQL.
- ORM: Prisma or Drizzle.
- Auth: secure session-based auth with optional SSO later.
- Tests: Playwright E2E, unit tests for rule engine and payroll calculations.
- Mobile: PWA, responsive, employee-first.
- Background jobs: queue worker for notification delivery, payroll recalculation, audit export, and scheduled checks.
- File storage: object storage for payslip PDFs and imported files, with strict access control.

### 4.2 ORM Recommendation

Start with Prisma if the team values:

- Faster onboarding.
- Mature schema migrations.
- Strong model readability.
- Good developer ergonomics for CRUD-heavy HRIS work.

Consider Drizzle if the team values:

- SQL-first control.
- Lower abstraction overhead.
- Strong type inference close to SQL.
- More explicit complex query ownership.

MVP recommendation: Prisma, unless the team already prefers SQL-first development. The schema is large and relation-heavy, so readability and migration ergonomics are important early.

### 4.3 Suggested Application Structure

- `apps/web`: Next.js frontend and route handlers.
- `packages/db`: ORM schema, database client, migrations.
- `packages/auth`: auth helpers, permission checks, session policy.
- `packages/rules`: law rule engine, version evaluation, test fixtures.
- `packages/payroll`: payroll calculation and payslip generation logic.
- `packages/audit`: audit event helpers and redaction utilities.
- `packages/ui`: shared UI components.
- `tests/e2e`: Playwright tests.

### 4.4 Core Architecture Principles

- Tenant isolation is mandatory in every query.
- Sensitive data access requires explicit permission checks.
- Business rules are evaluated through versioned rule records.
- Payroll and attendance calculation code must be deterministic and unit-tested.
- Logs must use redaction and must never include personal identifiers, salary values, bank accounts, or national ID numbers.
- All sensitive writes must produce audit events in the same transaction whenever possible.

## 5. Security And Compliance Constraints

### 5.1 Logging

Never output these values in application logs, job logs, analytics, or error traces:

- Personal identity data.
- National ID number.
- Passport or ARC number.
- Salary, wage, bonus, deduction, and payroll totals.
- Bank account number.
- Home address.
- Personal phone number or email where avoidable.
- Full payslip content.
- Raw uploaded payroll or employee import files.

Use structured logs with stable internal IDs only:

- `tenant_id`
- `company_id`
- `actor_user_id`
- `request_id`
- `entity_type`
- `entity_id`
- `event_type`
- `status`

### 5.2 Data Access

- Enforce RBAC for coarse-grained role access.
- Enforce ABAC for company, department, team, location, employment status, data sensitivity, and self-access rules.
- Use deny-by-default permission checks.
- Restrict support/admin impersonation with explicit approval, expiry, and audit logs.
- Encrypt sensitive fields at rest where practical.
- Apply database backups, retention, and restore drills.

### 5.3 Audit Requirements

Every create/update/delete or publish action touching these areas must write `audit_logs`:

- Employee master data.
- Employment status and job assignment.
- Organization structure.
- Attendance records.
- Leave requests and balances.
- Overtime requests and calculations.
- Missed punch requests.
- Payroll runs and payroll items.
- Payslip publication and viewing metadata.
- Permission, role, and approval policy changes.
- Law rule and rule version changes.

### 5.4 Law Rule Governance

- Labor-law and company-policy rules must not be hard-coded in business flows.
- Rules are stored as `law_rules` and versioned as `rule_versions`.
- Rule versions need effective dates, status, author, approver, and audit logs.
- Calculations must record which rule version was used.
- Rule changes must be testable with fixtures before activation.

### 5.5 AI Governance

AI can:

- Summarize HR policies and approval context.
- Explain attendance or payroll calculation results.
- Detect anomalies for human review.
- Draft announcements or employee responses.
- Help HR configure rules with validation.

AI cannot automatically:

- Reject job applicants.
- Score employee performance.
- Decide layoffs or disciplinary actions.
- Decide compensation, salary increases, bonuses, or deductions.
- Override approvals or legal rules.

All AI outputs affecting employment or payroll decisions must be advisory, explainable, logged as AI-assisted, and confirmed by an authorized human.

## 6. UX Principles

### 6.1 Universal UX Rules

- Each user sees only relevant tasks, exceptions, and summaries.
- Primary tasks should be completed within three steps.
- Avoid module-first navigation for daily workflows.
- Prefer guided flows, defaults, and inline validation.
- Use plain Chinese labels suitable for Taiwan HR operations.
- Every destructive or sensitive action requires confirmation and audit context.
- Complex settings need wizard flows.

### 6.2 Employee Mobile UX

Employee home should show:

- Clock-in/out action.
- Today's shift and attendance status.
- Pending requests and approvals.
- Leave balance summary.
- Latest announcements.
- Payslip availability.

Priority actions:

- Clock in/out.
- Request leave.
- Request overtime.
- Request missed punch correction.
- View payslip.
- Read announcement.

### 6.3 Manager UX

Manager home should focus on:

- Unified approval Inbox.
- Team attendance exceptions.
- Upcoming absences.
- Overtime risk or pending approvals.

Managers should not need to visit separate pages for leave, overtime, and missed punch approvals.

### 6.4 HR UX

HR home should be a monthly operations cockpit:

- Attendance close progress.
- Missing punches.
- Leave balance anomalies.
- Overtime pending and overtime limit warnings.
- Payroll preview readiness.
- Rule version changes.
- Employee data changes awaiting review.

It should not be a feature directory.

### 6.5 Settings UX

Use wizards for:

- Company setup.
- Location and clock-in rules.
- Department and reporting-line setup.
- Shift and schedule templates.
- Leave policy setup.
- Overtime policy setup.
- Approval flow setup.
- Payroll item setup.
- Rule version activation.

## 7. Data Model Design

### 7.1 Tenant And Company

#### `tenants`

- `id`
- `name`
- `slug`
- `status`
- `plan`
- `created_at`
- `updated_at`

#### `companies`

- `id`
- `tenant_id`
- `name`
- `tax_id`
- `legal_name`
- `timezone`
- `currency`
- `status`
- `created_at`
- `updated_at`

#### `company_settings`

- `id`
- `tenant_id`
- `company_id`
- `key`
- `value_json`
- `created_at`
- `updated_at`

### 7.2 Auth And Permissions

#### `users`

- `id`
- `tenant_id`
- `email`
- `phone`
- `password_hash`
- `status`
- `last_login_at`
- `created_at`
- `updated_at`

#### `user_identities`

- `id`
- `tenant_id`
- `user_id`
- `provider`
- `provider_subject`
- `created_at`

#### `roles`

- `id`
- `tenant_id`
- `key`
- `name`
- `description`
- `created_at`
- `updated_at`

#### `permissions`

- `id`
- `key`
- `resource`
- `action`
- `description`

#### `role_permissions`

- `id`
- `tenant_id`
- `role_id`
- `permission_id`

#### `user_roles`

- `id`
- `tenant_id`
- `company_id`
- `user_id`
- `role_id`
- `scope_type`
- `scope_id`
- `created_at`

#### `access_policies`

- `id`
- `tenant_id`
- `company_id`
- `name`
- `resource`
- `action`
- `conditions_json`
- `status`
- `created_at`
- `updated_at`

### 7.3 Employees And Organization

#### `employees`

- `id`
- `tenant_id`
- `company_id`
- `user_id`
- `employee_no`
- `display_name`
- `legal_name_encrypted`
- `national_id_encrypted`
- `birth_date_encrypted`
- `personal_email_encrypted`
- `personal_phone_encrypted`
- `address_encrypted`
- `employment_status`
- `hire_date`
- `termination_date`
- `created_at`
- `updated_at`

#### `employee_profiles`

- `id`
- `tenant_id`
- `company_id`
- `employee_id`
- `emergency_contact_encrypted`
- `bank_account_encrypted`
- `tax_info_encrypted`
- `metadata_json`
- `created_at`
- `updated_at`

#### `departments`

- `id`
- `tenant_id`
- `company_id`
- `parent_department_id`
- `name`
- `code`
- `status`
- `created_at`
- `updated_at`

#### `positions`

- `id`
- `tenant_id`
- `company_id`
- `name`
- `level`
- `status`
- `created_at`
- `updated_at`

#### `employee_assignments`

- `id`
- `tenant_id`
- `company_id`
- `employee_id`
- `department_id`
- `position_id`
- `manager_employee_id`
- `location_id`
- `effective_from`
- `effective_to`
- `is_primary`
- `created_at`
- `updated_at`

#### `locations`

- `id`
- `tenant_id`
- `company_id`
- `name`
- `address_encrypted`
- `timezone`
- `geo_policy_json`
- `status`
- `created_at`
- `updated_at`

### 7.4 Attendance And Scheduling

#### `shift_templates`

- `id`
- `tenant_id`
- `company_id`
- `name`
- `start_time`
- `end_time`
- `break_minutes`
- `cross_day`
- `grace_policy_json`
- `created_at`
- `updated_at`

#### `work_schedules`

- `id`
- `tenant_id`
- `company_id`
- `employee_id`
- `work_date`
- `shift_template_id`
- `scheduled_start_at`
- `scheduled_end_at`
- `status`
- `source`
- `created_at`
- `updated_at`

#### `attendance_records`

- `id`
- `tenant_id`
- `company_id`
- `employee_id`
- `work_schedule_id`
- `work_date`
- `clock_in_at`
- `clock_out_at`
- `clock_in_source`
- `clock_out_source`
- `clock_in_location_json`
- `clock_out_location_json`
- `status`
- `rule_version_id`
- `created_at`
- `updated_at`

#### `clock_events`

- `id`
- `tenant_id`
- `company_id`
- `employee_id`
- `event_type`
- `event_at`
- `source`
- `device_id`
- `location_json`
- `ip_hash`
- `created_at`

#### `attendance_exceptions`

- `id`
- `tenant_id`
- `company_id`
- `employee_id`
- `attendance_record_id`
- `exception_type`
- `severity`
- `status`
- `detected_at`
- `resolved_at`
- `created_at`
- `updated_at`

### 7.5 Leave, Overtime, And Missed Punch

#### `leave_types`

- `id`
- `tenant_id`
- `company_id`
- `name`
- `code`
- `unit`
- `paid`
- `rule_version_id`
- `status`
- `created_at`
- `updated_at`

#### `leave_balances`

- `id`
- `tenant_id`
- `company_id`
- `employee_id`
- `leave_type_id`
- `period_start`
- `period_end`
- `granted_units`
- `used_units`
- `pending_units`
- `remaining_units`
- `rule_version_id`
- `updated_at`

#### `leave_requests`

- `id`
- `tenant_id`
- `company_id`
- `employee_id`
- `leave_type_id`
- `start_at`
- `end_at`
- `units`
- `reason`
- `status`
- `approval_instance_id`
- `rule_version_id`
- `created_at`
- `updated_at`

#### `overtime_requests`

- `id`
- `tenant_id`
- `company_id`
- `employee_id`
- `work_date`
- `start_at`
- `end_at`
- `minutes`
- `reason`
- `status`
- `approval_instance_id`
- `rule_version_id`
- `created_at`
- `updated_at`

#### `missed_punch_requests`

- `id`
- `tenant_id`
- `company_id`
- `employee_id`
- `attendance_record_id`
- `requested_clock_in_at`
- `requested_clock_out_at`
- `reason`
- `status`
- `approval_instance_id`
- `created_at`
- `updated_at`

### 7.6 Approval Workflow

#### `approval_policies`

- `id`
- `tenant_id`
- `company_id`
- `name`
- `request_type`
- `conditions_json`
- `status`
- `created_at`
- `updated_at`

#### `approval_steps`

- `id`
- `tenant_id`
- `approval_policy_id`
- `step_order`
- `approver_type`
- `approver_ref`
- `required_action`
- `created_at`

#### `approval_instances`

- `id`
- `tenant_id`
- `company_id`
- `request_type`
- `request_id`
- `status`
- `current_step_order`
- `created_by_employee_id`
- `created_at`
- `updated_at`

#### `approval_tasks`

- `id`
- `tenant_id`
- `company_id`
- `approval_instance_id`
- `approver_employee_id`
- `status`
- `due_at`
- `acted_at`
- `created_at`
- `updated_at`

#### `approval_actions`

- `id`
- `tenant_id`
- `company_id`
- `approval_instance_id`
- `approval_task_id`
- `actor_employee_id`
- `action`
- `comment`
- `created_at`

### 7.7 Payroll

#### `payroll_periods`

- `id`
- `tenant_id`
- `company_id`
- `period_start`
- `period_end`
- `pay_date`
- `status`
- `locked_at`
- `created_at`
- `updated_at`

#### `payroll_runs`

- `id`
- `tenant_id`
- `company_id`
- `payroll_period_id`
- `run_type`
- `status`
- `rule_version_id`
- `created_by_user_id`
- `created_at`
- `updated_at`

#### `payroll_items`

- `id`
- `tenant_id`
- `company_id`
- `payroll_run_id`
- `employee_id`
- `item_type`
- `code`
- `name`
- `amount_encrypted`
- `quantity`
- `metadata_json`
- `rule_version_id`
- `created_at`

#### `payroll_summaries`

- `id`
- `tenant_id`
- `company_id`
- `payroll_run_id`
- `employee_id`
- `gross_pay_encrypted`
- `deductions_encrypted`
- `net_pay_encrypted`
- `status`
- `created_at`
- `updated_at`

#### `payslips`

- `id`
- `tenant_id`
- `company_id`
- `payroll_run_id`
- `employee_id`
- `storage_key`
- `status`
- `published_at`
- `viewed_at`
- `created_at`
- `updated_at`

### 7.8 Announcements And Notifications

#### `announcements`

- `id`
- `tenant_id`
- `company_id`
- `title`
- `body`
- `audience_json`
- `status`
- `published_at`
- `created_by_user_id`
- `created_at`
- `updated_at`

#### `announcement_reads`

- `id`
- `tenant_id`
- `company_id`
- `announcement_id`
- `employee_id`
- `read_at`

#### `notifications`

- `id`
- `tenant_id`
- `company_id`
- `recipient_user_id`
- `type`
- `title`
- `body`
- `link_url`
- `status`
- `sent_at`
- `read_at`
- `created_at`

### 7.9 Rules And Audit

#### `law_rules`

- `id`
- `tenant_id`
- `company_id`
- `jurisdiction`
- `rule_key`
- `name`
- `description`
- `category`
- `status`
- `created_at`
- `updated_at`

#### `rule_versions`

- `id`
- `tenant_id`
- `company_id`
- `law_rule_id`
- `version`
- `effective_from`
- `effective_to`
- `definition_json`
- `test_cases_json`
- `status`
- `authored_by_user_id`
- `approved_by_user_id`
- `approved_at`
- `created_at`
- `updated_at`

#### `rule_evaluation_logs`

- `id`
- `tenant_id`
- `company_id`
- `rule_version_id`
- `entity_type`
- `entity_id`
- `input_hash`
- `result_json`
- `evaluated_at`

#### `audit_logs`

- `id`
- `tenant_id`
- `company_id`
- `actor_user_id`
- `actor_employee_id`
- `action`
- `entity_type`
- `entity_id`
- `before_hash`
- `after_hash`
- `metadata_json`
- `ip_hash`
- `user_agent_hash`
- `created_at`

## 8. API Design

### 8.1 API Principles

- Every endpoint must resolve `tenant_id` from trusted session or tenant context.
- Never trust tenant/company IDs from the client without permission validation.
- Return redacted DTOs by default.
- Sensitive API responses require explicit permission scopes.
- Mutations touching sensitive data must write audit logs.
- Payroll and rule calculations should expose explainable result objects without leaking sensitive values to logs.

### 8.2 Auth

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `POST /api/auth/password/forgot`
- `POST /api/auth/password/reset`

### 8.3 Tenant And Company

- `GET /api/companies/current`
- `PATCH /api/companies/current`
- `GET /api/company-settings`
- `PATCH /api/company-settings/:key`

### 8.4 Employees And Organization

- `GET /api/employees`
- `POST /api/employees`
- `GET /api/employees/:employeeId`
- `PATCH /api/employees/:employeeId`
- `GET /api/employees/:employeeId/profile`
- `PATCH /api/employees/:employeeId/profile`
- `GET /api/departments`
- `POST /api/departments`
- `PATCH /api/departments/:departmentId`
- `GET /api/organization/tree`
- `GET /api/positions`
- `POST /api/positions`
- `PATCH /api/positions/:positionId`
- `POST /api/employee-assignments`
- `PATCH /api/employee-assignments/:assignmentId`

### 8.5 Employee Home

- `GET /api/me/home`
- `GET /api/me/tasks`
- `GET /api/me/profile`
- `GET /api/me/attendance/today`
- `GET /api/me/leave-balances`
- `GET /api/me/payslips`

### 8.6 Attendance And Scheduling

- `GET /api/schedules`
- `POST /api/schedules`
- `PATCH /api/schedules/:scheduleId`
- `POST /api/attendance/clock-in`
- `POST /api/attendance/clock-out`
- `GET /api/attendance/records`
- `GET /api/attendance/records/:recordId`
- `GET /api/attendance/exceptions`
- `PATCH /api/attendance/exceptions/:exceptionId/resolve`

### 8.7 Leave, Overtime, Missed Punch

- `GET /api/leave-types`
- `POST /api/leave-requests`
- `GET /api/leave-requests`
- `GET /api/leave-requests/:requestId`
- `POST /api/overtime-requests`
- `GET /api/overtime-requests`
- `GET /api/overtime-requests/:requestId`
- `POST /api/missed-punch-requests`
- `GET /api/missed-punch-requests`
- `GET /api/missed-punch-requests/:requestId`

### 8.8 Approval Inbox

- `GET /api/approvals/inbox`
- `GET /api/approvals/:approvalInstanceId`
- `POST /api/approvals/:approvalInstanceId/approve`
- `POST /api/approvals/:approvalInstanceId/reject`
- `POST /api/approvals/:approvalInstanceId/request-changes`
- `GET /api/approval-policies`
- `POST /api/approval-policies`
- `PATCH /api/approval-policies/:policyId`

### 8.9 Payroll

- `GET /api/payroll/periods`
- `POST /api/payroll/periods`
- `POST /api/payroll/runs/preview`
- `GET /api/payroll/runs/:runId`
- `POST /api/payroll/runs/:runId/recalculate`
- `POST /api/payroll/runs/:runId/lock`
- `POST /api/payroll/runs/:runId/publish-payslips`
- `GET /api/payroll/runs/:runId/items`
- `GET /api/payslips`
- `GET /api/payslips/:payslipId`

### 8.10 Announcements And Notifications

- `GET /api/announcements`
- `POST /api/announcements`
- `PATCH /api/announcements/:announcementId`
- `POST /api/announcements/:announcementId/publish`
- `POST /api/announcements/:announcementId/read`
- `GET /api/notifications`
- `POST /api/notifications/:notificationId/read`

### 8.11 Rules And Audit

- `GET /api/law-rules`
- `POST /api/law-rules`
- `GET /api/law-rules/:ruleId/versions`
- `POST /api/law-rules/:ruleId/versions`
- `POST /api/rule-versions/:versionId/test`
- `POST /api/rule-versions/:versionId/approve`
- `POST /api/rule-versions/:versionId/activate`
- `GET /api/audit-logs`

## 9. Frontend Page List

### 9.1 Public And Auth

- `/login`
- `/forgot-password`
- `/reset-password`

### 9.2 Employee PWA

- `/app`
- `/app/clock`
- `/app/leave/new`
- `/app/leave`
- `/app/overtime/new`
- `/app/overtime`
- `/app/missed-punch/new`
- `/app/missed-punch`
- `/app/payslips`
- `/app/payslips/[id]`
- `/app/announcements`
- `/app/announcements/[id]`
- `/app/profile`

### 9.3 Manager

- `/manager`
- `/manager/inbox`
- `/manager/inbox/[approvalId]`
- `/manager/team`
- `/manager/team/attendance`
- `/manager/team/calendar`

### 9.4 HR

- `/hr`
- `/hr/month-close`
- `/hr/exceptions`
- `/hr/employees`
- `/hr/employees/new`
- `/hr/employees/[id]`
- `/hr/organization`
- `/hr/schedules`
- `/hr/leave`
- `/hr/overtime`
- `/hr/missed-punch`
- `/hr/announcements`
- `/hr/audit-logs`

### 9.5 Payroll

- `/payroll`
- `/payroll/periods`
- `/payroll/runs/[runId]`
- `/payroll/runs/[runId]/preview`
- `/payroll/runs/[runId]/payslips`

### 9.6 Admin And Settings

- `/settings/company`
- `/settings/users`
- `/settings/roles`
- `/settings/locations`
- `/settings/departments`
- `/settings/shifts`
- `/settings/leave-policies`
- `/settings/overtime-policies`
- `/settings/approval-policies`
- `/settings/payroll-items`
- `/settings/law-rules`
- `/settings/law-rules/[ruleId]`
- `/settings/law-rules/[ruleId]/versions/[versionId]`

## 10. Rule Engine Foundation

### 10.1 Rule Categories

- Attendance grace and lateness.
- Leave eligibility and balance accrual.
- Overtime eligibility and calculation.
- Rest day and holiday handling.
- Payroll item calculation.
- Monthly closing validations.

### 10.2 Rule Version Shape

`rule_versions.definition_json` should describe:

- Inputs required.
- Conditions.
- Calculation formula or decision table.
- Outputs.
- Effective date.
- Validation constraints.
- Human-readable explanation template.

### 10.3 Evaluation Requirements

- Deterministic output for the same input and rule version.
- No external network calls during evaluation.
- Record `rule_version_id` on generated results.
- Store input hash, not raw sensitive input, in `rule_evaluation_logs`.
- Provide test fixtures before activation.

## 11. Payroll MVP Behavior

### 11.1 Payroll Preview

Payroll preview should combine:

- Base salary or wage setting.
- Attendance records.
- Approved leave.
- Approved overtime.
- Missed punch corrections.
- Manual adjustments.
- Rule version outputs.

### 11.2 Payroll Safety

- Preview can be recalculated.
- Locked payroll cannot be modified without unlock permission and audit reason.
- Payslips can only be published from locked payroll runs.
- Employee can only view own payslips.
- HR/Payroll access to payslips requires explicit permission.
- Payroll values must never appear in raw logs.

## 12. Testing Strategy

### 12.1 Unit Tests

Required for:

- Permission checks.
- ABAC policy evaluation.
- Rule engine evaluation.
- Attendance exception detection.
- Leave balance calculations.
- Overtime calculations.
- Payroll item calculations.
- Audit log redaction helpers.

### 12.2 Integration Tests

Required for:

- Tenant isolation in core repositories.
- Sensitive mutation plus audit log transaction.
- Approval workflow state transitions.
- Payroll preview to lock to publish flow.
- Rule version activation.
- Employee self-access boundaries.

### 12.3 Playwright E2E Tests

MVP E2E flows:

- Employee logs in, clocks in, clocks out.
- Employee submits leave request, manager approves from Inbox.
- Employee submits overtime request, manager approves from Inbox.
- Employee submits missed punch request, manager approves from Inbox, attendance record updates.
- HR reviews monthly attendance exceptions.
- Payroll Admin runs preview, locks payroll, publishes payslip.
- Employee views payslip.
- HR creates announcement, employee reads it.
- Unauthorized employee cannot access another employee's payslip or profile.

### 12.4 Security Tests

- Redaction tests for logger.
- Permission denial tests for sensitive fields.
- Tenant boundary tests.
- Audit log required tests for sensitive writes.
- Session expiry and role change tests.

## 13. Development Milestones

### Milestone 0: Foundation

Deliverables:

- Repository scaffold.
- TypeScript, Next.js, database, ORM, lint, formatter, test setup.
- Environment configuration.
- Initial CI checks.
- Basic design system shell.

Done when:

- App boots locally.
- Database migration runs.
- Unit and Playwright test harnesses run.

### Milestone 1: Tenant, Auth, Permissions

Deliverables:

- Tenant and company tables.
- User login and session.
- RBAC tables.
- ABAC policy helper.
- Permission-aware layout routing.
- Audit log base helper.

Done when:

- Users can log in.
- Role-specific navigation renders.
- Protected routes deny unauthorized access.
- Sensitive test mutation writes an audit log.

### Milestone 2: Employee And Organization Core

Deliverables:

- Employee master data.
- Departments, positions, locations.
- Employee assignments and manager relationships.
- HR employee list and detail pages.
- Organization tree.

Done when:

- HR can create employee records.
- Manager relationship powers team visibility.
- Employee sensitive fields are permission-gated and audited.

### Milestone 3: Employee Home And Attendance

Deliverables:

- Employee PWA shell.
- Employee home.
- Clock-in/out.
- Shift templates.
- Work schedules.
- Attendance records.
- Attendance exceptions.

Done when:

- Employee can clock in/out on mobile.
- HR can see attendance exceptions.
- Attendance writes are tenant-scoped and audited.

### Milestone 4: Requests And Unified Approvals

Deliverables:

- Leave types and balances.
- Leave requests.
- Overtime requests.
- Missed punch requests.
- Approval policies.
- Approval Inbox.

Done when:

- Employee can submit leave, overtime, and missed punch requests.
- Manager can approve all request types from one Inbox.
- Approved missed punch updates attendance.

### Milestone 5: Rules Engine MVP

Deliverables:

- `law_rules`.
- `rule_versions`.
- Rule evaluation package.
- Rule test fixtures.
- Rule activation workflow.
- Attendance, leave, and overtime rules integrated at MVP depth.

Done when:

- Rules are versioned and effective-date aware.
- Calculations record `rule_version_id`.
- Rule tests pass before activation.

### Milestone 6: Payroll Preview And Payslips

Deliverables:

- Payroll periods.
- Payroll preview runs.
- Payroll items and summaries.
- Payroll lock.
- Payslip publication.
- Employee payslip view.

Done when:

- Payroll Admin can preview, lock, and publish.
- Employee can view own payslip.
- Payroll values are protected and never logged.

### Milestone 7: Announcements, Notifications, And HR Cockpit

Deliverables:

- Announcements.
- Notification center.
- HR monthly close dashboard.
- Exception workflow.
- Owner summary view.

Done when:

- HR can publish announcements.
- Employees receive/read announcements.
- HR can drive monthly close from dashboard.

### Milestone 8: Hardening And Beta

Deliverables:

- Security review.
- Permission matrix review.
- Tenant isolation test pass.
- Payroll/rule calculation review.
- Playwright critical path coverage.
- Audit export/report view.
- Backup and restore runbook.

Done when:

- MVP is ready for controlled beta with one pilot company.

## 14. Recommended Development Order

1. Create foundation repo and database.
2. Implement tenant/company model.
3. Implement auth/session.
4. Implement RBAC/ABAC permission layer.
5. Implement audit log helper and redaction logger.
6. Build employee and organization schema.
7. Build role-specific app shells.
8. Build employee mobile home.
9. Build attendance clock-in/out.
10. Build schedules and attendance exceptions.
11. Build approval workflow engine.
12. Build leave requests.
13. Build overtime requests.
14. Build missed punch requests.
15. Build rule engine MVP.
16. Integrate rules into attendance, leave, overtime.
17. Build payroll preview.
18. Build payroll lock and payslip publication.
19. Build announcements and notifications.
20. Build HR monthly close cockpit.
21. Add E2E coverage for critical workflows.
22. Security hardening and beta readiness.

## 15. Key Product Flows

### 15.1 Employee Clock-In

1. Employee opens PWA home.
2. System shows today's shift and clock status.
3. Employee taps clock-in or clock-out.
4. System records clock event and updates attendance record.
5. System detects exception if outside policy.

### 15.2 Leave Approval

1. Employee selects leave type and dates.
2. System validates balance and rule version.
3. Employee submits request.
4. Manager receives task in Inbox.
5. Manager approves or rejects.
6. System updates leave balance and audit logs.

### 15.3 Monthly Close

1. HR opens monthly close dashboard.
2. System shows missing punches, unresolved leave/overtime, schedule gaps, and payroll blockers.
3. HR resolves exceptions.
4. Payroll preview becomes available.
5. Payroll Admin runs preview.

### 15.4 Payroll Publication

1. Payroll Admin runs preview.
2. System calculates payroll items using active rule versions.
3. Payroll Admin reviews exceptions and totals.
4. Payroll Admin locks run.
5. Payroll Admin publishes payslips.
6. Employees receive notification and view their payslips.

## 16. Risks And Tradeoffs

### 16.1 Legal Rule Complexity

Risk:

- Taiwan labor rules and company policies can be complex, especially leave, overtime, flexible schedules, holidays, and payroll deductions.

Tradeoff:

- MVP should implement a rule-engine foundation and a limited set of tested rules instead of claiming full compliance automation immediately.

### 16.2 Payroll Accuracy

Risk:

- Payroll mistakes are high-impact and trust-damaging.

Tradeoff:

- Start with payroll preview and payslip publication, not automated bank transfer or tax filing.
- Require human review and lock/publish steps.

### 16.3 UX Simplicity Versus Configuration Depth

Risk:

- HR products become complex because company policies vary.

Tradeoff:

- Keep daily user surfaces task-first.
- Move complexity into guided setup wizards and admin-only configuration.

### 16.4 Multi-Tenant Security

Risk:

- Tenant data leakage is catastrophic.

Tradeoff:

- Add tenant isolation tests early.
- Make tenant scope a required repository and API concept from day one.

### 16.5 AI Governance

Risk:

- AI can create legal, ethical, and trust issues if used for employment decisions.

Tradeoff:

- Position AI as assistant and reviewer only.
- Never automate hiring rejection, performance scoring, layoff, or compensation decisions.

### 16.6 Build Scope

Risk:

- HRIS, attendance, approvals, payroll, and compliance together are broad.

Tradeoff:

- MVP should optimize for one coherent monthly HR/payroll cycle rather than broad feature quantity.

## 17. Initial Permission Matrix

| Resource | Employee | Manager | HR Admin | Payroll Admin | Company Admin | Executive |
| --- | --- | --- | --- | --- | --- | --- |
| Own profile | Read limited | Read limited | Read/write | No default | Read/write | No default |
| Employee sensitive data | Own limited | Team limited | Read/write | Limited payroll-related | Read/write | Aggregated only |
| Clock events | Own create/read | Team read | Read/write | Read | Read | Aggregated |
| Leave requests | Own create/read | Team approve | Read/write | Read | Read | Aggregated |
| Overtime requests | Own create/read | Team approve | Read/write | Read | Read | Aggregated |
| Missed punch | Own create/read | Team approve | Read/write | Read | Read | Aggregated |
| Payroll preview | No | No | Limited | Read/write | Read | Aggregated |
| Payslips | Own read | No | Permissioned | Permissioned | Permissioned | Aggregated only |
| Law rules | No | No | Read/write | Read | Read/write | Read |
| Audit logs | No | No | Read | Read payroll-related | Read | Read summary |

## 18. Definition Of Done For PLAN

This `PLAN.md` is done when it includes:

- Clear product positioning.
- MVP scope.
- Technical architecture.
- Security and compliance constraints.
- UX principles.
- Data table design.
- API design.
- Frontend page list.
- Testing strategy.
- Development milestones.
- Development order.
- Risks and tradeoffs.

