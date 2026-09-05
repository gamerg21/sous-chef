'use client'

import { useRef, useState } from 'react'
import { Modal } from '../ui/modal'
import { UnitPicker } from '../ui/unit-picker'
import type { ShoppingListItem } from './types'

export type PurchaseReview = { id: string; quantity: number; unit: string; locationId: string; expiresOn?: string; expectedName: string; expectedQuantity?: number; expectedUnit?: string }
const field = 'min-h-11 w-full min-w-0 rounded-lg border border-stone-300 bg-white px-3 py-2 dark:border-stone-700 dark:bg-stone-900'

export function StockPurchasesModal({ items, locations, onClose, onSave }: {
  items: ShoppingListItem[]
  locations: { id: string; name: string }[]
  onClose: () => void
  onSave: (items: PurchaseReview[]) => Promise<void>
}) {
  const [rows, setRows] = useState(() => items.map(item => ({ ...item, amount: item.quantity?.toString() ?? '', unit: item.unit ?? '', locationId: locations[0]?.id ?? '', expiresOn: '' })))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const inFlight = useRef(false)
  function update(id: string, patch: Partial<(typeof rows)[number]>) { setRows(previous => previous.map(row => row.id === id ? { ...row, ...patch } : row)) }
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
      {!locations.length && <p role="alert">Add a storage location in Kitchen settings first.</p>}
      <fieldset disabled={saving} className="space-y-4">
        {rows.map(row => <section key={row.id} className="rounded-xl border border-stone-200 p-4 dark:border-stone-800">
          <h3 className="mb-3 font-semibold">{row.name}</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="min-w-0 text-sm">Quantity<input aria-label={`Quantity for ${row.name}`} required type="number" min="0.000001" step="any" inputMode="decimal" value={row.amount} onChange={e => update(row.id, { amount: e.target.value })} className={field} /></label>
            <div className="min-w-0 text-sm"><label htmlFor={`unit-${row.id}`}>Unit</label><UnitPicker id={`unit-${row.id}`} value={row.unit} onChange={unit => update(row.id, { unit })} ingredientName={row.name} /></div>
            <label className="min-w-0 text-sm">Location<select aria-label={`Location for ${row.name}`} required value={row.locationId} onChange={e => update(row.id, { locationId: e.target.value })} className={field}><option value="">Choose location</option>{locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
            <label className="min-w-0 text-sm">Expiry (optional)<input aria-label={`Expiry for ${row.name}`} type="date" value={row.expiresOn} onChange={e => update(row.id, { expiresOn: e.target.value })} className={field} /></label>
          </div>
        </section>)}
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      <button disabled={saving || !locations.length} className="min-h-11 w-full rounded-lg bg-emerald-700 px-4 py-3 font-medium text-white disabled:opacity-50">{saving ? 'Stocking groceries…' : `Add ${rows.length} purchase${rows.length === 1 ? '' : 's'} to inventory`}</button>
    </form>
  </Modal>
}
