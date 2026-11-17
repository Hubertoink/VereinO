import type Database from 'better-sqlite3'
import ExcelJS from 'exceljs'
import { getDb, withTransaction } from '../../electron/main/db/database'
import { migrateMembershipLedger } from '../../electron/main/db/membershipLedger'
import { createMember, updateMember } from '../../electron/main/repositories/members'
import { contributionPeriods } from '../../electron/main/repositories/membershipLedger'
import { executeMembersImport } from '../../electron/main/services/membersImport'

const SqliteDatabase: new (path: string) => Database.Database = (() => {
  try {
    return require('node:sqlite').DatabaseSync
  } catch {
    return require('better-sqlite3')
  }
})()

jest.mock('electron', () => ({ dialog: {}, app: { getPath: jest.fn() } }))
jest.mock('../../electron/main/db/database', () => ({
  getDb: jest.fn(),
  withTransaction: jest.fn()
}))
jest.mock('../../electron/main/services/audit', () => ({ writeAudit: jest.fn() }))

let db: Database.Database

beforeEach(() => {
  jest.clearAllMocks()
  jest
    .useFakeTimers({
      doNotFake: [
        'nextTick',
        'setImmediate',
        'clearImmediate',
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'queueMicrotask',
        'performance',
        'hrtime'
      ]
    })
    .setSystemTime(new Date('2026-11-17T12:00:00Z'))
  db = new SqliteDatabase(':memory:')
  db.exec(`
    CREATE TABLE members (
      id INTEGER PRIMARY KEY, member_no TEXT UNIQUE, name TEXT NOT NULL,
      email TEXT, phone TEXT, address TEXT, status TEXT, board_role TEXT,
      iban TEXT, bic TEXT, contribution_amount REAL, contribution_interval TEXT,
      mandate_ref TEXT, mandate_date TEXT, join_date TEXT, leave_date TEXT,
      notes TEXT, next_due_date TEXT, updated_at TEXT
    );
    CREATE TABLE vouchers (id INTEGER PRIMARY KEY, type TEXT, original_id INTEGER, reversed_by_id INTEGER);
    CREATE TABLE bank_transaction_ai_suggestions (id INTEGER PRIMARY KEY);
  `)
  migrateMembershipLedger(db)
  jest.mocked(getDb).mockReturnValue(db)
  jest.mocked(withTransaction).mockImplementation((callback) => {
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
})

afterEach(() => {
  db.close()
  jest.useRealTimers()
})

function member(joinDate: string) {
  return createMember({
    memberNo: '001',
    name: 'Testmitglied',
    join_date: joinDate,
    contribution_amount: 10,
    contribution_interval: 'MONTHLY'
  }).id
}

async function importContribution(joinDate: string) {
  const workbook = new ExcelJS.Workbook()
  workbook.addWorksheet('Mitglieder').addRows([
    ['Mitgliedsnummer', 'Name', 'Eintrittsdatum', 'Beitrag'],
    ['001', 'Testmitglied', joinDate, 20]
  ])
  const data = Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64')
  return executeMembersImport(
    data,
    {
      memberNo: 'Mitgliedsnummer',
      name: 'Name',
      join_date: 'Eintrittsdatum',
      contribution_amount: 'Beitrag'
    },
    { updateExisting: true }
  )
}

test('imports a changed contribution before a future entry without creating charges before entry', async () => {
  const id = member('2027-03-15')
  expect(await importContribution('15.03.2027')).toMatchObject({
    updated: 1,
    imported: 0,
    errors: []
  })
  expect(
    db.prepare('SELECT starts_on, amount_cents FROM membership_plans WHERE member_id=?').all(id)
  ).toEqual([{ starts_on: '2027-03-15', amount_cents: 2000 }])
  expect(contributionPeriods(id, '2027-03-14')).toEqual([])
  expect(contributionPeriods(id, '2027-03-31')).toMatchObject([
    { dueDate: '2027-03-15', expected: 20 }
  ])
  expect(
    db.prepare('SELECT contribution_amount, next_due_date FROM members WHERE id=?').get(id)
  ).toEqual({ contribution_amount: 20, next_due_date: '2027-03-15' })
})

test('keeps the next-period default and existing obligations for an established member', async () => {
  const id = member('2026-01-01')
  expect(await importContribution('01.01.2026')).toMatchObject({ updated: 1, errors: [] })
  expect(
    db
      .prepare(
        'SELECT starts_on, amount_cents FROM membership_plans WHERE member_id=? ORDER BY starts_on'
      )
      .all(id)
  ).toEqual([
    { starts_on: '2026-01-01', amount_cents: 1000 },
    { starts_on: '2026-12-01', amount_cents: 2000 }
  ])
  const periods = contributionPeriods(id, '2026-12-31')
  expect(periods.find((period) => period.periodKey === '2026-11')).toMatchObject({ expected: 10 })
  expect(periods.find((period) => period.periodKey === '2026-12')).toMatchObject({ expected: 20 })
})

test.each([
  ['contribution_effective_date', '2026-12-01'],
  ['next_due_date', '2026-12-01'],
  ['contribution_effective_date', '2027-04-31'],
  ['next_due_date', '2027-04-31']
] as const)('still rejects explicit invalid %s=%s and rolls back the update', (field, date) => {
  const id = member('2027-03-15')
  expect(() => updateMember({ id, contribution_amount: 20, [field]: date })).toThrow(
    'Bitte ein gültiges Datum für die Beitragsänderung ab Eintritt angeben.'
  )
  expect(db.prepare('SELECT contribution_amount FROM members WHERE id=?').get(id)).toEqual({
    contribution_amount: 10
  })
  expect(
    db.prepare('SELECT starts_on, amount_cents FROM membership_plans WHERE member_id=?').all(id)
  ).toEqual([{ starts_on: '2027-03-15', amount_cents: 1000 }])
})

test('preserves an explicit valid change date instead of replacing it with the entry date', () => {
  const id = member('2027-03-15')
  updateMember({ id, contribution_amount: 20, contribution_effective_date: '2027-04-15' })
  expect(
    db
      .prepare(
        'SELECT starts_on, amount_cents FROM membership_plans WHERE member_id=? ORDER BY starts_on'
      )
      .all(id)
  ).toEqual([
    { starts_on: '2027-03-15', amount_cents: 1000 },
    { starts_on: '2027-04-15', amount_cents: 2000 }
  ])
})
