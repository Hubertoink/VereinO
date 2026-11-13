import type Database from 'better-sqlite3'
const SqliteDatabase: new (path: string) => Database.Database = (() => {
  try { return require('node:sqlite').DatabaseSync }
  catch { return require('better-sqlite3') }
})()

jest.mock('../../electron/main/db/database', () => ({ getDb: jest.fn(), withTransaction: jest.fn() }))
jest.mock('../../electron/main/repositories/classifications', () => ({
  getOrganizationProfile: () => 'GENERAL', resolvePrimaryClassificationValueId: () => 1
}))

import { getDb, withTransaction } from '../../electron/main/db/database'
import { setSetting } from '../../electron/main/services/settings'
import { createAiMasterData, getAiMasterDataPermissions, resolveAiMasterData } from '../../electron/main/services/aiMasterData'
import { AI_MASTER_DATA_SETTING, DEFAULT_AI_MASTER_DATA_PERMISSIONS, type AiMasterDataPermissions } from '../../shared/aiMasterDataPolicy'

let db: Database.Database
let transactionId = 0
beforeEach(() => {
  db = new SqliteDatabase(':memory:')
  db.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value_json TEXT);
    CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT UNIQUE, color TEXT);
    CREATE TABLE budgets (id INTEGER PRIMARY KEY, year INTEGER, sphere TEXT, primary_classification_value_id INTEGER,
      category_id INTEGER, project_id INTEGER, earmark_id INTEGER, amount_planned REAL, name TEXT, category_name TEXT,
      project_name TEXT, start_date TEXT, end_date TEXT, color TEXT, is_archived INTEGER, enforce_time_range INTEGER);
    CREATE TABLE earmarks (id INTEGER PRIMARY KEY, code TEXT UNIQUE, name TEXT, description TEXT, start_date TEXT,
      end_date TEXT, is_active INTEGER, color TEXT, budget REAL, enforce_time_range INTEGER);
    CREATE TABLE parties (id INTEGER PRIMARY KEY, name TEXT, legal_name TEXT, role TEXT, contact_name TEXT, email TEXT,
      phone TEXT, street TEXT, postal_code TEXT, city TEXT, country TEXT, iban TEXT, bic TEXT, tax_number TEXT,
      vat_id TEXT, payment_term_days INTEGER, note TEXT, is_active INTEGER);
    CREATE TABLE audit_log (id INTEGER PRIMARY KEY, user_id INTEGER, entity TEXT, entity_id INTEGER,
      action TEXT, diff_json TEXT, hash TEXT NOT NULL, created_at TEXT);
  `)
  jest.mocked(getDb).mockReturnValue(db)
  jest.mocked(withTransaction).mockImplementation(fn => {
    const savepoint = `test_${transactionId++}`
    db.exec(`SAVEPOINT ${savepoint}`)
    try { const result = fn(db); db.exec(`RELEASE ${savepoint}`); return result }
    catch (error) { db.exec(`ROLLBACK TO ${savepoint}`); db.exec(`RELEASE ${savepoint}`); throw error }
  })
})
afterEach(() => db.close())

const allow = (values: Partial<AiMasterDataPermissions>) => setSetting(AI_MASTER_DATA_SETTING, {
  tags: false, budgets: false, earmarks: false, suppliers: false, customers: false, ...values
})
const candidate = { date: '2026-08-03', sphere: 'IDEELL', grossAmount: 86.4, counterparty: 'EDEKA Höchstädt' }

it('defaults tags and parties to on, keeps budgets and earmarks off, and respects saved opt-outs', () => {
  expect(getAiMasterDataPermissions()).toEqual(DEFAULT_AI_MASTER_DATA_PERMISSIONS)
  expect(getAiMasterDataPermissions()).toEqual({ tags: true, budgets: false, earmarks: false, suppliers: true, customers: true })
  allow({})
  for (const kind of Object.keys(DEFAULT_AI_MASTER_DATA_PERMISSIONS)) {
    expect(() => createAiMasterData({ kind, name: 'Neu', year: 2026, sphere: 'IDEELL', code: 'NEU' })).toThrow('nicht freigegeben')
  }
  expect(db.prepare('SELECT COUNT(*) AS count FROM audit_log').get()).toEqual({ count: 0 })
})

it('keeps permissions local to the active organization database', () => {
  allow({ tags: false })
  const other = new SqliteDatabase(':memory:')
  other.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value_json TEXT)')
  try {
    jest.mocked(getDb).mockReturnValue(other)
    expect(getAiMasterDataPermissions().tags).toBe(true)
    jest.mocked(getDb).mockReturnValue(db)
    expect(getAiMasterDataPermissions().tags).toBe(false)
  } finally { jest.mocked(getDb).mockReturnValue(db); other.close() }
})

it.each(['tags', 'budgets', 'earmarks', 'suppliers', 'customers'] as const)('grants only %s and records its creation', kind => {
  allow({ [kind]: true })
  const created = createAiMasterData({ kind, name: 'Projekt', year: 2026, sphere: 'IDEELL', code: 'PROJ' })
  expect(created).toMatchObject({ kind, created: true, id: 1 })
  const other = kind === 'tags' ? 'customers' : 'tags'
  expect(() => createAiMasterData({ kind: other, name: 'Nicht erlaubt' })).toThrow('nicht freigegeben')
  const audit = db.prepare('SELECT diff_json, hash FROM audit_log').get() as any
  expect(JSON.parse(audit.diff_json)).toMatchObject({ source: 'AI', permission: kind })
  expect(audit.hash).toHaveLength(64)
})

it('reuses names across case/spacing and across supplier/customer roles without modifying existing data', () => {
  allow({ tags: true, suppliers: true })
  const tag = createAiMasterData({ kind: 'tags', name: 'Getränke Jugendtreff' })
  const party = createAiMasterData({ kind: 'suppliers', name: 'EDEKA Höchstädt' })
  allow({})
  expect(createAiMasterData({ kind: 'tags', name: ' getränke   jugendtreff ' })).toMatchObject({ id: tag.id, created: false })
  expect(createAiMasterData({ kind: 'customers', name: 'EDEKA Höchstädt' })).toMatchObject({ id: party.id, created: false })
  expect(db.prepare('SELECT role FROM parties').get()).toEqual({ role: 'SUPPLIER' })
})

it('resolves all proposals to real IDs, keeps booking amounts, and avoids duplicates on recheck', () => {
  allow({ tags: true, budgets: true, earmarks: true, suppliers: true })
  const input = { ...candidate, tags: ['Getränke'], masterData: {
    budgets: [{ name: 'Jugendtreff', amount: 86.4 }],
    earmarks: [{ name: 'Förderung Jugendtreff', code: 'JUGEND', amount: 40 }],
    party: { name: 'EDEKA Höchstädt', role: 'SUPPLIER' as const }
  } }
  const result = resolveAiMasterData(input)
  expect(result).toMatchObject({ tags: ['Getränke'], partyId: 1,
    budgets: [{ id: 1, amount: 86.4 }], earmarks: [{ id: 1, amount: 40 }], warnings: [] })
  expect(result.masterDataCreated).toHaveLength(4)
  expect(db.prepare('SELECT year, amount_planned FROM budgets').get()).toEqual({ year: 2026, amount_planned: 0 })
  expect(resolveAiMasterData(input).masterDataCreated).toEqual([])
  expect(db.prepare('SELECT COUNT(*) AS count FROM audit_log').get()).toEqual({ count: 4 })
})

it('honors revoked permission when resolving a previously generated proposal', () => {
  allow({ tags: true })
  allow({})
  const result = resolveAiMasterData({ ...candidate, tags: ['Neu'] })
  expect(result.tags).toEqual([])
  expect(result.warnings.join()).toContain('nicht freigegeben')
  expect(db.prepare('SELECT COUNT(*) AS count FROM tags').get()).toEqual({ count: 0 })
})

it('rejects excessive allocations, mismatched counterparties, inactive entries and conflicting codes', () => {
  allow({ budgets: true, suppliers: true, earmarks: true })
  const result = resolveAiMasterData({ ...candidate, masterData: {
    budgets: [{ name: 'Zu viel', amount: 100 }], earmarks: [], party: { name: 'Erfunden', role: 'SUPPLIER' }
  } })
  expect(result.masterDataCreated).toEqual([])
  expect(result.warnings).toHaveLength(2)
  createAiMasterData({ kind: 'earmarks', name: 'Projekt A', code: 'PROJ' })
  expect(() => createAiMasterData({ kind: 'earmarks', name: 'Projekt B', code: 'PROJ' })).toThrow('bereits anders vergeben')
  db.exec('UPDATE earmarks SET is_active = 0')
  expect(() => createAiMasterData({ kind: 'earmarks', name: 'Projekt A', code: 'PROJ' })).toThrow('inaktiv')
})

it('rolls back creation if the audit write fails', () => {
  allow({ tags: true })
  db.exec('DROP TABLE audit_log')
  expect(() => createAiMasterData({ kind: 'tags', name: 'Rollback' })).toThrow()
  expect(db.prepare('SELECT COUNT(*) AS count FROM tags').get()).toEqual({ count: 0 })
})
