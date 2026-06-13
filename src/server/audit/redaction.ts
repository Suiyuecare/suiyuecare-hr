import { createHash } from "node:crypto";

const sensitiveKeyPattern =
  /(salary|pay|wage|bonus|deduction|nationalId|national_id|bank|account|health|medical|birth|address|phone|email|idNumber|passport|arc)/i;

export type RedactedValue = "[REDACTED]";

export function stableHash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

export function redactSensitivePayload<T>(payload: T): T {
  if (Array.isArray(payload)) {
    return payload.map((item) => redactSensitivePayload(item)) as T;
  }

  if (payload && typeof payload === "object") {
    return Object.fromEntries(
      Object.entries(payload).map(([key, value]) => [
        key,
        sensitiveKeyPattern.test(key)
          ? "[REDACTED]"
          : redactSensitivePayload(value),
      ]),
    ) as T;
  }

  return payload;
}

export function safeLogFields(fields: Record<string, unknown>) {
  return redactSensitivePayload(fields);
}

