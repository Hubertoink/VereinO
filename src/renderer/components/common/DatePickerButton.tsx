import React from 'react'
import { IconCalendar } from '@tabler/icons-react'

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
      <IconCalendar className="booking-date-icon" aria-hidden="true" size={16} stroke={1.8} />
    </button>
  )
}
