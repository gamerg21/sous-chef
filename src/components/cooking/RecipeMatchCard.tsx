import { useMemo } from 'react'
import { Clock, ShoppingCart } from 'lucide-react'
import type { PantrySnapshotItem, Recipe } from './types'
import { bucketForMissingCount, computeRecipeCookability, cx, titleCaseBucket } from './utils'

export interface RecipeMatchCardProps {
  recipe: Recipe
  pantrySnapshot: PantrySnapshotItem[]
  onCook?: (recipeId: string) => void
  onAddMissingToList?: (recipeId: string) => void
}

export function RecipeMatchCard({ recipe, pantrySnapshot, onCook, onAddMissingToList }: RecipeMatchCardProps) {
  const cookability = useMemo(() => computeRecipeCookability(recipe.ingredients, pantrySnapshot), [recipe, pantrySnapshot])
  const bucket = bucketForMissingCount(cookability.missingCount)
  const canAddMissing = cookability.missingCount > 0

  const badge =
    bucket === 'cook-now'
      ? 'bg-emerald-600 text-white'
      : bucket === 'almost'
        ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200'
        : 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-200'

  const missingPreview = cookability.missingLabels.slice(0, 3)

  return (
    <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-stone-900 dark:text-stone-100 truncate">{recipe.title}</h3>
            <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium', badge)}>
              {titleCaseBucket(bucket)}
            </span>
          </div>
          {recipe.description ? (
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400 line-clamp-2">{recipe.description}</p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
            {typeof recipe.totalTimeMinutes === 'number' ? (
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" strokeWidth={1.75} />
                {recipe.totalTimeMinutes} min
              </span>
            ) : null}
            {typeof recipe.servings === 'number' ? <span>• Serves {recipe.servings}</span> : null}
            {recipe.tags?.length ? <span>• {recipe.tags.slice(0, 3).join(', ')}</span> : null}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-md bg-stone-50 dark:bg-stone-900/40 border border-stone-200/60 dark:border-stone-800/60 p-3">
        {cookability.missingCount === 0 ? (
          <div className="text-sm text-emerald-700 dark:text-emerald-300">
            You have everything you need (based on the current snapshot).
          </div>
        ) : (
          <div className="text-sm text-stone-700 dark:text-stone-300">
            Missing{' '}
            <span className="font-medium text-stone-900 dark:text-stone-100">{cookability.missingCount}</span> ingredient
            {cookability.missingCount === 1 ? '' : 's'}:
            <span className="ml-2 text-stone-600 dark:text-stone-400">
              {missingPreview.join(', ')}
              {cookability.missingCount > missingPreview.length ? '…' : ''}
            </span>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onCook?.(recipe.id)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
        >
          Cook
        </button>
        <button
          type="button"
          onClick={() => onAddMissingToList?.(recipe.id)}
          disabled={!canAddMissing}
          className={cx(
            'inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition-colors',
            canAddMissing
              ? 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-100 hover:bg-stone-50 dark:hover:bg-stone-900/60'
              : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-400 dark:text-stone-500 opacity-70 cursor-not-allowed'
          )}
        >
          <ShoppingCart className="w-4 h-4" strokeWidth={1.75} />
          {canAddMissing ? 'Add missing to list' : 'Nothing missing'}
        </button>
      </div>
    </div>
  )
}

