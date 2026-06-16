import { afterEach, describe, expect, it } from "vitest";
import { POST as resetDemoState } from "./reset/route";
import { POST as switchDemoRole } from "./switch-role/route";

const originalEnv = {
  HR_ONE_ENV: process.env.HR_ONE_ENV,
  HR_ONE_AUTH_SESSION_SOURCE: process.env.HR_ONE_AUTH_SESSION_SOURCE,
};

describe("demo-only API routes", () => {
  afterEach(() => {
    restoreEnv();
  });

  it("disables demo reset in production", async () => {
    process.env.HR_ONE_ENV = "production";
    delete process.env.HR_ONE_AUTH_SESSION_SOURCE;

    const response = await resetDemoState();

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Demo endpoints are disabled." });
  });

  it("disables demo role switching in production", async () => {
    process.env.HR_ONE_ENV = "production";
    delete process.env.HR_ONE_AUTH_SESSION_SOURCE;
    const formData = new FormData();
    formData.set("role", "owner");

    const response = await switchDemoRole(
      new Request("https://hr.suiyuecare.com/api/demo/switch-role", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Demo endpoints are disabled." });
  });
});

function restoreEnv() {
  if (originalEnv.HR_ONE_ENV === undefined) {
    delete process.env.HR_ONE_ENV;
  } else {
    process.env.HR_ONE_ENV = originalEnv.HR_ONE_ENV;
  }
  if (originalEnv.HR_ONE_AUTH_SESSION_SOURCE === undefined) {
    delete process.env.HR_ONE_AUTH_SESSION_SOURCE;
  } else {
    process.env.HR_ONE_AUTH_SESSION_SOURCE = originalEnv.HR_ONE_AUTH_SESSION_SOURCE;
  }
}
