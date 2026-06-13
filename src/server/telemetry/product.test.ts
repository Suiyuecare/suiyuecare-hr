import { beforeEach, describe, expect, it } from "vitest";
import {
  getProductTelemetrySnapshot,
  recordProductTelemetryEvent,
  resetProductTelemetryDemoState,
} from "./product";

const session = {
  role: "employee" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-employee", displayName: "張小安" },
  employee: { id: "demo-employee-1", displayName: "張小安" },
};

describe("product telemetry", () => {
  beforeEach(() => {
    resetProductTelemetryDemoState();
  });

  it("summarizes KPI telemetry from privacy-safe demo events", async () => {
    const snapshot = await getProductTelemetrySnapshot();

    expect(snapshot.averageLeaveSuccessSeconds).toBe(55);
    expect(snapshot.averageManagerApprovalSeconds).toBe(13);
    expect(snapshot.employeeMobileCompletionPercent).toBe(67);
    expect(snapshot.hrSelfServeFormPercent).toBe(67);
    expect(snapshot.eventCount).toBeGreaterThan(0);
  });

  it("records events without exposing sensitive metadata in summaries", async () => {
    await recordProductTelemetryEvent(session, {
      eventName: "leave_request_success",
      workflow: "leave",
      step: "first_success",
      durationMs: 45_000,
      metadata: {
        nationalId: "A123456789",
        salary: 60000,
        safeBucket: "mobile",
      },
    });

    const snapshot = await getProductTelemetrySnapshot();

    expect(snapshot.averageLeaveSuccessSeconds).toBe(52);
    expect(JSON.stringify(snapshot)).not.toContain("A123456789");
    expect(JSON.stringify(snapshot)).not.toContain("60000");
  });
});
