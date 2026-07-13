import {
  ensureAdvanceTables,
  ensureAiTables,
  ensureBankImportTables,
  ensureJournalPerformanceIndexes,
  expandVoucherTypeConstraint
} from '../../electron/main/db/migrations'

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

describe('ensureAiTables', () => {
  it('creates KI job, file and result tables for review-first processing', () => {
    const exec = jest.fn()

    ensureAiTables({ exec } as any)

    const sql = String(exec.mock.calls[0][0])
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS ai_jobs')
    expect(sql).toContain("CHECK(status IN ('DRAFT', 'QUEUED', 'PROCESSING', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'FAILED'))")
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS ai_job_files')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS ai_job_results')
    expect(sql).toContain('voucher_id INTEGER REFERENCES vouchers(id) ON DELETE SET NULL')
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

describe('ensureJournalPerformanceIndexes', () => {
  it('indexes Journal ordering, common filters and attachment lookups', () => {
    const exec = jest.fn()

    ensureJournalPerformanceIndexes({ exec } as any)

    const sql = String(exec.mock.calls[0][0])
    expect(sql).toContain('idx_vouchers_date_id')
    expect(sql).toContain('ON vouchers(date, id)')
    expect(sql).toContain('idx_vouchers_type_date_id')
    expect(sql).toContain('idx_vouchers_payment_account_date_id')
    expect(sql).toContain('idx_vouchers_earmark_date_id')
    expect(sql).toContain('idx_voucher_files_voucher')
    expect(sql).toContain('idx_invoice_files_invoice')
  })
})
