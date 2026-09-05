import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import type { CommunityRecipeListing } from './types'
import { CommunityRecipeCard } from './CommunityRecipeCard'

export interface CommunityHubViewProps {
  title?: string
  description?: string
  featuredRecipesTitle?: string
  featuredRecipesPageSize?: number
  featuredRecipesShowViewAll?: boolean
  featuredRecipesShowLoadMore?: boolean
  featuredRecipesLoadMoreLabel?: string
  primaryActionLabel?: string
  featuredRecipes: CommunityRecipeListing[]
  onOpenRecipe?: (id: string) => void
  onSaveRecipe?: (id: string) => void
  onViewAllRecipes?: () => void
  onPublishRecipe?: () => void
}

/**
 * Community landing view. Sharing stays within one Sous Chef instance; the
 * copy says so instead of implying a wider network.
 */
export function CommunityHubView(props: CommunityHubViewProps) {
  const {
    title = 'Community',
    description = 'Recipes shared by households on this Sous Chef instance.',
    featuredRecipesTitle = 'Popular shared recipes',
    featuredRecipesPageSize = 3,
    featuredRecipesShowViewAll = true,
    featuredRecipesShowLoadMore = false,
    featuredRecipesLoadMoreLabel = 'Load more',
    primaryActionLabel = 'Share a recipe',
    featuredRecipes,
    onOpenRecipe,
    onSaveRecipe,
    onViewAllRecipes,
    onPublishRecipe,
  } = props

  const [visibleFeaturedCount, setVisibleFeaturedCount] = useState(() =>
    Math.min(featuredRecipesPageSize, featuredRecipes.length)
  )

  // If the incoming data/page size changes, keep visible count within bounds.
  useEffect(() => {
    const handle = setTimeout(() => {
      setVisibleFeaturedCount((prev) =>
        Math.min(Math.max(prev, featuredRecipesPageSize), featuredRecipes.length)
      )
    }, 0)
    return () => clearTimeout(handle)
  }, [featuredRecipes.length, featuredRecipesPageSize])

  const visibleRecipes = featuredRecipes.slice(
    0,
    featuredRecipesShowLoadMore ? visibleFeaturedCount : featuredRecipesPageSize
  )

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <div className="px-4 py-5 sm:px-6 sm:py-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-semibold text-stone-900 dark:text-stone-100">{title}</h1>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{description}</p>
            </div>
            {onPublishRecipe ? (
              <div className="flex items-center gap-2 sm:pt-1">
                <button
                  type="button"
                  onClick={onPublishRecipe}
                  className="inline-flex min-h-11 items-center gap-2 px-3 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
                >
                  {primaryActionLabel}
                  <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
                </button>
              </div>
            ) : null}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">{featuredRecipesTitle}</h2>
              {featuredRecipesShowViewAll && onViewAllRecipes && featuredRecipes.length > 0 ? (
                <button
                  type="button"
                  onClick={onViewAllRecipes}
                  className="min-h-11 text-sm text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
                >
                  View all
                </button>
              ) : null}
            </div>

            {featuredRecipes.length === 0 ? (
              <div className="rounded-lg border border-dashed border-stone-300 dark:border-stone-700 bg-white/60 dark:bg-stone-950/40 p-8 text-center">
                <div className="mx-auto max-w-sm">
                  <div className="text-base font-medium text-stone-900 dark:text-stone-100">Nothing shared yet</div>
                  <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
                    Recipes that households on this instance publish will appear here. Share one of yours to start.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {visibleRecipes.map((r) => (
                  <CommunityRecipeCard key={r.id} recipe={r} onOpen={onOpenRecipe} onSave={onSaveRecipe} />
                ))}
              </div>
            )}

            {featuredRecipesShowLoadMore && visibleFeaturedCount < featuredRecipes.length ? (
              <div className="pt-2 flex justify-center">
                <button
                  type="button"
                  onClick={() =>
                    setVisibleFeaturedCount((n) => Math.min(n + featuredRecipesPageSize, featuredRecipes.length))
                  }
                  className="min-h-11 text-sm text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
                >
                  {featuredRecipesLoadMoreLabel}
                </button>
              </div>
            ) : null}
          </div>

          <p className="max-w-3xl text-xs text-stone-500 dark:text-stone-500">
            Sharing stays within this instance. Connecting to other Sous Chef instances is future work.
          </p>
        </div>
      </div>
    </div>
  )
}
