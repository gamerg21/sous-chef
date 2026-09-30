'use client'

import { useState } from 'react'
import { Hourglass } from 'lucide-react'
import { useMutation, useQuery } from '@/lib/kitchen/client'
import { api } from '@/lib/kitchen/api'
import { EXPIRING_WINDOW_CHOICES } from '@/lib/expiring'
import { IconBadge, SegmentedControl, cardClassName, cx, rowsClassName } from '@/components/ui/kit'

/** The "expiring soon" window; it saves as soon as it changes. */
export function ExpiryReminderSettings() {
  const data = useQuery(api.preferences.get, {})
  const update = useMutation(api.preferences.update)
  const [error, setError] = useState<string | null>(null)
  const preferences = data?.preferences
  if (!preferences) return null

  const save = async (patch: { expiringWithinDays?: number }) => {
    setError(null)
    try { await update(patch) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save this setting.') }
  }
  const windowValue = String(preferences.expiringWithinDays)
  const choices = (EXPIRING_WINDOW_CHOICES as readonly number[]).includes(preferences.expiringWithinDays)
    ? EXPIRING_WINDOW_CHOICES
    : [...EXPIRING_WINDOW_CHOICES, preferences.expiringWithinDays].sort((a, b) => a - b)

  return (
    <div className="space-y-3">
      <div className={cx(cardClassName, rowsClassName)}>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <IconBadge icon={Hourglass} tone="neutral" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-stone-900 dark:text-stone-100">Expiring soon means within</p>
              <p className="text-xs text-stone-500 dark:text-stone-400">Days ahead for “Use it up” on Inventory and Cooking</p>
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
      </div>
      {error && (
        <p role="alert" className="animate-fade-in rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </p>
      )}
    </div>
  )
}
