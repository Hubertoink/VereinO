import {
  ensureAdvanceTables,
  ensureAiTables,
  ensureBankImportTables,
  backfillBankCounterparties,
  ensureOrganizationClassificationTables,
  ensureJournalPerformanceIndexes,
  ensurePartyTables,
  expandVoucherTypeConstraint
} from '../../electron/main/db/migrations'

const SqliteDatabase: new (path: string) => any = (() => {
  try { return require('node:sqlite').DatabaseSync }
  catch { return require('better-sqlite3') }
})()

describe('backfillBankCounterparties', () => {
  it('restores only missing CSV counterparty names from saved source rows', () => {
    const db = new SqliteDatabase(':memory:')
    try {
      db.exec(`CREATE TABLE bank_import_batches (id INTEGER PRIMARY KEY, format TEXT);
        CREATE TABLE bank_transactions (id INTEGER PRIMARY KEY, batch_id INTEGER, counterparty TEXT, raw_json TEXT);
        INSERT INTO bank_import_batches VALUES (1, 'CSV'), (2, 'CAMT');`)
      const insert = db.prepare('INSERT INTO bank_transactions VALUES (?, ?, ?, ?)')
      insert.run(1, 1, null, JSON.stringify({ 'Name Zahlungsbeteiligter': '  Merle  Beckord ' }))
      insert.run(2, 1, 'Bereits korrigiert', JSON.stringify({ 'Name Zahlungsbeteiligter': 'Anderer Name' }))
      insert.run(3, 2, null, JSON.stringify({ 'Name Zahlungsbeteiligter': 'CAMT Name' }))
      insert.run(4, 1, null, '{ungültig')
      backfillBankCounterparties(db)
      backfillBankCounterparties(db)
      expect(db.prepare('SELECT id, counterparty FROM bank_transactions ORDER BY id').all()).toEqual([
        { id: 1, counterparty: 'Merle Beckord' }, { id: 2, counterparty: 'Bereits korrigiert' },
        { id: 3, counterparty: null }, { id: 4, counterparty: null }
      ])
    } finally { db.close() }
  })
})

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
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS bank_transaction_ai_suggestions')
    expect(sql).toContain("CHECK(action IN ('LINK_EXISTING', 'APPLY_RECURRING', 'CREATE_BOOKING', 'MARK_CHECKED', 'NEEDS_MANUAL_REVIEW'))")
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

describe('ensurePartyTables', () => {
  it('creates central partners and adds nullable links to existing business records', () => {
    const exec = jest.fn()
    const prepare = jest.fn((sql: string) => {
      if (sql.includes('sqlite_master')) return { get: () => ({ exists: 1 }) }
      if (sql.includes('PRAGMA table_info')) return { all: () => [] }
      throw new Error(`Unexpected SQL: ${sql}`)
    })

    ensurePartyTables({ exec, prepare } as any)

    const sql = exec.mock.calls.map((call) => String(call[0])).join('\n')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS parties')
    expect(sql).toContain("CHECK(role IN ('SUPPLIER','CUSTOMER','BOTH','OTHER'))")
    expect(sql).toContain('payment_term_days INTEGER')
    expect(sql).toContain('ALTER TABLE vouchers ADD COLUMN party_id INTEGER REFERENCES parties(id) ON DELETE SET NULL')
    expect(sql).toContain('ALTER TABLE invoices ADD COLUMN party_id INTEGER REFERENCES parties(id) ON DELETE SET NULL')
    expect(sql).toContain('ALTER TABLE submissions ADD COLUMN party_id INTEGER REFERENCES parties(id) ON DELETE SET NULL')
  })
})

describe('ensureOrganizationClassificationTables', () => {
  it('creates profiles and maps legacy spheres without altering the legacy column', () => {
    const exec = jest.fn()
    const run = jest.fn()
    const prepare = jest.fn((sql: string) => ({
      run,
      all: () => [],
      get: () => {
        if (sql.includes('FROM sqlite_master')) return { existsFlag: 1 }
        if (sql.includes('SELECT id FROM classification_schemes')) return { id: 1 }
        return undefined
      }
    }))

    ensureOrganizationClassificationTables({ exec, prepare } as any)

    const sql = exec.mock.calls.map((call) => String(call[0])).join('\n')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS organization_profile')
    expect(sql).toContain("CHECK(profile IN ('NONPROFIT', 'GENERAL'))")
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS classification_schemes')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS classification_values')
    expect(sql).toContain('ALTER TABLE vouchers ADD COLUMN primary_classification_value_id INTEGER')
    expect(sql).toContain('UPDATE vouchers')
    expect(sql).toContain('cv.stable_key = vouchers.sphere')
    expect(sql).not.toContain('ALTER TABLE vouchers DROP COLUMN sphere')
    expect(sql).not.toContain('UPDATE vouchers SET sphere')
    expect(run).toHaveBeenCalledWith('nonprofit-spheres')
  })
})
