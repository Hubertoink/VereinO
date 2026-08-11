import React from 'react'

export type BookingKindOption = { value: string; label: string }

export default function BookingKindSwitch({
  value,
  options,
  onChange,
  ariaLabel
}: {
  value: string
  options: BookingKindOption[]
  onChange: (value: string) => void
  ariaLabel: string
}) {
  return (
    <div className="compact-booking-kind" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`compact-booking-kind__button compact-booking-kind__button--${option.value.toLowerCase()}${value === option.value ? ' is-active' : ''}`}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
