import React, { useEffect, useId, useRef, useState } from 'react'

export interface FilterDropdownProps {
  trigger: React.ReactNode
  title: string
  hasActiveFilters?: boolean
  children: React.ReactNode
  alignRight?: boolean
  width?: number | string
  ariaLabel?: string
  buttonTitle?: string
}

export default function FilterDropdown({
  trigger,
  title,
  hasActiveFilters = false,
  children,
  alignRight = false,
  width = 320,
  ariaLabel,
  buttonTitle
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const labelId = useId()

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

  return (
    <div className="filter-dropdown">
      <button
        ref={buttonRef}
        type="button"
        className={`btn ghost filter-dropdown__trigger ${hasActiveFilters ? 'has-filters' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        title={buttonTitle}
        aria-expanded={open}
        aria-haspopup="true"
        aria-labelledby={labelId}
      >
        {trigger}
        <span id={labelId} className="sr-only">
          {title}
        </span>
        {hasActiveFilters && <span className="filter-dropdown__indicator" />}
      </button>

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
