import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Sphere, VoucherType, PaymentMethod } from './types'

export default function ReportsSphereDonut(props: { refreshKey?: number; from?: string; to?: string; type?: VoucherType; paymentMethod?: PaymentMethod; earmarkId?: number; budgetId?: number }) {
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<Array<{ key: Sphere; gross: number }>>([])
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
  const ditherId = useId().replace(/:/g, '')
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(window as any).api?.reports.summary?.({ from: props.from, to: props.to, type: props.type, paymentMethod: props.paymentMethod, earmarkId: props.earmarkId, budgetId: props.budgetId })
      .then((res: any) => {
        if (cancelled || !res) return
        setRows(res.bySphere.map((r: any) => ({ key: r.key, gross: r.gross })))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [props.from, props.to, props.type, props.paymentMethod, props.earmarkId, props.budgetId, props.refreshKey])
  const total = rows.reduce((a, b) => a + Math.abs(b.gross), 0) || 1
  const colors: Record<string, string> = { IDEELL: '#7e57c2', ZWECK: '#26a69a', VERMOEGEN: '#8d6e63', WGB: '#42a5f5' }
  const size = { w: 320, h: 220 }
  const cx = 110
  const cy = 110
  const outerR = 90
  const innerR = 52
  let angleAcc = -Math.PI / 2
  const arcs = rows.map((r) => {
    const frac = Math.abs(r.gross) / total
    const angle = frac * Math.PI * 2
    const start = angleAcc
    const end = angleAcc + angle
    angleAcc = end
    return { key: r.key, gross: r.gross, frac, start, end }
  })
  return (
    <div className="card report-chart-card dither-chart-card">
      <div className="report-chart-header">
        <strong>Nach Sphäre</strong>
        <div className="legend-container">
          <div className="legend">
            {rows.map(r => (
              <span key={r.key} className="legend-item"><span className="legend-swatch" style={{ background: colors[r.key] }}></span>{r.key}</span>
            ))}
          </div>
        </div>
      </div>
      {loading && <div>Lade …</div>}
      {!loading && (
        <div className="donut-chart-wrapper">
          {(() => {
            const idx = hoverIdx
            if (idx == null || !arcs[idx]) return null
            const a = arcs[idx]
            const pct = Math.round(a.frac * 100)
            return (
              <div className="chart-tooltip">
                <div className="chart-tooltip-header">{a.key}</div>
                <div className="chart-tooltip-row"><span>Betrag</span> <strong style={{ color: colors[a.key] }}>{eurFmt.format(a.gross)}</strong></div>
                <div className="chart-tooltip-row"><span>Anteil</span> <strong>{pct}%</strong></div>
              </div>
            )
          })()}
          <svg ref={svgRef} width={size.w} height={size.h} role="img" aria-label="Nach Sphäre">
            <defs>
              <filter id={`sphere-aura-${ditherId}`} x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="7" /></filter>
              {arcs.map((a, index) => {
                const color = colors[a.key]
                return <React.Fragment key={a.key}>
                  <radialGradient id={`sphere-gradient-${ditherId}-${index}`} cx="50%" cy="45%" r="70%"><stop offset="0%" stopColor={color} stopOpacity="0.94" /><stop offset="100%" stopColor={color} stopOpacity="0.6" /></radialGradient>
                  <pattern id={`sphere-dither-${ditherId}-${index}`} width="5" height="5" patternUnits="userSpaceOnUse"><rect x="0" y="0" width="1" height="1" fill={color} opacity="0.95" /><rect x="3" y="1" width="1" height="1" fill={color} opacity="0.64" /><rect x="2" y="4" width="1" height="1" fill={color} opacity="0.42" /></pattern>
                </React.Fragment>
              })}
            </defs>
            {arcs.map((a, idx) => {
              const isActive = hoverIdx === idx
              // Special handling for 100% single item: draw full circle
              const isSingle100 = arcs.length === 1 && Math.abs(a.frac - 1) < 0.0001
              if (isSingle100) {
                // Draw complete donut ring
                const activeOuterR = outerR + (isActive ? 3 : 0)
                const activeInnerR = innerR - (isActive ? 1.5 : 0)
                const outerCircle = `M ${cx - activeOuterR} ${cy} A ${activeOuterR} ${activeOuterR} 0 1 1 ${cx + activeOuterR} ${cy} A ${activeOuterR} ${activeOuterR} 0 1 1 ${cx - activeOuterR} ${cy} Z`
                const innerCircle = `M ${cx - activeInnerR} ${cy} A ${activeInnerR} ${activeInnerR} 0 1 0 ${cx + activeInnerR} ${cy} A ${activeInnerR} ${activeInnerR} 0 1 0 ${cx - activeInnerR} ${cy} Z`
                return (
                  <g key={idx} opacity={hoverIdx != null && !isActive ? 0.32 : 1} onMouseEnter={() => setHoverIdx(idx)} onMouseLeave={() => setHoverIdx(null)}>
                    <path d={outerCircle} fill={colors[a.key]} opacity={isActive ? "0.36" : "0.2"} filter={`url(#sphere-aura-${ditherId})`} />
                    <path d={outerCircle} fill={`url(#sphere-gradient-${ditherId}-${idx})`} />
                    <path d={outerCircle} fill={`url(#sphere-dither-${ditherId}-${idx})`} opacity="0.84" />
                    <path d={innerCircle} fill="var(--bg)" />
                    {isActive && <><circle cx={cx} cy={cy} r={activeOuterR} fill="none" stroke={colors[a.key]} strokeWidth="1.5" /><circle cx={cx} cy={cy} r={activeInnerR} fill="none" stroke={colors[a.key]} strokeWidth="1.25" /></>}
                    <text x={cx} y={cy} textAnchor="middle" fontSize="11" fill="#fff">100%</text>
                  </g>
                )
              }
              const activeOuterR = outerR + (isActive ? 2.6 : 0)
              const activeInnerR = innerR - (isActive ? 1.35 : 0)
              const largeArc = (a.end - a.start) > Math.PI ? 1 : 0
              const sx = cx + activeOuterR * Math.cos(a.start)
              const sy = cy + activeOuterR * Math.sin(a.start)
              const ex = cx + activeOuterR * Math.cos(a.end)
              const ey = cy + activeOuterR * Math.sin(a.end)
              const isx = cx + activeInnerR * Math.cos(a.end)
              const isy = cy + activeInnerR * Math.sin(a.end)
              const iex = cx + activeInnerR * Math.cos(a.start)
              const iey = cy + activeInnerR * Math.sin(a.start)
              const d = [
                `M ${sx} ${sy}`,
                `A ${activeOuterR} ${activeOuterR} 0 ${largeArc} 1 ${ex} ${ey}`,
                `L ${isx} ${isy}`,
                `A ${activeInnerR} ${activeInnerR} 0 ${largeArc} 0 ${iex} ${iey}`,
                'Z'
              ].join(' ')
              const mid = (a.start + a.end) / 2
              const lx = cx + (activeInnerR + (activeOuterR - activeInnerR) * 0.62) * Math.cos(mid)
              const ly = cy + (activeInnerR + (activeOuterR - activeInnerR) * 0.62) * Math.sin(mid)
              const pct = Math.round(a.frac * 100)
              const lift = isActive ? 2 : 0
              return (
                <g key={idx} opacity={hoverIdx != null && !isActive ? 0.32 : 1} onMouseEnter={() => setHoverIdx(idx)} onMouseLeave={() => setHoverIdx(null)} transform={`translate(${Math.cos(mid) * lift} ${Math.sin(mid) * lift})`}>
                  <path d={d} fill={colors[a.key]} opacity={isActive ? "0.36" : "0.2"} filter={`url(#sphere-aura-${ditherId})`} />
                  <path d={d} fill={`url(#sphere-gradient-${ditherId}-${idx})`} />
                  <path d={d} fill={`url(#sphere-dither-${ditherId}-${idx})`} opacity="0.84" />
                  {isActive && <path d={d} fill="none" stroke={colors[a.key]} strokeWidth="1.5" opacity="0.96" />}
                  {pct >= 7 && (
                    <text x={lx} y={ly} textAnchor="middle" fontSize="11" fill="#fff">{`${pct}%`}</text>
                  )}
                </g>
              )
            })}
          </svg>
          <div>
            <div className="helper">Summe (Brutto)</div>
            <div>{eurFmt.format(rows.reduce((a, b) => a + b.gross, 0))}</div>
          </div>
        </div>
      )}
    </div>
  )
}
