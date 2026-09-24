'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import { NUTRIENT_FIELDS, computeRecipeNutrition, type MissingReason, type Nutrients } from '@/lib/nutrition'
import type { PantrySnapshotItem, Recipe } from './types'
import { cx } from './utils'
import { eyebrowClassName } from './IngredientComposer'

const REASONS: Record<MissingReason, string> = {
  'not-linked': 'Not linked to a pantry item',
  'no-facts': 'Pantry item has no nutrition facts',
  'no-amount': 'No amount in the recipe',
  'no-weight': 'Unit has no weight — use g, oz, cups or similar',
}

const round = (value: number) => (value >= 10 ? Math.round(value) : Math.round(value * 10) / 10)

/**
 * Per-serving nutrition. Uses the values entered with the recipe when there
 * are any; otherwise estimates from linked pantry items and says exactly
 * which ingredients it couldn't count, with a shortcut to fix each one.
 */
export function RecipeNutritionCard({ recipe, pantry }: { recipe: Recipe; pantry: PantrySnapshotItem[] }) {
  const estimate = useMemo(
    () => computeRecipeNutrition(recipe.ingredients, pantry, recipe.servings ?? 1),
    [recipe.ingredients, recipe.servings, pantry]
  )
  const entered = {
    energyKcal: recipe.caloriesKcal,
    proteinG: recipe.proteinGrams,
    carbsG: recipe.carbsGrams,
    fatG: recipe.fatGrams,
  }
  const usesEntered = Object.values(entered).some((value) => typeof value === 'number')
  const hasEstimate = estimate.counted.length > 0
  const values: Partial<Nutrients> = usesEntered ? entered : hasEstimate ? estimate.perServing : {}
  const macros = NUTRIENT_FIELDS.filter(({ key }) => key !== 'energyKcal' && values[key] !== undefined)
  const macroTotal = ['proteinG', 'carbsG', 'fatG'].reduce((sum, key) => sum + (values[key as keyof Nutrients] ?? 0), 0)
  const idFor = (name?: string) => pantry.find((item) => item.name.trim().toLowerCase() === name?.trim().toLowerCase())?.id

  return (
    <section>
      <h2 className={cx(eyebrowClassName, 'mb-2 px-1')}>Nutrition · per serving</h2>
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900/40">
        {usesEntered || hasEstimate ? (
          <div className="p-5">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-semibold tabular-nums tracking-tight text-stone-900 dark:text-stone-100" style={{ fontFamily: 'var(--font-heading)' }}>
                {values.energyKcal !== undefined ? `${!usesEntered && estimate.approximate ? '≈' : ''}${round(values.energyKcal)}` : '—'}
              </span>
              <span className="text-sm text-stone-500">kcal</span>
            </div>

            {macroTotal > 0 && (
              <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800" aria-hidden="true">
                <div className="bg-emerald-500" style={{ width: `${((values.proteinG ?? 0) / macroTotal) * 100}%` }} />
                <div className="bg-amber-400" style={{ width: `${((values.carbsG ?? 0) / macroTotal) * 100}%` }} />
                <div className="bg-rose-400" style={{ width: `${((values.fatG ?? 0) / macroTotal) * 100}%` }} />
              </div>
            )}

            <dl className="mt-4 divide-y divide-stone-100 text-sm dark:divide-stone-800">
              {macros.map(({ key, label, unit }) => (
                <div key={key} className="flex items-center justify-between py-2">
                  <dt className="flex items-center gap-2 text-stone-600 dark:text-stone-400">
                    {(key === 'proteinG' || key === 'carbsG' || key === 'fatG') && (
                      <span
                        aria-hidden="true"
                        className={cx('h-2 w-2 rounded-full', key === 'proteinG' ? 'bg-emerald-500' : key === 'carbsG' ? 'bg-amber-400' : 'bg-rose-400')}
                      />
                    )}
                    {label}
                  </dt>
                  <dd className="font-medium tabular-nums text-stone-900 dark:text-stone-100">
                    {round(values[key] ?? 0)} {unit}
                  </dd>
                </div>
              ))}
            </dl>

            <p className="mt-3 text-xs text-stone-500 dark:text-stone-400">
              {usesEntered
                ? 'Entered with the recipe.'
                : `Estimated from ${estimate.counted.length} of ${recipe.ingredients.length} ingredients in your pantry${
                    estimate.approximate ? '; volumes are converted as if they weighed the same as water' : ''
                  }.`}
            </p>
          </div>
        ) : (
          <div className="p-5 text-sm text-stone-600 dark:text-stone-400">
            No nutrition yet. Add facts to the pantry items this recipe uses, or enter values when editing the recipe.
          </div>
        )}

        {!usesEntered && estimate.missing.length > 0 && (
          <div className="border-t border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
            <p className="flex items-start gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
              {hasEstimate
                ? `Couldn’t include ${estimate.missing.length} ingredient${estimate.missing.length === 1 ? '' : 's'}, so totals may be low.`
                : 'Unable to retrieve nutrition for these ingredients.'}
            </p>
            <ul className="mt-2 space-y-1.5 pl-6 text-sm">
              {estimate.missing.map(({ name, reason, pantryName }) => {
                const id = reason === 'no-facts' ? idFor(pantryName) : undefined
                return (
                  <li key={name} className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-stone-800 dark:text-stone-200">
                      {name}
                      <span className="block text-xs text-stone-500 dark:text-stone-400">{REASONS[reason]}</span>
                    </span>
                    {id && (
                      <Link href={`/inventory?edit=${encodeURIComponent(id)}`} className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                        Add facts
                      </Link>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}
