import { describe, expect, it } from "vitest";
import {
  getBetaPilotErrorReturnUrl,
  getBetaPilotReturnUrl,
} from "@/server/readiness/beta-pilot-redirect";

describe("beta pilot redirect helper", () => {
  const requestUrl = "https://hr.example.test/api/settings/beta-pilot-checkpoints";

  it("allows same-origin pilot operation return paths", () => {
    const url = getBetaPilotReturnUrl(
      requestUrl,
      "/settings/pilot-operations?success=checkpoint#day_3",
    );

    expect(url.toString()).toBe("https://hr.example.test/settings/pilot-operations?success=checkpoint#day_3");
  });

  it("falls back when return path is external or outside settings pilot pages", () => {
    expect(getBetaPilotReturnUrl(requestUrl, "https://evil.example/path").pathname).toBe("/settings/readiness");
    expect(getBetaPilotReturnUrl(requestUrl, "/admin/delete-everything").pathname).toBe("/settings/readiness");
  });

  it("adds errors without preserving stale success flags", () => {
    const url = getBetaPilotErrorReturnUrl(
      requestUrl,
      "/settings/pilot-operations?success=checkpoint#day_7",
      "No permission",
    );

    expect(url.pathname).toBe("/settings/pilot-operations");
    expect(url.searchParams.get("success")).toBeNull();
    expect(url.searchParams.get("error")).toBe("No permission");
    expect(url.hash).toBe("#day_7");
  });
});
