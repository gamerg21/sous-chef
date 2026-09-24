import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import type { InventoryItem, KitchenLocation } from './types'
import { formatDate, formatQuantity, itemExpiryStatus } from './utils'
import { locationIcon } from './LocationTabs'
import { IconBadge, Pill, cx, iconButtonClassName } from '@/components/ui/kit'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface InventoryItemRowProps {
  item: InventoryItem
  location?: KitchenLocation
  dateFormat?: string | null
  onEdit?: (id: string) => void
  onRemove?: (id: string) => void
  isDeleting?: boolean
}

export function InventoryItemRow({ item, location, dateFormat, onEdit, onRemove, isDeleting = false }: InventoryItemRowProps) {
  const status = itemExpiryStatus(item)
  const formattedExpiry = formatDate(item.expiresOn, dateFormat ?? 'YYYY-MM-DD')
  const outOfStock = item.quantity <= 0
  // The badge tone mirrors the most urgent state so the list scans at a glance.
  const badgeTone = status === 'expired' ? 'danger' : status === 'soon' || outOfStock ? 'warning' : 'success'
  const facts = item.foodFacts
  const factChips = [
    facts?.nutriscoreGrade && `Nutri-Score ${facts.nutriscoreGrade.toUpperCase()}`,
    facts?.novaGroup && `NOVA ${facts.novaGroup}`,
    facts?.allergensTags && facts.allergensTags.length > 0 && `Allergens: ${facts.allergensTags.length}`,
  ].filter(Boolean) as string[]

  return (
    <div
      className={cx(
        'flex items-start gap-3 px-4 py-3.5 sm:gap-4',
        'transition-[opacity,translate] duration-300 ease-in-out',
        isDeleting ? 'pointer-events-none -translate-x-4 opacity-0' : 'translate-x-0 opacity-100'
      )}
    >
      <div className="pt-0.5">
        <IconBadge icon={locationIcon(item.locationId)} tone={badgeTone} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="min-w-0 truncate text-base font-medium text-stone-900 dark:text-stone-100">{item.name}</h3>
          {outOfStock && <Pill tone="warning">Out of stock</Pill>}
          {status === 'expired' && <Pill tone="danger">Expired</Pill>}
          {status === 'soon' && <Pill tone="warning">Expires soon</Pill>}
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-stone-500 dark:text-stone-400">
          {!outOfStock && (
            <span className="font-medium tabular-nums text-stone-700 dark:text-stone-300">{formatQuantity(item.quantity, item.unit)}</span>
          )}
          {[location?.name, item.category].filter(Boolean).map((part, index) => (
            <span key={index} className="flex items-center gap-x-1.5">
              {(index > 0 || !outOfStock) && <span aria-hidden="true">·</span>}
              {part}
            </span>
          ))}
          {formattedExpiry && (
            <span className="flex items-center gap-x-1.5">
              <span aria-hidden="true">·</span>
              <span className={cx(status === 'expired' && 'text-rose-700 dark:text-rose-300', status === 'soon' && 'text-amber-700 dark:text-amber-300')}>
                Expires <span className="tabular-nums">{formattedExpiry}</span>
              </span>
            </span>
          )}
        </div>

        {item.notes && <p className="mt-1.5 line-clamp-2 text-sm text-stone-600 dark:text-stone-300">{item.notes}</p>}

        {factChips.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {factChips.map((chip) => (
              <Pill key={chip}>{chip}</Pill>
            ))}
          </div>
        )}
      </div>

      {/* Intentionally no always-visible row actions; they live in the overflow menu. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={cx(iconButtonClassName, '-mr-2 h-11 w-11')} aria-label="More actions">
            <MoreHorizontal className="h-5 w-5" strokeWidth={1.75} />
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
  )
}
