import { describe, expect, it } from "vitest";
import {
  buildBetaPilotTrialRunErrorRedirectUrl,
  normalizeBetaPilotTrialRunReturnTo,
} from "./redirects";

describe("beta pilot trial run route helpers", () => {
  it("allows only same-origin relative return paths", () => {
    expect(normalizeBetaPilotTrialRunReturnTo("/settings/pilot-trial-run?success=beta-trial-run")).toBe(
      "/settings/pilot-trial-run?success=beta-trial-run",
    );
    expect(normalizeBetaPilotTrialRunReturnTo("https://evil.example/steal")).toBe(
      "/settings/readiness?success=beta-trial-run#pilot-runbook",
    );
    expect(normalizeBetaPilotTrialRunReturnTo("//evil.example/steal")).toBe(
      "/settings/readiness?success=beta-trial-run#pilot-runbook",
    );
  });

  it("returns errors to the selected pilot page without preserving success", () => {
    const url = buildBetaPilotTrialRunErrorRedirectUrl(
      "/settings/pilot-trial-run?success=beta-trial-run#top",
      "正式試用批次需要 DATABASE_URL",
      "https://hr.suiyuecare.com/api/settings/beta-pilot-trial-run",
    );

    expect(url.origin).toBe("https://hr.suiyuecare.com");
    expect(url.pathname).toBe("/settings/pilot-trial-run");
    expect(url.searchParams.get("success")).toBeNull();
    expect(url.searchParams.get("error")).toBe("正式試用批次需要 DATABASE_URL");
    expect(url.hash).toBe("#top");
  });
});
