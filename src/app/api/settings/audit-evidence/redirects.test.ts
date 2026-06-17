import { describe, expect, it } from "vitest";
import {
  buildAuditEvidenceErrorRedirectUrl,
  normalizeAuditEvidenceReturnTo,
} from "./redirects";

describe("audit evidence redirect helpers", () => {
  it("allows only same-origin relative return paths", () => {
    expect(normalizeAuditEvidenceReturnTo("/settings/pilot-evidence?success=audit-evidence")).toBe(
      "/settings/pilot-evidence?success=audit-evidence",
    );
    expect(normalizeAuditEvidenceReturnTo("https://evil.example/steal")).toBe("/settings/audit");
    expect(normalizeAuditEvidenceReturnTo("//evil.example/steal")).toBe("/settings/audit");
  });

  it("keeps errors on the selected settings page without preserving success", () => {
    const url = buildAuditEvidenceErrorRedirectUrl(
      "/settings/pilot-evidence?success=audit-evidence#audit",
      "需要 audit:read",
      "https://hr.suiyuecare.com/api/settings/audit-evidence",
    );

    expect(url.origin).toBe("https://hr.suiyuecare.com");
    expect(url.pathname).toBe("/settings/pilot-evidence");
    expect(url.searchParams.get("success")).toBeNull();
    expect(url.searchParams.get("error")).toBe("需要 audit:read");
    expect(url.hash).toBe("#audit");
  });
});
