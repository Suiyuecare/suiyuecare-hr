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
import { getUnresolvedEnvPlaceholderKeys } from "@/server/readiness/vercel-production-env-draft";

export type ProductionDatabaseRootCause =
  | "ready"
  | "supabase_direct_network"
  | "pooler_configuration"
  | "missing_database_url"
  | "environment_configuration"
  | "health_unreachable"
  | "unknown";

export type ProductionDatabaseRemediationStep = {
  id: string;
  title: string;
  detail: string;
  command?: string;
  status: "done" | "blocked" | "todo";
};

export type ProductionDatabaseRemediationTrack = {
  id: "transaction_pooler" | "ipv4_addon" | "verification";
  title: string;
  recommended: boolean;
  detail: string;
  steps: ProductionDatabaseRemediationStep[];
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
  supabasePooler: SupabaseTransactionPoolerTemplate;
  databaseDetail: string;
  environmentDetail: string;
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

export type ProductionDatabaseRemediationInput = {
  appUrl: string;
  expectedHost?: string | null;
  healthReport?: HealthReport | null;
  fetchedHealthStatusCode?: number | null;
  envDraft?: ProductionDatabaseEnvDraftReport | null;
  supabaseUrl?: string | null;
  supabaseRegion?: string | null;
  generatedAt?: Date;
};

export type ProductionDatabaseWorkspaceOptions = {
  appUrl?: string;
  expectedHost?: string | null;
  envDraft?: ProductionDatabaseEnvDraftReport | null;
  fetcher?: typeof fetch;
  generatedAt?: Date;
  includeRuntimeEnvDiagnostics?: boolean;
  runtimeEnv?: Record<string, string | undefined> | null;
  supabaseUrl?: string | null;
  supabaseRegion?: string | null;
  timeoutMs?: number;
};

const defaultAppUrl = "https://hr.suiyuecare.com";

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
  const supabasePooler = buildSupabaseTransactionPoolerTemplate({
    supabaseUrl: input.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
    region: input.supabaseRegion ?? process.env.HR_ONE_SUPABASE_REGION,
    schema: "hr_one",
  });
  const rootCause = classifyRootCause({
    healthReport: input.healthReport ?? null,
    statusCode: input.fetchedHealthStatusCode ?? null,
    databaseDetail,
    environmentDetail,
  });
  const status = gate.status === "ready" && rootCause === "ready" ? "ready" : "blocked";
  const tracks = buildTracks(rootCause);
  const nextActions = buildNextActions(rootCause, gate, envDraft);

  return {
    status,
    generatedAt: generatedAt.toISOString(),
    appUrl: safeUrl(input.appUrl),
    readinessUrl: safeUrl(buildReadinessUrlOrFallback(input.appUrl)),
    rootCause,
    summary: summaryForRootCause(rootCause),
    gate,
    envDraft,
    supabasePooler,
    databaseDetail,
    environmentDetail,
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
    "## Supabase Transaction Pooler Shape",
    "",
    ...formatSupabasePooler(report.supabasePooler),
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

function buildTracks(rootCause: ProductionDatabaseRootCause): ProductionDatabaseRemediationTrack[] {
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
      id: "verification",
      title: "驗證與開跑 Gate",
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

function buildNextActions(
  rootCause: ProductionDatabaseRootCause,
  gate: ProductionPilotGateReport,
  envDraft: ProductionDatabaseEnvDraftReport | null,
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
    health_unreachable: "無法讀取 live readiness JSON，不能判定 production 是否可試用。",
    unknown: "Production readiness 仍 blocked，需要看 live health 與 runtime logs 定位。",
  };
  return labels[rootCause];
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
