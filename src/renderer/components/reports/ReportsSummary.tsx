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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {/* Nach Sphäre */}
            <div className="card" style={{ padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <span style={{ fontSize: 16 }}>📊</span>
                <strong>Nach Sphäre</strong>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {data.bySphere.map((r) => {
                  // Use rgba with low opacity for theme compatibility (works in light and dark)
                  const colors: Record<string, { bg: string; text: string }> = {
                    IDEELL: { bg: 'rgba(21, 101, 192, 0.15)', text: '#42a5f5' },
                    ZWECK: { bg: 'rgba(46, 125, 50, 0.15)', text: '#66bb6a' },
                    VERMOEGEN: { bg: 'rgba(239, 108, 0, 0.15)', text: '#ffa726' },
                    WGB: { bg: 'rgba(123, 31, 162, 0.15)', text: '#ab47bc' }
                  }
                  const c = colors[r.key] || { bg: 'var(--muted)', text: 'var(--text)' }
                  return (
                    <div key={r.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderRadius: 6, background: c.bg }}>
                      <span style={{ fontWeight: 500, color: c.text, fontSize: 13 }}>{r.key}</span>
                      <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{eurFmt.format(r.gross)}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Nach Zahlweg */}
            <div className="card" style={{ padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <span style={{ fontSize: 16 }}>💳</span>
                <strong>Nach Zahlweg</strong>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {data.byPaymentMethod.filter(r => r.key === 'BAR' || r.key === 'BANK').map((r, i) => {
                  const icons: Record<string, string> = { BANK: '🏦', BAR: '💵' }
                  return (
                    <div key={(r.key ?? 'NULL') + i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderRadius: 6, background: 'var(--muted)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500, fontSize: 13 }}>
                        <span>{icons[r.key ?? ''] || '📄'}</span>
                        {r.key}
                      </span>
                      <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{eurFmt.format(r.gross)}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Nach Art */}
            <div className="card" style={{ padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <span style={{ fontSize: 16 }}>📋</span>
                <strong>Nach Art</strong>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {data.byType.map((r) => {
                  const styles: Record<string, { bg: string; text: string; icon: string }> = {
                    IN: { bg: 'rgba(46, 125, 50, 0.12)', text: '#2e7d32', icon: '↓' },
                    OUT: { bg: 'rgba(198, 40, 40, 0.12)', text: '#c62828', icon: '↑' },
                    TRANSFER: { bg: 'rgba(25, 118, 210, 0.12)', text: '#1976d2', icon: '↔' }
                  }
                  const s = styles[r.key] || { bg: 'var(--muted)', text: 'var(--text)', icon: '•' }
                  return (
                    <div key={r.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderRadius: 6, background: s.bg }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500, color: s.text, fontSize: 13 }}>
                        <span style={{ fontWeight: 700 }}>{s.icon}</span>
                        {r.key}
                      </span>
                      <span style={{ fontWeight: 600, color: s.text, fontVariantNumeric: 'tabular-nums' }}>{eurFmt.format(r.gross)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
