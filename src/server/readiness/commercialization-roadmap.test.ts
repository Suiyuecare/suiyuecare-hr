import { describe, expect, it } from "vitest";
import type { BetaPilotReadinessItem, BetaPilotReadinessReport } from "@/server/readiness/beta-pilot";
import type { BetaPilotTrialWorkspace } from "@/server/readiness/beta-pilot-trial-run";
import type { LaunchReadinessItem, LaunchReadinessReport } from "@/server/readiness/launch";
import { buildSaleReadinessRoadmap } from "./commercialization-roadmap";

describe("sale readiness commercialization roadmap", () => {
  it("keeps production database readiness as the first hard gate", () => {
    const roadmap = buildSaleReadinessRoadmap({
      launchReport: launchReport({
        database: {
          status: "blocked",
          detail: "DATABASE_URL is not configured.",
          nextStep: "Run production database verification.",
          actionLabel: "Open database setup",
          actionHref: "/settings/readiness#database-setup",
        },
      }),
      betaPilot: betaPilotReport(),
      trialWorkspace: trialWorkspace({
        persistence: {
          mode: "production_missing_database",
          readyForLiveTrial: false,
          detail: "Production deployment is missing database persistence.",
        },
      }),
    });

    expect(roadmap.currentStage).toMatchObject({
      id: "production_foundation",
      status: "blocked",
      actionHref: "/settings/readiness#database-setup",
    });
    expect(roadmap.currentStage.nextStep).toContain("Supabase transaction pooler");
    expect(roadmap.summary).toContain("阻擋");
  });

  it("moves the next focus to Finance-style workflows after production foundation is ready", () => {
    const roadmap = buildSaleReadinessRoadmap({
      launchReport: launchReport(),
      betaPilot: betaPilotReport({
        employee_frontstage: {
          status: "action_required",
          nextStep: "Finish mobile task smoke testing.",
          actionLabel: "Open employee frontstage",
          actionHref: "/app",
        },
      }),
      trialWorkspace: trialWorkspace(),
    });

    expect(roadmap.currentStage).toMatchObject({
      id: "finance_style_workflows",
      status: "action_required",
      actionHref: "/app",
    });
    expect(roadmap.currentStage.kpiTarget).toBe("員工手機任務完成率 > 95%");
  });

  it("requires launch, pilot, and trial readiness before marking the system sale-ready", () => {
    const roadmap = buildSaleReadinessRoadmap({
      launchReport: launchReport(),
      betaPilot: betaPilotReport(),
      trialWorkspace: trialWorkspace(),
    });

    expect(roadmap.readyForSale).toBe(true);
    expect(roadmap.stages.every((stage) => stage.status === "ready")).toBe(true);
    expect(JSON.stringify(roadmap)).not.toMatch(/postgresql:\/\/|sb_publishable_|password|銀行帳號|身分證字號/);
  });
});

function launchReport(overrides: Record<string, Partial<LaunchReadinessItem>> = {}): Pick<
  LaunchReadinessReport,
  "readyForSale" | "blockedCount" | "actionRequiredCount" | "items"
> {
  const ids = [
    "database",
    "tenant_seed",
    "security",
    "sso_identities",
    "file_storage",
    "operational_resilience",
    "kpis",
    "notifications",
    "law_rules",
    "calendar",
    "work_rules",
    "labor_roster",
    "payment_security",
    "audit",
    "subscription",
    "support_access",
    "privacy",
  ];
  const items = ids.map((id) => launchItem(id, overrides[id]));
  return {
    readyForSale: items.every((item) => item.status === "ready"),
    blockedCount: items.filter((item) => item.status === "blocked").length,
    actionRequiredCount: items.filter((item) => item.status === "action_required").length,
    items,
  };
}

function launchItem(id: string, override: Partial<LaunchReadinessItem> = {}): LaunchReadinessItem {
  return {
    id,
    area: "Operations",
    title: id,
    status: "ready",
    detail: `${id} ready.`,
    nextStep: `Keep ${id} ready.`,
    actionLabel: `Open ${id}`,
    actionHref: `/settings/${id}`,
    ...override,
  };
}

function betaPilotReport(overrides: Record<string, Partial<BetaPilotReadinessItem>> = {}): Pick<
  BetaPilotReadinessReport,
  "readyForPilot" | "blockedCount" | "actionRequiredCount" | "items" | "targetEmployeeRange"
> {
  const ids = [
    "employee_frontstage",
    "attendance_leave_approval",
    "announcements",
    "hr_self_service",
    "cohort_size",
    "tenant_auth",
    "two_week_operating_loop",
    "sensitive_data_guardrails",
    "payroll_dry_run",
    "payslip_access",
  ];
  const items = ids.map((id) => betaPilotItem(id, overrides[id]));
  return {
    readyForPilot: items.every((item) => item.status === "ready"),
    blockedCount: items.filter((item) => item.status === "blocked").length,
    actionRequiredCount: items.filter((item) => item.status === "action_required").length,
    targetEmployeeRange: { min: 20, max: 50 },
    items,
  };
}

function betaPilotItem(id: string, override: Partial<BetaPilotReadinessItem> = {}): BetaPilotReadinessItem {
  return {
    id,
    area: "HR Ops",
    title: id,
    status: "ready",
    detail: `${id} ready.`,
    nextStep: `Keep ${id} ready.`,
    actionLabel: `Open ${id}`,
    actionHref: `/settings/${id}`,
    ...override,
  };
}

function trialWorkspace(override: Partial<BetaPilotTrialWorkspace> = {}): Pick<
  BetaPilotTrialWorkspace,
  "readyForPilot" | "readinessStatus" | "persistence" | "employeeCount" | "managerCount" | "openBlockedCount" | "openActionRequiredCount"
> {
  return {
    readyForPilot: true,
    readinessStatus: "ready",
    employeeCount: 25,
    managerCount: 2,
    openBlockedCount: 0,
    openActionRequiredCount: 0,
    persistence: {
      mode: "database",
      readyForLiveTrial: true,
      detail: "Database-backed trial evidence is ready.",
    },
    ...override,
  };
}
