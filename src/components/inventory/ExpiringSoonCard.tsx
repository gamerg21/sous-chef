import { useMemo, useState } from 'react'
import { ChefHat, ListFilter } from 'lucide-react'
import type { InventoryItem, KitchenLocation } from './types'
import { expiryPhrase, findExpiring, localDay } from '@/lib/expiring'
import { Section, StatusDot, buttonClassName, cardClassName, cx, eyebrowClassName, headingFont, rowsClassName } from '@/components/ui/kit'

const SHOWN = 5

export interface ExpiringSoonCardProps {
  items: InventoryItem[]
  locations: Record<string, KitchenLocation>
  withinDays: number
  /** Dated items used up versus thrown away this month. */
  outcomes?: { used: number; wasted: number }
  onCookExpiring?: () => void
  onShowExpiring?: () => void
  /** "Used" or "Thrown away" for an item past its date; it stays in the pantry as out of stock. */
  onSettleExpired?: (id: string, outcome: 'used' | 'wasted') => Promise<void> | void
}

/** "Use it up": what expires within the cook's window, plus this month's used-versus-wasted tally. */
export function ExpiringSoonCard({ items, locations, withinDays, outcomes, onCookExpiring, onShowExpiring, onSettleExpired }: ExpiringSoonCardProps) {
  const [settling, setSettling] = useState<string | null>(null)
  const settle = async (id: string, outcome: 'used' | 'wasted') => {
    setSettling(id)
    try { await onSettleExpired?.(id, outcome) } finally { setSettling(null) }
  }
  const expiring = useMemo(() => findExpiring(items, { today: localDay(), withinDays }), [items, withinDays])
  const tracked = outcomes ? outcomes.used + outcomes.wasted : 0
  if (!expiring.length && !tracked) return null
  const hidden = expiring.length - SHOWN

  return (
    <Section title="Use it up" aside={expiring.length ? `Expiring within ${withinDays} day${withinDays === 1 ? '' : 's'}` : undefined}>
      <div className={cx('grid gap-3', expiring.length && tracked ? 'md:grid-cols-3' : '')}>
        {expiring.length > 0 && (
          <div className={cx(cardClassName, 'overflow-hidden md:col-span-2')}>
            <ul className={rowsClassName}>
              {expiring.slice(0, SHOWN).map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                  <StatusDot tone={item.daysLeft <= 0 ? 'danger' : 'warning'} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-900 dark:text-stone-100">
                    {item.name}
                    {locations[item.locationId] && <span className="font-normal text-stone-500 dark:text-stone-400"> · {locations[item.locationId].name}</span>}
                  </span>
                  <span className={cx('shrink-0 text-sm', item.daysLeft <= 0 ? 'text-rose-700 dark:text-rose-300' : 'text-amber-700 dark:text-amber-300')}>
                    {expiryPhrase(item.daysLeft).replace(/^./, (c) => c.toUpperCase())}
                  </span>
                  {item.daysLeft < 0 && onSettleExpired && (
                    <span className="flex w-full justify-end gap-2 sm:w-auto">
                      <button type="button" disabled={settling === item.id} onClick={() => void settle(item.id, 'used')} className={buttonClassName('secondary', 'sm')} aria-label={`${item.name}: used`}>
                        Used
                      </button>
                      <button type="button" disabled={settling === item.id} onClick={() => void settle(item.id, 'wasted')} className={buttonClassName('secondary', 'sm')} aria-label={`${item.name}: thrown away`}>
                        Thrown away
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2 border-t border-stone-200 p-3 dark:border-stone-800">
              <button type="button" onClick={onCookExpiring} className={buttonClassName('soft', 'sm')}>
                <ChefHat className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Cook with these
              </button>
              <button type="button" onClick={onShowExpiring} className={buttonClassName('ghost', 'sm')}>
                <ListFilter className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                {hidden > 0 ? `Show all ${expiring.length}` : 'Show in list'}
              </button>
            </div>
          </div>
        )}
        {tracked > 0 && outcomes && (
          <div className={cx(cardClassName, 'p-4')}>
            <p className={eyebrowClassName}>This month</p>
            <div className="mt-2 flex items-baseline gap-5">
              <div>
                <p className="text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-300" style={headingFont}>{outcomes.used}</p>
                <p className="text-xs text-stone-500 dark:text-stone-400">Used up</p>
              </div>
              <div>
                <p className={cx('text-2xl font-semibold tabular-nums', outcomes.wasted ? 'text-rose-700 dark:text-rose-300' : 'text-stone-900 dark:text-stone-100')} style={headingFont}>{outcomes.wasted}</p>
                <p className="text-xs text-stone-500 dark:text-stone-400">Thrown away</p>
              </div>
            </div>
            <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800" aria-hidden="true">
              <div className="h-full bg-emerald-500" style={{ width: `${(outcomes.used / tracked) * 100}%` }} />
              <div className="h-full bg-rose-400" style={{ width: `${(outcomes.wasted / tracked) * 100}%` }} />
            </div>
          </div>
        )}
      </div>
    </Section>
  )
}
