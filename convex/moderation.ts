import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';

// Moderator commands for handling community reports. They are internal, so
// they run only from the Convex dashboard or CLI, e.g.
//   pnpm exec convex run --prod moderation:removeRecipe '{"id":"…","reason":"Spam"}'

/** A reported recipe, including hidden ones, with its author and ban state. */
export const recipe = internalQuery({
  args: { id: v.id('hubRecipes') },
  returns: v.any(),
  handler: async (ctx, { id }) => {
    const recipe = await ctx.db.get(id);
    if (!recipe) return null;
    const author = await ctx.db.get(recipe.userId);
    const banned = !!(await ctx.db.query('hubBans').withIndex('by_userId', (q) => q.eq('userId', recipe.userId)).first());
    return {
      id: recipe._id,
      title: recipe.snapshot.title,
      visibility: recipe.visibility,
      removedAt: recipe.removedAt ?? null,
      removalReason: recipe.removalReason ?? null,
      author: { id: recipe.userId, name: author?.name ?? null, banned },
      snapshot: recipe.snapshot,
    };
  },
});

/** Hides a recipe for everyone. The author can't republish it. */
export const removeRecipe = internalMutation({
  args: { id: v.id('hubRecipes'), reason: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { id, reason }) => {
    const recipe = await ctx.db.get(id);
    if (!recipe) throw new Error('Recipe not found');
    await ctx.db.patch(id, { visibility: 'private', removedAt: Date.now(), removalReason: reason?.slice(0, 200) });
    return null;
  },
});

/** Undoes `removeRecipe`. The recipe stays private until its author republishes it. */
export const restoreRecipe = internalMutation({
  args: { id: v.id('hubRecipes') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { removedAt: undefined, removalReason: undefined });
    return null;
  },
});

/**
 * Bans a cook: removes all their recipes, revokes their publishing tokens and
 * blocks their Apple ID from signing in again, even after account deletion.
 */
export const banUser = internalMutation({
  args: { userId: v.id('users'), reason: v.string() },
  returns: v.object({ recipesRemoved: v.number() }),
  handler: async (ctx, { userId, reason }) => {
    if (!(await ctx.db.get(userId))) throw new Error('User not found');
    const now = Date.now();
    const subs = (await ctx.db.query('appleCredentials').withIndex('by_userId', (q) => q.eq('userId', userId)).take(20)).map((c) => c.sub);
    if (subs.length === 0) {
      await ctx.db.insert('hubBans', { userId, reason, createdAt: now });
    }
    for (const appleSub of subs) await ctx.db.insert('hubBans', { userId, appleSub, reason, createdAt: now });
    for (const token of await ctx.db.query('hubTokens').withIndex('by_userId', (q) => q.eq('userId', userId)).take(100)) {
      await ctx.db.delete(token._id);
    }
    let recipesRemoved = 0;
    for (const recipe of await ctx.db.query('hubRecipes').withIndex('by_userId', (q) => q.eq('userId', userId)).take(500)) {
      await ctx.db.patch(recipe._id, { visibility: 'private', removedAt: now, removalReason: `Author banned: ${reason}`.slice(0, 200) });
      recipesRemoved += 1;
    }
    return { recipesRemoved };
  },
});

/** Lifts a ban. Removed recipes stay removed; restore them individually. */
export const unbanUser = internalMutation({
  args: { userId: v.id('users') },
  returns: v.number(),
  handler: async (ctx, { userId }) => {
    const bans = await ctx.db.query('hubBans').withIndex('by_userId', (q) => q.eq('userId', userId)).take(50);
    for (const ban of bans) await ctx.db.delete(ban._id);
    return bans.length;
  },
});
