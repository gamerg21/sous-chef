'use client'

import { useState } from 'react'
import { Check, ChevronDown, Home } from 'lucide-react'
import { Collapse } from '@/components/ui/collapse'

export interface HouseholdSwitcherProps {
  compact?: boolean
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
  compact = false,
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
      <div className={cx('flex min-w-0 items-center gap-2', !compact && 'min-h-11 px-3 rounded-xl bg-stone-50 dark:bg-stone-900/50')}>
        {!compact && <Home className="w-4 h-4 shrink-0 text-stone-500 dark:text-stone-400" strokeWidth={1.75} />}
        <span title={currentHousehold.name} className={cx('truncate', compact ? cx('text-xs', neutral.muted) : 'text-sm font-medium text-stone-900 dark:text-stone-100')}>
          {currentHousehold.name}
        </span>
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cx(
          'w-full flex items-center gap-2 text-left transition-colors',
          compact ? '-ml-1.5 min-h-8 rounded-lg px-1.5 text-xs' : 'min-h-11 rounded-xl px-3 text-sm font-medium',
          open ? 'bg-stone-100 dark:bg-stone-900/60' : 'hover:bg-stone-100 dark:hover:bg-stone-900/50',
          'focus-visible:outline-none focus-visible:ring-2',
          accent.ring
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {!compact && <Home className="w-4 h-4 text-stone-500 dark:text-stone-400 shrink-0" strokeWidth={1.75} />}
        <span title={currentHousehold.name} className={cx('min-w-0 flex-1 truncate', compact ? neutral.muted : neutral.text)}>
          {currentHousehold.name}
        </span>
        <ChevronDown
          className={cx('w-4 h-4 text-stone-400 dark:text-stone-500 transition-transform duration-300 shrink-0', open ? 'rotate-180' : '')}
          strokeWidth={1.75}
        />
      </button>

      {/* Expands inline under the trigger instead of floating over the navigation. */}
      <Collapse open={open}>
        <div
          role="listbox"
          aria-label="Households"
          className={cx('mt-2 rounded-2xl border p-1.5 bg-white dark:bg-stone-950', compact && '-ml-1.5', neutral.panelBorder)}
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
                  'w-full min-h-11 flex items-center gap-2.5 rounded-xl px-3 text-sm text-left',
                  isSelected
                    ? cx(accent.activeBg, accent.activeText, 'font-medium')
                    : 'text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800/60'
                )}
              >
                <Home className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                <span className="min-w-0 flex-1 truncate">{household.name}</span>
                {isSelected && <Check className="w-4 h-4 shrink-0" strokeWidth={2} aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      </Collapse>
    </div>
  )
}
