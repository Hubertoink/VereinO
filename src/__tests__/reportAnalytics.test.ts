import { buildReportMonths, renderReportAnalytics, reportComparison } from '../../shared/reportAnalytics'

test('fills calendar gaps, preserves expense refunds and accumulates only the selected period', () => {
  const rows = buildReportMonths([{ month: '2026-01', gross: 100 }], [{ month: '2026-01', gross: -30 }, { month: '2026-03', gross: 10 }], '2026-01-15', '2026-03-08')
  expect(rows).toEqual([
    { month: '2026-01', income: 100, expense: 30, net: 70, cumulative: 70 },
    { month: '2026-02', income: 0, expense: 0, net: 0, cumulative: 70 },
    { month: '2026-03', income: 0, expense: -10, net: 10, cumulative: 80 }
  ])
  expect(renderReportAnalytics(rows)).toContain('26,67')
})

test('exports every year expanded; screen opens only the newest year', () => {
  const rows = buildReportMonths([{ month: '2025-12', gross: 12 }], [{ month: '2026-01', gross: -3 }])
  expect(renderReportAnalytics(rows).match(/class="ra-year[^"]*" open/g)).toHaveLength(1)
  expect(renderReportAnalytics(rows, true).match(/class="ra-year[^"]*" open/g)).toHaveLength(2)
  expect(renderReportAnalytics(rows, true)).toContain('Saldo kumuliert')
})

test('empty, invalid and reversed ranges are safe, including the last representable year', () => {
  expect(buildReportMonths([], [])).toEqual([])
  expect(buildReportMonths([], [], '2026-13-01', '2027-01-01')).toEqual([])
  expect(buildReportMonths([], [], '2026-03-01', '2026-01-01')).toEqual([])
  expect(buildReportMonths([], [], '9999-12-01', '9999-12-31')).toHaveLength(1)
})


test('month comparison excludes partial months and future periods', () => {
  const rows = buildReportMonths([], [], '2026-01-01', '2026-12-31')
  expect(reportComparison(rows, { from: '2026-01-12', to: '2026-12-31', today: '2026-09-26' })?.current.month).toBe('2026-08')
  expect(reportComparison(rows, { from: '2026-01-12', to: '2026-03-15', today: '2026-09-26' })).toBeNull()
  expect(reportComparison(rows, { from: '2026-01-01', to: '2026-03-15', today: '2026-09-26' })?.previous.month).toBe('2026-01')
})

test('current year is highlighted even when future years are included, with others grouped in an archive', () => {
  const rows = buildReportMonths([], [], '2013-12-01', '2027-12-31')
  const html = renderReportAnalytics(rows, false, { today: '2026-09-26' })
  expect(html).toContain('ra-year--focus" open><summary>2026')
  expect(html).toContain('Weitere Jahre (14)')
  expect(html).toContain('class="ra-archive"><summary>')
  expect(html).not.toContain('NaN')
  expect(html).not.toContain('Infinity')
})
