import React, { useEffect, useState, useMemo } from 'react'

type Voucher = {
  id: number
  date: string
  description: string
  grossAmount: number
  type: 'IN' | 'OUT' | 'TRANSFER'
}

type Earmark = {
  id: number
  code: string
  name: string
  budget: number | null
  color?: string
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
        // Get all earmarks and pick the first active one if none specified
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

        // Fetch aggregate IN/OUT for usage progress (using reports.summary with earmark filter)
        try {
          const s = await (window as any).api?.reports?.summary?.({ from, to, earmarkId: selected.id })
          const inGross = s?.byType?.find((x: any) => x.key === 'IN')?.gross || 0
          const outGrossRaw = s?.byType?.find((x: any) => x.key === 'OUT')?.gross || 0
          setSumIn(Math.max(0, Number(inGross) || 0))
          setSumOut(Math.abs(Number(outGrossRaw) || 0))
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
      <section className="card" style={{ padding: 12 }}>
        <strong>Zweckbindung</strong>
        <div className="helper" style={{ marginTop: 8 }}>Keine aktive Zweckbindung gefunden.</div>
      </section>
    )
  }

  // Progress: Anteil verbraucht = Ausgaben / Budget (falls Budget vorhanden)
  const budget = earmark?.budget ?? null
  const consumedPct = budget ? Math.min(100, Math.round((sumOut / Math.max(1e-9, budget)) * 1000) / 10) : null
  const saldo = Math.round((sumIn - sumOut) * 100) / 100
  const remaining = budget != null ? Math.round((budget + saldo) * 100) / 100 : null  // Budget + Saldo (IN - OUT)
  const bgTint = earmark?.color ? `color-mix(in oklab, ${earmark.color} 14%, var(--surface))` : undefined

  return (
    <section className="card" style={{ padding: 12, background: bgTint }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <strong>Zweckbindung: {earmark?.code || '—'}</strong>
          <div className="helper">{earmark?.name || ''}</div>
          <div className="helper">Zeitraum: {fmtDate(from)} – {fmtDate(to)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {earmark?.budget != null && <div className="helper">Budget: {eur.format(earmark.budget)}</div>}
          <div className="helper">IN: {eur.format(sumIn)} · OUT: {eur.format(sumOut)}</div>
          <div className="helper">Saldo: <span style={{ color: saldo >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>{eur.format(saldo)}</span></div>
        </div>
      </header>
      {/* Usage progress line */}
      {budget != null && (
        <div style={{ marginTop: 10 }}>
          <div className="helper" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Fortschritt Ausgaben</span>
            <span>{consumedPct?.toFixed(1)}%{remaining != null ? ` · Rest: ` : ''}{remaining != null ? <strong style={{ textDecoration: 'underline', textDecorationStyle: 'double' }}>{eur.format(remaining)}</strong> : ''}</span>
          </div>
          <div style={{ position: 'relative', height: 6, background: 'color-mix(in oklab, var(--border) 40%, transparent)', borderRadius: 4, overflow: 'hidden', marginTop: 4 }}>
            <div style={{ position: 'absolute', inset: 0, width: `${consumedPct || 0}%`, background: earmark?.color || 'var(--accent)', transition: 'width .4s', borderRadius: 4 }} />
          </div>
        </div>
      )}
      
      <div style={{ marginTop: 12 }}>
        <div className="helper">Letzte Buchungen (max. 5)</div>
        {loading && <div className="helper" style={{ marginTop: 6 }}>Laden…</div>}
        {!loading && vouchers.length === 0 && (
          <div className="helper" style={{ marginTop: 6 }}>Keine Buchungen im Zeitraum.</div>
        )}
        {!loading && vouchers.length > 0 && (
          <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
            {vouchers.map((v) => (
              <div key={v.id} style={{ display: 'grid', gridTemplateColumns: '80px 1fr auto', gap: 8, alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                <div className="helper">{fmtDate(v.date)}</div>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.description}>
                  {v.description || '—'}
                </div>
                <div style={{ textAlign: 'right', fontWeight: 600, color: v.type === 'IN' ? 'var(--success)' : v.type === 'OUT' ? 'var(--danger)' : 'inherit' }}>
                  {eur.format(Math.abs(v.grossAmount || 0))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
