import { v } from 'convex/values';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { storePublisherToken } from './hub';
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
    const name = cleanDisplayName(fullName);
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

export const refreshTokensForUser = internalQuery({
  args: { userId: v.id('users') },
  returns: v.array(v.string()),
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db.query('appleCredentials').withIndex('by_userId', (q) => q.eq('userId', userId)).take(20);
    return rows.map((row) => row.refreshToken);
  },
});

const RECIPE_BATCH = 10;

/**
 * Deletes a community account in batches: publisher tokens first (so nothing
 * new can be published), then recipes, then Apple credentials, Convex Auth
 * accounts, sessions and the user. Call until `done`.
 */
export const deleteAccountBatch = internalMutation({
  args: { userId: v.id('users') },
  returns: v.object({ done: v.boolean() }),
  handler: async (ctx, { userId }) => {
    for (const token of await ctx.db.query('hubTokens').withIndex('by_userId', (q) => q.eq('userId', userId)).take(100)) {
      await ctx.db.delete(token._id);
    }
    const recipes = await ctx.db.query('hubRecipes').withIndex('by_userId', (q) => q.eq('userId', userId)).take(RECIPE_BATCH);
    for (const recipe of recipes) await ctx.db.delete(recipe._id);
    if (recipes.length === RECIPE_BATCH) return { done: false };

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
