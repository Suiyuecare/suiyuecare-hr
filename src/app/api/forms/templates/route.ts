import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { createFormTemplate } from "@/server/workflows/service";
import type { FormFieldType } from "@/server/workflows/types";

export async function POST(request: Request) {
  const formData = await request.formData();
  const fieldType = parseFieldType(formData.get("fieldType"));
  const workflowStepTypes: Array<"direct_manager" | "hr_admin"> = ["direct_manager"];
  if (formData.get("includeHr") === "on") {
    workflowStepTypes.push("hr_admin");
  }

  await createFormTemplate(await requireTenantSession({ permission: "form:manage" }), {
    title: parseText(formData.get("title"), "Custom HR form"),
    description: parseText(formData.get("description"), "Employee request form"),
    category: parseText(formData.get("category"), "Employee service"),
    fields: [
      {
        id: "primary",
        label: parseText(formData.get("fieldLabel"), "Request detail"),
        type: fieldType,
        required: formData.get("required") === "on",
        options:
          fieldType === "select"
            ? parseText(formData.get("options"), "Option A,Option B")
                .split(",")
                .map((option) => option.trim())
                .filter(Boolean)
            : undefined,
      },
      {
        id: "notes",
        label: "Notes",
        type: "textarea",
        required: false,
      },
    ],
    workflowStepTypes,
  });

  return NextResponse.redirect(new URL("/hr/forms", request.url), 303);
}

function parseText(value: FormDataEntryValue | null, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function parseFieldType(value: FormDataEntryValue | null): FormFieldType {
  const allowed: FormFieldType[] = [
    "text",
    "number",
    "date",
    "select",
    "file",
    "checkbox",
    "textarea",
  ];
  return allowed.includes(value as FormFieldType) ? (value as FormFieldType) : "text";
}
