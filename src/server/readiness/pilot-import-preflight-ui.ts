import { writeAuditLog } from "@/server/audit/audit";
import { getAuditDemoState, writeDemoAuditLog } from "@/server/audit/demo-store";
import { stableHash } from "@/server/audit/redaction";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";
import {
  buildPilotImportPreflightReport,
  pilotImportPreflightPassed,
  type PilotImportPreflightInput,
  type PilotImportPreflightReport,
} from "@/server/readiness/pilot-import-preflight";

type SessionLike = {
  role: RoleKey;
  tenantId: string | null;
  companyId: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type PilotImportPreflightPersistenceMode =
  | "database"
  | "demo"
  | "production_missing_database";

export type PilotImportPreflightSnapshot = {
  id: string;
  checkedAt: string;
  report: PilotImportPreflightReport;
  contentHash: string;
  rawCsvStored: false;
  sensitiveValuesReturned: false;
};

export type PilotImportPreflightWorkspace = {
  latestSnapshot: PilotImportPreflightSnapshot | null;
  readyForCustomerImport: boolean;
  persistence: {
    mode: PilotImportPreflightPersistenceMode;
    readyForLiveTrial: boolean;
    detail: string;
  };
  requiredFiles: Array<{
    title: string;
    fieldName: "employeeCsv" | "identityCsv" | "payrollCsv";
    description: string;
    placeholder: string;
  }>;
  commands: string[];
  privacyGuardrails: string[];
};

const entityType = "pilot_import_preflight";

export async function getPilotImportPreflightWorkspace(
  session: SessionLike,
): Promise<PilotImportPreflightWorkspace> {
  assertPermission(session.role, "settings:read");
  const latestSnapshot = await readLatestSnapshot(session);
  return {
    latestSnapshot,
    readyForCustomerImport: latestSnapshot ? pilotImportPreflightPassed(latestSnapshot.report) : false,
    persistence: getPersistenceStatus(session),
    requiredFiles: [
      {
        title: "員工主檔 CSV",
        fieldName: "employeeCsv",
        description: "employeeNo、姓名、職稱、部門、到職日與主管員編。",
        placeholder: "employeeNo,displayName,jobTitle,departmentCode,hireDate,managerEmployeeNo",
      },
      {
        title: "登入/SSO CSV",
        fieldName: "identityCsv",
        description: "employeeNo、公司 email 與外部身份供應商 subject。",
        placeholder: "employeeNo,email,externalSubject",
      },
      {
        title: "薪資 profile CSV",
        fieldName: "payrollCsv",
        description: "employeeNo、薪資設定、稅籍、保險級距與付款目的地。",
        placeholder: "employeeNo,baseSalary,hourlyWage,allowanceCode,allowanceName,allowanceAmount,deductionCode,deductionName,deductionAmount,taxResidency,dependentCount,laborInsuranceMonthlyWage,healthInsuranceMonthlyWage,laborPensionMonthlyWage,nonResidentWithholdingRatePercent,bankCode,bankBranchCode,accountName,accountNumber,effectiveFrom",
      },
    ],
    commands: [
      "pnpm pilot:import-template-pack",
      "pnpm pilot:import-preflight -- --employee-csv=<employee.csv> --identity-csv=<identity.csv> --payroll-csv=<payroll.csv>",
      "pnpm pilot:go-no-go -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --tenant-slug=<customer-slug>",
    ],
    privacyGuardrails: [
      "瀏覽器預檢只在本次 request 讀取 CSV 原文，不保存、不回顯完整列資料。",
      "audit log 只保存狀態、人數、阻擋數、提醒數、check 摘要與整包 content hash。",
      "不要把完成版身份、薪資、銀行資料貼到客服票、聊天工具、截圖或一般文件。",
      "預檢通過後仍要透過正式匯入流程寫入 employee、identity、payroll profile 與各自 audit log。",
    ],
  };
}

export async function runPilotImportPreflightForUi(
  session: SessionLike,
  input: PilotImportPreflightInput,
): Promise<PilotImportPreflightSnapshot> {
  assertPermission(session.role, "pilot:manage");
  if (isProductionDeployment() && !canUseDatabase(session)) {
    throw new Error("正式試用 CSV 預檢需要 DATABASE_URL 與 tenant/company context，避免證據只存在 demo 記憶體。");
  }

  const report = buildPilotImportPreflightReport(input);
  const snapshot: PilotImportPreflightSnapshot = {
    id: crypto.randomUUID(),
    checkedAt: report.checkedAt,
    report,
    contentHash: stableHash({
      employeeCsv: stableHash(input.employeeCsv),
      identityCsv: stableHash(input.identityCsv),
      payrollCsv: stableHash(input.payrollCsv),
      checkedAt: report.checkedAt,
    }),
    rawCsvStored: false,
    sensitiveValuesReturned: false,
  };

  if (canUseDatabase(session)) {
    await writeAuditLog(getDb(), {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "create",
      entityType,
      entityId: snapshot.id,
      after: snapshotAuditShape(snapshot),
      metadata: snapshotAuditMetadata(snapshot),
    });
  } else {
    writeDemoAuditLog({
      tenantId: session.tenantId ?? "demo-tenant",
      companyId: session.companyId ?? "demo-company",
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      actorName: session.employee?.displayName ?? session.user?.displayName,
      action: "create",
      entityType,
      entityId: snapshot.id,
      after: snapshotAuditShape(snapshot),
      metadata: snapshotAuditMetadata(snapshot),
    });
  }

  return snapshot;
}

export function resetPilotImportPreflightDemoState() {
  const state = getAuditDemoState();
  state.logs = state.logs.filter((log) => log.entityType !== entityType);
}

async function readLatestSnapshot(session: SessionLike) {
  if (canUseDatabase(session)) {
    const log = await getDb().auditLog.findFirst({
      where: {
        tenantId: session.tenantId,
        companyId: session.companyId,
        entityType,
      },
      orderBy: { createdAt: "desc" },
    });
    return log ? snapshotFromAuditMetadata(log.entityId, log.metadataJson) : null;
  }

  const log = getAuditDemoState().logs.find((entry) =>
    entry.tenantId === (session.tenantId ?? "demo-tenant") &&
    entry.companyId === (session.companyId ?? "demo-company") &&
    entry.entityType === entityType
  );
  return log ? snapshotFromAuditMetadata(log.entityId, log.metadataJson) : null;
}

function snapshotAuditShape(snapshot: PilotImportPreflightSnapshot) {
  return {
    id: snapshot.id,
    checkedAt: snapshot.checkedAt,
    status: snapshot.report.status,
    employeeRows: snapshot.report.employeeRows,
    identityRows: snapshot.report.identityRows,
    payrollRows: snapshot.report.payrollRows,
    managerWithDirectReportsCount: snapshot.report.managerWithDirectReportsCount,
    departmentCount: snapshot.report.departmentCount,
    blockers: snapshot.report.blockers,
    warnings: snapshot.report.warnings,
    contentHash: snapshot.contentHash,
    rawCsvStored: snapshot.rawCsvStored,
    sensitiveValuesReturned: snapshot.sensitiveValuesReturned,
  };
}

function snapshotAuditMetadata(snapshot: PilotImportPreflightSnapshot) {
  return {
    ...snapshotAuditShape(snapshot),
    report: {
      status: snapshot.report.status,
      checkedAt: snapshot.report.checkedAt,
      employeeRows: snapshot.report.employeeRows,
      identityRows: snapshot.report.identityRows,
      profileRows: snapshot.report.payrollRows,
      managerAssignmentCount: snapshot.report.managerAssignmentCount,
      managerWithDirectReportsCount: snapshot.report.managerWithDirectReportsCount,
      departmentCount: snapshot.report.departmentCount,
      blockers: snapshot.report.blockers,
      warnings: snapshot.report.warnings,
      checks: snapshot.report.checks.map((check) => ({
        name: check.name,
        status: check.status,
        detail: check.detail,
      })),
    },
    rawCsvStored: false,
    rawSensitiveDataIncluded: false,
    sensitiveValuesReturned: false,
    amountValuesIncluded: false,
    destinationValuesIncluded: false,
    identityNumberValuesIncluded: false,
    wellnessValuesIncluded: false,
  };
}

function snapshotFromAuditMetadata(
  id: string,
  metadata: unknown,
): PilotImportPreflightSnapshot | null {
  if (!isRecord(metadata)) return null;
  const report = parseReport(metadata.report);
  const checkedAt = readString(metadata.checkedAt) || report?.checkedAt;
  const contentHash = readString(metadata.contentHash);
  if (!report || !checkedAt || !contentHash) return null;
  return {
    id,
    checkedAt,
    report,
    contentHash,
    rawCsvStored: false,
    sensitiveValuesReturned: false,
  };
}

function parseReport(value: unknown): PilotImportPreflightReport | null {
  if (!isRecord(value)) return null;
  const status = readString(value.status);
  if (status !== "ready" && status !== "action_required" && status !== "blocked") return null;
  const checkedAt = readString(value.checkedAt);
  if (!checkedAt) return null;
  const checks = Array.isArray(value.checks)
    ? value.checks.map(parseCheck).filter((check): check is PilotImportPreflightReport["checks"][number] => Boolean(check))
    : [];
  return {
    status,
    checkedAt,
    employeeRows: readNumber(value.employeeRows),
    identityRows: readNumber(value.identityRows),
    payrollRows: readNumber(value.profileRows ?? value.payrollRows),
    managerAssignmentCount: readNumber(value.managerAssignmentCount),
    managerWithDirectReportsCount: readNumber(value.managerWithDirectReportsCount),
    departmentCount: readNumber(value.departmentCount),
    blockers: readNumber(value.blockers),
    warnings: readNumber(value.warnings),
    checks,
  };
}

function parseCheck(value: unknown): PilotImportPreflightReport["checks"][number] | null {
  if (!isRecord(value)) return null;
  const status = readString(value.status);
  if (status !== "pass" && status !== "warn" && status !== "block") return null;
  return {
    name: readString(value.name),
    status,
    detail: readString(value.detail),
  };
}

function getPersistenceStatus(session: SessionLike): PilotImportPreflightWorkspace["persistence"] {
  if (canUseDatabase(session)) {
    return {
      mode: "database",
      readyForLiveTrial: true,
      detail: "預檢 snapshot 會寫入 PostgreSQL audit log，僅保存去識別化結果與 content hash。",
    };
  }
  if (isProductionDeployment()) {
    return {
      mode: "production_missing_database",
      readyForLiveTrial: false,
      detail: "Production 尚未設定 DATABASE_URL，禁止用瀏覽器保存真實試用預檢證據。",
    };
  }
  return {
    mode: "demo",
    readyForLiveTrial: false,
    detail: "目前是本機/demo 暫存模式，可演練預檢 UI，但不能作為正式客戶試用證據。",
  };
}

function isProductionDeployment(env: Record<string, string | undefined> = process.env) {
  return env.HR_ONE_ENV === "production" || env.VERCEL_ENV === "production";
}

function canUseDatabase(
  session: SessionLike,
): session is SessionLike & { tenantId: string; companyId: string } {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(readString(value));
  return Number.isFinite(number) ? number : 0;
}
