import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconX } from '@tabler/icons-react'
import AppIcon from '../common/AppIcon'

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
  /** Mutable ref that receives the close function once mounted */
  closeRef?: React.MutableRefObject<(() => void) | null>
  /** Controls the open state when provided. */
  open?: boolean
  /** Called whenever the dropdown requests a state change. */
  onOpenChange?: (open: boolean) => void
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
  tooltip,
  closeRef,
  open: controlledOpen,
  onOpenChange
}: FilterDropdownProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = (next: boolean | ((current: boolean) => boolean)) => {
    const value = typeof next === 'function' ? next(open) : next
    if (controlledOpen === undefined) setUncontrolledOpen(value)
    onOpenChange?.(value)
  }
  const panelRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  // Expose close function via ref so parent components can close the dropdown
  const closePanel = () => { setOpen(false); buttonRef.current?.focus() }
  if (closeRef) closeRef.current = closePanel

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

    const anchorCenterX = anchor.left + anchor.width / 2

    let left = anchor.left + anchor.width / 2 - tip.width / 2
    left = Math.min(Math.max(left, margin), window.innerWidth - tip.width - margin)

    // Keep tooltip within window, but ensure arrow points to trigger.
    // (When clamped, centered arrow would be wrong.)
    let arrowX = anchorCenterX - left
    arrowX = Math.min(Math.max(arrowX, 12), tip.width - 12)

    let top = anchor.bottom + gap
    let placement: TooltipPlacement = 'bottom'

    if (top + tip.height + margin > window.innerHeight) {
      top = anchor.top - tip.height - gap
      placement = 'top'
    }

    setTooltipPlacement(placement)
    const style: React.CSSProperties = { left, top }
    ;(style as any)['--tooltip-arrow-x'] = `${arrowX}px`
    setTooltipStyle(style)
  }

  useLayoutEffect(() => {
    if (!tooltip || !showTooltip) return
    updateTooltipPosition()
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

  // Render outside scrolling page containers and follow the trigger when a
  // compositor resizes the tile. Measure layout sizes without animation transforms.
  useLayoutEffect(() => {
    if (!open || !panelRef.current || !buttonRef.current) return
    const panel = panelRef.current
    const button = buttonRef.current
    const updatePosition = () => {
      const anchor = button.getBoundingClientRect()
      const margin = 12
      const panelWidth = panel.offsetWidth
      const preferredLeft = alignRight ? anchor.right - panelWidth : anchor.left
      const left = Math.max(margin, Math.min(preferredLeft, window.innerWidth - panelWidth - margin))
      const top = Math.max(margin, Math.min(anchor.bottom + 8, window.innerHeight - 160))
      panel.style.left = `${left}px`
      panel.style.top = `${top}px`
      panel.style.maxHeight = `${Math.max(0, window.innerHeight - top - margin)}px`
    }
    updatePosition()
    const observer = new ResizeObserver(updatePosition)
    observer.observe(button)
    observer.observe(panel)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, alignRight, width])

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

      {open && createPortal(
        <div
          ref={panelRef}
          className="filter-dropdown__panel"
          style={{
            width: typeof width === 'number' ? `${width}px` : width,
            maxWidth: 'calc(100vw - 24px)',
            boxSizing: 'border-box',
            position: 'fixed',
            top: 0,
            left: 0,
            right: 'auto',
            zIndex: 6500
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
              <AppIcon icon={IconX} size="control" />
            </button>
          </header>

          <div className="filter-dropdown__content">{children}</div>
        </div>,
        document.body
      )}
    </div>
  )
}
