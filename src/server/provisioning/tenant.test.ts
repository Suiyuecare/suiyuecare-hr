import { describe, expect, it } from "vitest";
import {
  buildProvisioningInputHash,
  validateTenantProvisioningInput,
  type TenantProvisioningInput,
} from "@/server/provisioning/tenant";

const validInput: TenantProvisioningInput = {
  tenantName: "Customer A",
  tenantSlug: "customer-a",
  plan: "enterprise",
  companyName: "Customer A",
  companyLegalName: "Customer A Co., Ltd.",
  companyTaxId: "12345678",
  ownerEmail: "owner@customer.example",
  ownerDisplayName: "Customer Owner",
  ownerExternalSubject: "00000000-0000-0000-0000-000000000001",
  allowedEmailDomain: "customer.example",
  ssoProvider: "Entra ID",
  ssoIssuerUrl: "https://login.example.com/customer/v2.0",
  ssoClientId: "hr-one-client",
  ssoJwksUrl: "https://login.example.com/customer/keys",
  storageProvider: "s3",
  storageBucket: "customer-a-hrone-documents",
  storageRegion: "ap-northeast-1",
  storageBasePrefix: "hr-one/customer-a",
  storageKmsKeyRef: "alias/customer-a-hrone",
  notificationChannel: "email",
};

describe("tenant provisioning validation", () => {
  it("accepts a production customer foundation input", () => {
    expect(validateTenantProvisioningInput(validInput)).toEqual([]);
  });

  it("rejects demo identity and weak launch posture", () => {
    const errors = validateTenantProvisioningInput({
      ...validInput,
      tenantSlug: "hr-one-demo",
      plan: "demo",
      companyTaxId: "DEMO-TAX-ID",
      ownerEmail: "owner@hrone.test",
      allowedEmailDomain: "hrone.test",
      ssoIssuerUrl: "http://login.example.com",
      ssoJwksUrl: "http://login.example.com/keys",
      storageKmsKeyRef: "",
    });

    expect(errors).toContain("tenantSlug cannot be the demo slug");
    expect(errors).toContain("plan must be a non-demo commercial plan");
    expect(errors).toContain("companyTaxId must be a real non-demo identifier");
    expect(errors).toContain("allowedEmailDomain must be a non-demo company domain");
    expect(errors).toContain("ssoIssuerUrl must be an https URL");
    expect(errors).toContain("ssoJwksUrl must be an https URL");
    expect(errors).toContain("storageKmsKeyRef is required");
  });

  it("hashes only non-secret provisioning posture fields", () => {
    const hash = buildProvisioningInputHash(validInput);

    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(validInput.ssoClientId);
    expect(hash).not.toContain(validInput.storageKmsKeyRef);
  });
});
