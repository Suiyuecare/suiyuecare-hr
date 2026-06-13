import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { createEmployeeDocument } from "@/server/employees/documents";

export async function POST(request: Request) {
  const formData = await request.formData();

  try {
    await createEmployeeDocument(await requireTenantSession({ permission: "employee:write" }), {
      employeeId: readString(formData.get("employeeId")),
      category: readString(formData.get("category")),
      title: readString(formData.get("title")),
      fileName: readString(formData.get("fileName")),
      mimeType: readString(formData.get("mimeType")) || "application/pdf",
      fileSizeBytes: readNumber(formData.get("fileSizeBytes")),
      visibleToEmployee: formData.get("visibleToEmployee") === "on",
      expiresAt: parseOptionalDate(formData.get("expiresAt")),
    });
    return NextResponse.redirect(new URL("/hr/documents", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create employee document.";
    return NextResponse.redirect(
      new URL(`/hr/documents?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: FormDataEntryValue | null) {
  const number = Number(readString(value));
  return Number.isFinite(number) ? number : 0;
}

function parseOptionalDate(value: FormDataEntryValue | null) {
  const raw = readString(value);
  if (!raw) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid expiry date.");
  }
  return date;
}
