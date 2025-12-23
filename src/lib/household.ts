import { prisma } from "./prisma";

/**
 * Auto-create a household for a new user with default setup
 */
export async function createDefaultHousehold(userId: string, userName?: string | null, userEmail?: string | null) {
  const householdName = userName 
    ? `${userName}'s Kitchen`
    : userEmail
    ? `${userEmail.split('@')[0]}'s Kitchen`
    : "My Kitchen";

  // Create household with user as owner
  const household = await prisma.household.create({
    data: {
      name: householdName,
      members: {
        create: {
          userId,
          role: "owner",
        },
      },
    },
  });

  // Create default kitchen locations
  await prisma.kitchenLocation.createMany({
    data: [
      { householdId: household.id, name: "Pantry" },
      { householdId: household.id, name: "Fridge" },
      { householdId: household.id, name: "Freezer" },
    ],
  });

  // Create shopping list
  await prisma.shoppingList.create({
    data: {
      householdId: household.id,
    },
  });

  return household;
}

/**
 * Ensure user has at least one household, creating one if needed
 */
export async function ensureUserHasHousehold(userId: string) {
  const existingHouseholds = await prisma.householdMember.findMany({
    where: { userId },
    take: 1,
  });

  if (existingHouseholds.length > 0) {
    return existingHouseholds[0].householdId;
  }

  // Get user info for household name
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });

  const household = await createDefaultHousehold(userId, user?.name || null, user?.email || null);
  return household.id;
}


