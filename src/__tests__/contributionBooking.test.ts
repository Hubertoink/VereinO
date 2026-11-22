import type Database from 'better-sqlite3'
import { openTestLedger } from './fixtures/ledgerDatabase'
import { bookContribution } from '../../electron/main/repositories/contributionBooking'
import { cashBalance, deleteVoucher, reverseVoucher } from '../../electron/main/repositories/vouchers'
import { listPaymentAccounts } from '../../electron/main/repositories/paymentAccounts'
import { ContributionBookingInput, type TContributionBookingInput } from '../../electron/main/ipc/schemas'

jest.mock('../../electron/main/db/database', () => ({ getDb: jest.fn(), withTransaction: jest.fn() }))

let db: Database.Database
let input: TContributionBookingInput

beforeEach(() => {
  db = openTestLedger()
  db.exec(`INSERT INTO members(id, member_no, name, status) VALUES (1, 'MB1', 'Testmitglied', 'ACTIVE');
    INSERT INTO membership_plans(member_id, starts_on, interval, amount_cents) VALUES(1, '2026-01-01', 'YEARLY', 5010)`)
  input = {
    requestId: 'test-confirmed-payment-1', organizationId: 'test-org', memberId: 1,
    periodKey: '2026', interval: 'YEARLY', date: '2026-03-04', amount: 25.05,
    description: 'Mitgliedsbeitrag', paymentMethod: 'BANK', tags: ['Mitgliedsbeitrag'],
    paymentAccountId: listPaymentAccounts().find(account => account.kind === 'BANK')!.id
  }
})

afterEach(() => db.close())

test('the IPC contract accepts whole cents and rejects fractions of a cent', () => {
  expect(ContributionBookingInput.safeParse(input).success).toBe(true)
  expect(ContributionBookingInput.safeParse({ ...input, amount: 25.055 }).success).toBe(false)
})

test('two equal partial payments are separate, but replaying either confirmed request never changes the ledger', () => {
  const first = bookContribution(input)
  expect(bookContribution(input)).toEqual(first)
  expect(() => bookContribution({ ...input, amount: 1 })).toThrow('anderen Angaben')
  const secondInput = { ...input, requestId: 'test-confirmed-payment-2' }
  const second = bookContribution(secondInput)
  expect(second.id).not.toBe(first.id)
  expect(bookContribution(secondInput)).toEqual(second)
  expect(db.prepare('SELECT COUNT(*) AS n, SUM(ROUND(gross_amount * 100)) AS cents FROM vouchers').get())
    .toMatchObject({ n: 2, cents: 5010 })
  for (const table of ['membership_receipts', 'membership_allocations']) {
    expect(db.prepare('SELECT SUM(amount_cents) AS cents FROM ' + table).get()).toMatchObject({ cents: 5010 })
  }
  expect(cashBalance({}).BANK).toBe(50.10)
  expect(() => bookContribution({ ...input, requestId: 'third-confirmed-payment' })).toThrow()
  expect(cashBalance({}).BANK).toBe(50.10)
})

test('a rejected allocation rolls back the voucher, its sequence, tags, audit and request so a corrected retry can succeed', () => {
  const counts = () => ['vouchers', 'voucher_sequences', 'tags', 'voucher_tags', 'audit_log',
    'membership_receipts', 'membership_allocations', 'contribution_booking_requests'].map(table =>
    (db.prepare('SELECT COUNT(*) AS n FROM ' + table).get() as { n: number }).n)
  const before = counts()
  expect(() => bookContribution({ ...input, amount: 50.11 })).toThrow()
  expect(counts()).toEqual(before)
  expect(cashBalance({}).BANK).toBe(0)
  bookContribution(input)
  expect(cashBalance({}).BANK).toBe(25.05)
  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})

test.each(['reverse', 'delete'])('retry cannot recreate a payment after an explicit %s', action => {
  const voucher = bookContribution(input)
  if (action === 'reverse') reverseVoucher(voucher.id, null)
  else deleteVoucher(voucher.id)
  expect(() => bookContribution(input)).toThrow('aufgehoben')
  expect(cashBalance({}).BANK).toBe(0)
})
