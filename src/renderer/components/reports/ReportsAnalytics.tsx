import React, { useEffect, useState } from 'react'
import { buildReportMonths, renderReportAnalytics, reportAnalyticsCss } from '../../../../shared/reportAnalytics'
import { Sphere, VoucherType, PaymentMethod } from './types'

export default function ReportsAnalytics(props: { refreshKey?: number; from?: string; to?: string; sphere?: Sphere; type?: VoucherType; paymentMethod?: PaymentMethod; earmarkId?: number; budgetId?: number }) {
  const [html, setHtml] = useState('')
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let cancelled = false
    setHtml(''); setError(false)
    const { refreshKey: _, ...filters } = props
    Promise.all((['IN', 'OUT'] as const).map(type => props.type && props.type !== type
      ? Promise.resolve({ buckets: [] })
      : window.api.reports.monthly({ ...filters, type })))
      .then(([income, expense]) => { if (!cancelled) setHtml(renderReportAnalytics(buildReportMonths(income.buckets, expense.buckets, props.from, props.to), false, { from: props.from, to: props.to })) })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [props.from, props.to, props.sphere, props.type, props.paymentMethod, props.earmarkId, props.budgetId, props.refreshKey, retry])
  return <><style>{reportAnalyticsCss}</style>{error ? <div role="alert" className="report-analytics">Monatswerte konnten nicht geladen werden. <button className="btn" onClick={() => setRetry(n => n + 1)}>Erneut versuchen</button></div> : html ? <div dangerouslySetInnerHTML={{ __html: html }} /> : <div role="status" className="report-analytics">Lade Monatswerte …</div>}</>
}
