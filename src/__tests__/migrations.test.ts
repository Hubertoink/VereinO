import { ensureAdvanceTables, ensureBankImportTables, expandVoucherTypeConstraint } from '../../electron/main/db/migrations'

describe('expandVoucherTypeConstraint', () => {
  it('updates the vouchers table SQL to support INTERNAL voucher types', () => {
    const sql = "CREATE TABLE vouchers (id INTEGER PRIMARY KEY, type TEXT CHECK(type IN ('IN','OUT','TRANSFER')) NOT NULL);"

    const nextSql = expandVoucherTypeConstraint(sql)

    expect(nextSql).toContain("'INTERNAL'")
    expect(nextSql).toContain("CHECK(type IN ('IN','OUT','TRANSFER','INTERNAL'))")
  })
})

describe('ensureBankImportTables', () => {
  it('creates staged bank transactions with one-to-one voucher links', () => {
    const exec = jest.fn()

    ensureBankImportTables({ exec } as any)

    const sql = String(exec.mock.calls[0][0])
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS bank_import_batches')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS bank_transactions')
    expect(sql).toContain('voucher_id INTEGER UNIQUE REFERENCES vouchers(id) ON DELETE SET NULL')
    expect(sql).toContain('trg_bank_transactions_voucher_deleted')
    expect(sql).toContain('BEFORE DELETE ON vouchers')
  })
})

describe('ensureAdvanceTables', () => {
  it('adds payment_account_id support for Vorschuss-Buchungen', () => {
    const exec = jest.fn()
    const prepare = jest.fn(() => ({ all: () => [] }))

    ensureAdvanceTables({ exec, prepare } as any)

    const sql = exec.mock.calls.map((call) => String(call[0])).join('\n')
    expect(sql).toContain('payment_account_id INTEGER REFERENCES payment_accounts(id)')
    expect(sql).toContain('idx_member_advance_purchases_payment_account')
  })
})
