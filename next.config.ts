import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Skip type checking during build since Convex types are generated at dev time
  typescript: {
    ignoreBuildErrors: true,
  },
};

// Only add standalone output in production builds (not during dev with Turbopack)
if (process.env.NODE_ENV === "production") {
  nextConfig.output = "standalone";
}

export default nextConfig;
