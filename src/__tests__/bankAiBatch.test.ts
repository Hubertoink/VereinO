jest.mock('../../electron/main/db/database', () => ({ getDb: jest.fn(() => ({})), withTransaction: jest.fn(fn => fn()) }))
jest.mock('../../electron/main/repositories/bankTransactions', () => ({ getBankTransaction: jest.fn(), findBankTransactionMatches: jest.fn(), linkBankTransaction: jest.fn() }))
jest.mock('../../electron/main/repositories/vouchers', () => ({ createVoucher: jest.fn() }))
jest.mock('../../electron/main/repositories/recurringBookings', () => ({ bookRecurringOccurrence: jest.fn(), listRecurringBookings: jest.fn(), getRecurringBankAssignments: jest.fn(() => ({ budgets: [], earmarks: [] })) }))
jest.mock('../../electron/main/repositories/classifications', () => ({ resolvePrimaryClassificationValueId: jest.fn(() => 1) }))
jest.mock('../../electron/main/services/settings', () => ({ ensurePeriodOpen: jest.fn(), getSetting: jest.fn() }))

import { applyBankAiBatchRow, previewBankAiBatch, previewBankAiBatchRow, validateBankAiBatchDraft } from '../../electron/main/services/bankAiBatch'
import { findBankTransactionMatches, getBankTransaction, linkBankTransaction } from '../../electron/main/repositories/bankTransactions'
import { createVoucher } from '../../electron/main/repositories/vouchers'
import { bookRecurringOccurrence, listRecurringBookings } from '../../electron/main/repositories/recurringBookings'
import { ensurePeriodOpen, getSetting } from '../../electron/main/services/settings'
import { resolvePrimaryClassificationValueId } from '../../electron/main/repositories/classifications'
import type { BankTransaction } from '../../shared/bankAiBatch'

describe('bank AI batch approval', () => {
  let transaction: BankTransaction
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(getSetting).mockReturnValue(undefined)
    transaction = { id: 7, status: 'OPEN', direction: 'OUT', amount: 29.99, bookingDate: '2026-08-13', currency: 'EUR',
      paymentAccountId: 1, paymentAccountName: 'Bank', counterparty: 'Canva', sourceFileName: 'bank.csv',
      aiSuggestion: { action: 'CREATE_BOOKING', confidence: .99, reason: 'Monatsabo', warnings: [], evidence: [],
        bookingCandidate: { date: '2026-08-13', type: 'OUT', grossAmount: 29.99, sphere: 'IDEELL', description: 'Software', vatRate: 0 } } }
    jest.mocked(getBankTransaction).mockImplementation(() => structuredClone(transaction))
    jest.mocked(findBankTransactionMatches).mockReturnValue([])
    jest.mocked(ensurePeriodOpen).mockImplementation(() => {})
    jest.mocked(resolvePrimaryClassificationValueId).mockImplementation(() => 1)
    jest.mocked(createVoucher).mockImplementation(() => {
      transaction.status = 'LINKED'
      transaction.aiSuggestion = null
      return { id: 81, voucherNo: '2026-81', grossAmount: 29.99, warnings: [] }
    })
  })

  it('uses the existing atomic booking path and preserves edited classifications and allocations', () => {
    const preview = previewBankAiBatchRow(7)
    expect(preview.blockers).toEqual([])
    const result = applyBankAiBatchRow({ id: 7, token: preview.token,
      candidate: { ...preview.candidate!, description: 'Canva Jugendhaus', budgets: [{ id: 3, amount: 29.99 }], earmarks: [{ id: 4, amount: 10 }], tags: [' Abo ', ''] } })
    expect(result.voucherNo).toBe('2026-81')
    expect(createVoucher).toHaveBeenCalledWith(expect.objectContaining({ bankTransactionId: 7, paymentAccountId: 1,
      counterparty: 'Canva', description: 'Canva Jugendhaus', budgets: [{ budgetId: 3, amount: 29.99 }], earmarks: [{ earmarkId: 4, amount: 10 }], tags: ['Abo'] }))
    expect(() => applyBankAiBatchRow({ id: 7, token: preview.token })).toThrow(/geändert/)
    expect(createVoucher).toHaveBeenCalledTimes(1)
  })

  it('previews multiple unique sources without substituting array indices for drafts', () => {
    const rows = previewBankAiBatch([7, 8, 7])
    expect(rows).toHaveLength(2)
    expect(rows.every(row => row.candidate?.description === 'Software' && row.blockers.length === 0)).toBe(true)
  })

  it.each(['amount', 'suggestion'] as const)('rejects a changed %s without writing', kind => {
    const preview = previewBankAiBatchRow(7)
    if (kind === 'amount') transaction.amount = 35
    else transaction.aiSuggestion!.bookingCandidate!.description = 'Neuer KI-Vorschlag'
    expect(() => applyBankAiBatchRow({ id: 7, token: preview.token })).toThrow(/geändert/)
    expect(createVoucher).not.toHaveBeenCalled()
  })

  it.each([{ grossAmount: 42 }, { type: 'IN' }, { paymentAccountId: 99 }, { paymentMethod: 'BAR' }, { date: '2026-02-31' }, { description: '  ' }])('rejects invalid edited bank data %j', change => {
    const preview = previewBankAiBatchRow(7)
    expect(() => applyBankAiBatchRow({ id: 7, token: preview.token, candidate: { ...preview.candidate!, ...change } as any })).toThrow()
    expect(createVoucher).not.toHaveBeenCalled()
  })

  it('keeps advisory warnings separate from duplicate blockers regardless of confidence', () => {
    transaction.aiSuggestion!.warnings = ['Steuersatz unklar']
    jest.mocked(findBankTransactionMatches).mockImplementation(input => input.linkedOnly ? [{ id: 20 }] as any : [])
    const preview = previewBankAiBatchRow(7)
    expect(preview.warnings).toContain('Steuersatz unklar')
    expect(preview.blockers).toEqual([expect.stringContaining('Doppelbuchung')])
    expect(() => applyBankAiBatchRow({ id: 7, token: preview.token })).toThrow(/Doppelbuchung/)
    expect(createVoucher).not.toHaveBeenCalled()
  })

  it('allows booking without optional budget assignments even when the AI mentions it', () => {
    transaction.aiSuggestion!.warnings = ['Kein Budget zugeordnet.']
    const preview = previewBankAiBatchRow(7)
    expect(preview.warnings).toEqual([])
    expect(preview.blockers).toEqual([])
    expect(applyBankAiBatchRow({ id: 7, token: preview.token }).voucherId).toBe(81)
    expect(createVoucher).toHaveBeenCalledWith(expect.objectContaining({ budgets: [] }))
  })

  it.each([false, true])('only transfers dedicated comments with opt-in %s', enabled => {
    jest.mocked(getSetting).mockReturnValue(enabled)
    transaction.aiSuggestion!.bookingCandidate!.note = 'Referenz: BREF-JH-0009'
    const row = previewBankAiBatchRow(7)
    expect(row.commentsEnabled).toBe(enabled)
    expect(row.candidate?.note).toBe(enabled ? 'Referenz: BREF-JH-0009' : '')
    applyBankAiBatchRow({ id: 7, token: row.token })
    expect(createVoucher).toHaveBeenCalledWith(expect.objectContaining({ note: enabled ? 'Referenz: BREF-JH-0009' : '' }))
  })

  it('requires renewed review if the comment opt-in changes while the modal is open', () => {
    const row = previewBankAiBatchRow(7)
    jest.mocked(getSetting).mockReturnValue(true)
    expect(() => applyBankAiBatchRow({ id: 7, token: row.token })).toThrow(/geändert/)
    expect(createVoucher).not.toHaveBeenCalled()
  })

  it('allows a missing required category to be repaired in the batch draft', () => {
    jest.mocked(resolvePrimaryClassificationValueId).mockImplementation((_db, input) => {
      if (!input.primaryClassificationValueId) throw new Error('Eine Kategorie ist erforderlich.')
      return input.primaryClassificationValueId
    })
    const preview = previewBankAiBatchRow(7)
    expect(preview.blockers).toContain('Eine Kategorie ist erforderlich.')
    const input = { id: 7, token: preview.token, candidate: { ...preview.candidate!, primaryClassificationValueId: 2 } }
    expect(validateBankAiBatchDraft(input).blockers).toEqual([])
    expect(applyBankAiBatchRow(input).voucherId).toBe(81)
  })

  it('checks for newly available existing bookings immediately before creation', () => {
    const preview = previewBankAiBatchRow(7)
    jest.mocked(findBankTransactionMatches).mockImplementation(input => input.linkedOnly ? [] : [{ id: 20 }] as any)
    expect(() => applyBankAiBatchRow({ id: 7, token: preview.token })).toThrow(/passende Buchungen/)
    expect(createVoucher).not.toHaveBeenCalled()
  })

  it('rejects closed periods and allows retry after a write failure', () => {
    const preview = previewBankAiBatchRow(7)
    jest.mocked(ensurePeriodOpen).mockImplementationOnce(() => { throw new Error('Zeitraum geschlossen') })
    expect(() => applyBankAiBatchRow({ id: 7, token: preview.token })).toThrow(/geschlossen/)
    jest.mocked(createVoucher).mockImplementationOnce(() => { throw new Error('Speichern fehlgeschlagen') })
    expect(() => applyBankAiBatchRow({ id: 7, token: preview.token })).toThrow(/Speichern/)
    expect(applyBankAiBatchRow({ id: 7, token: preview.token }).voucherId).toBe(81)
  })

  it('links existing vouchers instead of creating another booking and rejects changed targets', () => {
    transaction.aiSuggestion = { action: 'LINK_EXISTING', voucherId: 81, voucherNo: '2026-81', confidence: .9, reason: 'Treffer', warnings: [], evidence: [] }
    const match = { id: 81, description: 'Software', paymentAccountMismatch: false }
    jest.mocked(findBankTransactionMatches).mockImplementation(input => input.linkedOnly ? [] : [match] as any)
    jest.mocked(linkBankTransaction).mockReturnValue({ voucherNo: '2026-81' } as any)
    const preview = previewBankAiBatchRow(7)
    expect(applyBankAiBatchRow({ id: 7, token: preview.token }).voucherId).toBe(81)
    expect(linkBankTransaction).toHaveBeenCalledWith({ id: 7, voucherId: 81 })
    expect(createVoucher).not.toHaveBeenCalled()
    match.description = 'Bearbeitet'
    expect(() => applyBankAiBatchRow({ id: 7, token: preview.token })).toThrow(/geändert/)
  })

  it('applies the exact recurring occurrence and detects changed recurring settings', () => {
    transaction.aiSuggestion = { action: 'APPLY_RECURRING', recurringBookingId: 2, occurrenceId: 5, scheduledDate: '2026-08-13', confidence: .9, reason: 'Abo', warnings: [], evidence: [] }
    const recurring = { id: 2, name: 'Canva', sphere: 'IDEELL', description: 'Software', counterparty: 'Canva', vatRate: 0, frequency: 'MONTHLY', budgets: [], earmarks: [], tags: [], status: 'ACTIVE' }
    jest.mocked(listRecurringBookings).mockReturnValue([recurring] as any)
    jest.mocked(findBankTransactionMatches).mockImplementation(input => input.linkedOnly ? [] : [{ matchKind: 'RECURRING', recurringBookingId: 2, occurrenceId: 5, scheduledDate: '2026-08-13' }] as any)
    jest.mocked(bookRecurringOccurrence).mockReturnValue({ id: 81, voucherNo: '2026-81', warnings: [] } as any)
    const preview = previewBankAiBatchRow(7)
    applyBankAiBatchRow({ id: 7, token: preview.token })
    expect(bookRecurringOccurrence).toHaveBeenCalledWith(expect.objectContaining({ occurrenceId: 5, recurringBookingId: 2, bankTransactionId: 7, amount: 29.99 }))
    recurring.vatRate = 19
    expect(() => applyBankAiBatchRow({ id: 7, token: preview.token })).toThrow(/geändert/)
  })
})
