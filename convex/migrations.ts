// One-off data migration to API v2. Run it after deploying, as often as you like:
//   pnpm exec convex run --prod migrations:run
// It moves photos that are still inline in a publication to file storage and
// fills in counters, the hot score, tag rows, tag counts and each cook's
// recipe count. Readers and writers handle documents it hasn't reached yet.
import { v } from 'convex/values';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { decodeDataUrl } from './httpUtil';
import { deletePhoto, syncRecipe, withoutPhoto } from './hubLib';

// Small, because an unmigrated publication can hold a 500 KB photo.
const PAGE = 5;

type PageResult = { recipes: { id: Id<'hubRecipes'>; revision: number; photoDataUrl: string | null }[]; cursor: string; done: boolean };

export const page = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.any(),
  handler: async (ctx, { cursor }): Promise<PageResult> => {
    const result = await ctx.db.query('hubRecipes').paginate({ numItems: PAGE, cursor });
    return {
      recipes: result.page.map((recipe) => ({ id: recipe._id, revision: recipe.revision, photoDataUrl: recipe.snapshot.photoDataUrl ?? null })),
      cursor: result.continueCursor,
      done: result.isDone,
    };
  },
});

/**
 * Migrates one publication. A photo is attached only if the document still
 * has the inline photo it was made from (same revision); otherwise the newly
 * stored file is dropped and the document is picked up as it is now.
 */
export const migrateRecipe = internalMutation({
  args: { id: v.id('hubRecipes'), revision: v.number(), photoId: v.optional(v.id('_storage')), photoType: v.optional(v.string()) },
  returns: v.object({ photoMoved: v.boolean() }),
  handler: async (ctx, { id, revision, photoId, photoType }) => {
    const recipe = await ctx.db.get(id);
    if (!recipe) {
      await deletePhoto(ctx, photoId);
      return { photoMoved: false };
    }
    const photoMoved = !!photoId && recipe.revision === revision && !!recipe.snapshot.photoDataUrl && !recipe.photoId;
    if (photoId && !photoMoved) await deletePhoto(ctx, photoId);
    await ctx.db.patch(id, {
      ...(photoMoved ? { snapshot: withoutPhoto(recipe.snapshot), photoId, photoType } : {}),
      likeCount: recipe.likeCount ?? 0,
      saveCount: recipe.saveCount ?? 0,
      madeCount: recipe.madeCount ?? 0,
      ratingSum: recipe.ratingSum ?? 0,
    });
    await syncRecipe(ctx, id);
    return { photoMoved };
  },
});

/**
 * Walks every publication. `cursor` continues an earlier run that stopped at
 * `maxRecipes`; without arguments it processes everything. Running it again
 * changes nothing that is already migrated.
 */
export const run = internalAction({
  args: { cursor: v.optional(v.union(v.string(), v.null())), maxRecipes: v.optional(v.number()) },
  returns: v.object({ recipes: v.number(), photosMoved: v.number(), photosSkipped: v.number(), done: v.boolean(), cursor: v.union(v.string(), v.null()) }),
  handler: async (ctx, args) => {
    const max = Math.max(1, Math.floor(args.maxRecipes ?? Infinity));
    let cursor = args.cursor ?? null;
    let recipes = 0;
    let photosMoved = 0;
    let photosSkipped = 0;
    while (recipes < max) {
      const batch: PageResult = await ctx.runQuery(internal.migrations.page, { cursor });
      for (const recipe of batch.recipes) {
        let photoId: Id<'_storage'> | undefined;
        let photoType: string | undefined;
        if (recipe.photoDataUrl) {
          const photo = decodeDataUrl(recipe.photoDataUrl);
          // An unreadable photo stays inline; readers still serve it as it is.
          if (photo) {
            photoId = await ctx.storage.store(new Blob([photo.bytes], { type: photo.type }));
            photoType = photo.type;
          } else {
            photosSkipped += 1;
          }
        }
        const { photoMoved } = await ctx.runMutation(internal.migrations.migrateRecipe, { id: recipe.id, revision: recipe.revision, photoId, photoType });
        if (photoMoved) photosMoved += 1;
        recipes += 1;
      }
      cursor = batch.cursor;
      if (batch.done) return { recipes, photosMoved, photosSkipped, done: true, cursor: null };
    }
    return { recipes, photosMoved, photosSkipped, done: false, cursor };
  },
});
