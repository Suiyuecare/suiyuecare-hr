"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/server/audit/audit";
import { assertDemoAuthAllowed } from "@/server/auth/demo-mode";
import { demoCookieOptions, demoRoleCookie, getDemoSession } from "@/server/auth/demo-session";
import { dashboardPathForRole, normalizeRole } from "@/server/auth/rbac";
import { getDb } from "@/server/db/client";
import {
  clockAttendance,
  createLeaveRequest,
  createOvertimeRequest,
  createPunchCorrectionRequest,
  decideApproval,
} from "@/server/workflows/service";
import type { PunchSource } from "@/server/workflows/types";

export async function switchDemoRole(formData: FormData) {
  assertDemoAuthAllowed();
  const role = normalizeRole(String(formData.get("role") ?? ""));
  const previousSession = await getDemoSession();
  const cookieStore = await cookies();
  cookieStore.set(demoRoleCookie, role, demoCookieOptions());

  if (process.env.DATABASE_URL && previousSession.tenantId && previousSession.companyId) {
    await writeAuditLog(getDb(), {
      tenantId: previousSession.tenantId,
      companyId: previousSession.companyId,
      actorUserId: previousSession.user?.id,
      actorEmployeeId: previousSession.employee?.id,
      action: "role_switch",
      entityType: "demo_session",
      entityId: previousSession.user?.id ?? "anonymous",
      metadata: {
        previousRole: previousSession.role,
        nextRole: role,
      },
    }).catch(() => undefined);
  }

  redirect(dashboardPathForRole(role));
}

export async function clockInAction(formData: FormData) {
  const session = await getDemoSession();
  await clockAttendance(session, {
    direction: "in",
    source: parsePunchSource(formData.get("source")),
  });
  revalidatePath("/app");
  redirect("/app");
}

export async function clockOutAction(formData: FormData) {
  const session = await getDemoSession();
  await clockAttendance(session, {
    direction: "out",
    source: parsePunchSource(formData.get("source")),
  });
  revalidatePath("/app");
  redirect("/app");
}

export async function submitLeaveAction(formData: FormData) {
  const session = await getDemoSession();
  await createLeaveRequest(session, {
    startAt: parseDateTime(formData.get("startDate"), formData.get("startTime")),
    endAt: parseDateTime(formData.get("endDate"), formData.get("endTime")),
    units: parseNumber(formData.get("units"), 1),
    reason: parseText(formData.get("reason"), "Leave request"),
  });
  revalidatePath("/app");
  revalidatePath("/manager/inbox");
  redirect("/app#requests");
}

export async function submitOvertimeAction(formData: FormData) {
  const session = await getDemoSession();
  await createOvertimeRequest(session, {
    startAt: parseDateTime(formData.get("startDate"), formData.get("startTime")),
    endAt: parseDateTime(formData.get("endDate"), formData.get("endTime")),
    reason: parseText(formData.get("reason"), "Overtime request"),
  });
  revalidatePath("/app");
  revalidatePath("/manager/inbox");
  redirect("/app#requests");
}

export async function submitPunchCorrectionAction(formData: FormData) {
  const session = await getDemoSession();
  const workDate = parseDate(formData.get("workDate"));
  const clockInTime = parseOptionalTime(formData.get("clockInTime"));
  const clockOutTime = parseOptionalTime(formData.get("clockOutTime"));
  await createPunchCorrectionRequest(session, {
    workDate,
    requestedClockInAt: clockInTime ? combineDateAndTime(workDate, clockInTime) : null,
    requestedClockOutAt: clockOutTime ? combineDateAndTime(workDate, clockOutTime) : null,
    reason: parseText(formData.get("reason"), "Punch correction request"),
  });
  revalidatePath("/app");
  revalidatePath("/manager/inbox");
  redirect("/app#requests");
}

export async function approveRequestAction(formData: FormData) {
  await reviewRequest(formData, "approve");
}

export async function rejectRequestAction(formData: FormData) {
  await reviewRequest(formData, "reject");
}

async function reviewRequest(formData: FormData, action: "approve" | "reject") {
  const session = await getDemoSession();
  await decideApproval(session, {
    requestId: parseText(formData.get("requestId"), ""),
    action,
    comment: parseText(formData.get("comment"), action === "approve" ? "Approved" : "Rejected"),
  });
  revalidatePath("/manager/inbox");
  revalidatePath("/app");
  redirect("/manager/inbox");
}

function parsePunchSource(value: FormDataEntryValue | null): PunchSource {
  return value === "web" || value === "manual" || value === "mobile" ? value : "mobile";
}

function parseDateTime(
  dateValue: FormDataEntryValue | null,
  timeValue: FormDataEntryValue | null,
) {
  return combineDateAndTime(parseDate(dateValue), parseOptionalTime(timeValue) ?? "09:00");
}

function parseDate(value: FormDataEntryValue | null) {
  const text = typeof value === "string" && value ? value : todayInputValue();
  return new Date(`${text}T00:00:00`);
}

function parseOptionalTime(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value) {
    return null;
  }

  return value;
}

function combineDateAndTime(date: Date, time: string) {
  return new Date(`${toInputDate(date)}T${time}:00`);
}

function parseNumber(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseText(value: FormDataEntryValue | null, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function todayInputValue() {
  return toInputDate(new Date());
}

function toInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
