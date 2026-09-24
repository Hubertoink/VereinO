import { validateBankReviewResult } from '../../electron/main/services/aiBankReviewValidation'
import { AiBankImportReviewResultStructured } from '../../electron/main/ipc/schemas/ai'
import { cleanIpcErrorMessage } from '../../shared/ipcError'

const link = { transactionId: 1, action: 'LINK_EXISTING', confidence: 0.8, reason: 'Betrag und Datum passen.', voucherId: 42 }
const booking = { date: '2026-09-24', type: 'OUT', sphere: 'IDEELL', description: 'Fahrkarten', grossAmount: 75.4 }

it('preserves all lines of the reported Electron validation error', () => {
  const details = '[\n  {\n    "path": ["suggestions", 0, "reason"],\n    "message": "Expected string, received null"\n  }\n]'
  expect(cleanIpcErrorMessage(`Error invoking remote method 'ai.bankImports.reviewOpen': Error: ${details}`)).toBe(details)
  expect(cleanIpcErrorMessage('HTTP 401')).toBe('HTTP 401')
})

it('accepts omitted optional fields and null optional lists', () => {
  const result = validateBankReviewResult({ suggestions: [{ ...link, warnings: null, evidence: null }], summary: null, warnings: null }, [1])
  expect(result.suggestions[0]).toMatchObject({ action: 'LINK_EXISTING', voucherId: 42, warnings: [], evidence: [] })
  expect(result.summary).toBeUndefined()
})

it('accepts bank booking drafts without document sources', () => {
  for (const source of [undefined, null]) {
    const result = validateBankReviewResult({ suggestions: [{
      transactionId: 1, action: 'CREATE_BOOKING', confidence: 0.8, reason: 'Neue Ausgabe.',
      bookingCandidate: { ...booking, source, tags: null }
    }] }, [1])
    expect(result.suggestions[0]).toMatchObject({ action: 'CREATE_BOOKING', bookingCandidate: { grossAmount: 75.4, tags: [] } })
  }
})

it('marks only the invalid suggestion for manual review and names the actual null field', () => {
  const result = validateBankReviewResult({ suggestions: [link, { ...link, transactionId: 2, reason: null }] }, [1, 2])
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
  ] }, [1, 2, 3, 4, 5])
  expect(result.suggestions.map(s => s.transactionId)).toEqual([1, 2, 3, 4, 5])
  expect(result.suggestions.every(s => s.action === 'NEEDS_MANUAL_REVIEW')).toBe(true)
  expect(result.suggestions[1].reason).toContain('bookingCandidate.grossAmount')
})

it('rejects a broken response envelope with a readable one-line message', () => {
  expect(() => validateBankReviewResult({ suggestions: null }, [1])).toThrow('keine gültige Vorschlagsliste')
})

it('does not demand a document source in the bank review output schema', () => {
  expect(AiBankImportReviewResultStructured.safeParse({
    suggestions: [{
      ...link, action: 'CREATE_BOOKING', voucherId: null, voucherNo: null,
      recurringBookingId: null, recurringBookingName: null, occurrenceId: null, scheduledDate: null,
      warnings: [], evidence: [],
      bookingCandidate: { ...booking, vatRate: 0, paymentMethod: null, paymentAccountId: null,
        counterparty: null, budgets: [], earmarks: [], tags: [], confidence: 0.8, warnings: [], evidence: [] }
    }], summary: null, warnings: []
  }).success).toBe(true)
})
