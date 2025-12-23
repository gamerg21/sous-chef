import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { authOptions } from "./auth";
import { prisma } from "./prisma";

/**
 * Get the current user's ID from the session
 * Returns null if not authenticated
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.id || null;
}

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  // First verify the user exists in the database
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      households: {
        include: {
          household: true,
        },
      },
      preferences: true,
    },
  });

  // If user doesn't exist, return null (session might be stale)
  if (!user) {
    return null;
  }

  // Ensure preferences exist (lazy creation) - only if user exists and preferences don't
  if (!user.preferences) {
    const { getOrCreateUserPreferences } = await import("./preferences");
    try {
      await getOrCreateUserPreferences(session.user.id);
      // Re-fetch user to include newly created preferences
      return await prisma.user.findUnique({
        where: { id: session.user.id },
        include: {
          households: {
            include: {
              household: true,
            },
          },
          preferences: true,
        },
      });
    } catch (error) {
      // If preferences creation fails, log but return user without preferences
      console.error("Error creating user preferences:", error);
      return user;
    }
  }

  return user;
}

export async function getUserHouseholds(userId: string) {
  const memberships = await prisma.householdMember.findMany({
    where: { userId },
    include: {
      household: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return memberships.map((m: { household: { id: string; name: string }; role: string }) => ({
    id: m.household.id,
    name: m.household.name,
    role: m.role,
  }));
}

export async function getCurrentHouseholdId(userId: string): Promise<string | null> {
  const cookieStore = await cookies();
  const householdIdFromCookie = cookieStore.get("householdId")?.value;

  if (householdIdFromCookie) {
    // Verify user has access to this household
    const membership = await prisma.householdMember.findFirst({
      where: {
        userId,
        householdId: householdIdFromCookie,
      },
    });

    if (membership) {
      return householdIdFromCookie;
    }
  }

  // Get the first household the user belongs to
  const firstMembership = await prisma.householdMember.findFirst({
    where: { userId },
    include: {
      household: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return firstMembership?.household.id || null;
}

export async function getCurrentHousehold(userId: string, householdId?: string) {
  const id = householdId || (await getCurrentHouseholdId(userId));
  
  if (!id) {
    return null;
  }

  // Verify user has access to this household
  const membership = await prisma.householdMember.findFirst({
    where: {
      userId,
      householdId: id,
    },
    include: {
      household: true,
    },
  });

  return membership?.household || null;
}

