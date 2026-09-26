import React from 'react'
import './managementKpis.css'

export default function ManagementKpis({ label, loading, items }: { label: string; loading?: boolean; items: Array<{ label: string; value: string; hint: string; tone?: 'warning' | 'success' }> }) {
  return <section className="management-kpis" aria-label={label} aria-busy={loading}>
    {items.map(item => <div className={`management-kpi${item.tone ? ` management-kpi--${item.tone}` : ''}`} key={item.label}>
      <span>{item.label}</span><strong>{loading ? '…' : item.value}</strong><small>{item.hint}</small>
    </div>)}
  </section>
}

export function InvoicePaymentProgress({ paid, gross, label = 'bezahlt' }: { paid: number; gross: number; label?: string }) {
  const percentage = gross > 0 ? Math.min(100, Math.max(0, paid / gross * 100)) : 0
  return <div className="management-payment"><span>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(paid)}</span>
    {gross > 0 && <><progress value={percentage} max={100} aria-label={label === 'erstattet' ? 'Erstattungsfortschritt' : 'Zahlungsfortschritt'} /><small>{Math.round(percentage)} % {label}</small></>}
  </div>
}

export function InvoiceDueHint({ date, remaining, today = new Date().toLocaleDateString('en-CA') }: { date?: string | null; remaining: number; today?: string }) {
  if (!date || remaining <= 0) return null
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000)
  if (!Number.isFinite(days)) return null
  return <small className={`management-due${days > 0 ? ' management-due--late' : ''}`}>{days > 0 ? `Seit ${days} ${days === 1 ? 'Tag' : 'Tagen'} überfällig` : days === 0 ? 'Heute fällig' : `In ${-days} ${days === -1 ? 'Tag' : 'Tagen'} fällig`}</small>
}
