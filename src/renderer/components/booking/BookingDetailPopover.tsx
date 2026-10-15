import React, { useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconX } from '@tabler/icons-react'

/** Small editor anchored to its trigger, outside the inspector's scroll area. */
export default function BookingDetailPopover({
  label,
  trigger,
  children,
  disabled = false,
  triggerClassName = '',
  panelClassName = ''
}: {
  label: string
  trigger: React.ReactNode
  children: React.ReactNode | ((close: () => void) => React.ReactNode)
  disabled?: boolean
  triggerClassName?: string
  panelClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const id = useId()
  const close = () => {
    setOpen(false)
    button.current?.focus()
  }
  useLayoutEffect(() => {
    if (!open) return
    const position = () => {
      if (!button.current || !panel.current) return
      const rect = button.current.getBoundingClientRect()
      const popup = panel.current
      popup.style.left = `${Math.max(12, Math.min(rect.right - popup.offsetWidth, window.innerWidth - popup.offsetWidth - 12))}px`
      popup.style.top = `${Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - popup.offsetHeight - 12))}px`
    }
    position()
    panel.current?.focus()
    const observer = new ResizeObserver(position)
    if (panel.current) observer.observe(panel.current)
    const dismiss = (event: PointerEvent) => {
      if (
        !panel.current?.contains(event.target as Node) &&
        !button.current?.contains(event.target as Node)
      )
        setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      button.current?.focus()
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape, true)
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      observer.disconnect()
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', escape, true)
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
    }
  }, [open])
  return (
    <>
      <button
        ref={button}
        type="button"
        className={`btn ghost bp-detail-popover-trigger ${triggerClassName}`}
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? id : undefined}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role="dialog"
            aria-label={label}
            tabIndex={-1}
            className={`bp-detail-popover ${panelClassName}`}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                close()
              }
              if (event.key === 'Tab') {
                event.stopPropagation()
                const fields = Array.from(panel.current?.querySelectorAll<HTMLElement>(
                  'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary'
                ) || []).filter(element => element.getClientRects().length > 0)
                if (!fields?.length) return
                const first = fields[0],
                  last = fields[fields.length - 1]
                if (
                  event.shiftKey &&
                  (document.activeElement === first || document.activeElement === panel.current)
                ) {
                  event.preventDefault()
                  last.focus()
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault()
                  first.focus()
                }
              }
            }}
          >
            <div className="bp-detail-popover-heading">
              <strong>{label}</strong>
              <button
                type="button"
                className="btn ghost"
                aria-label="Auswahl schließen"
                onClick={close}
              >
                <IconX size={16} />
              </button>
            </div>
            {typeof children === 'function' ? children(close) : children}
          </div>,
          document.body
        )}
    </>
  )
}
