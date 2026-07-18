import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { IncomeExpenseBarsProps } from './types'
import { addDataChangedListener } from '../../utils/refresh'

type Bucket = { month: string; gross: number }

export default function IncomeExpenseBars({ from, to }: IncomeExpenseBarsProps) {
  const [rowsIn, setRowsIn] = useState<Bucket[]>([])
  const [rowsOut, setRowsOut] = useState<Bucket[]>([])
  const [rowsNet, setRowsNet] = useState<Bucket[]>([])
  const [loading, setLoading] = useState(false)
  const eur = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
  const eurShort = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }), [])
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const ditherId = useId().replace(/:/g, '')
  const incomePatternId = `income-dither-${ditherId}`
  const expensePatternId = `expense-dither-${ditherId}`
  const incomeGradientId = `income-gradient-${ditherId}`
  const expenseGradientId = `expense-gradient-${ditherId}`
  const incomeAuraId = `income-aura-${ditherId}`
  const expenseAuraId = `expense-aura-${ditherId}`

  useEffect(() => {
    let alive = true
    const monthKeys = (f: string, t: string) => {
      const out: string[] = []
      const [y0, m0] = [Number(f.slice(0, 4)), Number(f.slice(5, 7)) - 1]
      const [y1, m1] = [Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1]
      const d = new Date(Date.UTC(y0, m0, 1))
      while (d.getUTCFullYear() < y1 || (d.getUTCFullYear() === y1 && d.getUTCMonth() <= m1)) {
        out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
        d.setUTCMonth(d.getUTCMonth() + 1)
      }
      return out
    }
    const fill = (buckets: Bucket[], keys: string[]) => {
      const map = new Map(buckets.map(b => [String(b.month), b]))
      return keys.map(k => map.get(k) || { month: k, gross: 0 })
    }
    const load = async () => {
      try {
        setLoading(true)
        const [rin, rout] = await Promise.all([
          (window as any).api?.reports?.monthly?.({ from, to, type: 'IN' }),
          (window as any).api?.reports?.monthly?.({ from, to, type: 'OUT' }),
        ])
        const keys = monthKeys(from, to)
        const ins = fill(((rin?.buckets || rin || []) as Bucket[]).map(b => ({ month: String((b as any).month), gross: Number((b as any).gross)||0 })), keys)
        const outs = fill(((rout?.buckets || rout || []) as Bucket[]).map(b => ({ month: String((b as any).month), gross: Math.abs(Number((b as any).gross)||0) })), keys)
        const nets = ins.map((inRow, i) => ({ month: inRow.month, gross: inRow.gross - outs[i].gross }))
        if (!alive) return
        setRowsIn(ins)
        setRowsOut(outs)
        setRowsNet(nets)
      } catch {
        if (alive) { setRowsIn([]); setRowsOut([]); setRowsNet([]) }
      } finally { if (alive) setLoading(false) }
    }
    load()
    const onChanged = () => load()
    const removeDataChangedListener = addDataChangedListener(['vouchers'], onChanged)
    return () => { alive = false; removeDataChangedListener() }
  }, [from, to])

  const labels = rowsIn.map(r => r.month)
  const monthNames = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']
  const monthNamesFull = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']
  const maxVal = Math.max(1,
    ...rowsIn.map(r => r.gross),
    ...rowsOut.map(r => r.gross),
    ...rowsIn.map((row, index) => row.gross + (rowsOut[index]?.gross || 0)),
    ...rowsNet.map(r => Math.abs(r.gross))
  )

  // Increase horizontal padding so all month labels can fit; distribute bars to avoid clipping.
  // Increased P from 64 to 100 to prevent leftmost month labels (e.g., November) from overlapping with Y-axis
  const W = 760, H = 200, P = 100
  // Center bars in segments so the first bar doesn't overlap the Y-axis
  const xs = (i: number, n: number) => {
    const usable = W - 2 * P
    const seg = usable / Math.max(1, n)
    return P + seg / 2 + i * seg
  }
  const baseY = H - 28
  const maxH = baseY - 16
  // Y-axis ticks (nice numbers)
  function niceStep(max: number) {
    if (max <= 0) return 1
    const exp = Math.floor(Math.log10(max))
    const base = Math.pow(10, exp)
    const m = max / base
    let step = base
    if (m <= 2) step = base / 5
    else if (m <= 5) step = base / 2
    // Aim for ~5-7 ticks
    const target = Math.max(1, Math.round(max / step))
    if (target > 8) step *= 2
    return step
  }
  const yStep = niceStep(maxVal)
  const yTicks: number[] = []
  for (let v = 0; v <= maxVal + 1e-9; v += yStep) yTicks.push(Math.round(v))
  const yFor = (v: number) => baseY - Math.min(1, v / Math.max(1e-9, maxVal)) * maxH

  const smoothLine = (points: Array<{ x: number; y: number }>) => {
    if (!points.length) return ''
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
    let path = `M ${points[0].x} ${points[0].y}`
    for (let i = 0; i < points.length - 1; i += 1) {
      const previous = points[Math.max(0, i - 1)]
      const current = points[i]
      const next = points[i + 1]
      const after = points[Math.min(points.length - 1, i + 2)]
      path += ` C ${current.x + (next.x - previous.x) / 6} ${current.y + (next.y - previous.y) / 6}, ${next.x - (after.x - current.x) / 6} ${next.y - (after.y - current.y) / 6}, ${next.x} ${next.y}`
    }
    return path
  }
  const areaPath = (top: number[], bottom: number[]) => {
    if (!labels.length) return ''
    const topPoints = top.map((value, index) => ({ x: xs(index, labels.length), y: yFor(value) }))
    const bottomPoints = bottom.map((value, index) => ({ x: xs(index, labels.length), y: yFor(value) })).reverse()
    return `${smoothLine(topPoints)} L ${bottomPoints[0].x} ${bottomPoints[0].y} ${smoothLine(bottomPoints).replace(/^M[^C]*/, '')} Z`
  }
  const incomeValues = rowsIn.map(row => row.gross)
  const stackedValues = rowsIn.map((row, index) => row.gross + (rowsOut[index]?.gross || 0))
  const incomeAreaPath = areaPath(incomeValues, incomeValues.map(() => 0))
  const expenseAreaPath = areaPath(stackedValues, incomeValues)

  const mouseMove = (ev: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg || !labels.length) return
    // Robust coordinate mapping using SVGPoint + CTM (handles any scaling/padding)
    const pt = (svg as any).createSVGPoint ? (svg as any).createSVGPoint() : null
    let x = 0
    if (pt && (svg as any).getScreenCTM) {
      pt.x = ev.clientX; pt.y = ev.clientY
      const ctm = (svg as any).getScreenCTM()
      const inv = ctm && ctm.inverse ? ctm.inverse() : null
      const loc = inv ? pt.matrixTransform(inv) : null
      x = loc ? Number(loc.x) : 0
    } else {
      const rect = svg.getBoundingClientRect()
      const scaleX = W / Math.max(1, rect.width)
      x = (ev.clientX - rect.left) * scaleX
    }
    let best = 0
    let bestDist = Math.abs(x - xs(0, labels.length))
    for (let i = 1; i < labels.length; i++) {
      const d = Math.abs(x - xs(i, labels.length))
      if (d < bestDist) { best = i; bestDist = d }
    }
    setHoverIdx(best)
  }

  return (
  <section className="card chart-card-overflow dashboard-dither-chart">
      <header className="chart-header-baseline">
        <strong>Einnahmen vs. Ausgaben</strong>
        <span className="helper">{from} → {to}</span>
      </header>
      <div className="chart-overflow-container">
  <svg ref={svgRef} onMouseMove={mouseMove} onMouseLeave={() => setHoverIdx(null)} viewBox={`0 0 ${W} ${H}`} width="100%" className="chart-svg-responsive" role="img" aria-label="Einnahmen vs Ausgaben">
          <defs>
            <linearGradient id={incomeGradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--success)" stopOpacity="0.24" />
              <stop offset="100%" stopColor="var(--success)" stopOpacity="0.82" />
            </linearGradient>
            <linearGradient id={expenseGradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--danger)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="var(--danger)" stopOpacity="0.72" />
            </linearGradient>
            <pattern id={incomePatternId} width="6" height="6" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.65" fill="var(--success)" opacity="0.9" />
              <circle cx="4" cy="2.5" r="0.55" fill="var(--success)" opacity="0.62" />
              <circle cx="2.5" cy="5" r="0.5" fill="var(--success)" opacity="0.44" />
            </pattern>
            <pattern id={expensePatternId} width="6" height="6" patternUnits="userSpaceOnUse">
              <path d="M -2 6 L 6 -2 M 0 8 L 8 0 M 4 10 L 10 4" stroke="var(--danger)" strokeWidth="1.1" opacity="0.82" />
            </pattern>
            <filter id={incomeAuraId} x="-15%" y="-20%" width="130%" height="140%"><feGaussianBlur stdDeviation="9" /></filter>
            <filter id={expenseAuraId} x="-15%" y="-20%" width="130%" height="140%"><feGaussianBlur stdDeviation="9" /></filter>
          </defs>
          {/* Axes */}
          <line x1={P/2} x2={W-P/2} y1={baseY} y2={baseY} stroke="var(--border)" />
          <line x1={P} x2={P} y1={16} y2={baseY} stroke="var(--border)" />
          {/* Y grid + labels */}
          {yTicks.map((v, i) => (
            <g key={i}>
              <line x1={P} x2={W-P/2} y1={yFor(v)} y2={yFor(v)} stroke="var(--border)" opacity={0.25} />
              <text x={P-6} y={yFor(v)+4} fill="var(--text-dim)" fontSize={10} textAnchor="end">{eurShort.format(v)}</text>
            </g>
          ))}
          {/* Dither Kit-inspired stacked areas: income gradient + expense hatch, with an aura bloom. */}
          <path d={incomeAreaPath} fill="var(--success)" opacity="0.15" filter={`url(#${incomeAuraId})`} />
          <path d={expenseAreaPath} fill="var(--danger)" opacity="0.13" filter={`url(#${expenseAuraId})`} />
          <path d={incomeAreaPath} fill={`url(#${incomeGradientId})`} />
          <path d={incomeAreaPath} fill={`url(#${incomePatternId})`} opacity="0.76" />
          <path d={expenseAreaPath} fill={`url(#${expenseGradientId})`} />
          <path d={expenseAreaPath} fill={`url(#${expensePatternId})`} opacity="0.8" />
          {incomeValues.length > 1 && <path d={smoothLine(incomeValues.map((value, index) => ({ x: xs(index, labels.length), y: yFor(value) })))} fill="none" stroke="var(--success)" strokeWidth="1.3" opacity="0.9" />}
          {stackedValues.length > 1 && <path d={smoothLine(stackedValues.map((value, index) => ({ x: xs(index, labels.length), y: yFor(value) })))} fill="none" stroke="var(--danger)" strokeWidth="1.3" opacity="0.9" />}
          {/* X labels with dynamic thinning (align with BalanceAreaChart) */}
          {(() => {
            let tickEvery = 1
            const total = labels.length
            if (total > 72) tickEvery = 12
            else if (total > 48) tickEvery = 6
            else if (total > 24) tickEvery = 3
            else if (total > 12) tickEvery = 2
            // Check if multi-year range to include year in label
            const yearSpan = from && to ? (Number(to.slice(0,4)) - Number(from.slice(0,4))) : 0
            return labels.map((m, i) => {
              if (i % tickEvery !== 0 && i !== labels.length - 1) return null
              const x = xs(i, labels.length)
              const monthName = monthNames[Math.max(0, Math.min(11, Number(m.slice(5)) - 1))] || m.slice(5)
              const label = yearSpan > 0 ? `${monthName} ${m.slice(2,4)}` : monthName
              return <text key={m} x={x} y={H-6} fill="var(--text-dim)" fontSize={10} textAnchor="middle">{label}</text>
            })
          })()}
          {/* Hover guide */}
          {hoverIdx != null && labels[hoverIdx] && (
            <g>
              <line x1={xs(hoverIdx, labels.length)} x2={xs(hoverIdx, labels.length)} y1={16} y2={H-28} stroke="var(--border)" strokeDasharray="3 4" />
            </g>
          )}
        </svg>
        {hoverIdx != null && (
          <div className="chart-tooltip-dynamic" style={{ left: `${(xs(hoverIdx, labels.length)/W)*100}%` }}>
            <div className="chart-tooltip-header">{monthNamesFull[Math.max(0, Math.min(11, Number(String(labels[hoverIdx]).slice(5)) - 1))] || String(labels[hoverIdx]).slice(5)}</div>
            <div className="chart-tooltip-row"><span style={{ color: 'var(--success)' }}>Einnahmen</span> <strong style={{ color: 'var(--success)' }}>{eur.format(rowsIn[hoverIdx]?.gross || 0)}</strong></div>
            <div className="chart-tooltip-row"><span style={{ color: 'var(--danger)' }}>Ausgaben</span> <strong style={{ color: 'var(--danger)' }}>{eur.format(rowsOut[hoverIdx]?.gross || 0)}</strong></div>
            <div className="chart-tooltip-row"><span style={{ color: 'var(--warning)' }}>Netto</span> <strong style={{ color: 'var(--warning)' }}>{eur.format(rowsNet[hoverIdx]?.gross || 0)}</strong></div>
          </div>
        )}
        {loading && <div className="helper chart-loading-overlay">Laden…</div>}
      </div>
    </section>
  )
}
