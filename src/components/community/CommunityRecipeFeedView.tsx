import { useMemo, useState } from 'react'
import { Search, SearchX, Users } from 'lucide-react'
import { cardClassName, chipClassName, EmptyState, fieldClassName, PageContainer, PageHeader, rowsClassName, Section, SegmentedControl } from '@/components/ui/kit'
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

  const setTag = (tag: string | 'all') => {
    if (onSetTag) onSetTag(tag)
    else setLocalTag(tag)
  }

  return (
    <PageContainer width="5xl">
      <PageHeader
        eyebrow="Recipe community"
        title="Community"
        description="Browse recipes shared on this Sous Chef instance and save copies into your private library."
      />

      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" strokeWidth={1.75} aria-hidden="true" />
          <input
            value={effectiveQuery}
            onChange={(e) => {
              if (onSearchChange) onSearchChange(e.target.value)
              else setLocalQuery(e.target.value)
            }}
            aria-label="Search community recipes"
            placeholder="Search community recipes…"
            className={cx(fieldClassName, 'pl-10')}
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="-mx-1 flex min-w-0 items-center gap-2 overflow-x-auto px-1 py-1">
            <button type="button" aria-pressed={effectiveTag === 'all'} onClick={() => setTag('all')} className={cx(chipClassName(effectiveTag === 'all'), 'shrink-0')}>
              All
            </button>
            {suggestedTags.slice(0, 10).map((t) => (
              <button key={t} type="button" aria-pressed={t === effectiveTag} onClick={() => setTag(t)} className={cx(chipClassName(t === effectiveTag), 'shrink-0')}>
                {t}
              </button>
            ))}
          </div>

          <SegmentedControl
            label="Sort recipes"
            value={effectiveSort}
            onChange={(next) => {
              if (onSetSort) onSetSort(next)
              else setLocalSort(next)
            }}
            options={[
              { value: 'trending', label: 'Trending' },
              { value: 'recent', label: 'Recent' },
              { value: 'title-asc', label: 'A–Z' },
            ]}
            className="shrink-0 self-start sm:self-auto"
          />
        </div>
      </div>

      <Section title="Feed" aside={`${derived.list.length} shown`}>
        <div className={cx(cardClassName, 'overflow-hidden')}>
          {empty ? (
            <EmptyState
              icon={showSearchEmpty ? SearchX : Users}
              title={showSearchEmpty ? 'No matching recipes' : 'Nothing here yet'}
              description={showSearchEmpty ? 'Try a different search term, or clear filters.' : 'Check back later for new community recipes.'}
            />
          ) : (
            <div className={cx('stagger', rowsClassName)}>
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
      </Section>
    </PageContainer>
  )
}
