'use client'

import { useId, useRef, useState } from 'react'
import { ChevronDown, NotebookPen } from 'lucide-react'
import { unitLabel } from '@/lib/units'
import { Collapse } from '../ui/collapse'
import { UnitMenu } from '../ui/unit-menu'
import { bareInputClassName, buttonClassName, chipClassName, cx, eyebrowClassName, headingFont, heroCardClassName, heroInputClassName } from '../ui/kit'
import type { ShoppingListItem } from './types'

export type ShoppingItemValues = {
  name: string
  quantity?: number
  unit?: string
  category?: ShoppingListItem['category']
  note?: string
}

const categories = ['Produce', 'Dairy', 'Meat & Seafood', 'Pantry', 'Frozen', 'Bakery', 'Other'] as const

export function ShoppingItemForm({ initial, onSave, onClose, submitLabel }: {
  initial?: ShoppingItemValues | null
  onSave: (values: ShoppingItemValues) => void | Promise<void>
  onClose: () => void
  submitLabel: string
}) {
  const id = useId()
  const [name, setName] = useState(initial?.name ?? '')
  const [quantity, setQuantity] = useState(initial?.quantity?.toString() ?? '')
  const [unit, setUnit] = useState(initial?.unit ?? '')
  const [category, setCategory] = useState<ShoppingListItem['category']>(initial?.category ?? 'Other')
  const [note, setNote] = useState(initial?.note ?? '')
  const [unitOpen, setUnitOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const inFlight = useRef(false)

  return <form className="space-y-5" onSubmit={async (event) => {
    event.preventDefault()
    if (inFlight.current || !name.trim()) return
    const amount = quantity.trim() ? Number(quantity) : undefined
    if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) {
      setError('Enter a quantity greater than zero, or leave it blank.')
      return
    }
    inFlight.current = true
    setSaving(true)
    setError('')
    try {
      await onSave({ name: name.trim(), quantity: amount, unit: unit.trim() || undefined, category, note: note.trim() || undefined })
      onClose()
    } catch {
      setError('Your item couldn’t be saved. Your changes are still here—please try again.')
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }}>
    <fieldset disabled={saving} className="space-y-5">
      {/* Name and amount up top, unit beneath, like the inventory item sheet. */}
      <div className={heroCardClassName}>
        <div className="flex items-start gap-4 p-4">
          <div className="min-w-0 flex-1">
            <label htmlFor={`${id}-name`} className={eyebrowClassName}>Item name</label>
            <input id={`${id}-name`} autoFocus required maxLength={200} value={name} onChange={e => setName(e.target.value)} className={cx(heroInputClassName, 'mt-1')} style={headingFont} placeholder="e.g. Eggs" />
          </div>
          <div className="w-24 shrink-0 text-right">
            <label htmlFor={`${id}-quantity`} className={eyebrowClassName}>Quantity</label>
            <input
              id={`${id}-quantity`}
              type="number"
              inputMode="decimal"
              min="0.000001"
              step="any"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              placeholder="—"
              className="mt-1 w-full bg-transparent text-right text-xl font-semibold tabular-nums text-stone-900 placeholder:text-stone-400 focus:outline-none dark:text-stone-100 dark:placeholder:text-stone-600 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              style={headingFont}
            />
          </div>
        </div>

        <div className="border-t border-stone-200 dark:border-stone-800">
          <button
            type="button"
            id={`${id}-unit`}
            aria-label={`Unit: ${unit || 'not set'}`}
            aria-expanded={unitOpen}
            aria-controls={`${id}-unit-menu`}
            onClick={() => setUnitOpen(open => !open)}
            className="flex min-h-14 w-full items-center gap-3 px-4 text-left hover:bg-stone-100/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-600 dark:hover:bg-stone-800/30"
          >
            <span className={eyebrowClassName} aria-hidden="true">Unit</span>
            <span className={cx('ml-auto truncate text-base', unit ? 'text-stone-900 dark:text-stone-100' : 'text-stone-400')}>
              {unit ? unitLabel(unit, quantity) : 'Optional'}
            </span>
            <ChevronDown className={cx('h-4 w-4 shrink-0 text-stone-400 transition-transform duration-300', unitOpen && 'rotate-180')} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <Collapse open={unitOpen}>
            <div id={`${id}-unit-menu`} className="border-t border-stone-200 dark:border-stone-800">
              <UnitMenu active={unitOpen} value={unit} onChange={setUnit} onDone={() => setUnitOpen(false)} ingredientName={name} />
              {unit && (
                <div className="border-t border-stone-200 p-2 dark:border-stone-800">
                  <button
                    type="button"
                    onClick={() => { setUnit(''); setUnitOpen(false) }}
                    className="min-h-10 w-full rounded-xl px-3 text-left text-sm text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800/60"
                  >
                    No unit
                  </button>
                </div>
              )}
            </div>
          </Collapse>
        </div>

        <label className="flex items-center gap-3 border-t border-stone-200 px-4 focus-within:bg-stone-100/60 dark:border-stone-800 dark:focus-within:bg-stone-800/30 rounded-b-2xl">
          <NotebookPen className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} aria-hidden="true" />
          <span className="sr-only">Note</span>
          <input value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder="Add a note, e.g. brand or size" className={cx(bareInputClassName, 'min-h-14')} />
        </label>
      </div>

      <section>
        <h3 id={`${id}-category`} className={cx(eyebrowClassName, 'mb-2 px-1')}>Category</h3>
        <div role="radiogroup" aria-labelledby={`${id}-category`} className="flex flex-wrap gap-1.5">
          {categories.map(value => {
            const selected = value === category
            return (
              <button key={value} type="button" role="radio" aria-checked={selected} onClick={() => setCategory(value)} className={cx(chipClassName(selected), 'min-h-10')}>
                {value}
              </button>
            )
          })}
        </div>
      </section>
    </fieldset>
    {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">{error}</p>}
    <div className="flex gap-3 pt-1">
      <button type="button" disabled={saving} onClick={onClose} className={cx(buttonClassName('ghost'), 'min-h-11 flex-1')}>Cancel</button>
      <button type="submit" disabled={saving || !name.trim()} className={cx(buttonClassName('primary'), 'min-h-11 flex-[2]')}>{saving ? 'Saving…' : submitLabel}</button>
    </div>
  </form>
}
