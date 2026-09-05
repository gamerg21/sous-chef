'use client'

import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cx } from '../cooking/utils'

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  className?: string
}

// Multiple dialogs (e.g. the unit picker inside a form) share a scroll lock.
let openDialogs = 0
let originalOverflow = ''

export function Modal({ isOpen, onClose, title, children, className }: ModalProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const mouseDownTarget = useRef<EventTarget | null>(null)
  const titleId = useId()

  useEffect(() => {
    if (!isOpen || !dialog.current) return
    const element = dialog.current
    const previousFocus = document.activeElement as HTMLElement | null
    element.showModal()
    if (openDialogs++ === 0) {
      originalOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    return () => {
      element.close()
      if (--openDialogs === 0) document.body.style.overflow = originalOverflow
      if (previousFocus?.isConnected && previousFocus !== document.body) previousFocus.focus()
      else {
        const parent = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]')).at(-1)
        parent?.querySelector<HTMLElement>('input, button, select, textarea, [tabindex="0"]')?.focus()
      }
    }
  }, [isOpen])

  if (!isOpen || typeof document === 'undefined') return null

  return createPortal(
    <dialog
      ref={dialog}
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : 'Dialog'}
      className="fixed inset-0 m-0 flex h-dvh max-h-none w-screen max-w-none items-center justify-center border-0 bg-transparent p-3 text-stone-900 backdrop:bg-black/50 sm:p-6 dark:text-stone-100"
      onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onClose() }}
      onMouseDown={(event) => { mouseDownTarget.current = event.target }}
      onClick={(event) => {
        if (event.target === event.currentTarget && mouseDownTarget.current === event.currentTarget) onClose()
        mouseDownTarget.current = null
      }}
    >
      <div className={cx('relative flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl dark:border-stone-800 dark:bg-stone-950', className)}>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-stone-200 px-5 py-3 dark:border-stone-800">
          {title ? <h2 id={titleId} className="min-w-0 text-lg font-semibold">{title}</h2> : <span />}
          <button type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-emerald-600 dark:hover:bg-stone-800" aria-label="Close">
            <X className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6">{children}</div>
      </div>
    </dialog>, document.body
  )
}
