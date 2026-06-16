import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { stableHash } from "@/server/audit/redaction";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";
import { getFallbackCompanyOverview } from "@/server/demo/fallback";
import { recordBetaPilotAutomatedEvidence } from "@/server/readiness/beta-pilot-checkpoints";

type SessionLike = {
  role: RoleKey;
  tenantId: string | null;
  companyId: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

export type AnnouncementView = {
  id: string;
  title: string;
  body: string;
  category: string;
  status: "draft" | "published" | "archived";
  requireReceipt: boolean;
  publishedAt: Date;
  receiptCount: number;
  employeeCount: number;
  acknowledgedByCurrentEmployee: boolean;
};

type AnnouncementDemoState = {
  announcements: AnnouncementView[];
  receipts: Array<{ announcementId: string; employeeId: string; receiptHash: string; acknowledgedAt: Date }>;
};

const globalForAnnouncements = globalThis as unknown as {
  hrOneAnnouncementDemoState?: AnnouncementDemoState;
};

export async function getAnnouncementWorkspace(session: SessionLike) {
  if (session.role === "employee" || session.role === "manager") {
    assertPermission(session.role, "announcement:self");
  } else {
    assertPermission(session.role, "announcement:manage");
  }

  if (canUseDatabase(session)) {
    return getDbAnnouncementWorkspace(session as SessionLike & { tenantId: string; companyId: string });
  }
  return getDemoAnnouncementWorkspace(session);
}

export async function publishAnnouncement(session: SessionLike, input: {
  title: string;
  body: string;
  category: string;
  requireReceipt: boolean;
}) {
  assertPermission(session.role, "announcement:manage");
  const normalized = normalizeAnnouncement(input);
  if (canUseDatabase(session)) {
    return publishDbAnnouncement(session as SessionLike & { tenantId: string; companyId: string }, normalized);
  }
  return publishDemoAnnouncement(session, normalized);
}

export async function acknowledgeAnnouncement(session: SessionLike, announcementId: string) {
  assertPermission(session.role, "announcement:self");
  if (!session.employee?.id) throw new Error("Employee context is required.");
  const receiptId = canUseDatabase(session)
    ? await acknowledgeDbAnnouncement(session as SessionLike & { tenantId: string; companyId: string }, announcementId)
    : acknowledgeDemoAnnouncement(session, announcementId);
  await recordAnnouncementReceiptCheckpoint(session, receiptId);
  return receiptId;
}

async function recordAnnouncementReceiptCheckpoint(session: SessionLike, receiptId: string) {
  try {
    await recordBetaPilotAutomatedEvidence(session, {
      checkpointId: "day_1",
      evidenceType: "announcement_receipt",
      evidenceRef: `announcement_receipt:${receiptId}`,
      requiredEvidenceTypes: ["announcement_receipt"],
    });
  } catch {
    // Beta pilot evidence must never interrupt employee acknowledgement.
  }
}

async function getDbAnnouncementWorkspace(session: SessionLike & { tenantId: string; companyId: string }) {
  const [announcements, employeeCount] = await Promise.all([
    getDb().companyAnnouncement.findMany({
      where: { tenantId: session.tenantId, companyId: session.companyId, status: "published" },
      include: { receipts: true },
      orderBy: { publishedAt: "desc" },
    }),
    getDb().employee.count({
      where: { tenantId: session.tenantId, companyId: session.companyId, employmentStatus: "active" },
    }),
  ]);
  return {
    announcements: announcements.map((announcement) => ({
      id: announcement.id,
      title: announcement.title,
      body: announcement.body,
      category: announcement.category,
      status: readStatus(announcement.status),
      requireReceipt: announcement.requireReceipt,
      publishedAt: announcement.publishedAt,
      receiptCount: announcement.receipts.length,
      employeeCount,
      acknowledgedByCurrentEmployee: announcement.receipts.some((receipt) => receipt.employeeId === session.employee?.id),
    })),
  };
}

async function publishDbAnnouncement(
  session: SessionLike & { tenantId: string; companyId: string },
  input: ReturnType<typeof normalizeAnnouncement>,
) {
  const db = getDb();
  return db.$transaction(async (tx) => {
    const announcement = await tx.companyAnnouncement.create({
      data: {
        tenantId: session.tenantId,
        companyId: session.companyId,
        publishedByUserId: session.user?.id,
        ...input,
      },
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "create",
      entityType: "company_announcement",
      entityId: announcement.id,
      after: {
        title: announcement.title,
        category: announcement.category,
        requireReceipt: announcement.requireReceipt,
      },
      metadata: { bodyHash: stableHash(announcement.body) },
    });
    return announcement.id;
  });
}

async function acknowledgeDbAnnouncement(
  session: SessionLike & { tenantId: string; companyId: string },
  announcementId: string,
) {
  const db = getDb();
  return db.$transaction(async (tx) => {
    const announcement = await tx.companyAnnouncement.findFirst({
      where: { id: announcementId, tenantId: session.tenantId, companyId: session.companyId, status: "published" },
    });
    if (!announcement) throw new Error("Announcement not found.");
    const receiptHash = stableHash(`${announcement.id}:${session.employee!.id}:${announcement.publishedAt.toISOString()}`);
    const receipt = await tx.employeeAnnouncementReceipt.upsert({
      where: { announcementId_employeeId: { announcementId: announcement.id, employeeId: session.employee!.id } },
      create: {
        tenantId: session.tenantId,
        companyId: session.companyId,
        announcementId: announcement.id,
        employeeId: session.employee!.id,
        receiptHash,
      },
      update: { receiptHash, acknowledgedAt: new Date() },
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "create",
      entityType: "company_announcement_receipt",
      entityId: receipt.id,
      after: { announcementId: announcement.id, receiptHash },
      metadata: { source: receipt.source },
    });
    return receipt.id;
  });
}

function getDemoAnnouncementWorkspace(session: SessionLike) {
  const state = getDemoState();
  const employeeCount = getDemoEmployeeCount();
  return {
    announcements: state.announcements.map((announcement) => {
      const receipts = state.receipts.filter((receipt) => receipt.announcementId === announcement.id);
      return {
        ...announcement,
        receiptCount: receipts.length,
        employeeCount,
        acknowledgedByCurrentEmployee: receipts.some((receipt) => receipt.employeeId === session.employee?.id),
      };
    }),
  };
}

function publishDemoAnnouncement(session: SessionLike, input: ReturnType<typeof normalizeAnnouncement>) {
  const announcement: AnnouncementView = {
    id: crypto.randomUUID(),
    ...input,
    status: "published",
    publishedAt: new Date(),
    receiptCount: 0,
    employeeCount: getDemoEmployeeCount(),
    acknowledgedByCurrentEmployee: false,
  };
  getDemoState().announcements.unshift(announcement);
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.employee?.displayName ?? session.user?.displayName ?? "System",
    action: "create",
    entityType: "company_announcement",
    entityId: announcement.id,
    after: { title: announcement.title, category: announcement.category, requireReceipt: announcement.requireReceipt },
    metadata: { bodyHash: stableHash(announcement.body) },
  });
  return announcement.id;
}

function acknowledgeDemoAnnouncement(session: SessionLike, announcementId: string) {
  const state = getDemoState();
  const announcement = state.announcements.find((item) => item.id === announcementId);
  if (!announcement) throw new Error("Announcement not found.");
  const employeeId = session.employee!.id;
  const receiptHash = stableHash(`${announcement.id}:${employeeId}:${announcement.publishedAt.toISOString()}`);
  const existing = state.receipts.find((receipt) => receipt.announcementId === announcementId && receipt.employeeId === employeeId);
  if (existing) {
    existing.receiptHash = receiptHash;
    existing.acknowledgedAt = new Date();
    return existing.receiptHash;
  }
  state.receipts.unshift({ announcementId, employeeId, receiptHash, acknowledgedAt: new Date() });
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.employee?.displayName ?? session.user?.displayName ?? "System",
    action: "create",
    entityType: "company_announcement_receipt",
    entityId: announcementId,
    after: { announcementId, receiptHash },
    metadata: { source: "employee_self_service" },
  });
  return receiptHash;
}

function normalizeAnnouncement(input: {
  title: string;
  body: string;
  category: string;
  requireReceipt: boolean;
}) {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) throw new Error("公告標題為必填。");
  if (!body) throw new Error("公告內容為必填。");
  return {
    title: title.slice(0, 120),
    body: body.slice(0, 5000),
    category: (input.category.trim() || "一般").slice(0, 40),
    requireReceipt: Boolean(input.requireReceipt),
    status: "published" as const,
    publishedAt: new Date(),
  };
}

function readStatus(status: string): AnnouncementView["status"] {
  if (status === "draft" || status === "archived") return status;
  return "published";
}

export function resetAnnouncementDemoState() {
  const publishedAt = new Date("2026-06-01T01:00:00.000Z");
  const employeeCount = getDemoEmployeeCount();
  globalForAnnouncements.hrOneAnnouncementDemoState = {
    announcements: [{
      id: "demo-announcement-1",
      title: "六月薪資月結與出勤補正提醒",
      body: "請同仁於月底前確認出勤紀錄、補打卡與請假申請狀態；有缺漏請盡快送出申請。",
      category: "薪資月結",
      status: "published",
      requireReceipt: true,
      publishedAt,
      receiptCount: 0,
      employeeCount,
      acknowledgedByCurrentEmployee: false,
    }],
    receipts: [],
  };
}

function getDemoState() {
  if (!globalForAnnouncements.hrOneAnnouncementDemoState) resetAnnouncementDemoState();
  return globalForAnnouncements.hrOneAnnouncementDemoState!;
}

function getDemoEmployeeCount() {
  return getFallbackCompanyOverview().employeeCount;
}

function canUseDatabase(session: SessionLike) {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
