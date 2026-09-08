import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Sphere, VoucherType, PaymentMethod } from './types'

function monthKeys(from?: string, to?: string): string[] {
  // Build inclusive YYYY-MM keys; fallback to current year if props missing
  let f = from, t = to
  if (!f || !t) {
    const now = new Date()
    const y = now.getUTCFullYear()
    f = new Date(Date.UTC(y, 0, 1)).toISOString().slice(0, 10)
    t = new Date(Date.UTC(y, 11, 31)).toISOString().slice(0, 10)
  }
  const out: string[] = []
  const [y0, m0] = [Number(String(f).slice(0, 4)), Number(String(f).slice(5, 7)) - 1]
  const [y1, m1] = [Number(String(t).slice(0, 4)), Number(String(t).slice(5, 7)) - 1]
  const d = new Date(Date.UTC(y0, m0, 1))
  while (d.getUTCFullYear() < y1 || (d.getUTCFullYear() === y1 && d.getUTCMonth() <= m1)) {
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
    d.setUTCMonth(d.getUTCMonth() + 1)
  }
  return out
}

export default function ReportsMonthlyChart(props: { activateKey?: number; refreshKey?: number; from?: string; to?: string; sphere?: Sphere; type?: VoucherType; paymentMethod?: PaymentMethod; earmarkId?: number; budgetId?: number }) {
  const [loading, setLoading] = useState(false)
  const [inBuckets, setInBuckets] = useState<Array<{ month: string; gross: number }>>([])
  const [outBuckets, setOutBuckets] = useState<Array<{ month: string; gross: number }>>([])
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [containerW, setContainerW] = useState<number>(0)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth
      if (w && Math.abs(w - containerW) > 1) setContainerW(w)
    }
    measure()
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    const onResize = () => measure()
    const onVisibility = () => { if (document.visibilityState === 'visible') { setTimeout(measure, 0); setTimeout(measure, 120) } }
    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVisibility)
    const t0 = setTimeout(measure, 0)
    const t1 = setTimeout(measure, 120)
    const t2 = setTimeout(measure, 360)
    return () => { ro.disconnect(); window.removeEventListener('resize', onResize); document.removeEventListener('visibilitychange', onVisibility); clearTimeout(t0); clearTimeout(t1); clearTimeout(t2) }
  }, [loading])
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth
      if (w && Math.abs(w - containerW) > 1) setContainerW(w)
    }
    requestAnimationFrame(() => {
      measure()
      setTimeout(measure, 0)
      setTimeout(measure, 120)
      setTimeout(measure, 360)
    })
  }, [props.activateKey])
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      (window as any).api?.reports.monthly?.({ from: props.from, to: props.to, sphere: props.sphere, type: 'IN', paymentMethod: props.paymentMethod, earmarkId: props.earmarkId, budgetId: props.budgetId }),
      (window as any).api?.reports.monthly?.({ from: props.from, to: props.to, sphere: props.sphere, type: 'OUT', paymentMethod: props.paymentMethod, earmarkId: props.earmarkId, budgetId: props.budgetId })
    ]).then(([inRes, outRes]) => {
      if (cancelled) return
      setInBuckets((inRes?.buckets || []).map((b: any) => ({ month: b.month, gross: b.gross })))
      setOutBuckets((outRes?.buckets || []).map((b: any) => ({ month: b.month, gross: b.gross })))
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [props.from, props.to, props.sphere, props.paymentMethod, props.earmarkId, props.budgetId, props.refreshKey])

  // Build the X-axis months based on filters
  // - With explicit from/to: show full continuous range (all months)
  // - Without from/to (default): show only months that actually have data
  const months = (() => {
    if (props.from && props.to) {
      return monthKeys(props.from, props.to)
    }
    // No date filter: use only months that have buckets
    const allMonths = new Set<string>()
    inBuckets.forEach(b => allMonths.add(String(b.month)))
    outBuckets.forEach(b => allMonths.add(String(b.month)))
    if (allMonths.size === 0) {
      // Fallback to current year if no data at all
      const now = new Date()
      const y = now.getUTCFullYear()
      return monthKeys(
        new Date(Date.UTC(y, 0, 1)).toISOString().slice(0, 10),
        new Date(Date.UTC(y, 11, 31)).toISOString().slice(0, 10)
      )
    }
    return Array.from(allMonths).sort()
  })()
  const inMap = new Map(inBuckets.map(b => [String(b.month), Number(b.gross) || 0]))
  const outMap = new Map(outBuckets.map(b => [String(b.month), Math.abs(Number(b.gross) || 0)]))
  const series = months.map(m => ({
    month: m,
    inGross: inMap.get(m) || 0,
    outGross: -(outMap.get(m) || 0),
  }))
  const saldo = (() => {
    let cum = 0
    return series.map((s) => { cum += (s.inGross + s.outGross); return cum })
  })()
  const scaleVals = (() => {
    const vals: number[] = []
    for (const s of series) { vals.push(Math.abs(s.inGross)); vals.push(Math.abs(s.outGross)); }
    for (const v of saldo) vals.push(v)
    return vals
  })()
  const maxValRaw = Math.max(1, ...scaleVals)
  const maxVal = maxValRaw
  const minVal = Math.min(0, ...saldo, ...series.map(entry => entry.inGross))
  const valueRange = maxVal - minVal
  const margin = { top: 22, right: 28, bottom: 48, left: 100 }
  const innerH = 180
  const defaultGroupW = 44
  const barW = 16
  const gap = 16
  const minWidth = Math.max(360, months.length * (defaultGroupW + gap) + margin.left + margin.right)
  const width = Math.max(containerW || 0, minWidth)
  const height = innerH + margin.top + margin.bottom
  const yBase = margin.top
  const yAxisX = margin.left - 2
  const innerW = width - (margin.left + margin.right)
  const groupW = innerW / Math.max(1, months.length)
  const monthLabel = (m: string, withYear = false) => {
    const [y, mm] = m.split('-').map(Number)
    const d = new Date(Date.UTC(y, (mm - 1) as number, 1))
    const mon = d.toLocaleString('de-DE', { month: 'short' }).replace('.', '')
    return withYear ? `${mon} ${y}` : mon
  }
  const monthLabelFull = (m: string) => {
    const [y, mm] = m.split('-').map(Number)
    const d = new Date(Date.UTC(y, (mm - 1) as number, 1))
    const mon = d.toLocaleString('de-DE', { month: 'long' })
    return mon.charAt(0).toUpperCase() + mon.slice(1)
  }
  const years = useMemo(() => Array.from(new Set(months.map(m => m.slice(0, 4)))), [months])
  const yearText = useMemo(() => {
    const fy = props.from?.slice(0, 4)
    const ty = props.to?.slice(0, 4)
    if (fy && ty && fy === ty) return fy
    if (years.length === 0) return ''
    return years.length === 1 ? years[0] : `${years[0]}–${years[years.length - 1]}`
  }, [props.from, props.to, years])
  const xFor = (idx: number) => margin.left + (idx + 0.5) * groupW - barW
  const yFor = (val: number) => yBase + (maxVal - val) / valueRange * innerH
  
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
  const yTicks = (() => {
    const step = niceStep(valueRange)
    const arr: number[] = []
    for (let v = Math.ceil(minVal / step) * step; v <= maxVal; v += step) arr.push(v)
    return arr
  })()

  // Robust mouse tracking with SVG coordinate transformation
  const mouseMove = (ev: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg || !series.length) return
    // Use SVGPoint + CTM for accurate coordinate mapping (handles scaling/padding)
    const pt = (svg as any).createSVGPoint ? (svg as any).createSVGPoint() : null
    let x = 0
    if (pt && (svg as any).getScreenCTM) {
      pt.x = ev.clientX; pt.y = ev.clientY
      const ctm = (svg as any).getScreenCTM()
      const inv = ctm && ctm.inverse ? ctm.inverse() : null
      const loc = inv ? pt.matrixTransform(inv) : null
      x = loc ? Number(loc.x) : 0
    } else {
      // Fallback for browsers without SVGPoint
      const rect = svg.getBoundingClientRect()
      const scaleX = width / Math.max(1, rect.width)
      x = (ev.clientX - rect.left) * scaleX
    }
    // Find closest bar group
    let best = 0
    let bestDist = Math.abs(x - (xFor(0) + barW))
    for (let i = 1; i < series.length; i++) {
      const d = Math.abs(x - (xFor(i) + barW))
      if (d < bestDist) { best = i; bestDist = d }
    }
    setHoverIdx(best)
  }

  return (
    <div className="dp-card report-chart-card">
      <div className="dp-card-heading report-chart-header">
        <h2>Monatliche Entwicklung</h2>
        <div className="legend">
          <span className="legend-item"><span className="legend-swatch legend-swatch-in"></span>Einnahmen</span>
          <span className="legend-item"><span className="legend-swatch legend-swatch-out"></span>Ausgaben</span>
          <span className="legend-item"><span className="legend-swatch report-swatch-balance"></span>Kumulierter Saldo</span>
        </div>
      </div>
      {loading && <div>Lade …</div>}
      {!loading && (
        <div ref={containerRef} className="report-chart-scroll">
          {(() => {
            const focusIdx = (typeof hoverIdx === 'number' ? hoverIdx : null)
            const idx = focusIdx
            if (idx == null || !series[idx]) return null
            const s = series[idx]
            const net = s.inGross + s.outGross
            const gx = xFor(idx) + barW
            const tooltipX = (gx / width) * 100
            return (
              <div className="report-chart-tooltip" style={{ left: `clamp(0px, calc(${tooltipX}% - 120px), max(0px, 100% - 240px))` }}>
                <strong>{monthLabelFull(s.month)} {s.month.slice(0, 4)}</strong>
                <div><span>Einnahmen</span><b>{eurFmt.format(s.inGross)}</b></div>
                <div><span>Ausgaben</span><b>{eurFmt.format(Math.abs(s.outGross))}</b></div>
                <div><span>Netto</span><b>{eurFmt.format(net)}</b></div>
                <div className="report-tooltip-total"><span>Saldo kumuliert</span><b>{eurFmt.format(saldo[idx] || 0)}</b></div>
              </div>
            )
          })()}
          <svg ref={svgRef} width={width} height={height} role="img" aria-label="Monatsverlauf" onMouseMove={mouseMove} onMouseLeave={() => setHoverIdx(null)}>
            {/* Y-Achse Grid + Labels */}
            {yTicks.map((v, i) => (
              <g key={`ytick-${i}`}>
                <line x1={margin.left} y1={yFor(v)} x2={width - margin.right} y2={yFor(v)} stroke="var(--border)" opacity={0.25} />
                <text x={margin.left - 6} y={yFor(v) + 4} fill="var(--text-dim)" fontSize={11} fontWeight={500} textAnchor="end">{eurFmt.format(v)}</text>
              </g>
            ))}
            {series.map((s, i) => {
              const gx = xFor(i)
              const hIn = Math.abs(yFor(s.inGross) - yFor(0))
              const hOut = Math.abs(yFor(Math.abs(s.outGross)) - yFor(0))
              const yIn = Math.min(yFor(0), yFor(s.inGross))
              const yOut = yFor(Math.abs(s.outGross))
              return (
                <g key={i}>
                  <rect x={gx - 3} y={yIn} width={barW} height={hIn} fill="var(--dp-accent)" rx={2} />
                  <rect x={gx + barW + 3} y={yOut} width={barW} height={hOut} fill="var(--dp-amber)" rx={2} />
                  <text x={gx + barW} y={yBase + innerH + 18} textAnchor="middle" fontSize="10">{monthLabel(s.month, years.length > 1)}</text>
                </g>
              )
            })}
            {saldo.length > 0 && (
              <g>
                {saldo.map((v, i) => {
                  const x = xFor(i) + barW
                  const y = yFor(v)
                  return <circle key={`p-${i}`} cx={x} cy={y} r={2.5} fill="var(--dp-mint)" />
                })}
                {saldo.map((v, i) => {
                  if (i === 0) return null
                  const x1 = xFor(i - 1) + barW
                  const y1 = yFor(saldo[i - 1])
                  const x2 = xFor(i) + barW
                  const y2 = yFor(v)
                  return <line key={`l-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--dp-mint)" strokeWidth={2} strokeLinecap="round" />
                })}
              </g>
            )}
            <line x1={yAxisX} y1={yFor(0)} x2={width - margin.right} y2={yFor(0)} stroke="var(--border)" />
            {yearText && (
              <text x={Math.round(width / 2)} y={yBase + innerH + 34} textAnchor="middle" fontSize="11" fill="var(--text-dim)">{yearText}</text>
            )}
          </svg>
        </div>
      )}
    </div>
  )
}
