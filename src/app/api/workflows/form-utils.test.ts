import { describe, expect, it } from "vitest";
import { parseNumber } from "./form-utils";

describe("workflow form utils", () => {
  it("uses the fallback for blank numeric form values", () => {
    expect(parseNumber("", 1)).toBe(1);
    expect(parseNumber("   ", 0.5)).toBe(0.5);
    expect(parseNumber(null, 1)).toBe(1);
    expect(parseNumber("2.5", 1)).toBe(2.5);
  });
});
