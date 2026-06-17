import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAuditDemoState } from "@/server/audit/demo-store";
import { resetAuditEvidenceDemoState } from "@/server/audit/evidence-packages";
import { resetBetaPilotTrialDemoState } from "@/server/readiness/beta-pilot-trial-run";
import {
  buildPilotEvidencePackageWorkspace,
  formatPilotEvidencePackageMarkdown,
  type PilotEvidencePackageReport,
} from "@/server/readiness/pilot-evidence-package";

const originalDatabaseUrl = process.env.DATABASE_URL;

const ownerSession = {
  role: "owner" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-owner", displayName: "王執行長" },
  employee: null,
};

describe("pilot evidence package", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    resetAuditDemoState();
    resetAuditEvidenceDemoState();
    resetBetaPilotTrialDemoState();
  });

  afterEach(() => {
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  it("fails closed until persisted trial, reports, audit package, and evidence scan are ready", async () => {
    const workspace = await buildPilotEvidencePackageWorkspace(ownerSession, {
      generatedAt: new Date("2026-07-01T00:00:00.000Z"),
    });

    expect(workspace.report).toMatchObject({
      status: "blocked",
      readyToShare: false,
    });
    expect(workspace.report.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "trial_run", status: "block" }),
        expect.objectContaining({ id: "go_no_go", status: "block" }),
        expect.objectContaining({ id: "audit_evidence", status: "block" }),
        expect.objectContaining({ id: "completion_review", status: "block" }),
        expect.objectContaining({ id: "evidence_privacy_scan", status: "block" }),
      ]),
    );
    expect(workspace.report.commands).toEqual(
      expect.arrayContaining([
        expect.stringContaining("pnpm pilot:evidence-scan"),
        expect.stringContaining("pnpm pilot:trial-completion"),
      ]),
    );
    expect(JSON.stringify(workspace.report)).not.toContain("postgresql://");
    expect(JSON.stringify(workspace.report)).not.toContain("薪資: 62000");
  });

  it("formats markdown with sensitive values redacted", () => {
    const report: PilotEvidencePackageReport = {
      status: "blocked",
      generatedAt: "2026-07-01T00:00:00.000Z",
      readyToShare: false,
      blockers: 1,
      warnings: 0,
      items: [
        {
          id: "audit_evidence",
          title: "Audit evidence package",
          status: "block",
          detail: "薪資: 62000; 身分證字號: A123456789; employee@example.com",
          nextStep: "移除銀行帳號: 123456789012 與健康資料: diagnosis。",
          href: "/settings/audit",
          command: null,
        },
      ],
      commands: [],
      privacyGuardrails: [],
    };
    const markdown = formatPilotEvidencePackageMarkdown(report);

    expect(markdown).toContain("Audit evidence package");
    expect(markdown).not.toContain("62000");
    expect(markdown).not.toContain("A123456789");
    expect(markdown).not.toContain("employee@example.com");
    expect(markdown).not.toContain("123456789012");
    expect(markdown).not.toContain("diagnosis");
  });
});
