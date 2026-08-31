import React, { useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconX } from '@tabler/icons-react'
import AppIcon from '../common/AppIcon'

type BookingPopupFrameProps = {
  title: React.ReactNode
  titleId?: string
  subtitle?: React.ReactNode
  onClose: () => void
  className?: string
  overlayClassName?: string
  headerAccessory?: React.ReactNode
  kindSwitch?: React.ReactNode
  variant?: 'standard' | 'compact'
  anchorToTrigger?: boolean
  anchorRect?: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom' | 'width' | 'height'> | null
  anchorAlign?: 'start' | 'end'
  children: React.ReactNode
}

/**
 * Gemeinsame Hülle für Formulare, die einer Buchung ähneln.
 *
 * Sie hält Portal, Modalgröße, Header, Schließen-Icon und Tastaturhinweise
 * konsistent. Die jeweiligen Fachformulare liefern nur ihre Zusatzfelder.
 */
export default function BookingPopupFrame({
  title,
  titleId,
  subtitle,
  onClose,
  className = '',
  overlayClassName = '',
  headerAccessory,
  kindSwitch,
  variant = 'standard',
  anchorToTrigger = true,
  anchorRect = null,
  anchorAlign = 'start',
  children
}: BookingPopupFrameProps) {
  const compact = variant === 'compact'
  const [anchorStyle, setAnchorStyle] = useState<React.CSSProperties | undefined>()
  const modalClassName = compact
    ? `modal compact-booking-flyout compact-booking-popup ${className}`
    : `modal booking-modal quick-add-modal ${className}`
  useLayoutEffect(() => {
    if (!compact || !anchorToTrigger) return
    const activeElement = document.activeElement
    const trigger = activeElement instanceof HTMLElement
      && activeElement !== document.body
      && activeElement !== document.documentElement
      && activeElement.isConnected
      ? activeElement
      : null
    const rect = anchorRect || trigger?.getBoundingClientRect()
    if (!rect || (!rect.width && !rect.height && !rect.right && !rect.bottom)) return
    const gap = 8
    const width = Math.min(560, window.innerWidth - 32)
    const preferredLeft = anchorAlign === 'end' ? rect.right - width : rect.left
    const left = Math.max(12, Math.min(preferredLeft, window.innerWidth - width - 12))
    const spaceBelow = window.innerHeight - rect.bottom - gap - 12
    const spaceAbove = rect.top - gap - 12
    const opensDown = spaceBelow >= spaceAbove
    const maxHeight = Math.max(220, Math.min(690, opensDown ? spaceBelow : spaceAbove))
    setAnchorStyle(opensDown
      ? { position: 'fixed', left, top: Math.max(12, rect.bottom + gap), maxHeight, margin: 0 }
      : { position: 'fixed', left, bottom: Math.max(12, window.innerHeight - rect.top + gap), maxHeight, margin: 0 })
  }, [anchorAlign, anchorRect, anchorToTrigger, compact])

  return createPortal(
    <div
      className={`modal-overlay ${overlayClassName}`.trim()}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className={modalClassName.trim()} style={compact ? anchorStyle : undefined} onClick={(event) => event.stopPropagation()}>
        {compact ? <>
          <header className="compact-booking-flyout__header">
            <div>
              <strong id={titleId}>{title}</strong>
              {subtitle && <small>{subtitle}</small>}
            </div>
            <div className="compact-booking-flyout__header-actions">
              <button className="btn ghost compact-booking-flyout__action compact-booking-flyout__action--close" type="button" onClick={onClose} title="Schließen (Esc)" aria-label="Schließen">
                <AppIcon icon={IconX} size="control" />
              </button>
            </div>
          </header>
          <div className="compact-booking-popup__content">
            {kindSwitch && <div className="compact-booking-popup__kind">{kindSwitch}</div>}
            {children}
          </div>
        </> : <>
          <header className="modal-header-flex">
            <h2 id={titleId}>{title}</h2>
            {headerAccessory}
            <div className="booking-modal-header-actions">
              <button className="btn ghost booking-modal-icon-btn booking-modal-close-btn" type="button" onClick={onClose} title="Schließen (Esc)" aria-label="Schließen">
                <AppIcon icon={IconX} size="action" />
              </button>
            </div>
          </header>
          {children}
        </>}
      </div>
    </div>,
    document.body
  )
}
