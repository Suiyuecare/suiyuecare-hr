import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { issueReportArchiveSignedUrl } from "@/server/reports/builder";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const [{ id }, session] = await Promise.all([
      params,
      requireTenantSession({ permission: "report:manage" }),
    ]);
    const signedUrl = await issueReportArchiveSignedUrl(session, id);
    return NextResponse.redirect(new URL(signedUrl.url, request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to issue report archive signed URL.";
    return NextResponse.redirect(
      new URL(`/hr/reports?error=${encodeURIComponent(message)}#report-archives`, request.url),
      303,
    );
  }
}
