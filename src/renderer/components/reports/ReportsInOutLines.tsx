import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Sphere, PaymentMethod } from './types'

export default function ReportsInOutLines(props: { activateKey?: number; refreshKey?: number; from?: string; to?: string; sphere?: Sphere; paymentMethod?: PaymentMethod; earmarkId?: number; budgetId?: number }) {
  const [loading, setLoading] = useState(false)
  const [inBuckets, setInBuckets] = useState<Array<{ month: string; gross: number }>>([])
  const [outBuckets, setOutBuckets] = useState<Array<{ month: string; gross: number }>>([])
  const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
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
    const onVis = () => { if (document.visibilityState === 'visible') { setTimeout(measure, 0); setTimeout(measure, 120) } }
    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVis)
    const t0 = setTimeout(measure, 0)
    const t1 = setTimeout(measure, 120)
    const t2 = setTimeout(measure, 360)
    return () => { ro.disconnect(); window.removeEventListener('resize', onResize); document.removeEventListener('visibilitychange', onVis); clearTimeout(t0); clearTimeout(t1); clearTimeout(t2) }
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
      (window as any).api?.reports.monthly?.({ from: props.from, to: props.to, sphere: props.sphere, paymentMethod: props.paymentMethod, type: 'IN', earmarkId: props.earmarkId, budgetId: props.budgetId }),
      (window as any).api?.reports.monthly?.({ from: props.from, to: props.to, sphere: props.sphere, paymentMethod: props.paymentMethod, type: 'OUT', earmarkId: props.earmarkId, budgetId: props.budgetId })
    ]).then(([inRes, outRes]) => {
      if (cancelled) return
      setInBuckets((inRes?.buckets || []).map((b: any) => ({ month: b.month, gross: b.gross })))
      setOutBuckets((outRes?.buckets || []).map((b: any) => ({ month: b.month, gross: b.gross })))
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [props.from, props.to, props.sphere, props.paymentMethod, props.earmarkId, props.budgetId, props.refreshKey])
  const months = Array.from(new Set([...(inBuckets.map(b => b.month)), ...(outBuckets.map(b => b.month))])).sort()
  const maxVal = Math.max(1, ...months.map(m => Math.max(Math.abs(inBuckets.find(b => b.month === m)?.gross || 0), Math.abs(outBuckets.find(b => b.month === m)?.gross || 0))))
  const margin = { top: 22, right: 35, bottom: 48, left: 100 }
  const innerH = 188
  const height = innerH + margin.top + margin.bottom
  let baseStep = 54
  const minWidth = Math.max(340, months.length * baseStep + margin.left + margin.right)
  const width = Math.max(containerW || 0, minWidth)
  let step = baseStep
  if (containerW && months.length > 1) {
    const innerW = width - (margin.left + margin.right)
    step = innerW / (months.length - 1)
  }
  const xFor = (idx: number) => months.length === 1 ? (margin.left + width - margin.right) / 2 : margin.left + idx * step
  const yFor = (val: number) => margin.top + (innerH - Math.round((Math.abs(val) / maxVal) * innerH))
  const monthLabel = (m: string, withYear = false) => {
    const [y, mm] = m.split('-').map(Number)
    const d = new Date(Date.UTC(y, (mm - 1) as number, 1))
    const mon = d.toLocaleString('de-DE', { month: 'short' }).replace('.', '')
    return withYear ? `${mon} ${y}` : mon
  }
  const years = useMemo(() => Array.from(new Set(months.map(m => m.slice(0, 4)))), [months])
  const yearText = useMemo(() => {
    const fy = props.from?.slice(0, 4)
    const ty = props.to?.slice(0, 4)
    if (fy && ty && fy === ty) return fy
    if (years.length === 0) return ''
    return years.length === 1 ? years[0] : `${years[0]}–${years[years.length - 1]}`
  }, [props.from, props.to, years])
  const points = (arr: Array<{ month: string; gross: number }>) => months.map((m, i) => `${xFor(i)},${yFor(arr.find(b => b.month === m)?.gross || 0)}`).join(' ')
  
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
    const step = niceStep(maxVal)
    const arr: number[] = []
    for (let v = 0; v <= maxVal; v += step) arr.push(Math.round(v))
    return arr
  })()
  return (
    <div className="dp-card report-chart-card">
      <div className="dp-card-heading report-chart-header">
        <h2>Einnahmen & Ausgaben im Vergleich</h2>
        <div className="legend">
          <span className="legend-item"><span className="legend-swatch legend-swatch-in"></span>Einnahmen</span>
          <span className="legend-item"><span className="legend-swatch legend-swatch-out"></span>Ausgaben</span>
        </div>
      </div>
      {loading && <div>Lade …</div>}
      {!loading && (
        <div ref={containerRef} className="report-chart-scroll">
          {(() => {
            const idx = (typeof hoverIdx === 'number' ? hoverIdx : null)
            if (idx == null) return null
            const m = months[idx]
            const inn = inBuckets.find(b => b.month === m)?.gross || 0
            const out = outBuckets.find(b => b.month === m)?.gross || 0
            const gx = xFor(idx)
            const tooltipX = (gx / width) * 100
            return (
              <div className="report-chart-tooltip" style={{ left: `clamp(0px, calc(${tooltipX}% - 120px), max(0px, 100% - 240px))` }}>
                <strong>{monthLabel(m, true)}</strong>
                <div><span>Einnahmen</span><b>{eurFmt.format(inn)}</b></div>
                <div><span>Ausgaben</span><b>{eurFmt.format(Math.abs(out))}</b></div>
              </div>
            )
          })()}
          <svg width={width} height={height} role="img" aria-label="IN vs OUT">
            {/* Y-Achse Grid + Labels */}
            {yTicks.map((v, i) => (
              <g key={i}>
                <line x1={margin.left} x2={width - margin.right} y1={yFor(v)} y2={yFor(v)} stroke="var(--border)" opacity={0.25} />
                <text x={margin.left - 6} y={yFor(v) + 4} fill="var(--text-dim)" fontSize={11} fontWeight={500} textAnchor="end">{eurFmt.format(v)}</text>
              </g>
            ))}
            <polyline fill="none" stroke="var(--dp-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points(inBuckets)} />
            <polyline fill="none" stroke="var(--dp-amber)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="5 4" points={points(outBuckets)} />
            {months.map((m, i) => (
              <g key={m} style={{ cursor: 'pointer' }}>
                {(() => {
                  const left = (i === 0 ? margin.left : Math.round((xFor(i - 1) + xFor(i)) / 2))
                  const right = (i === months.length - 1 ? (width - margin.right) : Math.round((xFor(i) + xFor(i + 1)) / 2))
                  const hitX = Math.max(margin.left, left)
                  const hitW = Math.max(8, right - left)
                  return (
                    <rect x={hitX} y={margin.top} width={hitW} height={innerH} fill="transparent"
                      onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)} onClick={() => setHoverIdx(i)}
                      onDoubleClick={() => {
                        const [yy, mm] = m.split('-').map(Number)
                        const from = new Date(Date.UTC(yy, (mm - 1) as number, 1)).toISOString().slice(0, 10)
                        const to = new Date(Date.UTC(yy, (mm - 1) as number + 1, 0)).toISOString().slice(0, 10)
                        const ev = new CustomEvent('apply-budget-jump', { detail: { from, to } })
                        window.dispatchEvent(ev)
                      }} />
                  )
                })()}
                <circle cx={xFor(i)} cy={yFor(inBuckets.find(b => b.month === m)?.gross || 0)} r={3} fill="var(--dp-accent)">
                  <title>{`IN ${monthLabel(m, true)}: ${eurFmt.format(inBuckets.find(b => b.month === m)?.gross || 0)}`}</title>
                </circle>
                <circle cx={xFor(i)} cy={yFor(outBuckets.find(b => b.month === m)?.gross || 0)} r={3} fill="var(--dp-amber)">
                  <title>{`OUT ${monthLabel(m, true)}: ${eurFmt.format(outBuckets.find(b => b.month === m)?.gross || 0)}`}</title>
                </circle>
                <text x={xFor(i)} y={margin.top + innerH + 18} textAnchor="middle" fontSize="10">{monthLabel(m, years.length > 1)}</text>
              </g>
            ))}
            {yearText && (
              <text x={Math.round(width / 2)} y={margin.top + innerH + 34} textAnchor="middle" fontSize="11" fill="var(--text-dim)">{yearText}</text>
            )}
          </svg>
        </div>
      )}
    </div>
  )
}
