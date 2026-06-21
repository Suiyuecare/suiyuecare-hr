export type DatabaseConnectionPosture =
  | "supabase-direct"
  | "supabase-pooler-session"
  | "supabase-pooler-transaction"
  | "supabase-pooler-unknown"
  | "other"
  | "invalid";

export type SupabaseTransactionPoolerTemplate = {
  projectRef: string;
  region: string;
  username: string;
  host: string;
  port: 6543;
  database: "postgres";
  requiredQueryParams: string[];
  schema: string;
  passwordSource: string;
};

const knownSupabaseProjectRegions: Record<string, string> = {
  aruncclorusswpfnpgsn: "ap-northeast-2",
};

export function classifyDatabaseConnection(databaseUrl: string | null | undefined): DatabaseConnectionPosture {
  if (!databaseUrl) return "invalid";
  try {
    const url = new URL(databaseUrl);
    const host = url.hostname;
    const port = url.port || "5432";
    if (/^db\.[a-z0-9]+\.supabase\.co$/i.test(host) && port === "5432") {
      return "supabase-direct";
    }
    if (/\.pooler\.supabase\.com$/i.test(host)) {
      if (port === "5432") return "supabase-pooler-session";
      if (port === "6543") return "supabase-pooler-transaction";
      return "supabase-pooler-unknown";
    }
    return "other";
  } catch {
    return "invalid";
  }
}

export function isSupabaseDirectConnection(databaseUrl: string | null | undefined) {
  return classifyDatabaseConnection(databaseUrl) === "supabase-direct";
}

export function isSupabasePoolerConnection(databaseUrl: string | null | undefined) {
  const posture = classifyDatabaseConnection(databaseUrl);
  return (
    posture === "supabase-pooler-session" ||
    posture === "supabase-pooler-transaction" ||
    posture === "supabase-pooler-unknown"
  );
}

export function isSupabaseTransactionPoolerConnection(databaseUrl: string | null | undefined) {
  return classifyDatabaseConnection(databaseUrl) === "supabase-pooler-transaction";
}

export function hasPrismaTransactionPoolerParams(databaseUrl: string | null | undefined) {
  if (!isSupabaseTransactionPoolerConnection(databaseUrl)) return true;
  try {
    const url = new URL(databaseUrl!);
    return (
      url.searchParams.get("pgbouncer") === "true" &&
      url.searchParams.get("connection_limit") === "1"
    );
  } catch {
    return false;
  }
}

export function extractSupabaseProjectRef(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  const directRef = /^[a-z0-9]{20}$/i.test(trimmed) ? trimmed : null;
  if (directRef) return directRef.toLowerCase();

  try {
    const url = new URL(trimmed);
    const supabaseUrlMatch = url.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/i);
    if (supabaseUrlMatch?.[1]) return supabaseUrlMatch[1].toLowerCase();
    const dbHostMatch = url.hostname.match(/^db\.([a-z0-9]{20})\.supabase\.co$/i);
    if (dbHostMatch?.[1]) return dbHostMatch[1].toLowerCase();
    const usernameMatch = decodeURIComponent(url.username).match(/^postgres\.([a-z0-9]{20})$/i);
    if (usernameMatch?.[1]) return usernameMatch[1].toLowerCase();
  } catch {
    return null;
  }

  return null;
}

export function buildSupabaseTransactionPoolerTemplate(options: {
  supabaseUrl?: string | null;
  projectRef?: string | null;
  region?: string | null;
  schema?: string | null;
  connectionLimit?: number | null;
} = {}): SupabaseTransactionPoolerTemplate {
  const projectRef =
    extractSupabaseProjectRef(options.projectRef) ??
    extractSupabaseProjectRef(options.supabaseUrl) ??
    "aruncclorusswpfnpgsn";
  const region = normalizeSupabaseRegion(options.region, projectRef);
  const schema = normalizeSchemaName(options.schema);
  const connectionLimit = normalizeConnectionLimit(options.connectionLimit);

  return {
    projectRef,
    region,
    username: `postgres.${projectRef}`,
    host: `aws-0-${region}.pooler.supabase.com`,
    port: 6543,
    database: "postgres",
    schema,
    requiredQueryParams: [
      "pgbouncer=true",
      `connection_limit=${connectionLimit}`,
      `schema=${schema}`,
    ],
    passwordSource: "Supabase Dashboard > Connect > Transaction pooler password",
  };
}

function normalizeSupabaseRegion(region: string | null | undefined, projectRef: string) {
  const normalized = region?.trim().toLowerCase();
  if (normalized && /^[a-z]+-[a-z]+-\d+$/.test(normalized)) return normalized;
  return knownSupabaseProjectRegions[projectRef] ?? "ap-northeast-2";
}

function normalizeSchemaName(schema: string | null | undefined) {
  const normalized = schema?.trim();
  return normalized && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(normalized) ? normalized : "hr_one";
}

function normalizeConnectionLimit(value: number | null | undefined) {
  return Number.isInteger(value) && value && value > 0 ? value : 1;
}
