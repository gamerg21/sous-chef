import { useMemo } from 'react'
import { CheckCircle2, Clock, Play, ShoppingCart, Users } from 'lucide-react'
import type { PantrySnapshotItem, Recipe } from './types'
import { bucketForMissingCount, computeRecipeCookability, cx, titleCaseBucket } from './utils'
import { buttonClassName, cardClassName, headingFont, Pill, type Tone } from '../ui/kit'

export interface RecipeMatchCardProps {
  recipe: Recipe
  pantrySnapshot: PantrySnapshotItem[]
  onCook?: (recipeId: string) => void
  onAddMissingToList?: (recipeId: string) => void
}

const bucketTone: Record<ReturnType<typeof bucketForMissingCount>, Tone> = {
  'cook-now': 'success',
  almost: 'warning',
  missing: 'neutral',
}

export function RecipeMatchCard({ recipe, pantrySnapshot, onCook, onAddMissingToList }: RecipeMatchCardProps) {
  const cookability = useMemo(() => computeRecipeCookability(recipe.ingredients, pantrySnapshot, recipe.plan), [recipe, pantrySnapshot])
  const bucket = bucketForMissingCount(cookability.missingCount)
  const canAddMissing = cookability.missingCount > 0

  const tracked = cookability.availableCount + cookability.missingCount
  const coverage = tracked ? cookability.availableCount / tracked : 1
  const missingPreview = cookability.missingLabels.slice(0, 4)
  const hiddenMissing = cookability.missingCount - missingPreview.length

  return (
    <div className={cx(cardClassName, 'lift flex flex-col p-4')}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 truncate text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-100" style={headingFont}>
          {recipe.title}
        </h3>
        <Pill tone={bucketTone[bucket]} className="mt-1 shrink-0">
          {titleCaseBucket(bucket)}
        </Pill>
      </div>
      {recipe.description ? <p className="mt-0.5 line-clamp-2 text-sm text-stone-600 dark:text-stone-400">{recipe.description}</p> : null}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
        {typeof recipe.totalTimeMinutes === 'number' ? (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            {recipe.totalTimeMinutes} min
          </span>
        ) : null}
        {typeof recipe.servings === 'number' ? (
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            Serves {recipe.servings}
          </span>
        ) : null}
        {recipe.tags?.length ? <span>{recipe.tags.slice(0, 3).join(' · ')}</span> : null}
      </div>

      {/* How much of the recipe the kitchen already covers */}
      <div className="mt-3">
        <div className="h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800" aria-hidden="true">
          <div
            className={cx('h-full rounded-full transition-[width] duration-500', bucket === 'cook-now' ? 'bg-emerald-500' : bucket === 'almost' ? 'bg-amber-400' : 'bg-stone-400 dark:bg-stone-500')}
            style={{ width: `${Math.round(coverage * 100)}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">
          {cookability.availableCount} of {tracked} ingredient{tracked === 1 ? '' : 's'} in your kitchen
        </p>
      </div>

      <div className="mt-3 flex-1">
        {cookability.missingCount === 0 ? (
          <p className="inline-flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Your inventory covers the measured ingredients.
          </p>
        ) : (
          <div>
            <p className="sr-only">
              Missing {cookability.missingCount} ingredient{cookability.missingCount === 1 ? '' : 's'}:
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {missingPreview.map((label, index) => (
                <li key={`${index}-${label}`} className="rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  {label}
                </li>
              ))}
              {hiddenMissing > 0 ? (
                <li className="rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-600 dark:bg-stone-800/70 dark:text-stone-300">+{hiddenMissing} more</li>
              ) : null}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => onCook?.(recipe.id)} className={buttonClassName('primary')}>
          <Play className="h-4 w-4" strokeWidth={2} fill="currentColor" aria-hidden="true" />
          Cook
        </button>
        <button type="button" onClick={() => onAddMissingToList?.(recipe.id)} disabled={!canAddMissing} className={buttonClassName(canAddMissing ? 'secondary' : 'ghost')}>
          <ShoppingCart className="h-4 w-4" strokeWidth={1.75} />
          {canAddMissing ? 'Add missing to list' : 'Nothing missing'}
        </button>
      </div>
    </div>
  )
}
