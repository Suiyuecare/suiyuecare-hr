import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import {
  evaluateIncidentReadiness,
  reportWorkplaceIncident,
  resetIncidentDemoState,
  updateIncidentSettings,
  updateWorkplaceIncident,
} from "./workplace";

const ownerSession = {
  role: "owner" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-owner", displayName: "王執行長" },
  employee: null,
};

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-hr_admin", displayName: "林人資" },
  employee: { id: "demo-hr-employee", displayName: "林人資" },
};

const employeeSession = {
  role: "employee" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-employee", displayName: "張小安" },
  employee: { id: "demo-employee-1", displayName: "張小安" },
};

describe("workplace incidents", () => {
  beforeEach(() => {
    resetIncidentDemoState();
    resetAuditDemoState();
  });

  it("blocks readiness when reporting policy or due follow-up is not ready", () => {
    const readiness = evaluateIncidentReadiness({
      settings: {
        reportingEnabled: true,
        anonymousReportingEnabled: false,
        severeIncidentNotifyHours: 12,
        investigationTargetDays: 7,
        harassmentPolicyVersion: "2026.01",
        safetyPolicyVersion: "2026.01",
        authorityReportRequired: true,
        verificationStatus: "unverified",
        lastReviewedAt: null,
      },
      incidents: [
        {
          id: "incident-1",
          reporterEmployeeId: "employee-1",
          reporterName: "Employee",
          incidentType: "occupational_accident",
          severity: "severe",
          status: "submitted",
          occurredAt: new Date("2026-06-01T00:00:00.000Z"),
          summary: "Incident summary",
          location: "Office",
          confidential: true,
          authorityReportNeeded: true,
          authorityReportDueAt: new Date("2026-06-01T08:00:00.000Z"),
          authorityReportedAt: null,
          investigationDueAt: new Date("2026-06-08T00:00:00.000Z"),
          closedAt: null,
          correctiveAction: null,
          createdAt: new Date("2026-06-01T00:00:00.000Z"),
        },
      ],
      now: new Date("2026-06-13T00:00:00.000Z"),
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.missing).toEqual([
      "incident response policy HR/legal review",
      "8-hour severe incident notification target",
      "overdue incident investigations",
      "overdue authority report follow-up",
    ]);
  });

  it("creates severe occupational accident reports with authority report due date and redacted audit", async () => {
    await updateIncidentSettings(ownerSession, { verificationStatus: "verified", severeIncidentNotifyHours: 8 });
    const incident = await reportWorkplaceIncident(employeeSession, {
      incidentType: "occupational_accident",
      severity: "severe",
      occurredAt: new Date("2026-06-13T09:00:00.000Z"),
      summary: "Machine guard failed near production line.",
      location: "Line A",
      confidential: true,
    });

    expect(incident.authorityReportNeeded).toBe(true);
    expect(incident.authorityReportDueAt?.toISOString()).toBe("2026-06-13T17:00:00.000Z");
    const auditJson = JSON.stringify(getAuditDemoState().logs);
    expect(auditJson).toContain("summaryHash");
    expect(auditJson).not.toContain("Machine guard failed");
    expect(auditJson).not.toContain("Line A");
  });

  it("lets HR mark authority report and close corrective action", async () => {
    const incident = await reportWorkplaceIncident(employeeSession, {
      incidentType: "near_miss",
      severity: "medium",
      occurredAt: new Date("2026-06-13T09:00:00.000Z"),
      summary: "Slippery floor near pantry.",
      location: "Pantry",
    });

    const updated = await updateWorkplaceIncident(hrSession, {
      incidentId: incident.id,
      status: "closed",
      correctiveAction: "Added signage and floor inspection checklist.",
      authorityReported: false,
    });

    expect(updated.status).toBe("closed");
    const auditJson = JSON.stringify(getAuditDemoState().logs);
    expect(auditJson).toContain("correctiveActionHash");
    expect(auditJson).not.toContain("Added signage");
  });

  it("blocks employees from managing incident settings", async () => {
    await expect(updateIncidentSettings(employeeSession, { verificationStatus: "verified" })).rejects.toThrow(
      "Role employee cannot incident:manage",
    );
  });
});
