import { describe, expect, it } from "vitest";
import { buildTenantIsolationGuardrailReport } from "./tenant-isolation";

describe("tenant isolation guardrails", () => {
  it("requires tenant session guards on non-demo API routes", () => {
    const report = buildTenantIsolationGuardrailReport();

    expect(report.tenantScopedRouteCount).toBeGreaterThan(0);
    expect(report.guardedTenantRouteCount).toBe(report.tenantScopedRouteCount);
    expect(report.unguardedRoutePaths).toEqual([]);
  });

  it("keeps API routes from bypassing service-layer tenant scoping with direct DB imports", () => {
    const report = buildTenantIsolationGuardrailReport();

    expect(report.directDbRoutePaths).toEqual([]);
    expect(report.directDbRouteCount).toBe(0);
  });

  it("requires DB fallback helpers to check tenant and company context together", () => {
    const report = buildTenantIsolationGuardrailReport();

    expect(report.unsafeFallbackPaths).toEqual([]);
    expect(report.unsafeFallbackCount).toBe(0);
  });

  it("summarizes tenant boundary status for production access readiness", () => {
    const report = buildTenantIsolationGuardrailReport();

    expect(report.status).toBe("ready");
    expect(report.signal).toContain("tenant APIs guarded");
    expect(report.topFailure).toBeNull();
    expect(report.checks.every((check) => check.status === "ready")).toBe(true);
  });
});
