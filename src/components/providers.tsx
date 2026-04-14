"use client";

import { ConvexClientProvider } from "./ConvexClientProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return <ConvexClientProvider>{children}</ConvexClientProvider>;
}
