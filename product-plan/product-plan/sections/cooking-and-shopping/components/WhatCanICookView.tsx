import { useMemo, useState } from 'react'
import { Search, Sparkles } from 'lucide-react'
import type { PantrySnapshotItem, Recipe } from './types'
import { RecipeMatchCard } from './RecipeMatchCard'
import { bucketForMissingCount, computeRecipeCookability, cx } from './utils'

export type CookabilityFilter = 'all' | 'cook-now' | 'almost' | 'missing'

export type CookSort = 'recent' | 'time-asc' | 'title-asc'

export interface WhatCanICookViewProps {
  recipes: Recipe[]
  pantrySnapshot: PantrySnapshotItem[]
  suggestedTags?: string[]
  shoppingListCount?: number
  searchQuery?: string
  activeTag?: string | 'all'
  cookability?: CookabilityFilter
  sort?: CookSort
  onSearchChange?: (query: string) => void
  onSetTag?: (tag: string | 'all') => void
  onSetCookability?: (filter: CookabilityFilter) => void
  onSetSort?: (sort: CookSort) => void
  onOpenShoppingList?: () => void
  onCookRecipe?: (recipeId: string) => void
  onAddMissingToShoppingList?: (recipeId: string) => void
}

export function WhatCanICookView(props: WhatCanICookViewProps) {
  const {
    recipes,
    pantrySnapshot,
    suggestedTags = [],
    shoppingListCount = 0,
    searchQuery = '',
    activeTag = 'all',
    cookability = 'all',
    sort = 'recent',
    onSearchChange,
    onSetTag,
    onSetCookability,
    onSetSort,
    onOpenShoppingList,
    onCookRecipe,
    onAddMissingToShoppingList,
  } = props

  // Local state fallback to keep the design interactive in Design OS previews
  const [localQuery, setLocalQuery] = useState(searchQuery)
  const [localTag, setLocalTag] = useState<string | 'all'>(activeTag)
  const [localCookability] = useState<CookabilityFilter>(cookability)
  const [localSort, setLocalSort] = useState<CookSort>(sort)

  const effectiveQuery = onSearchChange ? searchQuery : localQuery
  const effectiveTag = onSetTag ? activeTag : localTag
  const effectiveCookability = onSetCookability ? cookability : localCookability
  const effectiveSort = onSetSort ? sort : localSort

  const derived = useMemo(() => {
    const q = effectiveQuery.trim().toLowerCase()
    let list = recipes

    if (q) {
      list = list.filter((r) => {
        const hay = `${r.title} ${r.description ?? ''} ${(r.tags ?? []).join(' ')}`.toLowerCase()
        return hay.includes(q)
      })
    }

    if (effectiveTag !== 'all') {
      list = list.filter((r) => (r.tags ?? []).includes(effectiveTag))
    }

    if (effectiveCookability !== 'all') {
      list = list.filter((r) => {
        const { missingCount } = computeRecipeCookability(r, pantrySnapshot)
        return bucketForMissingCount(missingCount) === effectiveCookability
      })
    }

    // Sort (mirrors Recipes header style: Recent / Fast / A–Z)
    if (effectiveSort === 'title-asc') {
      list = [...list].sort((a, b) => a.title.localeCompare(b.title))
    } else if (effectiveSort === 'time-asc') {
      list = [...list].sort((a, b) => (a.totalTimeMinutes ?? 10_000) - (b.totalTimeMinutes ?? 10_000))
    } else {
      // "Recent" in this section acts like "Best match":
      // Cook-now first, then almost, then missing; within buckets: fewer missing first; then time; then title.
      const bucketScore: Record<ReturnType<typeof bucketForMissingCount>, number> = {
        'cook-now': 0,
        almost: 1,
        missing: 2,
      }
      list = [...list].sort((a, b) => {
        const ca = computeRecipeCookability(a, pantrySnapshot)
        const cb = computeRecipeCookability(b, pantrySnapshot)
        const ba = bucketForMissingCount(ca.missingCount)
        const bb = bucketForMissingCount(cb.missingCount)
        const ds = bucketScore[ba] - bucketScore[bb]
        if (ds !== 0) return ds
        const dm = ca.missingCount - cb.missingCount
        if (dm !== 0) return dm
        const dt = (a.totalTimeMinutes ?? 10_000) - (b.totalTimeMinutes ?? 10_000)
        if (dt !== 0) return dt
        return a.title.localeCompare(b.title)
      })
    }

    const counts = { cookNow: 0, almost: 0, missing: 0 }
    for (const r of recipes) {
      const { missingCount } = computeRecipeCookability(r, pantrySnapshot)
      const bucket = bucketForMissingCount(missingCount)
      if (bucket === 'cook-now') counts.cookNow += 1
      else if (bucket === 'almost') counts.almost += 1
      else counts.missing += 1
    }

    return { list, counts }
  }, [recipes, pantrySnapshot, effectiveQuery, effectiveTag, effectiveCookability, effectiveSort])

  const empty = derived.list.length === 0
  const showSearchEmpty = Boolean(effectiveQuery.trim()) && empty

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <div className="px-4 py-5 sm:px-6 sm:py-6">
        <div className="max-w-6xl mx-auto space-y-5">
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-semibold text-stone-900 dark:text-stone-100">
                What can I cook?
              </h1>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                Discover recipes you can make now, or get a tight shopping list for what’s missing.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:pt-1">
              <button
                type="button"
                onClick={() => console.log('[Cooking] Surprise me')}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
              >
                <Sparkles className="w-4 h-4" strokeWidth={1.75} />
                Surprise me
              </button>
              <button
                type="button"
                onClick={onOpenShoppingList}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-100 text-sm font-medium hover:bg-stone-50 dark:hover:bg-stone-900/60 transition-colors"
              >
                Shopping list
                {shoppingListCount > 0 ? (
                  <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-stone-100 dark:bg-stone-900 text-stone-700 dark:text-stone-200 text-xs">
                    {shoppingListCount}
                  </span>
                ) : null}
              </button>
            </div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/20 p-4">
              <div className="text-xs uppercase tracking-wide text-emerald-800 dark:text-emerald-200">Cook now</div>
              <div className="mt-2 text-2xl font-semibold text-stone-900 dark:text-stone-100">{derived.counts.cookNow}</div>
              <div className="mt-1 text-sm text-emerald-900/80 dark:text-emerald-200/80">No missing ingredients</div>
            </div>
            <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 p-4">
              <div className="text-xs uppercase tracking-wide text-amber-800 dark:text-amber-200">Almost</div>
              <div className="mt-2 text-2xl font-semibold text-stone-900 dark:text-stone-100">{derived.counts.almost}</div>
              <div className="mt-1 text-sm text-amber-900/80 dark:text-amber-200/80">Missing 1–3 items</div>
            </div>
            <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 p-4">
              <div className="text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">Needs a run</div>
              <div className="mt-2 text-2xl font-semibold text-stone-900 dark:text-stone-100">{derived.counts.missing}</div>
              <div className="mt-1 text-sm text-stone-600 dark:text-stone-400">Missing 4+ items</div>
            </div>
          </div>

          {/* Controls */}
          <div className="space-y-3">
            {/* Tags (own row) */}
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
              {suggestedTags.slice(0, 8).map((t) => {
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

            {/* Search (own row, full width) */}
            <div className="relative w-full">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" strokeWidth={1.75} />
              <input
                value={effectiveQuery}
                onChange={(e) => {
                  if (onSearchChange) onSearchChange(e.target.value)
                  else setLocalQuery(e.target.value)
                }}
                placeholder="Search recipes…"
                className="w-full pl-9 pr-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>

            {/* Sort (own row, full width) */}
            <div className="w-full inline-flex rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 p-1">
              {([
                { id: 'recent', label: 'Recent' },
                { id: 'time-asc', label: 'Fast' },
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
              <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">Matches</h2>
              <span className="text-sm text-stone-500 dark:text-stone-400">{derived.list.length} shown</span>
            </div>

            {empty ? (
              <div className="rounded-lg border border-dashed border-stone-300 dark:border-stone-700 bg-white/60 dark:bg-stone-950/40 p-8 text-center">
                <div className="mx-auto max-w-sm">
                  <div className="text-base font-medium text-stone-900 dark:text-stone-100">
                    {showSearchEmpty ? 'No matching recipes' : 'No recipes available'}
                  </div>
                  <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
                    {showSearchEmpty ? 'Try a different search term, or clear filters.' : 'Add some recipes in the Recipes section first.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {derived.list.map((r) => (
                  <RecipeMatchCard
                    key={r.id}
                    recipe={r}
                    pantrySnapshot={pantrySnapshot}
                    onCook={onCookRecipe}
                    onAddMissingToList={onAddMissingToShoppingList}
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


