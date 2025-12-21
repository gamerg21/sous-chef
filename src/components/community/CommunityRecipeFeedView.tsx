import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import type { CommunityRecipe } from './types'
import { cx } from './utils'
import { CommunityFeedRecipeCard } from './CommunityFeedRecipeCard'

export type CommunitySort = 'recent' | 'trending' | 'title-asc'

export interface CommunityRecipeFeedViewProps {
  recipes: CommunityRecipe[]
  suggestedTags?: string[]
  searchQuery?: string
  activeTag?: string | 'all'
  sort?: CommunitySort
  onSearchChange?: (query: string) => void
  onSetTag?: (tag: string | 'all') => void
  onSetSort?: (sort: CommunitySort) => void
  onOpenRecipe?: (id: string) => void
  onSaveToLibrary?: (id: string) => void
  onLike?: (id: string) => void
}

export function CommunityRecipeFeedView(props: CommunityRecipeFeedViewProps) {
  const {
    recipes,
    suggestedTags = [],
    searchQuery = '',
    activeTag = 'all',
    sort = 'trending',
    onSearchChange,
    onSetTag,
    onSetSort,
    onOpenRecipe,
    onSaveToLibrary,
    onLike,
  } = props

  // Local state fallback to keep the design interactive in Design OS previews
  const [localQuery, setLocalQuery] = useState(searchQuery)
  const [localTag, setLocalTag] = useState<string | 'all'>(activeTag)
  const [localSort, setLocalSort] = useState<CommunitySort>(sort)

  const effectiveQuery = onSearchChange ? searchQuery : localQuery
  const effectiveTag = onSetTag ? activeTag : localTag
  const effectiveSort = onSetSort ? sort : localSort

  const derived = useMemo(() => {
    const q = effectiveQuery.trim().toLowerCase()
    let list = recipes

    if (q) {
      list = list.filter((r) => {
        const hay = `${r.title} ${r.description ?? ''} ${(r.tags ?? []).join(' ')} ${r.author?.name ?? ''}`.toLowerCase()
        return hay.includes(q)
      })
    }

    if (effectiveTag !== 'all') {
      list = list.filter((r) => (r.tags ?? []).includes(effectiveTag))
    }

    if (effectiveSort === 'title-asc') {
      list = [...list].sort((a, b) => a.title.localeCompare(b.title))
    } else if (effectiveSort === 'recent') {
      list = [...list].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    } else {
      // trending: likes desc
      list = [...list].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0))
    }

    return { list, total: recipes.length }
  }, [recipes, effectiveQuery, effectiveTag, effectiveSort])

  const empty = derived.list.length === 0
  const showSearchEmpty = Boolean(effectiveQuery.trim()) && empty

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <div className="px-4 py-5 sm:px-6 sm:py-6">
        <div className="max-w-6xl mx-auto space-y-5">
          {/* Header */}
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl sm:text-3xl font-semibold text-stone-900 dark:text-stone-100">Community</h1>
            <p className="text-sm text-stone-600 dark:text-stone-400">
              Browse public recipes and save copies into your private library.
            </p>
          </div>

          {/* Controls (stacked rows like Recipes) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 overflow-x-auto py-1 -mx-1 px-1">
              <button
                type="button"
                onClick={() => {
                  if (onSetTag) onSetTag('all')
                  else setLocalTag('all')
                }}
                className={cx(
                  'shrink-0 px-3 py-1.5 text-sm rounded-full border transition-colors',
                  effectiveTag === 'all'
                    ? 'border-stone-900 bg-stone-900 text-stone-100 dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900'
                    : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-900/60'
                )}
              >
                All
              </button>
              {suggestedTags.slice(0, 10).map((t) => {
                const active = t === effectiveTag
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      if (onSetTag) onSetTag(t)
                      else setLocalTag(t)
                    }}
                    className={cx(
                      'shrink-0 px-3 py-1.5 text-sm rounded-full border transition-colors',
                      active
                        ? 'border-stone-900 bg-stone-900 text-stone-100 dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900'
                        : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-900/60'
                    )}
                  >
                    {t}
                  </button>
                )
              })}
            </div>

            <div className="relative w-full">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" strokeWidth={1.75} />
              <input
                value={effectiveQuery}
                onChange={(e) => {
                  if (onSearchChange) onSearchChange(e.target.value)
                  else setLocalQuery(e.target.value)
                }}
                placeholder="Search community recipes…"
                className="w-full pl-9 pr-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>

            <div className="w-full inline-flex rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 p-1">
              {([
                { id: 'trending', label: 'Trending' },
                { id: 'recent', label: 'Recent' },
                { id: 'title-asc', label: 'A–Z' },
              ] as const).map((opt) => {
                const active = opt.id === effectiveSort
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      if (onSetSort) onSetSort(opt.id)
                      else setLocalSort(opt.id)
                    }}
                    className={cx(
                      'flex-1 px-3 py-1.5 text-sm rounded-md transition-colors',
                      active
                        ? 'bg-stone-900 text-stone-100 dark:bg-stone-100 dark:text-stone-900'
                        : 'text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-900/60'
                    )}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">Feed</h2>
              <span className="text-sm text-stone-500 dark:text-stone-400">{derived.list.length} shown</span>
            </div>

            {empty ? (
              <div className="rounded-lg border border-dashed border-stone-300 dark:border-stone-700 bg-white/60 dark:bg-stone-950/40 p-8 text-center">
                <div className="mx-auto max-w-sm">
                  <div className="text-base font-medium text-stone-900 dark:text-stone-100">
                    {showSearchEmpty ? 'No matching recipes' : 'Nothing here yet'}
                  </div>
                  <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
                    {showSearchEmpty ? 'Try a different search term, or clear filters.' : 'Check back later for new community recipes.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {derived.list.map((r) => (
                  <CommunityFeedRecipeCard
                    key={r.id}
                    recipe={r}
                    onOpen={onOpenRecipe}
                    onLike={onLike}
                    onSaveToLibrary={onSaveToLibrary}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}


