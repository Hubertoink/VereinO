import ExcelJS from 'exceljs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

jest.mock('../../electron/main/db/database', () => ({ getDb: jest.fn(), withTransaction: jest.fn() }))
jest.mock('../../electron/main/repositories/vouchers', () => ({ createVoucher: jest.fn(), updateVoucher: jest.fn() }))
jest.mock('../../electron/main/services/audit', () => ({ writeAudit: jest.fn() }))
jest.mock('electron', () => ({ app: { getPath: () => '' }, dialog: {} }))

import { getDb, withTransaction } from '../../electron/main/db/database'
import { createVoucher } from '../../electron/main/repositories/vouchers'
import { analyzeFile, commitImportDraft, createMissingImportMasterData, exportEditableVouchersWorkbook, generateImportTemplate, previewXlsx, type FieldKey } from '../../electron/main/services/imports'
import { getImportMasterSnapshot, readImportMasterSheets, validateImportMasters, matchMaster } from '../../electron/main/services/importMasterData'
import { ImportMasterRowSchema } from '../../shared/importMasterData'

const Sqlite = require('node:sqlite').DatabaseSync
let db: any
let savepoint = 0
beforeEach(() => {
  jest.clearAllMocks()
  db = new Sqlite(':memory:')
  db.exec(`
    CREATE TABLE organization_profile (id INTEGER PRIMARY KEY, profile TEXT);
    INSERT INTO organization_profile VALUES (1, 'GENERAL');
    CREATE TABLE classification_schemes (id INTEGER PRIMARY KEY, key TEXT, label TEXT, label_plural TEXT, description TEXT, required INTEGER, is_system INTEGER, is_active INTEGER);
    INSERT INTO classification_schemes VALUES (1, 'general-categories', 'Kategorie', 'Kategorien', NULL, 1, 0, 1), (2, 'nonprofit-spheres', 'Sphäre', 'Sphären', NULL, 1, 1, 1);
    CREATE TABLE classification_values (id INTEGER PRIMARY KEY, scheme_id INTEGER, stable_key TEXT, name TEXT, color TEXT, icon TEXT, description TEXT, sort_order INTEGER, is_system INTEGER, is_active INTEGER);
    INSERT INTO classification_values VALUES (10, 2, 'IDEELL', 'Ideell', NULL, NULL, NULL, 1, 1, 1);
    CREATE TABLE payment_account_openings (account_id INTEGER PRIMARY KEY, effective_date TEXT, amount_cents INTEGER);
    CREATE TABLE payment_accounts (id INTEGER PRIMARY KEY, name TEXT, kind TEXT, iban TEXT, color TEXT, sort_order INTEGER, is_active INTEGER);
    CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT UNIQUE, color TEXT);
    CREATE TABLE budgets (id INTEGER PRIMARY KEY, year INTEGER, sphere TEXT, primary_classification_value_id INTEGER, category_id INTEGER, project_id INTEGER, earmark_id INTEGER, amount_planned REAL, name TEXT, category_name TEXT, project_name TEXT, start_date TEXT, end_date TEXT, color TEXT, is_archived INTEGER, enforce_time_range INTEGER);
    CREATE TABLE earmarks (id INTEGER PRIMARY KEY, code TEXT UNIQUE, name TEXT, is_active INTEGER, start_date TEXT, end_date TEXT, enforce_time_range INTEGER);
    CREATE TABLE vouchers (id INTEGER PRIMARY KEY, date TEXT, gross_amount REAL, description TEXT,
      voucher_no TEXT, note TEXT, type TEXT, sphere TEXT, primary_classification_value_id INTEGER, payment_account_id INTEGER,
      net_amount REAL, vat_rate REAL, budget_id INTEGER, budget_amount REAL, earmark_id INTEGER, earmark_amount REAL,
      transfer_from_account_id INTEGER, transfer_to_account_id INTEGER);
    CREATE TABLE voucher_tags (voucher_id INTEGER, tag_id INTEGER);
  `)
  jest.mocked(getDb).mockReturnValue(db)
  jest.mocked(withTransaction).mockImplementation((fn: any) => {
    const name = `test_${++savepoint}`
    db.exec(`SAVEPOINT ${name}`)
    try { const result = fn(db); db.exec(`RELEASE ${name}`); return result }
    catch (error) { db.exec(`ROLLBACK TO ${name}; RELEASE ${name}`); throw error }
  })
})
afterEach(() => db.close())

async function fixture(options: { kind?: string; profile?: 'GENERAL' | 'NONPROFIT'; year?: number } = {}) {
  const general = options.profile !== 'NONPROFIT'
  db.prepare('UPDATE organization_profile SET profile = ?').run(general ? 'GENERAL' : 'NONPROFIT')
  const wb = new ExcelJS.Workbook()
  // Deliberately put master data first: it must never be mistaken for bookings.
  wb.addWorksheet('Konten').addRows([['Name', 'Typ'], ['Schnurz', options.kind ?? 'Bankkonto']])
  wb.addWorksheet('Tags').addRows([['Name'], ['Sommerfest']])
  if (general) wb.addWorksheet('Kategorien').addRows([['Name'], ['Veranstaltungen']])
  wb.addWorksheet('Budgets').addRows([['Name', 'Jahr', 'Planbetrag', general ? 'Kategorie' : 'Sphäre'], ['2026 Sommerfest', options.year ?? 2026, '1.234,50', general ? 'Veranstaltungen' : 'IDEELL']])
  wb.addWorksheet('Import').addRows([
    ['Datum', 'Beschreibung', 'Art', general ? 'Kategorie' : 'Sphäre', 'Konto', 'Einnahmen (Brutto)', 'Budget', 'Budget-Betrag', 'Tags'],
    ['2026-06-01', 'Eintritt', 'IN', general ? 'Veranstaltungen' : 'IDEELL', 'Schnurz', 50, '2026 Sommerfest', 50, 'Sommerfest'],
    [],
    ['2026-06-02', 'Eintritt 2', 'IN', general ? 'Veranstaltungen' : 'IDEELL', 'Schnurz', 20, '2026 Sommerfest', 20, 'Sommerfest']
  ])
  const base64 = Buffer.from(await wb.xlsx.writeBuffer()).toString('base64')
  const preview = await previewXlsx(base64)
  const mapping = preview.suggestedMapping as Record<FieldKey, string | null>
  return { wb, base64, mapping }
}

it('previews all sheets without writes, then creates and assigns master data including general categories', async () => {
  const file = await fixture()
  const analysis = await analyzeFile(file.base64, file.mapping)
  expect(analysis.rows).toHaveLength(2)
  expect(analysis.masterData).toHaveLength(4)
  expect(analysis.masterData?.every(m => m.status === 'new')).toBe(true)
  expect(db.prepare('SELECT COUNT(*) AS n FROM payment_accounts').get().n).toBe(0)
  await expect(commitImportDraft(analysis.rows, analysis.masterData)).rejects.toThrow('Stammdaten')
  const created = createMissingImportMasterData({ masterData: analysis.masterData })
  expect(created).toMatchObject({ paymentAccounts: 1, tags: 1, budgets: 1, categories: 1 })
  expect(db.prepare('SELECT year, amount_planned, primary_classification_value_id FROM budgets').get()).toMatchObject({ year: 2026, amount_planned: 1234.5 })
  const reviewed = await analyzeFile(file.base64, file.mapping, [], { masterData: analysis.masterData, draftRows: analysis.rows })
  expect(reviewed.summary.errors).toBe(0)
  expect(reviewed.masterData?.every(m => m.status === 'existing')).toBe(true)
  expect(createMissingImportMasterData({ masterData: reviewed.masterData })).toEqual({ paymentAccounts: 0, tags: 0, budgets: 0, categories: 0, earmarks: 0 })
  expect((await commitImportDraft(reviewed.rows, reviewed.masterData)).imported).toBe(2)
  expect(createVoucher).toHaveBeenCalledWith(expect.objectContaining({ paymentAccountId: 1, paymentMethod: 'BANK', budgetId: 1, tags: ['Sommerfest'], primaryClassificationValueId: 11 }))
})

it('requires explicit unknown account types and preserves corrections when reviewing', async () => {
  const file = await fixture({ kind: 'Schnurz' })
  const analysis = await analyzeFile(file.base64, file.mapping)
  expect(analysis.masterData?.find(m => m.entity === 'paymentAccounts')?.issues.join(' ')).toContain('Kontotyp')
  expect(() => createMissingImportMasterData({ masterData: analysis.masterData })).toThrow('Kontotyp')
  expect(db.prepare('SELECT COUNT(*) AS n FROM tags').get().n).toBe(0)
  const masterData = analysis.masterData!.map(m => m.entity === 'paymentAccounts' ? { ...m, kind: 'Barkonto' } : m)
  const draftRows = [{ ...analysis.rows[0], values: { ...analysis.rows[0].values, description: 'Korrigiert', grossAmount: 60 } }]
  createMissingImportMasterData({ masterData })
  const reviewed = await analyzeFile(file.base64, file.mapping, [], { masterData, draftRows })
  expect(reviewed.rows).toHaveLength(1)
  expect(reviewed.rows[0].values).toMatchObject({ description: 'Korrigiert', grossAmount: 60, paymentMethod: 'BAR' })
})

it('keeps nonprofit spheres and reports budget year/time conflicts before writing bookings', async () => {
  const file = await fixture({ profile: 'NONPROFIT', year: 2025 })
  const analysis = await analyzeFile(file.base64, file.mapping)
  expect(analysis.rows[0].issues.some(i => i.code === 'budgetYear')).toBe(true)
  createMissingImportMasterData({ masterData: analysis.masterData })
  db.exec('UPDATE budgets SET enforce_time_range = 1')
  const review = await analyzeFile(file.base64, file.mapping, [], { masterData: analysis.masterData, draftRows: analysis.rows })
  expect(review.rows[0].issues.some(i => i.message.includes('Zuordnungszeitraums'))).toBe(true)
  // Renderer status/IDs cannot bypass the server-side reference validation.
  await expect(commitImportDraft(review.rows.map(r => ({ ...r, status: 'ok', issues: [], values: { ...r.values, budgetId: 999 } })), review.masterData)).rejects.toThrow('korrigieren')
  expect(createVoucher).not.toHaveBeenCalled()
})

it('matches by identity, rejects ambiguous names and does not interpret numeric name prefixes as IDs', () => {
  const options = [{ id: 7, name: '2026 Event', label: '#7 | 2026 Event', active: true }, { id: 1, name: 'Bank', label: '#1 | Bank', active: true }, { id: 2, name: 'Bank', label: '#2 | Bank', active: true }]
  expect(matchMaster('2026 Event', options)?.id).toBe(7)
  expect(matchMaster('Bank', options)).toBeUndefined()
  expect(matchMaster('#2 | Bank', options)?.id).toBe(2)
  expect(matchMaster('#999 | Bank', options)).toBeUndefined()
})

it('recognizes existing account names regardless of display/database ordering and rejects inactive references', async () => {
  const file = await fixture()
  db.exec("INSERT INTO payment_accounts VALUES (1, 'Zweitkonto', 'BANK', NULL, NULL, 2, 1), (2, 'Schnurz', 'CASH', NULL, NULL, 1, 1)")
  const result = await analyzeFile(file.base64, file.mapping, [], { masterData: [] })
  expect(result.rows[0].values.paymentAccountId).toBe(2)
  db.exec('UPDATE payment_accounts SET is_active = 0 WHERE id = 2')
  const inactive = await analyzeFile(file.base64, file.mapping, [], { masterData: [] })
  expect(inactive.rows[0].issues.some(i => i.level === 'error' && i.code === 'paymentAccount')).toBe(true)
})

it('detects duplicate master definitions and missing budgets without guessed defaults', () => {
  const wb = new ExcelJS.Workbook()
  wb.addWorksheet('Tags').addRows([['Name'], ['Tag'], ['tag']])
  wb.addWorksheet('Budgets').addRows([['Name'], ['Unvollständig']])
  const rows = validateImportMasters(readImportMasterSheets(wb), getImportMasterSnapshot(), true)
  expect(rows.every(r => r.status === 'error')).toBe(true)
  expect(rows[2].issues.join(' ')).toMatch(/Budgetjahr.*Planbetrag/)
})

it.each(['GENERAL', 'NONPROFIT'] as const)('generates editable master tabs and the right classification column for %s', async profile => {
  db.prepare('UPDATE organization_profile SET profile = ?').run(profile)
  const dir = mkdtempSync(path.join(tmpdir(), 'vereino-import-test-'))
  try {
    const filePath = path.join(dir, 'template.xlsx')
    await generateImportTemplate(filePath)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(filePath)
    expect(wb.getWorksheet('Konten')?.state).toBe('visible')
    expect(wb.getWorksheet('Tags')).toBeDefined()
    expect(wb.getWorksheet('Budgets')?.getCell('D1').text).toBe('Planbetrag')
    expect(!!wb.getWorksheet('Kategorien')).toBe(profile === 'GENERAL')
    expect(wb.getWorksheet('Import')?.getCell('E4').text).toBe(profile === 'GENERAL' ? 'Kategorie' : 'Sphäre')
    wb.getWorksheet('Konten')!.addRow(['', 'Neues Konto', 'Barkonto'])
    expect(readImportMasterSheets(wb).find(r => r.entity === 'paymentAccounts')).toMatchObject({ reference: 'Neues Konto', kind: 'Barkonto' })
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

it('rejects unknown explicit IDs and conflicting existing definitions', () => {
  db.exec("INSERT INTO payment_accounts VALUES (1, 'Bank', 'BANK', NULL, NULL, 1, 1)")
  const rows = [
    ImportMasterRowSchema.parse({ id: '1', entity: 'paymentAccounts', sourceSheet: 'Konten', sourceRow: 2, reference: '#1 | Bank', name: 'Bank', kind: 'CASH' }),
    ImportMasterRowSchema.parse({ id: '2', entity: 'paymentAccounts', sourceSheet: 'Konten', sourceRow: 3, reference: '#99 | Fremdes Konto', name: 'Fremdes Konto', kind: 'BANK' })
  ]
  expect(validateImportMasters(rows, getImportMasterSnapshot(), true).every(r => r.status === 'error')).toBe(true)
})

it('rolls back all master data if any creation fails', async () => {
  const file = await fixture()
  const analysis = await analyzeFile(file.base64, file.mapping)
  db.exec("CREATE TRIGGER reject_account BEFORE INSERT ON payment_accounts BEGIN SELECT RAISE(ABORT, 'write failure'); END")
  expect(() => createMissingImportMasterData({ masterData: analysis.masterData })).toThrow('write failure')
  expect(db.prepare('SELECT COUNT(*) AS n FROM tags').get().n).toBe(0)
  expect(db.prepare('SELECT COUNT(*) AS n FROM classification_values WHERE scheme_id = 1').get().n).toBe(0)
})

it('drops inferred missing data when the referring booking is deleted and preserves decimal edits', async () => {
  const file = await fixture()
  const first = await analyzeFile(file.base64, file.mapping, [], { masterData: [] })
  const removed = await analyzeFile(file.base64, file.mapping, [], { masterData: first.masterData, draftRows: [] })
  expect(removed.masterData).toEqual([])
  const updated = await analyzeFile(file.base64, file.mapping, [], { masterData: [], draftRows: [{ ...first.rows[0], values: { ...first.rows[0].values, grossAmount: '50.25', budgetAmount: '12,50' } }] })
  expect(updated.rows[0].values).toMatchObject({ grossAmount: 50.25, budgetAmount: 12.5 })
})

it('keeps invalid calendar dates and allocation amounts blocked through repeated reviews', async () => {
  const file = await fixture()
  const first = await analyzeFile(file.base64, file.mapping)
  const rows = [{ ...first.rows[0], values: { ...first.rows[0].values, date: '2026-02-31', budgetAmount: 'ungültig' } }]
  const review = await analyzeFile(file.base64, file.mapping, [], { masterData: first.masterData, draftRows: rows })
  expect(review.rows[0].issues.some(i => i.code === 'date' && i.level === 'error')).toBe(true)
  expect(review.rows[0].issues.some(i => i.code === 'budgetAmount' && i.level === 'error')).toBe(true)
  const again = await analyzeFile(file.base64, file.mapping, [], { masterData: review.masterData, draftRows: review.rows })
  expect(again.rows[0].issues.some(i => i.code === 'budgetAmount' && i.level === 'error')).toBe(true)
})

it('exports general categories and master data so the editable workbook can be read back', async () => {
  const file = await fixture()
  const first = await analyzeFile(file.base64, file.mapping)
  createMissingImportMasterData({ masterData: first.masterData })
  db.exec("INSERT INTO vouchers (id, date, gross_amount, description, voucher_no, type, sphere, primary_classification_value_id, payment_account_id, net_amount, vat_rate, budget_id, budget_amount) VALUES (1, '2026-06-01', 50, 'Eintritt', '2026-001', 'IN', 'IDEELL', 11, 1, 50, 0, 1, 50)")
  const dir = mkdtempSync(path.join(tmpdir(), 'vereino-export-test-'))
  try {
    const filePath = path.join(dir, 'export.xlsx')
    await exportEditableVouchersWorkbook(filePath)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(filePath)
    expect(wb.getWorksheet('Buchungen')?.getCell('G5').text).toBe('Veranstaltungen')
    const base64 = Buffer.from(await wb.xlsx.writeBuffer()).toString('base64')
    const preview = await previewXlsx(base64)
    const result = await analyzeFile(base64, preview.suggestedMapping as Record<FieldKey, string | null>)
    expect(result.summary.errors).toBe(0)
    expect(result.rows[0].values.primaryClassificationValueId).toBe(11)
    expect(result.masterData?.every(row => row.status === 'existing')).toBe(true)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
