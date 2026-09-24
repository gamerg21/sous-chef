import { useMemo, useState } from 'react'
import { ChefHat, Search, ShoppingCart, Sparkles } from 'lucide-react'
import type { PantrySnapshotItem, Recipe } from './types'
import { RecipeMatchCard } from './RecipeMatchCard'
import { bucketForMissingCount, computeRecipeCookability, cx } from './utils'
import {
  buttonClassName,
  cardClassName,
  chipClassName,
  EmptyState,
  fieldClassName,
  PageContainer,
  PageHeader,
  Pill,
  Section,
  SegmentedControl,
  Stat,
} from '../ui/kit'

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
  const [localCookability, setLocalCookability] = useState<CookabilityFilter>(cookability)
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
        const { missingCount } = computeRecipeCookability(r.ingredients, pantrySnapshot, r.plan)
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
        const ca = computeRecipeCookability(a.ingredients, pantrySnapshot, a.plan)
        const cb = computeRecipeCookability(b.ingredients, pantrySnapshot, b.plan)
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
      const { missingCount } = computeRecipeCookability(r.ingredients, pantrySnapshot, r.plan)
      const bucket = bucketForMissingCount(missingCount)
      if (bucket === 'cook-now') counts.cookNow += 1
      else if (bucket === 'almost') counts.almost += 1
      else counts.missing += 1
    }

    return { list, counts }
  }, [recipes, pantrySnapshot, effectiveQuery, effectiveTag, effectiveCookability, effectiveSort])

  const empty = derived.list.length === 0
  const showSearchEmpty = Boolean(effectiveQuery.trim()) && empty

  // Open the cook view for a random recipe, preferring ones that can be
  // cooked right now, then "almost", then anything.
  const handleSurpriseMe = () => {
    if (recipes.length === 0 || !onCookRecipe) return
    const byBucket: Record<'cook-now' | 'almost' | 'missing', Recipe[]> = {
      'cook-now': [],
      almost: [],
      missing: [],
    }
    for (const recipe of recipes) {
      const { missingCount } = computeRecipeCookability(recipe.ingredients, pantrySnapshot, recipe.plan)
      byBucket[bucketForMissingCount(missingCount)].push(recipe)
    }
    const pool = byBucket['cook-now'].length
      ? byBucket['cook-now']
      : byBucket.almost.length
        ? byBucket.almost
        : recipes
    const pick = pool[Math.floor(Math.random() * pool.length)]
    onCookRecipe(pick.id)
  }

  const setTag = (tag: string | 'all') => {
    if (onSetTag) onSetTag(tag)
    else setLocalTag(tag)
  }

  return (
    <PageContainer width="6xl">
      <PageHeader
        title="What can I cook?"
        description="Find recipes using ingredients in your kitchen. Matches use ingredient names; check quantities and units before cooking."
        actions={
          <>
            <button type="button" onClick={onOpenShoppingList} className={buttonClassName('secondary')}>
              <ShoppingCart className="h-4 w-4" strokeWidth={1.75} />
              Shopping list
              {shoppingListCount > 0 ? <Pill tone="success">{shoppingListCount}</Pill> : null}
            </button>
            <button type="button" onClick={handleSurpriseMe} disabled={recipes.length === 0} className={buttonClassName('primary')}>
              <Sparkles className="h-4 w-4" strokeWidth={1.75} />
              Surprise me
            </button>
          </>
        }
      />

      <div className={cx(cardClassName, 'grid grid-cols-3 divide-x divide-stone-200 dark:divide-stone-800')}>
        <div>
          <Stat label="Cook now" value={derived.counts.cookNow} />
          <p className="-mt-3 hidden px-4 pb-4 text-xs text-stone-500 sm:block dark:text-stone-400">No missing ingredients</p>
        </div>
        <div>
          <Stat label="Almost" value={derived.counts.almost} tone={derived.counts.almost ? 'warning' : undefined} />
          <p className="-mt-3 hidden px-4 pb-4 text-xs text-stone-500 sm:block dark:text-stone-400">Missing 1–3 items</p>
        </div>
        <div>
          <Stat label="Needs a run" value={derived.counts.missing} />
          <p className="-mt-3 hidden px-4 pb-4 text-xs text-stone-500 sm:block dark:text-stone-400">Missing 4+ items</p>
        </div>
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

        <div className="flex flex-wrap items-center justify-between gap-2">
          <SegmentedControl
            label="Filter by what you have"
            value={effectiveCookability}
            onChange={(next) => {
              if (onSetCookability) onSetCookability(next)
              else setLocalCookability(next)
            }}
            options={[
              { value: 'all', label: 'All' },
              { value: 'cook-now', label: 'Cook now' },
              { value: 'almost', label: 'Almost' },
              { value: 'missing', label: 'Needs a run' },
            ]}
            className="max-w-full overflow-x-auto"
          />
          <SegmentedControl
            label="Sort matches"
            value={effectiveSort}
            onChange={(next) => {
              if (onSetSort) onSetSort(next)
              else setLocalSort(next)
            }}
            options={[
              { value: 'recent', label: 'Recent' },
              { value: 'time-asc', label: 'Fast' },
              { value: 'title-asc', label: 'A–Z' },
            ]}
          />
        </div>

        {suggestedTags.length > 0 && (
          <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 py-0.5" role="group" aria-label="Filter by tag">
            <button type="button" aria-pressed={effectiveTag === 'all'} onClick={() => setTag('all')} className={cx(chipClassName(effectiveTag === 'all'), 'shrink-0')}>
              All
            </button>
            {suggestedTags.slice(0, 8).map((t) => (
              <button key={t} type="button" aria-pressed={t === effectiveTag} onClick={() => setTag(t)} className={cx(chipClassName(t === effectiveTag), 'shrink-0')}>
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      <Section title="Matches" aside={`${derived.list.length} shown`}>
        {empty ? (
          <div className={cardClassName}>
            <EmptyState
              icon={showSearchEmpty ? Search : ChefHat}
              title={showSearchEmpty ? 'No matching recipes' : 'No recipes available'}
              description={showSearchEmpty ? 'Try a different search term, or clear filters.' : 'Add some recipes in the Recipes section first.'}
            />
          </div>
        ) : (
          <div className="stagger grid grid-cols-1 gap-3 lg:grid-cols-2">
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
      </Section>
    </PageContainer>
  )
}
