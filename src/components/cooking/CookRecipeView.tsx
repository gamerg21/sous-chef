import { unitLabel } from '@/lib/units'
import { useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, ShoppingCart } from 'lucide-react'
import type { PantrySnapshotItem, Recipe, RecipeIngredient } from './types'
import { computeRecipeCookability, cx } from './utils'
import { buttonClassName, cardClassName, eyebrowClassName, headingFont, heroCardClassName, IconBadge, PageContainer, rowsClassName, Section, Stat, StatusDot, type Tone } from '../ui/kit'

export interface CookRecipeViewProps {
  recipe: Recipe
  pantrySnapshot: PantrySnapshotItem[]
  isCooking?: boolean
  onBack?: () => void
  onConfirmCook?: (options: { addMissingToList: boolean; acknowledgeManualChecks: boolean }) => void
}

const normalize = (value?: string) => (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
const round = (value: number) => Number(value.toPrecision(6))

function formatAmount(quantity?: number, unit?: string) {
  if (quantity == null || !Number.isFinite(quantity)) return unit ?? ''
  const amount = round(quantity)
  return [amount, unitLabel(unit, amount)].filter((part) => part !== '').join(' ')
}

/** Per-ingredient status for the checklist, from the cooking plan when it has loaded. */
function ingredientStatus(ingredient: RecipeIngredient, recipe: Recipe, pantry: PantrySnapshotItem[]): { tone: Tone; detail?: string } {
  const plan = recipe.plan
  const name = normalize(ingredient.name)
  if (plan) {
    const missing = plan.missingIngredients.find((item) => normalize(item.name) === name)
    if (missing) return { tone: 'danger', detail: missing.quantity != null ? `Short ${formatAmount(missing.quantity, missing.unit)}` : 'Not in your kitchen' }
    if (plan.checks.some((item) => normalize(item.name) === name)) return { tone: 'warning', detail: 'Check amount' }
    return { tone: 'success' }
  }
  const label = normalize(ingredient.mapping?.inventoryItemLabel || ingredient.name)
  return pantry.some((item) => normalize(item.name) === label) ? { tone: 'success' } : { tone: 'danger', detail: 'Not in your kitchen' }
}

export function CookRecipeView({ recipe, pantrySnapshot, onBack, onConfirmCook, isCooking = false }: CookRecipeViewProps) {
  const cookability = useMemo(() => computeRecipeCookability(recipe.ingredients, pantrySnapshot, recipe.plan), [recipe, pantrySnapshot])
  const [addMissingToList, setAddMissingToList] = useState(true)

  const [acknowledgeManualChecks, setAcknowledgeManualChecks] = useState(false)
  return (
    <PageContainer width="3xl">
      <button
        type="button"
        onClick={onBack}
        className="-ml-2 inline-flex min-h-10 items-center gap-2 rounded-full px-2 text-sm text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-100"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        Back
      </button>

      <header>
        <p className={cx(eyebrowClassName, 'mb-1')}>Cooking</p>
        <h1 className="text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl dark:text-stone-100" style={headingFont}>
          {recipe.title}
        </h1>
        {recipe.description ? <p className="mt-2 max-w-2xl text-base text-stone-600 dark:text-stone-400">{recipe.description}</p> : null}
      </header>

      <div className={cx(cardClassName, 'grid grid-cols-2 divide-x divide-stone-200 dark:divide-stone-800')}>
        <div>
          <Stat label="Fully covered" value={cookability.availableCount} />
          <p className="-mt-3 px-4 pb-4 text-xs text-stone-500 dark:text-stone-400">Ingredients covered by your stock</p>
        </div>
        <div>
          <Stat label="Needs review" value={cookability.missingCount} tone={cookability.missingCount ? 'warning' : undefined} />
          <p className="-mt-3 px-4 pb-4 text-xs text-stone-500 dark:text-stone-400">Shortages or unmeasured amounts</p>
        </div>
      </div>

      {!!recipe.steps?.length && (
        <Section title="Instructions">
          <ol className={cx(cardClassName, rowsClassName, 'stagger overflow-hidden')}>
            {recipe.steps.map((step, index) => (
              <li key={step.id} className="flex items-start gap-3 px-4 py-3.5">
                <span aria-hidden="true" className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold tabular-nums text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
                  {index + 1}
                </span>
                <span className="min-w-0 pt-0.5 text-base leading-relaxed text-stone-800 dark:text-stone-200">{step.text}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      <Section
        title="Ingredients"
        aside={cookability.missingCount === 0 ? <span className="font-medium text-emerald-700 dark:text-emerald-400">None to review — you&apos;re good to go.</span> : `${cookability.missingCount} to review`}
      >
        <div className={cx(cardClassName, 'overflow-hidden')}>
          {recipe.ingredients.length > 0 ? (
            <ul className={rowsClassName}>
              {recipe.ingredients.map((ingredient) => {
                const status = ingredientStatus(ingredient, recipe, pantrySnapshot)
                const amount = formatAmount(ingredient.quantity, ingredient.unit)
                return (
                  <li key={ingredient.id} className="flex min-h-12 items-center gap-3 px-4 py-2.5">
                    <StatusDot tone={status.tone} />
                    <span className="min-w-0 flex-1 text-sm text-stone-900 dark:text-stone-100">
                      {amount && <span className="font-medium tabular-nums">{amount} </span>}
                      {ingredient.name}
                      {ingredient.note && <span className="text-stone-500 dark:text-stone-400">, {ingredient.note}</span>}
                    </span>
                    {status.detail && (
                      <span className={cx('shrink-0 text-xs font-medium', status.tone === 'danger' ? 'text-rose-700 dark:text-rose-300' : 'text-amber-700 dark:text-amber-300')}>{status.detail}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : cookability.missingLabels.length > 0 ? (
            <ul className={rowsClassName}>
              {cookability.missingLabels.map((m, index) => (
                <li key={`${index}-${m}`} className="flex min-h-12 items-center gap-3 px-4 py-2.5 text-sm text-stone-700 dark:text-stone-300">
                  <StatusDot tone="warning" />
                  {m}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-4 text-sm text-stone-500 dark:text-stone-400">No ingredients listed.</p>
          )}
        </div>
      </Section>

      {recipe.plan && (
        <Section title="Inventory changes" aside="Confirm after cooking to apply these changes.">
          <div className={cx(cardClassName, rowsClassName, 'overflow-hidden text-sm')}>
            {recipe.plan.deductions.length ? (
              recipe.plan.deductions.map((item) => (
                <div key={item.id} className="flex min-h-12 items-center gap-3 px-4 py-2.5">
                  <StatusDot tone="success" />
                  <span className="min-w-0 flex-1 text-stone-900 dark:text-stone-100">
                    Use <span className="font-medium tabular-nums">{round(item.quantity)} {unitLabel(item.unit, item.quantity)}</span> {item.name}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-stone-500 dark:text-stone-400">
                    {round(item.remaining)} {unitLabel(item.unit, item.remaining)} left
                  </span>
                </div>
              ))
            ) : (
              <p className="px-4 py-3 text-stone-500 dark:text-stone-400">No measured stock will be deducted.</p>
            )}
            {recipe.plan.checks.map((item, index) => (
              <div key={index} className="flex items-start gap-3 bg-amber-50/60 px-4 py-2.5 text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                <span className="mt-1.5">
                  <StatusDot tone="warning" />
                </span>
                <p>
                  <span className="font-medium">{item.name}:</span> {item.reason}
                </p>
              </div>
            ))}
            {!!recipe.plan.checks.length && (
              <label className="flex min-h-12 cursor-pointer items-start gap-3 px-4 py-3 text-stone-800 dark:text-stone-200">
                <input type="checkbox" checked={acknowledgeManualChecks} onChange={(e) => setAcknowledgeManualChecks(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-600" />
                I checked these ingredients and will adjust any unmeasured stock myself.
              </label>
            )}
          </div>
        </Section>
      )}

      <div className={cx(heroCardClassName, 'flex flex-wrap items-center gap-3 p-4')}>
        <IconBadge icon={ShoppingCart} tone={addMissingToList ? 'success' : 'neutral'} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-stone-900 dark:text-stone-100">Shopping list</div>
          <div className="mt-0.5 text-sm text-stone-600 dark:text-stone-400">Add missing items so the household sees what to buy.</div>
        </div>
        <button
          type="button"
          aria-pressed={addMissingToList}
          onClick={() => setAddMissingToList((v) => !v)}
          className={cx(buttonClassName(addMissingToList ? 'soft' : 'secondary'), 'shrink-0')}
        >
          <ShoppingCart className="h-4 w-4" strokeWidth={1.75} />
          {addMissingToList ? 'Will add missing' : 'Do not add missing'}
        </button>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <button type="button" onClick={onBack} className={cx(buttonClassName('secondary'), 'min-h-11')}>
          Cancel
        </button>
        <button
          type="button"
          disabled={isCooking || !recipe.plan || (!!recipe.plan.checks.length && !acknowledgeManualChecks)}
          onClick={() => onConfirmCook?.({ addMissingToList, acknowledgeManualChecks })}
          className={cx(buttonClassName('primary'), 'min-h-11 px-5')}
        >
          <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} />
          {isCooking ? 'Updating kitchen…' : 'Confirm cook'}
        </button>
      </div>
    </PageContainer>
  )
}
