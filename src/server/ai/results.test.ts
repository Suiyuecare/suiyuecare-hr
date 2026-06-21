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
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        aiCopilotResult: { create },
      }),
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
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        aiCopilotResult: {
          create: vi.fn(async () => {
            throw new Error("database AI result write failed");
          }),
        },
      }),
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
});
