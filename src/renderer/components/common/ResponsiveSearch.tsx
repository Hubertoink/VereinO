import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { IconSearch, IconX } from '@tabler/icons-react'
import AppIcon from './AppIcon'
import FilterDropdown from '../dropdowns/FilterDropdown'

export type ResponsiveSearchHandle = { focus: () => void; select: () => void }

type Props = {
  value: string
  onChange: (value: string) => void
  label: string
  placeholder?: string
  title?: string
  wide?: boolean
  type?: 'text' | 'search'
}

const ResponsiveSearch = forwardRef<ResponsiveSearchHandle, Props>(function ResponsiveSearch(
  { value, onChange, label, placeholder, title, wide = false, type = 'text' }, ref
) {
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const closeRef = useRef<(() => void) | null>(null)
  const selectOnOpen = useRef(false)
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 1100px)').matches)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1100px)')
    const main = rootRef.current?.closest('.app-main')
    const update = () => setCompact(media.matches || !!main && main.clientWidth < 850)
    const observer = new ResizeObserver(update)
    if (main) observer.observe(main)
    media.addEventListener('change', update)
    update()
    return () => { observer.disconnect(); media.removeEventListener('change', update) }
  }, [])

  useEffect(() => {
    if (!compact) setOpen(false)
    if (open) {
      inputRef.current?.focus()
      if (selectOnOpen.current) { inputRef.current?.select(); selectOnOpen.current = false }
    }
  }, [compact, open])

  useImperativeHandle(ref, () => ({
    focus: () => { if (compact && !open) setOpen(true); else inputRef.current?.focus() },
    select: () => {
      if (compact && !open) { selectOnOpen.current = true; setOpen(true) }
      else inputRef.current?.select()
    }
  }), [compact, open])

  const field = <div className="responsive-search__field">
    <AppIcon icon={IconSearch} size="control" />
    <input ref={inputRef} className="input" type={type} value={value} onChange={event => onChange(event.target.value)}
      aria-label={label} placeholder={placeholder} title={title}
      onKeyDown={event => { if (compact && event.key === 'Enter') { event.preventDefault(); closeRef.current?.() } }} />
    {value && <button type="button" className="btn ghost responsive-search__clear" aria-label="Suche leeren"
      onClick={() => { onChange(''); inputRef.current?.focus() }}><AppIcon icon={IconX} size="control" /></button>}
  </div>

  return <div ref={rootRef} className={`responsive-search${compact ? ' responsive-search--compact' : ''}${wide ? ' responsive-search--wide' : ''}`}>
    {compact ? <FilterDropdown trigger={<AppIcon icon={IconSearch} size="action" />} title={label}
      ariaLabel={label} buttonTitle={value ? `${label}: ${value}` : label} hasActiveFilters={!!value.trim()}
      open={open} onOpenChange={setOpen} closeRef={closeRef} width={360} panelClassName="responsive-search-panel">
      {field}
    </FilterDropdown> : field}
  </div>
})

export default ResponsiveSearch
