import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId, resolveHouseholdId } from "./helpers";

function validateItem(name?: string, quantity?: number | null) {
  if (name !== undefined && (!name.trim() || name.trim().length > 200)) throw new Error("Item name must be between 1 and 200 characters");
  if (quantity != null && (!Number.isFinite(quantity) || quantity <= 0)) throw new Error("Quantity must be greater than zero");
}

export const get = query({
  args: { householdId: v.optional(v.id("households")) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const householdId = await resolveHouseholdId(ctx, userId, args.householdId);
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
    validateItem(args.name, args.quantity);
    const householdId = await resolveHouseholdId(ctx, userId, args.householdId);
    if (!householdId) throw new Error("No household found");

    const shoppingList = await ctx.db
      .query("shoppingLists")
      .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
      .first();
    if (!shoppingList) throw new Error("Shopping list not found");

    const itemId = await ctx.db.insert("shoppingListItems", {
      shoppingListId: shoppingList._id,
      name: args.name.trim(),
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
    validateItem(args.name, args.quantity);
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
    if (args.name !== undefined) patch.name = args.name.trim();
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

/** Clear the confirmed selection atomically; retrying cannot delete new items. */
export const clearChecked = mutation({
  args: { ids: v.array(v.id('shoppingListItems')) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (args.ids.length > 200) throw new Error('Clear up to 200 items at a time');
    let removed = 0;
    for (const id of new Set(args.ids)) {
      const item = await ctx.db.get(id);
      if (!item) continue;
      const list = await ctx.db.get(item.shoppingListId);
      if (!list) throw new Error('Shopping list not found');
      await resolveHouseholdId(ctx, userId, list.householdId);
      // Another household member may have unchecked it since confirmation.
      if (item.checked) { await ctx.db.delete(id); removed++; }
    }
    return { removed };
  },
});

/** Purchase review and stocking happen atomically. Consumed list IDs make retries safe. */
export const stockChecked = mutation({
  args: { items: v.array(v.object({ id: v.id('shoppingListItems'), quantity: v.number(), unit: v.string(), locationId: v.id('kitchenLocations'), expiresOn: v.optional(v.string()), expectedName: v.string(), expectedQuantity: v.optional(v.number()), expectedUnit: v.optional(v.string()) })) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!args.items.length || args.items.length > 100) throw new Error('Stock between 1 and 100 purchases at a time');
    if (new Set(args.items.map(item => item.id)).size !== args.items.length) throw new Error('A purchase can only be stocked once');
    let stocked = 0;
    for (const purchase of args.items) {
      validateItem(undefined, purchase.quantity);
      if (!purchase.unit.trim() || purchase.unit.length > 80) throw new Error('Choose a unit for each purchase');
      if (purchase.expiresOn && (!/^\d{4}-\d{2}-\d{2}$/.test(purchase.expiresOn) || new Date(purchase.expiresOn).toISOString().slice(0, 10) !== purchase.expiresOn)) throw new Error('Enter a valid expiry date');
      const item = await ctx.db.get(purchase.id);
      if (!item) continue; // Already stocked/removed, including a retried request.
      const list = await ctx.db.get(item.shoppingListId);
      if (!list) throw new Error('Shopping list not found');
      await resolveHouseholdId(ctx, userId, list.householdId);
      if (!item.checked || item.name !== purchase.expectedName || item.quantity !== purchase.expectedQuantity || item.unit !== purchase.expectedUnit) throw new Error('A purchase changed while you were reviewing it. Close and reopen the review.');
      const location = await ctx.db.get(purchase.locationId);
      if (!location || location.householdId !== list.householdId) throw new Error('Choose a storage location in this kitchen');
      const food = await ctx.db.query('foodItems').withIndex('by_name', q => q.eq('name', item.name)).first();
      const foodItemId = food?._id ?? await ctx.db.insert('foodItems', { name: item.name });
      // An empty placeholder (added from a recipe before it was bought) is filled
      // in place. Otherwise separate batches preserve each purchase's expiry and location.
      const unit = purchase.unit.trim();
      const placeholder = (await ctx.db.query('inventoryItems').withIndex('by_foodItemId', q => q.eq('foodItemId', foodItemId)).collect())
        .find(row => row.householdId === list.householdId && row.quantity <= 0 && row.unit.trim().toLowerCase() === unit.toLowerCase());
      if (placeholder) await ctx.db.patch(placeholder._id, { quantity: purchase.quantity, unit, locationId: purchase.locationId, expiresOn: purchase.expiresOn, category: placeholder.category ?? item.category });
      else await ctx.db.insert('inventoryItems', { householdId: list.householdId, foodItemId, locationId: purchase.locationId, quantity: purchase.quantity, unit, expiresOn: purchase.expiresOn, category: item.category, notes: item.note });
      await ctx.db.delete(item._id);
      stocked++;
    }
    return { stocked };
  },
});

export const storageLocations = query({
  args: {},
  handler: async ctx => {
    const householdId = await resolveHouseholdId(ctx, await getAuthUserId(ctx));
    if (!householdId) return [];
    const locations = await ctx.db.query('kitchenLocations').withIndex('by_householdId', q => q.eq('householdId', householdId)).take(100);
    return locations.map(location => ({ id: location._id, name: location.name }));
  },
});
