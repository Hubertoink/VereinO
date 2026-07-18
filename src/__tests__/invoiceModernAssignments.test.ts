jest.mock('../../electron/main/db/database', () => ({
  getAppDataDir: jest.fn(),
  getDb: jest.fn(),
  withTransaction: jest.fn()
}))
jest.mock('../../electron/main/repositories/vouchers', () => ({ createVoucher: jest.fn() }))
jest.mock('../../electron/main/repositories/tags', () => ({ setVoucherTags: jest.fn() }))
jest.mock('../../electron/main/repositories/paymentAccounts', () => ({
  getPaymentAccountById: jest.fn(),
  paymentMethodForAccountKind: (kind?: string) => kind === 'CASH' ? 'BAR' : kind ? 'BANK' : null
}))

import { buildInvoiceVoucherCreationInput } from '../../electron/main/repositories/invoices'

describe('buildInvoiceVoucherCreationInput', () => {
  it('maps invoice payment accounts and multiple assignments to voucher payload', () => {
    const result = buildInvoiceVoucherCreationInput({
      invoiceId: 42,
      date: '2024-01-12',
      paidAmount: 180,
      invoice: {
        voucher_type: 'OUT',
        sphere: 'IDEELL',
        description: 'Rechnung 42',
        gross_amount: 180,
        payment_method: 'BANK',
        payment_account_id: 7,
        party: 'Test GmbH',
        party_id: 9,
        earmark_id: 3,
        budget_id: 5
      },
      tags: ['foo', 'bar'],
      budgets: [
        { budgetId: 5, amount: 120 },
        { budgetId: 6, amount: 60 }
      ],
      earmarks: [
        { earmarkId: 3, amount: 180 }
      ],
      paymentAccount: { id: 7, name: 'Bank', kind: 'BANK' }
    } as any)

    expect(result.paymentAccountId).toBe(7)
    expect(result.paymentMethod).toBe('BANK')
    expect(result.counterparty).toBe('Test GmbH')
    expect(result.partyId).toBe(9)
    expect(result.budgets).toEqual([
      { budgetId: 5, amount: 120 },
      { budgetId: 6, amount: 60 }
    ])
    expect(result.earmarks).toEqual([
      { earmarkId: 3, amount: 180 }
    ])
    expect(result.tags).toEqual(['foo', 'bar'])
    expect(result.grossAmount).toBe(180)
  })
})
