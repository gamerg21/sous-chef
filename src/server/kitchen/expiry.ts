import { v } from "convex/values";
import { query, mutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId, resolveHouseholdId } from "./helpers";
import { localDay } from "../../lib/expiring";

const outcomeKind = v.union(v.literal("used"), v.literal("wasted"));
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

/** The person's local calendar day, using their timezone preference when set. */
export async function todayFor(ctx: QueryCtx, userId: Id<"users">, now = new Date()): Promise<string> {
  const prefs = await ctx.db.query("userPreferences").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
  return localDay(now, prefs?.timezone);
}

/** Notes what became of a dated pantry item as it left the pantry. */
export async function recordOutcome(
  ctx: MutationCtx,
  householdId: Id<"households">,
  outcome: { name: string; outcome: "used" | "wasted"; on: string; expiresOn?: string; clientId?: string },
) {
  return await ctx.db.insert("pantryOutcomes", { householdId, ...outcome });
}

async function monthFor(ctx: QueryCtx, userId: Id<"users">, month?: string) {
  if (month !== undefined && !MONTH.test(month)) throw new Error("Month must be YYYY-MM");
  return month ?? (await todayFor(ctx, userId)).slice(0, 7);
}

async function outcomesIn(ctx: QueryCtx, householdId: Id<"households">, month: string) {
  const rows = await ctx.db.query("pantryOutcomes").withIndex("by_householdId_and_on", (q) => q.eq("householdId", householdId)).collect();
  return rows.filter((row) => row.on.startsWith(month));
}

/** Dated items used up versus thrown away in one month (default: this month). */
export const outcomes = query({
  args: { householdId: v.optional(v.id("households")), month: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const householdId = await resolveHouseholdId(ctx, userId, args.householdId);
    const month = await monthFor(ctx, userId, args.month);
    if (!householdId) return { month, used: 0, wasted: 0 };
    const inMonth = await outcomesIn(ctx, householdId, month);
    return {
      month,
      used: inMonth.filter((row) => row.outcome === "used").length,
      wasted: inMonth.filter((row) => row.outcome === "wasted").length,
    };
  },
});

/** Every outcome in one month (default: this month), for the iOS app to mirror. */
export const list = query({
  args: { householdId: v.optional(v.id("households")), month: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const householdId = await resolveHouseholdId(ctx, userId, args.householdId);
    const month = await monthFor(ctx, userId, args.month);
    if (!householdId) return { month, outcomes: [] };
    const rows = await outcomesIn(ctx, householdId, month);
    return {
      month,
      outcomes: rows.map((row) => ({ id: row._id, clientId: row.clientId, name: row.name, outcome: row.outcome, on: row.on, expiresOn: row.expiresOn })),
    };
  },
});

/**
 * Records an outcome another device already noted. Sending the same
 * `clientId` again returns the existing record instead of counting twice.
 */
export const record = mutation({
  args: {
    householdId: v.optional(v.id("households")),
    clientId: v.string(),
    name: v.string(),
    outcome: outcomeKind,
    on: v.string(),
    expiresOn: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const householdId = await resolveHouseholdId(ctx, userId, args.householdId);
    if (!householdId) throw new Error("No household found");
    const clientId = args.clientId.trim();
    const name = args.name.trim();
    if (!clientId || clientId.length > 100) throw new Error("Invalid outcome ID");
    if (!name || name.length > 200) throw new Error("Name must be 1 to 200 characters");
    if (!DAY.test(args.on)) throw new Error("Day must be YYYY-MM-DD");
    if (args.expiresOn !== undefined && !DAY.test(args.expiresOn)) throw new Error("Expiry date must be YYYY-MM-DD");
    const existing = await ctx.db
      .query("pantryOutcomes")
      .withIndex("by_householdId_and_clientId", (q) => q.eq("householdId", householdId).eq("clientId", clientId))
      .first();
    if (existing) return { id: existing._id };
    return { id: await recordOutcome(ctx, householdId, { name, outcome: args.outcome, on: args.on, expiresOn: args.expiresOn, clientId }) };
  },
});

/**
 * "Used" or "Thrown away" for an item past its date: records the outcome and
 * leaves the item in the pantry as out of stock (quantity 0), so its history
 * and the shopping list keep working. An item already out isn't counted again.
 */
export const settle = mutation({
  args: { id: v.id("inventoryItems"), outcome: outcomeKind },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const item = await ctx.db.get(args.id);
    if (!item) throw new Error("Item not found");
    await resolveHouseholdId(ctx, userId, item.householdId);
    if (!(item.quantity > 0)) return { recorded: false };
    const name = (await ctx.db.get(item.foodItemId))?.name ?? "Unknown";
    await recordOutcome(ctx, item.householdId, { name, outcome: args.outcome, on: await todayFor(ctx, userId), expiresOn: item.expiresOn });
    await ctx.db.patch(args.id, { quantity: 0 });
    return { recorded: true };
  },
});
