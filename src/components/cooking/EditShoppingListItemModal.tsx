'use client'

import type { ShoppingListItem } from './types'
import { Modal } from '../ui/modal'
import { ShoppingItemForm, type ShoppingItemValues } from './ShoppingItemForm'

export interface EditShoppingListItemModalProps {
  isOpen: boolean
  item: ShoppingListItem | null
  onClose: () => void
  onSave: (id: string, values: ShoppingItemValues) => void | Promise<void>
}

export function EditShoppingListItemModal({ isOpen, item, onClose, onSave }: EditShoppingListItemModalProps) {
  if (!item) return null
  return <Modal isOpen={isOpen} onClose={onClose} title="Edit shopping item">
    <ShoppingItemForm key={item.id} initial={item} onSave={values => onSave(item.id, values)} onClose={onClose} submitLabel="Save changes" />
  </Modal>
}
