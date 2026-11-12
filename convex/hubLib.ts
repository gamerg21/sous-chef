// Shared helpers for community recipes: visibility rules, the "hot" score,
// the tag index, counters, and the listing shape of API v2. Not a function
// module; everything here runs inside the calling query or mutation.
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Author, Listing, RecipeSnapshot } from '../src/lib/community-contract';
import { DEFAULT_DISPLAY_NAME } from './appleAuth';

export type Recipe = Doc<'hubRecipes'>;

/** In public lists, search, tags and feeds. */
export const isListed = (recipe: Recipe) => recipe.visibility === 'public' && !recipe.underReview && !recipe.removedAt;
/** Reachable by its link: public or unlisted, not removed and not under review. */
export const isViewable = (recipe: Recipe) => recipe.visibility !== 'private' && !recipe.underReview && !recipe.removedAt;

const HOT_PERIOD_SECONDS = 3 * 86_400;
/** Reddit-style: each tenfold in engagement is worth three days of recency, so no cron has to decay it. */
export function hotScore(recipe: Pick<Recipe, '_creationTime' | 'likeCount' | 'saveCount' | 'madeCount'>) {
  const engagement = (recipe.likeCount ?? 0) + 2 * (recipe.saveCount ?? 0) + 3 * (recipe.madeCount ?? 0);
  return Math.log10(Math.max(1, engagement)) + recipe._creationTime / 1000 / HOT_PERIOD_SECONDS;
}

export const MAX_TAG_LENGTH = 40;
export const normalizeTag = (tag: string) => tag.trim().toLowerCase();
/** The tags a recipe is indexed under: lowercased, deduplicated, bounded. */
export function recipeTags(snapshot: RecipeSnapshot): string[] {
  const tags = new Set<string>();
  for (const raw of snapshot.tags) {
    const tag = normalizeTag(raw);
    if (tag && tag.length <= MAX_TAG_LENGTH) tags.add(tag);
    if (tags.size >= 30) break;
  }
  return [...tags];
}

export function ingredientNames(snapshot: RecipeSnapshot): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const ingredient of snapshot.ingredients) {
    const name = ingredient.name.trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    if (names.length >= 60) break;
  }
  return names;
}

export function withoutPhoto(snapshot: RecipeSnapshot): RecipeSnapshot {
  if (snapshot.photoDataUrl === undefined) return snapshot;
  const copy = { ...snapshot };
  delete copy.photoDataUrl;
  return copy;
}

/** Deletes a stored photo if it still exists. */
export async function deletePhoto(ctx: MutationCtx, photoId: Id<'_storage'> | undefined) {
  if (photoId && (await ctx.db.system.get(photoId))) await ctx.storage.delete(photoId);
}

// ── Profiles ───────────────────────────────────────────────────────────

export async function profileOf(ctx: QueryCtx, userId: Id<'users'>) {
  return ctx.db.query('hubProfiles').withIndex('by_userId', (q) => q.eq('userId', userId)).unique();
}

type ProfileCounters = 'followerCount' | 'followingCount' | 'recipeCount';
/** Adds to a profile counter, creating the profile when it gains something. Never goes below zero. */
export async function adjustProfile(ctx: MutationCtx, userId: Id<'users'>, field: ProfileCounters, delta: number) {
  const profile = await profileOf(ctx, userId);
  if (profile) {
    await ctx.db.patch(profile._id, { [field]: Math.max(0, profile[field] + delta) });
  } else if (delta > 0 && (await ctx.db.get(userId))) {
    await ctx.db.insert('hubProfiles', { userId, followerCount: 0, followingCount: 0, recipeCount: 0, [field]: delta });
  }
}

// ── Tag index and derived recipe state ─────────────────────────────────

async function bumpTagCount(ctx: MutationCtx, tag: string, delta: number) {
  const row = await ctx.db.query('hubTagCounts').withIndex('by_tag', (q) => q.eq('tag', tag)).unique();
  const count = (row?.count ?? 0) + delta;
  if (!row) {
    if (count > 0) await ctx.db.insert('hubTagCounts', { tag, count });
  } else if (count <= 0) {
    await ctx.db.delete(row._id);
  } else {
    await ctx.db.patch(row._id, { count });
  }
}

/**
 * Brings everything derived from a recipe in line with the document as it is
 * now: its `hot` score, its tag rows (present only while publicly listed),
 * the tag counts, and its author's recipe count. It compares against what is
 * stored, so it is safe to call after any change, any number of times, and on
 * documents from before API v2. Call it after every write to a recipe, and
 * with `deleting` just before deleting one.
 */
export async function syncRecipe(ctx: MutationCtx, id: Id<'hubRecipes'>, { deleting = false }: { deleting?: boolean } = {}) {
  const recipe = await ctx.db.get(id);
  if (!recipe) return;
  const listed = !deleting && isListed(recipe);
  const hot = hotScore(recipe);
  const likeCount = recipe.likeCount ?? 0;

  const wanted = new Set(listed ? recipeTags(recipe.snapshot) : []);
  const rows = await ctx.db.query('hubRecipeTags').withIndex('by_recipeId', (q) => q.eq('recipeId', id)).take(200);
  for (const row of rows) {
    if (!wanted.has(row.tag)) {
      await ctx.db.delete(row._id);
      await bumpTagCount(ctx, row.tag, -1);
      continue;
    }
    wanted.delete(row.tag);
    if (row.hot !== hot || row.likeCount !== likeCount) await ctx.db.patch(row._id, { hot, likeCount });
  }
  for (const tag of wanted) {
    await ctx.db.insert('hubRecipeTags', { tag, recipeId: id, createdAt: recipe._creationTime, hot, likeCount });
    await bumpTagCount(ctx, tag, 1);
  }

  const patch: Partial<Recipe> = {};
  if (recipe.hot !== hot) patch.hot = hot;
  if (!!recipe.counted !== listed) {
    patch.counted = listed ? true : undefined;
    await adjustProfile(ctx, recipe.userId, 'recipeCount', listed ? 1 : -1);
  }
  if (Object.keys(patch).length) await ctx.db.patch(id, patch);
}

type RecipeCounters = 'likeCount' | 'saveCount' | 'madeCount' | 'ratingSum';
/** Adds to a recipe's counters (never below zero) and refreshes what derives from them. */
export async function adjustRecipe(ctx: MutationCtx, id: Id<'hubRecipes'>, deltas: Partial<Record<RecipeCounters, number>>): Promise<Recipe | null> {
  const recipe = await ctx.db.get(id);
  if (!recipe) return null;
  const patch: Partial<Record<RecipeCounters, number>> = {};
  for (const [field, delta] of Object.entries(deltas) as [RecipeCounters, number][]) {
    patch[field] = Math.max(0, (recipe[field] ?? 0) + delta);
  }
  await ctx.db.patch(id, patch);
  await syncRecipe(ctx, id);
  return ctx.db.get(id);
}

/** Average "made it" rating to one decimal, or undefined with none. */
export function ratingOf(recipe: Pick<Recipe, 'madeCount' | 'ratingSum'>): number | undefined {
  const count = recipe.madeCount ?? 0;
  return count > 0 ? Math.round(((recipe.ratingSum ?? 0) / count) * 10) / 10 : undefined;
}

// ── "Made it" entries ──────────────────────────────────────────────────

/** Hides a made entry (a moderator removed it, or its author was banned) and takes it out of the recipe's counters. */
export async function hideMade(ctx: MutationCtx, made: Doc<'hubMade'>) {
  if (made.hidden) return;
  await ctx.db.patch(made._id, { hidden: true, tipVisible: undefined });
  await adjustRecipe(ctx, made.recipeId, { madeCount: -1, ratingSum: -made.rating });
}

/** Deletes a made entry, fixing counters and closing reports about it. */
export async function deleteMade(ctx: MutationCtx, made: Doc<'hubMade'>, resolution: string) {
  await ctx.db.delete(made._id);
  if (!made.hidden) await adjustRecipe(ctx, made.recipeId, { madeCount: -1, ratingSum: -made.rating });
  const open = await ctx.db.query('hubReports').withIndex('by_recipeId_and_status', (q) => q.eq('recipeId', made.recipeId).eq('status', 'open')).take(200);
  for (const report of open) {
    if (report.tipId === made._id) await ctx.db.patch(report._id, { status: 'actioned', resolution, resolvedAt: Date.now() });
  }
}

// ── Deleting a recipe ──────────────────────────────────────────────────

const CHILD_BATCH = 200;
/**
 * Deletes a recipe with its likes, saves, made entries, tag rows and photo,
 * and closes its open reports. Returns false when there was more attached
 * than one pass removes; call again until it returns true.
 */
export async function deleteRecipe(ctx: MutationCtx, recipe: Recipe, resolution: string): Promise<boolean> {
  const id = recipe._id;
  const likes = await ctx.db.query('hubLikes').withIndex('by_recipeId_and_userId', (q) => q.eq('recipeId', id)).take(CHILD_BATCH);
  const saves = await ctx.db.query('hubSaves').withIndex('by_recipeId_and_clientKey', (q) => q.eq('recipeId', id)).take(CHILD_BATCH);
  const made = await ctx.db.query('hubMade').withIndex('by_recipeId_and_userId', (q) => q.eq('recipeId', id)).take(CHILD_BATCH);
  const reports = await ctx.db.query('hubReports').withIndex('by_recipeId_and_status', (q) => q.eq('recipeId', id).eq('status', 'open')).take(CHILD_BATCH);
  for (const row of [...likes, ...saves, ...made]) await ctx.db.delete(row._id);
  for (const report of reports) await ctx.db.patch(report._id, { status: 'actioned', resolution, resolvedAt: Date.now() });
  if ([likes, saves, made, reports].some((rows) => rows.length === CHILD_BATCH)) return false;
  await syncRecipe(ctx, id, { deleting: true });
  await deletePhoto(ctx, recipe.photoId);
  await ctx.db.delete(id);
  return true;
}

// ── Moderator actions shared by the CLI commands and the moderator API ──

/**
 * Hides a recipe for everyone; its author can't republish it. Its stored
 * photo is deleted so the photo's link stops working too (a restored recipe
 * gets its photo back when the author republishes).
 */
export async function removeRecipe(ctx: MutationCtx, id: Id<'hubRecipes'>, reason: string | undefined, now = Date.now()) {
  const recipe = await ctx.db.get(id);
  if (!recipe) return;
  await ctx.db.patch(id, { visibility: 'private', removedAt: now, removalReason: reason?.slice(0, 200), underReview: undefined, photoId: undefined, photoType: undefined });
  await deletePhoto(ctx, recipe.photoId);
  await syncRecipe(ctx, id);
}

export const BAN_RECIPE_BATCH = 100;
export const BAN_MADE_BATCH = 100;
/**
 * Removes a banned cook's remaining recipes and hides their tips, a batch at a
 * time. Returns how many recipes it removed and whether another pass is needed.
 */
export async function removeBannedContent(ctx: MutationCtx, userId: Id<'users'>, reason: string) {
  const now = Date.now();
  const recipes = await ctx.db
    .query('hubRecipes')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .filter((q) => q.eq(q.field('removedAt'), undefined))
    .take(BAN_RECIPE_BATCH);
  for (const recipe of recipes) await removeRecipe(ctx, recipe._id, `Author banned: ${reason}`, now);
  const made = await ctx.db
    .query('hubMade')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .filter((q) => q.neq(q.field('hidden'), true))
    .take(BAN_MADE_BATCH);
  for (const entry of made) await hideMade(ctx, entry);
  return { recipesRemoved: recipes.length, more: recipes.length === BAN_RECIPE_BATCH || made.length === BAN_MADE_BATCH };
}

// ── API v2 shapes ──────────────────────────────────────────────────────

export type AuthorCache = Map<Id<'users'>, Author | null>;
/** The author as shown publicly, or null when the account is gone. */
export async function authorOf(ctx: QueryCtx, userId: Id<'users'>, cache?: AuthorCache): Promise<Author | null> {
  if (cache?.has(userId)) return cache.get(userId)!;
  const user = await ctx.db.get(userId);
  const author = user ? { id: userId as string, name: user.name?.trim() || DEFAULT_DISPLAY_NAME } : null;
  cache?.set(userId, author);
  return author;
}

export function shareUrlOf(id: Id<'hubRecipes'>): string | undefined {
  const base = process.env.SHARE_URL_BASE?.trim().replace(/\/+$/, '');
  return base && /^https?:\/\//.test(base) ? `${base}/${id}` : undefined;
}

/**
 * A URL for the recipe's photo. Stored photos use a file storage URL;
 * a photo still inline in an unmigrated document is served by this service.
 */
export async function photoUrlOf(ctx: QueryCtx, recipe: Recipe): Promise<string | undefined> {
  if (recipe.photoId) return (await ctx.storage.getUrl(recipe.photoId)) ?? undefined;
  const site = process.env.CONVEX_SITE_URL;
  return recipe.snapshot.photoDataUrl && site ? `${site}/api/v2/recipes/${recipe._id}/photo?r=${recipe.revision}` : undefined;
}

export async function isLiked(ctx: QueryCtx, recipeId: Id<'hubRecipes'>, userId: Id<'users'>) {
  return !!(await ctx.db.query('hubLikes').withIndex('by_recipeId_and_userId', (q) => q.eq('recipeId', recipeId).eq('userId', userId)).unique());
}

/** The list shape of a recipe, or null when its author's account is gone. */
export async function toListing(ctx: QueryCtx, recipe: Recipe, viewer: Id<'users'> | null, cache?: AuthorCache): Promise<Listing | null> {
  const author = await authorOf(ctx, recipe.userId, cache);
  if (!author) return null;
  const { snapshot } = recipe;
  const listing: Listing = {
    id: recipe._id,
    revision: recipe.revision,
    createdAt: new Date(recipe._creationTime).toISOString(),
    updatedAt: new Date(recipe.updatedAt || recipe._creationTime).toISOString(),
    author,
    title: snapshot.title,
    tags: snapshot.tags,
    ingredientNames: ingredientNames(snapshot),
    likeCount: recipe.likeCount ?? 0,
    saveCount: recipe.saveCount ?? 0,
    madeCount: recipe.madeCount ?? 0,
  };
  if (snapshot.description !== undefined) listing.description = snapshot.description;
  if (snapshot.servings !== undefined) listing.servings = snapshot.servings;
  if (snapshot.totalTimeMinutes !== undefined) listing.totalTimeMinutes = snapshot.totalTimeMinutes;
  const photoUrl = await photoUrlOf(ctx, recipe);
  if (photoUrl) listing.photoUrl = photoUrl;
  const rating = ratingOf(recipe);
  if (rating !== undefined) listing.rating = rating;
  const shareUrl = shareUrlOf(recipe._id);
  if (shareUrl) listing.shareUrl = shareUrl;
  if (viewer) listing.liked = await isLiked(ctx, recipe._id, viewer);
  return listing;
}

export async function toListings(ctx: QueryCtx, recipes: (Recipe | null)[], viewer: Id<'users'> | null, keep: (recipe: Recipe) => boolean = isListed): Promise<Listing[]> {
  const cache: AuthorCache = new Map();
  const listings: Listing[] = [];
  for (const recipe of recipes) {
    if (!recipe || !keep(recipe)) continue;
    const listing = await toListing(ctx, recipe, viewer, cache);
    if (listing) listings.push(listing);
  }
  return listings;
}

export async function isModerator(ctx: QueryCtx, userId: Id<'users'>) {
  return !!(await ctx.db.query('hubModerators').withIndex('by_userId', (q) => q.eq('userId', userId)).first());
}
