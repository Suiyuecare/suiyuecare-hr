import { describe, expect, it } from "vitest";
import { redactSensitivePayload, safeLogFields } from "./redaction";

describe("audit redaction", () => {
  it("redacts sensitive keys recursively", () => {
    const redacted = redactSensitivePayload({
      employeeId: "emp_1",
      salary: 100000,
      profile: {
        nationalId: "A123456789",
        bankAccount: "000-123",
        displayName: "Demo User",
      },
    });

    expect(redacted).toEqual({
      employeeId: "emp_1",
      salary: "[REDACTED]",
      profile: {
        nationalId: "[REDACTED]",
        bankAccount: "[REDACTED]",
        displayName: "Demo User",
      },
    });
  });

  it("keeps structured operational log fields", () => {
    expect(
      safeLogFields({
        tenant_id: "tenant_1",
        entity_type: "employee",
        status: "ok",
      }),
    ).toEqual({
      tenant_id: "tenant_1",
      entity_type: "employee",
      status: "ok",
    });
  });
});

