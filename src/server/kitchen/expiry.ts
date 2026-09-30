import { v } from "convex/values";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId, resolveHouseholdId } from "./helpers";
import { localDay } from "../../lib/expiring";

/** The person's local calendar day, using their timezone preference when set. */
export async function todayFor(ctx: QueryCtx, userId: Id<"users">, now = new Date()): Promise<string> {
  const prefs = await ctx.db.query("userPreferences").withIndex("by_userId", (q) => q.eq("userId", userId)).unique();
  return localDay(now, prefs?.timezone);
}

/** Notes what became of a dated pantry item as it left the pantry. */
export async function recordOutcome(
  ctx: MutationCtx,
  householdId: Id<"households">,
  outcome: { name: string; outcome: "used" | "wasted"; on: string; expiresOn?: string },
) {
  await ctx.db.insert("pantryOutcomes", { householdId, ...outcome });
}

/** Dated items used up versus thrown away in one month (default: this month). */
export const outcomes = query({
  args: { householdId: v.optional(v.id("households")), month: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const householdId = await resolveHouseholdId(ctx, userId, args.householdId);
    if (args.month !== undefined && !/^\d{4}-\d{2}$/.test(args.month)) throw new Error("Month must be YYYY-MM");
    const month = args.month ?? (await todayFor(ctx, userId)).slice(0, 7);
    if (!householdId) return { month, used: 0, wasted: 0 };
    const rows = await ctx.db.query("pantryOutcomes").withIndex("by_householdId_and_on", (q) => q.eq("householdId", householdId)).collect();
    const inMonth = rows.filter((row) => row.on.startsWith(month));
    return {
      month,
      used: inMonth.filter((row) => row.outcome === "used").length,
      wasted: inMonth.filter((row) => row.outcome === "wasted").length,
    };
  },
});
