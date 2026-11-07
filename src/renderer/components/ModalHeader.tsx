import React, { forwardRef, useEffect, useRef } from 'react'
import { IconX } from '@tabler/icons-react'
import './modalHeader.css'

type CloseButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className' | 'style'>

/** One close action for every app dialog; native window controls stay separate. */
export const ModalCloseButton = forwardRef<HTMLButtonElement, CloseButtonProps>(function ModalCloseButton(
  { type = 'button', title = 'Schließen (Esc)', 'aria-label': label = 'Schließen', ...props }, ref
) {
  return <button {...props} ref={ref} type={type} className="modal-close-button" title={title} aria-label={label}>
    <IconX size={16} stroke={1.8} aria-hidden="true" />
  </button>
})

type ModalHeaderProps = Omit<React.HTMLAttributes<HTMLElement>, 'title'> & {
  title?: React.ReactNode
  headerTitle?: string
  titleId?: string
  subtitle?: React.ReactNode
  icon?: React.ReactNode
  actions?: React.ReactNode
  onClose?: () => void
  closeDisabled?: boolean
  closeLabel?: string
  closeOnEscape?: boolean
}

/** Shared sticky title bar. Custom children support existing menus and window controls. */
export default function ModalHeader({
  title, titleId, headerTitle, subtitle, icon, actions, onClose, closeDisabled, closeLabel,
  closeOnEscape = true, children, className = '', ...props
}: ModalHeaderProps) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!onClose || !closeOnEscape || closeDisabled) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      const overlays = Array.from(document.querySelectorAll<HTMLElement>('.modal-overlay, [role="dialog"]'))
        .filter(element => element.getClientRects().length > 0)
      const topmost = overlays[overlays.length - 1]
      if (topmost && !topmost.contains(ref.current)) return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose, closeOnEscape, closeDisabled])

  return <header {...props} title={headerTitle} ref={ref} className={`modal-header-bar ${className}`.trim()}>
    {children || <>
      <div className="modal-header-bar__heading">
        {icon && <span className="modal-header-bar__icon">{icon}</span>}
        <div className="modal-header-bar__titles">
          <h2 id={titleId}>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      <div className="modal-header-bar__actions">
        {actions}
        {onClose && <ModalCloseButton onClick={onClose} disabled={closeDisabled} aria-label={closeLabel || 'Schließen'} />}
      </div>
    </>}
  </header>
}
