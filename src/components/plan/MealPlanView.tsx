'use client'

import { useMemo, useState } from 'react'
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Play, Plus, Search, ShoppingCart, Trash2, Users } from 'lucide-react'
import type { CookingPlan } from '@/lib/cooking-plan'
import { unitLabel } from '@/lib/units'
import { Collapse } from '../ui/collapse'
import { bucketForMissingCount, computeRecipeCookability, titleCaseBucket } from '../cooking/utils'
import {
  bareInputClassName,
  buttonClassName,
  cardClassName,
  cx,
  EmptyState,
  eyebrowClassName,
  fieldClassName,
  headingFont,
  heroCardClassName,
  iconButtonClassName,
  optionClassName,
  PageContainer,
  PageHeader,
  Pill,
  rowsClassName,
  Section,
  SegmentedControl,
  Stat,
  type Tone,
} from '../ui/kit'
import { ServingsStepper, slotOptions } from './AddToPlanForm'
import { dayKey, formatDay, slotLabels, weekDays, weekTitle, type MealSlot } from './dates'

export interface PlannedMeal {
  id: string
  date: string
  slot: MealSlot
  recipeId: string
  recipeTitle: string
  recipeServings?: number
  totalTimeMinutes?: number
  servings?: number
  note?: string
  cooked: boolean
  plan?: CookingPlan
}

export interface PlanRecipeOption {
  id: string
  title: string
  servings?: number
  favorited?: boolean
}

export interface WeekShortages {
  meals: number
  missingIngredients: CookingPlan['missingIngredients']
  checks: CookingPlan['checks']
}

export interface MealPlanViewProps {
  weekStart: string
  entries: PlannedMeal[]
  recipes: PlanRecipeOption[]
  shortages?: WeekShortages
  addingShortages?: boolean
  onChangeWeek: (direction: -1 | 0 | 1) => void
  onAddMeal: (values: { date: string; slot: MealSlot; recipeId: string; servings?: number }) => Promise<void>
  onUpdateMeal: (id: string, patch: { slot?: MealSlot; servings?: number; note?: string | null; cooked?: boolean }) => Promise<void>
  onRemoveMeal: (id: string) => Promise<void>
  onCookMeal: (meal: PlannedMeal) => void
  onOpenRecipe: (recipeId: string) => void
  onAddShortages: () => void
}

const bucketTone: Record<ReturnType<typeof bucketForMissingCount>, Tone> = { 'cook-now': 'success', almost: 'warning', missing: 'neutral' }

function amount(quantity?: number, unit?: string) {
  if (quantity == null) return unit ?? ''
  const value = Number(quantity.toPrecision(4))
  return [value, unitLabel(unit, value)].filter((part) => part !== '').join(' ')
}

export function MealPlanView(props: MealPlanViewProps) {
  const { weekStart, entries, shortages, addingShortages, onChangeWeek, onAddShortages } = props
  const today = dayKey(new Date())
  const days = weekDays(weekStart)
  const [showShortages, setShowShortages] = useState(false)

  const byDay = useMemo(() => {
    const map = new Map<string, PlannedMeal[]>()
    for (const entry of entries) map.set(entry.date, [...(map.get(entry.date) ?? []), entry])
    return map
  }, [entries])

  const open = entries.filter((entry) => !entry.cooked)
  const ready = open.filter((entry) => entry.plan && computeRecipeCookability([], [], entry.plan).missingCount === 0).length
  const shortCount = shortages?.missingIngredients.length ?? 0
  const isCurrentWeek = weekTitle(weekStart) === 'This week'

  return (
    <PageContainer width="5xl">
      <PageHeader
        eyebrow="Meal plan"
        title={weekTitle(weekStart)}
        description={`${formatDay(days[0], { day: 'numeric', month: 'short' })} – ${formatDay(days[6], { day: 'numeric', month: 'short', year: 'numeric' })}. Plan meals, see what the pantry covers, and shop once for the week.`}
        actions={
          <>
            {!isCurrentWeek && (
              <button type="button" onClick={() => onChangeWeek(0)} className={buttonClassName('ghost')}>
                This week
              </button>
            )}
            <div className="flex items-center rounded-full border border-stone-200 dark:border-stone-800">
              <button type="button" onClick={() => onChangeWeek(-1)} aria-label="Previous week" className={iconButtonClassName}>
                <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
              </button>
              <button type="button" onClick={() => onChangeWeek(1)} aria-label="Next week" className={iconButtonClassName}>
                <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
          </>
        }
      />

      <div className={cx(cardClassName, 'grid grid-cols-3 divide-x divide-stone-200 dark:divide-stone-800')}>
        <Stat label="Planned" value={entries.length} />
        <Stat label="Ready to cook" value={`${ready} of ${open.length}`} />
        <Stat label="Cooked" value={entries.length - open.length} />
      </div>

      <section className={cx(heroCardClassName, 'overflow-hidden')} aria-labelledby="week-shopping">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 id="week-shopping" className={eyebrowClassName}>Shopping for the week</h2>
            <p className="mt-1 text-base font-semibold text-stone-900 dark:text-stone-100" style={headingFont}>
              {!shortages ? 'Checking your pantry…' : shortages.meals === 0 ? 'No meals left to shop for' : shortCount === 0 ? 'Your pantry covers every planned meal' : `${shortCount} item${shortCount === 1 ? '' : 's'} short across ${shortages.meals} meal${shortages.meals === 1 ? '' : 's'}`}
            </p>
            {shortages && shortages.checks.length > 0 && (
              <p className="mt-0.5 text-sm text-stone-600 dark:text-stone-400">{shortages.checks.length} ingredient{shortages.checks.length === 1 ? '' : 's'} need an amount or unit check by hand.</p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {shortCount > 0 && (
              <button type="button" onClick={() => setShowShortages((value) => !value)} aria-expanded={showShortages} className={buttonClassName('ghost')}>
                {showShortages ? 'Hide' : 'Show'} list
                <ChevronDown className={cx('h-4 w-4 transition-transform duration-300', showShortages && 'rotate-180')} strokeWidth={1.75} />
              </button>
            )}
            <button type="button" onClick={onAddShortages} disabled={!shortCount || addingShortages} className={buttonClassName('primary')}>
              <ShoppingCart className="h-4 w-4" strokeWidth={1.75} />
              {addingShortages ? 'Adding…' : "Add week's shortages to list"}
            </button>
          </div>
        </div>
        <Collapse open={showShortages && shortCount > 0}>
          <ul className={cx(rowsClassName, 'border-t border-stone-200 dark:border-stone-800')}>
            {shortages?.missingIngredients.map((item, index) => (
              <li key={`${index}-${item.name}-${item.unit}`} className="flex min-h-11 items-center justify-between gap-3 px-4 py-2 text-sm">
                <span className="text-stone-900 dark:text-stone-100">{item.name}</span>
                <span className="tabular-nums text-stone-500 dark:text-stone-400">{amount(item.quantity, item.unit) || 'Amount not set'}</span>
              </li>
            ))}
          </ul>
        </Collapse>
      </section>

      <div className="space-y-5">
        {days.map((day) => (
          <DaySection key={day} day={day} isToday={day === today} isPast={day < today} meals={byDay.get(day) ?? []} {...props} />
        ))}
      </div>
    </PageContainer>
  )
}

function DaySection({ day, isToday, isPast, meals, recipes, onAddMeal, ...handlers }: MealPlanViewProps & { day: string; isToday: boolean; isPast: boolean; meals: PlannedMeal[] }) {
  const [adding, setAdding] = useState(false)
  const title = (
    <span className="inline-flex items-center gap-2">
      {formatDay(day, { weekday: 'long', day: 'numeric', month: 'short' })}
      {isToday && <Pill tone="success">Today</Pill>}
    </span>
  )
  return (
    <Section title={title} aside={meals.length ? `${meals.length} meal${meals.length === 1 ? '' : 's'}` : undefined}>
      <div className={cx(cardClassName, 'overflow-hidden', isPast && !isToday && 'opacity-80')}>
        {meals.length > 0 && (
          <ul className={rowsClassName}>
            {meals.map((meal) => <MealRow key={meal.id} meal={meal} {...handlers} />)}
          </ul>
        )}
        <button
          type="button"
          onClick={() => setAdding((value) => !value)}
          aria-expanded={adding}
          className={cx('flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm font-medium text-emerald-700 hover:bg-stone-50 dark:text-emerald-300 dark:hover:bg-stone-900/60', meals.length > 0 && 'border-t border-stone-200 dark:border-stone-800')}
        >
          <Plus className={cx('h-4 w-4 transition-transform duration-300', adding && 'rotate-45')} strokeWidth={2} aria-hidden="true" />
          {adding ? 'Close' : meals.length ? 'Add another meal' : 'Plan a meal'}
        </button>
        <Collapse open={adding}>
          <RecipePicker
            active={adding}
            recipes={recipes}
            onPick={async (recipe, slot, servings) => {
              await onAddMeal({ date: day, slot, recipeId: recipe.id, servings })
              setAdding(false)
            }}
          />
        </Collapse>
      </div>
    </Section>
  )
}

function MealRow({ meal, onUpdateMeal, onRemoveMeal, onCookMeal, onOpenRecipe }: Pick<MealPlanViewProps, 'onUpdateMeal' | 'onRemoveMeal' | 'onCookMeal' | 'onOpenRecipe'> & { meal: PlannedMeal }) {
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState(meal.note ?? '')
  const cookability = meal.plan ? computeRecipeCookability([], [], meal.plan) : null
  const bucket = cookability ? bucketForMissingCount(cookability.missingCount) : null
  const servings = meal.servings ?? meal.recipeServings

  return (
    <li>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={eyebrowClassName}>{slotLabels[meal.slot]}</span>
            {meal.cooked ? (
              <Pill tone="success"><Check className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />Cooked</Pill>
            ) : bucket ? (
              <Pill tone={bucketTone[bucket]}>{titleCaseBucket(bucket)}</Pill>
            ) : null}
          </div>
          <button type="button" onClick={() => onOpenRecipe(meal.recipeId)} className={cx('mt-0.5 block max-w-full truncate text-left text-base font-semibold tracking-tight hover:underline', meal.cooked ? 'text-stone-500 dark:text-stone-400' : 'text-stone-900 dark:text-stone-100')} style={headingFont}>
            {meal.recipeTitle}
          </button>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
            {servings != null && <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />{servings} serving{servings === 1 ? '' : 's'}</span>}
            {meal.totalTimeMinutes != null && <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />{meal.totalTimeMinutes} min</span>}
            {meal.note && <span className="truncate">{meal.note}</span>}
          </div>
          {!meal.cooked && cookability && cookability.missingCount > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Missing ingredients">
              {cookability.missingLabels.slice(0, 3).map((label, index) => (
                <li key={`${index}-${label}`} className="rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{label}</li>
              ))}
              {cookability.missingCount > 3 && <li className="rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-600 dark:bg-stone-800/70 dark:text-stone-300">+{cookability.missingCount - 3} more</li>}
            </ul>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!meal.cooked && meal.plan && (
            <button type="button" onClick={() => onCookMeal(meal)} className={buttonClassName('primary', 'sm')}>
              <Play className="h-3.5 w-3.5" strokeWidth={2} fill="currentColor" aria-hidden="true" />
              Cook
            </button>
          )}
          <button type="button" onClick={() => setEditing((value) => !value)} aria-expanded={editing} aria-label={`Edit ${meal.recipeTitle}`} className={iconButtonClassName}>
            <ChevronDown className={cx('h-4 w-4 transition-transform duration-300', editing && 'rotate-180')} strokeWidth={1.75} />
          </button>
        </div>
      </div>
      <Collapse open={editing}>
        <div className="space-y-3 border-t border-stone-200 bg-stone-50/60 p-4 dark:border-stone-800 dark:bg-stone-900/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SegmentedControl label="Meal" value={meal.slot} onChange={(slot) => void onUpdateMeal(meal.id, { slot })} options={slotOptions} className="max-w-full overflow-x-auto" />
            {servings != null && <ServingsStepper value={servings} onChange={(value) => void onUpdateMeal(meal.id, { servings: value })} />}
          </div>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onBlur={() => { if (note.trim() !== (meal.note ?? '')) void onUpdateMeal(meal.id, { note: note.trim() || null }) }}
            maxLength={500}
            placeholder="Add a note, e.g. double batch for lunches"
            aria-label="Note"
            className={cx(bareInputClassName, 'min-h-11 rounded-xl border border-stone-200 bg-white px-3 dark:border-stone-700 dark:bg-stone-950')}
          />
          <div className="flex flex-wrap justify-between gap-2">
            <button type="button" onClick={() => void onUpdateMeal(meal.id, { cooked: !meal.cooked })} className={buttonClassName('secondary', 'sm')}>
              <Check className="h-4 w-4" strokeWidth={1.75} />
              {meal.cooked ? 'Mark not cooked' : 'Mark cooked without using the pantry'}
            </button>
            <button type="button" onClick={() => void onRemoveMeal(meal.id)} className={cx(buttonClassName('ghost', 'sm'), 'text-rose-700 dark:text-rose-300')}>
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
              Remove
            </button>
          </div>
        </div>
      </Collapse>
    </li>
  )
}

function RecipePicker({ active, recipes, onPick }: { active: boolean; recipes: PlanRecipeOption[]; onPick: (recipe: PlanRecipeOption, slot: MealSlot, servings?: number) => Promise<void> }) {
  const [query, setQuery] = useState('')
  const [slot, setSlot] = useState<MealSlot>('dinner')
  const [saving, setSaving] = useState<string | null>(null)
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? recipes.filter((recipe) => recipe.title.toLowerCase().includes(q)) : recipes
    return [...list].sort((a, b) => Number(!!b.favorited) - Number(!!a.favorited)).slice(0, 8)
  }, [recipes, query])

  if (!recipes.length) {
    return <div className="border-t border-stone-200 dark:border-stone-800"><EmptyState icon={CalendarDays} title="No recipes yet" description="Add recipes first, then plan them here." /></div>
  }
  return (
    <div className="space-y-3 border-t border-stone-200 p-4 dark:border-stone-800">
      <SegmentedControl label="Meal" value={slot} onChange={setSlot} options={slotOptions} className="max-w-full overflow-x-auto" />
      <label className="relative block">
        <span className="sr-only">Search recipes</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" strokeWidth={1.75} aria-hidden="true" />
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search recipes…" className={cx(fieldClassName, 'pl-10')} tabIndex={active ? undefined : -1} />
      </label>
      <div className="space-y-1" role="list">
        {matches.map((recipe) => (
          <button
            key={recipe.id}
            type="button"
            role="listitem"
            disabled={saving !== null}
            onClick={async () => {
              setSaving(recipe.id)
              try { await onPick(recipe, slot, recipe.servings) } finally { setSaving(null) }
            }}
            className={optionClassName(saving === recipe.id)}
          >
            <Plus className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{recipe.title}</span>
            {recipe.servings != null && <span className="shrink-0 text-xs text-stone-500 dark:text-stone-400">Serves {recipe.servings}</span>}
          </button>
        ))}
        {matches.length === 0 && <p className="px-3 py-2 text-sm text-stone-500 dark:text-stone-400">No recipes match “{query}”.</p>}
      </div>
    </div>
  )
}
