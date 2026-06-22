import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import {
  evaluateSubscriptionReadiness,
  getSubscriptionWorkspace,
  resetSubscriptionDemoState,
  updateTenantSubscription,
  type TenantSubscriptionView,
} from "./service";

const ownerSession = {
  role: "owner" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-owner", displayName: "王執行長" },
  employee: null,
};

const employeeSession = {
  role: "employee" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-employee", displayName: "張小安" },
  employee: { id: "demo-employee-1", displayName: "張小安" },
};

const readySubscription: TenantSubscriptionView = {
  plan: "enterprise",
  status: "active",
  seatLimit: 25,
  activeSeatCount: 6,
  trialEndsAt: null,
  contractStartsAt: new Date("2026-06-01T00:00:00.000Z"),
  contractEndsAt: new Date("2027-06-01T00:00:00.000Z"),
  renewalNoticeDays: 30,
  billingContactEmail: "billing@customer.example",
  contractRef: "contract://customer-a/hrone-2026",
  contractHash: "contract-hash",
  paymentCollectionMode: "manual_invoice",
  verificationStatus: "verified",
  lastReviewedAt: new Date("2026-06-13T00:00:00.000Z"),
};

describe("tenant subscriptions", () => {
  beforeEach(() => {
    resetSubscriptionDemoState();
    resetAuditDemoState();
  });

  it("blocks commercial readiness while the tenant is still demo, trial, unverified, and missing contract evidence", async () => {
    const workspace = await getSubscriptionWorkspace(ownerSession);

    expect(workspace.readiness.ready).toBe(false);
    expect(workspace.productModules).toMatchObject({
      plan: "demo",
      readyForPackaging: false,
      includedCount: 0,
    });
    expect(workspace.readiness.missing).toEqual([
      "paid customer plan selected",
      "active subscription status",
      "contract reference and hash",
      "contract term dates",
      "commercial terms reviewed",
    ]);
  });

  it("blocks readiness when active seats exceed the seat limit", () => {
    const readiness = evaluateSubscriptionReadiness({
      ...readySubscription,
      seatLimit: 5,
      activeSeatCount: 6,
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.missing).toContain("seat limit covers active users");
    expect(readiness.seatUtilizationPercent).toBe(120);
  });

  it("lets owners update commercial posture and writes redacted audit metadata", async () => {
    const updated = await updateTenantSubscription(ownerSession, {
      plan: "enterprise",
      status: "active",
      seatLimit: 25,
      trialEndsAt: null,
      contractStartsAt: new Date("2026-06-01T00:00:00.000Z"),
      contractEndsAt: new Date("2027-06-01T00:00:00.000Z"),
      billingContactEmail: "Billing@Customer.Example",
      contractRef: "contract://customer-a/hrone-2026",
      contractHash: "",
      paymentCollectionMode: "manual_invoice",
      verificationStatus: "verified",
    });

    expect(updated).toMatchObject({
      plan: "enterprise",
      status: "active",
      seatLimit: 25,
      billingContactEmail: "billing@customer.example",
      verificationStatus: "verified",
    });
    expect(updated.contractHash).toHaveLength(64);

    const workspace = await getSubscriptionWorkspace(ownerSession);
    expect(workspace.productModules).toMatchObject({
      plan: "enterprise",
      readyForPackaging: true,
    });
    expect(workspace.productModules.items.find((item) => item.module.id === "safe-ai-copilot")).toMatchObject({
      included: true,
      upgradeRequired: false,
    });

    const audit = getAuditDemoState().logs[0];
    expect(audit).toMatchObject({
      action: "update",
      entityType: "tenant_subscription",
      metadataJson: expect.objectContaining({
        rawContractIncluded: false,
        rawFinancialDataIncluded: false,
        contractRefHash: expect.any(String),
      }),
    });
    expect(JSON.stringify(audit)).not.toContain("contract://customer-a/hrone-2026");
    expect(JSON.stringify(audit)).not.toContain("Billing@Customer.Example");
  });

  it("blocks employees from viewing or changing subscription controls", async () => {
    await expect(getSubscriptionWorkspace(employeeSession)).rejects.toThrow("Role employee cannot subscription:manage");
    await expect(updateTenantSubscription(employeeSession, { plan: "enterprise" })).rejects.toThrow(
      "Role employee cannot subscription:manage",
    );
  });
});
