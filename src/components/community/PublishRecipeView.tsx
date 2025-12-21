import { useMemo, useState } from 'react'
import { ArrowLeft, Globe, Lock, ShieldCheck } from 'lucide-react'
import type { CommunityRecipeListing } from './types'
import { cx } from './utils'

export interface PublishRecipeViewProps {
  draft?: Partial<CommunityRecipeListing> | null
  onBack?: () => void
  onPublish?: (next: { title: string; description?: string; tags: string[]; visibility: 'public' | 'unlisted' }) => void
}

export function PublishRecipeView({ draft, onBack, onPublish }: PublishRecipeViewProps) {
  const [title, setTitle] = useState(draft?.title ?? 'My Best Weeknight Pasta')
  const [description, setDescription] = useState(
    draft?.description ?? 'A fast, flexible base recipe — works with almost any veg and pantry sauce.'
  )
  const [tags, setTags] = useState<string[]>(draft?.tags ?? ['Weeknight', 'One-pan'])
  const [tagInput, setTagInput] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'unlisted'>(draft?.visibility ?? 'public')

  const preview = useMemo(
    () => ({
      title: title.trim() || 'Untitled recipe',
      description: description.trim() || undefined,
      tags: tags.filter(Boolean).slice(0, 6),
      visibility,
    }),
    [title, description, tags, visibility]
  )

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <div className="px-4 py-5 sm:px-6 sm:py-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 text-sm text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Back
            </button>
            <span className="text-xs text-stone-500 dark:text-stone-500">Preview-only publishing flow</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Form */}
            <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 p-5">
              <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">Publish recipe</h1>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                Share a recipe to the community catalog. You can publish as public or keep it unlisted.
              </p>

              <div className="mt-5 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-stone-900 dark:text-stone-100">Title</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    placeholder="Recipe title"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-stone-900 dark:text-stone-100">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="min-h-28 w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    placeholder="What makes this recipe great?"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-stone-900 dark:text-stone-100">Tags</label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                      placeholder="Add a tag (e.g. Vegetarian)"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const next = tagInput.trim()
                        if (!next) return
                        setTags((prev) => (prev.includes(next) ? prev : [...prev, next]))
                        setTagInput('')
                      }}
                      className="inline-flex items-center justify-center px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-sm font-medium text-stone-800 dark:text-stone-100 hover:bg-stone-50 dark:hover:bg-stone-900/60 transition-colors"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {tags.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                        className="rounded-full border border-stone-200 dark:border-stone-800 px-2 py-1 text-xs text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-900/60 transition-colors"
                        title="Remove tag"
                      >
                        {t}
                        <span className="ml-1 text-stone-400">×</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-stone-900 dark:text-stone-100">Visibility</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setVisibility('public')}
                      className={cx(
                        'text-left rounded-lg border p-4 transition-colors',
                        visibility === 'public'
                          ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/20'
                          : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 hover:bg-stone-50 dark:hover:bg-stone-900/60'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-emerald-700 dark:text-emerald-300" strokeWidth={1.75} />
                        <div className="font-medium text-stone-900 dark:text-stone-100">Public</div>
                      </div>
                      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                        Discoverable in search and recommended lists.
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisibility('unlisted')}
                      className={cx(
                        'text-left rounded-lg border p-4 transition-colors',
                        visibility === 'unlisted'
                          ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/20'
                          : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 hover:bg-stone-50 dark:hover:bg-stone-900/60'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-emerald-700 dark:text-emerald-300" strokeWidth={1.75} />
                        <div className="font-medium text-stone-900 dark:text-stone-100">Unlisted</div>
                      </div>
                      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                        Only people with the link can view it.
                      </p>
                    </button>
                  </div>
                </div>

                <div className="rounded-md border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/40 p-4">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-stone-600 dark:text-stone-300 mt-0.5" strokeWidth={1.75} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-stone-900 dark:text-stone-100">Safety & licensing</div>
                      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                        In implementation, add moderation/reporting, attribution, and a clear license choice.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex items-center justify-center px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-sm font-medium text-stone-800 dark:text-stone-100 hover:bg-stone-50 dark:hover:bg-stone-900/60 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => onPublish?.(preview)}
                    className="inline-flex items-center justify-center px-3 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
                  >
                    Publish
                  </button>
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">Listing preview</h2>
                <span className="text-[11px] px-2 py-1 rounded-full bg-stone-100 dark:bg-stone-900/60 text-stone-700 dark:text-stone-200">
                  {preview.visibility === 'public' ? 'Public' : 'Unlisted'}
                </span>
              </div>

              <div className="mt-4 rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/40 p-4">
                <div className="text-lg font-semibold text-stone-900 dark:text-stone-100">{preview.title}</div>
                {preview.description && (
                  <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{preview.description}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {preview.tags.length > 0 ? (
                    preview.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full border border-stone-200 dark:border-stone-800 px-2 py-1 text-xs text-stone-700 dark:text-stone-200"
                      >
                        {t}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-stone-500 dark:text-stone-500">No tags</span>
                  )}
                </div>
              </div>

              <div className="mt-4 text-xs text-stone-500 dark:text-stone-500">
                This preview is intentionally lightweight — the “real” publish flow would validate content, show a moderation policy,
                and offer a link/QR share UI for unlisted recipes.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


