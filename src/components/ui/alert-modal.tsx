'use client'

import { Modal } from './modal'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { IconBadge, buttonClassName, cx } from './kit'

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
  const icon =
    variant === 'success' ? CheckCircle2 : variant === 'error' ? XCircle : variant === 'warning' ? AlertTriangle : Info
  const tone = variant === 'success' ? 'success' : variant === 'error' ? 'danger' : variant === 'warning' ? 'warning' : 'info'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <IconBadge icon={icon} tone={tone} />
          <p className="pt-1.5 text-base text-stone-700 dark:text-stone-300">{message}</p>
        </div>
        <button type="button" onClick={onClose} className={cx(buttonClassName(variant === 'error' ? 'secondary' : 'primary'), 'min-h-11 w-full')}>
          {buttonText}
        </button>
      </div>
    </Modal>
  )
}
