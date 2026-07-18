import React, { useEffect, useId, useMemo, useState } from 'react'
import type { CommonFilters } from './types'
import { addDataChangedListener } from '../../utils/refresh'

// Interactive donut for key-value pairs (hover shows Anteil % und Wert)
function Donut({ data, colors, title }: { data: Array<{ key: string; value: number }>; colors: Record<string, string>; title: string }) {
  const [hover, setHover] = useState<{ key: string; value: number; pct: number } | null>(null)
  const [pt, setPt] = useState<{ x: number; y: number } | null>(null)
  const ditherId = useId().replace(/:/g, '')
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
  function segPath(s: { start: number; end: number }, expansion = 0) {
    const segmentOuterR = outerR + expansion
    const segmentInnerR = innerR - expansion * 0.55
    const a0 = (s.start * 2 * Math.PI) - Math.PI / 2
    const a1 = (s.end * 2 * Math.PI) - Math.PI / 2
    const p0o = polar(segmentOuterR, a0)
    const p1o = polar(segmentOuterR, a1)
    const p0i = polar(segmentInnerR, a0)
    const p1i = polar(segmentInnerR, a1)
    const large = (s.end - s.start) > 0.5 ? 1 : 0
    return `M ${p0o.x} ${p0o.y} A ${segmentOuterR} ${segmentOuterR} 0 ${large} 1 ${p1o.x} ${p1o.y} L ${p1i.x} ${p1i.y} A ${segmentInnerR} ${segmentInnerR} 0 ${large} 0 ${p0i.x} ${p0i.y} Z`
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
        <defs>
          <filter id={`donut-aura-${ditherId}`} x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="5" /></filter>
          {segments.map((s, index) => {
            const color = colors[s.key] || 'var(--accent)'
            return (
              <React.Fragment key={s.key}>
                <radialGradient id={`donut-gradient-${ditherId}-${index}`} cx="50%" cy="45%" r="70%"><stop offset="0%" stopColor={color} stopOpacity="0.94" /><stop offset="100%" stopColor={color} stopOpacity="0.6" /></radialGradient>
                <pattern id={`donut-dither-${ditherId}-${index}`} width="5" height="5" patternUnits="userSpaceOnUse"><rect x="0" y="0" width="1" height="1" fill={color} opacity="0.95" /><rect x="3" y="1" width="1" height="1" fill={color} opacity="0.64" /><rect x="2" y="4" width="1" height="1" fill={color} opacity="0.42" /></pattern>
              </React.Fragment>
            )
          })}
        </defs>
        <g>
          <circle cx={cx} cy={cy} r={outerR} fill="none" stroke="var(--border)" strokeWidth={1} />
          {segments.map((s, index) => {
            const isActive = hover?.key === s.key
            const path = segPath(s, isActive ? 2.2 : 0)
            const opacity = hover && !isActive ? 0.3 : 1
            const color = colors[s.key] || 'var(--accent)'
            const mid = ((s.start + s.end) * 2 * Math.PI) / 2 - Math.PI / 2
            const lift = isActive ? 1.6 : 0
            return <g key={s.key} opacity={opacity} transform={`translate(${Math.cos(mid) * lift} ${Math.sin(mid) * lift})`}>
              <path d={path} fill={color} opacity={isActive ? 0.36 : 0.2} filter={`url(#donut-aura-${ditherId})`} />
              <path d={path} fill={`url(#donut-gradient-${ditherId}-${index})`} />
              <path d={path} fill={`url(#donut-dither-${ditherId}-${index})`} opacity="0.84" />
              {isActive && <path d={path} fill="none" stroke={color} strokeWidth="1.25" opacity="0.95" />}
            </g>
          })}
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
  const [byAccount, setByAccount] = useState<Array<{ key: string; gross: number; color?: string | null }>>([])
  const eur = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const s = await (window as any).api?.reports?.summary?.({ from, to })
        if (!alive || !s) return
        setBySphere((s.bySphere || []).map((x: any) => ({ key: String(x.key), gross: Number(x.gross || 0) })))
        const accountRows = Array.isArray(s.byPaymentAccount) && s.byPaymentAccount.length
          ? s.byPaymentAccount
          : (s.byPaymentMethod || []).filter((x: any) => x.key === 'BAR' || x.key === 'BANK')
        setByAccount(accountRows.map((x: any) => ({ key: String(x.key), gross: Number(x.gross || 0), color: x.color || null })))
      } catch { if (alive) { setBySphere([]); setByAccount([]) } }
    }
    load()
    const onChanged = () => load()
    const removeDataChangedListener = addDataChangedListener(['vouchers'], onChanged)
    return () => { alive = false; removeDataChangedListener() }
  }, [from, to])

  const sphereColors: Record<string, string> = {
    IDEELL: '#64b5f6',
    ZWECK: '#4db6ac',
    VERMOEGEN: '#9575cd',
    WGB: '#ffb74d',
  }
  const accountColors: Record<string, string> = Object.fromEntries(byAccount.map((account, index) => [account.key, account.color || ['#42a5f5', '#26a69a', '#ab47bc', '#ffb74d', '#66bb6a'][index % 5]]))

  const sphereData = bySphere.filter(x => (x.gross || 0) !== 0)
  const accountData = byAccount.filter(x => (x.gross || 0) !== 0)

  return (
    <section className="card dither-chart-card" style={{ padding: 12 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong>Sphären-Anteile</strong>
        <span className="helper">{from} → {to}</span>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, alignItems: 'center' }}>
        <Donut title="Sphären" data={sphereData.map(s => ({ key: s.key, value: Math.abs(s.gross) }))} colors={sphereColors} />
        <Donut title="Zahlungskonten" data={accountData.map(p => ({ key: String(p.key), value: Math.abs(p.gross) }))} colors={accountColors} />
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
