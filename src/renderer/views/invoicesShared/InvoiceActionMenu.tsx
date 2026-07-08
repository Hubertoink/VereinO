import React from 'react'
import { createPortal } from 'react-dom'

type InvoiceActionMenuProps = {
  actions: Array<{ label: string; tone?: 'danger' | 'primary'; onClick: () => void }>
  title?: string
}

export default function InvoiceActionMenu({
  actions,
  title = 'Aktionen'
}: InvoiceActionMenuProps) {
  const [open, setOpen] = React.useState(false)
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const buttonRef = React.useRef<HTMLButtonElement | null>(null)
  const menuRef = React.useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = React.useState<{ top: number; left: number } | null>(null)

  React.useLayoutEffect(() => {
    if (!open) return

    const updatePosition = () => {
      const trigger = buttonRef.current
      const menu = menuRef.current
      if (!trigger) return

      const triggerRect = trigger.getBoundingClientRect()
      const menuWidth = menu?.offsetWidth ?? 168
      const menuHeight = menu?.offsetHeight ?? 0
      const gap = 6
      const viewportPadding = 12
      const maxLeft = window.innerWidth - menuWidth - viewportPadding
      const preferredLeft = triggerRect.right - menuWidth
      const left = Math.max(viewportPadding, Math.min(preferredLeft, maxLeft))

      let top = triggerRect.bottom + gap
      if (menuHeight && top + menuHeight > window.innerHeight - viewportPadding) {
        top = Math.max(viewportPadding, triggerRect.top - menuHeight - gap)
      }

      setPosition({ top, left })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  React.useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  return (
    <>
      <div ref={rootRef} style={{ position: 'relative', display: 'inline-flex' }}>
        <button
          ref={buttonRef}
          type="button"
          className="btn"
          title={title}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          style={{ minWidth: 40, textAlign: 'center' }}
        >
          ...
        </button>
      </div>
      {open && createPortal(
        <div
          ref={menuRef}
          className="card invoice-action-menu"
          role="menu"
          style={position ? { top: position.top, left: position.left } : { visibility: 'hidden' }}
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              className={`btn ${action.tone === 'danger' ? 'danger' : action.tone === 'primary' ? 'primary' : ''}`.trim()}
              onClick={() => {
                setOpen(false)
                action.onClick()
              }}
            >
              {action.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  )
}
