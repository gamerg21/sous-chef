import { v } from "convex/values";
import { query, mutation, type QueryCtx, type MutationCtx } from "./_generated/server";
import { planCooking, type CookingPlan } from "../../lib/cooking-plan";
import { Doc, Id } from "./_generated/dataModel";
import {
  getAuthUserId,
  resolveHouseholdId,
  decodeIngredientMapping,
} from "./helpers";


function ingredientForPlan(ing: Doc<"recipeIngredients">) {
  const { note, mappingLabel } = decodeIngredientMapping(ing);
  return { id: ing._id, name: ing.name, quantity: ing.quantity, unit: ing.unit, note, mappingLabel };
}
async function catalogFor(ctx: QueryCtx) {
  const units = await ctx.db.query("units").take(500);
  const aliases = await ctx.db.query("unitAliases").take(2000);
  return units.filter(u => u.isEnabled).map(u => ({ labels: [u.name, u.slug, u.abbr ?? "", ...aliases.filter(a => a.unitId === u._id).map(a => a.alias)], type: u.unitType, factor: u.toBaseFactor }));
}
async function pantryFor(ctx: QueryCtx, householdId: Id<"households">) {
  const items = await ctx.db.query("inventoryItems").withIndex("by_householdId", q => q.eq("householdId", householdId)).collect();
  return Promise.all(items.map(async item => ({ id: item._id, name: (await ctx.db.get(item.foodItemId))?.name ?? "Unknown", quantity: item.quantity, unit: item.unit, expiresOn: item.expiresOn })));
}

export const whatCanICook = query({
  args: { householdId: v.optional(v.id("households")) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const householdId = await resolveHouseholdId(ctx, userId, args.householdId);
    if (!householdId) return { recipes: [], pantrySnapshot: [], suggestedTags: [] };

    const pantrySnapshot = await pantryFor(ctx, householdId);
    const catalog = await catalogFor(ctx);

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
        plan: planCooking(ingredients.map(ingredientForPlan), pantrySnapshot, catalog),
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

async function recipePlan(ctx: QueryCtx, recipeId: Id<"recipes">) {
  const userId = await getAuthUserId(ctx);
  const recipe = await ctx.db.get(recipeId);
  if (!recipe) throw new Error("Recipe not found");
  await resolveHouseholdId(ctx, userId, recipe.householdId);
  const ingredients = await ctx.db.query("recipeIngredients").withIndex("by_recipeId", q => q.eq("recipeId", recipeId)).collect();
  const stock = await pantryFor(ctx, recipe.householdId);
  return { recipe, plan: planCooking(ingredients.sort((a,b) => a.order-b.order).map(ingredientForPlan), stock, await catalogFor(ctx)) };
}

export const preview = query({
  args: { recipeId: v.id("recipes") },
  handler: async (ctx, args) => (await recipePlan(ctx, args.recipeId)).plan,
});

async function addShortages(ctx: MutationCtx, householdId: Id<"households">, recipeId: Id<"recipes">, missing: CookingPlan["missingIngredients"]) {
  const list = await ctx.db.query("shoppingLists").withIndex("by_householdId", q => q.eq("householdId", householdId)).first();
  if (!list) throw new Error("Shopping list not found");
  const existing = await ctx.db.query("shoppingListItems").withIndex("by_shoppingListId", q => q.eq("shoppingListId", list._id)).collect();
  const grouped = new Map<string, CookingPlan["missingIngredients"][number]>();
  for (const item of missing) {
    const key = JSON.stringify([item.name.toLowerCase().trim(), item.unit ?? ""]);
    const previous = grouped.get(key);
    grouped.set(key, { ...item, quantity: previous ? (previous.quantity == null || item.quantity == null ? undefined : previous.quantity + item.quantity) : item.quantity });
  }
  let added = 0;
  for (const item of grouped.values()) {
    // Repeating this action should not multiply an unchanged recipe's shopping needs.
    const matches = existing.filter(row => !row.checked && row.recipeId === recipeId && row.name.toLowerCase().trim() === item.name.toLowerCase().trim() && (row.unit ?? "") === (item.unit ?? ""));
    if (matches.length) {
      const amount = matches.reduce((sum, row) => sum + (row.quantity ?? 0), 0);
      if (item.quantity != null && amount < item.quantity) {
        await ctx.db.patch(matches[0]._id, { quantity: (matches[0].quantity ?? 0) + item.quantity - amount });
        added++;
      }
    } else {
      await ctx.db.insert("shoppingListItems", { shoppingListId: list._id, ...item, checked: false, source: "from-recipe", recipeId });
      added++;
    }
  }
  return added;
}

export const cookRecipe = mutation({
  args: { recipeId: v.id("recipes"), householdId: v.optional(v.id("households")), addMissingToShoppingList: v.optional(v.boolean()), acknowledgeManualChecks: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const { recipe, plan } = await recipePlan(ctx, args.recipeId);
    if (args.householdId && args.householdId !== recipe.householdId) throw new Error("Recipe belongs to a different kitchen");
    if (plan.checks.length && !args.acknowledgeManualChecks) throw new Error("Check the ingredient amounts and units before confirming cooking");
    for (const item of plan.deductions) {
      if (item.remaining <= 0.000001) await ctx.db.delete(item.id as Id<"inventoryItems">);
      else await ctx.db.patch(item.id as Id<"inventoryItems">, { quantity: item.remaining });
    }
    await ctx.db.patch(args.recipeId, { lastCookedAt: Date.now() });
    if (args.addMissingToShoppingList) await addShortages(ctx, recipe.householdId, args.recipeId, plan.missingIngredients);
    return { cooked: true, missingIngredients: plan.missingIngredients, manualChecks: plan.checks };
  },
});

export const addMissingToShoppingList = mutation({
  args: { recipeId: v.id("recipes") },
  handler: async (ctx, args) => {
    const { recipe, plan } = await recipePlan(ctx, args.recipeId);
    const added = await addShortages(ctx, recipe.householdId, args.recipeId, plan.missingIngredients);
    return { success: true, added, manualChecks: plan.checks.length };
  },
});
