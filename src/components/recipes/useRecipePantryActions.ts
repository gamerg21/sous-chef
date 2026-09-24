'use client'

import { useCallback } from 'react'
import { useMutation } from '@/lib/kitchen/client'
import { api } from '@/lib/kitchen/api'
import { parseAmount } from '@/lib/units'
import type { NewPantryItem } from './IngredientComposer'

/** Pantry and shopping-list actions the recipe editor offers while adding ingredients. */
export function useRecipePantryActions() {
  const createInventoryItem = useMutation(api.inventory.create)
  const addShoppingItem = useMutation(api.shoppingList.addItem)

  // Tracked at zero: it shows as out of stock until bought or updated.
  const onAddPantryItem = useCallback(async ({ name, unit, locationId }: NewPantryItem) => {
    await createInventoryItem({ name, unit, locationId, quantity: 0 })
  }, [createInventoryItem])

  const onAddToShoppingList = useCallback(async ({ name, quantity, unit }: { name: string; quantity?: string; unit?: string }) => {
    const amount = quantity ? parseAmount(quantity) : null
    await addShoppingItem({ name, quantity: amount && amount > 0 ? amount : undefined, unit: unit || undefined, source: 'recipe' })
  }, [addShoppingItem])

  return { onAddPantryItem, onAddToShoppingList }
}
