import { describe, expect, it, beforeEach } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import {
  employeeImportTemplateHeaders,
  payrollProfileImportTemplateHeaders,
} from "@/server/readiness/pilot-import-template";
import { pilotIdentityImportTemplateHeaders } from "@/server/provisioning/pilot-identity-import";
import {
  getPilotImportPreflightWorkspace,
  resetPilotImportPreflightDemoState,
  runPilotImportPreflightForUi,
} from "@/server/readiness/pilot-import-preflight-ui";

const ownerSession = {
  role: "owner" as const,
  tenantId: "tenant_demo",
  companyId: "company_demo",
  user: { id: "user_owner", displayName: "Owner" },
  employee: null,
};

describe("pilot import preflight UI snapshot", () => {
  beforeEach(() => {
    resetAuditDemoState();
    resetPilotImportPreflightDemoState();
  });

  it("stores only redacted aggregate preflight evidence for the browser workflow", async () => {
    const input = buildRealCustomerCsvBundle(20);
    const snapshot = await runPilotImportPreflightForUi(ownerSession, {
      ...input,
      checkedAt: new Date("2026-06-17T00:00:00.000Z"),
    });
    const workspace = await getPilotImportPreflightWorkspace(ownerSession);
    const auditLog = getAuditDemoState().logs[0];

    expect(snapshot.report).toMatchObject({
      status: "ready",
      employeeRows: 20,
      identityRows: 20,
      payrollRows: 20,
      blockers: 0,
      warnings: 0,
    });
    expect(workspace.readyForCustomerImport).toBe(true);
    expect(workspace.latestSnapshot?.contentHash).toBe(snapshot.contentHash);
    expect(auditLog).toMatchObject({
      action: "create",
      entityType: "pilot_import_preflight",
      entityId: snapshot.id,
    });

    const serializedSnapshot = JSON.stringify(snapshot);
    const serializedAudit = JSON.stringify(auditLog);
    for (const leakedValue of [
      "正式員工01",
      "a001@customer.example",
      "oidc-a001",
      "56000",
      "123456789001",
    ]) {
      expect(serializedSnapshot).not.toContain(leakedValue);
      expect(serializedAudit).not.toContain(leakedValue);
    }
    expect(snapshot.rawCsvStored).toBe(false);
    expect(snapshot.sensitiveValuesReturned).toBe(false);
    expect(auditLog.metadataJson).toMatchObject({
      rawCsvStored: false,
      rawSensitiveDataIncluded: false,
      sensitiveValuesReturned: false,
    });
  });

  it("keeps blocked results visible without leaking completed CSV values", async () => {
    const input = buildRealCustomerCsvBundle(20);
    const shortIdentityCsv = input.identityCsv.trim().split(/\r?\n/).slice(0, -1).join("\n");

    await runPilotImportPreflightForUi(ownerSession, {
      employeeCsv: input.employeeCsv,
      identityCsv: `${shortIdentityCsv}\n`,
      payrollCsv: input.payrollCsv,
      checkedAt: new Date("2026-06-17T00:00:00.000Z"),
    });

    const workspace = await getPilotImportPreflightWorkspace(ownerSession);
    expect(workspace.readyForCustomerImport).toBe(false);
    expect(workspace.latestSnapshot?.report.status).toBe("blocked");
    expect(workspace.latestSnapshot?.report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "identity rows match employee rows", status: "block" }),
      ]),
    );
    expect(JSON.stringify(workspace.latestSnapshot)).not.toContain("a001@customer.example");
  });

  it("requires management permissions to run or view the preflight workspace", async () => {
    const employeeSession = {
      ...ownerSession,
      role: "employee" as const,
      user: { id: "user_employee", displayName: "Employee" },
    };
    const input = buildRealCustomerCsvBundle(20);

    await expect(runPilotImportPreflightForUi(employeeSession, input)).rejects.toThrow(/pilot:manage/);
    await expect(getPilotImportPreflightWorkspace(employeeSession)).rejects.toThrow(/settings:read/);
  });
});

function buildRealCustomerCsvBundle(count: number) {
  const employeeRows = Array.from({ length: count }, (_, index) => {
    const employeeNo = `A${String(index + 1).padStart(3, "0")}`;
    const managerEmployeeNo = index < 2 ? "" : index % 2 === 0 ? "A001" : "A002";
    return [
      employeeNo,
      `正式員工${String(index + 1).padStart(2, "0")}`,
      index < 2 ? "Team Lead" : "Care Specialist",
      index % 2 === 0 ? "CARE" : "OPS",
      "2026-07-01",
      managerEmployeeNo,
    ];
  });
  const identityRows = Array.from({ length: count }, (_, index) => {
    const employeeNo = `A${String(index + 1).padStart(3, "0")}`;
    return [
      employeeNo,
      `${employeeNo.toLowerCase()}@customer.example`,
      `oidc-${employeeNo.toLowerCase()}`,
    ];
  });
  const payrollRows = Array.from({ length: count }, (_, index) => [
    `A${String(index + 1).padStart(3, "0")}`,
    "56000",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "resident",
    "0",
    "",
    "",
    "",
    "",
    "004",
    "0001",
    `正式員工${String(index + 1).padStart(2, "0")}`,
    `1234567890${String(index + 1).padStart(2, "0")}`,
    "2026-07-01",
  ]);

  return {
    employeeCsv: toCsv([[...employeeImportTemplateHeaders], ...employeeRows]),
    identityCsv: toCsv([[...pilotIdentityImportTemplateHeaders], ...identityRows]),
    payrollCsv: toCsv([[...payrollProfileImportTemplateHeaders], ...payrollRows]),
  };
}

function toCsv(rows: string[][]) {
  return `${rows.map((row) => row.join(",")).join("\n")}\n`;
}
