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
  const [loading, setLoading] = useState(false)
  const eur = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])

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

  return (
    <section className="card" style={{ padding: 12 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <strong>Zweckbindung: {earmark?.code || '—'}</strong>
          <div className="helper">{earmark?.name || ''}</div>
        </div>
        {earmark?.budget != null && (
          <div className="helper">Budget: {eur.format(earmark.budget)}</div>
        )}
      </header>
      
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
                <div className="helper">{v.date}</div>
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
