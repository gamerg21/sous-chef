import { ConvexError, v } from "convex/values";
import { query, mutation, action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId, resolveHouseholdId } from "./helpers";
import { encryptSecret } from "./secrets";

export const list = query({
  args: { householdId: v.optional(v.id("households")) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const householdId = await resolveHouseholdId(ctx, userId, args.householdId);
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

export const INTEGRATIONS_UNAVAILABLE_MESSAGE =
  "Third-party integrations are not available yet. No grocery, calendar, or device connection exists to set up.";

/**
 * Public entry point. Runs as an action so OAuth tokens can be encrypted
 * with Web Crypto (unavailable in mutations) before they are stored.
 *
 * No provider adapter exists yet, so marking a row "connected" would only
 * mislead the household. The action rejects until a real connection flow
 * ships; `saveConnection` stays as the storage half of that future flow.
 */
export const connect = action({
  args: {
    integrationId: v.id("integrations"),
    accessToken: v.optional(v.string()),
    refreshToken: v.optional(v.string()),
    config: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!hasIntegrationAdapter()) {
      throw new ConvexError(INTEGRATIONS_UNAVAILABLE_MESSAGE);
    }
    const result: { success: boolean } = await ctx.runMutation(
      internal.integrations.saveConnection,
      {
        ...args,
        accessToken: args.accessToken
          ? await encryptSecret(args.accessToken)
          : args.accessToken,
        refreshToken: args.refreshToken
          ? await encryptSecret(args.refreshToken)
          : args.refreshToken,
      },
    );
    return result;
  },
});

/** Flip this when the first real provider connection flow is implemented. */
function hasIntegrationAdapter(): boolean {
  return false;
}

export const saveConnection = internalMutation({
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
