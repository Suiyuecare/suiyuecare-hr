import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { issueReportArchiveDownloadToken } from "@/server/reports/builder";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const [{ id }, session] = await Promise.all([
      params,
      requireTenantSession({ permission: "report:manage" }),
    ]);
    const issued = await issueReportArchiveDownloadToken(session, id);
    const downloadUrl = `/api/reports/archives/${encodeURIComponent(id)}/download?token=${encodeURIComponent(issued.token)}`;
    return NextResponse.redirect(
      new URL(downloadUrl, request.url),
      303,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to issue report archive download token.";
    return NextResponse.redirect(
      new URL(`/hr/reports?error=${encodeURIComponent(message)}#report-archives`, request.url),
      303,
    );
  }
}
