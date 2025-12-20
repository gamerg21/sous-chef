import { Clock, MoreHorizontal, Star, Users } from 'lucide-react'
import type { PantrySnapshotItem, Recipe } from './types'
import { cx, formatMinutes, recipeMatchSummary } from './utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface RecipeCardProps {
  recipe: Recipe
  pantrySnapshot?: PantrySnapshotItem[]
  onOpen?: (id: string) => void
  onEdit?: (id: string) => void
  onToggleFavorite?: (id: string) => void
  onDelete?: (id: string) => void
}

export function RecipeCard(props: RecipeCardProps) {
  const { recipe, pantrySnapshot, onOpen, onEdit, onToggleFavorite, onDelete } = props
  const summary = recipeMatchSummary(recipe, pantrySnapshot ?? [])

  const status =
    summary.missing > 0
      ? { label: `${summary.missing} missing`, cls: 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200' }
      : summary.unmapped > 0
        ? { label: `${summary.unmapped} unmapped`, cls: 'bg-stone-100 text-stone-700 dark:bg-stone-900/60 dark:text-stone-200' }
        : { label: 'Ready', cls: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200' }

  return (
    <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 p-4">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={() => onOpen?.(recipe.id)} className="min-w-0 text-left flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="font-medium text-stone-900 dark:text-stone-100 truncate">{recipe.title}</h3>
            {recipe.favorited && <Star className="w-4 h-4 text-amber-500 shrink-0" fill="currentColor" strokeWidth={1.5} />}
          </div>
          {recipe.description && (
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400 line-clamp-2">{recipe.description}</p>
          )}
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <span className={cx('text-[11px] font-medium px-2 py-1 rounded-full', status.cls)}>{status.label}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900/60 transition-colors"
                aria-label="More actions"
              >
                <MoreHorizontal className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit?.(recipe.id)}>Edit</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onToggleFavorite?.(recipe.id)}>
                {recipe.favorited ? 'Unfavorite' : 'Favorite'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => onDelete?.(recipe.id)}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone-600 dark:text-stone-400">
        <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 dark:bg-stone-900/60 px-2 py-1 text-stone-700 dark:text-stone-200">
          <Clock className="w-3.5 h-3.5" strokeWidth={1.75} />
          {formatMinutes(recipe.totalTimeMinutes)}
        </span>
        <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 dark:bg-stone-900/60 px-2 py-1 text-stone-700 dark:text-stone-200">
          <Users className="w-3.5 h-3.5" strokeWidth={1.75} />
          {recipe.servings ?? '—'}
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


