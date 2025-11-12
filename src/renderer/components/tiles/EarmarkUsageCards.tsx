import React, { useEffect, useMemo, useState } from 'react'

function contrastText(bg?: string | null) {
  if (!bg) return 'var(--text)'
  try {
    const c = bg.trim()
    const hex = c.startsWith('#') ? c.slice(1) : c
    if (hex.length === 3 || hex.length === 6) {
      const full = hex.length === 3 ? hex.split('').map(h => h + h).join('') : hex
      const r = parseInt(full.slice(0,2),16), g = parseInt(full.slice(2,4),16), b = parseInt(full.slice(4,6),16)
      // WCAG relative luminance
      const sr = r/255, sg = g/255, sb = b/255
      const lum = 0.2126*sr + 0.7152*sg + 0.0722*sb
      return lum > 0.5 ? '#000' : '#fff'
    }
  } catch { /* ignore */ }
  return 'var(--text)'
}

export interface EarmarkUsageCardBinding {
  id: number
  code: string
  name: string
  color?: string | null
  budget?: number | null
  startDate?: string | null
  endDate?: string | null
  enforceTimeRange?: number
}

export interface EarmarkUsageCardsProps {
  bindings: EarmarkUsageCardBinding[]
  from?: string
  to?: string
  sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
  onEdit?: (b: EarmarkUsageCardBinding) => void
  onGoToBookings?: (earmarkId: number) => void
}

export default function EarmarkUsageCards({ bindings, from, to, sphere, onEdit, onGoToBookings }: EarmarkUsageCardsProps) {
  const [usage, setUsage] = useState<Record<number, { allocated: number; released: number; balance: number; budget: number; remaining: number; totalCount?: number; insideCount?: number; outsideCount?: number; startDate?: string | null; endDate?: string | null }>>({})
  const fmtDate = (d?: string | null) => d ? d.slice(8,10) + '.' + d.slice(5,7) + '.' + d.slice(0,4) : '—'
  
  useEffect(() => {
    let alive = true
    async function run() {
      const res: Record<number, any> = {}
      for (const b of bindings) {
        const u = await (window as any).api?.bindings?.usage?.({ earmarkId: b.id, from, to, sphere })
        if (u) res[b.id] = u
      }
      if (alive) setUsage(res)
    }
    run()
    return () => { alive = false }
  }, [bindings, from, to, sphere])
  const fmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
  if (!bindings.length) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, marginTop: 12 }}>
      {bindings.map(b => {
        const u = usage[b.id]
        const bg = b.color || undefined
        const fg = contrastText(bg)
        const budget = u?.budget ?? b.budget ?? 0
        const allocated = Math.max(0, u?.allocated ?? 0)
        const released = Math.max(0, u?.released ?? 0)
        // Progress: OUT / (Budget + IN) to account for additional income
        const availableFunds = budget + allocated
        const pct = availableFunds > 0 ? Math.min(100, Math.round((released / availableFunds) * 100)) : 0
        const startDate = b.startDate ?? u?.startDate ?? null
        const endDate = b.endDate ?? u?.endDate ?? null
        const totalCount = u?.totalCount as number | undefined
        const outsideCount = u?.outsideCount as number | undefined
        return (
          <div
            key={b.id}
            className="card"
            style={{ padding: 10, borderTop: bg ? `4px solid ${bg}` : undefined }}
            title={`Zweckbindung ${b.code} – Klick auf Filter oder Buttons für Aktionen`}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <span className="badge" style={{ background: bg, color: fg }}>{b.code}</span>
              <span className="helper" style={{ fontWeight: 600, flex: 1 }}>{b.name}</span>
              {!!b.enforceTimeRange && (
                <span title="Strikter Zeitraum aktiv" style={{ fontSize: '1.2em' }}>🔒</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
              <span className="badge in">IN: {fmt.format(u?.allocated ?? 0)}</span>
              <span className="badge out">OUT: {fmt.format(released)}</span>
              <span className="badge">Saldo: {fmt.format(u?.balance ?? 0)}</span>
              {budget > 0 && (
                <>
                  <span className="badge" title="Anfangsbudget">Budget: {fmt.format(budget)}</span>
                  <span className="badge" title="Verfügbar" style={{ fontWeight: 600, textDecoration: 'underline', textDecorationStyle: 'double' }}>Rest: {fmt.format(u?.remaining ?? (budget - released))}</span>
                </>
              )}
            </div>
            <div className="helper" style={{ marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {(startDate || endDate) && (
                <span title="Zeitraum">🗓 {fmtDate(startDate)} – {fmtDate(endDate)}</span>
              )}
              {(totalCount != null) && (
                <span title="Zugeordnete Buchungen">
                  📄 {totalCount}{(outsideCount ?? 0) > 0 ? ` · (außerhalb: ${outsideCount})` : ''}
                </span>
              )}
            </div>
            {budget > 0 && (
              <div style={{ marginTop: 8 }}>
                <div className="helper">Fortschritt</div>
                <div style={{ height: 10, background: 'color-mix(in oklab, var(--accent) 15%, transparent)', borderRadius: 6, position: 'relative' }} aria-label={`Verbrauch ${pct}%`} title={`${pct}%`}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: bg || 'var(--accent)', borderRadius: 6 }} />
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 8 }}>
              <button className="btn ghost" onClick={() => onGoToBookings?.(b.id)} title="Zu Buchungen springen">📄 Zu Buchungen</button>
              {onEdit && <button className="btn" onClick={() => onEdit(b)} title="Bearbeiten">✎</button>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
