import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
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
  const svgRef = useRef<SVGSVGElement | null>(null)
  const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const ditherId = useId().replace(/:/g, '')
  const incomeGradientId = `payment-income-gradient-${ditherId}`
  const expenseGradientId = `payment-expense-gradient-${ditherId}`
  const incomePatternId = `payment-income-dither-${ditherId}`
  const expensePatternId = `payment-expense-dither-${ditherId}`
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
  const maxVal = Math.max(1, ...data.map(d => Math.max(d.inGross, d.outGross)))
  const margin = { top: 22, right: 24, bottom: 48, left: 100 }
  const rowH = 30
  const gap = 14
  const innerH = data.length * rowH + (data.length - 1) * gap
  const height = innerH + margin.top + margin.bottom
  const width = 420
  const xFor = (val: number) => margin.left + Math.round((Math.abs(val) / maxVal) * (width - margin.left - margin.right))
  
  // Y-Achse Ticks
  function niceStep(max: number) {
    if (max <= 0) return 1
    const exp = Math.floor(Math.log10(max))
    const base = Math.pow(10, exp)
    const m = max / base
    let step = base
    if (m <= 2) step = base / 5
    else if (m <= 5) step = base / 2
    const target = Math.max(1, Math.round(max / step))
    if (target > 6) step *= 2
    return step
  }
  const xTicks = (() => {
    const step = niceStep(maxVal)
    const arr: number[] = []
    for (let v = 0; v <= maxVal; v += step) arr.push(Math.round(v))
    return arr
  })()
  return (
    <div className="card report-chart-card dither-chart-card">
      <div className="report-chart-header">
        <strong>Nach Zahlweg (IN/OUT)</strong>
        <div className="legend">
          <span className="legend-item"><span className="legend-swatch legend-swatch-in"></span>IN</span>
          <span className="legend-item"><span className="legend-swatch legend-swatch-out"></span>OUT</span>
        </div>
      </div>
      {loading && <div>Lade …</div>}
      {!loading && (
        <div className="chart-container-relative">
          {(() => {
            const idx = hoverIdx
            if (idx == null || !data[idx]) return null
            const r = data[idx]
            return (
              <div className="chart-tooltip">
                <div className="chart-tooltip-header">{r.label}</div>
                <div className="chart-tooltip-row"><span style={{ color: 'var(--success)' }}>Einnahmen</span> <strong style={{ color: 'var(--success)' }}>{eurFmt.format(r.inGross)}</strong></div>
                <div className="chart-tooltip-row"><span style={{ color: 'var(--danger)' }}>Ausgaben</span> <strong style={{ color: 'var(--danger)' }}>{eurFmt.format(Math.abs(r.outGross))}</strong></div>
              </div>
            )
          })()}
          <svg ref={svgRef} width={width} height={height} role="img" aria-label="Nach Zahlweg">
            <defs>
              <linearGradient id={incomeGradientId} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="var(--success)" stopOpacity="0.42" /><stop offset="100%" stopColor="var(--success)" stopOpacity="0.92" /></linearGradient>
              <linearGradient id={expenseGradientId} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="var(--danger)" stopOpacity="0.38" /><stop offset="100%" stopColor="var(--danger)" stopOpacity="0.88" /></linearGradient>
              <pattern id={incomePatternId} width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.65" fill="var(--success)" opacity="0.94" /><circle cx="4" cy="2.5" r="0.5" fill="var(--success)" opacity="0.6" /><circle cx="2.5" cy="5" r="0.45" fill="var(--success)" opacity="0.42" /></pattern>
              <pattern id={expensePatternId} width="6" height="6" patternUnits="userSpaceOnUse"><path d="M -2 6 L 6 -2 M 0 8 L 8 0 M 4 10 L 10 4" stroke="var(--danger)" strokeWidth="1.1" opacity="0.85" /></pattern>
            </defs>
            {/* X-Achse Grid + Labels */}
            {xTicks.map((v, i) => (
              <g key={i}>
                <line x1={xFor(v)} x2={xFor(v)} y1={margin.top - 6} y2={height - margin.bottom + 6} stroke="var(--border)" opacity={0.25} />
                <text x={xFor(v)} y={height - margin.bottom + 14} fill="var(--text-dim)" fontSize={10} fontWeight={500} textAnchor="start" transform={`rotate(45, ${xFor(v)}, ${height - margin.bottom + 14})`}>{eurFmt.format(v)}</text>
              </g>
            ))}
            {data.map((r, i) => {
              const y = margin.top + i * (rowH + gap)
              const inX = xFor(r.inGross)
              const outX = xFor(r.outGross)
              const yBar = y + 8
              return (
                <g key={(r.key ?? 'NULL') + i} onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)}>
                  <text x={margin.left - 8} y={y + rowH / 2} textAnchor="end" dominantBaseline="middle" fontSize="12">{r.label}</text>
                  <rect x={margin.left} y={yBar} width={Math.max(0, inX - margin.left)} height={10} fill={`url(#${incomeGradientId})`} rx={3} />
                  <rect x={margin.left} y={yBar} width={Math.max(0, inX - margin.left)} height={10} fill={`url(#${incomePatternId})`} opacity="0.76" rx={3} />
                  <rect x={margin.left} y={yBar + 12} width={Math.max(0, outX - margin.left)} height={10} fill={`url(#${expenseGradientId})`} rx={3} />
                  <rect x={margin.left} y={yBar + 12} width={Math.max(0, outX - margin.left)} height={10} fill={`url(#${expensePatternId})`} opacity="0.8" rx={3} />
                </g>
              )
            })}
            <line x1={margin.left - 2} y1={margin.top - 6} x2={margin.left - 2} y2={height - margin.bottom + 6} stroke="var(--border)" />
          </svg>
        </div>
      )}
    </div>
  )
}
