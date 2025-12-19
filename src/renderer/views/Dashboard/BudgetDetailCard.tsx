import React, { useEffect, useMemo, useState } from 'react'

type Voucher = { 
  id: number
  date: string
  description: string
  grossAmount: number
  budgetAmount?: number | null
  type: 'IN' | 'OUT' | 'TRANSFER' 
}
type Budget = {
  id: number
  year: number
  sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
  amountPlanned: number
  name?: string | null
  startDate?: string | null
  endDate?: string | null
  color?: string | null
}

// Status colors based on usage percentage
function getStatusColor(pct: number): { text: string; icon: string } {
  if (pct >= 100) return { text: '#ef5350', icon: '⚠️' }
  if (pct >= 80) return { text: '#ffa726', icon: '⚡' }
  if (pct >= 50) return { text: '#ffee58', icon: '📊' }
  return { text: '#66bb6a', icon: '✓' }
}

export default function BudgetDetailCard({ budgetId, from, to }: { budgetId: number; from: string; to: string }) {
  const [budget, setBudget] = useState<Budget | null>(null)
  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [sumIn, setSumIn] = useState(0)
  const [sumOut, setSumOut] = useState(0)
  const [loading, setLoading] = useState(false)
  const eur = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
  const fmtDate = useMemo(() => (d?: string | null) => {
    if (!d) return '—'
    if (d.length >= 10) return `${d.slice(8,10)}.${d.slice(5,7)}.${d.slice(0,4)}`
    try { return new Intl.DateTimeFormat('de-DE').format(new Date(d)) } catch { return String(d) }
  }, [])

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        setLoading(true)
        const res = await (window as any).api?.budgets?.list?.({})
        const list: Budget[] = (res?.rows || res || [])
        const b = list.find(x => Number(x.id) === Number(budgetId)) || null
        if (!alive) return
        setBudget(b)

        // Aggregate via budgets.usage
        try {
          const sd = b?.startDate ? String(b.startDate).slice(0,10) : null
          const ed = b?.endDate ? String(b.endDate).slice(0,10) : null
          const cf = (sd && sd > from) ? sd : from
          const ct = (ed && ed < to) ? ed : to
          const u = await (window as any).api?.budgets?.usage?.({ budgetId, from: cf, to: ct })
          const inflow = Math.max(0, Number(u?.inflow || 0))
          const spent = Math.max(0, Number(u?.spent || 0))
          setSumIn(Math.round(inflow * 100) / 100)
          setSumOut(Math.round(spent * 100) / 100)
        } catch { setSumIn(0); setSumOut(0) }

        // Recent vouchers (fetch 5, newest first)
        const vRes = await (window as any).api?.vouchers?.list?.({ limit: 5, offset: 0, sort: 'DESC', sortBy: 'date', from, to, budgetId })
        const recent = (vRes?.rows || []) as Voucher[]
        setVouchers(recent)
      } catch {
        if (alive) { setBudget(null); setVouchers([]); setSumIn(0); setSumOut(0) }
      } finally { if (alive) setLoading(false) }
    }
    load()
    const onChanged = () => load()
    window.addEventListener('data-changed', onChanged)
    return () => { alive = false; window.removeEventListener('data-changed', onChanged) }
  }, [budgetId, from, to])

  if (!budget && !loading) {
    return (
      <section className="card" style={{ padding: 16 }}>
        <strong>Budget</strong>
        <div className="helper" style={{ marginTop: 6 }}>Nicht gefunden.</div>
      </section>
    )
  }

  const sd = budget?.startDate ? String(budget.startDate).slice(0,10) : null
  const ed = budget?.endDate ? String(budget.endDate).slice(0,10) : null
  const clampedFrom = (sd && sd > from) ? sd : from
  const clampedTo = (ed && ed < to) ? ed : to

  const planned = budget?.amountPlanned ?? 0
  const saldo = Math.round((sumIn - sumOut) * 100) / 100
  // Net consumption = OUT - IN (how much of budget was actually consumed)
  const netSpent = sumOut - sumIn
  const consumedPct = planned > 0 ? Math.max(0, Math.min(100, Math.round((netSpent / planned) * 1000) / 10)) : 0
  const remaining = Math.round((planned + saldo) * 100) / 100
  const status = getStatusColor(consumedPct)
  const bgColor = budget?.color || '#6366f1'

  return (
    <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ 
        background: `linear-gradient(135deg, ${bgColor}, ${bgColor}dd)`, 
        padding: '12px 16px',
        color: '#fff'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 11, opacity: 0.85, marginBottom: 2 }}>Budget</div>
            <div style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {budget?.name || `#${budget?.id}`}
            </div>
            <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>
              {fmtDate(clampedFrom)} – {fmtDate(clampedTo)}
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12 }}>
            <div style={{ opacity: 0.85 }}>Geplant: {eur.format(planned)}</div>
            <div style={{ opacity: 0.85 }}>IN: {eur.format(sumIn)} · OUT: {eur.format(sumOut)}</div>
            <div style={{ fontWeight: 600 }}>Saldo: {eur.format(saldo)}</div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '12px 16px' }}>
        {/* Progress Bar */}
        {planned > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Fortschritt Ausgaben</span>
              <span style={{ fontSize: 12, fontWeight: 600 }}>
                <span style={{ color: status.text }}>{status.icon} {consumedPct.toFixed(1)}%</span>
                <span style={{ marginLeft: 8 }}>Rest: <strong style={{ color: remaining >= 0 ? '#66bb6a' : '#ef5350' }}>{eur.format(remaining)}</strong></span>
              </span>
            </div>
            <div style={{ height: 6, background: 'var(--muted)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ 
                height: '100%', 
                width: `${Math.min(100, consumedPct)}%`, 
                background: consumedPct >= 100 ? 'linear-gradient(90deg, #ef5350, #f44336)' : 
                           consumedPct >= 80 ? 'linear-gradient(90deg, #ffa726, #ff9800)' : 
                           `linear-gradient(90deg, ${bgColor}, ${bgColor}cc)`,
                borderRadius: 3,
                transition: 'width 0.3s ease'
              }} />
            </div>
          </div>
        )}

        {/* Recent Vouchers */}
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>📄</span>
            <span>Letzte Buchungen (max. 5)</span>
          </div>
          {loading && <div className="helper">Laden…</div>}
          {!loading && vouchers.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>Keine Buchungen.</div>
          )}
          {!loading && vouchers.length > 0 && (
            <div style={{ display: 'grid', gap: 0 }}>
              {vouchers.map((v, i) => {
                // Use budgetAmount if available, otherwise fall back to grossAmount
                const displayAmount = v.budgetAmount != null ? Math.abs(v.budgetAmount) : Math.abs(v.grossAmount || 0)
                return (
                  <div 
                    key={v.id} 
                    style={{ 
                      display: 'grid', 
                      gridTemplateColumns: '72px 1fr auto', 
                      gap: 10, 
                      alignItems: 'center', 
                      padding: '8px 0',
                      borderBottom: i < vouchers.length - 1 ? '1px solid var(--border)' : undefined
                    }}
                  >
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{fmtDate(v.date)}</div>
                    <div style={{ 
                      overflow: 'hidden', 
                      textOverflow: 'ellipsis', 
                      whiteSpace: 'nowrap',
                      fontSize: 13,
                      fontWeight: 500
                    }} title={v.description}>
                      {v.description || '—'}
                    </div>
                    <div style={{ 
                      textAlign: 'right', 
                      fontWeight: 600, 
                      fontSize: 13,
                      color: v.type === 'IN' ? '#66bb6a' : v.type === 'OUT' ? '#ef5350' : 'inherit' 
                    }}>
                      {eur.format(displayAmount)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
