import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import {
  approveReportJobReview,
  createCustomReportJob,
  downloadReportArchive,
  getReportAdminWorkspace,
  issueReportArchiveDownloadToken,
  resetReportDemoState,
  updateReportPermission,
} from "./builder";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-hr", displayName: "林人資" },
  employee: { id: "demo-hr-employee", displayName: "林人資" },
};

const ownerSession = {
  role: "owner" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-owner", displayName: "黃老闆" },
  employee: { id: "demo-owner-employee", displayName: "黃老闆" },
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
      status: "pending_review",
      rowCount: 25,
      maskedFieldCount: 1,
      review: {
        required: true,
        status: "pending",
        requestedByUserId: "demo-user-hr",
      },
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
      review: expect.objectContaining({
        required: true,
        status: "pending",
      }),
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

  it("exposes and updates a role-based report permission matrix with audit logs", async () => {
    const workspace = await getReportAdminWorkspace(hrSession);
    const managerPayroll = workspace.permissions.find(
      (permission) => permission.roleKey === "manager" && permission.datasetCode === "payroll_close",
    );

    expect(workspace.summary.permissionCount).toBe(16);
    expect(managerPayroll).toMatchObject({
      accessLevel: "none",
      maskingMode: "blocked",
      exportAllowed: false,
    });

    const updated = await updateReportPermission(hrSession, {
      datasetCode: "attendance_monthly",
      roleKey: "manager",
      accessLevel: "detail",
      maskingMode: "none",
      exportAllowed: "true",
      requiresReason: "false",
    });
    const nextWorkspace = await getReportAdminWorkspace(hrSession);
    const managerAttendance = nextWorkspace.permissions.find(
      (permission) => permission.roleKey === "manager" && permission.datasetCode === "attendance_monthly",
    );

    expect(updated).toMatchObject({
      roleKey: "manager",
      datasetCode: "attendance_monthly",
      accessLevel: "summary",
      maskingMode: "masked",
      exportAllowed: false,
      requiresReason: true,
    });
    expect(managerAttendance).toMatchObject(updated);
    expect(getAuditDemoState().logs[0]).toMatchObject({
      entityType: "report_permission",
      action: "update",
    });
    expect(JSON.stringify(getAuditDemoState().logs)).not.toContain("accountNumber");
  });

  it("uses the matrix to block report generation when export permission is disabled", async () => {
    await updateReportPermission(hrSession, {
      datasetCode: "people_readiness",
      roleKey: "hr_admin",
      accessLevel: "summary",
      maskingMode: "masked",
      exportAllowed: "false",
    });

    await expect(
      createCustomReportJob(hrSession, {
        datasetCode: "people_readiness",
        selectedFieldKeys: ["employee_no"],
      }),
    ).rejects.toThrow(/不能匯出/);
  });

  it("supports field-level overrides without relaxing hard-sensitive fields", async () => {
    const hireMonthOverride = await updateReportPermission(hrSession, {
      datasetCode: "people_readiness",
      fieldKey: "hire_month",
      roleKey: "hr_admin",
      accessLevel: "detail",
      maskingMode: "aggregate_only",
      exportAllowed: "true",
      requiresReason: "true",
    });
    const nationalIdOverride = await updateReportPermission(hrSession, {
      datasetCode: "people_readiness",
      fieldKey: "national_id",
      roleKey: "hr_admin",
      accessLevel: "detail",
      maskingMode: "none",
      exportAllowed: "true",
      requiresReason: "false",
    });
    const workspace = await getReportAdminWorkspace(hrSession);
    const job = await createCustomReportJob(hrSession, {
      datasetCode: "people_readiness",
      selectedFieldKeys: ["employee_no", "hire_month"],
    });

    expect(hireMonthOverride).toMatchObject({
      fieldKey: "hire_month",
      fieldLabel: "到職月份",
      maskingMode: "aggregate_only",
      exportAllowed: true,
    });
    expect(nationalIdOverride).toMatchObject({
      fieldKey: "national_id",
      maskingMode: "blocked",
      exportAllowed: false,
    });
    expect(workspace.summary.fieldOverrideCount).toBe(2);
    expect(workspace.permissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldKey: "hire_month", roleKey: "hr_admin" }),
        expect.objectContaining({ fieldKey: "national_id", roleKey: "hr_admin" }),
      ]),
    );
    expect(job.selectedFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "hire_month", maskingMode: "aggregate_only" }),
      ]),
    );
    expect(getAuditDemoState().logs.some((log) => log.entityType === "report_job")).toBe(true);
    expect(getAuditDemoState().logs.some((log) =>
      log.entityType === "report_permission" &&
      log.metadataJson.fieldKey === "hire_month" &&
      log.metadataJson.fieldLevelOverride === true,
    )).toBe(true);
    await expect(
      createCustomReportJob(hrSession, {
        datasetCode: "people_readiness",
        selectedFieldKeys: ["national_id"],
      }),
    ).rejects.toThrow(/不可匯出/);
    expect(JSON.stringify(getAuditDemoState().logs)).not.toContain("A123456789");
  });

  it("auto-recovers expired report permission overrides while keeping audit evidence", async () => {
    const expiredAt = new Date(Date.now() - 86_400_000);
    const futureExpiresAt = new Date(Date.now() + 7 * 86_400_000);

    const expiredOverride = await updateReportPermission(hrSession, {
      datasetCode: "people_readiness",
      fieldKey: "hire_month",
      roleKey: "hr_admin",
      accessLevel: "detail",
      maskingMode: "aggregate_only",
      exportAllowed: "true",
      requiresReason: "true",
      expiresAt: expiredAt,
    });
    const expiredWorkspace = await getReportAdminWorkspace(hrSession);
    const recoveredJob = await createCustomReportJob(hrSession, {
      datasetCode: "people_readiness",
      selectedFieldKeys: ["employee_no", "hire_month"],
    });

    expect(expiredOverride).toMatchObject({
      fieldKey: "hire_month",
      expiresAt: expiredAt,
    });
    expect(expiredWorkspace.summary.expiredPermissionCount).toBe(1);
    expect(expiredWorkspace.summary.fieldOverrideCount).toBe(0);
    expect(recoveredJob.selectedFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "hire_month", maskingMode: "masked" }),
      ]),
    );

    const activeOverride = await updateReportPermission(hrSession, {
      datasetCode: "people_readiness",
      fieldKey: "hire_month",
      roleKey: "hr_admin",
      accessLevel: "detail",
      maskingMode: "aggregate_only",
      exportAllowed: "true",
      requiresReason: "true",
      expiresAt: futureExpiresAt,
    });
    const activeWorkspace = await getReportAdminWorkspace(hrSession);
    const activeJob = await createCustomReportJob(hrSession, {
      datasetCode: "people_readiness",
      selectedFieldKeys: ["employee_no", "hire_month"],
    });

    expect(activeOverride).toMatchObject({
      fieldKey: "hire_month",
      expiresAt: futureExpiresAt,
    });
    expect(activeWorkspace.summary.fieldOverrideCount).toBe(1);
    expect(activeWorkspace.summary.expiringPermissionCount).toBe(1);
    expect(activeWorkspace.summary.expiredPermissionCount).toBe(0);
    expect(activeJob.selectedFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "hire_month", maskingMode: "aggregate_only" }),
      ]),
    );
    expect(getAuditDemoState().logs.some((log) =>
      log.entityType === "report_permission" &&
      log.metadataJson.fieldKey === "hire_month" &&
      log.metadataJson.expiresAt === futureExpiresAt.toISOString(),
    )).toBe(true);
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

  it("downloads manifest-only report archives with audit logs and no sensitive values", async () => {
    const job = await createCustomReportJob(hrSession, {
      title: "兩週試用人事準備度報表",
      datasetCode: "people_readiness",
      purpose: "labor_inspection",
      periodStart: "2026-06-01",
      periodEnd: "2026-06-30",
      selectedFieldKeys: ["employee_no", "department", "hire_month", "labor_roster_status"],
    });

    await expect(issueReportArchiveDownloadToken(hrSession, job.archive.id)).rejects.toThrow(/第二人覆核/);
    await expect(approveReportJobReview(hrSession, { jobId: job.id })).rejects.toThrow(/不可由建立者自行核准/);
    const approved = await approveReportJobReview(ownerSession, {
      jobId: job.id,
      reviewerNote: "REV-2026-06",
    });
    await expect(downloadReportArchive(hrSession, job.archive.id)).rejects.toThrow(/短效下載連結/);
    const issued = await issueReportArchiveDownloadToken(hrSession, job.archive.id);
    await expect(downloadReportArchive(ownerSession, job.archive.id, issued.token)).rejects.toThrow(/不符合/);
    await expect(downloadReportArchive(hrSession, job.archive.id, "v1.invalid.token")).rejects.toThrow(/驗證失敗|內容無效|格式無效/);
    const download = await downloadReportArchive(hrSession, job.archive.id, issued.token);
    const workspace = await getReportAdminWorkspace(hrSession);
    const auditPayload = JSON.stringify(getAuditDemoState().logs);

    expect(approved).toMatchObject({
      status: "generated",
      review: {
        required: true,
        status: "approved",
        approvedByUserId: "demo-user-owner",
      },
    });
    expect(download.fileName).toMatch(/^hr-one-people_readiness-\d{8}-manifest\.csv$/);
    expect(download.contentType).toBe("text/csv; charset=utf-8");
    expect(download.body).toContain("content_hash");
    expect(download.body).toContain(job.contentHash);
    expect(download.body).toContain("raw_rows_included");
    expect(download.body).toContain("sensitive_values_redacted");
    expect(download.body).toContain("勞工名卡狀態");
    expect(download.body).not.toContain("baseSalary");
    expect(download.body).not.toContain("accountNumber");
    expect(download.body).not.toContain("nationalId");
    expect(download.body).not.toContain("A123456789");
    expect(workspace.archives[0]).toMatchObject({
      id: job.archive.id,
      status: "downloaded",
    });
    expect(getAuditDemoState().logs[0]).toMatchObject({
      action: "update",
      entityType: "report_export_archive",
      entityId: job.archive.id,
    });
    expect(getAuditDemoState().logs.map((log) => log.action)).toContain("approve");
    expect(getAuditDemoState().logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "report_archive_download_token",
          action: "create",
          metadataJson: expect.objectContaining({
            downloadTokenIssued: true,
            rawTokenStored: false,
          }),
        }),
      ]),
    );
    expect(getAuditDemoState().logs[0].metadataJson).toMatchObject({
      downloadManifestOnly: true,
      rawRowsIncluded: false,
      sensitiveValuesRedacted: true,
    });
    expect(auditPayload).not.toContain(issued.token);
    expect(auditPayload).not.toContain("baseSalary");
    expect(auditPayload).not.toContain("accountNumber");
    expect(auditPayload).not.toContain("A123456789");
  });

  it("uses the permission matrix again before report archive download", async () => {
    const job = await createCustomReportJob(hrSession, {
      datasetCode: "people_readiness",
      selectedFieldKeys: ["employee_no", "department"],
    });

    await updateReportPermission(hrSession, {
      datasetCode: "people_readiness",
      roleKey: "hr_admin",
      accessLevel: "summary",
      maskingMode: "masked",
      exportAllowed: "false",
    });

    await expect(issueReportArchiveDownloadToken(hrSession, job.archive.id)).rejects.toThrow(/不能匯出/);
  });
});
