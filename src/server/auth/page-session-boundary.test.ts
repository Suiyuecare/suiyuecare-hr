import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

describe("page session boundary", () => {
  it("keeps App Router pages on the current-session adapter instead of direct demo sessions", () => {
    const pageFiles = findFiles(
      join(process.cwd(), "src/app"),
      (file) => file.endsWith(".tsx"),
    );
    const directDemoImports = pageFiles.filter((file) =>
      readFileSync(file, "utf8").includes("@/server/auth/demo-session"),
    );

    expect(directDemoImports.map((file) => relative(process.cwd(), file))).toEqual([]);
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
