import { stackedMonths, type StackVoucher } from '../renderer/views/DashboardPlus/stackedMonthlyModel'
import { activityFallback, bookingKindLabel } from '../renderer/views/Dashboard/activityPresentation'
const voucher = (values: Partial<StackVoucher>): StackVoucher => ({ date: '2026-09-07', type: 'IN', sphere: 'IDEELL', grossAmount: 100, ...values } as StackVoucher)
test('tag allocation preserves cents, deduplicates tags and retains reversal signs', () => {
  const result = stackedMonths([voucher({ tags: ['C', 'A', 'B', 'A'] }), voucher({ grossAmount: -10, tags: ['D', 'E', 'F'] })], ['2026-09', '2026-10'], 'IN', 'tags', false)
  expect(result.months[0].total).toBe(90)
  expect(result.months[0].entries.map(row => row.amount)).toEqual([33.34, 33.33, 33.33, -3.34, -3.33, -3.33])
  expect(result.months[1].total).toBe(0)
})
test('filters booking type and period and groups organization categories', () => {
  const rows = [voucher({ type: 'OUT', primaryClassificationValueId: 5, primaryClassificationName: 'Kultur' }), voucher({}), voucher({ type: 'OUT', date: '2025-01-01' })]
  const result = stackedMonths(rows, ['2026-09'], 'OUT', 'classification', true)
  expect(result.series.map(row => row.label)).toEqual(['Kultur'])
  expect(result.months[0].total).toBe(100)
  expect(stackedMonths(rows, ['2026-09'], 'OUT', 'classification', false).series[0].label).toBe('Ideell')
})
test('untagged bookings remain visible', () => {
  expect(stackedMonths([voucher({})], ['2026-09'], 'IN', 'tags', false).series[0].label).toBe('Ohne Tag')
})
test('activity labels translate recurring bookings and booking kinds', () => {
  expect(activityFallback('recurring_occurrences', 'BOOK', 15)).toBe('Dauerbuchung #15 gebucht')
  expect(bookingKindLabel('OUT')).toBe('Ausgabe')
  expect(activityFallback('unknown', 'UNKNOWN', 2)).toBe('Datensatz #2 aktualisiert')
})
