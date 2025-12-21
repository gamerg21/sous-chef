'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import type { PantrySnapshotItem, Recipe, RecipeIngredient, RecipeStep, RecipeVisibility } from './types'
import { cx } from './utils'

export interface RecipeEditorDraft {
  title: string
  description: string
  tags: string
  visibility: RecipeVisibility
  servings: string
  totalTimeMinutes: string
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
  onSave?: (next: Recipe) => void
}

type EditorTab = 'basics' | 'ingredients' | 'steps' | 'notes'

function toDraft(recipe: Recipe | null | undefined): RecipeEditorDraft {
  const r = recipe
  return {
    title: r?.title ?? '',
    description: r?.description ?? '',
    tags: (r?.tags ?? []).join(', '),
    visibility: r?.visibility ?? 'private',
    servings: typeof r?.servings === 'number' ? `${r.servings}` : '',
    totalTimeMinutes: typeof r?.totalTimeMinutes === 'number' ? `${r.totalTimeMinutes}` : '',
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

  const ingredients: RecipeIngredient[] = draft.ingredients
    .filter((i) => i.name.trim())
    .map((i) => ({
      id: i.id,
      name: i.name.trim(),
      quantity: i.quantity.trim() ? Number(i.quantity) : undefined,
      unit: i.unit.trim() ? (i.unit.trim() as any) : undefined,
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

export function RecipeEditorView(props: RecipeEditorViewProps) {
  const { recipe, pantrySnapshot = [], layout = 'page', onBack, onCancel, onSave } = props
  const isModal = layout === 'modal'

  const pantryNames = useMemo(() => pantrySnapshot.map((p) => p.name).sort((a, b) => a.localeCompare(b)), [pantrySnapshot])

  const [draft, setDraft] = useState<RecipeEditorDraft>(() => toDraft(recipe))
  const [tab, setTab] = useState<EditorTab>('basics')

  useEffect(() => {
    setDraft(toDraft(recipe))
    setTab('basics')
  }, [recipe?.id])

  const titleEmpty = !draft.title.trim()

  const tabs: Array<{ id: EditorTab; label: string }> = [
    { id: 'basics', label: 'Basics' },
    { id: 'ingredients', label: 'Ingredients' },
    { id: 'steps', label: 'Steps' },
    { id: 'notes', label: 'Notes' },
  ]

  const header = (
    <div className={cx(isModal ? 'p-4 sm:p-5 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950' : '')}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {(onBack || onCancel) && (
            <button
              type="button"
              onClick={() => (onBack ? onBack() : onCancel?.())}
              className="inline-flex items-center gap-2 text-sm text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
            >
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              {isModal ? 'Close' : 'Back'}
            </button>
          )}
          <h1 className={cx('mt-2 font-semibold text-stone-900 dark:text-stone-100', isModal ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl')}>
            {recipe ? 'Edit recipe' : 'New recipe'}
          </h1>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
            Keep it fast: title, ingredients, steps — mapping is optional and can be refined later.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-100 text-sm font-medium hover:bg-stone-50 dark:hover:bg-stone-900/60 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave?.(fromDraft(recipe, draft))}
            className={cx(
              'inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
              titleEmpty ? 'bg-emerald-600/50 text-white cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-700'
            )}
            disabled={titleEmpty}
          >
            Save
          </button>
        </div>
      </div>

      {isModal && (
        <div className="mt-4">
          <div className="inline-flex rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/30 p-1">
            {tabs.map((t) => {
              const active = t.id === tab
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cx(
                    'px-3 py-1.5 text-sm rounded-md transition-colors',
                    active
                      ? 'bg-white text-stone-900 dark:bg-stone-950 dark:text-stone-100 shadow-sm'
                      : 'text-stone-700 dark:text-stone-200 hover:bg-white/60 dark:hover:bg-stone-950/40'
                  )}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )

  const basicsPanel = (
    <div className="space-y-4">
      <div className={cx('rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 p-4', isModal && 'shadow-none')}>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-900 dark:text-stone-100">Title</label>
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="e.g., Tomato Rice"
              className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-900 dark:text-stone-100">Description</label>
            <textarea
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="Optional short description"
              className="min-h-20 w-full rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 px-3 py-2 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-900 dark:text-stone-100">Servings</label>
              <input
                value={draft.servings}
                onChange={(e) => setDraft({ ...draft, servings: e.target.value })}
                inputMode="numeric"
                placeholder="2"
                className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-900 dark:text-stone-100">Time (min)</label>
              <input
                value={draft.totalTimeMinutes}
                onChange={(e) => setDraft({ ...draft, totalTimeMinutes: e.target.value })}
                inputMode="numeric"
                placeholder="30"
                className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-900 dark:text-stone-100">Visibility</label>
              <select
                value={draft.visibility}
                onChange={(e) => setDraft({ ...draft, visibility: e.target.value as RecipeVisibility })}
                className="h-10 w-full rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 px-3 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              >
                <option value="private">Private</option>
                <option value="household">Household</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-900 dark:text-stone-100">Tags</label>
            <input
              value={draft.tags}
              onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
              placeholder="Comma-separated (e.g., Weeknight, Vegetarian)"
              className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-900 dark:text-stone-100">Source URL</label>
            <input
              value={draft.sourceUrl}
              onChange={(e) => setDraft({ ...draft, sourceUrl: e.target.value })}
              placeholder="Optional"
              className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>
        </div>
      </div>
    </div>
  )

  const ingredientsPanel = (
    <div
      className={cx(
        'rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 p-4 flex flex-col min-h-0',
        isModal && 'h-full'
      )}
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Ingredients</h2>
          <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">Quantity + unit optional. Mapping optional.</p>
        </div>
        <button
          type="button"
          onClick={() =>
            setDraft((d) => ({
              ...d,
              ingredients: [
                ...d.ingredients,
                { id: `ing_${Math.random().toString(16).slice(2)}`, name: '', quantity: '', unit: '', note: '', mappingLabel: '' },
              ],
            }))
          }
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-100 text-sm font-medium hover:bg-stone-50 dark:hover:bg-stone-900/60 transition-colors"
        >
          <Plus className="w-4 h-4" strokeWidth={1.75} />
          Add
        </button>
      </div>

      <div className={cx('mt-3 space-y-3', isModal && 'flex-1 overflow-y-auto pr-1 min-h-0')}>
        {draft.ingredients.length === 0 ? (
          <div className="text-sm text-stone-600 dark:text-stone-400">No ingredients yet.</div>
        ) : (
          draft.ingredients.map((ing, idx) => (
            <div key={ing.id} className="rounded-md border border-stone-200 dark:border-stone-800 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="text-xs text-stone-500 dark:text-stone-500">Ingredient {idx + 1}</div>
                <button
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, ingredients: d.ingredients.filter((x) => x.id !== ing.id) }))}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900/60 transition-colors"
                  aria-label="Remove ingredient"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                </button>
              </div>

              <div className="mt-2 grid grid-cols-1 sm:grid-cols-6 gap-2">
                <input
                  value={ing.name}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      ingredients: d.ingredients.map((x) => (x.id === ing.id ? { ...x, name: e.target.value } : x)),
                    }))
                  }
                  placeholder="Name"
                  className="sm:col-span-3 w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
                <input
                  value={ing.quantity}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      ingredients: d.ingredients.map((x) => (x.id === ing.id ? { ...x, quantity: e.target.value } : x)),
                    }))
                  }
                  placeholder="Qty"
                  inputMode="decimal"
                  className="sm:col-span-1 w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
                <input
                  value={ing.unit}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      ingredients: d.ingredients.map((x) => (x.id === ing.id ? { ...x, unit: e.target.value } : x)),
                    }))
                  }
                  placeholder="Unit"
                  className="sm:col-span-2 w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
                <input
                  value={ing.note}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      ingredients: d.ingredients.map((x) => (x.id === ing.id ? { ...x, note: e.target.value } : x)),
                    }))
                  }
                  placeholder="Note (optional)"
                  className="sm:col-span-6 w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />

                <div className="sm:col-span-6">
                  <div className="text-xs text-stone-500 dark:text-stone-500 mb-1">Map to inventory item (optional)</div>
                  <input
                    list="pantry-items"
                    value={ing.mappingLabel}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        ingredients: d.ingredients.map((x) => (x.id === ing.id ? { ...x, mappingLabel: e.target.value } : x)),
                      }))
                    }
                    placeholder="Start typing…"
                    className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )

  const stepsPanel = (
    <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Steps</h2>
          <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">One sentence per step works great.</p>
        </div>
        <button
          type="button"
          onClick={() =>
            setDraft((d) => ({
              ...d,
              steps: [...d.steps, { id: `st_${Math.random().toString(16).slice(2)}`, text: '' }],
            }))
          }
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-100 text-sm font-medium hover:bg-stone-50 dark:hover:bg-stone-900/60 transition-colors"
        >
          <Plus className="w-4 h-4" strokeWidth={1.75} />
          Add
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {draft.steps.length === 0 ? (
          <div className="text-sm text-stone-600 dark:text-stone-400">No steps yet.</div>
        ) : (
          draft.steps.map((st, idx) => (
            <div key={st.id} className="flex gap-2">
              <div className="shrink-0 w-8 h-10 rounded-md bg-stone-100 dark:bg-stone-900/60 text-stone-700 dark:text-stone-200 flex items-center justify-center text-xs font-medium">
                {idx + 1}
              </div>
              <input
                value={st.text}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, steps: d.steps.map((x) => (x.id === st.id ? { ...x, text: e.target.value } : x)) }))
                }
                placeholder="Step text"
                className="flex-1 px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
              <button
                type="button"
                onClick={() => setDraft((d) => ({ ...d, steps: d.steps.filter((x) => x.id !== st.id) }))}
                className="h-10 w-10 inline-flex items-center justify-center rounded-md border border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900/60 transition-colors"
                aria-label="Remove step"
              >
                <Trash2 className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )

  const notesPanel = (
    <div className="space-y-4">
      <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 p-4">
        <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Notes</h2>
        <textarea
          value={draft.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          placeholder="Optional notes (substitutions, timing, etc.)"
          className="mt-2 min-h-40 w-full rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 px-3 py-2 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        />
      </div>

      <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950/40 p-4">
        <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Mapping tips</h2>
        <ul className="mt-2 space-y-2 text-sm text-stone-700 dark:text-stone-300 list-disc pl-5">
          <li>
            Map ingredients to the <span className="font-mono text-xs">inventory item label</span> you want to match later.
          </li>
          <li>Keep mapping loose; you can refine with a data model later.</li>
          <li>This editor is preview-only; nothing is persisted in Design OS.</li>
        </ul>
      </div>
    </div>
  )

  const pageBody = (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        {basicsPanel}
        {ingredientsPanel}
        {stepsPanel}
      </div>
      <div className="lg:col-span-1 space-y-4">{notesPanel}</div>
    </div>
  )

  const modalBody = (
    <div className="flex-1 min-h-0 overflow-hidden">
      {tab === 'basics' ? (
        <div className="h-full overflow-y-auto p-4 sm:p-5">{basicsPanel}</div>
      ) : tab === 'ingredients' ? (
        <div className="h-full min-h-0 overflow-y-auto p-4 sm:p-5">{ingredientsPanel}</div>
      ) : tab === 'steps' ? (
        <div className="h-full overflow-y-auto p-4 sm:p-5">{stepsPanel}</div>
      ) : (
        <div className="h-full overflow-y-auto p-4 sm:p-5">{notesPanel}</div>
      )}
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
          <div className="max-w-4xl mx-auto space-y-5">
            {header}
            {pageBody}
            <datalist id="pantry-items">
              {pantryNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
        </div>
      )}

      {isModal && (
        <datalist id="pantry-items">
          {pantryNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      )}
    </div>
  )
}

