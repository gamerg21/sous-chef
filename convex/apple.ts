import { v } from 'convex/values';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { storePublisherToken } from './hub';
import { FILTER_MESSAGE, isObjectionable } from '../src/lib/community-filter';
import { adjustProfile, adjustRecipe, deleteMade, deleteRecipe, profileOf } from './hubLib';
import { APPLE_ISSUER, DEFAULT_DISPLAY_NAME, appleClientSecret, appleConfig, cleanDisplayName } from './appleAuth';

/**
 * Finds or creates the community user for an Apple `sub`, records the latest
 * Apple refresh token and stores a new publisher token hash. Apple shares the
 * name only on first authorization, so an existing name is never replaced.
 */
export const signIn = internalMutation({
  args: { sub: v.string(), fullName: v.optional(v.string()), refreshToken: v.optional(v.string()), tokenHash: v.string() },
  returns: v.union(v.object({ userId: v.id('users'), name: v.string() }), v.null()),
  handler: async (ctx, { sub, fullName, refreshToken, tokenHash }) => {
    // A name the word filter refuses is dropped, like a missing one; sign-in still works.
    const offered = cleanDisplayName(fullName);
    const name = isObjectionable(offered) ? undefined : offered;
    if (await ctx.db.query('hubBans').withIndex('by_appleSub', (q) => q.eq('appleSub', sub)).first()) {
      throw new Error('This community account is suspended');
    }
    const account = await ctx.db
      .query('authAccounts')
      .withIndex('providerAndAccountId', (q) => q.eq('provider', 'apple').eq('providerAccountId', sub))
      .unique();
    const credential = await ctx.db.query('appleCredentials').withIndex('by_sub', (q) => q.eq('sub', sub)).unique();
    // Without a refresh token the account could not be revoked on deletion.
    if (!refreshToken && !credential) return null;

    let userId = account?.userId;
    let user = userId ? await ctx.db.get(userId) : null;
    if (!user) {
      if (account) await ctx.db.delete(account._id);
      userId = await ctx.db.insert('users', { name: name ?? DEFAULT_DISPLAY_NAME });
      await ctx.db.insert('authAccounts', { userId, provider: 'apple', providerAccountId: sub });
      user = await ctx.db.get(userId);
    } else if (name && !user.name?.trim()) {
      await ctx.db.patch(user._id, { name });
    }

    if (credential && credential.userId !== userId) await ctx.db.delete(credential._id);
    if (credential && credential.userId === userId) {
      if (refreshToken) await ctx.db.patch(credential._id, { refreshToken, createdAt: Date.now() });
    } else {
      await ctx.db.insert('appleCredentials', { userId: userId!, sub, refreshToken: refreshToken ?? credential!.refreshToken, createdAt: Date.now() });
    }

    await storePublisherToken(ctx, userId!, tokenHash, { replaceOldest: true });
    const current = await ctx.db.get(userId!);
    return { userId: userId!, name: current?.name?.trim() || DEFAULT_DISPLAY_NAME };
  },
});

export const isSuspended = internalQuery({
  args: { sub: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { sub }) => !!(await ctx.db.query('hubBans').withIndex('by_appleSub', (q) => q.eq('appleSub', sub)).first()),
});

export const refreshTokensForUser = internalQuery({
  args: { userId: v.id('users') },
  returns: v.array(v.string()),
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db.query('appleCredentials').withIndex('by_userId', (q) => q.eq('userId', userId)).take(20);
    return rows.map((row) => row.refreshToken);
  },
});

const RECIPE_BATCH = 10;
const ACTIVITY_BATCH = 100;

/**
 * Deletes a community account in batches: publisher tokens first (so nothing
 * new can be published), then recipes with their photos, likes and tips,
 * then the person's own likes, tips and follows (fixing the counters they
 * touched), their profile and moderator role, and finally Apple credentials,
 * Convex Auth accounts, sessions and the user. Call until `done`.
 */
export const deleteAccountBatch = internalMutation({
  args: { userId: v.id('users') },
  returns: v.object({ done: v.boolean() }),
  handler: async (ctx, { userId }) => {
    for (const token of await ctx.db.query('hubTokens').withIndex('by_userId', (q) => q.eq('userId', userId)).take(100)) {
      await ctx.db.delete(token._id);
    }
    const recipes = await ctx.db.query('hubRecipes').withIndex('by_userId', (q) => q.eq('userId', userId)).take(RECIPE_BATCH);
    for (const recipe of recipes) {
      if (!(await deleteRecipe(ctx, recipe, 'The author deleted their account'))) return { done: false };
    }
    if (recipes.length === RECIPE_BATCH) return { done: false };

    const likes = await ctx.db.query('hubLikes').withIndex('by_userId', (q) => q.eq('userId', userId)).take(ACTIVITY_BATCH);
    for (const like of likes) {
      await ctx.db.delete(like._id);
      await adjustRecipe(ctx, like.recipeId, { likeCount: -1 });
    }
    const made = await ctx.db.query('hubMade').withIndex('by_userId', (q) => q.eq('userId', userId)).take(ACTIVITY_BATCH);
    for (const entry of made) await deleteMade(ctx, entry, 'The author deleted their account');
    const following = await ctx.db.query('hubFollows').withIndex('by_followerId_and_followeeId', (q) => q.eq('followerId', userId)).take(ACTIVITY_BATCH);
    for (const follow of following) {
      await ctx.db.delete(follow._id);
      await adjustProfile(ctx, follow.followeeId, 'followerCount', -1);
    }
    const followers = await ctx.db.query('hubFollows').withIndex('by_followeeId', (q) => q.eq('followeeId', userId)).take(ACTIVITY_BATCH);
    for (const follow of followers) {
      await ctx.db.delete(follow._id);
      await adjustProfile(ctx, follow.followerId, 'followingCount', -1);
    }
    if ([likes, made, following, followers].some((rows) => rows.length === ACTIVITY_BATCH)) return { done: false };
    const profile = await profileOf(ctx, userId);
    if (profile) await ctx.db.delete(profile._id);
    for (const row of await ctx.db.query('hubModerators').withIndex('by_userId', (q) => q.eq('userId', userId)).take(10)) {
      await ctx.db.delete(row._id);
    }

    for (const credential of await ctx.db.query('appleCredentials').withIndex('by_userId', (q) => q.eq('userId', userId)).take(20)) {
      await ctx.db.delete(credential._id);
    }
    for (const account of await ctx.db.query('authAccounts').withIndex('userIdAndProvider', (q) => q.eq('userId', userId)).take(20)) {
      for (const code of await ctx.db.query('authVerificationCodes').withIndex('accountId', (q) => q.eq('accountId', account._id)).take(50)) {
        await ctx.db.delete(code._id);
      }
      await ctx.db.delete(account._id);
    }
    const sessions = await ctx.db.query('authSessions').withIndex('userId', (q) => q.eq('userId', userId)).take(20);
    for (const session of sessions) {
      const refreshTokens = await ctx.db.query('authRefreshTokens').withIndex('sessionId', (q) => q.eq('sessionId', session._id)).take(200);
      for (const refresh of refreshTokens) await ctx.db.delete(refresh._id);
      if (refreshTokens.length === 200) return { done: false };
      await ctx.db.delete(session._id);
    }
    if (sessions.length === 20) return { done: false };
    if (await ctx.db.get(userId)) await ctx.db.delete(userId);
    return { done: true };
  },
});

export const setName = internalMutation({
  args: { userId: v.id('users'), name: v.string() },
  returns: v.object({ name: v.string() }),
  handler: async (ctx, { userId, name }) => {
    const clean = cleanDisplayName(name);
    if (!clean) throw new Error('Name required');
    if (isObjectionable(clean)) throw new Error(FILTER_MESSAGE);
    await ctx.db.patch(userId, { name: clean });
    return { name: clean };
  },
});

/**
 * Operator check (`pnpm exec convex run apple:checkConfig`): exchanges a dummy
 * code. `invalid_grant` means Apple accepted the client secret (team, key, bundle).
 */
export const checkConfig = internalAction({
  args: {},
  returns: v.object({ configured: v.boolean(), appleResponse: v.optional(v.string()), clientAccepted: v.optional(v.boolean()) }),
  handler: async () => {
    const config = appleConfig();
    if (!config) return { configured: false };
    const response = await fetch(`${APPLE_ISSUER}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.bundleId, client_secret: await appleClientSecret(config), code: 'config-check', grant_type: 'authorization_code' }).toString(),
    });
    const error = ((await response.json().catch(() => ({}))) as { error?: string }).error ?? String(response.status);
    return { configured: true, appleResponse: error, clientAccepted: error === 'invalid_grant' };
  },
});
