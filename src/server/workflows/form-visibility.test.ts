import { describe, expect, it } from "vitest";
import {
  isFormFieldVisible,
  readFormVisibilityRules,
  summarizeVisibilityRules,
  visibleFormFields,
} from "./form-visibility";
import type { FormField } from "./types";

describe("form visibility rules", () => {
  const fields: FormField[] = [
    { id: "type", label: "Type", type: "select", required: true, options: ["Simple", "Other"] },
    {
      id: "details",
      label: "Details",
      type: "textarea",
      required: true,
      visibilityRule: { type: "field_equals", fieldId: "type", expectedValue: "Other" },
    },
  ];

  it("shows conditional fields only when their controlling value matches", () => {
    expect(isFormFieldVisible(fields[1], { type: "Simple" })).toBe(false);
    expect(isFormFieldVisible(fields[1], { type: " other " })).toBe(true);
    expect(visibleFormFields(fields, { type: "Simple" }).map((field) => field.id)).toEqual(["type"]);
  });

  it("reads persisted visibility rule json and summarizes HR-facing setup", () => {
    expect(
      readFormVisibilityRules([
        { type: "field_equals", fieldId: "type", expectedValue: "Other" },
        { placeholder: true },
      ]),
    ).toEqual([{ type: "field_equals", fieldId: "type", expectedValue: "Other" }]);
    expect(summarizeVisibilityRules(fields)).toBe("1 conditional field(s) configured.");
    expect(summarizeVisibilityRules([fields[0]])).toBe("All fields are always shown.");
  });
});
