'use client'
// Data hooks for the community screens. Community reads go through their own
// query keys (['community', …]) instead of the kitchen-wide useQuery so that a
// failure (not connected, expired sign-in, rate limit) becomes a state on the
// screen rather than an error boundary, and so a like can patch the cached
// lists instead of refetching every page.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useInfiniteQuery, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { api } from '@/lib/kitchen/api'
import { request, useKitchenAuth } from '@/lib/kitchen/client'
import type { Ref } from '@/server/kitchen/_generated/server'
import type { LocalListing, SortOrder } from '@/lib/community-contract'
import { cx } from '@/components/ui/kit'
import { describeProblem, likePatch, mergePages, patchFollow, patchRecipe, type Problem } from './feed-logic'

const ROOT = 'community'
const POLL_MS = 60_000

/** The cache key of one community read, for patching it after a write. */
export const communityKey = <A,>(ref: Ref<A, unknown>, args: A) => [ROOT, ref.path, args] as const

// ── Reads ───────────────────────────────────────────────────────────────
export interface CommunityRead<R> {
  data: R | undefined
  /** Set when the latest attempt failed; `data` may still hold the last good result. */
  error: Error | null
  loading: boolean
  refetching: boolean
  refetch: () => void
}

export function useCommunityQuery<A, R>(ref: Ref<A, R>, args: A | 'skip', options: { poll?: boolean } = {}): CommunityRead<R> {
  const auth = useKitchenAuth()
  const enabled = args !== 'skip' && auth.isAuthenticated
  const result = useQuery<R, Error>({
    queryKey: args === 'skip' ? [ROOT, ref.path, 'skip'] : communityKey(ref, args),
    queryFn: () => request(ref, args as A),
    enabled,
    retry: false,
    staleTime: 30_000,
    refetchInterval: options.poll ? POLL_MS : false,
  })
  const { refetch } = result
  return {
    data: enabled ? result.data : undefined,
    error: enabled ? result.error : null,
    loading: !enabled || result.isPending,
    refetching: result.isFetching && !result.isPending,
    refetch: useCallback(() => void refetch(), [refetch]),
  }
}

export const useMe = () => useCommunityQuery(api.community.me, {}, { poll: true })

export type FeedSource =
  | { kind: 'all'; sort?: SortOrder; tag?: string; search?: string; author?: string; pantry?: boolean }
  | { kind: 'following' }

type FeedPage = { recipes: LocalListing[]; cursor: string | null; available: boolean }

export interface FeedRead {
  recipes: LocalListing[]
  available: boolean
  loading: boolean
  /** The first page failed and nothing is shown. */
  error: Error | null
  hasMore: boolean
  loadingMore: boolean
  /** "Load more" failed; the loaded recipes stay. */
  moreError: Error | null
  /** Resolves with how many new recipes arrived. */
  loadMore: () => Promise<number>
  refetch: () => void
}

/** A cursor-paged feed. Pages append; a recipe that appears on two pages is shown once. */
export function useFeed(source: FeedSource, options: { limit?: number; enabled?: boolean } = {}): FeedRead {
  const auth = useKitchenAuth()
  const enabled = options.enabled !== false && auth.isAuthenticated
  const limit = options.limit ?? 18
  const result = useInfiniteQuery<FeedPage, Error, { pages: FeedPage[] }, unknown[], string | undefined>({
    queryKey: [ROOT, 'feed', source, limit],
    queryFn: ({ pageParam }) => {
      const cursor = pageParam ? { cursor: pageParam } : {}
      if (source.kind === 'following') return request(api.community.followingFeed, { ...cursor, limit })
      const { sort, tag, search, author, pantry } = source
      return request(api.community.feed, { ...cursor, limit, ...(sort ? { sort } : {}), ...(tag ? { tag } : {}), ...(search ? { search } : {}), ...(author ? { author } : {}), ...(pantry ? { pantry: true } : {}) })
    },
    initialPageParam: undefined,
    getNextPageParam: (last) => last.cursor ?? undefined,
    enabled,
    retry: false,
    staleTime: POLL_MS,
    // Refetching a long list under the reader would move it; they can reload instead.
    refetchOnWindowFocus: false,
  })
  const pages = result.data?.pages
  const recipes = useMemo(() => mergePages((pages ?? []).map((page) => page.recipes)), [pages])
  const { fetchNextPage, refetch } = result
  const shown = recipes.length
  const loadMore = useCallback(async () => {
    // A page can come back with nothing new (everything on it hidden or already shown): look a little further.
    let count = shown
    for (let attempt = 0; attempt < 3; attempt++) {
      const next = await fetchNextPage()
      if (next.isError) throw next.error
      const total = mergePages((next.data?.pages ?? []).map((page) => page.recipes)).length
      if (total > count || !next.hasNextPage) return total - shown
      count = total
    }
    return count - shown
  }, [fetchNextPage, shown])
  return {
    recipes,
    available: pages ? pages.every((page) => page.available) : true,
    loading: !enabled || result.isPending,
    error: enabled && !pages ? result.error : null,
    hasMore: !!result.hasNextPage,
    loadingMore: result.isFetchingNextPage,
    moreError: pages && result.isFetchNextPageError ? result.error : null,
    loadMore,
    refetch: useCallback(() => void refetch(), [refetch]),
  }
}

// ── Notices ─────────────────────────────────────────────────────────────
export interface Notice {
  message: string
  tone?: 'neutral' | 'danger'
  action?: { href: string; label: string }
}
type Announce = (notice: Notice | string) => void
const NoticeContext = createContext<Announce>(() => {})

/**
 * Wraps a community screen. Results of likes, follows, saves and the like are
 * shown in one polite live region at the bottom of the screen, so they are
 * announced without moving focus or the layout.
 */
export function CommunityNotices({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<(Notice & { key: number }) | null>(null)
  const counter = useRef(0)
  const announce = useCallback<Announce>((notice) => {
    const next = typeof notice === 'string' ? { message: notice } : notice
    setCurrent({ ...next, key: ++counter.current })
  }, [])
  const key = current?.key
  const lasting = !!current?.action || current?.tone === 'danger'
  useEffect(() => {
    if (key === undefined) return
    const timer = setTimeout(() => setCurrent((shown) => (shown?.key === key ? null : shown)), lasting ? 10_000 : 5_000)
    return () => clearTimeout(timer)
  }, [key, lasting])
  return (
    <NoticeContext.Provider value={announce}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        <div role="status" aria-live="polite" aria-atomic="true" className="pointer-events-auto max-w-full">
          {current && (
            <div
              key={current.key}
              className={cx(
                'animate-rise-in flex max-w-md items-center gap-3 rounded-2xl border py-2 pl-4 pr-2 text-sm shadow-lg',
                current.tone === 'danger'
                  ? 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-100'
                  : 'border-stone-200 bg-white text-stone-800 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100'
              )}
            >
              <span className="min-w-0 flex-1 py-1.5">{current.message}</span>
              {current.action && (
                <Link href={current.action.href} className="shrink-0 rounded-lg px-2 py-1.5 font-semibold text-emerald-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-emerald-600 dark:text-emerald-300">
                  {current.action.label}
                </Link>
              )}
              <button type="button" onClick={() => setCurrent(null)} aria-label="Dismiss message" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-emerald-600 dark:hover:bg-white/10">
                <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>
    </NoticeContext.Provider>
  )
}

export const useAnnounce = () => useContext(NoticeContext)

/** Turns a failed action into a notice, with a link when connecting would fix it. */
export function problemNotice(error: unknown, doing: string): Notice {
  const problem: Problem = describeProblem(error)
  if (problem.kind === 'not_connected') return { message: `Connect your community account to ${doing}.`, action: problem.action, tone: 'neutral' }
  if (problem.kind === 'other') return { message: problem.message, tone: 'danger' }
  return { message: problem.message, action: problem.action, tone: 'danger' }
}

// ── Writes ──────────────────────────────────────────────────────────────
function patchCached(client: QueryClient, patch: <T>(data: T) => T) {
  client.setQueriesData({ queryKey: [ROOT] }, (data: unknown) => (data === undefined ? data : patch(data)))
}

/** Tracks which IDs have a request in flight; the ref answers at once, the state re-renders. */
function usePending() {
  const active = useRef(new Set<string>())
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  const begin = useCallback((id: string) => {
    if (active.current.has(id)) return false
    active.current.add(id)
    setPending(new Set(active.current))
    return true
  }, [])
  const end = useCallback((id: string) => {
    active.current.delete(id)
    setPending(new Set(active.current))
  }, [])
  return { pending, begin, end }
}

type Likeable = Pick<LocalListing, 'id' | 'liked' | 'likeCount'>

/** Like toggle: the heart and count change at once and roll back if the community says no. */
export function useLike() {
  const client = useQueryClient()
  const announce = useAnnounce()
  const me = useMe()
  const connected = me.data?.connected
  const { pending, begin, end } = usePending()
  const toggle = useCallback(
    async (recipe: Likeable) => {
      if (connected === false) return announce(problemNotice(new Error('Connect your community account first'), 'like recipes'))
      if (!begin(recipe.id)) return
      const liked = recipe.liked !== true
      const before = { liked: recipe.liked, likeCount: recipe.likeCount }
      patchCached(client, (data) => patchRecipe(data, recipe.id, (cached) => likePatch(cached, liked)))
      try {
        const result = await request(api.community.like, { id: recipe.id, liked })
        patchCached(client, (data) => patchRecipe(data, recipe.id, () => result))
        announce(result.liked ? 'Liked.' : 'Like removed.')
      } catch (error) {
        patchCached(client, (data) => patchRecipe(data, recipe.id, () => before))
        announce(problemNotice(error, 'like recipes'))
      } finally {
        end(recipe.id)
      }
    },
    [announce, begin, client, connected, end]
  )
  return { toggle, pending }
}

/** Follow toggle with the same optimistic behaviour as likes. */
export function useFollow() {
  const client = useQueryClient()
  const announce = useAnnounce()
  const me = useMe()
  const connected = me.data?.connected
  const { pending, begin, end } = usePending()
  const toggle = useCallback(
    async (cook: { id: string; name: string }, following: boolean) => {
      if (connected === false) return announce(problemNotice(new Error('Connect your community account first'), 'follow cooks'))
      if (!begin(cook.id)) return
      const next = !following
      patchCached(client, (data) => patchFollow(data, cook.id, next))
      try {
        const result = await request(api.community.follow, { userId: cook.id, following: next })
        patchCached(client, (data) => patchFollow(data, cook.id, result.following, result.followerCount))
        announce(result.following ? `Following ${cook.name}.` : `Unfollowed ${cook.name}.`)
        void client.invalidateQueries({ queryKey: [ROOT, 'feed', { kind: 'following' }] })
      } catch (error) {
        patchCached(client, (data) => patchFollow(data, cook.id, following))
        void client.invalidateQueries({ queryKey: [ROOT, api.community.cook.path] })
        announce(problemNotice(error, 'follow cooks'))
      } finally {
        end(cook.id)
      }
    },
    [announce, begin, client, connected, end]
  )
  return { toggle, pending }
}

/** Saves a copy into the household's own recipes. */
export function useSaveRecipe() {
  const client = useQueryClient()
  const announce = useAnnounce()
  const { pending, begin, end } = usePending()
  const save = useCallback(
    async (recipe: { id: string; title: string }) => {
      if (!begin(recipe.id)) return
      try {
        const { savedRecipeId } = await request(api.community.saveRecipe, { recipeId: recipe.id })
        patchCached(client, (data) => patchRecipe(data, recipe.id, (cached) => (cached.saved ? {} : { saved: true, saveCount: cached.saveCount + 1 })))
        void client.invalidateQueries({ queryKey: [ROOT, api.community.recipe.path] })
        void client.invalidateQueries({ queryKey: ['kitchen'] })
        announce({ message: `Saved “${recipe.title}” to your recipes.`, action: { href: `/recipes/${savedRecipeId}`, label: 'Open' } })
      } catch (error) {
        announce({ message: error instanceof Error && error.message ? error.message : 'This recipe could not be saved. Try again.', tone: 'danger' })
      } finally {
        end(recipe.id)
      }
    },
    [announce, begin, client, end]
  )
  return { save, pending }
}

/** Drops cached community reads so they load again, e.g. after hiding or blocking. */
export function useRefreshCommunity() {
  const client = useQueryClient()
  return useCallback(() => void client.invalidateQueries({ queryKey: [ROOT] }), [client])
}
