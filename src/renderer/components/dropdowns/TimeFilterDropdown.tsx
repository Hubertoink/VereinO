import YearRangeSelect from '../common/YearRangeSelect'
import DateFilterInput from '../common/DateFilterInput'
import { useEffect, useRef, useState } from 'react';
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
          <DateFilterInput label="Von" value={f} onChange={setF} />
        </div>
        <div className="filter-dropdown__field">
          <label className="filter-dropdown__label">Bis</label>
          <DateFilterInput label="Bis" value={t} onChange={setT} />
        </div>
      </div>

      <YearRangeSelect years={yearsAvail} from={f} to={t} onChange={range => { setF(range.from); setT(range.to) }} />

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
