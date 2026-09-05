"use client";

import { useConvexAuth, useQuery, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import { DashboardPrewarm } from "./DashboardPrewarm";
import AppShell from "./shell/AppShell";
import type { Id } from "../../convex/_generated/dataModel";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const navigationItems = [
  { label: "Kitchen Inventory", href: "/inventory" },
  { label: "Recipes", href: "/recipes" },
  { label: "What can I cook?", href: "/cooking" },
  { label: "Shopping List", href: "/shopping-list" },
  { label: "Community", href: "/community" },
];

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useAuthActions();
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [bootstrapError, setBootstrapError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [switchError, setSwitchError] = useState(false);
  const selectHousehold = useMutation(api.households.select);

  const ensureCurrentUser = useMutation(api.users.ensureCurrentUser);
  const profile = useQuery(
    api.users.getProfile,
    isAuthenticated && authReady ? {} : "skip",
  );
  const households = useQuery(
    api.households.list,
    isAuthenticated && authReady ? {} : "skip",
  );

  // Ensure household exists
  const ensureHousehold = useMutation(api.households.ensureHousehold);

  useEffect(() => {
    if (!isAuthenticated || authReady) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        await ensureCurrentUser({});
        await ensureHousehold({});
        if (!cancelled) {
          setAuthReady(true);
        }
      } catch (error) {
        console.error("Auth bootstrap failed:", error);
        if (!cancelled) {
          setBootstrapError(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authReady, ensureCurrentUser, ensureHousehold, isAuthenticated, attempt]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/auth/signin");
    }
  }, [isLoading, isAuthenticated, router]);

  if (bootstrapError) return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold">Your kitchen couldn’t finish loading</h1>
      <p role="alert">Check your connection and try again. Your account is still signed in.</p>
      <button className="min-h-11 rounded-lg bg-emerald-700 px-5 text-white" onClick={() => { setBootstrapError(false); setAttempt(value => value + 1); }}>Try again</button>
      <button className="min-h-11 underline" onClick={() => void signOut()}>Sign out</button>
    </div>
  );

  if (isLoading || (isAuthenticated && !authReady)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-stone-600 dark:text-stone-400">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Will redirect via the useEffect above
    return null;
  }

  if (!profile || !households) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-stone-600 dark:text-stone-400">Loading...</div>
      </div>
    );
  }

  const currentHouseholdId =
    String(households.find(h => h.isCurrent)?.id ?? households[0]?.id ?? "");

  const handleLogout = async () => {
    await signOut();
    router.push("/auth/signin");
  };

  return (
    <AppShell
      key={currentHouseholdId}
      navigationItems={navigationItems}
      user={{
        name: profile.user.name || profile.user.email || "User",
        avatarUrl: profile.user.image || undefined,
      }}
      households={households.map((h) => ({
        id: String(h.id),
        name: h.name,
      }))}
      currentHouseholdId={currentHouseholdId}
      onHouseholdChange={(id) => {
        setSwitchError(false);
        void selectHousehold({ householdId: id as Id<"households"> }).catch(() => setSwitchError(true));
      }}
      onLogout={handleLogout}
    >
      <DashboardPrewarm
        enabled={authReady && isAuthenticated}
        routes={[
          "/inventory",
          "/recipes",
          "/cooking",
          "/shopping-list",
          "/community",
          "/account",
        ]}
      />
      {switchError && <p role="alert" className="bg-red-50 p-4 text-red-800">Couldn’t switch kitchens. Please try again.</p>}
      {children}
    </AppShell>
  );
}
