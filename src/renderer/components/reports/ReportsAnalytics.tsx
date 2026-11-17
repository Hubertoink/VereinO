import { useMemo } from 'react'
import { buildReportMonths, renderReportAnalytics, reportAnalyticsCss } from '../../../../shared/reportAnalytics'
import type { ReportMonthlyData } from './reportMonthlyData'

export default function ReportsAnalytics(props: { from?: string; to?: string; data: ReportMonthlyData; loading: boolean; error: boolean; onRetry: () => void }) {
  const html = useMemo(() => renderReportAnalytics(
    buildReportMonths(props.data.income, props.data.expense, props.from, props.to),
    false,
    { from: props.from, to: props.to }
  ), [props.data, props.from, props.to])
  return <><style>{reportAnalyticsCss}</style>{props.error ? <div role="alert" className="report-analytics">Monatswerte konnten nicht geladen werden. <button className="btn" onClick={props.onRetry}>Erneut versuchen</button></div> : props.loading ? <div role="status" className="report-analytics">Lade Monatswerte …</div> : <div dangerouslySetInnerHTML={{ __html: html }} />}</>
}
