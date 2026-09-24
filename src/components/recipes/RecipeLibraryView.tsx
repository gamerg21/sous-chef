'use client'

import { useMemo, useState } from 'react'
import { BookOpen, Download, Plus, Search, Upload } from 'lucide-react'
import type { PantrySnapshotItem, Recipe } from './types'
import { cx } from './utils'
import { RecipeCard } from './RecipeCard'
import {
  buttonClassName,
  cardClassName,
  chipClassName,
  EmptyState,
  fieldClassName,
  PageContainer,
  PageHeader,
  Section,
  SegmentedControl,
  Stat,
} from '@/components/ui/kit'

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

  const setTag = (tag: string | 'all') => {
    if (onSetTag) onSetTag(tag)
    else setLocalTag(tag)
  }

  return (
    <PageContainer width="6xl">
      <PageHeader
        title="Recipes"
        description="Save recipes you love and see what you can make with what’s in your kitchen."
        actions={
          <>
            <button type="button" onClick={onExportAll} className={buttonClassName('ghost')}>
              <Download className="h-4 w-4" strokeWidth={1.75} />
              Export
            </button>
            <button type="button" onClick={onImportRecipe} className={buttonClassName('secondary')}>
              <Upload className="h-4 w-4" strokeWidth={1.75} />
              Import
            </button>
            <button type="button" onClick={onCreateRecipe} className={buttonClassName('primary')}>
              <Plus className="h-4 w-4" strokeWidth={2} />
              New recipe
            </button>
          </>
        }
      />

      <div className={cx(cardClassName, 'grid grid-cols-3 divide-x divide-stone-200 dark:divide-stone-800')}>
        <Stat label="Recipes" value={derived.total} />
        <Stat label="Favorites" value={derived.favorites} />
        <Stat label="In your kitchen" value={pantrySnapshot?.length ?? 0} />
      </div>

      <div className="space-y-3">
        <label className="relative block">
          <span className="sr-only">Search recipes</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" strokeWidth={1.75} aria-hidden="true" />
          <input
            type="search"
            value={effectiveQuery}
            onChange={(e) => {
              if (onSearchChange) onSearchChange(e.target.value)
              else setLocalQuery(e.target.value)
            }}
            placeholder="Search recipes…"
            className={cx(fieldClassName, 'pl-10')}
          />
        </label>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="-mx-1 flex min-w-0 items-center gap-2 overflow-x-auto px-1 py-0.5" role="group" aria-label="Filter by tag">
            <button type="button" aria-pressed={effectiveTag === 'all'} onClick={() => setTag('all')} className={cx(chipClassName(effectiveTag === 'all'), 'shrink-0')}>
              All
            </button>
            {suggestedTags.slice(0, 8).map((t) => (
              <button key={t} type="button" aria-pressed={t === effectiveTag} onClick={() => setTag(t)} className={cx(chipClassName(t === effectiveTag), 'shrink-0')}>
                {t}
              </button>
            ))}
          </div>
          <SegmentedControl
            label="Sort recipes"
            className="shrink-0 self-start sm:self-auto"
            value={effectiveSort}
            onChange={(next) => {
              if (onSetSort) onSetSort(next)
              else setLocalSort(next)
            }}
            options={[
              { value: 'recently-updated', label: 'Recent' },
              { value: 'time-asc', label: 'Fast' },
              { value: 'title-asc', label: 'A–Z' },
            ]}
          />
        </div>
      </div>

      <Section title="Library" aside={`${derived.list.length} shown`}>
        {empty ? (
          <div className={cardClassName}>
            <EmptyState
              icon={showSearchEmpty ? Search : BookOpen}
              title={showSearchEmpty ? 'No matching recipes' : 'No recipes yet'}
              description={showSearchEmpty ? 'Try a different search term, or clear filters.' : 'Start by importing a recipe or creating your first one.'}
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button type="button" onClick={onImportRecipe} className={buttonClassName('secondary')}>
                    <Upload className="h-4 w-4" strokeWidth={1.75} />
                    Import
                  </button>
                  <button type="button" onClick={onCreateRecipe} className={buttonClassName('primary')}>
                    <Plus className="h-4 w-4" strokeWidth={2} />
                    New recipe
                  </button>
                </div>
              }
            />
          </div>
        ) : (
          <div className="stagger grid grid-cols-1 gap-3 lg:grid-cols-2">
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
      </Section>
    </PageContainer>
  )
}
