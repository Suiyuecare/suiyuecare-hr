import { describe, expect, it } from "vitest";
import { demoCookieOptions } from "@/server/auth/demo-session";

describe("demo session cookies", () => {
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
});
