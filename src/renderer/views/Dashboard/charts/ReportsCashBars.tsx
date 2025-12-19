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
  
  return (
    <div className="card" style={{ padding: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <strong>Kassenstand (BAR/BANK)</strong>
        <div style={{ fontSize: 15, fontWeight: 600, color: total >= 0 ? 'var(--success)' : 'var(--danger)' }}>
          {eurFmt.format(total || 0)}
        </div>
      </div>
      {loading && <div className="helper">Laden…</div>}
      {!loading && balance && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }}>
          {/* BAR */}
          <div 
            style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'default', position: 'relative' }}
            onMouseEnter={() => setHoverIdx(0)} 
            onMouseLeave={() => setHoverIdx(null)}
          >
            <span style={{ width: 50, fontSize: 12, fontWeight: 500, color: 'var(--text-dim)' }}>BAR</span>
            <div style={{ flex: 1, height: 24, background: 'var(--muted)', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
              <div 
                style={{ 
                  height: '100%', 
                  width: `${Math.max(2, (Math.abs(balance.bar) / Math.max(1, maxVal)) * 100)}%`,
                  background: 'linear-gradient(90deg, #42a5f5, #64b5f6)',
                  borderRadius: 6,
                  transition: 'width 0.3s ease'
                }} 
              />
              <span style={{ 
                position: 'absolute', 
                right: 8, 
                top: '50%', 
                transform: 'translateY(-50%)', 
                fontSize: 13, 
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums'
              }}>
                {eurFmt.format(balance.bar)}
              </span>
            </div>
            {/* Hover tooltip for BAR */}
            {hoverIdx === 0 && (
              <div style={{ 
                position: 'absolute',
                left: 60,
                top: -28,
                padding: '4px 10px', 
                background: 'var(--surface)', 
                border: '1px solid var(--border)', 
                borderRadius: 6, 
                fontSize: 12,
                boxShadow: 'var(--shadow-1)',
                whiteSpace: 'nowrap',
                zIndex: 10,
                pointerEvents: 'none'
              }}>
                Anteil: <strong>{total > 0 ? Math.round((balance.bar / total) * 100) : 0}%</strong>
              </div>
            )}
          </div>
          
          {/* BANK */}
          <div 
            style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'default', position: 'relative' }}
            onMouseEnter={() => setHoverIdx(1)} 
            onMouseLeave={() => setHoverIdx(null)}
          >
            <span style={{ width: 50, fontSize: 12, fontWeight: 500, color: 'var(--text-dim)' }}>BANK</span>
            <div style={{ flex: 1, height: 24, background: 'var(--muted)', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
              <div 
                style={{ 
                  height: '100%', 
                  width: `${Math.max(2, (Math.abs(balance.bank) / Math.max(1, maxVal)) * 100)}%`,
                  background: 'linear-gradient(90deg, #26a69a, #4db6ac)',
                  borderRadius: 6,
                  transition: 'width 0.3s ease'
                }} 
              />
              <span style={{ 
                position: 'absolute', 
                right: 8, 
                top: '50%', 
                transform: 'translateY(-50%)', 
                fontSize: 13, 
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums'
              }}>
                {eurFmt.format(balance.bank)}
              </span>
            </div>
            {/* Hover tooltip for BANK */}
            {hoverIdx === 1 && (
              <div style={{ 
                position: 'absolute',
                left: 60,
                top: -28,
                padding: '4px 10px', 
                background: 'var(--surface)', 
                border: '1px solid var(--border)', 
                borderRadius: 6, 
                fontSize: 12,
                boxShadow: 'var(--shadow-1)',
                whiteSpace: 'nowrap',
                zIndex: 10,
                pointerEvents: 'none'
              }}>
                Anteil: <strong>{total > 0 ? Math.round((balance.bank / total) * 100) : 0}%</strong>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
