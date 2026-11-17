import type Database from 'better-sqlite3'
import fs from 'node:fs'

const SqliteDatabase: new (path: string) => Database.Database = (() => {
  try { return require('node:sqlite').DatabaseSync }
  catch { return require('better-sqlite3') }
})()

jest.mock('../../electron/main/db/database', () => ({
  getDb: jest.fn(), withTransaction: jest.fn(), getAppDataDir: jest.fn()
}))
jest.mock('../../electron/main/repositories/vouchers', () => ({ createVoucher: jest.fn() }))
jest.mock('../../electron/main/repositories/classifications', () => ({ resolvePrimaryClassificationValueId: jest.fn() }))
jest.mock('../../electron/main/repositories/paymentAccounts', () => ({
  getPaymentAccountById: jest.fn(() => ({ id: 7, name: 'Bank', kind: 'BANK' })),
  paymentMethodForAccountKind: (kind?: string) => kind === 'CASH' ? 'BAR' : kind ? 'BANK' : null
}))

import { getAppDataDir, getDb, withTransaction } from '../../electron/main/db/database'
import { createVoucher } from '../../electron/main/repositories/vouchers'
import { addPayment, listInvoicesPaged, markPaid, postInvoiceToVoucher } from '../../electron/main/repositories/invoices'

describe('invoice repository pagination and posting', () => {
  let db: Database.Database

  beforeEach(() => {
    jest.clearAllMocks()
    db = new SqliteDatabase(':memory:')
    db.exec(`
      CREATE TABLE invoices (
        id INTEGER PRIMARY KEY, date TEXT, due_date TEXT, invoice_no TEXT,
        party TEXT DEFAULT 'Test GmbH', party_id INTEGER DEFAULT 9, description TEXT, note TEXT,
        gross_amount REAL DEFAULT 100, payment_method TEXT DEFAULT 'BANK',
        payment_account_id INTEGER DEFAULT 7, sphere TEXT DEFAULT 'IDEELL',
        primary_classification_value_id INTEGER, earmark_id INTEGER, budget_id INTEGER,
        auto_post INTEGER DEFAULT 1, voucher_type TEXT DEFAULT 'OUT', posted_voucher_id INTEGER
      );
      CREATE TABLE invoice_payments (id INTEGER PRIMARY KEY, invoice_id INTEGER, date TEXT, amount REAL);
      CREATE TABLE invoice_files (id INTEGER PRIMARY KEY, invoice_id INTEGER, file_name TEXT,
        file_path TEXT, mime_type TEXT, size INTEGER, created_at TEXT);
      CREATE TABLE voucher_files (id INTEGER PRIMARY KEY, voucher_id INTEGER, file_name TEXT,
        file_path TEXT, mime_type TEXT, size INTEGER);
      CREATE TABLE invoice_tags (invoice_id INTEGER, tag_id INTEGER);
      CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE invoice_budgets (id INTEGER PRIMARY KEY, invoice_id INTEGER, budget_id INTEGER, amount REAL);
      CREATE TABLE invoice_earmarks (id INTEGER PRIMARY KEY, invoice_id INTEGER, earmark_id INTEGER, amount REAL);
      CREATE TABLE classification_values (id INTEGER PRIMARY KEY, name TEXT, color TEXT, icon TEXT);
      CREATE TABLE vouchers (id INTEGER PRIMARY KEY, voucher_no TEXT);
    `)
    jest.mocked(getDb).mockReturnValue(db)
    jest.mocked(getAppDataDir).mockReturnValue({ filesDir: 'test-files' } as ReturnType<typeof getAppDataDir>)
    jest.mocked(withTransaction).mockImplementation((callback: any) => {
      db.exec('BEGIN')
      try {
        const result = callback(db)
        db.exec('COMMIT')
        return result
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    })
    jest.mocked(createVoucher).mockReturnValue({ id: 101 } as ReturnType<typeof createVoucher>)
  })

  afterEach(() => {
    db.close()
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  function invoice(id: number, paid = 0, gross = 100) {
    const date = `2026-01-${String(id).padStart(2, '0')}`
    db.prepare('INSERT INTO invoices(id, date, due_date, gross_amount) VALUES (?, ?, ?, ?)').run(id, date, date, gross)
    if (paid) db.prepare('INSERT INTO invoice_payments(invoice_id, date, amount) VALUES (?, ?, ?)').run(id, date, paid)
  }

  it('fills OPEN pages from matching invoices before applying limit and offset', () => {
    invoice(1, 100)
    invoice(2)
    invoice(3, 25)
    invoice(4)
    const first = listInvoicesPaged({ status: 'OPEN', limit: 1, offset: 0 })
    const second = listInvoicesPaged({ status: 'OPEN', limit: 1, offset: 1 })
    expect(first.rows.map(row => row.id)).toEqual([2])
    expect(second.rows.map(row => row.id)).toEqual([4])
    expect(first.total).toBe(2)
    expect(second.total).toBe(2)
    expect(listInvoicesPaged({ status: 'OPEN', limit: 1, offset: 2 })).toEqual({ rows: [], total: 2 })
  })

  it.each([
    ['OPEN', [2, 6]],
    ['PARTIAL', [3]],
    ['PAID', [1, 4, 5]],
    ['ALL', [1, 2, 3, 4, 5, 6]]
  ] as const)('keeps %s status filtering consistent with zero payments and payment tolerance', (status, ids) => {
    invoice(1, 100)
    invoice(2)
    invoice(3, 99.999998)
    invoice(4, 99.9999995)
    invoice(5, 101)
    invoice(6, 0, 0)
    const result = listInvoicesPaged({ status, sortBy: 'date', sort: 'ASC' })
    expect(result.rows.map(row => row.id)).toEqual(ids)
    expect(result.total).toBe(ids.length)
    if (status !== 'ALL') expect(result.rows.every(row => row.status === status)).toBe(true)
  })

  it('combines status, tag, budget, sphere and due-date filters consistently for page and total', () => {
    invoice(1, 100)
    invoice(2)
    invoice(3)
    invoice(4)
    db.exec(`UPDATE invoices SET budget_id=8 WHERE id IN (1,2,3,4);
      UPDATE invoices SET sphere='WGB' WHERE id=3;
      INSERT INTO tags VALUES (1, 'Ausflug');
      INSERT INTO invoice_tags VALUES (1,1),(2,1),(3,1),(4,1);`)
    const result = listInvoicesPaged({ status: 'OPEN', tag: 'Ausflug', budgetId: 8,
      sphere: 'IDEELL', dueTo: '2026-01-03', limit: 1 })
    expect(result.total).toBe(1)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({ id: 2, paidSum: 0, status: 'OPEN', tags: ['Ausflug'] })
    expect(listInvoicesPaged({ status: 'PAID', unpaidOnly: true }).rows).toEqual([])
  })

  it.each(['payment', 'markPaid', 'manual'] as const)('preserves assignments, attachments and booking date for %s posting', (mode) => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-17T12:00:00Z'))
    invoice(1, mode === 'manual' ? 100 : 40)
    db.exec(`UPDATE invoices SET invoice_no='R-42', note='Notiz' WHERE id=1;
      INSERT INTO tags VALUES (1,'Ausflug'); INSERT INTO invoice_tags VALUES (1,1);
      INSERT INTO invoice_budgets VALUES (1,1,5,60),(2,1,6,40);
      INSERT INTO invoice_earmarks VALUES (1,1,3,100);
      INSERT INTO invoice_files VALUES (1,1,'beleg.pdf','source.pdf','application/pdf',42,'2026-01-01');`)
    jest.spyOn(fs, 'existsSync').mockReturnValue(true)
    const copy = jest.spyOn(fs, 'copyFileSync').mockImplementation(() => {})

    const result = mode === 'payment'
      ? addPayment({ invoiceId: 1, date: '2026-11-03', amount: 60 })
      : mode === 'markPaid' ? markPaid(1) : postInvoiceToVoucher(1)

    expect(result.voucherId).toBe(101)
    expect(createVoucher).toHaveBeenCalledTimes(1)
    expect(createVoucher).toHaveBeenCalledWith(expect.objectContaining({
      date: mode === 'payment' ? '2026-11-03' : '2026-11-17', grossAmount: 100,
      description: 'Zahlung zu Rechnung R-42', paymentAccountId: 7, paymentMethod: 'BANK',
      partyId: 9, counterparty: 'Test GmbH', tags: ['Ausflug'],
      budgets: [{ budgetId: 5, amount: 60 }, { budgetId: 6, amount: 40 }],
      earmarks: [{ earmarkId: 3, amount: 100 }]
    }))
    expect(db.prepare('SELECT posted_voucher_id FROM invoices WHERE id=1').get()).toMatchObject({ posted_voucher_id: 101 })
    expect(copy).toHaveBeenCalledTimes(1)
    expect(db.prepare('SELECT voucher_id, file_name, size FROM voucher_files').all()).toEqual([
      expect.objectContaining({ voucher_id: 101, file_name: 'beleg.pdf', size: 42 })
    ])
    expect(db.prepare('SELECT SUM(amount) AS paid FROM invoice_payments WHERE invoice_id=1').get()).toMatchObject({ paid: 100 })
  })

  it('does not post partial payments or invoices with automatic posting disabled', () => {
    invoice(1)
    expect(addPayment({ invoiceId: 1, date: '2026-02-01', amount: 30 })).toMatchObject({ status: 'PARTIAL', voucherId: null })
    db.exec('UPDATE invoices SET auto_post=0 WHERE id=1')
    expect(markPaid(1)).toMatchObject({ status: 'PAID', voucherId: null })
    expect(createVoucher).not.toHaveBeenCalled()
    expect(postInvoiceToVoucher(1)).toMatchObject({ voucherId: 101 })
  })

  it('preserves posting guards and does not create a second voucher', () => {
    invoice(1, 99.9999995)
    // The existing manual-post guard is deliberately stricter than the display status.
    expect(() => postInvoiceToVoucher(1)).toThrow('noch nicht vollständig bezahlt')
    db.exec('UPDATE invoices SET posted_voucher_id=88 WHERE id=1')
    expect(markPaid(1)).toMatchObject({ voucherId: 88 })
    expect(() => postInvoiceToVoucher(1)).toThrow('bereits als Buchung')
    expect(createVoucher).not.toHaveBeenCalled()
  })

  it('rolls back the payment when automatic voucher creation fails', () => {
    invoice(1)
    jest.mocked(createVoucher).mockImplementationOnce(() => { throw new Error('Periode geschlossen') })
    expect(() => addPayment({ invoiceId: 1, date: '2026-02-01', amount: 100 })).toThrow('Periode geschlossen')
    expect(db.prepare('SELECT COUNT(*) AS count FROM invoice_payments').get()).toMatchObject({ count: 0 })
    expect(db.prepare('SELECT posted_voucher_id FROM invoices WHERE id=1').get()).toMatchObject({ posted_voucher_id: null })
  })
})
