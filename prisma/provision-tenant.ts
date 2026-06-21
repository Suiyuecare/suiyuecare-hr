import { PrismaClient } from "@prisma/client";
import {
  buildProvisioningInputHash,
  provisionTenantFoundation,
  type TenantProvisioningInput,
} from "../src/server/provisioning/tenant";

const prisma = new PrismaClient();

async function main() {
  const input = parseArgs(process.argv.slice(2));
  const result = await provisionTenantFoundation(prisma, input);
  console.log("HR One tenant foundation provisioned.");
  console.log(`Tenant: ${result.tenantSlug} (${result.tenantId})`);
  console.log(`Company: ${result.companyId}`);
  console.log(`Owner user: ${result.ownerUserId}`);
  console.log(`Roles: ${result.createdRoleKeys.join(", ")}`);
  console.log(`Input hash: ${buildProvisioningInputHash(input)}`);
  console.log(`Verify: ${result.verificationCommand}`);
  console.log("Next steps:");
  for (const [index, step] of result.nextSteps.entries()) {
    console.log(`${index + 1}. ${step}`);
  }
}

function parseArgs(args: string[]): TenantProvisioningInput {
  const notificationChannel = readRequired(args, "--notification-channel");
  if (!["email", "line", "slack", "teams"].includes(notificationChannel)) {
    throw new Error("--notification-channel must be email, line, slack, or teams");
  }
  const storageProvider = readRequired(args, "--storage-provider");
  if (!["s3", "gcs", "r2", "supabase_storage"].includes(storageProvider)) {
    throw new Error("--storage-provider must be s3, gcs, r2, or supabase_storage");
  }
  return {
    tenantName: readRequired(args, "--tenant-name"),
    tenantSlug: readRequired(args, "--tenant-slug"),
    plan: readRequired(args, "--plan"),
    companyName: readRequired(args, "--company-name"),
    companyLegalName: readRequired(args, "--company-legal-name"),
    companyTaxId: readRequired(args, "--company-tax-id"),
    ownerEmail: readRequired(args, "--owner-email"),
    ownerDisplayName: readRequired(args, "--owner-display-name"),
    ownerExternalSubject: readOptional(args, "--owner-external-subject"),
    allowedEmailDomain: readRequired(args, "--allowed-email-domain"),
    ssoProvider: readRequired(args, "--sso-provider"),
    ssoIssuerUrl: readRequired(args, "--sso-issuer-url"),
    ssoClientId: readRequired(args, "--sso-client-id"),
    ssoJwksUrl: readRequired(args, "--sso-jwks-url"),
    storageProvider: storageProvider as TenantProvisioningInput["storageProvider"],
    storageBucket: readRequired(args, "--storage-bucket"),
    storageRegion: readOptional(args, "--storage-region"),
    storageBasePrefix: readOptional(args, "--storage-base-prefix"),
    storageKmsKeyRef: readRequired(args, "--storage-kms-key-ref"),
    storageLifecyclePolicyRef: readRequired(args, "--storage-lifecycle-policy-ref"),
    notificationChannel: notificationChannel as TenantProvisioningInput["notificationChannel"],
  };
}

function readRequired(args: string[], name: string) {
  const value = readOptional(args, name);
  if (!value) throw new Error(`Missing required ${name}`);
  return value;
}

function readOptional(args: string[], name: string) {
  const equalsArg = args.find((arg) => arg.startsWith(`${name}=`));
  if (equalsArg) return equalsArg.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;
  return null;
}

main()
  .catch((error) => {
    console.error("Tenant provisioning failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown provisioning error",
    });
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
