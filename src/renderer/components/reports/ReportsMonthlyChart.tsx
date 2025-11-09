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

export default function ReportsMonthlyChart(props: { activateKey?: number; refreshKey?: number; from?: string; to?: string; sphere?: Sphere; type?: VoucherType; paymentMethod?: PaymentMethod }) {
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
      const rectW = el.getBoundingClientRect().width
      const parentW = el.parentElement?.clientWidth || 0
      const w = Math.max(rectW, parentW, 0)
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
  }, [])
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      const rectW = el.getBoundingClientRect().width
      const parentW = el.parentElement?.clientWidth || 0
      const w = Math.max(rectW, parentW, 0)
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
      (window as any).api?.reports.monthly?.({ from: props.from, to: props.to, sphere: props.sphere, type: 'IN', paymentMethod: props.paymentMethod }),
      (window as any).api?.reports.monthly?.({ from: props.from, to: props.to, sphere: props.sphere, type: 'OUT', paymentMethod: props.paymentMethod })
    ]).then(([inRes, outRes]) => {
      if (cancelled) return
      setInBuckets((inRes?.buckets || []).map((b: any) => ({ month: b.month, gross: b.gross })))
      setOutBuckets((outRes?.buckets || []).map((b: any) => ({ month: b.month, gross: b.gross })))
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [props.from, props.to, props.sphere, props.paymentMethod, props.refreshKey])

  // Ensure we show all months in range, even when there is no data
  const months = monthKeys(props.from, props.to)
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
    for (const v of saldo) vals.push(Math.abs(v))
    return vals
  })()
  const maxValRaw = Math.max(1, ...scaleVals)
  const maxVal = maxValRaw
  const margin = { top: 22, right: 28, bottom: 42, left: 60 }
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
  const groupW = months.length > 0 ? Math.max(40, Math.min(90, Math.floor((innerW - (months.length - 1) * gap) / months.length))) : defaultGroupW
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
  const xFor = (idx: number) => margin.left + idx * (groupW + gap)
  const yFor = (val: number) => yBase + (innerH - Math.round((Math.abs(val) / maxVal) * innerH))
  
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
    <div className="card" style={{ marginTop: 12, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>Monatsverlauf (Balken: IN/OUT · Linie: kumulierter Saldo)</strong>
        <div className="legend">
          <span className="legend-item"><span className="legend-swatch" style={{ background: '#2e7d32' }}></span>IN</span>
          <span className="legend-item"><span className="legend-swatch" style={{ background: '#c62828' }}></span>OUT</span>
          <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--accent)' }}></span>Saldo</span>
        </div>
      </div>
      {loading && <div>Lade …</div>}
      {!loading && (
        <div ref={containerRef} style={{ overflowX: 'auto', position: 'relative' }}>
          {(() => {
            const focusIdx = (typeof hoverIdx === 'number' ? hoverIdx : null)
            const idx = focusIdx
            if (idx == null || !series[idx]) return null
            const s = series[idx]
            const net = s.inGross + s.outGross
            const gx = xFor(idx) + barW
            const tooltipX = (gx / width) * 100
            return (
              <div style={{ position: 'absolute', top: 6, left: `${tooltipX}%`, transform: 'translateX(-50%)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', pointerEvents: 'none', boxShadow: 'var(--shadow-1)', fontSize: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{monthLabelFull(s.month)}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span style={{ color: 'var(--success)' }}>Einnahmen</span> <strong style={{ color: 'var(--success)' }}>{eurFmt.format(s.inGross)}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span style={{ color: 'var(--danger)' }}>Ausgaben</span> <strong style={{ color: 'var(--danger)' }}>{eurFmt.format(Math.abs(s.outGross))}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span style={{ color: 'var(--warning)' }}>Netto</span> <strong style={{ color: 'var(--warning)' }}>{eurFmt.format(net)}</strong></div>
              </div>
            )
          })()}
          <svg ref={svgRef} width={width} height={height} role="img" aria-label="Monatsverlauf">
            {/* Y-Achse Grid + Labels */}
            {yTicks.map((v, i) => (
              <g key={`ytick-${i}`}>
                <line x1={margin.left} y1={yFor(v)} x2={width - margin.right} y2={yFor(v)} stroke="var(--border)" opacity={0.25} />
                <text x={margin.left - 6} y={yFor(v) + 4} fill="var(--text-dim)" fontSize={11} fontWeight={500} textAnchor="end">{eurFmt.format(v)}</text>
              </g>
            ))}
            {series.map((s, i) => {
              const gx = xFor(i)
              const hIn = Math.round((Math.abs(s.inGross) / maxVal) * innerH)
              const hOut = Math.round((Math.abs(s.outGross) / maxVal) * innerH)
              const yIn = yBase + (innerH - hIn)
              const yOut = yBase + (innerH - hOut)
              const saldoMonth = s.inGross + s.outGross
              return (
                <g key={i} onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)}>
                  <rect x={gx} y={yIn} width={barW} height={hIn} fill="#2e7d32" rx={3} />
                  <rect x={gx + barW + 6} y={yOut} width={barW} height={hOut} fill="#c62828" rx={3} />
                  {(() => {
                    const hNet = Math.round((Math.abs(saldoMonth) / maxVal) * innerH)
                    const yNet = yBase + (innerH - hNet)
                    return <rect x={gx + barW - 2} y={yNet} width={6} height={hNet} fill="var(--warning)" rx={2} opacity={0.9} />
                  })()}
                  <text x={gx + barW} y={yBase + innerH + 18} textAnchor="middle" fontSize="10">{monthLabel(s.month, false)}</text>
                </g>
              )
            })}
            {saldo.length > 0 && (
              <g>
                {saldo.map((v, i) => {
                  const x = xFor(i) + barW
                  const y = yFor(v)
                  return <circle key={`p-${i}`} cx={x} cy={y} r={2} fill={'var(--accent)'} />
                })}
                {saldo.map((v, i) => {
                  if (i === 0) return null
                  const x1 = xFor(i - 1) + barW
                  const y1 = yFor(saldo[i - 1])
                  const x2 = xFor(i) + barW
                  const y2 = yFor(v)
                  return <line key={`l-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={'var(--accent)'} strokeWidth={2} />
                })}
              </g>
            )}
            <line x1={yAxisX} y1={yBase} x2={yAxisX} y2={yBase + innerH} stroke="var(--border)" />
            {yearText && (
              <text x={Math.round(width / 2)} y={yBase + innerH + 34} textAnchor="middle" fontSize="11" fill="var(--text-dim)">{yearText}</text>
            )}
          </svg>
        </div>
      )}
    </div>
  )
}
