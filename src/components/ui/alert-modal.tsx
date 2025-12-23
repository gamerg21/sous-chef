'use client'

import { Modal } from './modal'
import { cx } from '../cooking/utils'

export interface AlertModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  message: string
  variant?: 'success' | 'error' | 'info' | 'warning'
  buttonText?: string
}

export function AlertModal({
  isOpen,
  onClose,
  title,
  message,
  variant = 'info',
  buttonText = 'OK',
}: AlertModalProps) {
  const getVariantStyles = () => {
    switch (variant) {
      case 'success':
        return 'bg-emerald-600 hover:bg-emerald-700'
      case 'error':
        return 'bg-red-600 hover:bg-red-700'
      case 'warning':
        return 'bg-amber-600 hover:bg-amber-700'
      default:
        return 'bg-stone-600 hover:bg-stone-700'
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-4">
        <p className="text-stone-700 dark:text-stone-300">{message}</p>
        
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className={cx(
              'px-4 py-2 rounded-md text-white text-sm font-medium transition-colors',
              getVariantStyles()
            )}
          >
            {buttonText}
          </button>
        </div>
      </div>
    </Modal>
  )
}


