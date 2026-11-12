'use client'
import Link from 'next/link'
import { useInfiniteQuery } from '@tanstack/react-query'
import { ArrowRight, Bookmark, ChefHat, Heart } from 'lucide-react'
import { api } from '@/lib/kitchen/api'
import { request, useKitchenAuth } from '@/lib/kitchen/client'
import type { OwnListing } from '@/lib/community-contract'
import { buttonClassName, cardClassName, cx, EmptyState, PageContainer, PageHeader, Pill, rowsClassName, Section, type Tone } from '@/components/ui/kit'
import { describeProblem, mergePages, ownStatus, plural, type OwnStatus } from './feed-logic'
import { BackLink, focusRing, ProblemState, RatingSummary, RecipePhoto, RowsSkeleton } from './parts'
import { CommunityNotices, useAnnounce, useMe } from './useCommunity'

const STATUS: Record<OwnStatus, { label: string; tone: Tone; hint: string }> = {
  public: { label: 'Public', tone: 'success', hint: 'Anyone in the community can find it.' },
  unlisted: { label: 'Unlisted', tone: 'info', hint: 'Only people with the link can open it.' },
  private: { label: 'Not shared', tone: 'neutral', hint: 'You stopped sharing this recipe.' },
  removed: { label: 'Removed by a moderator', tone: 'danger', hint: 'It broke the community rules and can’t be seen.' },
  review: { label: 'Under review', tone: 'warning', hint: 'Hidden while moderators look at reports.' },
}

type Page = { recipes: OwnListing[]; cursor: string | null }

function Mine() {
  const auth = useKitchenAuth()
  const announce = useAnnounce()
  const me = useMe()
  const result = useInfiniteQuery<Page, Error, { pages: Page[] }, unknown[], string | undefined>({
    queryKey: ['community', api.community.myRecipes.path],
    queryFn: ({ pageParam }) => request(api.community.myRecipes, pageParam ? { cursor: pageParam } : {}),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.cursor ?? undefined,
    enabled: auth.isAuthenticated,
    retry: false,
    refetchOnWindowFocus: false,
  })
  const pages = result.data?.pages
  const recipes = mergePages((pages ?? []).map((page) => page.recipes))
  const loading = !auth.isAuthenticated || result.isPending

  const more = async () => {
    if (result.isFetchingNextPage) return
    const next = await result.fetchNextPage()
    if (next.isError) return announce({ message: describeProblem(next.error).message, tone: 'danger' })
    const total = mergePages((next.data?.pages ?? []).map((page) => page.recipes)).length
    announce(total > recipes.length ? `${plural(total - recipes.length, 'more recipe')} loaded.` : 'No more recipes.')
  }

  return (
    <PageContainer width="4xl">
      <PageHeader
        back={<BackLink href="/community">Community</BackLink>}
        eyebrow="Recipe community"
        title="My shared recipes"
        description={me.data?.me ? `Everything you’ve shared as ${me.data.me.name}, and who can see it.` : 'Everything you’ve shared with the community, and who can see it.'}
        actions={
          <Link href="/recipes" className={buttonClassName('primary')}>
            Share a recipe
            <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </Link>
        }
      />

      <Section title="Shared from your account" aside={!loading && pages ? (result.hasNextPage ? `${recipes.length} loaded` : plural(recipes.length, 'recipe')) : undefined}>
        {loading ? (
          <RowsSkeleton rows={4} label="Loading your shared recipes…" />
        ) : !pages ? (
          <ProblemState error={result.error} onRetry={() => void result.refetch()} retrying={result.isFetching} />
        ) : recipes.length === 0 && !result.hasNextPage ? (
          <div className={cardClassName}>
            <EmptyState
              icon={ChefHat}
              title="You haven’t shared a recipe yet"
              description="Open one of your recipes and choose Share to publish it to the community."
              action={
                <Link href="/recipes" className={buttonClassName('secondary')}>
                  Go to my recipes
                </Link>
              }
            />
          </div>
        ) : (
          <div className="space-y-4">
            <ul className={cx(cardClassName, rowsClassName, 'overflow-hidden')}>
              {recipes.map((recipe) => {
                const status = ownStatus(recipe)
                const { label, tone, hint } = STATUS[status]
                const viewable = status === 'public' || status === 'unlisted'
                return (
                  <li key={recipe.id} className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
                    <RecipePhoto url={recipe.photoUrl} className="h-16 w-16 shrink-0 rounded-xl sm:h-20 sm:w-24" iconClassName="h-6 w-6" />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-base font-semibold text-stone-900 dark:text-stone-100">
                        {viewable ? (
                          <Link href={`/community/recipes/${encodeURIComponent(recipe.id)}`} className={cx('rounded underline-offset-2 hover:underline', focusRing)}>
                            {recipe.title}
                          </Link>
                        ) : (
                          recipe.title
                        )}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Pill tone={tone}>{label}</Pill>
                        <span className="text-xs text-stone-500 dark:text-stone-400">{hint}</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-stone-500 dark:text-stone-400">
                        <span className="inline-flex items-center gap-1">
                          <Heart className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                          {plural(recipe.likeCount, 'like')}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Bookmark className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                          {plural(recipe.saveCount, 'save')}
                        </span>
                        <RatingSummary rating={recipe.rating} count={recipe.madeCount} />
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
            {result.hasNextPage && (
              <div className="flex justify-center">
                <button type="button" aria-disabled={result.isFetchingNextPage || undefined} onClick={() => void more()} className={cx(buttonClassName('secondary'), 'min-h-11 min-w-40 aria-disabled:cursor-default aria-disabled:opacity-70')}>
                  {result.isFetchingNextPage ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </div>
        )}
      </Section>

      <p className="px-1 text-xs text-stone-500 dark:text-stone-400">To change who can see a recipe, or to stop sharing it, open it in your recipes and choose Share.</p>
    </PageContainer>
  )
}

export function MySharedRecipesView() {
  return (
    <CommunityNotices>
      <Mine />
    </CommunityNotices>
  )
}
