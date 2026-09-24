import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
import { hashCommunityToken, newPublisherToken } from './hub';
import { AppleTokenError, appleConfig, exchangeAuthorizationCode, revokeAppleToken, verifyIdentityToken } from './appleAuth';
import { BodyTooLarge, bearerUser, clientAddress, json, readBoundedJson } from './httpUtil';

const str = (value: unknown, min: number, max: number) =>
  typeof value === 'string' && value.length >= min && value.length <= max ? value : null;

/** POST /api/v1/apple/session {identityToken, authorizationCode, nonce, fullName?} → {token, user}. */
export const appleSession = httpAction(async (ctx, request) => {
  let body: Record<string, unknown>;
  try {
    const parsed = await readBoundedJson(request, 16_000);
    if (!parsed || typeof parsed !== 'object') return json({ error: 'Invalid request' }, 400);
    body = parsed as Record<string, unknown>;
  } catch (error) {
    return json({ error: error instanceof BodyTooLarge ? 'Request too large' : 'Invalid request' }, error instanceof BodyTooLarge ? 413 : 400);
  }
  const identityToken = str(body.identityToken, 20, 8_000);
  const authorizationCode = str(body.authorizationCode, 1, 1_000);
  const nonce = str(body.nonce, 16, 256);
  const fullName = body.fullName === undefined || body.fullName === null ? undefined : str(body.fullName, 0, 200);
  if (!identityToken || !authorizationCode || !nonce || fullName === null) return json({ error: 'Invalid request' }, 400);

  const { allowed } = await ctx.runMutation(internal.rateLimit.checkAndRecord, {
    scope: 'apple-session-ip', subject: clientAddress(request), windowMs: 60_000, max: 30,
  });
  if (!allowed) return json({ error: 'Too many sign-in attempts. Try again in a minute.' }, 429);

  const config = appleConfig();
  if (!config) return json({ error: 'Sign in with Apple is not configured on this community' }, 503);

  let sub: string;
  try {
    sub = (await verifyIdentityToken(identityToken, { audience: config.bundleId, rawNonce: nonce })).sub;
  } catch (error) {
    if (error instanceof AppleTokenError) return json({ error: 'Sign in with Apple could not be verified' }, 401);
    console.error('Apple identity verification unavailable:', error instanceof Error ? error.message : 'unknown error');
    return json({ error: 'Sign in with Apple is unavailable right now' }, 502);
  }

  const perUser = await ctx.runMutation(internal.rateLimit.checkAndRecord, {
    scope: 'apple-session-user', subject: sub, windowMs: 10 * 60_000, max: 10,
  });
  if (!perUser.allowed) return json({ error: 'Too many sign-in attempts. Try again later.' }, 429);

  let refreshToken: string | undefined;
  try {
    refreshToken = await exchangeAuthorizationCode(config, authorizationCode);
  } catch (error) {
    // An existing account keeps its stored refresh token; a new one needs this exchange.
    console.error('Apple code exchange failed:', error instanceof Error ? error.message : 'unknown error');
  }

  const token = newPublisherToken();
  const user = await ctx.runMutation(internal.apple.signIn, { sub, fullName, refreshToken, tokenHash: await hashCommunityToken(token) });
  if (!user) return json({ error: 'Sign in with Apple is unavailable right now' }, 502);
  return json({ token, user: { id: user.userId, name: user.name } });
});

/** POST /api/v1/account/delete: revokes Apple tokens, then deletes the account and its publications. */
export const deleteAccount = httpAction(async (ctx, request) => {
  const userId = await bearerUser(ctx, request);
  if (!userId) return json({ error: 'Not authenticated' }, 401);

  const refreshTokens = await ctx.runQuery(internal.apple.refreshTokensForUser, { userId });
  const config = appleConfig();
  for (const refreshToken of refreshTokens) {
    try {
      if (!config) throw new Error('Sign in with Apple is not configured');
      await revokeAppleToken(config, refreshToken);
    } catch (error) {
      // Deletion proceeds; the person can still remove the app in Apple ID settings.
      console.error('Apple token revocation failed:', error instanceof Error ? error.message : 'unknown error');
    }
  }

  for (let batch = 0; batch < 1_000; batch++) {
    const { done } = await ctx.runMutation(internal.apple.deleteAccountBatch, { userId });
    if (done) return json({ success: true });
  }
  return json({ error: 'Account deletion did not finish. Try again.' }, 500);
});

/** POST /api/v1/me/name {name}: optional display name change, 1–40 characters. */
export const updateName = httpAction(async (ctx, request) => {
  const userId = await bearerUser(ctx, request);
  if (!userId) return json({ error: 'Not authenticated' }, 401);
  try {
    const body = (await readBoundedJson(request, 4_000)) as { name?: unknown } | null;
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name || Array.from(name).length > 40) return json({ error: 'Names are 1–40 characters' }, 400);
    return json(await ctx.runMutation(internal.apple.setName, { userId, name }));
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }
});
