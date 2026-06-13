import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { prepareAnnualLeaveSettlements } from "@/server/leave/annual-leave-settlements";

export async function POST(request: Request) {
  const formData = await request.formData();
  try {
    await prepareAnnualLeaveSettlements(await requireTenantSession({ permission: "payroll:manage" }), {
      payrollRunId: readString(formData.get("payrollRunId")) || null,
      reason: readString(formData.get("reason")) === "contract_termination"
        ? "contract_termination"
        : "year_end",
    });
    return NextResponse.redirect(new URL("/hr/annual-leave-settlements", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to prepare annual leave settlements.";
    return NextResponse.redirect(
      new URL(`/hr/annual-leave-settlements?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}
