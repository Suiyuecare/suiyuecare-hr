import { describe, expect, it } from "vitest";
import {
  buildSupabaseTransactionPoolerTemplate,
  classifyDatabaseConnection,
  extractSupabaseProjectRef,
  hasPrismaTransactionPoolerParams,
  isSupabasePoolerConnection,
  isSupabaseTransactionPoolerConnection,
} from "@/server/readiness/database-url";

describe("database URL posture", () => {
  it("classifies Supabase direct and pooler connection strings without reading secrets", () => {
    expect(
      classifyDatabaseConnection("postgresql://postgres:secret@db.aruncclorusswpfnpgsn.supabase.co:5432/postgres?schema=hr_one"),
    ).toBe("supabase-direct");
    expect(
      classifyDatabaseConnection("postgresql://postgres.aruncclorusswpfnpgsn:secret@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?schema=hr_one"),
    ).toBe("supabase-pooler-session");
    expect(
      classifyDatabaseConnection("postgresql://postgres.aruncclorusswpfnpgsn:secret@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&schema=hr_one"),
    ).toBe("supabase-pooler-transaction");
  });

  it("requires Prisma flags only for Supabase transaction pooler URLs", () => {
    const transactionPooler = "postgresql://postgres.aruncclorusswpfnpgsn:secret@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&schema=hr_one";
    const missingParams = "postgresql://postgres.aruncclorusswpfnpgsn:secret@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?schema=hr_one";
    const sessionPooler = "postgresql://postgres.aruncclorusswpfnpgsn:secret@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?schema=hr_one";

    expect(isSupabasePoolerConnection(transactionPooler)).toBe(true);
    expect(isSupabaseTransactionPoolerConnection(transactionPooler)).toBe(true);
    expect(isSupabaseTransactionPoolerConnection(sessionPooler)).toBe(false);
    expect(hasPrismaTransactionPoolerParams(transactionPooler)).toBe(true);
    expect(hasPrismaTransactionPoolerParams(missingParams)).toBe(false);
    expect(hasPrismaTransactionPoolerParams(sessionPooler)).toBe(true);
  });

  it("builds a redacted Supabase transaction pooler template for the Suiyuecare project", () => {
    expect(extractSupabaseProjectRef("https://aruncclorusswpfnpgsn.supabase.co")).toBe("aruncclorusswpfnpgsn");
    expect(
      extractSupabaseProjectRef(
        "postgresql://postgres.aruncclorusswpfnpgsn:secret@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?schema=hr_one",
      ),
    ).toBe("aruncclorusswpfnpgsn");

    const template = buildSupabaseTransactionPoolerTemplate({
      supabaseUrl: "https://aruncclorusswpfnpgsn.supabase.co",
      schema: "hr_one",
    });

    expect(template).toMatchObject({
      projectRef: "aruncclorusswpfnpgsn",
      region: "ap-northeast-2",
      username: "postgres.aruncclorusswpfnpgsn",
      host: "aws-0-ap-northeast-2.pooler.supabase.com",
      port: 6543,
      database: "postgres",
      schema: "hr_one",
      requiredQueryParams: ["pgbouncer=true", "connection_limit=1", "schema=hr_one"],
    });
    expect(JSON.stringify(template)).not.toContain("secret");
    expect(JSON.stringify(template)).not.toContain("postgresql://");
  });
});
