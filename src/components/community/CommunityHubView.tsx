import { useEffect, useState, type ReactNode } from 'react'
import { ArrowRight, Users } from 'lucide-react'
import { buttonClassName, cardClassName, EmptyState, PageContainer, PageHeader, Section } from '@/components/ui/kit'
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
  /** Connection/account status card rendered under the header. */
  status?: ReactNode
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
    status,
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
    <PageContainer width="6xl">
      <PageHeader
        eyebrow="Recipe community"
        title={title}
        description={description}
        actions={
          onPublishRecipe ? (
            <button type="button" onClick={onPublishRecipe} className={buttonClassName('primary')}>
              {primaryActionLabel}
              <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </button>
          ) : null
        }
      />

      {status}

      <Section
        title={featuredRecipesTitle}
        aside={
          featuredRecipesShowViewAll && onViewAllRecipes && featuredRecipes.length > 0 ? (
            <button
              type="button"
              onClick={onViewAllRecipes}
              className="-my-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
            >
              View all
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          ) : null
        }
      >
        {featuredRecipes.length === 0 ? (
          <div className={cardClassName}>
            <EmptyState
              icon={Users}
              title="Nothing shared yet"
              description="Recipes that households on this instance publish will appear here. Share one of yours to start."
            />
          </div>
        ) : (
          <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleRecipes.map((r) => (
              <CommunityRecipeCard key={r.id} recipe={r} onOpen={onOpenRecipe} onSave={onSaveRecipe} />
            ))}
          </div>
        )}

        {featuredRecipesShowLoadMore && visibleFeaturedCount < featuredRecipes.length ? (
          <div className="flex justify-center pt-4">
            <button
              type="button"
              onClick={() =>
                setVisibleFeaturedCount((n) => Math.min(n + featuredRecipesPageSize, featuredRecipes.length))
              }
              className={buttonClassName('secondary')}
            >
              {featuredRecipesLoadMoreLabel}
            </button>
          </div>
        ) : null}
      </Section>

      <p className="max-w-3xl px-1 text-xs text-stone-500 dark:text-stone-500">
        Sharing stays within this instance. Connecting to other Sous Chef instances is future work.
      </p>
    </PageContainer>
  )
}
