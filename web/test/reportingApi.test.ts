import assert from 'node:assert/strict'
import test from 'node:test'
import type { Entry } from '../src/api'
import { monthlyBookings, overviewMonths, reportSummaryBookings } from '../src/reportingApi'
const entry = (
  id: number,
  type: 'IN' | 'OUT',
  grossAmountCents: number,
  date: string,
  paymentMethod: 'BANK' | 'CASH' = 'BANK'
): Entry => ({
  id,
  version: 1,
  type,
  grossAmountCents,
  date,
  paymentMethod,
  description: `Buchung ${id}`,
  sphere: 'IDEELL'
})
const rows = [
  entry(1, 'IN', 10001, '2026-01-01'),
  entry(2, 'OUT', 2345, '2026-01-31', 'CASH'),
  entry(3, 'IN', 20, '2026-03-05'),
  entry(4, 'OUT', 9, '2026-03-06')
]
test('report summary keeps outgoing gross positive and groups actual payment methods', () => {
  const summary = reportSummaryBookings(rows, { from: '2026-01-01', to: '2026-01-31' })
  const income = summary.byType.find((row) => row.key === 'IN')!.gross
  const expense = summary.byType.find((row) => row.key === 'OUT')!.gross
  assert.equal(income, 100.01)
  assert.equal(expense, 23.45)
  assert.equal(Math.round((income - expense) * 100), 7656)
  assert.equal(summary.byPaymentAccount.find((row) => row.key === 'Kasse')!.gross, 23.45)
  assert.equal(
    summary.byPaymentAccount[0].accountId,
    null,
    'payment methods must not invent persisted account IDs'
  )
})
test('monthly cash flow follows signed Electron contract including combined filters', () => {
  assert.deepEqual(
    monthlyBookings(rows).buckets.map((row) => [row.month, row.gross]),
    [
      ['2026-01', 76.56],
      ['2026-03', 0.11]
    ]
  )
  assert.equal(
    monthlyBookings(rows, { type: 'OUT', paymentMethod: 'BAR', to: '2026-01-31' }).buckets[0].gross,
    -23.45
  )
  assert.deepEqual(monthlyBookings(rows, { sphere: 'WGB' }).buckets, [])
})
test('dashboard includes missing months, carries opening history and excludes future bookings', () => {
  const months = overviewMonths([...rows, entry(5, 'IN', 999999, '2026-12-01')], '2026-03-15')
  const january = months.find((row) => row.month === '2026-01')!
  assert.deepEqual(
    [january.income, january.expense, january.net, january.balance],
    [100.01, 23.45, 76.56, 76.56]
  )
  const february = months.find((row) => row.month === '2026-02')!
  assert.deepEqual([february.income, february.expense, february.balance], [0, 0, 76.56])
  assert.equal(months.at(-1)!.balance, 76.67)
  assert.equal(months.at(-1)!.month, '2026-03')
  assert.equal(overviewMonths([], '2026-03-15').at(-1)!.balance, 0)
})
test('aggregates reject amounts outside safe integer-cent precision', () => {
  const huge = [
    entry(1, 'IN', Number.MAX_SAFE_INTEGER, '2026-01-01'),
    entry(2, 'IN', 1, '2026-01-01')
  ]
  assert.throws(() => monthlyBookings(huge), /Betragsbereich/)
  assert.throws(() => reportSummaryBookings(huge), /Betragsbereich/)
})

test('assignment report filters select whole bookings once, rather than planning allocation amounts', () => {
  const assigned = {
    ...entry(8, 'IN', 10001, '2026-04-01'),
    budgets: [{ budgetId: 11, amount: 30 }, { budgetId: 12, amount: 70.01 }],
    earmarksAssigned: [{ earmarkId: 21, amount: 25 }]
  }
  assert.equal(reportSummaryBookings([assigned], { budgetId: 11 }).totals.gross, 100.01)
  assert.equal(monthlyBookings([assigned], { budgetId: 11, earmarkId: 21 }).buckets[0].gross, 100.01)
  assert.equal(reportSummaryBookings([assigned], { budgetId: 99 }).totals.gross, 0)
})
