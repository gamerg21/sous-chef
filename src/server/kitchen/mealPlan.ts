import { v } from "convex/values";
import { query, mutation, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getAuthUserId, resolveHouseholdId } from "./helpers";
import { mealSlot } from "./schema";
import { catalogFor, cookRecipeInTransaction, pantryFor, recipeIngredientsForPlan } from "./cooking";
import { mergeShortagesIntoList } from "./shoppingList";
import { planCooking, planShortages } from "../../lib/cooking-plan";

// A meal plan entry puts a recipe on a day and meal slot. Readiness, shortages
// and cooking all go through the same planner and cook mutation as the Cook page.

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function validateDate(date: string) {
  if (!DAY.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error("Enter a valid date");
}

function validateEntry(fields: { servings?: number | null; note?: string | null }) {
  if (fields.servings != null && (!Number.isFinite(fields.servings) || fields.servings <= 0 || fields.servings > 100)) throw new Error("Servings must be between 1 and 100");
  if (fields.note != null && fields.note.length > 500) throw new Error("Keep the note under 500 characters");
}

/** The days from `from`, `days` long, as YYYY-MM-DD strings (calendar days, no time zone). */
function dayRange(from: string, days = 7) {
  validateDate(from);
  if (!Number.isInteger(days) || days < 1 || days > 42) throw new Error("Choose between 1 and 42 days");
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + days);
  return { from, to: end.toISOString().slice(0, 10) };
}

async function entriesBetween(ctx: QueryCtx, householdId: Id<"households">, range?: { from: string; to: string }) {
  const entries = await ctx.db.query("mealPlanEntries").withIndex("by_householdId_and_date", q => q.eq("householdId", householdId)).take(5000);
  return range ? entries.filter(entry => entry.date >= range.from && entry.date < range.to) : entries;
}

/** Recipe amounts scale by planned servings over the recipe's own servings. */
function scaleFor(entry: Doc<"mealPlanEntries">, recipe: Doc<"recipes"> | null) {
  return entry.servings && recipe?.servings ? entry.servings / recipe.servings : 1;
}

async function entryWithAccess(ctx: QueryCtx, id: Id<"mealPlanEntries">) {
  const userId = await getAuthUserId(ctx);
  const entry = await ctx.db.get(id);
  if (!entry) throw new Error("Planned meal not found");
  await resolveHouseholdId(ctx, userId, entry.householdId);
  return entry;
}

const slotOrder = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 } as const;

function summary(entry: Doc<"mealPlanEntries">, recipe: Doc<"recipes"> | null) {
  return {
    id: entry._id,
    date: entry.date,
    slot: entry.slot,
    recipeId: entry.recipeId,
    recipeTitle: recipe?.title ?? "Deleted recipe",
    recipeServings: recipe?.servings,
    photoUrl: recipe?.photoUrl,
    totalTimeMinutes: recipe?.totalTimeMinutes,
    servings: entry.servings,
    note: entry.note,
    cooked: entry.cookedAt != null,
    cookedAt: entry.cookedAt,
  };
}

/** Planned meals for a stretch of days (a week by default), each with its pantry readiness. */
export const week = query({
  args: { householdId: v.optional(v.id("households")), from: v.string(), days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const householdId = await resolveHouseholdId(ctx, userId, args.householdId);
    const range = dayRange(args.from, args.days);
    if (!householdId) return { ...range, entries: [], recipes: [] };
    const entries = (await entriesBetween(ctx, householdId, range))
      .sort((a, b) => a.date.localeCompare(b.date) || slotOrder[a.slot] - slotOrder[b.slot] || a._creationTime - b._creationTime);
    const stock = await pantryFor(ctx, householdId);
    const catalog = await catalogFor(ctx);
    const result = [];
    for (const entry of entries) {
      const recipe = await ctx.db.get(entry.recipeId);
      // Readiness against today's pantry, as on the Cook page.
      const plan = recipe ? planCooking(await recipeIngredientsForPlan(ctx, recipe._id, scaleFor(entry, recipe)), stock, catalog) : undefined;
      result.push({ ...summary(entry, recipe), plan });
    }
    const recipes = (await ctx.db.query("recipes").withIndex("by_householdId", q => q.eq("householdId", householdId)).collect())
      .map(recipe => ({ id: recipe._id, title: recipe.title, servings: recipe.servings, favorited: recipe.favorited }))
      .sort((a, b) => a.title.localeCompare(b.title));
    return { ...range, entries: result, recipes };
  },
});

/** Every planned meal (or those in a range), without readiness; used by the iOS companion sync. */
export const list = query({
  args: { householdId: v.optional(v.id("households")), from: v.optional(v.string()), to: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const householdId = await resolveHouseholdId(ctx, userId, args.householdId);
    if (!householdId) return { entries: [] };
    if (args.from) validateDate(args.from);
    if (args.to) validateDate(args.to);
    const entries = await entriesBetween(ctx, householdId, args.from || args.to ? { from: args.from ?? "0000-01-01", to: args.to ?? "9999-12-31" } : undefined);
    return { entries: await Promise.all(entries.map(async entry => summary(entry, await ctx.db.get(entry.recipeId)))) };
  },
});

export const add = mutation({
  args: {
    householdId: v.optional(v.id("households")),
    date: v.string(),
    slot: v.optional(mealSlot),
    recipeId: v.id("recipes"),
    servings: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    validateDate(args.date);
    validateEntry(args);
    const recipe = await ctx.db.get(args.recipeId);
    if (!recipe) throw new Error("Recipe not found");
    // Membership of the recipe's kitchen is required, and the plan lives there too.
    await resolveHouseholdId(ctx, userId, recipe.householdId);
    if (args.householdId && args.householdId !== recipe.householdId) throw new Error("Recipe belongs to a different kitchen");
    const id = await ctx.db.insert("mealPlanEntries", {
      householdId: recipe.householdId,
      date: args.date,
      slot: args.slot ?? "dinner",
      recipeId: args.recipeId,
      servings: args.servings ?? recipe.servings,
      note: args.note?.trim() || undefined,
    });
    return { id };
  },
});

export const update = mutation({
  args: {
    id: v.id("mealPlanEntries"),
    date: v.optional(v.string()),
    slot: v.optional(mealSlot),
    servings: v.optional(v.union(v.number(), v.null())),
    note: v.optional(v.union(v.string(), v.null())),
    // Marks a meal cooked (or not) without touching the pantry, e.g. eaten out.
    cooked: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const entry = await entryWithAccess(ctx, args.id);
    if (args.date !== undefined) validateDate(args.date);
    validateEntry(args);
    const patch: Partial<Doc<"mealPlanEntries">> = {};
    if (args.date !== undefined) patch.date = args.date;
    if (args.slot !== undefined) patch.slot = args.slot;
    if (args.servings !== undefined) patch.servings = args.servings ?? undefined;
    if (args.note !== undefined) patch.note = args.note?.trim() || undefined;
    if (args.cooked !== undefined) patch.cookedAt = args.cooked ? entry.cookedAt ?? Date.now() : undefined;
    await ctx.db.patch(entry._id, patch);
    return { success: true };
  },
});

export const remove = mutation({
  args: { id: v.id("mealPlanEntries") },
  handler: async (ctx, args) => {
    const entry = await entryWithAccess(ctx, args.id);
    await ctx.db.delete(entry._id);
    return { success: true };
  },
});

/** Cooks a planned meal through the Cook page's deduction and marks it cooked, in one transaction. */
export const cook = mutation({
  args: { id: v.id("mealPlanEntries"), addMissingToShoppingList: v.optional(v.boolean()), acknowledgeManualChecks: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const entry = await entryWithAccess(ctx, args.id);
    // A retried request must not deduct the pantry twice.
    if (entry.cookedAt != null) throw new Error("This meal is already marked cooked");
    const recipe = await ctx.db.get(entry.recipeId);
    if (!recipe) throw new Error("Recipe not found");
    const result = await cookRecipeInTransaction(ctx, {
      recipeId: entry.recipeId,
      householdId: entry.householdId,
      addMissingToShoppingList: args.addMissingToShoppingList,
      acknowledgeManualChecks: args.acknowledgeManualChecks,
      scale: scaleFor(entry, recipe),
    });
    await ctx.db.patch(entry._id, { cookedAt: Date.now() });
    return result;
  },
});

async function weekShortagesFor(ctx: QueryCtx, userId: Id<"users">, args: { householdId?: Id<"households">; from: string; days?: number }) {
  const householdId = await resolveHouseholdId(ctx, userId, args.householdId);
  const range = dayRange(args.from, args.days);
  if (!householdId) return { householdId, ...range, meals: 0, missingIngredients: [], checks: [], catalog: [] };
  const entries = (await entriesBetween(ctx, householdId, range)).filter(entry => entry.cookedAt == null);
  const recipes = [];
  for (const entry of entries) {
    const recipe = await ctx.db.get(entry.recipeId);
    if (recipe) recipes.push(await recipeIngredientsForPlan(ctx, recipe._id, scaleFor(entry, recipe)));
  }
  const catalog = await catalogFor(ctx);
  // One pass over the pantry for every meal, so stock is only counted once.
  const plan = planShortages(recipes, await pantryFor(ctx, householdId), catalog);
  return { householdId, ...range, meals: recipes.length, ...plan, catalog };
}

const weekArgs = { householdId: v.optional(v.id("households")), from: v.string(), days: v.optional(v.number()) };

/** What the week's uncooked meals need beyond the pantry, combined per food and unit. */
export const weekShortages = query({
  args: weekArgs,
  handler: async (ctx, args) => {
    const { from, to, meals, missingIngredients, checks } = await weekShortagesFor(ctx, await getAuthUserId(ctx), args);
    return { from, to, meals, missingIngredients, checks };
  },
});

export const addWeekShortagesToShoppingList = mutation({
  args: weekArgs,
  handler: async (ctx, args) => {
    const shortages = await weekShortagesFor(ctx, await getAuthUserId(ctx), args);
    if (!shortages.householdId) throw new Error("No household found");
    const { added, updated } = await mergeShortagesIntoList(ctx, shortages.householdId, shortages.missingIngredients, shortages.catalog);
    return { added, updated, shortages: shortages.missingIngredients.length, manualChecks: shortages.checks.length, meals: shortages.meals };
  },
});
