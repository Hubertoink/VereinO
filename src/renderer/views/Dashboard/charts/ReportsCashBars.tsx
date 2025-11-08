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
  
  const maxVal = Math.max(100, Math.abs(balance?.bar || 0), Math.abs(balance?.bank || 0))
  const W = 420, H = 200, P = { top: 24, right: 80, bottom: 48, left: 100 }
  const innerH = H - P.top - P.bottom
  const barH = 28
  const gap = 24
  const xFor = (v: number) => P.left + Math.round((Math.abs(v) / maxVal) * (W - P.left - P.right))
  
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
  const xTicks = (() => {
    const step = niceStep(maxVal)
    const arr: number[] = []
    for (let v = 0; v <= maxVal; v += step) arr.push(Math.round(v))
    return arr
  })()
  
  return (
    <div className="card" style={{ padding: 12, overflow: 'hidden' }}>
      <strong>Kassenstand (BAR/BANK)</strong>
      {loading && <div className="helper">Laden…</div>}
      {!loading && (
        <div style={{ position: 'relative', overflow: 'hidden' }}>
          {(() => {
            const idx = hoverIdx
            if (idx == null) return null
            const label = idx === 0 ? 'BAR' : 'BANK'
            const value = idx === 0 ? (balance?.bar || 0) : (balance?.bank || 0)
            const color = idx === 0 ? '#42a5f5' : '#26a69a'
            return (
              <div style={{ position: 'absolute', top: 6, left: 12, background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', display: 'flex', gap: 10, alignItems: 'center', zIndex: 10 }}>
                <strong style={{ fontSize: 12 }}>{label}</strong>
                <span className="chip" style={{ background: color, color: '#fff' }}>{eurFmt.format(value)}</span>
              </div>
            )
          })()}
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" style={{ maxWidth: '100%', height: 'auto' }} role="img" aria-label="Kassenstand">
          {/* X-Achse Grid + Labels */}
          {xTicks.map((v, i) => (
            <g key={i}>
              <line x1={xFor(v)} x2={xFor(v)} y1={P.top - 6} y2={H - P.bottom + 6} stroke="var(--border)" opacity={0.25} />
              <text 
                x={xFor(v)} 
                y={H - P.bottom + 14} 
                fill="var(--text-dim)" 
                fontSize={10} 
                fontWeight={500} 
                textAnchor="start" 
                transform={`rotate(45, ${xFor(v)}, ${H - P.bottom + 14})`}
              >
                {eurFmt.format(v)}
              </text>
            </g>
          ))}
          {/* Y-Achse */}
          <line x1={P.left - 2} y1={P.top - 6} x2={P.left - 2} y2={H - P.bottom + 6} stroke="var(--border)" />
          {/* BAR */}
          <g onMouseEnter={() => setHoverIdx(0)} onMouseLeave={() => setHoverIdx(null)}>
            <text x={P.left - 8} y={P.top + barH / 2} textAnchor="end" dominantBaseline="middle" fontSize={12} fontWeight={500}>BAR</text>
            <rect x={P.left} y={P.top} width={Math.max(2, xFor(balance?.bar || 0) - P.left)} height={barH} fill="#42a5f5" rx={4} />
            <text x={Math.max(P.left + 6, xFor(balance?.bar || 0) + 6)} y={P.top + barH / 2} dominantBaseline="middle" fontSize={11} fill="var(--text-dim)">{eurFmt.format(balance?.bar || 0)}</text>
          </g>
          {/* BANK */}
          <g onMouseEnter={() => setHoverIdx(1)} onMouseLeave={() => setHoverIdx(null)}>
            <text x={P.left - 8} y={P.top + barH + gap + barH / 2} textAnchor="end" dominantBaseline="middle" fontSize={12} fontWeight={500}>BANK</text>
            <rect x={P.left} y={P.top + barH + gap} width={Math.max(2, xFor(balance?.bank || 0) - P.left)} height={barH} fill="#26a69a" rx={4} />
            <text x={Math.max(P.left + 6, xFor(balance?.bank || 0) + 6)} y={P.top + barH + gap + barH / 2} dominantBaseline="middle" fontSize={11} fill="var(--text-dim)">{eurFmt.format(balance?.bank || 0)}</text>
          </g>
        </svg>
        </div>
      )}
    </div>
  )
}
