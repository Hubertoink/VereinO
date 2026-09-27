import type Database from 'better-sqlite3'
const SqliteDatabase: new (path: string) => Database.Database = (() => {
  try { return require('node:sqlite').DatabaseSync }
  catch { return require('better-sqlite3') }
})()

jest.mock('../../electron/main/db/database', () => ({ getDb: jest.fn(), withTransaction: jest.fn() }))
jest.mock('../../electron/main/services/audit', () => ({ writeAudit: jest.fn() }))

import { getDb, withTransaction } from '../../electron/main/db/database'
import { applyBankImportRemap, previewBankImportRemap } from '../../electron/main/repositories/bankImportRemap'

describe('remapping stored CSV import columns', () => {
  let db: Database.Database
  beforeEach(() => {
    db = new SqliteDatabase(':memory:')
    db.exec(`CREATE TABLE payment_accounts (id INTEGER PRIMARY KEY, name TEXT);
      INSERT INTO payment_accounts VALUES (1, 'Bank');
      CREATE TABLE bank_import_batches (id INTEGER PRIMARY KEY, file_name TEXT, format TEXT, payment_account_id INTEGER);
      INSERT INTO bank_import_batches VALUES (1, 'umsatz.csv', 'CSV', 1);
      CREATE TABLE bank_transactions (id INTEGER PRIMARY KEY, batch_id INTEGER, booking_date TEXT, direction TEXT,
        amount REAL, counterparty TEXT, counterparty_iban TEXT, purpose TEXT, bank_reference TEXT, end_to_end_id TEXT, raw_json TEXT,
        updated_at TEXT DEFAULT (datetime('now')));
      CREATE TABLE bank_transaction_ai_suggestions (transaction_id INTEGER PRIMARY KEY);
      INSERT INTO bank_transaction_ai_suggestions VALUES (1), (2);`)
    const insert = db.prepare(`INSERT INTO bank_transactions
      (id, batch_id, booking_date, direction, amount, counterparty, counterparty_iban, purpose, bank_reference, end_to_end_id, raw_json)
      VALUES (?, 1, ?, ?, ?, ?, NULL, ?, NULL, NULL, ?)`)
    insert.run(1, '2026-09-24', 'OUT', 75.4, null, 'Fahrkarten', JSON.stringify({ 'Name Zahlungsbeteiligter': 'Merle Beckord', Verwendungszweck: 'Fahrkarten' }))
    insert.run(2, '2026-09-23', 'OUT', 4.9, 'Korrigierter Name', 'Abschluss', JSON.stringify({ 'Name Zahlungsbeteiligter': '', Verwendungszweck: 'Abschluss' }))
    jest.mocked(getDb).mockReturnValue(db)
    jest.mocked(withTransaction).mockImplementation((callback: any) => callback(db))
  })
  afterEach(() => db.close())

  it('previews and updates only selected metadata on the existing bank records', () => {
    const preview = previewBankImportRemap({ batchId: 1 })
    expect(preview).toMatchObject({ totalRows: 2, changeCount: 1, mapping: { counterparty: 'Name Zahlungsbeteiligter' } })
    expect(preview.rows[0]).toMatchObject({ id: 1, current: { counterparty: null }, proposed: { counterparty: 'Merle Beckord' } })
    expect(applyBankImportRemap({ batchId: 1, mapping: { counterparty: 'Name Zahlungsbeteiligter' } })).toEqual({ updated: 1, totalRows: 2 })
    expect(db.prepare('SELECT id, booking_date as bookingDate, amount, counterparty, purpose FROM bank_transactions ORDER BY id').all()).toEqual([
      { id: 1, bookingDate: '2026-09-24', amount: 75.4, counterparty: 'Merle Beckord', purpose: 'Fahrkarten' },
      { id: 2, bookingDate: '2026-09-23', amount: 4.9, counterparty: 'Korrigierter Name', purpose: 'Abschluss' }
    ])
    expect(previewBankImportRemap({ batchId: 1 }).changeCount).toBe(0)
    expect(db.prepare('SELECT transaction_id FROM bank_transaction_ai_suggestions').all()).toEqual([{ transaction_id: 2 }])
  })

  it('rejects a source column that does not belong to the import', () => {
    expect(() => applyBankImportRemap({ batchId: 1, mapping: { counterparty: 'Falsche Spalte' } })).toThrow('nicht vorhanden')
  })
})
