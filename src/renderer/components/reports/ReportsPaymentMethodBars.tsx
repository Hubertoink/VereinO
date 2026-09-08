import React, { useEffect, useMemo, useState } from 'react'
import { Sphere, VoucherType } from './types'

type PaymentAccountSummaryRow = {
  accountId: number | null
  key: string
  color?: string | null
  gross: number
}

type AccountBarRow = {
  key: string
  label: string
  color?: string | null
  inGross: number
  outGross: number
}

export default function ReportsPaymentMethodBars(props: { refreshKey?: number; from?: string; to?: string; sphere?: Sphere; type?: VoucherType; earmarkId?: number; budgetId?: number }) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<AccountBarRow[]>([])
  const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const requestedTypes: Array<'IN' | 'OUT'> = props.type === 'IN' ? ['IN'] : props.type === 'OUT' ? ['OUT'] : ['IN', 'OUT']
    Promise.all(
      requestedTypes.map(type =>
        (window as any).api?.reports.summary?.({
          from: props.from, to: props.to, sphere: props.sphere,
          type,
          earmarkId: props.earmarkId, budgetId: props.budgetId
        })
      )
    ).then((results) => {
      if (cancelled) return
      const rows = new Map<string, AccountBarRow>()
      const mergeRows = (items: PaymentAccountSummaryRow[], field: 'inGross' | 'outGross') => {
        for (const item of items) {
          const key = item.accountId == null ? `legacy:${item.key}` : `account:${item.accountId}`
          const existing = rows.get(key) || { key, label: item.key, color: item.color, inGross: 0, outGross: 0 }
          existing.label = item.key || existing.label
          existing.color = item.color || existing.color
          existing[field] += Number(item.gross || 0)
          rows.set(key, existing)
        }
      }
      results.forEach((result, index) => {
        mergeRows(((result?.byPaymentAccount || []) as PaymentAccountSummaryRow[]), requestedTypes[index] === 'IN' ? 'inGross' : 'outGross')
      })
      setData(Array.from(rows.values()).filter(row => row.inGross || row.outGross))
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [props.from, props.to, props.sphere, props.type, props.earmarkId, props.budgetId, props.refreshKey])
  const maxVal = Math.max(1, ...data.flatMap(row => [Math.abs(row.inGross), Math.abs(row.outGross)]))
  return (
    <div className="dp-card report-chart-card">
      <div className="dp-card-heading report-chart-header">
        <h2>Einnahmen & Ausgaben nach Zahlweg</h2>
        <div className="legend">
          <span className="legend-item"><span className="legend-swatch legend-swatch-in"></span>Einnahmen</span>
          <span className="legend-item"><span className="legend-swatch legend-swatch-out"></span>Ausgaben</span>
        </div>
      </div>
      {loading && <div>Lade …</div>}
      {!loading && (
        <div className="report-payment-list">
          {data.length === 0 && <p className="helper">Keine Buchungen im gewählten Zeitraum.</p>}
          {data.map(row => (
            <section key={row.key} className="report-payment-row" aria-label={row.label}>
              <h3>{row.label}</h3>
              <div className="report-payment-series" aria-label={`Einnahmen: ${eurFmt.format(row.inGross)}`}>
                <div className="report-payment-track" aria-hidden="true"><i style={{ width: `${Math.abs(row.inGross) / maxVal * 100}%` }} /></div>
                <strong>{eurFmt.format(row.inGross)}</strong>
              </div>
              <div className="report-payment-series report-payment-series--out" aria-label={`Ausgaben: ${eurFmt.format(Math.abs(row.outGross))}`}>
                <div className="report-payment-track" aria-hidden="true"><i style={{ width: `${Math.abs(row.outGross) / maxVal * 100}%` }} /></div>
                <strong>{eurFmt.format(Math.abs(row.outGross))}</strong>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
