'use client'

import { useMemo, useState } from 'react'
import { Download, Plus, Search, Upload } from 'lucide-react'
import type { PantrySnapshotItem, Recipe } from './types'
import { cx } from './utils'
import { RecipeCard } from './RecipeCard'

export type RecipeSort = 'recently-updated' | 'time-asc' | 'title-asc'

export interface RecipeLibraryViewProps {
  recipes: Recipe[]
  pantrySnapshot?: PantrySnapshotItem[]
  suggestedTags?: string[]
  searchQuery?: string
  activeTag?: string | 'all'
  sort?: RecipeSort
  onSearchChange?: (query: string) => void
  onSetTag?: (tag: string | 'all') => void
  onSetSort?: (sort: RecipeSort) => void
  onOpenRecipe?: (id: string) => void
  onCreateRecipe?: () => void
  onImportRecipe?: () => void
  onExportAll?: () => void
  onEditRecipe?: (id: string) => void
  onToggleFavorite?: (id: string) => void
  onDeleteRecipe?: (id: string) => void
}

export function RecipeLibraryView(props: RecipeLibraryViewProps) {
  const {
    recipes,
    pantrySnapshot,
    suggestedTags = [],
    searchQuery = '',
    activeTag = 'all',
    sort = 'recently-updated',
    onSearchChange,
    onSetTag,
    onSetSort,
    onOpenRecipe,
    onCreateRecipe,
    onImportRecipe,
    onExportAll,
    onEditRecipe,
    onToggleFavorite,
    onDeleteRecipe,
  } = props

  // Local state fallback to keep the design interactive in Design OS previews
  const [localQuery, setLocalQuery] = useState(searchQuery)
  const [localTag, setLocalTag] = useState<string | 'all'>(activeTag)
  const [localSort, setLocalSort] = useState<RecipeSort>(sort)

  const effectiveQuery = onSearchChange ? searchQuery : localQuery
  const effectiveTag = onSetTag ? activeTag : localTag
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

    if (effectiveSort === 'title-asc') {
      list = [...list].sort((a, b) => a.title.localeCompare(b.title))
    } else if (effectiveSort === 'time-asc') {
      list = [...list].sort((a, b) => (a.totalTimeMinutes ?? 10_000) - (b.totalTimeMinutes ?? 10_000))
    } else {
      // recently-updated
      list = [...list].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
    }

    const favorites = recipes.filter((r) => r.favorited).length

    return { list, total: recipes.length, favorites }
  }, [recipes, effectiveQuery, effectiveTag, effectiveSort])

  const empty = derived.list.length === 0
  const showSearchEmpty = Boolean(effectiveQuery.trim()) && empty

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <div className="px-4 py-5 sm:px-6 sm:py-6">
        <div className="max-w-6xl mx-auto space-y-5">
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-semibold text-stone-900 dark:text-stone-100">Recipes</h1>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                Your private-by-default recipe library, with lightweight ingredient mapping for &quot;what can I cook?&quot;
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:pt-1">
              <button
                type="button"
                onClick={onImportRecipe}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
              >
                <Upload className="w-4 h-4" strokeWidth={1.75} />
                Import
              </button>
              <button
                type="button"
                onClick={onCreateRecipe}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-100 text-sm font-medium hover:bg-stone-50 dark:hover:bg-stone-900/60 transition-colors"
              >
                <Plus className="w-4 h-4" strokeWidth={1.75} />
                New recipe
              </button>
              <button
                type="button"
                onClick={onExportAll}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-100 text-sm font-medium hover:bg-stone-50 dark:hover:bg-stone-900/60 transition-colors"
              >
                <Download className="w-4 h-4" strokeWidth={1.75} />
                Export
              </button>
            </div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 p-4">
              <div className="text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">Recipes</div>
              <div className="mt-2 text-2xl font-semibold text-stone-900 dark:text-stone-100">{derived.total}</div>
              <div className="mt-1 text-sm text-stone-600 dark:text-stone-400">Across private + household</div>
            </div>
            <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 p-4">
              <div className="text-xs uppercase tracking-wide text-amber-800 dark:text-amber-200">Favorites</div>
              <div className="mt-2 text-2xl font-semibold text-stone-900 dark:text-stone-100">{derived.favorites}</div>
              <div className="mt-1 text-sm text-amber-900/80 dark:text-amber-200/80">Pinned for fast access</div>
            </div>
            <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 p-4">
              <div className="text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">Inventory context</div>
              <div className="mt-2 text-2xl font-semibold text-stone-900 dark:text-stone-100">
                {pantrySnapshot?.length ?? 0}
              </div>
              <div className="mt-1 text-sm text-stone-600 dark:text-stone-400">Items in snapshot (preview-only)</div>
            </div>
          </div>

          {/* Controls */}
          <div className="space-y-3">
            {/* Filters (own row) */}
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
              <Search
                className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2"
                strokeWidth={1.75}
              />
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
                { id: 'recently-updated', label: 'Recent' },
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
              <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">Library</h2>
              <span className="text-sm text-stone-500 dark:text-stone-400">{derived.list.length} shown</span>
            </div>

            {empty ? (
              <div className="rounded-lg border border-dashed border-stone-300 dark:border-stone-700 bg-white/60 dark:bg-stone-950/40 p-8 text-center">
                <div className="mx-auto max-w-sm">
                  <div className="text-base font-medium text-stone-900 dark:text-stone-100">
                    {showSearchEmpty ? 'No matching recipes' : 'No recipes yet'}
                  </div>
                  <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
                    {showSearchEmpty ? 'Try a different search term, or clear filters.' : 'Start by importing a recipe or creating your first one.'}
                  </p>
                  <div className="mt-5 flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={onImportRecipe}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
                    >
                      <Upload className="w-4 h-4" strokeWidth={1.75} />
                      Import
                    </button>
                    <button
                      type="button"
                      onClick={onCreateRecipe}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-100 text-sm font-medium hover:bg-stone-50 dark:hover:bg-stone-900/60 transition-colors"
                    >
                      <Plus className="w-4 h-4" strokeWidth={1.75} />
                      New recipe
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {derived.list.map((r) => (
                  <RecipeCard
                    key={r.id}
                    recipe={r}
                    pantrySnapshot={pantrySnapshot}
                    onOpen={onOpenRecipe}
                    onEdit={onEditRecipe}
                    onToggleFavorite={onToggleFavorite}
                    onDelete={onDeleteRecipe}
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

