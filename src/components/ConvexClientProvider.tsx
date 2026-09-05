"use client";

import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [client, setClient] = useState<ConvexReactClient | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let connection: ConvexReactClient | undefined;
    void (async () => {
      try {
        const response = await fetch('/api/config', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Unable to load this instance’s configuration. Try again.');
        const config = await response.json();
        if (!config.convexUrl) throw new Error('This instance needs a Convex backend URL.');
        if (controller.signal.aborted) return;
        connection = new ConvexReactClient(config.convexUrl, { skipConvexDeploymentUrlCheck: true });
        setClient(connection);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to connect.');
      }
    })();
    return () => { controller.abort(); void connection?.close(); };
  }, []);

  if (error) return (
    <main className="min-h-dvh bg-stone-50 px-5 py-16 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <div className="mx-auto max-w-lg rounded-2xl border border-stone-200 bg-white p-6 sm:p-8 dark:border-stone-800 dark:bg-stone-900">
        <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Sous Chef · Instance setup</p>
        <h1 className="mt-3 text-2xl font-semibold">Let’s connect your kitchen</h1>
        <p role="alert" className="mt-3 text-stone-600 dark:text-stone-300">{error}</p>
        <ol className="mt-6 list-decimal space-y-3 pl-5 text-sm leading-6">
          <li>Set <code>CONVEX_URL</code> (or <code>NEXT_PUBLIC_CONVEX_URL</code>) in your web server’s environment to your cloud or self-hosted Convex URL.</li>
          <li>Configure Convex Auth and deploy the backend using the setup guide in <code>docs/CONVEX_SETUP.md</code>.</li>
          <li>Restart the web server, then try again.</li>
        </ol>
        <button onClick={() => window.location.reload()} className="mt-6 min-h-11 rounded-lg bg-emerald-700 px-5 font-medium text-white hover:bg-emerald-800">Try again</button>
      </div>
    </main>
  );
  if (!client) return <div role="status" className="flex min-h-dvh items-center justify-center bg-stone-50 text-stone-600 dark:bg-stone-950 dark:text-stone-300">Connecting to your kitchen…</div>;

  return (
    <ConvexAuthProvider
      client={client}
      shouldHandleCode={!pathname.startsWith("/auth/reset-password")}
    >
      {children}
    </ConvexAuthProvider>
  );
}
