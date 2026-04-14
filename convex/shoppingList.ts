import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId, getCurrentHouseholdId } from "./helpers";

export const get = query({
  args: { householdId: v.optional(v.id("households")) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const householdId = args.householdId ?? (await getCurrentHouseholdId(ctx, userId));
    if (!householdId) return { items: [] };

    const shoppingList = await ctx.db
      .query("shoppingLists")
      .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
      .first();
    if (!shoppingList) return { items: [] };

    const items = await ctx.db
      .query("shoppingListItems")
      .withIndex("by_shoppingListId", (q) =>
        q.eq("shoppingListId", shoppingList._id),
      )
      .collect();

    return {
      items: items.map((item) => ({
        id: item._id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        category: item.category,
        checked: item.checked,
        note: item.note,
        source: item.source,
        recipeId: item.recipeId ? String(item.recipeId) : undefined,
      })),
    };
  },
});

export const addItem = mutation({
  args: {
    householdId: v.optional(v.id("households")),
    name: v.string(),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    category: v.optional(v.string()),
    note: v.optional(v.string()),
    source: v.optional(v.string()),
    recipeId: v.optional(v.id("recipes")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const householdId = args.householdId ?? (await getCurrentHouseholdId(ctx, userId));
    if (!householdId) throw new Error("No household found");

    const shoppingList = await ctx.db
      .query("shoppingLists")
      .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
      .first();
    if (!shoppingList) throw new Error("Shopping list not found");

    const itemId = await ctx.db.insert("shoppingListItems", {
      shoppingListId: shoppingList._id,
      name: args.name,
      quantity: args.quantity,
      unit: args.unit,
      category: args.category,
      checked: false,
      note: args.note,
      source: args.source ?? "manual",
      recipeId: args.recipeId,
    });

    return { id: itemId };
  },
});

export const updateItem = mutation({
  args: {
    id: v.id("shoppingListItems"),
    name: v.optional(v.string()),
    quantity: v.optional(v.union(v.number(), v.null())),
    unit: v.optional(v.union(v.string(), v.null())),
    category: v.optional(v.union(v.string(), v.null())),
    checked: v.optional(v.boolean()),
    note: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const item = await ctx.db.get(args.id);
    if (!item) throw new Error("Item not found");

    // Verify access through shopping list -> household
    const shoppingList = await ctx.db.get(item.shoppingListId);
    if (!shoppingList) throw new Error("Shopping list not found");

    const membership = await ctx.db
      .query("householdMembers")
      .withIndex("by_userId_and_householdId", (q) =>
        q.eq("userId", userId).eq("householdId", shoppingList.householdId),
      )
      .unique();
    if (!membership) throw new Error("Permission denied");

    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = args.name;
    if (args.quantity !== undefined) patch.quantity = args.quantity ?? undefined;
    if (args.unit !== undefined) patch.unit = args.unit ?? undefined;
    if (args.category !== undefined) patch.category = args.category ?? undefined;
    if (args.checked !== undefined) patch.checked = args.checked;
    if (args.note !== undefined) patch.note = args.note ?? undefined;

    await ctx.db.patch(args.id, patch);
    return { success: true };
  },
});

export const deleteItem = mutation({
  args: { id: v.id("shoppingListItems") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const item = await ctx.db.get(args.id);
    if (!item) throw new Error("Item not found");

    const shoppingList = await ctx.db.get(item.shoppingListId);
    if (!shoppingList) throw new Error("Shopping list not found");

    const membership = await ctx.db
      .query("householdMembers")
      .withIndex("by_userId_and_householdId", (q) =>
        q.eq("userId", userId).eq("householdId", shoppingList.householdId),
      )
      .unique();
    if (!membership) throw new Error("Permission denied");

    await ctx.db.delete(args.id);
    return { success: true };
  },
});
