import React, { useEffect, useMemo, useState } from 'react'

export default function ReportsCashBars(props: { refreshKey?: number; from?: string; to?: string }) {
  const [loading, setLoading] = useState(false)
  const [balance, setBalance] = useState<{ bar: number; bank: number } | null>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(window as any).api?.reports.cashBalance?.({ from: props.from, to: props.to })
      .then((res: any) => {
        if (cancelled || !res) return
        setBalance({ bar: res.BAR || 0, bank: res.BANK || 0 })
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [props.from, props.to, props.refreshKey])
  
  const total = (balance?.bar || 0) + (balance?.bank || 0)
  const maxVal = Math.max(100, Math.abs(balance?.bar || 0), Math.abs(balance?.bank || 0))
  // Compact layout - reduced width and right padding for tighter visualization
  const W = 600, H = 160, P = { top: 18, right: 12, bottom: 16, left: 96 }
  const barH = 20
  const gap = 14
  const xFor = (v: number) => P.left + Math.round((Math.abs(v) / Math.max(1e-9, maxVal)) * (W - P.left - P.right))
  
  return (
    <div className="card" style={{ padding: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <strong>Kassenstand (BAR/BANK)</strong>
        <div className="helper">Summe: {eurFmt.format(total || 0)}</div>
      </div>
      {loading && <div className="helper">Laden…</div>}
      {!loading && (
        <div style={{ position: 'relative', overflow: 'hidden' }}>
          {(() => {
            const idx = hoverIdx
            if (idx == null) return null
            const label = idx === 0 ? 'BAR' : 'BANK'
            const value = idx === 0 ? (balance?.bar || 0) : (balance?.bank || 0)
            const color = idx === 0 ? '#42a5f5' : '#26a69a'
            const pct = total > 0 ? Math.round((value / total) * 100) : 0
            return (
              <div style={{ position: 'absolute', top: 6, left: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', pointerEvents: 'none', boxShadow: 'var(--shadow-1)', fontSize: 12, zIndex: 10 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span>Betrag</span> <strong style={{ color }}>{eurFmt.format(value)}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span>Anteil</span> <strong>{pct}%</strong></div>
              </div>
            )
          })()}
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: '100%', height: 'auto' }} role="img" aria-label="Kassenstand">
          {/* leichte Hintergrund-Guides */}
          <line x1={P.left - 2} y1={P.top - 4} x2={P.left - 2} y2={H - P.bottom + 4} stroke="var(--border)" opacity={0.6} />
          {/* BAR */}
          <g onMouseEnter={() => setHoverIdx(0)} onMouseLeave={() => setHoverIdx(null)}>
            <text x={P.left - 8} y={P.top + barH / 2} textAnchor="end" dominantBaseline="middle" fontSize={12} fontWeight={600}>BAR</text>
            <rect x={P.left} y={P.top} width={Math.max(2, xFor(balance?.bar || 0) - P.left)} height={barH} fill="#42a5f5" rx={4} />
            {/* Place value inside bar when enough width, else outside but within viewport */}
            {(() => {
              const val = balance?.bar || 0
              const xEnd = xFor(val)
              const text = eurFmt.format(val)
              const inside = (xEnd - P.left) > 100
              const xText = inside ? xEnd - 6 : xEnd + 6
              const anchor = inside ? 'end' : 'start'
              const fill = inside ? '#fff' : 'var(--text)'
              return <text x={xText} y={P.top + barH / 2} textAnchor={anchor} dominantBaseline="middle" fontSize={12} fontWeight={600} fill={fill}>{text}</text>
            })()}
          </g>
          {/* BANK */}
          <g onMouseEnter={() => setHoverIdx(1)} onMouseLeave={() => setHoverIdx(null)}>
            <text x={P.left - 8} y={P.top + barH + gap + barH / 2} textAnchor="end" dominantBaseline="middle" fontSize={12} fontWeight={600}>BANK</text>
            <rect x={P.left} y={P.top + barH + gap} width={Math.max(2, xFor(balance?.bank || 0) - P.left)} height={barH} fill="#26a69a" rx={4} />
            {(() => {
              const val = balance?.bank || 0
              const xEnd = xFor(val)
              const text = eurFmt.format(val)
              const inside = (xEnd - P.left) > 100
              const xText = inside ? xEnd - 6 : xEnd + 6
              const anchor = inside ? 'end' : 'start'
              const fill = inside ? '#fff' : 'var(--text)'
              return <text x={xText} y={P.top + barH + gap + barH / 2} textAnchor={anchor} dominantBaseline="middle" fontSize={12} fontWeight={600} fill={fill}>{text}</text>
            })()}
          </g>
        </svg>
        </div>
      )}
    </div>
  )
}
