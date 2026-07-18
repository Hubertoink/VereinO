import React, { useEffect, useMemo, useState } from 'react'

type AccountBalance = { id: number; name: string; kind: string; color?: string | null; balance: number }

export default function ReportsCashBars(props: { refreshKey?: number; from?: string; to?: string }) {
  const [loading, setLoading] = useState(false)
  const [accounts, setAccounts] = useState<AccountBalance[]>([])
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(window as any).api?.reports.cashBalance?.({ from: props.from, to: props.to })
      .then((res: any) => {
        if (cancelled || !res) return
        const rows = Array.isArray(res.accounts) && res.accounts.length
          ? res.accounts
          : [
              { id: -1, name: 'Bar', kind: 'CASH', color: '#42a5f5', balance: Number(res.BAR || 0) },
              { id: -2, name: 'Bank', kind: 'BANK', color: '#26a69a', balance: Number(res.BANK || 0) }
            ]
        setAccounts(rows.map((account: any) => ({ id: Number(account.id), name: String(account.name || 'Konto'), kind: String(account.kind || 'OTHER'), color: account.color || null, balance: Number(account.balance || 0) })))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [props.from, props.to, props.refreshKey])
  
  const total = accounts.reduce((sum, account) => sum + account.balance, 0)
  const absoluteTotal = accounts.reduce((sum, account) => sum + Math.abs(account.balance), 0)
  const maxVal = Math.max(100, ...accounts.map((account) => Math.abs(account.balance)))
  
  return (
    <div className="card dither-chart-card" style={{ padding: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <strong>Kassenstand nach Zahlungskonto</strong>
        <div style={{ fontSize: 15, fontWeight: 600, color: total >= 0 ? 'var(--success)' : 'var(--danger)' }}>
          {eurFmt.format(total || 0)}
        </div>
      </div>
      {loading && <div className="helper">Laden…</div>}
      {!loading && accounts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }}>
          {accounts.map((account, index) => {
            const color = account.color || (account.kind === 'CASH' ? '#42a5f5' : account.kind === 'BANK' ? '#26a69a' : 'var(--accent)')
            return (
              <div
                key={account.id}
                style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'default', position: 'relative' }}
                onMouseEnter={() => setHoverIdx(index)}
                onMouseLeave={() => setHoverIdx(null)}
              >
                <span style={{ width: 86, fontSize: 12, fontWeight: 500, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.name}</span>
                <div className="dither-bar-track" style={{ flex: 1, height: 24 }}>
                  <div
                    className={`dither-bar-fill ${index % 2 === 0 ? 'dither-bar-fill--dotted' : 'dither-bar-fill--hatched'}`}
                    style={{
                      height: '100%',
                      width: `${Math.max(2, (Math.abs(account.balance) / Math.max(1, maxVal)) * 100)}%`,
                      borderRadius: 6,
                      transition: 'width 0.3s ease',
                      '--dither-color': color
                    } as React.CSSProperties}
                  />
                  <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {eurFmt.format(account.balance)}
                  </span>
                </div>
                {hoverIdx === index && (
                  <div style={{ position: 'absolute', left: 96, top: -28, padding: '4px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, boxShadow: 'var(--shadow-1)', whiteSpace: 'nowrap', zIndex: 10, pointerEvents: 'none' }}>
                    Anteil: <strong>{absoluteTotal > 0 ? Math.round((Math.abs(account.balance) / absoluteTotal) * 100) : 0}%</strong>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
