import React, { useEffect, useMemo, useState } from 'react'

type Voucher = { id: number; date: string; description: string; grossAmount: number; type: 'IN' | 'OUT' | 'TRANSFER' }
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

export default function BudgetDetailCard({ budgetId, from, to }: { budgetId: number; from: string; to: string }) {
  const [budget, setBudget] = useState<Budget | null>(null)
  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [sumIn, setSumIn] = useState(0)
  const [sumOut, setSumOut] = useState(0)
  const [loading, setLoading] = useState(false)
  const eur = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
  const fmtDate = useMemo(() => (d?: string | null) => {
    if (!d) return '—'
    // Expect YYYY-MM-DD
    if (d.length >= 10) return `${d.slice(8,10)}.${d.slice(5,7)}.${d.slice(0,4)}`
    try { return new Intl.DateTimeFormat('de-DE').format(new Date(d)) } catch { return String(d) }
  }, [])

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        setLoading(true)
        // Load all budgets (no activeOnly flag exists; filter client-side)
        const res = await (window as any).api?.budgets?.list?.({})
        const list: Budget[] = (res?.rows || res || [])
        const b = list.find(x => Number(x.id) === Number(budgetId)) || null
        if (!alive) return
        setBudget(b)

        // Aggregate via budgets.usage (supports budgetId) for accuracy
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
      <section className="card" style={{ padding: 12 }}>
        <strong>Budget</strong>
        <div className="helper" style={{ marginTop: 6 }}>Nicht gefunden.</div>
      </section>
    )
  }

  // Clamp range for display without introducing conditional hooks
  const sd = budget?.startDate ? String(budget.startDate).slice(0,10) : null
  const ed = budget?.endDate ? String(budget.endDate).slice(0,10) : null
  const clampedFrom = (sd && sd > from) ? sd : from
  const clampedTo = (ed && ed < to) ? ed : to

  const planned = budget?.amountPlanned ?? 0
  const saldo = Math.round((sumIn - sumOut) * 100) / 100
  const consumedPct = planned > 0 ? Math.min(100, Math.round((sumOut / planned) * 1000) / 10) : null
  const remaining = planned > 0 ? Math.round((planned - sumOut) * 100) / 100 : null
  const bgTint = budget?.color ? `color-mix(in oklab, ${budget.color} 14%, var(--surface))` : undefined

  return (
    <section className="card" style={{ padding: 12, background: bgTint }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ minWidth: 0 }}>
          <strong>Budget: {budget?.name || `#${budget?.id}`}</strong>
          <div className="helper">{budget?.sphere || ''}</div>
          <div className="helper">Zeitraum: {fmtDate(clampedFrom)} – {fmtDate(clampedTo)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="helper">Geplant: {eur.format(planned)}</div>
          <div className="helper">IN: {eur.format(sumIn)} · OUT: {eur.format(sumOut)}</div>
          <div className="helper">Saldo: <span style={{ color: saldo >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>{eur.format(saldo)}</span></div>
        </div>
      </header>
      {planned > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="helper" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Fortschritt Ausgaben</span>
            <span>{consumedPct?.toFixed(1)}%{remaining != null ? ` · Rest: ` : ''}{remaining != null ? <strong style={{ textDecoration: 'underline', textDecorationStyle: 'double' }}>{eur.format(remaining)}</strong> : ''}</span>
          </div>
          <div style={{ position: 'relative', height: 6, background: 'color-mix(in oklab, var(--border) 40%, transparent)', borderRadius: 4, overflow: 'hidden', marginTop: 4 }}>
            <div style={{ position: 'absolute', inset: 0, width: `${consumedPct || 0}%`, background: budget?.color || 'var(--accent)', transition: 'width .4s', borderRadius: 4 }} />
          </div>
        </div>
      )}
      <div style={{ marginTop: 12 }}>
        <div className="helper">Letzte Buchungen (max. 5)</div>
        {loading && <div className="helper" style={{ marginTop: 6 }}>Laden…</div>}
        {!loading && vouchers.length === 0 && (<div className="helper" style={{ marginTop: 6 }}>Keine Buchungen.</div>)}
        {!loading && vouchers.length > 0 && (
          <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
            {vouchers.map(v => (
              <div key={v.id} style={{ display: 'grid', gridTemplateColumns: '80px 1fr auto', gap: 8, alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                <div className="helper">{fmtDate(v.date)}</div>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.description}>{v.description || '—'}</div>
                <div style={{ textAlign: 'right', fontWeight: 600, color: v.type === 'IN' ? 'var(--success)' : v.type === 'OUT' ? 'var(--danger)' : 'inherit' }}>{eur.format(Math.abs(v.grossAmount || 0))}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
