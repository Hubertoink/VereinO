import React from 'react'

type Props = {
  inputRef: React.RefObject<HTMLInputElement | null>
  ariaLabel: string
}

export default function DatePickerButton({ inputRef, ariaLabel }: Props) {
  return (
    <button
      type="button"
      className="booking-date-picker-button"
      aria-label={ariaLabel}
      onClick={() => inputRef.current?.showPicker()}
    >
      <svg className="booking-date-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </svg>
    </button>
  )
}
