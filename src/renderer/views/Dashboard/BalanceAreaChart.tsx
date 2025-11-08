import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { BalanceAreaChartProps } from './types'

type Bucket = { month: string; net: number; vat: number; gross: number }

const MONTH_NAMES = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'] as const

function monthKeys(from: string, to: string): string[] {
  if (!from || !to) return []
  const out: string[] = []
  const [y0, m0] = [Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1]
  const [y1, m1] = [Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1]
  const d = new Date(Date.UTC(y0, m0, 1))
  while (d.getUTCFullYear() < y1 || (d.getUTCFullYear() === y1 && d.getUTCMonth() <= m1)) {
    const y = d.getUTCFullYear()
    const m = d.getUTCMonth() + 1
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    d.setUTCMonth(d.getUTCMonth() + 1)
  }
  return out
}

function dayKeys(from: string, to: string): string[] {
  if (!from || !to) return []
  const out: string[] = []
  const d = new Date(Date.UTC(Number(from.slice(0,4)), Number(from.slice(5,7))-1, Number(from.slice(8,10))))
  const end = new Date(Date.UTC(Number(to.slice(0,4)), Number(to.slice(5,7))-1, Number(to.slice(8,10))))
  while (d <= end) {
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`)
    d.setUTCDate(d.getUTCDate()+1)
  }
  return out
}

export default function BalanceAreaChart({ from, to }: BalanceAreaChartProps) {
  const [rows, setRows] = useState<Bucket[]>([])
  const [loading, setLoading] = useState(false)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const eur = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
  const svgRef = useRef<SVGSVGElement | null>(null)
  useEffect(() => {
    let alive = true
    setLoading(true)
    ;(async () => {
      try {
        const sameMonth = from?.slice(0,7) === to?.slice(0,7)
        if (sameMonth) {
          // Build daily series (per-day saldo, not cumulative) from vouchers
          // Fetch all vouchers within month with pagination (IPC limit is 100)
          const all: Array<{ date: string; type: 'IN'|'OUT'|'TRANSFER'; grossAmount: number }> = []
          const pageSize = 100
          let offset = 0
          while (true) {
            const resp = await (window as any).api?.vouchers?.list?.({ limit: pageSize, offset, sort: 'ASC', sortBy: 'date', from, to })
            const rows = (resp?.rows || []) as Array<{ date: string; type: 'IN'|'OUT'|'TRANSFER'; grossAmount: number }>
            const total = Number(resp?.total ?? rows.length)
            all.push(...rows)
            offset += rows.length
            if (offset >= total || rows.length === 0) break
          }
          const items = all
          const keys = dayKeys(from!, to!)
          const sums = new Map<string, number>()
          for (const it of items) {
            const key = String(it.date).slice(0,10)
            const sign = it.type === 'IN' ? 1 : it.type === 'OUT' ? -1 : 0
            sums.set(key, (sums.get(key) || 0) + sign * Number(it.grossAmount || 0))
          }
          // per-day values: value for the day, zeros for days without entries
          const outRows: Bucket[] = keys.map((k) => ({ month: k, net: 0, vat: 0, gross: Math.round((sums.get(k) || 0) * 100) / 100 }))
          if (alive) setRows(outRows)
        } else {
          // Monthly series (saldo per month)
          const res = await (window as any).api?.reports?.monthly?.({ from, to })
          const buckets: Bucket[] = (res?.buckets || res || []) as Bucket[]
          if (!alive) return
          const keys = monthKeys(from!, to!)
          const map = new Map<string, Bucket>()
          for (const b of buckets) map.set(String((b as any).month), { month: String((b as any).month), net: Number((b as any).net)||0, vat: Number((b as any).vat)||0, gross: Number((b as any).gross)||0 })
          const filled = keys.map((k) => map.get(k) || { month: k, net: 0, vat: 0, gross: 0 })
          setRows(filled)
        }
      } catch {
        if (alive) setRows([])
      } finally { if (alive) setLoading(false) }
    })()
    const onChanged = () => {
      // refresh when data changes globally
      try { (window as any).api?.reports?.monthly?.({ from, to }).then((res: any) => {
        const buckets: Bucket[] = (res?.buckets || res || []) as Bucket[]
        const keys = monthKeys(from, to)
        const map = new Map<string, Bucket>()
        for (const b of buckets) map.set(String((b as any).month), { month: String((b as any).month), net: Number((b as any).net)||0, vat: Number((b as any).vat)||0, gross: Number((b as any).gross)||0 })
        const filled = keys.map((k) => map.get(k) || { month: k, net: 0, vat: 0, gross: 0 })
        setRows(filled)
      }) } catch { }
    }
    window.addEventListener('data-changed', onChanged)
    return () => { alive = false; window.removeEventListener('data-changed', onChanged) }
  }, [from, to])

  // Prepare values for chart: we use gross as signed monthly saldo (IN positive, OUT negative)
  const series = rows.map(r => Number(r.gross) || 0)
  const minV = Math.min(0, ...series)
  const maxV = Math.max(0, ...series)
  const range = Math.max(1, maxV - minV)
  const pad = range * 0.08
  const yMin = minV - pad
  const yMax = maxV + pad
  const labels = rows.map(r => r.month)

  // Build simple SVG line + filled area around zero for clarity
  // Increase left padding so Y-axis labels don't get clipped by the SVG viewport
  // Previously P=36 caused longer values (e.g., 1.500,00 €) to render partially ("00,00 €")
  const W = 760, H = 240, P = 80
  const xs = (i: number, n: number) => P + (i * (W - 2 * P)) / Math.max(1, n - 1)
  const ys = (v: number) => {
    const top = 16
    const bottom = H - 28
    return top + (yMax - v) * (bottom - top) / Math.max(1e-9, (yMax - yMin))
  }
  const points = series.map((v, i) => `${xs(i, series.length)},${ys(v)}`).join(' ')
  const areaPath = (() => {
    if (!series.length) return ''
    const top = series.map((v, i) => `${xs(i, series.length)},${ys(v)}`).join(' ')
    const baseline = (yMin <= 0 && yMax >= 0) ? 0 : (yMin > 0 ? yMin : yMax)
    const bottom = `${xs(series.length-1, series.length)},${ys(baseline)} ${xs(0, series.length)},${ys(baseline)}`
    return `M ${top} L ${bottom} Z`
  })()

  // X labels: months for yearly, days for monthly
  const isDaily = (from && to && from.slice(0,7) === to.slice(0,7))
  // Yearly view: show all months; Daily view: reduce to ~8 labels
  const tickEvery = isDaily ? Math.max(1, Math.ceil(labels.length / 8)) : 1

  // Y-axis ticks (nice range around min..max incl. 0 when in range)
  function niceTicks(min: number, max: number, count = 5): number[] {
    if (!isFinite(min) || !isFinite(max) || min === max) return [0]
    const span = max - min
    const raw = span / Math.max(1, count)
    const pow10 = Math.pow(10, Math.floor(Math.log10(Math.max(1e-9, raw))))
    let step = raw / pow10
    if (step >= 7.5) step = 10
    else if (step >= 3.5) step = 5
    else if (step >= 1.5) step = 2
    else step = 1
    step *= pow10
    const start = Math.ceil(min / step) * step
    const end = Math.floor(max / step) * step
    const ticks: number[] = []
    for (let v = start; v <= end + 1e-9; v += step) ticks.push(Math.round(v))
    // Ensure 0 labeled when within range
    if (min < 0 && max > 0 && !ticks.includes(0)) ticks.push(0)
    return ticks.sort((a,b)=>a-b)
  }
  const yTicks = niceTicks(yMin, yMax, 5)

  // hover logic
  const onMouseMove = (ev: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg || !labels.length) return
    const rect = svg.getBoundingClientRect()
    const scaleX = W / Math.max(1, rect.width)
    const x = (ev.clientX - rect.left) * scaleX
    const xsArr = labels.map((_m, i) => xs(i, labels.length))
    let best = 0
    let bestDist = Math.abs(x - xsArr[0])
    for (let i = 1; i < xsArr.length; i++) {
      const d = Math.abs(x - xsArr[i])
      if (d < bestDist) { bestDist = d; best = i }
    }
    setHoverIdx(best)
  }
  const onLeave = () => setHoverIdx(null)

  

  return (
    <section className="card" style={{ padding: 12, overflow: 'hidden' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong>{isDaily ? 'Kassenstand (Saldo täglich)' : 'Kassenstand (Saldo monatlich)'}</strong>
        <span className="helper">{from} → {to}</span>
      </header>
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        <svg ref={svgRef} onMouseMove={onMouseMove} onMouseLeave={onLeave} viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" style={{ maxWidth: '100%', height: 'auto' }} role="img" aria-label="Monatlicher Saldo">
          {/* Zero/baseline axis */}
          {(yMin <= 0 && yMax >= 0) && (<line x1={P/2} x2={W-P/2} y1={ys(0)} y2={ys(0)} stroke="var(--border)" strokeWidth={1} />)}
          {/* Y axis */}
          <line x1={P} x2={P} y1={16} y2={H-28} stroke="var(--border)" />
          {/* Y grid + labels */}
          {yTicks.map((v, i) => (
            <g key={i}>
              <line x1={P} x2={W-P/2} y1={ys(v)} y2={ys(v)} stroke="var(--border)" opacity={0.25} />
              <text x={P-6} y={ys(v)+4} fill="var(--text-dim)" fontSize={11} textAnchor="end">{eur.format(v)}</text>
            </g>
          ))}
          {/* Area fill */}
          <path d={areaPath} fill="color-mix(in oklab, var(--accent) 22%, transparent)" />
          {/* Line */}
          <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth={2} />
          {/* Ticks and labels */}
          {labels.map((m, i) => {
            if (i % tickEvery !== 0 && i !== labels.length - 1) return null
            const x = xs(i, labels.length)
            const label = isDaily ? String(m).slice(8,10) : (MONTH_NAMES[Math.max(0, Math.min(11, Number(String(m).slice(5)) - 1))] || String(m).slice(5))
            return (
              <g key={m}>
                <line x1={x} x2={x} y1={H-18} y2={H-14} stroke="var(--border)" />
                <text x={x} y={H-4} fill="var(--text-dim)" fontSize={11} textAnchor="middle">{label}</text>
              </g>
            )
          })}
          {/* Hover focus */}
          {hoverIdx != null && labels[hoverIdx] && (
            <g>
              <line x1={xs(hoverIdx, labels.length)} x2={xs(hoverIdx, labels.length)} y1={16} y2={H-28} stroke="var(--border)" strokeDasharray="3 4" />
              <circle cx={xs(hoverIdx, labels.length)} cy={ys(series[hoverIdx])} r={3} fill="var(--accent)" />
            </g>
          )}
        </svg>
        {hoverIdx != null && (
          <div style={{ position: 'absolute', left: `${(xs(hoverIdx, labels.length)/W)*100}%`, top: 8, transform: 'translateX(-50%)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', pointerEvents: 'none', boxShadow: 'var(--shadow-1)' }}>
            {(() => {
              const key = String(labels[hoverIdx])
              const isDailyLoc = (from && to && from.slice(0,7) === to.slice(0,7))
              const labelText = isDailyLoc ? `${key.slice(8,10)}.${key.slice(5,7)}.` : (MONTH_NAMES[Math.max(0, Math.min(11, Number(key.slice(5)) - 1))] || key.slice(5))
              return <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{labelText}</div>
            })()}
            <div style={{ fontWeight: 700 }}>{eur.format(series[hoverIdx] || 0)}</div>
          </div>
        )}
        {loading && <div className="helper" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>Laden…</div>}
      </div>
      <div className="helper" style={{ marginTop: 6 }}>Werte: IN positiv, OUT negativ. Grundlage: Brutto je Monat.</div>
    </section>
  )
}
