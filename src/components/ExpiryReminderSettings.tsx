'use client'

import { useState } from 'react'
import { Hourglass, Mail } from 'lucide-react'
import { useMutation, useQuery } from '@/lib/kitchen/client'
import { api } from '@/lib/kitchen/api'
import { DIGEST_HOUR_LABEL, EXPIRING_WINDOW_CHOICES } from '@/lib/expiring'
import { IconBadge, SegmentedControl, cardClassName, cx, rowsClassName } from '@/components/ui/kit'

/** The "expiring soon" window and the opt-in daily email; both save as soon as they change. */
export function ExpiryReminderSettings() {
  const data = useQuery(api.preferences.get, {})
  const update = useMutation(api.preferences.update)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const preferences = data?.preferences
  if (!preferences) return null

  const save = async (patch: { expiringWithinDays?: number; expiryDigestEmail?: boolean }) => {
    setSaving(true)
    setError(null)
    try { await update(patch) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save this setting.') }
    finally { setSaving(false) }
  }
  const windowValue = String(preferences.expiringWithinDays)
  const choices = (EXPIRING_WINDOW_CHOICES as readonly number[]).includes(preferences.expiringWithinDays)
    ? EXPIRING_WINDOW_CHOICES
    : [...EXPIRING_WINDOW_CHOICES, preferences.expiringWithinDays].sort((a, b) => a - b)
  const digestOn = preferences.expiryDigestEmail && preferences.expiryDigestAvailable

  return (
    <div className="space-y-3">
      <div className={cx(cardClassName, rowsClassName)}>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <IconBadge icon={Hourglass} tone="neutral" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-stone-900 dark:text-stone-100">Expiring soon means within</p>
              <p className="text-xs text-stone-500 dark:text-stone-400">Days ahead for “Use it up” on Inventory and Cooking, and for the email</p>
            </div>
          </div>
          <SegmentedControl
            label="Expiring soon window in days"
            value={windowValue}
            onChange={(next) => void save({ expiringWithinDays: Number(next) })}
            options={choices.map((days) => ({ value: String(days), label: `${days} day${days === 1 ? '' : 's'}` }))}
            className="max-w-full overflow-x-auto"
          />
        </div>

        <div className="flex min-h-14 items-center gap-3 p-4">
          <IconBadge icon={Mail} tone="neutral" />
          <div className="min-w-0 flex-1">
            <p id="expiry-digest-label" className="text-sm font-medium text-stone-900 dark:text-stone-100">Daily expiry email</p>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              {preferences.expiryDigestAvailable
                ? `One email a day after ${DIGEST_HOUR_LABEL} in your timezone, only when something is about to expire.`
                : 'Email isn’t set up on this server. The administrator can add RESEND_API_KEY and APP_URL to turn it on.'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={digestOn}
            aria-labelledby="expiry-digest-label"
            disabled={saving || !preferences.expiryDigestAvailable}
            onClick={() => void save({ expiryDigestEmail: !digestOn })}
            className={cx(
              'relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600',
              digestOn ? 'bg-emerald-600' : 'bg-stone-300 dark:bg-stone-700'
            )}
          >
            <span aria-hidden="true" className={cx('absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200', digestOn && 'translate-x-5')} />
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="animate-fade-in rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </p>
      )}
    </div>
  )
}
