import { describe, expect, it } from "vitest";
import {
  formatPilotEvidenceScanReport,
  pilotEvidenceScanPassed,
  scanPilotEvidenceFiles,
} from "@/server/readiness/pilot-evidence-scan";

describe("pilot evidence scan", () => {
  it("passes redacted pilot reports", () => {
    const report = scanPilotEvidenceFiles([
      {
        path: "/tmp/hr-one-pilot-day-1.md",
        content: [
          "# HR One Pilot Daily Status",
          "Status: blocked",
          "- Use the Supabase server-side Postgres connection string with ?schema=hr_one.",
          "- Do not paste salary amounts, bank accounts, national IDs, health data, database URLs, or private HR notes.",
        ].join("\n"),
      },
    ]);

    expect(report).toEqual({
      status: "pass",
      scannedFileCount: 1,
      findingCount: 0,
      categories: [],
      findings: [],
    });
    expect(pilotEvidenceScanPassed(report)).toBe(true);
    expect(formatPilotEvidenceScanReport(report)).toContain("Findings: 0");
  });

  it("detects sensitive values without echoing the raw match", () => {
    const report = scanPilotEvidenceFiles([
      {
        path: "/tmp/leaky-handoff.md",
        content: [
          "DATABASE_URL=postgresql://hrone:secret@db.example.com/hrone?schema=hr_one",
          "Authorization: Bearer supersecrettokenvalue",
          "銀行帳號: 123456789012",
          "薪資: 56000",
          "身分證字號: A123456789",
          "健康資料: 診斷內容",
        ].join("\n"),
      },
    ]);
    const text = formatPilotEvidenceScanReport(report);

    expect(report.status).toBe("failed");
    expect(report.findingCount).toBeGreaterThanOrEqual(6);
    expect(report.categories.map((item) => item.category)).toEqual(
      expect.arrayContaining([
        "database_url",
        "raw_database_env",
        "bearer_token",
        "bank_account_label",
        "salary_amount_label",
        "taiwan_national_id_label",
        "health_data_label",
      ]),
    );
    expect(pilotEvidenceScanPassed(report)).toBe(false);
    expect(text).toContain("/tmp/leaky-handoff.md: database_url");
    expect(text).not.toContain("postgresql://hrone");
    expect(text).not.toContain("supersecrettokenvalue");
    expect(text).not.toContain("123456789012");
    expect(text).not.toContain("A123456789");
    expect(text).not.toContain("56000");
  });

  it("keeps multiple-file findings grouped by file and category only", () => {
    const report = scanPilotEvidenceFiles([
      { path: "/tmp/a.md", content: "sb_secret_abc123" },
      { path: "/tmp/b.md", content: "-----BEGIN PRIVATE KEY-----" },
    ]);
    const text = formatPilotEvidenceScanReport(report);

    expect(report.findings).toEqual([
      { path: "/tmp/a.md", category: "supabase_secret_key", count: 1 },
      { path: "/tmp/b.md", category: "private_key", count: 1 },
    ]);
    expect(text).toContain("/tmp/a.md: supabase_secret_key (1)");
    expect(text).toContain("/tmp/b.md: private_key (1)");
    expect(text).not.toContain("sb_secret_abc123");
    expect(text).not.toContain("BEGIN PRIVATE KEY");
  });
});
