import React, { useEffect, useMemo, useState } from 'react'
import { Sphere, VoucherType, PaymentMethod } from './types'

export default function ReportsSummary(props: { refreshKey?: number; from?: string; to?: string; sphere?: Sphere; type?: VoucherType; paymentMethod?: PaymentMethod }) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<null | {
    totals: { net: number; vat: number; gross: number }
    bySphere: Array<{ key: Sphere; net: number; vat: number; gross: number }>
    byPaymentMethod: Array<{ key: PaymentMethod | null; net: number; vat: number; gross: number }>
    byType: Array<{ key: VoucherType; net: number; vat: number; gross: number }>
  }>(null)
  const [monthsCount, setMonthsCount] = useState<number>(0)
  const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(window as any).api?.reports.summary?.({ from: props.from, to: props.to, sphere: props.sphere, type: props.type, paymentMethod: props.paymentMethod })
      .then((res: any) => { if (!cancelled) setData(res) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [props.from, props.to, props.sphere, props.type, props.paymentMethod, props.refreshKey])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      (window as any).api?.reports.monthly?.({ from: props.from, to: props.to, sphere: props.sphere, type: 'IN', paymentMethod: props.paymentMethod }),
      (window as any).api?.reports.monthly?.({ from: props.from, to: props.to, sphere: props.sphere, type: 'OUT', paymentMethod: props.paymentMethod })
    ]).then(([inRes, outRes]) => {
      if (cancelled) return
      const months = new Set<string>()
      for (const b of (inRes?.buckets || [])) months.add(b.month)
      for (const b of (outRes?.buckets || [])) months.add(b.month)
      setMonthsCount(months.size)
    }).catch(() => setMonthsCount(0))
    return () => { cancelled = true }
  }, [props.from, props.to, props.sphere, props.paymentMethod, props.refreshKey])

  return (
    <div className="card" style={{ marginTop: 12, padding: 12, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <strong>Summen</strong>
          <div className="helper">Für den gewählten Zeitraum und die Filter.</div>
        </div>
      </div>
      {loading && <div>Lade …</div>}
      {data && (
        <div style={{ display: 'grid', gap: 12 }}>
          {(() => {
            const inSum = (data.byType.find(t => t.key === 'IN')?.gross || 0)
            const outSum = (data.byType.find(t => t.key === 'OUT')?.gross || 0)
            const net = inSum - outSum
            const avgPerMonth = monthsCount > 0 ? (net / monthsCount) : null
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                <div className="card" style={{ padding: 10 }}>
                  <div className="helper">Einnahmen (Brutto)</div>
                  <div style={{ fontWeight: 600, color: '#2e7d32' }}>{eurFmt.format(inSum)}</div>
                </div>
                <div className="card" style={{ padding: 10 }}>
                  <div className="helper">Ausgaben (Brutto)</div>
                  <div style={{ fontWeight: 600, color: '#c62828' }}>{eurFmt.format(outSum)}</div>
                </div>
                <div className="card" style={{ padding: 10 }}>
                  <div className="helper">Saldo</div>
                  <div style={{ fontWeight: 600, color: (net >= 0 ? 'var(--success)' : 'var(--danger)') }}>{eurFmt.format(net)}</div>
                </div>
                <div className="card" style={{ padding: 10 }}>
                  <div className="helper">Ø Saldo/Monat{monthsCount > 0 ? ` (${monthsCount}m)` : ''}</div>
                  <div style={{ fontWeight: 600 }}>{avgPerMonth != null ? eurFmt.format(avgPerMonth) : '—'}</div>
                </div>
              </div>
            )
          })()}
          {/* Netto/MwSt/Brutto totals row intentionally removed per UI simplification */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div>
              <strong>Nach Sphäre</strong>
              <ul>
                {data.bySphere.map((r) => (
                  <li key={r.key}><span style={{ minWidth: 90, display: 'inline-block' }}>{r.key}</span> {eurFmt.format(r.gross)}</li>
                ))}
              </ul>
            </div>
            <div>
              <strong>Nach Zahlweg</strong>
              <ul>
                {data.byPaymentMethod.filter(r => r.key === 'BAR' || r.key === 'BANK').map((r, i) => (
                  <li key={(r.key ?? 'NULL') + i}><span style={{ minWidth: 90, display: 'inline-block' }}>{r.key}</span> {eurFmt.format(r.gross)}</li>
                ))}
              </ul>
            </div>
            <div>
              <strong>Nach Art</strong>
              <ul>
                {data.byType.map((r) => (
                  <li key={r.key}><span style={{ minWidth: 90, display: 'inline-block' }}>{r.key}</span> {eurFmt.format(r.gross)}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
