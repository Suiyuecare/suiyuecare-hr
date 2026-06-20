import { buildProductionDatabaseEnvDraftReport } from "@/server/readiness/production-database-remediation";
import { redactSensitiveDetail } from "@/server/readiness/production-pilot-gate";
import {
  buildVercelProductionEnvPlan,
  parseEnvFile,
  summarizeVercelProductionEnvPlan,
  type VercelEnvPayloadItem,
} from "@/server/readiness/vercel-production-env";
import {
  setVercelProductionDatabaseUrl,
  type VercelProductionDatabaseUrlUpdateOptions,
} from "@/server/readiness/vercel-production-env-draft";
import type { DatabaseConnectionPosture } from "@/server/readiness/database-url";

export type VercelDatabaseUrlHandoffStatus = "ready" | "blocked";

export type VercelDatabaseUrlHandoffEnvItem = {
  key: string;
  type: VercelEnvPayloadItem["type"];
  target: VercelEnvPayloadItem["target"];
};

export type VercelDatabaseUrlHandoffReport = {
  status: VercelDatabaseUrlHandoffStatus;
  generatedAt: string;
  envFileSource: string;
  projectId: string;
  teamId: string;
  connectionPosture: DatabaseConnectionPosture;
  databaseUrlShape: string;
  changedKeys: string[];
  appendedKeys: string[];
  envDraftStatus: string;
  failedCheckNames: string[];
  unresolvedPlaceholderKeys: string[];
  vercelPlanSummary: string[];
  vercelItems: VercelDatabaseUrlHandoffEnvItem[];
  nextActions: string[];
};

export type VercelDatabaseUrlHandoffInput = VercelProductionDatabaseUrlUpdateOptions & {
  databaseUrl: string;
  baseEnvText: string;
  envFileSource: string;
  projectId: string;
  teamId: string;
  now?: Date;
};

export function buildVercelDatabaseUrlHandoffReport(
  input: VercelDatabaseUrlHandoffInput,
): VercelDatabaseUrlHandoffReport {
  const generatedAt = input.now ?? new Date();
  const updated = setVercelProductionDatabaseUrl(input.baseEnvText, input.databaseUrl, {
    supabaseIpv4AddonEnabled: input.supabaseIpv4AddonEnabled,
  });
  const env = parseEnvFile(updated.text);
  const envDraft = buildProductionDatabaseEnvDraftReport(env, {
    source: input.envFileSource,
    now: generatedAt,
  });
  const vercelPlan = buildVercelProductionEnvPlan({
    env,
    projectId: input.projectId,
    teamId: input.teamId,
    now: generatedAt,
  });
  const status = envDraft.status === "ready" && vercelPlan.passed ? "ready" : "blocked";

  return {
    status,
    generatedAt: generatedAt.toISOString(),
    envFileSource: input.envFileSource,
    projectId: input.projectId,
    teamId: input.teamId,
    connectionPosture: updated.connectionPosture,
    databaseUrlShape: envDraft.databaseUrlShape,
    changedKeys: updated.changedKeys,
    appendedKeys: updated.appendedKeys,
    envDraftStatus: envDraft.status,
    failedCheckNames: envDraft.failedCheckNames,
    unresolvedPlaceholderKeys: envDraft.unresolvedPlaceholderKeys,
    vercelPlanSummary: summarizeVercelProductionEnvPlan(vercelPlan).map(redactSensitiveDetail),
    vercelItems: vercelPlan.items.map((item) => ({
      key: item.key,
      type: item.type,
      target: item.target,
    })),
    nextActions: buildHandoffNextActions({
      status,
      envFileSource: input.envFileSource,
      envDraftNextActions: envDraft.nextActions,
      planPassed: vercelPlan.passed,
    }),
  };
}

export function formatVercelDatabaseUrlHandoffMarkdown(report: VercelDatabaseUrlHandoffReport) {
  return [
    "# HR One Vercel Database URL Handoff",
    "",
    `Generated at: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Env draft: ${redactSensitiveDetail(report.envFileSource)}`,
    `Project: ${report.projectId}`,
    `Team: ${report.teamId}`,
    "",
    "## Database URL",
    "",
    `- Connection posture: ${report.connectionPosture}`,
    `- Safe shape: ${report.databaseUrlShape}`,
    `- Changed keys: ${report.changedKeys.join(", ") || "none"}`,
    `- Appended keys: ${report.appendedKeys.join(", ") || "none"}`,
    "",
    "## Env Verification",
    "",
    `- Env draft status: ${report.envDraftStatus}`,
    `- Failed checks: ${report.failedCheckNames.join(", ") || "none"}`,
    `- Unresolved placeholders: ${report.unresolvedPlaceholderKeys.join(", ") || "none"}`,
    "",
    "## Vercel Write Plan",
    "",
    ...report.vercelPlanSummary.map((line) => `- ${line}`),
    "",
    "### Variable Keys",
    "",
    ...report.vercelItems.map((item) => `- ${item.key}: ${item.type}, target=${item.target.join(",")}`),
    "",
    "## Next Actions",
    "",
    ...report.nextActions.map((action) => `- ${redactSensitiveDetail(action)}`),
    "",
    "## Safety",
    "",
    "- This handoff never includes the database URL, username, password, bearer token, salary data, bank account, national ID, health data, or private HR notes.",
    "- Keep the real DATABASE_URL only in the gitignored env draft, Vercel Production secret storage, or the operator password manager.",
    "",
  ].join("\n");
}

function buildHandoffNextActions(input: {
  status: VercelDatabaseUrlHandoffStatus;
  envFileSource: string;
  envDraftNextActions: string[];
  planPassed: boolean;
}) {
  const actions: string[] = [];
  if (input.status === "ready") {
    actions.push(`Apply the validated DATABASE_URL to ${input.envFileSource} with pnpm vercel:refresh-production-env-draft -- --env-file=${input.envFileSource} --database-url-stdin --apply.`);
    actions.push(`Dry-run Vercel writes with pnpm vercel:apply-production-env -- --env-file=${input.envFileSource} --dry-run.`);
    actions.push(`Write Vercel Production env, redeploy production, then run pnpm pilot:gate:production -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com.`);
  } else {
    actions.push(...input.envDraftNextActions);
    if (!input.planPassed) {
      actions.push("Fix failed production env verifier checks before writing any Vercel Production variables.");
    }
  }
  return [...new Set(actions.map(redactSensitiveDetail))];
}
