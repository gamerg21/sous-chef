import { useMemo, useState } from 'react'
import { Barcode, Plus, Search, Sparkles, TriangleAlert } from 'lucide-react'
import type { InventoryFilter, InventoryItem, KitchenLocation, KitchenLocationId } from './types'
import { InventoryItemRow } from './InventoryItemRow'
import { LocationTabs } from './LocationTabs'
import { itemExpiryStatus } from './utils'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

export interface KitchenInventoryDashboardViewProps {
  locations: KitchenLocation[]
  items: InventoryItem[]
  dateFormat?: string | null
  selectedLocationId?: KitchenLocationId | 'all'
  filter?: InventoryFilter
  searchQuery?: string
  onSelectLocation?: (locationId: KitchenLocationId | 'all') => void
  onChangeFilter?: (filter: InventoryFilter) => void
  onSearchChange?: (query: string) => void
  onScanBarcode?: () => void
  onAddItem?: () => void
  onEditItem?: (id: string) => void
  onRemoveItem?: (id: string) => void
  onViewExpiringSoon?: () => void
  deletingItems?: Set<string>
}

export function KitchenInventoryDashboardView(props: KitchenInventoryDashboardViewProps) {
  const {
    locations,
    items,
    dateFormat,
    selectedLocationId = 'all',
    filter = 'all',
    searchQuery = '',
    onSelectLocation,
    onChangeFilter,
    onSearchChange,
    onScanBarcode,
    onAddItem,
    onEditItem,
    onRemoveItem,
    onViewExpiringSoon,
    deletingItems = new Set(),
  } = props

  // Local state fallback to keep the design interactive in Design OS previews
  const [localLocation, setLocalLocation] = useState<KitchenLocationId | 'all'>(selectedLocationId)
  const [localFilter, setLocalFilter] = useState<InventoryFilter>(filter)
  const [localQuery, setLocalQuery] = useState<string>(searchQuery)

  const effectiveLocation = onSelectLocation ? selectedLocationId : localLocation
  const effectiveFilter = onChangeFilter ? filter : localFilter
  const effectiveQuery = onSearchChange ? searchQuery : localQuery

  const locationMap = useMemo(() => {
    const map: Record<string, KitchenLocation> = {}
    for (const loc of locations) map[loc.id] = loc
    return map
  }, [locations])

  const derived = useMemo(() => {
    const query = effectiveQuery.trim().toLowerCase()
    let list = items

    if (effectiveLocation !== 'all') {
      list = list.filter((i) => i.locationId === effectiveLocation)
    }

    if (query) {
      list = list.filter((i) => {
        const hay = `${i.name} ${i.category ?? ''}`.toLowerCase()
        return hay.includes(query)
      })
    }

    if (effectiveFilter === 'expiring-soon') {
      list = list.filter((i) => {
        const s = itemExpiryStatus(i)
        return s === 'soon' || s === 'expired'
      })
    }

    if (effectiveFilter === 'low-stock') {
      list = list.filter((i) => (i.unit === 'count' ? i.quantity <= 2 : i.quantity <= 200))
    }

    const expiringSoonCount = items.filter((i) => {
      const s = itemExpiryStatus(i)
      return s === 'soon' || s === 'expired'
    }).length

    const lowStockCount = items.filter((i) => (i.unit === 'count' ? i.quantity <= 2 : i.quantity <= 200)).length

    return {
      list,
      expiringSoonCount,
      lowStockCount,
      totalCount: items.length,
    }
  }, [items, effectiveLocation, effectiveFilter, effectiveQuery])

  const emptyState = derived.list.length === 0
  const showSearchEmpty = Boolean(effectiveQuery.trim()) && emptyState

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <div className="px-4 py-5 sm:px-6 sm:py-6">
        <div className="max-w-6xl mx-auto space-y-5">
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-semibold text-stone-900 dark:text-stone-100">
                Kitchen Inventory
              </h1>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                Know what you have, what&apos;s expiring soon, and what to use next.
              </p>
            </div>

            <div className="flex items-center gap-2 sm:pt-1">
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

          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 p-4">
              <div className="text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">Items in stock</div>
              <div className="mt-2 text-2xl font-semibold text-stone-900 dark:text-stone-100">{derived.totalCount}</div>
              <div className="mt-1 text-sm text-stone-600 dark:text-stone-400">Across pantry, fridge, and freezer</div>
            </div>
            <button
              type="button"
              onClick={onViewExpiringSoon}
              className="text-left rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 p-4 hover:bg-amber-100/70 dark:hover:bg-amber-950/30 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-amber-800 dark:text-amber-200">Expiring soon</div>
                  <div className="mt-2 text-2xl font-semibold text-stone-900 dark:text-stone-100">
                    {derived.expiringSoonCount}
                  </div>
                </div>
                <TriangleAlert className="w-5 h-5 text-amber-700 dark:text-amber-300" strokeWidth={1.75} />
              </div>
              <div className="mt-1 text-sm text-amber-900/80 dark:text-amber-200/80">Use these first to reduce waste</div>
            </button>
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-emerald-800 dark:text-emerald-200">Low stock</div>
                  <div className="mt-2 text-2xl font-semibold text-stone-900 dark:text-stone-100">{derived.lowStockCount}</div>
                </div>
                <Sparkles className="w-5 h-5 text-emerald-700 dark:text-emerald-300" strokeWidth={1.75} />
              </div>
              <div className="mt-1 text-sm text-emerald-900/80 dark:text-emerald-200/80">Candidates for your shopping list</div>
            </div>
          </div>

          {/* Controls */}
          <div className="space-y-3">
            {/* Row 1: Location tabs */}
            <div className="flex items-center justify-start">
              <LocationTabs
                locations={locations}
                value={effectiveLocation}
                onChange={(v) => {
                  if (onSelectLocation) onSelectLocation(v)
                  else setLocalLocation(v)
                }}
              />
            </div>

            {/* Row 2: Search + filters */}
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <div className="relative flex-1">
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
                  placeholder="Search items…"
                  className="w-full pl-9 pr-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>

              <div className="inline-flex w-fit rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 p-1">
                {([
                  { id: 'all', label: 'All' },
                  { id: 'expiring-soon', label: 'Expiring' },
                  { id: 'low-stock', label: 'Low stock' },
                ] as const).map((t) => {
                  const active = t.id === effectiveFilter
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        if (onChangeFilter) onChangeFilter(t.id)
                        else setLocalFilter(t.id)
                      }}
                      className={cx(
                        'px-3 py-1.5 text-sm rounded-md transition-colors',
                        active
                          ? 'bg-stone-900 text-stone-100 dark:bg-stone-100 dark:text-stone-900'
                          : 'text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-900/60'
                      )}
                    >
                      {t.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">Inventory</h2>
              <span className="text-sm text-stone-500 dark:text-stone-400">{derived.list.length} shown</span>
            </div>

            {emptyState ? (
              <div className="rounded-lg border border-dashed border-stone-300 dark:border-stone-700 bg-white/60 dark:bg-stone-950/40 p-8 text-center">
                <div className="mx-auto max-w-sm">
                  <div className="text-base font-medium text-stone-900 dark:text-stone-100">
                    {showSearchEmpty ? 'No matching items' : 'No inventory yet'}
                  </div>
                  <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
                    {showSearchEmpty ? 'Try a different search term, or clear filters.' : 'Start by scanning a barcode or adding your first item.'}
                  </p>
                  <div className="mt-5 flex items-center justify-center gap-2">
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
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {derived.list.map((item) => (
                  <InventoryItemRow
                    key={item.id}
                    item={item}
                    location={locationMap[item.locationId]}
                    dateFormat={dateFormat}
                    onEdit={onEditItem}
                    onRemove={onRemoveItem}
                    isDeleting={deletingItems.has(item.id)}
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
