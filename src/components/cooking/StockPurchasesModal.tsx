'use client'

import { useRef, useState } from 'react'
import { CalendarDays, ChevronDown, Package, Refrigerator, Snowflake } from 'lucide-react'
import { unitLabel } from '@/lib/units'
import { Modal } from '../ui/modal'
import { Collapse } from '../ui/collapse'
import { UnitMenu } from '../ui/unit-menu'
import { Calendar, daysFromTodayISO, formatDisplay } from '../ui/date-picker'
import { buttonClassName, chipClassName, cx, eyebrowClassName, headingFont, heroCardClassName, optionClassName } from '../ui/kit'
import type { ShoppingListItem } from './types'

export type PurchaseReview = { id: string; quantity: number; unit: string; locationId: string; expiresOn?: string; expectedName: string; expectedQuantity?: number; expectedUnit?: string }

const EXPIRY_SHORTCUTS = [
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
  { label: '6 months', days: 182 },
]

// Household locations are user-named, so pick an icon from the name.
function locationIcon(name: string) {
  const lower = name.toLowerCase()
  if (lower.includes('freez')) return Snowflake
  if (lower.includes('fridge') || lower.includes('refrig')) return Refrigerator
  return Package
}

type Panel = { id: string; kind: 'unit' | 'location' | 'expires' } | null

export function StockPurchasesModal({ items, locations, onClose, onSave }: {
  items: ShoppingListItem[]
  locations: { id: string; name: string }[]
  onClose: () => void
  onSave: (items: PurchaseReview[]) => Promise<void>
}) {
  const [rows, setRows] = useState(() => items.map(item => ({ ...item, amount: item.quantity?.toString() ?? '', unit: item.unit ?? '', locationId: locations[0]?.id ?? '', expiresOn: '' })))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // One inline drawer open at a time across all purchases.
  const [panel, setPanel] = useState<Panel>(null)
  const inFlight = useRef(false)
  function update(id: string, patch: Partial<(typeof rows)[number]>) { setRows(previous => previous.map(row => row.id === id ? { ...row, ...patch } : row)) }
  const isOpen = (id: string, kind: NonNullable<Panel>['kind']) => panel?.id === id && panel.kind === kind
  const toggle = (id: string, kind: NonNullable<Panel>['kind']) => setPanel(current => current?.id === id && current.kind === kind ? null : { id, kind })

  return <Modal isOpen onClose={() => { if (!inFlight.current) onClose() }} title="Put groceries away" className="max-w-2xl">
    <form className="space-y-5" onSubmit={async event => {
      event.preventDefault()
      if (inFlight.current) return
      if (rows.some(row => !Number.isFinite(Number(row.amount)) || Number(row.amount) <= 0 || !row.unit.trim() || !row.locationId)) {
        setError('Enter the quantity, unit, and location for every purchase.'); return
      }
      inFlight.current = true; setSaving(true); setError('')
      try {
        await onSave(rows.map(row => ({ id: row.id, quantity: Number(row.amount), unit: row.unit, locationId: row.locationId, expiresOn: row.expiresOn || undefined, expectedName: row.name, expectedQuantity: row.quantity, expectedUnit: items.find(item => item.id === row.id)?.unit })))
        onClose()
      } catch {
        setError('Could not stock these purchases. Your review is saved here. If someone changed the shopping list, close and reopen this review before trying again.')
      } finally { inFlight.current = false; setSaving(false) }
    }}>
      <p className="text-sm text-stone-600 dark:text-stone-400">Confirm what you bought. Each purchase becomes a new inventory batch, then leaves your shopping list.</p>
      {!locations.length && <p role="alert" className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">Add a storage location in Kitchen settings first.</p>}
      <fieldset disabled={saving} className="space-y-4">
        {rows.map(row => {
          const location = locations.find(candidate => candidate.id === row.locationId)
          const LocationIcon = locationIcon(location?.name ?? '')
          return <section key={row.id} aria-labelledby={`purchase-${row.id}`} className={heroCardClassName}>
            <div className="flex items-start gap-4 p-4">
              <div className="min-w-0 flex-1">
                <span className={eyebrowClassName}>Purchase</span>
                <h3 id={`purchase-${row.id}`} className="mt-1 truncate text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-100" style={headingFont}>{row.name}</h3>
              </div>
              <label className="w-24 shrink-0 text-right">
                <span className={eyebrowClassName} aria-hidden="true">Quantity</span>
                <input
                  aria-label={`Quantity for ${row.name}`}
                  required
                  type="number"
                  min="0.000001"
                  step="any"
                  inputMode="decimal"
                  value={row.amount}
                  onChange={e => update(row.id, { amount: e.target.value })}
                  placeholder="—"
                  className="mt-1 w-full bg-transparent text-right text-xl font-semibold tabular-nums text-stone-900 placeholder:text-stone-400 focus:outline-none dark:text-stone-100 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  style={headingFont}
                />
              </label>
            </div>

            <div className="border-t border-stone-200 dark:border-stone-800">
              <button
                type="button"
                id={`unit-${row.id}`}
                aria-label={`Unit for ${row.name}: ${row.unit || 'not set'}`}
                aria-expanded={isOpen(row.id, 'unit')}
                aria-controls={`unit-menu-${row.id}`}
                onClick={() => toggle(row.id, 'unit')}
                className="flex min-h-14 w-full items-center gap-3 px-4 text-left hover:bg-stone-100/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-600 dark:hover:bg-stone-800/30"
              >
                <span className={eyebrowClassName} aria-hidden="true">Unit</span>
                <span className={cx('ml-auto truncate text-base', row.unit ? 'text-stone-900 dark:text-stone-100' : 'text-stone-400')}>
                  {row.unit ? unitLabel(row.unit, row.amount) : 'Choose a unit'}
                </span>
                <ChevronDown className={cx('h-4 w-4 shrink-0 text-stone-400 transition-transform duration-300', isOpen(row.id, 'unit') && 'rotate-180')} strokeWidth={1.75} aria-hidden="true" />
              </button>
              <Collapse open={isOpen(row.id, 'unit')}>
                <div id={`unit-menu-${row.id}`} className="border-t border-stone-200 dark:border-stone-800">
                  <UnitMenu active={isOpen(row.id, 'unit')} value={row.unit} onChange={unit => update(row.id, { unit })} onDone={() => setPanel(null)} ingredientName={row.name} />
                </div>
              </Collapse>
            </div>

            <div className="grid grid-cols-2 divide-x divide-stone-200 border-t border-stone-200 dark:divide-stone-800 dark:border-stone-800">
              <div className="min-w-0 p-4">
                <span className={eyebrowClassName} aria-hidden="true">Location</span>
                <button
                  type="button"
                  aria-label={`Location for ${row.name}: ${location?.name ?? 'not set'}`}
                  aria-expanded={isOpen(row.id, 'location')}
                  aria-controls={`location-${row.id}`}
                  onClick={() => toggle(row.id, 'location')}
                  className="mt-1.5 -ml-1 flex min-h-10 max-w-full items-center gap-2.5 rounded-full py-1 pl-1 pr-3 text-base text-stone-900 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-emerald-600 dark:text-stone-100 dark:hover:bg-stone-800/60"
                >
                  <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300">
                    <LocationIcon className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                  <span className="truncate">{location?.name ?? 'Choose'}</span>
                  <ChevronDown className={cx('h-4 w-4 shrink-0 text-stone-400 transition-transform duration-300', isOpen(row.id, 'location') && 'rotate-180')} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>
              <div className="min-w-0 p-4">
                <span className={eyebrowClassName} aria-hidden="true">Expires</span>
                <button
                  type="button"
                  aria-label={`Expiry for ${row.name}: ${row.expiresOn ? formatDisplay(row.expiresOn) : 'no expiration'}`}
                  aria-expanded={isOpen(row.id, 'expires')}
                  aria-controls={`expires-${row.id}`}
                  onClick={() => toggle(row.id, 'expires')}
                  className="mt-1.5 -ml-2 flex min-h-10 w-[calc(100%+0.5rem)] items-center gap-2.5 rounded-full px-2 py-1 text-left text-base hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-emerald-600 dark:hover:bg-stone-800/60"
                >
                  <CalendarDays className="h-5 w-5 shrink-0 text-stone-400" strokeWidth={1.75} aria-hidden="true" />
                  <span className={cx('truncate', row.expiresOn ? 'text-stone-900 dark:text-stone-100' : 'text-stone-400')}>
                    {row.expiresOn ? formatDisplay(row.expiresOn) : 'Optional'}
                  </span>
                </button>
              </div>
            </div>

            <Collapse open={isOpen(row.id, 'location')}>
              <div id={`location-${row.id}`} role="radiogroup" aria-label={`Location for ${row.name}`} className="grid grid-cols-2 gap-1.5 border-t border-stone-200 p-2 sm:grid-cols-3 dark:border-stone-800">
                {locations.map(option => {
                  const selected = option.id === row.locationId
                  const Icon = locationIcon(option.name)
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => { update(row.id, { locationId: option.id }); setPanel(null) }}
                      className={cx(optionClassName(selected), 'justify-center font-medium')}
                    >
                      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                      <span className="truncate">{option.name}</span>
                    </button>
                  )
                })}
              </div>
            </Collapse>

            <Collapse open={isOpen(row.id, 'expires')}>
              <div id={`expires-${row.id}`} className="border-t border-stone-200 p-4 dark:border-stone-800">
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {EXPIRY_SHORTCUTS.map(shortcut => (
                    <button key={shortcut.label} type="button" onClick={() => { update(row.id, { expiresOn: daysFromTodayISO(shortcut.days) }); setPanel(null) }} className={chipClassName(false)}>
                      {shortcut.label}
                    </button>
                  ))}
                  {row.expiresOn && (
                    <button type="button" onClick={() => { update(row.id, { expiresOn: '' }); setPanel(null) }} className="min-h-9 rounded-full px-3 text-sm text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800">
                      No expiration
                    </button>
                  )}
                </div>
                {/* Remount on open so it starts on the selected month. */}
                <Calendar
                  key={isOpen(row.id, 'expires') ? 'open' : 'closed'}
                  size="comfortable"
                  value={row.expiresOn}
                  onSelect={expiresOn => { update(row.id, { expiresOn }); setPanel(null) }}
                />
              </div>
            </Collapse>
          </section>
        })}
      </fieldset>
      {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">{error}</p>}
      <button disabled={saving || !locations.length} className={cx(buttonClassName('primary'), 'min-h-12 w-full')}>{saving ? 'Stocking groceries…' : `Add ${rows.length} purchase${rows.length === 1 ? '' : 's'} to inventory`}</button>
    </form>
  </Modal>
}
