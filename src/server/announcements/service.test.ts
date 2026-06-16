import { describe, expect, it } from "vitest";
import {
  acknowledgeAnnouncement,
  getAnnouncementWorkspace,
  publishAnnouncement,
  resetAnnouncementDemoState,
} from "./service";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "user-hr", displayName: "林人資" },
  employee: { id: "emp-hr", displayName: "林人資" },
};

const employeeSession = {
  role: "employee" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "user-employee", displayName: "張小安" },
  employee: { id: "emp-employee", displayName: "張小安" },
};

describe("company announcements", () => {
  it("publishes announcements, tracks employee receipts, and writes redacted audit records", async () => {
    resetAuditDemoState();
    resetAnnouncementDemoState();

    const announcementId = await publishAnnouncement(hrSession, {
      title: "月底出勤補正提醒",
      body: "請確認缺卡與請假申請。",
      category: "薪資月結",
      requireReceipt: true,
    });

    let workspace = await getAnnouncementWorkspace(employeeSession);
    const announcement = workspace.announcements.find((item) => item.id === announcementId);
    expect(announcement).toMatchObject({
      title: "月底出勤補正提醒",
      requireReceipt: true,
      acknowledgedByCurrentEmployee: false,
    });

    await acknowledgeAnnouncement(employeeSession, announcementId);
    workspace = await getAnnouncementWorkspace(employeeSession);
    expect(workspace.announcements.find((item) => item.id === announcementId)).toMatchObject({
      acknowledgedByCurrentEmployee: true,
      receiptCount: 1,
    });

    const auditLogs = getAuditDemoState().logs;
    expect(auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityType: "company_announcement" }),
        expect.objectContaining({ entityType: "company_announcement_receipt" }),
      ]),
    );
    expect(JSON.stringify(auditLogs)).not.toContain("請確認缺卡與請假申請");
  });
});
