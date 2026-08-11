import React from 'react'

export type BookingOptionalAction = {
  key: string
  label: string
  active?: boolean
  count?: number
  disabled?: boolean
}

type Props = {
  actions: BookingOptionalAction[]
  onToggle: (key: string) => void
  label?: string
}

/** Shared compact action row used by every booking-like flyout. */
export default function BookingOptionalActionBar({ actions, onToggle, label = 'Weitere Angaben' }: Props) {
  return (
    <div className="compact-booking-optional-bar" aria-label={label}>
      <span>{label}</span>
      <div>
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            className={action.active ? 'is-active' : ''}
            aria-pressed={action.active}
            disabled={action.disabled}
            onClick={() => onToggle(action.key)}
          >
            {action.active ? '−' : '+'} {action.label}{action.count ? ` · ${action.count}` : ''}
          </button>
        ))}
      </div>
    </div>
  )
}
