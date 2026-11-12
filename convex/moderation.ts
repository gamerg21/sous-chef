import { v } from 'convex/values';
import { internalMutation, internalQuery, type MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { removeBannedContent, removeRecipe as hideRecipe, syncRecipe } from './hubLib';

// Moderator commands for handling community reports. They are internal, so
// they run only from the Convex dashboard or CLI, e.g.
//   pnpm exec convex run --prod moderation:removeRecipe '{"id":"…","reason":"Spam"}'
// Moderators can do the same from the app through /api/v2/mod/* (reports.ts).

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
      underReview: !!recipe.underReview,
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
    if (!(await ctx.db.get(id))) throw new Error('Recipe not found');
    await hideRecipe(ctx, id, reason);
    return null;
  },
});

/** Undoes `removeRecipe`. The recipe stays private until its author republishes it. */
export const restoreRecipe = internalMutation({
  args: { id: v.id('hubRecipes') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { removedAt: undefined, removalReason: undefined });
    await syncRecipe(ctx, id);
    return null;
  },
});

/**
 * Bans a cook: removes their recipes, hides their tips, revokes their
 * publishing tokens and moderator role, and blocks their Apple ID from signing in again, even
 * after account deletion. Content beyond the first batch is removed by
 * `banCleanup` right after.
 */
export async function banCook(ctx: MutationCtx, userId: Id<'users'>, reason: string) {
  const now = Date.now();
  const subs = (await ctx.db.query('appleCredentials').withIndex('by_userId', (q) => q.eq('userId', userId)).take(20)).map((c) => c.sub);
  if (subs.length === 0) {
    await ctx.db.insert('hubBans', { userId, reason, createdAt: now });
  }
  for (const appleSub of subs) await ctx.db.insert('hubBans', { userId, appleSub, reason, createdAt: now });
  for (const token of await ctx.db.query('hubTokens').withIndex('by_userId', (q) => q.eq('userId', userId)).take(100)) {
    await ctx.db.delete(token._id);
  }
  for (const role of await ctx.db.query('hubModerators').withIndex('by_userId', (q) => q.eq('userId', userId)).take(10)) {
    await ctx.db.delete(role._id);
  }
  const { recipesRemoved, more } = await removeBannedContent(ctx, userId, reason);
  if (more) await ctx.scheduler.runAfter(0, internal.moderation.banCleanup, { userId, reason });
  return { recipesRemoved };
}

export const banUser = internalMutation({
  args: { userId: v.id('users'), reason: v.string() },
  returns: v.object({ recipesRemoved: v.number() }),
  handler: async (ctx, { userId, reason }) => {
    if (!(await ctx.db.get(userId))) throw new Error('User not found');
    return banCook(ctx, userId, reason);
  },
});

/** Continues a ban over more content than one transaction should touch. Stops if the ban was lifted. */
export const banCleanup = internalMutation({
  args: { userId: v.id('users'), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, reason }) => {
    if (!(await ctx.db.query('hubBans').withIndex('by_userId', (q) => q.eq('userId', userId)).first())) return null;
    const { more } = await removeBannedContent(ctx, userId, reason);
    if (more) await ctx.scheduler.runAfter(0, internal.moderation.banCleanup, { userId, reason });
    return null;
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

/** Grants or withdraws the moderator role, which opens the report queue in the apps. */
export const setModerator = internalMutation({
  args: { userId: v.id('users'), moderator: v.boolean() },
  returns: v.object({ moderator: v.boolean() }),
  handler: async (ctx, { userId, moderator }) => {
    if (!(await ctx.db.get(userId))) throw new Error('User not found');
    const rows = await ctx.db.query('hubModerators').withIndex('by_userId', (q) => q.eq('userId', userId)).take(10);
    if (moderator && rows.length === 0) await ctx.db.insert('hubModerators', { userId, createdAt: Date.now() });
    if (!moderator) for (const row of rows) await ctx.db.delete(row._id);
    return { moderator };
  },
});

/** The accounts that hold the moderator role. */
export const moderators = internalQuery({
  args: {},
  returns: v.array(v.object({ userId: v.id('users'), name: v.union(v.string(), v.null()) })),
  handler: async (ctx) => {
    const rows = await ctx.db.query('hubModerators').take(100);
    return Promise.all(rows.map(async ({ userId }) => ({ userId, name: (await ctx.db.get(userId))?.name ?? null })));
  },
});
