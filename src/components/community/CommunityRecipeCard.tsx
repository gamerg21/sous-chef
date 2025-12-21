import { Bookmark, Clock, Star } from 'lucide-react'
import type { CommunityRecipeListing } from './types'
import { clampRating, cx, formatCompactNumber } from './utils'

export interface CommunityRecipeCardProps {
  recipe: CommunityRecipeListing
  onOpen?: (id: string) => void
  onSave?: (id: string) => void
}

function Stars({ value }: { value: number }) {
  const full = Math.round(clampRating(value))
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => {
        const active = i < full
        return (
          <Star
            key={i}
            className={cx('w-3.5 h-3.5', active ? 'text-amber-500' : 'text-stone-300 dark:text-stone-600')}
            fill={active ? 'currentColor' : 'none'}
            strokeWidth={1.75}
          />
        )
      })}
    </span>
  )
}

export function CommunityRecipeCard({ recipe, onOpen, onSave }: CommunityRecipeCardProps) {
  return (
    <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 p-4">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={() => onOpen?.(recipe.id)} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="font-medium text-stone-900 dark:text-stone-100 truncate">{recipe.title}</h3>
            {recipe.visibility === 'unlisted' && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-900/60 text-stone-700 dark:text-stone-200">
                Unlisted
              </span>
            )}
          </div>
          {recipe.description && (
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400 line-clamp-2">{recipe.description}</p>
          )}
          <div className="mt-2 text-xs text-stone-500 dark:text-stone-400">by {recipe.authorName}</div>
        </button>

        <button
          type="button"
          onClick={() => onSave?.(recipe.id)}
          className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900/60 transition-colors"
          aria-label="Save recipe"
          title="Save"
        >
          <Bookmark className="w-4 h-4" strokeWidth={1.75} />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone-600 dark:text-stone-400">
        <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 dark:bg-stone-900/60 px-2 py-1 text-stone-700 dark:text-stone-200">
          <Clock className="w-3.5 h-3.5" strokeWidth={1.75} />
          {recipe.totalTimeMinutes ? `${recipe.totalTimeMinutes}m` : '—'}
        </span>
        <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 dark:bg-stone-900/60 px-2 py-1 text-stone-700 dark:text-stone-200">
          <Stars value={recipe.rating ?? 0} />
          <span className="tabular-nums">{(recipe.rating ?? 0).toFixed(1)}</span>
        </span>
        <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 dark:bg-stone-900/60 px-2 py-1 text-stone-700 dark:text-stone-200">
          <Star className="w-3.5 h-3.5 text-amber-500" fill="currentColor" strokeWidth={0} />
          {formatCompactNumber(recipe.saves)} saves
        </span>
        {recipe.tags?.slice(0, 3).map((t) => (
          <span
            key={t}
            className="rounded-full border border-stone-200 dark:border-stone-800 px-2 py-1 text-stone-700 dark:text-stone-200"
          >
            {t}
          </span>
        ))}
        {recipe.tags && recipe.tags.length > 3 && (
          <span className="text-stone-500 dark:text-stone-500">+{recipe.tags.length - 3}</span>
        )}
      </div>
    </div>
  )
}


