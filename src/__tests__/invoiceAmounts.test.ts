import { invoiceAmountMismatch } from '../../shared/invoiceAmounts'

it('marks inconsistent amounts and clears after correction', () => {
  expect(invoiceAmountMismatch(248, 200, 38)).toBe(true)
  expect(invoiceAmountMismatch(238, 200, 38)).toBe(false)
})
it('accepts cent rounding and does not invent mismatches for missing amounts', () => {
  expect(invoiceAmountMismatch(119.01, 100, 19)).toBe(false)
  expect(invoiceAmountMismatch(119.02, 100, 19)).toBe(true)
  expect(invoiceAmountMismatch(119, null, 19)).toBe(false)
  expect(invoiceAmountMismatch(NaN, 100, 19)).toBe(false)
})
