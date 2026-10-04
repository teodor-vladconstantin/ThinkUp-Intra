import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this folder (a stray lockfile in the user's home dir
  // otherwise makes Next guess the wrong root).
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
