import { normalizeCreditAmounts, normalizeInvoiceDirection, validateInvoiceExtraction } from '../../electron/main/services/invoiceValidation'
import { AiInvoiceExtractionResult } from '../../electron/main/ipc/schemas'

const context = {
  organization: { profile: 'GENERAL' },
  paymentAccounts: [{ id: 1, kind: 'CASH', isActive: 1 }, { id: 2, kind: 'BANK', isActive: 0 }],
  primaryClassifications: [{ id: 3, isActive: true }, { id: 4, isActive: false }],
  parties: [{ id: 5, isActive: 1 }],
  budgets: [{ id: 6, isArchived: 1 }], earmarks: [{ id: 7, isActive: 0 }], tags: [{ name: 'Material' }]
}
function invoice(overrides = {}) {
  return AiInvoiceExtractionResult.parse({
    supplier: 'Lieferant', invoiceNumber: 'R-1', invoiceDate: '2026-11-04', dueDate: null,
    grossAmount: 119, netAmount: 100, taxAmount: 19, vatRate: 19, iban: null,
    description: 'Material', type: 'OUT', sphere: 'IDEELL', primaryClassificationValueId: 3,
    paymentMethod: 'BAR', paymentAccountId: 1, paymentAccountEvidence: 'Bar bezahlt, Kasse', partyId: 5,
    budgets: [], earmarks: [], tags: ['Material'], confidence: 0.95, warnings: [], evidence: ['119 EUR'],
    ...overrides
  })
}

it('keeps valid assignments and matching totals unchanged', () => {
  const result = invoice()
  expect(validateInvoiceExtraction(result, context)).toEqual(result)
})
it('flags inconsistent amounts without changing the extracted totals or input', () => {
  const original = invoice({ grossAmount: 120 })
  const result = validateInvoiceExtraction(original, context)
  expect(result.grossAmount).toBe(120)
  expect(result.warnings.join()).toContain('1.00 EUR')
  expect(result.confidence).toBeLessThan(0.75)
  expect(original.warnings).toEqual([])
})
it('allows a cent of rounding and handles missing amounts', () => {
  expect(validateInvoiceExtraction(invoice({ grossAmount: 119.01 }), context).warnings).toEqual([])
  expect(validateInvoiceExtraction(invoice({ netAmount: null }), context).warnings).toEqual([])
})
it('removes inactive and invented references and enforces the general profile', () => {
  const result = validateInvoiceExtraction(invoice({
    paymentAccountId: 2, primaryClassificationValueId: 4, partyId: 999, sphere: 'WGB',
    budgets: [{ id: 6, amount: 119 }], earmarks: [{ id: 7, amount: 119 }], tags: ['Invented']
  }), context)
  expect(result).toMatchObject({ paymentAccountId: null, primaryClassificationValueId: null, partyId: null, sphere: 'IDEELL', budgets: [], earmarks: [], tags: [] })
  expect(result.warnings.join()).toContain('Kategorie muss')
})
it('derives the payment method from the active account', () => {
  expect(validateInvoiceExtraction(invoice({ paymentMethod: 'BANK' }), context).paymentMethod).toBe('BAR')
})
it.each(['IN', 'OUT'])('preserves explicit %s credit direction while retaining signed amounts', (type) => {
  const normalized = normalizeCreditAmounts({ grossAmount: -119, netAmount: '-100,00', taxAmount: -19, type })
  expect(normalized).toMatchObject({ grossAmount: 119, netAmount: 100, taxAmount: 19, type })
  const result = validateInvoiceExtraction(invoice(normalized), context)
  expect(result.warnings.join()).toContain('Gutschrift')
  expect(result.confidence).toBeLessThan(0.75)
})
it('flags positive credit notes and mixed signs without guessing a payment direction', () => {
  expect(normalizeCreditAmounts({ documentType: 'CREDIT_NOTE', grossAmount: 119 }).warnings).toEqual(expect.arrayContaining([expect.stringContaining('Gutschrift')]))
  const mixed = normalizeCreditAmounts({ grossAmount: -119, netAmount: 100, taxAmount: 19 })
  expect(mixed.warnings).toEqual(expect.arrayContaining([expect.stringContaining('Uneinheitliche Vorzeichen')]))
  expect(mixed.type).toBeUndefined()
})


describe('invoice direction from organization perspective', () => {
  it('corrects a supplier invoice incorrectly classified as income', () => {
    expect(normalizeInvoiceDirection({ documentType: 'INVOICE', type: 'IN', organizationRole: 'RECIPIENT', organizationRoleEvidence: 'Rechnung an Testverein' }).type).toBe('OUT')
  })
  it('requires evidence before accepting an issued invoice as income', () => {
    expect(normalizeInvoiceDirection({ documentType: 'INVOICE', type: 'IN', organizationRole: 'ISSUER', organizationRoleEvidence: null }).type).toBe('OUT')
    expect(normalizeInvoiceDirection({ documentType: 'INVOICE', organizationRole: 'ISSUER', organizationRoleEvidence: 'Rechnungssteller: Testverein' }).type).toBe('IN')
  })
  it('defaults unknown ordinary invoices to expense with a warning', () => {
    const result = normalizeInvoiceDirection({ documentType: 'UNKNOWN', type: 'IN', organizationRole: 'UNKNOWN' })
    expect(result.type).toBe('OUT')
    expect(result.warnings).toEqual(expect.arrayContaining([expect.stringContaining('Vorsorglich als Ausgabe')]))
  })
  it('reverses the direction for issued and received credit notes', () => {
    expect(normalizeInvoiceDirection({ documentType: 'CREDIT_NOTE', organizationRole: 'RECIPIENT', organizationRoleEvidence: 'Gutschrift an Testverein' }).type).toBe('IN')
    expect(normalizeInvoiceDirection({ documentType: 'CREDIT_NOTE', organizationRole: 'ISSUER', organizationRoleEvidence: 'Erstattung durch Testverein' }).type).toBe('OUT')
  })
})


it('explains rejected budget suggestions without exposing internal identifiers', () => {
  const result = validateInvoiceExtraction(invoice({ budgets: [{ id: 22, amount: 119 }] }), context)
  expect(result.warnings.join()).toContain('Die KI hat eine Budgetzuordnung vorgeschlagen')
  expect(result.warnings.join()).toContain('Der Vorschlag wurde nicht übernommen')
  expect(result.warnings.join()).not.toContain('22')
})
it('names a known archived budget in its explanation', () => {
  const result = validateInvoiceExtraction(invoice({ budgets: [{ id: 6, amount: 119 }] }), {
    ...context, budgets: [{ id: 6, label: 'Sommerfest', isArchived: 1 }]
  })
  expect(result.warnings.join()).toContain('Budget „Sommerfest“')
  expect(result.warnings.join()).toContain('nicht mehr aktiv')
})


it('leaves the account empty when the AI has no evidence, even with an active account ID', () => {
  const result = validateInvoiceExtraction(invoice({ paymentAccountEvidence: null }), context)
  expect(result.paymentAccountId).toBeNull()
  expect(result.paymentMethod).toBeNull()
  expect(result.warnings.join()).toContain('Zahlungskonto fehlt')
})
it('respects explicit user account guidance but still rejects inactive accounts', () => {
  expect(validateInvoiceExtraction(invoice({ paymentAccountEvidence: null }), context, 1).paymentAccountId).toBe(1)
  expect(validateInvoiceExtraction(invoice({ paymentAccountEvidence: null, paymentAccountId: 2 }), context, 2).paymentAccountId).toBeNull()
})
