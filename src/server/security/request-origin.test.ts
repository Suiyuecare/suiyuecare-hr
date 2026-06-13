import { describe, expect, it } from "vitest";
import { evaluateMutationOrigin } from "@/server/security/request-origin";

describe("mutation origin guard", () => {
  it("allows safe methods without origin checks", () => {
    expect(evaluateMutationOrigin({
      method: "GET",
      origin: "https://evil.example",
      host: "hr.customer.co",
    })).toEqual({ allowed: true, reason: "safe_method" });
  });

  it("allows same-origin mutation requests", () => {
    expect(evaluateMutationOrigin({
      method: "POST",
      origin: "https://hr.customer.co",
      host: "hr.customer.co",
    })).toEqual({ allowed: true, reason: "same_origin" });
  });

  it("allows forwarded host matches from edge/load balancer deployments", () => {
    expect(evaluateMutationOrigin({
      method: "POST",
      origin: "https://hr.customer.co",
      host: "internal.service.local",
      forwardedHost: "hr.customer.co",
    })).toEqual({ allowed: true, reason: "same_origin" });
  });

  it("blocks cross-origin mutation requests", () => {
    expect(evaluateMutationOrigin({
      method: "POST",
      origin: "https://evil.example",
      host: "hr.customer.co",
    })).toEqual({ allowed: false, reason: "cross_origin" });
  });

  it("blocks malformed origin values for mutation requests", () => {
    expect(evaluateMutationOrigin({
      method: "POST",
      origin: "not a url",
      host: "hr.customer.co",
    })).toEqual({ allowed: false, reason: "invalid_origin" });
  });

  it("allows non-browser mutation clients without an origin header", () => {
    expect(evaluateMutationOrigin({
      method: "POST",
      origin: null,
      host: "hr.customer.co",
    })).toEqual({ allowed: true, reason: "missing_origin" });
  });
});
