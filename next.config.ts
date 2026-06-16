import type { NextConfig } from "next";
import { buildSecurityHeaders } from "./src/server/security/headers";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: buildSecurityHeaders({
          production: process.env.HR_ONE_ENV === "production",
          connectSrc: [process.env.NEXT_PUBLIC_SUPABASE_URL].filter((value): value is string => Boolean(value)),
        }),
      },
    ];
  },
};

export default nextConfig;
