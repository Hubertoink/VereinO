import React, { useEffect, useMemo, useState } from 'react'
import type { CommonFilters } from './types'

// Interactive donut for key-value pairs (hover shows Anteil % und Wert)
function Donut({ data, colors, title }: { data: Array<{ key: string; value: number }>; colors: Record<string, string>; title: string }) {
  const [hover, setHover] = useState<{ key: string; value: number; pct: number } | null>(null)
  const [pt, setPt] = useState<{ x: number; y: number } | null>(null)
  const total = data.reduce((s, d) => s + Math.max(0, d.value || 0), 0)
  const segments = (() => {
    let acc = 0
    return data.map((d) => {
      const v = Math.max(0, d.value || 0)
      const frac = total > 0 ? v / total : 0
      const start = acc
      const end = acc + frac
      acc = end
      return { key: d.key, value: v, start, end }
    })
  })()
  // Build path for each segment (donut ring)
  const outerR = 56
  const innerR = 40
  const cx = 60
  const cy = 60
  function polar(r: number, t: number) { return { x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) } }
  function segPath(s: { start: number; end: number }) {
    const a0 = (s.start * 2 * Math.PI) - Math.PI / 2
    const a1 = (s.end * 2 * Math.PI) - Math.PI / 2
    const p0o = polar(outerR, a0)
    const p1o = polar(outerR, a1)
    const p0i = polar(innerR, a0)
    const p1i = polar(innerR, a1)
    const large = (s.end - s.start) > 0.5 ? 1 : 0
    return `M ${p0o.x} ${p0o.y} A ${outerR} ${outerR} 0 ${large} 1 ${p1o.x} ${p1o.y} L ${p1i.x} ${p1i.y} A ${innerR} ${innerR} 0 ${large} 0 ${p0i.x} ${p0i.y} Z`
  }
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = (e.currentTarget as any).getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setPt({ x, y })
    const dx = x - cx
    const dy = y - cy
    const r = Math.sqrt(dx*dx + dy*dy)
    if (r < innerR || r > outerR + 4) { setHover(null); return }
    let ang = Math.atan2(dy, dx) + Math.PI/2
    if (ang < 0) ang += 2 * Math.PI
    const fracPos = ang / (2 * Math.PI)
    const seg = segments.find(s => fracPos >= s.start && fracPos < s.end) || null
    if (!seg) { setHover(null); return }
    setHover({ key: seg.key, value: seg.value, pct: total > 0 ? (seg.value / total) * 100 : 0 })
  }
  const onLeave = () => { setHover(null); setPt(null) }
  return (
    <div style={{ display: 'grid', justifyItems: 'center', gap: 6, position: 'relative' }}>
      <svg viewBox="0 0 120 120" width={120} height={120} role="img" aria-label={title} onMouseMove={onMove} onMouseLeave={onLeave}>
        <g>
          <circle cx={cx} cy={cy} r={outerR} fill="none" stroke="var(--border)" strokeWidth={1} />
          {segments.map((s) => (
            <path key={s.key} d={segPath(s)} fill={colors[s.key] || 'var(--accent)'} opacity={hover && hover.key !== s.key ? 0.4 : 1} />
          ))}
          <text x={60} y={60} textAnchor="middle" fontSize={12} fontWeight={600}>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(total || 0)}</text>
        </g>
      </svg>
      {hover && pt && (
        <div style={{ position: 'absolute', top: pt.y + 6, left: pt.x + 6, pointerEvents: 'none', background: 'color-mix(in oklab, var(--bg) 85%, black)', color: 'var(--text)', padding: '4px 8px', borderRadius: 8, boxShadow: '0 2px 4px rgba(0,0,0,.2)', fontSize: 12, minWidth: 140 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: colors[hover.key] || 'var(--accent)' }} />
              {hover.key}
            </span>
            <strong>{hover.pct.toFixed(1)}%</strong>
          </div>
          <div style={{ textAlign: 'right', fontWeight: 600 }}>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Math.abs(hover.value) || 0)}</div>
        </div>
      )}
      <div className="helper" style={{ textAlign: 'center' }}>{title}</div>
    </div>
  )
}

export default function SphereShareCard({ from, to }: CommonFilters) {
  const [bySphere, setBySphere] = useState<Array<{ key: string; gross: number }>>([])
  const [byPM, setByPM] = useState<Array<{ key: string; gross: number }>>([])
  const eur = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const s = await (window as any).api?.reports?.summary?.({ from, to })
        if (!alive || !s) return
        setBySphere((s.bySphere || []).map((x: any) => ({ key: String(x.key), gross: Number(x.gross || 0) })))
        setByPM((s.byPaymentMethod || []).filter((x: any) => x.key === 'BAR' || x.key === 'BANK').map((x: any) => ({ key: String(x.key), gross: Number(x.gross || 0) })))
      } catch { if (alive) { setBySphere([]); setByPM([]) } }
    }
    load()
    const onChanged = () => load()
    window.addEventListener('data-changed', onChanged)
    return () => { alive = false; window.removeEventListener('data-changed', onChanged) }
  }, [from, to])

  const sphereColors: Record<string, string> = {
    IDEELL: '#64b5f6',
    ZWECK: '#4db6ac',
    VERMOEGEN: '#9575cd',
    WGB: '#ffb74d',
  }
  const pmColors: Record<string, string> = { BAR: '#42a5f5', BANK: '#26a69a' }

  const sphereData = bySphere.filter(x => (x.gross || 0) !== 0)
  const pmData = byPM.filter(x => (x.gross || 0) !== 0)

  return (
    <section className="card" style={{ padding: 12 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong>Sphären-Anteile</strong>
        <span className="helper">{from} → {to}</span>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, alignItems: 'center' }}>
        <Donut title="Sphären" data={sphereData.map(s => ({ key: s.key, value: Math.abs(s.gross) }))} colors={sphereColors} />
        <Donut title="Bar vs Bank" data={pmData.map(p => ({ key: String(p.key), value: Math.abs(p.gross) }))} colors={pmColors} />
        <div>
          <div className="helper">Legende</div>
          <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
            {sphereData.map(s => (
              <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: sphereColors[s.key] || 'var(--accent)' }} />
                  {s.key}
                </span>
                <span>{eur.format(Math.abs(s.gross))}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
