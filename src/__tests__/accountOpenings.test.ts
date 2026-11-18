jest.mock('../../electron/main/db/database', () => ({ getDb: jest.fn() }))
import { applyMigrations } from '../../electron/main/db/migrations'
import { ReportsCashBalanceOutput } from '../../electron/main/ipc/schemas/reports'
import { getDb } from '../../electron/main/db/database'
import { listAccountOpenings, previewOpeningVoucher } from '../../electron/main/repositories/accountOpenings'
import { buildDashboardMonths } from '../renderer/views/DashboardPlus/dashboardPlusModel'
import { accountPositionAt, totalAccountBalance } from '../renderer/utils/accountBalance'
import { cashBalance, listVoucherYears, monthlyVouchers, summarizeVouchers } from '../../electron/main/repositories/vouchers'
import { configureSetupAccounts, listPaymentAccounts, upsertPaymentAccount } from '../../electron/main/repositories/paymentAccounts'
import { setSetting } from '../../electron/main/services/settings'

const Sqlite = require('node:sqlite').DatabaseSync
let db: any
let bankId: number
const date = '2025-12-31'
const opening = { date, amountCents: -12345 }
const saveBank = (changes: Partial<Parameters<typeof upsertPaymentAccount>[0]>) =>
  upsertPaymentAccount({ id: bankId, name: 'Bank', kind: 'BANK', sortOrder: 2, ...changes })

beforeEach(() => {
  db = new Sqlite(':memory:')
  db.transaction = (fn: () => unknown) => () => {
    db.exec('BEGIN')
    try { const result = fn(); db.exec('COMMIT'); return result }
    catch (error) { db.exec('ROLLBACK'); throw error }
  }
  jest.mocked(getDb).mockReturnValue(db)
  applyMigrations(db)
  bankId = listPaymentAccounts().find(account => account.kind === 'BANK')!.id
  db.prepare(`INSERT INTO vouchers(year, seq_no, voucher_no, date, type, sphere, gross_amount, payment_method, payment_account_id)
    VALUES (2025, 1, 'START-1', ?, 'OUT', 'IDEELL', 123.45, 'BANK', ?)`).run(date, bankId)
})
afterEach(() => db.close())

test('upgrading preserves historical vouchers and their balances until the user explicitly converts one', () => {
  db.exec('DROP TABLE payment_account_openings; DELETE FROM migrations WHERE version=47')
  applyMigrations(db)
  expect(cashBalance({ to: date }).BANK).toBe(-123.45)
  expect(listPaymentAccounts().find(account => account.id === bankId)?.openingCents).toBeNull()
  expect(previewOpeningVoucher(bankId, 'START-1')).toMatchObject(opening)
  expect(db.prepare('SELECT COUNT(*) AS n FROM vouchers').get().n).toBe(1)
  saveBank({ opening, openingVoucherNo: 'START-1' })
  expect(listVoucherYears()).toEqual([2025])
  expect(cashBalance({ to: '2025-12-30' }).BANK).toBe(0)
  expect(cashBalance({ to: date }).BANK).toBe(-123.45)
  expect(cashBalance({ to: '2027-12-31' }).accounts.find(a => a.id === bankId)?.balance).toBe(-123.45)
  expect(cashBalance({ from: '2026-01-01', to: '2026-12-31' }).BANK).toBe(0)
  expect(cashBalance({ to: date, sphere: 'IDEELL' }).BANK).toBe(0)
  expect(db.prepare('SELECT COUNT(*) AS n FROM vouchers').get().n).toBe(0)
  expect(db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action IN ('OPENING_BALANCE','CONVERT_TO_OPENING')").get().n).toBe(2)
})

test('bank, cash and Dashboard Plus reconcile after converting a positive opening, including transfers', () => {
  db.exec('DELETE FROM vouchers')
  const cashId = listPaymentAccounts().find(account => account.kind === 'CASH')!.id
  const insert = db.prepare(`INSERT INTO vouchers(year, seq_no, voucher_no, date, type, sphere, gross_amount, payment_method, payment_account_id)
    VALUES (2026, ?, ?, ?, ?, 'IDEELL', ?, ?, ?)`)
  insert.run(1, 'START', '2026-01-01', 'IN', 1000, 'BANK', bankId)
  insert.run(2, 'IN', '2026-11-02', 'IN', 1250, 'BANK', bankId)
  insert.run(3, 'OUT', '2026-11-12', 'OUT', 973.87, 'BANK', bankId)
  insert.run(4, 'CASH-IN', '2026-11-13', 'IN', 118.58, 'BAR', cashId)
  insert.run(5, 'CASH-OUT', '2026-11-13', 'OUT', 1518.58, 'BAR', cashId)
  const to = '2026-11-18'
  const before = cashBalance({ to })
  saveBank({ opening: { date: '2026-01-01', amountCents: 100000 }, openingVoucherNo: 'START' })
  const after = cashBalance({ to })
  expect(after).toEqual(before)
  expect(after).toMatchObject({ BANK: 1276.13, BAR: -1400 })
  const months = buildDashboardMonths(['2026-01', '2026-11'], monthlyVouchers({ to, type: 'IN' }), monthlyVouchers({ to, type: 'OUT' }), 0, listAccountOpenings(to))
  expect(months[0].balance).toBe(1000)
  expect(months[1]).toMatchObject({ income: 1368.58, expense: 2492.45, balance: -123.87 })
  expect(totalAccountBalance(after)).toBe(months[1].balance)
  db.prepare(`INSERT INTO vouchers(year,seq_no,voucher_no,date,type,sphere,gross_amount,transfer_from,transfer_to,transfer_from_account_id,transfer_to_account_id)
    VALUES (2026,6,'TRANSFER',?,'TRANSFER','IDEELL',80,'BANK','BAR',?,?)`).run(to, bankId, cashId)
  const transferred = cashBalance({ to })
  expect(transferred.accounts.find(account => account.id === bankId)?.balance).toBe(1196.13)
  const november = { from: '2026-11-01', to }
  const bankTotals = summarizeVouchers({ ...november, paymentAccountId: bankId })
  expect(bankTotals.byPaymentAccount.find(a => a.accountId === bankId)?.bookingNet).toBe(196.13)
  const organization = summarizeVouchers(november).byPaymentAccount
  expect(organization.find(a => a.accountId === bankId)?.bookingNet).toBe(276.13)
  expect(organization.find(a => a.accountId === cashId)?.bookingNet).toBe(-1400)
  expect(accountPositionAt(ReportsCashBalanceOutput.parse(transferred), listPaymentAccounts(), { to, paymentAccountId: bankId }))
    .toMatchObject({ opening: 1000, saldo: 1196.13 })
  expect(totalAccountBalance(transferred)).toBe(-123.87)
})

test('failed conversions roll back account edits and preserve files, vouchers and balances', () => {
  expect(() => saveBank({ name: 'Fehler', opening, openingVoucherNo: 'FALSCH' })).toThrow('Belegnummer')
  db.exec("INSERT INTO voucher_files(voucher_id,file_name,file_path) VALUES(1,'original.pdf','original.pdf')")
  expect(() => saveBank({ name: 'Fehler', opening, openingVoucherNo: 'START-1' })).toThrow('verknüpft')
  expect(listPaymentAccounts().find(a => a.id === bankId)).toMatchObject({ name: 'Bank', openingDate: null, bookingCount: 1 })
  expect(db.prepare('SELECT COUNT(*) AS n FROM voucher_files').get().n).toBe(1)
})

test('keeps signed openings distinct per account, preserves omitted values and enforces period locks', () => {
  saveBank({ opening: { date, amountCents: 25000 } })
  saveBank({ color: '#112233' })
  const cash = listPaymentAccounts().find(a => a.kind === 'CASH')!
  upsertPaymentAccount({ ...cash, isActive: true, opening })
  expect(cashBalance({ to: date })).toMatchObject({ BANK: 126.55, BAR: -123.45 })
  expect(cashBalance({ to: date, paymentAccountId: cash.id })).toMatchObject({ BANK: 0, BAR: -123.45 })
  expect(() => saveBank({ opening: { date: '2026-02-30', amountCents: 100 } })).toThrow('Stichtag')
  expect(() => saveBank({ opening: null, previousOpening: opening })).toThrow('zwischenzeitlich')
  setSetting('period_lock', { closedUntil: date }, db)
  expect(() => saveBank({ opening: null })).toThrow('abgeschlossen')
  expect(() => saveBank({ opening: { date: '2026-01-01', amountCents: 25000 } })).toThrow('abgeschlossen')
  expect(cashBalance({ to: date }).BANK).toBe(126.55)
})

test('setup applies account choices and openings together without creating vouchers', () => {
  const cashId = listPaymentAccounts().find(account => account.kind === 'CASH')!.id
  const create = [{ name: 'Festkasse', kind: 'CASH' as const, opening }]
  expect(() => configureSetupAccounts({ create, activation: [{ accountId: bankId, active: false }], openings: [] })).toThrow('Buchungen')
  expect(listPaymentAccounts().some(account => account.name === 'Festkasse')).toBe(false)
  const rows = configureSetupAccounts({ create, activation: [{ accountId: cashId, active: false }], openings: [] })
  expect(rows.find(account => account.id === cashId)?.isActive).toBe(0)
  expect(rows.find(account => account.name === 'Festkasse')).toMatchObject({ isActive: 1, openingCents: opening.amountCents, openingDate: date })
  expect(db.prepare('SELECT COUNT(*) AS n FROM vouchers').get().n).toBe(1)
})
