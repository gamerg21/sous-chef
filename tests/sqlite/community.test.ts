import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KitchenDatabase } from '../../src/server/kitchen/database';
import { execute } from '../../src/server/kitchen/execute';
import { encryptSecret, isEncryptedSecret } from '../../src/server/kitchen/secrets';
import { kitchenTest } from './harness';
import type { Id } from '../../src/server/kitchen/_generated/dataModel';
import type { LocalDetail, LocalListing } from '../../src/lib/community-contract';

const ORIGIN = 'https://community.test';
const SECRET = 'instance-secret';
const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const PNG2 = 'data:image/png;base64,iVBORw0KGgoAAAAN';

type Call = { method: string; path: string; auth: string | null; body: any; init: RequestInit };
type Routes = Record<string, (call: Call) => unknown>;
/** Stands in for the community service; unknown routes answer 404. */
function mockRemote(routes: Routes) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    expect(url.origin).toBe(ORIGIN);
    const call: Call = { method: init.method ?? 'GET', path: url.pathname + url.search, auth: new Headers(init.headers).get('authorization'), body: init.body ? JSON.parse(String(init.body)) : undefined, init };
    calls.push(call);
    const route = routes[`${call.method} ${url.pathname}`];
    if (!route) return Response.json({ error: 'Not found' }, { status: 404 });
    const result = await route(call);
    return result instanceof Response ? result : Response.json(result);
  }));
  return calls;
}

const listing = (id: string, overrides: Record<string, unknown> = {}) => ({
  id, revision: 1, createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-02T10:00:00.000Z', author: { id: 'cook-1', name: 'Ada' },
  title: `Recipe ${id}`, description: 'Good', tags: ['dinner'], servings: 2, totalTimeMinutes: 30, photoUrl: `https://files.test/${id}.jpg`,
  ingredientNames: ['Tomatoes', 'Basil'], likeCount: 3, saveCount: 2, madeCount: 1, rating: 4.5, shareUrl: `https://share.test/r/${id}`, ...overrides,
});
const snapshot = (overrides: Record<string, unknown> = {}) => ({ version: 1, title: 'Tomato pasta', description: 'Simple', tags: ['dinner'], servings: 2, totalTimeMinutes: 30, ingredients: [{ name: 'Tomatoes', quantity: 2 }, { name: 'Basil', note: 'torn' }], steps: [{ text: 'Cook' }], ...overrides });
const tip = (id: string, overrides: Record<string, unknown> = {}) => ({ id, author: { id: 'cook-2', name: 'Bo' }, rating: 5, tip: 'Add garlic', createdAt: '2026-11-03T10:00:00.000Z', ...overrides });
const detail = (id: string, overrides: Record<string, unknown> = {}) => ({ ...listing(id), visibility: 'public', snapshot: snapshot(), tips: [tip('t1')], ...overrides });
const publication = (id: string, revision = 1, snap = snapshot()) => ({ id, revision, author: { id: 'cook-1', name: 'Ada' }, createdAt: '2026-11-01T10:00:00.000Z', snapshot: snap });
const cookProfile = (overrides: Record<string, unknown> = {}) => ({ id: 'cook-1', name: 'Ada', bio: 'Home cook', recipeCount: 4, followerCount: 2, followingCount: 1, ...overrides });

async function setup(options: { connected?: boolean } = {}) {
  const db = new KitchenDatabase(':memory:');
  const t = kitchenTest(db);
  const token = await encryptSecret('community-token');
  const ids = await t.run(async ctx => {
    const userId = await ctx.db.insert('users', { name: 'Cook', email: `${crypto.randomUUID()}@example.com` });
    const householdId = await ctx.db.insert('households', { name: 'Kitchen' });
    await ctx.db.insert('householdMembers', { userId, householdId, role: 'owner' });
    const locationId = await ctx.db.insert('kitchenLocations', { householdId, name: 'Pantry' });
    if (options.connected !== false) await ctx.db.insert('communityConnections', { userId, token });
    return { userId, householdId, locationId };
  });
  /** Calls an operation the way the HTTP API does: public operations only. */
  const call = <R = any>(path: string, args: unknown = {}, userId: Id<'users'> | null = ids.userId) => execute<R>(path, args, userId, false, db);
  const stock = (name: string, quantity = 1) => t.run(async ctx => { const foodItemId = await ctx.db.insert('foodItems', { name }); await ctx.db.insert('inventoryItems', { householdId: ids.householdId, foodItemId, locationId: ids.locationId, quantity, unit: 'each' }); });
  const otherUser = () => t.run(async ctx => { const userId = await ctx.db.insert('users', { name: 'Other' }); const householdId = await ctx.db.insert('households', { name: 'Other kitchen' }); await ctx.db.insert('householdMembers', { userId, householdId, role: 'owner' }); return userId; });
  return { db, t, ...ids, call, stock, otherUser };
}

beforeEach(() => { vi.stubEnv('COMMUNITY_API_URL', `${ORIGIN}/`); vi.stubEnv('SECRETS_ENCRYPTION_KEY', SECRET); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('operations from before 1.3.0', () => {
  test('list, get, connection and setConnection keep their requests and results', async () => {
    const k = await setup({ connected: false });
    const calls = mockRemote({
      'GET /api/v1/recipes': () => ({ recipes: [publication('r1', 2, snapshot({ photoDataUrl: PNG }))] }),
      'GET /api/v1/recipes/r1': () => publication('r1'),
      'POST /api/v1/me': () => ({ id: 'cook-9', name: 'Me' }),
    });
    const listed = await k.call('community:listRecipes', { search: 'pasta', tag: 'Dinner', limit: 80 });
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/api/v1/recipes?search=pasta&limit=50', auth: null });
    expect(listed).toEqual({ available: true, recipes: [{ id: 'r1', ...snapshot({ photoDataUrl: PNG }), photoUrl: PNG, ingredients: [{ name: 'Tomatoes', quantity: 2, id: '0' }, { name: 'Basil', note: 'torn', id: '1' }], steps: [{ text: 'Cook', id: '0' }], author: { id: 'cook-1', name: 'Ada' }, createdAt: '2026-11-01T10:00:00.000Z', likes: 0, savedCount: 0 }] });
    expect((await k.call('community:getRecipe', { id: 'r1' })).title).toBe('Tomato pasta');
    expect(await k.call('community:connection')).toEqual({ configured: true, connected: false });
    expect(await k.call('community:setConnection', { token: 'fresh-token' })).toEqual({ success: true });
    expect(calls.at(-1)).toMatchObject({ method: 'POST', path: '/api/v1/me', auth: 'Bearer fresh-token', body: {} });
    expect(await k.call('community:connection')).toEqual({ configured: true, connected: true });
    const stored = await k.t.run(ctx => ctx.db.query('communityConnections').collect());
    expect(isEncryptedSecret(stored[0].token)).toBe(true);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await k.call('community:listRecipes', {})).toEqual({ recipes: [], available: false });
  });

  test('publish and unpublish still use API v1 with the stored token', async () => {
    const k = await setup();
    const recipeId = await k.t.run(async ctx => { const id = await ctx.db.insert('recipes', { householdId: k.householdId, title: 'Mine', visibility: 'private', favorited: false }); await ctx.db.insert('recipeIngredients', { recipeId: id, name: 'Egg', order: 0 }); return id; });
    const calls = mockRemote({ 'POST /api/v1/publish': () => ({ id: 'pub-1', revision: 1 }), 'POST /api/v1/unpublish': () => ({ success: true }) });
    expect(await k.call('community:publishRecipe', { recipeId })).toEqual({ success: true });
    expect(calls[0]).toMatchObject({ auth: 'Bearer community-token', body: { sourceKey: createHash('sha256').update(`${SECRET}:${recipeId}`).digest('hex'), visibility: 'public', snapshot: { version: 1, title: 'Mine', ingredients: [{ name: 'Egg' }] } } });
    expect(await k.call('community:unpublishRecipe', { recipeId })).toEqual({ success: true });
    expect(calls[1]).toMatchObject({ path: '/api/v1/unpublish', auth: 'Bearer community-token', body: { id: 'pub-1' } });
    const stranger = await k.otherUser();
    await expect(k.call('community:publishRecipe', { recipeId }, stranger)).rejects.toThrow('Permission denied');
  });

  test('saveRecipe keeps its result and reports the save with a hashed client key', async () => {
    const k = await setup();
    const calls = mockRemote({ 'GET /api/v1/recipes/r1': () => publication('r1', 3), 'POST /api/v2/save': () => ({ saveCount: 5 }) });
    const saved = await k.call('community:saveRecipe', { recipeId: 'r1' });
    expect(Object.keys(saved)).toEqual(['savedRecipeId']);
    const report = calls.find(call => call.path === '/api/v2/save')!;
    expect(report).toMatchObject({ method: 'POST', auth: null, body: { id: 'r1' } });
    expect(report.body.clientKey).toBe(createHash('sha256').update(`${SECRET}:community-save:${k.userId}`).digest('hex'));
    expect(JSON.stringify(report.body)).not.toContain(k.userId);
    expect(await k.t.run(ctx => ctx.db.query('recipeOrigins').collect())).toMatchObject([{ recipeId: saved.savedRecipeId, remoteId: 'r1', revision: 3, origin: ORIGIN, author: 'Ada' }]);
  });

  test.each([
    ['an error answer', () => Response.json({ error: 'nope' }, { status: 500 })],
    ['a rate limit', () => new Response('slow down', { status: 429 })],
    ['a dropped connection', () => { throw new TypeError('fetch failed'); }],
  ])('a save still succeeds when reporting it meets %s', async (_name, saveRoute) => {
    const k = await setup();
    mockRemote({ 'GET /api/v1/recipes/r1': () => publication('r1'), 'POST /api/v2/save': saveRoute });
    const saved = await k.call('community:saveRecipe', { recipeId: 'r1' });
    expect(await k.t.run(ctx => ctx.db.get(saved.savedRecipeId as Id<'recipes'>))).toMatchObject({ title: 'Tomato pasta' });
  });
});

describe('feeds', () => {
  test('feed sends its filters and the token, and marks saved copies', async () => {
    const k = await setup();
    const calls = mockRemote({
      'GET /api/v1/recipes/r2': () => publication('r2'), 'POST /api/v2/save': () => ({ saveCount: 1 }),
      'GET /api/v2/recipes': () => ({ recipes: [listing('r1', { liked: true }), listing('r2', { photoUrl: 'http://files.test/plain.jpg', shareUrl: 'javascript:alert(1)', extra: 'ignored' })], cursor: 'next' }),
    });
    await k.call('community:saveRecipe', { recipeId: 'r2' });
    const result = await k.call<{ recipes: LocalListing[]; cursor: string | null; available: boolean }>('community:feed', { sort: 'hot', tag: 'dinner', cursor: 'c1', limit: 500 });
    const request = calls.at(-1)!;
    expect(request).toMatchObject({ method: 'GET', auth: 'Bearer community-token' });
    expect(request.init).toMatchObject({ redirect: 'error', cache: 'no-store' });
    expect(Object.fromEntries(new URL(request.path, ORIGIN).searchParams)).toEqual({ sort: 'hot', tag: 'dinner', cursor: 'c1', limit: '50' });
    expect(result).toMatchObject({ cursor: 'next', available: true });
    expect(result.recipes.map(r => [r.id, r.saved, r.liked])).toEqual([['r1', false, true], ['r2', true, undefined]]);
    expect(result.recipes[0]).toEqual({ ...listing('r1', { liked: true }), saved: false });
    // Only https photo and share links reach the browser; unknown fields are dropped.
    expect(result.recipes[1]).not.toHaveProperty('photoUrl');
    expect(result.recipes[1]).not.toHaveProperty('shareUrl');
    expect(result.recipes[1]).not.toHaveProperty('extra');
    expect(result.recipes[1]).not.toHaveProperty('pantry');
  });

  test('a copy in another household does not count as saved, and no token is sent without a connection', async () => {
    const k = await setup();
    mockRemote({ 'GET /api/v1/recipes/r1': () => publication('r1'), 'POST /api/v2/save': () => ({ saveCount: 1 }) });
    await k.call('community:saveRecipe', { recipeId: 'r1' });
    const stranger = await k.otherUser();
    const calls = mockRemote({ 'GET /api/v2/recipes': () => ({ recipes: [listing('r1')], cursor: null }), 'GET /api/v2/recipes/r1': () => detail('r1') });
    expect((await k.call('community:feed', {}, stranger)).recipes).toMatchObject([{ id: 'r1', saved: false }]);
    expect(calls[0]).toMatchObject({ path: '/api/v2/recipes?limit=20', auth: null });
    const other = await k.call<LocalDetail>('community:recipe', { id: 'r1' }, stranger);
    expect(other.saved).toBe(false);
    expect(other).not.toHaveProperty('savedRecipeId');
    // A copy saved from a different community is not this community's recipe.
    await k.t.run(async ctx => { for (const origin of await ctx.db.query('recipeOrigins').collect()) await ctx.db.patch(origin._id, { origin: 'https://elsewhere.test' }); });
    expect((await k.call('community:feed', {})).recipes).toMatchObject([{ id: 'r1', saved: false }]);
  });

  test('hidden recipes, blocked cooks and filtered words are left out', async () => {
    const k = await setup();
    mockRemote({ 'GET /api/v2/recipes': () => ({ recipes: [
      listing('ok'), listing('hidden'), listing('blocked', { author: { id: 'cook-bad', name: 'Bad' } }),
      listing('title', { title: 'Shit on a shingle' }), listing('desc', { description: 'what the fuck' }), listing('tag', { tags: ['dinner', 'Bitch'] }), listing('name', { author: { id: 'cook-3', name: 'asshole' } }),
    ], cursor: null }), 'POST /api/v2/feed/following': () => ({ recipes: [listing('ok'), listing('hidden')], cursor: null }) });
    expect(await k.call('community:hide', { kind: 'recipe', key: 'hidden', label: 'Recipe hidden', hidden: true })).toEqual({ success: true });
    await k.call('community:hide', { kind: 'author', key: 'cook-bad', label: 'Bad', hidden: true });
    expect((await k.call('community:feed', {})).recipes.map((r: LocalListing) => r.id)).toEqual(['ok']);
    expect((await k.call('community:followingFeed', {})).recipes.map((r: LocalListing) => r.id)).toEqual(['ok']);
    // Hide lists are per person.
    const stranger = await k.otherUser();
    expect((await k.call('community:feed', {}, stranger)).recipes.map((r: LocalListing) => r.id)).toEqual(['ok', 'hidden', 'blocked']);
    expect(await k.call('community:hidden', {}, stranger)).toEqual({ recipes: [], authors: [] });
    expect(await k.call('community:hidden')).toEqual({ recipes: [{ key: 'hidden', label: 'Recipe hidden' }], authors: [{ key: 'cook-bad', label: 'Bad' }] });
    await k.call('community:hide', { kind: 'recipe', key: 'hidden', label: 'Recipe hidden', hidden: true });
    await k.call('community:hide', { kind: 'author', key: 'cook-bad', label: '', hidden: false });
    expect(await k.call('community:hidden')).toEqual({ recipes: [{ key: 'hidden', label: 'Recipe hidden' }], authors: [] });
    expect((await k.call('community:feed', {})).recipes.map((r: LocalListing) => r.id)).toEqual(['ok', 'blocked']);
  });

  test('pantry order follows cursors and ranks by share on hand, then count', async () => {
    const k = await setup();
    await k.stock('tomato'); await k.stock('Fresh Basil'); await k.stock('EGGS'); await k.stock('Flour'); await k.stock('Milk', 0);
    const pages: Record<string, unknown> = {
      first: { recipes: [listing('none', { ingredientNames: ['Saffron', 'Milk'] }), listing('half', { ingredientNames: ['Tomatoes', 'Saffron', 'Salt', 'Water', 'black pepper'] })], cursor: 'second' },
      second: { recipes: [listing('all-2', { ingredientNames: ['Eggs', 'flour!', 'Egg'] }), listing('all-1', { ingredientNames: ['fresh  basil'] }), listing('empty', { ingredientNames: [] })], cursor: null },
    };
    const calls = mockRemote({ 'GET /api/v2/recipes': call => pages[new URL(call.path, ORIGIN).searchParams.get('cursor') ?? 'first'] });
    const result = await k.call<{ recipes: LocalListing[]; cursor: string | null }>('community:feed', { pantry: true, sort: 'top', limit: 5 });
    expect(calls.map(call => call.path)).toEqual(['/api/v2/recipes?sort=top&limit=50', '/api/v2/recipes?sort=top&cursor=second&limit=50']);
    expect(result.cursor).toBeNull();
    expect(result.recipes.map(r => [r.id, r.pantry])).toEqual([
      ['all-2', { have: 2, total: 2, missing: [] }], ['all-1', { have: 1, total: 1, missing: [] }],
      ['half', { have: 1, total: 2, missing: ['Saffron'] }], ['none', { have: 0, total: 2, missing: ['Saffron', 'Milk'] }], ['empty', { have: 0, total: 0, missing: [] }],
    ]);
    // Nothing about the pantry goes to the community.
    expect(JSON.stringify(calls)).not.toMatch(/tomato|basil|flour/i);
  });

  test('pantry reading stops at 100 listings', async () => {
    const k = await setup();
    let served = 0;
    const calls = mockRemote({ 'GET /api/v2/recipes': () => ({ recipes: Array.from({ length: 40 }, () => listing(`r${served++}`)), cursor: `c${served}` }) });
    const result = await k.call('community:feed', { pantry: true });
    expect(calls).toHaveLength(3);
    expect(result.recipes).toHaveLength(100);
    expect(result.cursor).toBeNull();
  });

  test('following feed posts the cursor and needs an account', async () => {
    const k = await setup();
    const calls = mockRemote({ 'POST /api/v2/feed/following': () => ({ recipes: [listing('r1')], cursor: null }) });
    expect(await k.call('community:followingFeed', { cursor: 'c2', limit: 10 })).toMatchObject({ recipes: [{ id: 'r1', saved: false }], cursor: null, available: true });
    expect(calls[0]).toMatchObject({ method: 'POST', auth: 'Bearer community-token', body: { cursor: 'c2', limit: 10 } });
    const stranger = await k.otherUser();
    await expect(k.call('community:followingFeed', {}, stranger)).rejects.toThrow('Connect your community account first');
    expect(calls).toHaveLength(1);
  });

  test('feeds report an unconfigured or unreachable service as unavailable', async () => {
    const k = await setup();
    const fetcher = vi.fn().mockRejectedValue(new TypeError('getaddrinfo ENOTFOUND community.test'));
    vi.stubGlobal('fetch', fetcher);
    const unavailable = { recipes: [], cursor: null, available: false };
    expect(await k.call('community:feed', {})).toEqual(unavailable);
    expect(await k.call('community:followingFeed', {})).toEqual(unavailable);
    expect(await k.call('community:tags')).toEqual({ tags: [] });
    mockRemote({ 'GET /api/v2/recipes': () => new Response('upstream stack trace', { status: 502 }) });
    expect(await k.call('community:feed', {})).toEqual(unavailable);
    vi.stubEnv('COMMUNITY_API_URL', '');
    fetcher.mockClear(); vi.stubGlobal('fetch', fetcher);
    expect(await k.call('community:feed', {})).toEqual(unavailable);
    expect(await k.call('community:me')).toEqual({ configured: false, connected: true, me: null });
    expect(await k.call('community:updates')).toEqual({ updates: [] });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('recipes, cooks and the account', () => {
  test('recipe detail adds the saved copy and pantry match and filters tips', async () => {
    const k = await setup();
    await k.stock('Basil');
    const viewer = { liked: true, following: false, own: false, made: { rating: 4 } };
    const calls = mockRemote({
      'GET /api/v1/recipes/r1': () => publication('r1'), 'POST /api/v2/save': () => ({ saveCount: 1 }),
      'GET /api/v2/recipes/r1': () => detail('r1', { viewer, tips: [tip('t1'), tip('t2', { author: { id: 'cook-bad', name: 'Bad' } }), tip('t3', { tip: 'fucking great' })] }),
    });
    const { savedRecipeId } = await k.call('community:saveRecipe', { recipeId: 'r1' });
    await k.call('community:hide', { kind: 'author', key: 'cook-bad', label: 'Bad', hidden: true });
    const result = await k.call<LocalDetail>('community:recipe', { id: 'r1' });
    expect(calls.at(-1)).toMatchObject({ method: 'GET', path: '/api/v2/recipes/r1', auth: 'Bearer community-token' });
    expect(result).toEqual({ ...detail('r1', { viewer, tips: [tip('t1')] }), saved: true, savedRecipeId, pantry: { have: 1, total: 2, missing: ['Tomatoes'] } });
  });

  test('a hidden, blocked or filtered recipe has no detail', async () => {
    const k = await setup();
    mockRemote({
      'GET /api/v2/recipes/hidden': () => detail('hidden'), 'GET /api/v2/recipes/blocked': () => detail('blocked', { author: { id: 'cook-bad', name: 'Bad' } }),
      'GET /api/v2/recipes/step': () => detail('step', { snapshot: snapshot({ steps: [{ text: 'Stir, you bastard' }] }) }), 'GET /api/v2/recipes/swap': () => detail('other'),
    });
    await k.call('community:hide', { kind: 'recipe', key: 'hidden', label: 'x', hidden: true });
    await k.call('community:hide', { kind: 'author', key: 'cook-bad', label: 'Bad', hidden: true });
    for (const id of ['hidden', 'blocked', 'step', 'swap']) await expect(k.call('community:recipe', { id })).rejects.toThrow("This recipe isn't available");
    await expect(k.call('community:recipe', { id: 'gone' })).rejects.toThrow("This isn't available in the community anymore");
  });

  test('tips, tags and cooks', async () => {
    const k = await setup();
    const calls = mockRemote({
      'GET /api/v2/recipes/r%201/tips': () => ({ tips: [tip('t1'), tip('t2', { author: { id: 'cook-2', name: 'cunt' } })], cursor: 'more' }),
      'GET /api/v2/tags': () => ({ tags: [{ tag: 'dinner', count: 9 }, { tag: 'shit', count: 2 }] }),
      'GET /api/v2/cooks/cook-1': () => cookProfile({ viewer: { following: true, own: false }, bio: 'fuck off' }),
      'GET /api/v2/cooks/cook-2': () => cookProfile({ id: 'cook-2', name: 'Slut' }),
    });
    expect(await k.call('community:tips', { id: 'r 1', cursor: 'c&1' })).toEqual({ tips: [tip('t1')], cursor: 'more' });
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/api/v2/recipes/r%201/tips?cursor=c%261' });
    expect(await k.call('community:tags')).toEqual({ tags: [{ tag: 'dinner', count: 9 }] });
    expect(calls[1]).toMatchObject({ method: 'GET', path: '/api/v2/tags', auth: null });
    const withoutBio = cookProfile({ viewer: { following: true, own: false }, bio: undefined });
    const visible = await k.call('community:cook', { id: 'cook-1' });
    expect(visible).toEqual({ ...withoutBio, blocked: false });
    expect(visible).not.toHaveProperty('bio');
    expect(calls[2]).toMatchObject({ method: 'GET', path: '/api/v2/cooks/cook-1', auth: 'Bearer community-token' });
    await k.call('community:hide', { kind: 'author', key: 'cook-1', label: 'Ada', hidden: true });
    expect(await k.call('community:cook', { id: 'cook-1' })).toMatchObject({ id: 'cook-1', blocked: true });
    await expect(k.call('community:cook', { id: 'cook-2' })).rejects.toThrow("This cook isn't available");
  });

  test('me never throws', async () => {
    const k = await setup();
    const profile = { ...cookProfile(), moderator: true };
    const calls = mockRemote({ 'POST /api/v2/me': () => profile });
    expect(await k.call('community:me')).toEqual({ configured: true, connected: true, me: profile });
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/api/v2/me', auth: 'Bearer community-token', body: {} });
    const stranger = await k.otherUser();
    expect(await k.call('community:me', {}, stranger)).toEqual({ configured: true, connected: false, me: null });
    expect(calls).toHaveLength(1);
    for (const answer of [() => new Response('', { status: 401 }), () => new Response('down', { status: 503 }), () => ({ id: 'cook-1' }), () => { throw new TypeError('offline'); }]) {
      mockRemote({ 'POST /api/v2/me': answer });
      expect(await k.call('community:me')).toEqual({ configured: true, connected: true, me: null });
    }
  });

  const signedIn: [string, unknown, string, unknown, unknown][] = [
    ['community:updateProfile', { name: '  Ada L ', bio: 'Cooks' }, 'me/profile', { name: 'Ada L', bio: 'Cooks' }, { ...cookProfile(), moderator: false }],
    ['community:myRecipes', { cursor: 'c1' }, 'me/recipes', { cursor: 'c1' }, { recipes: [{ ...listing('r1'), visibility: 'private', removed: false, underReview: true }], cursor: null }],
    ['community:like', { id: 'r1', liked: true }, 'like', { id: 'r1', liked: true }, { liked: true, likeCount: 4 }],
    ['community:made', { id: 'r1', rating: 5, tip: ' Lovely ' }, 'made', { id: 'r1', rating: 5, tip: 'Lovely' }, { madeCount: 2, rating: 4.5 }],
    ['community:removeMade', { id: 'r1' }, 'made/delete', { id: 'r1' }, { madeCount: 1 }],
    ['community:follow', { userId: 'cook-1', following: true }, 'follow', { userId: 'cook-1', following: true }, { following: true, followerCount: 3 }],
    ['community:modReports', { status: 'actioned' }, 'mod/reports', { status: 'actioned' }, { reports: [{ id: 'rep1', status: 'actioned', createdAt: '2026-11-04T10:00:00.000Z', reason: 'spam', reportCount: 2, recipe: { id: 'r1', title: 'Spam', author: { id: 'cook-1', name: 'Ada' }, visibility: 'public', underReview: true }, tip: { id: 't1', author: { id: 'cook-2', name: 'Bo' }, rating: 1, tip: 'buy now' }, resolution: 'remove_recipe', resolvedAt: '2026-11-05T10:00:00.000Z' }, { id: 'rep2', status: 'open', createdAt: '2026-11-04T10:00:00.000Z', reason: 'other', note: 'see step 2', reportCount: 1, recipe: null }], cursor: 'c2' }],
    ['community:modResolve', { reportId: 'rep1', action: 'remove_recipe', reason: 'Spam' }, 'mod/resolve', { reportId: 'rep1', action: 'remove_recipe', reason: 'Spam' }, { success: true }],
  ];
  test.each(signedIn)('%s forwards with the token and needs an account', async (operation, args, path, body, answer) => {
    const k = await setup();
    const calls = mockRemote({ [`POST /api/v2/${path}`]: () => answer });
    expect(await k.call(operation, args)).toEqual(answer);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'POST', path: `/api/v2/${path}`, auth: 'Bearer community-token' });
    expect(calls[0].body).toEqual(body);
    const stranger = await k.otherUser();
    await expect(k.call(operation, args, stranger)).rejects.toThrow('Connect your community account first');
    await expect(k.call(operation, args, null)).rejects.toThrow('Not authenticated');
    await expect(k.call(operation, args, 'users_missing' as Id<'users'>)).rejects.toThrow('Not authenticated');
    expect(calls).toHaveLength(1);
  });

  test('profile, rating and tip text is checked before it is sent', async () => {
    const k = await setup();
    const calls = mockRemote({});
    await expect(k.call('community:updateProfile', { name: '   ' })).rejects.toThrow('Name must be');
    await expect(k.call('community:updateProfile', { bio: 'x'.repeat(161) })).rejects.toThrow('Bio must be');
    await expect(k.call('community:updateProfile', { name: 'Shit cook' })).rejects.toThrow("This text isn't allowed in the community");
    await expect(k.call('community:made', { id: 'r1', rating: 4.5 })).rejects.toThrow('Rating must be');
    await expect(k.call('community:made', { id: 'r1', rating: 6 })).rejects.toThrow('Rating must be');
    await expect(k.call('community:made', { id: 'r1', rating: 5, tip: 'x'.repeat(281) })).rejects.toThrow('Tip must be');
    await expect(k.call('community:made', { id: 'r1', rating: 5, tip: 'bullshit' })).rejects.toThrow("This text isn't allowed in the community");
    await expect(k.call('community:feed', { sort: 'best' })).rejects.toThrow('Invalid');
    await expect(k.call('community:report', { recipeId: 'r1', reason: 'boring' })).rejects.toThrow('Invalid');
    await expect(k.call('community:modResolve', { reportId: 'rep1', action: 'delete_everything' })).rejects.toThrow('Invalid');
    expect(calls).toHaveLength(0);
  });

  test('report files the report with a hashed client key and hides the recipe', async () => {
    const k = await setup();
    const calls = mockRemote({ 'POST /api/v2/report': () => ({ success: true }) });
    expect(await k.call('community:report', { recipeId: 'r1', tipId: 't1', reason: 'spam', note: ' Sells pills ' })).toEqual({ success: true });
    expect(calls[0]).toMatchObject({ method: 'POST', auth: 'Bearer community-token' });
    const key = createHash('sha256').update(`${SECRET}:community-report:${k.userId}`).digest('hex');
    expect(calls[0].body).toEqual({ recipeId: 'r1', tipId: 't1', reason: 'spam', note: 'Sells pills', clientKey: key });
    expect(key).not.toBe(createHash('sha256').update(`${SECRET}:community-save:${k.userId}`).digest('hex'));
    // A tip report hides that tip only; a recipe report hides the recipe.
    expect(await k.call('community:hidden')).toEqual({ recipes: [], authors: [] });
    await k.call('community:report', { recipeId: 'r1', reason: 'spam' });
    expect(await k.call('community:hidden')).toEqual({ recipes: [{ key: 'r1', label: 'Reported recipe' }], authors: [] });
    // No account is needed to report; a failed report hides nothing.
    const stranger = await k.otherUser();
    await k.call('community:report', { recipeId: 'r2', reason: 'other' }, stranger);
    expect(calls[2].auth).toBeNull();
    expect(calls[2].body).toEqual({ recipeId: 'r2', reason: 'other', clientKey: expect.stringMatching(/^[0-9a-f]{64}$/) });
    mockRemote({ 'POST /api/v2/report': () => new Response('', { status: 429 }) });
    await expect(k.call('community:report', { recipeId: 'r3', reason: 'spam' })).rejects.toThrow('Try again in a little while');
    expect((await k.call('community:hidden')).recipes).toHaveLength(1);
  });
});

describe('remote failures', () => {
  test('one publication this server cannot read is left out of the page, and long fields the service accepts are kept', async () => {
    const k = await setup();
    const good = { id: 'ok1', revision: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', author: { id: 'a1', name: 'Ann' }, title: 'Fine', tags: ['t'.repeat(101)], servings: -2, ingredientNames: ['n'.repeat(600)], likeCount: 0, saveCount: 0, madeCount: 0 };
    mockRemote({ 'GET /api/v2/recipes': () => ({ recipes: [good, { ...good, id: 'bad1', title: 7 }], cursor: null }) });
    const page = await k.call('community:feed', {});
    expect(page.recipes.map((recipe: { id: string }) => recipe.id)).toEqual(['ok1']);
    expect(page.recipes[0].tags[0]).toHaveLength(101);
    expect(page.recipes[0].servings).toBeUndefined();
  });
  test('browsing and reporting keep working after the stored sign-in expires', async () => {
    const k = await setup();
    const calls = mockRemote({
      'GET /api/v2/recipes': call => call.auth ? new Response('', { status: 401 }) : { recipes: [], cursor: null },
      'POST /api/v2/report': call => call.auth ? new Response('', { status: 401 }) : { success: true },
      'POST /api/v2/like': () => new Response('', { status: 401 }),
    });
    expect(await k.call('community:feed', {})).toEqual({ recipes: [], cursor: null, available: true });
    expect(calls.map(call => call.auth)).toEqual(['Bearer community-token', null]);
    expect(await k.call('community:report', { recipeId: 'r1', reason: 'spam' })).toEqual({ success: true });
    await expect(k.call('community:like', { id: 'r1', liked: true })).rejects.toThrow('Reconnect your community account');
  });
  test('401, 429, 400 and other answers become fixed messages', async () => {
    const k = await setup();
    const answer = (status: number, body: unknown) => mockRemote({ 'GET /api/v2/recipes': () => Response.json(body, { status }), 'POST /api/v2/like': () => Response.json(body, { status }) });
    answer(401, { error: 'token abc123 revoked' });
    await expect(k.call('community:feed', {})).rejects.toThrow('Reconnect your community account');
    await expect(k.call('community:like', { id: 'r1', liked: true })).rejects.toThrow(/^Your community sign-in has expired\. Reconnect your community account$/);
    answer(429, { error: 'limit 30/min for 203.0.113.9' });
    await expect(k.call('community:feed', {})).rejects.toThrow(/^The community is busy\. Try again in a little while$/);
    answer(400, { error: 'You can\u0000 only\n follow 200 cooks', detail: 'internal' });
    await expect(k.call('community:like', { id: 'r1', liked: true })).rejects.toThrow(/^You can only follow 200 cooks$/);
    answer(400, { message: 'stack trace at db.ts:12' });
    await expect(k.call('community:like', { id: 'r1', liked: true })).rejects.toThrow(/^The community service could not complete this request$/);
    answer(403, { error: 'moderator role missing for user u_1' });
    await expect(k.call('community:like', { id: 'r1', liked: true })).rejects.toThrow(/^Your community account isn't allowed to do this$/);
    answer(500, { error: 'secret internals' });
    await expect(k.call('community:like', { id: 'r1', liked: true })).rejects.toThrow(/^The community service could not complete this request$/);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('connect ECONNREFUSED 10.0.0.7:443')));
    await expect(k.call('community:like', { id: 'r1', liked: true })).rejects.toThrow(/^The community service could not be reached$/);
  });

  test('a plain-http community origin is refused in production', async () => {
    const k = await setup();
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('COMMUNITY_API_URL', 'http://localhost:3999');
    await expect(k.call('community:like', { id: 'r1', liked: true })).rejects.toThrow('Community API requires HTTPS');
    expect(await k.call('community:feed', {})).toEqual({ recipes: [], cursor: null, available: false });
    expect(fetcher).not.toHaveBeenCalled();
  });

  const malformed: [string, unknown][] = [
    ['not JSON', new Response('<html>')], ['a bare list', [listing('r1')]], ['a missing title', { recipes: [listing('r1', { title: undefined })], cursor: null }],
    ['an empty id', { recipes: [listing('')], cursor: null }], ['a negative count', { recipes: [listing('r1', { likeCount: -1 })], cursor: null }],
    ['a fractional revision', { recipes: [listing('r1', { revision: 1.5 })], cursor: null }], ['an oversized title', { recipes: [listing('r1', { title: 'x'.repeat(201) })], cursor: null }],
    ['too many tags', { recipes: [listing('r1', { tags: Array(31).fill('a') })], cursor: null }], ['an author without a name', { recipes: [listing('r1', { author: { id: 'c' } })], cursor: null }],
    ['a bad date', { recipes: [listing('r1', { createdAt: 'yesterday' })], cursor: null }], ['a numeric cursor', { recipes: [], cursor: 7 }],
    ['a rating out of range', { recipes: [listing('r1', { rating: 11 })], cursor: null }], ['ingredient names that are not text', { recipes: [listing('r1', { ingredientNames: [{ name: 'x' }] })], cursor: null }],
    ['too many listings', { recipes: Array.from({ length: 101 }, (_, n) => listing(`r${n}`)), cursor: null }],
  ];
  // A response that isn't a page at all is rejected; one unreadable listing is left out of an otherwise good page.
  const WHOLE = new Set(['not JSON', 'a bare list', 'a numeric cursor']);
  test.each(malformed)('a feed with %s is rejected or leaves the listing out', async (name, payload) => {
    const k = await setup();
    mockRemote({ 'GET /api/v2/recipes': () => payload });
    if (WHOLE.has(name)) { await expect(k.call('community:feed', {})).rejects.toThrow('could not read'); return; }
    const page = await k.call('community:feed', {});
    expect(page.recipes).toHaveLength(name === 'too many listings' ? 100 : 0);
  });

  test('malformed details and results are rejected', async () => {
    const k = await setup();
    const bad = async (operation: string, args: unknown, route: string, payload: unknown) => { mockRemote({ [route]: () => payload }); await expect(k.call(operation, args)).rejects.toThrow('could not read'); };
    await bad('community:recipe', { id: 'r1' }, 'GET /api/v2/recipes/r1', detail('r1', { snapshot: snapshot({ title: '' }) }));
    await bad('community:recipe', { id: 'r1' }, 'GET /api/v2/recipes/r1', detail('r1', { snapshot: snapshot({ photoDataUrl: 'https://tracker.test/pixel.gif' }) }));
    await bad('community:recipe', { id: 'r1' }, 'GET /api/v2/recipes/r1', detail('r1', { visibility: 'private' }));
    await bad('community:recipe', { id: 'r1' }, 'GET /api/v2/recipes/r1', detail('r1', { viewer: { liked: 'yes' } }));
    await bad('community:tips', { id: 'r1' }, 'GET /api/v2/recipes/r1/tips', { tips: 'none', cursor: null });
    mockRemote({ 'GET /api/v2/recipes/r1/tips': () => ({ tips: [tip('t1', { rating: 'five' }), tip('t2')], cursor: null }) });
    expect((await k.call('community:tips', { id: 'r1' })).tips.map((entry: { id: string }) => entry.id)).toEqual(['t2']);
    await bad('community:tags', {}, 'GET /api/v2/tags', { tags: [{ tag: 'a', count: '9' }] });
    await bad('community:cook', { id: 'cook-1' }, 'GET /api/v2/cooks/cook-1', cookProfile({ followerCount: null }));
    await bad('community:like', { id: 'r1', liked: true }, 'POST /api/v2/like', { liked: true });
    await bad('community:follow', { userId: 'c', following: true }, 'POST /api/v2/follow', { following: 1, followerCount: 2 });
    await bad('community:modResolve', { reportId: 'r', action: 'dismiss' }, 'POST /api/v2/mod/resolve', { success: 'yes' });
    await bad('community:modReports', {}, 'POST /api/v2/mod/reports', { reports: [{ id: 'rep', status: 'weird' }], cursor: null });
    await bad('community:report', { recipeId: 'r1', reason: 'spam' }, 'POST /api/v2/report', {});
    expect((await k.call('community:hidden')).recipes).toEqual([]);
  });

  test('an oversized response is refused', async () => {
    const k = await setup();
    mockRemote({ 'GET /api/v2/tags': () => new Response('x'.repeat(8_000_001)) });
    await expect(k.call('community:tags')).rejects.toThrow('too large');
  });
});

describe('updates to saved copies', () => {
  async function saved(revision = 1, snap = snapshot({ photoDataUrl: PNG })) {
    const k = await setup();
    mockRemote({ 'GET /api/v1/recipes/r1': () => publication('r1', revision, snap), 'POST /api/v2/save': () => ({ saveCount: 1 }) });
    const { savedRecipeId } = await k.call<{ savedRecipeId: Id<'recipes'> }>('community:saveRecipe', { recipeId: 'r1' });
    const read = () => k.t.run(async ctx => ({
      recipe: (await ctx.db.get(savedRecipeId))!,
      ingredients: (await ctx.db.query('recipeIngredients').withIndex('by_recipeId', q => q.eq('recipeId', savedRecipeId)).collect()).sort((a, b) => a.order - b.order),
      steps: (await ctx.db.query('recipeSteps').withIndex('by_recipeId', q => q.eq('recipeId', savedRecipeId)).collect()).sort((a, b) => a.order - b.order),
      origin: (await ctx.db.query('recipeOrigins').withIndex('by_recipeId', q => q.eq('recipeId', savedRecipeId)).first())!,
      media: await ctx.db.query('mediaAssets').withIndex('by_recipeId', q => q.eq('recipeId', savedRecipeId)).collect(),
      files: k.db.sql.prepare('SELECT id FROM files').all().map(row => `/api/files/${row.id}`),
    }));
    return { ...k, recipeId: savedRecipeId, read };
  }
  const offered = { recipeId: expect.any(String), title: 'Tomato pasta', remoteId: 'r1', savedRevision: 1, latestRevision: 3 };

  test('a newer revision is offered, applied in place, and then no longer offered', async () => {
    const k = await saved();
    await k.t.run(async ctx => {
      await ctx.db.patch(k.recipeId, { favorited: true, notes: 'Ours', sourceUrl: 'https://example.com/original', lastCookedAt: 5, caloriesKcal: 400 });
      const [tomatoes] = await ctx.db.query('recipeIngredients').withIndex('by_recipeId', q => q.eq('recipeId', k.recipeId)).collect();
      await ctx.db.patch(tomatoes._id, { mappingLabel: 'Canned tomatoes' });
      await ctx.db.insert('recipes', { householdId: k.householdId, title: 'Not from the community', visibility: 'private', favorited: false });
    });
    const before = await k.read();
    const next = snapshot({ title: 'Better tomato pasta', description: undefined, tags: ['dinner', 'quick'], servings: 4, totalTimeMinutes: 20, sourceUrl: 'https://example.com/changed', photoDataUrl: PNG2, ingredients: [{ name: 'tomato', quantity: 3 }, { name: 'Garlic', note: 'MAPPING:Salt' }], steps: [{ text: 'Chop' }, { text: 'Simmer' }] });
    const calls = mockRemote({ 'GET /api/v2/revisions': () => ({ revisions: { r1: 3, unrelated: 9 } }), 'GET /api/v2/recipes/r1': () => detail('r1', { revision: 3, snapshot: next }) });
    expect(await k.call('community:updates')).toEqual({ updates: [{ ...offered, recipeId: k.recipeId }] });
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/api/v2/revisions?ids=r1', auth: null });
    expect(await k.call('community:applyUpdate', { recipeId: k.recipeId })).toEqual({ success: true });
    expect(calls[1]).toMatchObject({ method: 'GET', path: '/api/v2/recipes/r1?photo=inline' });
    const after = await k.read();
    expect(after.recipe).toMatchObject({ title: 'Better tomato pasta', tags: ['dinner', 'quick'], servings: 4, totalTimeMinutes: 20, favorited: true, notes: 'Ours', sourceUrl: 'https://example.com/original', lastCookedAt: 5, caloriesKcal: 400, householdId: k.householdId });
    expect(after.recipe).not.toHaveProperty('description');
    expect(after.ingredients.map(i => [i.name, i.quantity, i.note, i.mappingLabel])).toEqual([['tomato', 3, undefined, 'Canned tomatoes'], ['Garlic', undefined, 'Salt', undefined]]);
    expect(after.steps.map(s => s.text)).toEqual(['Chop', 'Simmer']);
    expect(after.origin).toMatchObject({ remoteId: 'r1', revision: 3, author: 'Ada' });
    // The replaced photo's file and media row are gone; only the new one remains.
    expect(after.recipe.photoUrl).not.toBe(before.recipe.photoUrl);
    expect(after.files).toEqual([after.recipe.photoUrl]);
    expect(after.media.map(m => m.url)).toEqual([after.recipe.photoUrl]);
    expect(await k.call('community:updates')).toEqual({ updates: [] });
    // Applying again changes nothing.
    await k.call('community:applyUpdate', { recipeId: k.recipeId });
    expect(await k.read()).toEqual(after);
  });

  test('a photo that is not sent inline is kept, a removed photo is removed, and a shared file survives', async () => {
    const k = await saved();
    const before = await k.read();
    mockRemote({ 'GET /api/v2/recipes/r1': () => detail('r1', { revision: 2 }) });
    await k.call('community:applyUpdate', { recipeId: k.recipeId });
    expect((await k.read()).recipe.photoUrl).toBe(before.recipe.photoUrl);
    // Another recipe shows the same stored file: removing this copy's photo must not delete it.
    await k.t.run(ctx => ctx.db.insert('recipes', { householdId: k.householdId, title: 'Duplicate', visibility: 'private', favorited: false, photoUrl: before.recipe.photoUrl }));
    mockRemote({ 'GET /api/v2/recipes/r1': () => detail('r1', { revision: 3, photoUrl: undefined }) });
    await k.call('community:applyUpdate', { recipeId: k.recipeId });
    const after = await k.read();
    expect(after.recipe).not.toHaveProperty('photoUrl');
    expect(after.media).toEqual([]);
    expect(after.files).toEqual([before.recipe.photoUrl]);
  });

  test('a failed or filtered update leaves the copy untouched', async () => {
    const k = await saved();
    const before = await k.read();
    for (const answer of [() => detail('r1', { revision: 2, snapshot: snapshot({ steps: Array(201).fill({ text: 'x' }) }) }), () => detail('other', { revision: 2 }), () => detail('r1', { revision: 2, snapshot: snapshot({ title: 'Shit pasta' }) }), () => new Response('', { status: 429 })]) {
      mockRemote({ 'GET /api/v2/recipes/r1': answer });
      await expect(k.call('community:applyUpdate', { recipeId: k.recipeId })).rejects.toThrow();
    }
    expect(await k.read()).toEqual(before);
  });

  test('dismissing stops offering that revision until a newer one arrives', async () => {
    const k = await saved();
    let latest: number | null = 3;
    const calls = mockRemote({ 'GET /api/v2/revisions': () => ({ revisions: { r1: latest } }) });
    expect(await k.call('community:dismissUpdate', { recipeId: k.recipeId })).toEqual({ success: true });
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/api/v2/revisions?ids=r1' });
    expect((await k.read()).origin).toMatchObject({ revision: 1, dismissedRevision: 3 });
    expect(await k.call('community:updates')).toEqual({ updates: [] });
    latest = 4;
    expect(await k.call('community:updates')).toEqual({ updates: [{ ...offered, recipeId: k.recipeId, latestRevision: 4 }] });
    latest = null; // unpublished or under review
    expect(await k.call('community:updates')).toEqual({ updates: [] });
    expect(await k.call('community:dismissUpdate', { recipeId: k.recipeId })).toEqual({ success: true });
    expect((await k.read()).origin.dismissedRevision).toBe(3);
  });

  test('revisions are asked for in batches of 100', async () => {
    const k = await setup();
    await k.t.run(async ctx => { for (let n = 0; n < 130; n++) { const recipeId = await ctx.db.insert('recipes', { householdId: k.householdId, title: `Copy ${n}`, visibility: 'private', favorited: false }); await ctx.db.insert('recipeOrigins', { recipeId, remoteId: n === 5 ? 'a,b' : `r ${n}`, revision: 1, origin: `${ORIGIN}/`, author: 'Ada' }); } });
    const calls = mockRemote({ 'GET /api/v2/revisions': call => ({ revisions: Object.fromEntries(new URL(call.path, ORIGIN).search.slice('?ids='.length).split(',').map(decodeURIComponent).map(id => [id, id === 'r 129' ? 2 : 1])) }) });
    const result = await k.call('community:updates');
    expect(calls.map(call => call.path.split('=')[1].split(',').length)).toEqual([100, 29]);
    expect(calls[0].path).toContain('?ids=r%200,r%201,');
    expect(calls.map(call => call.path).join()).not.toContain('a%2Cb');
    expect(result.updates).toMatchObject([{ title: 'Copy 129', remoteId: 'r 129', savedRevision: 1, latestRevision: 2 }]);
  });

  test('another household cannot see, apply or dismiss updates to a copy', async () => {
    const k = await saved();
    const stranger = await k.otherUser();
    const calls = mockRemote({ 'GET /api/v2/revisions': () => ({ revisions: { r1: 3 } }), 'GET /api/v2/recipes/r1': () => detail('r1', { revision: 3 }) });
    expect(await k.call('community:updates', {}, stranger)).toEqual({ updates: [] });
    await expect(k.call('community:applyUpdate', { recipeId: k.recipeId }, stranger)).rejects.toThrow('Permission denied');
    await expect(k.call('community:dismissUpdate', { recipeId: k.recipeId }, stranger)).rejects.toThrow('Permission denied');
    await expect(k.call('community:applyUpdate', { recipeId: 'recipes_missing' })).rejects.toThrow('Permission denied');
    expect(calls).toHaveLength(0);
    for (const path of ['community:applyRevision', 'community:recordDismissal', 'community:viewer', 'community:localMatches', 'community:hideReported', 'community:savedCopies']) await expect(k.call(path, {})).rejects.toThrow('Unknown operation');
    await expect(execute('community:applyRevision', { recipeId: k.recipeId, remoteId: 'r1', revision: 9, snapshot: snapshot(), keepPhoto: true }, stranger, true, k.db)).rejects.toThrow('Permission denied');
    await expect(execute('community:recordDismissal', { recipeId: k.recipeId, revision: 9 }, stranger, true, k.db)).rejects.toThrow('Permission denied');
    expect((await k.read()).origin).toMatchObject({ revision: 1 });
    // A recipe that didn't come from this community has no updates to apply.
    const own = await k.t.run(ctx => ctx.db.insert('recipes', { householdId: k.householdId, title: 'Own', visibility: 'private', favorited: false }));
    await expect(k.call('community:applyUpdate', { recipeId: own })).rejects.toThrow("wasn't saved from this community");
  });
});

describe('storage', () => {
  test('a database from before 1.3.0 opens and gains the hide list and update tracking', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'sous-chef-community-'));
    try {
      const file = join(directory, 'kitchen.sqlite');
      const old = new KitchenDatabase(file);
      const ids = await old.transaction(async db => {
        const userId = await db.insert('users', { name: 'Cook' }); const householdId = await db.insert('households', { name: 'Kitchen' });
        await db.insert('householdMembers', { userId, householdId, role: 'owner' });
        const recipeId = await db.insert('recipes', { householdId, title: 'Saved long ago', visibility: 'private', favorited: false });
        await db.insert('recipeOrigins', { recipeId, remoteId: 'r1', revision: 1, origin: ORIGIN, author: 'Ada' });
        return { userId, recipeId };
      });
      old.sql.exec('DROP TABLE communityHidden; DROP INDEX recipeOrigins_by_remoteId;');
      old.close();
      const db = new KitchenDatabase(file);
      try {
        mockRemote({ 'GET /api/v2/revisions': () => ({ revisions: { r1: 2 } }), 'GET /api/v2/recipes': () => ({ recipes: [listing('r1')], cursor: null }) });
        expect(await execute('community:hide', { kind: 'recipe', key: 'r9', label: 'Nine', hidden: true }, ids.userId, false, db)).toEqual({ success: true });
        expect(await execute('community:updates', {}, ids.userId, false, db)).toEqual({ updates: [{ recipeId: ids.recipeId, title: 'Saved long ago', remoteId: 'r1', savedRevision: 1, latestRevision: 2 }] });
        expect(await execute('community:dismissUpdate', { recipeId: ids.recipeId }, ids.userId, false, db)).toEqual({ success: true });
        expect(await execute('community:feed', {}, ids.userId, false, db)).toMatchObject({ recipes: [{ id: 'r1', saved: true }] });
        expect(await db.transaction(tx => tx.query('recipeOrigins').collect())).toMatchObject([{ remoteId: 'r1', revision: 1, dismissedRevision: 2, author: 'Ada' }]);
      } finally { db.close(); }
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  test('the hide list is bounded and removed with its user', async () => {
    const k = await setup();
    await expect(k.call('community:hide', { kind: 'recipe', key: '  ', label: 'x', hidden: true })).rejects.toThrow('Invalid ID');
    await expect(k.call('community:hide', { kind: 'cook', key: 'c', label: 'x', hidden: true })).rejects.toThrow('Invalid');
    await k.call('community:hide', { kind: 'author', key: 'cook-1', label: 'x'.repeat(500), hidden: true });
    expect((await k.call('community:hidden')).authors[0].label).toHaveLength(200);
    const admin = await k.t.run(async ctx => { const userId = await ctx.db.insert('users', { name: 'Admin' }); await ctx.db.insert('appAdmins', { userId }); return userId; });
    await k.call('admin:deleteUser', { userId: k.userId }, admin);
    expect(await k.t.run(ctx => ctx.db.query('communityHidden').collect())).toEqual([]);
  });
});
