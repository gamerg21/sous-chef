'use client'

import { useId, useState } from 'react'
import { CalendarPlus, ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react'
import { buttonClassName, chipClassName, cx, eyebrowClassName, iconButtonClassName, SegmentedControl } from '../ui/kit'
import { addDays, dayKey, formatDay, mealSlots, slotLabels, startOfWeek, weekDays, weekTitle, type MealSlot } from './dates'

export type PlanEntryValues = { date: string; slot: MealSlot; servings?: number }

export const slotOptions = mealSlots.map((value) => ({ value, label: slotLabels[value] }))

/** Servings with minus/plus buttons; recipe amounts scale from the recipe's own servings. */
export function ServingsStepper({ value, onChange, label = 'Servings' }: { value: number; onChange: (value: number) => void; label?: string }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(1, value - 1))} disabled={value <= 1} aria-label="Fewer servings" className={cx(iconButtonClassName, 'h-9 w-9')}>
        <Minus className="h-4 w-4" strokeWidth={1.75} />
      </button>
      <span className="min-w-16 text-center text-sm font-medium tabular-nums text-stone-900 dark:text-stone-100" aria-live="polite">
        {value} serving{value === 1 ? '' : 's'}
      </span>
      <button type="button" onClick={() => onChange(Math.min(100, value + 1))} aria-label="More servings" className={cx(iconButtonClassName, 'h-9 w-9')}>
        <Plus className="h-4 w-4" strokeWidth={1.75} />
      </button>
    </div>
  )
}

/** Inline drawer content for planning one recipe: a day of a week, a meal, and servings. */
export function AddToPlanForm({ defaultServings, onSave, onClose }: {
  defaultServings?: number
  onSave: (values: PlanEntryValues) => Promise<void>
  onClose: () => void
}) {
  const id = useId()
  const today = dayKey(new Date())
  const [week, setWeek] = useState(() => startOfWeek())
  const [date, setDate] = useState(today)
  const [slot, setSlot] = useState<MealSlot>('dinner')
  const [servings, setServings] = useState(defaultServings ?? 2)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await onSave({ date, slot, servings })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div>
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <span id={`${id}-day`} className={eyebrowClassName}>{weekTitle(week)}</span>
          <div className="flex items-center">
            <button type="button" onClick={() => setWeek(addDays(week, -7))} disabled={week <= startOfWeek()} aria-label="Previous week" className={cx(iconButtonClassName, 'h-9 w-9')}>
              <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <button type="button" onClick={() => setWeek(addDays(week, 7))} aria-label="Next week" className={cx(iconButtonClassName, 'h-9 w-9')}>
              <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>
        <div role="radiogroup" aria-labelledby={`${id}-day`} className="flex flex-wrap gap-1.5">
          {weekDays(week).map((day) => (
            <button
              key={day}
              type="button"
              role="radio"
              aria-checked={day === date}
              disabled={day < today}
              onClick={() => setDate(day)}
              className={cx(chipClassName(day === date), 'min-h-10 disabled:cursor-not-allowed disabled:opacity-40')}
            >
              {day === today ? 'Today' : formatDay(day, { weekday: 'short', day: 'numeric' })}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl label="Meal" value={slot} onChange={setSlot} options={slotOptions} className="max-w-full overflow-x-auto" />
        <ServingsStepper value={servings} onChange={setServings} />
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} className={buttonClassName('ghost')}>Cancel</button>
        <button type="button" onClick={() => void save()} disabled={saving} className={buttonClassName('primary')}>
          <CalendarPlus className="h-4 w-4" strokeWidth={1.75} />
          {saving ? 'Adding…' : `Add to ${formatDay(date, { weekday: 'long' })}`}
        </button>
      </div>
    </div>
  )
}
