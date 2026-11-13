'use client'
import { useId, useRef, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { COMMUNITY_LIMITS, REPORT_REASONS, REPORT_REASON_LABELS, type ReportReason } from '@/lib/community-contract'
import { api } from '@/lib/kitchen/api'
import { request } from '@/lib/kitchen/client'
import { Modal } from '@/components/ui/modal'
import { buttonClassName, cx, eyebrowClassName, IconBadge } from '@/components/ui/kit'
import { errorMessage, GUIDELINES_URL, remaining } from './logic'

export interface ReportDialogProps {
  isOpen: boolean
  /** `reported` is true when a report was sent before the dialog closed. */
  onClose: (reported: boolean) => void
  recipeId: string
  /** Report one "made it" tip on the recipe instead of the recipe itself. */
  tipId?: string
}

const linkClassName = 'font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-300'

function ReportForm({ recipeId, tipId, onSending, onSent, onDone }: { recipeId: string; tipId?: string; onSending: (sending: boolean) => void; onSent: () => void; onDone: () => void }) {
  const noteId = useId()
  const running = useRef(false)
  const [reason, setReason] = useState<ReportReason | ''>('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const left = remaining(note, COMMUNITY_LIMITS.reportNote)

  const submit = async () => {
    if (running.current || !reason) return
    running.current = true
    onSending(true)
    setBusy(true)
    setError('')
    try {
      // Sent without refreshing lists: the reported recipe leaves them when this dialog closes.
      await request(api.community.report, { recipeId, ...(tipId ? { tipId } : {}), reason, ...(note.trim() ? { note: note.trim() } : {}) })
      onSent()
      setSent(true)
    } catch (failure) {
      setError(errorMessage(failure, 'The report couldn’t be sent. Try again.'))
    } finally {
      running.current = false
      onSending(false)
      setBusy(false)
    }
  }

  return (
    <div>
      {/* Always present so the result is announced when it arrives. */}
      <div role="status">
        {sent && (
          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <IconBadge icon={CheckCircle2} tone="success" />
              <div className="min-w-0 space-y-1 pt-1">
                <p className="text-base font-medium text-stone-900 dark:text-stone-100">Report sent. Thank you.</p>
                <p className="text-sm text-stone-600 dark:text-stone-400">
                  A moderator will review it. {tipId ? 'This tip is now hidden for you.' : <>This recipe is now hidden for you; you can bring it back from Hidden &amp; blocked.</>}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
      {sent ? (
        <button type="button" autoFocus onClick={onDone} className={cx(buttonClassName('primary'), 'mt-5 min-h-11 w-full')}>Done</button>
      ) : (
        <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); void submit() }}>
          <fieldset disabled={busy} className="min-w-0">
            <legend className={cx(eyebrowClassName, 'mb-2')}>Why are you reporting this {tipId ? 'tip' : 'recipe'}?</legend>
            <div className="space-y-1">
              {REPORT_REASONS.map((value) => (
                <label
                  key={value}
                  className={cx(
                    'flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-emerald-600',
                    reason === value ? 'bg-emerald-100 font-medium text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100' : 'text-stone-800 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800/60'
                  )}
                >
                  <input type="radio" name="reason" value={value} required checked={reason === value} onChange={() => setReason(value)} className="h-4 w-4 shrink-0 accent-emerald-600" />
                  {REPORT_REASON_LABELS[value]}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor={noteId} className={cx(eyebrowClassName, 'mb-2')}>Anything to add? (optional)</label>
            <textarea
              id={noteId}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={COMMUNITY_LIMITS.reportNote}
              rows={3}
              disabled={busy}
              aria-describedby={`${noteId}-count`}
              placeholder="What should a moderator know?"
              className="w-full resize-y rounded-xl border border-stone-200 bg-white px-3 py-2 text-base text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-60 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
            />
            <p id={`${noteId}-count`} className={cx('mt-1 text-right text-xs tabular-nums', left <= 20 ? 'text-amber-700 dark:text-amber-300' : 'text-stone-500 dark:text-stone-400')}>
              {left} character{left === 1 ? '' : 's'} left
            </p>
          </div>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Reports are checked against the <a className={linkClassName} href={GUIDELINES_URL} target="_blank" rel="noopener noreferrer">community guidelines<span className="sr-only"> (opens in a new tab)</span></a>. You don’t need a community account to report.
          </p>
          <p role="alert" className={cx('text-sm font-medium text-rose-700 dark:text-rose-300', !error && 'hidden')}>{error}</p>
          <div className="flex gap-3">
            <button type="button" onClick={onDone} disabled={busy} className={cx(buttonClassName('ghost'), 'min-h-11 flex-1')}>Cancel</button>
            <button type="submit" disabled={busy} aria-busy={busy} className={cx(buttonClassName('danger'), 'min-h-11 flex-[2]')}>{busy ? 'Sending…' : 'Send report'}</button>
          </div>
        </form>
      )}
    </div>
  )
}

/** Report a recipe, or one tip on it, to the community's moderators. */
export function ReportDialog({ isOpen, onClose, recipeId, tipId }: ReportDialogProps) {
  const sent = useRef(false)
  // While a report is being sent the dialog stays open, so its result is never lost.
  const running = useRef(false)
  const close = () => {
    if (running.current) return
    const reported = sent.current
    sent.current = false
    onClose(reported)
  }
  return (
    <Modal isOpen={isOpen} onClose={close} title={tipId ? 'Report tip' : 'Report recipe'}>
      <ReportForm recipeId={recipeId} tipId={tipId} onSending={(sending) => { running.current = sending }} onSent={() => { sent.current = true }} onDone={close} />
    </Modal>
  )
}
