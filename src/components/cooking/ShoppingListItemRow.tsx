import { unitLabel } from '@/lib/units'
import { useState, useEffect } from 'react'
import { Check, Pencil, Trash2 } from 'lucide-react'
import type { ShoppingListItem } from './types'
import { cx } from './utils'
import { Pill, iconButtonClassName } from '../ui/kit'

export interface ShoppingListItemRowProps {
  item: ShoppingListItem
  onToggle?: (id: string) => void
  onEdit?: (id: string) => void
  onRemove?: (id: string) => void
  isDeleting?: boolean
}

export function ShoppingListItemRow({ item, onToggle, onEdit, onRemove, isDeleting = false }: ShoppingListItemRowProps) {
  const checked = Boolean(item.checked)
  const [isAnimating, setIsAnimating] = useState(false)
  const [wasChecked, setWasChecked] = useState(checked)

  // Track checked state changes for animation
  useEffect(() => {
    if (checked !== wasChecked) {
      // Defer state updates to avoid synchronous setState in effect
      const timer1 = setTimeout(() => {
        setIsAnimating(true)
        setWasChecked(checked)
      }, 0)
      const timer2 = setTimeout(() => setIsAnimating(false), 300)
      return () => {
        clearTimeout(timer1)
        clearTimeout(timer2)
      }
    }
  }, [checked, wasChecked])

  const amount = typeof item.quantity === 'number' ? `${item.quantity} ${unitLabel(item.unit, item.quantity)}`.trim() : null

  return (
    <div
      className={cx(
        'flex items-center gap-2 py-1 pl-2 pr-2 sm:pr-3',
        'transition-[opacity,translate] duration-300 ease-in-out',
        isDeleting ? 'pointer-events-none -translate-x-4 opacity-0' : 'translate-x-0 opacity-100'
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={item.name}
        onClick={() => onToggle?.(item.id)}
        className="group flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 text-left focus-visible:outline-2 focus-visible:outline-emerald-600"
      >
        <span
          aria-hidden="true"
          className={cx(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2',
            'transition-[transform,background-color,border-color] duration-300 ease-in-out',
            isAnimating && checked ? 'scale-110' : 'scale-100',
            checked
              ? 'border-emerald-600 bg-emerald-600 text-white'
              : 'border-stone-300 bg-white text-transparent group-hover:border-emerald-400 dark:border-stone-600 dark:bg-stone-950 dark:group-hover:border-emerald-500'
          )}
        >
          <Check
            className={cx('h-3.5 w-3.5 transition-[opacity,transform] duration-300 ease-in-out', checked ? 'scale-100 opacity-100' : 'scale-0 opacity-0')}
            strokeWidth={3}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span
              className={cx(
                'truncate text-base font-medium transition-colors duration-300',
                checked ? 'text-stone-400 line-through decoration-stone-300 dark:text-stone-500 dark:decoration-stone-600' : 'text-stone-900 dark:text-stone-100'
              )}
            >
              {item.name}
            </span>
            {amount && (
              <span className={cx('text-sm tabular-nums', checked ? 'text-stone-400 dark:text-stone-500' : 'text-stone-500 dark:text-stone-400')}>{amount}</span>
            )}
          </span>
          {(item.source === 'from-recipe' || item.source === 'low-stock' || item.note) && (
            <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
              {item.source === 'from-recipe' ? (
                <Pill tone="success">From recipe</Pill>
              ) : item.source === 'low-stock' ? (
                <Pill tone="warning">Low stock</Pill>
              ) : null}
              {item.note && <span className="truncate text-sm text-stone-500 dark:text-stone-400">{item.note}</span>}
            </span>
          )}
        </span>
      </button>

      <div className="flex shrink-0 items-center">
        {onEdit ? (
          <button type="button" onClick={() => onEdit(item.id)} className={cx(iconButtonClassName, 'h-11 w-11')} aria-label={`Edit ${item.name}`} title="Edit">
            <Pencil className="h-4 w-4" strokeWidth={1.75} />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onRemove?.(item.id)}
          className={cx(iconButtonClassName, 'h-11 w-11 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 dark:hover:text-rose-400')}
          aria-label={`Remove ${item.name}`}
          title="Remove"
        >
          <Trash2 className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  )
}
