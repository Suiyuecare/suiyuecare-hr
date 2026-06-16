import { describe, expect, it } from "vitest";
import { buildSecurityHeaders } from "@/server/security/headers";

describe("security headers", () => {
  it("applies browser hardening headers without enabling HSTS in local mode", () => {
    const headers = buildSecurityHeaders({ production: false });
    const byKey = new Map(headers.map((header) => [header.key, header.value]));

    expect(byKey.get("Strict-Transport-Security")).toBeUndefined();
    expect(byKey.get("X-Frame-Options")).toBe("DENY");
    expect(byKey.get("X-Content-Type-Options")).toBe("nosniff");
    expect(byKey.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(byKey.get("Permissions-Policy")).toContain("camera=()");
    expect(byKey.get("Permissions-Policy")).toContain("geolocation=(self)");
    expect(byKey.get("Content-Security-Policy-Report-Only")).toContain("frame-ancestors 'none'");
    expect(byKey.get("Content-Security-Policy-Report-Only")).toContain("connect-src 'self'");
  });

  it("adds HSTS only for production deployments", () => {
    const headers = buildSecurityHeaders({ production: true });

    expect(headers[0]).toEqual({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    });
  });

  it("allows configured HTTPS API origins in connect-src without accepting weak values", () => {
    const headers = buildSecurityHeaders({
      production: true,
      connectSrc: [
        "https://aruncclorusswpfnpgsn.supabase.co/auth/v1",
        "http://localhost:54321",
        "not-a-url",
      ],
    });
    const csp = headers.find((header) => header.key === "Content-Security-Policy-Report-Only")?.value;

    expect(csp).toContain("connect-src 'self' https://aruncclorusswpfnpgsn.supabase.co");
    expect(csp).not.toContain("localhost");
    expect(csp).not.toContain("not-a-url");
  });
});
