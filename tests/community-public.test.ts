import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { parsePublication, publicationDetail, publicationListing, publicDownload, publicFeed, publicRecipe } from '../src/server/kitchen/communityPublic';

const ORIGIN = 'https://community.test';
const PHOTO = 'data:image/png;base64,iVBORw0KGgo=';
type Route = (url: URL) => unknown;
function mockRemote(routes: Record<string, Route>) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    expect(url.origin).toBe(ORIGIN);
    expect(init.method ?? 'GET').toBe('GET');
    expect(new Headers(init.headers).get('authorization')).toBeNull();
    expect(init.redirect).toBe('error');
    calls.push(url.pathname + url.search);
    const route = routes[url.pathname];
    if (!route) return Response.json({ error: 'Not found' }, { status: 404 });
    const result = await route(url);
    return result instanceof Response ? result : Response.json(result);
  }));
  return calls;
}
const snapshot = (overrides: Record<string, unknown> = {}) => ({ version: 1, title: 'Tomato pasta', description: 'Simple', tags: ['dinner'], servings: 2, totalTimeMinutes: 30, ingredients: [{ name: 'Tomatoes', quantity: 2 }, { name: 'Basil', note: 'torn' }], steps: [{ text: 'Cook' }], ...overrides });
const listing = (id: string, overrides: Record<string, unknown> = {}) => ({
  id, revision: 1, createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-02T10:00:00.000Z', author: { id: 'cook-1', name: 'Ada' },
  title: `Recipe ${id}`, description: 'Good', tags: ['dinner'], servings: 2, totalTimeMinutes: 30, photoUrl: `https://files.test/${id}.jpg`,
  ingredientNames: ['Tomatoes'], likeCount: 3, saveCount: 2, madeCount: 1, rating: 4.5, ...overrides,
});
const tip = (id: string, overrides: Record<string, unknown> = {}) => ({ id, author: { id: 'cook-2', name: 'Bo' }, rating: 5, tip: 'Add garlic', createdAt: '2026-11-03T10:00:00.000Z', ...overrides });
const detail = (id: string, overrides: Record<string, unknown> = {}) => ({ ...listing(id), visibility: 'public', snapshot: snapshot(), tips: [tip('t1')], ...overrides });
const publication = (id: string, overrides: Record<string, unknown> = {}) => ({ id, revision: 1, author: { id: 'cook-1', name: 'Ada' }, createdAt: '2026-11-01T10:00:00.000Z', snapshot: snapshot(), ...overrides });

beforeEach(() => { vi.stubEnv('COMMUNITY_API_URL', ORIGIN); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('v1 publications', () => {
  test('are copied field by field and rejected when malformed', () => {
    expect(parsePublication({ ...publication('r1'), extra: 'ignored' })).toEqual(publication('r1'));
    for (const broken of [null, [], { ...publication('r1'), id: '' }, { ...publication('r1'), revision: 1.5 }, { ...publication('r1'), author: { id: 'a' } }, { ...publication('r1'), createdAt: 'yesterday' }, publication('r1', { snapshot: snapshot({ title: '' }) }), publication('r1', { snapshot: snapshot({ photoDataUrl: 'https://tracker.test/p.gif' }) })]) {
      expect(() => parsePublication(broken)).toThrow('could not read');
    }
  });
  test('become listings without counters and unlisted details', () => {
    const item = publicationListing(parsePublication(publication('r1', { snapshot: snapshot({ photoDataUrl: PHOTO }) })));
    expect(item).toMatchObject({ id: 'r1', title: 'Tomato pasta', ingredientNames: ['Tomatoes', 'Basil'], likeCount: 0, saveCount: 0, madeCount: 0, inlinePhoto: PHOTO });
    expect(item.photoUrl).toBeUndefined();
    const full = publicationDetail(parsePublication(publication('r1')));
    expect(full).toMatchObject({ visibility: 'unlisted', tips: [] });
    expect('inlinePhoto' in full).toBe(false);
  });
});

describe('publicFeed', () => {
  test('is unavailable without a configured or with an insecure community', async () => {
    vi.stubEnv('COMMUNITY_API_URL', '');
    expect(await publicFeed()).toEqual({ state: 'unavailable' });
    vi.stubEnv('COMMUNITY_API_URL', 'http://community.test');
    expect(await publicFeed()).toEqual({ state: 'unavailable' });
  });
  test('reads v2 with the query, drops filtered listings and tags, and keeps only https photos', async () => {
    const calls = mockRemote({
      '/api/v2/recipes': () => ({ recipes: [listing('r1'), listing('r2', { title: 'Fucking good ribs' }), listing('r3', { photoUrl: 'http://files.test/plain.jpg', author: { id: 'c', name: 'Ok' } }), listing('r4', { tags: ['shit'] })], cursor: 'next' }),
      '/api/v2/tags': () => ({ tags: [{ tag: 'dinner', count: 9 }, { tag: 'shit', count: 2 }] }),
    });
    const feed = await publicFeed({ sort: 'top', tag: 'Dinner & more', cursor: 'c&1', limit: 24 });
    expect(calls).toContain('/api/v2/recipes?sort=top&tag=Dinner+%26+more&cursor=c%261&limit=24');
    expect(feed).toMatchObject({ state: 'ok', cursor: 'next', legacy: false, tags: [{ tag: 'dinner', count: 9 }] });
    if (feed.state !== 'ok') throw new Error('unreachable');
    expect(feed.recipes.map(recipe => recipe.id)).toEqual(['r1', 'r3']);
    expect(feed.recipes[1].photoUrl).toBeUndefined();
  });
  test('still lists recipes when tags fail', async () => {
    mockRemote({ '/api/v2/recipes': () => ({ recipes: [listing('r1')], cursor: null }), '/api/v2/tags': () => new Response('', { status: 500 }) });
    expect(await publicFeed()).toMatchObject({ state: 'ok', tags: [], cursor: null });
  });
  test('is unavailable on errors and unreadable responses', async () => {
    mockRemote({ '/api/v2/recipes': () => new Response('stack', { status: 502 }) });
    expect(await publicFeed()).toEqual({ state: 'unavailable' });
    mockRemote({ '/api/v2/recipes': () => ({ recipes: 'none', cursor: null }) });
    expect(await publicFeed()).toEqual({ state: 'unavailable' });
    // One unreadable listing is left out; the rest of the page still shows.
    mockRemote({ '/api/v2/recipes': () => ({ recipes: [listing('r1', { likeCount: -1 }), listing('r2')], cursor: null }) });
    expect(await publicFeed()).toMatchObject({ state: 'ok', recipes: [{ id: 'r2' }] });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await publicFeed()).toEqual({ state: 'unavailable' });
  });
  test('falls back to v1 search when the service has no v2', async () => {
    const calls = mockRemote({ '/api/v1/recipes': () => ({ recipes: [publication('r1', { snapshot: snapshot({ photoDataUrl: PHOTO }) }), publication('r2', { snapshot: snapshot({ steps: [{ text: 'fine' }], title: 'Bitch stew' }) })] }) });
    const feed = await publicFeed({ search: 'pasta', sort: 'top', cursor: 'x' });
    expect(calls.at(-1)).toBe('/api/v1/recipes?search=pasta&limit=50');
    expect(feed).toMatchObject({ state: 'ok', legacy: true, cursor: null, tags: [] });
    if (feed.state !== 'ok') throw new Error('unreachable');
    expect(feed.recipes).toHaveLength(1);
    expect(feed.recipes[0]).toMatchObject({ id: 'r1', inlinePhoto: PHOTO });
  });
  test('is unavailable when v1 is unreadable too', async () => {
    mockRemote({ '/api/v1/recipes': () => ({ recipes: [{ id: 'r1' }] }) });
    expect(await publicFeed()).toEqual({ state: 'unavailable' });
  });
});

describe('publicRecipe', () => {
  test('returns a checked detail without filtered tips', async () => {
    mockRemote({ '/api/v2/recipes/r%201': () => detail('r 1', { visibility: 'unlisted', tips: [tip('t1'), tip('t2', { tip: 'fucking great' }), tip('t3', { author: { id: 'x', name: 'cunt' } })] }) });
    const result = await publicRecipe('r 1');
    expect(result).toMatchObject({ state: 'ok', legacy: false, detail: { id: 'r 1', visibility: 'unlisted' } });
    if (result.state !== 'ok') throw new Error('unreachable');
    expect(result.detail.tips.map(entry => entry.id)).toEqual(['t1']);
  });
  test('treats filtered, swapped and invalid recipes as not shown', async () => {
    mockRemote({
      '/api/v2/recipes/step': () => detail('step', { snapshot: snapshot({ steps: [{ text: 'Stir, you bastard' }] }) }),
      '/api/v2/recipes/swap': () => detail('other'),
      '/api/v2/recipes/private': () => detail('private', { visibility: 'private' }),
    });
    expect(await publicRecipe('step')).toEqual({ state: 'missing' });
    expect(await publicRecipe('swap')).toEqual({ state: 'unavailable' });
    expect(await publicRecipe('private')).toEqual({ state: 'unavailable' });
    expect(await publicRecipe('')).toEqual({ state: 'missing' });
    expect(await publicRecipe('x'.repeat(201))).toEqual({ state: 'missing' });
  });
  test('a 404 on a v2 service is a missing recipe, never read from v1', async () => {
    const calls = mockRemote({ '/api/v2/tags': () => ({ tags: [] }), '/api/v1/recipes/gone': () => publication('gone') });
    expect(await publicRecipe('gone')).toEqual({ state: 'missing' });
    expect(calls).toEqual(['/api/v2/recipes/gone', '/api/v2/tags']);
  });
  test('falls back to v1 only when the service has no v2', async () => {
    mockRemote({ '/api/v1/recipes/r1': () => publication('r1', { snapshot: snapshot({ photoDataUrl: PHOTO }) }) });
    expect(await publicRecipe('r1')).toMatchObject({ state: 'ok', legacy: true, detail: { id: 'r1', visibility: 'unlisted', snapshot: { photoDataUrl: PHOTO } } });
    expect(await publicRecipe('nope')).toEqual({ state: 'missing' });
  });
  test('is unavailable when the community fails', async () => {
    mockRemote({ '/api/v2/recipes/r1': () => new Response('', { status: 503 }) });
    expect(await publicRecipe('r1')).toEqual({ state: 'unavailable' });
    mockRemote({ '/api/v2/tags': () => new Response('', { status: 429 }) });
    expect(await publicRecipe('r1')).toEqual({ state: 'unavailable' });
  });
});

describe('publicDownload', () => {
  test('asks v2 for the inline photo', async () => {
    const calls = mockRemote({ '/api/v2/recipes/r1': url => detail('r1', { revision: 4, snapshot: snapshot(url.searchParams.get('photo') === 'inline' ? { photoDataUrl: PHOTO } : {}) }) });
    expect(await publicDownload('r1')).toMatchObject({ id: 'r1', revision: 4, author: 'Ada', snapshot: { photoDataUrl: PHOTO } });
    expect(calls).toEqual(['/api/v2/recipes/r1?photo=inline']);
  });
  test('takes a listed photo from v1 when v2 did not inline it, only for the same revision', async () => {
    mockRemote({ '/api/v2/recipes/r1': () => detail('r1', { revision: 2 }), '/api/v1/recipes/r1': () => publication('r1', { revision: 2, snapshot: snapshot({ photoDataUrl: PHOTO }) }) });
    expect((await publicDownload('r1'))?.snapshot.photoDataUrl).toBe(PHOTO);
    mockRemote({ '/api/v2/recipes/r1': () => detail('r1', { revision: 3 }), '/api/v1/recipes/r1': () => publication('r1', { revision: 2, snapshot: snapshot({ photoDataUrl: PHOTO }) }) });
    expect(await publicDownload('r1')).toMatchObject({ revision: 3, snapshot: { title: 'Tomato pasta' } });
    expect((await publicDownload('r1'))?.snapshot.photoDataUrl).toBeUndefined();
  });
  test('downloads from a v1-only service with its photo, and gives nothing for a missing recipe', async () => {
    mockRemote({ '/api/v1/recipes/r1': () => publication('r1', { snapshot: snapshot({ photoDataUrl: PHOTO }) }) });
    expect(await publicDownload('r1')).toMatchObject({ id: 'r1', author: 'Ada', snapshot: { photoDataUrl: PHOTO } });
    expect(await publicDownload('nope')).toBeNull();
  });
});
