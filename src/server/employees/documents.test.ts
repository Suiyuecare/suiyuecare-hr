import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import { resetFileStorageDemoState } from "@/server/files/storage";
import {
  createEmployeeDocument,
  getEmployeeDocumentWorkspace,
  getOwnEmployeeDocuments,
  resetEmployeeDocumentDemoState,
} from "./documents";

const hrSession = {
  role: "hr_admin" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-hr", displayName: "林人資" },
  employee: { id: "demo-hr-employee", displayName: "林人資" },
};

const employeeSession = {
  role: "employee" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-employee", displayName: "張小安" },
  employee: { id: "demo-employee-1", displayName: "張小安" },
};

const managerSession = {
  role: "manager" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-manager", displayName: "陳主管" },
  employee: { id: "demo-manager-employee", displayName: "陳主管" },
};

describe("employee documents", () => {
  beforeEach(() => {
    resetEmployeeDocumentDemoState();
    resetFileStorageDemoState();
    resetAuditDemoState();
  });

  it("creates audited metadata and exposes only employee-visible own documents", async () => {
    await createEmployeeDocument(hrSession, {
      employeeId: "demo-employee-1",
      category: "contract",
      title: "Employment contract",
      fileName: "contract.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 120000,
      visibleToEmployee: true,
    });
    await createEmployeeDocument(hrSession, {
      employeeId: "demo-employee-2",
      category: "identity",
      title: "Identity copy",
      fileName: "id.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 80000,
      visibleToEmployee: true,
    });
    await createEmployeeDocument(hrSession, {
      employeeId: "demo-employee-1",
      category: "other",
      title: "Private HR note",
      fileName: "private.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 1000,
      visibleToEmployee: false,
    });

    const workspace = await getEmployeeDocumentWorkspace(hrSession);
    const ownDocuments = await getOwnEmployeeDocuments(employeeSession);

    expect(workspace.documents).toHaveLength(3);
    expect(ownDocuments).toHaveLength(1);
    expect(ownDocuments[0]).toMatchObject({
      employeeId: "demo-employee-1",
      title: "Employment contract",
      visibleToEmployee: true,
      storageProvider: "demo_object_storage",
      malwareScanStatus: "pending",
    });
    expect(ownDocuments[0]?.storageKey).toContain("demo_object_storage://hr-one-demo-vault/hr-one/");
    expect(getAuditDemoState().logs[0]).toMatchObject({
      action: "create",
      entityType: "employee_document",
    });
  });

  it("blocks managers from document administration", async () => {
    await expect(getEmployeeDocumentWorkspace(managerSession)).rejects.toThrow(/employee:write/);
    await expect(
      createEmployeeDocument(managerSession, {
        employeeId: "demo-employee-1",
        category: "contract",
        title: "Contract",
        fileName: "contract.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 1000,
        visibleToEmployee: true,
      }),
    ).rejects.toThrow(/employee:write/);
  });
});
