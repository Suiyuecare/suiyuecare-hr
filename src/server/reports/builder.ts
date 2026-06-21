import type { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { stableHash } from "@/server/audit/redaction";
import { assertPermission, hasPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";

type SessionLike = {
  role: RoleKey;
  tenantId?: string | null;
  companyId?: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type ReportFieldSensitivity =
  | "public"
  | "internal"
  | "personal"
  | "payroll"
  | "bank"
  | "national_id"
  | "health";

export type ReportMaskingMode = "none" | "masked" | "aggregate_only" | "blocked";
export type ReportAccessLevel = "none" | "summary" | "detail" | "aggregate";

export type ReportDatasetDefinition = {
  code: string;
  name: string;
  category: string;
  description: string;
  sortOrder: number;
  fields: ReportFieldDefinition[];
};

export type ReportFieldDefinition = {
  key: string;
  label: string;
  valueType: "string" | "number" | "date" | "percent" | "status";
  sensitivity: ReportFieldSensitivity;
  maskingMode: ReportMaskingMode;
  exportable: boolean;
  sourceRef: string;
  description: string;
  sortOrder: number;
};

export type ReportDatasetView = Omit<ReportDatasetDefinition, "fields"> & {
  id: string;
  status: "active" | "inactive";
  fields: ReportFieldView[];
};

export type ReportFieldView = ReportFieldDefinition & {
  id: string;
  datasetCode: string;
  status: "active" | "inactive";
};

export type ReportJobView = {
  id: string;
  title: string;
  datasetCode: string;
  datasetName: string;
  purpose: string;
  status: "generated" | "queued" | "failed";
  format: "csv" | "xlsx";
  periodLabel: string;
  selectedFields: Array<{
    key: string;
    label: string;
    sensitivity: ReportFieldSensitivity;
    maskingMode: ReportMaskingMode;
  }>;
  rowCount: number;
  maskedFieldCount: number;
  contentHash: string;
  expiresAt: Date;
  createdAt: Date;
  archive: ReportArchiveView;
};

export type ReportArchiveView = {
  id: string;
  fileName: string;
  format: "csv" | "xlsx";
  status: "generated" | "downloaded" | "expired";
  recordCount: number;
  contentHash: string;
  downloadExpiresAt: Date;
  createdAt: Date;
};

export type ReportAdminWorkspace = {
  datasets: ReportDatasetView[];
  permissions: ReportPermissionView[];
  jobs: ReportJobView[];
  archives: ReportArchiveView[];
  summary: {
    datasetCount: number;
    fieldCount: number;
    permissionCount: number;
    exportAllowedPermissionCount: number;
    generatedJobCount: number;
    archiveCount: number;
    blockedSensitiveFieldCount: number;
  };
};

export type ReportPermissionView = {
  id: string;
  datasetCode: string;
  datasetName: string;
  datasetCategory: string;
  roleKey: RoleKey;
  accessLevel: ReportAccessLevel;
  maskingMode: ReportMaskingMode;
  exportAllowed: boolean;
  requiresReason: boolean;
  fieldKey: string | null;
  fieldLabel: string | null;
  fieldSensitivity: ReportFieldSensitivity | null;
  updatedAt: Date;
};

export type CreateCustomReportInput = {
  title?: string | null;
  datasetCode?: string | null;
  purpose?: string | null;
  format?: string | null;
  periodStart?: string | Date | null;
  periodEnd?: string | Date | null;
  selectedFieldKeys?: string[];
};

export type UpdateReportPermissionInput = {
  datasetCode?: string | null;
  roleKey?: string | null;
  accessLevel?: string | null;
  maskingMode?: string | null;
  exportAllowed?: boolean | string | null;
  requiresReason?: boolean | string | null;
};

type ReportDemoState = {
  jobs: ReportJobView[];
  archives: ReportArchiveView[];
  permissions: ReportPermissionView[] | null;
};

export const defaultReportCatalog: ReportDatasetDefinition[] = [
  {
    code: "people_readiness",
    name: "人事準備度",
    category: "people",
    description: "員工主檔、部門、主管線、名卡、工作條件、文件與訓練缺口。",
    sortOrder: 10,
    fields: [
      field("employee_no", "員工編號", "string", "internal", "none", true, "Employee.employeeNo", "員工內部編號。", 10),
      field("department", "部門", "string", "internal", "none", true, "Employee.department", "部門名稱與代碼。", 20),
      field("job_title", "職稱", "string", "internal", "none", true, "Employee.jobTitle", "職稱顯示名稱。", 30),
      field("hire_month", "到職月份", "date", "personal", "masked", true, "Employee.hireDate", "僅匯出月份，避免不必要個資揭露。", 40),
      field("manager_line", "主管線狀態", "status", "internal", "none", true, "Employee.managerId", "是否有有效主管線。", 50),
      field("labor_roster_status", "勞工名卡狀態", "status", "internal", "none", true, "EmployeeLaborRosterProfile.status", "勞基法第 7 條資料完整度。", 60),
      field("national_id", "身分證字號", "string", "national_id", "blocked", false, "EmployeeLaborRosterProfile.nationalIdHash", "只允許 hash 狀態，不允許報表匯出原文。", 99),
    ],
  },
  {
    code: "attendance_monthly",
    name: "出勤月結",
    category: "attendance",
    description: "漏打卡、工時風險、簽核與月結前異常解決率。",
    sortOrder: 20,
    fields: [
      field("exception_type", "異常類型", "string", "internal", "none", true, "AttendanceException.exceptionType", "漏打卡、工時風險或其他異常。", 10),
      field("severity", "風險等級", "status", "internal", "none", true, "AttendanceException.severity", "風險等級。", 20),
      field("resolution_status", "處理狀態", "status", "internal", "none", true, "AttendanceException.status", "是否已處理。", 30),
      field("auto_resolution_rate", "自動解決率", "percent", "internal", "aggregate_only", true, "AttendanceException", "彙總百分比，不輸出個人明細。", 40),
      field("employee_name", "員工姓名", "string", "personal", "masked", true, "Employee.displayName", "僅在必要時遮罩顯示。", 50),
    ],
  },
  {
    code: "payroll_close",
    name: "薪資月結狀態",
    category: "payroll",
    description: "薪資批次狀態、月結步驟、薪資單發布與未授權存取防漏。",
    sortOrder: 30,
    fields: [
      field("payroll_run_status", "薪資批次狀態", "status", "internal", "none", true, "PayrollRun.status", "月結狀態。", 10),
      field("open_close_steps", "未完成月結步驟", "number", "internal", "none", true, "PayrollCloseChecklist.steps", "阻擋或待處理步驟數。", 20),
      field("payslip_release_count", "薪資單發布數", "number", "payroll", "aggregate_only", true, "Payslip", "只輸出彙總數量，不輸出金額。", 30),
      field("payroll_amount_summary", "薪資金額摘要", "number", "payroll", "aggregate_only", true, "PayrollItem.amount", "只允許授權角色看彙總，不輸出個人金額。", 40),
      field("bank_account", "銀行帳號", "string", "bank", "blocked", false, "EmployeePaymentProfile.accountNumberHash", "報表只允許末四碼或 hash，不匯出帳號原文。", 99),
    ],
  },
  {
    code: "forms_audit",
    name: "表單與稽核",
    category: "forms",
    description: "自建表單、簽核狀態、稽核事件與封存證據。",
    sortOrder: 40,
    fields: [
      field("form_category", "表單分類", "string", "internal", "none", true, "FormTemplate.category", "表單分類。", 10),
      field("submission_status", "送出狀態", "status", "internal", "none", true, "FormSubmission.status", "表單送出與簽核狀態。", 20),
      field("approval_step", "目前簽核步驟", "status", "internal", "none", true, "ApprovalTask", "目前簽核節點。", 30),
      field("audit_event_count", "稽核事件數", "number", "internal", "aggregate_only", true, "AuditLog", "只輸出彙總與 hash 證據。", 40),
      field("private_note", "私人備註", "string", "health", "blocked", false, "metadataJson", "私人或健康相關內容不可進入報表匯出。", 99),
    ],
  },
];

const globalForReports = globalThis as unknown as {
  hrOneReportDemoState?: ReportDemoState;
};

export async function getReportAdminWorkspace(session: SessionLike): Promise<ReportAdminWorkspace> {
  assertPermission(session.role, "report:manage");
  const datasets = canUseDatabase(session)
    ? await getDbReportCatalog(session)
    : getDefaultCatalogViews();
  const permissions = canUseDatabase(session)
    ? await listDbReportPermissions(session, datasets)
    : getDemoReportPermissions(datasets);
  const jobs = canUseDatabase(session)
    ? await listDbReportJobs(session, datasets)
    : getDemoState().jobs;
  const archives = canUseDatabase(session)
    ? await listDbReportArchives(session)
    : getDemoState().archives;
  const fieldCount = datasets.reduce((sum, dataset) => sum + dataset.fields.length, 0);
  return {
    datasets,
    permissions,
    jobs,
    archives,
    summary: {
      datasetCount: datasets.length,
      fieldCount,
      permissionCount: permissions.length,
      exportAllowedPermissionCount: permissions.filter((permission) => permission.exportAllowed).length,
      generatedJobCount: jobs.length,
      archiveCount: archives.length,
      blockedSensitiveFieldCount: datasets
        .flatMap((dataset) => dataset.fields)
        .filter((field) => field.maskingMode === "blocked" || !field.exportable).length,
    },
  };
}

export async function createCustomReportJob(
  session: SessionLike,
  input: CreateCustomReportInput,
): Promise<ReportJobView> {
  assertPermission(session.role, "report:manage");
  const datasets = canUseDatabase(session)
    ? await getDbReportCatalog(session)
    : getDefaultCatalogViews();
  const permissions = canUseDatabase(session)
    ? await listDbReportPermissions(session, datasets)
    : getDemoReportPermissions(datasets);
  const dataset = findDataset(datasets, input.datasetCode);
  const permission = findDatasetPermission(permissions, dataset, session.role);
  assertDatasetPermission(permission, dataset, session.role);
  const selectedFields = applyPermissionToFields(permission, normalizeSelectedFields(dataset, input.selectedFieldKeys));
  assertFieldsAllowed(session.role, selectedFields);
  const rowCount = await estimateRowCount(session, dataset.code);
  const now = new Date();
  const period = normalizePeriod(input.periodStart, input.periodEnd);
  const title = normalizeTitle(input.title, `${dataset.name}報表`);
  const purpose = normalizePurpose(input.purpose);
  const format = normalizeFormat(input.format);
  const maskedFieldCount = selectedFields.filter((field) => field.maskingMode !== "none").length;
  const contentHash = stableHash({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    datasetCode: dataset.code,
    selectedFieldKeys: selectedFields.map((field) => field.key),
    periodStart: period.periodStart?.toISOString() ?? null,
    periodEnd: period.periodEnd?.toISOString() ?? null,
    rowCount,
    purpose,
    rawSensitiveValuesIncluded: false,
  });
  const expiresAt = addDays(now, 7);
  const archive: ReportArchiveView = {
    id: crypto.randomUUID(),
    fileName: buildArchiveFileName(dataset.code, now, format),
    format,
    status: "generated",
    recordCount: rowCount,
    contentHash,
    downloadExpiresAt: expiresAt,
    createdAt: now,
  };
  const draft: ReportJobView = {
    id: crypto.randomUUID(),
    title,
    datasetCode: dataset.code,
    datasetName: dataset.name,
    purpose,
    status: "generated",
    format,
    periodLabel: formatPeriodLabel(period.periodStart, period.periodEnd),
    selectedFields: selectedFields.map((field) => ({
      key: field.key,
      label: field.label,
      sensitivity: field.sensitivity,
      maskingMode: field.maskingMode,
    })),
    rowCount,
    maskedFieldCount,
    contentHash,
    expiresAt,
    createdAt: now,
    archive,
  };

  if (canUseDatabase(session)) {
    return createDbReportJob(session, datasets, dataset, selectedFields, draft, period);
  }
  return createDemoReportJob(session, draft);
}

export async function updateReportPermission(
  session: SessionLike,
  input: UpdateReportPermissionInput,
): Promise<ReportPermissionView> {
  assertPermission(session.role, "report:manage");
  const datasets = canUseDatabase(session)
    ? await getDbReportCatalog(session)
    : getDefaultCatalogViews();
  const dataset = findDataset(datasets, input.datasetCode);
  const normalized = normalizePermissionInput(dataset, input);
  if (canUseDatabase(session)) {
    return updateDbReportPermission(session, dataset, normalized);
  }
  return updateDemoReportPermission(session, dataset, normalized);
}

export function resetReportDemoState() {
  globalForReports.hrOneReportDemoState = {
    jobs: [],
    archives: [],
    permissions: null,
  };
}

function field(
  key: string,
  label: string,
  valueType: ReportFieldDefinition["valueType"],
  sensitivity: ReportFieldSensitivity,
  maskingMode: ReportMaskingMode,
  exportable: boolean,
  sourceRef: string,
  description: string,
  sortOrder: number,
): ReportFieldDefinition {
  return { key, label, valueType, sensitivity, maskingMode, exportable, sourceRef, description, sortOrder };
}

function getDemoState() {
  if (!globalForReports.hrOneReportDemoState) {
    resetReportDemoState();
  }
  return globalForReports.hrOneReportDemoState!;
}

function getDefaultCatalogViews(): ReportDatasetView[] {
  return defaultReportCatalog.map((dataset) => ({
    ...dataset,
    id: `default-${dataset.code}`,
    status: "active",
    fields: dataset.fields.map((fieldDefinition) => ({
      ...fieldDefinition,
      id: `default-${dataset.code}-${fieldDefinition.key}`,
      datasetCode: dataset.code,
      status: "active",
    })),
  }));
}

export function defaultReportPermissionFor(
  dataset: Pick<ReportDatasetView, "id" | "code" | "name" | "category">,
  roleKey: RoleKey,
): Omit<ReportPermissionView, "id" | "updatedAt"> {
  if (roleKey === "owner" || roleKey === "hr_admin") {
    return {
      datasetCode: dataset.code,
      datasetName: dataset.name,
      datasetCategory: dataset.category,
      roleKey,
      accessLevel: dataset.category === "payroll" ? "aggregate" : "detail",
      maskingMode: dataset.category === "payroll" ? "aggregate_only" : "none",
      exportAllowed: true,
      requiresReason: true,
      fieldKey: null,
      fieldLabel: null,
      fieldSensitivity: null,
    };
  }
  if (roleKey === "manager") {
    return {
      datasetCode: dataset.code,
      datasetName: dataset.name,
      datasetCategory: dataset.category,
      roleKey,
      accessLevel: dataset.category === "payroll" ? "none" : "summary",
      maskingMode: dataset.category === "payroll" ? "blocked" : "masked",
      exportAllowed: false,
      requiresReason: true,
      fieldKey: null,
      fieldLabel: null,
      fieldSensitivity: null,
    };
  }
  return {
    datasetCode: dataset.code,
    datasetName: dataset.name,
    datasetCategory: dataset.category,
    roleKey,
    accessLevel: "none",
    maskingMode: "blocked",
    exportAllowed: false,
    requiresReason: true,
    fieldKey: null,
    fieldLabel: null,
    fieldSensitivity: null,
  };
}

function buildDefaultReportPermissions(datasets: ReportDatasetView[]) {
  const now = new Date();
  return datasets.flatMap((dataset) =>
    (["owner", "hr_admin", "manager", "employee"] as RoleKey[]).map((roleKey) => ({
      id: `default-${dataset.code}-${roleKey}`,
      ...defaultReportPermissionFor(dataset, roleKey),
      updatedAt: now,
    })),
  );
}

function getDemoReportPermissions(datasets: ReportDatasetView[]) {
  const state = getDemoState();
  if (!state.permissions) {
    state.permissions = buildDefaultReportPermissions(datasets);
  }
  return state.permissions;
}

async function getDbReportCatalog(session: SessionLike & { tenantId: string; companyId: string }) {
  await ensureDbReportCatalog(session);
  const datasets = await getDb().reportDataset.findMany({
    where: {
      tenantId: session.tenantId,
      companyId: session.companyId,
      status: "active",
    },
    include: {
      fields: {
        where: { status: "active" },
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return datasets.map((dataset) => ({
    id: dataset.id,
    code: dataset.code,
    name: dataset.name,
    category: dataset.category,
    description: dataset.description,
    sortOrder: dataset.sortOrder,
    status: dataset.status === "inactive" ? "inactive" : "active",
    fields: dataset.fields.map((fieldRecord) => ({
      id: fieldRecord.id,
      datasetCode: dataset.code,
      key: fieldRecord.key,
      label: fieldRecord.label,
      valueType: normalizeValueType(fieldRecord.valueType),
      sensitivity: normalizeSensitivity(fieldRecord.sensitivity),
      maskingMode: normalizeMaskingMode(fieldRecord.maskingMode),
      exportable: fieldRecord.exportable,
      sourceRef: fieldRecord.sourceRef ?? "",
      description: fieldRecord.description ?? "",
      sortOrder: fieldRecord.sortOrder,
      status: fieldRecord.status === "inactive" ? "inactive" : "active",
    })),
  })) satisfies ReportDatasetView[];
}

async function listDbReportPermissions(
  session: SessionLike & { tenantId: string; companyId: string },
  datasets: ReportDatasetView[],
) {
  await ensureDbReportPermissions(session, datasets);
  const records = await getDb().reportPermission.findMany({
    where: {
      tenantId: session.tenantId,
      companyId: session.companyId,
    },
    include: {
      dataset: true,
      field: true,
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });
  const byKey = new Map<string, ReportPermissionView>();
  for (const record of records) {
    const mapped = mapDbPermission(record);
    const key = `${mapped.datasetCode}:${mapped.roleKey}:${mapped.fieldKey ?? "dataset"}`;
    if (!byKey.has(key)) byKey.set(key, mapped);
  }
  return [...byKey.values()].sort(sortReportPermissions);
}

async function ensureDbReportPermissions(
  session: SessionLike & { tenantId: string; companyId: string },
  datasets: ReportDatasetView[],
) {
  const db = getDb();
  for (const dataset of datasets) {
    for (const roleKey of ["owner", "hr_admin", "manager", "employee"] as RoleKey[]) {
      const existing = await db.reportPermission.findFirst({
        where: {
          tenantId: session.tenantId,
          companyId: session.companyId,
          datasetId: dataset.id,
          fieldId: null,
          roleKey,
        },
      });
      if (existing) continue;
      const defaults = defaultReportPermissionFor(dataset, roleKey);
      await db.reportPermission.create({
        data: {
          tenantId: session.tenantId,
          companyId: session.companyId,
          datasetId: dataset.id,
          roleKey,
          accessLevel: defaults.accessLevel,
          maskingMode: defaults.maskingMode,
          exportAllowed: defaults.exportAllowed,
          requiresReason: defaults.requiresReason,
        },
      });
    }
  }
}

async function ensureDbReportCatalog(session: SessionLike & { tenantId: string; companyId: string }) {
  const db = getDb();
  for (const datasetDefinition of defaultReportCatalog) {
    let dataset = await db.reportDataset.findUnique({
      where: {
        companyId_code: {
          companyId: session.companyId,
          code: datasetDefinition.code,
        },
      },
    });
    if (!dataset) {
      dataset = await db.reportDataset.create({
        data: {
          tenantId: session.tenantId,
          companyId: session.companyId,
          code: datasetDefinition.code,
          name: datasetDefinition.name,
          category: datasetDefinition.category,
          description: datasetDefinition.description,
          sortOrder: datasetDefinition.sortOrder,
        },
      });
    }
    for (const fieldDefinition of datasetDefinition.fields) {
      const existingField = await db.reportField.findUnique({
        where: {
          datasetId_key: {
            datasetId: dataset.id,
            key: fieldDefinition.key,
          },
        },
      });
      if (existingField) continue;
      await db.reportField.create({
        data: {
          tenantId: session.tenantId,
          companyId: session.companyId,
          datasetId: dataset.id,
          key: fieldDefinition.key,
          label: fieldDefinition.label,
          valueType: fieldDefinition.valueType,
          sensitivity: fieldDefinition.sensitivity,
          maskingMode: fieldDefinition.maskingMode,
          exportable: fieldDefinition.exportable,
          sourceRef: fieldDefinition.sourceRef,
          description: fieldDefinition.description,
          sortOrder: fieldDefinition.sortOrder,
        },
      });
    }
  }
}

async function listDbReportJobs(
  session: SessionLike & { tenantId: string; companyId: string },
  datasets: ReportDatasetView[],
) {
  const records = await getDb().reportJob.findMany({
    where: {
      tenantId: session.tenantId,
      companyId: session.companyId,
    },
    include: {
      dataset: true,
      archives: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  return records.map((record) => mapDbJob(record, datasets));
}

async function listDbReportArchives(session: SessionLike & { tenantId: string; companyId: string }) {
  const records = await getDb().reportExportArchive.findMany({
    where: {
      tenantId: session.tenantId,
      companyId: session.companyId,
    },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  return records.map(mapDbArchive);
}

async function createDbReportJob(
  session: SessionLike & { tenantId: string; companyId: string },
  datasets: ReportDatasetView[],
  dataset: ReportDatasetView,
  selectedFields: ReportFieldView[],
  draft: ReportJobView,
  period: { periodStart: Date | null; periodEnd: Date | null },
) {
  const db = getDb();
  const created = await db.$transaction(async (tx) => {
    const job = await tx.reportJob.create({
      data: {
        tenantId: session.tenantId,
        companyId: session.companyId,
        datasetId: dataset.id,
        title: draft.title,
        purpose: draft.purpose,
        status: draft.status,
        format: draft.format,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        selectedFieldKeysJson: selectedFields.map((fieldItem) => fieldItem.key) as Prisma.InputJsonValue,
        filterSummaryHash: stableHash({
          periodStart: period.periodStart?.toISOString() ?? null,
          periodEnd: period.periodEnd?.toISOString() ?? null,
          purpose: draft.purpose,
        }),
        rowCount: draft.rowCount,
        maskedFieldCount: draft.maskedFieldCount,
        contentHash: draft.contentHash,
        requestedByUserId: session.user?.id,
        expiresAt: draft.expiresAt,
        metadataJson: reportMetadata(dataset, selectedFields, draft) as Prisma.InputJsonValue,
      },
    });
    const archive = await tx.reportExportArchive.create({
      data: {
        tenantId: session.tenantId,
        companyId: session.companyId,
        reportJobId: job.id,
        fileName: draft.archive.fileName,
        format: draft.archive.format,
        status: draft.archive.status,
        recordCount: draft.archive.recordCount,
        contentHash: draft.archive.contentHash,
        downloadExpiresAt: draft.archive.downloadExpiresAt,
        generatedByUserId: session.user?.id,
        metadataJson: archiveMetadata(dataset, selectedFields, draft) as Prisma.InputJsonValue,
      },
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "create",
      entityType: "report_job",
      entityId: job.id,
      after: {
        datasetCode: dataset.code,
        selectedFieldKeys: selectedFields.map((fieldItem) => fieldItem.key),
        rowCount: draft.rowCount,
        contentHash: draft.contentHash,
      },
      metadata: reportMetadata(dataset, selectedFields, draft),
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "create",
      entityType: "report_export_archive",
      entityId: archive.id,
      after: {
        reportJobId: job.id,
        fileName: archive.fileName,
        contentHash: archive.contentHash,
      },
      metadata: archiveMetadata(dataset, selectedFields, draft),
    });
    return { job, archive };
  });

  return mapDbJob(
    {
      ...created.job,
      dataset: {
        code: dataset.code,
        name: dataset.name,
      },
      archives: [created.archive],
    },
    datasets,
  );
}

async function updateDbReportPermission(
  session: SessionLike & { tenantId: string; companyId: string },
  dataset: ReportDatasetView,
  input: NormalizedReportPermissionInput,
) {
  const db = getDb();
  await ensureDbReportPermissions(session, [dataset]);
  const result = await db.$transaction(async (tx) => {
    const existing = await tx.reportPermission.findFirst({
      where: {
        tenantId: session.tenantId,
        companyId: session.companyId,
        datasetId: dataset.id,
        fieldId: null,
        roleKey: input.roleKey,
      },
    });
    const data = {
      accessLevel: input.accessLevel,
      maskingMode: input.maskingMode,
      exportAllowed: input.exportAllowed,
      requiresReason: input.requiresReason,
    };
    const record = existing
      ? await tx.reportPermission.update({
          where: { id: existing.id },
          data,
          include: { dataset: true, field: true },
        })
      : await tx.reportPermission.create({
          data: {
            tenantId: session.tenantId,
            companyId: session.companyId,
            datasetId: dataset.id,
            roleKey: input.roleKey,
            ...data,
          },
          include: { dataset: true, field: true },
        });
    await writeAuditLog(tx, {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: existing ? "update" : "create",
      entityType: "report_permission",
      entityId: record.id,
      before: existing
        ? {
            datasetCode: dataset.code,
            roleKey: existing.roleKey,
            accessLevel: existing.accessLevel,
            maskingMode: existing.maskingMode,
            exportAllowed: existing.exportAllowed,
            requiresReason: existing.requiresReason,
          }
        : null,
      after: {
        datasetCode: dataset.code,
        roleKey: record.roleKey,
        accessLevel: record.accessLevel,
        maskingMode: record.maskingMode,
        exportAllowed: record.exportAllowed,
        requiresReason: record.requiresReason,
      },
      metadata: permissionMetadata(dataset, input),
    });
    return record;
  });
  return mapDbPermission(result);
}

function updateDemoReportPermission(
  session: SessionLike,
  dataset: ReportDatasetView,
  input: NormalizedReportPermissionInput,
) {
  const state = getDemoState();
  const permissions = getDemoReportPermissions(getDefaultCatalogViews());
  const index = permissions.findIndex(
    (permission) =>
      permission.datasetCode === dataset.code &&
      permission.roleKey === input.roleKey &&
      permission.fieldKey === null,
  );
  const before = index >= 0 ? permissions[index] : null;
  const next: ReportPermissionView = {
    id: before?.id ?? crypto.randomUUID(),
    datasetCode: dataset.code,
    datasetName: dataset.name,
    datasetCategory: dataset.category,
    roleKey: input.roleKey,
    accessLevel: input.accessLevel,
    maskingMode: input.maskingMode,
    exportAllowed: input.exportAllowed,
    requiresReason: input.requiresReason,
    fieldKey: null,
    fieldLabel: null,
    fieldSensitivity: null,
    updatedAt: new Date(),
  };
  if (index >= 0) {
    permissions[index] = next;
  } else {
    permissions.push(next);
  }
  state.permissions = permissions.sort(sortReportPermissions);
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: before ? "update" : "create",
    entityType: "report_permission",
    entityId: next.id,
    before,
    after: next,
    metadata: permissionMetadata(dataset, input),
  });
  return next;
}

function createDemoReportJob(session: SessionLike, draft: ReportJobView) {
  const state = getDemoState();
  state.jobs.unshift(draft);
  state.archives.unshift(draft.archive);
  const dataset = getDefaultCatalogViews().find((item) => item.code === draft.datasetCode);
  const fields = dataset?.fields.filter((fieldItem) =>
    draft.selectedFields.some((selected) => selected.key === fieldItem.key),
  ) ?? [];
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: "create",
    entityType: "report_job",
    entityId: draft.id,
    after: {
      datasetCode: draft.datasetCode,
      selectedFieldKeys: draft.selectedFields.map((fieldItem) => fieldItem.key),
      rowCount: draft.rowCount,
      contentHash: draft.contentHash,
    },
    metadata: dataset ? reportMetadata(dataset, fields, draft) : {},
  });
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: "create",
    entityType: "report_export_archive",
    entityId: draft.archive.id,
    after: {
      reportJobId: draft.id,
      fileName: draft.archive.fileName,
      contentHash: draft.archive.contentHash,
    },
    metadata: dataset ? archiveMetadata(dataset, fields, draft) : {},
  });
  return draft;
}

function mapDbJob(
  record: {
    id: string;
    title: string;
    purpose: string;
    status: string;
    format: string;
    periodStart: Date | null;
    periodEnd: Date | null;
    selectedFieldKeysJson: Prisma.JsonValue;
    rowCount: number;
    maskedFieldCount: number;
    contentHash: string;
    expiresAt: Date;
    createdAt: Date;
    dataset: { code: string; name: string };
    archives: Array<{
      id: string;
      fileName: string;
      format: string;
      status: string;
      recordCount: number;
      contentHash: string;
      downloadExpiresAt: Date;
      createdAt: Date;
    }>;
  },
  datasets: ReportDatasetView[],
): ReportJobView {
  const dataset = datasets.find((item) => item.code === record.dataset.code);
  const fieldKeys = readStringArray(record.selectedFieldKeysJson);
  const selectedFields = fieldKeys.map((key) => {
    const fieldItem = dataset?.fields.find((field) => field.key === key);
    return {
      key,
      label: fieldItem?.label ?? key,
      sensitivity: fieldItem?.sensitivity ?? "internal",
      maskingMode: fieldItem?.maskingMode ?? "masked",
    };
  });
  const archive = record.archives[0]
    ? mapDbArchive(record.archives[0])
    : {
        id: `${record.id}-archive-missing`,
        fileName: "missing-archive.csv",
        format: normalizeFormat(record.format),
        status: "generated" as const,
        recordCount: record.rowCount,
        contentHash: record.contentHash,
        downloadExpiresAt: record.expiresAt,
        createdAt: record.createdAt,
      };
  return {
    id: record.id,
    title: record.title,
    datasetCode: record.dataset.code,
    datasetName: record.dataset.name,
    purpose: record.purpose,
    status: normalizeJobStatus(record.status),
    format: normalizeFormat(record.format),
    periodLabel: formatPeriodLabel(record.periodStart, record.periodEnd),
    selectedFields,
    rowCount: record.rowCount,
    maskedFieldCount: record.maskedFieldCount,
    contentHash: record.contentHash,
    expiresAt: record.expiresAt,
    createdAt: record.createdAt,
    archive,
  };
}

function mapDbArchive(record: {
  id: string;
  fileName: string;
  format: string;
  status: string;
  recordCount: number;
  contentHash: string;
  downloadExpiresAt: Date;
  createdAt: Date;
}): ReportArchiveView {
  return {
    id: record.id,
    fileName: record.fileName,
    format: normalizeFormat(record.format),
    status: normalizeArchiveStatus(record.status),
    recordCount: record.recordCount,
    contentHash: record.contentHash,
    downloadExpiresAt: record.downloadExpiresAt,
    createdAt: record.createdAt,
  };
}

function mapDbPermission(record: {
  id: string;
  roleKey: RoleKey;
  accessLevel: string;
  maskingMode: string;
  exportAllowed: boolean;
  requiresReason: boolean;
  updatedAt: Date;
  dataset: {
    code: string;
    name: string;
    category: string;
  } | null;
  field: {
    key: string;
    label: string;
    sensitivity: string;
  } | null;
}): ReportPermissionView {
  return {
    id: record.id,
    datasetCode: record.dataset?.code ?? "unknown",
    datasetName: record.dataset?.name ?? "未知資料集",
    datasetCategory: record.dataset?.category ?? "unknown",
    roleKey: record.roleKey,
    accessLevel: normalizeAccessLevel(record.accessLevel),
    maskingMode: normalizeMaskingMode(record.maskingMode),
    exportAllowed: record.exportAllowed,
    requiresReason: record.requiresReason,
    fieldKey: record.field?.key ?? null,
    fieldLabel: record.field?.label ?? null,
    fieldSensitivity: record.field ? normalizeSensitivity(record.field.sensitivity) : null,
    updatedAt: record.updatedAt,
  };
}

function findDataset(datasets: ReportDatasetView[], datasetCode: string | null | undefined) {
  const normalized = datasetCode?.trim() || datasets[0]?.code;
  const dataset = datasets.find((item) => item.code === normalized && item.status === "active");
  if (!dataset) throw new Error("請選擇有效的報表資料集。");
  return dataset;
}

function findDatasetPermission(
  permissions: ReportPermissionView[],
  dataset: ReportDatasetView,
  roleKey: RoleKey,
) {
  return permissions.find(
    (permission) =>
      permission.datasetCode === dataset.code &&
      permission.roleKey === roleKey &&
      permission.fieldKey === null,
  ) ?? {
    id: `default-${dataset.code}-${roleKey}`,
    ...defaultReportPermissionFor(dataset, roleKey),
    updatedAt: new Date(),
  };
}

function assertDatasetPermission(
  permission: ReportPermissionView,
  dataset: ReportDatasetView,
  roleKey: RoleKey,
) {
  if (!permission.exportAllowed || permission.accessLevel === "none") {
    throw new Error(`${roleKey} 目前不能匯出 ${dataset.name} 報表。`);
  }
}

function normalizeSelectedFields(dataset: ReportDatasetView, selectedFieldKeys: string[] | undefined) {
  const requested = new Set((selectedFieldKeys ?? []).map((key) => key.trim()).filter(Boolean));
  const defaultFields = dataset.fields
    .filter((fieldItem) => fieldItem.exportable && fieldItem.maskingMode !== "blocked")
    .slice(0, 4)
    .map((fieldItem) => fieldItem.key);
  const selectedKeys = requested.size ? [...requested] : defaultFields;
  const selectedFields = selectedKeys.map((key) => dataset.fields.find((fieldItem) => fieldItem.key === key));
  if (selectedFields.some((fieldItem) => !fieldItem)) {
    throw new Error("選取欄位不屬於目前報表資料集。");
  }
  const fields = selectedFields.filter(Boolean) as ReportFieldView[];
  if (!fields.length) throw new Error("至少選擇一個報表欄位。");
  return fields;
}

function applyPermissionToFields(permission: ReportPermissionView, fields: ReportFieldView[]) {
  return fields.map((fieldItem) => ({
    ...fieldItem,
    maskingMode: combineMaskingModes(fieldItem.maskingMode, permission.maskingMode),
  }));
}

function assertFieldsAllowed(role: RoleKey, fields: ReportFieldView[]) {
  const blocked = fields.find((fieldItem) => fieldItem.maskingMode === "blocked" || !fieldItem.exportable);
  if (blocked) {
    throw new Error(`${blocked.label} 不可匯出；報表只允許遮罩、彙總或 hash 證據。`);
  }
  const payrollField = fields.find((fieldItem) => fieldItem.sensitivity === "payroll");
  if (payrollField && !hasPermission(role, "payroll:manage")) {
    throw new Error("薪資報表欄位需要薪資管理權限。");
  }
}

async function estimateRowCount(session: SessionLike, datasetCode: string) {
  if (!canUseDatabase(session)) {
    if (datasetCode === "attendance_monthly") return 1;
    if (datasetCode === "payroll_close") return 1;
    if (datasetCode === "forms_audit") return 6;
    return 25;
  }
  const db = getDb();
  if (datasetCode === "attendance_monthly") {
    return db.attendanceException.count({
      where: { tenantId: session.tenantId!, companyId: session.companyId! },
    });
  }
  if (datasetCode === "payroll_close") {
    return db.payrollRun.count({
      where: { tenantId: session.tenantId!, companyId: session.companyId! },
    });
  }
  if (datasetCode === "forms_audit") {
    return db.auditLog.count({
      where: { tenantId: session.tenantId!, companyId: session.companyId! },
    });
  }
  return db.employee.count({
    where: { tenantId: session.tenantId!, companyId: session.companyId! },
  });
}

function reportMetadata(dataset: ReportDatasetView, fields: ReportFieldView[], draft: ReportJobView) {
  return {
    datasetCode: dataset.code,
    fieldCount: fields.length,
    selectedFieldKeys: fields.map((fieldItem) => fieldItem.key),
    fieldSensitivities: fields.map((fieldItem) => fieldItem.sensitivity),
    maskingModes: fields.map((fieldItem) => fieldItem.maskingMode),
    maskedFieldCount: draft.maskedFieldCount,
    rowCount: draft.rowCount,
    contentHash: draft.contentHash,
    rawSensitiveValuesIncluded: false,
    salaryValuesIncluded: false,
    bankAccountValuesIncluded: false,
    nationalIdValuesIncluded: false,
    healthValuesIncluded: false,
    privateNotesIncluded: false,
  };
}

type NormalizedReportPermissionInput = {
  roleKey: RoleKey;
  accessLevel: ReportAccessLevel;
  maskingMode: ReportMaskingMode;
  exportAllowed: boolean;
  requiresReason: boolean;
};

function normalizePermissionInput(
  dataset: ReportDatasetView,
  input: UpdateReportPermissionInput,
): NormalizedReportPermissionInput {
  const roleKey = normalizeReportRole(input.roleKey);
  const defaults = defaultReportPermissionFor(dataset, roleKey);
  const requestedAccessLevel = normalizeAccessLevel(input.accessLevel ?? defaults.accessLevel);
  const requestedMaskingMode = normalizeMaskingMode(input.maskingMode ?? defaults.maskingMode);
  const canExportRole = roleKey === "owner" || roleKey === "hr_admin";
  const exportAllowed = canExportRole && readBoolean(input.exportAllowed, defaults.exportAllowed);
  const accessLevel = normalizeAccessForDataset(dataset, roleKey, requestedAccessLevel, exportAllowed);
  const maskingMode = normalizeMaskingForDataset(dataset, roleKey, requestedMaskingMode, exportAllowed);
  return {
    roleKey,
    accessLevel,
    maskingMode,
    exportAllowed,
    requiresReason: exportAllowed ? readBoolean(input.requiresReason, true) : true,
  };
}

function normalizeAccessForDataset(
  dataset: ReportDatasetView,
  roleKey: RoleKey,
  accessLevel: ReportAccessLevel,
  exportAllowed: boolean,
): ReportAccessLevel {
  if (roleKey === "employee") return "none";
  if (roleKey === "manager" && dataset.category === "payroll") return "none";
  if (!exportAllowed && accessLevel === "detail") return "summary";
  if (dataset.category === "payroll" && exportAllowed) return "aggregate";
  return accessLevel;
}

function normalizeMaskingForDataset(
  dataset: ReportDatasetView,
  roleKey: RoleKey,
  maskingMode: ReportMaskingMode,
  exportAllowed: boolean,
): ReportMaskingMode {
  if (roleKey === "employee") return "blocked";
  if (roleKey === "manager" && dataset.category === "payroll") return "blocked";
  if (!exportAllowed) return combineMaskingModes(maskingMode, "masked");
  if (dataset.category === "payroll") return combineMaskingModes(maskingMode, "aggregate_only");
  return maskingMode;
}

function normalizeReportRole(value: string | null | undefined): RoleKey {
  if (value === "owner" || value === "hr_admin" || value === "manager" || value === "employee") return value;
  return "employee";
}

function normalizeAccessLevel(value: string | null | undefined): ReportAccessLevel {
  if (value === "none" || value === "summary" || value === "detail" || value === "aggregate") return value;
  return "summary";
}

function combineMaskingModes(current: ReportMaskingMode, required: ReportMaskingMode): ReportMaskingMode {
  const weight: Record<ReportMaskingMode, number> = {
    none: 0,
    masked: 1,
    aggregate_only: 2,
    blocked: 3,
  };
  return weight[required] > weight[current] ? required : current;
}

function readBoolean(value: boolean | string | null | undefined, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "on" || value === "1") return true;
  if (value === "false" || value === "off" || value === "0") return false;
  return fallback;
}

function permissionMetadata(dataset: ReportDatasetView, input: NormalizedReportPermissionInput) {
  return {
    datasetCode: dataset.code,
    datasetCategory: dataset.category,
    roleKey: input.roleKey,
    accessLevel: input.accessLevel,
    maskingMode: input.maskingMode,
    exportAllowed: input.exportAllowed,
    requiresReason: input.requiresReason,
    fieldLevelOverride: false,
    rawSensitiveValuesIncluded: false,
  };
}

function archiveMetadata(dataset: ReportDatasetView, fields: ReportFieldView[], draft: ReportJobView) {
  return {
    reportJobId: draft.id,
    datasetCode: dataset.code,
    fileName: draft.archive.fileName,
    format: draft.archive.format,
    contentHash: draft.archive.contentHash,
    recordCount: draft.archive.recordCount,
    downloadExpiresAt: draft.archive.downloadExpiresAt.toISOString(),
    selectedFieldKeys: fields.map((fieldItem) => fieldItem.key),
    manifestOnly: true,
    rawRowsIncluded: false,
    sensitiveValuesRedacted: true,
  };
}

function normalizeTitle(value: string | null | undefined, fallback: string) {
  const cleaned = value?.trim().replace(/\s+/g, " ").slice(0, 80);
  return cleaned || fallback;
}

function normalizePurpose(value: string | null | undefined) {
  const allowed = new Set([
    "management_review",
    "monthly_close",
    "labor_inspection",
    "audit_archive",
    "pilot_readiness",
  ]);
  const normalized = value?.trim() || "management_review";
  return allowed.has(normalized) ? normalized : "management_review";
}

function normalizeFormat(value: string | null | undefined): "csv" | "xlsx" {
  return value === "xlsx" ? "xlsx" : "csv";
}

function normalizePeriod(
  periodStart: string | Date | null | undefined,
  periodEnd: string | Date | null | undefined,
) {
  const start = readDate(periodStart);
  const end = readDate(periodEnd);
  if (start && end && end < start) {
    throw new Error("報表結束日期不可早於開始日期。");
  }
  return {
    periodStart: start,
    periodEnd: end,
  };
}

function readDate(value: string | Date | null | undefined) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatPeriodLabel(periodStart: Date | null, periodEnd: Date | null) {
  if (!periodStart && !periodEnd) return "未指定期間";
  const start = periodStart ? formatDate(periodStart) : "不限";
  const end = periodEnd ? formatDate(periodEnd) : "不限";
  return `${start} - ${end}`;
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function buildArchiveFileName(datasetCode: string, now: Date, format: "csv" | "xlsx") {
  return `hr-one-${datasetCode}-${formatDate(now).replaceAll("-", "")}.${format}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function readStringArray(value: Prisma.JsonValue) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function normalizeValueType(value: string): ReportFieldDefinition["valueType"] {
  if (value === "number" || value === "date" || value === "percent" || value === "status") return value;
  return "string";
}

function normalizeSensitivity(value: string): ReportFieldSensitivity {
  if (
    value === "public" ||
    value === "internal" ||
    value === "personal" ||
    value === "payroll" ||
    value === "bank" ||
    value === "national_id" ||
    value === "health"
  ) return value;
  return "internal";
}

function normalizeMaskingMode(value: string): ReportMaskingMode {
  if (value === "none" || value === "masked" || value === "aggregate_only" || value === "blocked") return value;
  return "masked";
}

function normalizeJobStatus(value: string): ReportJobView["status"] {
  if (value === "queued" || value === "failed") return value;
  return "generated";
}

function normalizeArchiveStatus(value: string): ReportArchiveView["status"] {
  if (value === "downloaded" || value === "expired") return value;
  return "generated";
}

function sortReportPermissions(left: ReportPermissionView, right: ReportPermissionView) {
  const roleOrder: Record<RoleKey, number> = {
    owner: 0,
    hr_admin: 1,
    manager: 2,
    employee: 3,
  };
  return (
    left.datasetCode.localeCompare(right.datasetCode) ||
    roleOrder[left.roleKey] - roleOrder[right.roleKey] ||
    (left.fieldKey ?? "").localeCompare(right.fieldKey ?? "")
  );
}

function canUseDatabase(
  session: SessionLike,
): session is SessionLike & { tenantId: string; companyId: string } {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
