// Plan days are calendar days ("YYYY-MM-DD") in the browser's time zone. Weeks start on Monday.

export function dayKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function parseDay(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function addDays(key: string, days: number): string {
  const date = parseDay(key)
  date.setDate(date.getDate() + days)
  return dayKey(date)
}

export function startOfWeek(date = new Date()): string {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7))
  return dayKey(day)
}

export function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(start, index))
}

export function formatDay(key: string, options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return parseDay(key).toLocaleDateString(undefined, options)
}

/** "This week", "Next week", "Last week", or "Week of 5 Oct". */
export function weekTitle(start: string, today = new Date()): string {
  const offset = Math.round((parseDay(start).getTime() - parseDay(startOfWeek(today)).getTime()) / (7 * 86_400_000))
  if (offset === 0) return 'This week'
  if (offset === 1) return 'Next week'
  if (offset === -1) return 'Last week'
  return `Week of ${formatDay(start, { day: 'numeric', month: 'short' })}`
}

export const mealSlots = ['breakfast', 'lunch', 'dinner', 'snack'] as const
export type MealSlot = (typeof mealSlots)[number]
export const slotLabels: Record<MealSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' }
