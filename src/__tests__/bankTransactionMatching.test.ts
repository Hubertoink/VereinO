// Use SQLite's real query engine without rebuilding the Electron native addon.
import type Database from 'better-sqlite3'
// Prefer the built-in engine on recent Node; older test runtimes use the native dependency.
const SqliteDatabase: new (path: string) => Database.Database = (() => {
  try { return require('node:sqlite').DatabaseSync }
  catch { return require('better-sqlite3') }
})()

jest.mock('../../electron/main/db/database', () => ({ getDb: jest.fn() }))
jest.mock('../../electron/main/repositories/recurringOccurrences', () => ({ materializeDueOccurrences: jest.fn() }))
jest.mock('../../electron/main/services/audit', () => ({ writeAudit: jest.fn() }))

import { getDb } from '../../electron/main/db/database'
import { findBankTransactionMatches } from '../../electron/main/repositories/bankTransactions'

describe('bank transaction matching with real SQLite queries', () => {
  let db: Database.Database
  let transaction: Record<string, any>

  beforeEach(() => {
    db = new SqliteDatabase(':memory:')
    db.exec(`
      CREATE TABLE vouchers (id INTEGER PRIMARY KEY, voucher_no TEXT, date TEXT, type TEXT,
        description TEXT, note TEXT, gross_amount REAL, payment_account_id INTEGER, reversed_by_id INTEGER);
      CREATE TABLE payment_accounts (id INTEGER PRIMARY KEY, name TEXT, color TEXT);
      CREATE TABLE bank_transactions (id INTEGER PRIMARY KEY, voucher_id INTEGER);
      CREATE TABLE recurring_occurrences (id INTEGER PRIMARY KEY, voucher_id INTEGER, status TEXT,
        recurring_booking_id INTEGER, scheduled_date TEXT);
      CREATE TABLE recurring_bookings (id INTEGER PRIMARY KEY, name TEXT, type TEXT, description TEXT,
        note TEXT, counterparty TEXT, amount_mode TEXT, amount REAL, variable_amount INTEGER,
        vat_rate REAL, payment_account_id INTEGER, status TEXT, next_due_date TEXT);
      INSERT INTO payment_accounts VALUES (1, 'Bank', NULL), (2, 'Kasse', NULL);
    `)
    transaction = { id: 57, bookingDate: '2026-07-13', valueDate: null, direction: 'OUT',
      amount: 3998.4, paymentAccountId: 1, paymentAccountName: 'Bank', purpose: 'Belegnr 2496676' }
    jest.mocked(getDb).mockReturnValue({
      prepare: (sql: string) => sql.includes('FROM bank_transactions bt')
        ? { get: () => transaction }
        : db.prepare(sql)
    } as any)
  })

  afterEach(() => db.close())

  function voucher(id: number, date = '2026-07-13', account = 1, amount = 3998.4, type = 'OUT') {
    db.prepare(`INSERT INTO vouchers (id, voucher_no, date, payment_account_id, gross_amount, type, description)
      VALUES (?, ?, ?, ?, ?, ?, 'ARLT GKV BTO Individual-PC')`).run(id, `2026-${id}`, date, account, amount, type)
  }

  it('rates identical date, gross amount and account highly even with unrelated bank text', () => {
    voucher(54)
    expect(findBankTransactionMatches({ id: 57 })[0]).toMatchObject({ id: 54, score: 80, amountMatches: true })
  })

  it('recognizes the two-day posting delay from the reported example', () => {
    voucher(54, '2026-07-11')
    expect(findBankTransactionMatches({ id: 57 })[0]).toMatchObject({ id: 54, score: 66, dateDistance: 2 })
  })

  it('searches and scores by value date even outside the posting-date window', () => {
    transaction.valueDate = '2026-06-20'
    voucher(54, '2026-06-20')
    expect(findBankTransactionMatches({ id: 57 })[0]).toMatchObject({
      id: 54, score: 80, dateDistance: 0, matchedDateSource: 'VALUE_DATE'
    })
  })

  it('retains same-date matches with a different account and an explicit warning', () => {
    voucher(54, '2026-07-13', 2)
    expect(findBankTransactionMatches({ id: 57 })[0]).toMatchObject({
      id: 54, score: 40, paymentAccountMismatch: true, paymentAccountWarning: expect.stringContaining('Kasse')
    })
  })

  it('prioritizes the correct account before applying the 100-candidate limit', () => {
    voucher(1)
    for (let id = 2; id <= 105; id++) voucher(id, '2026-07-13', 2)
    expect(findBankTransactionMatches({ id: 57 })[0].id).toBe(1)
  })

  it('excludes reversed, already linked, wrong-direction and wrong-amount vouchers', () => {
    voucher(1)
    voucher(2)
    voucher(3, undefined, 1, 3998.4, 'IN')
    voucher(4, undefined, 1, 3998.41)
    db.exec('UPDATE vouchers SET reversed_by_id = 99 WHERE id = 1; INSERT INTO bank_transactions VALUES (99, 2);')
    expect(findBankTransactionMatches({ id: 57 })).toEqual([])
  })

  it('provides distant weak candidates to AI without relaxing amount or type constraints', () => {
    voucher(1, '2026-06-20', 2)
    voucher(2, '2026-06-20', 1, 123)
    voucher(3, '2026-06-20', 1, 3998.4, 'IN')
    expect(findBankTransactionMatches({ id: 57 })).toEqual([])
    expect(findBankTransactionMatches({ id: 57, forAiReview: true })).toEqual([
      expect.objectContaining({ id: 1, score: 0 })
    ])
  })

  it('keeps manual matching available for mismatched amounts and directions', () => {
    voucher(1, undefined, 1, 123, 'IN')
    expect(findBankTransactionMatches({ id: 57, manual: true })[0]).toMatchObject({ id: 1, amountMatches: false })
  })

  it('finds due recurring candidates by value date', () => {
    transaction.valueDate = '2026-06-20'
    db.exec(`INSERT INTO recurring_bookings (id, name, type, amount_mode, amount, vat_rate, payment_account_id)
      VALUES (7, 'PC Rate', 'OUT', 'GROSS', 3998.4, 0, 1);
      INSERT INTO recurring_occurrences (id, status, recurring_booking_id, scheduled_date)
      VALUES (71, 'DUE', 7, '2026-06-20');`)
    expect(findBankTransactionMatches({ id: 57 })[0]).toMatchObject({
      matchKind: 'RECURRING', occurrenceId: 71, matchedDateSource: 'VALUE_DATE', dateDistance: 0
    })
  })
})
