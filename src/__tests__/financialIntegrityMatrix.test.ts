import type Database from 'better-sqlite3'
import { openTestLedger } from './fixtures/ledgerDatabase'
import { cashBalance, createVoucher, dailyVouchers, monthlyVouchers, reverseVoucher, summarizeVouchers } from '../../electron/main/repositories/vouchers'
import { budgetUsage } from '../../electron/main/repositories/budgets'
import { bindingUsage, deleteBinding } from '../../electron/main/repositories/bindings'

import { exportReport } from '../../electron/main/services/reportExport'
import { writeReportPdf } from '../../electron/main/services/reportPdf'

jest.mock('../../electron/main/services/reportPdf', () => ({ writeReportPdf: jest.fn() }))
jest.mock('../../electron/main/services/exportPaths', () => ({ createExportStamp: () => 'test', ensureExportsDir: async () => '.' }))

jest.mock('../../electron/main/db/database', () => ({ getDb: jest.fn(), withTransaction: jest.fn() }))

const date = '2024-03-12'
const end = '9999-12-31'
let db: Database.Database
let cash: number, checking: number, savings: number
beforeEach(() => {
  db = openTestLedger()
  const idFor = db.prepare('SELECT id FROM payment_accounts WHERE kind=? ORDER BY id LIMIT 1')
  cash = (idFor.get('CASH') as { id: number }).id
  checking = (idFor.get('BANK') as { id: number }).id
  savings = Number(db.prepare("INSERT INTO payment_accounts(name,kind) VALUES ('Rücklage','BANK')").run().lastInsertRowid)
  db.exec(`INSERT INTO budgets(id,year,sphere,name,enforce_time_range) VALUES
    (31,2024,'IDEELL','Jugend',0),(32,2024,'IDEELL','Freizeit',0);
    INSERT INTO earmarks(id,code,name,is_active) VALUES (41,'A','Spenden',1),(42,'B','Förderung',1)`)
})
afterEach(() => db.close())

function book(type: 'IN' | 'OUT' | 'TRANSFER' | 'INTERNAL', grossAmount: number, options: Partial<Parameters<typeof createVoucher>[0]> = {}) {
  return createVoucher({ date, type, grossAmount, sphere:'IDEELL', vatRate:0, ...options }).id!
}
type Filters = Parameters<typeof monthlyVouchers>[0]
function movement(series: typeof monthlyVouchers | typeof dailyVouchers, filter: Filters) {
  return series(filter).reduce((sum, item) => sum + item.gross, 0)
}
function magnitude(filter: Filters, type: 'IN' | 'OUT') {
  return summarizeVouchers(filter).byType.find(row => row.key === type)?.gross || 0
}

test.each([
  ['bank to cash', 'checking', 'cash', 20, -20, 20],
  ['cash to bank signed', 'cash', 'checking', -20, -20, 20],
  ['bank to bank', 'checking', 'savings', 20, 0, 0],
] as const)('%s conserves the actual cash/bank position before and after reversal', (_, from, to, amount, bankDelta, cashDelta) => {
  const ids = { cash, checking, savings }
  const id = book('TRANSFER', amount, { transferFromAccountId: ids[from], transferToAccountId: ids[to] })
  for (const reversed of [false, true]) {
    if (reversed) reverseVoucher(id, null)
    const multiplier = reversed ? 0 : 1
    const expected = { BANK: bankDelta * multiplier || 0, BAR: cashDelta * multiplier || 0 }
    const position = cashBalance({to: end})
    expect({BANK:position.BANK, BAR:position.BAR}).toEqual(expected)
    for (const method of ['BANK', 'BAR'] as const) {
      const filter = {paymentMethod:method}
      const inMinusOut = magnitude(filter, 'IN') - magnitude(filter, 'OUT')
      expect({
        daily: movement(dailyVouchers, filter),
        monthly: movement(monthlyVouchers, filter),
        splitMonthly: movement(monthlyVouchers, {...filter, type:'IN'}) + movement(monthlyVouchers, {...filter, type:'OUT'}),
        summary: inMinusOut,
      }).toEqual({daily:expected[method], monthly:expected[method], splitMonthly:expected[method], summary:expected[method]})
    }
    for (const [account, delta] of [[ids[from], -amount], [ids[to], amount]]) {
      const expectedAccount = multiplier * delta || 0
      const accountFilter = {paymentAccountId:account}
      expect(position.accounts.find(row => row.id === account)?.balance).toBe(expectedAccount)
      expect(movement(monthlyVouchers, accountFilter)).toBe(expectedAccount)
      const method = account === cash ? 'BAR' : 'BANK'
      expect(movement(monthlyVouchers, {...accountFilter, paymentMethod:method})).toBe(expectedAccount)
    }
  }
})

test.each(['IN','OUT'] as const)('%s refund uses the same sign for partial budgets, earmarks and cash', type => {
  const id = book(type, -80, { paymentAccountId:checking, budgets:[{budgetId:31,amount:30},{budgetId:32,amount:50}],
    earmarks:[{earmarkId:41,amount:30},{earmarkId:42,amount:50}] })
  const sign = type === 'IN' ? -1 : 1
  const before = {
    total:cashBalance({to:end}).BANK, cashBudget:cashBalance({to:end,budgetId:31}).BANK,
    budget:budgetUsage({budgetId:31}).balance, earmark:bindingUsage(41).balance,
    reportBudget:movement(monthlyVouchers,{budgetId:31}), reportEarmark:movement(monthlyVouchers,{earmarkId:41})
  }
  expect(before).toEqual({total:80*sign,cashBudget:30*sign,budget:30*sign,earmark:30*sign,reportBudget:80*sign,reportEarmark:80*sign})
  reverseVoucher(id,null)
  expect([cashBalance({to:end}).BANK,cashBalance({to:end,budgetId:31}).BANK,budgetUsage({budgetId:31}).balance,bindingUsage(41).balance]).toEqual([0,0,0,0])
})

it('ignores stale legacy allocation columns when split rows exist, uses full gross for unquantified legacy rows', () => {
  const legacy = book('OUT',40,{paymentAccountId:checking})
  db.prepare('UPDATE vouchers SET budget_id=31,budget_amount=0,earmark_id=41,earmark_amount=0 WHERE id=?').run(legacy)
  const split = book('IN',70,{paymentAccountId:checking,budgets:[{budgetId:32,amount:70}],earmarks:[{earmarkId:42,amount:70}]})
  db.prepare('UPDATE vouchers SET budget_id=31,budget_amount=10,earmark_id=41,earmark_amount=10 WHERE id=?').run(split)
  expect({
    budgetCash:cashBalance({to:end,budgetId:31}).BANK,
    budgetUsage:budgetUsage({budgetId:31}).balance, earmarkUsage:bindingUsage(41).balance,
    budgetReport:movement(dailyVouchers,{budgetId:31}), earmarkReport:movement(dailyVouchers,{earmarkId:41})
  }).toEqual({budgetCash:-40,budgetUsage:-40,earmarkUsage:-40,budgetReport:-40,earmarkReport:-40})
})

it('reverses a signed INTERNAL allocation across a budget and earmark without a physical account movement', () => {
  const id = book('INTERNAL',60,{budgets:[{budgetId:31,amount:-60}],earmarks:[{earmarkId:41,amount:60}]})
  expect([budgetUsage({budgetId:31}).balance,bindingUsage(41).balance,cashBalance({to:end}).BANK,cashBalance({to:end}).BAR]).toEqual([-60,60,0,0])
  reverseVoucher(id,null)
  expect([budgetUsage({budgetId:31}).balance,bindingUsage(41).balance,cashBalance({to:end}).BANK,cashBalance({to:end}).BAR]).toEqual([0,0,0,0])
})

it('protects an earmark referenced exclusively by a secondary split', () => {
  book('IN', 100, {paymentAccountId: checking, earmarks: [{earmarkId:41,amount:30},{earmarkId:42,amount:70}]})
  expect(bindingUsage(42).balance).toBe(70)
  expect(() => deleteBinding(42)).toThrow()
  expect(bindingUsage(42).balance).toBe(70)
})

it('derives the earmark overdraft warning from the same signed position as the ledger', () => {
  book('INTERNAL',60,{budgets:[{budgetId:31,amount:-60}],earmarks:[{earmarkId:41,amount:60}]})
  const receipt = createVoucher({date,type:'OUT',sphere:'IDEELL',vatRate:0,grossAmount:10,
    paymentAccountId:checking,earmarks:[{earmarkId:41,amount:10}]})
  expect(bindingUsage(41).balance).toBe(50)
  expect(receipt.warnings).toEqual([])
})

it('the selected bank balance contains only that account’s leg of a same-method transfer', () => {
  book('TRANSFER',30,{transferFromAccountId:checking,transferToAccountId:savings})
  const balance = cashBalance({to:end,paymentAccountId:savings})
  expect({total:balance.BANK, selected:balance.accounts.find(row=>row.id===savings)?.balance,
    other:balance.accounts.find(row=>row.id===checking)?.balance ?? 0}).toEqual({total:30,selected:30,other:0})
})

it('includes the actual source document when a transfer contributes income to an account-filtered PDF', async () => {
  const id = book('TRANSFER',30,{transferFromAccountId:cash,transferToAccountId:checking})
  const { voucherNo } = db.prepare('SELECT voucher_no AS voucherNo FROM vouchers WHERE id=?').get(id) as { voucherNo:string }
  await exportReport({type:'JOURNAL',format:'PDF',from:date,to:date,filters:{paymentMethod:'BANK',type:'IN'}})
  const { html } = jest.mocked(writeReportPdf).mock.calls.at(-1)![0]
  expect(html).toContain('Einnahmen (Brutto)</div><div class="value">30.00 €')
  expect(html.includes(voucherNo)).toBe(true)
  expect(html).toContain('Insgesamt 1 Beleg(e)')
})

it('reconciles 120 mixed bookings and their reversals against independent integer-cent accounts', () => {
  const reference = new Map([[checking, 0], [savings, 0], [cash, 0]])
  const post = (account: number, cents: number) => reference.set(account, reference.get(account)! + cents)
  for (let i = 0; i < 120; i++) {
    const cents = (i * 719 + 13) % 15000 + 1
    const amount = cents / 100
    const bank = i % 2 ? checking : savings
    const date = i < 60 ? '2024-03-12' : '2024-04-02'
    let id: number
    if (i % 4 === 0) {
      id = book('TRANSFER', amount, { date, transferFromAccountId: bank, transferToAccountId: cash })
      if (i % 5 !== 0) {
        post(bank, -cents)
        post(cash, cents)
      }
    } else {
      const type = i % 3 === 0 ? 'OUT' : 'IN'
      const sign = i % 7 === 0 ? -1 : 1
      id = book(type, sign * amount, { date, paymentAccountId: bank, vatRate: 19 })
      if (i % 5 !== 0) post(bank, (type === 'OUT' ? -1 : 1) * sign * cents)
    }
    if (i % 5 === 0) reverseVoucher(id, null)
  }
  const result = cashBalance({ to: end })
  for (const [id, cents] of reference) {
    expect(result.accounts.find(row => row.id === id)?.balance).toBe(cents / 100)
  }
  expect(result.BANK).toBe((reference.get(checking)! + reference.get(savings)!) / 100)
  expect(result.BAR).toBe(reference.get(cash)! / 100)
  const total = [...reference.values()].reduce((sum, cents) => sum + cents, 0)
  expect(total).toBe(97482)
  for (const series of [dailyVouchers, monthlyVouchers]) {
    expect(series({}).reduce((sum, row) => sum + Math.round(row.gross * 100), 0)).toBe(total)
  }
  const badRows = db.prepare(`SELECT COUNT(*) AS n FROM vouchers
    WHERE ROUND(gross_amount*100) != ROUND(net_amount*100) + ROUND(vat_amount*100)`).get()
  expect(badRows).toMatchObject({ n: 0 })
})
