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

// Status colors based on usage percentage
function getStatusColor(pct: number): { bg: string; text: string; label: string; icon: string } {
  if (pct >= 100) return { bg: 'rgba(198, 40, 40, 0.15)', text: '#ef5350', label: 'Überschritten', icon: '⚠️' }
  if (pct >= 80) return { bg: 'rgba(255, 152, 0, 0.15)', text: '#ffa726', label: 'Fast aufgebraucht', icon: '⚡' }
  if (pct >= 50) return { bg: 'rgba(255, 235, 59, 0.15)', text: '#ffee58', label: 'Zur Hälfte', icon: '📊' }
  return { bg: 'rgba(76, 175, 80, 0.15)', text: '#66bb6a', label: 'Im Plan', icon: '✓' }
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
  enforceTimeRange?: number
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
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
        {budgets.map(b => {
          const bg = b.color || '#6366f1'
          const fg = contrastText(bg)
          const plan = b.amountPlanned || 0
          const spent = Math.max(0, usage[b.id]?.spent || 0)
          const inflow = Math.max(0, usage[b.id]?.inflow || 0)
          const saldo = inflow - spent
          const remaining = plan + saldo
          // Net consumption = OUT - IN (how much of budget was actually consumed)
          const netSpent = spent - inflow
          const pct = plan > 0 ? Math.max(0, Math.min(100, Math.round((netSpent / plan) * 100))) : 0
          const status = getStatusColor(pct)
          const title = (b.name && b.name.trim()) || b.categoryName || b.projectName || `Budget ${b.year}`
          const startDate = b.startDate ?? usage[b.id]?.startDate ?? null
          const endDate = b.endDate ?? usage[b.id]?.endDate ?? null
          const totalCount = (usage[b.id]?.countInside ?? 0) + (usage[b.id]?.countOutside ?? 0)
          
          return (
            <div 
              key={b.id} 
              className="card" 
              style={{ 
                padding: 0, 
                overflow: 'hidden',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease'
              }}
            >
              {/* Header with color */}
              <div style={{ 
                background: `linear-gradient(135deg, ${bg}, ${bg}dd)`, 
                padding: '14px 16px',
                color: fg
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, opacity: 0.85, marginBottom: 2 }}>{b.year}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={title}>
                      {title}
                    </div>
                  </div>
                  {!!b.enforceTimeRange && (
                    <span title="Strikter Zeitraum aktiv" style={{ fontSize: 16 }}>🔒</span>
                  )}
                </div>
              </div>

              {/* Body */}
              <div style={{ padding: '14px 16px' }}>
                {/* Amount Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                  <div style={{ padding: '8px 10px', background: 'rgba(76, 175, 80, 0.1)', borderRadius: 8, borderLeft: '3px solid #66bb6a' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 2 }}>Einnahmen</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#66bb6a' }}>{eurFmt.format(inflow)}</div>
                  </div>
                  <div style={{ padding: '8px 10px', background: 'rgba(239, 83, 80, 0.1)', borderRadius: 8, borderLeft: '3px solid #ef5350' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 2 }}>Ausgaben</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#ef5350' }}>{eurFmt.format(spent)}</div>
                  </div>
                </div>

                {/* Budget & Remaining */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Budget</div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{eurFmt.format(plan)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Verfügbar</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: remaining >= 0 ? '#66bb6a' : '#ef5350' }}>
                      {eurFmt.format(remaining)}
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                {plan > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Verbrauch</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: status.text }}>{status.icon} {pct}%</span>
                    </div>
                    <div style={{ height: 8, background: 'var(--muted)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ 
                        height: '100%', 
                        width: `${Math.min(100, pct)}%`, 
                        background: pct >= 100 ? 'linear-gradient(90deg, #ef5350, #f44336)' : 
                                   pct >= 80 ? 'linear-gradient(90deg, #ffa726, #ff9800)' : 
                                   `linear-gradient(90deg, ${bg}, ${bg}cc)`,
                        borderRadius: 4,
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                  </div>
                )}

                {/* Meta Info */}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-dim)', marginBottom: 10 }}>
                  {(startDate || endDate) && (
                    <span>🗓️ {fmtDate(startDate)} – {fmtDate(endDate)}</span>
                  )}
                  {totalCount > 0 && (
                    <span>📄 {totalCount} Buchung{totalCount !== 1 ? 'en' : ''}</span>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button 
                    className="btn ghost" 
                    onClick={() => onGoToBookings?.(b.id)} 
                    style={{ flex: 1, fontSize: 12 }}
                  >
                    📄 Buchungen
                  </button>
                  <button 
                    className="btn btn-edit" 
                    onClick={() => onEdit(b)} 
                    title="Bearbeiten"
                  >
                    ✎
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
