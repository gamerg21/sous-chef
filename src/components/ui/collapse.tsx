import { cx } from '../cooking/utils'

/**
 * Smoothly expands and collapses its content by animating the grid row from
 * 0fr to 1fr, so no height needs measuring. Closed content stays mounted but inert.
 */
export function Collapse({ open, children, className }: { open: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div
      inert={!open}
      className={cx(
        'grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]',
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        className
      )}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}
