import { useState } from 'react'

export function useBookingDensity() {
  const [dense, setDense] = useState(() => {
    try { return localStorage.getItem('ui.bookings.density') === 'compact' } catch { return false }
  })
  return [dense, (value: boolean) => {
    setDense(value)
    try { localStorage.setItem('ui.bookings.density', value ? 'compact' : 'standard') } catch { /* Storage may be unavailable. */ }
  }] as const
}
