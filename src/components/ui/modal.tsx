'use client'

import { useEffect, useId, useRef, useState } from 'react'
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

const EXIT_MS = 150

export function Modal({ isOpen, onClose, title, children, className }: ModalProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const mouseDownTarget = useRef<EventTarget | null>(null)
  const titleId = useId()
  // Stay mounted briefly after closing so the exit animation can play, showing
  // the last open content even if the parent has already cleared its data.
  const [mounted, setMounted] = useState(isOpen)
  const [snapshot, setSnapshot] = useState({ title, children })
  if (isOpen && !mounted) setMounted(true)
  if (isOpen && (snapshot.title !== title || snapshot.children !== children)) setSnapshot({ title, children })
  const closing = mounted && !isOpen
  const content = isOpen ? { title, children } : snapshot

  useEffect(() => {
    if (!closing) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const id = setTimeout(() => setMounted(false), reduced ? 0 : EXIT_MS)
    return () => clearTimeout(id)
  }, [closing])

  useEffect(() => {
    if (!mounted || !dialog.current) return
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
  }, [mounted])

  if (!mounted || typeof document === 'undefined') return null

  return createPortal(
    <dialog
      ref={dialog}
      data-closing={closing || undefined}
      aria-labelledby={content.title ? titleId : undefined}
      aria-label={content.title ? undefined : 'Dialog'}
      className="fixed inset-0 m-0 flex h-dvh max-h-none w-screen max-w-none items-center justify-center border-0 bg-transparent p-3 text-stone-900 backdrop:bg-black/50 sm:p-6 dark:text-stone-100"
      onCancel={(event) => { event.preventDefault(); event.stopPropagation(); if (!closing) onClose() }}
      onMouseDown={(event) => { mouseDownTarget.current = event.target }}
      onClick={(event) => {
        if (event.target === event.currentTarget && mouseDownTarget.current === event.currentTarget) onClose()
        mouseDownTarget.current = null
      }}
    >
      <div className={cx('relative flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-2xl dark:border-stone-800 dark:bg-stone-950', className)}>
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-1 pt-4 sm:px-6">
          {content.title ? <h2 id={titleId} className="min-w-0 text-lg font-semibold tracking-tight" style={{ fontFamily: 'var(--font-heading)' }}>{content.title}</h2> : <span />}
          <button type="button" onClick={onClose} className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-emerald-600 dark:hover:bg-stone-800" aria-label="Close">
            <X className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-5 pt-3 sm:px-6 sm:pb-6">{content.children}</div>
      </div>
    </dialog>, document.body
  )
}
