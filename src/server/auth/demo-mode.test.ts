import { describe, expect, it } from "vitest";
import { getDemoAuthRuntimeStatus, isDemoAuthAllowed } from "./demo-mode";

describe("demo auth runtime policy", () => {
  it("allows demo auth only for non-production local development", () => {
    expect(isDemoAuthAllowed({ HR_ONE_ENV: "local" })).toBe(true);
    expect(getDemoAuthRuntimeStatus({ HR_ONE_ENV: "local" })).toMatchObject({
      allowed: true,
    });
  });

  it("fails closed in production", () => {
    expect(isDemoAuthAllowed({ HR_ONE_ENV: "production" })).toBe(false);
    expect(getDemoAuthRuntimeStatus({ HR_ONE_ENV: "production" })).toEqual({
      allowed: false,
      reason: "Demo auth is disabled when HR_ONE_ENV=production.",
    });
  });

  it("fails closed when OIDC sessions are selected", () => {
    expect(isDemoAuthAllowed({ HR_ONE_AUTH_SESSION_SOURCE: "oidc" })).toBe(false);
    expect(getDemoAuthRuntimeStatus({ HR_ONE_AUTH_SESSION_SOURCE: "oidc" })).toEqual({
      allowed: false,
      reason: "Demo auth is disabled when HR_ONE_AUTH_SESSION_SOURCE=oidc.",
    });
  });
});
