import { afterEach, describe, expect, it, vi } from "vitest";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "tenant-1",
  companyId: "company-1",
  user: { id: "user-hr", displayName: "HR" },
  employee: { id: "employee-hr", displayName: "HR" },
};

const profileInput = {
  employeeId: "employee-1",
  legalName: "Employee",
  nationalId: "A123456789",
  birthDate: new Date("1992-02-02T00:00:00.000Z"),
  gender: "female",
  nationality: "TW",
  registeredAddress: "Taipei address",
  emergencyContact: "Emergency contact",
  educationSummary: "Education reviewed.",
  workExperienceSummary: "Experience reviewed.",
  rosterSourceRef: "policy://labor-roster/2026.07",
  verificationStatus: "verified" as const,
};

describe("labor roster persistence mode", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock("@/server/db/client");
  });

  it("does not fall back to demo labor roster workspace when database mode reads fail", async () => {
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        employee: {
          findMany: vi.fn(async () => {
            throw new Error("database labor roster workspace failed");
          }),
        },
        employeeLaborRosterProfile: {
          findMany: vi.fn(async () => []),
        },
      }),
    }));

    const { getLaborRosterWorkspace } = await import("./labor-roster");

    await expect(getLaborRosterWorkspace(hrSession)).rejects.toThrow(
      "database labor roster workspace failed",
    );
  });

  it("does not fall back to demo labor roster profile saves when database mode writes fail", async () => {
    process.env.DATABASE_URL = "postgresql://hrone:hrone@localhost:5432/hrone";
    vi.doMock("@/server/db/client", () => ({
      getDb: () => ({
        $transaction: vi.fn(async () => {
          throw new Error("database labor roster write failed");
        }),
      }),
    }));

    const {
      getLaborRosterWorkspace,
      saveLaborRosterProfile,
    } = await import("./labor-roster");

    await expect(saveLaborRosterProfile(hrSession, profileInput)).rejects.toThrow(
      "database labor roster write failed",
    );
    await expect(getLaborRosterWorkspace(hrSession)).rejects.toThrow();
  });
});
