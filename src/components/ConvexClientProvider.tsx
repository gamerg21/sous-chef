"use client";

import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { usePathname } from "next/navigation";
import { ReactNode, useState } from "react";

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [client] = useState(
    () => new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!),
  );

  return (
    <ConvexAuthProvider
      client={client}
      shouldHandleCode={!pathname.startsWith("/auth/reset-password")}
    >
      {children}
    </ConvexAuthProvider>
  );
}
