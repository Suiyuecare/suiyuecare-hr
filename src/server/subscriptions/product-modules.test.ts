import { describe, expect, it } from "vitest";
import { getProductModuleSummary, normalizeCommercialPlan, productModules } from "./product-modules";

describe("HR One product modules", () => {
  it("normalizes unknown plans to demo", () => {
    expect(normalizeCommercialPlan("team")).toBe("team");
    expect(normalizeCommercialPlan("business")).toBe("business");
    expect(normalizeCommercialPlan("enterprise")).toBe("enterprise");
    expect(normalizeCommercialPlan("starter")).toBe("demo");
    expect(normalizeCommercialPlan(null)).toBe("demo");
  });

  it("keeps demo tenants out of commercial packaging", () => {
    const summary = getProductModuleSummary("demo");

    expect(summary.readyForPackaging).toBe(false);
    expect(summary.includedCount).toBe(0);
    expect(summary.upgradeRequiredCount).toBe(productModules.length);
  });

  it("includes payroll and compliance only from business plan upward", () => {
    const team = getProductModuleSummary("team");
    const business = getProductModuleSummary("business");

    expect(team.items.find((item) => item.module.id === "payroll-close")).toMatchObject({
      included: false,
      upgradeRequired: true,
      planLabel: "Business",
    });
    expect(business.items.find((item) => item.module.id === "payroll-close")).toMatchObject({
      included: true,
      upgradeRequired: false,
    });
    expect(business.items.find((item) => item.module.id === "taiwan-compliance")).toMatchObject({
      included: true,
    });
  });

  it("marks enterprise SaaS admin as included but blocked by delivery gate", () => {
    const summary = getProductModuleSummary("enterprise");
    const saasAdmin = summary.items.find((item) => item.module.id === "saas-admin");

    expect(saasAdmin).toMatchObject({
      included: true,
      blockedByGate: true,
    });
    expect(saasAdmin?.module.sellable).toBe(false);
    expect(summary.gatedIncludedCount).toBeGreaterThan(0);
  });

  it("keeps every module tied to a page, dependency list, and delivery gate", () => {
    for (const productModule of productModules) {
      expect(productModule.summary.length).toBeGreaterThan(0);
      expect(productModule.pages.length).toBeGreaterThan(0);
      expect(productModule.gates.length).toBeGreaterThan(0);
      expect(productModule.pages.every((page) => page.startsWith("/"))).toBe(true);
      expect(productModule.dependencies.every((dependency) => productModules.some((candidate) => candidate.id === dependency))).toBe(true);
    }
  });
});
