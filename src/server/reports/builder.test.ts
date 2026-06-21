import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import {
  createCustomReportJob,
  getReportAdminWorkspace,
  resetReportDemoState,
} from "./builder";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-hr", displayName: "林人資" },
  employee: { id: "demo-hr-employee", displayName: "林人資" },
};

const managerSession = {
  role: "manager" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-manager", displayName: "陳主管" },
  employee: { id: "demo-manager-employee", displayName: "陳主管" },
};

describe("report builder foundation", () => {
  beforeEach(() => {
    resetReportDemoState();
    resetAuditDemoState();
  });

  it("creates a masked custom report job, archive metadata, and audit logs", async () => {
    const job = await createCustomReportJob(hrSession, {
      title: "E2E 人事準備度報表",
      datasetCode: "people_readiness",
      purpose: "management_review",
      periodStart: "2026-06-01",
      periodEnd: "2026-06-30",
      selectedFieldKeys: ["employee_no", "department", "hire_month", "labor_roster_status"],
    });
    const workspace = await getReportAdminWorkspace(hrSession);
    const auditPayload = JSON.stringify(getAuditDemoState().logs);

    expect(job).toMatchObject({
      title: "E2E 人事準備度報表",
      datasetCode: "people_readiness",
      rowCount: 25,
      maskedFieldCount: 1,
      archive: {
        status: "generated",
        recordCount: 25,
      },
    });
    expect(job.contentHash).toHaveLength(64);
    expect(workspace.jobs).toHaveLength(1);
    expect(workspace.archives).toHaveLength(1);
    expect(getAuditDemoState().logs.map((log) => log.entityType)).toEqual([
      "report_export_archive",
      "report_job",
    ]);
    expect(getAuditDemoState().logs[0].metadataJson).toMatchObject({
      rawRowsIncluded: false,
      sensitiveValuesRedacted: true,
    });
    expect(getAuditDemoState().logs[1].metadataJson).toMatchObject({
      rawSensitiveValuesIncluded: false,
      salaryValuesIncluded: "[REDACTED]",
      bankAccountValuesIncluded: "[REDACTED]",
      nationalIdValuesIncluded: "[REDACTED]",
      healthValuesIncluded: "[REDACTED]",
      privateNotesIncluded: false,
    });
    expect(auditPayload).not.toContain("baseSalary");
    expect(auditPayload).not.toContain("accountNumber");
    expect(auditPayload).not.toContain("A123456789");
  });

  it("blocks non-HR roles and raw sensitive fields", async () => {
    await expect(getReportAdminWorkspace(managerSession)).rejects.toThrow(/report:manage/);
    await expect(
      createCustomReportJob(hrSession, {
        datasetCode: "people_readiness",
        selectedFieldKeys: ["employee_no", "national_id"],
      }),
    ).rejects.toThrow(/不可匯出/);
  });

  it("allows payroll fields only as aggregate metadata for payroll-authorized HR", async () => {
    const job = await createCustomReportJob(hrSession, {
      title: "薪資月結狀態報表",
      datasetCode: "payroll_close",
      purpose: "monthly_close",
      selectedFieldKeys: ["payroll_run_status", "payslip_release_count", "payroll_amount_summary"],
    });

    expect(job.selectedFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "payroll_amount_summary", maskingMode: "aggregate_only" }),
      ]),
    );
    expect(JSON.stringify(getAuditDemoState().logs)).not.toContain("66000");
  });
});
