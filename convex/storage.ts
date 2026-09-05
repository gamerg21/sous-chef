import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId, getHouseholdMembership } from "./helpers";

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
    await getAuthUserId(ctx);
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
    const userId = await getAuthUserId(ctx);

    // The caller must belong to the household that owns whichever entity
    // this upload is being attached to.
    if (args.recipeId) {
      const recipe = await ctx.db.get(args.recipeId);
      if (!recipe) throw new Error("Recipe not found");
      const membership = await getHouseholdMembership(
        ctx,
        userId,
        recipe.householdId,
      );
      if (!membership) throw new Error("Permission denied");
    }
    if (args.inventoryItemId) {
      const item = await ctx.db.get(args.inventoryItemId);
      if (!item) throw new Error("Inventory item not found");
      const membership = await getHouseholdMembership(
        ctx,
        userId,
        item.householdId,
      );
      if (!membership) throw new Error("Permission denied");
    }

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
