export type SecurityHeader = {
  key: string;
  value: string;
};

export type SecurityHeaderOptions = {
  production: boolean;
  connectSrc?: string[];
};

export function buildSecurityHeaders(options: SecurityHeaderOptions): SecurityHeader[] {
  const headers: SecurityHeader[] = [
    { key: "X-DNS-Prefetch-Control", value: "off" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: buildPermissionsPolicy() },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    { key: "Content-Security-Policy-Report-Only", value: buildCspReportOnly(options) },
  ];

  if (options.production) {
    headers.unshift({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    });
  }

  return headers;
}

function buildCspReportOnly(options: SecurityHeaderOptions) {
  const connectSrc = ["'self'", ...normalizeConnectSrc(options.connectSrc ?? [])].join(" ");
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
  ].join("; ");
}

function normalizeConnectSrc(values: string[]) {
  return [...new Set(values.flatMap((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" ? [url.origin] : [];
    } catch {
      return [];
    }
  }))];
}

function buildPermissionsPolicy() {
  return [
    "camera=()",
    "microphone=()",
    "geolocation=(self)",
    "payment=()",
    "usb=()",
    "serial=()",
    "bluetooth=()",
    "interest-cohort=()",
  ].join(", ");
}
