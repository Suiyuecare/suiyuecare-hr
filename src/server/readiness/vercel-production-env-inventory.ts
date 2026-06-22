import { redactSensitiveDetail } from "./production-pilot-gate";

export type VercelProductionEnvInventoryStatus = "ready" | "blocked" | "not_checked";
export type VercelProductionEnvInventoryKeyStatus =
  | "present"
  | "missing"
  | "wrong_target"
  | "unsafe_type"
  | "not_checked";
export type VercelProductionEnvInventoryType =
  | "encrypted"
  | "sensitive"
  | "plain"
  | "system"
  | "unknown";

export type VercelProductionEnvInventoryGroupId =
  | "deployment"
  | "database_connection"
  | "scheduled_maintenance"
  | "object_storage"
  | "auth_session"
  | "secrets_rate_limit_backup"
  | "ai_governance";

export type VercelProductionEnvInventoryKey = {
  key: string;
  groupId: VercelProductionEnvInventoryGroupId;
  status: VercelProductionEnvInventoryKeyStatus;
  type: VercelProductionEnvInventoryType;
  targets: string[];
  updatedAt: string | null;
  detail: string;
};

export type VercelProductionEnvInventoryGroup = {
  id: VercelProductionEnvInventoryGroupId;
  title: string;
  owner: "Owner" | "Engineering" | "Owner + Engineering";
  status: VercelProductionEnvInventoryStatus;
  requiredCount: number;
  presentCount: number;
  missingKeys: string[];
  wrongTargetKeys: string[];
  unsafeTypeKeys: string[];
  nextStep: string;
};

export type VercelProductionEnvInventoryReport = {
  status: VercelProductionEnvInventoryStatus;
  generatedAt: string;
  source: string;
  command: string;
  summary: string;
  totalKeyCount: number;
  productionKeyCount: number;
  requiredKeyCount: number;
  presentRequiredCount: number;
  missingKeys: string[];
  wrongTargetKeys: string[];
  unsafeTypeKeys: string[];
  keys: VercelProductionEnvInventoryKey[];
  groups: VercelProductionEnvInventoryGroup[];
  nextActions: string[];
};

type NormalizedVercelEnvEntry = {
  key: string;
  type: VercelProductionEnvInventoryType;
  targets: string[];
  updatedAt: string | null;
};

type RequiredEnvSpec = {
  key: string;
  groupId: VercelProductionEnvInventoryGroupId;
  requiresSensitiveType?: boolean;
};

const defaultVercelTeamId = "team_LGag47eU8tKbsK6ixAmVa5Uq";

export function buildVercelProductionEnvInventoryCommand(teamId = defaultVercelTeamId) {
  return `pnpm dlx vercel@latest env ls production --format json --scope ${teamId}`;
}

export function buildVercelProductionEnvInventoryReport(
  payload: unknown,
  options: {
    generatedAt?: Date;
    source?: string;
    command?: string;
  } = {},
): VercelProductionEnvInventoryReport {
  const generatedAt = options.generatedAt ?? new Date();
  const command = redactSensitiveDetail(options.command ?? buildVercelProductionEnvInventoryCommand());
  const source = redactSensitiveDetail(options.source ?? "Vercel CLI env ls production --format json");
  const specs = requiredVercelProductionEnvSpecs();

  if (!payload) {
    const keys = specs.map((spec) => keyStatusFromSpec(spec, null, "not_checked"));
    const groups = buildInventoryGroups(keys, "not_checked");
    return {
      status: "not_checked",
      generatedAt: generatedAt.toISOString(),
      source,
      command,
      summary: "Vercel Production env key inventory has not been attached yet.",
      totalKeyCount: 0,
      productionKeyCount: 0,
      requiredKeyCount: specs.length,
      presentRequiredCount: 0,
      missingKeys: [],
      wrongTargetKeys: [],
      unsafeTypeKeys: [],
      keys,
      groups,
      nextActions: [
        "Run the Vercel Production env key inventory command and attach the JSON output to prove required key names, targets, and secret-safe types.",
        command,
      ],
    };
  }

  const entries = normalizeVercelEnvInventoryPayload(payload);
  const keys = specs.map((spec) => keyStatusFromSpec(spec, entries, null));
  const missingKeys = keys.filter((item) => item.status === "missing").map((item) => item.key);
  const wrongTargetKeys = keys.filter((item) => item.status === "wrong_target").map((item) => item.key);
  const unsafeTypeKeys = keys.filter((item) => item.status === "unsafe_type").map((item) => item.key);
  const groups = buildInventoryGroups(keys, null);
  const productionKeyCount = entries.filter((entry) => hasProductionTarget(entry.targets)).length;
  const presentRequiredCount = keys.filter((item) => item.status === "present").length;
  const status = missingKeys.length || wrongTargetKeys.length || unsafeTypeKeys.length ? "blocked" : "ready";

  return {
    status,
    generatedAt: generatedAt.toISOString(),
    source,
    command,
    summary: status === "ready"
      ? "All required Vercel Production env keys are present on the production target with safe metadata types."
      : `Vercel Production env inventory has ${missingKeys.length} missing key(s), ${wrongTargetKeys.length} wrong-target key(s), and ${unsafeTypeKeys.length} unsafe type key(s).`,
    totalKeyCount: entries.length,
    productionKeyCount,
    requiredKeyCount: specs.length,
    presentRequiredCount,
    missingKeys,
    wrongTargetKeys,
    unsafeTypeKeys,
    keys,
    groups,
    nextActions: buildInventoryNextActions({ missingKeys, wrongTargetKeys, unsafeTypeKeys, command }),
  };
}

export function formatVercelProductionEnvInventoryMarkdown(report: VercelProductionEnvInventoryReport) {
  return [
    "# HR One Vercel Production Env Inventory",
    "",
    `Generated at: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Source: ${report.source}`,
    `Command: ${report.command}`,
    "",
    "## Summary",
    "",
    redactSensitiveDetail(report.summary),
    "",
    `- Required keys: ${report.presentRequiredCount}/${report.requiredKeyCount}`,
    `- Total keys inspected: ${report.totalKeyCount}`,
    `- Production-target keys inspected: ${report.productionKeyCount}`,
    `- Missing keys: ${report.missingKeys.join(", ") || "None"}`,
    `- Wrong-target keys: ${report.wrongTargetKeys.join(", ") || "None"}`,
    `- Unsafe-type keys: ${report.unsafeTypeKeys.join(", ") || "None"}`,
    "",
    "## Groups",
    "",
    ...report.groups.flatMap((group) => [
      `### ${group.title}`,
      "",
      `- Status: ${group.status}`,
      `- Owner: ${group.owner}`,
      `- Required: ${group.presentCount}/${group.requiredCount}`,
      `- Missing: ${group.missingKeys.join(", ") || "None"}`,
      `- Wrong target: ${group.wrongTargetKeys.join(", ") || "None"}`,
      `- Unsafe type: ${group.unsafeTypeKeys.join(", ") || "None"}`,
      `- Next step: ${redactSensitiveDetail(group.nextStep)}`,
      "",
    ]),
    "## Required Key Status",
    "",
    ...report.keys.map((item) => [
      `- [${item.status.toUpperCase()}] ${item.key}`,
      `type=${item.type}`,
      `targets=${item.targets.join(",") || "none"}`,
      `updated=${item.updatedAt ?? "unknown"}`,
      `detail=${redactSensitiveDetail(item.detail)}`,
    ].join(" · ")),
    "",
    "## Next Actions",
    "",
    ...(report.nextActions.length ? report.nextActions.map((action) => `- ${redactSensitiveDetail(action)}`) : ["- None."]),
    "",
  ].join("\n");
}

function requiredVercelProductionEnvSpecs(): RequiredEnvSpec[] {
  return [
    spec("HR_ONE_ENV", "deployment"),
    spec("HR_ONE_APP_URL", "deployment"),
    spec("HR_ONE_DEPLOYMENT_TARGET", "deployment"),
    spec("VERCEL_PROJECT_ID", "deployment"),
    spec("HR_ONE_DATABASE_PROVIDER", "database_connection"),
    spec("DATABASE_URL", "database_connection", true),
    spec("NEXT_PUBLIC_SUPABASE_URL", "database_connection"),
    spec("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "database_connection"),
    spec("HR_ONE_SESSION_SECRET", "secrets_rate_limit_backup", true),
    spec("HR_ONE_ENCRYPTION_KEY", "secrets_rate_limit_backup", true),
    spec("HR_ONE_AUDIT_LOG_SIGNING_KEY", "secrets_rate_limit_backup", true),
    spec("CRON_SECRET", "scheduled_maintenance", true),
    spec("HR_ONE_CRON_TENANT_ID", "scheduled_maintenance"),
    spec("HR_ONE_CRON_COMPANY_ID", "scheduled_maintenance"),
    spec("HR_ONE_OBJECT_STORAGE_PROVIDER", "object_storage"),
    spec("HR_ONE_OBJECT_STORAGE_BUCKET", "object_storage"),
    spec("HR_ONE_OBJECT_STORAGE_SECRET_REF", "object_storage"),
    spec("HR_ONE_OBJECT_STORAGE_KMS_KEY_REF", "object_storage"),
    spec("HR_ONE_OBJECT_STORAGE_LIFECYCLE_POLICY_REF", "object_storage"),
    spec("HR_ONE_OBJECT_STORAGE_SIGNED_URL_MAX_TTL_SECONDS", "object_storage"),
    spec("HR_ONE_AUTH_PROVIDER", "auth_session"),
    spec("HR_ONE_AUTH_SESSION_SOURCE", "auth_session"),
    spec("HR_ONE_AUTH_ISSUER_URL", "auth_session"),
    spec("HR_ONE_AUTH_LOGIN_URL", "auth_session"),
    spec("HR_ONE_AUTH_AUDIENCE", "auth_session"),
    spec("HR_ONE_AUTH_JWKS_URL", "auth_session"),
    spec("HR_ONE_AUTH_MAX_TOKEN_AGE_SECONDS", "auth_session"),
    spec("HR_ONE_AUTH_TENANT_CONTEXT_SOURCE", "auth_session"),
    spec("HR_ONE_AUTH_DEFAULT_TENANT", "auth_session"),
    spec("HR_ONE_AUTH_DEFAULT_COMPANY", "auth_session"),
    spec("HR_ONE_WEB_SESSION_MAX_AGE_SECONDS", "auth_session"),
    spec("HR_ONE_AI_PROVIDER", "ai_governance"),
    spec("HR_ONE_AI_PROMPT_STORAGE", "ai_governance"),
    spec("HR_ONE_RATE_LIMIT_ENABLED", "secrets_rate_limit_backup"),
    spec("HR_ONE_RATE_LIMIT_PROVIDER", "secrets_rate_limit_backup"),
    spec("HR_ONE_RATE_LIMIT_SECRET_REF", "secrets_rate_limit_backup"),
    spec("HR_ONE_RATE_LIMIT_WINDOW_SECONDS", "secrets_rate_limit_backup"),
    spec("HR_ONE_RATE_LIMIT_MAX_REQUESTS", "secrets_rate_limit_backup"),
    spec("HR_ONE_BACKUP_ENABLED", "secrets_rate_limit_backup"),
    spec("HR_ONE_BACKUP_RETENTION_DAYS", "secrets_rate_limit_backup"),
    spec("HR_ONE_BACKUP_ENCRYPTION_KEY_REF", "secrets_rate_limit_backup"),
    spec("HR_ONE_BACKUP_RESTORE_TESTED_AT", "secrets_rate_limit_backup"),
  ];
}

function spec(
  key: string,
  groupId: VercelProductionEnvInventoryGroupId,
  requiresSensitiveType = false,
): RequiredEnvSpec {
  return { key, groupId, requiresSensitiveType };
}

function normalizeVercelEnvInventoryPayload(payload: unknown): NormalizedVercelEnvEntry[] {
  const rawEntries = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.envs)
      ? payload.envs
      : [];

  return rawEntries
    .map(normalizeVercelEnvEntry)
    .filter((entry): entry is NormalizedVercelEnvEntry => Boolean(entry))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function normalizeVercelEnvEntry(entry: unknown): NormalizedVercelEnvEntry | null {
  if (!isRecord(entry)) return null;
  const key = readString(entry.key) ?? readString(entry.name);
  if (!key || !/^[A-Z0-9_]+$/.test(key)) return null;
  return {
    key,
    type: normalizeVercelEnvType(readString(entry.type)),
    targets: normalizeTargets(entry.target ?? entry.targets),
    updatedAt: normalizeTimestamp(entry.updatedAt ?? entry.createdAt),
  };
}

function keyStatusFromSpec(
  spec: RequiredEnvSpec,
  entries: NormalizedVercelEnvEntry[] | null,
  forcedStatus: "not_checked" | null,
): VercelProductionEnvInventoryKey {
  if (forcedStatus) {
    return {
      key: spec.key,
      groupId: spec.groupId,
      status: forcedStatus,
      type: "unknown",
      targets: [],
      updatedAt: null,
      detail: "Vercel Production env inventory has not been attached yet.",
    };
  }

  const matchingEntries = entries?.filter((entry) => entry.key === spec.key) ?? [];
  const productionEntry = matchingEntries.find((entry) => hasProductionTarget(entry.targets));
  const entry = productionEntry ?? matchingEntries[0] ?? null;
  if (!entry) {
    return {
      key: spec.key,
      groupId: spec.groupId,
      status: "missing",
      type: "unknown",
      targets: [],
      updatedAt: null,
      detail: "Required Vercel Production env key is missing from the inventory.",
    };
  }

  if (!productionEntry) {
    return {
      key: spec.key,
      groupId: spec.groupId,
      status: "wrong_target",
      type: entry.type,
      targets: entry.targets,
      updatedAt: entry.updatedAt,
      detail: "Env key exists, but not on the production target.",
    };
  }

  if (entry.type === "plain" || (spec.requiresSensitiveType && entry.type !== "sensitive")) {
    return {
      key: spec.key,
      groupId: spec.groupId,
      status: "unsafe_type",
      type: entry.type,
      targets: entry.targets,
      updatedAt: entry.updatedAt,
      detail: spec.requiresSensitiveType
        ? "This key must be configured as a Vercel sensitive variable."
        : "This key must not be stored as a plain Vercel variable.",
    };
  }

  return {
    key: spec.key,
    groupId: spec.groupId,
    status: "present",
    type: entry.type,
    targets: entry.targets,
    updatedAt: entry.updatedAt,
    detail: "Required key is present on the production target.",
  };
}

function buildInventoryGroups(
  keys: VercelProductionEnvInventoryKey[],
  forcedStatus: VercelProductionEnvInventoryStatus | null,
): VercelProductionEnvInventoryGroup[] {
  return inventoryGroupSpecs().map((group) => {
    const groupKeys = keys.filter((item) => item.groupId === group.id);
    const missingKeys = groupKeys.filter((item) => item.status === "missing").map((item) => item.key);
    const wrongTargetKeys = groupKeys.filter((item) => item.status === "wrong_target").map((item) => item.key);
    const unsafeTypeKeys = groupKeys.filter((item) => item.status === "unsafe_type").map((item) => item.key);
    const status: VercelProductionEnvInventoryStatus = forcedStatus ??
      (missingKeys.length || wrongTargetKeys.length || unsafeTypeKeys.length ? "blocked" : "ready");
    return {
      id: group.id,
      title: group.title,
      owner: group.owner,
      status,
      requiredCount: groupKeys.length,
      presentCount: groupKeys.filter((item) => item.status === "present").length,
      missingKeys,
      wrongTargetKeys,
      unsafeTypeKeys,
      nextStep: groupNextStep(status, group.title, missingKeys, wrongTargetKeys, unsafeTypeKeys),
    };
  });
}

function inventoryGroupSpecs(): Array<{
  id: VercelProductionEnvInventoryGroupId;
  title: string;
  owner: "Owner" | "Engineering" | "Owner + Engineering";
}> {
  return [
    { id: "deployment", title: "正式網址與 Vercel 專案", owner: "Owner + Engineering" },
    { id: "database_connection", title: "資料庫與 Supabase 連線", owner: "Engineering" },
    { id: "scheduled_maintenance", title: "Cron 與正式維護 scope", owner: "Engineering" },
    { id: "object_storage", title: "正式文件儲存與保留政策", owner: "Owner + Engineering" },
    { id: "auth_session", title: "正式登入、Tenant context 與 session", owner: "Owner + Engineering" },
    { id: "secrets_rate_limit_backup", title: "核心 secrets、rate limit 與備份", owner: "Owner + Engineering" },
    { id: "ai_governance", title: "AI 治理與 prompt 保存", owner: "Owner + Engineering" },
  ];
}

function groupNextStep(
  status: VercelProductionEnvInventoryStatus,
  title: string,
  missingKeys: string[],
  wrongTargetKeys: string[],
  unsafeTypeKeys: string[],
) {
  if (status === "not_checked") return `執行 Vercel env inventory，只讀確認「${title}」相關 key 是否存在於 production target。`;
  if (status === "ready") return `「${title}」key inventory 已通過；仍需靠 live /api/health/ready 證明值可用。`;
  if (missingKeys.length > 0) return `補齊 missing key：${missingKeys.join(", ")}。`;
  if (wrongTargetKeys.length > 0) return `把 key 加到 production target：${wrongTargetKeys.join(", ")}。`;
  return `改成 secret-safe Vercel type：${unsafeTypeKeys.join(", ")}。`;
}

function buildInventoryNextActions(input: {
  missingKeys: string[];
  wrongTargetKeys: string[];
  unsafeTypeKeys: string[];
  command: string;
}) {
  const actions: string[] = [];
  if (input.missingKeys.length > 0) {
    actions.push(`Add missing Vercel Production env keys: ${input.missingKeys.join(", ")}.`);
  }
  if (input.wrongTargetKeys.length > 0) {
    actions.push(`Move or recreate these env keys on the production target: ${input.wrongTargetKeys.join(", ")}.`);
  }
  if (input.unsafeTypeKeys.length > 0) {
    actions.push(`Recreate unsafe env keys with secret-safe Vercel types: ${input.unsafeTypeKeys.join(", ")}.`);
  }
  if (actions.length === 0) {
    actions.push("Vercel env key inventory is complete; redeploy production and verify live /api/health/ready because key presence does not prove value correctness.");
  } else {
    actions.push("After fixing env key inventory, redeploy production and verify live /api/health/ready.");
    actions.push(input.command);
  }
  return actions.map(redactSensitiveDetail);
}

function normalizeTargets(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(readString).filter((item): item is string => Boolean(item)).map(normalizeTarget).sort();
  }
  const single = readString(value);
  return single ? [normalizeTarget(single)] : [];
}

function normalizeTarget(value: string) {
  return value.trim().toLowerCase();
}

function hasProductionTarget(targets: string[]) {
  return targets.includes("production");
}

function normalizeVercelEnvType(value: string | null): VercelProductionEnvInventoryType {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === "encrypted" ||
    normalized === "sensitive" ||
    normalized === "plain" ||
    normalized === "system"
  ) {
    return normalized;
  }
  return "unknown";
}

function normalizeTimestamp(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
