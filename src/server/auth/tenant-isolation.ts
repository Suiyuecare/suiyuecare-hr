import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export type TenantIsolationGuardrailStatus = "ready" | "action_required" | "blocked";

export type TenantIsolationGuardrailCheckId =
  | "api_route_guard_coverage"
  | "api_route_no_direct_db"
  | "database_fallback_scope";

export type TenantIsolationGuardrailCheck = {
  id: TenantIsolationGuardrailCheckId;
  title: string;
  status: TenantIsolationGuardrailStatus;
  detail: string;
  nextStep: string;
};

export type TenantIsolationGuardrailReport = {
  status: TenantIsolationGuardrailStatus;
  signal: string;
  apiRouteCount: number;
  publicRouteCount: number;
  tenantScopedRouteCount: number;
  guardedTenantRouteCount: number;
  directDbRouteCount: number;
  unsafeFallbackCount: number;
  unguardedRoutePaths: string[];
  directDbRoutePaths: string[];
  unsafeFallbackPaths: string[];
  checks: TenantIsolationGuardrailCheck[];
  topFailure: TenantIsolationGuardrailCheck | null;
};

const demoOnlyRoutePatterns = [
  "/src/app/api/demo/reset/route.ts",
  "/src/app/api/demo/switch-role/route.ts",
];
const publicOperationalRoutePatterns = [
  "/src/app/api/health/live/route.ts",
  "/src/app/api/health/ready/route.ts",
];
const authBootstrapRoutePatterns = [
  "/src/app/api/auth/session/route.ts",
];

export const publicApiRoutePatterns = [
  ...demoOnlyRoutePatterns,
  ...publicOperationalRoutePatterns,
  ...authBootstrapRoutePatterns,
];

export function buildTenantIsolationGuardrailReport(rootDir = process.cwd()): TenantIsolationGuardrailReport {
  const apiRoot = join(rootDir, "src/app/api");
  const serverRoot = join(rootDir, "src/server");
  const apiRouteFiles = findFiles(apiRoot, (file) => file.endsWith("/route.ts"));
  const serverFiles = findFiles(
    serverRoot,
    (file) => file.endsWith(".ts") && !file.endsWith(".test.ts"),
  );
  const publicRouteFiles = apiRouteFiles.filter((file) => isPublicApiRoute(rootDir, file));
  const tenantRouteFiles = apiRouteFiles.filter((file) => !isPublicApiRoute(rootDir, file));
  const unguardedRoutePaths = tenantRouteFiles
    .filter((file) => !readFileSync(file, "utf8").includes("requireTenantSession"))
    .map((file) => displayPath(rootDir, file));
  const directDbRoutePaths = tenantRouteFiles
    .filter((file) => /@\/server\/db\/client|getDb\(/.test(readFileSync(file, "utf8")))
    .map((file) => displayPath(rootDir, file));
  const unsafeFallbackPaths = serverFiles
    .filter((file) => {
      const source = readFileSync(file, "utf8");
      if (!/function\s+canUseDatabase\s*\(/.test(source)) return false;
      return !/process\.env\.DATABASE_URL\s*&&\s*session\.tenantId\s*&&\s*session\.companyId/.test(source);
    })
    .map((file) => displayPath(rootDir, file));

  const checks: TenantIsolationGuardrailCheck[] = [
    {
      id: "api_route_guard_coverage",
      title: "API route tenant session guard coverage",
      status: tenantRouteFiles.length > 0 && unguardedRoutePaths.length === 0 ? "ready" : "blocked",
      detail: `${tenantRouteFiles.length - unguardedRoutePaths.length}/${tenantRouteFiles.length} tenant API route(s) call requireTenantSession.`,
      nextStep: unguardedRoutePaths.length > 0
        ? `Add requireTenantSession to: ${unguardedRoutePaths.slice(0, 5).join(", ")}.`
        : "Keep every non-public API route behind requireTenantSession.",
    },
    {
      id: "api_route_no_direct_db",
      title: "API routes use service-layer scoped data access",
      status: directDbRoutePaths.length === 0 ? "ready" : "blocked",
      detail: `${directDbRoutePaths.length} tenant API route(s) import the DB client directly or call getDb().`,
      nextStep: directDbRoutePaths.length > 0
        ? `Move direct DB access into tenant-scoped service modules for: ${directDbRoutePaths.slice(0, 5).join(", ")}.`
        : "Keep API routes thin and route all persistence through tenant-scoped services.",
    },
    {
      id: "database_fallback_scope",
      title: "Database fallback helpers require tenant and company together",
      status: unsafeFallbackPaths.length === 0 ? "ready" : "blocked",
      detail: `${unsafeFallbackPaths.length} canUseDatabase helper(s) skip tenant/company context checks.`,
      nextStep: unsafeFallbackPaths.length > 0
        ? `Require DATABASE_URL, session.tenantId, and session.companyId together in: ${unsafeFallbackPaths.slice(0, 5).join(", ")}.`
        : "Keep DB fallback helpers fail-closed unless tenant and company context are both present.",
    },
  ];
  const topFailure = checks.find((check) => check.status !== "ready") ?? null;
  const status = topFailure ? topFailure.status : "ready";

  return {
    status,
    signal: status === "ready"
      ? `${tenantRouteFiles.length}/${tenantRouteFiles.length} tenant APIs guarded`
      : `${checks.filter((check) => check.status !== "ready").length} tenant boundary gap(s)`,
    apiRouteCount: apiRouteFiles.length,
    publicRouteCount: publicRouteFiles.length,
    tenantScopedRouteCount: tenantRouteFiles.length,
    guardedTenantRouteCount: tenantRouteFiles.length - unguardedRoutePaths.length,
    directDbRouteCount: directDbRoutePaths.length,
    unsafeFallbackCount: unsafeFallbackPaths.length,
    unguardedRoutePaths,
    directDbRoutePaths,
    unsafeFallbackPaths,
    checks,
    topFailure,
  };
}

function isPublicApiRoute(rootDir: string, file: string) {
  const normalized = displayPath(rootDir, file);
  return publicApiRoutePatterns.some((pattern) => normalized.endsWith(pattern));
}

function displayPath(rootDir: string, file: string) {
  return `/${relative(rootDir, file).replace(/\\/g, "/")}`;
}

function findFiles(root: string, predicate: (file: string) => boolean) {
  const results: string[] = [];
  if (!existsSync(root)) return results;
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
