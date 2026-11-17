import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildReportMonthlyModel, loadReportMonthlyData, type ReportMonthlyData, type ReportMonthlyFilters } from './reportMonthlyData'

export function useReportMonthlyData(filters: ReportMonthlyFilters, refreshKey?: number) {
  const { from, to, sphere, type, paymentMethod, earmarkId, budgetId } = filters
  const [data, setData] = useState<ReportMonthlyData>({ income: [], expense: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const reload = useCallback(() => setRetry(value => value + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    loadReportMonthlyData(window.api.reports.monthly, {
      from, to, sphere, type, paymentMethod, earmarkId, budgetId
    }).then(result => {
      if (!cancelled) setData(result)
    }).catch(() => {
      if (!cancelled) setError(true)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [from, to, sphere, type, paymentMethod, earmarkId, budgetId, refreshKey, retry])

  const model = useMemo(() => buildReportMonthlyModel(data), [data])
  return { model, loading, error, reload }
}
