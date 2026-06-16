import { describe, expect, it } from "vitest";
import {
  buildPilotIdentityImportPlan,
  formatPilotIdentityImportReport,
  toPilotIdentityCsv,
  type PilotIdentityImportContext,
} from "@/server/provisioning/pilot-identity-import";

describe("pilot identity import", () => {
  it("builds a ready plan that derives employee and manager roles without exposing raw identities", () => {
    const rawCsv = toPilotIdentityCsv(
      employees(25).map((employee) => ({
        employeeNo: employee.employeeNo,
        email: `${employee.employeeNo.toLowerCase()}@customer.example`,
        externalSubject: `oidc-${employee.employeeNo.toLowerCase()}`,
      })),
    );
    const plan = buildPilotIdentityImportPlan({
      rawCsv,
      context: context(),
      generatedAt: new Date("2026-06-17T00:00:00.000Z"),
    });
    const report = formatPilotIdentityImportReport(plan);

    expect(plan).toMatchObject({
      status: "ready",
      activeEmployeeCount: 25,
      csvRowCount: 25,
      validCount: 25,
      invalidCount: 0,
      managerRoleCount: 3,
      employeeRoleCount: 25,
    });
    expect(plan.rows.find((row) => row.employeeNo === "E001")?.roles).toEqual(["employee", "manager"]);
    expect(plan.rows.find((row) => row.employeeNo === "E004")?.roles).toEqual(["employee"]);
    expect(report).not.toContain("e001@customer.example");
    expect(report).not.toContain("oidc-e001");
  });

  it("blocks invalid rows and summarizes next actions without raw email or SSO subject", () => {
    const rawCsv = [
      "employeeNo,email,externalSubject",
      "E001,e001@customer.example,subject-1",
      "E001,e001-duplicate@customer.example,subject-2",
      "E999,e999@customer.example,subject-3",
      "E004,e004@other.example,subject-4",
      "E005,e005@customer.example,subject-1",
    ].join("\n");
    const plan = buildPilotIdentityImportPlan({
      rawCsv,
      context: context({
        existingIdentities: [{ issuer: "https://idp.customer.example", subject: "subject-1", userId: "user-other" }],
      }),
      generatedAt: new Date("2026-06-17T00:00:00.000Z"),
    });
    const report = formatPilotIdentityImportReport(plan);

    expect(plan.status).toBe("blocked");
    expect(plan.invalidCount).toBe(5);
    expect(plan.checks.find((check) => check.name === "identity CSV rows are valid")).toMatchObject({
      status: "block",
    });
    expect(plan.nextActions).toContain("Fix 5 invalid identity row(s) before applying.");
    expect(report).toContain("Row 2");
    expect(report).not.toContain("e001@customer.example");
    expect(report).not.toContain("subject-1");
  });

  it("blocks missing SSO configuration and incomplete active employee coverage", () => {
    const plan = buildPilotIdentityImportPlan({
      rawCsv: toPilotIdentityCsv([
        { employeeNo: "E001", email: "e001@customer.example", externalSubject: "subject-1" },
      ]),
      context: context({ ssoProvider: null, ssoIssuer: null }),
    });

    expect(plan.status).toBe("blocked");
    expect(plan.checks.find((check) => check.name === "identity rows cover every active employee")).toMatchObject({
      status: "block",
    });
    expect(plan.checks.find((check) => check.name === "SSO configuration")).toMatchObject({
      status: "block",
    });
  });
});

function context(overrides: Partial<PilotIdentityImportContext> = {}): PilotIdentityImportContext {
  return {
    tenantId: "tenant_1",
    companyId: "company_1",
    tenantSlug: "customer-co",
    ssoProvider: "oidc",
    ssoIssuer: "https://idp.customer.example",
    allowedEmailDomains: ["customer.example"],
    employees: employees(25),
    existingUsers: [],
    existingIdentities: [],
    ...overrides,
  };
}

function employees(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const sequence = index + 1;
    return {
      id: `employee_${sequence}`,
      employeeNo: `E${String(sequence).padStart(3, "0")}`,
      displayName: `Employee ${sequence}`,
      userId: null,
      hasDirectReports: sequence <= 3,
    };
  });
}
