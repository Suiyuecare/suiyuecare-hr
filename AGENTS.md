# AGENTS.md

## Product
This repository builds HR One, an AI Native HR Operating System for Taiwan-focused companies.

## Core principles
- Employee UX must be mobile-first and simple.
- Common employee tasks should finish in three steps or fewer.
- Managers use one unified approval Inbox.
- HR dashboard is workflow/status driven, not menu driven.
- Sensitive HR decisions must remain human-reviewed.
- AI may summarize, explain, draft, and detect anomalies, but must not make final hiring, firing, compensation, performance, or disciplinary decisions.

## Engineering rules
- Use TypeScript.
- Keep modules clean and testable.
- Do not duplicate approval logic across modules.
- Use shared workflow engine for approvals.
- Use shared audit log service for sensitive mutations.
- Use shared rule engine for labor/payroll rules.
- Never hardcode labor law rules directly into business logic when they should be configurable/versioned.
- Never log sensitive PII, salary, bank account, national ID, health data, or private employee notes.

## Required checks
Before considering a task done, run:
- typecheck
- lint
- unit tests
- E2E smoke tests when UI flow changed

## Security
- Every endpoint must enforce tenant isolation.
- Server routes that read or mutate tenant data must use the shared `requireTenantSession()` guard or a stricter equivalent.
- Every sensitive record must enforce RBAC/ABAC.
- Salary data is restricted to HR/payroll roles unless explicitly granted.
- All create/update/delete actions on employee, attendance, leave, overtime, payroll, form, workflow, and AI records must write audit logs.

## UX acceptance
- Avoid deep menus.
- Prefer task cards, wizards, and status timelines.
- Use plain language for employees and managers.
- HR advanced settings can be detailed, but must include guided setup.

## Winning KPIs
- New employee first successful leave request: under 60 seconds.
- Manager average leave approval time: under 15 seconds per request.
- HR monthly payroll close time: reduced by 70%.
- Attendance exceptions auto-resolved before month end: above 90%.
- Employee mobile task completion rate: above 95%.
- HR-created forms without engineering support: above 80%.
- Audit log coverage for important data changes: 100%.
- Unauthorized payroll data access test escapes: 0 passing vulnerabilities.
- AI answers with source references: 100%.
- First-week employee training time after rollout: under 10 minutes.

## Done means
- Feature works.
- Permissions are correct.
- Audit logs are written.
- Tests pass.
- Empty/error/loading states exist.
- README or relevant docs updated.
