// HTTP routes of API v2 (docs/COMMUNITY_API.md). These actions authenticate,
// validate and bound every input; the queries and mutations they call are
// internal. A user ID is only ever taken from the bearer token.
import { httpAction, type ActionCtx } from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { COMMUNITY_LIMITS, REPORT_REASONS, type Detail, type ModAction, type ReportReason, type ReportStatus, type SortOrder } from '../src/lib/community-contract';
import { hashCommunityToken } from './hub';
import type { Result, StoredPhoto } from './community';
import { BodyTooLarge, bearerUser, clientAddress, decodeDataUrl, json, readBoundedJson, toDataUrl } from './httpUtil';

const NOT_FOUND = () => json({ error: 'Not found' }, 404);
const INVALID = (message = 'Invalid request') => json({ error: message }, 400);
const UNAUTHENTICATED = () => json({ error: 'Not authenticated' }, 401);

const respond = <T>(result: Result<T>) => (result.ok ? json(result.value) : json({ error: result.error }, result.status));

/** A string of bounded length, or null. */
const text = (value: unknown, min: number, max: number) => (typeof value === 'string' && value.length >= min && value.length <= max ? value : null);
/** An opaque ID from a request. */
const id = (value: unknown) => text(value, 1, 64);
const optional = <T>(value: unknown, read: (value: unknown) => T | null): T | undefined | null => (value === undefined || value === null ? undefined : read(value));

function pageSize(value: unknown): number {
  const limit = Math.floor(Number(value ?? 20));
  return Number.isFinite(limit) ? Math.max(1, Math.min(50, limit)) : 20;
}
const cursorOf = (value: unknown) => optional(value || undefined, (cursor) => text(cursor, 1, 4_000));

/**
 * The caller of an endpoint where a token is optional: null without one,
 * `false` when the token sent is invalid (which answers 401).
 */
async function optionalUser(ctx: ActionCtx, request: Request): Promise<Id<'users'> | null | false> {
  if (!request.headers.get('authorization')) return null;
  return (await bearerUser(ctx, request)) ?? false;
}

// ── GET ────────────────────────────────────────────────────────────────

const SORTS: readonly SortOrder[] = ['new', 'hot', 'top'];

async function listRecipes(ctx: ActionCtx, url: URL, viewer: Id<'users'> | null) {
  const param = (name: string) => url.searchParams.get(name) || undefined;
  const sort = (param('sort') ?? 'new') as SortOrder;
  const cursor = cursorOf(param('cursor'));
  const search = optional(param('search'), (value) => text(value, 1, 200));
  const author = optional(param('author'), id);
  const tag = optional(param('tag'), (value) => text(value, 1, 200));
  if (!SORTS.includes(sort) || cursor === null || search === null || author === null || tag === null) return INVALID();
  return json(await ctx.runQuery(internal.community.listRecipes, {
    sort, search, author, tag, viewer: viewer ?? undefined, paginationOpts: { numItems: pageSize(param('limit')), cursor: cursor ?? null },
  }));
}

async function recipeDetail(ctx: ActionCtx, recipeId: string, inline: boolean, viewer: Id<'users'> | null) {
  const found: { detail: Detail; photo: StoredPhoto | null } | null = await ctx.runQuery(internal.community.recipeDetail, { id: recipeId, viewer: viewer ?? undefined });
  if (!found) return NOT_FOUND();
  const { detail, photo } = found;
  if (!inline) {
    delete detail.snapshot.photoDataUrl;
  } else if (photo) {
    const blob = await ctx.storage.get(photo.id);
    if (blob) detail.snapshot.photoDataUrl = await toDataUrl(blob, photo.type);
  }
  return json(detail);
}

/** Serves a photo that is still inline in an unmigrated document (or a stored one), so lists can link to it. */
async function recipePhoto(ctx: ActionCtx, recipeId: string) {
  const photo: { stored: StoredPhoto } | { dataUrl: string } | null = await ctx.runQuery(internal.community.recipePhoto, { id: recipeId });
  if (!photo) return NOT_FOUND();
  const headers = { 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' };
  if ('stored' in photo) {
    const blob = await ctx.storage.get(photo.stored.id);
    return blob ? new Response(blob, { headers: { ...headers, 'Content-Type': photo.stored.type } }) : NOT_FOUND();
  }
  const decoded = decodeDataUrl(photo.dataUrl);
  return decoded ? new Response(new Blob([decoded.bytes], { type: decoded.type }), { headers: { ...headers, 'Content-Type': decoded.type } }) : NOT_FOUND();
}

export const read = httpAction(async (ctx, request) => {
  const viewer = await optionalUser(ctx, request);
  if (viewer === false) return UNAUTHENTICATED();
  try {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/v2\//, '').split('/').map((part) => decodeURIComponent(part));
    const [resource, key, sub] = path;
    if (path.length > 3 || (key !== undefined && !id(key))) return NOT_FOUND();

    if (key === undefined) {
      if (resource === 'recipes') return await listRecipes(ctx, url, viewer);
      if (resource === 'tags') return json({ tags: await ctx.runQuery(internal.community.tags, {}) });
      if (resource === 'revisions') {
        const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean);
        if (ids.length > 100 || ids.some((value) => !id(value))) return INVALID('Ask for up to 100 recipe IDs');
        return json({ revisions: await ctx.runQuery(internal.community.revisions, { ids }) });
      }
      return NOT_FOUND();
    }
    if (resource === 'cooks' && sub === undefined) {
      const cook = await ctx.runQuery(internal.community.cook, { id: key, viewer: viewer ?? undefined });
      return cook ? json(cook) : NOT_FOUND();
    }
    if (resource !== 'recipes') return NOT_FOUND();
    if (sub === undefined) return await recipeDetail(ctx, key, url.searchParams.get('photo') === 'inline', viewer);
    if (sub === 'photo') return await recipePhoto(ctx, key);
    if (sub === 'tips') {
      const cursor = cursorOf(url.searchParams.get('cursor'));
      if (cursor === null) return INVALID();
      const tips = await ctx.runQuery(internal.community.tips, { id: key, paginationOpts: { numItems: pageSize(url.searchParams.get('limit')), cursor: cursor ?? null } });
      return tips ? json(tips) : NOT_FOUND();
    }
    return NOT_FOUND();
  } catch (error) {
    // Malformed paths and cursors that don't belong to the query.
    console.warn('Community read rejected:', error instanceof Error ? error.message.slice(0, 200) : 'unknown error');
    return INVALID();
  }
});

// ── POST ───────────────────────────────────────────────────────────────

type Body = Record<string, unknown>;
const sha256 = hashCommunityToken;
const CLIENT_KEY = /^[a-f0-9]{64}$/;
const clientKeyOf = (value: unknown) => {
  const key = text(value, 64, 64)?.toLowerCase();
  return key && CLIENT_KEY.test(key) ? key : null;
};

async function save(ctx: ActionCtx, request: Request, body: Body) {
  const recipeId = id(body.id);
  const clientKey = clientKeyOf(body.clientKey);
  if (!recipeId || !clientKey) return INVALID();
  return respond(await ctx.runMutation(internal.community.save, { id: recipeId, clientKey, address: clientAddress(request) }));
}

async function report(ctx: ActionCtx, request: Request, body: Body, userId: Id<'users'> | null) {
  const recipeId = id(body.recipeId);
  const tipId = optional(body.tipId, id);
  const reason = REPORT_REASONS.find((known) => known === body.reason) as ReportReason | undefined;
  const note = optional(body.note, (value) => text(value, 0, COMMUNITY_LIMITS.reportNote));
  const clientKey = optional(body.clientKey, clientKeyOf);
  if (!recipeId || tipId === null || !reason || note === null || clientKey === null) return INVALID();
  const address = clientAddress(request);
  // Stored only as a hash: who reported is never readable from the database.
  const reporter = await sha256(userId ? `user:${userId}` : clientKey ? `key:${clientKey}` : `address:${address}`);
  // Client keys are self-chosen, so anonymous reports from one address count as one reporter toward hiding a recipe.
  const reporterGroup = userId ? reporter : await sha256(`address:${address}`);
  return respond(await ctx.runMutation(internal.reports.report, { recipeId, tipId, reason, note, reporter, reporterGroup, address }));
}

const STATUSES: readonly ReportStatus[] = ['open', 'actioned', 'dismissed'];
const ACTIONS: readonly ModAction[] = ['dismiss', 'remove_recipe', 'remove_tip', 'ban_user'];

async function signedIn(ctx: ActionCtx, path: string, body: Body, userId: Id<'users'>): Promise<Response> {
  switch (path) {
    case 'me': {
      const me = await ctx.runQuery(internal.community.me, { userId });
      return me ? json(me) : UNAUTHENTICATED();
    }
    case 'me/profile': {
      const name = optional(body.name, (value) => text(value, 0, 400));
      const bio = optional(body.bio, (value) => text(value, 0, 2_000));
      if (name === null || bio === null) return INVALID();
      return respond(await ctx.runMutation(internal.community.updateProfile, { userId, name, bio }));
    }
    case 'me/recipes': {
      const cursor = cursorOf(body.cursor);
      if (cursor === null) return INVALID();
      return json(await ctx.runQuery(internal.community.myRecipes, { userId, paginationOpts: { numItems: 30, cursor: cursor ?? null } }));
    }
    case 'like': {
      const recipeId = id(body.id);
      if (!recipeId || typeof body.liked !== 'boolean') return INVALID();
      return respond(await ctx.runMutation(internal.community.like, { userId, id: recipeId, liked: body.liked }));
    }
    case 'made': {
      const recipeId = id(body.id);
      const tip = optional(body.tip, (value) => text(value, 0, 4_000));
      if (!recipeId || tip === null) return INVALID();
      if (typeof body.rating !== 'number' || !Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) return INVALID('A rating is a whole number from 1 to 5');
      return respond(await ctx.runMutation(internal.community.made, { userId, id: recipeId, rating: body.rating, tip }));
    }
    case 'made/delete': {
      const recipeId = id(body.id);
      if (!recipeId) return INVALID();
      return respond(await ctx.runMutation(internal.community.removeMade, { userId, id: recipeId }));
    }
    case 'follow': {
      const target = id(body.userId);
      if (!target || typeof body.following !== 'boolean') return INVALID();
      return respond(await ctx.runMutation(internal.community.follow, { userId, target, following: body.following }));
    }
    case 'feed/following': {
      const cursor = optional(body.cursor || undefined, (value) => text(value, 1, 40));
      const before = cursor ? Number(cursor) : undefined;
      if (cursor === null || (before !== undefined && !(Number.isFinite(before) && before > 0))) return INVALID();
      return json(await ctx.runQuery(internal.community.followingFeed, { userId, before, limit: pageSize(body.limit) }));
    }
    case 'mod/reports': {
      const status = (body.status ?? 'open') as ReportStatus;
      const cursor = cursorOf(body.cursor);
      if (!STATUSES.includes(status) || cursor === null) return INVALID();
      return respond(await ctx.runQuery(internal.reports.modReports, { userId, status, paginationOpts: { numItems: 30, cursor: cursor ?? null } }));
    }
    case 'mod/resolve': {
      const reportId = id(body.reportId);
      const action = body.action as ModAction;
      const reason = optional(body.reason, (value) => text(value, 0, 200));
      if (!reportId || !ACTIONS.includes(action) || reason === null) return INVALID();
      return respond(await ctx.runMutation(internal.reports.modResolve, { userId, reportId, action, reason }));
    }
    default:
      return NOT_FOUND();
  }
}

export const write = httpAction(async (ctx, request) => {
  const path = new URL(request.url).pathname.replace(/^\/api\/v2\//, '');
  const anonymous = path === 'save' || path === 'report';
  const userId = await optionalUser(ctx, request);
  if (userId === false || (!userId && !anonymous)) return UNAUTHENTICATED();
  let body: Body;
  try {
    const parsed = await readBoundedJson(request, 16_000);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return INVALID();
    body = parsed as Body;
  } catch (error) {
    return error instanceof BodyTooLarge ? json({ error: 'Request too large' }, 413) : INVALID();
  }
  try {
    if (path === 'save') return await save(ctx, request, body);
    if (path === 'report') return await report(ctx, request, body, userId);
    return await signedIn(ctx, path, body, userId!);
  } catch (error) {
    // Cursors that don't belong to the query, and anything a validator refuses.
    console.warn('Community write rejected:', error instanceof Error ? error.message.slice(0, 200) : 'unknown error');
    return INVALID();
  }
});
