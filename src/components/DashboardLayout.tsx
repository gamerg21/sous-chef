import { redirect } from "next/navigation";
import { getCurrentUser, getUserHouseholds, getCurrentHousehold, getCurrentHouseholdId } from "@/lib/user";
import { DashboardShell } from "./DashboardShell";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default async function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/signin");
  }

  // Get all households for the user (auto-create if none exists)
  const { ensureUserHasHousehold } = await import("@/lib/household");
  await ensureUserHasHousehold(user.id);
  const households = await getUserHouseholds(user.id);

  // Get current household
  const householdId = (await getCurrentHouseholdId(user.id)) || households[0]?.id;
  const currentHousehold = await getCurrentHousehold(user.id, householdId);

  if (!currentHousehold) {
    redirect("/auth/signin");
  }

  const navigationItems = [
    { label: "Kitchen Inventory", href: "/inventory" },
    { label: "Recipes", href: "/recipes" },
    { label: "Cooking & Shopping", href: "/cooking" },
    { label: "Shopping List", href: "/shopping-list" },
    { label: "Community", href: "/community" },
    { label: "Extensions", href: "/extensions" },
  ];

  return (
    <DashboardShell
      navigationItems={navigationItems}
      user={{
        name: user.name || user.email || "User",
        avatarUrl: user.image || undefined,
      }}
      households={households.map((h: { id: string; name: string }) => ({ id: h.id, name: h.name }))}
      currentHouseholdId={currentHousehold.id}
    >
      {children}
    </DashboardShell>
  );
}

