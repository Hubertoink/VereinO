jest.mock('../../electron/main/db/database', () => ({ getDb: jest.fn() }))
import { getDb } from '../../electron/main/db/database'
import { assignmentMonthly } from '../../electron/main/repositories/assignmentMonthly'
import { fillFinanceMonths, financeUsage } from '../renderer/components/finance/financeModel'

const { DatabaseSync } = require('node:sqlite')
let db: any
beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE vouchers (id INTEGER PRIMARY KEY, type TEXT, date TEXT, sphere TEXT, gross_amount REAL, budget_id INTEGER, budget_amount REAL, earmark_id INTEGER, earmark_amount REAL);
    CREATE TABLE voucher_budgets (voucher_id INTEGER, budget_id INTEGER, amount REAL);
    CREATE TABLE voucher_earmarks (voucher_id INTEGER, earmark_id INTEGER, amount REAL);
    INSERT INTO vouchers VALUES
      (1,'OUT','2026-01-01','IDEELL',100,1,100,1,100),
      (2,'IN','2026-02-01','IDEELL',40,1,40,1,40),
      (3,'INTERNAL','2026-02-10','IDEELL',0,NULL,NULL,NULL,NULL),
      (4,'INTERNAL','2026-02-11','IDEELL',0,NULL,NULL,NULL,NULL),
      (5,'OUT','2026-03-01','WGB',200,1,0,1,0);
    INSERT INTO voucher_budgets VALUES (1,1,60),(1,2,40),(3,1,-20),(4,1,10);
    INSERT INTO voucher_earmarks VALUES (1,1,60),(1,2,40),(3,1,-20),(4,1,10);`)
  ;(getDb as jest.Mock).mockReturnValue(db)
})
afterEach(() => db.close())

test.each(['budget', 'earmark'] as const)('%s trends use actual split amounts, legacy rows and both internal directions', kind => {
  const rows = assignmentMonthly(kind, 1)
  expect(rows.map(({ month, inflow, spent }) => ({ month, inflow, spent }))).toEqual([
    { month: '2026-01', inflow: 0, spent: 60 },
    { month: '2026-02', inflow: 50, spent: 20 },
    { month: '2026-03', inflow: 0, spent: 200 }
  ])
  expect(assignmentMonthly(kind, 2)[0].spent).toBe(40)
})

test('date and sphere filters apply before aggregation, including partial months', () => {
  expect(assignmentMonthly('budget', 1, { from: '2026-02-10', to: '2026-02-10' })).toEqual([
    { month: '2026-02', inflow: 0, spent: 20, count: 1, lastDate: '2026-02-10' }
  ])
  expect(assignmentMonthly('earmark', 1, { sphere: 'WGB' }).map(row => row.month)).toEqual(['2026-03'])
  expect(assignmentMonthly('budget', 1, { from: '2027-01-01' })).toEqual([])
})

test('trend gaps are zero, years roll over, and the range is bounded', () => {
  expect(fillFinanceMonths([{ month: '2025-12', spent: 10, inflow: 0 }], '2025-12-01', '2026-02-20')).toEqual([
    { month: '2025-12', spent: 10, inflow: 0 }, { month: '2026-01', spent: 0, inflow: 0 }, { month: '2026-02', spent: 0, inflow: 0 }
  ])
  expect(fillFinanceMonths([], '2020-01-01', '2026-09-26')).toHaveLength(12)
  expect(fillFinanceMonths([], '2026-09-01', '2026-01-01')).toEqual([])
})

test('consumption distinguishes exhausted, overdrawn, inflow surplus and absent plans', () => {
  expect(financeUsage(100, 20, 120)).toMatchObject({ net: 100, remaining: 0, percent: 100, status: 'Aufgebraucht' })
  expect(financeUsage(100, 0, 135)).toMatchObject({ remaining: -35, percent: 135, status: 'Plan überschritten' })
  expect(financeUsage(100, 40, 20)).toMatchObject({ net: -20, remaining: 120, percent: -20 })
  expect(financeUsage(0, 0, 20)).toMatchObject({ percent: null, status: 'Ohne Plan' })
})
