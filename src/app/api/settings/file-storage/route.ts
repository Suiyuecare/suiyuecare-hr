import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { updateFileStorageSettings, type FileStorageProvider } from "@/server/files/storage";

export async function POST(request: Request) {
  const formData = await request.formData();

  try {
    await updateFileStorageSettings(await requireTenantSession({ permission: "settings:write" }), {
      provider: readProvider(formData.get("provider")),
      bucketName: readString(formData.get("bucketName")),
      region: readString(formData.get("region")),
      basePrefix: readString(formData.get("basePrefix")),
      kmsKeyRef: readString(formData.get("kmsKeyRef")),
      lifecyclePolicyRef: readString(formData.get("lifecyclePolicyRef")),
      malwareScanningRequired: formData.get("malwareScanningRequired") === "on",
      signedUrlTtlMinutes: readNumber(formData.get("signedUrlTtlMinutes")),
      maxFileSizeMb: readNumber(formData.get("maxFileSizeMb")),
      allowedMimeTypes: readString(formData.get("allowedMimeTypes")).split(/[\s,]+/),
      retentionDays: readNumber(formData.get("retentionDays")),
      verificationStatus: readVerificationStatus(formData.get("verificationStatus")),
      verificationNote: readString(formData.get("verificationNote")),
    });
    return NextResponse.redirect(new URL("/settings/file-storage?success=saved", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update file storage settings.";
    return NextResponse.redirect(
      new URL(`/settings/file-storage?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}

function readVerificationStatus(value: FormDataEntryValue | null) {
  const status = readString(value);
  return status === "verified" || status === "failed" || status === "unverified" ? status : undefined;
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: FormDataEntryValue | null) {
  const number = Number(readString(value));
  return Number.isFinite(number) ? number : undefined;
}

function readProvider(value: FormDataEntryValue | null): FileStorageProvider | undefined {
  const provider = readString(value);
  const providers: FileStorageProvider[] = [
    "demo_object_storage",
    "s3",
    "r2",
    "gcs",
    "azure_blob",
    "supabase_storage",
    "custom",
  ];
  return providers.includes(provider as FileStorageProvider) ? provider as FileStorageProvider : undefined;
}
