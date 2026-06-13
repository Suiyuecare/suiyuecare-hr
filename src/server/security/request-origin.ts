export type MutationOriginDecision = {
  allowed: boolean;
  reason: "safe_method" | "same_origin" | "same_site_fetch" | "missing_origin" | "cross_origin" | "invalid_origin";
};

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export function evaluateMutationOrigin(input: {
  method: string;
  origin: string | null;
  host: string | null;
  forwardedHost?: string | null;
  secFetchSite?: string | null;
}): MutationOriginDecision {
  if (safeMethods.has(input.method.toUpperCase())) {
    return { allowed: true, reason: "safe_method" };
  }

  if (input.secFetchSite === "same-origin" || input.secFetchSite === "same-site" || input.secFetchSite === "none") {
    return { allowed: true, reason: "same_site_fetch" };
  }

  if (!input.origin) {
    return { allowed: true, reason: "missing_origin" };
  }

  const originHost = parseHost(input.origin);
  if (!originHost) {
    return { allowed: false, reason: "invalid_origin" };
  }

  const acceptedHosts = [input.host, input.forwardedHost]
    .filter((host): host is string => Boolean(host))
    .map(normalizeHost);

  if (acceptedHosts.includes(originHost)) {
    return { allowed: true, reason: "same_origin" };
  }

  return { allowed: false, reason: "cross_origin" };
}

function parseHost(origin: string) {
  try {
    return normalizeHost(new URL(origin).host);
  } catch {
    return null;
  }
}

function normalizeHost(host: string) {
  return host.trim().toLowerCase();
}
