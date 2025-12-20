import { Check, Pencil, Trash2 } from 'lucide-react'
import type { ShoppingListItem } from './types'
import { cx } from './utils'

export interface ShoppingListItemRowProps {
  item: ShoppingListItem
  onToggle?: (id: string) => void
  onEdit?: (id: string) => void
  onRemove?: (id: string) => void
}

export function ShoppingListItemRow({ item, onToggle, onEdit, onRemove }: ShoppingListItemRowProps) {
  const checked = Boolean(item.checked)

  return (
    <div
      className={cx(
        'rounded-lg border p-4 flex items-start justify-between gap-4 transition-colors',
        checked
          ? 'border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/30'
          : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950'
      )}
    >
      <button type="button" onClick={() => onToggle?.(item.id)} className="flex items-start gap-3 text-left min-w-0">
        <span
          className={cx(
            'mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0',
            checked
              ? 'border-emerald-600 bg-emerald-600 text-white'
              : 'border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-transparent'
          )}
        >
          <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
        </span>
        <span className="min-w-0">
          <div className={cx('font-medium', checked ? 'text-stone-500 line-through' : 'text-stone-900 dark:text-stone-100')}>
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
            className="p-2 rounded-md text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            title="Edit"
          >
            <Pencil className="w-4 h-4" strokeWidth={1.75} />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onRemove?.(item.id)}
          className="p-2 rounded-md text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          title="Remove"
        >
          <Trash2 className="w-4 h-4" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  )
}


