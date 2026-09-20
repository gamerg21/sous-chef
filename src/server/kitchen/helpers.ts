import { Id } from "./_generated/dataModel";
import { QueryCtx, MutationCtx } from "./_generated/server";

/**
 * Get the authenticated user ID from the Convex auth context.
 * Throws if not authenticated.
 */
export async function getAuthUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users">> {
  if (!ctx.userId) throw new Error("Not authenticated");
  const user = await ctx.db.get(ctx.userId);
  if (!user) throw new Error("Not authenticated");
  return user._id;
}

/**
 * Get user's current household ID.
 * Honors the selected household, falling back if membership was removed.
 */
export async function getCurrentHouseholdId(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Id<"households"> | null> {
  const preferences = await ctx.db.query("userPreferences")
    .withIndex("by_userId", q => q.eq("userId", userId)).unique();
  if (preferences?.activeHouseholdId) {
    const membership = await getHouseholdMembership(ctx, userId, preferences.activeHouseholdId);
    if (membership && await ctx.db.get(preferences.activeHouseholdId)) return preferences.activeHouseholdId;
  }
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
 * Resolve the household to operate on. When an explicit householdId is
 * requested, the caller must be a member of it; otherwise fall back to the
 * user's current household.
 */
export async function resolveHouseholdId(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  requestedHouseholdId?: Id<"households">,
): Promise<Id<"households"> | null> {
  if (requestedHouseholdId) {
    const membership = await getHouseholdMembership(
      ctx,
      userId,
      requestedHouseholdId,
    );
    if (!membership) {
      throw new Error("Permission denied");
    }
    return requestedHouseholdId;
  }
  return await getCurrentHouseholdId(ctx, userId);
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
 * Decode a recipe ingredient's note + inventory mapping. New rows store the
 * mapping in mappingLabel; legacy rows encoded it as a "MAPPING:<label>"
 * prefix inside note. Returns the user-facing note (never the legacy
 * marker) and the mapping label, if any.
 */
export function decodeIngredientMapping(ing: {
  note?: string;
  mappingLabel?: string;
}): { note?: string; mappingLabel?: string } {
  const legacy = ing.note?.startsWith("MAPPING:")
    ? ing.note.replace("MAPPING:", "").trim()
    : undefined;
  return {
    note: legacy ? undefined : ing.note,
    mappingLabel: ing.mappingLabel ?? legacy,
  };
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
