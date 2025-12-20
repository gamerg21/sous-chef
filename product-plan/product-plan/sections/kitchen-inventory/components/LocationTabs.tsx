import type { KitchenLocation, KitchenLocationId } from './types'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

export interface LocationTabsProps {
  locations: KitchenLocation[]
  value: KitchenLocationId | 'all'
  onChange?: (value: KitchenLocationId | 'all') => void
}

export function LocationTabs({ locations, value, onChange }: LocationTabsProps) {
  const items: Array<{ id: KitchenLocationId | 'all'; name: string }> = [
    { id: 'all', name: 'All' },
    ...locations.map((l) => ({ id: l.id, name: l.name })),
  ]

  return (
    <div className="inline-flex rounded-lg border border-stone-200 dark:border-stone-800 bg-white/70 dark:bg-stone-950/40 p-1">
      {items.map((item) => {
        const active = item.id === value
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange?.(item.id)}
            className={cx(
              'px-3 py-1.5 text-sm rounded-md transition-colors',
              active
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-900/60'
            )}
          >
            {item.name}
          </button>
        )
      })}
    </div>
  )
}


