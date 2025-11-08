import React, { useEffect, useMemo, useState } from 'react'

// Simple contrast helper for hex colors (returns black or white text)
function contrastText(bg?: string | null) {
  if (!bg) return '#000'
  const m = /^#?([0-9a-fA-F]{6})$/.exec(bg.trim())
  if (!m) return '#000'
  const hex = m[1]
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  // Perceived luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#000' : '#fff'
}

export default function DashboardEarmarksPeek() {
  const [bindings, setBindings] = useState<Array<{ id: number; code: string; name: string; color?: string | null }>>([])
  const [usage, setUsage] = useState<Record<number, { balance: number }>>({})
  const eur = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
  
  useEffect(() => {
    (async () => {
      const res = await window.api?.bindings.list?.({ activeOnly: true })
      const rows = res?.rows?.slice(0, 6) || []
      setBindings(rows)
      const u: Record<number, { balance: number }> = {}
      for (const b of rows) {
        const r = await window.api?.bindings.usage?.({ earmarkId: b.id })
        if (r) u[b.id] = { balance: r.balance }
      }
      setUsage(u)
    })()
  }, [])
  
  if (!bindings.length) return null
  
  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong>Zweckbindungen (Auszug)</strong>
        <button className="btn ghost" onClick={() => { const ev = new CustomEvent('apply-earmark-filter', { detail: { earmarkId: null } }); window.dispatchEvent(ev); }}>Zu Buchungen</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, marginTop: 8 }}>
        {bindings.map(b => {
          const bg = b.color || undefined
          const fg = contrastText(bg)
          return (
            <div key={b.id} className="card" style={{ padding: 10, borderTop: bg ? `4px solid ${bg}` : undefined }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span className="badge" style={{ background: bg, color: fg }}>{b.code}</span>
                <span className="helper">{b.name}</span>
              </div>
              <div style={{ marginTop: 6 }}>Saldo: {eur.format(usage[b.id]?.balance || 0)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
