import React, { useEffect, useState, useMemo } from 'react'

type Voucher = {
  id: number
  date: string
  description: string
  grossAmount: number
  earmarkAmount?: number | null
  type: 'IN' | 'OUT' | 'TRANSFER'
}

type Earmark = {
  id: number
  code: string
  name: string
  budget: number | null
  color?: string
  startDate?: string | null
  endDate?: string | null
}

// Status colors based on usage percentage
function getStatusColor(pct: number): { text: string; icon: string } {
  if (pct >= 100) return { text: '#ef5350', icon: '⚠️' }
  if (pct >= 80) return { text: '#ffa726', icon: '⚡' }
  if (pct >= 50) return { text: '#ffee58', icon: '📊' }
  return { text: '#66bb6a', icon: '✓' }
}

export default function EarmarkDetailCard({ earmarkId, from, to }: { earmarkId?: number; from: string; to: string }) {
  const [earmark, setEarmark] = useState<Earmark | null>(null)
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
        const list = await (window as any).api?.bindings?.list?.({ activeOnly: true })
        const earmarks = (list?.rows || list || []) as Earmark[]
        
        let selected: Earmark | null = null
        if (earmarkId) {
          selected = earmarks.find(e => e.id === earmarkId) || null
        } else if (earmarks.length > 0) {
          selected = earmarks[0]
        }
        
        if (!selected || !alive) {
          if (alive) { setEarmark(null); setVouchers([]) }
          return
        }
        
        setEarmark(selected)

        // Fetch aggregate IN/OUT using bindings.usage for accuracy
        try {
          const u = await (window as any).api?.bindings?.usage?.({ earmarkId: selected.id, from, to })
          const allocated = Math.max(0, Number(u?.allocated || 0))
          const released = Math.max(0, Number(u?.released || 0))
          setSumIn(Math.round(allocated * 100) / 100)
          setSumOut(Math.round(released * 100) / 100)
        } catch { setSumIn(0); setSumOut(0) }
        
        // Fetch vouchers with this earmark
        const vRes = await (window as any).api?.vouchers?.list?.({
          limit: 5,
          offset: 0,
          sort: 'DESC',
          sortBy: 'date',
          from,
          to,
          earmarkId: selected.id
        })
        
        const rows = (vRes?.rows || []) as Voucher[]
        if (alive) setVouchers(rows)
      } catch {
        if (alive) { setEarmark(null); setVouchers([]) }
      } finally {
        if (alive) setLoading(false)
      }
    }
    
    load()
    const onChanged = () => load()
    window.addEventListener('data-changed', onChanged)
    return () => { alive = false; window.removeEventListener('data-changed', onChanged) }
  }, [earmarkId, from, to])

  if (!earmark && !loading) {
    return (
      <section className="card" style={{ padding: 16 }}>
        <strong>Zweckbindung</strong>
        <div className="helper" style={{ marginTop: 8 }}>Keine aktive Zweckbindung gefunden.</div>
      </section>
    )
  }

  const budget = earmark?.budget ?? 0
  // Net consumption = OUT - IN (how much of budget was actually consumed)
  const netSpent = sumOut - sumIn
  const consumedPct = budget > 0 ? Math.max(0, Math.min(100, Math.round((netSpent / budget) * 1000) / 10)) : 0
  const saldo = Math.round((sumIn - sumOut) * 100) / 100
  const remaining = Math.round((budget + saldo) * 100) / 100
  const status = getStatusColor(consumedPct)
  const bgColor = earmark?.color || '#8b5cf6'

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
            <div style={{ fontSize: 11, opacity: 0.85, marginBottom: 2 }}>
              <span style={{ 
                background: 'rgba(255,255,255,0.2)', 
                padding: '2px 6px', 
                borderRadius: 4, 
                fontSize: 10, 
                fontWeight: 600 
              }}>{earmark?.code}</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {earmark?.name || '—'}
            </div>
            <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>
              Zeitraum: {fmtDate(from)} – {fmtDate(to)}
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12 }}>
            {budget > 0 && <div style={{ opacity: 0.85 }}>Budget: {eur.format(budget)}</div>}
            <div style={{ opacity: 0.85 }}>IN: {eur.format(sumIn)} · OUT: {eur.format(sumOut)}</div>
            <div style={{ fontWeight: 600 }}>Saldo: {eur.format(saldo)}</div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '12px 16px' }}>
        {/* Progress Bar */}
        {budget > 0 && (
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
            <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>Keine Buchungen im Zeitraum.</div>
          )}
          {!loading && vouchers.length > 0 && (
            <div style={{ display: 'grid', gap: 0 }}>
              {vouchers.map((v, i) => {
                // Use earmarkAmount if available, otherwise fall back to grossAmount
                const displayAmount = v.earmarkAmount != null ? Math.abs(v.earmarkAmount) : Math.abs(v.grossAmount || 0)
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
