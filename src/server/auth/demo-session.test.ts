import { afterEach, describe, expect, it } from "vitest";
import { demoCookieOptions, getDemoSession } from "@/server/auth/demo-session";

const originalHrOneEnv = process.env.HR_ONE_ENV;

describe("demo session cookies", () => {
  afterEach(() => {
    if (originalHrOneEnv === undefined) {
      delete process.env.HR_ONE_ENV;
    } else {
      process.env.HR_ONE_ENV = originalHrOneEnv;
    }
  });

  it("keeps local demo cookies usable without HTTPS", () => {
    expect(demoCookieOptions({ HR_ONE_ENV: "local" })).toEqual({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: false,
    });
  });

  it("sets Secure cookies in production", () => {
    expect(demoCookieOptions({ HR_ONE_ENV: "production" })).toEqual({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: true,
    });
  });

  it("does not create demo sessions in production", async () => {
    process.env.HR_ONE_ENV = "production";

    await expect(getDemoSession()).rejects.toThrow(/Demo auth is disabled/);
  });
});
