import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import {
  evaluateOperationalResilienceReadiness,
  getOperationalResilienceReadiness,
  resetOperationalResilienceDemoState,
  updateOperationalResilienceSettings,
} from "./operational-resilience";

const ownerSession = {
  role: "owner" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-owner", displayName: "王執行長" },
  employee: null,
};

const managerSession = {
  role: "manager" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-manager", displayName: "陳主管" },
  employee: { id: "demo-manager-employee", displayName: "陳主管" },
};

describe("operational resilience readiness", () => {
  beforeEach(() => {
    resetOperationalResilienceDemoState();
    resetAuditDemoState();
  });

  it("requires backups, encryption, retention, and recent restore drill evidence", async () => {
    await expect(getOperationalResilienceReadiness(ownerSession)).resolves.toMatchObject({
      ready: false,
      missing: expect.arrayContaining(["enabled backups", "backup provider", "passed restore drill"]),
    });

    const updated = await updateOperationalResilienceSettings(ownerSession, {
      backupProvider: "managed_postgres",
      backupRegion: "asia-east1",
      backupSchedule: "daily",
      backupRetentionDays: 35,
      backupEncryptionKeyRef: "vault://customer/hrone/backup-key",
      backupEnabled: true,
      lastBackupCompletedAt: new Date("2026-06-12T00:00:00.000Z"),
      restoreDrillTestedAt: new Date("2026-06-01T00:00:00.000Z"),
      restoreDrillStatus: "passed",
      restoreDrillTicket: "OPS-1234",
      recoveryTimeObjectiveHours: 8,
      recoveryPointObjectiveHours: 4,
      verificationStatus: "verified",
      verificationNote: "Restore drill completed from encrypted backup snapshot.",
    });

    expect(evaluateOperationalResilienceReadiness(updated, new Date("2026-06-12T00:00:00.000Z"))).toMatchObject({
      ready: true,
      missing: [],
    });
    expect(getAuditDemoState().logs[0]).toMatchObject({
      entityType: "operational_resilience_settings",
      metadataJson: expect.objectContaining({
        backupProvider: "managed_postgres",
        hasEncryptionKeyRef: true,
        restoreDrillStatus: "passed",
        verificationStatus: "verified",
      }),
    });
    expect(JSON.stringify(getAuditDemoState().logs[0].metadataJson)).not.toContain("vault://customer");
  });

  it("blocks managers from updating operational resilience settings", async () => {
    await expect(
      updateOperationalResilienceSettings(managerSession, {
        backupEnabled: true,
      }),
    ).rejects.toThrow(/settings:write/);
  });
});
