import { useRef } from 'react'
import { ArrowLeft, ExternalLink, ImagePlus, Pencil, Play, Star, Trash2 } from 'lucide-react'
import type { PantrySnapshotItem, Recipe } from './types'
import { cx, formatMinutes, ingredientMatchStatus } from './utils'

export interface RecipeDetailViewProps {
  recipe: Recipe
  pantrySnapshot?: PantrySnapshotItem[]
  onBack?: () => void
  onCook?: (id: string) => void
  onEdit?: (id: string) => void
  onToggleFavorite?: (id: string) => void
  onUploadPhoto?: (id: string, file: File) => void
  onRemovePhoto?: (id: string) => void
}

export function RecipeDetailView(props: RecipeDetailViewProps) {
  const { recipe, pantrySnapshot = [], onBack, onCook, onEdit, onToggleFavorite, onUploadPhoto, onRemovePhoto } = props
  const fileRef = useRef<HTMLInputElement | null>(null)

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <div className="px-4 py-5 sm:px-6 sm:py-6">
        <div className="max-w-4xl mx-auto space-y-5">
          {/* Photo header */}
          <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 overflow-hidden">
            <div className="relative aspect-[16/7] bg-stone-100 dark:bg-stone-900/40">
              {recipe.photoUrl ? (
                <>
                  <img
                    src={recipe.photoUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent" />
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
                  <div className="h-12 w-12 rounded-full bg-white/70 dark:bg-black/20 border border-stone-200/70 dark:border-stone-800/70 flex items-center justify-center">
                    <ImagePlus className="w-5 h-5 text-stone-700 dark:text-stone-200" strokeWidth={1.75} />
                  </div>
                  <div className="mt-3 text-sm font-medium text-stone-900 dark:text-stone-100">Add a photo (optional)</div>
                  <div className="mt-1 text-xs text-stone-600 dark:text-stone-400">
                    Helps you recognize dishes quickly in your library.
                  </div>
                </div>
              )}

              {(onUploadPhoto || onRemovePhoto) && (
                <div className="absolute top-3 right-3 flex items-center gap-2">
                  {recipe.photoUrl && onRemovePhoto && (
                    <button
                      type="button"
                      onClick={() => onRemovePhoto(recipe.id)}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-white/80 dark:bg-black/25 backdrop-blur border border-stone-200/70 dark:border-stone-800/70 text-stone-800 dark:text-stone-100 text-sm font-medium hover:bg-white/90 dark:hover:bg-black/35 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                      Remove
                    </button>
                  )}
                  {onUploadPhoto && (
                    <>
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-white/80 dark:bg-black/25 backdrop-blur border border-stone-200/70 dark:border-stone-800/70 text-stone-800 dark:text-stone-100 text-sm font-medium hover:bg-white/90 dark:hover:bg-black/35 transition-colors"
                      >
                        <ImagePlus className="w-4 h-4" strokeWidth={1.75} />
                        {recipe.photoUrl ? 'Change photo' : 'Upload photo'}
                      </button>
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (!f) return
                          onUploadPhoto(recipe.id, f)
                          e.currentTarget.value = ''
                        }}
                      />
                    </>
                  )}
                </div>
              )}

              <div className="absolute bottom-3 left-3 right-3">
                <div className={cx('text-lg sm:text-xl font-semibold', recipe.photoUrl ? 'text-white' : 'text-stone-900 dark:text-stone-100')}>
                  {recipe.title}
                </div>
                {recipe.photoUrl && recipe.description && (
                  <div className="mt-1 text-sm text-white/90 line-clamp-2">{recipe.description}</div>
                )}
              </div>
            </div>
          </div>

          {/* Top bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-2 text-sm text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
              >
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Back to library
              </button>
              <div className="mt-2 flex items-center gap-2 min-w-0">
                <h1 className="text-2xl sm:text-3xl font-semibold text-stone-900 dark:text-stone-100 truncate">
                  {recipe.title}
                </h1>
                {recipe.favorited && <Star className="w-5 h-5 text-amber-500" fill="currentColor" strokeWidth={1.5} />}
              </div>
              {recipe.description && <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{recipe.description}</p>}
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:pt-1">
              <button
                type="button"
                onClick={() => onCook?.(recipe.id)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
              >
                <Play className="w-4 h-4" strokeWidth={1.75} />
                Cook
              </button>
              <button
                type="button"
                onClick={() => onEdit?.(recipe.id)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-100 text-sm font-medium hover:bg-stone-50 dark:hover:bg-stone-900/60 transition-colors"
              >
                <Pencil className="w-4 h-4" strokeWidth={1.75} />
                Edit
              </button>
              <button
                type="button"
                onClick={() => onToggleFavorite?.(recipe.id)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-100 text-sm font-medium hover:bg-stone-50 dark:hover:bg-stone-900/60 transition-colors"
              >
                <Star className="w-4 h-4" strokeWidth={1.75} />
                {recipe.favorited ? 'Unfavorite' : 'Favorite'}
              </button>
            </div>
          </div>

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-2 text-sm text-stone-600 dark:text-stone-400">
            <span className="rounded-md bg-stone-100 dark:bg-stone-900/60 px-2 py-1 text-stone-700 dark:text-stone-200">
              {formatMinutes(recipe.totalTimeMinutes)}
            </span>
            <span className="rounded-md bg-stone-100 dark:bg-stone-900/60 px-2 py-1 text-stone-700 dark:text-stone-200">
              Serves {recipe.servings ?? '—'}
            </span>
            {recipe.visibility && (
              <span className="rounded-md border border-stone-200 dark:border-stone-800 px-2 py-1 text-stone-700 dark:text-stone-200">
                {recipe.visibility === 'household' ? 'Household' : 'Private'}
              </span>
            )}
            {recipe.sourceUrl && (
              <a
                href={recipe.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-stone-200 dark:border-stone-800 px-2 py-1 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-900/60"
              >
                Source <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.75} />
              </a>
            )}
          </div>

          {/* Main grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1 space-y-3">
              <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 p-4">
                <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Ingredients</h2>
                <div className="mt-3 space-y-2">
                  {recipe.ingredients.map((ing) => {
                    const s = ingredientMatchStatus(ing, pantrySnapshot)
                    const pill =
                      s === 'in-stock'
                        ? { label: 'In stock', cls: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200' }
                        : s === 'missing'
                          ? { label: 'Missing', cls: 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200' }
                          : { label: 'Unmapped', cls: 'bg-stone-100 text-stone-700 dark:bg-stone-900/60 dark:text-stone-200' }

                    return (
                      <div key={ing.id} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-stone-900 dark:text-stone-100">{ing.name}</div>
                          <div className="mt-0.5 text-xs text-stone-600 dark:text-stone-400">
                            {typeof ing.quantity === 'number' ? `${ing.quantity} ` : ''}
                            {ing.unit ?? ''}
                            {ing.note ? (ing.unit || typeof ing.quantity === 'number' ? ` • ${ing.note}` : ing.note) : ''}
                          </div>
                          {ing.mapping?.inventoryItemLabel && (
                            <div className="mt-1 text-[11px] text-stone-500 dark:text-stone-500">
                              Maps to <span className="font-mono">{ing.mapping.inventoryItemLabel}</span>
                            </div>
                          )}
                        </div>
                        <span className={cx('text-[11px] font-medium px-2 py-1 rounded-full shrink-0', pill.cls)}>{pill.label}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {recipe.notes && (
                <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 p-4">
                  <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Notes</h2>
                  <p className="mt-2 text-sm text-stone-700 dark:text-stone-300 whitespace-pre-wrap">{recipe.notes}</p>
                </div>
              )}
            </div>

            <div className="lg:col-span-2 space-y-3">
              <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 p-4">
                <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Steps</h2>
                <ol className="mt-3 space-y-3">
                  {recipe.steps.map((st, idx) => (
                    <li key={st.id} className="flex gap-3">
                      <div className="shrink-0 mt-0.5">
                        <div className="w-7 h-7 rounded-full bg-stone-100 dark:bg-stone-900/60 text-stone-700 dark:text-stone-200 flex items-center justify-center text-xs font-medium">
                          {idx + 1}
                        </div>
                      </div>
                      <div className="text-sm text-stone-800 dark:text-stone-200 leading-relaxed">{st.text}</div>
                    </li>
                  ))}
                </ol>
              </div>

              {recipe.tags && recipe.tags.length > 0 && (
                <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 p-4">
                  <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Tags</h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {recipe.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full border border-stone-200 dark:border-stone-800 px-3 py-1 text-sm text-stone-700 dark:text-stone-200"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


