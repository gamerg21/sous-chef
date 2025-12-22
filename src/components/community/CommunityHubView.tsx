import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Search, Sparkles } from 'lucide-react'
import type { CommunityRecipeListing, ExtensionListing, InstalledExtension } from './types'
import { CommunityRecipeCard } from './CommunityRecipeCard'
import { ExtensionCard } from './ExtensionCard'
import { cx } from './utils'

export interface CommunityHubViewProps {
  title?: string
  description?: string
  showFeaturedRecipes?: boolean
  featuredRecipesTitle?: string
  featuredRecipesPageSize?: number
  featuredRecipesShowViewAll?: boolean
  featuredRecipesShowLoadMore?: boolean
  featuredRecipesLoadMoreLabel?: string
  showMarketplace?: boolean
  primaryActionLabel?: string
  secondaryActionLabel?: string
  categories: string[]
  featuredRecipes: CommunityRecipeListing[]
  extensions: ExtensionListing[]
  installedExtensions?: InstalledExtension[]
  query?: string
  category?: string | 'all'
  onQueryChange?: (q: string) => void
  onCategoryChange?: (c: string | 'all') => void
  onOpenRecipe?: (id: string) => void
  onSaveRecipe?: (id: string) => void
  onOpenExtension?: (id: string) => void
  onInstallExtension?: (id: string) => void
  onToggleExtensionEnabled?: (id: string) => void
  onGoToSettings?: () => void
  onPublishRecipe?: () => void
}

export function CommunityHubView(props: CommunityHubViewProps) {
  const {
    title = 'Community & Extensions',
    description = 'Discover add-ons, connect integrations, and publish recipes to the community catalog (optional).',
    showFeaturedRecipes = true,
    featuredRecipesTitle = 'Featured community recipes',
    featuredRecipesPageSize = 3,
    featuredRecipesShowViewAll = true,
    featuredRecipesShowLoadMore = false,
    featuredRecipesLoadMoreLabel = 'Load more',
    showMarketplace = true,
    primaryActionLabel = 'Publish a recipe',
    secondaryActionLabel = 'AI & Integrations',
    categories,
    featuredRecipes,
    extensions,
    installedExtensions = [],
    query = '',
    category = 'all',
    onQueryChange,
    onCategoryChange,
    onOpenRecipe,
    onSaveRecipe,
    onOpenExtension,
    onInstallExtension,
    onToggleExtensionEnabled,
    onGoToSettings,
    onPublishRecipe,
  } = props

  // Local state fallback to keep designs interactive in previews
  const [localQuery, setLocalQuery] = useState(query)
  const [localCategory, setLocalCategory] = useState<string | 'all'>(category)

  const effectiveQuery = onQueryChange ? query : localQuery
  const effectiveCategory = onCategoryChange ? category : localCategory

  const installedMap = useMemo(() => {
    const map = new Map<string, InstalledExtension>()
    for (const it of installedExtensions) map.set(it.extensionId, it)
    return map
  }, [installedExtensions])

  const [visibleFeaturedCount, setVisibleFeaturedCount] = useState(() =>
    Math.min(featuredRecipesPageSize, featuredRecipes.length)
  )

  // If the incoming data/page size changes, keep visible count within bounds.
  useEffect(() => {
    // Defer state update to avoid synchronous setState in effect
    setTimeout(() => {
      setVisibleFeaturedCount((prev) =>
        Math.min(
          Math.max(prev, featuredRecipesPageSize),
          featuredRecipes.length
        )
      )
    }, 0)
  }, [featuredRecipes.length, featuredRecipesPageSize])

  const filteredExtensions = useMemo(() => {
    const q = effectiveQuery.trim().toLowerCase()
    return extensions.filter((e) => {
      if (effectiveCategory !== 'all' && e.category !== effectiveCategory) return false
      if (!q) return true
      const hay = `${e.name} ${e.description} ${e.category} ${(e.tags ?? []).join(' ')} ${e.author.name}`.toLowerCase()
      return hay.includes(q)
    })
  }, [extensions, effectiveQuery, effectiveCategory])

  const noResults = filteredExtensions.length === 0

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <div className="px-4 py-5 sm:px-6 sm:py-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-semibold text-stone-900 dark:text-stone-100">
                {title}
              </h1>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                {description}
              </p>
            </div>
            <div className="flex items-center gap-2 sm:pt-1">
              {onPublishRecipe ? (
                <button
                  type="button"
                  onClick={onPublishRecipe}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
                >
                  {primaryActionLabel}
                  <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
                </button>
              ) : null}

              {onGoToSettings ? (
                <button
                  type="button"
                  onClick={onGoToSettings}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-100 text-sm font-medium hover:bg-stone-50 dark:hover:bg-stone-900/60 transition-colors"
                >
                  {secondaryActionLabel}
                </button>
              ) : null}
            </div>
          </div>

          {/* Featured recipes */}
          {showFeaturedRecipes ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
                  {featuredRecipesTitle}
                </h2>
                {featuredRecipesShowViewAll ? (
                  <button
                    type="button"
                    onClick={() => console.log('[Community] View all recipes')}
                    className="text-sm text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
                  >
                    View all
                  </button>
                ) : null}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {featuredRecipes
                  .slice(0, featuredRecipesShowLoadMore ? visibleFeaturedCount : featuredRecipesPageSize)
                  .map((r) => (
                  <CommunityRecipeCard key={r.id} recipe={r} onOpen={onOpenRecipe} onSave={onSaveRecipe} />
                ))}
              </div>

              {featuredRecipesShowLoadMore && visibleFeaturedCount < featuredRecipes.length ? (
                <div className="pt-2 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setVisibleFeaturedCount((n) => Math.min(n + featuredRecipesPageSize, featuredRecipes.length))}
                    className="text-sm text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
                  >
                    {featuredRecipesLoadMoreLabel}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Marketplace controls */}
          {showMarketplace ? (
            <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">Extension marketplace</h2>
                  <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                    Install optional features and integrations. You can disable extensions any time.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-end">
                  <div className="relative">
                    <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" strokeWidth={1.75} />
                    <input
                      value={effectiveQuery}
                      onChange={(e) => {
                        if (onQueryChange) onQueryChange(e.target.value)
                        else setLocalQuery(e.target.value)
                      }}
                      placeholder="Search extensions…"
                      className="w-full sm:w-72 pl-9 pr-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    />
                  </div>
                  <select
                    value={effectiveCategory}
                    onChange={(e) => {
                      const v = e.target.value as string | 'all'
                      if (onCategoryChange) onCategoryChange(v)
                      else setLocalCategory(v)
                    }}
                    className="h-10 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 px-3 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  >
                    <option value="all">All categories</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ) : null}

          {/* Marketplace list */}
          {showMarketplace ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} />
                  <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">Available extensions</h3>
                </div>
                <span className="text-sm text-stone-500 dark:text-stone-400">{filteredExtensions.length} shown</span>
              </div>

              {noResults ? (
                <div className="rounded-lg border border-dashed border-stone-300 dark:border-stone-700 bg-white/60 dark:bg-stone-950/40 p-8 text-center">
                  <div className="mx-auto max-w-sm">
                    <div className="text-base font-medium text-stone-900 dark:text-stone-100">No matching extensions</div>
                    <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
                      Try a different search term, or switch categories.
                    </p>
                    <div className="mt-5 flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (onQueryChange) onQueryChange('')
                          else setLocalQuery('')
                          if (onCategoryChange) onCategoryChange('all')
                          else setLocalCategory('all')
                        }}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-100 text-sm font-medium hover:bg-stone-50 dark:hover:bg-stone-900/60 transition-colors"
                      >
                        Clear filters
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {filteredExtensions.map((e) => {
                    const installed = installedMap.get(e.id)
                    return (
                      <ExtensionCard
                        key={e.id}
                        extension={e}
                        installed={Boolean(installed)}
                        enabled={installed?.enabled}
                        needsConfiguration={installed?.needsConfiguration}
                        onOpen={onOpenExtension}
                        onInstall={onInstallExtension}
                        onToggleEnabled={onToggleExtensionEnabled}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          ) : null}

          {/* Footer note */}
          {showMarketplace ? (
            <div className={cx('text-xs text-stone-500 dark:text-stone-500', 'max-w-3xl')}>
              Extensions can request data access (permissions). Review scopes before enabling, and prefer verified publishers when available.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}


