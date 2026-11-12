'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChefHat, Search, SearchX, ShoppingBasket, UserRoundPlus, Users, X } from 'lucide-react'
import { api } from '@/lib/kitchen/api'
import type { SortOrder } from '@/lib/community-contract'
import { buttonClassName, cardClassName, chipClassName, cx, EmptyState, fieldClassName, PageContainer, PageHeader, Section, SegmentedControl } from '@/components/ui/kit'
import { CommunityRecipeGrid } from './CommunityRecipeCard'
import { describeProblem, plural } from './feed-logic'
import { BackLink, focusRing, ProblemState, RecipeGridSkeleton, UnavailableState } from './parts'
import { CommunityNotices, useAnnounce, useCommunityQuery, useFeed, type FeedRead, type FeedSource } from './useCommunity'

type Tab = 'all' | 'following'
const SORTS: Array<{ value: SortOrder; label: string }> = [
  { value: 'new', label: 'New' },
  { value: 'hot', label: 'Trending' },
  { value: 'top', label: 'Top' },
]
const isSort = (value: string | null): value is SortOrder => value === 'new' || value === 'hot' || value === 'top'

/** The loaded recipes with "Load more" under them; shared by the feed and cook profiles. */
export function PagedRecipes({ feed, hideCookLink, empty }: { feed: FeedRead; hideCookLink?: boolean; empty: React.ReactNode }) {
  const announce = useAnnounce()
  const { loadMore } = feed
  const more = useCallback(async () => {
    try {
      const added = await loadMore()
      announce(added > 0 ? `${plural(added, 'more recipe')} loaded.` : 'No more recipes.')
    } catch {
      // Shown under the button, where the retry is.
    }
  }, [announce, loadMore])

  if (feed.loading) return <RecipeGridSkeleton />
  if (feed.error) return <ProblemState error={feed.error} onRetry={feed.refetch} />
  if (!feed.available) return <UnavailableState onRetry={feed.refetch} />
  if (feed.recipes.length === 0 && !feed.hasMore) return <div className={cardClassName}>{empty}</div>
  return (
    <div className="space-y-5">
      <CommunityRecipeGrid recipes={feed.recipes} hideCookLink={hideCookLink} />
      {feed.hasMore && (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            aria-disabled={feed.loadingMore || undefined}
            onClick={() => { if (!feed.loadingMore) void more() }}
            className={cx(buttonClassName('secondary'), 'min-h-11 min-w-40 aria-disabled:cursor-default aria-disabled:opacity-70')}
          >
            {feed.loadingMore ? 'Loading…' : 'Load more'}
          </button>
          <p role="alert" className="min-h-5 text-center text-sm text-rose-700 dark:text-rose-300">
            {feed.moreError && !feed.loadingMore ? describeProblem(feed.moreError).message : ''}
          </p>
        </div>
      )}
    </div>
  )
}

function Feed() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const tab: Tab = params.get('tab') === 'following' ? 'following' : 'all'
  const sortParam = params.get('sort')
  const sort: SortOrder = isSort(sortParam) ? sortParam : 'new'
  const tag = (params.get('tag') ?? '').slice(0, 100)
  const query = (params.get('q') ?? '').trim().slice(0, 200)
  const pantry = params.get('pantry') === '1'

  // Filters live in the URL, so Back from a recipe returns to the same list.
  const setParams = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString())
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value)
        else next.delete(key)
      }
      const text = next.toString()
      router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false })
    },
    [params, pathname, router]
  )

  // The box updates on every key; the search runs once typing pauses.
  const [text, setText] = useState(query)
  const [seenQuery, setSeenQuery] = useState(query)
  if (query !== seenQuery) {
    setSeenQuery(query)
    if (query !== text.trim()) setText(query)
  }
  useEffect(() => {
    const wanted = text.trim().slice(0, 200)
    if (wanted === query) return
    const timer = setTimeout(() => setParams({ q: wanted || null }), 350)
    return () => clearTimeout(timer)
  }, [text, query, setParams])

  const searching = query.length > 0
  const source: FeedSource = tab === 'following' ? { kind: 'following' } : { kind: 'all', sort, ...(searching ? { search: query } : tag ? { tag } : {}), ...(pantry ? { pantry: true } : {}) }
  const feed = useFeed(source)
  const tags = useCommunityQuery(api.community.tags, {})
  const tagList = (tags.data?.tags ?? []).slice(0, 30)
  // A tag from a link stays selectable even when it isn't among the most used.
  const chips = tag && !tagList.some((entry) => entry.tag.toLowerCase() === tag.toLowerCase()) ? [{ tag, count: 0 }, ...tagList] : tagList

  const filtered = searching || !!tag || pantry
  const count = feed.loading || feed.error || !feed.available ? null : feed.hasMore ? `${feed.recipes.length} loaded` : plural(feed.recipes.length, 'recipe')

  const empty =
    tab === 'following' ? (
      <EmptyState
        icon={UserRoundPlus}
        title="Nothing from cooks you follow yet"
        description="Follow a cook from one of their recipes and their new recipes will show up here."
        action={
          <button type="button" onClick={() => setParams({ tab: null })} className={buttonClassName('secondary')}>
            Browse everyone
          </button>
        }
      />
    ) : pantry ? (
      <EmptyState icon={ShoppingBasket} title="No recipes to match" description={filtered && (searching || tag) ? 'Nothing fits this search. Clear it to match your pantry against more recipes.' : 'There are no community recipes to compare with your pantry yet.'} />
    ) : filtered ? (
      <EmptyState
        icon={SearchX}
        title="No matching recipes"
        description={searching ? `Nothing found for “${query}”. Try fewer or different words.` : `No recipes are tagged “${tag}” yet.`}
        action={
          <button type="button" onClick={() => { setText(''); setParams({ q: null, tag: null }) }} className={buttonClassName('secondary')}>
            Clear filters
          </button>
        }
      />
    ) : (
      <EmptyState icon={Users} title="Nothing shared yet" description="Recipes that cooks share with the community will appear here." />
    )

  return (
    <PageContainer width="6xl">
      <PageHeader
        back={<BackLink href="/community">Community</BackLink>}
        eyebrow="Recipe community"
        title="Community recipes"
        description="Recipes shared by cooks across the Sous Chef community. Save a copy to make one your own."
        actions={
          <Link href="/community/mine" className={buttonClassName('secondary')}>
            <ChefHat className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            My shared recipes
          </Link>
        }
      />

      <SegmentedControl
        label="Whose recipes to show"
        value={tab}
        onChange={(next) => setParams({ tab: next === 'following' ? 'following' : null })}
        options={[
          { value: 'all', label: 'Everyone' },
          { value: 'following', label: 'Following' },
        ]}
      />

      {tab === 'all' && (
        <div className="space-y-3">
          <div className="relative" role="search">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" strokeWidth={1.75} aria-hidden="true" />
            <input
              type="search"
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={200}
              aria-label="Search community recipes"
              aria-describedby={searching ? 'community-search-note' : undefined}
              placeholder="Search community recipes…"
              enterKeyHint="search"
              className={cx(fieldClassName, 'pl-10 pr-11 [&::-webkit-search-cancel-button]:hidden')}
            />
            {text && (
              <button type="button" onClick={() => { setText(''); setParams({ q: null }) }} aria-label="Clear search" className={cx('absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800', focusRing)}>
                <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <fieldset disabled={searching} className={cx('min-w-0', searching && 'opacity-50')}>
              <legend className="sr-only">Sort</legend>
              <SegmentedControl label="Sort recipes" value={sort} onChange={(next) => setParams({ sort: next === 'new' ? null : next })} options={SORTS} />
            </fieldset>
            <button type="button" aria-pressed={pantry} onClick={() => setParams({ pantry: pantry ? null : '1' })} className={cx(chipClassName(pantry), focusRing)}>
              <ShoppingBasket className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              From your pantry
            </button>
          </div>

          {chips.length > 0 && (
            <fieldset disabled={searching} className={cx('min-w-0', searching && 'opacity-50')}>
              <legend className="sr-only">Filter by tag</legend>
              <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 py-1">
                <button type="button" aria-pressed={!tag} onClick={() => setParams({ tag: null })} className={cx(chipClassName(!tag), focusRing, 'shrink-0')}>
                  All
                </button>
                {chips.map((entry) => {
                  const selected = entry.tag.toLowerCase() === tag.toLowerCase()
                  return (
                    <button key={entry.tag} type="button" aria-pressed={selected} onClick={() => setParams({ tag: selected ? null : entry.tag })} className={cx(chipClassName(selected), focusRing, 'max-w-[14rem] shrink-0')}>
                      <span className="truncate">{entry.tag}</span>
                    </button>
                  )
                })}
              </div>
            </fieldset>
          )}

          {/* Always present so the lines below don't move when a note appears. */}
          <p id="community-search-note" className="min-h-5 px-1 text-xs text-stone-500 dark:text-stone-400">
            {searching ? 'Search results are ordered by relevance; sort and tags don’t apply.' : pantry ? 'Up to 100 recipes, ordered by how much of each you already have. Your pantry never leaves this server.' : ''}
          </p>
        </div>
      )}

      <Section title={tab === 'following' ? 'From cooks you follow' : searching ? 'Search results' : pantry ? 'Best matches for your pantry' : 'Recipes'} aside={count}>
        <PagedRecipes key={JSON.stringify(source)} feed={feed} empty={empty} />
      </Section>
    </PageContainer>
  )
}

export function CommunityRecipeFeedView() {
  return (
    <CommunityNotices>
      <Feed />
    </CommunityNotices>
  )
}
