import { beforeEach, describe, expect, it } from "vitest";
import { resetAuditDemoState } from "./demo-store";
import { getAuditLogs } from "./queries";
import { resetRuleSettingsDemoState, updateTaiwanLaborStandardsConfig } from "@/server/rules/settings";

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
};

describe("audit log queries", () => {
  beforeEach(() => {
    resetAuditDemoState();
    resetRuleSettingsDemoState();
  });

  it("records rule setting changes without exposing raw before and after values", async () => {
    await updateTaiwanLaborStandardsConfig(ownerSession, {
      minimumHourlyWage: 200,
    });

    const logs = await getAuditLogs(ownerSession);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      action: "update",
      entityType: "rule_settings",
      entityId: "taiwan_labor_standards",
      actorName: "王執行長",
    });
    expect(logs[0].beforeHash).toMatch(/[a-f0-9]{64}/);
    expect(logs[0].afterHash).toMatch(/[a-f0-9]{64}/);
    expect(JSON.stringify(logs[0].metadata)).not.toContain("29500");
  });

  it("requires audit read permission", async () => {
    await expect(getAuditLogs(employeeSession)).rejects.toThrow(/audit:read/);
  });
});
