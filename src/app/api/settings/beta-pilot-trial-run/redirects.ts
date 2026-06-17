const defaultTrialRunReturnTo = "/settings/readiness?success=beta-trial-run#pilot-runbook";

export function normalizeBetaPilotTrialRunReturnTo(value: string) {
  if (!value) return defaultTrialRunReturnTo;
  if (!value.startsWith("/") || value.startsWith("//")) {
    return defaultTrialRunReturnTo;
  }
  return value;
}

export function buildBetaPilotTrialRunErrorRedirectUrl(
  returnTo: string,
  message: string,
  requestUrl: string,
) {
  const url = new URL(returnTo, requestUrl);
  url.searchParams.delete("success");
  url.searchParams.set("error", message);
  return url;
}
