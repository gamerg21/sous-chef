import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Package, Plus, ScanBarcode, Search, Tag, X } from 'lucide-react'
import {
  INVENTORY_ALL_CATEGORIES_VALUE,
  INVENTORY_UNCATEGORIZED_LABEL,
  type InventoryFilter,
  type InventoryItem,
  type KitchenLocation,
  type KitchenLocationId,
} from './types'
import { InventoryItemRow } from './InventoryItemRow'
import { LocationTabs } from './LocationTabs'
import { itemExpiryStatus } from './utils'
import { Collapse } from '@/components/ui/collapse'
import {
  EmptyState,
  PageContainer,
  PageHeader,
  Section,
  SegmentedControl,
  Stat,
  buttonClassName,
  cardClassName,
  chipClassName,
  cx,
  fieldClassName,
  rowsClassName,
  type Tone,
} from '@/components/ui/kit'

export interface KitchenInventoryDashboardViewProps {
  locations: KitchenLocation[]
  items: InventoryItem[]
  dateFormat?: string | null
  selectedLocationId?: KitchenLocationId | 'all'
  filter?: InventoryFilter
  searchQuery?: string
  selectedCategory?: string
  onSelectLocation?: (locationId: KitchenLocationId | 'all') => void
  onChangeFilter?: (filter: InventoryFilter) => void
  onSearchChange?: (query: string) => void
  onSelectCategory?: (category: string) => void
  onScanBarcode?: () => void
  onAddItem?: () => void
  onEditItem?: (id: string) => void
  onRemoveItem?: (id: string) => void
  onViewExpiringSoon?: () => void
  deletingItems?: Set<string>
}

const FILTER_OPTIONS: Array<{ value: InventoryFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'expiring-soon', label: 'Expiring' },
  { value: 'low-stock', label: 'Low stock' },
]

const isLowStock = (item: InventoryItem) => (item.unit === 'count' ? item.quantity <= 2 : item.quantity <= 200)

export function KitchenInventoryDashboardView(props: KitchenInventoryDashboardViewProps) {
  const {
    locations,
    items,
    dateFormat,
    selectedLocationId = 'all',
    filter = 'all',
    searchQuery = '',
    selectedCategory = INVENTORY_ALL_CATEGORIES_VALUE,
    onSelectLocation,
    onChangeFilter,
    onSearchChange,
    onSelectCategory,
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
  const [localCategory, setLocalCategory] = useState<string>(selectedCategory)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [categoryQuery, setCategoryQuery] = useState('')

  const effectiveLocation = onSelectLocation ? selectedLocationId : localLocation
  const effectiveFilter = onChangeFilter ? filter : localFilter
  const effectiveQuery = onSearchChange ? searchQuery : localQuery
  const effectiveCategory = onSelectCategory ? selectedCategory : localCategory

  const changeFilter = (next: InventoryFilter) => {
    if (onChangeFilter) onChangeFilter(next)
    else setLocalFilter(next)
  }
  const changeCategory = (next: string) => {
    if (onSelectCategory) onSelectCategory(next)
    else setLocalCategory(next)
  }
  const changeQuery = (next: string) => {
    if (onSearchChange) onSearchChange(next)
    else setLocalQuery(next)
  }

  const locationMap = useMemo(() => {
    const map: Record<string, KitchenLocation> = {}
    for (const loc of locations) map[loc.id] = loc
    return map
  }, [locations])

  const categoryOptions = useMemo(() => {
    const sourceItems = effectiveLocation === 'all'
      ? items
      : items.filter((item) => item.locationId === effectiveLocation)
    const counts = new Map<string, number>()
    for (const item of sourceItems) {
      const key = item.category?.trim() || INVENTORY_UNCATEGORIZED_LABEL
      counts.set(key, (counts.get(key) || 0) + 1)
    }

    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value))
  }, [items, effectiveLocation])

  const visibleCategories = useMemo(() => {
    const query = categoryQuery.trim().toLowerCase()
    return query ? categoryOptions.filter((option) => option.value.toLowerCase().includes(query)) : categoryOptions
  }, [categoryOptions, categoryQuery])

  useEffect(() => {
    if (effectiveCategory === INVENTORY_ALL_CATEGORIES_VALUE) return
    const categoryStillExists = categoryOptions.some((option) => option.value === effectiveCategory)
    if (categoryStillExists) return

    if (onSelectCategory) onSelectCategory(INVENTORY_ALL_CATEGORIES_VALUE)
    else setLocalCategory(INVENTORY_ALL_CATEGORIES_VALUE)
  }, [categoryOptions, effectiveCategory, onSelectCategory])

  const derived = useMemo(() => {
    const query = effectiveQuery.trim().toLowerCase()
    let list = items

    if (effectiveLocation !== 'all') {
      list = list.filter((i) => i.locationId === effectiveLocation)
    }

    if (effectiveCategory !== INVENTORY_ALL_CATEGORIES_VALUE) {
      list = list.filter((i) => (i.category?.trim() || INVENTORY_UNCATEGORIZED_LABEL) === effectiveCategory)
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
      list = list.filter(isLowStock)
    }

    const expiringSoonCount = items.filter((i) => {
      const s = itemExpiryStatus(i)
      return s === 'soon' || s === 'expired'
    }).length

    return {
      list,
      expiringSoonCount,
      lowStockCount: items.filter(isLowStock).length,
      outOfStockCount: items.filter((i) => i.quantity <= 0).length,
      totalCount: items.length,
    }
  }, [items, effectiveLocation, effectiveFilter, effectiveCategory, effectiveQuery])

  const emptyState = derived.list.length === 0
  const showSearchEmpty = items.length > 0 && emptyState
  const categoryActive = effectiveCategory !== INVENTORY_ALL_CATEGORIES_VALUE
  const pickCategory = (next: string) => {
    changeCategory(next)
    setCategoryOpen(false)
    setCategoryQuery('')
  }

  const stats: Array<{ label: string; value: number; tone?: Tone; hint: string; onClick?: () => void }> = [
    { label: 'Items in stock', value: derived.totalCount, hint: 'Across pantry, fridge, and freezer' },
    {
      label: 'Expiring soon',
      value: derived.expiringSoonCount,
      tone: derived.expiringSoonCount > 0 ? 'warning' : undefined,
      hint: 'Use these first',
      onClick: onViewExpiringSoon,
    },
    {
      label: 'Low stock',
      value: derived.lowStockCount,
      hint: 'For your shopping list',
      onClick: () => changeFilter('low-stock'),
    },
    {
      label: 'Out of stock',
      value: derived.outOfStockCount,
      tone: derived.outOfStockCount > 0 ? 'warning' : undefined,
      hint: 'Restock or remove',
    },
  ]

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <PageContainer width="5xl">
        <PageHeader
          eyebrow="Your kitchen"
          title="Kitchen Inventory"
          description="Know what you have, what's expiring soon, and what to use next."
          actions={
            <>
              <button type="button" onClick={onScanBarcode} className={buttonClassName('soft')}>
                <ScanBarcode className="h-4 w-4" strokeWidth={1.75} />
                Scan
              </button>
              <button type="button" onClick={onAddItem} className={buttonClassName('primary')}>
                <Plus className="h-4 w-4" strokeWidth={2} />
                Add item
              </button>
            </>
          }
        />

        {/* One card split into tiles: the gap-px grid over a tinted background draws the dividers. */}
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-stone-200 bg-stone-200 sm:grid-cols-4 dark:border-stone-800 dark:bg-stone-800">
          {stats.map((stat) => {
            const body = (
              <>
                <Stat label={stat.label} value={stat.value} tone={stat.tone} />
                <p className="-mt-3 hidden px-4 pb-4 text-xs text-stone-500 sm:block dark:text-stone-400">{stat.hint}</p>
              </>
            )
            return stat.onClick ? (
              <button
                key={stat.label}
                type="button"
                onClick={stat.onClick}
                className="bg-white text-left transition-colors hover:bg-stone-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-600 dark:bg-stone-950 dark:hover:bg-stone-900"
              >
                {body}
              </button>
            ) : (
              <div key={stat.label} className="bg-white dark:bg-stone-950">
                {body}
              </div>
            )
          })}
        </div>

        {/* Controls */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" strokeWidth={1.75} aria-hidden="true" />
            <input
              type="search"
              value={effectiveQuery}
              onChange={(e) => changeQuery(e.target.value)}
              placeholder="Search items…"
              aria-label="Search items"
              className={cx(fieldClassName, 'pl-10')}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <LocationTabs
              locations={locations}
              value={effectiveLocation}
              onChange={(v) => {
                if (onSelectLocation) onSelectLocation(v)
                else setLocalLocation(v)
              }}
            />
            <SegmentedControl label="Filter inventory" options={FILTER_OPTIONS} value={effectiveFilter} onChange={changeFilter} />
            <button
              type="button"
              aria-expanded={categoryOpen}
              aria-controls="inventory-category-options"
              aria-label={`Filter inventory by category: ${categoryActive ? effectiveCategory : 'All categories'}`}
              onClick={() => setCategoryOpen((open) => !open)}
              className={cx(chipClassName(categoryActive), 'min-h-10 sm:ml-auto')}
            >
              <Tag className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              <span className="max-w-[12rem] truncate">{categoryActive ? effectiveCategory : 'All categories'}</span>
              <ChevronDown className={cx('h-3.5 w-3.5 transition-transform duration-300', categoryOpen && 'rotate-180')} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>

          <Collapse open={categoryOpen}>
            <div id="inventory-category-options" className={cx(cardClassName, 'p-3')}>
              {categoryOptions.length > 8 && (
                <div className="relative mb-3">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" strokeWidth={1.75} aria-hidden="true" />
                  <input
                    type="search"
                    value={categoryQuery}
                    onChange={(e) => setCategoryQuery(e.target.value)}
                    placeholder="Search categories..."
                    aria-label="Search categories"
                    className={cx(fieldClassName, 'pl-10')}
                  />
                </div>
              )}
              <div role="group" aria-label="Filter inventory by category" className="flex flex-wrap gap-2">
                {!categoryQuery.trim() && (
                  <button type="button" aria-pressed={!categoryActive} onClick={() => pickCategory(INVENTORY_ALL_CATEGORIES_VALUE)} className={chipClassName(!categoryActive)}>
                    {!categoryActive && <Check className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden="true" />}
                    All categories
                  </button>
                )}
                {visibleCategories.map((option) => {
                  const selected = option.value === effectiveCategory
                  return (
                    <button key={option.value} type="button" aria-pressed={selected} onClick={() => pickCategory(option.value)} className={chipClassName(selected)}>
                      {selected && <Check className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden="true" />}
                      {option.value}
                      <span className={cx('tabular-nums', selected ? 'text-emerald-100' : 'text-stone-400 dark:text-stone-500')}>{option.count}</span>
                    </button>
                  )
                })}
                {visibleCategories.length === 0 && (
                  <p className="px-1 py-2 text-sm text-stone-500 dark:text-stone-400">No matching categories</p>
                )}
              </div>
            </div>
          </Collapse>
        </div>

        <Section
          title="Inventory"
          id="inventory-list-heading"
          aside={
            <span className="flex items-center gap-2">
              {categoryActive && (
                <button type="button" onClick={() => changeCategory(INVENTORY_ALL_CATEGORIES_VALUE)} className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                  <X className="h-3 w-3" strokeWidth={2.25} aria-hidden="true" />
                  Clear category
                </button>
              )}
              <span>{derived.list.length} shown</span>
            </span>
          }
        >
          <div className={cx(cardClassName, 'overflow-hidden')}>
            {emptyState ? (
              <EmptyState
                icon={showSearchEmpty ? Search : Package}
                title={showSearchEmpty ? 'No matching items' : 'No inventory yet'}
                description={
                  showSearchEmpty
                    ? 'No items match this location or filter. Try another location or clear your filters.'
                    : 'Your pantry, fridge, and freezer are ready. Add a few things you already have, then save a recipe to see what you can cook.'
                }
                action={
                  <div className="flex items-center justify-center gap-2">
                    <button type="button" onClick={onScanBarcode} className={buttonClassName('soft')}>
                      <ScanBarcode className="h-4 w-4" strokeWidth={1.75} />
                      Scan
                    </button>
                    <button type="button" onClick={onAddItem} className={buttonClassName('primary')}>
                      <Plus className="h-4 w-4" strokeWidth={2} />
                      Add item
                    </button>
                  </div>
                }
              />
            ) : (
              <div className={cx('stagger', rowsClassName)}>
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
        </Section>
      </PageContainer>
    </div>
  )
}
