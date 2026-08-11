import React from 'react'
import BookingOptionalActionBar, { type BookingOptionalAction } from './BookingOptionalActionBar'

type Props = {
  actions: BookingOptionalAction[]
  onToggle: (key: string) => void
  children?: React.ReactNode
}

/**
 * Keeps every booking-like form consistent: the action row is always followed
 * by its expanded panels, never by fields from the base form.
 */
export default function BookingOptionalArea({ actions, onToggle, children }: Props) {
  return (
    <section className="compact-booking-optional-area">
      <BookingOptionalActionBar actions={actions} onToggle={onToggle} />
      {children && <div className="compact-booking-optional-panels">{children}</div>}
    </section>
  )
}
