import type Database from 'better-sqlite3'
const SqliteDatabase: new (path: string) => Database.Database = (() => {
  try { return require('node:sqlite').DatabaseSync }
  catch { return require('better-sqlite3') }
})()

jest.mock('../../electron/main/db/database', () => ({ getDb: jest.fn(), withTransaction: jest.fn() }))
jest.mock('../../electron/main/repositories/paymentAccounts', () => ({ getPaymentAccountById: jest.fn() }))
jest.mock('../../electron/main/services/bankStatementParser', () => ({ parseBankStatement: jest.fn() }))
jest.mock('../../electron/main/services/audit', () => ({ writeAudit: jest.fn() }))
jest.mock('../../electron/main/repositories/recurringOccurrences', () => ({ materializeDueOccurrences: jest.fn() }))

import { getDb } from '../../electron/main/db/database'
import { getBankImportStatus, listBankImportHistory, listBankTransactions } from '../../electron/main/repositories/bankTransactions'
import { BankImportHistoryOutput, BankImportStatusOutput } from '../../electron/main/ipc/schemas'

describe('account-specific bank import history', () => {
  let db: Database.Database
  beforeEach(() => {
    db = new SqliteDatabase(':memory:')
    db.exec(`
      CREATE TABLE payment_accounts (id INTEGER PRIMARY KEY, name TEXT, color TEXT,
        is_active INTEGER DEFAULT 1, kind TEXT DEFAULT 'BANK', sort_order INTEGER DEFAULT 0);
      INSERT INTO payment_accounts (id, name) VALUES (1, 'Bank'), (2, 'Weitere Bank'), (3, 'Neues Konto');
      CREATE TABLE bank_import_batches (id INTEGER PRIMARY KEY, file_name TEXT, format TEXT DEFAULT 'CSV',
        payment_account_id INTEGER, imported_count INTEGER, duplicate_count INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0, created_at TEXT);
      CREATE TABLE bank_transactions (id INTEGER PRIMARY KEY, batch_id INTEGER,
        payment_account_id INTEGER, booking_date TEXT, status TEXT DEFAULT 'OPEN',
        counterparty TEXT, purpose TEXT, bank_reference TEXT, end_to_end_id TEXT);
    `)
    jest.mocked(getDb).mockReturnValue(db)
  })
  afterEach(() => db.close())

  function addBatch(id: number, account: number, count: number, createdAt: string) {
    db.prepare(`INSERT INTO bank_import_batches (id, file_name, payment_account_id, imported_count, created_at)
      VALUES (?, ?, ?, ?, ?)`).run(id, `export-${id}.csv`, account, count, createdAt)
  }

  it('finds the latest account import even outside the eight global recent imports', () => {
    addBatch(1, 1, 34, '2026-09-02 12:30:00')
    db.exec("INSERT INTO bank_transactions (id, batch_id, payment_account_id, booking_date) VALUES (1, 1, 1, '2026-09-01')")
    for (let id = 2; id <= 10; id++) addBatch(id, 2, 7, '2026-09-20 12:30:00')
    const status = BankImportStatusOutput.parse(getBankImportStatus())
    expect(status.recentImports).toHaveLength(8)
    expect(status.recentImports.every(batch => batch.paymentAccountId === 2)).toBe(true)
    expect(status.accounts.find(account => account.id === 1)).toMatchObject({
      lastImportAt: '2026-09-02 12:30:00', lastImportImportedCount: 34,
      lastImportFileName: 'export-1.csv', lastBookingDate: '2026-09-01', total: 1
    })
  })

  it('keeps the newest booking date after an older export and a zero-row import', () => {
    addBatch(1, 1, 1, '2026-09-02 12:30:00')
    addBatch(2, 1, 1, '2026-09-03 12:30:00')
    db.exec(`INSERT INTO bank_transactions (id, batch_id, payment_account_id, booking_date) VALUES
      (1, 1, 1, '2026-09-01'), (2, 2, 1, '2026-08-01')`)
    expect(getBankImportStatus().accounts[0]).toMatchObject({
      lastImportFileName: 'export-2.csv', lastBookingDate: '2026-09-01', lastImportImportedCount: 1
    })
    // A zero-row duplicate check must not replace the latest successful import.
    addBatch(3, 1, 0, '2026-09-03 12:30:00')
    expect(getBankImportStatus().accounts[0]).toMatchObject({
      lastImportAt: '2026-09-03 12:30:00', lastImportFileName: 'export-2.csv',
      lastBookingDate: '2026-09-01', lastImportImportedCount: 1, total: 2
    })
    // If successful imports share a timestamp, the newest batch id wins.
    addBatch(4, 1, 3, '2026-09-03 12:30:00')
    expect(getBankImportStatus().accounts[0]).toMatchObject({
      lastImportFileName: 'export-4.csv', lastImportImportedCount: 3
    })
  })

  it('shows no successful import when an account has only duplicate checks', () => {
    addBatch(1, 1, 0, '2026-09-25 22:18:00')
    expect(getBankImportStatus().accounts.find(account => account.id === 1)).toMatchObject({
      lastImportAt: null, lastImportImportedCount: null, lastImportFileName: null,
      lastBookingDate: null, total: 0
    })
    expect(listBankImportHistory({ paymentAccountId: 1, page: 1, limit: 10 }).rows).toHaveLength(1)
  })

  it('returns an empty history for an account without imports', () => {
    addBatch(1, 2, 4, '2026-09-02 12:30:00')
    db.exec('UPDATE payment_accounts SET is_active = 0 WHERE id = 2')
    expect(getBankImportStatus().accounts.find(account => account.id === 2)?.lastImportImportedCount).toBe(4)
    expect(getBankImportStatus().accounts.find(account => account.id === 3)).toMatchObject({
      lastImportAt: null, lastImportImportedCount: null, lastImportFileName: null,
      lastBookingDate: null, total: 0
    })
  })

  it('pages through all imports for the selected account, including older ones', () => {
    for (let id = 1; id <= 13; id++) addBatch(id, id === 13 ? 2 : 1, id, `2026-09-${String(id).padStart(2, '0')} 12:00:00`)
    const first = BankImportHistoryOutput.parse(listBankImportHistory({ paymentAccountId: 1, page: 1, limit: 10 }))
    const second = BankImportHistoryOutput.parse(listBankImportHistory({ paymentAccountId: 1, page: 2, limit: 10 }))
    expect(first).toMatchObject({ total: 12, page: 1, limit: 10 })
    expect(first.rows.map(row => row.id)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3])
    expect(second.rows.map(row => row.id)).toEqual([2, 1])
    expect(first.rows.some(row => row.paymentAccountId === 2)).toBe(false)
  })

  it('scopes status counts and results to account, date, search and import batch', () => {
    addBatch(1, 1, 2, '2026-09-01 12:00:00')
    addBatch(2, 1, 1, '2026-09-02 12:00:00')
    addBatch(3, 2, 1, '2026-09-03 12:00:00')
    db.exec(`INSERT INTO bank_transactions (id, batch_id, payment_account_id, booking_date, status, purpose) VALUES
      (1, 1, 1, '2026-09-01', 'OPEN', 'Beitrag'),
      (2, 1, 1, '2026-09-02', 'LINKED', 'Beitrag'),
      (3, 2, 1, '2026-08-01', 'OPEN', 'Spende'),
      (4, 3, 2, '2026-09-01', 'OPEN', 'Beitrag')`)
    const realDb = db
    jest.mocked(getDb).mockReturnValue({
      prepare: (sql: string) => sql.includes('LEFT JOIN bank_transaction_ai_suggestions')
        ? { all: () => [] }
        : realDb.prepare(sql)
    } as any)
    expect(listBankTransactions({ paymentAccountId: 1, batchId: 1, from: '2026-09-01',
      to: '2026-09-30', q: 'Beitrag', status: 'OPEN' })).toMatchObject({
      total: 1, stats: { total: 2, open: 1, linked: 1, checked: 0 }
    })
    expect(listBankTransactions({ paymentAccountId: 2 })).toMatchObject({
      total: 1, stats: { total: 1, open: 1, linked: 0, checked: 0 }
    })
  })
})
