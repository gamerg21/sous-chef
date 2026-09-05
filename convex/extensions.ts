import { ConvexError, v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId, getCurrentHouseholdId } from "./helpers";

export const list = query({
  args: {
    category: v.optional(v.string()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    let extensions = await ctx.db
      .query("extensionListings")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .take(100);

    if (args.category) {
      extensions = extensions.filter((e) => e.category === args.category);
    }
    if (args.search) {
      const search = args.search.toLowerCase();
      extensions = extensions.filter(
        (e) =>
          e.name.toLowerCase().includes(search) ||
          e.description.toLowerCase().includes(search),
      );
    }

    return {
      extensions: extensions.map((e) => ({
        id: e._id,
        name: e.name,
        description: e.description,
        category: e.category,
        tags: e.tags,
        author: { name: e.authorName, url: e.authorUrl },
        pricing: e.pricing,
        rating: e.rating,
        installs: e.installs,
        updatedAt: new Date(e._creationTime).toISOString(),
        permissions: e.permissions,
      })),
    };
  },
});

export const getById = query({
  args: { id: v.id("extensionListings") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const householdId = await getCurrentHouseholdId(ctx, userId);

    const ext = await ctx.db.get(args.id);
    if (!ext) throw new Error("Extension not found");

    let installed = null;
    if (householdId) {
      installed = await ctx.db
        .query("installedExtensions")
        .withIndex("by_extensionId_and_householdId", (q) =>
          q.eq("extensionId", args.id).eq("householdId", householdId),
        )
        .unique();
    }

    return {
      id: ext._id,
      name: ext.name,
      description: ext.description,
      category: ext.category,
      tags: ext.tags,
      author: { name: ext.authorName, url: ext.authorUrl },
      pricing: ext.pricing,
      rating: ext.rating,
      installs: ext.installs,
      updatedAt: new Date(ext._creationTime).toISOString(),
      permissions: ext.permissions,
      isInstalled: !!installed,
      installedExtension: installed
        ? {
            enabled: installed.enabled,
            needsConfiguration: installed.needsConfiguration,
            configuration: installed.configuration
              ? JSON.parse(installed.configuration)
              : undefined,
          }
        : undefined,
    };
  },
});

/**
 * Listings are a catalog preview. No listing ships an adapter yet, so
 * installing one would only record a row that changes nothing in the kitchen.
 * Reject installs until a listing can actually do something.
 */
export const EXTENSIONS_UNAVAILABLE_MESSAGE =
  "Extensions cannot be installed yet. Listings are a preview of a future catalog.";

export const install = mutation({
  args: { extensionId: v.id("extensionListings") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const householdId = await getCurrentHouseholdId(ctx, userId);
    if (!householdId) throw new Error("No household");

    const ext = await ctx.db.get(args.extensionId);
    if (!ext) throw new Error("Extension not found");
    throw new ConvexError(EXTENSIONS_UNAVAILABLE_MESSAGE);
  },
});

export const uninstall = mutation({
  args: { extensionId: v.id("extensionListings") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const householdId = await getCurrentHouseholdId(ctx, userId);
    if (!householdId) throw new Error("No household");

    const existing = await ctx.db
      .query("installedExtensions")
      .withIndex("by_extensionId_and_householdId", (q) =>
        q.eq("extensionId", args.extensionId).eq("householdId", householdId),
      )
      .unique();
    if (!existing) throw new Error("Not installed");

    await ctx.db.delete(existing._id);
    return { success: true };
  },
});
