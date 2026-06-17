const allowedBetaPilotReturnPaths = new Set([
  "/settings/readiness",
  "/settings/pilot-invite-readiness",
  "/settings/pilot-operations",
]);

export function getBetaPilotReturnUrl(
  requestUrl: string,
  requestedReturnTo: string | null | undefined,
  fallbackPath = "/settings/readiness#pilot-runbook",
) {
  const fallbackUrl = new URL(fallbackPath, requestUrl);
  const rawReturnTo = requestedReturnTo?.trim();
  if (!rawReturnTo) return fallbackUrl;

  try {
    const returnUrl = new URL(rawReturnTo, requestUrl);
    const requestOrigin = new URL(requestUrl).origin;
    if (returnUrl.origin !== requestOrigin) return fallbackUrl;
    if (!allowedBetaPilotReturnPaths.has(returnUrl.pathname)) return fallbackUrl;
    return returnUrl;
  } catch {
    return fallbackUrl;
  }
}

export function getBetaPilotErrorReturnUrl(
  requestUrl: string,
  requestedReturnTo: string | null | undefined,
  message: string,
) {
  const returnUrl = getBetaPilotReturnUrl(requestUrl, requestedReturnTo);
  returnUrl.searchParams.delete("success");
  returnUrl.searchParams.set("error", message);
  return returnUrl;
}
