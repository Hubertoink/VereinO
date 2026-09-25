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

import { withTransaction } from '../../electron/main/db/database'
import { parseBankStatement } from '../../electron/main/services/bankStatementParser'
import { commitBankImport } from '../../electron/main/repositories/bankTransactions'

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
        fingerprint TEXT, status TEXT DEFAULT 'OPEN');
    `)
    jest.mocked(withTransaction).mockImplementation((callback: any) => callback(db))
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
    { purpose: 'Andere Freizeit' },
    { counterparty: 'Andere Person' },
    { counterpartyIban: 'DE456' },
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

  it('does not flag amount/date alone without purpose or references', () => {
    importRow({ purpose: null, bankReference: null, endToEndId: null })
    expect(importRow({ purpose: null, bankReference: null, endToEndId: null, counterparty: null }).imported).toBe(1)
  })
})
