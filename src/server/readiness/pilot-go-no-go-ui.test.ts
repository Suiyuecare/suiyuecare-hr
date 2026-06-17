import { describe, expect, it } from "vitest";
import { buildPilotGoNoGoUiSnapshot } from "@/server/readiness/pilot-go-no-go-ui";

describe("pilot go/no-go UI snapshot", () => {
  it("fails closed when external production evidence is not attached to the UI snapshot", async () => {
    const snapshot = await buildPilotGoNoGoUiSnapshot(
      {
        role: "owner",
        tenantId: null,
        companyId: null,
        user: { id: "owner", displayName: "Owner" },
        employee: null,
      },
      {
        tenantSlug: "suiyuecare-pilot",
        generatedAt: new Date("2026-06-17T00:00:00.000Z"),
      },
    );

    expect(snapshot.report.status).toBe("blocked");
    expect(snapshot.report.readyToStart).toBe(false);
    expect(snapshot.report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "acceptance", status: "block" }),
        expect.objectContaining({ id: "production_database", status: "block" }),
        expect.objectContaining({ id: "import_preflight", status: "block" }),
        expect.objectContaining({ id: "evidence_scan", status: "block" }),
      ]),
    );
    expect(snapshot.externalEvidenceGaps.map((gap) => gap.title)).toEqual([
      "Production acceptance",
      "Production database gate",
      "Customer import preflight",
      "Evidence privacy scan",
    ]);
    expect(snapshot.report.nextActions.join("\n")).not.toContain("postgresql://");
    expect(snapshot.report.nextActions.join("\n")).not.toContain("薪資:");
  });
});
