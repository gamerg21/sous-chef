import {
  getAuthSessionId,
  getAuthUserId as getConvexAuthUserId,
} from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";
import { QueryCtx, MutationCtx } from "./_generated/server";

/**
 * Get the authenticated user ID from the Convex auth context.
 * Throws if not authenticated.
 */
export async function getAuthUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users">> {
  const userId = await getConvexAuthUserId(ctx);
  if (!userId) {
    throw new Error("Not authenticated");
  }

  const user = await ctx.db.get(userId);
  if (user) {
    return user._id;
  }

  const sessionId = await getAuthSessionId(ctx);
  if (sessionId) {
    const session = await ctx.db.get(sessionId);
    if (session) {
      const sessionUser = await ctx.db.get(session.userId);
      if (sessionUser) {
        return sessionUser._id;
      }
    }
  }

  throw new Error("User not found");
}

/**
 * Get user's current household ID.
 * Returns the first household the user belongs to.
 */
export async function getCurrentHouseholdId(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Id<"households"> | null> {
  const membership = await ctx.db
    .query("householdMembers")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
  return membership?.householdId ?? null;
}

/**
 * Ensure user has a household. Creates one if needed.
 */
export async function ensureUserHasHousehold(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Id<"households">> {
  const existing = await getCurrentHouseholdId(ctx, userId);
  if (existing) return existing;
  return await createDefaultHousehold(ctx, userId);
}

/**
 * Create a default household with kitchen locations and shopping list.
 */
export async function createDefaultHousehold(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Id<"households">> {
  const user = await ctx.db.get(userId);
  const name = user?.name ? `${user.name}'s Kitchen` : "My Kitchen";

  const householdId = await ctx.db.insert("households", { name });

  await ctx.db.insert("householdMembers", {
    userId,
    householdId,
    role: "owner",
  });

  // Create default kitchen locations
  for (const locName of ["Pantry", "Fridge", "Freezer"]) {
    await ctx.db.insert("kitchenLocations", {
      householdId,
      name: locName,
    });
  }

  // Create shopping list
  await ctx.db.insert("shoppingLists", { householdId });

  return householdId;
}

/**
 * Check if user is a member of the household and return their role.
 */
export async function getHouseholdMembership(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  householdId: Id<"households">,
) {
  return await ctx.db
    .query("householdMembers")
    .withIndex("by_userId_and_householdId", (q) =>
      q.eq("userId", userId).eq("householdId", householdId),
    )
    .unique();
}

/**
 * Map kitchen location name to UI location ID.
 */
export function locationNameToId(name: string): "pantry" | "fridge" | "freezer" {
  const lower = name.toLowerCase();
  if (lower.includes("fridge") || lower.includes("refrigerator")) return "fridge";
  if (lower.includes("freezer")) return "freezer";
  return "pantry";
}

/**
 * Map UI location ID to kitchen location name.
 */
export function locationIdToName(id: string): string {
  switch (id) {
    case "fridge":
      return "Fridge";
    case "freezer":
      return "Freezer";
    default:
      return "Pantry";
  }
}
