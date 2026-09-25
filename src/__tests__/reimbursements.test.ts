import type Database from 'better-sqlite3'
const SqliteDatabase: new (path: string) => Database.Database = (() => {
  try { return require('node:sqlite').DatabaseSync }
  catch { return require('better-sqlite3') }
})()
jest.mock('../../electron/main/db/database', () => ({ getDb: jest.fn(), withTransaction: jest.fn() }))
jest.mock('../../electron/main/services/audit', () => ({ writeAudit: jest.fn() }))
import { getDb, withTransaction } from '../../electron/main/db/database'
import { ensureReimbursementTables } from '../../electron/main/db/reimbursements'
import { createReimbursement, linkReimbursement, unlinkReimbursement, deleteReimbursement, getReimbursement, reimbursementCandidates } from '../../electron/main/repositories/reimbursements'
import { createReimbursementTools } from '../../electron/main/services/aiReimbursementTools'
import { previewReimbursementAction, applyReimbursementAction, applyReimbursementActions } from '../../electron/main/services/reimbursementActions'

describe('cost reimbursements with real SQLite', () => {
  let db: Database.Database
  beforeEach(() => {
    db = new SqliteDatabase(':memory:')
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE payment_accounts (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE vouchers (id INTEGER PRIMARY KEY, voucher_no TEXT, date TEXT, type TEXT,
        description TEXT, gross_amount REAL, payment_account_id INTEGER, original_id INTEGER, reversed_by_id INTEGER);
      INSERT INTO payment_accounts VALUES (1,'Kasse'),(2,'Bank');
      INSERT INTO vouchers VALUES (1,'A1','2026-09-01','OUT','Lebensmittel',100,1,NULL,NULL),
        (2,'A2','2026-09-02','OUT','Material',50,1,NULL,NULL),
        (3,'E1','2026-09-03','IN','Erstattung',60,2,NULL,NULL),
        (4,'E2','2026-09-04','IN','Sammelzahlung',100,2,NULL,NULL);`)
    ensureReimbursementTables(db)
    jest.mocked(getDb).mockReturnValue(db)
    let depth = 0
    jest.mocked(withTransaction).mockImplementation(fn => {
      const savepoint = `test_${++depth}`
      db.exec(`SAVEPOINT ${savepoint}`)
      try { const result = fn(db); db.exec(`RELEASE ${savepoint}`); return result }
      catch (error) { db.exec(`ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`); throw error }
    })
  })
  afterEach(() => db.close())
  const create = (voucherId = 1, amountCents = 10000) => createReimbursement({ title: 'Sommerfest', partner: 'Partner', voucherId, amountCents })

  it('is idempotent and tracks partial then full reimbursement without creating bookings', () => {
    ensureReimbursementTables(db)
    const item = create()
    expect(item).toMatchObject({ expectedCents: 10000, paidCents: 0, status: 'OPEN' })
    expect(linkReimbursement({ id: item.id, voucherId: 3, role: 'PAYMENT', amountCents: 6000 })).toMatchObject({ status: 'PARTIAL', remainingCents: 4000 })
    const paid = linkReimbursement({ id: item.id, voucherId: 4, role: 'PAYMENT', amountCents: 4000 })
    expect(paid).toMatchObject({ status: 'PAID', remainingCents: 0 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM vouchers').get()).toMatchObject({ n: 4 })
    expect(unlinkReimbursement({ id: item.id, linkId: paid.links.find(l => l.id === 4)!.linkId }).remainingCents).toBe(4000)
  })
  it('supports several expenses and distributes a collective payment across cases', () => {
    const first = create(1, 5000)
    linkReimbursement({ id: first.id, voucherId: 2, role: 'EXPENSE', amountCents: 2000 })
    const second = create(1, 5000)
    linkReimbursement({ id: first.id, voucherId: 4, role: 'PAYMENT', amountCents: 7000 })
    expect(linkReimbursement({ id: second.id, voucherId: 4, role: 'PAYMENT', amountCents: 3000 }).remainingCents).toBe(2000)
    expect(() => linkReimbursement({ id: second.id, voucherId: 4, role: 'PAYMENT', amountCents: 1 })).toThrow()
    expect(() => create(1, 1)).toThrow()
  })
  it('rejects duplicate, overpaid, wrong-direction and non-cent allocations atomically', () => {
    const item = create(1, 5000)
    for (const input of [
      { voucherId: 1, role: 'EXPENSE' as const, amountCents: 1 },
      { voucherId: 3, role: 'PAYMENT' as const, amountCents: 5001 },
      { voucherId: 2, role: 'PAYMENT' as const, amountCents: 1 },
      { voucherId: 3, role: 'PAYMENT' as const, amountCents: 1.5 }
    ]) expect(() => linkReimbursement({ id: item.id, ...input })).toThrow()
    expect(() => create(3)).toThrow()
    expect(db.prepare('SELECT COUNT(*) AS n FROM reimbursements').get()).toMatchObject({ n: 1 })
    expect(getReimbursement(item.id).links).toHaveLength(1)
  })
  it('protects linked bookings against deletion, reversal, direction and amount changes', () => {
    const item = create()
    for (const sql of ['DELETE FROM vouchers WHERE id=1', 'UPDATE vouchers SET reversed_by_id=99 WHERE id=1', "UPDATE vouchers SET type='IN' WHERE id=1", 'UPDATE vouchers SET gross_amount=99 WHERE id=1']) {
      expect(() => db.exec(sql)).toThrow(/Zuordnung/)
    }
    db.exec("UPDATE vouchers SET description='Updated' WHERE id=1")
    deleteReimbursement(item.id)
    db.exec('DELETE FROM vouchers WHERE id=1')
  })
  it('requires unlinking payments before removing their expense or case', () => {
    const item = create()
    linkReimbursement({ id: item.id, voucherId: 3, role: 'PAYMENT', amountCents: 6000 })
    expect(() => unlinkReimbursement({ id: item.id, linkId: item.links[0].linkId })).toThrow()
    expect(() => deleteReimbursement(item.id)).toThrow()
    expect(getReimbursement(item.id).paidCents).toBe(6000)
  })
  it('excludes reversals from selectable bookings', () => {
    db.exec('UPDATE vouchers SET reversed_by_id=99 WHERE id=1; UPDATE vouchers SET original_id=99 WHERE id=2')
    expect(reimbursementCandidates({ role: 'EXPENSE' })).toEqual([])
  })

  it('lets the agent inspect real data and prepare creation without saving until approval', async () => {
    const tools = createReimbursementTools()
    const prepare = tools.find(t => t.name === 'reimbursement_action_draft_prepare')!
    const result = await prepare.run({ action: 'CREATE', title: 'Fest', partner: 'Partner', voucherId: 1, amountCents: 10000 })
    expect(result.draft?.kind).toBe('reimbursementAction')
    expect(db.prepare('SELECT COUNT(*) AS n FROM reimbursements').get()).toMatchObject({ n: 0 })
    const preview = (result.draft!.payload as any).changes[0]
    const saved = applyReimbursementAction(preview)!
    expect(saved.expectedCents).toBe(10000)
    expect(() => applyReimbursementAction(preview)).toThrow()
    const search = await tools.find(t => t.name === 'reimbursements_search')!.run({ q: 'Partner', status: 'OPEN' })
    expect(search.data).toMatchObject({ count: 1, remainingCents: 10000 })
    expect((await tools.find(t => t.name === 'reimbursement_get')!.run({ id: saved.id })).data).toMatchObject({ links: [expect.objectContaining({ id: 1 })] })
    expect((await tools.find(t => t.name === 'reimbursement_candidates')!.run({ role: 'PAYMENT' })).data).toHaveLength(2)
    expect(tools.filter(t => t.readOnly)).toHaveLength(3)
  })
  it('applies metadata edits and payment links after review, and rejects stale snapshots', () => {
    const item = create()
    const edit = previewReimbursementAction({ action: 'UPDATE', id: item.id, title: 'Neu', partner: 'Partner', dueDate: '2026-10-01', note: 'Abrechnung versandt' })
    const stalePayment = previewReimbursementAction({ action: 'LINK', id: item.id, voucherId: 3, role: 'PAYMENT', amountCents: 6000 })
    expect(applyReimbursementAction(edit)).toMatchObject({ title: 'Neu', note: 'Abrechnung versandt' })
    expect(() => applyReimbursementAction(stalePayment)).toThrow(/geändert/)
    const freshPayment = previewReimbursementAction(stalePayment.command)
    expect(applyReimbursementAction(freshPayment)).toMatchObject({ remainingCents: 4000 })
    const link = getReimbursement(item.id).links.find(link => link.role === 'PAYMENT')!
    applyReimbursementAction(previewReimbursementAction({ action: 'UNLINK', id: item.id, linkId: link.linkId }))
    applyReimbursementAction(previewReimbursementAction({ action: 'DELETE', id: item.id }))
    expect(() => getReimbursement(item.id)).toThrow()
    expect(db.prepare('SELECT COUNT(*) AS n FROM vouchers').get()).toMatchObject({ n: 4 })
  })
  it('rejects invalid agent proposals before presenting a review', () => {
    const item = create()
    expect(() => previewReimbursementAction({ action: 'LINK', id: item.id, voucherId: 3, role: 'PAYMENT', amountCents: 6001 })).toThrow()
    expect(() => previewReimbursementAction({ action: 'LINK', id: item.id, voucherId: 2, role: 'PAYMENT', amountCents: 1 })).toThrow()
    expect(() => previewReimbursementAction({ action: 'UPDATE', id: item.id, title: 'Neu' })).toThrow()
  })
  it('applies multiple payments atomically and rolls back combined over-allocation', () => {
    const item = create()
    const first = previewReimbursementAction({ action: 'LINK', id: item.id, voucherId: 3, role: 'PAYMENT', amountCents: 6000 })
    const tooMuch = previewReimbursementAction({ action: 'LINK', id: item.id, voucherId: 4, role: 'PAYMENT', amountCents: 5000 })
    expect(() => applyReimbursementActions([first, tooMuch])).toThrow()
    expect(getReimbursement(item.id).paidCents).toBe(0)
    const rest = previewReimbursementAction({ ...tooMuch.command, amountCents: 4000 })
    applyReimbursementActions([first, rest])
    expect(getReimbursement(item.id)).toMatchObject({ paidCents: 10000, status: 'PAID' })
  })
})
