import React, { useEffect, useMemo, useState } from 'react'
import { IconCreditCard, IconReceipt2 } from '@tabler/icons-react'
import AppIcon from '../common/AppIcon'
import { IconBank, IconBudget, IconCash, IconPayPal } from '../../utils/icons'
import { Sphere, VoucherType, PaymentMethod } from './types'

export default function ReportsSummary(props: { refreshKey?: number; from?: string; to?: string; sphere?: Sphere; type?: VoucherType; paymentMethod?: PaymentMethod; earmarkId?: number; budgetId?: number }) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<null | {
    totals: { net: number; vat: number; gross: number }
    bySphere: Array<{ key: Sphere; net: number; vat: number; gross: number }>
    byPrimaryClassification: Array<{ key: string; color: string | null; net: number; vat: number; gross: number }>
    classificationProfile: 'NONPROFIT' | 'GENERAL'
    primaryClassificationLabel: string
    byPaymentMethod: Array<{ key: PaymentMethod | null; net: number; vat: number; gross: number }>
    byPaymentAccount?: Array<{ accountId: number | null; key: string; kind?: 'CASH' | 'BANK' | 'PAYPAL' | 'CARD' | 'OTHER' | null; color?: string | null; net: number; vat: number; gross: number }>
    byType: Array<{ key: VoucherType; net: number; vat: number; gross: number }>
  }>(null)
  const [monthsCount, setMonthsCount] = useState<number>(0)
  const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(window as any).api?.reports.summary?.({ from: props.from, to: props.to, sphere: props.sphere, type: props.type, paymentMethod: props.paymentMethod, earmarkId: props.earmarkId, budgetId: props.budgetId })
      .then((res: any) => { if (!cancelled) setData(res) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [props.from, props.to, props.sphere, props.type, props.paymentMethod, props.earmarkId, props.budgetId, props.refreshKey])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      (window as any).api?.reports.monthly?.({ from: props.from, to: props.to, sphere: props.sphere, type: 'IN', paymentMethod: props.paymentMethod, earmarkId: props.earmarkId, budgetId: props.budgetId }),
      (window as any).api?.reports.monthly?.({ from: props.from, to: props.to, sphere: props.sphere, type: 'OUT', paymentMethod: props.paymentMethod, earmarkId: props.earmarkId, budgetId: props.budgetId })
    ]).then(([inRes, outRes]) => {
      if (cancelled) return
      const months = new Set<string>()
      for (const b of (inRes?.buckets || [])) months.add(b.month)
      for (const b of (outRes?.buckets || [])) months.add(b.month)
      setMonthsCount(months.size)
    }).catch(() => setMonthsCount(0))
    return () => { cancelled = true }
  }, [props.from, props.to, props.sphere, props.paymentMethod, props.earmarkId, props.budgetId, props.refreshKey])

  return (
    <div className="card report-summary-card">
      <div className="report-summary-header">
        <div>
          <strong>Summen</strong>
          <div className="helper">Für den gewählten Zeitraum und die Filter.</div>
        </div>
      </div>
      {loading && <div>Lade …</div>}
      {data && (
        <div className="report-summary-content">
          {(() => {
            const inSum = (data.byType.find(t => t.key === 'IN')?.gross || 0)
            const outSum = (data.byType.find(t => t.key === 'OUT')?.gross || 0)
            const net = inSum - outSum
            const avgPerMonth = monthsCount > 0 ? (net / monthsCount) : null
            return (
              <div className="report-summary-kpis">
                <div className="card report-summary-kpi">
                  <div className="helper">Einnahmen (Brutto)</div>
                  <div style={{ fontWeight: 600, color: '#2e7d32' }}>{eurFmt.format(inSum)}</div>
                </div>
                <div className="card report-summary-kpi">
                  <div className="helper">Ausgaben (Brutto)</div>
                  <div style={{ fontWeight: 600, color: '#c62828' }}>{eurFmt.format(outSum)}</div>
                </div>
                <div className="card report-summary-kpi">
                  <div className="helper">Saldo</div>
                  <div style={{ fontWeight: 600, color: (net >= 0 ? 'var(--success)' : 'var(--danger)') }}>{eurFmt.format(net)}</div>
                </div>
                <div className="card report-summary-kpi">
                  <div className="helper">Ø Saldo/Monat{monthsCount > 0 ? ` (${monthsCount}m)` : ''}</div>
                  <div style={{ fontWeight: 600 }}>{avgPerMonth != null ? eurFmt.format(avgPerMonth) : '—'}</div>
                </div>
              </div>
            )
          })()}
          {/* Netto/MwSt/Brutto totals row intentionally removed per UI simplification */}
          <div className="report-summary-breakdowns">
            {/* Tax spheres for non-profits, user-defined categories otherwise */}
            <div className="card report-summary-breakdown-card">
              <div className="report-summary-section-title">
                <AppIcon icon={IconBudget} size="inline" />
                <strong>Nach {data.classificationProfile === 'GENERAL' ? data.primaryClassificationLabel : 'Sphäre'}</strong>
              </div>
              <div className="report-summary-list">
                {(data.classificationProfile === 'GENERAL' ? data.byPrimaryClassification : data.bySphere).map((r: any) => {
                  // Use rgba with low opacity for theme compatibility (works in light and dark)
                  const colors: Record<string, { bg: string; text: string }> = {
                    IDEELL: { bg: 'rgba(21, 101, 192, 0.15)', text: '#42a5f5' },
                    ZWECK: { bg: 'rgba(46, 125, 50, 0.15)', text: '#66bb6a' },
                    VERMOEGEN: { bg: 'rgba(239, 108, 0, 0.15)', text: '#ffa726' },
                    WGB: { bg: 'rgba(123, 31, 162, 0.15)', text: '#ab47bc' }
                  }
                  const c = r.color
                    ? { bg: `${r.color}26`, text: r.color }
                    : colors[r.key] || { bg: 'var(--muted)', text: 'var(--text)' }
                  return (
                    <div key={r.key} className="report-summary-row" style={{ background: c.bg }}>
                      <span style={{ fontWeight: 500, color: c.text, fontSize: 13 }}>{r.key}</span>
                      <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{eurFmt.format(r.gross)}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Nach Zahlweg */}
            <div className="card report-summary-breakdown-card">
              <div className="report-summary-section-title">
                <AppIcon icon={IconCreditCard} size="inline" />
                <strong>Nach Zahlweg</strong>
              </div>
              <div className="report-summary-list">
                {((data.byPaymentAccount && data.byPaymentAccount.length > 0)
                  ? data.byPaymentAccount
                  : data.byPaymentMethod.filter(r => r.key === 'BAR' || r.key === 'BANK').map((r) => ({ accountId: null, key: r.key || 'Ohne Konto', kind: r.key === 'BAR' ? 'CASH' : 'BANK', color: null, gross: r.gross, net: r.net, vat: r.vat }))
                ).map((r, i) => {
                  const icons: Record<string, React.ElementType> = { BANK: IconBank, CASH: IconCash, PAYPAL: IconPayPal, CARD: IconCreditCard, OTHER: IconBudget }
                  const color = r.color || (r.kind === 'CASH' ? '#42a5f5' : r.kind === 'BANK' ? '#26a69a' : 'var(--accent)')
                  const PaymentIcon = icons[r.kind ?? 'OTHER'] || IconBudget
                  return (
                    <div key={`${r.accountId ?? r.key ?? 'NULL'}-${i}`} className="report-summary-row" style={{ background: 'var(--muted)', borderLeft: `3px solid ${color}` }}>
                      <span className="report-summary-row-label">
                        <PaymentIcon size={14} color={color} aria-hidden="true" />
                        {r.key}
                      </span>
                      <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{eurFmt.format(r.gross)}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Nach Art */}
            <div className="card report-summary-breakdown-card">
              <div className="report-summary-section-title">
                <AppIcon icon={IconReceipt2} size="inline" />
                <strong>Nach Art</strong>
              </div>
              <div className="report-summary-list">
                {data.byType.map((r) => {
                  const styles: Record<string, { bg: string; text: string; icon: string }> = {
                    IN: { bg: 'rgba(46, 125, 50, 0.12)', text: '#2e7d32', icon: '↓' },
                    OUT: { bg: 'rgba(198, 40, 40, 0.12)', text: '#c62828', icon: '↑' },
                    TRANSFER: { bg: 'rgba(25, 118, 210, 0.12)', text: '#1976d2', icon: '↔' }
                  }
                  const s = styles[r.key] || { bg: 'var(--muted)', text: 'var(--text)', icon: '•' }
                  return (
                    <div key={r.key} className="report-summary-row" style={{ background: s.bg }}>
                      <span className="report-summary-row-label" style={{ color: s.text }}>
                        <span style={{ fontWeight: 700 }}>{s.icon}</span>
                        {r.key}
                      </span>
                      <span style={{ fontWeight: 600, color: s.text, fontVariantNumeric: 'tabular-nums' }}>{eurFmt.format(r.gross)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
