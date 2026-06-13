import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { updateOperationalResilienceSettings } from "@/server/readiness/operational-resilience";

export async function POST(request: Request) {
  const formData = await request.formData();
  try {
    await updateOperationalResilienceSettings(await requireTenantSession({ permission: "settings:write" }), {
      backupProvider: readString(formData.get("backupProvider")),
      backupRegion: readString(formData.get("backupRegion")),
      backupSchedule: readString(formData.get("backupSchedule")) as "hourly" | "daily" | "weekly",
      backupRetentionDays: readInteger(formData.get("backupRetentionDays")),
      backupEncryptionKeyRef: readString(formData.get("backupEncryptionKeyRef")),
      backupEnabled: formData.get("backupEnabled") === "on",
      lastBackupCompletedAt: readDate(formData.get("lastBackupCompletedAt")),
      restoreDrillTestedAt: readDate(formData.get("restoreDrillTestedAt")),
      restoreDrillStatus: readString(formData.get("restoreDrillStatus")) as "not_tested" | "failed" | "passed",
      restoreDrillTicket: readString(formData.get("restoreDrillTicket")),
      recoveryTimeObjectiveHours: readInteger(formData.get("recoveryTimeObjectiveHours")),
      recoveryPointObjectiveHours: readInteger(formData.get("recoveryPointObjectiveHours")),
      verificationStatus: readString(formData.get("verificationStatus")) === "verified" ? "verified" : "unverified",
      verificationNote: readString(formData.get("verificationNote")),
    });
    return NextResponse.redirect(new URL("/settings/operational-resilience", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update operational resilience settings.";
    return NextResponse.redirect(
      new URL(`/settings/operational-resilience?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

function readInteger(value: FormDataEntryValue | null) {
  const parsed = Number(readString(value));
  return Number.isInteger(parsed) ? parsed : undefined;
}

function readDate(value: FormDataEntryValue | null) {
  const raw = readString(value);
  return raw ? new Date(`${raw}T00:00:00+08:00`) : null;
}
