import { writeAuditLog } from "@/server/audit/audit";
import { writeDemoAuditLog } from "@/server/audit/demo-store";
import { assertPermission, type RoleKey } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";
import type { AiSourceReference } from "./types";

type SessionLike = {
  role: RoleKey;
  tenantId?: string | null;
  companyId?: string | null;
  user?: { id: string; displayName: string } | null;
  employee?: { id: string; displayName: string } | null;
};

type PolicyDoc = AiSourceReference & {
  category: string;
  status: "draft" | "approved" | "inactive";
  version: string;
  sourceRef: string | null;
  keywords: string[];
  approvedAt: Date | null;
};

export type PolicyDocumentInput = {
  title: string;
  category: string;
  status: string;
  version?: string | null;
  sourceRef?: string | null;
  excerpt: string;
  keywords: string | string[];
};

type PolicyDocDemoState = {
  docs: PolicyDoc[];
};

const globalForPolicyDocs = globalThis as unknown as {
  hrOnePolicyDocDemoState?: PolicyDocDemoState;
};

export const defaultApprovedPolicyDocs: PolicyDoc[] = [
  {
    id: "policy-leave-annual-v1",
    title: "特休與請假政策 v1",
    category: "請假",
    status: "approved",
    version: "v1",
    sourceRef: "demo://policy/annual-leave-v1",
    excerpt:
      "員工送出請假時需填寫日期、單位與原因；系統會先保留假別餘額，並在主管核准後才正式扣抵。",
    keywords: ["leave", "annual", "vacation", "balance", "請假", "特休", "休假"],
    approvedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "rule-overtime-demo-2026-06",
    title: "台灣加班規則 2026.06",
    category: "出勤",
    status: "approved",
    version: "2026.06",
    sourceRef: "demo://rule/overtime-2026-06",
    excerpt:
      "加班申請需包含開始時間、結束時間與原因；當每日總工時超過設定門檻時，HR One 會提醒主管與 HR 複核。",
    keywords: ["overtime", "threshold", "加班", "工時"],
    approvedAt: new Date("2026-06-01T00:00:00.000Z"),
  },
  {
    id: "policy-payroll-close-v1",
    title: "薪資月結政策 v1",
    category: "薪資",
    status: "approved",
    version: "v1",
    sourceRef: "demo://policy/payroll-close-v1",
    excerpt:
      "薪資月結必須依序通過出勤完整性、待簽核、計算草稿、異常複核、HR 確認、鎖定與薪資單釋出步驟。",
    keywords: ["payroll", "close", "payslip", "salary", "薪資", "月結", "薪資單"],
    approvedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "policy-ai-safety-v1",
    title: "AI 使用安全政策 v1",
    category: "AI 安全",
    status: "approved",
    version: "v1",
    sourceRef: "demo://policy/ai-safety-v1",
    excerpt:
      "AI 可以摘要、解釋、草擬與建議核對步驟，但不得做出招募拒絕、解僱、薪資、績效或懲戒的最終決策。",
    keywords: ["ai", "copilot", "decision", "safety", "人工智慧", "決策"],
    approvedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
];

export async function getPolicyDocuments(session: SessionLike) {
  assertPermission(session.role, "ai:policy");
  if (canUseDatabase(session)) {
    try {
      const records = await getDb().companyPolicyDocument.findMany({
        where: { tenantId: session.tenantId, companyId: session.companyId },
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      });
      return records.map(readRecord);
    } catch {
      return getDemoState().docs;
    }
  }
  return getDemoState().docs;
}

export async function savePolicyDocument(session: SessionLike, input: PolicyDocumentInput) {
  assertPermission(session.role, "ai:form_builder");
  const normalized = normalizeInput(input);
  if (canUseDatabase(session)) {
    try {
      return saveDbPolicyDocument(session, normalized);
    } catch {
      return saveDemoPolicyDocument(session, normalized);
    }
  }
  return saveDemoPolicyDocument(session, normalized);
}

export async function findPolicySources(session: SessionLike, question: string) {
  assertPermission(session.role, "ai:policy");
  const normalized = question.toLowerCase();
  const docs = await getPolicyDocuments(session);
  return docs
    .filter((doc) => doc.status === "approved")
    .filter((doc) => doc.keywords.some((keyword) => normalized.includes(keyword.toLowerCase())))
    .map(toSourceReference);
}

export function resetPolicyDocumentDemoState() {
  globalForPolicyDocs.hrOnePolicyDocDemoState = {
    docs: defaultApprovedPolicyDocs.map((doc) => ({ ...doc, keywords: [...doc.keywords] })),
  };
}

async function saveDbPolicyDocument(
  session: SessionLike & { tenantId: string; companyId: string },
  input: ReturnType<typeof normalizeInput>,
) {
  const record = await getDb().$transaction(async (tx) => {
    const created = await tx.companyPolicyDocument.create({
      data: {
        tenantId: session.tenantId,
        companyId: session.companyId,
        title: input.title,
        category: input.category,
        status: input.status,
        version: input.version,
        sourceRef: input.sourceRef,
        excerpt: input.excerpt,
        keywordsJson: input.keywords,
        approvedByUserId: input.status === "approved" ? session.user?.id : null,
        approvedAt: input.status === "approved" ? new Date() : null,
        updatedByUserId: session.user?.id,
      },
    });
    await writeAuditLog(tx, {
      tenantId: session.tenantId,
      companyId: session.companyId,
      actorUserId: session.user?.id,
      actorEmployeeId: session.employee?.id,
      action: "create",
      entityType: "company_policy_document",
      entityId: created.id,
      before: null,
      after: {
        title: input.title,
        category: input.category,
        status: input.status,
        version: input.version,
        keywordCount: input.keywords.length,
      },
      metadata: auditMetadata(input),
    });
    return created;
  });
  return readRecord(record);
}

function saveDemoPolicyDocument(session: SessionLike, input: ReturnType<typeof normalizeInput>) {
  const doc: PolicyDoc = {
    id: crypto.randomUUID(),
    title: input.title,
    category: input.category,
    status: input.status,
    version: input.version,
    sourceRef: input.sourceRef,
    excerpt: input.excerpt,
    keywords: input.keywords,
    approvedAt: input.status === "approved" ? new Date() : null,
  };
  getDemoState().docs.unshift(doc);
  writeDemoAuditLog({
    tenantId: session.tenantId ?? "demo-tenant",
    companyId: session.companyId ?? "demo-company",
    actorUserId: session.user?.id,
    actorEmployeeId: session.employee?.id,
    actorName: session.user?.displayName ?? session.employee?.displayName,
    action: "create",
    entityType: "company_policy_document",
    entityId: doc.id,
    before: null,
    after: {
      title: input.title,
      category: input.category,
      status: input.status,
      version: input.version,
      keywordCount: input.keywords.length,
    },
    metadata: auditMetadata(input),
  });
  return doc;
}

function normalizeInput(input: PolicyDocumentInput) {
  const title = input.title.trim();
  const category = input.category.trim();
  const excerpt = input.excerpt.trim();
  if (title.length < 3) throw new Error("請填寫政策來源標題。");
  if (category.length < 2) throw new Error("請填寫政策來源類別。");
  if (excerpt.length < 20) throw new Error("政策摘錄需要足夠具體，AI 才能引用。");
  const keywords = normalizeKeywords(input.keywords);
  if (keywords.length === 0) throw new Error("請至少填寫一個關鍵字。");
  return {
    title,
    category,
    status: normalizeStatus(input.status),
    version: input.version?.trim() || "v1",
    sourceRef: input.sourceRef?.trim() || null,
    excerpt,
    keywords,
  };
}

function normalizeKeywords(value: string | string[]) {
  const values = Array.isArray(value) ? value : value.split(",");
  return [...new Set(values.map((keyword) => keyword.trim()).filter(Boolean))].slice(0, 20);
}

function normalizeStatus(value: string): PolicyDoc["status"] {
  if (value === "approved" || value === "inactive") return value;
  return "draft";
}

function auditMetadata(input: ReturnType<typeof normalizeInput>) {
  return {
    category: input.category,
    status: input.status,
    version: input.version,
    keywordCount: input.keywords.length,
    sourceRefStoredAsReferenceOnly: Boolean(input.sourceRef),
    excerptHashOnlyInAudit: true,
  };
}

function readRecord(record: {
  id: string;
  title: string;
  category: string;
  status: string;
  version: string;
  sourceRef: string | null;
  excerpt: string;
  keywordsJson: unknown;
  approvedAt: Date | null;
}): PolicyDoc {
  return {
    id: record.id,
    title: record.title,
    category: record.category,
    status: normalizeStatus(record.status),
    version: record.version,
    sourceRef: record.sourceRef,
    excerpt: record.excerpt,
    keywords: Array.isArray(record.keywordsJson)
      ? record.keywordsJson.filter((keyword): keyword is string => typeof keyword === "string")
      : [],
    approvedAt: record.approvedAt,
  };
}

function toSourceReference(doc: PolicyDoc): AiSourceReference {
  return {
    id: doc.id,
    title: `${doc.title} · ${doc.version}`,
    excerpt: doc.excerpt,
  };
}

function getDemoState() {
  if (!globalForPolicyDocs.hrOnePolicyDocDemoState) {
    resetPolicyDocumentDemoState();
  }
  return globalForPolicyDocs.hrOnePolicyDocDemoState!;
}

function canUseDatabase(
  session: SessionLike,
): session is SessionLike & { tenantId: string; companyId: string } {
  return Boolean(process.env.DATABASE_URL && session.tenantId && session.companyId);
}
