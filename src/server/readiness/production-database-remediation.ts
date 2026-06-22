import {
  buildProductionPilotGateReport,
  buildReadinessUrl,
  redactSensitiveDetail,
  type ProductionPilotGateReport,
} from "@/server/readiness/production-pilot-gate";
import type { HealthReport } from "@/server/readiness/health";
import {
  buildEnvironmentVerificationReport,
  environmentVerificationPassed,
  type EnvironmentVerificationCheck,
} from "@/server/readiness/environment-verification";
import {
  buildSupabaseTransactionPoolerTemplate,
  classifyDatabaseConnection,
  hasPrismaTransactionPoolerParams,
  type DatabaseConnectionPosture,
  type SupabaseTransactionPoolerTemplate,
} from "@/server/readiness/database-url";
import {
  buildSupabasePrivateSchemaVerificationChecks,
  supabasePrivateSchemaVerificationPassed,
  type SupabasePrivateSchemaVerificationCheck,
  type SupabasePrivateSchemaVerificationSnapshot,
} from "@/server/readiness/supabase-private-schema-verification";
import {
  buildVercelProductionEnvInventoryReport,
  type VercelProductionEnvInventoryReport,
} from "@/server/readiness/vercel-production-env-inventory";
import { getUnresolvedEnvPlaceholderKeys } from "@/server/readiness/vercel-production-env-draft";

export type ProductionDatabaseRootCause =
  | "ready"
  | "supabase_direct_network"
  | "pooler_configuration"
  | "missing_database_url"
  | "environment_configuration"
  | "private_schema_unverified"
  | "private_schema_security"
  | "health_unreachable"
  | "unknown";

export type ProductionDatabaseRemediationStep = {
  id: string;
  title: string;
  detail: string;
  command?: string;
  status: "done" | "blocked" | "todo";
};

export type ProductionDatabaseLaunchChecklistItem = {
  id: string;
  title: string;
  detail: string;
  evidence: string;
  command?: string;
  status: "done" | "blocked" | "todo";
};

export type VercelProductionCutoverStatus =
  | "waiting_for_env"
  | "ready_to_apply"
  | "waiting_for_redeploy"
  | "verified";

export type VercelProductionCutoverStep = {
  id:
    | "env_draft_ready"
    | "database_url_handoff"
    | "vercel_apply_dry_run"
    | "vercel_env_write"
    | "production_redeploy"
    | "live_ready_probe"
    | "pilot_gate_evidence";
  title: string;
  status: "done" | "blocked" | "todo";
  detail: string;
  evidence: string;
  command?: string;
};

export type VercelProductionCutoverPlan = {
  status: VercelProductionCutoverStatus;
  summary: string;
  nextCommand: string;
  steps: VercelProductionCutoverStep[];
};

export type ProductionDatabaseRemediationTrack = {
  id: "transaction_pooler" | "ipv4_addon" | "private_schema" | "verification";
  title: string;
  recommended: boolean;
  detail: string;
  steps: ProductionDatabaseRemediationStep[];
};

export type ProductionDatabasePrivateSchemaStatus = "ready" | "blocked" | "not_checked";

export type ProductionDatabasePrivateSchemaMetrics = {
  tableCount: number | null;
  enumTypeCount: number | null;
  prismaMigrationCount: number | null;
  rlsEnabledTableCount: number | null;
  rlsDisabledTableCount: number | null;
  exposedTablePrivilegeCount: number | null;
  exposedSecurityDefinerFunctionCount: number | null;
  publicSchemaShadowTableCount: number | null;
  publicSecurityDefinerExecuteCount: number | null;
  tenantCount: number | null;
  companyCount: number | null;
  employeeCount: number | null;
  anonUsage: boolean | null;
  authenticatedUsage: boolean | null;
};

export type ProductionDatabasePrivateSchemaReport = {
  status: ProductionDatabasePrivateSchemaStatus;
  schemaName: string;
  summary: string;
  command: string;
  checks: SupabasePrivateSchemaVerificationCheck[];
  failedCheckNames: string[];
  metrics: ProductionDatabasePrivateSchemaMetrics;
  nextActions: string[];
};

export type ProductionDatabaseRemediationReport = {
  status: "ready" | "blocked";
  generatedAt: string;
  appUrl: string;
  readinessUrl: string;
  rootCause: ProductionDatabaseRootCause;
  summary: string;
  gate: ProductionPilotGateReport;
  envDraft: ProductionDatabaseEnvDraftReport | null;
  privateSchema: ProductionDatabasePrivateSchemaReport;
  supabasePooler: SupabaseTransactionPoolerTemplate;
  databaseDetail: string;
  environmentDetail: string;
  envRepairPlan: ProductionDatabaseEnvRepairGroup[];
  vercelEnvInventory: VercelProductionEnvInventoryReport;
  launchChecklist: ProductionDatabaseLaunchChecklistItem[];
  vercelCutover: VercelProductionCutoverPlan;
  tracks: ProductionDatabaseRemediationTrack[];
  nextActions: string[];
  privacyGuardrails: string[];
};

export type ProductionDatabaseEnvDraftStatus = "ready" | "blocked" | "missing" | "skipped";

export type ProductionDatabaseEnvDraftReport = {
  status: ProductionDatabaseEnvDraftStatus;
  source: string;
  databaseConnectionPosture: DatabaseConnectionPosture | "not_checked";
  databaseUrlShape: string;
  unresolvedPlaceholderKeys: string[];
  failedCheckNames: string[];
  checks: EnvironmentVerificationCheck[];
  nextActions: string[];
};

export type ProductionDatabaseEnvRepairGroup = {
  id:
    | "database_connection"
    | "scheduled_maintenance"
    | "object_storage"
    | "auth_session"
    | "secrets_rate_limit_backup"
    | "ai_governance"
    | "other";
  title: string;
  owner: "Owner" | "Engineering" | "Owner + Engineering";
  status: "ready" | "blocked" | "not_checked";
  failedCheckNames: string[];
  affectedEnvKeys: string[];
  detail: string;
  nextStep: string;
  evidence: string;
};

export type ProductionDatabaseRemediationInput = {
  appUrl: string;
  expectedHost?: string | null;
  healthReport?: HealthReport | null;
  fetchedHealthStatusCode?: number | null;
  envDraft?: ProductionDatabaseEnvDraftReport | null;
  privateSchema?: ProductionDatabasePrivateSchemaReport | null;
  vercelEnvInventory?: VercelProductionEnvInventoryReport | null;
  supabaseUrl?: string | null;
  supabaseRegion?: string | null;
  generatedAt?: Date;
};

export type ProductionDatabaseWorkspaceOptions = {
  appUrl?: string;
  expectedHost?: string | null;
  envDraft?: ProductionDatabaseEnvDraftReport | null;
  privateSchema?: ProductionDatabasePrivateSchemaReport | null;
  vercelEnvInventory?: VercelProductionEnvInventoryReport | null;
  fetcher?: typeof fetch;
  generatedAt?: Date;
  includeRuntimeEnvDiagnostics?: boolean;
  runtimeEnv?: Record<string, string | undefined> | null;
  supabaseUrl?: string | null;
  supabaseRegion?: string | null;
  timeoutMs?: number;
};

const defaultAppUrl = "https://hr.suiyuecare.com";
const defaultPrivateSchemaName = "hr_one";
const defaultSupabaseProjectRef = "aruncclorusswpfnpgsn";

export async function getProductionDatabaseRemediationReport(
  options: ProductionDatabaseWorkspaceOptions = {},
) {
  const generatedAt = options.generatedAt ?? new Date();
  const appUrl = normalizeAppUrl(
    options.appUrl ??
    process.env.HR_ONE_APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    defaultAppUrl,
  );
  const fetched = await fetchLiveReadyHealth(appUrl, options.fetcher ?? fetch, options.timeoutMs ?? 5000);
  const envDraft = Object.prototype.hasOwnProperty.call(options, "envDraft")
    ? options.envDraft ?? null
    : options.includeRuntimeEnvDiagnostics === false
      ? null
      : buildProductionDatabaseEnvDraftReport(options.runtimeEnv ?? process.env, {
          source: "current server runtime env (redacted)",
          now: generatedAt,
        });
  return buildProductionDatabaseRemediationReport({
    appUrl,
    expectedHost: options.expectedHost ?? expectedHostFromUrl(appUrl),
    healthReport: fetched.healthReport,
    fetchedHealthStatusCode: fetched.statusCode,
    envDraft,
    privateSchema: options.privateSchema ?? buildProductionDatabasePrivateSchemaReport(),
    vercelEnvInventory: options.vercelEnvInventory ?? null,
    supabaseUrl:
      options.supabaseUrl ??
      options.runtimeEnv?.NEXT_PUBLIC_SUPABASE_URL ??
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseRegion:
      options.supabaseRegion ??
      options.runtimeEnv?.HR_ONE_SUPABASE_REGION ??
      process.env.HR_ONE_SUPABASE_REGION,
    generatedAt,
  });
}

export function buildProductionDatabaseEnvDraftReport(
  env: Record<string, string | undefined> | null,
  options: {
    source?: string;
    skipped?: boolean;
    now?: Date;
  } = {},
): ProductionDatabaseEnvDraftReport {
  const source = options.source ?? ".env.vercel.production";
  if (options.skipped) {
    return {
      status: "skipped",
      source,
      databaseConnectionPosture: "not_checked",
      databaseUrlShape: "not checked",
      unresolvedPlaceholderKeys: [],
      failedCheckNames: [],
      checks: [],
      nextActions: ["Local production env draft check skipped by operator request."],
    };
  }
  if (!env) {
    return {
      status: "missing",
      source,
      databaseConnectionPosture: "not_checked",
      databaseUrlShape: "not checked",
      unresolvedPlaceholderKeys: [],
      failedCheckNames: [],
      checks: [],
      nextActions: [
        `Create or pass a production env draft with --env-file before applying Vercel Production variables.`,
      ],
    };
  }

  const verification = buildEnvironmentVerificationReport(env, "production", options.now);
  const checks = verification.checks.map((check) => ({
    ...check,
    detail: redactSensitiveDetail(check.detail),
  }));
  const unresolvedPlaceholderKeys = getUnresolvedEnvPlaceholderKeys(env);
  const failedCheckNames = checks.filter((check) => !check.passed).map((check) => check.name);
  const databaseUrl = readEnv(env, "DATABASE_URL");
  const databaseConnectionPosture = classifyDatabaseConnection(databaseUrl);
  const databaseUrlShape = describeDatabaseUrlShape(databaseUrl, unresolvedPlaceholderKeys);
  const status =
    environmentVerificationPassed(verification) && unresolvedPlaceholderKeys.length === 0
      ? "ready"
      : "blocked";

  return {
    status,
    source,
    databaseConnectionPosture,
    databaseUrlShape,
    unresolvedPlaceholderKeys,
    failedCheckNames,
    checks,
    nextActions: buildEnvDraftNextActions({
      status,
      databaseUrl,
      databaseConnectionPosture,
      unresolvedPlaceholderKeys,
      failedCheckNames,
    }),
  };
}

export function buildProductionDatabasePrivateSchemaReport(
  input: {
    snapshot?: SupabasePrivateSchemaVerificationSnapshot | null;
    expectedMigrationCount?: number | null;
    schemaName?: string;
    allowTenantData?: boolean;
    command?: string;
  } = {},
): ProductionDatabasePrivateSchemaReport {
  const schemaName = input.schemaName ?? defaultPrivateSchemaName;
  const command = redactSensitiveDetail(
    input.command ?? buildDefaultPrivateSchemaVerifierCommand(schemaName),
  );
  const snapshot = input.snapshot ?? null;
  if (!snapshot || typeof input.expectedMigrationCount !== "number") {
    const missingExpectedMigrationCount = Boolean(snapshot && typeof input.expectedMigrationCount !== "number");
    return {
      status: "not_checked",
      schemaName,
      command,
      summary: missingExpectedMigrationCount
        ? "已取得 Supabase private schema snapshot，但缺少預期 migration 數，不能放行 RLS / grant / migration Gate。"
        : "尚未執行 Supabase private schema / RLS verifier；正式資料庫不能只用連線成功判定可試用。",
      checks: [],
      failedCheckNames: [],
      metrics: emptyPrivateSchemaMetrics(),
      nextActions: [
        missingExpectedMigrationCount
          ? "重新產生 Supabase private schema verifier 報告，並附上 expected migration count。"
          : "執行 Supabase private schema / RLS verifier，確認 hr_one schema、RLS、anon/authenticated grants 與 public schema exposure。",
        command,
      ],
    };
  }

  const checks = buildSupabasePrivateSchemaVerificationChecks(snapshot, input.expectedMigrationCount, {
    allowTenantData: input.allowTenantData,
  }).map((check) => ({
    ...check,
    detail: redactSensitiveDetail(check.detail),
  }));
  const failedCheckNames = checks.filter((check) => !check.passed).map((check) => check.name);
  const passed = supabasePrivateSchemaVerificationPassed(checks);

  return {
    status: passed ? "ready" : "blocked",
    schemaName,
    command,
    summary: passed
      ? "Supabase private schema / RLS verifier 已通過；hr_one schema 沒有暴露給 browser roles，public schema 也沒有 shadow table 或可被 anon/authenticated 呼叫的 security definer RPC。"
      : `Supabase private schema / RLS verifier 仍有 ${failedCheckNames.length} 個阻擋項：${failedCheckNames.join("、")}。`,
    checks,
    failedCheckNames,
    metrics: metricsFromPrivateSchemaSnapshot(snapshot),
    nextActions: passed
      ? ["Private schema / RLS Gate 已通過；接著保存 redacted evidence 並跑 production tenant verification。"]
      : [
          "修正失敗的 Supabase private schema / RLS 檢查後重新執行 verifier。",
          command,
          ...failedCheckNames.map((name) => `處理 ${name}。`),
        ].map(redactSensitiveDetail),
  };
}

export function buildProductionDatabasePrivateSchemaReportFromPayload(
  payload: unknown,
  options: {
    expectedMigrationCount?: number | null;
    schemaName?: string;
    allowTenantData?: boolean;
    command?: string;
  } = {},
) {
  const snapshot = extractPrivateSchemaSnapshot(payload);
  return buildProductionDatabasePrivateSchemaReport({
    snapshot,
    expectedMigrationCount: readPayloadExpectedMigrationCount(payload) ?? options.expectedMigrationCount,
    schemaName: readPayloadSchemaName(payload) ?? options.schemaName,
    allowTenantData: readPayloadAllowTenantData(payload) ?? options.allowTenantData,
    command: options.command,
  });
}

export function buildProductionDatabaseRemediationReport(
  input: ProductionDatabaseRemediationInput,
): ProductionDatabaseRemediationReport {
  const generatedAt = input.generatedAt ?? new Date();
  const gate = buildProductionPilotGateReport({
    appUrl: input.appUrl,
    expectedHost: input.expectedHost,
    healthReport: input.healthReport ?? null,
    checkedAt: generatedAt,
  });
  const databaseDetail = safeCheckDetail(input.healthReport ?? null, "database");
  const environmentDetail = safeCheckDetail(input.healthReport ?? null, "environment");
  const envDraft = input.envDraft ?? null;
  const envRepairPlan = buildProductionDatabaseEnvRepairPlan(envDraft);
  const privateSchema = input.privateSchema ?? buildProductionDatabasePrivateSchemaReport();
  const vercelEnvInventory = input.vercelEnvInventory ?? buildVercelProductionEnvInventoryReport(null, {
    generatedAt,
  });
  const supabasePooler = buildSupabaseTransactionPoolerTemplate({
    supabaseUrl: input.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
    region: input.supabaseRegion ?? process.env.HR_ONE_SUPABASE_REGION,
    schema: "hr_one",
  });
  const liveRootCause = classifyRootCause({
    healthReport: input.healthReport ?? null,
    statusCode: input.fetchedHealthStatusCode ?? null,
    databaseDetail,
    environmentDetail,
  });
  const liveConnectionReady = gate.status === "ready" && liveRootCause === "ready";
  const rootCause = liveRootCause === "ready" && privateSchema.status !== "ready"
    ? classifyPrivateSchemaRootCause(privateSchema)
    : liveRootCause;
  const status = liveConnectionReady && privateSchema.status === "ready" ? "ready" : "blocked";
  const launchChecklist = buildLaunchChecklist(rootCause, gate, envDraft, privateSchema, liveConnectionReady);
  const vercelCutover = buildVercelProductionCutoverPlan({
    envDraft,
    gate,
    rootCause: liveRootCause,
    status: liveConnectionReady ? "ready" : "blocked",
  });
  const tracks = buildTracks(rootCause, privateSchema);
  const nextActions = buildNextActions(rootCause, gate, envDraft, privateSchema, vercelEnvInventory);

  return {
    status,
    generatedAt: generatedAt.toISOString(),
    appUrl: safeUrl(input.appUrl),
    readinessUrl: safeUrl(buildReadinessUrlOrFallback(input.appUrl)),
    rootCause,
    summary: summaryForRootCause(rootCause),
    gate,
    envDraft,
    privateSchema,
    supabasePooler,
    databaseDetail,
    environmentDetail,
    envRepairPlan,
    vercelEnvInventory,
    launchChecklist,
    vercelCutover,
    tracks,
    nextActions,
    privacyGuardrails: [
      "不要把 DATABASE_URL、pooler 密碼、service role key、JWT secret 或 vault secret 貼到截圖、ticket、聊天工具或 audit log。",
      "後台只顯示 readiness 狀態與修復步驟；真正的 Vercel env 值只能由授權 Owner 在 Vercel/Supabase 控制台設定。",
      "修復後必須重新部署 production，並用 production gate 驗證，而不是只看 Vercel env key 是否存在。",
      "健康檢查與 gate 報告不得包含薪資、銀行帳號、身分證、健康資料或員工私人備註。",
    ],
  };
}

export function formatProductionDatabaseRemediationMarkdown(
  report: ProductionDatabaseRemediationReport,
) {
  return [
    "# HR One Production Database Gate",
    "",
    `Generated at: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Root cause: ${report.rootCause}`,
    `App: ${report.appUrl}`,
    `Readiness: ${report.readinessUrl}`,
    "",
    "## Summary",
    "",
    redactSensitiveDetail(report.summary),
    "",
    "## Local Env Draft",
    "",
    ...formatEnvDraft(report.envDraft),
    "",
    "## Production Env Repair Matrix",
    "",
    ...formatEnvRepairPlan(report.envRepairPlan),
    "",
    "## Vercel Production Env Inventory",
    "",
    ...formatVercelEnvInventory(report.vercelEnvInventory),
    "",
    "## Supabase Transaction Pooler Shape",
    "",
    ...formatSupabasePooler(report.supabasePooler),
    "",
    "## Supabase Private Schema / RLS Gate",
    "",
    ...formatPrivateSchema(report.privateSchema),
    "",
    "## Gate Checks",
    "",
    ...report.gate.checks.map((check) =>
      `- [${check.passed ? "PASS" : "BLOCK"}] ${check.name}: ${redactSensitiveDetail(check.detail)}`,
    ),
    "",
    "## Remediation Tracks",
    "",
    ...report.tracks.flatMap((track) => [
      `### ${track.title}${track.recommended ? " (recommended)" : ""}`,
      "",
      redactSensitiveDetail(track.detail),
      "",
      ...track.steps.map((step) => {
        const command = step.command ? ` Command: ${redactSensitiveDetail(step.command)}` : "";
        return `- [${step.status.toUpperCase()}] ${step.title}: ${redactSensitiveDetail(step.detail)}${command}`;
      }),
      "",
    ]),
    "## Next Actions",
    "",
    ...formatList(report.nextActions),
    "",
    "## Launch Checklist",
    "",
    ...report.launchChecklist.map((item) => {
      const command = item.command ? ` Command: ${redactSensitiveDetail(item.command)}` : "";
      return `- [${item.status.toUpperCase()}] ${item.title}: ${redactSensitiveDetail(item.detail)} Evidence: ${redactSensitiveDetail(item.evidence)}.${command}`;
    }),
    "",
    "## Vercel Production Cutover",
    "",
    `- Status: ${report.vercelCutover.status}`,
    `- Summary: ${redactSensitiveDetail(report.vercelCutover.summary)}`,
    `- Next command: ${redactSensitiveDetail(report.vercelCutover.nextCommand)}`,
    "",
    ...report.vercelCutover.steps.map((step) => {
      const command = step.command ? ` Command: ${redactSensitiveDetail(step.command)}` : "";
      return `- [${step.status.toUpperCase()}] ${step.title}: ${redactSensitiveDetail(step.detail)} Evidence: ${redactSensitiveDetail(step.evidence)}.${command}`;
    }),
    "",
    "## Privacy Guardrails",
    "",
    ...formatList(report.privacyGuardrails),
    "",
  ].join("\n");
}

async function fetchLiveReadyHealth(appUrl: string, fetcher: typeof fetch, timeoutMs: number) {
  const readinessUrl = buildReadinessUrlOrFallback(appUrl);
  try {
    const response = await fetcher(readinessUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const payload = await response.json().catch(() => null);
    return {
      statusCode: response.status,
      healthReport: isHealthReport(payload) ? payload : null,
    };
  } catch {
    return {
      statusCode: null,
      healthReport: null,
    };
  }
}

function formatList(items: string[]) {
  return items.length ? items.map((item) => `- ${redactSensitiveDetail(item)}`) : ["- None."];
}

function formatEnvDraft(report: ProductionDatabaseEnvDraftReport | null) {
  if (!report) return ["- Not attached."];
  return [
    `- Status: ${report.status}`,
    `- Source: ${redactSensitiveDetail(report.source)}`,
    `- Database shape: ${redactSensitiveDetail(report.databaseUrlShape)}`,
    `- Failed checks: ${report.failedCheckNames.length ? report.failedCheckNames.join(", ") : "None"}`,
    `- Unresolved placeholders: ${
      report.unresolvedPlaceholderKeys.length ? report.unresolvedPlaceholderKeys.join(", ") : "None"
    }`,
    "- Draft next actions:",
    ...formatList(report.nextActions).map((item) => `  ${item}`),
  ];
}

function formatEnvRepairPlan(groups: ProductionDatabaseEnvRepairGroup[]) {
  return groups.flatMap((group) => [
    `### ${group.title}`,
    "",
    `- Status: ${group.status}`,
    `- Owner: ${group.owner}`,
    `- Failed checks: ${group.failedCheckNames.length ? group.failedCheckNames.join(", ") : "None"}`,
    `- Env keys: ${group.affectedEnvKeys.length ? group.affectedEnvKeys.join(", ") : "None"}`,
    `- Detail: ${redactSensitiveDetail(group.detail)}`,
    `- Next step: ${redactSensitiveDetail(group.nextStep)}`,
    `- Evidence: ${redactSensitiveDetail(group.evidence)}`,
    "",
  ]);
}

function formatVercelEnvInventory(report: VercelProductionEnvInventoryReport) {
  return [
    `- Status: ${report.status}`,
    `- Source: ${redactSensitiveDetail(report.source)}`,
    `- Command: ${redactSensitiveDetail(report.command)}`,
    `- Required keys: ${report.presentRequiredCount}/${report.requiredKeyCount}`,
    `- Total keys inspected: ${report.totalKeyCount}`,
    `- Production keys inspected: ${report.productionKeyCount}`,
    `- Missing keys: ${report.missingKeys.length ? report.missingKeys.join(", ") : "None"}`,
    `- Wrong-target keys: ${report.wrongTargetKeys.length ? report.wrongTargetKeys.join(", ") : "None"}`,
    `- Unsafe-type keys: ${report.unsafeTypeKeys.length ? report.unsafeTypeKeys.join(", ") : "None"}`,
    "- Inventory groups:",
    ...report.groups.map((group) =>
      `  - [${group.status.toUpperCase()}] ${group.title}: ${group.presentCount}/${group.requiredCount}; next=${redactSensitiveDetail(group.nextStep)}`,
    ),
  ];
}

function formatSupabasePooler(pooler: SupabaseTransactionPoolerTemplate) {
  return [
    `- Project ref: ${pooler.projectRef}`,
    `- Region: ${pooler.region}`,
    `- Username: ${pooler.username}`,
    `- Host: ${pooler.host}`,
    `- Port: ${pooler.port}`,
    `- Database: ${pooler.database}`,
    `- Required params: ${pooler.requiredQueryParams.join(", ")}`,
    `- Password source: ${pooler.passwordSource}`,
    "- Do not paste the complete DATABASE_URL into this report; pass the real value through stdin to the handoff/apply commands.",
  ];
}

function formatPrivateSchema(report: ProductionDatabasePrivateSchemaReport) {
  return [
    `- Status: ${report.status}`,
    `- Schema: ${report.schemaName}`,
    `- Summary: ${redactSensitiveDetail(report.summary)}`,
    `- Command: ${redactSensitiveDetail(report.command)}`,
    "- Metrics:",
    `  - Tables: ${metricValue(report.metrics.tableCount)}`,
    `  - RLS enabled/disabled: ${metricValue(report.metrics.rlsEnabledTableCount)}/${metricValue(report.metrics.rlsDisabledTableCount)}`,
    `  - Browser table grants: ${metricValue(report.metrics.exposedTablePrivilegeCount)}`,
    `  - Public shadow tables: ${metricValue(report.metrics.publicSchemaShadowTableCount)}`,
    `  - Public security-definer RPC exposure: ${metricValue(report.metrics.publicSecurityDefinerExecuteCount)}`,
    `  - anon/authenticated schema usage: ${booleanMetricValue(report.metrics.anonUsage)}/${booleanMetricValue(report.metrics.authenticatedUsage)}`,
    "- Checks:",
    ...(report.checks.length
      ? report.checks.map((check) => `  - [${check.passed ? "PASS" : "BLOCK"}] ${check.name}: ${redactSensitiveDetail(check.detail)}`)
      : ["  - Not checked."]),
    "- Private schema next actions:",
    ...formatList(report.nextActions).map((item) => `  ${item}`),
  ];
}

function classifyRootCause(input: {
  healthReport: HealthReport | null;
  statusCode: number | null;
  databaseDetail: string;
  environmentDetail: string;
}): ProductionDatabaseRootCause {
  if (!input.healthReport) return "health_unreachable";
  const database = input.healthReport.checks.find((check) => check.name === "database");
  const environment = input.healthReport.checks.find((check) => check.name === "environment");
  if (input.healthReport.status === "ok" && database?.status === "ok" && environment?.status === "ok") {
    return "ready";
  }
  if (/Supabase direct database hosts require IPv6 or the IPv4 add-on/i.test(input.databaseDetail)) {
    return "supabase_direct_network";
  }
  if (/verify Supabase pooler username, password, mode, schema, and prepared-statement settings/i.test(input.databaseDetail)) {
    return "pooler_configuration";
  }
  if (/database is required in production|database not configured/i.test(input.databaseDetail)) {
    return "missing_database_url";
  }
  if (/production environment verification failed/i.test(input.environmentDetail)) {
    return "environment_configuration";
  }
  return "unknown";
}

function buildTracks(
  rootCause: ProductionDatabaseRootCause,
  privateSchema: ProductionDatabasePrivateSchemaReport,
): ProductionDatabaseRemediationTrack[] {
  return [
    {
      id: "transaction_pooler",
      title: "路線 A：Supabase Transaction Pooler",
      recommended: true,
      detail: "Vercel/serverless 建議使用 transaction pooler，並確認 runtime DB role 可透過 pooler 登入。",
      steps: [
        step("pooler-user", "驗證 pooler runtime role", "在 Supabase 確認 runtime DB user 可用 transaction pooler 連線，避免只驗 direct host。", rootCause === "pooler_configuration" ? "blocked" : "todo"),
        step("pooler-url", "設定 server-only DATABASE_URL", "在 Vercel Production 設定 transaction pooler URL：host 使用 aws-0-<region>.pooler.supabase.com、port 6543，並包含 pgbouncer=true、connection_limit=1、schema=hr_one。不要設成 NEXT_PUBLIC。", rootCause === "supabase_direct_network" || rootCause === "missing_database_url" || rootCause === "pooler_configuration" ? "blocked" : "todo"),
        step("pooler-redeploy", "重新部署 Production", "改完 env 後必須 redeploy，讓 serverless runtime 拿到新值。", "todo"),
      ],
    },
    {
      id: "ipv4_addon",
      title: "路線 B：Supabase IPv4 Add-on",
      recommended: false,
      detail: "若必須保留 direct DB host，需先啟用 Supabase IPv4 add-on，並在 Vercel 設定 attestation。",
      steps: [
        step("ipv4-enable", "啟用 IPv4 add-on", "在 Supabase project 啟用 IPv4 add-on；沒有啟用前，Vercel direct host ping 會持續失敗。", rootCause === "supabase_direct_network" ? "blocked" : "todo"),
        step("ipv4-env", "設定 HR_ONE_SUPABASE_IPV4_ADDON_ENABLED=true", "只在 IPv4 add-on 真的啟用後設定，避免用假 attestation 繞過 gate。", "todo"),
        step("ipv4-redeploy", "重新部署 Production", "redeploy 後再跑 health ready 與 production pilot gate。", "todo"),
      ],
    },
    {
      id: "private_schema",
      title: "路線 C：Private schema / RLS Gate",
      recommended: true,
      detail: "連線成功後，還要確認 HR One 表都在 hr_one private schema、RLS 已啟用，且 anon/authenticated browser roles 沒有直接讀寫 HR 資料的 grant。",
      steps: [
        step("private-schema-bootstrap", "套用 hr_one private schema bootstrap", "確認 Prisma schema、migration 與 Supabase private schema search_path 都指向 hr_one，不把 HR 資料表放在 public schema。", privateSchema.status === "ready" ? "done" : "todo", "pnpm db:supabase:bootstrap-sql -- --schema=hr_one"),
        step("private-schema-verify", "執行 RLS / grant verifier", privateSchema.summary, privateSchema.status === "ready" ? "done" : "blocked", privateSchema.command),
        step("private-schema-evidence", "保存 redacted verifier 證據", "只保存 table/count/check name/hash，不保存員工個資、薪資、銀行、身分證或健康資料。", privateSchema.status === "ready" ? "todo" : "blocked"),
      ],
    },
    {
      id: "verification",
      title: "路線 D：驗證與開跑 Gate",
      recommended: true,
      detail: "任何路線修復後，都必須通過 live health、production gate、Supabase schema verification 與 pilot go/no-go。",
      steps: [
        step("health", "確認 /api/health/ready = ok", "正式站 readiness 必須回 ok，且 health payload 不可包含 secret 或敏感 HR 資料。", rootCause === "ready" ? "done" : "todo", "curl -fsS https://hr.suiyuecare.com/api/health/ready"),
        step("production-gate", "跑 production pilot gate", "阻擋項歸零後才可邀請真實員工。", rootCause === "ready" ? "done" : "todo", "pnpm pilot:gate:production -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com"),
        step("go-no-go", "跑完整 pilot go/no-go", "包含 acceptance、CSV 預檢、邀請就緒、workflow readiness 與 evidence scan。", "todo", "pnpm pilot:go-no-go -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --tenant-slug=<customer-slug>"),
      ],
    },
  ];
}

function buildLaunchChecklist(
  rootCause: ProductionDatabaseRootCause,
  gate: ProductionPilotGateReport,
  envDraft: ProductionDatabaseEnvDraftReport | null,
  privateSchema: ProductionDatabasePrivateSchemaReport,
  liveConnectionReady: boolean,
) {
  const productionEnvironmentPassed = gateCheckPassed(gate, "production environment");
  const productionDatabasePassed = gateCheckPassed(gate, "production database");
  const overallReady = liveConnectionReady && privateSchema.status === "ready";
  const envDraftReady = envDraft?.status === "ready";
  const envDraftHasTransactionPooler = envDraft?.databaseConnectionPosture === "supabase-pooler-transaction";
  const envDraftBlocked = envDraft?.status === "blocked" || envDraft?.status === "missing";
  const databaseNetworkBlocked =
    rootCause === "supabase_direct_network" ||
    rootCause === "pooler_configuration" ||
    rootCause === "missing_database_url";

  return [
    checklistItem({
      id: "pooler-handoff",
      title: "產生 pooler URL redacted handoff",
      detail: "由 Owner 從 stdin 提供真正的 Supabase transaction pooler URL，系統只保存連線形狀、key 名稱與下一步，不保存密碼或完整 URL。",
      evidence: "hr-one-vercel-database-url-handoff.md",
      command:
        "printf '%s' \"$SUPABASE_TRANSACTION_POOLER_DATABASE_URL\" | pnpm vercel:database-url-handoff -- --env-file=.env.vercel.production --output=/tmp/hr-one-vercel-database-url-handoff.md",
      status: envDraftReady && envDraftHasTransactionPooler ? "done" : databaseNetworkBlocked || envDraftBlocked ? "blocked" : "todo",
    }),
    checklistItem({
      id: "vercel-env-write",
      title: "寫入 Vercel Production env",
      detail: "先 dry-run，再把 server-only DATABASE_URL 與正式 env 寫入 Vercel Production；不可使用 NEXT_PUBLIC_ 前綴，也不可把 secret 貼到文件。",
      evidence: "Vercel Production env inventory plus redacted apply summary",
      command: "pnpm vercel:apply-production-env -- --env-file=.env.vercel.production --method=cli",
      status: productionEnvironmentPassed ? "done" : envDraftReady ? "todo" : "blocked",
    }),
    checklistItem({
      id: "production-redeploy",
      title: "重新部署 Production",
      detail: "Production env 寫入後必須 redeploy，讓 Vercel serverless runtime 拿到新的 DATABASE_URL 與正式設定。",
      evidence: "Vercel production deployment URL and deployment timestamp",
      command: "pnpm dlx vercel@latest --prod --scope team_LGag47eU8tKbsK6ixAmVa5Uq",
      status: productionEnvironmentPassed && productionDatabasePassed ? "done" : productionEnvironmentPassed ? "todo" : "blocked",
    }),
    checklistItem({
      id: "health-ready",
      title: "確認 live /api/health/ready",
      detail: "正式站 readiness 必須回 ok，且 payload 只含 redacted health 狀態，不含 database URL、薪資、身分證、銀行或健康資料。",
      evidence: "hr.suiyuecare.com /api/health/ready response",
      command: "curl -fsS https://hr.suiyuecare.com/api/health/ready",
      status: liveConnectionReady ? "done" : databaseNetworkBlocked || rootCause === "environment_configuration" ? "blocked" : "todo",
    }),
    checklistItem({
      id: "private-schema-verification",
      title: "驗證 Supabase private schema / RLS",
      detail: privateSchema.summary,
      evidence: "Supabase private schema verifier redacted report: table counts, RLS counts, browser grants, public exposure checks",
      command: privateSchema.command,
      status: privateSchema.status === "ready" ? "done" : liveConnectionReady ? "blocked" : "blocked",
    }),
    checklistItem({
      id: "production-tenant-verify",
      title: "驗證正式 tenant 與 hr_one schema",
      detail: "Production database 連線通過後，跑 tenant/company/roles/rules/payroll/audit 覆蓋檢查，確認不是 demo fallback。",
      evidence: "db:verify:production redacted report",
      command: "pnpm db:verify:production -- --tenant-slug=<customer-slug>",
      status: overallReady ? "todo" : "blocked",
    }),
    checklistItem({
      id: "pilot-go-no-go",
      title: "跑完整 pilot Go/No-Go",
      detail: "完成正式資料庫、匯入預檢、邀請 readiness、workflow readiness、evidence scan 後，才可發第一封真實員工邀請。",
      evidence: "hr-one-pilot-go-no-go.md and invitation-release report",
      command: "pnpm pilot:go-no-go -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --tenant-slug=<customer-slug>",
      status: overallReady ? "todo" : "blocked",
    }),
  ];
}

function buildVercelProductionCutoverPlan(input: {
  envDraft: ProductionDatabaseEnvDraftReport | null;
  gate: ProductionPilotGateReport;
  rootCause: ProductionDatabaseRootCause;
  status: "ready" | "blocked";
}): VercelProductionCutoverPlan {
  const envDraftReady = input.envDraft?.status === "ready";
  const envDraftHasTransactionPooler = input.envDraft?.databaseConnectionPosture === "supabase-pooler-transaction";
  const liveReady = input.status === "ready" && input.rootCause === "ready" && input.gate.status === "ready";
  const liveEnvironmentReady = gateCheckPassed(input.gate, "production environment");
  const liveDatabaseReady = gateCheckPassed(input.gate, "production database");
  const status: VercelProductionCutoverStatus = liveReady
    ? "verified"
    : envDraftReady
      ? liveEnvironmentReady || liveDatabaseReady
        ? "waiting_for_redeploy"
        : "ready_to_apply"
      : "waiting_for_env";
  const steps: VercelProductionCutoverStep[] = [
    cutoverStep({
      id: "env_draft_ready",
      title: "本地 production env 草稿通過",
      status: envDraftReady ? "done" : "blocked",
      detail: envDraftReady
        ? "本地草稿已通過 production verifier；仍不能代表 Vercel Production 已套用。"
        : "先把 .env.vercel.production 補到 ready，尤其是 DATABASE_URL、OIDC、vault/KMS 與備份還原證據。",
      evidence: "env:verify:production 或 pilot:production-database 的 Local Env Draft = ready",
      command: "pnpm env:verify:production -- --env-file=.env.vercel.production",
    }),
    cutoverStep({
      id: "database_url_handoff",
      title: "DATABASE_URL handoff 已確認 pooler 形狀",
      status: envDraftReady && envDraftHasTransactionPooler ? "done" : envDraftReady ? "todo" : "blocked",
      detail: envDraftHasTransactionPooler
        ? "DATABASE_URL 形狀已是 Supabase transaction pooler；密碼與完整 URL 不會進報告。"
        : "使用 stdin 建立 redacted handoff，確認是 transaction pooler、schema=hr_one 與 Prisma pooler 參數。",
      evidence: "hr-one-vercel-database-url-handoff.md",
      command:
        "printf '%s' \"$SUPABASE_TRANSACTION_POOLER_DATABASE_URL\" | pnpm vercel:database-url-handoff -- --env-file=.env.vercel.production --output=/tmp/hr-one-vercel-database-url-handoff.md",
    }),
    cutoverStep({
      id: "vercel_apply_dry_run",
      title: "Vercel env write dry-run",
      status: envDraftReady ? "todo" : "blocked",
      detail: "先確認要寫入的 key、sensitive/encrypted 類型與 verifier 狀態；dry-run 不代表正式 runtime 已修好。",
      evidence: "vercel:apply-production-env dry-run summary",
      command: "pnpm vercel:apply-production-env -- --env-file=.env.vercel.production --dry-run",
    }),
    cutoverStep({
      id: "vercel_env_write",
      title: "寫入 Vercel Production env",
      status: envDraftReady ? "todo" : "blocked",
      detail: "只用 CLI/API 或 Vercel Dashboard 寫入 secret；不要把完整 DATABASE_URL 貼到文件或聊天工具。",
      evidence: "Vercel env apply summary with key names only",
      command: "pnpm vercel:apply-production-env -- --env-file=.env.vercel.production --method=cli",
    }),
    cutoverStep({
      id: "production_redeploy",
      title: "重新部署 Production",
      status: liveReady ? "done" : envDraftReady ? "todo" : "blocked",
      detail: "Vercel env 寫入後必須重新部署，既有 lambda/runtime 不會自動拿到新 secret。",
      evidence: "Vercel production deployment URL and timestamp",
      command: "pnpm dlx vercel@latest --prod --scope team_LGag47eU8tKbsK6ixAmVa5Uq",
    }),
    cutoverStep({
      id: "live_ready_probe",
      title: "Live /api/health/ready 通過",
      status: liveReady ? "done" : envDraftReady ? "todo" : "blocked",
      detail: liveReady
        ? "正式站 live readiness 已回 ok。"
        : "redeploy 後必須讓 live readiness 回 ok；只看 env key inventory 不足以放行。",
      evidence: "https://hr.suiyuecare.com/api/health/ready = ok",
      command: "curl -fsS https://hr.suiyuecare.com/api/health/ready",
    }),
    cutoverStep({
      id: "pilot_gate_evidence",
      title: "保存 production pilot gate 證據",
      status: liveReady ? "todo" : "blocked",
      detail: "health ready 通過後，仍要輸出 redacted gate report，給 Go/No-Go 和 invitation release 使用。",
      evidence: "hr-one-production-database-gate.md",
      command: "pnpm pilot:production-database -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --output=/tmp/hr-one-production-database-gate.md",
    }),
  ];

  return {
    status,
    summary: cutoverSummary(status),
    nextCommand: firstOpenCutoverCommand(steps),
    steps,
  };
}

function cutoverStep(step: VercelProductionCutoverStep): VercelProductionCutoverStep {
  return {
    ...step,
    detail: redactSensitiveDetail(step.detail),
    evidence: redactSensitiveDetail(step.evidence),
    command: step.command ? redactSensitiveDetail(step.command) : undefined,
  };
}

function cutoverSummary(status: VercelProductionCutoverStatus) {
  if (status === "verified") {
    return "Production env、redeploy 與 live readiness 已串起來；接著保存 gate report 並跑完整 Go/No-Go。";
  }
  if (status === "waiting_for_redeploy") {
    return "本地 env 草稿已 ready，但 live production 仍未證明；請寫入 Vercel env、重新部署並確認 health ready。";
  }
  if (status === "ready_to_apply") {
    return "本地 env 草稿已 ready，可以 dry-run、寫入 Vercel Production env，然後重新部署。";
  }
  return "還不能寫入或開跑；先補 production env 草稿和 DATABASE_URL handoff。";
}

function firstOpenCutoverCommand(steps: VercelProductionCutoverStep[]) {
  return steps.find((step) => step.status !== "done")?.command ??
    "pnpm pilot:go-no-go -- --url=https://hr.suiyuecare.com --expected-host=hr.suiyuecare.com --tenant-slug=<customer-slug>";
}

function checklistItem(item: ProductionDatabaseLaunchChecklistItem): ProductionDatabaseLaunchChecklistItem {
  return {
    ...item,
    detail: redactSensitiveDetail(item.detail),
    evidence: redactSensitiveDetail(item.evidence),
    command: item.command ? redactSensitiveDetail(item.command) : undefined,
  };
}

function buildNextActions(
  rootCause: ProductionDatabaseRootCause,
  gate: ProductionPilotGateReport,
  envDraft: ProductionDatabaseEnvDraftReport | null,
  privateSchema: ProductionDatabasePrivateSchemaReport,
  vercelEnvInventory: VercelProductionEnvInventoryReport,
) {
  const actions: string[] = [];
  if (rootCause === "ready") {
    actions.push("Production database gate 已通過；接著匯入真實 20-50 人 tenant 並跑完整 pilot:go-no-go。");
  } else if (rootCause === "supabase_direct_network") {
    actions.push("先決定採用 transaction pooler 或 Supabase IPv4 add-on；目前 direct host 從 Vercel runtime 仍不可作為試用開跑依據。");
    actions.push("修正 Vercel Production DATABASE_URL 或 IPv4 attestation 後 redeploy。");
  } else if (rootCause === "pooler_configuration") {
    actions.push("驗證 Supabase pooler 的 username/password/mode/schema/prepared statement 設定，並確認 runtime role 可登入。");
  } else if (rootCause === "missing_database_url") {
    actions.push("在 Vercel Production 補 server-only DATABASE_URL；不可使用 NEXT_PUBLIC_ 前綴。");
  } else if (rootCause === "environment_configuration") {
    actions.push("補齊 HR_ONE_ENV=production、OIDC、vault/KMS、backup restore、rate limit 等 production env。");
  } else if (rootCause === "private_schema_unverified") {
    actions.push("執行 Supabase private schema / RLS verifier；正式資料庫不能只靠 DB ping 成功就放行。");
  } else if (rootCause === "private_schema_security") {
    actions.push("修正 Supabase private schema / RLS verifier 的阻擋項，尤其是 browser role grants、RLS disabled table、public shadow table 或 security definer exposure。");
  } else if (rootCause === "health_unreachable") {
    actions.push("確認 https://hr.suiyuecare.com/api/health/ready 可以從外部讀取 JSON health payload。");
  } else {
    actions.push("打開 live readiness 與 Vercel runtime logs，先定位 environment/database/demo auth 哪一項仍是 fail。");
  }
  if (envDraft?.status === "blocked") {
    actions.push(...envDraft.nextActions);
  } else if (envDraft?.status === "missing") {
    actions.push("Attach a local production env draft to the database gate report before applying Vercel Production env changes.");
  }
  if (privateSchema.status !== "ready") {
    actions.push(...privateSchema.nextActions);
  }
  if (vercelEnvInventory.status !== "ready") {
    actions.push(...vercelEnvInventory.nextActions);
  }
  actions.push(...gate.nextActions);
  return [...new Set(actions.map(redactSensitiveDetail))];
}

function buildEnvDraftNextActions(input: {
  status: "ready" | "blocked";
  databaseUrl: string | null;
  databaseConnectionPosture: DatabaseConnectionPosture;
  unresolvedPlaceholderKeys: string[];
  failedCheckNames: string[];
}) {
  const actions: string[] = [];
  if (input.status === "ready") {
    return ["Local production env draft passes the redacted production verifier; still verify live production after redeploy."];
  }

  if (input.unresolvedPlaceholderKeys.length > 0) {
    actions.push(`Replace unresolved production env placeholders for: ${input.unresolvedPlaceholderKeys.join(", ")}.`);
  }

  if (!input.databaseUrl || input.databaseConnectionPosture === "invalid") {
    actions.push("Set a server-only production PostgreSQL database URL before applying Vercel Production env changes.");
  } else if (input.databaseConnectionPosture === "supabase-direct") {
    actions.push("Replace the Supabase direct host with the transaction pooler, or enable the Supabase IPv4 add-on and set the explicit IPv4 attestation.");
  } else if (input.databaseConnectionPosture === "supabase-pooler-session") {
    actions.push("Use the Supabase transaction pooler for Vercel/serverless; the session pooler is not the intended path for this runtime.");
  } else if (input.databaseConnectionPosture === "supabase-pooler-unknown") {
    actions.push("Confirm the Supabase pooler URL uses transaction mode on the expected pooler port before applying it.");
  } else if (
    input.databaseConnectionPosture === "supabase-pooler-transaction" &&
    !hasPrismaTransactionPoolerParams(input.databaseUrl)
  ) {
    actions.push("Add Prisma pooler parameters pgbouncer=true and connection_limit=1 to the transaction pooler URL.");
  }

  if (input.failedCheckNames.length > 0) {
    actions.push(`Fix failed production env verifier checks: ${input.failedCheckNames.join(", ")}.`);
  }

  return [...new Set(actions.map(redactSensitiveDetail))];
}

export function buildProductionDatabaseEnvRepairPlan(
  envDraft: ProductionDatabaseEnvDraftReport | null,
): ProductionDatabaseEnvRepairGroup[] {
  const specs = productionEnvRepairSpecs();
  if (!envDraft) {
    return specs.map((spec) => ({
      id: spec.id,
      title: spec.title,
      owner: spec.owner,
      status: "not_checked",
      failedCheckNames: [],
      affectedEnvKeys: spec.envKeys,
      detail: "尚未附加 production env draft；無法判斷此組 production env 是否可用。",
      nextStep: "先產生或附加 .env.vercel.production redacted verifier，再補齊此組設定。",
      evidence: "pnpm env:verify:production -- --env-file=.env.vercel.production",
    }));
  }

  const failedCheckSet = new Set(envDraft.failedCheckNames);
  const unresolvedPlaceholderSet = new Set(envDraft.unresolvedPlaceholderKeys);
  const matchedCheckNames = new Set<string>();
  const groups: ProductionDatabaseEnvRepairGroup[] = specs.map((spec) => {
    const failedCheckNames = spec.checkNames.filter((name) => failedCheckSet.has(name));
    const unresolvedEnvKeys = spec.envKeys.filter((key) => unresolvedPlaceholderSet.has(key));
    for (const name of failedCheckNames) matchedCheckNames.add(name);
    const blocked = failedCheckNames.length > 0 || unresolvedEnvKeys.length > 0;
    return {
      id: spec.id,
      title: spec.title,
      owner: spec.owner,
      status: blocked ? "blocked" : "ready",
      failedCheckNames,
      affectedEnvKeys: [...new Set([...spec.envKeys, ...unresolvedEnvKeys])],
      detail: blocked ? spec.blockedDetail : spec.readyDetail,
      nextStep: blocked ? spec.nextStep : spec.keepReadyStep,
      evidence: spec.evidence,
    };
  });

  const unmatchedFailedChecks = envDraft.failedCheckNames.filter((name) => !matchedCheckNames.has(name));
  if (unmatchedFailedChecks.length > 0) {
    groups.push({
      id: "other",
      title: "其他 production env 檢查",
      owner: "Owner + Engineering",
      status: "blocked",
      failedCheckNames: unmatchedFailedChecks,
      affectedEnvKeys: [],
      detail: "有尚未被分類的 production verifier 失敗項；先不要寫入 Vercel Production env。",
      nextStep: `釐清並修正這些 verifier checks：${unmatchedFailedChecks.join(", ")}。`,
      evidence: "env verifier failed check names resolved to zero.",
    });
  }

  return groups.map((group) => ({
    ...group,
    detail: redactSensitiveDetail(group.detail),
    nextStep: redactSensitiveDetail(group.nextStep),
    evidence: redactSensitiveDetail(group.evidence),
  }));
}

function productionEnvRepairSpecs() {
  return [
    {
      id: "database_connection" as const,
      title: "資料庫連線與 private schema",
      owner: "Engineering" as const,
      checkNames: [
        "database url",
        "database provider",
        "database private schema",
        "Supabase Vercel database network",
        "Supabase Prisma pooler params",
        "Supabase project url",
        "Supabase publishable key",
      ],
      envKeys: [
        "DATABASE_URL",
        "HR_ONE_DATABASE_PROVIDER",
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
        "HR_ONE_SUPABASE_IPV4_ADDON_ENABLED",
      ],
      blockedDetail: "正式資料庫或 Supabase schema/pooler 形狀尚未通過；不可邀請真實員工或跑正式試用。",
      readyDetail: "資料庫 URL、Supabase provider、private schema 與 Vercel network posture 已通過本地 verifier。",
      nextStep: "用 Supabase transaction pooler DATABASE_URL 經 stdin 建立 redacted handoff，確認 schema=hr_one、pgbouncer=true、connection_limit=1 後再寫入 Vercel。",
      keepReadyStep: "改 Vercel/Supabase/Prisma schema 後重新跑 env verifier、live ready 與 production database evidence。",
      evidence: "redacted DATABASE_URL handoff, env verifier ready, live /api/health/ready ok.",
    },
    {
      id: "scheduled_maintenance" as const,
      title: "Cron 與正式維護 scope",
      owner: "Engineering" as const,
      checkNames: ["CRON_SECRET", "scheduled job tenant scope", "scheduled job company scope"],
      envKeys: ["CRON_SECRET", "HR_ONE_CRON_TENANT_ID", "HR_ONE_CRON_COMPANY_ID"],
      blockedDetail: "排程授權或 tenant/company scope 不完整；報表清理、AI 暫存清理與維護 audit 不能安全跑。",
      readyDetail: "Cron secret 與正式維護 tenant/company scope 已通過本地 verifier。",
      nextStep: "補 CRON_SECRET 與正式 tenant/company scope，然後跑 maintenance readiness 與 hash-only audit evidence。",
      keepReadyStep: "每次換正式 tenant 或 company id 時，同步更新 Cron scope 並重跑 maintenance Gate。",
      evidence: "env verifier ready, /settings/readiness operational maintenance ready, hash-only maintenance audit.",
    },
    {
      id: "object_storage" as const,
      title: "正式文件儲存與保留政策",
      owner: "Owner + Engineering" as const,
      checkNames: [
        "object storage provider",
        "object storage bucket",
        "HR_ONE_OBJECT_STORAGE_SECRET_REF",
        "HR_ONE_OBJECT_STORAGE_KMS_KEY_REF",
        "object storage lifecycle policy",
        "object storage signed URL ceiling",
      ],
      envKeys: [
        "HR_ONE_OBJECT_STORAGE_PROVIDER",
        "HR_ONE_OBJECT_STORAGE_BUCKET",
        "HR_ONE_OBJECT_STORAGE_SECRET_REF",
        "HR_ONE_OBJECT_STORAGE_KMS_KEY_REF",
        "HR_ONE_OBJECT_STORAGE_LIFECYCLE_POLICY_REF",
        "HR_ONE_OBJECT_STORAGE_SIGNED_URL_MAX_TTL_SECONDS",
      ],
      blockedDetail: "正式文件儲存 provider、bucket、KMS、保存政策或短效 signed URL TTL 尚未完整。",
      readyDetail: "正式文件儲存 provider、bucket、KMS、保存政策與 signed URL TTL 已通過本地 verifier。",
      nextStep: "補正式 object storage provider/bucket/KMS/lifecycle ref，並在文件金庫跑 smoke test，不把文件落在 demo storage。",
      keepReadyStep: "更換 bucket、KMS 或保存政策後重跑 storage Gate 與文件金庫 smoke test。",
      evidence: "file storage Gate ready, KMS/lifecycle refs, document vault smoke test, audit log.",
    },
    {
      id: "auth_session" as const,
      title: "正式登入、Tenant context 與 session",
      owner: "Owner + Engineering" as const,
      checkNames: [
        "auth provider",
        "auth session source",
        "auth issuer url",
        "auth login url",
        "auth audience",
        "auth jwks url",
        "auth token max age",
        "auth tenant context",
        "web session max age",
      ],
      envKeys: [
        "HR_ONE_AUTH_PROVIDER",
        "HR_ONE_AUTH_SESSION_SOURCE",
        "HR_ONE_AUTH_ISSUER_URL",
        "HR_ONE_AUTH_LOGIN_URL",
        "HR_ONE_AUTH_AUDIENCE",
        "HR_ONE_AUTH_JWKS_URL",
        "HR_ONE_AUTH_MAX_TOKEN_AGE_SECONDS",
        "HR_ONE_AUTH_TENANT_CONTEXT_SOURCE",
        "HR_ONE_AUTH_DEFAULT_TENANT",
        "HR_ONE_AUTH_DEFAULT_COMPANY",
        "HR_ONE_WEB_SESSION_MAX_AGE_SECONDS",
      ],
      blockedDetail: "正式 OIDC/session 或 tenant context 不完整；角色切換、薪資權限與跨租戶隔離不可放行。",
      readyDetail: "正式 OIDC/session、tenant context 與瀏覽器 session max-age 已通過本地 verifier。",
      nextStep: "補 HR_ONE_AUTH_TENANT_CONTEXT_SOURCE 與 web session max age；若使用 env_defaults，也要補正式 tenant/company defaults。",
      keepReadyStep: "更換 IdP、tenant claim 或登入 URL 後重跑 access cutover、薪資防漏與 tenant isolation tests。",
      evidence: "access cutover ready, SSO subject hash bindings, tenant API boundary guardrail.",
    },
    {
      id: "secrets_rate_limit_backup" as const,
      title: "核心 secrets、Rate limit 與備份還原",
      owner: "Owner + Engineering" as const,
      checkNames: [
        "deployment environment",
        "public app url",
        "deployment target",
        "Vercel project binding",
        "HR_ONE_SESSION_SECRET",
        "HR_ONE_ENCRYPTION_KEY",
        "HR_ONE_AUDIT_LOG_SIGNING_KEY",
        "app rate limiter",
        "rate limit provider",
        "HR_ONE_RATE_LIMIT_SECRET_REF",
        "external rate limit endpoint",
        "external rate limit token",
        "rate limit window",
        "rate limit ceiling",
        "database backups",
        "backup retention",
        "HR_ONE_BACKUP_ENCRYPTION_KEY_REF",
        "restore drill evidence",
      ],
      envKeys: [
        "HR_ONE_ENV",
        "HR_ONE_APP_URL",
        "NEXT_PUBLIC_APP_URL",
        "HR_ONE_DEPLOYMENT_TARGET",
        "VERCEL_PROJECT_ID",
        "HR_ONE_SESSION_SECRET",
        "HR_ONE_ENCRYPTION_KEY",
        "HR_ONE_AUDIT_LOG_SIGNING_KEY",
        "HR_ONE_RATE_LIMIT_ENABLED",
        "HR_ONE_RATE_LIMIT_PROVIDER",
        "HR_ONE_RATE_LIMIT_SECRET_REF",
        "HR_ONE_RATE_LIMIT_WINDOW_SECONDS",
        "HR_ONE_RATE_LIMIT_MAX_REQUESTS",
        "HR_ONE_BACKUP_ENABLED",
        "HR_ONE_BACKUP_RETENTION_DAYS",
        "HR_ONE_BACKUP_ENCRYPTION_KEY_REF",
        "HR_ONE_BACKUP_RESTORE_TESTED_AT",
      ],
      blockedDetail: "核心 secrets、rate limit、備份或還原演練有缺口；正式 runtime 不能視為可販售。",
      readyDetail: "核心 secrets、rate limit、備份保留與還原演練已通過本地 verifier。",
      nextStep: "補 vault refs、rate limit posture、backup retention 與最近 restore drill evidence，再跑 production release gate。",
      keepReadyStep: "secret rotation、rate limit provider 或備份策略改動後重新跑 env verifier 與 restore drill evidence scan。",
      evidence: "env verifier ready, restore drill report, rate limit posture, secret refs only.",
    },
    {
      id: "ai_governance" as const,
      title: "AI provider 與 prompt 保存治理",
      owner: "Owner" as const,
      checkNames: ["AI provider posture", "AI prompt storage"],
      envKeys: ["HR_ONE_AI_PROVIDER", "HR_ONE_AI_SECRET_REF", "HR_ONE_AI_PROMPT_STORAGE"],
      blockedDetail: "AI provider 或 prompt 保存策略不符合安全限制；不能把敏感 prompt 原文帶進正式環境。",
      readyDetail: "AI provider disabled 或已使用 vault ref，且 raw sensitive prompt storage 未啟用。",
      nextStep: "保持 AI_PROVIDER=disabled，或只用 vault secret ref 啟用 AI；prompt storage 必須是 hash/redacted，不可 raw。",
      keepReadyStep: "啟用外部 AI 前重新跑 AI safety tests、來源引用 Gate 與 audit redaction checks。",
      evidence: "AI safety tests, prompt storage redaction posture, AI usage audit hash.",
    },
  ];
}

function describeDatabaseUrlShape(
  databaseUrl: string | null,
  unresolvedPlaceholderKeys: string[],
) {
  if (!databaseUrl) return "missing server-only database URL";
  if (unresolvedPlaceholderKeys.includes("DATABASE_URL")) return "unresolved database URL placeholder";
  const posture = classifyDatabaseConnection(databaseUrl);
  if (posture === "supabase-direct") return "Supabase direct host";
  if (posture === "supabase-pooler-session") return "Supabase session pooler";
  if (posture === "supabase-pooler-unknown") return "Supabase pooler with nonstandard port";
  if (posture === "supabase-pooler-transaction") {
    return hasPrismaTransactionPoolerParams(databaseUrl)
      ? "Supabase transaction pooler with Prisma pooler params"
      : "Supabase transaction pooler missing Prisma pooler params";
  }
  if (posture === "other") return "other PostgreSQL-compatible URL";
  return "invalid database URL";
}

function readEnv(env: Record<string, string | undefined>, key: string) {
  const value = env[key]?.trim();
  return value ? value : null;
}

function summaryForRootCause(rootCause: ProductionDatabaseRootCause) {
  const labels: Record<ProductionDatabaseRootCause, string> = {
    ready: "Production database 已可用，可以進入真實 tenant go/no-go。",
    supabase_direct_network: "目前阻擋是 Vercel/serverless 無法穩定連 Supabase direct Postgres host。",
    pooler_configuration: "目前阻擋是 Supabase pooler 連線設定或 runtime role 尚未驗證成功。",
    missing_database_url: "Production 尚未設定 server-side DATABASE_URL。",
    environment_configuration: "Production env 尚未通過完整環境檢查。",
    private_schema_unverified: "Production database 連線已可用，但尚未完成 Supabase private schema / RLS Gate。",
    private_schema_security: "Production database 連線已可用，但 Supabase private schema / RLS Gate 仍有安全阻擋項。",
    health_unreachable: "無法讀取 live readiness JSON，不能判定 production 是否可試用。",
    unknown: "Production readiness 仍 blocked，需要看 live health 與 runtime logs 定位。",
  };
  return labels[rootCause];
}

function classifyPrivateSchemaRootCause(privateSchema: ProductionDatabasePrivateSchemaReport): ProductionDatabaseRootCause {
  return privateSchema.status === "not_checked" ? "private_schema_unverified" : "private_schema_security";
}

function buildDefaultPrivateSchemaVerifierCommand(schemaName: string) {
  return `pnpm db:supabase:verify-schema -- --project-ref=${defaultSupabaseProjectRef} --schema=${schemaName} --allow-tenant-data`;
}

function emptyPrivateSchemaMetrics(): ProductionDatabasePrivateSchemaMetrics {
  return {
    tableCount: null,
    enumTypeCount: null,
    prismaMigrationCount: null,
    rlsEnabledTableCount: null,
    rlsDisabledTableCount: null,
    exposedTablePrivilegeCount: null,
    exposedSecurityDefinerFunctionCount: null,
    publicSchemaShadowTableCount: null,
    publicSecurityDefinerExecuteCount: null,
    tenantCount: null,
    companyCount: null,
    employeeCount: null,
    anonUsage: null,
    authenticatedUsage: null,
  };
}

function metricsFromPrivateSchemaSnapshot(
  snapshot: SupabasePrivateSchemaVerificationSnapshot,
): ProductionDatabasePrivateSchemaMetrics {
  return {
    tableCount: snapshot.tableCount,
    enumTypeCount: snapshot.enumTypeCount,
    prismaMigrationCount: snapshot.prismaMigrationCount,
    rlsEnabledTableCount: snapshot.rlsEnabledTableCount,
    rlsDisabledTableCount: snapshot.rlsDisabledTableCount,
    exposedTablePrivilegeCount: snapshot.exposedTablePrivilegeCount,
    exposedSecurityDefinerFunctionCount: snapshot.exposedSecurityDefinerFunctionCount,
    publicSchemaShadowTableCount: snapshot.publicSchemaShadowTableCount,
    publicSecurityDefinerExecuteCount: snapshot.publicSecurityDefinerExecuteCount,
    tenantCount: snapshot.tenantCount,
    companyCount: snapshot.companyCount,
    employeeCount: snapshot.employeeCount,
    anonUsage: snapshot.anonUsage,
    authenticatedUsage: snapshot.authenticatedUsage,
  };
}

function extractPrivateSchemaSnapshot(payload: unknown): SupabasePrivateSchemaVerificationSnapshot {
  if (isPrivateSchemaSnapshot(payload)) return payload;
  if (payload && typeof payload === "object" && isPrivateSchemaSnapshot((payload as { snapshot?: unknown }).snapshot)) {
    return (payload as { snapshot: SupabasePrivateSchemaVerificationSnapshot }).snapshot;
  }
  throw new Error("Private schema verifier JSON must contain a Supabase verification snapshot.");
}

function isPrivateSchemaSnapshot(value: unknown): value is SupabasePrivateSchemaVerificationSnapshot {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<SupabasePrivateSchemaVerificationSnapshot>;
  return [
    record.tableCount,
    record.enumTypeCount,
    record.prismaMigrationCount,
    record.rlsEnabledTableCount,
    record.rlsDisabledTableCount,
    record.exposedTablePrivilegeCount,
    record.exposedSecurityDefinerFunctionCount,
    record.publicSchemaShadowTableCount,
    record.publicSecurityDefinerExecuteCount,
    record.tenantCount,
    record.companyCount,
    record.employeeCount,
  ].every((item) => typeof item === "number") &&
    typeof record.anonUsage === "boolean" &&
    typeof record.authenticatedUsage === "boolean";
}

function readPayloadSchemaName(payload: unknown) {
  if (payload && typeof payload === "object" && typeof (payload as { schemaName?: unknown }).schemaName === "string") {
    return (payload as { schemaName: string }).schemaName;
  }
  return null;
}

function readPayloadExpectedMigrationCount(payload: unknown) {
  if (payload && typeof payload === "object" && typeof (payload as { expectedMigrationCount?: unknown }).expectedMigrationCount === "number") {
    return (payload as { expectedMigrationCount: number }).expectedMigrationCount;
  }
  return null;
}

function readPayloadAllowTenantData(payload: unknown) {
  if (payload && typeof payload === "object" && typeof (payload as { allowTenantData?: unknown }).allowTenantData === "boolean") {
    return (payload as { allowTenantData: boolean }).allowTenantData;
  }
  return null;
}

function metricValue(value: number | null) {
  return value === null ? "not checked" : String(value);
}

function booleanMetricValue(value: boolean | null) {
  if (value === null) return "not checked";
  return value ? "allowed" : "blocked";
}

function gateCheckPassed(gate: ProductionPilotGateReport, name: string) {
  return Boolean(gate.checks.find((check) => check.name === name)?.passed);
}

function step(
  id: string,
  title: string,
  detail: string,
  status: ProductionDatabaseRemediationStep["status"],
  command?: string,
): ProductionDatabaseRemediationStep {
  return {
    id,
    title,
    detail: redactSensitiveDetail(detail),
    command,
    status,
  };
}

function safeCheckDetail(healthReport: HealthReport | null, checkName: string) {
  const detail = healthReport?.checks.find((check) => check.name === checkName)?.detail;
  return redactSensitiveDetail(detail ?? `${checkName} check is missing`);
}

function safeUrl(value: string) {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return "[invalid-url]";
  }
}

function buildReadinessUrlOrFallback(appUrl: string) {
  try {
    return buildReadinessUrl(appUrl);
  } catch {
    return "[invalid-url]";
  }
}

function normalizeAppUrl(value: string) {
  const trimmed = value.trim();
  return trimmed || defaultAppUrl;
}

function expectedHostFromUrl(appUrl: string) {
  try {
    return new URL(appUrl).hostname;
  } catch {
    return null;
  }
}

function isHealthReport(value: unknown): value is HealthReport {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as { service?: unknown }).service === "hr-one" &&
    Array.isArray((value as { checks?: unknown }).checks),
  );
}
