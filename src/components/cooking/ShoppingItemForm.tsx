'use client'

import { useId, useRef, useState } from 'react'
import { UnitPicker } from '../ui/unit-picker'
import type { ShoppingListItem } from './types'

export type ShoppingItemValues = {
  name: string
  quantity?: number
  unit?: string
  category?: ShoppingListItem['category']
}

const categories = ['Produce', 'Dairy', 'Meat & Seafood', 'Pantry', 'Frozen', 'Bakery', 'Other'] as const
const fieldClass = 'w-full min-h-11 rounded-lg border border-stone-300 bg-white px-3 py-2 text-base dark:border-stone-700 dark:bg-stone-900'

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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const inFlight = useRef(false)

  return <form className="space-y-4" onSubmit={async (event) => {
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
      await onSave({ name: name.trim(), quantity: amount, unit: unit.trim() || undefined, category })
      onClose()
    } catch {
      setError('Your item couldn’t be saved. Your changes are still here—please try again.')
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }}>
    <fieldset disabled={saving} className="space-y-4">
      <div>
        <label htmlFor={`${id}-name`} className="mb-1 block text-sm font-medium">Item name</label>
        <input id={`${id}-name`} autoFocus required maxLength={200} value={name} onChange={e => setName(e.target.value)} className={fieldClass} placeholder="e.g. Eggs" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${id}-quantity`} className="mb-1 block text-sm font-medium">Quantity</label>
          <input id={`${id}-quantity`} type="number" inputMode="decimal" min="0.000001" step="any" value={quantity} onChange={e => setQuantity(e.target.value)} className={fieldClass} placeholder="Optional" />
        </div>
        <div>
          <label htmlFor={`${id}-unit`} className="mb-1 block text-sm font-medium">Unit</label>
          <UnitPicker id={`${id}-unit`} value={unit} onChange={setUnit} ingredientName={name} placeholder="Optional" />
        </div>
      </div>
      <div>
        <label htmlFor={`${id}-category`} className="mb-1 block text-sm font-medium">Category</label>
        <select id={`${id}-category`} value={category} onChange={e => setCategory(e.target.value as ShoppingListItem['category'])} className={fieldClass}>
          {categories.map(value => <option key={value}>{value}</option>)}
        </select>
      </div>
    </fieldset>
    {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
    <div className="flex justify-end gap-3 pt-2">
      <button type="button" disabled={saving} onClick={onClose} className="min-h-11 rounded-lg border border-stone-300 px-4 dark:border-stone-700">Cancel</button>
      <button type="submit" disabled={saving || !name.trim()} className="min-h-11 rounded-lg bg-emerald-700 px-5 font-medium text-white hover:bg-emerald-800 disabled:opacity-50">{saving ? 'Saving…' : submitLabel}</button>
    </div>
  </form>
}
