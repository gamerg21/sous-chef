'use client'

import { Modal } from '../ui/modal'
import { ShoppingItemForm, type ShoppingItemValues } from './ShoppingItemForm'

export interface AddShoppingListItemModalProps {
  isOpen: boolean
  onClose: () => void
  prefill?: Partial<ShoppingItemValues> | null
  onSave: (values: ShoppingItemValues) => void | Promise<void>
}

export function AddShoppingListItemModal({ isOpen, onClose, prefill, onSave }: AddShoppingListItemModalProps) {
  return <Modal isOpen={isOpen} onClose={onClose} title="Add item">
    <ShoppingItemForm initial={{ name: '', ...prefill }} onSave={onSave} onClose={onClose} submitLabel="Add item" />
  </Modal>
}
