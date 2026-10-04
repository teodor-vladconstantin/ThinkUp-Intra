import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this folder (a stray lockfile in the user's home dir
  // otherwise makes Next guess the wrong root).
  turbopack: { root: import.meta.dirname },
  // Baseline security headers on every response. A full Content-Security-Policy is not set
  // yet: Clerk loads scripts and frames from its own domain and needs a tuned allowlist.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" }, // no clickjacking via iframes
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
