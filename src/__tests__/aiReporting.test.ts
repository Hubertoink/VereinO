import { buildReportFinance, previousReportDay } from '../../shared/aiReporting'
import { AiReportQuestionInput } from '../../electron/main/ipc/schemas/aiReporting'

test('report balances include opening values, fill gaps, and preserve reversal signs', () => {
  const data = buildReportFinance({ from: '2026-01-15', to: '2026-03-07' },
    [{ month: '2026-01', gross: 150.1 }], [{ month: '2026-01', gross: -50 }, { month: '2026-03', gross: 25.2 }], 1000)
  expect(data).toMatchObject({ income: 150.1, expense: 24.8, change: 125.3, opening: 1000, closing: 1125.3, hasBookings: true })
  expect(data.months.map(row => row.balance)).toEqual([1100.1, 1100.1, 1125.3])
  expect(data.months[0].from).toBe('2026-01-15')
  expect(data.months[1]).toMatchObject({ from: '2026-02-01', to: '2026-02-28', income: 0, expense: 0 })
  expect(data.months[2].to).toBe('2026-03-07')
})

test('empty periods carry the booked opening balance, including negative balances', () => {
  const data = buildReportFinance({ from: '2024-02-01', to: '2024-03-01' }, [], [], -15)
  expect(data.hasBookings).toBe(false)
  expect(data.change).toBe(0)
  expect(data.months.map(row => row.balance)).toEqual([-15, -15])
  expect(data.months[0].to).toBe('2024-02-29')
  expect(previousReportDay('2026-01-01')).toBe('2025-12-31')
})

test('zero net activity is distinct from missing bookings and cent arithmetic stays exact', () => {
  const data = buildReportFinance({ from: '2026-01-01', to: '2026-03-31' },
    [{ month: '2026-01', gross: .1 }, { month: '2026-02', gross: .2 }], [{ month: '2026-03', gross: -.3 }], 0)
  expect(data).toMatchObject({ hasBookings: true, income: .3, expense: .3, change: 0, closing: 0 })
})

test('invalid dates, inverted ranges and unbounded histories are rejected before querying', () => {
  const valid = { question: 'Saldo?', from: '2026-01-01', to: '2026-11-07' }
  expect(AiReportQuestionInput.safeParse(valid).success).toBe(true)
  for (const changes of [{ from: '2026-02-30' }, { from: '2027-01-01' }, { from: '1800-01-01' }, { question: '' }]) {
    expect(AiReportQuestionInput.safeParse({ ...valid, ...changes }).success).toBe(false)
  }
})
