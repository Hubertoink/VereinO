jest.mock('../../electron/main/db/database', () => ({ getDb: jest.fn(), getAppDataDir: jest.fn(), withTransaction: jest.fn() }))
jest.mock('../../electron/main/repositories/members_payments', () => ({ getMemberPaymentStatuses: jest.fn() }))
jest.mock('../../electron/main/repositories/vouchers', () => ({ createVoucher: jest.fn() }))
jest.mock('../../electron/main/repositories/tags', () => ({ setVoucherTags: jest.fn() }))
jest.mock('../../electron/main/repositories/paymentAccounts', () => ({ getPaymentAccountById: jest.fn(), paymentMethodForAccountKind: jest.fn() }))

import { getDb } from '../../electron/main/db/database'
import { getMemberPaymentStatuses } from '../../electron/main/repositories/members_payments'
import { listMembers } from '../../electron/main/repositories/members'
import { summarizeInvoices } from '../../electron/main/repositories/invoices'
import { InvoicesSummaryOutput } from '../../electron/main/ipc/schemas/invoices'

test('member metrics cover the entire filtered set before pagination and respect contribution filters', () => {
  const rows = [
    { id: 1, name: 'A', status: 'ACTIVE', contribution_amount: 10 },
    { id: 2, name: 'B', status: 'ACTIVE', contribution_amount: 25 },
    { id: 3, name: 'C', status: 'LEFT', contribution_amount: 10 }
  ]
  ;(getDb as jest.Mock).mockReturnValue({ prepare: () => ({ all: () => rows }) })
  ;(getMemberPaymentStatuses as jest.Mock).mockReturnValue(new Map([[1, { overdue: 2 }], [2, { overdue: 3 }], [3, { overdue: 0 }]]))
  const result = listMembers({ includeSummary: true, limit: 1, offset: 1 })
  expect(result.rows.map(r => r.id)).toEqual([2])
  expect(result.summary).toEqual({ active: 2, dueMembers: 2, dueAmount: 95 })
  expect(listMembers({ includeSummary: true, contributionFilter: 'NOT_DUE' }).summary?.dueAmount).toBe(0)
  expect(listMembers({ includeSummary: true, contributionFilter: 'DUE', limit: 1 }).total).toBe(2)
})

test('invoice metrics use unpaid amounts by direction, never net an overpayment against another invoice', () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-09-26T12:00:00Z'))
  ;(getDb as jest.Mock).mockReturnValue({ prepare: () => ({ all: () => [
    { grossAmount: 200, paidSum: 50, voucherType: 'OUT', dueDate: '2026-09-25' },
    { grossAmount: 100, paidSum: 20, voucherType: 'IN', dueDate: '2026-09-26' },
    { grossAmount: 300, paidSum: 400, voucherType: 'OUT', dueDate: '2026-01-01' },
    { grossAmount: 30, paidSum: 0, voucherType: 'IN', dueDate: null }
  ] }) })
  expect(InvoicesSummaryOutput.parse(summarizeInvoices({}))).toEqual(expect.objectContaining({ remainingIn: 110, remainingOut: 150, remaining: 260, overdueAmount: 150, overdueCount: 1 }))
  expect(summarizeInvoices({ status: 'PAID' })).toEqual(expect.objectContaining({ count: 1, remaining: 0, overdueAmount: 0 }))
  expect(summarizeInvoices({ status: 'PARTIAL' })).toEqual(expect.objectContaining({ count: 2, remaining: 230 }))
  jest.useRealTimers()
})
