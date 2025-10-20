import React from 'react'

export default function ReportsCashBars(props: { refreshKey?: number; from?: string; to?: string }) {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="helper">Ein-/Ausgaben (Balken)</div>
      <div style={{ height: 180, background: 'repeating-linear-gradient(45deg, #eee, #eee 10px, #fafafa 10px, #fafafa 20px)' }} />
    </div>
  )
}
