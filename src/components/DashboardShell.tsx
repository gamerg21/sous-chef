"use client";

import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { AppShell } from "@/components/shell";

interface DashboardShellProps {
  children: React.ReactNode;
  navigationItems: Array<{ label: string; href: string }>;
  user: { name: string; avatarUrl?: string };
  households: Array<{ id: string; name: string }>;
  currentHouseholdId: string;
}

export function DashboardShell({
  children,
  navigationItems,
  user,
  households,
  currentHouseholdId,
}: DashboardShellProps) {
  const router = useRouter();

  const handleHouseholdChange = async (newHouseholdId: string) => {
    try {
      const response = await fetch("/api/household/switch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ householdId: newHouseholdId }),
      });

      if (response.ok) {
        router.refresh();
      } else {
        const error = await response.json();
        console.error("Failed to switch household:", error);
      }
    } catch (error) {
      console.error("Error switching household:", error);
    }
  };

  const handleLogout = async () => {
    await signOut({ redirect: true, redirectTo: "/auth/signin" });
  };

  return (
    <AppShell
      navigationItems={navigationItems}
      user={user}
      households={households}
      currentHouseholdId={currentHouseholdId}
      onHouseholdChange={handleHouseholdChange}
      onLogout={handleLogout}
    >
      {children}
    </AppShell>
  );
}

