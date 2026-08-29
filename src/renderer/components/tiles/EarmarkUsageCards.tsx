import React, { useEffect, useMemo, useState } from 'react'
import { IconAlertTriangle, IconBolt, IconCalendar, IconChartBar, IconCheck, IconListDetails, IconLock, IconPencil } from '@tabler/icons-react'
import AppIcon from '../common/AppIcon'

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
function getStatusColor(pct: number): { bg: string; text: string; label: string; icon: React.ElementType } {
  if (pct >= 100) return { bg: 'rgba(198, 40, 40, 0.15)', text: '#ef5350', label: 'Überschritten', icon: IconAlertTriangle }
  if (pct >= 80) return { bg: 'rgba(255, 152, 0, 0.15)', text: '#ffa726', label: 'Fast aufgebraucht', icon: IconBolt }
  if (pct >= 50) return { bg: 'rgba(255, 235, 59, 0.15)', text: '#ffee58', label: 'Zur Hälfte', icon: IconChartBar }
  return { bg: 'rgba(76, 175, 80, 0.15)', text: '#66bb6a', label: 'Im Plan', icon: IconCheck }
}

function renderLockIcon(color: string) {
  return (
    <span style={{ color, opacity: 0.85 }}><AppIcon icon={IconLock} size="inline" /></span>
  )
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
  isActive?: number | boolean
}

export interface EarmarkUsageCardsProps {
  bindings: EarmarkUsageCardBinding[]
  from?: string
  to?: string
  sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
  onEdit?: (b: EarmarkUsageCardBinding) => void
  onGoToBookings?: (earmarkId: number) => void
  compact?: boolean
}

export default function EarmarkUsageCards({ bindings, from, to, sphere, onEdit, onGoToBookings, compact = false }: EarmarkUsageCardsProps) {
  const [usage, setUsage] = useState<Record<number, { allocated: number; released: number; balance: number; budget: number; remaining: number; totalCount?: number; insideCount?: number; outsideCount?: number; startDate?: string | null; endDate?: string | null }>>({})
  const fmtDate = (d?: string | null) => d ? d.slice(8,10) + '.' + d.slice(5,7) + '.' + d.slice(0,4) : '—'
  const formatRange = (start?: string | null, end?: string | null) => {
    if (start && end) return `${fmtDate(start)} – ${fmtDate(end)}`
    if (start) return `ab ${fmtDate(start)}`
    if (end) return `bis ${fmtDate(end)}`
    return null
  }
  
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
    <div style={{ display: 'grid', gridTemplateColumns: compact ? 'repeat(auto-fill, minmax(220px, 1fr))' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: compact ? 10 : 14, marginTop: 12 }}>
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
        const dateRange = formatRange(startDate, endDate)
        const totalCount = u?.totalCount as number | undefined
        const hasBudget = budget > 0
        
        const isArchived = b.isActive === 0 || b.isActive === false

        if (compact) {
          return (
            <div
              key={b.id}
              className="card budget-compact-card"
              style={{
                '--tile-color': bg,
                opacity: isArchived ? 0.55 : undefined,
                filter: isArchived ? 'grayscale(60%)' : undefined,
                borderStyle: isArchived ? 'dashed' : undefined
              } as React.CSSProperties}
            >
              <div className="budget-compact-card__head">
                <span className="budget-compact-card__code">{b.code}</span>
                <strong className="budget-compact-card__title" title={b.name}>{b.name}</strong>
                {!!b.enforceTimeRange && <span title="Strikter Zeitraum aktiv">{renderLockIcon('currentColor')}</span>}
              </div>
              <div
                className="budget-compact-card__stats"
                style={{ gridTemplateColumns: hasBudget ? 'repeat(3, minmax(0, 1fr))' : 'repeat(2, minmax(0, 1fr))' }}
              >
                {hasBudget ? (
                  <>
                    <div className="budget-compact-card__stat"><span>Budget</span><strong>{fmt.format(budget)}</strong></div>
                    <div className="budget-compact-card__stat"><span>Verfügbar</span><strong className={remaining >= 0 ? 'text-success' : 'text-danger'}>{fmt.format(remaining)}</strong></div>
                    <div className="budget-compact-card__stat"><span>Verbrauch</span><strong style={{ color: status.text }}>{pct}%</strong></div>
                  </>
                ) : (
                  <>
                    <div className="budget-compact-card__stat"><span>Zugewiesen</span><strong className="text-success">{fmt.format(allocated)}</strong></div>
                    <div className="budget-compact-card__stat"><span>Verbraucht</span><strong className="text-danger">{fmt.format(released)}</strong></div>
                  </>
                )}
              </div>
              {hasBudget && (
                <div className="budget-compact-card__detail-panel">
                  <div className="budget-compact-card__detail-label"><span>Verbrauch</span><strong style={{ color: status.text }}>{pct}%</strong></div>
                  <div className="budget-compact-card__progress" aria-label={`Verbrauch ${pct} Prozent`}>
                    <span style={{ width: `${Math.min(100, pct)}%`, background: pct >= 100 ? '#ef5350' : pct >= 80 ? '#ffa726' : bg }} />
                  </div>
                </div>
              )}
              {!hasBudget && dateRange && (
                <div className="budget-compact-card__detail-panel budget-compact-card__period">
                  <span className="budget-compact-card__detail-label">Zeitraum</span>
                  <strong>{dateRange}</strong>
                </div>
              )}
              {hasBudget && dateRange && <span className="budget-compact-card__period-hint">{dateRange}</span>}
              <div className="budget-compact-card__footer">
                <button className="budget-compact-card__bookings" onClick={() => onGoToBookings?.(b.id)}>
                  <span className="budget-compact-card__bookings-icon" aria-hidden="true"><AppIcon icon={IconListDetails} size="inline" /></span>
                  <span><strong>Buchungen</strong><small>{totalCount ?? 0} Buchung{totalCount !== 1 ? 'en' : ''}</small></span>
                </button>
                {onEdit && <button className="btn btn-edit budget-compact-card__edit" onClick={() => onEdit(b)} title="Bearbeiten"><AppIcon icon={IconPencil} size="control" /></button>}
              </div>
            </div>
          )
        }
        
        return (
          <div
            key={b.id}
            className="card budget-overview-card"
            style={{ 
              padding: 0, 
              overflow: 'hidden',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              ...(isArchived ? { opacity: 0.55, filter: 'grayscale(60%)', border: '1px dashed var(--border)' } : {})
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
                  <span title="Strikter Zeitraum aktiv">
                    {renderLockIcon(fg)}
                  </span>
                )}
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '14px 16px' }}>
              {/* Amount Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div className="budget-overview-metric" style={{ padding: '8px 10px', background: 'rgba(76, 175, 80, 0.1)', borderRadius: 8, borderLeft: '3px solid #66bb6a' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 2 }}>Zugewiesen</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#66bb6a' }}>{fmt.format(allocated)}</div>
                </div>
                <div className="budget-overview-metric" style={{ padding: '8px 10px', background: 'rgba(239, 83, 80, 0.1)', borderRadius: 8, borderLeft: '3px solid #ef5350' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 2 }}>Verbraucht</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#ef5350' }}>{fmt.format(released)}</div>
                </div>
              </div>

              {/* Budget & Remaining */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                {hasBudget ? (
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Anfangsbudget</div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{fmt.format(budget)}</div>
                  </div>
                ) : (
                  <div />
                )}
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
                    <span style={{ fontSize: 12, fontWeight: 600, color: status.text, display: 'inline-flex', alignItems: 'center', gap: 4 }}><AppIcon icon={status.icon} size="inline" />{pct}%</span>
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
                {dateRange && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><AppIcon icon={IconCalendar} size="inline" />{dateRange}</span>
                )}
                {totalCount != null && totalCount > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><AppIcon icon={IconListDetails} size="inline" />{totalCount} Buchung{totalCount !== 1 ? 'en' : ''}</span>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button 
                  className="btn ghost btn-with-icon"
                  onClick={() => onGoToBookings?.(b.id)} 
                  style={{ flex: 1, fontSize: 12 }}
                >
                  <AppIcon icon={IconListDetails} size="control" />Buchungen
                </button>
                {onEdit && (
                  <button 
                    className="btn btn-edit" 
                    onClick={() => onEdit(b)} 
                    title="Bearbeiten"
                  ><AppIcon icon={IconPencil} size="control" /></button>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
