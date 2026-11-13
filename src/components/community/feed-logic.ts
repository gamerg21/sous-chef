// Pure helpers for the community screens: merging pages, patching cached
// recipes after a like or follow, and reading the server's failure messages.
// No React and no '@/…' imports, so tests/community-feed.test.ts can load it.
import type { Cook, LocalDetail, LocalListing, PantryMatch, Tip } from '../../lib/community-contract'

// ── Failures ────────────────────────────────────────────────────────────
// The local server reports failures as message strings. These mirror
// src/server/kitchen/communityRemote.ts; the test keeps the two in step.
export const NOT_CONNECTED_MESSAGE = 'Connect your community account first'
export const RECONNECT_MESSAGE = 'Your community sign-in has expired. Reconnect your community account'
export const TRY_LATER_MESSAGE = 'The community is busy. Try again in a little while'
export const UNREACHABLE_MESSAGE = 'The community service could not be reached'

export type ProblemKind = 'not_connected' | 'reconnect' | 'rate_limited' | 'unreachable' | 'gone' | 'other'
export interface Problem {
  kind: ProblemKind
  title: string
  message: string
  /** Where the person can fix it, when there is such a place. */
  action?: { href: string; label: string }
  /** Whether asking again could help. */
  retry: boolean
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : typeof error === 'string' ? error : '')

export function describeProblem(error: unknown): Problem {
  const message = messageOf(error)
  if (message === NOT_CONNECTED_MESSAGE)
    return { kind: 'not_connected', title: 'Connect your community account', message: 'Liking, following, rating and your own shared recipes need a community account.', action: { href: '/community/connect', label: 'Connect account' }, retry: false }
  if (message === RECONNECT_MESSAGE)
    return { kind: 'reconnect', title: 'Reconnect your community account', message: 'Your community sign-in has expired. Reconnect to keep going.', action: { href: '/community/connect', label: 'Reconnect' }, retry: false }
  if (message === TRY_LATER_MESSAGE)
    return { kind: 'rate_limited', title: 'The community is busy', message: 'Too many requests right now. Wait a little while, then try again.', retry: true }
  if (message === UNREACHABLE_MESSAGE)
    return { kind: 'unreachable', title: 'Community unavailable', message: 'The community service could not be reached. Your own kitchen is unaffected.', retry: true }
  if (/isn't available/.test(message))
    return { kind: 'gone', title: 'No longer available', message: 'This may have been unshared, removed, or hidden by you.', retry: false }
  return { kind: 'other', title: 'Something went wrong', message: message || 'The community could not complete this request.', retry: true }
}

// ── Pages ───────────────────────────────────────────────────────────────
/** Every item of the pages in order, keeping the first copy of each ID. */
export function mergePages<T extends { id: string }>(pages: ReadonlyArray<ReadonlyArray<T>>): T[] {
  const seen = new Set<string>()
  const merged: T[] = []
  for (const page of pages)
    for (const item of page) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      merged.push(item)
    }
  return merged
}

/** `existing` followed by the items of `incoming` it doesn't have yet. Order above never changes. */
export function appendUnique<T extends { id: string }>(existing: ReadonlyArray<T>, incoming: ReadonlyArray<T>): T[] {
  return mergePages([existing, incoming])
}

// ── Cache patches ───────────────────────────────────────────────────────
type Feed = { recipes: LocalListing[] }
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const isFeed = (value: unknown): value is Feed => isObject(value) && Array.isArray(value.recipes)
const isPaged = (value: unknown): value is { pages: unknown[] } => isObject(value) && Array.isArray(value.pages)
const isDetail = (value: unknown): value is LocalDetail => isObject(value) && typeof value.id === 'string' && isObject(value.snapshot)
const isCook = (value: unknown): value is Cook => isObject(value) && typeof value.id === 'string' && typeof value.followerCount === 'number'

/**
 * Applies `change` to every copy of a recipe in one cached query result: a
 * feed, a paged feed or a recipe page. Returns the same object when nothing
 * matched, so untouched queries don't re-render.
 */
export function patchRecipe<T>(data: T, id: string, change: (recipe: LocalListing) => Partial<LocalListing>): T {
  if (isPaged(data)) {
    let touched = false
    const pages = data.pages.map((page) => {
      const next = patchRecipe(page, id, change)
      if (next !== page) touched = true
      return next
    })
    return touched ? { ...data, pages } : data
  }
  if (isDetail(data)) {
    if (data.id !== id) return data
    const patch = change(data)
    const liked = patch.liked
    return { ...data, ...patch, ...(data.viewer && liked !== undefined ? { viewer: { ...data.viewer, liked } } : {}) }
  }
  if (isFeed(data)) {
    if (!data.recipes.some((recipe) => recipe.id === id)) return data
    return { ...data, recipes: data.recipes.map((recipe) => (recipe.id === id ? { ...recipe, ...change(recipe) } : recipe)) }
  }
  return data
}

/** The next like state and count; the count never drops below zero. */
export function likePatch(recipe: Pick<LocalListing, 'liked' | 'likeCount'>, liked: boolean): Pick<LocalListing, 'liked' | 'likeCount'> {
  const was = recipe.liked === true
  return { liked, likeCount: Math.max(0, recipe.likeCount + (liked === was ? 0 : liked ? 1 : -1)) }
}

/** Marks a cook followed or not on their profile and on every cached recipe page of theirs. */
export function patchFollow<T>(data: T, cookId: string, following: boolean, followerCount?: number): T {
  if (isDetail(data)) {
    if (data.author.id !== cookId || !data.viewer || data.viewer.following === following) return data
    return { ...data, viewer: { ...data.viewer, following } }
  }
  if (isCook(data)) {
    if (data.id !== cookId) return data
    const was = data.viewer?.following === true
    const count = followerCount ?? Math.max(0, data.followerCount + (following === was ? 0 : following ? 1 : -1))
    return { ...data, followerCount: count, viewer: { own: data.viewer?.own ?? false, following } }
  }
  return data
}

// ── Small formatters ────────────────────────────────────────────────────
/** A photo the browser may load: https only. Anything else is treated as no photo. */
export function safePhotoUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2048) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined
  } catch {
    return undefined
  }
}

/** An outside link a recipe may point to: http or https. */
export function safeLinkUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2048) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined
  } catch {
    return undefined
  }
}

/** "You have 5 of 7", or nothing when the recipe has no countable ingredients. */
export function pantrySummary(pantry: PantryMatch | undefined): string | null {
  if (!pantry || pantry.total <= 0) return null
  if (pantry.have >= pantry.total) return pantry.total === 1 ? 'You have the one ingredient' : `You have all ${pantry.total} ingredients`
  return `You have ${pantry.have} of ${pantry.total}`
}

/** "Missing: eggs, flour and 2 more". */
export function missingSummary(pantry: PantryMatch | undefined, show = 3): string | null {
  if (!pantry || pantry.missing.length === 0) return null
  const shown = pantry.missing.slice(0, show)
  const rest = pantry.missing.length - shown.length
  return `Missing: ${shown.join(', ')}${rest > 0 ? ` and ${rest} more` : ''}`
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

export type OwnStatus = 'removed' | 'review' | 'private' | 'unlisted' | 'public'
/** The one status shown for a shared recipe; moderation outranks the cook's own choice. */
export function ownStatus(recipe: { visibility: 'public' | 'unlisted' | 'private'; removed: boolean; underReview: boolean }): OwnStatus {
  if (recipe.removed) return 'removed'
  if (recipe.underReview) return 'review'
  return recipe.visibility
}

/** Whether a rating-only entry or a written tip: both are listed, tips first within a page. */
export const hasText = (tip: Tip) => !!tip.tip?.trim()
