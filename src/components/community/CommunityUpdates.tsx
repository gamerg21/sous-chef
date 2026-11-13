'use client'
// "The cook changed a recipe you saved": offered on the community hub and on
// the saved copy's own page. Updating replaces the copy, so it asks first.
import { useState } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { api } from '@/lib/kitchen/api'
import { request } from '@/lib/kitchen/client'
import type { Id } from '@/server/kitchen/_generated/dataModel'
import { ConfirmModal } from '@/components/ui/confirm-modal'
import { buttonClassName, cardClassName, cx, IconBadge, rowsClassName, Section } from '@/components/ui/kit'
import { describeProblem } from './feed-logic'
import { focusRing } from './parts'
import { communityKey, useCommunityQuery } from './useCommunity'

type Update = { recipeId: string; title: string; remoteId: string; savedRevision: number; latestRevision: number }

/** The updates on offer and the two answers to each. `message` is for a live region. */
export function useCommunityUpdates() {
  const client = useQueryClient()
  const read = useCommunityQuery(api.community.updates, {}, { poll: true })
  const [pending, setPending] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null)

  const forget = (recipeId: string) =>
    client.setQueryData<{ updates: Update[] }>(communityKey(api.community.updates, {}), (cached) => (cached ? { updates: cached.updates.filter((update) => update.recipeId !== recipeId) } : cached))

  const answer = async (update: Update, accept: boolean) => {
    if (pending) return
    setPending(update.recipeId)
    setMessage(null)
    try {
      const recipeId = update.recipeId as Id<'recipes'>
      if (accept) await request(api.community.applyUpdate, { recipeId })
      else await request(api.community.dismissUpdate, { recipeId })
      forget(update.recipeId)
      if (accept) void client.invalidateQueries({ queryKey: ['kitchen'] })
      setMessage({ text: accept ? `“${update.title}” now matches the cook’s latest version.` : `Kept your copy of “${update.title}” as it is.`, failed: false })
    } catch (error) {
      setMessage({ text: describeProblem(error).message, failed: true })
    } finally {
      setPending(null)
    }
  }
  return { updates: read.data?.updates ?? [], pending, message, apply: (update: Update) => answer(update, true), dismiss: (update: Update) => answer(update, false) }
}

const confirmText = (title: string) =>
  `This replaces the title, description, tags, servings, time, photo, ingredients and steps of your saved copy of “${title}” with the cook’s latest version. Changes you made to those in your copy will be lost.`

function Actions({ update, busy, disabled, onUpdate, onDismiss }: { update: Update; busy: boolean; disabled: boolean; onUpdate: () => void; onDismiss: () => void }) {
  return (
    <div className="flex shrink-0 gap-2">
      <button type="button" disabled={disabled} onClick={onDismiss} aria-label={`Not now: keep my copy of ${update.title}`} className={buttonClassName('ghost', 'sm')}>
        Not now
      </button>
      <button type="button" disabled={disabled} onClick={onUpdate} aria-label={`Update my copy of ${update.title}`} className={cx(buttonClassName('primary', 'sm'), 'min-w-[5.5rem]')}>
        {busy ? 'Updating…' : 'Update'}
      </button>
    </div>
  )
}

function Status({ message }: { message: { text: string; failed: boolean } | null }) {
  return (
    <p role="status" aria-live="polite" className={cx('px-1 text-sm', message ? 'mt-2' : 'sr-only', message?.failed ? 'text-rose-700 dark:text-rose-300' : 'text-stone-600 dark:text-stone-400')}>
      {message?.text}
    </p>
  )
}

/** Hub section listing every saved copy with a newer version. Renders nothing when there are none. */
export function CommunityUpdatesSection() {
  const { updates, pending, message, apply, dismiss } = useCommunityUpdates()
  const [confirming, setConfirming] = useState<Update | null>(null)
  if (updates.length === 0 && !message) return null
  return (
    <Section title="Updates to recipes you saved" aside={updates.length > 0 ? `${updates.length} available` : undefined}>
      {updates.length > 0 && (
        <ul className={cx(cardClassName, rowsClassName, 'overflow-hidden')}>
          {updates.map((update) => (
            <li key={update.recipeId} className="flex flex-wrap items-center gap-3 p-4">
              <IconBadge icon={RefreshCw} tone="info" />
              <div className="min-w-0 flex-1 basis-48">
                <Link href={`/recipes/${update.recipeId}`} className={cx('block truncate rounded text-sm font-semibold text-stone-900 underline-offset-2 hover:underline dark:text-stone-100', focusRing)}>
                  {update.title}
                </Link>
                <p className="text-xs text-stone-500 dark:text-stone-400">The cook shared a newer version of this recipe.</p>
              </div>
              <Actions update={update} busy={pending === update.recipeId} disabled={pending !== null} onUpdate={() => setConfirming(update)} onDismiss={() => void dismiss(update)} />
            </li>
          ))}
        </ul>
      )}
      <Status message={message} />
      <ConfirmModal
        isOpen={confirming !== null}
        onClose={() => setConfirming(null)}
        onConfirm={() => { if (confirming) void apply(confirming) }}
        title="Update your saved copy?"
        message={confirming ? confirmText(confirming.title) : ''}
        confirmText="Update my copy"
      />
    </Section>
  )
}

/** Banner for one saved copy's own page. Renders nothing unless that recipe has an update. */
export function CommunityUpdateNotice({ recipeId }: { recipeId: string }) {
  const { updates, pending, message, apply, dismiss } = useCommunityUpdates()
  const [confirming, setConfirming] = useState(false)
  const update = updates.find((entry) => entry.recipeId === recipeId)
  if (!update && !message) return null
  return (
    <div className="px-4 pt-5 sm:px-6 sm:pt-6">
      <div className="mx-auto max-w-5xl">
        {update && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-900 dark:bg-sky-950/30">
            <IconBadge icon={RefreshCw} tone="info" />
            <div className="min-w-0 flex-1 basis-52">
              <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">Update available</p>
              <p className="text-sm text-stone-600 dark:text-stone-400">
                The cook shared a newer version of this recipe in the community.{' '}
                <Link href={`/community/recipes/${encodeURIComponent(update.remoteId)}`} className={cx('rounded font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400', focusRing)}>
                  See the latest version
                </Link>
              </p>
            </div>
            <Actions update={update} busy={pending === update.recipeId} disabled={pending !== null} onUpdate={() => setConfirming(true)} onDismiss={() => void dismiss(update)} />
          </div>
        )}
        <Status message={message} />
        <ConfirmModal
          isOpen={confirming && !!update}
          onClose={() => setConfirming(false)}
          onConfirm={() => { if (update) void apply(update) }}
          title="Update your saved copy?"
          message={update ? confirmText(update.title) : ''}
          confirmText="Update my copy"
        />
      </div>
    </div>
  )
}
