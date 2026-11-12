/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';
import schema from './schema';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { hashCommunityToken } from './hub';
import type { Cook, Detail, Listing, Me, OwnListing, Tip } from '../src/lib/community-contract';
import { FILTER_MESSAGE, FILTER_TERMS } from '../src/lib/community-filter';
const modules = import.meta.glob('./**/*.ts');

const BAD_WORD = [...FILTER_TERMS][0];
const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const OTHER_PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQ==';
const base = { version: 1 as const, title: 'Tomato pasta', tags: ['Quick'], ingredients: [{ name: 'Pasta', quantity: 200, unit: 'g' }], steps: [{ text: 'Cook.' }] };
type Snapshot = Omit<typeof base, 'tags' | 'ingredients'> & { tags: string[]; description?: string; photoDataUrl?: string; servings?: number; totalTimeMinutes?: number; ingredients: { name: string; quantity?: number; unit?: string }[] };
type Cooked = { id: Id<'users'>; token: string };
const key = (n: number) => n.toString(16).padStart(64, '0');

function setup() {
  const t = convexTest(schema, modules);
  const cook = async (name: string): Promise<Cooked> => {
    const token = `token-${name}`;
    const hash = await hashCommunityToken(token);
    const id = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { name });
      await ctx.db.insert('hubTokens', { userId, hash, expires: Date.now() + 90 * 86_400_000 });
      return userId;
    });
    return { id, token };
  };
  const headers = (token?: string, extra: Record<string, string> = {}) => ({ 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra });
  const get = (path: string, token?: string) => t.fetch(path, { headers: headers(token) });
  const post = (path: string, body: unknown, token?: string, extra?: Record<string, string>) =>
    t.fetch(path, { method: 'POST', headers: headers(token, extra), body: JSON.stringify(body) });
  const getJson = async <T>(path: string, token?: string) => {
    const response = await get(path, token);
    expect(response.status, path).toBe(200);
    return (await response.json()) as T;
  };
  const postJson = async <T>(path: string, body: unknown, token?: string) => {
    const response = await post(path, body, token);
    expect(response.status, path).toBe(200);
    return (await response.json()) as T;
  };
  /** Publishing is limited to 10 a minute per cook; tests publish more. */
  const resetLimits = () => t.run(async (ctx) => { for (const row of await ctx.db.query('authRateLimitEvents').collect()) await ctx.db.delete(row._id); });
  const publish = async (author: Cooked, overrides: Partial<Snapshot> = {}, options: { visibility?: 'public' | 'unlisted'; id?: string } = {}) => {
    await resetLimits();
    const result = await postJson<{ id: Id<'hubRecipes'>; revision: number }>('/api/v1/publish', { id: options.id, snapshot: { ...base, ...overrides }, visibility: options.visibility ?? 'public' }, author.token);
    return result.id;
  };
  const list = (query = '', token?: string) => getJson<{ recipes: Listing[]; cursor: string | null }>(`/api/v2/recipes${query}`, token);
  const titles = async (query = '') => (await list(query)).recipes.map((recipe) => recipe.title);
  const recipeDoc = (id: Id<'hubRecipes'>) => t.run((ctx) => ctx.db.get(id));
  const tagCounts = async () => (await getJson<{ tags: { tag: string; count: number }[] }>('/api/v2/tags')).tags;
  return { t, cook, get, post, getJson, postJson, publish, list, titles, recipeDoc, tagCounts, resetLimits };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('lists', () => {
  test('pages newest first with a cursor and returns the listing shape', async () => {
    const { cook, publish, list } = setup();
    const alice = await cook('Alice');
    for (let n = 1; n <= 5; n++) {
      await publish(alice, { title: `Recipe ${n}`, description: `About ${n}`, servings: 2, totalTimeMinutes: 15, ingredients: [{ name: ' Pasta ' }, { name: 'pasta' }, { name: 'Salt' }, { name: '  ' }] });
    }
    await publish(alice, { title: 'Hidden link' }, { visibility: 'unlisted' });

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page: { recipes: Listing[]; cursor: string | null } = await list(`?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      expect(page.recipes.length).toBeLessThanOrEqual(2);
      seen.push(...page.recipes.map((recipe) => recipe.title));
      cursor = page.cursor;
      pages += 1;
    } while (cursor && pages < 10);
    expect(seen).toEqual(['Recipe 5', 'Recipe 4', 'Recipe 3', 'Recipe 2', 'Recipe 1']);
    expect(pages).toBe(3);

    const [first] = (await list('?limit=1')).recipes;
    expect(first).toMatchObject({
      revision: 1, author: { id: alice.id, name: 'Alice' }, title: 'Recipe 5', description: 'About 5', tags: ['Quick'], servings: 2, totalTimeMinutes: 15,
      ingredientNames: ['Pasta', 'Salt'], likeCount: 0, saveCount: 0, madeCount: 0,
    });
    expect(first.createdAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(first.updatedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    for (const absent of ['snapshot', 'steps', 'ingredients', 'liked', 'rating', 'photoUrl', 'shareUrl']) expect(first).not.toHaveProperty(absent);
    expect((await list('?limit=1', alice.token)).recipes[0].liked).toBe(false);
  });

  test('limits are clamped, a default applies and bad input answers 400', async () => {
    const { cook, publish, list, get } = setup();
    const alice = await cook('Alice');
    for (let n = 0; n < 3; n++) await publish(alice, { title: `R${n}` });
    expect((await list('?limit=0')).recipes).toHaveLength(1);
    expect((await list('?limit=500')).recipes).toHaveLength(3);
    expect((await list('?limit=abc')).recipes).toHaveLength(3);
    expect((await get('/api/v2/recipes?sort=best')).status).toBe(400);
    expect((await get('/api/v2/recipes?cursor=not-a-cursor')).status).toBe(400);
    expect((await get('/api/v2/recipes', 'bad-token')).status).toBe(401);
    expect((await get('/api/v2/nothing')).status).toBe(404);
  });

  test('top sorts by likes and hot weighs engagement against age', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const { cook, publish, postJson, titles, recipeDoc } = setup();
    const alice = await cook('Alice');
    const fans = await Promise.all(['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'].map(cook));
    const old = await publish(alice, { title: 'Old favourite' });
    const quiet = await publish(alice, { title: 'Old and quiet' });
    for (const fan of fans) await postJson('/api/v2/like', { id: old, liked: true }, fan.token);
    await postJson('/api/v2/like', { id: quiet, liked: true }, fans[0].token);

    // Ten likes are worth three days: two days later the favourite still leads.
    vi.setSystemTime(new Date('2026-01-03T00:00:00Z'));
    await publish(alice, { title: 'Two days newer' });
    expect(await titles('?sort=hot')).toEqual(['Old favourite', 'Two days newer', 'Old and quiet']);
    // Four days later a new recipe overtakes it.
    vi.setSystemTime(new Date('2026-01-05T00:00:00Z'));
    await publish(alice, { title: 'Four days newer' });
    expect(await titles('?sort=hot')).toEqual(['Four days newer', 'Old favourite', 'Two days newer', 'Old and quiet']);

    expect(await titles('?sort=top')).toEqual(['Old favourite', 'Old and quiet', 'Four days newer', 'Two days newer']);
    expect(await titles('?sort=new')).toEqual(['Four days newer', 'Two days newer', 'Old and quiet', 'Old favourite']);
    expect(await titles('?sort=top&limit=1')).toEqual(['Old favourite']);

    const doc = await recipeDoc(old);
    expect(doc?.hot).toBeCloseTo(1 + doc!._creationTime / 1000 / (3 * 86_400), 9);
  });

  test('hot counts saves twice and made entries three times', async () => {
    const { cook, publish, postJson, recipeDoc } = setup();
    const [alice, bob] = [await cook('Alice'), await cook('Bob')];
    const id = await publish(alice);
    await postJson('/api/v2/like', { id, liked: true }, bob.token);
    await postJson('/api/v2/save', { id, clientKey: key(1) });
    await postJson('/api/v2/made', { id, rating: 5 }, bob.token);
    const doc = (await recipeDoc(id))!;
    expect(doc.hot).toBeCloseTo(Math.log10(1 + 2 + 3) + doc._creationTime / 1000 / (3 * 86_400), 9);
  });

  test('tag filter is exact and case-insensitive, and tag counts follow visibility', async () => {
    const { cook, publish, post, postJson, titles, tagCounts, list } = setup();
    const [alice, bob] = [await cook('Alice'), await cook('Bob')];
    const soup = await publish(alice, { title: 'Soup', tags: ['Dinner', 'Vegan'] });
    const stew = await publish(alice, { title: 'Stew', tags: ['dinner', ' DINNER ', 'Slow cooker'] });
    await publish(bob, { title: 'Cake', tags: ['Dessert'] });
    await publish(bob, { title: 'Secret', tags: ['Dinner'] }, { visibility: 'unlisted' });

    const counts = await tagCounts();
    expect(counts[0]).toEqual({ tag: 'dinner', count: 2 });
    expect(counts.slice(1).sort((a, b) => a.tag.localeCompare(b.tag))).toEqual([{ tag: 'dessert', count: 1 }, { tag: 'slow cooker', count: 1 }, { tag: 'vegan', count: 1 }]);
    expect(await titles('?tag=DINNER')).toEqual(['Stew', 'Soup']);
    expect(await titles('?tag=din')).toEqual([]);
    expect(await titles('?tag=slow%20cooker')).toEqual(['Stew']);
    // Tags keep their published spelling in the listing.
    expect((await list('?tag=vegan')).recipes[0].tags).toEqual(['Dinner', 'Vegan']);

    // One like alone doesn't move "hot" (log10 of 1 is 0); a save on top does.
    await postJson('/api/v2/like', { id: soup, liked: true }, bob.token);
    await postJson('/api/v2/save', { id: soup, clientKey: key(1) });
    expect(await titles('?tag=dinner&sort=top')).toEqual(['Soup', 'Stew']);
    expect(await titles('?tag=dinner&sort=hot')).toEqual(['Soup', 'Stew']);
    const page = await list('?tag=dinner&limit=1');
    expect(page.recipes.map((recipe) => recipe.title)).toEqual(['Stew']);
    expect((await list(`?tag=dinner&limit=1&cursor=${encodeURIComponent(page.cursor!)}`)).recipes.map((recipe) => recipe.title)).toEqual(['Soup']);

    // Retagging, unlisting and unpublishing all move the counts.
    await publish(alice, { title: 'Stew', tags: ['Slow cooker'] }, { id: stew });
    expect((await tagCounts()).find((row) => row.tag === 'dinner')).toEqual({ tag: 'dinner', count: 1 });
    await publish(alice, { title: 'Soup', tags: ['Dinner', 'Vegan'] }, { id: soup, visibility: 'unlisted' });
    expect((await tagCounts()).map((row) => row.tag).sort()).toEqual(['dessert', 'slow cooker']);
    expect((await post('/api/v1/unpublish', { id: stew }, alice.token)).status).toBe(200);
    expect(await tagCounts()).toEqual([{ tag: 'dessert', count: 1 }]);
    expect(await titles('?tag=dinner')).toEqual([]);
  });

  test('tags returns the 30 most used', async () => {
    const { cook, publish, tagCounts } = setup();
    const alice = await cook('Alice');
    await publish(alice, { title: 'Many', tags: Array.from({ length: 30 }, (_, n) => `tag${n}`) });
    await publish(alice, { title: 'More', tags: ['tag3', 'extra1', 'extra2'] });
    const tags = await tagCounts();
    expect(tags).toHaveLength(30);
    expect(tags[0]).toEqual({ tag: 'tag3', count: 2 });
  });

  test('search is full text over public recipes, ignores sort and wins over author and tag', async () => {
    const { cook, publish, titles, list } = setup();
    const [alice, bob] = [await cook('Alice'), await cook('Bob')];
    await publish(alice, { title: 'Lemon tart', tags: ['Dessert'] });
    await publish(alice, { title: 'Roast chicken', description: 'With lemon and thyme', tags: ['Dinner'] });
    await publish(bob, { title: 'Lemonade', tags: ['Drinks'] });
    await publish(bob, { title: 'Lemon secret' }, { visibility: 'unlisted' });
    expect((await titles('?search=lemon')).sort()).toEqual(['Lemon tart', 'Lemonade', 'Roast chicken']);
    expect((await titles('?search=lemon&sort=top')).sort()).toEqual(['Lemon tart', 'Lemonade', 'Roast chicken']);
    expect((await titles(`?search=chicken&tag=dessert&author=${bob.id}`))).toEqual(['Roast chicken']);
    expect(await titles('?search=dessert')).toEqual(['Lemon tart']);
    const first = await list('?search=lemon&limit=2');
    expect(first.recipes).toHaveLength(2);
    const rest = await list(`?search=lemon&limit=2&cursor=${encodeURIComponent(first.cursor!)}`);
    expect([...first.recipes, ...rest.recipes].map((recipe) => recipe.title).sort()).toEqual(['Lemon tart', 'Lemonade', 'Roast chicken']);
    expect(rest.cursor).toBeNull();
  });

  test('author filter lists one cook, with each sort, and wins over tag', async () => {
    const { cook, publish, postJson, titles } = setup();
    const [alice, bob] = [await cook('Alice'), await cook('Bob')];
    const first = await publish(alice, { title: 'A1', tags: ['x'] });
    await publish(alice, { title: 'A2', tags: ['y'] });
    await publish(alice, { title: 'A hidden' }, { visibility: 'unlisted' });
    await publish(bob, { title: 'B1', tags: ['x'] });
    await postJson('/api/v2/like', { id: first, liked: true }, bob.token);
    await postJson('/api/v2/save', { id: first, clientKey: key(1) });
    expect(await titles(`?author=${alice.id}`)).toEqual(['A2', 'A1']);
    expect(await titles(`?author=${alice.id}&sort=top`)).toEqual(['A1', 'A2']);
    expect(await titles(`?author=${alice.id}&sort=hot`)).toEqual(['A1', 'A2']);
    expect(await titles(`?author=${alice.id}&tag=x`)).toEqual(['A2', 'A1']);
    expect(await titles('?author=nobody')).toEqual([]);
  });

  test('share links appear when the service has SHARE_URL_BASE', async () => {
    const { cook, publish, list } = setup();
    const id = await publish(await cook('Alice'));
    expect((await list()).recipes[0]).not.toHaveProperty('shareUrl');
    vi.stubEnv('SHARE_URL_BASE', 'https://souschefkitchen.app/r/');
    expect((await list()).recipes[0].shareUrl).toBe(`https://souschefkitchen.app/r/${id}`);
  });
});

describe('photos', () => {
  test('a published photo moves to file storage and comes back inline on request and on v1', async () => {
    const { t, cook, publish, list, getJson, recipeDoc } = setup();
    const alice = await cook('Alice');
    const id = await publish(alice, { photoDataUrl: PHOTO });
    const doc = (await recipeDoc(id))!;
    expect(doc.snapshot).not.toHaveProperty('photoDataUrl');
    expect(doc.photoId).toBeDefined();
    expect(doc.photoType).toBe('image/png');
    const stored = await t.run(async (ctx) => Array.from(new Uint8Array(await (await ctx.storage.get(doc.photoId!))!.arrayBuffer())));
    expect(stored).toEqual(Array.from(atob(PHOTO.split(',')[1]), (c) => c.charCodeAt(0)));

    const listing = (await list()).recipes[0];
    expect(listing.photoUrl).toMatch(/^https:\/\//);
    expect(JSON.stringify(listing)).not.toContain('base64');

    const detail = await getJson<Detail>(`/api/v2/recipes/${id}`);
    expect(detail.photoUrl).toBe(listing.photoUrl);
    expect(detail.snapshot).not.toHaveProperty('photoDataUrl');
    expect(detail.snapshot).toEqual(base);
    expect((await getJson<Detail>(`/api/v2/recipes/${id}?photo=inline`)).snapshot.photoDataUrl).toBe(PHOTO);

    // API v1 keeps its shape, with the photo inline again.
    const v1 = await getJson<{ id: string; revision: number; createdAt: string; author: { id: string; name: string }; snapshot: Snapshot }>(`/api/v1/recipes/${id}`);
    expect(v1).toEqual({ id, revision: 1, createdAt: expect.any(String), author: { id: alice.id, name: 'Alice' }, snapshot: { ...base, photoDataUrl: PHOTO } });
    const v1List = await getJson<{ recipes: { snapshot: Snapshot }[] }>('/api/v1/recipes');
    expect(v1List.recipes[0].snapshot.photoDataUrl).toBe(PHOTO);
    expect(Object.keys(v1List.recipes[0]).sort()).toEqual(['author', 'createdAt', 'id', 'revision', 'snapshot']);
  });

  test('republishing replaces or drops the stored photo', async () => {
    const { t, cook, publish, recipeDoc, getJson } = setup();
    const alice = await cook('Alice');
    const id = await publish(alice, { photoDataUrl: PHOTO });
    const first = (await recipeDoc(id))!.photoId!;
    await publish(alice, { photoDataUrl: OTHER_PHOTO }, { id });
    const second = (await recipeDoc(id))!.photoId!;
    expect(second).not.toBe(first);
    expect(await t.run((ctx) => ctx.db.system.get(first))).toBeNull();
    expect((await getJson<Detail>(`/api/v2/recipes/${id}?photo=inline`)).snapshot.photoDataUrl).toBe(OTHER_PHOTO);

    await publish(alice, {}, { id });
    expect((await recipeDoc(id))!.photoId).toBeUndefined();
    expect(await t.run((ctx) => ctx.db.system.get(second))).toBeNull();
    expect(await getJson<Detail>(`/api/v2/recipes/${id}?photo=inline`)).not.toHaveProperty('photoUrl');
    expect(await t.run(async (ctx) => (await ctx.db.system.query('_storage').collect()).length)).toBe(0);
  });

  test('a rejected publish leaves no stored photo behind', async () => {
    const { t, cook, post, publish } = setup();
    const [alice, bob] = [await cook('Alice'), await cook('Bob')];
    const id = await publish(alice);
    const response = await post('/api/v1/publish', { id, snapshot: { ...base, photoDataUrl: PHOTO }, visibility: 'public' }, bob.token);
    expect(response.status).toBe(400);
    expect(await t.run(async (ctx) => (await ctx.db.system.query('_storage').collect()).length)).toBe(0);
  });

  test('a v1 list stops inlining photos at 6 MB', async () => {
    const { t, cook, getJson } = setup();
    const alice = await cook('Alice');
    const bytes = new Uint8Array(700_000).fill(7);
    await t.run(async (ctx) => {
      for (let n = 0; n < 10; n++) {
        const photoId = await ctx.storage.store(new Blob([bytes], { type: 'image/jpeg' }));
        await ctx.db.insert('hubRecipes', { userId: alice.id, snapshot: { ...base, title: `Big ${n}` }, revision: 1, visibility: 'public', updatedAt: Date.now(), searchText: 'big', photoId, photoType: 'image/jpeg' });
      }
    });
    const response = await t.fetch('/api/v1/recipes?limit=50');
    const body = await response.text();
    expect(body.length).toBeLessThan(6_100_000);
    const { recipes } = JSON.parse(body) as { recipes: { snapshot: Snapshot }[] };
    expect(recipes).toHaveLength(10);
    const inlined = recipes.filter((recipe) => recipe.snapshot.photoDataUrl);
    expect(inlined).toHaveLength(6);
    expect(recipes.slice(0, 6).every((recipe) => recipe.snapshot.photoDataUrl?.startsWith('data:image/jpeg;base64,'))).toBe(true);
    // The detail still carries its photo.
    const last = (await getJson<{ recipes: { id: string }[] }>('/api/v1/recipes?limit=50')).recipes[9];
    expect((await getJson<{ snapshot: Snapshot }>(`/api/v1/recipes/${last.id}`)).snapshot.photoDataUrl).toBeDefined();
  });
});

describe('likes and saves', () => {
  test('liking is idempotent, counted once per cook and visible to the viewer', async () => {
    const { cook, publish, post, postJson, list, getJson, recipeDoc } = setup();
    const [alice, bob, carol] = [await cook('Alice'), await cook('Bob'), await cook('Carol')];
    const id = await publish(alice);
    expect(await postJson('/api/v2/like', { id, liked: true }, bob.token)).toEqual({ liked: true, likeCount: 1 });
    expect(await postJson('/api/v2/like', { id, liked: true }, bob.token)).toEqual({ liked: true, likeCount: 1 });
    expect(await postJson('/api/v2/like', { id, liked: true }, carol.token)).toEqual({ liked: true, likeCount: 2 });
    expect((await list('', bob.token)).recipes[0]).toMatchObject({ liked: true, likeCount: 2 });
    expect((await list('', alice.token)).recipes[0]).toMatchObject({ liked: false, likeCount: 2 });
    expect((await getJson<Detail>(`/api/v2/recipes/${id}`, bob.token)).viewer).toEqual({ liked: true, following: false, own: false });
    expect(await postJson('/api/v2/like', { id, liked: false }, bob.token)).toEqual({ liked: false, likeCount: 1 });
    expect(await postJson('/api/v2/like', { id, liked: false }, bob.token)).toEqual({ liked: false, likeCount: 1 });
    expect((await recipeDoc(id))!.likeCount).toBe(1);

    expect((await post('/api/v2/like', { id, liked: true })).status).toBe(401);
    expect((await post('/api/v2/like', { id, liked: 'yes' }, bob.token)).status).toBe(400);
    expect((await post('/api/v2/like', { id: 'missing', liked: true }, bob.token)).status).toBe(404);
    await post('/api/v1/unpublish', { id }, alice.token);
    expect((await post('/api/v2/like', { id, liked: true }, bob.token)).status).toBe(404);
  });

  test('a save counts once per client key and needs no account', async () => {
    const { cook, publish, post, postJson, list } = setup();
    const id = await publish(await cook('Alice'));
    expect(await postJson('/api/v2/save', { id, clientKey: key(1) })).toEqual({ saveCount: 1 });
    expect(await postJson('/api/v2/save', { id, clientKey: key(1) })).toEqual({ saveCount: 1 });
    expect(await postJson('/api/v2/save', { id, clientKey: key(2).toUpperCase() })).toEqual({ saveCount: 2 });
    expect(await postJson('/api/v2/save', { id, clientKey: key(2) })).toEqual({ saveCount: 2 });
    expect((await list()).recipes[0].saveCount).toBe(2);
    expect((await post('/api/v2/save', { id, clientKey: 'my-device-id' })).status).toBe(400);
    expect((await post('/api/v2/save', { id })).status).toBe(400);
    expect((await post('/api/v2/save', { id: 'missing', clientKey: key(3) })).status).toBe(404);
    expect((await post('/api/v2/save', { id, clientKey: key(3) }, 'bad-token')).status).toBe(401);
  });

  test('saves are rate limited per address', async () => {
    const { cook, publish, post } = setup();
    const id = await publish(await cook('Alice'));
    const from = (address: string, n: number) => post('/api/v2/save', { id, clientKey: key(n) }, undefined, { 'x-forwarded-for': address });
    for (let n = 0; n < 120; n++) expect((await from('203.0.113.9', n)).status).toBe(200);
    expect((await from('203.0.113.9', 500)).status).toBe(429);
    expect((await from('203.0.113.10', 501)).status).toBe(200);
  });
});

describe('made it', () => {
  test('ratings average to one decimal, an entry is replaced and tips list newest first', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T12:00:00Z'));
    const { cook, publish, post, postJson, getJson, list } = setup();
    const [alice, bob, carol, dan] = [await cook('Alice'), await cook('Bob'), await cook('Carol'), await cook('Dan')];
    const id = await publish(alice);
    expect(await postJson('/api/v2/made', { id, rating: 5, tip: ' Add more garlic ' }, bob.token)).toEqual({ madeCount: 1, rating: 5 });
    expect(await postJson('/api/v2/made', { id, rating: 4 }, carol.token)).toEqual({ madeCount: 2, rating: 4.5 });
    expect(await postJson('/api/v2/made', { id, rating: 4, tip: 'Use fresh basil' }, dan.token)).toEqual({ madeCount: 3, rating: 4.3 });
    // Sending again replaces the entry instead of adding one, and makes it the newest.
    vi.setSystemTime(new Date('2026-03-01T12:05:00Z'));
    expect(await postJson('/api/v2/made', { id, rating: 2, tip: 'Too salty' }, bob.token)).toEqual({ madeCount: 3, rating: 3.3 });
    expect((await list()).recipes[0]).toMatchObject({ madeCount: 3, rating: 3.3 });

    const detail = await getJson<Detail>(`/api/v2/recipes/${id}`, bob.token);
    expect(detail.tips.map((tip) => [tip.author.name, tip.rating, tip.tip])).toEqual([['Bob', 2, 'Too salty'], ['Dan', 4, 'Use fresh basil']]);
    expect(detail.viewer?.made).toEqual({ rating: 2, tip: 'Too salty' });
    expect((await getJson<Detail>(`/api/v2/recipes/${id}`, carol.token)).viewer?.made).toEqual({ rating: 4 });
    expect((await getJson<Detail>(`/api/v2/recipes/${id}`)).viewer).toBeUndefined();

    const page = await getJson<{ tips: Tip[]; cursor: string | null }>(`/api/v2/recipes/${id}/tips?limit=1`);
    expect(page.tips).toEqual([{ id: expect.any(String), author: { id: bob.id, name: 'Bob' }, rating: 2, tip: 'Too salty', createdAt: expect.any(String) }]);
    const next = await getJson<{ tips: Tip[]; cursor: string | null }>(`/api/v2/recipes/${id}/tips?limit=1&cursor=${encodeURIComponent(page.cursor!)}`);
    expect(next.tips.map((tip) => tip.tip)).toEqual(['Use fresh basil']);

    expect(await postJson('/api/v2/made/delete', { id }, bob.token)).toEqual({ madeCount: 2, rating: 4 });
    expect(await postJson('/api/v2/made/delete', { id }, bob.token)).toEqual({ madeCount: 2, rating: 4 });
    await postJson('/api/v2/made/delete', { id }, carol.token);
    expect(await postJson('/api/v2/made/delete', { id }, dan.token)).toEqual({ madeCount: 0 });
    expect((await list()).recipes[0]).not.toHaveProperty('rating');
    expect((await post(`/api/v2/made/delete`, { id }, undefined)).status).toBe(401);
  });

  test('refuses your own recipe, bad ratings, long or filtered tips and hidden recipes', async () => {
    const { cook, publish, post, get, recipeDoc } = setup();
    const [alice, bob] = [await cook('Alice'), await cook('Bob')];
    const id = await publish(alice);
    expect((await post('/api/v2/made', { id, rating: 5 }, alice.token)).status).toBe(403);
    for (const rating of [0, 6, 4.5, '5', null]) expect((await post('/api/v2/made', { id, rating }, bob.token)).status).toBe(400);
    expect((await post('/api/v2/made', { id, rating: 5, tip: 'x'.repeat(281) }, bob.token)).status).toBe(400);
    expect((await post('/api/v2/made', { id, rating: 5, tip: 'x'.repeat(280) }, bob.token)).status).toBe(200);
    const filtered = await post('/api/v2/made', { id, rating: 1, tip: `What a ${BAD_WORD} recipe` }, bob.token);
    expect(filtered.status).toBe(400);
    expect(await filtered.json()).toEqual({ error: FILTER_MESSAGE });
    expect((await recipeDoc(id))).toMatchObject({ madeCount: 1, ratingSum: 5 });
    expect((await post('/api/v2/made', { id: 'missing', rating: 5 }, bob.token)).status).toBe(404);
    expect((await get('/api/v2/recipes/missing/tips')).status).toBe(404);
  });
});

describe('cooks, profiles and following', () => {
  test('profile edits change the name and bio and are filtered and bounded', async () => {
    const { cook, post, postJson, getJson } = setup();
    const alice = await cook('Alice');
    expect(await postJson<Me>('/api/v2/me', {}, alice.token)).toEqual({ id: alice.id, name: 'Alice', recipeCount: 0, followerCount: 0, followingCount: 0, moderator: false });
    expect(await postJson<Me>('/api/v2/me/profile', { name: '  Chef   Alice ', bio: ' Weeknight cook. ' }, alice.token)).toEqual({
      id: alice.id, name: 'Chef Alice', bio: 'Weeknight cook.', recipeCount: 0, followerCount: 0, followingCount: 0, moderator: false,
    });
    expect((await postJson<Me>('/api/v2/me/profile', { bio: 'New bio' }, alice.token))).toMatchObject({ name: 'Chef Alice', bio: 'New bio' });
    expect(await getJson<Cook>(`/api/v2/cooks/${alice.id}`)).toEqual({ id: alice.id, name: 'Chef Alice', bio: 'New bio', recipeCount: 0, followerCount: 0, followingCount: 0 });
    expect(await postJson<Me>('/api/v2/me/profile', { bio: '' }, alice.token)).not.toHaveProperty('bio');

    for (const body of [{ name: '' }, { name: '   ' }, { name: 'x'.repeat(41) }, { bio: 'x'.repeat(161) }, { name: 5 }, { bio: ['a'] }]) {
      expect((await post('/api/v2/me/profile', body, alice.token)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await post('/api/v2/me/profile', { name: 'x'.repeat(40), bio: 'x'.repeat(160) }, alice.token)).status).toBe(200);
    for (const body of [{ name: `${BAD_WORD} face` }, { bio: `I am a ${BAD_WORD}` }]) {
      const response = await post('/api/v2/me/profile', body, alice.token);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: FILTER_MESSAGE });
    }
    expect((await postJson<Me>('/api/v2/me', {}, alice.token)).name).toBe('x'.repeat(40));
    expect((await post('/api/v2/me', {})).status).toBe(401);
    expect((await post('/api/v2/me/profile', { name: 'Eve' }, 'bad-token')).status).toBe(401);
    expect((await post('/api/v2/me', '[]', alice.token)).status).toBe(400);
  });

  test('following is idempotent, counted on both profiles and refused for yourself or unknown cooks', async () => {
    const { cook, publish, post, get, postJson, getJson } = setup();
    const [alice, bob, carol] = [await cook('Alice'), await cook('Bob'), await cook('Carol')];
    const id = await publish(alice);
    expect(await postJson('/api/v2/follow', { userId: alice.id, following: true }, bob.token)).toEqual({ following: true, followerCount: 1 });
    expect(await postJson('/api/v2/follow', { userId: alice.id, following: true }, bob.token)).toEqual({ following: true, followerCount: 1 });
    expect(await postJson('/api/v2/follow', { userId: alice.id, following: true }, carol.token)).toEqual({ following: true, followerCount: 2 });
    expect(await getJson<Cook>(`/api/v2/cooks/${alice.id}`, bob.token)).toEqual({
      id: alice.id, name: 'Alice', recipeCount: 1, followerCount: 2, followingCount: 0, viewer: { following: true, own: false },
    });
    expect((await getJson<Cook>(`/api/v2/cooks/${alice.id}`, alice.token)).viewer).toEqual({ following: false, own: true });
    expect((await postJson<Me>('/api/v2/me', {}, bob.token)).followingCount).toBe(1);
    expect((await getJson<Detail>(`/api/v2/recipes/${id}`, bob.token)).viewer?.following).toBe(true);
    expect(await postJson('/api/v2/follow', { userId: alice.id, following: false }, bob.token)).toEqual({ following: false, followerCount: 1 });
    expect(await postJson('/api/v2/follow', { userId: alice.id, following: false }, bob.token)).toEqual({ following: false, followerCount: 1 });
    expect((await postJson<Me>('/api/v2/me', {}, bob.token)).followingCount).toBe(0);

    expect((await post('/api/v2/follow', { userId: bob.id, following: true }, bob.token)).status).toBe(400);
    expect((await post('/api/v2/follow', { userId: 'nobody', following: true }, bob.token)).status).toBe(404);
    expect((await post('/api/v2/follow', { userId: alice.id }, bob.token)).status).toBe(400);
    expect((await post('/api/v2/follow', { userId: alice.id, following: true })).status).toBe(401);
    expect((await get('/api/v2/cooks/nobody')).status).toBe(404);
  });

  test('a cook can follow at most 200 others', async () => {
    const { t, cook, post, postJson } = setup();
    const [alice, bob] = [await cook('Alice'), await cook('Bob')];
    await t.run(async (ctx) => {
      for (let n = 0; n < 200; n++) {
        const followeeId = await ctx.db.insert('users', { name: `Cook ${n}` });
        await ctx.db.insert('hubFollows', { followerId: bob.id, followeeId });
      }
    });
    const refused = await post('/api/v2/follow', { userId: alice.id, following: true }, bob.token);
    expect(refused.status).toBe(400);
    expect((await refused.json()).error).toContain('200');
    const one = await t.run(async (ctx) => (await ctx.db.query('hubFollows').first())!);
    await postJson('/api/v2/follow', { userId: one.followeeId, following: false }, bob.token);
    expect(await postJson('/api/v2/follow', { userId: alice.id, following: true }, bob.token)).toEqual({ following: true, followerCount: 1 });
  });

  test('the following feed merges followed cooks newest first and pages by time', async () => {
    const { cook, publish, post, postJson } = setup();
    const [alice, bob, carol, dan, reader] = [await cook('Alice'), await cook('Bob'), await cook('Carol'), await cook('Dan'), await cook('Reader')];
    const expected: string[] = [];
    for (let n = 0; n < 12; n++) {
      const author = [alice, bob, carol][n % 3];
      await publish(author, { title: `Feed ${n}` });
      expected.unshift(`Feed ${n}`);
    }
    await publish(dan, { title: 'Not followed' });
    await publish(alice, { title: 'Unlisted' }, { visibility: 'unlisted' });
    for (const followed of [alice, bob, carol]) await postJson('/api/v2/follow', { userId: followed.id, following: true }, reader.token);

    const feed = (body: object) => postJson<{ recipes: Listing[]; cursor: string | null }>('/api/v2/feed/following', body, reader.token);
    expect((await feed({ limit: 50 })).recipes.map((recipe) => recipe.title)).toEqual(expected);
    expect((await feed({ limit: 50 })).cursor).toBeNull();
    expect((await feed({})).recipes[0]).toMatchObject({ liked: false, author: { name: 'Carol' } });

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page: { recipes: Listing[]; cursor: string | null } = await feed({ limit: 5, ...(cursor ? { cursor } : {}) });
      expect(page.recipes.length).toBeLessThanOrEqual(5);
      seen.push(...page.recipes.map((recipe) => recipe.title));
      cursor = page.cursor;
      pages += 1;
    } while (cursor && pages < 20);
    expect(seen).toEqual(expected);

    expect((await postJson<{ recipes: Listing[]; cursor: string | null }>('/api/v2/feed/following', {}, dan.token))).toEqual({ recipes: [], cursor: null });
    expect((await post('/api/v2/feed/following', { cursor: 'abc' }, reader.token)).status).toBe(400);
    expect((await post('/api/v2/feed/following', {})).status).toBe(401);
  });

  test('the following feed stays complete when a prolific cook is read in slices', async () => {
    const { t, cook, post, postJson, publish } = setup();
    const [reader, prolific, occasional] = [await cook('Reader'), await cook('Prolific'), await cook('Occasional')];
    // Following many cooks shrinks how many recipes are read per cook and page.
    await t.run(async (ctx) => {
      for (let n = 0; n < 150; n++) await ctx.db.insert('hubFollows', { followerId: reader.id, followeeId: await ctx.db.insert('users', { name: `Quiet ${n}` }) });
    });
    const expected: string[] = [];
    await publish(occasional, { title: 'Oldest' });
    expected.unshift('Oldest');
    for (let n = 0; n < 9; n++) {
      await publish(prolific, { title: `Busy ${n}` });
      expected.unshift(`Busy ${n}`);
    }
    await publish(occasional, { title: 'Newest' });
    expected.unshift('Newest');
    for (const followed of [prolific, occasional]) expect((await post('/api/v2/follow', { userId: followed.id, following: true }, reader.token)).status).toBe(200);

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page: { recipes: Listing[]; cursor: string | null } = await postJson('/api/v2/feed/following', { limit: 20, ...(cursor ? { cursor } : {}) }, reader.token);
      seen.push(...page.recipes.map((recipe) => recipe.title));
      cursor = page.cursor;
      pages += 1;
    } while (cursor && pages < 20);
    expect(seen).toEqual(expected);
    expect(pages).toBeGreaterThan(1);
  });

  test('my recipes lists everything I published with its state', async () => {
    const { cook, publish, post, postJson } = setup();
    const [alice, bob] = [await cook('Alice'), await cook('Bob')];
    await publish(alice, { title: 'Public' });
    await publish(alice, { title: 'Unlisted' }, { visibility: 'unlisted' });
    const gone = await publish(alice, { title: 'Unpublished' });
    await post('/api/v1/unpublish', { id: gone }, alice.token);
    await publish(bob, { title: "Bob's" });
    const mine = await postJson<{ recipes: OwnListing[]; cursor: string | null }>('/api/v2/me/recipes', {}, alice.token);
    expect(mine.recipes.map((recipe) => [recipe.title, recipe.visibility, recipe.removed, recipe.underReview])).toEqual([
      ['Unpublished', 'private', false, false], ['Unlisted', 'unlisted', false, false], ['Public', 'public', false, false],
    ]);
    expect(mine.cursor).toBeNull();
    expect((await postJson<Me>('/api/v2/me', {}, alice.token)).recipeCount).toBe(1);
    expect((await post('/api/v2/me/recipes', { cursor: 5 }, alice.token)).status).toBe(400);
  });
});

describe('details, revisions and access', () => {
  test('detail serves public and unlisted recipes and 404s the rest', async () => {
    const { cook, publish, post, get, getJson } = setup();
    const alice = await cook('Alice');
    const open = await publish(alice, { title: 'Open' });
    const link = await publish(alice, { title: 'Link only' }, { visibility: 'unlisted' });
    const closed = await publish(alice, { title: 'Closed' });
    await post('/api/v1/unpublish', { id: closed }, alice.token);
    expect(await getJson<Detail>(`/api/v2/recipes/${open}`)).toMatchObject({ id: open, visibility: 'public', title: 'Open', snapshot: { ...base, title: 'Open' }, tips: [] });
    expect((await getJson<Detail>(`/api/v2/recipes/${link}`)).visibility).toBe('unlisted');
    expect((await getJson<Detail>(`/api/v2/recipes/${open}`, alice.token)).viewer).toEqual({ liked: false, following: false, own: true });
    for (const path of [`/api/v2/recipes/${closed}`, '/api/v2/recipes/nope', `/api/v2/recipes/${alice.id}`, `/api/v2/recipes/${open}/extra`]) {
      expect((await get(path)).status, path).toBe(404);
    }
    expect((await get(`/api/v2/recipes/${closed}`, alice.token)).status).toBe(404);
    expect((await get(`/api/v2/recipes/${open}`, 'bad-token')).status).toBe(401);

    expect(await getJson(`/api/v2/revisions?ids=${open},${link},${closed},nope`)).toEqual({ revisions: { [open]: 1, [link]: 1, [closed]: null, nope: null } });
    await publish(alice, { title: 'Open again' }, { id: open });
    expect(await getJson(`/api/v2/revisions?ids=${open}`)).toEqual({ revisions: { [open]: 2 } });
    expect(await getJson('/api/v2/revisions')).toEqual({ revisions: {} });
    expect((await get(`/api/v2/revisions?ids=${Array.from({ length: 101 }, (_, n) => `id${n}`).join(',')}`)).status).toBe(400);
  });

  test('publishing filtered text is refused with the filter message', async () => {
    const { t, cook, post, list } = setup();
    const alice = await cook('Alice');
    for (const snapshot of [{ ...base, title: `${BAD_WORD} pasta` }, { ...base, steps: [{ text: `Stir, you ${BAD_WORD}.` }] }, { ...base, tags: [BAD_WORD] }]) {
      const response = await post('/api/v1/publish', { snapshot, visibility: 'public' }, alice.token);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: FILTER_MESSAGE });
    }
    expect((await list()).recipes).toHaveLength(0);
    await expect(t.mutation(internal.hub.publish, { userId: alice.id, snapshot: { ...base, title: BAD_WORD }, visibility: 'public' })).rejects.toThrow(FILTER_MESSAGE);
  });

  test('a banned cook gets 401 everywhere and disappears from lists and profiles', async () => {
    const { t, cook, publish, post, postJson, get, list, tagCounts, getJson } = setup();
    const [mallory, bob] = [await cook('Mallory'), await cook('Bob')];
    const id = await publish(mallory);
    const bobs = await publish(bob, { title: "Bob's" });
    await postJson('/api/v2/made', { id: bobs, rating: 1, tip: 'Meh' }, mallory.token);
    await postJson('/api/v2/follow', { userId: mallory.id, following: true }, bob.token);
    await t.mutation(internal.moderation.banUser, { userId: mallory.id, reason: 'Harassment' });

    expect((await post('/api/v2/me', {}, mallory.token)).status).toBe(401);
    expect((await post('/api/v2/like', { id: bobs, liked: true }, mallory.token)).status).toBe(401);
    expect((await get('/api/v2/recipes', mallory.token)).status).toBe(401);
    expect((await post('/api/v2/report', { recipeId: bobs, reason: 'spam' }, mallory.token)).status).toBe(401);
    expect((await list()).recipes.map((recipe) => recipe.title)).toEqual(["Bob's"]);
    expect((await get(`/api/v2/recipes/${id}`)).status).toBe(404);
    expect((await get(`/api/v2/cooks/${mallory.id}`)).status).toBe(404);
    expect(await tagCounts()).toEqual([{ tag: 'quick', count: 1 }]);
    // Their tip and rating are gone from Bob's recipe.
    expect(await getJson<Detail>(`/api/v2/recipes/${bobs}`)).toMatchObject({ madeCount: 0, tips: [] });
    expect((await post('/api/v2/follow', { userId: mallory.id, following: true }, bob.token)).status).toBe(404);
    expect((await postJson<{ recipes: Listing[] }>('/api/v2/feed/following', {}, bob.token)).recipes).toEqual([]);
  });

  test('requests that are too large answer 413', async () => {
    const { cook, post } = setup();
    const alice = await cook('Alice');
    expect((await post('/api/v2/me/profile', { bio: 'x'.repeat(20_000) }, alice.token)).status).toBe(413);
  });
});

test('deleting an account removes its content, activity and counters everywhere', async () => {
  const { t, cook, publish, post, postJson, getJson, list, tagCounts } = setup();
  const [alice, bob, carol] = [await cook('Alice'), await cook('Bob'), await cook('Carol')];
  const alices = await publish(alice, { title: "Alice's", tags: ['Dinner'], photoDataUrl: PHOTO });
  const bobs = await publish(bob, { title: "Bob's", tags: ['Dinner'] });
  await t.mutation(internal.moderation.setModerator, { userId: alice.id, moderator: true });
  await postJson('/api/v2/me/profile', { bio: 'Soon gone' }, alice.token);
  // Alice's activity on Bob's recipe, and others' activity on hers.
  await postJson('/api/v2/like', { id: bobs, liked: true }, alice.token);
  await postJson('/api/v2/like', { id: bobs, liked: true }, carol.token);
  await postJson('/api/v2/made', { id: bobs, rating: 1, tip: "Alice's tip" }, alice.token);
  await postJson('/api/v2/made', { id: bobs, rating: 5, tip: "Carol's tip" }, carol.token);
  await postJson('/api/v2/follow', { userId: bob.id, following: true }, alice.token);
  await postJson('/api/v2/follow', { userId: alice.id, following: true }, bob.token);
  await postJson('/api/v2/follow', { userId: alice.id, following: true }, carol.token);
  await postJson('/api/v2/like', { id: alices, liked: true }, bob.token);
  await postJson('/api/v2/made', { id: alices, rating: 4, tip: 'Nice' }, bob.token);
  await postJson('/api/v2/save', { id: alices, clientKey: key(1) });
  await postJson('/api/v2/report', { recipeId: alices, reason: 'spam', clientKey: key(9) });
  const tipId = (await getJson<Detail>(`/api/v2/recipes/${bobs}`)).tips.find((tip) => tip.author.id === alice.id)!.id;
  await postJson('/api/v2/report', { recipeId: bobs, tipId, reason: 'offensive', clientKey: key(9) });

  expect(await (await post('/api/v1/account/delete', {}, alice.token)).json()).toEqual({ success: true });

  expect((await post('/api/v2/me', {}, alice.token)).status).toBe(401);
  expect((await list()).recipes.map((recipe) => recipe.title)).toEqual(["Bob's"]);
  expect(await tagCounts()).toEqual([{ tag: 'dinner', count: 1 }]);
  expect(await getJson<Detail>(`/api/v2/recipes/${bobs}`)).toMatchObject({ likeCount: 1, madeCount: 1, rating: 5, tips: [{ tip: "Carol's tip" }] });
  expect(await postJson<Me>('/api/v2/me', {}, bob.token)).toMatchObject({ followerCount: 0, followingCount: 0, recipeCount: 1 });
  expect((await postJson<Me>('/api/v2/me', {}, carol.token)).followingCount).toBe(0);
  const left = await t.run(async (ctx) => ({
    user: await ctx.db.get(alice.id),
    recipes: (await ctx.db.query('hubRecipes').collect()).map((recipe) => recipe.userId),
    likes: (await ctx.db.query('hubLikes').collect()).map((like) => like.userId),
    made: (await ctx.db.query('hubMade').collect()).map((made) => made.userId),
    saves: (await ctx.db.query('hubSaves').collect()).length,
    follows: (await ctx.db.query('hubFollows').collect()).length,
    profiles: (await ctx.db.query('hubProfiles').collect()).map((profile) => profile.userId).sort(),
    moderators: (await ctx.db.query('hubModerators').collect()).length,
    tagRows: (await ctx.db.query('hubRecipeTags').collect()).map((row) => row.recipeId),
    files: (await ctx.db.system.query('_storage').collect()).length,
    openReports: (await ctx.db.query('hubReports').withIndex('by_status', (q) => q.eq('status', 'open')).collect()).length,
  }));
  expect(left).toEqual({
    user: null, recipes: [bob.id], likes: [carol.id], made: [carol.id], saves: 0, follows: 0, profiles: [bob.id, carol.id].sort(),
    moderators: 0, tagRows: [bobs], files: 0, openReports: 0,
  });
});
