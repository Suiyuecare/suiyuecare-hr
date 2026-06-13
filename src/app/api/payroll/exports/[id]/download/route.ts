import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { downloadPayrollExportPackage } from "@/server/payroll/exports";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const [{ id }, session] = await Promise.all([
      params,
      requireTenantSession({ permission: "payroll:manage" }),
    ]);
    const download = await downloadPayrollExportPackage(session, id);
    return new Response(download.body, {
      headers: {
        "Content-Type": download.contentType,
        "Content-Disposition": `attachment; filename="${safeFileName(download.fileName)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to download payroll export.";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}
