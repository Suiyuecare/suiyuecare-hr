import { describe, expect, it } from "vitest";
import { buildPilotCompletionUiSnapshot } from "@/server/readiness/pilot-completion-ui";

describe("pilot completion UI snapshot", () => {
  it("fails closed until Day 14 evidence and evidence privacy scan are attached outside the browser", async () => {
    const snapshot = await buildPilotCompletionUiSnapshot(
      {
        role: "owner",
        tenantId: null,
        companyId: null,
        user: { id: "owner", displayName: "Owner" },
        employee: null,
      },
      {
        generatedAt: new Date("2026-07-01T00:00:00.000Z"),
      },
    );

    expect(snapshot.report.status).toBe("blocked");
    expect(snapshot.report.completed).toBe(false);
    expect(snapshot.report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "day_14_final_review", status: "block" }),
        expect.objectContaining({ id: "evidence_privacy", status: "block" }),
      ]),
    );
    expect(snapshot.externalEvidenceGaps.map((gap) => gap.title)).toEqual([
      "Day 14 final review",
      "Evidence privacy scan",
      "Redacted handoff package",
    ]);
    expect(snapshot.report.nextActions.join("\n")).not.toContain("postgresql://");
    expect(snapshot.report.nextActions.join("\n")).not.toContain("薪資:");
  });
});
