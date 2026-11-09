import { validateBankReviewResult } from '../../electron/main/services/aiBankReviewValidation'
import { AiBankImportReviewResultStructured } from '../../electron/main/ipc/schemas/ai'
import { cleanIpcErrorMessage } from '../../shared/ipcError'

const link = { transactionId: 1, action: 'LINK_EXISTING', confidence: 0.8, reason: 'Betrag und Datum passen.', voucherId: 42 }
const booking = { date: '2026-09-24', type: 'OUT', sphere: 'IDEELL', description: 'Fahrkarten', grossAmount: 75.4 }
const transactions = (...ids: number[]) => ids.map(id => ({ id, direction: 'OUT' as const }))

it('preserves all lines of the reported Electron validation error', () => {
  const details = '[\n  {\n    "path": ["suggestions", 0, "reason"],\n    "message": "Expected string, received null"\n  }\n]'
  expect(cleanIpcErrorMessage(`Error invoking remote method 'ai.bankImports.reviewOpen': Error: ${details}`)).toBe(details)
  expect(cleanIpcErrorMessage('HTTP 401')).toBe('HTTP 401')
})

it('accepts omitted optional fields and null optional lists', () => {
  const result = validateBankReviewResult({ suggestions: [{ ...link, warnings: null, evidence: null }], summary: null, warnings: null }, transactions(1))
  expect(result.suggestions[0]).toMatchObject({ action: 'LINK_EXISTING', voucherId: 42, warnings: [], evidence: [] })
  expect(result.summary).toBeUndefined()
})

it('accepts bank booking drafts without document sources', () => {
  for (const source of [undefined, null]) {
    const result = validateBankReviewResult({ suggestions: [{
      transactionId: 1, action: 'CREATE_BOOKING', confidence: 0.8, reason: 'Neue Ausgabe.',
      bookingCandidate: { ...booking, source, tags: null }
    }] }, transactions(1))
    expect(result.suggestions[0]).toMatchObject({ action: 'CREATE_BOOKING', bookingCandidate: { grossAmount: 75.4, tags: [] } })
  }
})

it('marks only the invalid suggestion for manual review and names the actual null field', () => {
  const result = validateBankReviewResult({ suggestions: [link, { ...link, transactionId: 2, reason: null }] }, transactions(1, 2))
  expect(result.suggestions[0].action).toBe('LINK_EXISTING')
  expect(result.suggestions[1]).toMatchObject({ action: 'NEEDS_MANUAL_REVIEW', confidence: 0, reason: expect.stringContaining('reason') })
  expect(result.suggestions[1].voucherId).toBeUndefined()
})

it('does not guess missing amounts, IDs or ambiguous suggestions', () => {
  const result = validateBankReviewResult({ suggestions: [
    { ...link, voucherId: null },
    { ...link, transactionId: 2, action: 'CREATE_BOOKING', bookingCandidate: { ...booking, grossAmount: null } },
    { ...link, transactionId: 3 }, { ...link, transactionId: 3 },
    { ...link, transactionId: '4' }, { ...link, transactionId: 99 }
  ] }, transactions(1, 2, 3, 4, 5))
  expect(result.suggestions.map(s => s.transactionId)).toEqual([1, 2, 3, 4, 5])
  expect(result.suggestions.every(s => s.action === 'NEEDS_MANUAL_REVIEW')).toBe(true)
  expect(result.suggestions[1].reason).toContain('bookingCandidate.grossAmount')
})

it('rejects a broken response envelope with a readable one-line message', () => {
  expect(() => validateBankReviewResult({ suggestions: null }, transactions(1))).toThrow('keine gültige Vorschlagsliste')
})

it.each([
  { matches: [] },
  { matches: [{ id: 43, matchKind: 'VOUCHER' }] },
  { matches: [{ id: 42, matchKind: 'RECURRING' }] }
])('rejects a link outside the supplied voucher matches: %j', ({ matches }) => {
  const invalid = jest.fn()
  const result = validateBankReviewResult({ suggestions: [link] }, [{ id: 1, direction: 'OUT', matches }], invalid)
  expect(result.suggestions[0]).toMatchObject({ action: 'NEEDS_MANUAL_REVIEW', reason: expect.stringContaining('voucherId') })
  expect(invalid).toHaveBeenCalledWith(1, expect.stringContaining('voucherId'))
})

it('reports invalid answers for correction but leaves deliberate manual-review decisions alone', () => {
  const invalid = jest.fn()
  const result = validateBankReviewResult({ suggestions: [
    { ...link, voucherId: null },
    { ...link, transactionId: 2, action: 'NEEDS_MANUAL_REVIEW', reason: 'Mehrere passende Buchungen.' },
    { ...link, transactionId: 3 }
  ] }, [
    { id: 1, direction: 'OUT', matches: [] },
    { id: 2, direction: 'OUT', matches: [] },
    { id: 3, direction: 'OUT', matches: [{ id: 42, matchKind: 'VOUCHER' }] }
  ], invalid)
  expect(invalid).toHaveBeenCalledTimes(1)
  expect(invalid).toHaveBeenCalledWith(1, expect.stringContaining('voucherId'))
  expect(result.suggestions[2]).toMatchObject({ action: 'LINK_EXISTING', voucherId: 42 })
})

it.each(['IN', 'OUT'] as const)('keeps the imported %s direction even when the AI interprets the purpose differently', (direction) => {
  const result = validateBankReviewResult({ suggestions: [{
    transactionId: 46, action: 'CREATE_BOOKING', confidence: 0.9, reason: 'Kauf Lastenanhänger',
    bookingCandidate: { ...booking, type: direction === 'IN' ? 'OUT' : 'IN', description: 'Kauf Lastenanhänger', grossAmount: 106.99 }
  }] }, [{ id: 46, direction }])
  expect(result.suggestions[0]).toMatchObject({
    action: 'CREATE_BOOKING', bookingCandidate: { type: direction, grossAmount: 106.99 },
    warnings: [expect.stringContaining(direction === 'IN' ? 'Einnahme' : 'Ausgabe')]
  })
})

it('uses each original transaction by ID rather than the order returned by the AI', () => {
  const result = validateBankReviewResult({ suggestions: [
    { ...link, transactionId: 2, action: 'CREATE_BOOKING', bookingCandidate: { ...booking, type: 'IN' } },
    { ...link, action: 'CREATE_BOOKING', bookingCandidate: { ...booking, type: 'IN' } }
  ] }, [{ id: 1, direction: 'IN' }, { id: 2, direction: 'OUT' }])
  expect(result.suggestions.map(s => s.bookingCandidate?.type)).toEqual(['IN', 'OUT'])
  expect(result.suggestions[0].warnings).toEqual([])
})

it('does not demand a document source in the bank review output schema', () => {
  expect(AiBankImportReviewResultStructured.safeParse({
    suggestions: [{
      ...link, action: 'CREATE_BOOKING', voucherId: null, voucherNo: null,
      recurringBookingId: null, recurringBookingName: null, occurrenceId: null, scheduledDate: null,
      warnings: [], evidence: [],
      bookingCandidate: { ...booking, note: null, vatRate: 0, paymentMethod: null, paymentAccountId: null,
        counterparty: null, counterpartyIban: null, budgets: [], earmarks: [], tags: [], confidence: 0.8, warnings: [], evidence: [] }
    }], summary: null, warnings: []
  }).success).toBe(true)
})
