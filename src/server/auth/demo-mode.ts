export type DemoAuthRuntimeStatus = {
  allowed: boolean;
  reason: string;
};

export function getDemoAuthRuntimeStatus(
  env: Record<string, string | undefined> = process.env,
): DemoAuthRuntimeStatus {
  if (env.HR_ONE_ENV === "production") {
    return {
      allowed: false,
      reason: "Demo auth is disabled when HR_ONE_ENV=production.",
    };
  }
  if (env.HR_ONE_AUTH_SESSION_SOURCE === "oidc") {
    return {
      allowed: false,
      reason: "Demo auth is disabled when HR_ONE_AUTH_SESSION_SOURCE=oidc.",
    };
  }
  return {
    allowed: true,
    reason: "Demo auth is available for local development and smoke tests.",
  };
}

export function isDemoAuthAllowed(env: Record<string, string | undefined> = process.env) {
  return getDemoAuthRuntimeStatus(env).allowed;
}

export function assertDemoAuthAllowed(env: Record<string, string | undefined> = process.env) {
  const status = getDemoAuthRuntimeStatus(env);
  if (!status.allowed) {
    throw new Error(status.reason);
  }
}
