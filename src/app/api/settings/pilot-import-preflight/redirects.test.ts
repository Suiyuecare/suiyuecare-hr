import { describe, expect, it } from "vitest";
import {
  buildPilotImportPreflightErrorRedirectUrl,
  buildPilotImportPreflightSuccessRedirectUrl,
  normalizePilotImportPreflightReturnTo,
} from "./redirects";

describe("pilot import preflight redirects", () => {
  const requestUrl = "https://hr.example.test/api/settings/pilot-import-preflight";

  it("allows same-app pilot return paths", () => {
    expect(normalizePilotImportPreflightReturnTo("/settings/pilot-import-preflight#latest")).toBe(
      "/settings/pilot-import-preflight#latest",
    );
    expect(normalizePilotImportPreflightReturnTo("/settings/pilot-go-no-go?tenantSlug=customer-a")).toBe(
      "/settings/pilot-go-no-go?tenantSlug=customer-a",
    );
  });

  it("falls back from external or unrelated paths", () => {
    expect(normalizePilotImportPreflightReturnTo("https://evil.example")).toBe("/settings/pilot-import-preflight");
    expect(normalizePilotImportPreflightReturnTo("//evil.example/path")).toBe("/settings/pilot-import-preflight");
    expect(normalizePilotImportPreflightReturnTo("/admin/delete")).toBe("/settings/pilot-import-preflight");
  });

  it("adds success and error flags without carrying stale state", () => {
    const success = buildPilotImportPreflightSuccessRedirectUrl(
      "/settings/pilot-import-preflight?error=old#latest",
      requestUrl,
    );
    expect(success.pathname).toBe("/settings/pilot-import-preflight");
    expect(success.searchParams.get("error")).toBeNull();
    expect(success.searchParams.get("success")).toBe("import-preflight");
    expect(success.hash).toBe("#latest");

    const error = buildPilotImportPreflightErrorRedirectUrl(
      "/settings/pilot-import-preflight?success=import-preflight#latest",
      "No permission",
      requestUrl,
    );
    expect(error.searchParams.get("success")).toBeNull();
    expect(error.searchParams.get("error")).toBe("No permission");
    expect(error.hash).toBe("#latest");
  });
});
