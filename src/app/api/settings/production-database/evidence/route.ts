import { NextResponse } from "next/server";
import { generateProductionDatabaseEvidencePackage } from "@/server/audit/evidence-packages";
import { requireTenantSession } from "@/server/auth/guards";
import {
  buildProductionDatabasePrivateSchemaReport,
  buildProductionDatabasePrivateSchemaReportFromPayload,
  getProductionDatabaseRemediationReport,
} from "@/server/readiness/production-database-remediation";

const returnPath = "/settings/production-database";
const privateSchemaVerifyCommand =
  "pnpm db:supabase:verify-schema -- --project-ref=aruncclorusswpfnpgsn --schema=hr_one --allow-tenant-data --json --output=/tmp/hr-one-supabase-private-schema.json";

export async function POST(request: Request) {
  const formData = await request.formData();

  try {
    const session = await requireTenantSession({ permission: "audit:read" });
    const privateSchema = buildPrivateSchemaReport(formData);
    const report = await getProductionDatabaseRemediationReport({
      appUrl: "https://hr.suiyuecare.com",
      expectedHost: "hr.suiyuecare.com",
      privateSchema,
    });
    await generateProductionDatabaseEvidencePackage(session, report);

    return NextResponse.redirect(new URL(`${returnPath}?success=production-database-evidence#production-database-evidence`, request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save production database evidence.";
    return NextResponse.redirect(
      new URL(`${returnPath}?error=${encodeURIComponent(message)}#production-database-evidence`, request.url),
      303,
    );
  }
}

function buildPrivateSchemaReport(formData: FormData) {
  const json = readString(formData.get("privateSchemaJson"));
  if (!json) {
    return buildProductionDatabasePrivateSchemaReport({
      command: privateSchemaVerifyCommand,
    });
  }
  return buildProductionDatabasePrivateSchemaReportFromPayload(JSON.parse(json) as unknown, {
    expectedMigrationCount: readNumber(formData.get("expectedMigrationCount")),
    schemaName: readString(formData.get("schemaName")) || "hr_one",
    allowTenantData: formData.get("allowTenantData") === "on",
    command: privateSchemaVerifyCommand,
  });
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: FormDataEntryValue | null) {
  const raw = readString(value);
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}
