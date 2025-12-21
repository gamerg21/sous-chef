'use client'

import { useState } from 'react'
import { ChevronDown, Home } from 'lucide-react'

export interface HouseholdSwitcherProps {
  households: Array<{ id: string; name: string }>
  currentHouseholdId?: string
  onHouseholdChange?: (householdId: string) => void
  accent: {
    ring: string
    activeBg: string
    activeText: string
  }
  neutral: {
    panelBorder: string
    muted: string
    text: string
  }
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

export default function HouseholdSwitcher({
  households,
  currentHouseholdId,
  onHouseholdChange,
  accent,
  neutral,
}: HouseholdSwitcherProps) {
  const [open, setOpen] = useState(false)
  
  if (households.length === 0) return null
  
  const currentHousehold = households.find(h => h.id === currentHouseholdId) || households[0]
  const hasMultiple = households.length > 1

  if (!hasMultiple) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-stone-50 dark:bg-stone-900/50">
        <Home className="w-4 h-4 text-stone-500 dark:text-stone-400" strokeWidth={1.75} />
        <span className="text-sm font-medium text-stone-900 dark:text-stone-100 truncate">
          {currentHousehold.name}
        </span>
      </div>
    )
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cx(
          'w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left',
          'hover:bg-stone-100 dark:hover:bg-stone-900/50',
          'focus-visible:outline-none focus-visible:ring-2',
          accent.ring
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Home className="w-4 h-4 text-stone-500 dark:text-stone-400 shrink-0" strokeWidth={1.75} />
        <span className="min-w-0 flex-1 text-sm font-medium text-stone-900 dark:text-stone-100 truncate">
          {currentHousehold.name}
        </span>
        <ChevronDown
          className={cx('w-4 h-4 text-stone-400 dark:text-stone-500 transition-transform shrink-0', open ? 'rotate-180' : '')}
          strokeWidth={1.75}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className={cx(
            'absolute left-0 top-[calc(100%+0.5rem)] w-full rounded-md border shadow-lg z-50',
            neutral.panelBorder,
            'bg-white dark:bg-stone-950 overflow-hidden'
          )}
        >
          {households.map((household) => {
            const isSelected = household.id === currentHouseholdId
            return (
              <button
                key={household.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onHouseholdChange?.(household.id)
                  setOpen(false)
                }}
                className={cx(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm text-left',
                  isSelected
                    ? cx(accent.activeBg, accent.activeText)
                    : 'text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-900/50'
                )}
              >
                <Home className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                <span className="min-w-0 truncate">{household.name}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

