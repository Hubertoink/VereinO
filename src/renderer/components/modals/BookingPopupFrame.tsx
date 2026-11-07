import ModalHeader from '../ModalHeader'
import React, { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'



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
  const modalRef = useRef<HTMLDivElement>(null)
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
    const updatePosition = () => {
      const currentRect = anchorRect || trigger?.getBoundingClientRect() || rect
      const gap = 8
      // Specialised forms can override the popup width in CSS.
      const width = modalRef.current?.offsetWidth || Math.min(560, window.innerWidth - 32)
      const preferredLeft = anchorAlign === 'end' ? currentRect.right - width : currentRect.left
      const left = Math.max(12, Math.min(preferredLeft, window.innerWidth - width - 12))
      const spaceBelow = window.innerHeight - currentRect.bottom - gap - 12
      const spaceAbove = currentRect.top - gap - 12
      const opensDown = spaceBelow >= spaceAbove
      const maxHeight = Math.max(220, Math.min(690, opensDown ? spaceBelow : spaceAbove))
      setAnchorStyle(opensDown
        ? { position: 'fixed', left, top: Math.max(12, currentRect.bottom + gap), maxHeight, margin: 0 }
        : { position: 'fixed', left, bottom: Math.max(12, window.innerHeight - currentRect.top + gap), maxHeight, margin: 0 })
    }
    updatePosition()
    const observer = new ResizeObserver(updatePosition)
    if (modalRef.current) observer.observe(modalRef.current)
    window.addEventListener('resize', updatePosition)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updatePosition)
    }
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
      <div ref={modalRef} className={modalClassName.trim()} style={compact ? anchorStyle : undefined} onClick={(event) => event.stopPropagation()}>
        <ModalHeader
          className={compact ? 'compact-booking-flyout__header' : 'modal-header-flex'}
          title={title}
          titleId={titleId}
          subtitle={subtitle}
          actions={headerAccessory}
          onClose={onClose}
          closeOnEscape={false}
        />
        {compact ? <div className="compact-booking-popup__content">
          {kindSwitch && <div className="compact-booking-popup__kind">{kindSwitch}</div>}
          {children}
        </div> : children}
      </div>
    </div>,
    document.body
  )
}
