import { describe, expect, it } from "vitest";
import { buildReleaseGatePlan, parseReleaseGateArgs } from "@/server/readiness/release-gate";

describe("release gate plan", () => {
  it("runs the local release quality checks without requiring a database", () => {
    const plan = buildReleaseGatePlan({
      mode: "local",
      databaseUrlConfigured: false,
    });

    expect(plan.blockers).toEqual([]);
    expect(plan.commands.map((command) => command.name)).toEqual([
      "Prisma schema validation",
      "TypeScript typecheck",
      "ESLint",
      "Unit tests",
      "E2E smoke tests",
      "Production build",
    ]);
    expect(plan.commands[0]).toMatchObject({
      command: "pnpm",
      args: ["exec", "prisma", "validate"],
      env: { DATABASE_URL: "postgresql://hrone:hrone@localhost:5432/hrone?schema=public" },
    });
    expect(plan.commands.slice(1).every((command) => command.env?.DATABASE_URL === "")).toBe(true);
  });

  it("blocks production release checks without database and customer tenant context", () => {
    const plan = buildReleaseGatePlan({
      mode: "production",
      databaseUrlConfigured: false,
    });

    expect(plan.blockers).toEqual([
      "DATABASE_URL is required for production release verification.",
      "A customer tenant slug is required. Pass --tenant-slug=<customer-slug>.",
    ]);
  });

  it("adds production tenant verification after quality checks", () => {
    const plan = buildReleaseGatePlan({
      mode: "production",
      tenantSlug: "customer-a",
      companyId: "company_123",
      databaseUrlConfigured: true,
    });

    expect(plan.blockers).toEqual([]);
    expect(plan.commands.at(-2)).toEqual({
      name: "Production environment verification",
      command: "pnpm",
      args: ["env:verify:production"],
    });
    expect(plan.commands.at(-1)).toEqual({
      name: "Production tenant database verification",
      command: "pnpm",
      args: ["db:verify:production", "--", "--tenant-slug=customer-a", "--company-id=company_123"],
    });
    expect(plan.commands.find((command) => command.name === "E2E smoke tests")).toMatchObject({
      env: { DATABASE_URL: "" },
    });
  });
});

describe("release gate args", () => {
  it("reads production options from CLI args before env vars", () => {
    const options = parseReleaseGateArgs(
      ["--mode=production", "--tenant-slug=customer-a", "--company-id=company_123"],
      {
        DATABASE_URL: "postgresql://example",
        HR_ONE_TENANT_SLUG: "env-tenant",
        HR_ONE_COMPANY_ID: "env-company",
      },
    );

    expect(options).toEqual({
      mode: "production",
      tenantSlug: "customer-a",
      companyId: "company_123",
      databaseUrlConfigured: true,
    });
  });
});
