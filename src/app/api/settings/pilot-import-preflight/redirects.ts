const defaultPilotImportPreflightReturnTo = "/settings/pilot-import-preflight";
const allowedPilotImportPreflightReturnPaths = new Set([
  "/settings/pilot-import-preflight",
  "/settings/pilot-go-no-go",
  "/settings/pilot-trial-run",
  "/settings/pilot-invite-readiness",
]);

export function normalizePilotImportPreflightReturnTo(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return defaultPilotImportPreflightReturnTo;
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return defaultPilotImportPreflightReturnTo;
  }
  try {
    const url = new URL(trimmed, "https://hr-one.local");
    return allowedPilotImportPreflightReturnPaths.has(url.pathname)
      ? `${url.pathname}${url.search}${url.hash}`
      : defaultPilotImportPreflightReturnTo;
  } catch {
    return defaultPilotImportPreflightReturnTo;
  }
}

export function buildPilotImportPreflightSuccessRedirectUrl(
  returnTo: string,
  requestUrl: string,
) {
  const url = new URL(returnTo, requestUrl);
  url.searchParams.delete("error");
  url.searchParams.set("success", "import-preflight");
  return url;
}

export function buildPilotImportPreflightErrorRedirectUrl(
  returnTo: string,
  message: string,
  requestUrl: string,
) {
  const url = new URL(returnTo, requestUrl);
  url.searchParams.delete("success");
  url.searchParams.set("error", message);
  return url;
}
