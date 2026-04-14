import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId, getCurrentHouseholdId, locationNameToId, locationIdToName } from "./helpers";

export const list = query({
  args: { householdId: v.optional(v.id("households")) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const householdId = args.householdId ?? (await getCurrentHouseholdId(ctx, userId));
    if (!householdId) return { items: [], locations: [] };

    const items = await ctx.db
      .query("inventoryItems")
      .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
      .collect();

    const locations = await ctx.db
      .query("kitchenLocations")
      .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
      .collect();

    // Build location map
    const locMap = new Map<string, string>();
    for (const loc of locations) {
      locMap.set(loc._id, loc.name);
    }

    // Deduplicate locations by type for the UI
    const seenTypes = new Set<string>();
    const uiLocations = [];
    for (const loc of locations) {
      const locId = locationNameToId(loc.name);
      if (!seenTypes.has(locId)) {
        seenTypes.add(locId);
        uiLocations.push({
          id: locId,
          householdId: String(loc.householdId),
          name: loc.name,
        });
      }
    }

    // Get barcode data for items that have barcodes
    const barcodeCodes = [
      ...new Set(items.map((i) => i.barcode).filter(Boolean) as string[]),
    ];
    const barcodeMap = new Map<string, Record<string, unknown>>();
    for (const code of barcodeCodes) {
      const barcode = await ctx.db
        .query("barcodes")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first();
      if (barcode) {
        barcodeMap.set(code, {
          brand: barcode.brand,
          categoriesTags: barcode.categoriesTags,
          ingredientsText: barcode.ingredientsText,
          allergensTags: barcode.allergensTags,
          nutriscoreGrade: barcode.nutriscoreGrade,
          novaGroup: barcode.novaGroup,
          ecoscoreGrade: barcode.ecoscoreGrade,
          imageFrontUrl: barcode.imageFrontUrl,
          nutritionPer100g: barcode.nutritionPer100g,
        });
      }
    }

    const transformed = [];
    for (const item of items) {
      const foodItem = await ctx.db.get(item.foodItemId);
      const locName = locMap.get(item.locationId as string) ?? "Pantry";
      transformed.push({
        id: item._id,
        name: foodItem?.name ?? "Unknown",
        locationId: locationNameToId(locName),
        quantity: item.quantity,
        unit: item.unit,
        expiresOn: item.expiresOn ?? undefined,
        category: item.category ?? undefined,
        notes: item.notes ?? undefined,
        photoUrl: item.photoUrl ?? undefined,
        barcode: item.barcode ?? undefined,
        foodFacts: item.barcode ? barcodeMap.get(item.barcode) : undefined,
      });
    }

    return { items: transformed, locations: uiLocations };
  },
});

export const create = mutation({
  args: {
    householdId: v.optional(v.id("households")),
    name: v.string(),
    locationId: v.string(),
    quantity: v.number(),
    unit: v.string(),
    expiresOn: v.optional(v.string()),
    category: v.optional(v.string()),
    notes: v.optional(v.string()),
    barcode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const householdId = args.householdId ?? (await getCurrentHouseholdId(ctx, userId));
    if (!householdId) throw new Error("No household found");

    // Find or create FoodItem
    const existingFood = await ctx.db
      .query("foodItems")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();

    const foodItemId =
      existingFood?._id ??
      (await ctx.db.insert("foodItems", { name: args.name }));

    // Find location
    const locName = locationIdToName(args.locationId);
    const location = await ctx.db
      .query("kitchenLocations")
      .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
      .filter((q) => q.eq(q.field("name"), locName))
      .first();

    if (!location) throw new Error("Invalid location");

    const itemId = await ctx.db.insert("inventoryItems", {
      householdId,
      foodItemId,
      locationId: location._id,
      quantity: args.quantity,
      unit: args.unit,
      expiresOn: args.expiresOn,
      category: args.category,
      notes: args.notes,
      barcode: args.barcode,
    });

    return {
      id: itemId,
      name: args.name,
      locationId: args.locationId,
      quantity: args.quantity,
      unit: args.unit,
      expiresOn: args.expiresOn,
      category: args.category,
      notes: args.notes,
      barcode: args.barcode,
    };
  },
});

export const update = mutation({
  args: {
    id: v.id("inventoryItems"),
    name: v.optional(v.string()),
    locationId: v.optional(v.string()),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    expiresOn: v.optional(v.union(v.string(), v.null())),
    category: v.optional(v.union(v.string(), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
    photoUrl: v.optional(v.union(v.string(), v.null())),
    barcode: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const item = await ctx.db.get(args.id);
    if (!item) throw new Error("Item not found");

    // Verify household membership
    const householdId = item.householdId;
    const membership = await ctx.db
      .query("householdMembers")
      .withIndex("by_userId_and_householdId", (q) =>
        q.eq("userId", userId).eq("householdId", householdId),
      )
      .unique();
    if (!membership) throw new Error("Permission denied");

    const patch: Record<string, unknown> = {};

    if (args.name !== undefined) {
      // Update or create food item
      const existingFood = await ctx.db
        .query("foodItems")
        .withIndex("by_name", (q) => q.eq("name", args.name!))
        .first();
      const foodItemId =
        existingFood?._id ??
        (await ctx.db.insert("foodItems", { name: args.name! }));
      patch.foodItemId = foodItemId;
    }

    if (args.locationId !== undefined) {
      const locName = locationIdToName(args.locationId);
      const location = await ctx.db
        .query("kitchenLocations")
        .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
        .filter((q) => q.eq(q.field("name"), locName))
        .first();
      if (location) patch.locationId = location._id;
    }

    if (args.quantity !== undefined) patch.quantity = args.quantity;
    if (args.unit !== undefined) patch.unit = args.unit;
    if (args.expiresOn !== undefined)
      patch.expiresOn = args.expiresOn ?? undefined;
    if (args.category !== undefined)
      patch.category = args.category ?? undefined;
    if (args.notes !== undefined) patch.notes = args.notes ?? undefined;
    if (args.photoUrl !== undefined)
      patch.photoUrl = args.photoUrl ?? undefined;
    if (args.barcode !== undefined) patch.barcode = args.barcode ?? undefined;

    await ctx.db.patch(args.id, patch);
    return { success: true };
  },
});

export const remove = mutation({
  args: { id: v.id("inventoryItems") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const item = await ctx.db.get(args.id);
    if (!item) throw new Error("Item not found");

    const membership = await ctx.db
      .query("householdMembers")
      .withIndex("by_userId_and_householdId", (q) =>
        q.eq("userId", userId).eq("householdId", item.householdId),
      )
      .unique();
    if (!membership) throw new Error("Permission denied");

    await ctx.db.delete(args.id);
    return { success: true };
  },
});
