import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { prisma } from "./prisma";
import { getCurrentHouseholdId } from "./user";

/**
 * Check if the current user is an app administrator
 */
export async function isAppAdmin(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return false;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAppAdmin: true },
  });

  return user?.isAppAdmin ?? false;
}

/**
 * Check if the current user is an owner or admin of the specified household
 */
export async function isHouseholdOwnerOrAdmin(
  householdId: string
): Promise<boolean> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return false;

  const membership = await prisma.householdMember.findFirst({
    where: {
      userId,
      householdId,
      role: { in: ["owner", "admin"] },
    },
  });

  return !!membership;
}

/**
 * Check if the current user is an owner of the specified household
 */
export async function isHouseholdOwner(householdId: string): Promise<boolean> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return false;

  const membership = await prisma.householdMember.findFirst({
    where: {
      userId,
      householdId,
      role: "owner",
    },
  });

  return !!membership;
}

/**
 * Get the current user's household role for the current household
 */
export async function getCurrentHouseholdRole(): Promise<
  "owner" | "admin" | "member" | null
> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return null;

  const householdId = await getCurrentHouseholdId(userId);
  if (!householdId) return null;

  const membership = await prisma.householdMember.findFirst({
    where: {
      userId,
      householdId,
    },
    select: { role: true },
  });

  return membership?.role ?? null;
}

