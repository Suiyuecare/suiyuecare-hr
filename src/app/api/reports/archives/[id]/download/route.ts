import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { downloadReportArchive } from "@/server/reports/builder";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const [{ id }, session] = await Promise.all([
      params,
      requireTenantSession({ permission: "report:manage" }),
    ]);
    const token = new URL(request.url).searchParams.get("token");
    const download = await downloadReportArchive(session, id, token);
    return new Response(download.body, {
      headers: {
        "Content-Type": download.contentType,
        "Content-Disposition": `attachment; filename="${safeFileName(download.fileName)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to download report archive.";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}
