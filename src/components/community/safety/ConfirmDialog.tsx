'use client'
import { useRef, useState, type ReactNode } from 'react'
import { Modal } from '@/components/ui/modal'
import { buttonClassName, cx } from '@/components/ui/kit'
import { errorMessage } from './logic'

export interface ConfirmDialogProps {
  isOpen: boolean
  /** Called on cancel, and after `onConfirm` resolved. */
  onClose: () => void
  /** Runs once per press; a rejection is shown in the dialog and it stays open. */
  onConfirm: () => Promise<void>
  title: string
  message: ReactNode
  confirmText: string
  busyText?: string
  danger?: boolean
  /** Extra fields between the message and the buttons. */
  children?: ReactNode
}

/** A confirmation that waits for its action: no double submits, errors stay in view. */
export function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, confirmText, busyText = 'Working…', danger = false, children }: ConfirmDialogProps) {
  const running = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const close = () => {
    if (running.current) return
    setError('')
    onClose()
  }
  const confirm = async () => {
    if (running.current) return
    running.current = true
    setBusy(true)
    setError('')
    try {
      await onConfirm()
      running.current = false
      setBusy(false)
      onClose()
    } catch (failure) {
      running.current = false
      setBusy(false)
      setError(errorMessage(failure))
    }
  }
  return (
    <Modal isOpen={isOpen} onClose={close} title={title}>
      <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); void confirm() }}>
        <p className="break-words text-base text-stone-700 dark:text-stone-300">{message}</p>
        {children}
        <p role="alert" className={cx('text-sm font-medium text-rose-700 dark:text-rose-300', !error && 'hidden')}>{error}</p>
        <div className="flex gap-3">
          <button type="button" onClick={close} disabled={busy} className={cx(buttonClassName('ghost'), 'min-h-11 flex-1')}>Cancel</button>
          <button type="submit" disabled={busy} aria-busy={busy} className={cx(buttonClassName(danger ? 'danger' : 'primary'), 'min-h-11 flex-[2]')}>{busy ? busyText : confirmText}</button>
        </div>
      </form>
    </Modal>
  )
}
