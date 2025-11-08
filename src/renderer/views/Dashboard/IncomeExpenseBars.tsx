import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { IncomeExpenseBarsProps } from './types'

type Bucket = { month: string; gross: number }

export default function IncomeExpenseBars({ from, to }: IncomeExpenseBarsProps) {
  const [rowsIn, setRowsIn] = useState<Bucket[]>([])
  const [rowsOut, setRowsOut] = useState<Bucket[]>([])
  const [rowsNet, setRowsNet] = useState<Bucket[]>([])
  const [loading, setLoading] = useState(false)
  const eur = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

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
    window.addEventListener('data-changed', onChanged)
    return () => { alive = false; window.removeEventListener('data-changed', onChanged) }
  }, [from, to])

  const labels = rowsIn.map(r => r.month)
  const monthNames = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']
  const maxVal = Math.max(1,
    ...rowsIn.map(r => r.gross),
    ...rowsOut.map(r => r.gross),
    ...rowsNet.map(r => Math.abs(r.gross))
  )

  const W = 760, H = 220, P = 40
  const xs = (i: number, n: number) => P + (i * (W - 2 * P)) / Math.max(1, n - 1)
  const baseY = H - 28
  const maxH = baseY - 16
  const barW = 8
  const gap = 4

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
    <section className="card" style={{ padding: 12, overflow: 'hidden' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong>Einnahmen vs. Ausgaben</strong>
        <span className="helper">{from} → {to}</span>
      </header>
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        <svg ref={svgRef} onMouseMove={mouseMove} onMouseLeave={() => setHoverIdx(null)} viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" style={{ maxWidth: '100%', height: 'auto' }} role="img" aria-label="Einnahmen vs Ausgaben">
          {/* Axes */}
          <line x1={P/2} x2={W-P/2} y1={baseY} y2={baseY} stroke="var(--border)" />
          <line x1={P} x2={P} y1={16} y2={baseY} stroke="var(--border)" />
          {/* Y grid + labels */}
          {yTicks.map((v, i) => (
            <g key={i}>
              <line x1={P} x2={W-P/2} y1={yFor(v)} y2={yFor(v)} stroke="var(--border)" opacity={0.25} />
              <text x={P-6} y={yFor(v)+4} fill="var(--text-dim)" fontSize={11} textAnchor="end">{eur.format(v)}</text>
            </g>
          ))}
          {/* Bars */}
          {labels.map((m, i) => {
            const xCenter = xs(i, labels.length)
            const hIn = Math.round((rowsIn[i]?.gross || 0) / maxVal * maxH)
            const hOut = Math.round((rowsOut[i]?.gross || 0) / maxVal * maxH)
            const netVal = rowsNet[i]?.gross || 0
            const hNet = Math.round(Math.abs(netVal) / maxVal * maxH)
            return (
              <g key={m}>
                {/* IN bar (left) */}
                <rect x={xCenter - barW * 1.5 - gap} y={baseY - hIn} width={barW} height={hIn} fill="var(--success)" rx={2} />
                {/* OUT bar (center) */}
                <rect x={xCenter - barW / 2} y={baseY - hOut} width={barW} height={hOut} fill="var(--danger)" rx={2} />
                {/* Netto bar (right) - yellow */}
                <rect x={xCenter + barW / 2 + gap} y={baseY - hNet} width={barW} height={hNet} fill="#f9a825" rx={2} />
              </g>
            )
          })}
          {/* X labels */}
          {labels.map((m, i) => {
            if (labels.length > 8 && i % Math.ceil(labels.length/8) !== 0 && i !== labels.length - 1) return null
            const x = xs(i, labels.length)
            const mon = monthNames[Math.max(0, Math.min(11, Number(m.slice(5)) - 1))] || m.slice(5)
            return <text key={m} x={x} y={H-6} fill="var(--text-dim)" fontSize={11} textAnchor="middle">{mon}</text>
          })}
          {/* Hover guide */}
          {hoverIdx != null && labels[hoverIdx] && (
            <g>
              <line x1={xs(hoverIdx, labels.length)} x2={xs(hoverIdx, labels.length)} y1={16} y2={H-28} stroke="var(--border)" strokeDasharray="3 4" />
            </g>
          )}
        </svg>
        {hoverIdx != null && (
          <div style={{ position: 'absolute', left: `${(xs(hoverIdx, labels.length)/W)*100}%`, top: 8, transform: 'translateX(-50%)', background: '#f9a825', color: '#000', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', pointerEvents: 'none', boxShadow: 'var(--shadow-1)' }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{monthNames[Math.max(0, Math.min(11, Number(String(labels[hoverIdx]).slice(5)) - 1))] || String(labels[hoverIdx]).slice(5)}</div>
            <div><span style={{ opacity: 0.8 }}>Einnahmen</span> <strong>{eur.format(rowsIn[hoverIdx]?.gross || 0)}</strong></div>
            <div><span style={{ opacity: 0.8 }}>Ausgaben</span> <strong>{eur.format(rowsOut[hoverIdx]?.gross || 0)}</strong></div>
            <div><span style={{ opacity: 0.8 }}>Netto</span> <strong>{eur.format(rowsNet[hoverIdx]?.gross || 0)}</strong></div>
          </div>
        )}
        {loading && <div className="helper" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>Laden…</div>}
      </div>
    </section>
  )
}
