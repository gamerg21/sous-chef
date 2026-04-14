// DashboardShell is no longer needed - DashboardLayout handles everything.
// This file is kept for backward compatibility but simply renders children.
"use client";

export interface DashboardShellProps {
  children: React.ReactNode;
  navigationItems: Array<{ label: string; href: string }>;
  user: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
  households: Array<{ id: string; name: string }>;
  currentHouseholdId: string;
}

export function DashboardShell({ children }: DashboardShellProps) {
  return <>{children}</>;
}
