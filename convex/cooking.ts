import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import {
  getAuthUserId,
  resolveHouseholdId,
  decodeIngredientMapping,
} from "./helpers";

export const whatCanICook = query({
  args: { householdId: v.optional(v.id("households")) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const householdId = await resolveHouseholdId(ctx, userId, args.householdId);
    if (!householdId) return { recipes: [], pantrySnapshot: [], suggestedTags: [] };

    // Get inventory for pantry snapshot
    const items = await ctx.db
      .query("inventoryItems")
      .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
      .collect();

    const pantrySnapshot = [];
    for (const item of items) {
      const foodItem = await ctx.db.get(item.foodItemId);
      pantrySnapshot.push({
        id: item._id,
        name: foodItem?.name ?? "Unknown",
        quantity: item.quantity,
        unit: item.unit,
      });
    }

    // Get recipes with ingredients
    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
      .collect();

    const transformedRecipes = [];
    const tagSet = new Set<string>();

    for (const recipe of recipes) {
      const ingredients = await ctx.db
        .query("recipeIngredients")
        .withIndex("by_recipeId", (q) => q.eq("recipeId", recipe._id))
        .collect();
      ingredients.sort((a, b) => a.order - b.order);

      const steps = await ctx.db
        .query("recipeSteps")
        .withIndex("by_recipeId", (q) => q.eq("recipeId", recipe._id))
        .collect();
      steps.sort((a, b) => a.order - b.order);

      if (recipe.tags) {
        for (const tag of recipe.tags) tagSet.add(tag);
      }

      transformedRecipes.push({
        id: recipe._id,
        title: recipe.title,
        description: recipe.description,
        photoUrl: recipe.photoUrl,
        tags: recipe.tags && recipe.tags.length > 0 ? recipe.tags : undefined,
        visibility: recipe.visibility,
        servings: recipe.servings,
        totalTimeMinutes: recipe.totalTimeMinutes,
        caloriesKcal: recipe.caloriesKcal,
        proteinGrams: recipe.proteinGrams,
        carbsGrams: recipe.carbsGrams,
        fatGrams: recipe.fatGrams,
        sourceUrl: recipe.sourceUrl,
        notes: recipe.notes,
        ingredients: ingredients.map((ing) => {
          const { note, mappingLabel } = decodeIngredientMapping(ing);
          return {
            id: ing._id,
            name: ing.name,
            quantity: ing.quantity,
            unit: ing.unit,
            note,
            mapping: mappingLabel
              ? { inventoryItemLabel: mappingLabel, suggested: false }
              : undefined,
          };
        }),
        steps: steps.map((s) => ({ id: s._id, text: s.text })),
        updatedAt: new Date(recipe._creationTime).toISOString().split("T")[0],
        lastCookedAt: recipe.lastCookedAt
          ? new Date(recipe.lastCookedAt).toISOString().split("T")[0]
          : undefined,
        favorited: recipe.favorited,
      });
    }

    return {
      recipes: transformedRecipes,
      pantrySnapshot,
      suggestedTags: [...tagSet],
    };
  },
});

export const cookRecipe = mutation({
  args: {
    recipeId: v.id("recipes"),
    householdId: v.optional(v.id("households")),
    addMissingToShoppingList: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const recipe = await ctx.db.get(args.recipeId);
    if (!recipe) throw new Error("Recipe not found");

    const householdId = recipe.householdId;
    const membership = await ctx.db
      .query("householdMembers")
      .withIndex("by_userId_and_householdId", (q) =>
        q.eq("userId", userId).eq("householdId", householdId),
      )
      .unique();
    if (!membership) throw new Error("Permission denied");

    // Get ingredients
    const ingredients = await ctx.db
      .query("recipeIngredients")
      .withIndex("by_recipeId", (q) => q.eq("recipeId", args.recipeId))
      .collect();

    // Get inventory
    const inventoryItems = await ctx.db
      .query("inventoryItems")
      .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
      .collect();

    // Build inventory name lookup
    const inventoryByName = new Map<
      string,
      Array<{ id: Id<"inventoryItems">; quantity: number; unit: string }>
    >();
    for (const item of inventoryItems) {
      const foodItem = await ctx.db.get(item.foodItemId);
      const name = (foodItem?.name ?? "").toLowerCase().trim();
      if (!inventoryByName.has(name)) inventoryByName.set(name, []);
      inventoryByName.get(name)!.push({
        id: item._id,
        quantity: item.quantity,
        unit: item.unit,
      });
    }

    // Load the unit catalog once so deduction can convert between
    // compatible units ("2 cups" from a "1 l" bottle) instead of
    // subtracting raw numbers across mismatched units.
    const allUnits = await ctx.db.query("units").take(500);
    const unitAliases = await ctx.db.query("unitAliases").take(2000);
    const unitById = new Map(allUnits.map((u) => [u._id, u]));
    const unitByLabel = new Map<string, (typeof allUnits)[number]>();
    for (const unit of allUnits) {
      if (!unit.isEnabled) continue;
      unitByLabel.set(unit.name.toLowerCase(), unit);
      if (unit.abbr) unitByLabel.set(unit.abbr.toLowerCase(), unit);
      unitByLabel.set(unit.slug.toLowerCase(), unit);
    }
    for (const alias of unitAliases) {
      const key = alias.alias.toLowerCase();
      if (!unitByLabel.has(key)) {
        const unit = unitById.get(alias.unitId);
        if (unit?.isEnabled) unitByLabel.set(key, unit);
      }
    }
    const resolveUnit = (label?: string | null) =>
      label ? (unitByLabel.get(label.trim().toLowerCase()) ?? null) : null;
    /**
     * Convert a quantity between unit labels. Returns null when the units
     * are known to be incompatible (different types) or unknown and not
     * textually equal — the caller then skips deduction rather than
     * subtracting a meaningless number.
     */
    const convertQty = (
      qty: number,
      fromLabel?: string | null,
      toLabel?: string | null,
    ): number | null => {
      const fromText = fromLabel?.trim().toLowerCase() ?? "";
      const toText = toLabel?.trim().toLowerCase() ?? "";
      // Missing or identical labels: treat as the same unit (legacy data
      // stores free-text units, and unit-less counts are common).
      if (!fromText || !toText || fromText === toText) return qty;
      const from = resolveUnit(fromText);
      const to = resolveUnit(toText);
      if (!from || !to) return null;
      if (from._id === to._id) return qty;
      if (from.unitType !== to.unitType) return null;
      if (!from.toBaseFactor || !to.toBaseFactor) return null;
      return (qty * from.toBaseFactor) / to.toBaseFactor;
    };

    const missingIngredients: Array<{ name: string; quantity?: number; unit?: string }> = [];

    // Process each ingredient
    for (const ing of ingredients) {
      const note = ing.note?.toLowerCase() ?? "";
      if (note.includes("optional") || note.includes("to taste")) continue;
      // Qualitative units ("to taste", "as needed") need no deduction.
      if (resolveUnit(ing.unit)?.unitType === "qualitative") continue;

      const label = (
        decodeIngredientMapping(ing).mappingLabel ?? ing.name
      )
        .toLowerCase()
        .trim();

      const matches = inventoryByName.get(label);
      if (!matches || matches.length === 0) {
        missingIngredients.push({
          name: ing.name,
          quantity: ing.quantity ?? undefined,
          unit: ing.unit ?? undefined,
        });
        continue;
      }

      // Deduct from inventory (needed is tracked in the ingredient's unit)
      let needed = ing.quantity ?? 1;
      for (const match of matches) {
        if (needed <= 0) break;
        // Earlier rows in this recipe may have consumed the same inventory.
        if (match.quantity <= 0.000001) continue;
        const neededInMatchUnit = convertQty(needed, ing.unit, match.unit);
        if (neededInMatchUnit === null) {
          // Incompatible or unknown units: the pantry has this item, but a
          // numeric deduction would be wrong. Assume it covers the need.
          needed = 0;
          break;
        }
        const deduct = Math.min(neededInMatchUnit, match.quantity);
        const remaining = match.quantity - deduct;
        match.quantity = remaining;
        if (remaining <= 0.000001) {
          await ctx.db.delete(match.id);
        } else {
          await ctx.db.patch(match.id, { quantity: remaining });
        }
        needed -= convertQty(deduct, match.unit, ing.unit) ?? needed;
      }

      if (needed > 0.000001) {
        missingIngredients.push({
          name: ing.name,
          quantity: Math.round(needed * 1000) / 1000,
          unit: ing.unit ?? undefined,
        });
      }
    }

    // Update lastCookedAt
    await ctx.db.patch(args.recipeId, { lastCookedAt: Date.now() });

    // Add missing to shopping list if requested
    if (args.addMissingToShoppingList && missingIngredients.length > 0) {
      const shoppingList = await ctx.db
        .query("shoppingLists")
        .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
        .first();
      if (shoppingList) {
        for (const missing of missingIngredients) {
          await ctx.db.insert("shoppingListItems", {
            shoppingListId: shoppingList._id,
            name: missing.name,
            quantity: missing.quantity,
            unit: missing.unit,
            checked: false,
            source: "from-recipe",
            recipeId: args.recipeId,
          });
        }
      }
    }

    return {
      cooked: true,
      missingIngredients,
    };
  },
});

export const addMissingToShoppingList = mutation({
  args: {
    recipeId: v.id("recipes"),
    items: v.array(
      v.object({
        name: v.string(),
        quantity: v.optional(v.number()),
        unit: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const recipe = await ctx.db.get(args.recipeId);
    if (!recipe) throw new Error("Recipe not found");

    const membership = await ctx.db
      .query("householdMembers")
      .withIndex("by_userId_and_householdId", (q) =>
        q.eq("userId", userId).eq("householdId", recipe.householdId),
      )
      .unique();
    if (!membership) throw new Error("Permission denied");

    const shoppingList = await ctx.db
      .query("shoppingLists")
      .withIndex("by_householdId", (q) => q.eq("householdId", recipe.householdId))
      .first();
    if (!shoppingList) throw new Error("Shopping list not found");

    for (const item of args.items) {
      await ctx.db.insert("shoppingListItems", {
        shoppingListId: shoppingList._id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        checked: false,
        source: "from-recipe",
        recipeId: args.recipeId,
      });
    }

    return { success: true };
  },
});
