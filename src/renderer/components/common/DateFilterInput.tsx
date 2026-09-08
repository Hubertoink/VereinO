import React, { useRef } from 'react'
import DatePickerButton from './DatePickerButton'

export default function DateFilterInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <span className="booking-date-input-wrap date-filter-input">
      <input ref={inputRef} className="input" type="date" aria-label={label} value={value} onChange={event => onChange(event.target.value)} />
      <DatePickerButton inputRef={inputRef} ariaLabel={`Kalender für ${label} öffnen`} />
    </span>
  )
}
