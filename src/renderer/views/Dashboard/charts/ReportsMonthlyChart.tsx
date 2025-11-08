import React, { useEffect, useMemo, useRef, useState } from 'react'

type Bucket = { month: string; gross: number }

function monthKeys(from: string, to: string): string[] {
  const out: string[] = []
  const [y0, m0] = [Number(from.slice(0,4)), Number(from.slice(5,7))-1]
  const [y1, m1] = [Number(to.slice(0,4)), Number(to.slice(5,7))-1]
  const d = new Date(Date.UTC(y0, m0, 1))
  while (d.getUTCFullYear() < y1 || (d.getUTCFullYear() === y1 && d.getUTCMonth() <= m1)) {
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`)
    d.setUTCMonth(d.getUTCMonth()+1)
  }
  return out
}

export default function ReportsMonthlyChart(props: { activateKey?: number; refreshKey?: number; from?: string; to?: string; sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; type?: 'IN' | 'OUT' | 'TRANSFER'; paymentMethod?: 'BAR' | 'BANK' }) {
  const { from: fromProp, to: toProp } = props
  const eur = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
  const [rowsIn, setRowsIn] = useState<Bucket[]>([])
  const [rowsOut, setRowsOut] = useState<Bucket[]>([])
  const [rowsAll, setRowsAll] = useState<Bucket[]>([])
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const svgRef = useRef<SVGSVGElement | null>(null)

  // Resolve date range (fallback: current year to date)
  const { from, to } = (() => {
    if (fromProp && toProp) return { from: fromProp, to: toProp }
    const now = new Date()
    const y = now.getUTCFullYear()
    const f = new Date(Date.UTC(y, 0, 1)).toISOString().slice(0, 10)
    const t = new Date(Date.UTC(y, 11, 31)).toISOString().slice(0, 10)
    return { from: f, to: t }
  })()

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        setLoading(true)
        const [rin, rout, rall] = await Promise.all([
          (window as any).api?.reports?.monthly?.({ from, to, type: 'IN' }),
          (window as any).api?.reports?.monthly?.({ from, to, type: 'OUT' }),
          (window as any).api?.reports?.monthly?.({ from, to }),
        ])
        if (!alive) return
        const keys = monthKeys(from, to)
        const fill = (arr: any[]): Bucket[] => {
          const map = new Map(arr.map((b: any) => [String(b.month), Number(b.gross)||0]))
          return keys.map(k => ({ month: k, gross: Number(map.get(k) || 0) }))
        }
        const ins = fill(rin?.buckets || rin || [])
        const outs = fill((rout?.buckets || rout || []).map((b: any) => ({ month: b.month, gross: Math.abs(Number(b.gross)||0) })))
        const all = fill(rall?.buckets || rall || [])
        setRowsIn(ins)
        setRowsOut(outs)
        setRowsAll(all)
      } catch {
        if (alive) { setRowsIn([]); setRowsOut([]); setRowsAll([]) }
      } finally { if (alive) setLoading(false) }
    }
    load()
    const onChanged = () => load()
    window.addEventListener('data-changed', onChanged)
    return () => { alive = false; window.removeEventListener('data-changed', onChanged) }
  }, [from, to, props.activateKey, props.refreshKey])

  const labels = rowsAll.map(r => r.month)
  const cumSeries = (() => {
    const arr: number[] = []
    let s = 0
    for (const b of rowsAll) { s += b.gross; arr.push(s) }
    return arr
  })()

  const maxBar = Math.max(1, ...rowsIn.map(r=>r.gross), ...rowsOut.map(r=>r.gross))
  const minLine = Math.min(0, ...cumSeries)
  const maxLine = Math.max(0, ...cumSeries)
  const W = 900, H = 260, P = 48
  const baseY = H - 28
  const maxH = baseY - 24
  const xs = (i: number, n: number) => P + (i * (W - 2 * P)) / Math.max(1, n - 1)
  const yBar = (v: number) => baseY - Math.min(1, v / Math.max(1e-9, maxBar)) * maxH
  const yLine = (v: number) => {
    const top = 16
    const bottom = baseY
    const min = minLine
    const max = maxLine
    return top + (max - v) * (bottom - top) / Math.max(1e-9, (max - min || 1))
  }
  const barW = 12, gap = 8
  const MONTH_NAMES = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']

  function niceStep(max: number) {
    if (max <= 0) return 1
    const exp = Math.floor(Math.log10(max))
    const base = Math.pow(10, exp)
    const m = max / base
    let step = base
    if (m <= 2) step = base / 5
    else if (m <= 5) step = base / 2
    const target = Math.max(1, Math.round(max / step))
    if (target > 8) step *= 2
    return step
  }
  const yTicks = (() => {
    const step = niceStep(Math.max(maxBar, Math.abs(minLine), Math.abs(maxLine)))
    const arr: number[] = []
    for (let v = 0; v <= Math.max(maxBar, Math.abs(minLine), Math.abs(maxLine)); v += step) arr.push(Math.round(v))
    return arr
  })()

  const onMouseMove = (ev: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg || !labels.length) return
    const rect = svg.getBoundingClientRect()
    const x = ev.clientX - rect.left
    let best = 0
    let bestDist = Math.abs(x - xs(0, labels.length))
    for (let i = 1; i < labels.length; i++) {
      const d = Math.abs(x - xs(i, labels.length))
      if (d < bestDist) { best = i; bestDist = d }
    }
    setHoverIdx(best)
  }

  return (
    <div className="card chart-card" style={{ overflow: 'hidden' }}>
      <div className="chart-head">
        <strong>Monatsverlauf (Balken: IN/OUT · Linie: kumulierter Saldo)</strong>
        <span className="helper">{from} → {to}</span>
      </div>
      <div className="chart-canvas" style={{ overflow: 'hidden' }}>
        <svg ref={svgRef} onMouseMove={onMouseMove} onMouseLeave={() => setHoverIdx(null)} viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" style={{ maxWidth: '100%', height: 'auto' }} role="img" aria-label="Monatsverlauf">
          {/* Axes */}
          <line x1={P} x2={W-P/2} y1={baseY} y2={baseY} stroke="var(--border)" />
          <line x1={P} x2={P} y1={16} y2={baseY} stroke="var(--border)" />
          {/* Y grid + labels (bar scale) */}
          {yTicks.map((v, i) => (
            <g key={i}>
              <line x1={P} x2={W-P/2} y1={yBar(v)} y2={yBar(v)} stroke="var(--border)" opacity={0.25} />
              <text x={P-6} y={yBar(v)+4} fill="var(--text-dim)" fontSize={11} textAnchor="end">{eur.format(v)}</text>
            </g>
          ))}
          {/* Bars */}
          {labels.map((m, i) => (
            <g key={m}>
              <rect x={xs(i, labels.length) - barW - gap/2} y={yBar(rowsIn[i]?.gross || 0)} width={barW} height={(rowsIn[i]?.gross||0) ? (baseY - yBar(rowsIn[i]?.gross||0)) : 0} fill="var(--success)" rx={2} />
              <rect x={xs(i, labels.length) + gap/2} y={yBar(rowsOut[i]?.gross || 0)} width={barW} height={(rowsOut[i]?.gross||0) ? (baseY - yBar(rowsOut[i]?.gross||0)) : 0} fill="var(--danger)" rx={2} />
            </g>
          ))}
          {/* Cumulative line */}
          <polyline points={cumSeries.map((v,i)=>`${xs(i, labels.length)},${yLine(v)}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth={2} />
          {/* X labels */}
          {labels.map((m,i)=>{
            if (labels.length > 10 && i % Math.ceil(labels.length/10) !== 0 && i !== labels.length-1) return null
            const mon = MONTH_NAMES[Math.max(0, Math.min(11, Number(m.slice(5))-1))] || m.slice(5)
            return (
              <text key={m} x={xs(i, labels.length)} y={H-6} fill="var(--text-dim)" fontSize={11} textAnchor="middle">{mon}</text>
            )
          })}
          {/* Hover guide + tooltip (single instance) */}
          {hoverIdx != null && labels[hoverIdx] && (
            <g>
              <line x1={xs(hoverIdx, labels.length)} x2={xs(hoverIdx, labels.length)} y1={16} y2={baseY} stroke="var(--border)" strokeDasharray="3 4" />
              <circle cx={xs(hoverIdx, labels.length)} cy={yLine(cumSeries[hoverIdx]||0)} r={3} fill="var(--accent)" />
              {(() => {
                const w = 190, h = 74, pad = 8
                const cx = xs(hoverIdx, labels.length)
                const x = Math.max(P, Math.min(cx - w/2, W - P - w))
                const y = 8
                const monthIdx = Math.max(0, Math.min(11, Number(String(labels[hoverIdx]).slice(5)) - 1))
                const mLabel = MONTH_NAMES[monthIdx] || String(labels[hoverIdx]).slice(5)
                return (
                  <g>
                    <rect x={x} y={y} width={w} height={h} rx={8} ry={8} fill="var(--surface)" stroke="var(--border)" />
                    <text x={x+pad} y={y+16} fontSize={12} fill="var(--text-dim)">{mLabel}</text>
                    <text x={x+pad} y={y+32} fontSize={12} fill="var(--text)">IN: {eur.format(rowsIn[hoverIdx]?.gross || 0)}</text>
                    <text x={x+pad} y={y+48} fontSize={12} fill="var(--text)">OUT: {eur.format(rowsOut[hoverIdx]?.gross || 0)}</text>
                    <text x={x+pad} y={y+64} fontSize={12} fill="var(--text)">Saldo kum.: {eur.format(cumSeries[hoverIdx] || 0)}</text>
                  </g>
                )
              })()}
            </g>
          )}
        </svg>
        {loading && <div className="helper chart-loading">Laden…</div>}
      </div>
    </div>
  )
}
