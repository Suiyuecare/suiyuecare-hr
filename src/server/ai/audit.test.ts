import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiSessionLike } from "./types";

const hrSession: AiSessionLike = {
  role: "hr_admin",
  tenantId: "tenant-1",
  companyId: "company-1",
  user: { id: "user-hr", displayName: "HR" },
  employee: { id: "employee-hr", displayName: "HR" },
};

describe("AI audit persistence", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock("@/server/db/client");
  });

  it("uses demo audit only when database mode is not configured", async () => {
    delete process.env.DATABASE_URL;
    const { resetAiDemoState, getAiDemoState } = await import("./demo-store");
    const { auditAiUsage } = await import("./audit");
    resetAiDemoState();

    const outputHash = await auditAiUsage({
      session: hrSession,
      category: "policy_qa",
      prompt: "請解釋特休規則，員工信箱 user@example.com",
      referencedRecordIds: ["policy-1"],
      output: { answer: "AI 建議", salary: 50000 },
    });

    const [log] = getAiDemoState().usageLogs;
    expect(log.outputHash).toBe(outputHash);
    expect(log.promptHash).toBeTruthy();
    expect(log.rawPromptStored).toBe(false);
    expect(JSON.stringify(log)).not.toContain("user@example.com");
    expect(JSON.stringify(log)).not.toContain("50000");
  });

  it("writes hashed AI usage to the tenant database in database mode", async () => {
    const create = vi.fn(async () => ({ id: "ai-usage-1" }));
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        aiUsageLog: { create },
      }),
    }));

    const { auditAiUsage } = await import("./audit");
    const outputHash = await auditAiUsage({
      session: hrSession,
      category: "form_generator",
      prompt: "請產生設備申請表，身分證 A123456789",
      referencedRecordIds: ["form-template:draft"],
      output: { title: "設備申請單" },
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant-1",
        companyId: "company-1",
        actorUserId: "user-hr",
        category: "form_generator",
        promptHash: expect.any(String),
        referencedRecordIdsJson: ["form-template:draft"],
        outputHash,
        rawPromptStored: false,
      }),
    });
    expect(JSON.stringify(create.mock.calls)).not.toContain("A123456789");
  });

  it("fails closed instead of falling back to demo audit when database writes fail", async () => {
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        aiUsageLog: {
          create: vi.fn(async () => {
            throw new Error("database AI audit write failed");
          }),
        },
      }),
    }));

    const { resetAiDemoState, getAiDemoState } = await import("./demo-store");
    const { auditAiUsage } = await import("./audit");
    resetAiDemoState();

    await expect(
      auditAiUsage({
        session: hrSession,
        category: "approval_summary",
        referencedRecordIds: ["approval-1"],
        output: { summary: "需要主管人工確認" },
      }),
    ).rejects.toThrow("database AI audit write failed");
    expect(getAiDemoState().usageLogs).toHaveLength(0);
  });

  it("requires tenant and company context before writing AI audit records in database mode", async () => {
    const create = vi.fn();
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        aiUsageLog: { create },
      }),
    }));

    const { auditAiUsage } = await import("./audit");

    await expect(
      auditAiUsage({
        session: { ...hrSession, tenantId: null },
        category: "policy_qa",
        referencedRecordIds: [],
        output: { answer: "AI 建議" },
      }),
    ).rejects.toThrow("tenant and company context");
    expect(create).not.toHaveBeenCalled();
  });
});
