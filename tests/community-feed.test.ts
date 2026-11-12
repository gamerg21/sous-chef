import { describe, expect, it } from 'vitest';
import { NOT_CONNECTED, RECONNECT, TRY_LATER, UNREACHABLE } from '../src/server/kitchen/communityRemote';
import type { Cook, LocalDetail, LocalListing } from '../src/lib/community-contract';
import {
  NOT_CONNECTED_MESSAGE, RECONNECT_MESSAGE, TRY_LATER_MESSAGE, UNREACHABLE_MESSAGE,
  appendUnique, describeProblem, likePatch, mergePages, missingSummary, ownStatus, pantrySummary, patchFollow, patchRecipe, safeLinkUrl, safePhotoUrl,
} from '../src/components/community/feed-logic';

const listing = (id: string, extra: Partial<LocalListing> = {}): LocalListing => ({
  id, revision: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', author: { id: 'cook-1', name: 'Ada' },
  title: `Recipe ${id}`, tags: [], ingredientNames: [], likeCount: 3, saveCount: 0, madeCount: 0, saved: false, ...extra,
});
const detail = (id: string, extra: Partial<LocalDetail> = {}): LocalDetail => ({
  ...listing(id), visibility: 'public', snapshot: { version: 1, title: `Recipe ${id}`, tags: [], ingredients: [], steps: [] }, tips: [],
  viewer: { liked: false, following: false, own: false }, ...extra,
});

describe('community failure messages', () => {
  it('match the strings the server throws', () => {
    expect(NOT_CONNECTED_MESSAGE).toBe(NOT_CONNECTED);
    expect(RECONNECT_MESSAGE).toBe(RECONNECT);
    expect(TRY_LATER_MESSAGE).toBe(TRY_LATER);
    expect(UNREACHABLE_MESSAGE).toBe(UNREACHABLE);
  });
  it('become states with the right next step', () => {
    expect(describeProblem(new Error(NOT_CONNECTED))).toMatchObject({ kind: 'not_connected', retry: false, action: { href: '/community/connect' } });
    expect(describeProblem(new Error(RECONNECT))).toMatchObject({ kind: 'reconnect', action: { href: '/community/connect', label: 'Reconnect' } });
    expect(describeProblem(new Error(TRY_LATER))).toMatchObject({ kind: 'rate_limited', retry: true });
    expect(describeProblem(new Error(UNREACHABLE))).toMatchObject({ kind: 'unreachable', retry: true });
    expect(describeProblem(new Error("This recipe isn't available")).kind).toBe('gone');
    expect(describeProblem(new Error("This isn't available in the community anymore")).kind).toBe('gone');
    expect(describeProblem(new Error('Rating must be a whole number from 1 to 5'))).toMatchObject({ kind: 'other', message: 'Rating must be a whole number from 1 to 5' });
    expect(describeProblem(undefined).message).toBeTruthy();
  });
});

describe('page merging', () => {
  it('appends pages in order and shows a repeated recipe once', () => {
    const merged = mergePages([[listing('a'), listing('b')], [listing('b', { title: 'again' }), listing('c')], [], [listing('a'), listing('d')]]);
    expect(merged.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(merged[1].title).toBe('Recipe b');
  });
  it('never reorders what is already shown', () => {
    const shown = [listing('a'), listing('b')];
    expect(appendUnique(shown, [listing('c'), listing('a')]).map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(appendUnique(shown, [])).toEqual(shown);
  });
});

describe('cache patches', () => {
  it('patch a recipe in a feed, a paged feed and its own page', () => {
    const change = () => ({ liked: true, likeCount: 4 });
    const feed = { recipes: [listing('a'), listing('b')], cursor: null, available: true };
    const patchedFeed = patchRecipe(feed, 'b', change);
    expect(patchedFeed.recipes[1]).toMatchObject({ liked: true, likeCount: 4 });
    expect(patchedFeed.recipes[0]).toBe(feed.recipes[0]);

    const paged = { pages: [feed, { recipes: [listing('c')], cursor: null, available: true }], pageParams: [undefined, 'x'] };
    const patchedPaged = patchRecipe(paged, 'c', change);
    expect(patchedPaged.pages[1].recipes[0].likeCount).toBe(4);
    expect(patchedPaged.pages[0]).toBe(paged.pages[0]);
    expect(patchedPaged.pageParams).toBe(paged.pageParams);

    const page = detail('a');
    expect(patchRecipe(page, 'a', change)).toMatchObject({ liked: true, likeCount: 4, viewer: { liked: true, following: false } });
  });
  it('return the same object when nothing matches', () => {
    const feed = { recipes: [listing('a')], cursor: null, available: true };
    const paged = { pages: [feed], pageParams: [undefined] };
    const page = detail('a');
    const other = { tags: [{ tag: 'soup', count: 1 }] };
    for (const data of [feed, paged, page, other, null, 'text']) expect(patchRecipe(data, 'zzz', () => ({ likeCount: 9 }))).toBe(data);
  });
  it('compute an optimistic like without going negative or double counting', () => {
    expect(likePatch({ liked: false, likeCount: 3 }, true)).toEqual({ liked: true, likeCount: 4 });
    expect(likePatch({ liked: true, likeCount: 4 }, false)).toEqual({ liked: false, likeCount: 3 });
    expect(likePatch({ liked: true, likeCount: 4 }, true)).toEqual({ liked: true, likeCount: 4 });
    expect(likePatch({ likeCount: 0 }, false)).toEqual({ liked: false, likeCount: 0 });
    expect(likePatch({ liked: true, likeCount: 0 }, false).likeCount).toBe(0);
  });
  it('roll a like back to exactly what was there', () => {
    const feed = { recipes: [listing('a', { likeCount: 3 })], cursor: null, available: true };
    const optimistic = patchRecipe(feed, 'a', (r) => likePatch(r, true));
    const rolledBack = patchRecipe(optimistic, 'a', () => ({ liked: undefined, likeCount: 3 }));
    expect(rolledBack.recipes[0]).toEqual(feed.recipes[0]);
  });
  it('mark a cook followed on the profile and on their recipes only', () => {
    const cook: Cook = { id: 'cook-1', name: 'Ada', recipeCount: 2, followerCount: 5, followingCount: 0, viewer: { following: false, own: false } };
    expect(patchFollow(cook, 'cook-1', true)).toMatchObject({ followerCount: 6, viewer: { following: true } });
    expect(patchFollow(cook, 'cook-1', true, 9).followerCount).toBe(9);
    expect(patchFollow(patchFollow(cook, 'cook-1', true), 'cook-1', false)).toEqual(cook);
    expect(patchFollow(cook, 'cook-2', true)).toBe(cook);
    expect(patchFollow({ ...cook, followerCount: 0, viewer: { following: true, own: false } }, 'cook-1', false).followerCount).toBe(0);

    const page = detail('a');
    expect(patchFollow(page, 'cook-1', true).viewer?.following).toBe(true);
    expect(patchFollow(page, 'cook-2', true)).toBe(page);
    const anonymous = detail('a', { viewer: undefined });
    expect(patchFollow(anonymous, 'cook-1', true)).toBe(anonymous);
    const feed = { recipes: [listing('a')], cursor: null, available: true };
    expect(patchFollow(feed, 'cook-1', true)).toBe(feed);
  });
});

describe('untrusted values', () => {
  it('only loads https photos', () => {
    expect(safePhotoUrl('https://cdn.example/p.jpg')).toBe('https://cdn.example/p.jpg');
    for (const bad of ['http://cdn.example/p.jpg', 'javascript:alert(1)', 'data:image/png;base64,AAAA', '//cdn.example/p.jpg', '/api/files/1', 'https://user:pw@cdn.example/p.jpg', '', undefined, 5, `https://x.example/${'a'.repeat(3000)}`])
      expect(safePhotoUrl(bad)).toBeUndefined();
  });
  it('only links to web pages', () => {
    expect(safeLinkUrl('http://example.com/r')).toBe('http://example.com/r');
    expect(safeLinkUrl('https://example.com/r')).toBe('https://example.com/r');
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'mailto:a@b.c', 'example.com', undefined]) expect(safeLinkUrl(bad)).toBeUndefined();
  });
});

describe('labels', () => {
  it('summarise a pantry match', () => {
    expect(pantrySummary({ have: 5, total: 7, missing: ['a', 'b'] })).toBe('You have 5 of 7');
    expect(pantrySummary({ have: 0, total: 4, missing: ['a', 'b', 'c', 'd'] })).toBe('You have 0 of 4');
    expect(pantrySummary({ have: 3, total: 3, missing: [] })).toBe('You have all 3 ingredients');
    expect(pantrySummary({ have: 0, total: 0, missing: [] })).toBeNull();
    expect(pantrySummary(undefined)).toBeNull();
    expect(missingSummary({ have: 1, total: 6, missing: ['eggs', 'flour', 'milk', 'yeast', 'sugar'] })).toBe('Missing: eggs, flour, milk and 2 more');
    expect(missingSummary({ have: 1, total: 2, missing: ['eggs'] })).toBe('Missing: eggs');
    expect(missingSummary({ have: 2, total: 2, missing: [] })).toBeNull();
  });
  it('pick one status for a shared recipe, moderation first', () => {
    expect(ownStatus({ visibility: 'public', removed: false, underReview: false })).toBe('public');
    expect(ownStatus({ visibility: 'unlisted', removed: false, underReview: false })).toBe('unlisted');
    expect(ownStatus({ visibility: 'private', removed: false, underReview: false })).toBe('private');
    expect(ownStatus({ visibility: 'public', removed: false, underReview: true })).toBe('review');
    expect(ownStatus({ visibility: 'public', removed: true, underReview: true })).toBe('removed');
  });
});
