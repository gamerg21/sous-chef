import { useMemo, useState, useEffect, useRef } from 'react'
import { Barcode, PackageCheck, Plus, Search, ShoppingCart } from 'lucide-react'
import type { ShoppingListItem } from './types'
import { ShoppingListItemRow } from './ShoppingListItemRow'
import {
  EmptyState,
  IconBadge,
  PageContainer,
  PageHeader,
  Section,
  Stat,
  bareInputClassName,
  buttonClassName,
  cardClassName,
  cx,
  headingFont,
  iconButtonClassName,
  rowsClassName,
} from '../ui/kit'

export interface ShoppingListViewProps {
  items: ShoppingListItem[]
  searchQuery?: string
  onSearchChange?: (query: string) => void
  onAddItem?: () => void
  onScanBarcode?: () => void
  onToggleItem?: (id: string) => void
  onEditItem?: (id: string) => void
  onRemoveItem?: (id: string) => void
  onStockChecked?: () => void
  onClearChecked?: () => void
  deletingItems?: Set<string>
}

const categories: Array<NonNullable<ShoppingListItem['category']>> = [
  'Produce',
  'Dairy',
  'Meat & Seafood',
  'Pantry',
  'Frozen',
  'Bakery',
  'Other',
]

// Component to handle smooth reordering animations using FLIP technique
function AnimatedListItem({
  item,
  index,
  onToggle,
  onEdit,
  onRemove,
  isDeleting,
}: {
  item: ShoppingListItem
  index: number
  onToggle?: (id: string) => void
  onEdit?: (id: string) => void
  onRemove?: (id: string) => void
  isDeleting?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const prevIndex = useRef(index)
  const prevPosition = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (ref.current) {
      const element = ref.current
      
      // Capture current position before any changes
      const currentRect = element.getBoundingClientRect()
      const currentPos = { x: currentRect.left, y: currentRect.top }

      if (prevIndex.current !== index && prevPosition.current) {
        // Calculate the delta from previous position to current position
        const deltaX = prevPosition.current.x - currentPos.x
        const deltaY = prevPosition.current.y - currentPos.y

        if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
          // Invert: move element back to where it was
          element.style.transform = `translate(${deltaX}px, ${deltaY}px)`
          element.style.transition = 'none'

          // Force reflow
          void element.offsetHeight

          // Play: animate to final position
          requestAnimationFrame(() => {
            element.style.transform = ''
            element.style.transition = 'transform 500ms cubic-bezier(0.4, 0, 0.2, 1)'
          })
        }
      }

      // Store current position for next render
      prevPosition.current = currentPos
      prevIndex.current = index
    }
  }, [index, item.checked]) // Re-run when index or checked state changes

  return (
    <div
      ref={ref}
      className="transition-[transform,opacity] duration-500 ease-in-out"
    >
      <ShoppingListItemRow
        item={item}
        onToggle={onToggle}
        onEdit={onEdit}
        onRemove={onRemove}
        isDeleting={isDeleting}
      />
    </div>
  )
}

export function ShoppingListView(props: ShoppingListViewProps) {
  const {
    items,
    searchQuery = '',
    onSearchChange,
    onAddItem,
    onScanBarcode,
    onToggleItem,
    onEditItem,
    onRemoveItem,
    onClearChecked,
    onStockChecked,
    deletingItems = new Set(),
  } = props

  // Local state fallback to keep the design interactive in Design OS previews
  const [localQuery, setLocalQuery] = useState(searchQuery)
  const effectiveQuery = onSearchChange ? searchQuery : localQuery

  const derived = useMemo(() => {
    const q = effectiveQuery.trim().toLowerCase()
    const filtered = q
      ? items.filter((it) => `${it.name} ${it.category ?? ''} ${it.note ?? ''}`.toLowerCase().includes(q))
      : items

    const byCategory: Record<string, ShoppingListItem[]> = {}
    for (const c of categories) byCategory[c] = []
    for (const it of filtered) {
      const cat = it.category ?? 'Other'
      byCategory[cat].push(it)
    }

    // Sort items within each category: unchecked first, then checked
    for (const c of categories) {
      byCategory[c].sort((a, b) => {
        // Unchecked items (false) come before checked items (true)
        if (a.checked === b.checked) return 0
        return a.checked ? 1 : -1
      })
    }

    const total = items.length
    const checked = items.filter((i) => i.checked).length
    return { byCategory, total, checked, filteredCount: filtered.length }
  }, [items, effectiveQuery])

  const empty = derived.filteredCount === 0
  const showSearchEmpty = Boolean(effectiveQuery.trim()) && empty
  const left = derived.total - derived.checked
  const progress = derived.total ? Math.round((derived.checked / derived.total) * 100) : 0
  const stockable = Math.min(derived.checked, 100)

  return (
    <PageContainer width="4xl">
      <PageHeader
        eyebrow="Groceries"
        title="Shopping list"
        description="One shared list for the household. Add items from recipes or scan as you shop."
        actions={
          <>
            <button type="button" onClick={onScanBarcode} className={cx(buttonClassName('secondary'), 'min-h-11')}>
              <Barcode className="h-4 w-4" strokeWidth={1.75} />
              Scan
            </button>
            <button type="button" onClick={onAddItem} className={cx(buttonClassName('primary'), 'min-h-11')}>
              <Plus className="h-4 w-4" strokeWidth={2} />
              Add item
            </button>
          </>
        }
      />

      {derived.total > 0 && (
        <div className={cardClassName}>
          <div className="grid grid-cols-3 divide-x divide-stone-200 dark:divide-stone-800">
            <Stat label="To buy" value={left} />
            <Stat label="In cart" value={derived.checked} />
            <Stat label="Total" value={derived.total} />
          </div>
          <div className="border-t border-stone-200 px-4 py-3 dark:border-stone-800">
            <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
              <span>{left === 0 ? 'Everything is in the cart' : `${left} ${left === 1 ? 'item' : 'items'} to go`}</span>
              <span className="tabular-nums">{progress}%</span>
            </div>
            <div
              role="progressbar"
              aria-label="Shopping progress"
              aria-valuemin={0}
              aria-valuemax={derived.total}
              aria-valuenow={derived.checked}
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800"
            >
              <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500 ease-out" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Quick add sits above search, like the top of a paper list. */}
      <div className={cx(cardClassName, rowsClassName)}>
        <div className="flex items-center gap-1 pr-2">
          <button
            type="button"
            onClick={onAddItem}
            className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-t-2xl px-4 text-left hover:bg-stone-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-600 dark:hover:bg-stone-900/40"
          >
            <IconBadge icon={Plus} size="sm" />
            <span className="truncate text-base text-stone-400">Add an item…</span>
          </button>
          <button type="button" onClick={onScanBarcode} className={cx(iconButtonClassName, 'h-11 w-11')} aria-label="Scan a barcode" title="Scan a barcode">
            <Barcode className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>
        <label className="flex min-h-12 items-center gap-3 px-4 focus-within:bg-stone-50 dark:focus-within:bg-stone-900/40 last:rounded-b-2xl">
          <Search className="h-4 w-4 shrink-0 text-stone-400" strokeWidth={1.75} aria-hidden="true" />
          <input
            type="search"
            value={effectiveQuery}
            onChange={(e) => {
              if (onSearchChange) onSearchChange(e.target.value)
              else setLocalQuery(e.target.value)
            }}
            placeholder="Search shopping list…"
            aria-label="Search shopping list"
            className={cx(bareInputClassName, 'min-h-12')}
          />
        </label>
      </div>

      {/* List */}
      {empty ? (
        <div className={cardClassName}>
          <EmptyState
            icon={showSearchEmpty ? Search : ShoppingCart}
            title={showSearchEmpty ? 'No matching items' : 'Your shopping list is empty'}
            description={
              showSearchEmpty
                ? 'Try a different search term, or clear the query.'
                : 'Add items manually, or generate a list from a recipe you want to cook.'
            }
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button type="button" onClick={onAddItem} className={cx(buttonClassName('primary'), 'min-h-11')}>
                  <Plus className="h-4 w-4" strokeWidth={2} />
                  Add item
                </button>
                <button type="button" onClick={onScanBarcode} className={cx(buttonClassName('secondary'), 'min-h-11')}>
                  <Barcode className="h-4 w-4" strokeWidth={1.75} />
                  Scan
                </button>
              </div>
            }
          />
        </div>
      ) : (
        <div className="stagger space-y-6">
          {categories.map((c) => {
            const list = derived.byCategory[c]
            if (!list?.length) return null
            const remaining = list.filter((it) => !it.checked).length
            return (
              <Section
                key={c}
                id={`shopping-${c.replace(/\W+/g, '-').toLowerCase()}`}
                title={c}
                aside={remaining === 0 ? 'All in cart' : `${remaining} of ${list.length} left`}
              >
                <div className={cx(cardClassName, rowsClassName)} data-category={c}>
                  {list.map((it, index) => (
                    <AnimatedListItem
                      key={it.id}
                      item={it}
                      index={index}
                      onToggle={onToggleItem}
                      onEdit={onEditItem}
                      onRemove={onRemoveItem}
                      isDeleting={deletingItems.has(it.id)}
                    />
                  ))}
                </div>
              </Section>
            )
          })}
        </div>
      )}

      {derived.checked > 0 && (
        <div className={cx(cardClassName, 'animate-fade-in flex flex-col gap-3 p-4 sm:flex-row sm:items-center')}>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <IconBadge icon={PackageCheck} />
            <div className="min-w-0">
              <p className="font-semibold text-stone-900 dark:text-stone-100" style={headingFont}>
                {derived.checked} checked off
              </p>
              <p className="text-sm text-stone-500 dark:text-stone-400">
                {onStockChecked ? `Ready to stock · ${stockable} ${stockable === 1 ? 'purchase' : 'purchases'}` : 'Ready to put away'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <button type="button" onClick={onClearChecked} className={cx(buttonClassName('ghost'), 'min-h-11 flex-1 sm:flex-none')}>
              Clear checked
            </button>
            {onStockChecked && (
              <button type="button" onClick={onStockChecked} className={cx(buttonClassName('primary'), 'min-h-11 flex-[2] sm:flex-none')}>
                Stock purchases
              </button>
            )}
          </div>
        </div>
      )}
    </PageContainer>
  )
}
