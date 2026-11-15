import ExcelJS from 'exceljs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
jest.mock('../../electron/main/db/database', () => ({ getDb: jest.fn(), withTransaction: jest.fn() }))
jest.mock('../../electron/main/repositories/vouchers', () => ({ createVoucher: jest.fn(), updateVoucher: jest.fn() }))
jest.mock('../../electron/main/services/audit', () => ({ writeAudit: jest.fn() }))
jest.mock('electron', () => ({ app: { getPath: () => '' }, dialog: {} }))
jest.mock('../../electron/main/services/ai', () => ({
  getAiSettings: jest.fn(() => ({ textModel: 'test-model', hasApiKey: true })),
  createAiResponse: jest.fn(), extractOutputText: (r: any) => r.text,
  normalizeUsage: () => ({ totalTokens: 100 })
}))
import { getDb, withTransaction } from '../../electron/main/db/database'
import { createVoucher } from '../../electron/main/repositories/vouchers'
import { createAiResponse } from '../../electron/main/services/ai'
import { createAiImport, startAiImport, getAiImport, saveAiImport, commitAiImport, cancelAiImport, previewAiImport } from '../../electron/main/services/aiImport'
import { csvRecords } from '../../electron/main/services/aiImportFiles'
import { deleteAiImport } from '../../electron/main/services/aiImport'
import { budgetYearAcknowledgement } from '../../shared/aiImport'
import { AiImportOptionsSchema, type AiImportSession } from '../../shared/aiImport'
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
    INSERT INTO classification_values VALUES (12, 2, 'WGB', 'Wirtschaftlich', NULL, NULL, NULL, 2, 1, 1), (13, 2, 'ZWECK', 'Zweckbetrieb', NULL, NULL, NULL, 3, 1, 1), (14, 2, 'VERMOEGEN', 'Vermögen', NULL, NULL, NULL, 4, 1, 1);
    CREATE TABLE payment_accounts (id INTEGER PRIMARY KEY, name TEXT, kind TEXT, iban TEXT, color TEXT, sort_order INTEGER, is_active INTEGER);
    CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT UNIQUE, color TEXT);
    CREATE TABLE budgets (id INTEGER PRIMARY KEY, year INTEGER, sphere TEXT, primary_classification_value_id INTEGER, category_id INTEGER, project_id INTEGER, earmark_id INTEGER, amount_planned REAL, name TEXT, category_name TEXT, project_name TEXT, start_date TEXT, end_date TEXT, color TEXT, is_archived INTEGER, enforce_time_range INTEGER);
    CREATE TABLE earmarks (id INTEGER PRIMARY KEY, code TEXT UNIQUE, name TEXT, is_active INTEGER, start_date TEXT, end_date TEXT, enforce_time_range INTEGER, description TEXT, color TEXT, budget REAL);
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
  db.exec("INSERT INTO payment_accounts VALUES (1, 'Testbank', 'BANK', NULL, NULL, 1, 1), (2, 'Testkasse', 'CASH', NULL, NULL, 2, 1)")
  db.exec("INSERT INTO classification_values VALUES (11, 1, 'USER_TEST', 'Verwaltung', NULL, NULL, NULL, 1, 0, 1)")
  jest.mocked(createVoucher).mockImplementation((payload: any) => {
    const grossAmount = payload.grossAmount ?? payload.netAmount * (1 + payload.vatRate / 100)
    const id = db.prepare('INSERT INTO vouchers(date, gross_amount, description, type, payment_account_id) VALUES (?, ?, ?, ?, ?)').run(payload.date, grossAmount, payload.description, payload.type, payload.paymentAccountId).lastInsertRowid
    return { id: Number(id), voucherNo: String(id), grossAmount, warnings: [] }
  })
  jest.mocked(createAiResponse).mockImplementation(async (request: any) => {
    const data = JSON.parse(request.input[1].content.split('Daten:\n')[1])
    const name = request.text.format.name
    if (name === 'import_assignments') return { output_parsed: { rows: data.rows.map((r: any) => ({ id: r.id, account: '#2 | Testkasse [CASH]', classification: 'Verwaltung', reason: 'Bürobedarf für die Verwaltung.' })) } }
    if (name === 'import_groups') return { output_parsed: { groups: [] } }
    if (name === 'import_relations') return { output_parsed: { relations: data.relations.map((r: any) => ({ id: r.id, kind: r.kind, reason: r.reason })) } }
    return { output_parsed: { mapping: [] } }
  })
})
afterEach(() => db.close())
async function file(rows?: any[][]) {
  const wb = new ExcelJS.Workbook()
  wb.addWorksheet('Buchungen').addRows([
    ['Datum', 'Beschreibung', 'Art', 'Konto', 'Kategorie', 'Brutto'],
    ...(rows || [['2026-01-01', 'Papier Büro', 'OUT', '', '', 20], ['2026-01-02', 'Stifte Büro', 'OUT', '', '', 30]])
  ])
  return { fileName: 'test.xlsx', fileBase64: Buffer.from(await wb.xlsx.writeBuffer()).toString('base64'), sheetName: 'Buchungen' }
}
async function analyze(input: Awaited<ReturnType<typeof file>>, options: z.input<typeof AiImportOptionsSchema> = {}) {
  const session = await createAiImport({ ...input, options })
  startAiImport({ id: session.id, revision: session.revision })
  return settle(session.id)
}
async function settle(id: string) {
  for (let i = 0; i < 300; i++) {
    await new Promise(resolve => setTimeout(resolve, 5))
    const s = getAiImport(id)
    if (s.status !== 'running') return s
  }
  throw new Error('Job did not settle')
}
function save(s: AiImportSession, accepted = false) {
  return saveAiImport({ id: s.id, revision: s.revision, rows: s.rows, masterData: s.masterData, masterDataAccepted: accepted })
}

it('revalidates corrected classifications without saving or changing the revision', async () => {
  jest.mocked(createAiResponse).mockResolvedValue({ output_parsed: { rows: [] } })
  const s = await analyze(await file([['2026-01-01', 'Papier', 'OUT', 'Testbank', '', 10]]))
  expect(s.rows[0].draft.issues.some(i => i.code === 'category' && i.level === 'error')).toBe(true)
  s.rows[0].draft.values.category = 'Verwaltung'
  const reviewed = saveAiImport({ id: s.id, revision: s.revision, rows: s.rows, masterData: s.masterData, masterDataAccepted: false }, false)
  expect(reviewed.rows[0].draft.issues.some(i => i.code === 'category' && i.level === 'error')).toBe(false)
  expect(reviewed.revision).toBe(s.revision)
  expect(getAiImport(s.id).rows[0].draft.values.category).toBe('')
  reviewed.rows[0].draft.values.category = ''
  expect(saveAiImport({ ...reviewed, masterDataAccepted: false }, false).rows[0].draft.issues.some(i => i.code === 'category' && i.level === 'error')).toBe(true)
})

it('deletes a completed import record while retaining its vouchers', async () => {
  const s = await analyze(await file())
  commitAiImport({ id: s.id, revision: s.revision })
  expect(deleteAiImport(s.id)).toEqual({ deleted: true })
  expect(() => getAiImport(s.id)).toThrow('nicht gefunden')
  expect(db.prepare('SELECT COUNT(*) n FROM vouchers').get().n).toBe(2)
})

it('accepts a budget-year warning for this assignment, resets on edits, and never bypasses enforced periods', async () => {
  db.exec("INSERT INTO budgets(id, year, sphere, amount_planned, name, is_archived, enforce_time_range) VALUES (1, 2026, 'IDEELL', 100, 'Jahresplan', 0, 0)")
  let s = await analyze(await file([['2025-12-31', 'Jahreswechsel', 'OUT', 'Testbank', 'Verwaltung', 22]]))
  s.rows[0].draft.values.budget = 'Jahresplan'
  s = save(s)
  const warning = s.rows[0].draft.issues.find(i => i.code === 'budgetYear')!
  expect(warning.level).toBe('warning')
  s.rows[0].acceptedBudgetYear = budgetYearAcknowledgement(s.rows[0].draft.values, warning.message)
  s = save(s)
  expect(s.rows[0].draft.status).toBe('ok')
  expect(s.rows[0].draft.issues.find(i => i.code === 'budgetYear')?.level).toBe('info')
  expect(s.rows[0].draft.values.date).toBe('2025-12-31')
  s.rows[0].draft.values.date = '2025-12-30'
  s = save(s)
  expect(s.rows[0].draft.issues.find(i => i.code === 'budgetYear')?.level).toBe('warning')
  s.rows[0].acceptedBudgetYear = budgetYearAcknowledgement(s.rows[0].draft.values, warning.message)
  s = save(s)
  db.exec('UPDATE budgets SET enforce_time_range = 1 WHERE id = 1')
  expect(() => commitAiImport({ id: s.id, revision: s.revision })).toThrow('Zuordnungszeitraums')
})

it('creates only a persistent draft, preserves source amounts and commits atomically and idempotently', async () => {
  const s = await analyze(await file(), { defaultAccount: '#2 | Testkasse [CASH]' })
  expect(s.status).toBe('review')
  expect(s.rows[0].origins).toMatchObject({ paymentAccount: 'default', category: 'ai', grossAmount: 'source' })
  expect(s.rows[0].sourceValues.paymentAccount).toBe('')
  expect(db.prepare('SELECT COUNT(*) n FROM vouchers').get().n).toBe(0)
  const result = commitAiImport({ id: s.id, revision: s.revision })
  expect(result.imported).toBe(2)
  expect(createVoucher).toHaveBeenCalledWith(expect.objectContaining({ grossAmount: 20, paymentAccountId: 2, primaryClassificationValueId: 11 }))
  expect(commitAiImport({ id: s.id, revision: s.revision }).imported).toBe(2)
  expect(db.prepare('SELECT COUNT(*) n FROM vouchers').get().n).toBe(2)
})

it('rejects hallucinated accounts/categories without replacing populated source facts', async () => {
  jest.mocked(createAiResponse).mockResolvedValue({ output_parsed: { rows: [{ id: '2:main', account: '#999 | Erfunden', classification: 'Erfunden', reason: 'Raten' }] } })
  const s = await analyze(await file([['2026-01-01', 'Quelle bleibt', 'OUT', '', '', 17.8]]))
  expect(s.rows[0].draft.values).toMatchObject({ grossAmount: 17.8, description: 'Quelle bleibt', category: '', paymentAccount: '' })
  expect(() => commitAiImport({ id: s.id, revision: s.revision })).toThrow()
  expect(createVoucher).not.toHaveBeenCalled()
})

it('requires budget plan amounts and explicit master approval; groups tags across rows', async () => {
  const defaultMock = jest.mocked(createAiResponse).getMockImplementation()!
  jest.mocked(createAiResponse).mockImplementation(async (request: any) => request.text.format.name === 'import_groups' ? { output_parsed: { groups: [
    { kind: 'tag', name: 'Bürobedarf', rowIds: ['2:main', '3:main'], reason: 'Gemeinsamer Bedarf' },
    { kind: 'tag', name: 'Einzelbeleg 123', rowIds: ['2:main'], reason: 'Zu speziell' },
    { kind: 'budget', name: 'Büro 2026', rowIds: ['2:main', '3:main'], reason: 'Planungsgruppe' }
  ] } } : defaultMock(request))
  let s = await analyze(await file(), { tags: 'suggest', budgets: 'suggest' })
  expect(s.masterData.some(m => m.name === 'Einzelbeleg 123')).toBe(false)
  expect(db.prepare('SELECT COUNT(*) n FROM tags').get().n).toBe(0)
  const budget = s.masterData.find(m => m.entity === 'budgets')!
  expect(budget.amountPlanned).toBe('')
  expect(() => commitAiImport({ id: s.id, revision: s.revision })).toThrow('Stammdaten')
  budget.amountPlanned = '100'
  s = save(s)
  expect(() => commitAiImport({ id: s.id, revision: s.revision })).toThrow('freigeben')
  s = save(s, true)
  expect(commitAiImport({ id: s.id, revision: s.revision }).imported).toBe(2)
  expect(db.prepare('SELECT amount_planned FROM budgets').get().amount_planned).toBe(100)
  expect(db.prepare('SELECT name FROM tags').get().name).toBe('Bürobedarf')
})

it('retains independent phase checkpoints and discards a late response after pause', async () => {
  let release!: (value: any) => void
  jest.mocked(createAiResponse).mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
  const s = await createAiImport({ ...await file(), options: {} })
  startAiImport({ id: s.id, revision: s.revision })
  for (let i = 0; i < 300 && !release; i++) await new Promise(resolve => setTimeout(resolve, 5))
  const current = getAiImport(s.id)
  expect(current.phase).toBe('classify')
  const paused = cancelAiImport({ id: s.id, revision: current.revision })
  release({ output_parsed: { rows: [{ id: '2:main', account: '#1 | Testbank [BANK]', classification: 'Verwaltung', reason: 'Spätes Ergebnis' }] } })
  await new Promise(resolve => setTimeout(resolve, 5))
  expect(getAiImport(s.id).rows[0].draft.values.category).toBe('')
  startAiImport({ id: s.id, revision: paused.revision })
  const resumed = await settle(s.id)
  expect(resumed.status).toBe('review')
  expect(resumed.rows[0].draft.values.paymentAccount).toContain('Testkasse')
})

it('shows duplicate and reversal candidates, requiring acknowledgement without creating extra vouchers', async () => {
  let s = await analyze(await file([
    ['2026-01-01', 'Miete Sommerfest', 'OUT', 'Testbank', 'Verwaltung', 100],
    ['2026-01-01', 'Miete Sommerfest', 'OUT', 'Testbank', 'Verwaltung', 100],
    ['2026-01-02', 'Storno Miete Sommerfest', 'IN', 'Testbank', 'Verwaltung', 100]
  ]))
  expect(s.relations.some(r => r.kind === 'duplicate')).toBe(true)
  expect(s.relations.some(r => r.kind === 'reversal')).toBe(true)
  expect(() => commitAiImport({ id: s.id, revision: s.revision })).toThrow('Beziehung')
  s.rows[1].selected = false
  s.rows.forEach(r => { r.relationsChecked = true })
  s = save(s)
  expect(commitAiImport({ id: s.id, revision: s.revision }).imported).toBe(2)
})

it('rolls back newly created masters and earlier vouchers when a later voucher fails', async () => {
  let s = await analyze(await file())
  s.rows[0].draft.values.tags = 'Neu'
  s = save(s)
  s = save(s, true)
  const create = jest.mocked(createVoucher).getMockImplementation()!
  jest.mocked(createVoucher).mockImplementationOnce(create).mockImplementationOnce(() => { throw new Error('Periode geschlossen') })
  expect(() => commitAiImport({ id: s.id, revision: s.revision })).toThrow('Periode geschlossen')
  expect(db.prepare('SELECT COUNT(*) n FROM vouchers').get().n).toBe(0)
  expect(db.prepare('SELECT COUNT(*) n FROM tags').get().n).toBe(0)
  expect(getAiImport(s.id).status).toBe('review')
})

it('prevents stale saves and rejects cross-organization access', async () => {
  const s = await analyze(await file())
  save(s)
  expect(() => save(s)).toThrow('zwischenzeitlich')
  const other = new Sqlite(':memory:')
  jest.mocked(getDb).mockReturnValue(other)
  try { expect(() => getAiImport(s.id)).toThrow('Organisation') }
  finally { other.close(); jest.mocked(getDb).mockReturnValue(db) }
})

it('reads quoted CSV, preserves decimal values and rejects broken CSV', async () => {
  const csv = 'Datum;Beschreibung;Brutto;Kategorie;Konto\n01.01.2026;"Papier; Stifte";-12,50;Verwaltung;Testkasse'
  const input = { fileName: 'test.csv', fileBase64: Buffer.from(csv).toString('base64'), sheetName: 'Buchungen' }
  expect((await previewAiImport(input.fileName, input.fileBase64)).sheets[0].count).toBe(1)
  const s = await analyze(input)
  expect(s.rows[0].draft.values).toMatchObject({ description: 'Papier; Stifte', grossAmount: -12.5, type: 'OUT' })
  expect(() => csvRecords('A;B\n"nicht geschlossen;1')).toThrow('Anführungszeichen')
})

it('keeps missing nonprofit spheres unresolved across repeated validation', async () => {
  db.exec("UPDATE organization_profile SET profile = 'NONPROFIT'")
  jest.mocked(createAiResponse).mockResolvedValue({ output_parsed: { rows: [] } })
  let s = await analyze(await file([['2026-01-01', 'Unklarer Vorgang', 'IN', 'Testbank', '', 15]]))
  s = save(save(s))
  expect(s.rows[0].draft.values.sphere).toBe('')
  expect(s.rows[0].draft.issues.some(i => i.code === 'sphere' && i.level === 'error')).toBe(true)
  expect(() => commitAiImport({ id: s.id, revision: s.revision })).toThrow('Sphäre')
})

it('detects existing reversals with canonical account labels and catches a late duplicate', async () => {
  db.prepare('INSERT INTO vouchers(id,date,gross_amount,description,type,payment_account_id) VALUES (?,?,?,?,?,?)').run(50, '2026-01-01', 50, 'Miete Sommerfest', 'OUT', 1)
  let s = await analyze(await file([['2026-01-02', 'Storno Miete Sommerfest', 'IN', '#1 | Testbank [BANK]', 'Verwaltung', 50]]))
  expect(s.relations).toEqual(expect.arrayContaining([expect.objectContaining({ voucherId: 50, kind: 'reversal' })]))
  s.rows[0].relationsChecked = true
  s = save(s)
  db.prepare('INSERT INTO vouchers(id,date,gross_amount,description,type,payment_account_id) VALUES (?,?,?,?,?,?)').run(51, '2026-01-02', 50, 'Storno Miete Sommerfest', 'IN', 1)
  expect(() => commitAiImport({ id: s.id, revision: s.revision })).toThrow('Neue mögliche')
  s = save(s)
  expect(s.rows[0].relationsChecked).toBe(false)
  expect(s.relations.some(r => r.voucherId === 51 && r.kind === 'duplicate')).toBe(true)
})

it('retains a source account conflicting with the default and avoids unnecessary provider calls', async () => {
  const s = await analyze(await file([['2026-01-01', 'Saldoausgleich Test', 'IN', 'Testbank', 'Verwaltung', 17]]), { defaultAccount: '#2 | Testkasse [CASH]' })
  expect(s.rows[0].selected).toBe(true)
  expect(s.rows[0].draft.values.paymentAccount).toBe('Testbank')
  expect(s.rows[0].reasons.paymentAccount).toContain('weicht')
  expect(createAiResponse).not.toHaveBeenCalled()
})

it('validates workbook masters without writing and preserves immutable source evidence on edits', async () => {
  const wb = new ExcelJS.Workbook()
  wb.addWorksheet('Buchungen').addRows([['Datum', 'Beschreibung', 'Art', 'Konto', 'Kategorie', 'Brutto', 'Tags'], ['2026-01-01', 'Kartenverkauf', 'IN', 'Neue Kasse', 'Neue Kategorie', 10, 'Neuer Tag']])
  wb.addWorksheet('Konten').addRows([['Referenz', 'Name', 'Typ'], ['Neue Kasse', 'Neue Kasse', 'CASH']])
  wb.addWorksheet('Kategorien').addRows([['Referenz', 'Name'], ['Neue Kategorie', 'Neue Kategorie']])
  let s = await analyze({ fileName: 'masters.xlsx', fileBase64: Buffer.from(await wb.xlsx.writeBuffer()).toString('base64'), sheetName: 'Buchungen' })
  expect(s.rows[0].draft.issues.some(i => i.level === 'error')).toBe(false)
  expect(() => commitAiImport({ id: s.id, revision: s.revision })).toThrow('freigeben')
  s.rows[0].draft.values.description = 'Manuell korrigiert'
  s.rows[0].sourceValues.description = 'Manipuliert'
  s.rows[0].draft.original.Beschreibung = 'Manipuliert'
  s = save(s, true)
  expect(s.rows[0].sourceValues.description).toBe('Kartenverkauf')
  expect(s.rows[0].draft.original.Beschreibung).toBe('Kartenverkauf')
  expect(s.rows[0].origins.description).toBe('user')
  expect(commitAiImport({ id: s.id, revision: s.revision }).imported).toBe(1)
})

it.each(['GENERAL', 'NONPROFIT'])('reads the delivered sample workbook, imports normal rows and blocks deliberate errors (%s)', async profile => {
  db.prepare('UPDATE organization_profile SET profile = ?').run(profile)
  const original = jest.mocked(createAiResponse).getMockImplementation()!
  jest.mocked(createAiResponse).mockImplementation(async (request: any) => {
    if (profile !== 'NONPROFIT' || request.text.format.name !== 'import_assignments') return original(request)
    const data = JSON.parse(request.input[1].content.split('Daten:\n')[1])
    return { output_parsed: { rows: data.rows.map((r: any) => ({id:r.id,account:'Testkasse',classification:'IDEELL',reason:'Testannahme'})) } }
  })
  const buffer = await fs.readFile(path.resolve('outputs/vereinO-ai-import-20261115/VereinO-KI-Import-Testfaelle.xlsx'))
  const input = {fileName:'VereinO-KI-Import-Testfaelle.xlsx',fileBase64:buffer.toString('base64'),sheetName:'Buchungen'}
  const preview = await previewAiImport(input.fileName,input.fileBase64)
  expect(preview.sheets.map(s=>s.name)).toEqual(['Buchungen','Prueffaelle'])
  let s = await analyze(input,{defaultAccount:'Testkasse'})
  expect(s.status).toBe('review')
  expect(s.rows).toHaveLength(12)
  expect(s.rows.flatMap(r=>r.draft.issues.filter(i=>i.level==='error'))).toEqual([])
  s=save(s,true)
  expect(commitAiImport({id:s.id,revision:s.revision}).imported).toBe(12)
  expect(createVoucher).toHaveBeenCalledWith(expect.objectContaining({date:'2026-06-10',netAmount:100,vatRate:19}))
  const bad=await analyze({...input,sheetName:'Prueffaelle'})
  expect(bad.status).toBe('review')
  expect(bad.rows.find(r=>r.draft.sourceRow===12)?.draft.issues.some(i=>i.code==='date')).toBe(true)
  expect(bad.rows.find(r=>r.draft.sourceRow===13)?.draft.issues.some(i=>i.code==='amount')).toBe(true)
  expect(bad.rows.find(r=>r.draft.sourceRow===14)?.draft.issues.some(i=>i.code==='budgetAmount')).toBe(true)
  expect(bad.rows.find(r=>r.draft.sourceRow===16)?.draft.status).toBe('ignored')
  expect(bad.rows.find(r=>r.draft.sourceRow===18)?.selected).toBe(true)
  expect(bad.rows.find(r=>r.draft.sourceRow===20)?.draft.values.grossAmount).toBe(12.5)
  expect(bad.relations.map(r=>r.kind)).toEqual(expect.arrayContaining(['duplicate','reversal','refund','transfer']))
  expect(bad.masterData.find(m=>m.name==='Schnurz')?.status).toBe('error')
  expect(()=>commitAiImport({id:bad.id,revision:bad.revision})).toThrow()
})
