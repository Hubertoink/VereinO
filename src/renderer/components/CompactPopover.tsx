import React, { useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { IconX } from '@tabler/icons-react'
import './compactPopover.css'

export default function CompactPopover({ label, anchor, onClose, children, className = '' }: {
  label: string
  anchor: { x: number; y: number; trigger: HTMLElement }
  onClose: () => void
  children: React.ReactNode
  className?: string
}) {
  const panel = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const close = () => { closeRef.current(); if (anchor.trigger.isConnected) anchor.trigger.focus() }
  useLayoutEffect(() => {
    const position = () => {
      const popup = panel.current
      if (!popup) return
      popup.style.left = `${Math.max(8, Math.min(anchor.x, window.innerWidth - popup.offsetWidth - 8))}px`
      popup.style.top = `${Math.max(8, Math.min(anchor.y, window.innerHeight - popup.offsetHeight - 8))}px`
    }
    position()
    panel.current?.focus()
    const observer = new ResizeObserver(position)
    if (panel.current) observer.observe(panel.current)
    const dismiss = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !anchor.trigger.contains(event.target as Node)) closeRef.current()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      closeRef.current()
      if (anchor.trigger.isConnected) anchor.trigger.focus()
    }
    const dismissOnResize = () => closeRef.current()
    document.addEventListener('pointerdown', dismiss, true)
    document.addEventListener('keydown', escape, true)
    window.addEventListener('resize', dismissOnResize)
    return () => {
      observer.disconnect()
      document.removeEventListener('pointerdown', dismiss, true)
      document.removeEventListener('keydown', escape, true)
      window.removeEventListener('resize', dismissOnResize)
    }
  }, [anchor])
  return createPortal(<div ref={panel} role="dialog" aria-label={label} tabIndex={-1}
    className={`compact-popover ${className}`} onContextMenu={event => { event.preventDefault(); event.stopPropagation() }}
    onKeyDown={event => {
      event.stopPropagation()
      if (event.key !== 'Tab') return
      const fields = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled)') || [])
      const first = fields[0], last = fields[fields.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }}>
    <div className="compact-popover__heading"><strong>{label}</strong><button type="button" className="btn ghost" aria-label={`${label} schließen`} onClick={close}><IconX size={16} aria-hidden="true" /></button></div>
    {children}
  </div>, document.body)
}
