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
  const [bindings, setBindings] = useState<Array<{ id: number; code: string; name: string; color?: string | null; budget?: number | null }>>([])
  const [usage, setUsage] = useState<Record<number, { balance: number; allocated?: number; released?: number; budget?: number }>>({})
  const eur = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
  
  useEffect(() => {
    (async () => {
      const res = await window.api?.bindings.list?.({ activeOnly: true })
      const rows = (res?.rows || []) as Array<{ id:number; code:string; name:string; color?:string|null; budget?: number | null }>
      // sort by name to keep layout stable; we'll pick top 6 by absolute balance after usage fetch
      setBindings(rows)
      const u: Record<number, { balance: number; allocated?: number; released?: number; budget?: number }> = {}
      for (const b of rows) {
        const r = await window.api?.bindings.usage?.({ earmarkId: b.id })
        if (r) u[b.id] = { balance: r.balance, allocated: r.allocated, released: r.released, budget: r.budget }
      }
      setUsage(u)
    })()
  }, [])
  
  if (!bindings.length) return null
  
  // pick top 6 by absolute balance for overview
  const sorted = [...bindings].sort((a,b)=> Math.abs((usage[b.id]?.balance||0)) - Math.abs((usage[a.id]?.balance||0))).slice(0,6)

  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong>Zweckbindungen – Übersicht</strong>
        <button className="btn ghost" onClick={() => { const ev = new CustomEvent('apply-earmark-filter', { detail: { earmarkId: null } }); window.dispatchEvent(ev); }}>Zu Buchungen</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10, marginTop: 8 }}>
        {sorted.map(b => {
          const color = b.color || '#7C4DFF'
          const fg = contrastText(color)
          const u = usage[b.id] || { balance: 0, allocated: 0, released: 0, budget: b.budget || 0 }
          const budget = Number(u.budget || b.budget || 0)
          const available = Math.max(0.01, budget + Number(u.allocated || 0))
          const pct = Math.max(0, Math.min(1, Number(u.released || 0) / available))
          const pct100 = Math.round(pct * 100)
          const onFilter = () => { try { window.dispatchEvent(new CustomEvent('apply-earmark-filter', { detail: { earmarkId: b.id } })) } catch {} }
          return (
            <div key={b.id} className="card" role="button" onClick={onFilter} title="In Buchungen filtern" style={{ padding: 10, borderTop: `4px solid ${color}`, cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span className="badge" style={{ background: color, color: fg }}>{b.code}</span>
                <span className="helper" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
              </div>
              <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div className="helper">Saldo</div>
                <div style={{ fontWeight: 600 }}>{eur.format(u.balance || 0)}</div>
              </div>
              {budget > 0 ? (
                <div style={{ marginTop: 6 }}>
                  <div className="helper" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Nutzung</span>
                    <span>{pct100}%</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 6, background: 'var(--muted)', overflow: 'hidden' }}>
                    <div style={{ width: pct100 + '%', height: '100%', background: color }} />
                  </div>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
