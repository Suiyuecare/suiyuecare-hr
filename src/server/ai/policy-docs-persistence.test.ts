import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiSessionLike } from "./types";

const hrSession: AiSessionLike = {
  role: "hr_admin",
  tenantId: "tenant-1",
  companyId: "company-1",
  user: { id: "user-hr", displayName: "HR" },
  employee: { id: "employee-hr", displayName: "HR" },
};

const policyInput = {
  title: "遠端工作政策",
  category: "人資政策",
  status: "approved",
  version: "v2",
  sourceRef: "handbook://remote/v2",
  excerpt: "遠端工作申請需填寫日期、工作地點、主管確認與緊急聯絡方式，並依公司核准政策辦理。",
  keywords: "遠端, remote, work",
};

describe("AI policy source persistence mode", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock("@/server/db/client");
  });

  it("reads policy sources from the tenant database in database mode", async () => {
    const findMany = vi.fn(async () => [
      {
        id: "policy-db-1",
        title: "遠端工作政策",
        category: "人資政策",
        status: "approved",
        version: "v2",
        sourceRef: "handbook://remote/v2",
        excerpt: "遠端工作申請需由主管核准。",
        keywordsJson: ["遠端", "remote"],
        approvedAt: new Date("2026-06-01T00:00:00.000Z"),
      },
    ]);
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        companyPolicyDocument: { findMany },
      }),
    }));

    const { getPolicyDocuments } = await import("./policy-docs");
    const docs = await getPolicyDocuments(hrSession);

    expect(docs[0]).toMatchObject({
      id: "policy-db-1",
      status: "approved",
      keywords: ["遠端", "remote"],
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", companyId: "company-1" },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    });
  });

  it("fails closed instead of returning demo policy sources when database reads fail", async () => {
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        companyPolicyDocument: {
          findMany: vi.fn(async () => {
            throw new Error("database policy source read failed");
          }),
        },
      }),
    }));

    const { getPolicyDocuments, resetPolicyDocumentDemoState } = await import("./policy-docs");
    resetPolicyDocumentDemoState();

    await expect(getPolicyDocuments(hrSession)).rejects.toThrow("database policy source read failed");
  });

  it("writes policy sources and audit logs to the tenant database in database mode", async () => {
    const created = {
      id: "policy-db-created",
      title: policyInput.title,
      category: policyInput.category,
      status: "approved",
      version: "v2",
      sourceRef: policyInput.sourceRef,
      excerpt: policyInput.excerpt,
      keywordsJson: ["遠端", "remote", "work"],
      approvedAt: new Date("2026-06-01T00:00:00.000Z"),
    };
    const createPolicy = vi.fn(async () => created);
    const createAudit = vi.fn(async () => ({ id: "audit-1" }));
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
          callback({
            companyPolicyDocument: { create: createPolicy },
            auditLog: { create: createAudit },
          }),
      }),
    }));

    const { savePolicyDocument } = await import("./policy-docs");
    const saved = await savePolicyDocument(hrSession, policyInput);

    expect(saved.id).toBe("policy-db-created");
    expect(createPolicy).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant-1",
        companyId: "company-1",
        title: policyInput.title,
        status: "approved",
        approvedByUserId: "user-hr",
      }),
    });
    expect(createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant-1",
        companyId: "company-1",
        actorUserId: "user-hr",
        entityType: "company_policy_document",
        entityId: "policy-db-created",
      }),
    });
  });

  it("fails closed instead of saving demo policy sources when database writes fail", async () => {
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        $transaction: vi.fn(async () => {
          throw new Error("database policy source write failed");
        }),
      }),
    }));

    const {
      getPolicyDocuments,
      resetPolicyDocumentDemoState,
      savePolicyDocument,
    } = await import("./policy-docs");
    resetPolicyDocumentDemoState();

    await expect(savePolicyDocument(hrSession, policyInput)).rejects.toThrow(
      "database policy source write failed",
    );
    delete process.env.DATABASE_URL;
    const demoDocs = await getPolicyDocuments(hrSession);
    expect(demoDocs.map((doc) => doc.title)).not.toContain(policyInput.title);
  });

  it("requires tenant and company context in database mode", async () => {
    const findMany = vi.fn();
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        companyPolicyDocument: { findMany },
      }),
    }));

    const { getPolicyDocuments, savePolicyDocument } = await import("./policy-docs");
    const sessionWithoutTenant = { ...hrSession, tenantId: null };

    await expect(getPolicyDocuments(sessionWithoutTenant)).rejects.toThrow(
      "tenant and company context",
    );
    await expect(savePolicyDocument(sessionWithoutTenant, policyInput)).rejects.toThrow(
      "tenant and company context",
    );
    expect(findMany).not.toHaveBeenCalled();
  });
});
