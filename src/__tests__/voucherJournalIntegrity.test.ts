import { ipcMain } from 'electron'
import { registerJournalHandlers } from '../../electron/main/ipc/journal'
import type Database from 'better-sqlite3'
import { repairLinkedVoucherReversals } from '../../electron/main/db/migrations'
import { openTestLedger } from './fixtures/ledgerDatabase'
import {
    batchAssignBudget, batchAssignEarmark, createVoucher, reverseVoucher, updateVoucher, updateVoucherMeta,
    cashBalance, dailyVouchers, monthlyVouchers, summarizeVouchers, listJournalVouchers, getVoucherBudgets, getVoucherEarmarks,
} from '../../electron/main/repositories/vouchers'

jest.mock('../../electron/main/db/database', () => ({ getDb: jest.fn(), withTransaction: jest.fn() }))

jest.mock('electron', () => ({ ipcMain: { handle: jest.fn() } }))
function journalChannel(channel: string) {
    jest.mocked(ipcMain.handle).mockClear()
    registerJournalHandlers(async run => run())
    return jest.mocked(ipcMain.handle).mock.calls.find(([name]) => name === channel)![1]
}

let db: Database.Database
let bank: number
let secondBank: number
const date = '2026-01-15'
function voucher(overrides: Partial<Parameters<typeof createVoucher>[0]> = {}) {
    return createVoucher({ date, type: 'IN', sphere: 'IDEELL', paymentAccountId: secondBank, vatRate: 0, grossAmount: 100, ...overrides }).id!
}
function auditCount() {
    return (db.prepare('SELECT count(*) AS n FROM audit_log').get() as { n: number }).n
}
beforeEach(() => {
    db = openTestLedger()
    bank = (db.prepare("SELECT id FROM payment_accounts WHERE kind='BANK'").get() as { id: number }).id
    secondBank = Number(db.prepare("INSERT INTO payment_accounts(name,kind,sort_order) VALUES ('Bank B','BANK',20)").run().lastInsertRowid)
    db.exec(`INSERT INTO budgets(id, year, sphere, name, enforce_time_range) VALUES
        (10,2026,'IDEELL','A',0),(11,2026,'IDEELL','B',0),(12,2026,'IDEELL','C',0),(13,2027,'IDEELL','Folgemonat',1);
        INSERT INTO earmarks(id,code,name,is_active) VALUES (10,'A','A',1),(11,'B','B',1),(12,'C','C',1)`)
})
afterEach(() => db.close())

test.each(['IN','OUT'] as const)('reversing %s restores each concrete account including negative amounts', type => {
    for (const amount of [100, -20]) {
        const original = voucher({ type, grossAmount: amount })
        const reversal = reverseVoucher(original, null).id
        expect(db.prepare('SELECT payment_account_id AS account, gross_amount AS amount FROM vouchers WHERE id=?').get(reversal))
            .toEqual({account: secondBank, amount})
    }
    const negative = voucher({ type, grossAmount: -119, vatRate: 19 })
    const counter = reverseVoucher(negative, null).id
    expect(db.prepare('SELECT net_amount AS net, vat_amount AS vat, gross_amount AS gross FROM vouchers WHERE id=?').get(counter))
        .toEqual({net:-100,vat:-19,gross:-119})
    const state = cashBalance({to:'9999-12-31'})
    expect(state.accounts.every(account => account.balance === 0)).toBe(true)
})

it('reverses transfer endpoints even when both accounts are banks', () => {
    const original = voucher({ type:'TRANSFER', transferFromAccountId:bank, transferToAccountId:secondBank })
    const reversal = reverseVoucher(original,null).id
    expect(db.prepare('SELECT transfer_from_account_id AS source, transfer_to_account_id AS target FROM vouchers WHERE id=?').get(reversal))
        .toEqual({source:secondBank,target:bank})
    expect(cashBalance({to:'9999-12-31'}).accounts.every(account => account.balance === 0)).toBe(true)
})

it('inverts signed INTERNAL allocations without affecting account balances', () => {
    const original = voucher({type:'INTERNAL',budgets:[{budgetId:10,amount:-100}],earmarks:[{earmarkId:11,amount:100}]})
    const reversal = reverseVoucher(original,null).id
    expect(db.prepare('SELECT type,budget_amount AS budget,earmark_amount AS earmark FROM vouchers WHERE id=?').get(reversal))
        .toEqual({type:'INTERNAL',budget:100,earmark:-100})
    expect(getVoucherBudgets(reversal)[0].amount).toBe(100)
    expect(getVoucherEarmarks(reversal)[0].amount).toBe(-100)
    expect(cashBalance({to:'9999-12-31'}).accounts.every(account => account.balance === 0)).toBe(true)
})

it('repairs reciprocal generated reversals idempotently and leaves unverified links alone', () => {
    const original = voucher()
    const reversal = reverseVoucher(original,null).id
    db.prepare('UPDATE vouchers SET payment_account_id=? WHERE id=?').run(bank,reversal)
    const unrelated = voucher({type:'OUT',paymentAccountId:bank})
    db.prepare("UPDATE vouchers SET original_id=?, description='Extern' WHERE id=?").run(unrelated,unrelated)
    repairLinkedVoucherReversals(db)
    repairLinkedVoucherReversals(db)
    const account = db.prepare('SELECT payment_account_id AS id FROM vouchers WHERE id=?')
    expect(account.get(reversal)).toEqual({id:secondBank})
    expect(account.get(unrelated)).toEqual({id:bank})
})

it('repairs signed net, VAT and gross without guessing foreign accounts or ambiguous links', () => {
    function oldReversal() {
        const original = voucher({grossAmount:-12.34,vatRate:19})
        const {id} = reverseVoucher(original,null)
        db.prepare('UPDATE vouchers SET net_amount=ABS(net_amount),vat_amount=ABS(vat_amount),gross_amount=ABS(gross_amount),payment_account_id=NULL WHERE id=?').run(id)
        return {original,id}
    }
    const good = oldReversal(), ambiguous = oldReversal(), missing = oldReversal(), contradictory = oldReversal()
    const extra = voucher({type:'OUT'})
    db.prepare('UPDATE vouchers SET original_id=? WHERE id=?').run(ambiguous.original,extra)
    db.prepare('UPDATE vouchers SET payment_account_id=1234567 WHERE id=?').run(missing.original)
    const third = Number(db.prepare("INSERT INTO payment_accounts(name,kind,sort_order) VALUES('Bank C','BANK',30)").run().lastInsertRowid)
    db.prepare('UPDATE vouchers SET payment_account_id=? WHERE id=?').run(third,contradictory.id)
    repairLinkedVoucherReversals(db)
    const read = db.prepare('SELECT payment_account_id AS account,net_amount AS net,vat_amount AS vat,gross_amount AS gross FROM vouchers WHERE id=?')
    expect(read.get(good.id)).toEqual({account:secondBank,net:-10.37,vat:-1.97,gross:-12.34})
    for (const row of [ambiguous,missing,contradictory]) {
        expect(read.get(row.id)).toEqual({account:row === contradictory ? third : null,net:10.37,vat:1.97,gross:12.34})
    }
})

it('restores old INTERNAL reversal signs and leaves divergent allocation records untouched', () => {
    function legacyReversal() {
        const original = voucher({type:'INTERNAL',budgets:[{budgetId:10,amount:-60},{budgetId:11,amount:-40}],
            earmarks:[{earmarkId:11,amount:100}]})
        const {id} = reverseVoucher(original,null)
        db.prepare("UPDATE vouchers SET type='TRANSFER', budget_amount=ABS(budget_amount), earmark_amount=ABS(earmark_amount) WHERE id=?").run(id)
        db.prepare('UPDATE voucher_earmarks SET amount=ABS(amount) WHERE voucher_id=?').run(id)
        return id
    }
    const matched = legacyReversal(), unrelated = legacyReversal()
    db.prepare('UPDATE voucher_earmarks SET amount=99 WHERE voucher_id=?').run(unrelated)
    repairLinkedVoucherReversals(db)
    repairLinkedVoucherReversals(db)
    const state = db.prepare('SELECT type,budget_amount AS budget,earmark_amount AS earmark FROM vouchers WHERE id=?')
    expect(state.get(matched)).toEqual({type:'INTERNAL',budget:60,earmark:-100})
    expect(getVoucherEarmarks(matched)[0].amount).toBe(-100)
    expect(state.get(unrelated)).toEqual({type:'TRANSFER',budget:60,earmark:100})
    expect(getVoucherEarmarks(unrelated)[0].amount).toBe(99)
})

test.each([updateVoucher,updateVoucherMeta])('all voucher fields, allocations, tags and audit roll back together', edit => {
    const id = voucher({ budgets:[{budgetId:10,amount:100}], tags:['Verein'] })
    const initial = listJournalVouchers({voucherIds:[id]}).rows[0]
    const count = auditCount()
    expect(() => edit({ id, note:'soll nicht gespeichert werden', tags:['Neu'], budgets:[
        {budgetId:10,amount:70},{budgetId:13,amount:30}
    ] })).toThrow('Beginn des Budgets')
    expect(listJournalVouchers({voucherIds:[id]}).rows[0]).toEqual(initial)
    expect(auditCount()).toBe(count)
})

it('writes each selected split once and rolls back even if the final audit write fails', async () => {
    const id = voucher()
    db.exec(`CREATE TEMP TABLE observed_writes(kind TEXT);
        CREATE TEMP TRIGGER count_budget AFTER INSERT ON voucher_budgets BEGIN INSERT INTO observed_writes VALUES ('budget'); END;
        CREATE TEMP TRIGGER count_earmark AFTER INSERT ON voucher_earmarks BEGIN INSERT INTO observed_writes VALUES ('earmark'); END`)
    await journalChannel('vouchers.update')(undefined as never, {id, note:'gespeichert', tags:['Alt'], budgets:[{budgetId:10,amount:70},{budgetId:11,amount:30}],
        earmarks:[{earmarkId:10,amount:100}]})
    expect(db.prepare('SELECT kind, COUNT(*) AS n FROM observed_writes GROUP BY kind ORDER BY kind').all())
        .toEqual([{kind:'budget',n:2},{kind:'earmark',n:1}])
    const snapshot = listJournalVouchers({voucherIds:[id]})
    db.exec(`CREATE TEMP TRIGGER reject_edit_audit BEFORE INSERT ON audit_log WHEN NEW.action='UPDATE'
        BEGIN SELECT RAISE(ABORT, 'Test: Audit nicht schreibbar'); END`)
    expect(() => updateVoucher({id,note:'abgebrochen',tags:['Neu'],budgets:[{budgetId:12,amount:100}]})).toThrow('Audit')
    expect(listJournalVouchers({voucherIds:[id]})).toEqual(snapshot)
})

it('replaces split and legacy assignments together, preserving the assigned amount and onlyWithout', () => {
    const split = voucher({ budgets:[{budgetId:10,amount:35},{budgetId:11,amount:25}], earmarks:[{earmarkId:10,amount:70},{earmarkId:11,amount:30}] })
    const legacy = voucher()
    const empty = voucher()
    db.prepare('UPDATE vouchers SET budget_id=10,budget_amount=80 WHERE id=?').run(legacy)
    expect(batchAssignBudget({from:date,budgetId:12,onlyWithout:true})).toEqual({updated:1})
    expect(getVoucherBudgets(empty)[0]).toMatchObject({budgetId:12,amount:100})
    expect(batchAssignBudget({from:date,budgetId:12})).toEqual({updated:2})
    expect(batchAssignEarmark({from:date,earmarkId:12})).toEqual({updated:3})
    expect(getVoucherBudgets(split)).toEqual([expect.objectContaining({budgetId:12,amount:60})])
    expect(getVoucherBudgets(legacy)).toEqual([expect.objectContaining({budgetId:12,amount:80})])
    expect(getVoucherEarmarks(split)).toEqual([expect.objectContaining({earmarkId:12,amount:100})])
    expect(db.prepare('SELECT budget_id, budget_amount, earmark_id FROM vouchers WHERE id=?').get(split))
        .toEqual({budget_id:12,budget_amount:60,earmark_id:12})
})

it('rolls a batch back when a later row falls outside the target period', () => {
    const first = voucher({date:'2027-02-01'})
    const second = voucher()
    const count = auditCount()
    expect(() => batchAssignBudget({budgetId:13})).toThrow('Beginn des Budgets')
    expect([getVoucherBudgets(first), getVoucherBudgets(second)]).toEqual([[],[]])
    expect(auditCount()).toBe(count)
})

it('uses full voucher amounts for reports and only allocated amounts for budget balances', () => {
    voucher({ budgets:[{budgetId:10,amount:70},{budgetId:11,amount:30}] })
    const legacy = voucher({grossAmount:50})
    db.prepare('UPDATE vouchers SET budget_id=11,budget_amount=15 WHERE id=?').run(legacy)
    expect(summarizeVouchers({budgetId:11}).totals.gross).toBe(150)
    expect(monthlyVouchers({budgetId:11,type:'IN'})).toMatchObject([{month:'2026-01',gross:150}])
    expect(dailyVouchers({budgetId:11,type:'IN'})).toMatchObject([{date,gross:150}])
    expect(cashBalance({budgetId:11,to:date}).BANK).toBe(45)
})

it('returns cent-precision net, VAT and gross from each reporting period', () => {
    voucher({netAmount:0.10,vatRate:19})
    voucher({netAmount:0.20,vatRate:19})
    voucher({netAmount:-0.10,vatRate:19})
    voucher({netAmount:0.10,vatRate:19})
    const totals = {net:0.30,vat:0.06,gross:0.36}
    expect(summarizeVouchers({from:date,to:date}).totals).toEqual(totals)
    expect(dailyVouchers({from:date,to:date})).toEqual([{...totals,date}])
    expect(monthlyVouchers({from:date,to:date})).toEqual([{...totals,month:date.slice(0,7)}])
})

it('loads one and 100 filtered journal rows with four SQL queries each and preserves split order', async () => {
    const ids = Array.from({length:101}, () => voucher())
    const classifications = db.prepare('SELECT id FROM classification_values ORDER BY id LIMIT 2').all() as {id:number}[]
    const mark = db.prepare('UPDATE vouchers SET primary_classification_value_id=? WHERE id=?')
    ids.forEach((id,i) => mark.run(classifications[i===100 ? 1:0].id,id))
    updateVoucherMeta({id:ids[0],budgets:[{budgetId:11,amount:30},{budgetId:10,amount:70}]})
    const list = journalChannel('vouchers.list')
    const prepare = jest.spyOn(db,'prepare')
    try {
        for (const limit of [1,100]) {
            prepare.mockClear()
            const page: ReturnType<typeof listJournalVouchers> = await list(undefined as never, {limit,sort:'ASC',primaryClassificationValueId:classifications[0].id})
            expect(prepare).toHaveBeenCalledTimes(4)
            expect(page.total).toBe(100)
            expect(page.rows).toHaveLength(limit)
            expect(page.rows[0].budgets.map((b: {label:string}) => b.label)).toEqual(['B','A'])
            expect(page.rows.map(row => row.id)).not.toContain(ids[100])
        }
    } finally { prepare.mockRestore() }
})
