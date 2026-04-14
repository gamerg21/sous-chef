import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId, getCurrentHouseholdId } from "./helpers";

export const list = query({
  args: { householdId: v.optional(v.id("households")) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const householdId = args.householdId ?? (await getCurrentHouseholdId(ctx, userId));
    if (!householdId) return { recipes: [] };

    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
      .collect();

    // Sort by _creationTime desc (most recent first)
    recipes.sort((a, b) => b._creationTime - a._creationTime);

    const transformed = [];
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

      transformed.push({
        id: recipe._id,
        title: recipe.title,
        description: recipe.description,
        photoUrl: recipe.photoUrl,
        tags: recipe.tags && recipe.tags.length > 0 ? recipe.tags : undefined,
        visibility: recipe.visibility as "private" | "household",
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
          note:
            ing.note && !ing.note.startsWith("MAPPING:") ? ing.note : undefined,
          mapping:
            ing.note && ing.note.startsWith("MAPPING:")
              ? {
                  inventoryItemLabel: ing.note.replace("MAPPING:", "").trim(),
                  suggested: false,
                }
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

    return { recipes: transformed };
  },
});

export const getById = query({
  args: { id: v.id("recipes") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const recipe = await ctx.db.get(args.id);
    if (!recipe) throw new Error("Recipe not found");

    // Verify access
    const membership = await ctx.db
      .query("householdMembers")
      .withIndex("by_userId_and_householdId", (q) =>
        q.eq("userId", userId).eq("householdId", recipe.householdId),
      )
      .unique();
    if (!membership) throw new Error("Permission denied");

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

    return {
      id: recipe._id,
      title: recipe.title,
      description: recipe.description,
      photoUrl: recipe.photoUrl,
      tags: recipe.tags && recipe.tags.length > 0 ? recipe.tags : undefined,
      visibility: recipe.visibility as "private" | "household",
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
        note:
          ing.note && !ing.note.startsWith("MAPPING:") ? ing.note : undefined,
        mapping:
          ing.note && ing.note.startsWith("MAPPING:")
            ? {
                inventoryItemLabel: ing.note.replace("MAPPING:", "").trim(),
                suggested: false,
              }
            : undefined,
      })),
      steps: steps.map((s) => ({ id: s._id, text: s.text })),
      updatedAt: new Date(recipe._creationTime).toISOString().split("T")[0],
      lastCookedAt: recipe.lastCookedAt
        ? new Date(recipe.lastCookedAt).toISOString().split("T")[0]
        : undefined,
      favorited: recipe.favorited,
    };
  },
});

export const create = mutation({
  args: {
    householdId: v.optional(v.id("households")),
    title: v.string(),
    description: v.optional(v.string()),
    photoUrl: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    visibility: v.optional(v.string()),
    servings: v.optional(v.number()),
    totalTimeMinutes: v.optional(v.number()),
    caloriesKcal: v.optional(v.number()),
    proteinGrams: v.optional(v.number()),
    carbsGrams: v.optional(v.number()),
    fatGrams: v.optional(v.number()),
    sourceUrl: v.optional(v.string()),
    notes: v.optional(v.string()),
    ingredients: v.array(
      v.object({
        name: v.string(),
        quantity: v.optional(v.number()),
        unit: v.optional(v.string()),
        note: v.optional(v.string()),
        mapping: v.optional(
          v.object({
            inventoryItemLabel: v.string(),
            locationHint: v.optional(v.string()),
            suggested: v.optional(v.boolean()),
          }),
        ),
      }),
    ),
    steps: v.array(v.object({ text: v.string() })),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const householdId = args.householdId ?? (await getCurrentHouseholdId(ctx, userId));
    if (!householdId) throw new Error("No household found");

    const recipeId = await ctx.db.insert("recipes", {
      householdId,
      title: args.title,
      description: args.description,
      photoUrl: args.photoUrl,
      tags: args.tags,
      visibility: args.visibility ?? "private",
      servings: args.servings,
      totalTimeMinutes: args.totalTimeMinutes,
      caloriesKcal: args.caloriesKcal,
      proteinGrams: args.proteinGrams,
      carbsGrams: args.carbsGrams,
      fatGrams: args.fatGrams,
      sourceUrl: args.sourceUrl,
      notes: args.notes,
      favorited: false,
    });

    for (let i = 0; i < args.ingredients.length; i++) {
      const ing = args.ingredients[i];
      await ctx.db.insert("recipeIngredients", {
        recipeId,
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        note: ing.mapping
          ? `MAPPING:${ing.mapping.inventoryItemLabel}`
          : ing.note,
        order: i,
      });
    }

    for (let i = 0; i < args.steps.length; i++) {
      await ctx.db.insert("recipeSteps", {
        recipeId,
        text: args.steps[i].text,
        order: i,
      });
    }

    return recipeId;
  },
});

export const update = mutation({
  args: {
    id: v.id("recipes"),
    title: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    photoUrl: v.optional(v.union(v.string(), v.null())),
    tags: v.optional(v.array(v.string())),
    visibility: v.optional(v.string()),
    servings: v.optional(v.union(v.number(), v.null())),
    totalTimeMinutes: v.optional(v.union(v.number(), v.null())),
    caloriesKcal: v.optional(v.union(v.number(), v.null())),
    proteinGrams: v.optional(v.union(v.number(), v.null())),
    carbsGrams: v.optional(v.union(v.number(), v.null())),
    fatGrams: v.optional(v.union(v.number(), v.null())),
    sourceUrl: v.optional(v.union(v.string(), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
    ingredients: v.optional(
      v.array(
        v.object({
          name: v.string(),
          quantity: v.optional(v.number()),
          unit: v.optional(v.string()),
          note: v.optional(v.string()),
          mapping: v.optional(
            v.object({
              inventoryItemLabel: v.string(),
              locationHint: v.optional(v.string()),
              suggested: v.optional(v.boolean()),
            }),
          ),
        }),
      ),
    ),
    steps: v.optional(v.array(v.object({ text: v.string() }))),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const recipe = await ctx.db.get(args.id);
    if (!recipe) throw new Error("Recipe not found");

    const membership = await ctx.db
      .query("householdMembers")
      .withIndex("by_userId_and_householdId", (q) =>
        q.eq("userId", userId).eq("householdId", recipe.householdId),
      )
      .unique();
    if (!membership) throw new Error("Permission denied");

    const patch: Record<string, unknown> = {};
    if (args.title !== undefined) patch.title = args.title;
    if (args.description !== undefined)
      patch.description = args.description ?? undefined;
    if (args.photoUrl !== undefined)
      patch.photoUrl = args.photoUrl ?? undefined;
    if (args.tags !== undefined) patch.tags = args.tags;
    if (args.visibility !== undefined) patch.visibility = args.visibility;
    if (args.servings !== undefined)
      patch.servings = args.servings ?? undefined;
    if (args.totalTimeMinutes !== undefined)
      patch.totalTimeMinutes = args.totalTimeMinutes ?? undefined;
    if (args.caloriesKcal !== undefined)
      patch.caloriesKcal = args.caloriesKcal ?? undefined;
    if (args.proteinGrams !== undefined)
      patch.proteinGrams = args.proteinGrams ?? undefined;
    if (args.carbsGrams !== undefined)
      patch.carbsGrams = args.carbsGrams ?? undefined;
    if (args.fatGrams !== undefined)
      patch.fatGrams = args.fatGrams ?? undefined;
    if (args.sourceUrl !== undefined)
      patch.sourceUrl = args.sourceUrl ?? undefined;
    if (args.notes !== undefined) patch.notes = args.notes ?? undefined;

    await ctx.db.patch(args.id, patch);

    // Replace ingredients if provided
    if (args.ingredients) {
      const oldIngs = await ctx.db
        .query("recipeIngredients")
        .withIndex("by_recipeId", (q) => q.eq("recipeId", args.id))
        .collect();
      for (const old of oldIngs) await ctx.db.delete(old._id);

      for (let i = 0; i < args.ingredients.length; i++) {
        const ing = args.ingredients[i];
        await ctx.db.insert("recipeIngredients", {
          recipeId: args.id,
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          note: ing.mapping
            ? `MAPPING:${ing.mapping.inventoryItemLabel}`
            : ing.note,
          order: i,
        });
      }
    }

    // Replace steps if provided
    if (args.steps) {
      const oldSteps = await ctx.db
        .query("recipeSteps")
        .withIndex("by_recipeId", (q) => q.eq("recipeId", args.id))
        .collect();
      for (const old of oldSteps) await ctx.db.delete(old._id);

      for (let i = 0; i < args.steps.length; i++) {
        await ctx.db.insert("recipeSteps", {
          recipeId: args.id,
          text: args.steps[i].text,
          order: i,
        });
      }
    }

    return { success: true };
  },
});

export const remove = mutation({
  args: { id: v.id("recipes") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const recipe = await ctx.db.get(args.id);
    if (!recipe) throw new Error("Recipe not found");

    const membership = await ctx.db
      .query("householdMembers")
      .withIndex("by_userId_and_householdId", (q) =>
        q.eq("userId", userId).eq("householdId", recipe.householdId),
      )
      .unique();
    if (!membership) throw new Error("Permission denied");

    // Delete related data
    const ings = await ctx.db
      .query("recipeIngredients")
      .withIndex("by_recipeId", (q) => q.eq("recipeId", args.id))
      .collect();
    for (const ing of ings) await ctx.db.delete(ing._id);

    const steps = await ctx.db
      .query("recipeSteps")
      .withIndex("by_recipeId", (q) => q.eq("recipeId", args.id))
      .collect();
    for (const s of steps) await ctx.db.delete(s._id);

    // Delete community data
    const likes = await ctx.db
      .query("communityRecipeLikes")
      .withIndex("by_recipeId", (q) => q.eq("recipeId", args.id))
      .collect();
    for (const l of likes) await ctx.db.delete(l._id);

    const saves = await ctx.db
      .query("communityRecipeSaves")
      .withIndex("by_recipeId", (q) => q.eq("recipeId", args.id))
      .collect();
    for (const s of saves) await ctx.db.delete(s._id);

    await ctx.db.delete(args.id);
    return { success: true };
  },
});

export const toggleFavorite = mutation({
  args: { id: v.id("recipes") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const recipe = await ctx.db.get(args.id);
    if (!recipe) throw new Error("Recipe not found");

    const membership = await ctx.db
      .query("householdMembers")
      .withIndex("by_userId_and_householdId", (q) =>
        q.eq("userId", userId).eq("householdId", recipe.householdId),
      )
      .unique();
    if (!membership) throw new Error("Permission denied");

    await ctx.db.patch(args.id, { favorited: !recipe.favorited });
    return { favorited: !recipe.favorited };
  },
});
