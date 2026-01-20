import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface FilterDropdownProps {
  trigger: React.ReactNode
  title: string
  hasActiveFilters?: boolean
  children: React.ReactNode
  alignRight?: boolean
  width?: number | string
  ariaLabel?: string
  buttonTitle?: string
  colorVariant?: 'default' | 'display' | 'time' | 'filter' | 'action'
  tooltip?: string
}

type TooltipPlacement = 'bottom' | 'top'

export default function FilterDropdown({
  trigger,
  title,
  hasActiveFilters = false,
  children,
  alignRight = false,
  width = 320,
  ariaLabel,
  buttonTitle,
  colorVariant = 'default',
  tooltip
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const labelId = useId()
  const tooltipId = useId()
  const [showTooltip, setShowTooltip] = useState(false)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({ left: 0, top: 0 })
  const [tooltipPlacement, setTooltipPlacement] = useState<TooltipPlacement>('bottom')

  useEffect(() => {
    if (!open) return
    setShowTooltip(false)
  }, [open])

  const updateTooltipPosition = () => {
    if (!tooltip || !showTooltip) return
    if (!buttonRef.current || !tooltipRef.current) return

    const margin = 8
    const gap = 8

    const anchor = buttonRef.current.getBoundingClientRect()
    const tip = tooltipRef.current.getBoundingClientRect()

    let left = anchor.left + anchor.width / 2 - tip.width / 2
    left = Math.min(Math.max(left, margin), window.innerWidth - tip.width - margin)

    let top = anchor.bottom + gap
    let placement: TooltipPlacement = 'bottom'

    if (top + tip.height + margin > window.innerHeight) {
      top = anchor.top - tip.height - gap
      placement = 'top'
    }

    setTooltipPlacement(placement)
    setTooltipStyle({ left, top })
  }

  useLayoutEffect(() => {
    if (!tooltip || !showTooltip) return
    updateTooltipPosition()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tooltip, showTooltip])

  useEffect(() => {
    if (!tooltip || !showTooltip) return

    const onReposition = () => updateTooltipPosition()
    window.addEventListener('resize', onReposition)
    // capture scroll from any scroll container
    window.addEventListener('scroll', onReposition, true)
    return () => {
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tooltip, showTooltip])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        buttonRef.current?.focus()
      }
    }

    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node | null
      if (!t) return
      if (panelRef.current?.contains(t)) return
      if (buttonRef.current?.contains(t)) return
      setOpen(false)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mousedown', onMouseDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mousedown', onMouseDown)
    }
  }, [open])

  // Adjust position if panel would overflow viewport
  useEffect(() => {
    if (!open || !panelRef.current) return
    const panel = panelRef.current
    // Reset any prior auto-adjustment
    panel.style.left = ''
    panel.style.right = ''
    panel.style.maxHeight = ''

    const rect = panel.getBoundingClientRect()
    // Check right overflow
    if (rect.right > window.innerWidth - 16) {
      panel.style.left = 'auto'
      panel.style.right = '0'
    }
    // Check left overflow (rare but possible on narrow screens)
    if (rect.left < 16) {
      panel.style.left = '0'
      panel.style.right = 'auto'
    }
    // Check bottom overflow
    if (rect.bottom > window.innerHeight - 16) {
      panel.style.maxHeight = `${Math.max(200, window.innerHeight - rect.top - 32)}px`
    }
  }, [open])

  return (
    <div className="filter-dropdown">
      <button
        ref={buttonRef}
        type="button"
        className={`btn ghost filter-dropdown__trigger filter-dropdown__trigger--${colorVariant} ${hasActiveFilters ? 'has-filters' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        title={buttonTitle}
        aria-expanded={open}
        aria-haspopup="true"
        aria-labelledby={labelId}
        aria-describedby={tooltip && showTooltip && !open ? tooltipId : undefined}
        onMouseEnter={() => {
          if (!tooltip || open) return
          setShowTooltip(true)
        }}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => {
          if (!tooltip || open) return
          setShowTooltip(true)
        }}
        onBlur={() => setShowTooltip(false)}
      >
        {trigger}
        <span id={labelId} className="sr-only">
          {title}
        </span>
        {hasActiveFilters && <span className="filter-dropdown__indicator" />}
      </button>

      {tooltip && showTooltip && !open &&
        createPortal(
          <div
            ref={tooltipRef}
            id={tooltipId}
            className={`tooltip-portal tooltip-portal--${tooltipPlacement}`}
            style={tooltipStyle}
            role="tooltip"
            aria-hidden="true"
          >
            {tooltip}
          </div>,
          document.body
        )}

      {open && (
        <div
          ref={panelRef}
          className="filter-dropdown__panel"
          style={{
            width: typeof width === 'number' ? `${width}px` : width,
            maxWidth: 'calc(100vw - 24px)',
            boxSizing: 'border-box',
            ...(alignRight ? { right: 0, left: 'auto' } : { left: 0, right: 'auto' })
          }}
          role="dialog"
          aria-modal="false"
          aria-label={title}
        >
          <header className="filter-dropdown__header">
            <h3 className="filter-dropdown__title">{title}</h3>
            <button
              type="button"
              className="btn ghost filter-dropdown__close"
              aria-label="Schließen"
              title="Schließen"
              onClick={() => {
                setOpen(false)
                buttonRef.current?.focus()
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </header>

          <div className="filter-dropdown__content">{children}</div>
        </div>
      )}
    </div>
  )
}
