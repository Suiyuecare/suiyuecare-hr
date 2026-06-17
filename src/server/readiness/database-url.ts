export type DatabaseConnectionPosture =
  | "supabase-direct"
  | "supabase-pooler-session"
  | "supabase-pooler-transaction"
  | "supabase-pooler-unknown"
  | "other"
  | "invalid";

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

export function hasPrismaTransactionPoolerParams(databaseUrl: string | null | undefined) {
  if (classifyDatabaseConnection(databaseUrl) !== "supabase-pooler-transaction") return true;
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
