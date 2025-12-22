import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCurrentHouseholdId } from "@/lib/user";
import { isHouseholdOwnerOrAdmin } from "@/lib/admin";
import HouseholdUsersClient from "./client";

export default async function HouseholdUsersPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  
  if (!userId) {
    redirect("/auth/signin");
  }

  const householdId = await getCurrentHouseholdId(userId);
  if (!householdId) {
    redirect("/inventory");
  }

  const hasPermission = await isHouseholdOwnerOrAdmin(householdId);
  if (!hasPermission) {
    redirect("/settings");
  }

  return <HouseholdUsersClient />;
}
