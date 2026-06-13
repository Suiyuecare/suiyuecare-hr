import { describe, expect, it } from "vitest";
import {
  acknowledgeEmploymentTerm,
  getEmploymentTermsWorkspace,
  getOwnEmploymentTerms,
  resetEmploymentTermsDemoState,
} from "@/server/employees/employment-terms";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-hr", displayName: "HR" },
  employee: { id: "demo-hr-employee", displayName: "HR" },
};

const employeeSession = {
  role: "employee" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-employee", displayName: "張小安" },
  employee: { id: "demo-employee-1", displayName: "張小安" },
};

describe("employment terms", () => {
  it("tracks acknowledgement coverage without exposing raw wage terms", async () => {
    resetEmploymentTermsDemoState();

    const workspace = await getEmploymentTermsWorkspace(hrSession);

    expect(workspace.coverage.activeTermsCount).toBe(3);
    expect(workspace.coverage.acknowledgedCount).toBe(1);
    expect(JSON.stringify(workspace)).not.toContain("60000");
  });

  it("lets an employee acknowledge their own active terms", async () => {
    resetEmploymentTermsDemoState();
    const terms = await getOwnEmploymentTerms(employeeSession);

    const acknowledged = await acknowledgeEmploymentTerm(employeeSession, terms[0].id);

    expect(acknowledged.acknowledgementHash).toBeTruthy();
    expect(acknowledged.acknowledgedAt).toBeInstanceOf(Date);
  });
});
