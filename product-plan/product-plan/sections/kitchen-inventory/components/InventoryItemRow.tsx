import { AlertTriangle, CalendarClock, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import type { InventoryItem, KitchenLocation } from './types'
import { formatQuantity, itemExpiryStatus } from './utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

export interface InventoryItemRowProps {
  item: InventoryItem
  location?: KitchenLocation
  onEdit?: (id: string) => void
  onRemove?: (id: string) => void
}

export function InventoryItemRow({ item, location, onEdit, onRemove }: InventoryItemRowProps) {
  const status = itemExpiryStatus(item)
  const statusPill =
    status === 'expired'
      ? { label: 'Expired', cls: 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200' }
      : status === 'soon'
        ? { label: 'Soon', cls: 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200' }
        : status === 'ok'
          ? { label: 'Fresh', cls: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200' }
          : null

  return (
    <div
      className={cx(
        'rounded-lg border p-4 flex gap-4 items-start',
        'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950'
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="font-medium text-stone-900 dark:text-stone-100 truncate">{item.name}</h3>
              {status === 'expired' && (
                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" strokeWidth={1.75} />
              )}
              {status === 'soon' && (
                <CalendarClock className="w-4 h-4 text-amber-700 dark:text-amber-300 shrink-0" strokeWidth={1.75} />
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-stone-600 dark:text-stone-400">
              <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-stone-100 dark:bg-stone-900/60 text-stone-700 dark:text-stone-200">
                {formatQuantity(item.quantity, item.unit)}
              </span>
              {location && <span className="text-xs">• {location.name}</span>}
              {item.category && <span className="text-xs">• {item.category}</span>}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {statusPill && (
              <span className={cx('text-[11px] font-medium px-2 py-1 rounded-full', statusPill.cls)}>
                {statusPill.label}
              </span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900/60 transition-colors"
                  aria-label="More actions"
                >
                  <MoreHorizontal className="w-4 h-4" strokeWidth={1.75} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit?.(item.id)}>
                  <Pencil className="w-4 h-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => onRemove?.(item.id)}>
                  <Trash2 className="w-4 h-4" />
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {item.expiresOn && (
          <div className="mt-3 text-xs text-stone-500 dark:text-stone-400">
            Expires on <span className="font-mono">{item.expiresOn}</span>
          </div>
        )}

        {item.notes && (
          <div className="mt-2 text-sm text-stone-600 dark:text-stone-300 line-clamp-2">{item.notes}</div>
        )}
      </div>

      {/* Intentionally no always-visible row actions; actions live in the "..." overflow menu above. */}
    </div>
  )
}


