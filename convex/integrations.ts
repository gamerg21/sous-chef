import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId, getCurrentHouseholdId } from "./helpers";

export const list = query({
  args: { householdId: v.optional(v.id("households")) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const householdId = args.householdId ?? (await getCurrentHouseholdId(ctx, userId));
    if (!householdId) return { integrations: [] };

    const integrations = await ctx.db
      .query("integrations")
      .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
      .collect();

    return {
      integrations: integrations.map((i) => ({
        id: i._id,
        name: i.name,
        description: i.description,
        status: i.status,
        scopes: i.scopes,
        lastSyncAt: i.lastSyncAt
          ? new Date(i.lastSyncAt).toISOString()
          : undefined,
      })),
    };
  },
});

export const connect = mutation({
  args: {
    integrationId: v.id("integrations"),
    accessToken: v.optional(v.string()),
    refreshToken: v.optional(v.string()),
    config: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const integration = await ctx.db.get(args.integrationId);
    if (!integration) throw new Error("Integration not found");

    const membership = await ctx.db
      .query("householdMembers")
      .withIndex("by_userId_and_householdId", (q) =>
        q.eq("userId", userId).eq("householdId", integration.householdId),
      )
      .unique();
    if (!membership) throw new Error("Permission denied");

    await ctx.db.patch(args.integrationId, {
      status: "connected",
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      config: args.config,
    });
    return { success: true };
  },
});

export const disconnect = mutation({
  args: { integrationId: v.id("integrations") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const integration = await ctx.db.get(args.integrationId);
    if (!integration) throw new Error("Integration not found");

    const membership = await ctx.db
      .query("householdMembers")
      .withIndex("by_userId_and_householdId", (q) =>
        q.eq("userId", userId).eq("householdId", integration.householdId),
      )
      .unique();
    if (!membership) throw new Error("Permission denied");

    await ctx.db.patch(args.integrationId, {
      status: "disconnected",
      accessToken: undefined,
      refreshToken: undefined,
    });
    return { success: true };
  },
});
