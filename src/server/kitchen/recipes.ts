import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import {
  getAuthUserId,
  resolveHouseholdId,
  decodeIngredientMapping,
} from "./helpers";

export const list = query({
  args: { householdId: v.optional(v.id("households")) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const householdId = await resolveHouseholdId(ctx, userId, args.householdId);
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
        visibility: recipe.visibility as "private" | "household" | "public" | "unlisted",
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
    const publication = await ctx.db.query("publications").withIndex("by_recipeId", q => q.eq("recipeId", recipe._id)).unique();

    return {
      publicationVisibility: publication?.visibility,
      id: recipe._id,
      title: recipe.title,
      description: recipe.description,
      photoUrl: recipe.photoUrl,
      tags: recipe.tags && recipe.tags.length > 0 ? recipe.tags : undefined,
      visibility: recipe.visibility as "private" | "household" | "public" | "unlisted",
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
    const householdId = await resolveHouseholdId(ctx, userId, args.householdId);
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
        note: ing.note,
        mappingLabel: ing.mapping?.inventoryItemLabel,
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
          note: ing.note,
          mappingLabel: ing.mapping?.inventoryItemLabel,
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

/**
 * Portable JSON export of the household's recipes. The client turns this
 * into a downloadable file. Round-trips with importRecipes.
 * (Replaces the removed /api/recipes/export route.)
 */
export const exportAll = query({
  args: { householdId: v.optional(v.id("households")) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const householdId = await resolveHouseholdId(ctx, userId, args.householdId);
    if (!householdId) return { recipes: [] };

    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
      .collect();

    const exported = [];
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

      const origin=await ctx.db.query('recipeOrigins').withIndex('by_recipeId',q=>q.eq('recipeId',recipe._id)).first();
      const photo=recipe.photoUrl?.startsWith('/api/files/')?ctx.files.read(recipe.photoUrl.split('/').pop()!):null;
      exported.push({
        photoDataUrl:photo?`data:${photo.mime};base64,${Buffer.from(photo.bytes).toString('base64')}`:undefined,
        communityOrigin:origin?{id:origin.remoteId,revision:origin.revision,origin:origin.origin,author:origin.author}:undefined,
        title: recipe.title,
        description: recipe.description,
        tags: recipe.tags,
        servings: recipe.servings,
        totalTimeMinutes: recipe.totalTimeMinutes,
        caloriesKcal: recipe.caloriesKcal,
        proteinGrams: recipe.proteinGrams,
        carbsGrams: recipe.carbsGrams,
        fatGrams: recipe.fatGrams,
        sourceUrl: recipe.sourceUrl,
        notes: recipe.notes,
        ingredients: ingredients.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          note: i.note,
        })),
        steps: steps.map((s) => s.text),
      });
    }
    return { recipes: exported };
  },
});

/**
 * Import recipes from the exportAll JSON format. Accepts either a bare
 * array or { recipes: [...] }. Unknown fields are ignored; recipes import
 * as private. (Replaces the removed /api/recipes/import route.)
 */
export const importRecipes = mutation({
  args: {
    householdId: v.optional(v.id("households")),
    data: v.any(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const householdId = await resolveHouseholdId(ctx, userId, args.householdId);
    if (!householdId) throw new Error("No household found");

    const raw = args.data as unknown;
    const list = Array.isArray(raw)
      ? raw
      : raw && typeof raw === "object" && Array.isArray((raw as { recipes?: unknown }).recipes)
        ? ((raw as { recipes: unknown[] }).recipes)
        : null;
    if (!list) {
      throw new Error(
        "Invalid import format: expected an array of recipes or { recipes: [...] }",
      );
    }
    if (list.length > 500) {
      throw new Error("Import is limited to 500 recipes at a time");
    }

    const str = (value: unknown): string | undefined =>
      typeof value === "string" && value.trim() ? value : undefined;
    const num = (value: unknown): number | undefined =>
      typeof value === "number" && Number.isFinite(value) ? value : undefined;

    let importedCount = 0;
    for (const entry of list) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      const title = str(item.title);
      if (!title) continue;

      const recipeId = await ctx.db.insert("recipes", {
        householdId,
        title,
        description: str(item.description),
        tags: Array.isArray(item.tags)
          ? (item.tags.filter((t) => typeof t === "string") as string[])
          : undefined,
        visibility: "private",
        servings: num(item.servings),
        totalTimeMinutes: num(item.totalTimeMinutes),
        caloriesKcal: num(item.caloriesKcal),
        proteinGrams: num(item.proteinGrams),
        carbsGrams: num(item.carbsGrams),
        fatGrams: num(item.fatGrams),
        sourceUrl: str(item.sourceUrl),
        notes: str(item.notes),
        favorited: false,
      });

      const ingredients = Array.isArray(item.ingredients) ? item.ingredients : [];
      let order = 0;
      for (const ing of ingredients.slice(0, 200)) {
        const name =
          typeof ing === "string" ? ing : str((ing as Record<string, unknown>)?.name);
        if (!name) continue;
        const obj = typeof ing === "object" && ing ? (ing as Record<string, unknown>) : {};
        await ctx.db.insert("recipeIngredients", {
          recipeId,
          name,
          quantity: num(obj.quantity),
          unit: str(obj.unit),
          note: str(obj.note),
          order: order++,
        });
      }

      const steps = Array.isArray(item.steps) ? item.steps : [];
      order = 0;
      for (const step of steps.slice(0, 200)) {
        const text =
          typeof step === "string" ? step : str((step as Record<string, unknown>)?.text);
        if (!text) continue;
        await ctx.db.insert("recipeSteps", { recipeId, text, order: order++ });
      }

      if (typeof item.photoDataUrl === 'string') {
        const match=/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(item.photoDataUrl);
        if(!match || item.photoDataUrl.length>750000)throw new Error('Invalid imported photo');
        const id=ctx.files.store(match[1],Buffer.from(match[2],'base64'));const url=`/api/files/${id}`;
        await ctx.db.patch(recipeId,{photoUrl:url});await ctx.db.insert('mediaAssets',{url,recipeId});
      }
      const origin=item.communityOrigin as Record<string,unknown>|undefined;
      if(origin && typeof origin.id==='string' && typeof origin.origin==='string' && typeof origin.author==='string' && typeof origin.revision==='number') await ctx.db.insert('recipeOrigins',{recipeId,remoteId:origin.id,origin:origin.origin,author:origin.author,revision:origin.revision});
      importedCount++;
    }

    return { importedCount };
  },
});
