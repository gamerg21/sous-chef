import { useState, useEffect } from 'react'
import { Check, Pencil, Trash2 } from 'lucide-react'
import type { ShoppingListItem } from './types'
import { cx } from './utils'

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
      setIsAnimating(true)
      const timer = setTimeout(() => setIsAnimating(false), 300)
      setWasChecked(checked)
      return () => clearTimeout(timer)
    }
  }, [checked, wasChecked])

  return (
    <div
      className={cx(
        'rounded-lg border p-4 flex items-start justify-between gap-4',
        'transition-[opacity,transform,background-color,border-color] duration-300 ease-in-out',
        isDeleting
          ? 'opacity-0 scale-95 -translate-x-4 pointer-events-none'
          : 'opacity-100 scale-100 translate-x-0',
        checked
          ? 'border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/30'
          : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950'
      )}
    >
      <button 
        type="button" 
        onClick={() => onToggle?.(item.id)} 
        className="flex items-start gap-3 text-left min-w-0 group"
      >
        <span
          className={cx(
            'mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0',
            'transition-[transform,background-color,border-color,box-shadow] duration-300 ease-in-out',
            isAnimating && checked ? 'scale-110' : 'scale-100',
            checked
              ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
              : 'border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-transparent group-hover:border-emerald-400 dark:group-hover:border-emerald-500'
          )}
        >
          <Check 
            className={cx(
              'w-3.5 h-3.5 transition-[opacity,transform] duration-300 ease-in-out',
              checked ? 'opacity-100 scale-100' : 'opacity-0 scale-0'
            )} 
            strokeWidth={2.5} 
          />
        </span>
        <span className="min-w-0">
          <div 
            className={cx(
              'font-medium transition-[color,text-decoration] duration-300 ease-in-out',
              checked 
                ? 'text-stone-500 line-through' 
                : 'text-stone-900 dark:text-stone-100'
            )}
          >
            {item.name}
          </div>
          <div className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">
            {item.category ? <span>{item.category}</span> : <span>Other</span>}
            {typeof item.quantity === 'number' ? (
              <span>
                {' '}
                • {item.quantity} {item.unit ?? ''}
              </span>
            ) : null}
            {item.source === 'from-recipe' ? <span> • from recipe</span> : item.source === 'low-stock' ? <span> • low stock</span> : null}
            {item.note ? <span> • {item.note}</span> : null}
          </div>
        </span>
      </button>

      <div className="shrink-0 flex items-center gap-1">
        {onEdit ? (
          <button
            type="button"
            onClick={() => onEdit(item.id)}
            className="p-2 rounded-md text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-[color,background-color,transform] duration-200 ease-in-out hover:scale-110"
            title="Edit"
          >
            <Pencil className="w-4 h-4" strokeWidth={1.75} />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onRemove?.(item.id)}
          className="p-2 rounded-md text-stone-400 hover:text-red-600 dark:text-stone-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-[color,background-color,transform] duration-200 ease-in-out hover:scale-110"
          title="Remove"
        >
          <Trash2 className="w-4 h-4" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  )
}
