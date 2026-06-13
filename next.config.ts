import type { NextConfig } from "next";
import { buildSecurityHeaders } from "./src/server/security/headers";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: buildSecurityHeaders({ production: process.env.HR_ONE_ENV === "production" }),
      },
    ];
  },
};

export default nextConfig;
