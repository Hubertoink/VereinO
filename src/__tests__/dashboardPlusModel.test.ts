import { dashboardMonths, buildDashboardMonths } from '../renderer/views/DashboardPlus/dashboardPlusModel'

test('dashboard months span year boundaries and include the unfinished current month', () => {
  expect(dashboardMonths('2026-01-07', 3)).toEqual(['2025-11', '2025-12', '2026-01'])
})

test('month balances carry forward opening amounts, fill gaps and preserve reversal signs', () => {
  const rows = buildDashboardMonths(['2026-01', '2026-02', '2026-03'], [{ month: '2026-01', gross: 150 }], [{ month: '2026-01', gross: -50 }, { month: '2026-03', gross: 25 }], 1000)
  expect(rows.map(row => row.balance)).toEqual([1100, 1100, 1125])
  expect(rows[1].income).toBe(0)
  expect(rows[2].expense).toBe(-25)
  expect(rows[2].net).toBe(25)
})
