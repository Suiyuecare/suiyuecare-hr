import { describe, expect, it } from "vitest";
import { getSafeAuthLoginUrl, isSafeAuthLoginUrl } from "./login-url";

describe("auth login URL", () => {
  it("allows only HTTPS production login URLs", () => {
    expect(isSafeAuthLoginUrl("https://login.customer.co/oauth2/v2.0/authorize")).toBe(true);
    expect(isSafeAuthLoginUrl("http://login.customer.co/oauth2/v2.0/authorize")).toBe(false);
    expect(isSafeAuthLoginUrl("https://example.com/login")).toBe(false);
    expect(isSafeAuthLoginUrl("https://localhost/login")).toBe(false);
  });

  it("returns a safe URL from env without exposing invalid placeholders", () => {
    expect(getSafeAuthLoginUrl({
      HR_ONE_AUTH_LOGIN_URL: "https://login.customer.co/oauth2/v2.0/authorize",
    })).toBe("https://login.customer.co/oauth2/v2.0/authorize");
    expect(getSafeAuthLoginUrl({
      HR_ONE_AUTH_LOGIN_URL: "REPLACE_WITH_LOGIN_URL",
    })).toBeNull();
  });
});
