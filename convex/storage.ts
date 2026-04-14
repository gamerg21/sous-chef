import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "./helpers";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await getAuthUserId(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const getUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

export const saveStorageId = mutation({
  args: {
    storageId: v.id("_storage"),
    recipeId: v.optional(v.id("recipes")),
    inventoryItemId: v.optional(v.id("inventoryItems")),
  },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);

    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) throw new Error("Storage file not found");

    const assetId = await ctx.db.insert("mediaAssets", {
      url,
      recipeId: args.recipeId,
      inventoryItemId: args.inventoryItemId,
    });

    // Update the linked entity with the URL
    if (args.recipeId) {
      await ctx.db.patch(args.recipeId, { photoUrl: url });
    }
    if (args.inventoryItemId) {
      await ctx.db.patch(args.inventoryItemId, { photoUrl: url });
    }

    return { url, assetId };
  },
});
