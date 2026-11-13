'use client'
import { useId, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { BookmarkCheck, BookmarkPlus, Clock, Copy, ExternalLink, ListChecks, ListOrdered, Pencil, Share2, ShoppingBasket, Star, Trash2, User, Users } from 'lucide-react'
import { api } from '@/lib/kitchen/api'
import { request } from '@/lib/kitchen/client'
import { COMMUNITY_LIMITS, type LocalDetail, type Tip } from '@/lib/community-contract'
import { unitLabel } from '@/lib/units'
import { ConfirmModal } from '@/components/ui/confirm-modal'
import { buttonClassName, cardClassName, cx, eyebrowClassName, headingFont, IconBadge, PageContainer, rowsClassName, Section } from '@/components/ui/kit'
import { RecipeSafetyMenu, TipReportButton } from '@/components/community/safety'
import { appendUnique, hasText, pantrySummary, plural, safeLinkUrl } from './feed-logic'
import { BackLink, focusRing, FollowButton, LikeButton, ProblemState, RecipePhoto, Stars, textLinkClassName } from './parts'
import { communityKey, CommunityNotices, problemNotice, useAnnounce, useCommunityQuery, useFollow, useLike, useMe, useRefreshCommunity, useSaveRecipe } from './useCommunity'
import { formatMinutes } from './utils'

function formatDate(value?: string) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const cookHref = (id: string) => `/community/cooks/${encodeURIComponent(id)}`

function DetailSkeleton() {
  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <span className="sr-only">Loading recipe…</span>
      <div aria-hidden="true" className="space-y-6">
        <div className="skeleton aspect-[16/7] w-full !rounded-2xl" />
        <div className="space-y-2">
          <div className="skeleton h-4 w-32" />
          <div className="skeleton h-9 w-2/3" />
          <div className="skeleton h-5 w-full max-w-xl" />
        </div>
        <div className="skeleton h-20 w-full !rounded-2xl" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="skeleton h-72 w-full !rounded-2xl lg:col-span-2" />
          <div className="skeleton h-40 w-full !rounded-2xl" />
        </div>
      </div>
    </div>
  )
}

// ── "I made this" ───────────────────────────────────────────────────────
function MadeForm({ initial, pending, onSubmit, onCancel }: { initial?: { rating: number; tip?: string }; pending: boolean; onSubmit: (rating: number, tip: string) => void; onCancel?: () => void }) {
  const [rating, setRating] = useState(initial?.rating ?? 0)
  const [tip, setTip] = useState(initial?.tip ?? '')
  const name = useId()
  const counterId = useId()
  const left = COMMUNITY_LIMITS.tip - tip.length
  return (
    <form
      className="space-y-4 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (rating >= 1 && !pending) onSubmit(rating, tip.trim())
      }}
    >
      <fieldset>
        <legend className={eyebrowClassName}>Your rating</legend>
        <div className="-ml-1.5 mt-1 flex items-center">
          {[1, 2, 3, 4, 5].map((value) => (
            <label key={value} className="cursor-pointer rounded-full p-1.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-emerald-600">
              <input type="radio" name={name} value={value} checked={rating === value} onChange={() => setRating(value)} className="sr-only" />
              <Star aria-hidden="true" className={cx('h-7 w-7', value <= rating ? 'text-amber-500' : 'text-stone-300 hover:text-amber-300 dark:text-stone-700 dark:hover:text-amber-700')} fill="currentColor" strokeWidth={0} />
              <span className="sr-only">{plural(value, 'star')}</span>
            </label>
          ))}
          <span aria-hidden="true" className="ml-2 text-sm text-stone-500 dark:text-stone-400">{rating ? `${rating} of 5` : 'Tap a star'}</span>
        </div>
      </fieldset>
      <label className="block">
        <span className={eyebrowClassName}>Tip for other cooks (optional)</span>
        <textarea
          value={tip}
          onChange={(event) => setTip(event.target.value.slice(0, COMMUNITY_LIMITS.tip))}
          maxLength={COMMUNITY_LIMITS.tip}
          rows={3}
          aria-describedby={counterId}
          placeholder="What worked, what you’d change…"
          className="mt-1 block w-full resize-y rounded-xl border border-stone-200 bg-white px-3 py-2 text-base text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
        />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span id={counterId} className={cx('text-xs tabular-nums', left <= 20 ? 'text-amber-700 dark:text-amber-300' : 'text-stone-500 dark:text-stone-400')}>
          {tip.length}/{COMMUNITY_LIMITS.tip}<span className="sr-only"> characters used</span>
        </span>
        <div className="flex gap-2">
          {onCancel && (
            <button type="button" onClick={onCancel} disabled={pending} className={buttonClassName('ghost')}>
              Cancel
            </button>
          )}
          <button type="submit" disabled={rating < 1 || pending} className={buttonClassName('primary')}>
            {pending ? 'Saving…' : initial ? 'Save changes' : 'Post'}
          </button>
        </div>
      </div>
    </form>
  )
}

function MadeIt({ detail }: { detail: LocalDetail }) {
  const client = useQueryClient()
  const announce = useAnnounce()
  const [editing, setEditing] = useState(false)
  const [pending, setPending] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const mine = detail.viewer?.made
  const key = communityKey(api.community.recipe, { id: detail.id })

  const settle = (totals: { madeCount: number; rating?: number }, made: { rating: number; tip?: string } | undefined) => {
    client.setQueryData<LocalDetail>(key, (cached) => {
      if (!cached?.viewer) return cached
      // `rating` and `made` are absent, not undefined, when there is none.
      const next: LocalDetail = { ...cached, madeCount: totals.madeCount, viewer: { liked: cached.viewer.liked, following: cached.viewer.following, own: cached.viewer.own, ...(made ? { made } : {}) } }
      if (totals.rating !== undefined) next.rating = totals.rating
      else delete next.rating
      return next
    })
    void client.invalidateQueries({ queryKey: key })
  }
  const submit = async (rating: number, tip: string) => {
    setPending(true)
    try {
      const totals = await request(api.community.made, { id: detail.id, rating, ...(tip ? { tip } : {}) })
      settle(totals, { rating, ...(tip ? { tip } : {}) })
      setEditing(false)
      announce(mine ? 'Your rating was updated.' : 'Thanks! Your rating was posted.')
    } catch (error) {
      announce(problemNotice(error, 'rate recipes'))
    } finally {
      setPending(false)
    }
  }
  const remove = async () => {
    setPending(true)
    try {
      settle(await request(api.community.removeMade, { id: detail.id }), undefined)
      setEditing(false)
      announce('Your rating was removed.')
    } catch (error) {
      announce(problemNotice(error, 'rate recipes'))
    } finally {
      setPending(false)
    }
  }

  if (detail.viewer?.own) return null
  return (
    <Section title="I made this" aside={detail.madeCount > 0 ? `${plural(detail.madeCount, 'cook')} made it` : undefined}>
      <div className={cx(cardClassName, 'overflow-hidden')}>
        {!detail.viewer ? (
          <div className="flex flex-wrap items-center gap-3 p-4">
            <p className="min-w-0 flex-1 basis-52 text-sm text-stone-600 dark:text-stone-400">Cooked it? Connect your community account to rate this recipe and leave a tip for other cooks.</p>
            <Link href="/community/connect" className={buttonClassName('secondary')}>
              Connect account
            </Link>
          </div>
        ) : mine && !editing ? (
          <div className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className={eyebrowClassName}>Your rating</span>
              <Stars rating={mine.rating} className="[&_svg]:h-5 [&_svg]:w-5" />
            </div>
            {mine.tip && <p className="whitespace-pre-line break-words text-base text-stone-800 dark:text-stone-200">{mine.tip}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setEditing(true)} disabled={pending} className={buttonClassName('secondary', 'sm')}>
                <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Edit
              </button>
              <button type="button" onClick={() => setConfirmRemove(true)} disabled={pending} className={cx(buttonClassName('secondary', 'sm'), 'text-rose-700 dark:text-rose-300')}>
                <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                {pending ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        ) : (
          <MadeForm initial={mine} pending={pending} onSubmit={(rating, tip) => void submit(rating, tip)} onCancel={mine ? () => setEditing(false) : undefined} />
        )}
      </div>
      <ConfirmModal
        isOpen={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={() => void remove()}
        title="Remove your rating?"
        message="Your rating and tip will be removed from this recipe. You can rate it again later."
        confirmText="Remove"
        confirmVariant="danger"
      />
    </Section>
  )
}

// ── Tips ────────────────────────────────────────────────────────────────
function Tips({ detail, myId }: { detail: LocalDetail; myId?: string }) {
  const announce = useAnnounce()
  const [extra, setExtra] = useState<Tip[]>([])
  // undefined: nothing fetched beyond the recipe's own first tips; null: the end.
  const [cursor, setCursor] = useState<string | null | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [reported, setReported] = useState<ReadonlySet<string>>(new Set())

  const all = appendUnique(detail.tips, extra)
  const tips = all.filter((tip) => !reported.has(tip.id))
  const canShowMore = cursor === undefined ? detail.madeCount > detail.tips.length : cursor !== null

  const showMore = async () => {
    if (loading) return
    setLoading(true)
    try {
      // The recipe carries its newest tips without a cursor, so paging starts from the top and skips what is already shown.
      let next = cursor ?? undefined
      let added: Tip[] = []
      for (let attempt = 0; attempt < 3; attempt++) {
        const page = await request(api.community.tips, { id: detail.id, ...(next ? { cursor: next } : {}) })
        const known = new Set([...all, ...added].map((tip) => tip.id))
        added = [...added, ...page.tips.filter((tip) => !known.has(tip.id))]
        next = page.cursor ?? undefined
        if (added.length > 0 || !page.cursor) break
      }
      setExtra((current) => appendUnique(current, added))
      setCursor(next ?? null)
      announce(added.length > 0 ? `${plural(added.length, 'more entry', 'more entries')} loaded.` : 'No more tips.')
    } catch (error) {
      announce(problemNotice(error, 'read tips'))
    } finally {
      setLoading(false)
    }
  }

  if (tips.length === 0 && !canShowMore) return null
  return (
    <Section title="From cooks who made it" aside={tips.length > 0 ? plural(tips.length, 'entry', 'entries') : undefined}>
      <div className={cx(cardClassName, 'overflow-hidden')}>
        {tips.length > 0 && (
          <ul className={rowsClassName}>
            {tips.map((tip) => (
              <li key={tip.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link href={cookHref(tip.author.id)} className={cx('min-w-0 truncate rounded text-sm font-semibold text-stone-900 underline-offset-2 hover:underline dark:text-stone-100', focusRing)}>
                    {tip.author.name}
                  </Link>
                  <Stars rating={tip.rating} />
                  <span className="text-xs text-stone-500 dark:text-stone-400">{formatDate(tip.createdAt)}</span>
                  {tip.author.id !== myId && (
                    <TipReportButton
                      recipeId={detail.id}
                      tipId={tip.id}
                      className="ml-auto"
                      onReported={() => {
                        setReported((current) => new Set(current).add(tip.id))
                        announce('Thanks. The tip was reported and hidden.')
                      }}
                    />
                  )}
                </div>
                {hasText(tip) && <p className="mt-1.5 whitespace-pre-line break-words text-base text-stone-800 dark:text-stone-200">{tip.tip}</p>}
              </li>
            ))}
          </ul>
        )}
        {canShowMore && (
          <div className={cx('flex justify-center p-3', tips.length > 0 && 'border-t border-stone-200 dark:border-stone-800')}>
            <button type="button" aria-disabled={loading || undefined} onClick={() => void showMore()} className={cx(buttonClassName('ghost', 'sm'), 'aria-disabled:cursor-default aria-disabled:opacity-70')}>
              {loading ? 'Loading…' : tips.length > 0 ? 'Show more' : 'Show ratings'}
            </button>
          </div>
        )}
      </div>
    </Section>
  )
}

// ── The page ────────────────────────────────────────────────────────────
function Detail({ id }: { id: string }) {
  const router = useRouter()
  const announce = useAnnounce()
  const refresh = useRefreshCommunity()
  const recipe = useCommunityQuery(api.community.recipe, id ? { id } : 'skip', { poll: true })
  const me = useMe()
  const like = useLike()
  const follow = useFollow()
  const saving = useSaveRecipe()
  const detail = recipe.data

  if (!detail) {
    return (
      <PageContainer width="5xl">
        <BackLink href="/community/recipes">Community recipes</BackLink>
        {recipe.error ? (
          <div className="space-y-4">
            <ProblemState error={recipe.error} onRetry={recipe.refetch} retrying={recipe.refetching} />
            <p className="text-center">
              <Link href="/community/recipes" className={textLinkClassName}>
                Browse community recipes
              </Link>
            </p>
          </div>
        ) : (
          <DetailSkeleton />
        )}
      </PageContainer>
    )
  }

  const { snapshot } = detail
  const own = detail.viewer?.own === true
  const liked = (detail.viewer?.liked ?? detail.liked) === true
  const sourceUrl = safeLinkUrl(snapshot.sourceUrl)
  const pantry = pantrySummary(detail.pantry)
  const sharedOn = formatDate(detail.createdAt)
  const updatedOn = detail.revision > 1 ? formatDate(detail.updatedAt) : null

  const share = async () => {
    const url = detail.shareUrl ?? window.location.href
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: detail.title, url })
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      announce(detail.shareUrl ? 'Link copied.' : 'Link to this page copied. It opens for people signed in to this kitchen.')
    } catch {
      announce({ message: `Copy this link: ${url}` })
    }
  }

  const facts = [
    { icon: Clock, label: 'Time', value: formatMinutes(detail.totalTimeMinutes) },
    { icon: Users, label: 'Serves', value: detail.servings ? `${detail.servings}` : '—' },
    { icon: ListChecks, label: 'Ingredients', value: `${snapshot.ingredients.length}` },
    { icon: ListOrdered, label: 'Steps', value: `${snapshot.steps.length}` },
  ]

  return (
    <PageContainer width="5xl">
      <div className="flex min-h-10 items-center justify-between gap-3">
        <BackLink href="/community/recipes">Community recipes</BackLink>
        <RecipeSafetyMenu
          recipe={{ id: detail.id, title: detail.title, author: detail.author }}
          onHidden={() => {
            refresh()
            router.push('/community/recipes')
          }}
        />
      </div>

      {detail.photoUrl && <RecipePhoto url={detail.photoUrl} eager className="aspect-[16/9] w-full rounded-2xl sm:aspect-[16/7]" iconClassName="h-12 w-12" />}

      <header className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className={cx(eyebrowClassName, 'mb-1')}>
              Shared by{' '}
              <Link href={cookHref(detail.author.id)} className={cx('rounded text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400', focusRing)}>
                {detail.author.name}
              </Link>
              {detail.visibility === 'unlisted' && <span> · Unlisted</span>}
            </p>
            <h1 className="break-words text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl dark:text-stone-100" style={headingFont}>
              {detail.title}
            </h1>
            {detail.description && <p className="mt-2 max-w-2xl whitespace-pre-line break-words text-base text-stone-600 dark:text-stone-400">{detail.description}</p>}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <LikeButton size="md" liked={liked} count={detail.likeCount} pending={like.pending.has(detail.id)} onToggle={() => void like.toggle({ id: detail.id, liked, likeCount: detail.likeCount })} label="Like this recipe" />
            <button type="button" onClick={() => void share()} className={buttonClassName('secondary')}>
              <Share2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Share
            </button>
            {detail.saved ? (
              <Link href={detail.savedRecipeId ? `/recipes/${detail.savedRecipeId}` : '/recipes'} className={cx(buttonClassName('soft'), 'px-5')}>
                <BookmarkCheck className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                Saved<span className="sr-only">.</span> <span className="font-normal">Open my copy</span>
              </Link>
            ) : (
              <button type="button" disabled={saving.pending.has(detail.id)} onClick={() => void saving.save(detail)} className={cx(buttonClassName('primary'), 'px-5')}>
                <BookmarkPlus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                {saving.pending.has(detail.id) ? 'Saving…' : 'Save to my recipes'}
              </button>
            )}
          </div>
        </div>

        <dl className={cx(cardClassName, 'grid grid-cols-2 overflow-hidden sm:grid-cols-4')}>
          {facts.map(({ icon: Icon, label, value }, index) => (
            <div key={label} className={cx('flex items-center gap-3 border-stone-200 p-4 dark:border-stone-800', index % 2 === 0 && 'border-r', index < 2 && 'border-b sm:border-b-0', (index === 1 || index === 2) && 'sm:border-r')}>
              <Icon className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} aria-hidden="true" />
              <div className="min-w-0">
                <dt className={eyebrowClassName}>{label}</dt>
                <dd className="mt-0.5 truncate text-base font-semibold text-stone-900 dark:text-stone-100">{value}</dd>
              </div>
            </div>
          ))}
        </dl>

        {(detail.tags.length > 0 || sourceUrl) && (
          <div className="flex flex-wrap items-center gap-2">
            {detail.tags.map((tag) => (
              <Link key={tag} href={`/community/recipes?tag=${encodeURIComponent(tag)}`} className={cx('max-w-full truncate rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-200 dark:hover:bg-emerald-950', focusRing)}>
                {tag}
              </Link>
            ))}
            {sourceUrl && (
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className={cx('inline-flex items-center gap-1 rounded-full border border-stone-200 px-3 py-1 text-sm text-stone-700 hover:bg-stone-100 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-900', focusRing)}>
                Source <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            )}
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {pantry && detail.pantry && (
            <Section title="Your pantry">
              <div className={cx(cardClassName, 'flex items-start gap-3 p-4')}>
                <IconBadge icon={ShoppingBasket} tone={detail.pantry.missing.length === 0 ? 'success' : 'neutral'} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">{pantry}{detail.pantry.have < detail.pantry.total ? ' ingredients' : ''}</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800" aria-hidden="true">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round((detail.pantry.have / detail.pantry.total) * 100)}%` }} />
                  </div>
                  {detail.pantry.missing.length > 0 && <p className="mt-2 break-words text-sm text-stone-600 dark:text-stone-400">Missing: {detail.pantry.missing.join(', ')}</p>}
                </div>
              </div>
            </Section>
          )}

          <Section title="Ingredients" aside={snapshot.ingredients.length > 0 ? plural(snapshot.ingredients.length, 'item') : undefined}>
            <div className={cx(cardClassName, 'overflow-hidden')}>
              {snapshot.ingredients.length === 0 ? (
                <p className="p-5 text-sm text-stone-500">No ingredients listed.</p>
              ) : (
                <ul className="divide-y divide-stone-100 dark:divide-stone-800">
                  {snapshot.ingredients.map((ingredient, index) => {
                    const amount = [typeof ingredient.quantity === 'number' ? `${ingredient.quantity}` : '', unitLabel(ingredient.unit, ingredient.quantity)].filter(Boolean).join(' ')
                    return (
                      <li key={index} className="flex items-center gap-3 px-4 py-3">
                        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500/70" />
                        <div className="min-w-0 flex-1 break-words">
                          <div className="text-base text-stone-900 dark:text-stone-100">
                            {amount && <span className="font-semibold tabular-nums">{amount} </span>}
                            {ingredient.name}
                          </div>
                          {ingredient.note && <div className="text-sm italic text-stone-500 dark:text-stone-400">{ingredient.note}</div>}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </Section>

          <Section title="Steps">
            <div className={cx(cardClassName, 'overflow-hidden')}>
              {snapshot.steps.length === 0 ? (
                <p className="p-5 text-sm text-stone-500">No steps listed.</p>
              ) : (
                <ol className="divide-y divide-stone-100 dark:divide-stone-800">
                  {snapshot.steps.map((step, index) => (
                    <li key={index} className="flex gap-4 px-4 py-4 sm:px-5">
                      <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
                        {index + 1}
                      </span>
                      <p className="min-w-0 whitespace-pre-line break-words pt-1 text-base leading-relaxed text-stone-800 dark:text-stone-200">{step.text}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </Section>

          <MadeIt detail={detail} />
          <Tips key={detail.id} detail={detail} myId={me.data?.me?.id} />
        </div>

        <div className="min-w-0 space-y-6">
          <Section title="From the community">
            <div className={cx(cardClassName, rowsClassName)}>
              <div className="flex flex-wrap items-center gap-3 p-4">
                <IconBadge icon={User} tone="success" />
                <div className="min-w-0 flex-1">
                  <Link href={cookHref(detail.author.id)} className={cx('block truncate rounded text-sm font-semibold text-stone-900 underline-offset-2 hover:underline dark:text-stone-100', focusRing)}>
                    {detail.author.name}
                  </Link>
                  <div className="text-xs text-stone-500 dark:text-stone-400">{own ? 'This is your recipe' : sharedOn ? `Shared ${sharedOn}` : 'Community cook'}</div>
                </div>
                {own ? (
                  <Link href="/community/mine" className={buttonClassName('secondary', 'sm')}>
                    My shared recipes
                  </Link>
                ) : (
                  <FollowButton following={detail.viewer?.following === true} pending={follow.pending.has(detail.author.id)} onToggle={() => void follow.toggle(detail.author, detail.viewer?.following === true)} name={detail.author.name} />
                )}
              </div>
              <dl className="grid grid-cols-3 divide-x divide-stone-200 text-center dark:divide-stone-800">
                {[
                  { label: 'Saves', value: `${detail.saveCount}` },
                  { label: 'Made it', value: `${detail.madeCount}` },
                  { label: 'Rating', value: detail.rating !== undefined && detail.madeCount > 0 ? detail.rating.toFixed(1) : '—' },
                ].map((stat) => (
                  <div key={stat.label} className="min-w-0 px-2 py-3">
                    <dt className={eyebrowClassName}>{stat.label}</dt>
                    <dd className="mt-0.5 truncate text-lg font-semibold tabular-nums text-stone-900 dark:text-stone-100" style={headingFont}>{stat.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex items-start gap-3 p-4">
                <IconBadge icon={Copy} tone="neutral" />
                <p className="min-w-0 text-sm text-stone-600 dark:text-stone-400">
                  Saving makes your own copy in your private recipes. If the cook changes this recipe later, you’ll be offered the update; your copy only changes when you accept it.
                  {updatedOn && ` Last updated ${updatedOn}.`}
                </p>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </PageContainer>
  )
}

export function CommunityRecipeDetailView({ id }: { id: string }) {
  return (
    <CommunityNotices>
      <Detail key={id} id={id} />
    </CommunityNotices>
  )
}
