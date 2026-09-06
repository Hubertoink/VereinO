const mockPrepare = jest.fn()
const mockCreateVoucher = jest.fn()
const mockWriteAudit = jest.fn()

jest.mock('../../electron/main/db/database', () => ({
  getDb: jest.fn(),
  withTransaction: jest.fn((work) => work({ prepare: mockPrepare }))
}))

jest.mock('../../electron/main/repositories/vouchers', () => ({
  createVoucher: (...args: unknown[]) => mockCreateVoucher(...args)
}))

jest.mock('../../electron/main/services/audit', () => ({
  writeAudit: (...args: unknown[]) => mockWriteAudit(...args)
}))

jest.mock('../../electron/main/repositories/recurringOccurrences', () => ({
  materializeDueOccurrences: jest.fn(),
  materializeRecurringBookingThrough: jest.fn()
}))

import { bookRecurringOccurrence } from '../../electron/main/repositories/recurringBookings'

describe('bookRecurringOccurrence', () => {
  beforeEach(() => {
    mockPrepare.mockReset()
    mockCreateVoucher.mockReset()
    mockWriteAudit.mockReset()
    mockCreateVoucher.mockReturnValue({ id: 44, voucherNo: '2026-09-04_00044' })

    mockPrepare.mockImplementation((statement: string) => {
      if (statement.includes('FROM recurring_bookings rb')) {
        return {
          get: () => ({
            id: 7,
            name: 'Adobe Photoshop',
            type: 'OUT',
            sphere: 'IDEELL',
            primaryClassificationValueId: null,
            description: 'Adobe Photoshop',
            note: null,
            counterparty: 'Adobe',
            amountMode: 'GROSS',
            amount: 10,
            vatRate: 0,
            paymentAccountId: 2,
            budgetAssignmentsJson: '[]',
            budgetId: null,
            earmarkAssignmentsJson: '[]',
            earmarkId: null,
            tagsJson: '[]',
            frequency: 'WEEKLY'
          })
        }
      }
      if (statement.includes('FROM recurring_occurrences')) {
        return { get: () => ({ id: 71, scheduledDate: '2026-08-09' }) }
      }
      if (statement.includes('UPDATE recurring_occurrences')) {
        return { run: () => ({ changes: 1 }) }
      }
      throw new Error(`Unexpected statement: ${statement}`)
    })
  })

  it('creates a voucher without querying a bank transaction when no bank import is supplied', () => {
    const result = bookRecurringOccurrence({
      recurringBookingId: 7,
      occurrenceId: 71,
      bookingDate: '2026-09-04',
      amount: 10
    })

    expect(result).toMatchObject({
      id: 44,
      voucherNo: '2026-09-04_00044',
      occurrenceId: 71,
      scheduledDate: '2026-08-09'
    })
    expect(mockCreateVoucher).toHaveBeenCalledWith(expect.objectContaining({
      date: '2026-09-04',
      description: 'Adobe Photoshop (KW 32 2026)'
    }))
    expect(mockPrepare.mock.calls.some(([statement]) => statement.includes('FROM bank_transactions')))
      .toBe(false)
  })
})
