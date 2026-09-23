import React, { useEffect, useState } from 'react'
import { VoucherType, PaymentMethod } from './types'

type DistributionRow = { key: string; gross: number; color?: string | null }
type DistributionSummary = {
  classificationProfile: 'NONPROFIT' | 'GENERAL'
  bySphere: DistributionRow[]
  byPrimaryClassification: DistributionRow[]
}

const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const sphereColors: Record<string, string> = { IDEELL: '#42a5f5', ZWECK: '#66bb6a', VERMOEGEN: '#ffa726', WGB: '#ab47bc' }
const sphereLabels: Record<string, string> = { IDEELL: 'Ideell', ZWECK: 'Zweckbetrieb', VERMOEGEN: 'Vermögensverwaltung', WGB: 'Wirtschaftlicher Geschäftsbetrieb' }
const categoryColors = ['#42a5f5', '#ab47bc', '#26a69a', '#ffa726', '#ef5350', '#78909c']

export default function ReportsSphereDonut(props: { refreshKey?: number; from?: string; to?: string; type?: VoucherType; paymentMethod?: PaymentMethod; earmarkId?: number; budgetId?: number }) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<DistributionSummary | null>(null)
  const [error, setError] = useState(false)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    setHoverIdx(null)
    Promise.resolve((window as any).api?.reports.summary?.({ from: props.from, to: props.to, type: props.type, paymentMethod: props.paymentMethod, earmarkId: props.earmarkId, budgetId: props.budgetId }))
      .then((res: DistributionSummary | undefined) => {
        if (!cancelled) setData(res || null)
      })
      .catch(() => { if (!cancelled) { setData(null); setError(true) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [props.from, props.to, props.type, props.paymentMethod, props.earmarkId, props.budgetId, props.refreshKey])

  const generalProfile = data?.classificationProfile === 'GENERAL'
  const title = generalProfile ? 'Verteilung nach Kategorien' : 'Verteilung nach Sphäre'
  const rows = (generalProfile ? data?.byPrimaryClassification : data?.bySphere) || []
  const total = rows.reduce((sum, row) => sum + Math.abs(row.gross), 0)
  let offset = 0
  const segments = rows.filter(row => row.gross !== 0).map((row, index) => {
    const share = Math.abs(row.gross) / total * 100
    const segment = {
      ...row,
      label: generalProfile ? row.key : sphereLabels[row.key] || row.key,
      color: generalProfile ? row.color || categoryColors[index % categoryColors.length] : sphereColors[row.key] || 'var(--accent)',
      share,
      offset
    }
    offset += share
    return segment
  })
  const active = hoverIdx == null ? null : segments[hoverIdx]

  return (
    <div className="dp-card report-chart-card">
      <div className="dp-card-heading report-chart-header"><h2>{title}</h2></div>
      {loading ? <div role="status">Lade …</div> : error ? <div role="alert">Verteilung konnte nicht geladen werden.</div> : (
        <>
          <div className="report-distribution-body">
            <div className="dp-ring report-distribution-ring">
              <svg viewBox="0 0 200 200" role="img" aria-label={`${title}: ${segments.map(row => `${row.label} ${Math.round(row.share)} %`).join(', ') || 'Keine Buchungen'}`}>
                <circle className="dp-ring-track" cx="100" cy="100" r="80" fill="none" strokeWidth="9" />
                {segments.map((row, index) => (
                  <circle key={row.key} cx="100" cy="100" r="80" pathLength="100" fill="none" stroke={row.color} strokeWidth="9"
                    strokeDasharray={`${row.share} ${100 - row.share}`} strokeDashoffset={-row.offset} transform="rotate(-90 100 100)"
                    opacity={active && hoverIdx !== index ? 0.3 : 1}
                    onMouseEnter={() => setHoverIdx(index)} onMouseLeave={() => setHoverIdx(null)}>
                    <title>{row.label}: {money.format(row.gross)} ({Math.round(row.share)} %)</title>
                  </circle>
                ))}
              </svg>
              {segments.map((row, index) => (
                <div key={row.key} className={`report-distribution-value${hoverIdx === index ? ' is-visible' : ''}`} aria-hidden="true">
                  <strong>{Math.round(row.share)} %</strong>
                </div>
              ))}
            </div>
            <div className="report-distribution-legend">
              {segments.map((row, index) => (
                <div key={row.key} className="report-distribution-item" tabIndex={0}
                  onMouseEnter={() => setHoverIdx(index)} onMouseLeave={() => setHoverIdx(null)}
                  onFocus={() => setHoverIdx(index)} onBlur={() => setHoverIdx(null)}>
                  <i style={{ background: row.color }} aria-hidden="true" />
                  <span>{row.label}</span><strong>{money.format(row.gross)}<small>{Math.round(row.share)} %</small></strong>
                </div>
              ))}
              {!segments.length && <p className="helper">Keine Buchungen im gewählten Zeitraum.</p>}
            </div>
          </div>
          <footer><span>Summe (Brutto)</span><strong>{money.format(rows.reduce((sum, row) => sum + row.gross, 0))}</strong></footer>
        </>
      )}
    </div>
  )
}
