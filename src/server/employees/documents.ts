import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { assertPermission, hasPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";
import { getFallbackCompanyOverview } from "@/server/demo/fallback";
import { getFileStorageSettings, reserveObjectForUpload, type FileStorageSettings } from "@/server/files/storage";

type SessionLike = {
  role: RoleKey;
  tenantId?: string | null;
  companyId?: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type EmployeeDocumentInput = {
  employeeId: string;
  category: string;
  title: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  visibleToEmployee: boolean;
  expiresAt?: Date | null;
};

export type EmployeeDocumentRow = {
  id: string;
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  category: string;
  title: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  storageKey: string;
  storageProvider: string;
  storageBucket: string | null;
  objectKey: string;
  malwareScanStatus: "pending" | "not_required" | "clean" | "blocked";
  encryptionMode: string;
  retentionUntil: Date | null;
  downloadAuditRequired: boolean;
  status: "active" | "archived";
  visibleToEmployee: boolean;
  expiresAt: Date | null;
  uploadedAt: Date;
};

export type EmployeeDocumentWorkspace = {
  employees: Array<{ id: string; employeeNo: string; displayName: string }>;
  documents: EmployeeDocumentRow[];
  storageSettings: FileStorageSettings;
};

type DocumentDemoState = {
  documents: EmployeeDocumentRow[];
};

const globalForDocuments = globalThis as unknown as {
  hrOneDocumentDemoState?: DocumentDemoState;
};

export async function getEmployeeDocumentWorkspace(session: SessionLike): Promise<EmployeeDocumentWorkspace> {
  assertPermission(session.role, "employee:write");
  const storageSettings = await getFileStorageSettings(session);
  if (canUseDatabase(session)) {
    const [employees, documents] = await Promise.all([
      getDb().employee.findMany({
        where: { tenantId: session.tenantId!, companyId: session.companyId! },
        orderBy: { employeeNo: "asc" },
      }),
      getDb().employeeDocument.findMany({
        where: { tenantId: session.tenantId!, companyId: session.companyId! },
        include: { employee: true },
        orderBy: { uploadedAt: "desc" },
        take: 50,
      }),
    ]);
    return {
      employees: employees.map((employee) => ({
        id: employee.id,
        employeeNo: employee.employeeNo,
        displayName: employee.displayName,
      })),
      documents: documents.map(mapDbDocument),
      storageSettings,
    };
  }
  return demoWorkspace(storageSettings);
}

export async function getOwnEmployeeDocuments(session: SessionLike) {
  if (!session.employee) return [];
  if (!hasPermission(session.role, "dashboard:employee")) {
    throw new Error("Unauthorized document access.");
  }
  if (canUseDatabase(session)) {
    const documents = await getDb().employeeDocument.findMany({
      where: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        employeeId: session.employee.id,
        visibleToEmployee: true,
        status: "active",
      },
      include: { employee: true },
      orderBy: { uploadedAt: "desc" },
    });
    return documents.map(mapDbDocument);
  }
  return demoOwnDocuments(session.employee.id);
}

export async function createEmployeeDocument(session: SessionLike, input: EmployeeDocumentInput) {
  assertPermission(session.role, "employee:write");
  const normalized = normalizeInput(input);
  const objectReservation = await reserveObjectForUpload(session, normalized);
  const prepared = { ...normalized, ...objectReservation };
  if (canUseDatabase(session)) {
    return createDbDocument(session, prepared);
  }
  return createDemoDocument(session, prepared);
}

export function resetEmployeeDocumentDemoState() {
  globalForDocuments.hrOneDocumentDemoState = {
    documents: [],
  };
}

async function createDbDocument(
  session: SessionLike,
  input: ReturnType<typeof normalizeInput> & Awaited<ReturnType<typeof reserveObjectForUpload>>,
) {
  const db = getDb();
  const employee = await db.employee.findFirst({
    where: {
      id: input.employeeId,
      tenantId: session.tenantId!,
      companyId: session.companyId!,
    },
  });
  if (!employee) throw new Error("Employee not found.");

  return db.$transaction(async (tx) => {
    const created = await tx.employeeDocument.create({
      data: {
        tenantId: session.tenantId!,
        companyId: session.companyId!,
        employeeId: employee.id,
        category: input.category,
        title: input.title,
        fileName: input.fileName,
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSizeBytes,
        storageKey: input.storageKey,
        storageProvider: input.storageProvider,
        storageBucket: input.storageBucket,
        objectKey: input.objectKey,
        checksumSha256: input.checksumSha256,
        malwareScanStatus: input.malwareScanStatus,
        encryptionMode: input.encryptionMode,
        retentionUntil: input.retentionUntil,
        downloadAuditRequired: input.downloadAuditRequired,
        visibleToEmployee: input.visibleToEmployee,
        expiresAt: input.expiresAt,
        uploadedByUserId: session.user?.id,
      },
      include: { employee: true },
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId!,
      companyId: session.companyId!,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "create",
      entityType: "employee_document",
      entityId: created.id,
      after: {
        id: created.id,
        employeeId: employee.id,
        category: created.category,
        title: created.title,
        fileName: created.fileName,
        storageKey: created.storageKey,
        storageProvider: created.storageProvider,
        objectKey: created.objectKey,
        malwareScanStatus: created.malwareScanStatus,
        encryptionMode: created.encryptionMode,
        visibleToEmployee: created.visibleToEmployee,
      },
      metadata: {
        employeeId: employee.id,
        category: created.category,
        fileSizeBytes: created.fileSizeBytes,
        fileBytesStoredExternally: true,
        objectBytesIncluded: false,
        malwareScanStatus: created.malwareScanStatus,
        downloadAuditRequired: created.downloadAuditRequired,
      },
    });
    return mapDbDocument(created);
  });
}

function createDemoDocument(
  session: SessionLike,
  input: ReturnType<typeof normalizeInput> & Awaited<ReturnType<typeof reserveObjectForUpload>>,
) {
  const overview = getFallbackCompanyOverview();
  const employee = overview.company.employees.find((item) => item.id === input.employeeId);
  if (!employee) throw new Error("Employee not found.");
  const document: EmployeeDocumentRow = {
    id: crypto.randomUUID(),
    employeeId: employee.id,
    employeeNo: employee.employeeNo,
    employeeName: employee.displayName,
    category: input.category,
    title: input.title,
    fileName: input.fileName,
    mimeType: input.mimeType,
    fileSizeBytes: input.fileSizeBytes,
    storageKey: input.storageKey,
    storageProvider: input.storageProvider,
    storageBucket: input.storageBucket,
    objectKey: input.objectKey,
    malwareScanStatus: input.malwareScanStatus,
    encryptionMode: input.encryptionMode,
    retentionUntil: input.retentionUntil,
    downloadAuditRequired: input.downloadAuditRequired,
    status: "active",
    visibleToEmployee: input.visibleToEmployee,
    expiresAt: input.expiresAt,
    uploadedAt: new Date(),
  };
  getDemoState().documents.unshift(document);
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: "create",
    entityType: "employee_document",
    entityId: document.id,
    after: document,
    metadata: {
      employeeId: employee.id,
      category: document.category,
      fileSizeBytes: document.fileSizeBytes,
      fileBytesStoredExternally: true,
      objectBytesIncluded: false,
      malwareScanStatus: document.malwareScanStatus,
      downloadAuditRequired: document.downloadAuditRequired,
    },
  });
  return document;
}

function demoWorkspace(storageSettings: FileStorageSettings): EmployeeDocumentWorkspace {
  const overview = getFallbackCompanyOverview();
  return {
    employees: overview.company.employees.map((employee) => ({
      id: employee.id,
      employeeNo: employee.employeeNo,
      displayName: employee.displayName,
    })),
    documents: getDemoState().documents,
    storageSettings,
  };
}

function demoOwnDocuments(employeeId: string) {
  return getDemoState().documents.filter(
    (document) => document.employeeId === employeeId && document.visibleToEmployee && document.status === "active",
  );
}

function getDemoState() {
  if (!globalForDocuments.hrOneDocumentDemoState) {
    resetEmployeeDocumentDemoState();
  }
  return globalForDocuments.hrOneDocumentDemoState!;
}

function mapDbDocument(document: {
  id: string;
  employeeId: string;
  employee: { employeeNo: string; displayName: string };
  category: string;
  title: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  storageKey: string;
  storageProvider: string;
  storageBucket: string | null;
  objectKey: string;
  malwareScanStatus: string;
  encryptionMode: string;
  retentionUntil: Date | null;
  downloadAuditRequired: boolean;
  status: string;
  visibleToEmployee: boolean;
  expiresAt: Date | null;
  uploadedAt: Date;
}): EmployeeDocumentRow {
  return {
    id: document.id,
    employeeId: document.employeeId,
    employeeNo: document.employee.employeeNo,
    employeeName: document.employee.displayName,
    category: document.category,
    title: document.title,
    fileName: document.fileName,
    mimeType: document.mimeType,
    fileSizeBytes: document.fileSizeBytes,
    storageKey: document.storageKey,
    storageProvider: document.storageProvider,
    storageBucket: document.storageBucket,
    objectKey: document.objectKey || document.storageKey,
    malwareScanStatus: normalizeScanStatus(document.malwareScanStatus),
    encryptionMode: document.encryptionMode,
    retentionUntil: document.retentionUntil,
    downloadAuditRequired: document.downloadAuditRequired,
    status: document.status === "archived" ? "archived" : "active",
    visibleToEmployee: document.visibleToEmployee,
    expiresAt: document.expiresAt,
    uploadedAt: document.uploadedAt,
  };
}

function normalizeInput(input: EmployeeDocumentInput) {
  const category = input.category.trim();
  const title = input.title.trim();
  const fileName = input.fileName.trim();
  const mimeType = input.mimeType.trim() || "application/octet-stream";
  if (!input.employeeId) throw new Error("Employee is required.");
  if (!category) throw new Error("Category is required.");
  if (!title) throw new Error("Title is required.");
  if (!fileName) throw new Error("File name is required.");
  if (!Number.isFinite(input.fileSizeBytes) || input.fileSizeBytes <= 0) {
    throw new Error("File size must be greater than zero.");
  }
  return {
    employeeId: input.employeeId,
    category,
    title,
    fileName,
    mimeType,
    fileSizeBytes: Math.round(input.fileSizeBytes),
    visibleToEmployee: input.visibleToEmployee,
    expiresAt: input.expiresAt ?? null,
  };
}

function normalizeScanStatus(value: string): EmployeeDocumentRow["malwareScanStatus"] {
  if (value === "not_required" || value === "clean" || value === "blocked") return value;
  return "pending";
}

function canUseDatabase(
  session: SessionLike,
): session is SessionLike & { tenantId: string; companyId: string } {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
