import { describe, expect, it } from "vitest";
import {
  acknowledgeEmploymentTerm,
  getEmploymentTermsWorkspace,
  getOwnEmploymentTerms,
  resetEmploymentTermsDemoState,
  saveEmploymentTerm,
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
    expect(workspace.coverage.article7ReadyCount).toBe(3);
    expect(workspace.coverage.article7GapCount).toBe(0);
    expect(workspace.coverage.sourceCount).toBe(3);
    expect(JSON.stringify(workspace)).not.toContain("60000");
  });

  it("tracks Article 7 gaps while keeping raw wage summaries out of views", async () => {
    resetEmploymentTermsDemoState();

    const term = await saveEmploymentTerm(hrSession, {
      employeeId: "demo-employee-1",
      version: "2026.07-test",
      status: "active",
      effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
      jobTitle: "照服專員",
      workLocation: "台北辦公室",
      regularWorkSchedule: "09:00-18:00，休息一小時。",
      wagePaymentDay: "每月 5 個營業日內",
      wageBasisSummary: "月薪 66000 測試資料，送出後只能保存 hash。",
      benefitsSummary: "勞健保、勞退與公司福利。",
      sourceRef: "",
      acknowledgementRequired: true,
    });

    const workspace = await getEmploymentTermsWorkspace(hrSession);

    expect(term.article7Ready).toBe(false);
    expect(term.article7MissingFields).toContain("source_ref");
    expect(workspace.coverage.article7GapCount).toBe(1);
    expect(JSON.stringify(workspace)).not.toContain("66000");
  });

  it("lets an employee acknowledge their own active terms", async () => {
    resetEmploymentTermsDemoState();
    const terms = await getOwnEmploymentTerms(employeeSession);

    const acknowledged = await acknowledgeEmploymentTerm(employeeSession, terms[0].id);

    expect(acknowledged.acknowledgementHash).toBeTruthy();
    expect(acknowledged.acknowledgedAt).toBeInstanceOf(Date);
  });
});
