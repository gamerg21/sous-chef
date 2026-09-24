'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ChevronDown, Clock, Link2, Minus, Plus, Trash2, X } from 'lucide-react'
import type { PantrySnapshotItem, Recipe, RecipeIngredient, RecipeStep, RecipeVisibility, IngredientUnit } from './types'
import { cx, normalizeKey } from './utils'
import { parseAmount, unitLabel } from '@/lib/units'
import { Collapse } from '../ui/collapse'
import { UnitMenu } from '../ui/unit-menu'
import {
  IngredientComposer,
  PantryList,
  eyebrowClassName,
  stockLabel,
  summarizePantry,
  type NewPantryItem,
  type PantryEntry,
} from './IngredientComposer'

export interface RecipeEditorDraft {
  title: string
  description: string
  tags: string
  visibility: RecipeVisibility
  servings: string
  totalTimeMinutes: string
  caloriesKcal: string
  proteinGrams: string
  carbsGrams: string
  fatGrams: string
  ingredients: Array<{
    id: string
    name: string
    quantity: string
    unit: string
    note: string
    mappingLabel: string
  }>
  steps: Array<{ id: string; text: string }>
  notes: string
  sourceUrl: string
}

export interface RecipeEditorViewProps {
  recipe?: Recipe | null
  pantrySnapshot?: PantrySnapshotItem[]
  /** "page" renders as a full screen design; "modal" is intended for embedding in dialogs. */
  layout?: 'page' | 'modal'
  onBack?: () => void
  onCancel?: () => void
  onSave?: (next: Recipe) => void | Promise<void>
  /** Creates a zero-stock pantry item for an ingredient the kitchen doesn't have yet. */
  onAddPantryItem?: (item: NewPantryItem) => Promise<void>
  onAddToShoppingList?: (item: { name: string; quantity?: string; unit?: string }) => Promise<void>
}

type EditorTab = 'basics' | 'ingredients' | 'steps' | 'notes'

function parseQuantityInput(value: string): number | undefined {
  return parseAmount(value) ?? undefined
}

function parseNonNegativeInput(value: string): number | undefined {
  const raw = value.trim()
  if (!raw) return undefined

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) return undefined
  return parsed
}

function toDraft(recipe: Recipe | null | undefined): RecipeEditorDraft {
  const r = recipe
  return {
    title: r?.title ?? '',
    description: r?.description ?? '',
    tags: (r?.tags ?? []).join(', '),
    visibility: r?.visibility ?? 'private',
    servings: typeof r?.servings === 'number' ? `${r.servings}` : '',
    totalTimeMinutes: typeof r?.totalTimeMinutes === 'number' ? `${r.totalTimeMinutes}` : '',
    caloriesKcal: typeof r?.caloriesKcal === 'number' ? `${r.caloriesKcal}` : '',
    proteinGrams: typeof r?.proteinGrams === 'number' ? `${r.proteinGrams}` : '',
    carbsGrams: typeof r?.carbsGrams === 'number' ? `${r.carbsGrams}` : '',
    fatGrams: typeof r?.fatGrams === 'number' ? `${r.fatGrams}` : '',
    ingredients: (r?.ingredients ?? []).map((i) => ({
      id: i.id,
      name: i.name,
      quantity: typeof i.quantity === 'number' ? `${i.quantity}` : '',
      unit: i.unit ?? '',
      note: i.note ?? '',
      mappingLabel: i.mapping?.inventoryItemLabel ?? '',
    })),
    steps: (r?.steps ?? []).map((s) => ({ id: s.id, text: s.text })),
    notes: r?.notes ?? '',
    sourceUrl: r?.sourceUrl ?? '',
  }
}

function fromDraft(base: Recipe | null | undefined, draft: RecipeEditorDraft): Recipe {
  const now = new Date().toISOString().slice(0, 10)
  const servings = Number(draft.servings)
  const totalTimeMinutes = Number(draft.totalTimeMinutes)
  const caloriesKcal = parseNonNegativeInput(draft.caloriesKcal)
  const proteinGrams = parseNonNegativeInput(draft.proteinGrams)
  const carbsGrams = parseNonNegativeInput(draft.carbsGrams)
  const fatGrams = parseNonNegativeInput(draft.fatGrams)

  const ingredients: RecipeIngredient[] = draft.ingredients
    .filter((i) => i.name.trim())
    .map((i) => ({
      id: i.id,
      name: i.name.trim(),
      quantity: parseQuantityInput(i.quantity),
      unit: i.unit.trim() ? (i.unit.trim() as IngredientUnit) : undefined,
      note: i.note.trim() || undefined,
      mapping: i.mappingLabel.trim()
        ? { inventoryItemLabel: i.mappingLabel.trim(), suggested: false }
        : undefined,
    }))

  const steps: RecipeStep[] = draft.steps
    .filter((s) => s.text.trim())
    .map((s) => ({ id: s.id, text: s.text.trim() }))

  const tags = draft.tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  return {
    id: base?.id ?? `rcp_${Math.random().toString(16).slice(2)}`,
    title: draft.title.trim() || base?.title || 'Untitled recipe',
    description: draft.description.trim() || undefined,
    tags: tags.length ? tags : undefined,
    visibility: draft.visibility,
    servings: Number.isFinite(servings) && servings > 0 ? servings : undefined,
    totalTimeMinutes: Number.isFinite(totalTimeMinutes) && totalTimeMinutes > 0 ? totalTimeMinutes : undefined,
    caloriesKcal,
    proteinGrams,
    carbsGrams,
    fatGrams,
    sourceUrl: draft.sourceUrl.trim() || undefined,
    notes: draft.notes.trim() || undefined,
    ingredients,
    steps,
    updatedAt: now,
    favorited: base?.favorited ?? false,
    lastCookedAt: base?.lastCookedAt,
    photoUrl: base?.photoUrl,
  }
}

type IngredientDraft = RecipeEditorDraft['ingredients'][number]

const newId = (prefix: string) => `${prefix}_${Math.random().toString(16).slice(2)}`

/** One ingredient: name, amount and unit inline, with pantry link and note tucked away. */
function IngredientRow({
  ingredient,
  pantry,
  onChange,
  onRemove,
}: {
  ingredient: IngredientDraft
  pantry: PantryEntry[]
  onChange: (patch: Partial<IngredientDraft>) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState<'unit' | 'link' | 'note' | null>(null)
  const [linkQuery, setLinkQuery] = useState('')
  const toggle = (next: NonNullable<typeof open>) => setOpen((current) => (current === next ? null : next))
  const linked = ingredient.mappingLabel.trim()
  const entry = linked ? pantry.find((p) => normalizeKey(p.name) === normalizeKey(linked)) : undefined
  const tone = !linked ? 'unlinked' : entry && entry.quantity > 0 ? 'stocked' : 'empty'

  return (
    <li className="animate-rise-in">
      <div className="flex items-center gap-3 px-4 py-3">
        <span
          aria-hidden="true"
          className={cx(
            'h-2.5 w-2.5 shrink-0 rounded-full',
            tone === 'stocked' ? 'bg-emerald-500' : tone === 'empty' ? 'bg-amber-500' : 'bg-stone-300 dark:bg-stone-600'
          )}
        />
        <div className="min-w-0 flex-1">
          <input
            value={ingredient.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Ingredient"
            aria-label="Ingredient name"
            className="w-full bg-transparent text-base font-medium text-stone-900 placeholder:text-stone-400 focus:outline-none dark:text-stone-100"
          />
          <button
            type="button"
            onClick={() => { setLinkQuery(''); toggle('link') }}
            aria-expanded={open === 'link'}
            className={cx(
              'mt-0.5 inline-flex items-center gap-1 text-xs hover:underline',
              tone === 'stocked' ? 'text-emerald-700 dark:text-emerald-400' : tone === 'empty' ? 'text-amber-700 dark:text-amber-300' : 'text-stone-500 dark:text-stone-400'
            )}
          >
            <Link2 className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
            {linked ? `${linked} · ${stockLabel(entry)}` : 'Link to pantry'}
          </button>
          {ingredient.note && open !== 'note' && (
            <button type="button" onClick={() => toggle('note')} className="block text-left text-xs italic text-stone-500 hover:underline dark:text-stone-400">
              {ingredient.note}
            </button>
          )}
        </div>
        <input
          value={ingredient.quantity}
          onChange={(e) => onChange({ quantity: e.target.value })}
          placeholder="Qty"
          inputMode="decimal"
          aria-label={`Amount of ${ingredient.name || 'ingredient'}`}
          className="h-10 w-16 rounded-lg bg-stone-100 px-2 text-right text-base tabular-nums text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:bg-stone-900 dark:text-stone-100"
        />
        <button
          type="button"
          onClick={() => toggle('unit')}
          aria-expanded={open === 'unit'}
          aria-label={`Unit: ${ingredient.unit || 'none'}`}
          className="flex h-10 min-w-16 max-w-28 items-center justify-between gap-1 rounded-lg px-2 text-sm text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800/60"
        >
          <span className={cx('truncate', !ingredient.unit && 'text-stone-400')}>{unitLabel(ingredient.unit, ingredient.quantity) || 'unit'}</span>
          <ChevronDown className={cx('h-3.5 w-3.5 shrink-0 text-stone-400 transition-transform duration-300', open === 'unit' && 'rotate-180')} strokeWidth={1.75} />
        </button>
        <div className="flex shrink-0 items-center">
          {!ingredient.note && (
            <button type="button" onClick={() => toggle('note')} aria-label="Add a note" className="hidden h-10 w-9 items-center justify-center rounded-lg text-xs text-stone-400 hover:bg-stone-100 hover:text-stone-600 sm:flex dark:hover:bg-stone-800">
              Note
            </button>
          )}
          <button type="button" onClick={onRemove} aria-label={`Remove ${ingredient.name || 'ingredient'}`} className="flex h-10 w-10 items-center justify-center rounded-lg text-stone-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30">
            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <Collapse open={open === 'unit'}>
        <div className="border-t border-stone-200 dark:border-stone-800">
          <UnitMenu active={open === 'unit'} value={ingredient.unit} ingredientName={ingredient.name} onChange={(unit) => onChange({ unit })} onDone={() => setOpen(null)} />
        </div>
      </Collapse>

      <Collapse open={open === 'link'}>
        <div className="border-t border-stone-200 dark:border-stone-800">
          <div className="p-3">
            <input
              type="search"
              value={linkQuery}
              onChange={(e) => setLinkQuery(e.target.value)}
              placeholder="Search your pantry"
              aria-label="Search your pantry"
              className="h-10 w-full rounded-xl border border-stone-200 bg-white px-3 text-base text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
            />
          </div>
          <PantryList entries={pantry} query={linkQuery} selected={linked} onPick={(p) => { onChange({ mappingLabel: p.name }); setOpen(null) }} />
          {linked && (
            <div className="p-2">
              <button type="button" onClick={() => { onChange({ mappingLabel: '' }); setOpen(null) }} className="min-h-10 w-full rounded-xl px-3 text-left text-sm text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800/60">
                Unlink from pantry
              </button>
            </div>
          )}
        </div>
      </Collapse>

      <Collapse open={open === 'note'}>
        <div className="border-t border-stone-200 p-3 dark:border-stone-800">
          <input
            value={ingredient.note}
            onChange={(e) => onChange({ note: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setOpen(null) } }}
            placeholder="e.g. finely chopped"
            aria-label="Ingredient note"
            className="h-10 w-full rounded-xl bg-stone-100 px-3 text-base text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:bg-stone-900 dark:text-stone-100"
          />
        </div>
      </Collapse>
    </li>
  )
}

export function RecipeEditorView(props: RecipeEditorViewProps) {
  const { recipe, pantrySnapshot = [], layout = 'page', onBack, onCancel, onSave, onAddPantryItem, onAddToShoppingList } = props
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const isModal = layout === 'modal'

  const pantry = useMemo(() => summarizePantry(pantrySnapshot), [pantrySnapshot])

  const [draft, setDraft] = useState<RecipeEditorDraft>(() => toDraft(recipe))
  const [tab, setTab] = useState<EditorTab>('basics')
  const [tagInput, setTagInput] = useState('')

  useEffect(() => {
    // Defer state updates to avoid synchronous setState in effect
    const timer = setTimeout(() => {
      setDraft(toDraft(recipe))
      setTab('basics')
    }, 0)
    return () => clearTimeout(timer)
  }, [recipe?.id, recipe])

  const titleEmpty = !draft.title.trim()
  const tags = draft.tags.split(',').map((t) => t.trim()).filter(Boolean)
  const setTags = (next: string[]) => setDraft((d) => ({ ...d, tags: next.join(', ') }))
  const commitTag = () => {
    const tag = tagInput.trim().replace(/,$/, '')
    if (tag && !tags.some((t) => t.toLowerCase() === tag.toLowerCase())) setTags([...tags, tag])
    setTagInput('')
  }
  const updateIngredient = (id: string, patch: Partial<IngredientDraft>) =>
    setDraft((d) => ({ ...d, ingredients: d.ingredients.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))
  const servings = Number(draft.servings) || 0
  const stepServings = (delta: number) => setDraft((d) => ({ ...d, servings: `${Math.max(1, (Number(d.servings) || 0) + delta)}` }))

  const tabs: Array<{ id: EditorTab; label: string }> = [
    { id: 'basics', label: 'Basics' },
    { id: 'ingredients', label: 'Ingredients' },
    { id: 'steps', label: 'Steps' },
    { id: 'notes', label: 'Notes' },
  ]

  const save = async () => {
    if (savingRef.current) return
    savingRef.current = true; setSaving(true)
    try { await onSave?.(fromDraft(recipe, draft)) }
    finally { savingRef.current = false; setSaving(false) }
  }

  const header = (
    <div className={cx(isModal ? 'p-4 sm:p-5 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950' : '')}>
      <div className="flex items-center justify-between gap-3">
        {(onBack || onCancel) ? (
          <button
            type="button"
            onClick={() => (onBack ? onBack() : onCancel?.())}
            className="-ml-2 inline-flex min-h-10 items-center gap-2 rounded-full px-2 text-sm text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-100"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            {isModal ? 'Close' : 'Recipes'}
          </button>
        ) : <span />}
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCancel} className="min-h-10 rounded-xl px-4 text-sm font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-900">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={titleEmpty || saving}
            title={titleEmpty ? 'Give your recipe a title to save it' : undefined}
            className="min-h-10 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm shadow-emerald-900/20 hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save recipe'}
          </button>
        </div>
      </div>
      <p className={cx(eyebrowClassName, 'mt-4')}>
        {recipe?.id.startsWith('captured-') ? 'Review recipe' : recipe ? 'Edit recipe' : 'New recipe'}
      </p>

      {isModal && (
        <div className="mt-4">
          <div className="inline-flex rounded-xl bg-stone-100 p-1 dark:bg-stone-900">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cx(
                  'px-3 py-1.5 text-sm rounded-lg transition-colors',
                  t.id === tab ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-950 dark:text-stone-100' : 'text-stone-600 hover:text-stone-900 dark:text-stone-300'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  const heroCard = (
    <div className="rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900/40">
      <div className="p-5">
        <label htmlFor="recipe-title" className={eyebrowClassName}>Title</label>
        <input
          id="recipe-title"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          placeholder="Name your recipe"
          autoFocus={!recipe}
          className="mt-1 w-full bg-transparent text-2xl font-semibold tracking-tight text-stone-900 placeholder:font-medium placeholder:text-stone-400 focus:outline-none sm:text-3xl dark:text-stone-100 dark:placeholder:text-stone-600"
          style={{ fontFamily: 'var(--font-heading)' }}
        />
        <textarea
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          placeholder="Add a short description"
          aria-label="Description"
          rows={draft.description ? 3 : 1}
          className="mt-2 w-full resize-none bg-transparent text-base text-stone-700 placeholder:text-stone-400 focus:outline-none dark:text-stone-300"
        />
      </div>
      <div className="grid grid-cols-1 divide-y divide-stone-200 border-t border-stone-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0 dark:divide-stone-800 dark:border-stone-800">
        <div className="flex items-center justify-between gap-3 p-4 sm:block">
          <span className={eyebrowClassName}>Servings</span>
          <div className="flex items-center gap-2 sm:mt-2">
            <button type="button" onClick={() => stepServings(-1)} disabled={servings <= 1} aria-label="Fewer servings" className="flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 text-stone-600 hover:bg-stone-100 disabled:opacity-40 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800">
              <Minus className="h-4 w-4" strokeWidth={2} />
            </button>
            <input
              value={draft.servings}
              onChange={(e) => setDraft({ ...draft, servings: e.target.value.replace(/[^\d]/g, '') })}
              inputMode="numeric"
              placeholder="—"
              aria-label="Servings"
              className="w-10 bg-transparent text-center text-xl font-semibold tabular-nums text-stone-900 placeholder:text-stone-400 focus:outline-none dark:text-stone-100"
            />
            <button type="button" onClick={() => stepServings(1)} aria-label="More servings" className="flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800">
              <Plus className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        </div>
        <label className="flex items-center justify-between gap-3 p-4 sm:block">
          <span className={eyebrowClassName}>Total time</span>
          <span className="flex items-center gap-2 sm:mt-2">
            <Clock className="h-5 w-5 text-stone-400" strokeWidth={1.75} aria-hidden="true" />
            <input
              value={draft.totalTimeMinutes}
              onChange={(e) => setDraft({ ...draft, totalTimeMinutes: e.target.value.replace(/[^\d]/g, '') })}
              inputMode="numeric"
              placeholder="—"
              className="w-14 bg-transparent text-right text-xl font-semibold tabular-nums text-stone-900 placeholder:text-stone-400 focus:outline-none sm:text-left dark:text-stone-100"
            />
            <span className="text-sm text-stone-500">min</span>
          </span>
        </label>
      </div>
    </div>
  )

  const nutritionFields = [
    ['caloriesKcal', 'Calories', 'kcal'],
    ['proteinGrams', 'Protein', 'g'],
    ['carbsGrams', 'Carbs', 'g'],
    ['fatGrams', 'Fat', 'g'],
  ] as const

  const detailsPanel = (
    <div className="space-y-5">
      <section>
        <h2 className={cx(eyebrowClassName, 'mb-2 px-1')}>Nutrition per serving</h2>
        <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-stone-200 dark:border-stone-800">
          {nutritionFields.map(([key, label, unit], index) => (
            <label
              key={key}
              className={cx(
                'block border-stone-200 p-3 focus-within:bg-stone-50 dark:border-stone-800 dark:focus-within:bg-stone-900/40',
                index % 2 === 0 && 'border-r',
                index < 2 && 'border-b'
              )}
            >
              <span className="text-xs text-stone-500 dark:text-stone-400">{label}</span>
              <span className="mt-0.5 flex items-baseline gap-1">
                <input
                  value={draft[key]}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                  inputMode="decimal"
                  placeholder="—"
                  className="w-full min-w-0 bg-transparent text-lg font-semibold tabular-nums text-stone-900 placeholder:text-stone-400 focus:outline-none dark:text-stone-100"
                />
                <span className="text-xs text-stone-500">{unit}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section>
        <h2 className={cx(eyebrowClassName, 'mb-2 px-1')}>Tags</h2>
        <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-stone-200 p-2 focus-within:ring-2 focus-within:ring-emerald-500/30 dark:border-stone-800">
          {tags.map((tag) => (
            <span key={tag} className="animate-pop-in inline-flex h-8 items-center gap-1 rounded-full bg-emerald-50 pl-3 pr-1 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
              {tag}
              <button type="button" onClick={() => setTags(tags.filter((t) => t !== tag))} aria-label={`Remove ${tag}`} className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-emerald-100 dark:hover:bg-emerald-900/50">
                <X className="h-3 w-3" strokeWidth={2} />
              </button>
            </span>
          ))}
          <input
            value={tagInput}
            onChange={(e) => (e.target.value.endsWith(',') ? (setTagInput(e.target.value), commitTag()) : setTagInput(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitTag() }
              else if (e.key === 'Backspace' && !tagInput && tags.length) setTags(tags.slice(0, -1))
            }}
            onBlur={commitTag}
            placeholder={tags.length ? 'Add tag' : 'Weeknight, Vegetarian…'}
            aria-label="Add a tag"
            className="h-8 min-w-24 flex-1 bg-transparent px-2 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none dark:text-stone-100"
          />
        </div>
      </section>

      <section>
        <h2 className={cx(eyebrowClassName, 'mb-2 px-1')}>Source</h2>
        <label className="flex items-center gap-3 rounded-2xl border border-stone-200 px-4 focus-within:ring-2 focus-within:ring-emerald-500/30 dark:border-stone-800">
          <Link2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} aria-hidden="true" />
          <input
            value={draft.sourceUrl}
            onChange={(e) => setDraft({ ...draft, sourceUrl: e.target.value })}
            placeholder="Paste a link (optional)"
            inputMode="url"
            aria-label="Source URL"
            className="h-12 w-full bg-transparent text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none dark:text-stone-100"
          />
        </label>
      </section>
    </div>
  )

  const basicsPanel = (
    <div className="space-y-5">
      {heroCard}
      {isModal && detailsPanel}
    </div>
  )

  const linkedCount = draft.ingredients.filter((i) => i.mappingLabel.trim()).length

  const ingredientsPanel = (
    <section>
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className={eyebrowClassName}>Ingredients{draft.ingredients.length ? ` · ${draft.ingredients.length}` : ''}</h2>
        {draft.ingredients.length > 0 && (
          <span className="text-xs text-stone-500 dark:text-stone-400">{linkedCount} linked to pantry</span>
        )}
      </div>
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900/40">
        {draft.ingredients.length > 0 && (
          <ul className="divide-y divide-stone-200 border-b border-stone-200 dark:divide-stone-800 dark:border-stone-800">
            {draft.ingredients.map((ing) => (
              <IngredientRow
                key={ing.id}
                ingredient={ing}
                pantry={pantry}
                onChange={(patch) => updateIngredient(ing.id, patch)}
                onRemove={() => setDraft((d) => ({ ...d, ingredients: d.ingredients.filter((x) => x.id !== ing.id) }))}
              />
            ))}
          </ul>
        )}
        <IngredientComposer
          pantry={pantry}
          onAddPantryItem={onAddPantryItem}
          onAddToShoppingList={onAddToShoppingList}
          onAdd={(ing) =>
            setDraft((d) => ({ ...d, ingredients: [...d.ingredients, { id: newId('ing'), note: '', ...ing }] }))
          }
        />
      </div>
    </section>
  )

  const addStep = (afterId?: string) =>
    setDraft((d) => {
      const step = { id: newId('st'), text: '' }
      const index = afterId ? d.steps.findIndex((x) => x.id === afterId) + 1 : d.steps.length
      const steps = [...d.steps.slice(0, index), step, ...d.steps.slice(index)]
      // Focus the new step once it renders.
      requestAnimationFrame(() => document.getElementById(`step-${step.id}`)?.focus())
      return { ...d, steps }
    })

  const stepsPanel = (
    <section>
      <h2 className={cx(eyebrowClassName, 'mb-2 px-1')}>Steps{draft.steps.length ? ` · ${draft.steps.length}` : ''}</h2>
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900/40">
        {draft.steps.length > 0 && (
          <ol className="divide-y divide-stone-200 border-b border-stone-200 dark:divide-stone-800 dark:border-stone-800">
            {draft.steps.map((st, idx) => (
              <li key={st.id} className="animate-rise-in group flex items-start gap-3 px-4 py-3 focus-within:bg-stone-50 dark:focus-within:bg-stone-900/40">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
                  {idx + 1}
                </span>
                <textarea
                  id={`step-${st.id}`}
                  value={st.text}
                  onChange={(e) => setDraft((d) => ({ ...d, steps: d.steps.map((x) => (x.id === st.id ? { ...x, text: e.target.value } : x)) }))}
                  onKeyDown={(e) => {
                    // Enter starts the next step; Shift+Enter keeps a line break.
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addStep(st.id) }
                  }}
                  rows={Math.max(1, Math.ceil(st.text.length / 70))}
                  placeholder="Describe this step"
                  aria-label={`Step ${idx + 1}`}
                  className="min-h-7 w-full resize-none bg-transparent py-0.5 text-base leading-6 text-stone-900 placeholder:text-stone-400 focus:outline-none dark:text-stone-100"
                />
                <button
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, steps: d.steps.filter((x) => x.id !== st.id) }))}
                  aria-label={`Remove step ${idx + 1}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-stone-400 hover:bg-rose-50 hover:text-rose-600 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 dark:hover:bg-rose-950/30"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ol>
        )}
        <button
          type="button"
          onClick={() => addStep()}
          className="flex min-h-14 w-full items-center gap-3 px-4 text-left text-base text-stone-500 hover:bg-stone-50 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-900/40 dark:hover:text-stone-200"
        >
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          {draft.steps.length ? 'Add another step' : 'Add the first step'}
        </button>
      </div>
    </section>
  )

  const notesPanel = (
    <section>
      <h2 className={cx(eyebrowClassName, 'mb-2 px-1')}>Notes</h2>
      <textarea
        value={draft.notes}
        onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
        placeholder="Substitutions, timing, what you’d change next time…"
        aria-label="Notes"
        className="min-h-32 w-full rounded-2xl border border-stone-200 bg-transparent p-4 text-base text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-stone-800 dark:text-stone-100"
      />
    </section>
  )

  const pageBody = (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {heroCard}
        {ingredientsPanel}
        {stepsPanel}
      </div>
      <div className="space-y-6 lg:col-span-1">
        {detailsPanel}
        {notesPanel}
      </div>
    </div>
  )

  const modalBody = (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5">
      {tab === 'basics' ? basicsPanel : tab === 'ingredients' ? ingredientsPanel : tab === 'steps' ? stepsPanel : notesPanel}
    </div>
  )

  return (
    <div className={cx(isModal ? 'h-full flex flex-col bg-transparent' : 'min-h-screen bg-stone-50 dark:bg-stone-950')}>
      {isModal ? (
        <>
          <div className="sticky top-0 z-10">{header}</div>
          {modalBody}
        </>
      ) : (
        <div className="px-4 py-5 sm:px-6 sm:py-6">
          <div className="mx-auto max-w-5xl space-y-5">
            {header}
            {pageBody}
          </div>
        </div>
      )}
    </div>
  )
}
