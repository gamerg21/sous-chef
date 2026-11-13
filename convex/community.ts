// API v2 reads and writes (docs/COMMUNITY_API.md). Everything is internal:
// the HTTP actions in communityHttp.ts resolve the bearer token to `userId` /
// `viewer` and validate request bodies before calling in. IDs arrive as
// untrusted text and are checked with `normalizeId`.
import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { COMMUNITY_LIMITS, saneNumbers, type Cook, type Detail, type Listing, type Me, type OwnListing, type Tip } from '../src/lib/community-contract';
import { FILTER_MESSAGE, isObjectionable } from '../src/lib/community-filter';
import { cleanDisplayName, DEFAULT_DISPLAY_NAME } from './appleAuth';
import { isBanned } from './hub';
import { checkAndRecordRateLimit } from './rateLimit';
import {
  adjustProfile, adjustRecipe, authorOf, deleteMade, isModerator, isViewable, normalizeTag, profileOf, ratingOf,
  toListing, toListings, type AuthorCache, type Recipe,
} from './hubLib';

export type Failure = { ok: false; status: number; error: string };
export type Result<T> = { ok: true; value: T } | Failure;
export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = (status: number, error: string): Failure => ({ ok: false, status, error });
const NOT_FOUND = fail(404, 'Not found');
const SLOW_DOWN = fail(429, 'Too many requests. Try again in a minute.');

const sortValidator = v.union(v.literal('new'), v.literal('hot'), v.literal('top'));
const length = (text: string) => Array.from(text).length;

async function viewableRecipe(ctx: QueryCtx, id: string): Promise<Recipe | null> {
  const recipeId = ctx.db.normalizeId('hubRecipes', id);
  const recipe = recipeId ? await ctx.db.get(recipeId) : null;
  return recipe && isViewable(recipe) ? recipe : null;
}

const allowed = (ctx: MutationCtx, scope: string, subject: string, max: number, windowMs = 60_000) =>
  checkAndRecordRateLimit(ctx, { scope: `community-${scope}`, subject, windowMs, max });

// ── Lists ──────────────────────────────────────────────────────────────

type Page<T> = { page: T[]; isDone: boolean; continueCursor: string };
const cursorOf = (page: Page<unknown>) => (page.isDone ? null : page.continueCursor);

/** GET /api/v2/recipes. Precedence: search, author, tag; otherwise every public recipe. */
export const listRecipes = internalQuery({
  args: {
    sort: sortValidator,
    search: v.optional(v.string()),
    author: v.optional(v.string()),
    tag: v.optional(v.string()),
    viewer: v.optional(v.id('users')),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.any(),
  handler: async (ctx, { sort, paginationOpts, ...args }): Promise<{ recipes: Listing[]; cursor: string | null }> => {
    const viewer = args.viewer ?? null;
    const search = args.search?.trim().slice(0, 200);
    const table = ctx.db.query('hubRecipes');
    let page: Page<Recipe | null>;
    if (search) {
      page = await table
        .withSearchIndex('search_recipes', (q) => q.search('searchText', search).eq('visibility', 'public').eq('underReview', undefined))
        .paginate(paginationOpts);
    } else if (args.author !== undefined) {
      const userId = ctx.db.normalizeId('users', args.author);
      if (!userId) return { recipes: [], cursor: null };
      const ranged =
        sort === 'hot' ? table.withIndex('by_userId_and_visibility_and_underReview_and_hot', (q) => q.eq('userId', userId).eq('visibility', 'public').eq('underReview', undefined))
        : sort === 'top' ? table.withIndex('by_userId_and_visibility_and_underReview_and_likeCount', (q) => q.eq('userId', userId).eq('visibility', 'public').eq('underReview', undefined))
        : table.withIndex('by_userId_and_visibility_and_underReview', (q) => q.eq('userId', userId).eq('visibility', 'public').eq('underReview', undefined));
      page = await ranged.order('desc').paginate(paginationOpts);
    } else if (args.tag !== undefined) {
      const tag = normalizeTag(args.tag);
      const rows = ctx.db.query('hubRecipeTags');
      const ranged =
        sort === 'hot' ? rows.withIndex('by_tag_and_hot', (q) => q.eq('tag', tag))
        : sort === 'top' ? rows.withIndex('by_tag_and_likeCount', (q) => q.eq('tag', tag))
        : rows.withIndex('by_tag_and_createdAt', (q) => q.eq('tag', tag));
      const tagged = await ranged.order('desc').paginate(paginationOpts);
      page = { ...tagged, page: await Promise.all(tagged.page.map((row) => ctx.db.get(row.recipeId))) };
    } else {
      const ranged =
        sort === 'hot' ? table.withIndex('by_visibility_and_underReview_and_hot', (q) => q.eq('visibility', 'public').eq('underReview', undefined))
        : sort === 'top' ? table.withIndex('by_visibility_and_underReview_and_likeCount', (q) => q.eq('visibility', 'public').eq('underReview', undefined))
        : table.withIndex('by_visibility_and_underReview', (q) => q.eq('visibility', 'public').eq('underReview', undefined));
      page = await ranged.order('desc').paginate(paginationOpts);
    }
    return { recipes: await toListings(ctx, page.page, viewer), cursor: cursorOf(page) };
  },
});

/** Reads per page stay near this many recipes however many cooks are followed. */
const FEED_READ_TARGET = 600;

/**
 * POST /api/v2/feed/following. Reads the newest few public recipes of each
 * followed cook (older than the cursor) and merges them newest first. A cook
 * whose read was cut short may have more recipes older than their last one
 * read, so the page stops at the newest such boundary; the next page resumes
 * from the last recipe returned. The cursor is that recipe's creation time.
 */
export const followingFeed = internalQuery({
  args: { userId: v.id('users'), before: v.optional(v.number()), limit: v.number() },
  returns: v.any(),
  handler: async (ctx, { userId, before, limit }): Promise<{ recipes: Listing[]; cursor: string | null }> => {
    const follows = await ctx.db.query('hubFollows').withIndex('by_followerId_and_followeeId', (q) => q.eq('followerId', userId)).take(COMMUNITY_LIMITS.follows);
    const perCook = Math.max(3, Math.min(limit + 1, Math.floor(FEED_READ_TARGET / Math.max(1, follows.length))));
    const candidates: Recipe[] = [];
    let boundary = -Infinity;
    for (const follow of follows) {
      const rows = await ctx.db
        .query('hubRecipes')
        .withIndex('by_userId_and_visibility_and_underReview', (q) => {
          const listed = q.eq('userId', follow.followeeId).eq('visibility', 'public').eq('underReview', undefined);
          return before === undefined ? listed : listed.lt('_creationTime', before);
        })
        .order('desc')
        .take(perCook);
      candidates.push(...rows);
      if (rows.length === perCook) boundary = Math.max(boundary, rows[rows.length - 1]._creationTime);
    }
    const mergeable = candidates.filter((recipe) => recipe._creationTime >= boundary).sort((a, b) => b._creationTime - a._creationTime);
    const page = mergeable.slice(0, limit);
    const more = page.length > 0 && (mergeable.length > limit || boundary !== -Infinity);
    return { recipes: await toListings(ctx, page, userId), cursor: more ? String(page[page.length - 1]._creationTime) : null };
  },
});

/** POST /api/v2/me/recipes: everything the cook published, including private, removed and under-review recipes. */
export const myRecipes = internalQuery({
  args: { userId: v.id('users'), paginationOpts: paginationOptsValidator },
  returns: v.any(),
  handler: async (ctx, { userId, paginationOpts }): Promise<{ recipes: OwnListing[]; cursor: string | null }> => {
    const page = await ctx.db.query('hubRecipes').withIndex('by_userId', (q) => q.eq('userId', userId)).order('desc').paginate(paginationOpts);
    const cache: AuthorCache = new Map();
    const recipes: OwnListing[] = [];
    for (const recipe of page.page) {
      const listing = await toListing(ctx, recipe, userId, cache);
      if (listing) recipes.push({ ...listing, visibility: recipe.visibility, removed: !!recipe.removedAt, underReview: !!recipe.underReview });
    }
    return { recipes, cursor: cursorOf(page) };
  },
});

// ── One recipe ─────────────────────────────────────────────────────────

async function toTip(ctx: QueryCtx, made: Doc<'hubMade'>, cache?: AuthorCache): Promise<Tip | null> {
  const author = await authorOf(ctx, made.userId, cache);
  if (!author) return null;
  const tip: Tip = { id: made._id, author, rating: made.rating, createdAt: new Date(made.updatedAt).toISOString() };
  if (made.tip) tip.tip = made.tip;
  return tip;
}
const visibleTips = (ctx: QueryCtx, recipeId: Id<'hubRecipes'>) =>
  ctx.db.query('hubMade').withIndex('by_recipeId_and_tipVisible_and_updatedAt', (q) => q.eq('recipeId', recipeId).eq('tipVisible', true)).order('desc');
async function toTips(ctx: QueryCtx, entries: Doc<'hubMade'>[]) {
  const cache: AuthorCache = new Map();
  const tips: Tip[] = [];
  for (const made of entries) {
    const tip = await toTip(ctx, made, cache);
    if (tip) tips.push(tip);
  }
  return tips;
}
const madeBy = (ctx: QueryCtx, recipeId: Id<'hubRecipes'>, userId: Id<'users'>) =>
  ctx.db.query('hubMade').withIndex('by_recipeId_and_userId', (q) => q.eq('recipeId', recipeId).eq('userId', userId)).unique();
const followRow = (ctx: QueryCtx, followerId: Id<'users'>, followeeId: Id<'users'>) =>
  ctx.db.query('hubFollows').withIndex('by_followerId_and_followeeId', (q) => q.eq('followerId', followerId).eq('followeeId', followeeId)).unique();

export type StoredPhoto = { id: Id<'_storage'>; type: string };
const storedPhoto = (recipe: Recipe): StoredPhoto | null => (recipe.photoId ? { id: recipe.photoId, type: recipe.photoType || 'image/jpeg' } : null);

/**
 * GET /api/v2/recipes/:id. `detail.snapshot` carries `photoDataUrl` only for
 * a document whose photo is still inline; `photo` names a stored photo. The
 * HTTP action strips or inlines according to `?photo=inline`.
 */
export const recipeDetail = internalQuery({
  args: { id: v.string(), viewer: v.optional(v.id('users')) },
  returns: v.any(),
  handler: async (ctx, { id, viewer }): Promise<{ detail: Detail; photo: StoredPhoto | null } | null> => {
    let recipe = await viewableRecipe(ctx, id);
    if (!recipe && viewer && (await isModerator(ctx, viewer))) {
      // A moderator can open what they are judging: a reported recipe that is under review.
      const recipeId = ctx.db.normalizeId('hubRecipes', id);
      const held = recipeId ? await ctx.db.get(recipeId) : null;
      if (held && held.underReview && held.visibility !== 'private' && !held.removedAt) recipe = held;
    }
    const listing = recipe && (await toListing(ctx, recipe, viewer ?? null));
    if (!recipe || !listing) return null;
    const detail: Detail = {
      ...listing,
      visibility: recipe.visibility === 'unlisted' ? 'unlisted' : 'public',
      snapshot: saneNumbers(recipe.snapshot),
      tips: await toTips(ctx, await visibleTips(ctx, recipe._id).take(20)),
    };
    if (viewer) {
      const made = await madeBy(ctx, recipe._id, viewer);
      detail.viewer = { liked: !!listing.liked, following: !!(await followRow(ctx, viewer, recipe.userId)), own: recipe.userId === viewer };
      if (made && !made.hidden) detail.viewer.made = made.tip ? { rating: made.rating, tip: made.tip } : { rating: made.rating };
    }
    return { detail, photo: storedPhoto(recipe) };
  },
});

/** The photo of a viewable recipe, wherever it is kept. */
export const recipePhoto = internalQuery({
  args: { id: v.string() },
  returns: v.any(),
  handler: async (ctx, { id }): Promise<{ stored: StoredPhoto } | { dataUrl: string } | null> => {
    const recipe = await viewableRecipe(ctx, id);
    if (!recipe) return null;
    const stored = storedPhoto(recipe);
    if (stored) return { stored };
    return recipe.snapshot.photoDataUrl ? { dataUrl: recipe.snapshot.photoDataUrl } : null;
  },
});

/** GET /api/v2/recipes/:id/tips: entries with tip text, newest first. */
export const tips = internalQuery({
  args: { id: v.string(), paginationOpts: paginationOptsValidator },
  returns: v.any(),
  handler: async (ctx, { id, paginationOpts }): Promise<{ tips: Tip[]; cursor: string | null } | null> => {
    const recipe = await viewableRecipe(ctx, id);
    if (!recipe) return null;
    const page = await visibleTips(ctx, recipe._id).paginate(paginationOpts);
    return { tips: await toTips(ctx, page.page), cursor: cursorOf(page) };
  },
});

/** GET /api/v2/revisions: the current revision of each ID, or null when gone or hidden. */
export const revisions = internalQuery({
  args: { ids: v.array(v.string()) },
  returns: v.any(),
  handler: async (ctx, { ids }): Promise<Record<string, number | null>> => {
    const result: Record<string, number | null> = {};
    for (const id of ids.slice(0, 100)) result[id] = (await viewableRecipe(ctx, id))?.revision ?? null;
    return result;
  },
});

/** GET /api/v2/tags: the 30 most used tags on publicly listed recipes. */
export const tags = internalQuery({
  args: {},
  returns: v.array(v.object({ tag: v.string(), count: v.number() })),
  handler: async (ctx) => {
    const rows = await ctx.db.query('hubTagCounts').withIndex('by_count').order('desc').take(30);
    return rows.map(({ tag, count }) => ({ tag, count }));
  },
});

// ── Cooks ──────────────────────────────────────────────────────────────

async function cookOf(ctx: QueryCtx, userId: Id<'users'>, viewer: Id<'users'> | null): Promise<Cook | null> {
  const user = await ctx.db.get(userId);
  if (!user || (await isBanned(ctx, userId))) return null;
  const profile = await profileOf(ctx, userId);
  const cook: Cook = {
    id: userId,
    name: user.name?.trim() || DEFAULT_DISPLAY_NAME,
    recipeCount: profile?.recipeCount ?? 0,
    followerCount: profile?.followerCount ?? 0,
    followingCount: profile?.followingCount ?? 0,
  };
  if (profile?.bio) cook.bio = profile.bio;
  if (viewer) cook.viewer = { following: !!(await followRow(ctx, viewer, userId)), own: viewer === userId };
  return cook;
}
async function meOf(ctx: QueryCtx, userId: Id<'users'>): Promise<Me | null> {
  const cook = await cookOf(ctx, userId, null);
  return cook && { ...cook, moderator: await isModerator(ctx, userId) };
}

/** GET /api/v2/cooks/:id; null for unknown or banned cooks. */
export const cook = internalQuery({
  args: { id: v.string(), viewer: v.optional(v.id('users')) },
  returns: v.any(),
  handler: async (ctx, { id, viewer }): Promise<Cook | null> => {
    const userId = ctx.db.normalizeId('users', id);
    return userId ? cookOf(ctx, userId, viewer ?? null) : null;
  },
});

export const me = internalQuery({
  args: { userId: v.id('users') },
  returns: v.any(),
  handler: async (ctx, { userId }): Promise<Me | null> => meOf(ctx, userId),
});

/** POST /api/v2/me/profile. An empty bio clears it. */
export const updateProfile = internalMutation({
  args: { userId: v.id('users'), name: v.optional(v.string()), bio: v.optional(v.string()) },
  returns: v.any(),
  handler: async (ctx, { userId, ...args }): Promise<Result<Me>> => {
    if (!(await allowed(ctx, 'profile', userId, 10))) return SLOW_DOWN;
    const name = args.name === undefined ? undefined : cleanDisplayName(args.name, COMMUNITY_LIMITS.name + 1);
    if (args.name !== undefined && (!name || length(name) > COMMUNITY_LIMITS.name)) return fail(400, `Names are 1–${COMMUNITY_LIMITS.name} characters`);
    const bio = args.bio?.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (bio !== undefined && length(bio) > COMMUNITY_LIMITS.bio) return fail(400, `A bio is up to ${COMMUNITY_LIMITS.bio} characters`);
    if (isObjectionable(name, bio)) return fail(400, FILTER_MESSAGE);
    if (name) await ctx.db.patch(userId, { name });
    if (bio !== undefined) {
      const profile = await profileOf(ctx, userId);
      if (profile) await ctx.db.patch(profile._id, { bio: bio || undefined });
      else if (bio) await ctx.db.insert('hubProfiles', { userId, bio, followerCount: 0, followingCount: 0, recipeCount: 0 });
    }
    const updated = await meOf(ctx, userId);
    return updated ? ok(updated) : fail(401, 'Not authenticated');
  },
});

/** POST /api/v2/follow. Idempotent; at most `COMMUNITY_LIMITS.follows` followed cooks. */
export const follow = internalMutation({
  args: { userId: v.id('users'), target: v.string(), following: v.boolean() },
  returns: v.any(),
  handler: async (ctx, { userId, target, following }): Promise<Result<{ following: boolean; followerCount: number }>> => {
    if (!(await allowed(ctx, 'follow', userId, 60))) return SLOW_DOWN;
    const targetId = ctx.db.normalizeId('users', target);
    if (!targetId || !(await ctx.db.get(targetId)) || (await isBanned(ctx, targetId))) return NOT_FOUND;
    if (targetId === userId) return fail(400, "You can't follow yourself");
    const existing = await followRow(ctx, userId, targetId);
    if (following && !existing) {
      const followed = await ctx.db.query('hubFollows').withIndex('by_followerId_and_followeeId', (q) => q.eq('followerId', userId)).take(COMMUNITY_LIMITS.follows);
      if (followed.length >= COMMUNITY_LIMITS.follows) return fail(400, `You can follow up to ${COMMUNITY_LIMITS.follows} cooks`);
      await ctx.db.insert('hubFollows', { followerId: userId, followeeId: targetId });
      await adjustProfile(ctx, userId, 'followingCount', 1);
      await adjustProfile(ctx, targetId, 'followerCount', 1);
    } else if (!following && existing) {
      await ctx.db.delete(existing._id);
      await adjustProfile(ctx, userId, 'followingCount', -1);
      await adjustProfile(ctx, targetId, 'followerCount', -1);
    }
    return ok({ following, followerCount: (await profileOf(ctx, targetId))?.followerCount ?? 0 });
  },
});

// ── Likes, saves, "made it" ────────────────────────────────────────────

/** POST /api/v2/like. Idempotent. */
export const like = internalMutation({
  args: { userId: v.id('users'), id: v.string(), liked: v.boolean() },
  returns: v.any(),
  handler: async (ctx, { userId, id, liked }): Promise<Result<{ liked: boolean; likeCount: number }>> => {
    if (!(await allowed(ctx, 'like', userId, 120))) return SLOW_DOWN;
    const recipe = await viewableRecipe(ctx, id);
    if (!recipe) return NOT_FOUND;
    const existing = await ctx.db.query('hubLikes').withIndex('by_recipeId_and_userId', (q) => q.eq('recipeId', recipe._id).eq('userId', userId)).unique();
    let likeCount = recipe.likeCount ?? 0;
    if (liked && !existing) {
      await ctx.db.insert('hubLikes', { recipeId: recipe._id, userId });
      likeCount = (await adjustRecipe(ctx, recipe._id, { likeCount: 1 }))?.likeCount ?? likeCount;
    } else if (!liked && existing) {
      await ctx.db.delete(existing._id);
      likeCount = (await adjustRecipe(ctx, recipe._id, { likeCount: -1 }))?.likeCount ?? likeCount;
    }
    return ok({ liked, likeCount });
  },
});

/** POST /api/v2/save: counts a saved copy once per `clientKey`. */
export const save = internalMutation({
  args: { id: v.string(), clientKey: v.string(), address: v.string() },
  returns: v.any(),
  handler: async (ctx, { id, clientKey, address }): Promise<Result<{ saveCount: number }>> => {
    if (!(await allowed(ctx, 'save-address', address, 120))) return SLOW_DOWN;
    if (!/^[a-f0-9]{64}$/.test(clientKey)) return fail(400, 'Invalid client key');
    const recipe = await viewableRecipe(ctx, id);
    if (!recipe) return NOT_FOUND;
    const existing = await ctx.db.query('hubSaves').withIndex('by_recipeId_and_clientKey', (q) => q.eq('recipeId', recipe._id).eq('clientKey', clientKey)).first();
    if (existing) return ok({ saveCount: recipe.saveCount ?? 0 });
    await ctx.db.insert('hubSaves', { recipeId: recipe._id, clientKey });
    return ok({ saveCount: (await adjustRecipe(ctx, recipe._id, { saveCount: 1 }))?.saveCount ?? 0 });
  },
});

type MadeResult = { madeCount: number; rating?: number };
function madeResult(recipe: Pick<Recipe, 'madeCount' | 'ratingSum'> | null): MadeResult {
  const result: MadeResult = { madeCount: recipe?.madeCount ?? 0 };
  const rating = recipe ? ratingOf(recipe) : undefined;
  if (rating !== undefined) result.rating = rating;
  return result;
}

/** POST /api/v2/made: one entry per cook and recipe; sending again replaces it. */
export const made = internalMutation({
  args: { userId: v.id('users'), id: v.string(), rating: v.number(), tip: v.optional(v.string()) },
  returns: v.any(),
  handler: async (ctx, { userId, id, rating, ...args }): Promise<Result<MadeResult>> => {
    if (!(await allowed(ctx, 'made', userId, 20))) return SLOW_DOWN;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return fail(400, 'A rating is a whole number from 1 to 5');
    const tip = args.tip?.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim() || undefined;
    if (tip && length(tip) > COMMUNITY_LIMITS.tip) return fail(400, `A tip is up to ${COMMUNITY_LIMITS.tip} characters`);
    if (isObjectionable(tip)) return fail(400, FILTER_MESSAGE);
    const recipe = await viewableRecipe(ctx, id);
    if (!recipe) return NOT_FOUND;
    if (recipe.userId === userId) return fail(403, "You can't rate your own recipe");
    const existing = await madeBy(ctx, recipe._id, userId);
    const entry = { rating, tip, hidden: undefined, tipVisible: tip ? true : undefined, updatedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, entry);
      // A new submission replaces an entry a moderator hid, so it counts again.
      return ok(madeResult(await adjustRecipe(ctx, recipe._id, existing.hidden ? { madeCount: 1, ratingSum: rating } : { ratingSum: rating - existing.rating })));
    }
    await ctx.db.insert('hubMade', { recipeId: recipe._id, userId, ...entry });
    return ok(madeResult(await adjustRecipe(ctx, recipe._id, { madeCount: 1, ratingSum: rating })));
  },
});

/** POST /api/v2/made/delete: removes the cook's own entry; fine when there is none. */
export const removeMade = internalMutation({
  args: { userId: v.id('users'), id: v.string() },
  returns: v.any(),
  handler: async (ctx, { userId, id }): Promise<Result<MadeResult>> => {
    if (!(await allowed(ctx, 'made', userId, 20))) return SLOW_DOWN;
    // The entry may be removed even after the recipe was hidden.
    const recipeId = ctx.db.normalizeId('hubRecipes', id);
    const recipe = recipeId && (await ctx.db.get(recipeId));
    if (!recipe) return NOT_FOUND;
    const existing = await madeBy(ctx, recipe._id, userId);
    if (existing) await deleteMade(ctx, existing, 'The author deleted this tip');
    return ok(madeResult(await ctx.db.get(recipe._id)));
  },
});
