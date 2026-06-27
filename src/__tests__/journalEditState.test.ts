import {
  buildVoucherUpdatePayloadFromEditRow,
  getVoucherMutationBlockReason,
  serializeEditRow
} from '../renderer/views/Journal/utils/journalEditState'
import type { EditVoucherRow } from '../renderer/views/Journal/types'

function makeRow(overrides: Partial<EditVoucherRow> = {}): EditVoucherRow {
  return {
    id: 1,
    voucherNo: 'V001',
    date: '2026-01-01',
    type: 'OUT',
    sphere: 'IDEELL',
    description: 'Test',
    note: null,
    netAmount: 10,
    vatRate: 0,
    vatAmount: 0,
    grossAmount: 10,
    ...overrides
  }
}

describe('journal edit state helpers', () => {
  it('serializes assignment and tag order deterministically', () => {
    const first = serializeEditRow(makeRow({
      tags: ['beta', 'alpha'],
      budgets: [{ budgetId: 2, amount: 5 }, { budgetId: 1, amount: 5 }],
      earmarksAssigned: [{ earmarkId: 3, amount: 1 }, { earmarkId: 2, amount: 2 }]
    }))
    const second = serializeEditRow(makeRow({
      tags: ['alpha', 'beta'],
      budgets: [{ budgetId: 1, amount: 5 }, { budgetId: 2, amount: 5 }],
      earmarksAssigned: [{ earmarkId: 2, amount: 2 }, { earmarkId: 3, amount: 1 }]
    }))

    expect(first).toBe(second)
  })

  it('blocks editing reversal vouchers and already reversed originals', () => {
    expect(getVoucherMutationBlockReason({ originalId: 10, originalVoucherNo: 'V010' })).toContain('Originalbuchung #V010')
    expect(getVoucherMutationBlockReason({ reversedById: 11, reversedByVoucherNo: 'V011' })).toContain('durch #V011')
    expect(getVoucherMutationBlockReason({ id: 1 })).toBe('')
  })

  it('builds transfer update payloads without payment method fields', () => {
    const payload = buildVoucherUpdatePayloadFromEditRow(makeRow({
      type: 'TRANSFER',
      transferFrom: 'BAR',
      transferTo: 'BANK',
      transferFromAccountId: 1,
      transferToAccountId: 2,
      mode: 'GROSS',
      grossAmount: 25
    }), [], [])

    expect(payload.paymentMethod).toBeUndefined()
    expect(payload.paymentAccountId).toBeNull()
    expect(payload.transferFromAccountId).toBe(1)
    expect(payload.transferToAccountId).toBe(2)
    expect(payload.amountMode).toBe('GROSS')
  })

  it('builds regular payment and legacy assignment fields', () => {
    const payload = buildVoucherUpdatePayloadFromEditRow(makeRow({
      paymentMethod: 'BANK',
      paymentAccountId: 4,
      mode: 'NET',
      netAmount: 12,
      vatRate: 7,
      note: '  hallo  '
    }), [{ budgetId: 8, amount: 12 }], [{ earmarkId: 9, amount: 3 }])

    expect(payload.paymentMethod).toBe('BANK')
    expect(payload.paymentAccountId).toBe(4)
    expect(payload.budgetId).toBe(8)
    expect(payload.earmarkId).toBe(9)
    expect(payload.note).toBe('hallo')
    expect(payload.amountMode).toBe('NET')
  })
})
