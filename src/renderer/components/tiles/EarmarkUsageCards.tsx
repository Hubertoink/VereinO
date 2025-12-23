import React, { useEffect, useMemo, useState } from 'react'

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
  } catch { /* ignore */ }
  return 'var(--text)'
}

// Status colors based on usage percentage
function getStatusColor(pct: number): { bg: string; text: string; label: string; icon: string } {
  if (pct >= 100) return { bg: 'rgba(198, 40, 40, 0.15)', text: '#ef5350', label: 'Überschritten', icon: '⚠️' }
  if (pct >= 80) return { bg: 'rgba(255, 152, 0, 0.15)', text: '#ffa726', label: 'Fast aufgebraucht', icon: '⚡' }
  if (pct >= 50) return { bg: 'rgba(255, 235, 59, 0.15)', text: '#ffee58', label: 'Zur Hälfte', icon: '📊' }
  return { bg: 'rgba(76, 175, 80, 0.15)', text: '#66bb6a', label: 'Im Plan', icon: '✓' }
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
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14, marginTop: 12 }}>
      {bindings.map(b => {
        const u = usage[b.id]
        const bg = b.color || '#8b5cf6'
        const fg = contrastText(bg)
        const budget = u?.budget ?? b.budget ?? 0
        const allocated = Math.max(0, u?.allocated ?? 0)
        const released = Math.max(0, u?.released ?? 0)
        const balance = u?.balance ?? (allocated - released)
        const remaining = u?.remaining ?? (budget + balance)
        // Net consumption = OUT - IN (how much of budget was actually consumed)
        const netSpent = released - allocated
        const pct = budget > 0 ? Math.max(0, Math.min(100, Math.round((netSpent / budget) * 100))) : 0
        const status = getStatusColor(pct)
        const startDate = b.startDate ?? u?.startDate ?? null
        const endDate = b.endDate ?? u?.endDate ?? null
        const totalCount = u?.totalCount as number | undefined
        
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
                  <div style={{ fontSize: 11, opacity: 0.85, marginBottom: 2 }}>
                    <span style={{ 
                      background: 'rgba(255,255,255,0.2)', 
                      padding: '2px 6px', 
                      borderRadius: 4, 
                      fontSize: 10, 
                      fontWeight: 600 
                    }}>{b.code}</span>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.name}>
                    {b.name}
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
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 2 }}>Zugewiesen</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#66bb6a' }}>{fmt.format(allocated)}</div>
                </div>
                <div style={{ padding: '8px 10px', background: 'rgba(239, 83, 80, 0.1)', borderRadius: 8, borderLeft: '3px solid #ef5350' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 2 }}>Verbraucht</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#ef5350' }}>{fmt.format(released)}</div>
                </div>
              </div>

              {/* Budget & Remaining */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Anfangsbudget</div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{fmt.format(budget)}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Saldo</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: balance >= 0 ? '#66bb6a' : '#ef5350' }}>
                    {fmt.format(balance)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Verfügbar</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: remaining >= 0 ? '#66bb6a' : '#ef5350' }}>
                    {fmt.format(remaining)}
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              {(budget > 0 || allocated > 0) && (
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
                {totalCount != null && totalCount > 0 && (
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
                {onEdit && (
                  <button 
                    className="btn btn-edit" 
                    onClick={() => onEdit(b)} 
                    title="Bearbeiten"
                  >
                    ✎
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
