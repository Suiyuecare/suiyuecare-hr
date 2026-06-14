import { beforeEach, describe, expect, it } from "vitest";
import { getAuditDemoState, resetAuditDemoState } from "@/server/audit/demo-store";
import {
  getCompanySecuritySettings,
  resetSecuritySettingsDemoState,
  updateCompanySecuritySettings,
} from "./security";

const ownerSession = {
  role: "owner" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-owner", displayName: "王老闆" },
  employee: null,
};

const managerSession = {
  role: "manager" as const,
  tenantId: "demo-tenant",
  companyId: "demo-company",
  user: { id: "demo-user-manager", displayName: "陳主管" },
  employee: { id: "demo-manager-employee", displayName: "陳主管" },
};

describe("company security settings", () => {
  beforeEach(() => {
    resetSecuritySettingsDemoState();
    resetAuditDemoState();
  });

  it("updates security settings with audit trail", async () => {
    const updated = await updateCompanySecuritySettings(ownerSession, {
      mfaRequiredForAdmins: true,
      mfaRequiredForEmployees: true,
      ssoEnabled: true,
      ssoProvider: "Entra ID",
      ssoIssuerUrl: "https://login.example.com/demo/v2.0",
      ssoClientId: "hr-one-client-id",
      ssoJwksUrl: "https://login.example.com/demo/discovery/v2.0/keys",
      passwordMinLength: 14,
      passwordRequiresNumber: true,
      passwordRequiresSymbol: true,
      sessionTimeoutMinutes: 720,
      idleTimeoutMinutes: 45,
      allowedEmailDomains: ["example.com", "example.com", "hr.example.com"],
    });
    const settings = await getCompanySecuritySettings(ownerSession);

    expect(updated).toMatchObject({
      mfaRequiredForEmployees: true,
      ssoEnabled: true,
      ssoProvider: "Entra ID",
      ssoIssuerUrl: "https://login.example.com/demo/v2.0",
      ssoClientId: "hr-one-client-id",
      ssoJwksUrl: "https://login.example.com/demo/discovery/v2.0/keys",
      passwordMinLength: 14,
      idleTimeoutMinutes: 45,
      allowedEmailDomains: ["example.com", "hr.example.com"],
    });
    expect(settings).toEqual(updated);
    expect(getAuditDemoState().logs[0]).toMatchObject({
      action: "update",
      entityType: "company_security_settings",
    });
  });

  it("preserves existing security controls during partial updates", async () => {
    await updateCompanySecuritySettings(ownerSession, {
      mfaRequiredForAdmins: true,
      mfaRequiredForEmployees: true,
      ssoEnabled: true,
      ssoProvider: "Entra ID",
      ssoIssuerUrl: "https://login.example.com/demo/v2.0",
      ssoClientId: "hr-one-client-id",
      ssoJwksUrl: "https://login.example.com/demo/discovery/v2.0/keys",
      passwordMinLength: 14,
      passwordRequiresNumber: true,
      passwordRequiresSymbol: true,
      sessionTimeoutMinutes: 720,
      idleTimeoutMinutes: 45,
      allowedEmailDomains: ["example.com"],
    });

    const updated = await updateCompanySecuritySettings(ownerSession, {
      idleTimeoutMinutes: 30,
    });

    expect(updated).toMatchObject({
      mfaRequiredForAdmins: true,
      mfaRequiredForEmployees: true,
      ssoEnabled: true,
      ssoProvider: "Entra ID",
      ssoIssuerUrl: "https://login.example.com/demo/v2.0",
      ssoClientId: "hr-one-client-id",
      ssoJwksUrl: "https://login.example.com/demo/discovery/v2.0/keys",
      passwordMinLength: 14,
      passwordRequiresNumber: true,
      passwordRequiresSymbol: true,
      sessionTimeoutMinutes: 720,
      idleTimeoutMinutes: 30,
      allowedEmailDomains: ["example.com"],
    });
  });

  it("blocks non-admin settings writes", async () => {
    await expect(
      updateCompanySecuritySettings(managerSession, {
        mfaRequiredForEmployees: true,
      }),
    ).rejects.toThrow(/settings:write/);
  });
});
