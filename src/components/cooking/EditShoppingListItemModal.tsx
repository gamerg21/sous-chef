'use client'

import { useState, useEffect } from 'react'
import type { ShoppingListItem } from './types'
import { Modal } from '../ui/modal'
import { cx } from './utils'

const categories: Array<NonNullable<ShoppingListItem['category']>> = [
  'Produce',
  'Dairy',
  'Meat & Seafood',
  'Pantry',
  'Frozen',
  'Bakery',
  'Other',
]

export interface EditShoppingListItemModalProps {
  isOpen: boolean
  item: ShoppingListItem | null
  onClose: () => void
  onSave: (id: string, updates: { name: string; category?: ShoppingListItem['category'] }) => void
}

export function EditShoppingListItemModal({
  isOpen,
  item,
  onClose,
  onSave,
}: EditShoppingListItemModalProps) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<ShoppingListItem['category'] | ''>('')

  useEffect(() => {
    if (item) {
      setName(item.name)
      setCategory(item.category || '')
    }
  }, [item])

  const handleSave = () => {
    if (!item || !name.trim()) return

    onSave(item.id, {
      name: name.trim(),
      category: category || undefined,
    })
    onClose()
  }

  const handleCancel = () => {
    onClose()
  }

  if (!item) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Update item name:">
      <div className="space-y-4">
        {/* Name field */}
        <div>
          <input
            id="item-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSave()
              }
            }}
            className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            placeholder="Enter item name"
            autoFocus
          />
        </div>

        {/* Category field */}
        <div>
          <label htmlFor="item-category" className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
            Category (optional)
          </label>
          <select
            id="item-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as ShoppingListItem['category'] | '')}
            className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          >
            <option value="">Other</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-100 text-sm font-medium hover:bg-stone-50 dark:hover:bg-stone-900/60 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!name.trim()}
            className={cx(
              'px-4 py-2 rounded-md text-white text-sm font-medium transition-colors',
              name.trim()
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-stone-400 dark:bg-stone-600 cursor-not-allowed'
            )}
          >
            OK
          </button>
        </div>
      </div>
    </Modal>
  )
}

