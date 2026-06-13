import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const apiRouteFiles = findFiles(join(process.cwd(), "src/app/api"), (file) => file.endsWith("/route.ts"));

const demoOnlyRoutePatterns = [
  "/src/app/api/demo/reset/route.ts",
  "/src/app/api/demo/switch-role/route.ts",
];
const publicOperationalRoutePatterns = [
  "/src/app/api/health/live/route.ts",
  "/src/app/api/health/ready/route.ts",
];
const publicRoutePatterns = [...demoOnlyRoutePatterns, ...publicOperationalRoutePatterns];

describe("tenant isolation guardrails", () => {
  it("requires tenant session guards on non-demo API routes", () => {
    const unguardedRoutes = apiRouteFiles
      .filter((file) => !publicRoutePatterns.some((pattern) => file.endsWith(pattern)))
      .filter((file) => !readFileSync(file, "utf8").includes("requireTenantSession"));

    expect(unguardedRoutes.map((file) => relative(process.cwd(), file))).toEqual([]);
  });

  it("keeps API routes from bypassing service-layer tenant scoping with direct DB imports", () => {
    const directDbRoutes = apiRouteFiles
      .filter((file) => !publicRoutePatterns.some((pattern) => file.endsWith(pattern)))
      .filter((file) => /@\/server\/db\/client|getDb\(/.test(readFileSync(file, "utf8")));

    expect(directDbRoutes.map((file) => relative(process.cwd(), file))).toEqual([]);
  });

  it("requires DB fallback helpers to check tenant and company context together", () => {
    const serverFiles = findFiles(
      join(process.cwd(), "src/server"),
      (file) => file.endsWith(".ts") && !file.endsWith(".test.ts"),
    );
    const unsafeFallbacks = serverFiles.filter((file) => {
      const source = readFileSync(file, "utf8");
      if (!source.includes("function canUseDatabase")) return false;
      return !/process\.env\.DATABASE_URL\s*&&\s*session\.tenantId\s*&&\s*session\.companyId/.test(source);
    });

    expect(unsafeFallbacks.map((file) => relative(process.cwd(), file))).toEqual([]);
  });
});

function findFiles(root: string, predicate: (file: string) => boolean) {
  const results: string[] = [];
  for (const entry of readdirSync(root)) {
    const fullPath = join(root, entry);
    if (statSync(fullPath).isDirectory()) {
      results.push(...findFiles(fullPath, predicate));
    } else if (predicate(fullPath)) {
      results.push(fullPath);
    }
  }
  return results.sort();
}
