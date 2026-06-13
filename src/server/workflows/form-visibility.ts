import type { Prisma } from "@prisma/client";
import type { FormField, FormVisibilityRule } from "./types";
import { readWorkflowCondition } from "./workflow-engine";

export function readFormVisibilityRules(value: Prisma.JsonValue): FormVisibilityRule[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => readWorkflowCondition(item))
    .filter((item): item is FormVisibilityRule => Boolean(item));
}

export function visibilityRulesFromFields(fields: FormField[]) {
  return fields
    .map((field) => field.visibilityRule)
    .filter((item): item is FormVisibilityRule => Boolean(item));
}

export function isFormFieldVisible(field: FormField, values: Record<string, string>) {
  const rule = field.visibilityRule;
  if (!rule) {
    return true;
  }

  const actual = values[rule.fieldId] ?? "";
  return actual.trim().toLowerCase() === rule.expectedValue.trim().toLowerCase();
}

export function visibleFormFields(fields: FormField[], values: Record<string, string>) {
  return fields.filter((field) => isFormFieldVisible(field, values));
}

export function summarizeVisibilityRules(fields: FormField[]) {
  const conditionalFields = fields.filter((field) => field.visibilityRule);
  if (conditionalFields.length === 0) {
    return "All fields are always shown.";
  }

  return `${conditionalFields.length} conditional field(s) configured.`;
}
