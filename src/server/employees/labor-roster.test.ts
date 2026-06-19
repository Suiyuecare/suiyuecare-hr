import { describe, expect, it } from "vitest";
import {
  getLaborRosterWorkspace,
  resetLaborRosterDemoState,
  saveLaborRosterProfile,
} from "@/server/employees/labor-roster";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-hr", displayName: "HR" },
  employee: { id: "demo-hr-employee", displayName: "HR" },
};

describe("labor roster", () => {
  it("tracks Taiwan labor roster coverage without exposing raw PII", async () => {
    resetLaborRosterDemoState();

    const workspace = await getLaborRosterWorkspace(hrSession);

    expect(workspace.coverage.employeeCount).toBe(25);
    expect(workspace.coverage.completeCount).toBe(25);
    expect(workspace.coverage.verifiedCount).toBe(25);
    expect(workspace.coverage.coverageRate).toBe(100);
    expect(JSON.stringify(workspace)).not.toContain("A123456780");
    expect(JSON.stringify(workspace)).not.toContain("Taipei demo address");
  });

  it("saves a verified roster profile with hashed sensitive fields", async () => {
    resetLaborRosterDemoState();

    const profile = await saveLaborRosterProfile(hrSession, {
      employeeId: "demo-employee-1",
      legalName: "張小安",
      nationalId: "A123456789",
      birthDate: new Date("1992-02-02T00:00:00.000Z"),
      gender: "female",
      nationality: "TW",
      hometown: "Taiwan",
      registeredAddress: "台北市測試路一段一號",
      emergencyContact: "王小安 0912345678",
      educationSummary: "Bachelor degree reviewed.",
      workExperienceSummary: "Experience reviewed.",
      wageInfo: "薪資 profile 已由 HR 複核",
      laborInsuranceEnrollmentDate: new Date("2025-01-01T00:00:00.000Z"),
      rewardDisciplineSummary: "無獎懲紀錄",
      injurySicknessSummary: "無傷病紀錄",
      otherNecessaryItems: "其他必要事項已複核",
      rosterSourceRef: "demo://labor-roster/test",
      verificationStatus: "verified",
    });

    expect(profile.status).toBe("complete");
    expect(profile.missingFields).toEqual([]);
    expect(profile.nationalIdHash).toBeTruthy();
    expect(profile.registeredAddressHash).toBeTruthy();
    expect(JSON.stringify(profile)).not.toContain("A123456789");
    expect(JSON.stringify(profile)).not.toContain("台北市測試路");
    expect(JSON.stringify(profile)).not.toContain("薪資 profile");
    expect(JSON.stringify(profile)).not.toContain("無獎懲紀錄");
  });
});
