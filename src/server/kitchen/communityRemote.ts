// HTTP client for the community service's API v2 (docs/COMMUNITY_API.md) and
// the checks every response passes before this server uses or stores it. The
// remote service is untrusted: parsers copy known fields and ignore the rest,
// so a newer service can add fields without breaking an older server.
import { parseSnapshot, REPORT_REASONS, type Author, type Cook, type Detail, type Listing, type Me, type OwnListing, type Report, type ReportReason, type Tip } from '../../lib/community-contract';

export const NOT_CONNECTED = 'Connect your community account first';
export const RECONNECT = 'Your community sign-in has expired. Reconnect your community account';
export const TRY_LATER = 'The community is busy. Try again in a little while';
export const UNREACHABLE = 'The community service could not be reached';
const FAILED = 'The community service could not complete this request';
const INVALID = 'The community service sent a response this server could not read';
const MAX_RESPONSE_BYTES = 8_000_000;
const SNAPSHOT_BYTES = 750_000;

export type CommunityErrorCode = 'unconfigured' | 'unreachable' | 'unauthorized' | 'rate_limited' | 'rejected' | 'forbidden' | 'not_found' | 'invalid' | 'failed';
export class CommunityError extends Error {
  constructor(message: string, readonly code: CommunityErrorCode) { super(message); this.name = 'CommunityError'; }
}

/** The configured community origin, or null. HTTPS only, except localhost outside production. */
export function communityOrigin() {const value=process.env.COMMUNITY_API_URL;if(!value)return null;const url=new URL(value);if(url.protocol!=='https:' && !(process.env.NODE_ENV!=='production' && url.hostname==='localhost'))throw new Error('Community API requires HTTPS');return url.origin;}

/** True when a stored origin (possibly written with a path or trailing slash) is the configured community. */
export function isCurrentOrigin(stored: string): boolean {
  let current: string | null;
  try { current = communityOrigin(); } catch { return false; }
  if (!current) return false;
  try { return new URL(stored).origin === current; } catch { return false; }
}

async function readCapped(res: Response): Promise<string> {
  if (Number(res.headers.get('content-length')) > MAX_RESPONSE_BYTES) { await res.body?.cancel().catch(() => {}); throw new CommunityError('Community response too large', 'invalid'); }
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_RESPONSE_BYTES) { await reader.cancel().catch(() => {}); throw new CommunityError('Community response too large', 'invalid'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** The remote's own explanation of a rejected request: short, single line, text only. */
function rejection(text: string): string {
  try {
    const error = (JSON.parse(text) as { error?: unknown } | null)?.error;
    if (typeof error === 'string') { const message = error.replace(/[\u0000-\u001f\u007f]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 300); if (message) return message; }
  } catch {}
  return FAILED;
}

/**
 * Calls `${COMMUNITY_API_URL}/api/v2/${path}`: GET without a body, POST with
 * one. Never follows redirects or caches. Failures become fixed messages; only
 * a 400's `error` string is passed on. `tokenOptional` marks a public read
 * that sends the token just to fill in `liked`/`viewer`.
 */
export async function remoteV2(path: string, options: { body?: unknown; token?: string; timeoutMs?: number; tokenOptional?: boolean } = {}): Promise<unknown> {
  // A read that only personalizes its result still works once the stored
  // sign-in has expired: ask again without it.
  if (options.tokenOptional && options.token) {
    try { return await remoteV2(path, { ...options, tokenOptional: false }); }
    catch (expired) {
      if (!(expired instanceof CommunityError) || expired.code !== 'unauthorized') throw expired;
      try { return await remoteV2(path, { ...options, token: undefined, tokenOptional: false }); }
      catch (error) { throw error instanceof CommunityError && error.code === 'unauthorized' ? expired : error; }
    }
  }
  const origin = communityOrigin();
  if (!origin) throw new CommunityError('This instance has not connected to a community service', 'unconfigured');
  const { body, token } = options;
  let res: Response; let text: string;
  try {
    res = await fetch(`${origin}/api/v2/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(options.timeoutMs ?? 15000), redirect: 'error', cache: 'no-store' });
    text = await readCapped(res);
  } catch (error) {
    if (error instanceof CommunityError) throw error;
    throw new CommunityError(UNREACHABLE, 'unreachable');
  }
  if (!res.ok) {
    switch (res.status) {
      case 400: throw new CommunityError(rejection(text), 'rejected');
      case 401: throw new CommunityError(token ? RECONNECT : NOT_CONNECTED, 'unauthorized');
      case 403: throw new CommunityError("Your community account isn't allowed to do this", 'forbidden');
      case 404: throw new CommunityError("This isn't available in the community anymore", 'not_found');
      case 413: throw new CommunityError('This is too large for the community', 'rejected');
      case 429: throw new CommunityError(TRY_LATER, 'rate_limited');
      default: throw new CommunityError(FAILED, res.status >= 500 ? 'unreachable' : 'failed');
    }
  }
  try { return JSON.parse(text); } catch { throw new CommunityError(INVALID, 'invalid'); }
}

// ── Response checks ─────────────────────────────────────────────────────
const bad = (): never => { throw new CommunityError(INVALID, 'invalid'); };
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : bad();
const absent = (value: unknown) => value === undefined || value === null;
const text = (value: unknown, max: number, min = 0): string => typeof value === 'string' && value.length >= min && value.length <= max ? value : bad();
const optionalText = (value: unknown, max: number) => absent(value) ? undefined : text(value, max);
const id = (value: unknown) => text(value, 200, 1);
const count = (value: unknown): number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1e12 ? value : bad();
const amount = (value: unknown, min: number, max: number): number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : bad();
const optionalAmount = (value: unknown, min: number, max: number) => absent(value) ? undefined : amount(value, min, max);
const flag = (value: unknown): boolean => typeof value === 'boolean' ? value : bad();
const optionalFlag = (value: unknown) => absent(value) ? undefined : flag(value);
const list = <T>(value: unknown, max: number, item: (entry: unknown) => T): T[] => Array.isArray(value) && value.length <= max ? value.map(item) : bad();
const time = (value: unknown): string => { const iso = text(value, 40, 1); return Number.isNaN(Date.parse(iso)) ? bad() : iso; };
/** List entries that don't pass their check are left out instead of failing the whole response. */
const listOfValid = <T>(value: unknown, max: number, item: (entry: unknown) => T): T[] => (Array.isArray(value) ? value : bad()).slice(0, max).flatMap(entry => { try { return [item(entry)]; } catch (error) { if (error instanceof CommunityError && error.code === 'invalid') return []; throw error; } });
/** A number shown as a detail of a recipe: one out of range is dropped, not a reason to reject the recipe. */
const looseAmount = (value: unknown, max: number) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? value : undefined;
const oneOf = <T extends string>(value: unknown, options: readonly T[]): T => options.includes(value as T) ? value as T : bad();
/** A URL the browser may load: https, no credentials. Anything else counts as absent. */
export function httpsUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2048) return undefined;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
}
/** Drops undefined fields so results compare and serialize cleanly. */
const compact = <T extends object>(value: T): T => { for (const key of Object.keys(value) as (keyof T)[]) if (value[key] === undefined) delete value[key]; return value; };

export const parseCursor = (value: unknown): string | null => absent(value) ? null : text(value, 2000, 1);
const parseAuthor = (value: unknown): Author => { const o = object(value); return { id: id(o.id), name: text(o.name, 200) }; };

export function parseListing(value: unknown): Listing {
  const o = object(value);
  return compact({
    id: id(o.id), revision: count(o.revision), createdAt: time(o.createdAt), updatedAt: time(o.updatedAt), author: parseAuthor(o.author),
    // The service bounds a publication by its total size, not per field, so the text limits here are that total.
    title: text(o.title, 200, 1), description: optionalText(o.description, SNAPSHOT_BYTES), tags: list(o.tags, 30, tag => text(tag, SNAPSHOT_BYTES)),
    servings: looseAmount(o.servings, 1e9), totalTimeMinutes: looseAmount(o.totalTimeMinutes, 1e9),
    photoUrl: httpsUrl(o.photoUrl), ingredientNames: list(o.ingredientNames, 200, name => text(name, SNAPSHOT_BYTES)),
    likeCount: count(o.likeCount), saveCount: count(o.saveCount), madeCount: count(o.madeCount),
    rating: optionalAmount(o.rating, 0, 5), shareUrl: httpsUrl(o.shareUrl), liked: optionalFlag(o.liked),
  });
}
export function parseTip(value: unknown): Tip {
  const o = object(value);
  return compact({ id: id(o.id), author: parseAuthor(o.author), rating: amount(o.rating, 0, 5), tip: optionalText(o.tip, 2000), createdAt: time(o.createdAt) });
}
const parseMade = (value: unknown) => { const o = object(value); return compact({ rating: amount(o.rating, 0, 5), tip: optionalText(o.tip, 2000) }); };
export function parseDetail(value: unknown): Detail {
  const o = object(value);
  let snapshot: Detail['snapshot'];
  try { snapshot = parseSnapshot(o.snapshot); } catch { return bad(); }
  const viewer = absent(o.viewer) ? undefined : object(o.viewer);
  return compact({
    ...parseListing(o), visibility: oneOf(o.visibility, ['public', 'unlisted'] as const), snapshot, tips: list(o.tips, 100, parseTip),
    viewer: viewer && compact({ liked: flag(viewer.liked), following: flag(viewer.following), own: flag(viewer.own), made: absent(viewer.made) ? undefined : parseMade(viewer.made) }),
  });
}
export function parseCook(value: unknown): Cook {
  const o = object(value);
  const viewer = absent(o.viewer) ? undefined : object(o.viewer);
  return compact({
    id: id(o.id), name: text(o.name, 200), bio: optionalText(o.bio, 2000),
    recipeCount: count(o.recipeCount), followerCount: count(o.followerCount), followingCount: count(o.followingCount),
    viewer: viewer && { following: flag(viewer.following), own: flag(viewer.own) },
  });
}
export const parseMe = (value: unknown): Me => ({ ...parseCook(value), moderator: flag(object(value).moderator) });
const parseOwnListing = (value: unknown): OwnListing => { const o = object(value); return { ...parseListing(o), visibility: oneOf(o.visibility, ['public', 'unlisted', 'private'] as const), removed: flag(o.removed), underReview: flag(o.underReview) }; };
function parseReport(value: unknown): Report {
  const o = object(value);
  const recipe = absent(o.recipe) ? null : object(o.recipe);
  const tip = absent(o.tip) ? undefined : object(o.tip);
  return compact({
    id: id(o.id), status: oneOf(o.status, ['open', 'actioned', 'dismissed'] as const), createdAt: time(o.createdAt),
    reason: oneOf<ReportReason>(o.reason, REPORT_REASONS), note: optionalText(o.note, 5000), reportCount: count(o.reportCount),
    recipe: recipe && { id: id(recipe.id), title: text(recipe.title, 200), author: parseAuthor(recipe.author), visibility: text(recipe.visibility, 40), underReview: flag(recipe.underReview) },
    tip: tip && compact({ id: id(tip.id), author: parseAuthor(tip.author), rating: amount(tip.rating, 0, 5), tip: optionalText(tip.tip, 2000) }),
    resolution: optionalText(o.resolution, 5000), resolvedAt: absent(o.resolvedAt) ? undefined : time(o.resolvedAt),
  });
}

export const parseListings = (value: unknown) => { const o = object(value); return { recipes: listOfValid(o.recipes, 100, parseListing), cursor: parseCursor(o.cursor) }; };
export const parseOwnListings = (value: unknown) => { const o = object(value); return { recipes: listOfValid(o.recipes, 100, parseOwnListing), cursor: parseCursor(o.cursor) }; };
export const parseTips = (value: unknown) => { const o = object(value); return { tips: listOfValid(o.tips, 100, parseTip), cursor: parseCursor(o.cursor) }; };
export const parseReports = (value: unknown) => { const o = object(value); return { reports: list(o.reports, 100, parseReport), cursor: parseCursor(o.cursor) }; };
export const parseTags = (value: unknown) => ({ tags: list(object(value).tags, 100, entry => { const o = object(entry); return { tag: text(o.tag, 100, 1), count: count(o.count) }; }) });
export const parseLike = (value: unknown) => { const o = object(value); return { liked: flag(o.liked), likeCount: count(o.likeCount) }; };
export const parseMadeTotals = (value: unknown) => { const o = object(value); return compact({ madeCount: count(o.madeCount), rating: optionalAmount(o.rating, 0, 5) }); };
export const parseFollow = (value: unknown) => { const o = object(value); return { following: flag(o.following), followerCount: count(o.followerCount) }; };
export const parseSuccess = (value: unknown): { success: true } => object(value).success === true ? { success: true } : bad();
/** `{revisions: {[id]: number | null}}`, limited to the IDs that were asked for. */
export function parseRevisions(value: unknown, ids: string[]): Map<string, number | null> {
  const revisions = object(object(value).revisions);
  const result = new Map<string, number | null>();
  for (const key of ids) if (Object.hasOwn(revisions, key)) result.set(key, revisions[key] === null ? null : count(revisions[key]));
  return result;
}
