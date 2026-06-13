import { NextResponse } from "next/server";
import { requireTenantSession } from "@/server/auth/guards";
import { decidePayrollAdjustment } from "@/server/payroll/adjustments";
import { decideApproval } from "@/server/workflows/service";
import { parseText } from "../form-utils";

export async function POST(request: Request) {
  const formData = await request.formData();
  const action = parseText(formData.get("decision"), "approve") === "reject" ? "reject" : "approve";
  const requestType = parseText(formData.get("requestType"), "");
  if (requestType === "payroll_adjustment") {
    const session = await requireTenantSession({ permission: "payroll_adjustment:approve" });
    await decidePayrollAdjustment(session, {
      adjustmentId: parseText(formData.get("requestId"), ""),
      decision: action === "reject" ? "reject" : "approve",
      comment: parseText(formData.get("comment"), action === "approve" ? "Approved" : "Rejected"),
    });
    return NextResponse.redirect(new URL("/manager/inbox", request.url), 303);
  }

  const session = await requireTenantSession({ permission: "approval:act", employeeRequired: true });
  await decideApproval(session, {
    requestId: parseText(formData.get("requestId"), ""),
    action,
    comment: parseText(formData.get("comment"), action === "approve" ? "Approved" : "Rejected"),
  });
  return NextResponse.redirect(new URL("/manager/inbox", request.url), 303);
}
