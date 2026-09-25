import React from 'react'

export type BookingKindOption = { value: string; label: string; icon?: React.ReactNode }

export default function BookingKindSwitch({
  value,
  options,
  onChange,
  ariaLabel,
  className = '',
  autoFocus = false
}: {
  value: string
  options: BookingKindOption[]
  onChange: (value: string) => void
  ariaLabel: string
  className?: string
  autoFocus?: boolean
}) {
  return (
    <div className={`compact-booking-kind${className ? ` ${className}` : ''}`} role="group" aria-label={ariaLabel}>
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          autoFocus={autoFocus && index === 0}
          className={`compact-booking-kind__button compact-booking-kind__button--${option.value.toLowerCase()}${value === option.value ? ' is-active' : ''}`}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  )
}
