'use client'

import { Modal } from './modal'
import { buttonClassName, cx } from './kit'

export interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  confirmVariant?: 'danger' | 'primary'
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'OK',
  cancelText = 'Cancel',
  confirmVariant = 'primary',
}: ConfirmModalProps) {
  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-5">
        <p className="text-base text-stone-600 dark:text-stone-300">{message}</p>
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className={cx(buttonClassName('ghost'), 'min-h-11 flex-1')}>
            {cancelText}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className={cx(buttonClassName(confirmVariant === 'danger' ? 'danger' : 'primary'), 'min-h-11 flex-[2]')}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  )
}
