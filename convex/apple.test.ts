/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test } from 'vitest';
import schema from './schema';
import { api, internal } from './_generated/api';
import { type AppleJwk, APPLE_ISSUER, appleClientSecret, base64UrlDecode, base64UrlEncode, cleanDisplayName, sha256Hex, verifyIdentityToken } from './appleAuth';
import { hashCommunityToken } from './hub';
const modules = import.meta.glob('./**/*.ts');

const encoder = new TextEncoder();
const segment = (value: object) => base64UrlEncode(encoder.encode(JSON.stringify(value)));
const BUNDLE = 'com.example.souschef';
const NOW = Date.UTC(2026, 8, 24);

async function signingKey(kid = 'test-key') {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid, alg: 'RS256', use: 'sig' } as AppleJwk;
  const sign = async (claims: object, header: object = { alg: 'RS256', kid }) => {
    const input = `${segment(header)}.${segment(claims)}`;
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, encoder.encode(input));
    return `${input}.${base64UrlEncode(new Uint8Array(signature))}`;
  };
  return { jwk, sign };
}

const RAW_NONCE = 'raw-nonce-0123456789abcdef';
async function claims(overrides: Record<string, unknown> = {}) {
  const iat = Math.floor(NOW / 1000);
  return { iss: APPLE_ISSUER, aud: BUNDLE, sub: '001234.abcdef.1234', iat, exp: iat + 600, nonce: await sha256Hex(RAW_NONCE), ...overrides };
}

describe('Apple identity token verification', () => {
  test('accepts a valid token and returns its subject', async () => {
    const { jwk, sign } = await signingKey();
    const verified = await verifyIdentityToken(await sign(await claims()), { audience: BUNDLE, rawNonce: RAW_NONCE, keys: [jwk], now: NOW });
    expect(verified.sub).toBe('001234.abcdef.1234');
  });

  test.each([
    ['issuer', { iss: 'https://evil.example' }, 'Wrong issuer'],
    ['audience', { aud: 'com.other.app' }, 'Wrong audience'],
    ['expiry', { exp: Math.floor(NOW / 1000) - 3600 }, 'Token expired'],
    ['nonce', { nonce: 'a'.repeat(64) }, 'Nonce mismatch'],
    ['missing nonce', { nonce: undefined }, 'Nonce mismatch'],
    ['subject', { sub: '' }, 'Missing subject'],
  ])('rejects a wrong %s', async (_label, override, message) => {
    const { jwk, sign } = await signingKey();
    const token = await sign(await claims(override));
    await expect(verifyIdentityToken(token, { audience: BUNDLE, rawNonce: RAW_NONCE, keys: [jwk], now: NOW })).rejects.toThrow(message);
  });

  test('rejects the raw nonce echoed back unhashed', async () => {
    const { jwk, sign } = await signingKey();
    const token = await sign(await claims({ nonce: RAW_NONCE }));
    await expect(verifyIdentityToken(token, { audience: BUNDLE, rawNonce: RAW_NONCE, keys: [jwk], now: NOW })).rejects.toThrow('Nonce mismatch');
  });

  test('rejects forged signatures, unknown keys and malformed tokens', async () => {
    const { jwk } = await signingKey();
    const forger = await signingKey();
    const forged = await forger.sign(await claims());
    await expect(verifyIdentityToken(forged, { audience: BUNDLE, rawNonce: RAW_NONCE, keys: [jwk], now: NOW })).rejects.toThrow('Invalid signature');
    const other = await signingKey('other');
    await expect(verifyIdentityToken(await other.sign(await claims()), { audience: BUNDLE, rawNonce: RAW_NONCE, keys: [jwk], now: NOW })).rejects.toThrow('Unknown signing key');
    await expect(verifyIdentityToken('not-a-token', { audience: BUNDLE, rawNonce: RAW_NONCE, keys: [jwk], now: NOW })).rejects.toThrow('Malformed token');
    const none = `${segment({ alg: 'none', kid: 'test-key' })}.${segment(await claims())}.`;
    await expect(verifyIdentityToken(none, { audience: BUNDLE, rawNonce: RAW_NONCE, keys: [jwk], now: NOW })).rejects.toThrow();
  });
});

test('client secret is an ES256 JWT Apple can verify', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der)).match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----`;
  const secret = await appleClientSecret({ teamId: 'TEAM123456', keyId: 'KEY1234567', bundleId: BUNDLE, privateKey: pem }, NOW);
  const [header, payload, signature] = secret.split('.');
  expect(JSON.parse(new TextDecoder().decode(base64UrlDecode(header)))).toEqual({ alg: 'ES256', kid: 'KEY1234567', typ: 'JWT' });
  const body = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
  expect(body).toMatchObject({ iss: 'TEAM123456', sub: BUNDLE, aud: APPLE_ISSUER });
  expect(body.exp - body.iat).toBeLessThanOrEqual(300);
  expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, base64UrlDecode(signature), encoder.encode(`${header}.${payload}`))).toBe(true);
});

test('display names are trimmed and bounded', () => {
  expect(cleanDisplayName('  Ada   Lovelace ')).toBe('Ada Lovelace');
  expect(cleanDisplayName('   ')).toBeUndefined();
  expect(cleanDisplayName(42)).toBeUndefined();
  expect(cleanDisplayName('x'.repeat(80))).toHaveLength(40);
});

describe('Apple community accounts', () => {
  const snapshot = { version: 1 as const, title: 'Tomato pasta', tags: [], ingredients: [{ name: 'Pasta' }], steps: [{ text: 'Cook.' }] };

  test('creates a user once, keeps its name and issues publisher tokens', async () => {
    const t = convexTest(schema, modules);
    const first = await t.mutation(internal.apple.signIn, { sub: 'apple-1', fullName: ' Ada  Lovelace ', refreshToken: 'r1', tokenHash: 'h1' });
    expect(first).toMatchObject({ name: 'Ada Lovelace' });
    // Apple sends the name only once; later sign-ins must not blank or replace it.
    const again = await t.mutation(internal.apple.signIn, { sub: 'apple-1', refreshToken: 'r2', tokenHash: 'h2' });
    expect(again?.userId).toBe(first?.userId);
    expect(again?.name).toBe('Ada Lovelace');
    expect(await t.query(internal.hub.identify, { hash: 'h1' })).toBe(first?.userId);
    expect(await t.query(internal.hub.identify, { hash: 'h2' })).toBe(first?.userId);
    expect(await t.query(internal.apple.refreshTokensForUser, { userId: first!.userId })).toEqual(['r2']);
    const accounts = await t.run((ctx) => ctx.db.query('authAccounts').collect());
    expect(accounts).toEqual([expect.objectContaining({ provider: 'apple', providerAccountId: 'apple-1', userId: first!.userId })]);
  });

  test('defaults the name and refuses a first sign-in without a refresh token', async () => {
    const t = convexTest(schema, modules);
    expect(await t.mutation(internal.apple.signIn, { sub: 'apple-2', tokenHash: 'h' })).toBeNull();
    expect(await t.mutation(internal.apple.signIn, { sub: 'apple-2', refreshToken: 'r', tokenHash: 'h' })).toMatchObject({ name: 'Community cook' });
  });

  test('deleting an account removes its recipes, tokens, credentials and auth rows', async () => {
    const t = convexTest(schema, modules);
    const user = (await t.mutation(internal.apple.signIn, { sub: 'apple-3', fullName: 'Grace', refreshToken: 'r', tokenHash: 'h' }))!;
    const other = (await t.mutation(internal.apple.signIn, { sub: 'apple-4', refreshToken: 'r4', tokenHash: 'h4' }))!;
    for (let i = 0; i < 12; i++) await t.run((ctx) => ctx.db.insert('hubRecipes', { userId: user.userId, snapshot, revision: 1, visibility: 'public', updatedAt: 0, searchText: 'pasta' }));
    await t.mutation(internal.hub.publish, { userId: other.userId, snapshot, visibility: 'public' });
    await t.run(async (ctx) => {
      const sessionId = await ctx.db.insert('authSessions', { userId: user.userId, expirationTime: NOW });
      await ctx.db.insert('authRefreshTokens', { sessionId, expirationTime: NOW });
    });

    let result = await t.mutation(internal.apple.deleteAccountBatch, { userId: user.userId });
    expect(result.done).toBe(false);
    expect(await t.query(internal.hub.identify, { hash: 'h' })).toBeNull();
    result = await t.mutation(internal.apple.deleteAccountBatch, { userId: user.userId });
    expect(result.done).toBe(true);

    const remaining = await t.run(async (ctx) => ({
      user: await ctx.db.get(user.userId),
      recipes: (await ctx.db.query('hubRecipes').collect()).map((r) => r.userId),
      credentials: (await ctx.db.query('appleCredentials').collect()).map((c) => c.userId),
      accounts: (await ctx.db.query('authAccounts').collect()).map((a) => a.userId),
      sessions: (await ctx.db.query('authSessions').collect()).length,
      refreshTokens: (await ctx.db.query('authRefreshTokens').collect()).length,
    }));
    expect(remaining).toEqual({ user: null, recipes: [other.userId], credentials: [other.userId], accounts: [other.userId], sessions: 0, refreshTokens: 0 });
    expect((await t.query(api.hub.list, {})).recipes).toHaveLength(1);
  });

  test('HTTP endpoints validate input and bearer tokens', async () => {
    const t = convexTest(schema, modules);
    const post = (path: string, body: unknown, token?: string) =>
      t.fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    expect((await post('/api/v1/apple/session', { identityToken: 'x' })).status).toBe(400);
    process.env.APPLE_TEAM_ID = 'TEAM'; process.env.APPLE_KEY_ID = 'KEY'; process.env.APPLE_BUNDLE_ID = BUNDLE; process.env.APPLE_PRIVATE_KEY = 'unused';
    const bogus = await post('/api/v1/apple/session', { identityToken: 'bogus.token.value-that-is-long-enough', authorizationCode: 'code', nonce: RAW_NONCE });
    expect(bogus.status).toBe(401);
    expect((await post('/api/v1/account/delete', {})).status).toBe(401);
    expect((await post('/api/v1/me/name', { name: 'Ada' }, 'nope')).status).toBe(401);

    const token = 'publisher-token';
    const user = (await t.mutation(internal.apple.signIn, { sub: 'apple-5', refreshToken: 'r', tokenHash: await hashCommunityToken(token) }))!;
    expect((await post('/api/v1/me/name', { name: '   ' }, token)).status).toBe(400);
    expect((await post('/api/v1/me/name', { name: 'x'.repeat(41) }, token)).status).toBe(400);
    expect(await (await post('/api/v1/me/name', { name: ' Chef Ada ' }, token)).json()).toEqual({ name: 'Chef Ada' });
    expect((await t.run((ctx) => ctx.db.get(user.userId)))?.name).toBe('Chef Ada');
  });
});

afterEach(() => {
  for (const key of ['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_BUNDLE_ID', 'APPLE_PRIVATE_KEY']) delete process.env[key];
});
