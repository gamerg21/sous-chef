'use client'
// Report, hide and block controls for community content. The exported names
// and props are the interface the community screens build against.
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Ban, EyeOff, Flag, MoreHorizontal, UserCheck } from 'lucide-react'
import type { Author } from '@/lib/community-contract'
import { api } from '@/lib/kitchen/api'
import { useMutation } from '@/lib/kitchen/client'
import { buttonClassName, cx, iconButtonClassName } from '@/components/ui/kit'
import { announce } from './announce'
import { ConfirmDialog } from './ConfirmDialog'
import { ReportDialog } from './ReportDialog'
import { errorMessage } from './logic'

export { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog'
export { ReportDialog, type ReportDialogProps } from './ReportDialog'
export { announce } from './announce'
export { GUIDELINES_URL } from './logic'

const cookName = (cook: Author) => cook.name.trim() || 'this cook'

/** Host cards often navigate on click or key press; nothing inside these controls (menus and dialogs included) should reach them. */
const contained = {
  onClick: (event: { stopPropagation: () => void }) => event.stopPropagation(),
  onKeyDown: (event: { stopPropagation: () => void }) => event.stopPropagation(),
}

export interface RecipeSafetyMenuProps {
  recipe: { id: string; title: string; author: Author }
  /** Called after the recipe was reported or hidden, or its cook blocked. */
  onHidden?: () => void
  className?: string
  /** The viewer's own recipe: there is nothing to report, hide or block, so nothing renders. */
  own?: boolean
}

type MenuPlacement = { style: CSSProperties; container: HTMLElement }
type SafetyDialog = 'report' | 'hide' | 'block' | null
const MENU_WIDTH = 224
const MENU_HEIGHT = 148

/** A "more" menu with Report recipe, Hide recipe and Block cook. */
export function RecipeSafetyMenu({ recipe, onHidden, className, own = false }: RecipeSafetyMenuProps) {
  const menuId = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [placement, setPlacement] = useState<MenuPlacement | null>(null)
  const [dialog, setDialog] = useState<SafetyDialog>(null)
  const hide = useMutation(api.community.hide)
  const queries = useQueryClient()
  const open = placement !== null

  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const dismiss = () => setPlacement(null)
    const outside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) dismiss()
    }
    document.addEventListener('pointerdown', outside)
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', dismiss, true)
    return () => {
      document.removeEventListener('pointerdown', outside)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('scroll', dismiss, true)
    }
  }, [open])

  if (own) return null

  const openMenu = () => {
    const button = trigger.current
    if (!button) return
    const rect = button.getBoundingClientRect()
    const style: CSSProperties = { position: 'fixed', width: MENU_WIDTH }
    // Right-aligned under the button; flipped when it would leave the viewport.
    if (rect.right >= MENU_WIDTH + 8) style.right = Math.max(8, window.innerWidth - rect.right)
    else style.left = Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8))
    if (rect.bottom + 6 + MENU_HEIGHT > window.innerHeight && rect.top > MENU_HEIGHT + 6) style.bottom = window.innerHeight - rect.top + 6
    else style.top = rect.bottom + 6
    // Inside an open dialog the menu has to live in that dialog to be reachable.
    setPlacement({ style, container: button.closest('dialog') ?? document.body })
  }
  const closeMenu = (refocus = true) => {
    setPlacement(null)
    if (refocus) trigger.current?.focus()
  }
  const choose = (next: Exclude<SafetyDialog, null>) => {
    // Focus goes back to the button first, so the dialog returns it there when it closes.
    trigger.current?.focus()
    setPlacement(null)
    setDialog(next)
  }
  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    const index = items.indexOf(document.activeElement as HTMLElement)
    const move = (to: number) => { event.preventDefault(); items[(to + items.length) % items.length]?.focus() }
    if (event.key === 'ArrowDown') move(index + 1)
    else if (event.key === 'ArrowUp') move(index - 1)
    else if (event.key === 'Home') move(0)
    else if (event.key === 'End') move(items.length - 1)
    else if (event.key === 'Escape') { event.preventDefault(); closeMenu() }
    else if (event.key === 'Tab') closeMenu()
  }

  const finish = (message: string) => {
    announce(message)
    onHidden?.()
  }
  const itemClassName = 'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm focus:outline-none focus-visible:bg-stone-100 dark:focus-visible:bg-stone-800'
  const name = cookName(recipe.author)

  return (
    <span className={cx('relative inline-flex', className)} {...contained}>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`More options for ${recipe.title}`}
        onClick={() => (open ? closeMenu(false) : openMenu())}
        onKeyDown={(event) => { if (event.key === 'ArrowDown' && !open) { event.preventDefault(); openMenu() } }}
        className={cx(iconButtonClassName, 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600')}
      >
        <MoreHorizontal className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
      </button>
      {placement && createPortal(
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label={`Options for ${recipe.title}`}
          style={placement.style}
          onKeyDown={onMenuKeyDown}
          className="animate-pop-in z-[9999] rounded-2xl border border-stone-200 bg-white p-1.5 text-stone-800 shadow-xl dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
        >
          <button type="button" role="menuitem" tabIndex={-1} onClick={() => choose('report')} className={cx(itemClassName, 'hover:bg-stone-100 dark:hover:bg-stone-800')}>
            <Flag className="h-4 w-4 shrink-0 text-stone-500 dark:text-stone-400" strokeWidth={1.75} aria-hidden="true" />
            Report recipe
          </button>
          <button type="button" role="menuitem" tabIndex={-1} onClick={() => choose('hide')} className={cx(itemClassName, 'hover:bg-stone-100 dark:hover:bg-stone-800')}>
            <EyeOff className="h-4 w-4 shrink-0 text-stone-500 dark:text-stone-400" strokeWidth={1.75} aria-hidden="true" />
            Hide recipe
          </button>
          <button type="button" role="menuitem" tabIndex={-1} onClick={() => choose('block')} className={cx(itemClassName, 'text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/30')}>
            <Ban className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span className="min-w-0 truncate">Block {name}</span>
          </button>
        </div>,
        placement.container
      )}
      <ReportDialog
        isOpen={dialog === 'report'}
        recipeId={recipe.id}
        onClose={(reported) => {
          setDialog(null)
          if (!reported) return
          // Reporting hid the recipe on this account: lists reload now that the dialog is done.
          void queries.invalidateQueries({ queryKey: ['kitchen'] })
          finish('Report sent. The recipe is hidden for you.')
        }}
      />
      <ConfirmDialog
        isOpen={dialog === 'hide'}
        onClose={() => setDialog(null)}
        title="Hide this recipe?"
        message={<>You won’t see “{recipe.title}” in the community anymore. You can bring it back from Hidden &amp; blocked.</>}
        confirmText="Hide recipe"
        busyText="Hiding…"
        onConfirm={async () => {
          await hide({ kind: 'recipe', key: recipe.id, label: recipe.title, hidden: true })
          finish(`Hidden “${recipe.title}”.`)
        }}
      />
      <ConfirmDialog
        isOpen={dialog === 'block'}
        onClose={() => setDialog(null)}
        title={`Block ${name}?`}
        message={<>You won’t see recipes or tips from {name} anymore. They aren’t told. You can unblock them from Hidden &amp; blocked.</>}
        confirmText="Block cook"
        busyText="Blocking…"
        danger
        onConfirm={async () => {
          await hide({ kind: 'author', key: recipe.author.id, label: recipe.author.name, hidden: true })
          finish(`Blocked ${name}.`)
        }}
      />
    </span>
  )
}

export interface TipReportButtonProps {
  recipeId: string
  tipId: string
  onReported?: () => void
  className?: string
}
/** A small "Report" control beside one "made it" tip. */
export function TipReportButton({ recipeId, tipId, onReported, className }: TipReportButtonProps) {
  const [open, setOpen] = useState(false)
  const queries = useQueryClient()
  return (
    <span className={cx('inline-flex', className)} {...contained}>
      <button
        type="button"
        aria-label="Report this tip"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
      >
        <Flag className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        Report
      </button>
      <ReportDialog
        isOpen={open}
        recipeId={recipeId}
        tipId={tipId}
        onClose={(reported) => {
          setOpen(false)
          if (!reported) return
          void queries.invalidateQueries({ queryKey: ['kitchen'] })
          announce('Report sent.')
          onReported?.()
        }}
      />
    </span>
  )
}

export interface BlockCookButtonProps {
  cook: Author
  blocked: boolean
  onChange?: (blocked: boolean) => void
  className?: string
}
/** Block or unblock a cook from their profile page. */
export function BlockCookButton({ cook, blocked, onChange, className }: BlockCookButtonProps) {
  const hide = useMutation(api.community.hide)
  const running = useRef(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const name = cookName(cook)

  const set = async (next: boolean) => {
    await hide({ kind: 'author', key: cook.id, label: cook.name, hidden: next })
    announce(next ? `Blocked ${name}.` : `Unblocked ${name}.`)
    onChange?.(next)
  }
  const unblock = async () => {
    if (running.current) return
    running.current = true
    setBusy(true)
    setError('')
    try {
      await set(false)
    } catch (failure) {
      setError(errorMessage(failure, 'Couldn’t unblock. Try again.'))
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  return (
    <span className={cx('inline-flex flex-col items-start gap-1', className)} {...contained}>
      {blocked ? (
        <button type="button" disabled={busy} aria-busy={busy} onClick={() => void unblock()} className={cx(buttonClassName('secondary'), 'min-h-11')}>
          <UserCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          {busy ? 'Unblocking…' : <>Unblock<span className="sr-only"> {name}</span></>}
        </button>
      ) : (
        <button type="button" aria-haspopup="dialog" onClick={() => { setError(''); setConfirming(true) }} className={cx(buttonClassName('secondary'), 'min-h-11 text-rose-700 dark:text-rose-300')}>
          <Ban className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Block<span className="sr-only"> {name}</span>
        </button>
      )}
      <span role="alert" className={cx('text-sm font-medium text-rose-700 dark:text-rose-300', !error && 'hidden')}>{error}</span>
      <ConfirmDialog
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        title={`Block ${name}?`}
        message={<>You won’t see recipes or tips from {name} anymore. They aren’t told. You can unblock them here or from Hidden &amp; blocked.</>}
        confirmText="Block cook"
        busyText="Blocking…"
        danger
        onConfirm={() => set(true)}
      />
    </span>
  )
}
