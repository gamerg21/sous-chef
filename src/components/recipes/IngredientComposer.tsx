'use client'

import { unitLabel } from '@/lib/units'
import { useMemo, useState } from 'react'
import { Check, ChevronDown, Package, Plus, Refrigerator, Search, ShoppingCart, Snowflake } from 'lucide-react'
import { Collapse } from '../ui/collapse'
import { eyebrowClassName } from '../ui/kit'
import { UnitMenu } from '../ui/unit-menu'
import type { PantrySnapshotItem } from './types'
import { cx, normalizeKey } from './utils'

export type PantryLocationId = 'pantry' | 'fridge' | 'freezer'

export interface NewPantryItem {
  name: string
  unit: string
  locationId: PantryLocationId
}

export interface ComposedIngredient {
  name: string
  quantity: string
  unit: string
  /** Pantry item name the ingredient is linked to, if any. */
  mappingLabel: string
}

/** One entry per pantry name, with stock summed across batches. */
export interface PantryEntry {
  name: string
  quantity: number
  unit?: string
}

export function summarizePantry(pantry: PantrySnapshotItem[]): PantryEntry[] {
  const byName = new Map<string, PantryEntry>()
  for (const item of pantry) {
    const key = normalizeKey(item.name)
    const existing = byName.get(key)
    if (existing) existing.quantity += item.quantity ?? 0
    else byName.set(key, { name: item.name, quantity: item.quantity ?? 0, unit: item.unit })
  }
  // In-stock items first, then alphabetical.
  return [...byName.values()].sort((a, b) => Number(b.quantity > 0) - Number(a.quantity > 0) || a.name.localeCompare(b.name))
}

export function stockLabel(entry: PantryEntry | undefined): string {
  if (!entry) return 'Not in your pantry'
  if (entry.quantity <= 0) return 'Out of stock'
  return `${Number(entry.quantity.toFixed(2))}${entry.unit && entry.unit !== 'count' ? ` ${unitLabel(entry.unit, entry.quantity)}` : ''} in pantry`
}

export { eyebrowClassName } from '../ui/kit'

const LOCATIONS: Array<{ id: PantryLocationId; name: string; Icon: typeof Package }> = [
  { id: 'pantry', name: 'Pantry', Icon: Package },
  { id: 'fridge', name: 'Fridge', Icon: Refrigerator },
  { id: 'freezer', name: 'Freezer', Icon: Snowflake },
]

/** A searchable list of pantry items; used to add and to relink ingredients. */
export function PantryList({ entries, query, onPick, selected }: { entries: PantryEntry[]; query: string; onPick: (entry: PantryEntry) => void; selected?: string }) {
  const term = normalizeKey(query)
  const matches = term ? entries.filter((entry) => normalizeKey(entry.name).includes(term)) : entries
  if (!matches.length) return null
  return (
    <div role="listbox" aria-label="Pantry items" className="max-h-60 overflow-y-auto overscroll-contain px-2 py-1">
      {matches.map((entry) => {
        const isSelected = selected !== undefined && normalizeKey(selected) === normalizeKey(entry.name)
        return (
          <button
            key={entry.name}
            type="button"
            role="option"
            aria-selected={isSelected}
            onClick={() => onPick(entry)}
            className={cx(
              'flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm',
              isSelected
                ? 'bg-emerald-100 font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                : 'text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800/60'
            )}
          >
            <span className="truncate">{entry.name}</span>
            <span className={cx('shrink-0 text-xs', entry.quantity > 0 ? 'text-stone-500 dark:text-stone-400' : 'text-amber-700 dark:text-amber-300')}>
              {isSelected ? <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" /> : stockLabel(entry)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export interface IngredientComposerProps {
  pantry: PantryEntry[]
  onAdd: (ingredient: ComposedIngredient) => void
  /** Creates a zero-stock pantry item so the recipe can track it before it's bought. */
  onAddPantryItem?: (item: NewPantryItem) => Promise<void>
  onAddToShoppingList?: (item: { name: string; quantity?: string; unit?: string }) => Promise<void>
}

/**
 * Adding an ingredient starts from the pantry. Anything not there can be
 * created inline, optionally tracked in the pantry at zero and put on the
 * shopping list so buying it restocks the pantry.
 */
export function IngredientComposer({ pantry, onAdd, onAddPantryItem, onAddToShoppingList }: IngredientComposerProps) {
  const [query, setQuery] = useState('')
  const [browsing, setBrowsing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ name: '', quantity: '', unit: '', locationId: 'pantry' as PantryLocationId, track: true, shop: false })
  const [unitOpen, setUnitOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const term = query.trim()
  const exact = useMemo(() => pantry.find((entry) => normalizeKey(entry.name) === normalizeKey(term)), [pantry, term])
  const hasMatches = !!term && pantry.some((entry) => normalizeKey(entry.name).includes(normalizeKey(term)))
  const listOpen = browsing && !creating

  const reset = () => {
    setQuery('')
    setCreating(false)
    setUnitOpen(false)
    setError('')
  }

  const pickPantry = (entry: PantryEntry) => {
    onAdd({ name: entry.name, quantity: '', unit: entry.unit && entry.unit !== 'count' ? entry.unit : '', mappingLabel: entry.name })
    reset()
  }

  const startCreate = () => {
    setDraft((previous) => ({ ...previous, name: term, quantity: '', unit: '', shop: false }))
    setCreating(true)
    setBrowsing(false)
  }

  const create = async () => {
    const name = draft.name.trim()
    if (!name) return
    setSaving(true)
    setError('')
    try {
      if (draft.track && onAddPantryItem) await onAddPantryItem({ name, unit: draft.unit || 'count', locationId: draft.locationId })
      if (draft.shop && onAddToShoppingList) await onAddToShoppingList({ name, quantity: draft.quantity, unit: draft.unit })
      onAdd({ name, quantity: draft.quantity, unit: draft.unit, mappingLabel: draft.track ? name : '' })
      reset()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Couldn’t add that ingredient. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" strokeWidth={1.75} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setBrowsing(true)
            setCreating(false)
          }}
          onFocus={() => setBrowsing(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setBrowsing(false)
            if (event.key !== 'Enter' || !term) return
            event.preventDefault()
            if (exact) pickPantry(exact)
            else startCreate()
          }}
          placeholder={pantry.length ? 'Add an ingredient from your pantry…' : 'Add your first ingredient…'}
          aria-label="Add an ingredient"
          className="h-14 w-full rounded-2xl bg-transparent pl-11 pr-12 text-base text-stone-900 placeholder:text-stone-400 focus:bg-stone-50 focus:outline-none dark:text-stone-100 dark:focus:bg-stone-900/40"
        />
        <button
          type="button"
          onClick={() => setBrowsing((open) => !open)}
          aria-label={listOpen ? 'Hide pantry items' : 'Show pantry items'}
          className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <ChevronDown className={cx('h-4 w-4 transition-transform duration-300', listOpen && 'rotate-180')} strokeWidth={1.75} />
        </button>
      </div>

      <Collapse open={listOpen}>
        <div className="border-t border-stone-200 dark:border-stone-800">
          {!term && !pantry.length ? (
            <div className="px-4 py-4 text-sm text-stone-500 dark:text-stone-400">
              Your pantry is empty. Type an ingredient above to add it — you can track it in your pantry at the same time.
            </div>
          ) : (
            <>
              {!term && <div className={cx(eyebrowClassName, 'px-4 pt-3')}>From your pantry</div>}
              <PantryList entries={pantry} query={term} onPick={pickPantry} />
              {term && !hasMatches && <div className="px-4 pt-3 text-sm text-stone-500 dark:text-stone-400">“{term}” isn’t in your pantry yet.</div>}
            </>
          )}
          {term && !exact && (
            <div className="p-2">
              <button
                type="button"
                onClick={startCreate}
                className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
              >
                <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                Add “{term}” as a new ingredient
              </button>
            </div>
          )}
        </div>
      </Collapse>

      <Collapse open={creating}>
        <div className="space-y-4 border-t border-stone-200 bg-stone-50/60 p-4 dark:border-stone-800 dark:bg-stone-900/30">
          <div className="flex items-start gap-4">
            <label className="min-w-0 flex-1">
              <span className={eyebrowClassName}>New ingredient</span>
              <input
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                className="mt-1 w-full bg-transparent text-lg font-semibold text-stone-900 focus:outline-none dark:text-stone-100"
                style={{ fontFamily: 'var(--font-heading)' }}
              />
            </label>
            <label className="w-24 shrink-0 text-right">
              <span className={eyebrowClassName}>Amount</span>
              <input
                value={draft.quantity}
                onChange={(event) => setDraft({ ...draft, quantity: event.target.value })}
                inputMode="decimal"
                placeholder="—"
                className="mt-1 w-full bg-transparent text-right text-lg font-semibold tabular-nums text-stone-900 placeholder:text-stone-400 focus:outline-none dark:text-stone-100"
                style={{ fontFamily: 'var(--font-heading)' }}
              />
            </label>
          </div>

          <div className="overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950">
            <button
              type="button"
              aria-expanded={unitOpen}
              onClick={() => setUnitOpen((open) => !open)}
              className="flex min-h-12 w-full items-center gap-3 px-4 text-left hover:bg-stone-50 dark:hover:bg-stone-900/40"
            >
              <span className={eyebrowClassName}>Unit</span>
              <span className={cx('ml-auto text-base', draft.unit ? 'text-stone-900 dark:text-stone-100' : 'text-stone-400')}>{unitLabel(draft.unit, draft.quantity) || 'Optional'}</span>
              <ChevronDown className={cx('h-4 w-4 text-stone-400 transition-transform duration-300', unitOpen && 'rotate-180')} strokeWidth={1.75} />
            </button>
            <Collapse open={unitOpen}>
              <div className="border-t border-stone-200 dark:border-stone-800">
                <UnitMenu active={unitOpen} value={draft.unit} ingredientName={draft.name} onChange={(unit) => setDraft((previous) => ({ ...previous, unit }))} onDone={() => setUnitOpen(false)} />
              </div>
            </Collapse>
          </div>

          {onAddPantryItem && (
            <div className="space-y-2">
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-stone-700 dark:text-stone-300">
                <input type="checkbox" checked={draft.track} onChange={(event) => setDraft({ ...draft, track: event.target.checked })} className="h-4 w-4 accent-emerald-600" />
                <span>
                  Track in my pantry
                  <span className="block text-xs text-stone-500 dark:text-stone-400">Starts at zero until you buy it or update the amount.</span>
                </span>
              </label>
              <Collapse open={draft.track}>
                <div role="radiogroup" aria-label="Where it’s stored" className="grid grid-cols-3 gap-1.5 pl-7">
                  {LOCATIONS.map(({ id, name, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={draft.locationId === id}
                      onClick={() => setDraft({ ...draft, locationId: id })}
                      className={cx(
                        'flex min-h-10 items-center justify-center gap-2 rounded-xl text-sm font-medium',
                        draft.locationId === id
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                          : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800/60'
                      )}
                    >
                      <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      {name}
                    </button>
                  ))}
                </div>
              </Collapse>
            </div>
          )}

          {onAddToShoppingList && (
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-stone-700 dark:text-stone-300">
              <input type="checkbox" checked={draft.shop} onChange={(event) => setDraft({ ...draft, shop: event.target.checked })} className="h-4 w-4 accent-emerald-600" />
              <ShoppingCart className="h-4 w-4 text-stone-400" strokeWidth={1.75} aria-hidden="true" />
              <span>
                Add to shopping list
                {draft.quantity.trim() && <span className="text-stone-500 dark:text-stone-400"> · {draft.quantity.trim()}{draft.unit ? ` ${unitLabel(draft.unit, draft.quantity)}` : ''}</span>}
              </span>
            </label>
          )}

          {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">{error}</p>}

          <div className="flex gap-2">
            <button type="button" onClick={reset} className="min-h-11 flex-1 rounded-xl px-4 text-sm font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800">
              Cancel
            </button>
            <button
              type="button"
              disabled={!draft.name.trim() || saving}
              onClick={() => void create()}
              className="min-h-11 flex-[2] rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? 'Adding…' : 'Add ingredient'}
            </button>
          </div>
        </div>
      </Collapse>
    </div>
  )
}
