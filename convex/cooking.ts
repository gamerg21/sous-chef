import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId, getCurrentHouseholdId, locationNameToId } from "./helpers";

export const whatCanICook = query({
  args: { householdId: v.optional(v.id("households")) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const householdId = args.householdId ?? (await getCurrentHouseholdId(ctx, userId));
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
        ingredients: ingredients.map((ing) => ({
          id: ing._id,
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          note: ing.note && !ing.note.startsWith("MAPPING:") ? ing.note : undefined,
          mapping: ing.note && ing.note.startsWith("MAPPING:")
            ? { inventoryItemLabel: ing.note.replace("MAPPING:", "").trim(), suggested: false }
            : undefined,
        })),
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
    const inventoryByName = new Map<string, Array<{ id: string; quantity: number; unit: string; foodItemId: string }>>();
    for (const item of inventoryItems) {
      const foodItem = await ctx.db.get(item.foodItemId);
      const name = (foodItem?.name ?? "").toLowerCase().trim();
      if (!inventoryByName.has(name)) inventoryByName.set(name, []);
      inventoryByName.get(name)!.push({
        id: item._id as string,
        quantity: item.quantity,
        unit: item.unit,
        foodItemId: item.foodItemId as string,
      });
    }

    const missingIngredients: Array<{ name: string; quantity?: number; unit?: string }> = [];

    // Process each ingredient
    for (const ing of ingredients) {
      const note = ing.note?.toLowerCase() ?? "";
      if (note.includes("optional") || note.includes("to taste")) continue;

      const label = ing.note?.startsWith("MAPPING:")
        ? ing.note.replace("MAPPING:", "").trim().toLowerCase()
        : ing.name.toLowerCase().trim();

      const matches = inventoryByName.get(label);
      if (!matches || matches.length === 0) {
        missingIngredients.push({
          name: ing.name,
          quantity: ing.quantity ?? undefined,
          unit: ing.unit ?? undefined,
        });
        continue;
      }

      // Deduct from inventory
      let needed = ing.quantity ?? 1;
      for (const match of matches) {
        if (needed <= 0) break;
        const deduct = Math.min(needed, match.quantity);
        const remaining = match.quantity - deduct;
        if (remaining <= 0) {
          await ctx.db.delete(match.id as any);
        } else {
          await ctx.db.patch(match.id as any, { quantity: remaining });
        }
        needed -= deduct;
      }

      if (needed > 0) {
        missingIngredients.push({
          name: ing.name,
          quantity: needed,
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
