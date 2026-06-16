import {
  type ProductionPilotGateReport,
  productionPilotGatePassed,
  redactSensitiveDetail,
} from "@/server/readiness/production-pilot-gate";

export type PilotDoctorStatus = "ready" | "blocked";

export type PilotDoctorCheck = {
  name: string;
  passed: boolean;
  detail: string;
};

export type PilotDoctorExternalCheck = {
  status: "passed" | "failed" | "skipped";
  detail: string;
};

export type PilotDoctorLocalEnvDraft = {
  status: "ready" | "blocked" | "missing" | "skipped";
  detail: string;
  unresolvedPlaceholderKeys?: string[];
  failedCheckNames?: string[];
};

export type PilotDoctorReport = {
  status: PilotDoctorStatus;
  checkedAt: string;
  checks: PilotDoctorCheck[];
  nextActions: string[];
};

export type PilotDoctorOptions = {
  checkedAt?: Date;
  productionGate: ProductionPilotGateReport;
  vercelEnvNames: string[];
  supabasePilot: PilotDoctorExternalCheck;
  localEnvDraft?: PilotDoctorLocalEnvDraft;
};

export const requiredProductionPilotEnvKeys = [
  "DATABASE_URL",
  "HR_ONE_ENV",
  "HR_ONE_APP_URL",
  "HR_ONE_DEPLOYMENT_TARGET",
  "VERCEL_PROJECT_ID",
  "HR_ONE_DATABASE_PROVIDER",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "HR_ONE_SESSION_SECRET",
  "HR_ONE_ENCRYPTION_KEY",
  "HR_ONE_AUDIT_LOG_SIGNING_KEY",
  "HR_ONE_OBJECT_STORAGE_SECRET_REF",
  "HR_ONE_AUTH_PROVIDER",
  "HR_ONE_AUTH_SESSION_SOURCE",
  "HR_ONE_AUTH_ISSUER_URL",
  "HR_ONE_AUTH_LOGIN_URL",
  "HR_ONE_AUTH_AUDIENCE",
  "HR_ONE_AUTH_JWKS_URL",
  "HR_ONE_AUTH_MAX_TOKEN_AGE_SECONDS",
  "HR_ONE_AI_PROVIDER",
  "HR_ONE_AI_PROMPT_STORAGE",
  "HR_ONE_RATE_LIMIT_PROVIDER",
  "HR_ONE_RATE_LIMIT_SECRET_REF",
  "HR_ONE_RATE_LIMIT_WINDOW_SECONDS",
  "HR_ONE_RATE_LIMIT_MAX_REQUESTS",
  "HR_ONE_BACKUP_ENABLED",
  "HR_ONE_BACKUP_RETENTION_DAYS",
  "HR_ONE_BACKUP_ENCRYPTION_KEY_REF",
  "HR_ONE_BACKUP_RESTORE_TESTED_AT",
] as const;

export function buildPilotDoctorReport(options: PilotDoctorOptions): PilotDoctorReport {
  const checkedAt = options.checkedAt ?? new Date();
  const missingEnvKeys = getMissingProductionPilotEnvKeys(options.vercelEnvNames);
  const checks = [
    buildVercelEnvCheck(options.vercelEnvNames, missingEnvKeys),
    buildLocalEnvDraftCheck(options.localEnvDraft, missingEnvKeys),
    buildProductionGateCheck(options.productionGate),
    buildSupabasePilotCheck(options.supabasePilot),
  ];
  const nextActions = buildNextActions({
    missingEnvKeys,
    productionGate: options.productionGate,
    supabasePilot: options.supabasePilot,
    localEnvDraft: options.localEnvDraft,
  });

  return {
    status: checks.every((check) => check.passed) ? "ready" : "blocked",
    checkedAt: checkedAt.toISOString(),
    checks,
    nextActions,
  };
}

export function pilotDoctorPassed(report: PilotDoctorReport) {
  return report.status === "ready" && report.checks.every((check) => check.passed);
}

export function getMissingProductionPilotEnvKeys(envNames: string[]) {
  const names = new Set(envNames);
  return requiredProductionPilotEnvKeys.filter((key) => !names.has(key));
}

export function formatPilotDoctorReport(report: PilotDoctorReport) {
  const lines = [
    `HR One pilot doctor: ${report.status}`,
    `Checked at: ${report.checkedAt}`,
    "",
    "Checks:",
    ...report.checks.map((check) => {
      const status = check.passed ? "PASS" : "BLOCK";
      return `- [${status}] ${check.name}: ${redactSensitiveDetail(check.detail)}`;
    }),
  ];

  if (report.nextActions.length > 0) {
    lines.push("", "Next actions:");
    lines.push(...report.nextActions.map((action) => `- ${redactSensitiveDetail(action)}`));
  }

  return lines.join("\n");
}

function buildVercelEnvCheck(envNames: string[], missingEnvKeys: readonly string[]): PilotDoctorCheck {
  const presentCount = requiredProductionPilotEnvKeys.length - missingEnvKeys.length;
  const missingDetail = missingEnvKeys.length > 0
    ? `missing ${missingEnvKeys.length} key(s): ${missingEnvKeys.join(", ")}`
    : "all required production env keys are present";
  return check(
    "Vercel production env",
    missingEnvKeys.length === 0,
    `${presentCount}/${requiredProductionPilotEnvKeys.length} required key(s); ${missingDetail}; ${envNames.length} total production env key(s) found`,
  );
}

function buildLocalEnvDraftCheck(
  localEnvDraft: PilotDoctorLocalEnvDraft | undefined,
  missingEnvKeys: readonly string[],
): PilotDoctorCheck {
  const localDraftRequired = missingEnvKeys.length > 0;
  if (!localDraftRequired && (!localEnvDraft || localEnvDraft.status === "missing" || localEnvDraft.status === "skipped")) {
    return check(
      "local production env draft",
      true,
      "not required because Vercel Production already has the required env keys",
    );
  }
  if (!localEnvDraft || localEnvDraft.status === "missing") {
    return check(
      "local production env draft",
      false,
      localEnvDraft?.detail ?? "local .env.vercel.production draft is missing",
    );
  }
  if (localEnvDraft.status === "skipped") {
    return check("local production env draft", !localDraftRequired, localEnvDraft.detail);
  }
  return check("local production env draft", localEnvDraft.status === "ready", localEnvDraft.detail);
}

function buildProductionGateCheck(productionGate: ProductionPilotGateReport): PilotDoctorCheck {
  return check(
    "live production gate",
    productionPilotGatePassed(productionGate),
    `production gate is ${productionGate.status}`,
  );
}

function buildSupabasePilotCheck(supabasePilot: PilotDoctorExternalCheck): PilotDoctorCheck {
  return check(
    "Supabase pilot rehearsal data",
    supabasePilot.status === "passed",
    supabasePilot.detail,
  );
}

function buildNextActions(options: {
  missingEnvKeys: readonly string[];
  productionGate: ProductionPilotGateReport;
  supabasePilot: PilotDoctorExternalCheck;
  localEnvDraft?: PilotDoctorLocalEnvDraft;
}) {
  const actions: string[] = [];

  if (options.missingEnvKeys.length > 0 && (!options.localEnvDraft || options.localEnvDraft.status === "missing")) {
    actions.push("Run pnpm vercel:create-production-env-draft to create a gitignored .env.vercel.production draft with generated local secrets.");
  }
  if (options.localEnvDraft?.unresolvedPlaceholderKeys?.length) {
    actions.push(`Replace local .env.vercel.production placeholders for: ${options.localEnvDraft.unresolvedPlaceholderKeys.join(", ")}.`);
  }
  if (options.localEnvDraft?.failedCheckNames?.length) {
    actions.push(`Fix local production env verification failures before apply: ${options.localEnvDraft.failedCheckNames.join(", ")}.`);
  }
  if (options.missingEnvKeys.length > 0) {
    actions.push("Optionally run pnpm vercel:bootstrap-known-env -- --env-file=.env.vercel.production to prefill safe known Production env values; it will not write DATABASE_URL, OIDC URLs, vault refs, or restore-drill evidence.");
    actions.push("Fill .env.vercel.production with real production values and run pnpm vercel:apply-production-env -- --env-file=.env.vercel.production --method=cli.");
  }
  if (options.missingEnvKeys.includes("DATABASE_URL")) {
    actions.push("Use the Supabase server-side Postgres connection string with ?schema=hr_one for DATABASE_URL; do not use the publishable key as DATABASE_URL.");
  }
  if (!productionPilotGatePassed(options.productionGate)) {
    actions.push(...options.productionGate.nextActions);
  }
  if (options.supabasePilot.status !== "passed") {
    actions.push("Run pnpm db:supabase:seed-pilot -- --project-ref=<supabase-project-ref> --schema=hr_one --verify-only and fix any failed pilot data checks.");
  }
  if (actions.length > 0) {
    actions.push("Only start the 20-50 person two-week pilot after pnpm pilot:doctor returns ready.");
  }

  return dedupe(actions.map(redactSensitiveDetail));
}

function check(name: string, passed: boolean, detail: string): PilotDoctorCheck {
  return {
    name,
    passed,
    detail: redactSensitiveDetail(detail),
  };
}

function dedupe(items: string[]) {
  return Array.from(new Set(items));
}
