import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { updateTenantSubscription, type SubscriptionStatus, type SubscriptionVerificationStatus } from "@/server/subscriptions/service";

export async function POST(request: Request) {
  const formData = await request.formData();

  try {
    await updateTenantSubscription(await requireTenantSession({ permission: "subscription:manage" }), {
      plan: readString(formData.get("plan")),
      status: readString(formData.get("status")) as SubscriptionStatus,
      seatLimit: readNumber(formData.get("seatLimit")),
      trialEndsAt: readDate(formData.get("trialEndsAt")),
      contractStartsAt: readDate(formData.get("contractStartsAt")),
      contractEndsAt: readDate(formData.get("contractEndsAt")),
      renewalNoticeDays: readNumber(formData.get("renewalNoticeDays")),
      billingContactEmail: readString(formData.get("billingContactEmail")),
      contractRef: readString(formData.get("contractRef")),
      contractHash: readString(formData.get("contractHash")),
      paymentCollectionMode: readString(formData.get("paymentCollectionMode")),
      verificationStatus: readString(formData.get("verificationStatus")) as SubscriptionVerificationStatus,
    });
    return NextResponse.redirect(new URL("/settings/subscription", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update subscription.";
    return NextResponse.redirect(
      new URL(`/settings/subscription?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: FormDataEntryValue | null) {
  const number = Number(readString(value));
  return Number.isFinite(number) ? number : undefined;
}

function readDate(value: FormDataEntryValue | null) {
  const text = readString(value);
  return text ? new Date(`${text}T00:00:00.000Z`) : null;
}
