import type { NextConfig } from "next";

// Keep browser auth same-origin; API_PROXY_ORIGIN is the public API custom domain.
const apiOrigin = process.env.API_PROXY_ORIGIN?.trim().replace(/\/+$/, "");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async rewrites() {
    if (!apiOrigin) return [];
    return [{
      source: "/api/:path*",
      destination: apiOrigin + "/api/:path*",
    }];
  },
};

export default nextConfig;
