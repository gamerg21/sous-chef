'use client'

import { useState } from 'react'
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

export interface AddShoppingListItemModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (itemData: { name: string; quantity?: number; unit?: string; category?: ShoppingListItem['category'] }) => void
}

export function AddShoppingListItemModal({
  isOpen,
  onClose,
  onSave,
}: AddShoppingListItemModalProps) {
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('')
  const [category, setCategory] = useState<ShoppingListItem['category'] | ''>('')

  const handleSave = () => {
    if (!name.trim()) return

    onSave({
      name: name.trim(),
      quantity: quantity.trim() ? parseFloat(quantity.trim()) : undefined,
      unit: unit.trim() || undefined,
      category: category || undefined,
    })
    
    // Reset form
    setName('')
    setQuantity('')
    setUnit('')
    setCategory('')
    onClose()
  }

  const handleCancel = () => {
    // Reset form
    setName('')
    setQuantity('')
    setUnit('')
    setCategory('')
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add item">
      <div className="space-y-4">
        {/* Name field */}
        <div>
          <label htmlFor="item-name" className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
            Item name *
          </label>
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

        {/* Quantity field */}
        <div>
          <label htmlFor="item-quantity" className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
            Quantity (optional)
          </label>
          <input
            id="item-quantity"
            type="number"
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            placeholder="e.g., 2"
          />
        </div>

        {/* Unit field */}
        <div>
          <label htmlFor="item-unit" className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
            Unit (optional)
          </label>
          <input
            id="item-unit"
            type="text"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            placeholder="e.g., cup, lb, kg, count"
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
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-stone-400 dark:bg-stone-600 cursor-not-allowed'
            )}
          >
            Add
          </button>
        </div>
      </div>
    </Modal>
  )
}

