import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiSessionLike } from "./types";

const hrSession: AiSessionLike = {
  role: "hr_admin",
  tenantId: "tenant-1",
  companyId: "company-1",
  user: { id: "user-hr", displayName: "HR" },
  employee: { id: "employee-hr", displayName: "HR" },
};

const policyAnswer = {
  label: "AI 建議" as const,
  answer: "依據核准政策來源，請假需由主管核准。",
  confidence: "sufficient" as const,
  sources: [
    {
      id: "policy-1",
      title: "請假政策 v1",
      excerpt: "請假需由主管核准。",
    },
  ],
  outputHash: "hash-output-1",
};

describe("AI Copilot result storage", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock("@/server/db/client");
  });

  it("stores and reads temporary Copilot results in demo mode only when no database is configured", async () => {
    delete process.env.DATABASE_URL;
    const { resetAiDemoState } = await import("./demo-store");
    const { getAiResult, storeAiResult } = await import("./results");
    resetAiDemoState();

    const resultId = await storeAiResult(hrSession, "policy_qa", policyAnswer);
    const result = await getAiResult(hrSession, resultId);

    expect(result).toMatchObject({
      id: resultId,
      category: "policy_qa",
      result: policyAnswer,
    });
  });

  it("writes Copilot results to tenant-scoped database storage in database mode", async () => {
    const create = vi.fn(async () => ({ id: "ai-result-1" }));
    const auditLogCreate = vi.fn(async () => ({ id: "audit-1" }));
    const transaction = vi.fn(
      async (callback: (tx: { aiCopilotResult: { create: typeof create }; auditLog: { create: typeof auditLogCreate } }) => Promise<unknown>) =>
        callback({
          aiCopilotResult: { create },
          auditLog: { create: auditLogCreate },
        }),
    );
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({ $transaction: transaction }),
    }));

    const { storeAiResult } = await import("./results");
    const resultId = await storeAiResult(hrSession, "policy_qa", policyAnswer);

    expect(resultId).toBe("ai-result-1");
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant-1",
        companyId: "company-1",
        actorUserId: "user-hr",
        category: "policy_qa",
        resultJson: policyAnswer,
        outputHash: "hash-output-1",
        expiresAt: expect.any(Date),
      }),
    });
    expect(auditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant-1",
        companyId: "company-1",
        actorUserId: "user-hr",
        action: "create",
        entityType: "ai_copilot_result",
        entityId: "ai-result-1",
        beforeHash: null,
        afterHash: expect.any(String),
        metadataJson: expect.objectContaining({
          aiCategory: "policy_qa",
          outputHash: "hash-output-1",
          maintenanceAction: "temporary_result_store",
          resultJsonStoredInAudit: false,
          rawResultStoredInAudit: false,
        }),
      }),
    });
  });

  it("reads only unexpired Copilot results owned by the same tenant, company, and user", async () => {
    const findFirst = vi.fn(async () => ({
      id: "ai-result-1",
      category: "policy_qa",
      createdAt: new Date("2026-06-22T00:00:00.000Z"),
      resultJson: policyAnswer,
    }));
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        aiCopilotResult: { findFirst },
      }),
    }));

    const { getAiResult } = await import("./results");
    const result = await getAiResult(hrSession, "ai-result-1");

    expect(result?.result).toEqual(policyAnswer);
    expect(findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "ai-result-1",
        tenantId: "tenant-1",
        companyId: "company-1",
        actorUserId: "user-hr",
        expiresAt: { gt: expect.any(Date) },
      }),
    });
  });

  it("fails closed instead of falling back to demo result storage when database writes fail", async () => {
    const create = vi.fn(async () => {
      throw new Error("database AI result write failed");
    });
    const auditLogCreate = vi.fn();
    const transaction = vi.fn(
      async (callback: (tx: { aiCopilotResult: { create: typeof create }; auditLog: { create: typeof auditLogCreate } }) => Promise<unknown>) =>
        callback({
          aiCopilotResult: { create },
          auditLog: { create: auditLogCreate },
        }),
    );
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({ $transaction: transaction }),
    }));

    const { resetAiDemoState, getAiDemoState } = await import("./demo-store");
    const { storeAiResult } = await import("./results");
    resetAiDemoState();

    await expect(storeAiResult(hrSession, "policy_qa", policyAnswer)).rejects.toThrow(
      "database AI result write failed",
    );
    expect(getAiDemoState().results).toHaveLength(0);
  });

  it("requires tenant, company, and user context in database mode", async () => {
    const create = vi.fn();
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        aiCopilotResult: { create },
      }),
    }));

    const { storeAiResult } = await import("./results");

    await expect(
      storeAiResult({ ...hrSession, user: null }, "policy_qa", policyAnswer),
    ).rejects.toThrow("tenant, company, and user context");
    expect(create).not.toHaveBeenCalled();
  });

  it("cleans expired database Copilot results with hash-only audit evidence", async () => {
    const now = new Date("2026-06-22T08:30:00.000Z");
    const expiredAt = new Date("2026-06-22T08:00:00.000Z");
    const createdAt = new Date("2026-06-21T08:00:00.000Z");
    const findMany = vi.fn(async () => [
      {
        id: "ai-result-expired",
        actorUserId: "user-hr",
        category: "policy_qa",
        outputHash: "hash-expired",
        expiresAt: expiredAt,
        createdAt,
      },
    ]);
    const deleteMany = vi.fn(async () => ({ count: 1 }));
    const auditLogCreate = vi.fn(async () => ({ id: "audit-cleanup" }));
    const transaction = vi.fn(
      async (callback: (tx: { aiCopilotResult: { deleteMany: typeof deleteMany }; auditLog: { create: typeof auditLogCreate } }) => Promise<unknown>) =>
        callback({
          aiCopilotResult: { deleteMany },
          auditLog: { create: auditLogCreate },
        }),
    );
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        aiCopilotResult: { findMany },
        $transaction: transaction,
      }),
    }));

    const { cleanupExpiredAiResults } = await import("./results");
    const cleanup = await cleanupExpiredAiResults(hrSession, { limit: 5, now });

    expect(cleanup).toEqual({
      expiredCount: 1,
      skippedCount: 0,
      resultIds: ["ai-result-expired"],
    });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        companyId: "company-1",
        expiresAt: { lte: now },
      },
      select: {
        id: true,
        actorUserId: true,
        category: true,
        outputHash: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { expiresAt: "asc" },
      take: 5,
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        id: "ai-result-expired",
        tenantId: "tenant-1",
        companyId: "company-1",
        expiresAt: { lte: now },
      },
    });
    expect(auditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant-1",
        companyId: "company-1",
        actorUserId: "user-hr",
        action: "delete",
        entityType: "ai_copilot_result",
        entityId: "ai-result-expired",
        beforeHash: expect.any(String),
        afterHash: expect.any(String),
        metadataJson: expect.objectContaining({
          aiCategory: "policy_qa",
          outputHash: "hash-expired",
          expiresAt: expiredAt.toISOString(),
          maintenanceAction: "expired_ai_result_cleanup",
          resultJsonStoredInAudit: false,
          rawResultStoredInAudit: false,
        }),
      }),
    });
    expect(JSON.stringify(auditLogCreate.mock.calls[0])).not.toContain(policyAnswer.answer);
  });

  it("fails closed instead of falling back to demo result storage when database cleanup fails", async () => {
    const findMany = vi.fn(async () => [
      {
        id: "ai-result-expired",
        actorUserId: "user-hr",
        category: "policy_qa",
        outputHash: "hash-expired",
        expiresAt: new Date("2026-06-22T08:00:00.000Z"),
        createdAt: new Date("2026-06-21T08:00:00.000Z"),
      },
    ]);
    const transaction = vi.fn(async () => {
      throw new Error("database AI result cleanup failed");
    });
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        aiCopilotResult: { findMany },
        $transaction: transaction,
      }),
    }));

    const { resetAiDemoState, getAiDemoState } = await import("./demo-store");
    const { cleanupExpiredAiResults } = await import("./results");
    resetAiDemoState();

    await expect(cleanupExpiredAiResults(hrSession)).rejects.toThrow("database AI result cleanup failed");
    expect(getAiDemoState().results).toHaveLength(0);
  });
});
