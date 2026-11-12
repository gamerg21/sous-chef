/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, expect, test, vi } from 'vitest';
import schema from './schema';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { hashCommunityToken } from './hub';
import type { Cook, Detail, Listing } from '../src/lib/community-contract';
const modules = import.meta.glob('./**/*.ts');

const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const base = { version: 1 as const, title: 'Tomato pasta', tags: ['Quick', 'Dinner'], ingredients: [{ name: 'Pasta' }], steps: [{ text: 'Cook.' }] };
const SITE = 'https://example.convex.site';

/** A deployment as API v1 left it: inline photos, no counters, tags or profiles. */
async function legacy() {
  const t = convexTest(schema, modules);
  const token = 'token-alice';
  const hash = await hashCommunityToken(token);
  const ids = await t.run(async (ctx) => {
    const alice = await ctx.db.insert('users', { name: 'Alice' });
    const bob = await ctx.db.insert('users', { name: 'Bob' });
    await ctx.db.insert('hubTokens', { userId: alice, hash, expires: Date.now() + 86_400_000 });
    const insert = (userId: Id<'users'>, title: string, visibility: 'public' | 'unlisted' | 'private', extra: object = {}) =>
      ctx.db.insert('hubRecipes', { userId, snapshot: { ...base, title, ...extra }, revision: 3, visibility, updatedAt: Date.now(), searchText: `${title} quick dinner` });
    return {
      alice,
      bob,
      withPhoto: await insert(alice, 'With photo', 'public', { photoDataUrl: PHOTO }),
      plain: await insert(alice, 'Plain', 'public', { tags: ['Quick'] }),
      unlisted: await insert(alice, 'Unlisted', 'unlisted', { photoDataUrl: PHOTO }),
      hidden: await insert(bob, 'Private', 'private'),
      removed: await ctx.db.insert('hubRecipes', { userId: bob, snapshot: { ...base, title: 'Removed' }, revision: 1, visibility: 'private', updatedAt: 0, searchText: 'removed', removedAt: 5, removalReason: 'Spam' }),
      bobs: await insert(bob, "Bob's", 'public', { photoDataUrl: 'data:image/png;base64,not*valid' }),
    };
  });
  const getJson = async <T>(path: string, auth?: string) => {
    const response = await t.fetch(path, { headers: auth ? { Authorization: `Bearer ${auth}` } : {} });
    expect(response.status, path).toBe(200);
    return (await response.json()) as T;
  };
  const snapshotState = () => t.run(async (ctx) => ({
    recipes: (await ctx.db.query('hubRecipes').collect()).map(({ _id, photoId, hot, likeCount, saveCount, madeCount, ratingSum, counted, snapshot }) => ({ _id, photoId, hot, likeCount, saveCount, madeCount, ratingSum, counted, inline: !!snapshot.photoDataUrl })),
    tagRows: (await ctx.db.query('hubRecipeTags').collect()).map(({ tag, recipeId }) => `${tag}:${recipeId}`).sort(),
    tagCounts: (await ctx.db.query('hubTagCounts').collect()).map(({ tag, count }) => `${tag}:${count}`).sort(),
    profiles: (await ctx.db.query('hubProfiles').collect()).map(({ userId, recipeCount }) => `${userId}:${recipeCount}`).sort(),
    files: (await ctx.db.system.query('_storage').collect()).length,
  }));
  return { t, token, ids, getJson, snapshotState };
}

afterEach(() => vi.unstubAllEnvs());

test('unmigrated publications are readable and writable through both API versions', async () => {
  vi.stubEnv('CONVEX_SITE_URL', SITE);
  const { t, token, ids, getJson } = await legacy();

  const { recipes } = await getJson<{ recipes: Listing[] }>('/api/v2/recipes');
  expect(recipes.map((recipe) => recipe.title)).toEqual(["Bob's", 'Plain', 'With photo']);
  const withPhoto = recipes[2];
  expect(withPhoto).toMatchObject({ likeCount: 0, saveCount: 0, madeCount: 0, revision: 3 });
  expect(JSON.stringify(recipes)).not.toContain('base64');
  // The inline photo is served by the service until it moves to file storage.
  expect(withPhoto.photoUrl).toBe(`${SITE}/api/v2/recipes/${ids.withPhoto}/photo?r=3`);
  const photo = await t.fetch(`/api/v2/recipes/${ids.withPhoto}/photo`);
  expect(photo.headers.get('Content-Type')).toBe('image/png');
  expect(Array.from(new Uint8Array(await photo.arrayBuffer()))).toEqual(Array.from(atob(PHOTO.split(',')[1]), (c) => c.charCodeAt(0)));
  expect((await t.fetch(`/api/v2/recipes/${ids.hidden}/photo`)).status).toBe(404);
  expect((await t.fetch(`/api/v2/recipes/${ids.plain}/photo`)).status).toBe(404);

  for (const sort of ['hot', 'top']) expect((await getJson<{ recipes: Listing[] }>(`/api/v2/recipes?sort=${sort}`)).recipes).toHaveLength(3);
  expect((await getJson<{ recipes: Listing[] }>('/api/v2/recipes?search=plain')).recipes.map((recipe) => recipe.title)).toEqual(['Plain']);
  expect((await getJson<{ recipes: Listing[] }>(`/api/v2/recipes?author=${ids.alice}`)).recipes).toHaveLength(2);
  const detail = await getJson<Detail>(`/api/v2/recipes/${ids.withPhoto}`);
  expect(detail.snapshot).not.toHaveProperty('photoDataUrl');
  expect((await getJson<Detail>(`/api/v2/recipes/${ids.withPhoto}?photo=inline`)).snapshot.photoDataUrl).toBe(PHOTO);
  expect((await getJson<{ snapshot: { photoDataUrl?: string } }>(`/api/v1/recipes/${ids.unlisted}`)).snapshot.photoDataUrl).toBe(PHOTO);
  expect((await getJson<{ recipes: { snapshot: { photoDataUrl?: string } }[] }>('/api/v1/recipes')).recipes[2].snapshot.photoDataUrl).toBe(PHOTO);
  expect((await t.query(api.hub.get, { id: ids.withPhoto }))?.snapshot.photoDataUrl).toBe(PHOTO);

  // Likes and unpublishing work on a document the migration hasn't reached.
  const post = (path: string, body: unknown) => t.fetch(path, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  expect(await (await post('/api/v2/like', { id: ids.bobs, liked: true })).json()).toEqual({ liked: true, likeCount: 1 });
  expect((await post('/api/v1/unpublish', { id: ids.plain })).status).toBe(200);
  expect((await getJson<{ tags: unknown[] }>('/api/v2/tags')).tags).toEqual([{ tag: 'dinner', count: 1 }, { tag: 'quick', count: 1 }]);
  expect((await getJson<Cook>(`/api/v2/cooks/${ids.alice}`)).recipeCount).toBe(0);
  expect((await getJson<Cook>(`/api/v2/cooks/${ids.bob}`)).recipeCount).toBe(1);
});

test('the migration moves photos, backfills counters, tags and profiles, and can be run again', async () => {
  const { t, ids, getJson, snapshotState } = await legacy();
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  expect(await t.action(internal.migrations.run, {})).toEqual({ recipes: 6, photosMoved: 2, photosSkipped: 1, done: true, cursor: null });
  const state = await snapshotState();
  expect(state.files).toBe(2);
  for (const recipe of state.recipes) {
    expect(recipe).toMatchObject({ likeCount: 0, saveCount: 0, madeCount: 0, ratingSum: 0, hot: expect.any(Number) });
  }
  const byId = new Map(state.recipes.map((recipe) => [recipe._id, recipe]));
  expect(byId.get(ids.withPhoto)).toMatchObject({ inline: false, photoId: expect.any(String), counted: true });
  expect(byId.get(ids.unlisted)).toMatchObject({ inline: false, photoId: expect.any(String) });
  expect(byId.get(ids.unlisted)!.counted).toBeUndefined();
  // A photo that can't be decoded stays where it is.
  expect(byId.get(ids.bobs)).toMatchObject({ inline: true, counted: true });
  expect(byId.get(ids.bobs)!.photoId).toBeUndefined();
  expect(state.tagRows).toEqual([`dinner:${ids.bobs}`, `dinner:${ids.withPhoto}`, `quick:${ids.bobs}`, `quick:${ids.plain}`, `quick:${ids.withPhoto}`].sort());
  expect(state.tagCounts).toEqual(['dinner:2', 'quick:3']);
  expect(state.profiles).toEqual([`${ids.alice}:2`, `${ids.bob}:1`].sort());

  // Running it again, whole or in slices, changes nothing.
  expect(await t.action(internal.migrations.run, {})).toEqual({ recipes: 6, photosMoved: 0, photosSkipped: 1, done: true, cursor: null });
  expect(await snapshotState()).toEqual(state);
  const first = await t.action(internal.migrations.run, { maxRecipes: 2 });
  expect(first).toMatchObject({ recipes: 5, done: false, cursor: expect.any(String) });
  expect(await t.action(internal.migrations.run, { cursor: first.cursor })).toMatchObject({ recipes: 1, done: true, cursor: null });
  expect(await snapshotState()).toEqual(state);

  // Readers see the same recipes as before, now with stored photos.
  const listing = (await getJson<{ recipes: Listing[] }>('/api/v2/recipes?tag=dinner')).recipes;
  expect(listing.map((recipe) => recipe.title)).toEqual(["Bob's", 'With photo']);
  expect(listing[1].photoUrl).toMatch(/^https:\/\//);
  expect((await getJson<Detail>(`/api/v2/recipes/${ids.withPhoto}?photo=inline`)).snapshot.photoDataUrl).toBe(PHOTO);
  expect((await getJson<{ snapshot: { photoDataUrl?: string }; revision: number }>(`/api/v1/recipes/${ids.withPhoto}`))).toMatchObject({ revision: 3, snapshot: { photoDataUrl: PHOTO } });
  expect((await getJson<{ tags: unknown[] }>('/api/v2/tags')).tags).toEqual([{ tag: 'quick', count: 3 }, { tag: 'dinner', count: 2 }]);
});

test('a publication that changed while its photo was being moved keeps its new state', async () => {
  const { t, ids, snapshotState } = await legacy();
  const photoId = await t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })));
  // The author republished (revision 4) between the migration's read and its write.
  await t.run((ctx) => ctx.db.patch(ids.withPhoto, { revision: 4 }));
  expect(await t.mutation(internal.migrations.migrateRecipe, { id: ids.withPhoto, revision: 3, photoId, photoType: 'image/png' })).toEqual({ photoMoved: false });
  const state = await snapshotState();
  expect(state.files).toBe(0);
  expect(state.recipes.find((recipe) => recipe._id === ids.withPhoto)).toMatchObject({ inline: true, likeCount: 0, counted: true });
  // The next run picks it up.
  expect(await t.action(internal.migrations.run, {})).toMatchObject({ photosMoved: 2, done: true });
});

test('migrating keeps counters that already exist', async () => {
  const { t, token, ids, getJson } = await legacy();
  const post = (path: string, body: unknown) => t.fetch(path, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  await post('/api/v2/like', { id: ids.bobs, liked: true });
  await post('/api/v2/made', { id: ids.bobs, rating: 4 });
  await t.action(internal.migrations.run, {});
  expect((await getJson<{ recipes: Listing[] }>(`/api/v2/recipes?author=${ids.bob}`, token)).recipes[0]).toMatchObject({ likeCount: 1, madeCount: 1, rating: 4, liked: true });
});
