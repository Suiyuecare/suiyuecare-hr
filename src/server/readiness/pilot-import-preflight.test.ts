import { describe, expect, it } from "vitest";
import { buildPilotImportTemplatePack, getPilotImportTemplateFile } from "@/server/readiness/pilot-import-template";
import {
  buildPilotImportPreflightReport,
  formatPilotImportPreflightMarkdown,
  pilotImportPreflightPassed,
} from "@/server/readiness/pilot-import-preflight";

describe("pilot import preflight", () => {
  it("passes a real-customer-shaped 20-person import pack using aggregate-only output", () => {
    const input = buildRealCustomerCsvPair(20);
    const report = buildPilotImportPreflightReport({
      ...input,
      checkedAt: new Date("2026-06-17T00:00:00.000Z"),
    });
    const markdown = formatPilotImportPreflightMarkdown(report);

    expect(report).toMatchObject({
      status: "ready",
      employeeRows: 20,
      payrollRows: 20,
      managerWithDirectReportsCount: 2,
      departmentCount: 2,
      blockers: 0,
      warnings: 0,
    });
    expect(pilotImportPreflightPassed(report)).toBe(true);
    expect(markdown).toContain("Status: ready");
    expect(markdown).not.toContain("正式員工");
    expect(markdown).not.toContain("1234567890");
    expect(markdown).not.toContain("56000");
  });

  it("does not let generated template sample values pass as real import data", () => {
    const pack = buildPilotImportTemplatePack({ generatedAt: new Date("2026-06-17T00:00:00.000Z") });
    const report = buildPilotImportPreflightReport({
      employeeCsv: requiredFile(pack, "employee-import-template.csv"),
      payrollCsv: requiredFile(pack, "payroll-profile-import-template.csv"),
      checkedAt: new Date("2026-06-17T00:00:00.000Z"),
    });

    expect(report.status).toBe("action_required");
    expect(report.warnings).toBe(1);
    expect(report.checks.find((check) => check.name === "synthetic template markers")).toMatchObject({
      status: "warn",
    });
  });

  it("blocks mismatched employee and payroll rows without leaking raw payroll fields", () => {
    const input = buildRealCustomerCsvPair(20);
    const payrollLines = input.payrollCsv.trim().split(/\r?\n/);
    const report = buildPilotImportPreflightReport({
      employeeCsv: input.employeeCsv,
      payrollCsv: `${payrollLines.slice(0, -1).join("\n")}\n`,
      checkedAt: new Date("2026-06-17T00:00:00.000Z"),
    });
    const markdown = formatPilotImportPreflightMarkdown(report);

    expect(report.status).toBe("blocked");
    expect(report.checks.find((check) => check.name === "payroll rows match employee rows")).toMatchObject({
      status: "block",
    });
    expect(pilotImportPreflightPassed(report)).toBe(false);
    expect(markdown).not.toContain("正式員工");
    expect(markdown).not.toContain("1234567890");
    expect(markdown).not.toContain("56000");
  });

  it("blocks missing manager lines and non-resident tax setup", () => {
    const input = buildRealCustomerCsvPair(20, {
      includeManagers: false,
      includeNonResidentWithoutRate: true,
    });
    const report = buildPilotImportPreflightReport({
      ...input,
      checkedAt: new Date("2026-06-17T00:00:00.000Z"),
    });

    expect(report.status).toBe("blocked");
    expect(report.checks.find((check) => check.name === "manager reporting lines")).toMatchObject({
      status: "block",
    });
    expect(report.checks.find((check) => check.name === "non-resident tax setup")).toMatchObject({
      status: "warn",
    });
  });
});

function buildRealCustomerCsvPair(
  count: number,
  options: { includeManagers?: boolean; includeNonResidentWithoutRate?: boolean } = {},
) {
  const includeManagers = options.includeManagers ?? true;
  const employeeHeaders = [
    "employeeNo",
    "displayName",
    "jobTitle",
    "departmentCode",
    "hireDate",
    "managerEmployeeNo",
  ];
  const payrollHeaders = [
    "employeeNo",
    "baseSalary",
    "hourlyWage",
    "allowanceCode",
    "allowanceName",
    "allowanceAmount",
    "deductionCode",
    "deductionName",
    "deductionAmount",
    "taxResidency",
    "dependentCount",
    "laborInsuranceMonthlyWage",
    "healthInsuranceMonthlyWage",
    "laborPensionMonthlyWage",
    "nonResidentWithholdingRatePercent",
    "bankCode",
    "bankBranchCode",
    "accountName",
    "accountNumber",
    "effectiveFrom",
  ];
  const employeeRows = Array.from({ length: count }, (_, index) => {
    const employeeNo = `A${String(index + 1).padStart(3, "0")}`;
    const managerEmployeeNo = !includeManagers || index < 2 ? "" : index % 2 === 0 ? "A001" : "A002";
    return [
      employeeNo,
      `正式員工${String(index + 1).padStart(2, "0")}`,
      index < 2 ? "Team Lead" : "Care Specialist",
      index % 2 === 0 ? "CARE" : "OPS",
      "2026-07-01",
      managerEmployeeNo,
    ];
  });
  const payrollRows = Array.from({ length: count }, (_, index) => {
    const nonResident = options.includeNonResidentWithoutRate && index === count - 1;
    return [
      `A${String(index + 1).padStart(3, "0")}`,
      "56000",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      nonResident ? "non_resident" : "resident",
      "0",
      "",
      "",
      "",
      nonResident ? "" : "",
      "004",
      "0001",
      `正式員工${String(index + 1).padStart(2, "0")}`,
      `1234567890${String(index + 1).padStart(2, "0")}`,
      "2026-07-01",
    ];
  });

  return {
    employeeCsv: toCsv([employeeHeaders, ...employeeRows]),
    payrollCsv: toCsv([payrollHeaders, ...payrollRows]),
  };
}

function requiredFile(pack: ReturnType<typeof buildPilotImportTemplatePack>, path: string) {
  const file = getPilotImportTemplateFile(pack, path);
  if (!file) throw new Error(`Missing generated file ${path}`);
  return file.content;
}

function toCsv(rows: string[][]) {
  return `${rows.map((row) => row.join(",")).join("\n")}\n`;
}
