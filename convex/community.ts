import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId, getCurrentHouseholdId } from "./helpers";

export const listRecipes = query({
  args: {
    search: v.optional(v.string()),
    tag: v.optional(v.string()),
    sort: v.optional(v.string()),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const limit = args.limit ?? 20;
    const offset = args.offset ?? 0;

    // Get public/unlisted recipes
    let recipes = await ctx.db
      .query("recipes")
      .withIndex("by_visibility", (q) => q.eq("visibility", "public"))
      .collect();

    const unlistedRecipes = await ctx.db
      .query("recipes")
      .withIndex("by_visibility", (q) => q.eq("visibility", "unlisted"))
      .collect();
    recipes = [...recipes, ...unlistedRecipes];

    // Filter by search term
    if (args.search) {
      const search = args.search.toLowerCase();
      recipes = recipes.filter(
        (r) =>
          r.title.toLowerCase().includes(search) ||
          r.description?.toLowerCase().includes(search),
      );
    }

    // Filter by tag
    if (args.tag) {
      const tag = args.tag.toLowerCase();
      recipes = recipes.filter((r) =>
        r.tags?.some((t) => t.toLowerCase() === tag),
      );
    }

    // Sort
    if (args.sort === "popular" || args.sort === "trending") {
      // Sort by likes count (computed below)
    } else {
      // Default: most recent
      recipes.sort((a, b) => b._creationTime - a._creationTime);
    }

    // Build response with author info and counts
    const transformed = [];
    for (const recipe of recipes) {
      // Get author (owner of the household)
      const ownerMembership = await ctx.db
        .query("householdMembers")
        .withIndex("by_householdId", (q) => q.eq("householdId", recipe.householdId))
        .filter((q) => q.eq(q.field("role"), "owner"))
        .first();
      const author = ownerMembership
        ? await ctx.db.get(ownerMembership.userId)
        : null;

      const likes = await ctx.db
        .query("communityRecipeLikes")
        .withIndex("by_recipeId", (q) => q.eq("recipeId", recipe._id))
        .collect();

      const saves = await ctx.db
        .query("communityRecipeSaves")
        .withIndex("by_recipeId", (q) => q.eq("recipeId", recipe._id))
        .collect();

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
        tags: recipe.tags,
        servings: recipe.servings,
        totalTimeMinutes: recipe.totalTimeMinutes,
        caloriesKcal: recipe.caloriesKcal,
        proteinGrams: recipe.proteinGrams,
        carbsGrams: recipe.carbsGrams,
        fatGrams: recipe.fatGrams,
        sourceUrl: recipe.sourceUrl,
        ingredients: ingredients.map((i) => ({
          id: i._id,
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          note: i.note && !i.note.startsWith("MAPPING:") ? i.note : undefined,
        })),
        steps: steps.map((s) => ({ id: s._id, text: s.text })),
        author: {
          id: author?._id ?? "",
          name: author?.name ?? "Anonymous",
          avatarUrl: author?.image ?? undefined,
        },
        likes: likes.length,
        savedCount: saves.length,
        createdAt: new Date(recipe._creationTime).toISOString(),
        _likesCount: likes.length,
      });
    }

    // Sort by popular if needed
    if (args.sort === "popular" || args.sort === "trending") {
      transformed.sort((a, b) => b._likesCount - a._likesCount);
    }

    // Paginate
    const paginated = transformed.slice(offset, offset + limit);

    return {
      recipes: paginated.map(({ _likesCount, ...r }) => r),
    };
  },
});

export const getRecipe = query({
  args: { id: v.id("recipes") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const recipe = await ctx.db.get(args.id);
    if (!recipe) throw new Error("Recipe not found");
    if (recipe.visibility !== "public" && recipe.visibility !== "unlisted") {
      throw new Error("Recipe not publicly available");
    }

    const ownerMembership = await ctx.db
      .query("householdMembers")
      .withIndex("by_householdId", (q) => q.eq("householdId", recipe.householdId))
      .filter((q) => q.eq(q.field("role"), "owner"))
      .first();
    const author = ownerMembership
      ? await ctx.db.get(ownerMembership.userId)
      : null;

    const likes = await ctx.db
      .query("communityRecipeLikes")
      .withIndex("by_recipeId", (q) => q.eq("recipeId", recipe._id))
      .collect();
    const saves = await ctx.db
      .query("communityRecipeSaves")
      .withIndex("by_recipeId", (q) => q.eq("recipeId", recipe._id))
      .collect();

    const userLike = await ctx.db
      .query("communityRecipeLikes")
      .withIndex("by_recipeId_and_userId", (q) =>
        q.eq("recipeId", recipe._id).eq("userId", userId),
      )
      .unique();
    const userSave = await ctx.db
      .query("communityRecipeSaves")
      .withIndex("by_recipeId_and_userId", (q) =>
        q.eq("recipeId", recipe._id).eq("userId", userId),
      )
      .unique();

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
      tags: recipe.tags,
      servings: recipe.servings,
      totalTimeMinutes: recipe.totalTimeMinutes,
      caloriesKcal: recipe.caloriesKcal,
      proteinGrams: recipe.proteinGrams,
      carbsGrams: recipe.carbsGrams,
      fatGrams: recipe.fatGrams,
      sourceUrl: recipe.sourceUrl,
      ingredients: ingredients.map((i) => ({
        id: i._id,
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        note: i.note && !i.note.startsWith("MAPPING:") ? i.note : undefined,
      })),
      steps: steps.map((s) => ({ id: s._id, text: s.text })),
      author: {
        id: author?._id ?? "",
        name: author?.name ?? "Anonymous",
        avatarUrl: author?.image ?? undefined,
      },
      likes: likes.length,
      savedCount: saves.length,
      isLiked: !!userLike,
      isSaved: !!userSave,
      createdAt: new Date(recipe._creationTime).toISOString(),
    };
  },
});

export const publishRecipe = mutation({
  args: { recipeId: v.id("recipes") },
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

    await ctx.db.patch(args.recipeId, { visibility: "public" });
    return { success: true };
  },
});

export const likeRecipe = mutation({
  args: { recipeId: v.id("recipes") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    const existing = await ctx.db
      .query("communityRecipeLikes")
      .withIndex("by_recipeId_and_userId", (q) =>
        q.eq("recipeId", args.recipeId).eq("userId", userId),
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { liked: false };
    }

    await ctx.db.insert("communityRecipeLikes", {
      recipeId: args.recipeId,
      userId,
    });
    return { liked: true };
  },
});

export const saveRecipe = mutation({
  args: { recipeId: v.id("recipes") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const householdId = await getCurrentHouseholdId(ctx, userId);
    if (!householdId) throw new Error("No household found");

    // Copy recipe to user's household
    const sourceRecipe = await ctx.db.get(args.recipeId);
    if (!sourceRecipe) throw new Error("Recipe not found");

    const newRecipeId = await ctx.db.insert("recipes", {
      householdId,
      title: sourceRecipe.title,
      description: sourceRecipe.description,
      photoUrl: sourceRecipe.photoUrl,
      tags: sourceRecipe.tags,
      visibility: "private",
      servings: sourceRecipe.servings,
      totalTimeMinutes: sourceRecipe.totalTimeMinutes,
      caloriesKcal: sourceRecipe.caloriesKcal,
      proteinGrams: sourceRecipe.proteinGrams,
      carbsGrams: sourceRecipe.carbsGrams,
      fatGrams: sourceRecipe.fatGrams,
      sourceUrl: sourceRecipe.sourceUrl,
      notes: sourceRecipe.notes,
      favorited: false,
    });

    // Copy ingredients
    const ings = await ctx.db
      .query("recipeIngredients")
      .withIndex("by_recipeId", (q) => q.eq("recipeId", args.recipeId))
      .collect();
    for (const ing of ings) {
      await ctx.db.insert("recipeIngredients", {
        recipeId: newRecipeId,
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        note: ing.note,
        order: ing.order,
      });
    }

    // Copy steps
    const steps = await ctx.db
      .query("recipeSteps")
      .withIndex("by_recipeId", (q) => q.eq("recipeId", args.recipeId))
      .collect();
    for (const step of steps) {
      await ctx.db.insert("recipeSteps", {
        recipeId: newRecipeId,
        text: step.text,
        order: step.order,
      });
    }

    // Record save
    const existingSave = await ctx.db
      .query("communityRecipeSaves")
      .withIndex("by_recipeId_and_userId", (q) =>
        q.eq("recipeId", args.recipeId).eq("userId", userId),
      )
      .unique();

    if (!existingSave) {
      await ctx.db.insert("communityRecipeSaves", {
        recipeId: args.recipeId,
        userId,
      });
    }

    return { savedRecipeId: newRecipeId };
  },
});
