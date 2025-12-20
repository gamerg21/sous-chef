import { useMemo, useState } from 'react'
import { Barcode, Plus, Search, ShoppingCart } from 'lucide-react'
import type { ShoppingListItem } from './types'
import { ShoppingListItemRow } from './ShoppingListItemRow'
import { cx } from './utils'

export interface ShoppingListViewProps {
  items: ShoppingListItem[]
  searchQuery?: string
  onSearchChange?: (query: string) => void
  onAddItem?: () => void
  onScanBarcode?: () => void
  onToggleItem?: (id: string) => void
  onEditItem?: (id: string) => void
  onRemoveItem?: (id: string) => void
  onClearChecked?: () => void
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

    const total = items.length
    const checked = items.filter((i) => i.checked).length
    return { byCategory, total, checked, filteredCount: filtered.length }
  }, [items, effectiveQuery])

  const empty = derived.filteredCount === 0
  const showSearchEmpty = Boolean(effectiveQuery.trim()) && empty

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <div className="px-4 py-5 sm:px-6 sm:py-6">
        <div className="max-w-6xl mx-auto space-y-5">
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-semibold text-stone-900 dark:text-stone-100">
                Shopping list
              </h1>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                One shared list for the household. Add items from recipes or scan as you shop.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:pt-1">
              <button
                type="button"
                onClick={onScanBarcode}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
              >
                <Barcode className="w-4 h-4" strokeWidth={1.75} />
                Scan
              </button>
              <button
                type="button"
                onClick={onAddItem}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-100 text-sm font-medium hover:bg-stone-50 dark:hover:bg-stone-900/60 transition-colors"
              >
                <Plus className="w-4 h-4" strokeWidth={1.75} />
                Add item
              </button>
            </div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 p-4">
              <div className="text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">Items</div>
              <div className="mt-2 text-2xl font-semibold text-stone-900 dark:text-stone-100">{derived.total}</div>
              <div className="mt-1 text-sm text-stone-600 dark:text-stone-400">Across all categories</div>
            </div>
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/20 p-4">
              <div className="text-xs uppercase tracking-wide text-emerald-800 dark:text-emerald-200">Checked off</div>
              <div className="mt-2 text-2xl font-semibold text-stone-900 dark:text-stone-100">{derived.checked}</div>
              <div className="mt-1 text-sm text-emerald-900/80 dark:text-emerald-200/80">Ready to clear</div>
            </div>
            <button
              type="button"
              onClick={onClearChecked}
              className={cx(
                'text-left rounded-lg border p-4 transition-colors',
                derived.checked > 0
                  ? 'border-stone-200 dark:border-stone-800 bg-stone-100 dark:bg-stone-900/40 hover:bg-stone-200/70 dark:hover:bg-stone-900/60'
                  : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 opacity-70 cursor-not-allowed'
              )}
              disabled={derived.checked === 0}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">Action</div>
                  <div className="mt-2 text-base font-semibold text-stone-900 dark:text-stone-100">Clear checked</div>
                </div>
                <ShoppingCart className="w-5 h-5 text-stone-500 dark:text-stone-400" strokeWidth={1.75} />
              </div>
              <div className="mt-1 text-sm text-stone-600 dark:text-stone-400">Keeps the list tidy while you shop</div>
            </button>
          </div>

          {/* Controls */}
          <div className="relative">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" strokeWidth={1.75} />
            <input
              value={effectiveQuery}
              onChange={(e) => {
                if (onSearchChange) onSearchChange(e.target.value)
                else setLocalQuery(e.target.value)
              }}
              placeholder="Search shopping list…"
              className="w-full pl-9 pr-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>

          {/* List */}
          {empty ? (
            <div className="rounded-lg border border-dashed border-stone-300 dark:border-stone-700 bg-white/60 dark:bg-stone-950/40 p-8 text-center">
              <div className="mx-auto max-w-sm">
                <div className="text-base font-medium text-stone-900 dark:text-stone-100">
                  {showSearchEmpty ? 'No matching items' : 'Your shopping list is empty'}
                </div>
                <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
                  {showSearchEmpty
                    ? 'Try a different search term, or clear the query.'
                    : 'Add items manually, or generate a list from a recipe you want to cook.'}
                </p>
                <div className="mt-5 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={onAddItem}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" strokeWidth={1.75} />
                    Add item
                  </button>
                  <button
                    type="button"
                    onClick={onScanBarcode}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-100 text-sm font-medium hover:bg-stone-50 dark:hover:bg-stone-900/60 transition-colors"
                  >
                    <Barcode className="w-4 h-4" strokeWidth={1.75} />
                    Scan
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {categories.map((c) => {
                const list = derived.byCategory[c]
                if (!list?.length) return null
                return (
                  <div key={c} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">{c}</h2>
                      <span className="text-sm text-stone-500 dark:text-stone-400">{list.length}</span>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      {list.map((it) => (
                        <ShoppingListItemRow
                          key={it.id}
                          item={it}
                          onToggle={onToggleItem}
                          onEdit={onEditItem}
                          onRemove={onRemoveItem}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


