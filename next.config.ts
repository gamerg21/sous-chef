import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Turbopack traces the pnpm Next symlink but can omit its route runtime.
  outputFileTracingIncludes: { "/*": ["./node_modules/next/dist/compiled/next-server/*.prod.js", "./node_modules/.pnpm/semver@*/node_modules/semver/**/*"] },
  outputFileTracingExcludes: { "*": ["./.env*", "./data/**/*", "./backups/**/*", "./.backups/**/*", "./dist/**/*", "./**/*.sqlite", "./**/*.sqlite-wal", "./**/*.sqlite-shm", "./**/secrets.key"] },
  env: { SOUS_CHEF_BUILD_REVISION: process.env.SOUS_CHEF_BUILD_REVISION || "local" },
};

// Only add standalone output in production builds (not during dev with Turbopack)
if (process.env.NODE_ENV === "production") {
  nextConfig.output = "standalone";
}

export default nextConfig;
