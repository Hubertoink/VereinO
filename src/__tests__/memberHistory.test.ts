import type Database from 'better-sqlite3'
import ExcelJS from 'exceljs'
import { getDb, withTransaction } from '../../electron/main/db/database'
import { migrateMembershipLedger } from '../../electron/main/db/membershipLedger'
import { createMember, updateMember } from '../../electron/main/repositories/members'
import { getMemberHistory } from '../../electron/main/repositories/memberHistory'
import { deleteMember } from '../../electron/main/repositories/members'
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
    CREATE TABLE audit_log (id INTEGER PRIMARY KEY, user_id INTEGER, entity TEXT, entity_id INTEGER, action TEXT, diff_json TEXT, hash TEXT, created_at TEXT);
    CREATE INDEX idx_audit_entity_record ON audit_log(entity, entity_id, id);
    CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT UNIQUE);
    CREATE TABLE member_tags (member_id INTEGER, tag_id INTEGER, PRIMARY KEY(member_id, tag_id));
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


const member = (memberNo = '001') => createMember({ memberNo, name: 'Erika Muster', join_date: '2026-01-01' }).id
const history = (memberId: number) => getMemberHistory({ memberId, limit: 30 }).rows

test('records creation and changed fields, but not timestamps or unchanged saves', () => {
  const id = member()
  expect(history(id)).toHaveLength(1)
  expect(history(id)[0]).toMatchObject({ action: 'CREATE', changes: expect.arrayContaining([{ field: 'name', before: null, after: 'Erika Muster' }]) })
  updateMember({ id, name: 'Erika Neu', status: 'PAUSED', notes: 'Neue Adresse folgt', tags: ['B', 'A'] })
  expect(history(id)[0]).toMatchObject({ action: 'UPDATE', changes: expect.arrayContaining([
    { field: 'name', before: 'Erika Muster', after: 'Erika Neu' },
    { field: 'status', before: 'ACTIVE', after: 'PAUSED' },
    { field: 'notes', before: null, after: 'Neue Adresse folgt' },
    { field: 'tags', before: [], after: ['A', 'B'] }
  ]) })
  const count = history(id).length
  updateMember({ id, name: 'Erika Neu', status: 'PAUSED', notes: 'Neue Adresse folgt', tags: ['A', 'B'] })
  expect(history(id)).toHaveLength(count)
  updateMember({ id, notes: null, tags: [] })
  expect(history(id)[0].changes).toEqual(expect.arrayContaining([
    { field: 'notes', before: 'Neue Adresse folgt', after: null },
    { field: 'tags', before: ['A', 'B'], after: [] }
  ]))
})

test('paginates per member and excludes the history of a deleted member with a reused ID', () => {
  const first = member(), second = member('002')
  updateMember({ id: first, email: 'new@example.test' })
  const newest = getMemberHistory({ memberId: first, limit: 1 })
  expect(newest.hasMore).toBe(true)
  expect(newest.rows[0].action).toBe('UPDATE')
  const older = getMemberHistory({ memberId: first, limit: 1, beforeId: newest.rows[0].id })
  expect(older.hasMore).toBe(false)
  expect(older.rows[0].action).toBe('CREATE')
  expect(history(second)).toHaveLength(1)
  deleteMember(second)
  expect(() => history(second)).toThrow('Mitglied nicht gefunden')
  const replacement = member('003')
  expect(replacement).toBe(second)
  expect(history(replacement)).toHaveLength(1)
  expect(history(replacement)[0].changes).toContainEqual({ field: 'memberNo', before: null, after: '003' })
})

test('rolls back member changes if recording history fails', () => {
  const id = member()
  db.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END")
  expect(() => updateMember({ id, name: 'Must roll back' })).toThrow('audit unavailable')
  expect(db.prepare('SELECT name FROM members WHERE id=?').get(id)).toEqual({ name: 'Erika Muster' })
  expect(history(id)).toHaveLength(1)
})

test('records imports through the same history, including contribution effective dates', async () => {
  const id = createMember({ memberNo: '001', name: 'Erika Muster', join_date: '2027-03-15', contribution_amount: 10, contribution_interval: 'MONTHLY' }).id
  const workbook = new ExcelJS.Workbook()
  workbook.addWorksheet('Mitglieder').addRows([
    ['Mitgliedsnummer', 'Name', 'Eintrittsdatum', 'Beitrag'], ['001', 'Erika Import', '15.03.2027', 20]
  ])
  const result = await executeMembersImport(Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64'),
    { memberNo: 'Mitgliedsnummer', name: 'Name', join_date: 'Eintrittsdatum', contribution_amount: 'Beitrag' }, { updateExisting: true })
  expect(result.updated).toBe(1)
  expect(history(id)[0].changes).toEqual(expect.arrayContaining([
    { field: 'name', before: 'Erika Muster', after: 'Erika Import' },
    { field: 'contribution_amount', before: 10, after: 20 }
  ]))
  updateMember({ id, contribution_effective_date: '2027-04-01', contribution_amount: 25 })
  expect(history(id)[0].changes).toContainEqual({ field: 'contribution_effective_date', before: '2027-03-15', after: '2027-04-01' })
})
