"use client";

import { useConvexAuth, useQuery, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import { DashboardPrewarm } from "./DashboardPrewarm";
import AppShell from "./shell/AppShell";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const navigationItems = [
  { label: "Kitchen Inventory", href: "/inventory" },
  { label: "Recipes", href: "/recipes" },
  { label: "Cooking & Shopping", href: "/cooking" },
  { label: "Shopping List", href: "/shopping-list" },
  { label: "Community", href: "/community" },
  { label: "Extensions", href: "/extensions" },
];

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useAuthActions();
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);

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
        if (!cancelled) {
          setAuthReady(true);
        }
      } catch (error) {
        console.error("Auth bootstrap failed:", error);
        if (!cancelled) {
          setAuthReady(false);
          await signOut();
          router.replace("/auth/signin");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authReady, ensureCurrentUser, isAuthenticated, router, signOut]);

  useEffect(() => {
    if (
      authReady &&
      isAuthenticated &&
      households !== undefined &&
      households.length === 0
    ) {
      ensureHousehold({});
    }
  }, [authReady, isAuthenticated, households, ensureHousehold]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/auth/signin");
    }
  }, [isLoading, isAuthenticated, router]);

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
    households.length > 0 ? String(households[0].id) : "";

  const handleLogout = async () => {
    await signOut();
    router.push("/auth/signin");
  };

  return (
    <AppShell
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
          "/extensions",
          "/account",
        ]}
      />
      {children}
    </AppShell>
  );
}
