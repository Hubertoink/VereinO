import React from 'react'
import './bookingTable.css'

export default function TableDensityControl({ compact, onChange }: { compact: boolean; onChange: (compact: boolean) => void }) {
  return <div className="booking-density" role="group" aria-label="Zeilenabstand">
    <button type="button" aria-pressed={!compact} onClick={() => onChange(false)}>Standard</button>
    <button type="button" aria-pressed={compact} onClick={() => onChange(true)}>Kompakt</button>
  </div>
}
