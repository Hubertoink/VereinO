import React from 'react'
import { createPortal } from 'react-dom'

export type SelectDropdownOption = {
  value: string
  label: string
  description?: string
  color?: string
  disabled?: boolean
}

type MenuPosition = {
  left: number
  width: number
  top?: number
  bottom?: number
  maxHeight: number
}

export type SelectDropdownProps = {
  value: string
  options: SelectDropdownOption[]
  onChange: (value: string) => void
  id?: string
  ariaLabel?: string
  placeholder?: string
  className?: string
  style?: React.CSSProperties
  disabled?: boolean
  invalid?: boolean
  menuPlacement?: 'auto' | 'top' | 'bottom'
}

function useMenuPosition(open: boolean, anchorRef: React.RefObject<HTMLElement | null>, menuPlacement: SelectDropdownProps['menuPlacement']) {
  const [position, setPosition] = React.useState<MenuPosition | null>(null)

  const sync = React.useCallback(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    const gap = 10
    const below = window.innerHeight - rect.bottom
    const above = rect.top
    const placeAbove = menuPlacement === 'top' || (menuPlacement !== 'bottom' && below < 230 && above > below)
    setPosition({
      left: rect.left,
      width: rect.width,
      ...(placeAbove ? { bottom: window.innerHeight - rect.top + gap } : { top: rect.bottom + gap }),
      maxHeight: Math.min(280, Math.max(120, (placeAbove ? above : below) - gap))
    })
  }, [anchorRef, menuPlacement])

  React.useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return
    }
    sync()
    window.addEventListener('resize', sync)
    document.addEventListener('scroll', sync, true)
    return () => {
      window.removeEventListener('resize', sync)
      document.removeEventListener('scroll', sync, true)
    }
  }, [open, sync])

  return position
}

export default function SelectDropdown({ value, options, onChange, id, ariaLabel, placeholder = 'Auswählen', className = '', style, disabled, invalid, menuPlacement = 'auto' }: SelectDropdownProps) {
  const [open, setOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLButtonElement | null>(null)
  const menuRef = React.useRef<HTMLDivElement | null>(null)
  const menuPosition = useMenuPosition(open, triggerRef, menuPlacement)
  const selected = options.find((option) => option.value === value)

  React.useEffect(() => {
    const close = (event: MouseEvent) => {
      const target = event.target as Node
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const choose = (nextValue: string) => {
    onChange(nextValue)
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={`input select-dropdown__trigger${invalid ? ' input-error' : ''}${className ? ` ${className}` : ''}`}
        style={style}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false)
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setOpen(true)
          }
        }}
      >
        <span className={selected ? '' : 'select-dropdown__placeholder'} style={selected?.color ? { color: selected.color } : undefined}>{selected?.label || placeholder}</span>
        <span className="select-dropdown__chevron" aria-hidden="true" />
      </button>
      {open && menuPosition && createPortal(
        <div ref={menuRef} className="select-dropdown__menu select-dropdown__menu--portal" style={menuPosition} role="listbox">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={option.value === value ? 'is-selected' : ''}
              disabled={option.disabled}
              onClick={() => choose(option.value)}
            >
              <span style={option.color ? { color: option.color } : undefined}><strong>{option.label}</strong>{option.description ? <small>{option.description}</small> : null}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  )
}

type SuggestionInputProps = {
  value: string
  suggestions: string[]
  onChange: (value: string) => void
  id?: string
  ariaLabel?: string
  placeholder?: string
  className?: string
}

export function SuggestionInput({ value, suggestions, onChange, id, ariaLabel, placeholder, className = '' }: SuggestionInputProps) {
  const [open, setOpen] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const menuRef = React.useRef<HTMLDivElement | null>(null)
  const menuPosition = useMenuPosition(open, inputRef, 'auto')
  const query = value.trim().toLocaleLowerCase('de')
  const matches = suggestions.filter((suggestion) => !query || suggestion.toLocaleLowerCase('de').includes(query)).slice(0, 12)

  React.useEffect(() => {
    const close = (event: MouseEvent) => {
      const target = event.target as Node
      if (!inputRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  return (
    <span className={`suggestion-input${className ? ` ${className}` : ''}`}>
      <input
        ref={inputRef}
        id={id}
        className="input"
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(event) => { onChange(event.target.value); setOpen(true) }}
        onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false) }}
      />
      <button type="button" className="suggestion-input__toggle" aria-label="Beschreibungsvorschläge anzeigen" onMouseDown={(event) => event.preventDefault()} onClick={() => setOpen((current) => !current)}>
        <span className="select-dropdown__chevron" aria-hidden="true" />
      </button>
      {open && menuPosition && createPortal(
        <div ref={menuRef} className="select-dropdown__menu select-dropdown__menu--portal" style={menuPosition} role="listbox">
          {matches.length ? matches.map((suggestion) => (
            <button key={suggestion} type="button" role="option" onClick={() => { onChange(suggestion); setOpen(false); inputRef.current?.focus() }}><span><strong>{suggestion}</strong></span></button>
          )) : <div className="select-dropdown__empty">Keine passende Beschreibung gefunden.</div>}
        </div>,
        document.body
      )}
    </span>
  )
}
