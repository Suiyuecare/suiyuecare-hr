import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import {
  createDataSubjectRequest,
  evaluatePrivacyReadiness,
  getPrivacyWorkspace,
  recordEmployeePrivacyConsent,
  resetPrivacyDemoState,
  resolveDataSubjectRequest,
  updatePrivacySettings,
} from "./governance";

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

describe("privacy governance", () => {
  beforeEach(() => {
    resetPrivacyDemoState();
    resetAuditDemoState();
  });

  it("requires verified notice, current acknowledgement coverage, and timely requests for readiness", () => {
    const readiness = evaluatePrivacyReadiness({
      settings: {
        consentVersion: "2026.01",
        consentTitle: "Notice",
        consentBody: "Purpose text",
        collectionPurpose: "HR operations",
        requiresEmployeeAcknowledgement: true,
        dataRetentionYears: 7,
        dataSubjectRequestResponseDays: 30,
        deletionReviewRequired: true,
        crossBorderTransferEnabled: false,
        subprocessors: [],
        verificationStatus: "unverified",
        lastReviewedAt: null,
      },
      consents: [],
      requests: [
        {
          id: "request-1",
          employeeId: "employee-1",
          employeeName: "Employee",
          requestType: "access",
          status: "submitted",
          summary: "Please review my profile.",
          resolutionNote: null,
          dueAt: new Date("2026-06-01T00:00:00.000Z"),
          completedAt: null,
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
        },
      ],
      employeeCount: 1,
      now: new Date("2026-06-13T00:00:00.000Z"),
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.missing).toEqual([
      "privacy notice legal/HR review",
      "current employee acknowledgement coverage",
      "overdue data subject requests",
    ]);
  });

  it("lets employees acknowledge the active privacy notice and keeps audit metadata redacted", async () => {
    await updatePrivacySettings(ownerSession, {
      verificationStatus: "verified",
      consentBody: "Personal data notice with no secret values.",
    });

    const consent = await recordEmployeePrivacyConsent(employeeSession);

    expect(consent.employeeId).toBe("demo-employee-1");
    expect(consent.policyHash).toHaveLength(64);
    const audit = getAuditDemoState().logs.find((log) => log.entityType === "employee_privacy_consent");
    expect(audit).toMatchObject({
      action: "create",
      metadataJson: expect.objectContaining({
        rawPolicyBodyIncluded: false,
      }),
    });
    expect(JSON.stringify(audit)).not.toContain("Personal data notice with no secret values.");
  });

  it("scopes employee privacy workspace to the signed-in employee", async () => {
    await recordEmployeePrivacyConsent(employeeSession);
    const workspace = await getPrivacyWorkspace(employeeSession);

    expect(workspace.consents.every((consent) => consent.employeeId === "demo-employee-1")).toBe(true);
  });

  it("creates and resolves data subject requests with hashed audit notes", async () => {
    const request = await createDataSubjectRequest(employeeSession, {
      requestType: "correction",
      summary: "Please correct my department assignment.",
    });

    expect(request.status).toBe("submitted");
    const resolved = await resolveDataSubjectRequest(hrSession, {
      requestId: request.id,
      status: "fulfilled",
      resolutionNote: "Corrected in employee profile.",
    });

    expect(resolved.status).toBe("fulfilled");
    const auditJson = JSON.stringify(getAuditDemoState().logs);
    expect(auditJson).toContain("summaryHash");
    expect(auditJson).not.toContain("Please correct my department assignment.");
    expect(auditJson).not.toContain("Corrected in employee profile.");
  });

  it("blocks employees from managing company privacy settings", async () => {
    await expect(updatePrivacySettings(employeeSession, { verificationStatus: "verified" })).rejects.toThrow(
      "Role employee cannot privacy:manage",
    );
  });
});
