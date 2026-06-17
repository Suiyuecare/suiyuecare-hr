import { describe, expect, it } from "vitest";
import {
  buildPilotRolloutKit,
  formatPilotRolloutKitMarkdown,
  pilotRolloutKitPassed,
} from "@/server/readiness/pilot-rollout-kit";

describe("pilot rollout kit", () => {
  it("builds a short mobile-first Chinese rollout kit for employees, managers, and HR", () => {
    const kit = buildPilotRolloutKit({
      companyName: "歲月照護",
      appUrl: "https://hr.suiyuecare.com",
      supportContact: "HR 試用窗口",
      generatedAt: new Date("2026-06-17T00:00:00.000Z"),
    });

    expect(kit).toMatchObject({
      status: "ready",
      estimatedTrainingMinutes: 8,
      maxEmployeeTaskSteps: 3,
      employeeAnnouncement: {
        title: "HR One 兩週試用開始通知",
        category: "兩週試用",
        requireReceipt: true,
      },
    });
    expect(kit.employeeAnnouncement.body).toContain("預計 8 分鐘內完成");
    expect(kit.employeeTasks.map((task) => task.id)).toEqual([
      "employee-sign-in",
      "employee-clock",
      "employee-leave",
      "employee-announcement",
      "employee-payslip",
    ]);
    expect(kit.employeeTasks.every((task) => task.maxStepCount <= 3)).toBe(true);
    expect(kit.managerTasks.some((task) => task.title.includes("15 秒"))).toBe(true);
    expect(kit.hrTasks.some((task) => task.id === "hr-day-7")).toBe(true);
    expect(pilotRolloutKitPassed(kit)).toBe(true);
  });

  it("blocks unsafe rollout inputs and keeps formatted output redacted", () => {
    const kit = buildPilotRolloutKit({
      companyName: "薪資: 56000",
      appUrl: "http://localhost:3000?DATABASE_URL=postgresql://hrone:secret@db.example.com/hrone",
      supportContact: "銀行帳號: 1234567890 身分證字號: A123456789",
    });
    const markdown = formatPilotRolloutKitMarkdown(kit);

    expect(kit.status).toBe("blocked");
    expect(kit.checks.find((check) => check.id === "app_url")).toMatchObject({ status: "block" });
    expect(kit.checks.find((check) => check.id === "input_privacy")).toMatchObject({ status: "block" });
    expect(markdown).toContain("Status: blocked");
    expect(markdown).not.toContain("postgresql://");
    expect(markdown).not.toContain("secret@db.example.com");
    expect(markdown).not.toContain("薪資: 56000");
    expect(markdown).not.toContain("1234567890");
    expect(markdown).not.toContain("A123456789");
    expect(pilotRolloutKitPassed(kit)).toBe(false);
  });

  it("keeps rollout markdown shareable without raw sensitive instructions", () => {
    const kit = buildPilotRolloutKit({
      appUrl: "https://hr.suiyuecare.com/",
    });
    const markdown = formatPilotRolloutKitMarkdown(kit);

    expect(markdown).toContain("# HR One Pilot Rollout Kit");
    expect(markdown).toContain("Employee Announcement");
    expect(markdown).toContain("請不要在回報中貼薪資、銀行帳號、身分證字號、健康資料或私人備註");
    expect(markdown).toContain("Content hash:");
    expect(markdown).not.toContain("DATABASE_URL=");
    expect(markdown).not.toContain("Bearer ");
  });
});
