import type Database from 'better-sqlite3'
const SqliteDatabase: new (path: string) => Database.Database = (() => {
  try { return require('node:sqlite').DatabaseSync }
  catch { return require('better-sqlite3') }
})()

jest.mock('../../electron/main/db/database', () => ({ getDb: jest.fn(), withTransaction: jest.fn() }))
jest.mock('../../electron/main/repositories/paymentAccounts', () => ({ getPaymentAccountById: jest.fn(() => ({ kind: 'BANK', isActive: 1 })) }))
jest.mock('../../electron/main/services/bankStatementParser', () => ({ parseBankStatement: jest.fn() }))
jest.mock('../../electron/main/services/audit', () => ({ writeAudit: jest.fn() }))
jest.mock('../../electron/main/repositories/recurringOccurrences', () => ({ materializeDueOccurrences: jest.fn() }))

import { getDb, withTransaction } from '../../electron/main/db/database'
import { parseBankStatement } from '../../electron/main/services/bankStatementParser'
import { commitBankImport, previewBankImport } from '../../electron/main/repositories/bankTransactions'

describe('bank import duplicate detection across exports', () => {
  let db: Database.Database
  beforeEach(() => {
    db = new SqliteDatabase(':memory:')
    db.exec(`
      CREATE TABLE payment_accounts (id INTEGER PRIMARY KEY, name TEXT);
      INSERT INTO payment_accounts VALUES (1, 'Bank'), (2, 'Weitere Bank');
      CREATE TABLE bank_import_batches (id INTEGER PRIMARY KEY, file_name TEXT, format TEXT,
        file_hash TEXT, payment_account_id INTEGER, imported_count INTEGER, duplicate_count INTEGER, error_count INTEGER);
      CREATE TABLE bank_transactions (id INTEGER PRIMARY KEY, batch_id INTEGER, payment_account_id INTEGER,
        booking_date TEXT, value_date TEXT, direction TEXT, amount REAL, currency TEXT, counterparty TEXT,
        counterparty_iban TEXT, purpose TEXT, end_to_end_id TEXT, bank_reference TEXT, raw_json TEXT,
        fingerprint TEXT NOT NULL UNIQUE, status TEXT DEFAULT 'OPEN');
    `)
    jest.mocked(withTransaction).mockImplementation((callback: any) => callback(db))
    jest.mocked(getDb).mockReturnValue(db)
  })
  afterEach(() => db.close())

  function importRow(overrides: Record<string, unknown> = {}, account = 1, force = false) {
    jest.mocked(parseBankStatement).mockReturnValue({
      format: 'CSV', rows: [{ sourceRow: 2, bookingDate: '2026-06-02', direction: 'IN', amount: 75,
        currency: 'EUR', purpose: 'Jolie Nwayotalu Freizeit St.Goar', counterparty: 'Jolie Nwayotalu',
        counterpartyIban: 'DE123', bankReference: 'BANK-123', endToEndId: 'E2E-123',
        raw: {}, errors: [], ...overrides }]
    } as any)
    return commitBankImport({ fileBase64: 'fixture', fileName: 'export.csv', paymentAccountId: account,
      ...(force ? { forceImportSourceRows: [2] } : {}) })
  }

  it('still detects an identical reimport', () => {
    expect(importRow().imported).toBe(1)
    expect(importRow()).toMatchObject({ imported: 0, duplicates: 1,
      duplicateRows: [expect.objectContaining({ duplicateBy: 'REFERENCE' })] })
  })

  it('compares End-to-End-ID when a later export lacks the preferred bank reference', () => {
    importRow()
    expect(importRow({ bankReference: null })).toMatchObject({ imported: 0, duplicates: 1,
      duplicateRows: [expect.objectContaining({ duplicateBy: 'REFERENCE' })] })
  })

  it.each([true, false])('detects reference-rich versus sparse exports in either order (%s)', (richFirst) => {
    const sparse = { bankReference: null, endToEndId: null, counterparty: null, counterpartyIban: null,
      purpose: 'Jolie Nwayotalu Freizeit St Goar' }
    importRow(richFirst ? {} : sparse)
    expect(importRow(richFirst ? sparse : {})).toMatchObject({ imported: 0, duplicates: 1,
      duplicateRows: [expect.objectContaining({ duplicateBy: 'POTENTIAL' })] })
  })

  it('allows an explicit import of a suspected duplicate', () => {
    importRow()
    expect(importRow({ bankReference: null, endToEndId: null }, 1, true)).toMatchObject({ imported: 1, duplicates: 0 })
    expect(db.prepare('SELECT COUNT(*) AS total FROM bank_transactions').get()).toEqual({ total: 2 })
  })

  it.each([
    { bookingDate: '2026-06-03' },
    { amount: 76 },
    { direction: 'OUT' },
    { currency: 'USD' },
    { bankReference: 'BANK-456', endToEndId: 'E2E-123' },
    { bankReference: 'BANK-456', endToEndId: 'E2E-456' }
  ])('does not suppress a different transaction: %j', (different) => {
    importRow()
    expect(importRow({ bankReference: null, endToEndId: null, ...different }).imported).toBe(1)
  })

  it('keeps accounts separate', () => {
    importRow()
    expect(importRow({}, 2).imported).toBe(1)
  })

  it('requires review for matching core data without purpose or references', () => {
    importRow({ purpose: null, bankReference: null, endToEndId: null })
    expect(importRow({ purpose: null, bankReference: null, endToEndId: null, counterparty: null })).toMatchObject({ imported: 0, duplicates: 1,
      duplicateRows: [expect.objectContaining({ duplicateBy: 'POTENTIAL' })] })
  })

  it.each([{ purpose: 'SEPA-UEBERWEISUNG' }, { counterparty: 'Andere Person' }, { counterpartyIban: 'DE456' }])('flags uncertain text changes for review: %j', (changed) => {
    importRow()
    expect(importRow({ bankReference: null, endToEndId: null, ...changed })).toMatchObject({ imported: 0, duplicates: 1,
      duplicateRows: [expect.objectContaining({ duplicateBy: 'POTENTIAL' })] })
  })

  it('compares stored original CSV fields independently of the selected purpose column', () => {
    const raw = { Buchungstag: '28.01.2026', Betrag: '-8,80', Buchungstext: 'SEPA-UEBERWEISUNG', Verwendungszweck: 'Porto und Versandkosten' }
    importRow({ raw, purpose: raw.Buchungstext, bankReference: null, endToEndId: null })
    expect(importRow({ raw: Object.fromEntries(Object.entries(raw).reverse()), purpose: raw.Verwendungszweck, bankReference: null, endToEndId: null })).toMatchObject({ imported: 0, duplicates: 1,
      duplicateRows: [expect.objectContaining({ duplicateBy: 'RAW' })] })
  })

  it('preserves identical occurrences, detects their reimport, and accepts only the extra occurrence', () => {
    importRow({ bankReference: null, endToEndId: null })
    const parsed = jest.mocked(parseBankStatement).mock.results.at(-1)!.value
    const threeRows = { ...parsed, rows: [2, 3, 4].map(sourceRow => ({ ...parsed.rows[0], sourceRow })) }
    jest.mocked(parseBankStatement).mockReturnValue(threeRows)
    const input = { fileBase64: 'fixture', fileName: 'export.csv', paymentAccountId: 1 }
    expect(commitBankImport(input)).toMatchObject({ imported: 2, duplicates: 1 })
    expect(commitBankImport(input)).toMatchObject({ imported: 0, duplicates: 3 })
    jest.mocked(parseBankStatement).mockReturnValue({ ...parsed, rows: [...threeRows.rows, { ...parsed.rows[0], sourceRow: 5 }] })
    expect(commitBankImport(input)).toMatchObject({ imported: 1, duplicates: 3 })
  })

  it('allows explicit additional imports even with the same unique fingerprint', () => {
    importRow()
    expect(importRow({}, 1, true)).toMatchObject({ imported: 1, duplicates: 0 })
  })

  it('shows duplicate review in the preview and repeats the check on commit', () => {
    importRow()
    const input = { fileBase64: 'fixture', fileName: 'export.csv', paymentAccountId: 1 }
    const parsed = jest.mocked(parseBankStatement).mock.results.at(-1)!.value
    jest.mocked(parseBankStatement).mockReturnValue({ ...parsed, headers: ['Buchungstext', 'Verwendungszweck'], suggestedMapping: { purpose: 'Verwendungszweck' }, accountIbans: [],
      rows: [{ ...parsed.rows[0], purpose: 'GUTSCHRIFT', bankReference: null, endToEndId: null }] })
    const preview = previewBankImport({ ...input, mapping: { purpose: 'Buchungstext' } })
    expect(preview.warnings).toHaveLength(1)
    expect(preview.duplicateRows).toEqual([expect.objectContaining({ duplicateBy: 'POTENTIAL' })])
    expect(commitBankImport(input)).toMatchObject({ imported: 0, duplicates: 1 })
    expect(commitBankImport({ ...input, additionalImportSourceRows: [2] })).toMatchObject({ imported: 1, duplicates: 0 })
  })

  it('reserves exact matches before assigning ambiguous date/amount candidates', () => {
    importRow({ bankReference: null, endToEndId: null })
    const parsed = jest.mocked(parseBankStatement).mock.results.at(-1)!.value
    jest.mocked(parseBankStatement).mockReturnValue({ ...parsed, rows: [{ ...parsed.rows[0], sourceRow: 2, purpose: 'Andere Zahlung' }, { ...parsed.rows[0], sourceRow: 3 }] })
    expect(commitBankImport({ fileBase64: 'fixture', fileName: 'export.csv', paymentAccountId: 1 })).toMatchObject({ imported: 1, duplicates: 1,
      duplicateRows: [expect.objectContaining({ sourceRow: 3, duplicateBy: 'FINGERPRINT' })] })
  })

  it.each([true, false])('recognizes a real CSV reimport after changing the purpose mapping (%s)', (genericFirst) => {
    const parser = jest.requireActual<typeof import('../../electron/main/services/bankStatementParser')>('../../electron/main/services/bankStatementParser')
    const input = { fileName: 'export.csv', paymentAccountId: 1,
      fileBase64: Buffer.from('Buchungstag;Betrag;Buchungstext;Verwendungszweck\n28.01.2026;-8,80;SEPA-UEBERWEISUNG;Porto und Versandkosten').toString('base64') }
    jest.mocked(parseBankStatement).mockImplementation(parser.parseBankStatement)
    const mapping = { purpose: genericFirst ? 'Buchungstext' : 'Verwendungszweck' }
    expect(commitBankImport({ ...input, mapping }).imported).toBe(1)
    const changed = { ...input, mapping: { purpose: genericFirst ? 'Verwendungszweck' : 'Buchungstext' } }
    expect(previewBankImport(changed).duplicateRows[0].duplicateBy).toBe('RAW')
    expect(commitBankImport(changed)).toMatchObject({ imported: 0, duplicates: 1 })
  })

  it('checks newly inserted transactions again after preview', () => {
    const parser = jest.requireActual<typeof import('../../electron/main/services/bankStatementParser')>('../../electron/main/services/bankStatementParser')
    jest.mocked(parseBankStatement).mockImplementation(parser.parseBankStatement)
    const input = { fileName: 'export.csv', paymentAccountId: 1,
      fileBase64: Buffer.from('Buchungstag;Betrag;Verwendungszweck\n28.01.2026;-8,80;Porto').toString('base64') }
    expect(previewBankImport(input).duplicateRows).toHaveLength(0)
    commitBankImport(input)
    expect(commitBankImport(input)).toMatchObject({ imported: 0, duplicates: 1 })
  })
})
