import { beforeEach, describe, expect, it } from "vitest";
import { resetAuditDemoState } from "@/server/audit/demo-store";
import { previewEmployeeImport, resetEmployeeImportDemoState } from "@/server/employees/imports";
import {
  buildPilotImportTemplatePack,
  employeeImportTemplateHeaders,
  getPilotImportTemplateFile,
  payrollProfileImportTemplateHeaders,
} from "@/server/readiness/pilot-import-template";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-hr", displayName: "林人資" },
  employee: { id: "demo-hr-employee", displayName: "林人資" },
};

describe("pilot import template pack", () => {
  beforeEach(() => {
    resetAuditDemoState();
    resetEmployeeImportDemoState();
  });

  it("generates a 25-person sample pack aligned to employee and payroll import headers", async () => {
    const pack = buildPilotImportTemplatePack({
      generatedAt: new Date("2026-06-17T00:00:00.000Z"),
      cohortSize: 25,
      hireDate: "2026-07-01",
      effectiveFrom: "2026-07-01",
    });
    const employeeCsv = requiredFile(pack, "employee-import-template.csv");
    const payrollCsv = requiredFile(pack, "payroll-profile-import-template.csv");

    expect(pack.cohortSize).toBe(25);
    expect(headerOf(employeeCsv)).toEqual([...employeeImportTemplateHeaders]);
    expect(headerOf(payrollCsv)).toEqual([...payrollProfileImportTemplateHeaders]);
    expect(dataRowCount(employeeCsv)).toBe(25);
    expect(dataRowCount(payrollCsv)).toBe(25);
    expect(employeeNos(employeeCsv)).toEqual(employeeNos(payrollCsv));
    expect(employeeCsv).toContain("PILOT001");
    expect(employeeCsv).toContain("PILOT025");
    expect(employeeCsv).toContain("PILOT001");
    expect(employeeCsv).toContain("PILOT002");

    const preview = await previewEmployeeImport(hrSession, employeeCsv);

    expect(preview.invalidCount).toBe(0);
    expect(preview.pilotReadiness).toMatchObject({
      status: "ready",
      projectedEmployeeCount: 50,
      managerAssignmentCount: 22,
    });
  });

  it("marks the generated files as synthetic and avoids obvious secret/real-data patterns", () => {
    const pack = buildPilotImportTemplatePack({
      generatedAt: new Date("2026-06-17T00:00:00.000Z"),
    });
    const combined = pack.files.map((file) => file.content).join("\n");
    const readme = requiredFile(pack, "README.md");
    const manifest = JSON.parse(requiredFile(pack, "manifest.json")) as {
      safety: {
        sampleOnly: boolean;
        containsRealPersonalData: boolean;
        containsRealSalaryData: boolean;
        containsRealBankAccountData: boolean;
      };
    };

    expect(readme).toContain("All rows are synthetic sample data");
    expect(readme).toContain("Do not paste real payroll or bank data");
    expect(manifest.safety).toEqual({
      sampleOnly: true,
      containsRealPersonalData: false,
      containsRealSalaryData: false,
      containsRealBankAccountData: false,
    });
    expect(combined).not.toContain("postgresql://");
    expect(combined).not.toContain("sb_secret");
    expect(combined).not.toContain("身分證");
    expect(combined).not.toContain("健康資料");
  });

  it("keeps the generated cohort inside the 20-50 pilot range", () => {
    expect(() => buildPilotImportTemplatePack({ cohortSize: 19 })).toThrow(/between 20 and 50/);
    expect(() => buildPilotImportTemplatePack({ cohortSize: 51 })).toThrow(/between 20 and 50/);
    expect(dataRowCount(requiredFile(buildPilotImportTemplatePack({ cohortSize: 20 }), "employee-import-template.csv"))).toBe(20);
    expect(dataRowCount(requiredFile(buildPilotImportTemplatePack({ cohortSize: 50 }), "employee-import-template.csv"))).toBe(50);
  });
});

function requiredFile(pack: ReturnType<typeof buildPilotImportTemplatePack>, path: string) {
  const file = getPilotImportTemplateFile(pack, path);
  if (!file) throw new Error(`Missing generated file ${path}`);
  return file.content;
}

function headerOf(csv: string) {
  return csv.trim().split(/\r?\n/)[0].split(",");
}

function dataRowCount(csv: string) {
  return csv.trim().split(/\r?\n/).length - 1;
}

function employeeNos(csv: string) {
  return csv.trim().split(/\r?\n/).slice(1).map((row) => row.split(",")[0]);
}
