"use client";

import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { usePathname } from "next/navigation";
import { ReactNode, useMemo } from "react";

const BUILD_FALLBACK_CONVEX_URL = "https://placeholder.convex.cloud";

function getConvexUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (configuredUrl) {
    return configuredUrl;
  }

  if (typeof window === "undefined") {
    return BUILD_FALLBACK_CONVEX_URL;
  }

  throw new Error(
    "NEXT_PUBLIC_CONVEX_URL is not configured. " +
      "Set it in your environment before starting the app.",
  );
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const client = useMemo(() => new ConvexReactClient(getConvexUrl()), []);

  return (
    <ConvexAuthProvider
      client={client}
      shouldHandleCode={!pathname.startsWith("/auth/reset-password")}
    >
      {children}
    </ConvexAuthProvider>
  );
}
