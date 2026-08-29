import React, { useEffect, useMemo, useRef, useState } from 'react'
import { IconCalendar } from '@tabler/icons-react'
import AppIcon from '../common/AppIcon'
import FilterDropdown from './FilterDropdown'

export interface TimeFilterDropdownProps {
  yearsAvail: number[]
  from: string
  to: string
  onApply: (v: { from: string; to: string }) => void
  tooltip?: string
}

export default function TimeFilterDropdown({ yearsAvail, from, to, onApply, tooltip }: TimeFilterDropdownProps) {
  const closeRef = useRef<(() => void) | null>(null)
  const [f, setF] = useState<string>(from)
  const [t, setT] = useState<string>(to)

  useEffect(() => {
    setF(from)
    setT(to)
  }, [from, to])

  const hasFilters = !!(from || to)

  const selectedYear = useMemo(() => {
    if (!f || !t) return ''
    const fy = f.slice(0, 4)
    const ty = t.slice(0, 4)
    if (f === `${fy}-01-01` && t === `${fy}-12-31` && fy === ty) return fy
    return ''
  }, [f, t])

  const handleYearSelect = (y: string) => {
    if (!y) {
      setF('')
      setT('')
      return
    }
    const yr = Number(y)
    const nf = new Date(Date.UTC(yr, 0, 1)).toISOString().slice(0, 10)
    const nt = new Date(Date.UTC(yr, 11, 31)).toISOString().slice(0, 10)
    setF(nf)
    setT(nt)
  }

  const handleReset = () => {
    setF('')
    setT('')
    onApply({ from: '', to: '' })
  }

  return (
    <FilterDropdown
      trigger={<AppIcon icon={IconCalendar} size="action" />}
      title="Zeitraum"
      hasActiveFilters={hasFilters}
      alignRight
      width={340}
      ariaLabel="Zeitraum wählen"
      buttonTitle="Zeitraum wählen"
      colorVariant="time"
      tooltip={tooltip}
      closeRef={closeRef}
    >
      <div className="filter-dropdown__grid">
        <div className="filter-dropdown__field">
          <label className="filter-dropdown__label">Von</label>
          <input className="input" type="date" value={f} onChange={(e) => setF(e.target.value)} />
        </div>
        <div className="filter-dropdown__field">
          <label className="filter-dropdown__label">Bis</label>
          <input className="input" type="date" value={t} onChange={(e) => setT(e.target.value)} />
        </div>
      </div>

      <div className="filter-dropdown__field filter-dropdown__field--mt">
        <label className="filter-dropdown__label">Schnellauswahl Jahr</label>
        <select className="input" value={selectedYear} onChange={(e) => handleYearSelect(e.target.value)}>
          <option value="">—</option>
          {yearsAvail.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <div className="filter-dropdown__actions">
        <button className="btn" type="button" onClick={handleReset}>
          Zurücksetzen
        </button>
        <div className="filter-dropdown__actions-right">
          <button className="btn primary" type="button" onClick={() => { onApply({ from: f, to: t }); closeRef.current?.() }}>
            Übernehmen
          </button>
        </div>
      </div>
    </FilterDropdown>
  )
}
