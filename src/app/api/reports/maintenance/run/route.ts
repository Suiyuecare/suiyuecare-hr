import { NextResponse } from "next/server";
import { cleanupExpiredAiResults } from "@/server/ai/results";
import { requireTenantSession } from "@/server/auth/guards";
import { runReportExportMaintenance } from "@/server/reports/builder";

export async function POST(request: Request) {
  try {
    const session = await requireTenantSession({ permission: "report:manage" });
    const reportMaintenance = await runReportExportMaintenance(session, {
      workerId: "manual-report-maintenance",
    });
    const aiCleanup = await cleanupExpiredAiResults(session);
    const success = reportMaintenance.queue.processedCount > 0
      || reportMaintenance.cleanup.expiredCount > 0
      || aiCleanup.expiredCount > 0
      ? "report-maintenance"
      : "report-maintenance-empty";
    return NextResponse.redirect(new URL(`/hr/reports?success=${success}#report-jobs`, request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run maintenance.";
    return NextResponse.redirect(
      new URL(`/hr/reports?error=${encodeURIComponent(message)}#report-jobs`, request.url),
      303,
    );
  }
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = buildCronSession();
  if (!session.tenantId || !session.companyId) {
    return NextResponse.json(
      {
        ok: false,
        error: "Report maintenance tenant/company env is not configured.",
      },
      { status: 503 },
    );
  }

  try {
    const reportMaintenance = await runReportExportMaintenance(session, {
      workerId: "vercel-cron-report-maintenance",
      limit: 20,
      cleanupLimit: 20,
    });
    const aiCleanup = await cleanupExpiredAiResults(session, {
      limit: 100,
    });

    return NextResponse.json({
      ok: true,
      queue: {
        processedCount: reportMaintenance.queue.processedCount,
        skippedCount: reportMaintenance.queue.skippedCount,
        failedCount: reportMaintenance.queue.failedCount,
      },
      cleanup: {
        expiredCount: reportMaintenance.cleanup.expiredCount,
        skippedCount: reportMaintenance.cleanup.skippedCount,
      },
      aiCleanup: {
        expiredCount: aiCleanup.expiredCount,
        skippedCount: aiCleanup.skippedCount,
      },
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Report maintenance failed. Check protected server logs and audit records.",
      },
      { status: 500 },
    );
  }
}

function isAuthorizedCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.HR_ONE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function buildCronSession() {
  return {
    role: "owner" as const,
    tenantId: process.env.HR_ONE_CRON_TENANT_ID?.trim() || process.env.HR_ONE_MAINTENANCE_TENANT_ID?.trim() || null,
    companyId: process.env.HR_ONE_CRON_COMPANY_ID?.trim() || process.env.HR_ONE_MAINTENANCE_COMPANY_ID?.trim() || null,
    user: {
      id: "system-report-maintenance",
      displayName: "HR One 報表維護排程",
    },
    employee: null,
  };
}
