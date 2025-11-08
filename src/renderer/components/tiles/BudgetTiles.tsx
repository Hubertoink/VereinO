import React, { useEffect, useState } from 'react'

function contrastText(bg?: string | null) {
  if (!bg) return 'var(--text)'
  try {
    const c = bg.trim()
    const hex = c.startsWith('#') ? c.slice(1) : c
    if (hex.length === 3 || hex.length === 6) {
      const full = hex.length === 3 ? hex.split('').map(h => h + h).join('') : hex
      const r = parseInt(full.slice(0,2),16), g = parseInt(full.slice(2,4),16), b = parseInt(full.slice(4,6),16)
      const sr = r/255, sg = g/255, sb = b/255
      const lum = 0.2126*sr + 0.7152*sg + 0.0722*sb
      return lum > 0.5 ? '#000' : '#fff'
    }
  } catch {}
  return 'var(--text)'
}

export interface BudgetTileBudget {
  id: number
  year: number
  sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
  amountPlanned: number
  name?: string | null
  categoryName?: string | null
  projectName?: string | null
  startDate?: string | null
  endDate?: string | null
  color?: string | null
  categoryId?: number | null
  projectId?: number | null
  earmarkId?: number | null
}

export default function BudgetTiles({ budgets, eurFmt, onEdit, onGoToBookings }: { budgets: BudgetTileBudget[]; eurFmt: Intl.NumberFormat; onEdit: (b: BudgetTileBudget) => void; onGoToBookings?: (budgetId: number) => void }) {
  const [usage, setUsage] = useState<Record<number, { spent: number; inflow: number; count: number; lastDate: string | null; countInside?: number; countOutside?: number; startDate?: string | null; endDate?: string | null }>>({})
  const fmtDate = (d?: string | null) => d ? d.slice(8,10) + '.' + d.slice(5,7) + '.' + d.slice(0,4) : '—'
  
  useEffect(() => {
    let alive = true
    async function run() {
      const res: Record<number, any> = {}
      for (const b of budgets) {
        try {
          const u = await (window as any).api?.budgets?.usage?.({ budgetId: b.id })
          if (!alive) return
          res[b.id] = u || { spent: 0, inflow: 0, count: 0, lastDate: null }
        } catch {
          if (!alive) return
          res[b.id] = { spent: 0, inflow: 0, count: 0, lastDate: null }
        }
      }
      if (alive) setUsage(res)
    }
    run()
    return () => { alive = false }
  }, [budgets])

  if (!budgets.length) return null
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {budgets.map(b => {
          const bg = b.color || undefined
          const fg = contrastText(bg)
          const plan = b.amountPlanned || 0
          const spent = Math.max(0, usage[b.id]?.spent || 0)
          const inflow = Math.max(0, usage[b.id]?.inflow || 0)
          const remaining = plan - spent
          const saldo = inflow - spent
          const pct = plan > 0 ? Math.min(100, Math.max(0, Math.round((spent / plan) * 100))) : 0
          const title = (b.name && b.name.trim()) || b.categoryName || b.projectName || `Budget ${b.year}`
          const startDate = b.startDate ?? usage[b.id]?.startDate ?? null
          const endDate = b.endDate ?? usage[b.id]?.endDate ?? null
          const totalCount = (usage[b.id]?.countInside ?? 0) + (usage[b.id]?.countOutside ?? 0)
          const outsideCount = usage[b.id]?.countOutside ?? 0
          return (
            <div key={b.id} className="card" style={{ padding: 10, borderTop: bg ? `4px solid ${bg}` : undefined }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span className="badge" style={{ background: bg, color: fg }}>{b.year}</span>
                <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={title}>{title}</span>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                <span className="badge in">IN: {eurFmt.format(inflow)}</span>
                <span className="badge out">OUT: {eurFmt.format(spent)}</span>
                <span className="badge">Budget: {eurFmt.format(plan)}</span>
                <span className="badge">Saldo: {eurFmt.format(saldo)}</span>
                <span className="badge" title="Verfügbar">Rest: {eurFmt.format(remaining)}</span>
              </div>
              <div className="helper" style={{ marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {(startDate || endDate) && (
                  <span title="Zeitraum">🗓 {fmtDate(startDate)} – {fmtDate(endDate)}</span>
                )}
                {(totalCount > 0 || usage[b.id]?.count != null) && (
                  <span title="Zugeordnete Buchungen">📄 {totalCount || usage[b.id]?.count || 0}{outsideCount > 0 ? ` · außerhalb: ${outsideCount}` : ''}</span>
                )}
              </div>
              {plan > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div className="helper">Fortschritt</div>
                  <div style={{ height: 10, background: 'color-mix(in oklab, var(--accent) 15%, transparent)', borderRadius: 6, position: 'relative' }} aria-label={`Verbrauch ${pct}%`} title={`${pct}%`}>
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: bg || 'var(--accent)', borderRadius: 6 }} />
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 8 }}>
                <button className="btn ghost" onClick={() => onGoToBookings?.(b.id)}>Zu Buchungen</button>
                <button className="btn" onClick={() => onEdit(b)}>✎ Bearbeiten</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
