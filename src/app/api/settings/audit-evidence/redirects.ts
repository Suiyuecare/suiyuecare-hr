const defaultAuditEvidenceReturnTo = "/settings/audit";

export function normalizeAuditEvidenceReturnTo(value: string) {
  if (!value) return defaultAuditEvidenceReturnTo;
  if (!value.startsWith("/") || value.startsWith("//")) {
    return defaultAuditEvidenceReturnTo;
  }
  return value;
}

export function buildAuditEvidenceErrorRedirectUrl(
  returnTo: string,
  message: string,
  requestUrl: string,
) {
  const url = new URL(returnTo, requestUrl);
  url.searchParams.delete("success");
  url.searchParams.set("error", message);
  return url;
}
