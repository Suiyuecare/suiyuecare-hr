import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { createCustomFormSubmission, getFormTemplates } from "@/server/workflows/service";
import { parseAttachmentMetadata } from "@/app/api/workflows/form-utils";

export async function POST(request: Request) {
  const formData = await request.formData();
  const session = await requireTenantSession({ permission: "form:submit", employeeRequired: true });
  const templateId = String(formData.get("templateId") ?? "");
  const template = (await getFormTemplates(session)).find((item) => item.id === templateId);
  if (!template) {
    throw new Error("Form template not found.");
  }

  const values = Object.fromEntries(
    template.fields.map((field) => [field.id, normalizeValue(formData.get(field.id))]),
  );
  const attachments = Object.fromEntries(
    template.fields
      .filter((field) => field.type === "file")
      .map((field) => {
        const attachment = parseAttachmentMetadata(formData, `${field.id}__`);
        return [field.id, attachment ? [attachment] : []];
      }),
  );
  await createCustomFormSubmission(session, {
    templateId,
    values,
    attachments,
  });
  return NextResponse.redirect(new URL("/app#requests", request.url), 303);
}

function normalizeValue(value: FormDataEntryValue | null) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.name;
}
