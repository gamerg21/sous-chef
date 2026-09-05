import { useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, ShoppingCart } from 'lucide-react'
import type { PantrySnapshotItem, Recipe } from './types'
import { computeRecipeCookability, cx } from './utils'

export interface CookRecipeViewProps {
  recipe: Recipe
  pantrySnapshot: PantrySnapshotItem[]
  isCooking?: boolean
  onBack?: () => void
  onConfirmCook?: (options: { addMissingToList: boolean; acknowledgeManualChecks: boolean }) => void
}

export function CookRecipeView({ recipe, pantrySnapshot, onBack, onConfirmCook, isCooking = false }: CookRecipeViewProps) {
  const cookability = useMemo(() => computeRecipeCookability(recipe.ingredients, pantrySnapshot, recipe.plan), [recipe, pantrySnapshot])
  const [addMissingToList, setAddMissingToList] = useState(true)

  const [acknowledgeManualChecks, setAcknowledgeManualChecks] = useState(false)
  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <div className="px-4 py-5 sm:px-6 sm:py-6">
        <div className="max-w-3xl mx-auto space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 text-sm font-medium text-stone-700 dark:text-stone-200 hover:text-stone-900 dark:hover:text-stone-100"
            >
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Back
            </button>
          </div>

          <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 p-5">
            <h1 className="text-xl sm:text-2xl font-semibold text-stone-900 dark:text-stone-100">{recipe.title}</h1>
            {recipe.description ? (
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{recipe.description}</p>
            ) : null}

            {!!recipe.steps?.length && <section className="mt-5"><h2 className="font-semibold">Instructions</h2><ol className="mt-3 list-decimal space-y-3 pl-5 text-sm">{recipe.steps.map(step => <li key={step.id} className="pl-1">{step.text}</li>)}</ol></section>}
            <p className="mt-4 text-sm text-stone-600 dark:text-stone-400">Confirm after cooking to apply these inventory changes.</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 p-4">
                <div className="text-xs uppercase tracking-wide text-emerald-800 dark:text-emerald-200">Fully covered</div>
                <div className="mt-2 text-2xl font-semibold text-stone-900 dark:text-stone-100">{cookability.availableCount}</div>
                <div className="mt-1 text-sm text-emerald-900/80 dark:text-emerald-200/80">Ingredients covered by your stock</div>
              </div>
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 p-4">
                <div className="text-xs uppercase tracking-wide text-amber-800 dark:text-amber-200">Needs review</div>
                <div className="mt-2 text-2xl font-semibold text-stone-900 dark:text-stone-100">{cookability.missingCount}</div>
                <div className="mt-1 text-sm text-amber-900/80 dark:text-amber-200/80">Shortages or unmeasured amounts</div>
              </div>
            </div>

            <div className="mt-4">
              <div className="text-sm font-medium text-stone-900 dark:text-stone-100">Ingredients to review</div>
              {cookability.missingCount === 0 ? (
                <div className="mt-2 text-sm text-stone-600 dark:text-stone-400">None — you&apos;re good to go.</div>
              ) : (
                <ul className="mt-2 space-y-2">
                  {cookability.missingLabels.map((m) => (
                    <li
                      key={m}
                      className="rounded-md border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/40 px-3 py-2 text-sm text-stone-700 dark:text-stone-300"
                    >
                      {m}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {recipe.plan && <div className="mt-4 space-y-2 text-sm">
              <h2 className="font-medium">Inventory changes</h2>
              {recipe.plan.deductions.length ? recipe.plan.deductions.map(item => <p key={item.id}>Use {Number(item.quantity.toPrecision(6))} {item.unit} {item.name} · {Number(item.remaining.toPrecision(6))} {item.unit} left</p>) : <p>No measured stock will be deducted.</p>}
              {recipe.plan.checks.map((item, index) => <p key={index} className="text-amber-800 dark:text-amber-200">{item.name}: {item.reason}</p>)}
              {!!recipe.plan.checks.length && <label className="flex items-start gap-3 py-3"><input type="checkbox" checked={acknowledgeManualChecks} onChange={e => setAcknowledgeManualChecks(e.target.checked)} className="mt-1 h-5 w-5" />I checked these ingredients and will adjust any unmeasured stock myself.</label>}
            </div>}

            <div className="mt-5 rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-stone-900 dark:text-stone-100">Shopping list</div>
                  <div className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                    Add missing items so the household sees what to buy.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAddMissingToList((v) => !v)}
                  className={cx(
                    'shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border transition-colors',
                    addMissingToList
                      ? 'border-emerald-700 bg-emerald-600 text-white hover:bg-emerald-700'
                      : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-100 hover:bg-stone-50 dark:hover:bg-stone-900/60'
                  )}
                >
                  <ShoppingCart className="w-4 h-4" strokeWidth={1.75} />
                  {addMissingToList ? 'Will add missing' : 'Do not add missing'}
                </button>
              </div>
            </div>

            <div className="mt-5 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-100 text-sm font-medium hover:bg-stone-50 dark:hover:bg-stone-900/60 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isCooking || !recipe.plan || (!!recipe.plan.checks.length && !acknowledgeManualChecks)}
                onClick={() => onConfirmCook?.({ addMissingToList, acknowledgeManualChecks })}
                className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" strokeWidth={1.75} />
                {isCooking ? 'Updating kitchen…' : 'Confirm cook'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

