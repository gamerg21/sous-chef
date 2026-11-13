// Read-only community access for the pages that need no account: /explore,
// /explore/recipes/:id and the recipe download. Requests carry no token. Every
// response is checked before use, and anything the word filter catches is
// dropped. A service without API v2 is read through API v1 instead.
import { parseSnapshot, type Detail, type Listing, type Publication, type RecipeSnapshot, type SortOrder, type Tip } from '../../lib/community-contract';
import { isObjectionable, snapshotTexts } from '../../lib/community-filter';
import { communityOrigin, remoteV2, CommunityError, parseDetail, parseListings, parseTags } from './communityRemote';

const MAX_RESPONSE_BYTES = 8_000_000;
const INVALID = 'The community service sent a response this server could not read';

/** A listing for a public page. `inlinePhoto` is a checked `data:image/…` URL, only from an API v1 service. */
export type PublicListing = Listing & { inlinePhoto?: string };
export type PublicTag = { tag: string; count: number };
export type PublicFeed =
  | { state: 'ok'; recipes: PublicListing[]; cursor: string | null; tags: PublicTag[]; legacy: boolean }
  | { state: 'unavailable' };
export type PublicRecipe =
  | { state: 'ok'; detail: Detail; legacy: boolean }
  | { state: 'missing' }
  | { state: 'unavailable' };
export type PublicFeedQuery = { search?: string; sort?: SortOrder; tag?: string; cursor?: string; limit?: number };

function configured(): boolean {
  try { return !!communityOrigin(); } catch { return false; }
}
const isNotFound = (error: unknown) => error instanceof CommunityError && error.code === 'not_found';

/** GET `${COMMUNITY_API_URL}/api/v1/${path}` with the same care as `remoteV2`: no redirects, no cache, capped size. */
async function remoteV1(path: string): Promise<unknown> {
  const origin = communityOrigin();
  if (!origin) throw new CommunityError('This instance has not connected to a community service', 'unconfigured');
  let res: Response; let text: string;
  try {
    res = await fetch(`${origin}/api/v1/${path}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000), redirect: 'error', cache: 'no-store' });
    if (Number(res.headers.get('content-length')) > MAX_RESPONSE_BYTES) { await res.body?.cancel().catch(() => {}); throw new CommunityError('Community response too large', 'invalid'); }
    text = await res.text();
  } catch (error) {
    if (error instanceof CommunityError) throw error;
    throw new CommunityError('The community service could not be reached', 'unreachable');
  }
  if (text.length > MAX_RESPONSE_BYTES) throw new CommunityError('Community response too large', 'invalid');
  if (!res.ok) throw new CommunityError('The community service could not complete this request', res.status === 404 ? 'not_found' : res.status >= 500 ? 'unreachable' : 'failed');
  try { return JSON.parse(text); } catch { throw new CommunityError(INVALID, 'invalid'); }
}

// ── API v1 response checks ──────────────────────────────────────────────
const bad = (): never => { throw new CommunityError(INVALID, 'invalid'); };
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : bad();
const string = (value: unknown, max: number, min = 0): string => typeof value === 'string' && value.length >= min && value.length <= max ? value : bad();

/** A v1 publication, copied field by field; anything unexpected is rejected. */
export function parsePublication(value: unknown): Publication {
  const o = record(value); const author = record(o.author);
  const revision = typeof o.revision === 'number' && Number.isInteger(o.revision) && o.revision >= 0 && o.revision <= 1e12 ? o.revision : bad();
  const createdAt = string(o.createdAt, 40, 1);
  if (Number.isNaN(Date.parse(createdAt))) bad();
  let snapshot: RecipeSnapshot;
  try { snapshot = parseSnapshot(o.snapshot); } catch { return bad(); }
  return { id: string(o.id, 200, 1), revision, createdAt, author: { id: string(author.id, 200, 1), name: string(author.name, 200) }, snapshot };
}
export function parsePublications(value: unknown): Publication[] {
  const recipes = record(value).recipes;
  return Array.isArray(recipes) && recipes.length <= 100 ? recipes.map(parsePublication) : bad();
}

/** A v1 publication in the shape of a v2 listing. v1 has no counters, so they read as zero. */
export function publicationListing(publication: Publication): PublicListing {
  const s = publication.snapshot;
  return {
    id: publication.id, revision: publication.revision, createdAt: publication.createdAt, updatedAt: publication.createdAt, author: publication.author,
    title: s.title, ...(s.description ? { description: s.description } : {}), tags: s.tags,
    ...(s.servings !== undefined ? { servings: s.servings } : {}), ...(s.totalTimeMinutes !== undefined ? { totalTimeMinutes: s.totalTimeMinutes } : {}),
    ingredientNames: s.ingredients.map(ingredient => ingredient.name), likeCount: 0, saveCount: 0, madeCount: 0,
    ...(s.photoDataUrl ? { inlinePhoto: s.photoDataUrl } : {}),
  };
}
/** v1 doesn't say whether a recipe is unlisted, so its pages are treated as unlisted (never indexed). */
export function publicationDetail(publication: Publication): Detail {
  const listing: PublicListing = publicationListing(publication);
  delete listing.inlinePhoto; // the snapshot already carries the photo
  return { ...listing, visibility: 'unlisted', snapshot: publication.snapshot, tips: [] };
}

// ── The word filter ─────────────────────────────────────────────────────
export const listingAllowed = (listing: Listing) => !isObjectionable(listing.title, listing.description, ...listing.tags, listing.author.name);
export const tipAllowed = (tip: Tip) => !isObjectionable(tip.tip, tip.author.name);
export const detailAllowed = (detail: Detail) => listingAllowed(detail) && !isObjectionable(...snapshotTexts(detail.snapshot));

// ── Reads ───────────────────────────────────────────────────────────────
/** One page of public recipes with the most used tags. Never throws. */
export async function publicFeed(query: PublicFeedQuery = {}): Promise<PublicFeed> {
  if (!configured()) return { state: 'unavailable' };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ sort: query.sort, tag: query.tag, search: query.search, cursor: query.cursor })) if (value) params.set(key, value);
  params.set('limit', String(Math.min(Math.max(Math.trunc(query.limit ?? 20) || 20, 1), 50)));
  try {
    const [page, tags] = await Promise.all([
      remoteV2(`recipes?${params}`).then(parseListings),
      // Tags are decoration: the list still shows without them.
      remoteV2('tags').then(parseTags).catch(() => ({ tags: [] as PublicTag[] })),
    ]);
    return { state: 'ok', recipes: page.recipes.filter(listingAllowed), cursor: page.cursor, tags: tags.tags.filter(entry => !isObjectionable(entry.tag)), legacy: false };
  } catch (error) {
    if (!isNotFound(error)) return { state: 'unavailable' };
  }
  // No API v2 on this service: the v1 list has search only.
  try {
    const publications = parsePublications(await remoteV1(`recipes?${new URLSearchParams({ search: query.search ?? '', limit: '50' })}`));
    return { state: 'ok', recipes: publications.map(publicationListing).filter(listingAllowed), cursor: null, tags: [], legacy: true };
  } catch {
    return { state: 'unavailable' };
  }
}

async function legacyRecipe(id: string): Promise<PublicRecipe> {
  try {
    const publication = parsePublication(await remoteV1(`recipes/${encodeURIComponent(id)}`));
    if (publication.id !== id) return { state: 'unavailable' };
    const detail = publicationDetail(publication);
    return detailAllowed(detail) ? { state: 'ok', detail, legacy: true } : { state: 'missing' };
  } catch (error) {
    return { state: isNotFound(error) ? 'missing' : 'unavailable' };
  }
}

/**
 * One public or unlisted recipe. `missing` means the community answered and
 * has no such recipe (or the word filter caught it); `unavailable` means the
 * community couldn't be read. Never throws.
 */
export async function publicRecipe(id: string, options: { inlinePhoto?: boolean } = {}): Promise<PublicRecipe> {
  if (!id || id.length > 200) return { state: 'missing' };
  if (!configured()) return { state: 'unavailable' };
  try {
    const detail = parseDetail(await remoteV2(`recipes/${encodeURIComponent(id)}${options.inlinePhoto ? '?photo=inline' : ''}`));
    if (detail.id !== id) return { state: 'unavailable' };
    if (!detailAllowed(detail)) return { state: 'missing' };
    return { state: 'ok', detail: { ...detail, tips: detail.tips.filter(tipAllowed) }, legacy: false };
  } catch (error) {
    if (!isNotFound(error)) return { state: 'unavailable' };
  }
  // A 404 is either a missing recipe or a service without API v2. Only the
  // second may be read through v1, so a recipe v2 hides is never shown from v1.
  try { await remoteV2('tags'); return { state: 'missing' }; }
  catch (error) { if (!isNotFound(error)) return { state: 'unavailable' }; }
  return legacyRecipe(id);
}

export type PublicDownload = { id: string; revision: number; author: string; snapshot: RecipeSnapshot };
/** A recipe for the portable download, with its photo embedded whenever the community has one. Null when it can't be offered. */
export async function publicDownload(id: string): Promise<PublicDownload | null> {
  const result = await publicRecipe(id, { inlinePhoto: true });
  if (result.state !== 'ok') return null;
  const { detail } = result;
  let snapshot = detail.snapshot;
  if (!result.legacy && detail.photoUrl && !snapshot.photoDataUrl) {
    // The photo is listed but didn't come inline: v1 still inlines it. Only the same revision's photo is used.
    try {
      const publication = parsePublication(await remoteV1(`recipes/${encodeURIComponent(id)}`));
      if (publication.id === id && publication.revision === detail.revision && publication.snapshot.photoDataUrl) snapshot = { ...snapshot, photoDataUrl: publication.snapshot.photoDataUrl };
    } catch {}
  }
  return { id: detail.id, revision: detail.revision, author: detail.author.name, snapshot };
}
