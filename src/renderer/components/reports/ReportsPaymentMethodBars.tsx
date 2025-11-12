import React, { useEffect, useMemo, useRef, useState } from 'react'
import { PaymentMethod } from './types'

export default function ReportsPaymentMethodBars(props: { refreshKey?: number; from?: string; to?: string }) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<Array<{ key: PaymentMethod; inGross: number; outGross: number }>>([])
  const svgRef = useRef<SVGSVGElement | null>(null)
  const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      (window as any).api?.reports.summary?.({ from: props.from, to: props.to, type: 'IN' }),
      (window as any).api?.reports.summary?.({ from: props.from, to: props.to, type: 'OUT' })
    ]).then(([sumIn, sumOut]) => {
      if (cancelled) return
      const keys: Array<PaymentMethod> = ['BAR', 'BANK']
      const map: Record<string, { inGross: number; outGross: number }> = { 'BAR': { inGross: 0, outGross: 0 }, 'BANK': { inGross: 0, outGross: 0 } }
      sumIn?.byPaymentMethod.forEach((r: any) => { const k = r.key; if (k === 'BAR' || k === 'BANK') { map[k].inGross = r.gross } })
      sumOut?.byPaymentMethod.forEach((r: any) => { const k = r.key; if (k === 'BAR' || k === 'BANK') { map[k].outGross = r.gross } })
      setData(keys.map(k => ({ key: k, inGross: map[k].inGross || 0, outGross: map[k].outGross || 0 })))
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [props.from, props.to, props.refreshKey])
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
    <div className="card report-chart-card">
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
            const label = r.key
            return (
              <div className="chart-tooltip">
                <div className="chart-tooltip-header">{label}</div>
                <div className="chart-tooltip-row"><span style={{ color: 'var(--success)' }}>Einnahmen</span> <strong style={{ color: 'var(--success)' }}>{eurFmt.format(r.inGross)}</strong></div>
                <div className="chart-tooltip-row"><span style={{ color: 'var(--danger)' }}>Ausgaben</span> <strong style={{ color: 'var(--danger)' }}>{eurFmt.format(Math.abs(r.outGross))}</strong></div>
              </div>
            )
          })()}
          <svg ref={svgRef} width={width} height={height} role="img" aria-label="Nach Zahlweg">
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
              const label = r.key
              return (
                <g key={(r.key ?? 'NULL') + i} onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)}>
                  <text x={margin.left - 8} y={y + rowH / 2} textAnchor="end" dominantBaseline="middle" fontSize="12">{label}</text>
                  <rect x={margin.left} y={yBar} width={Math.max(0, inX - margin.left)} height={10} fill="#2e7d32" rx={3} />
                  <rect x={margin.left} y={yBar + 12} width={Math.max(0, outX - margin.left)} height={10} fill="#c62828" rx={3} />
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
