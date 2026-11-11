import type Database from 'better-sqlite3'
import { periodRange } from '../../../shared/membershipPayments'

export function migrateMembershipLedger(db: InstanceType<typeof Database>) {
  if (!(db.prepare('PRAGMA table_info(bank_transaction_ai_suggestions)').all() as { name: string }[]).some(c => c.name === 'membership_json')) db.exec('ALTER TABLE bank_transaction_ai_suggestions ADD COLUMN membership_json TEXT')
  db.exec(`
    CREATE TABLE membership_plans (
      id INTEGER PRIMARY KEY, member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      starts_on TEXT NOT NULL, interval TEXT NOT NULL, amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
      UNIQUE(member_id, starts_on)
    );
    CREATE TABLE membership_periods (
      id INTEGER PRIMARY KEY, member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      period_key TEXT NOT NULL, interval TEXT NOT NULL, due_date TEXT NOT NULL,
      expected_cents INTEGER NOT NULL CHECK(expected_cents >= 0), UNIQUE(member_id, period_key, interval)
    );
    CREATE TABLE membership_receipts (
      id INTEGER PRIMARY KEY, member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      voucher_id INTEGER REFERENCES vouchers(id) ON DELETE SET NULL,
      source TEXT NOT NULL CHECK(source IN ('BOOKING','MANUAL')), amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
      date_paid TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_membership_receipt_voucher ON membership_receipts(voucher_id);
    CREATE INDEX idx_membership_receipt_member ON membership_receipts(member_id);
    CREATE TABLE membership_allocations (
      receipt_id INTEGER NOT NULL REFERENCES membership_receipts(id) ON DELETE CASCADE,
      period_id INTEGER NOT NULL REFERENCES membership_periods(id) ON DELETE CASCADE,
      amount_cents INTEGER NOT NULL CHECK(amount_cents > 0), PRIMARY KEY(receipt_id, period_id)
    );
    CREATE INDEX idx_membership_allocation_period ON membership_allocations(period_id);
  `)
  const members = db.prepare('SELECT * FROM members').all() as any[]
  for (const member of members) {
    const old = db.prepare('SELECT * FROM membership_payments WHERE member_id = ? ORDER BY period_key').all(member.id) as any[]
    let anchor = member.next_due_date || member.join_date || new Date().toISOString().slice(0, 10)
    for (const payment of old) {
      const start = periodRange(payment.period_key, payment.interval).start
      if (start < anchor) anchor = start
      const amount = Math.round(Number(payment.amount || 0) * 100)
      if (amount <= 0) continue
      const period = db.prepare('INSERT INTO membership_periods(member_id,period_key,interval,due_date,expected_cents) VALUES (?,?,?,?,?)').run(member.id, payment.period_key, payment.interval, start, amount)
      const receipt = db.prepare('INSERT INTO membership_receipts(member_id,voucher_id,source,amount_cents,date_paid) VALUES (?,?,?,?,?)').run(member.id, payment.voucher_id, payment.voucher_id ? 'BOOKING' : 'MANUAL', amount, payment.date_paid || start)
      db.prepare('INSERT INTO membership_allocations VALUES (?,?,?)').run(receipt.lastInsertRowid, period.lastInsertRowid, amount)
    }
    if (member.contribution_interval) db.prepare('INSERT INTO membership_plans(member_id,starts_on,interval,amount_cents) VALUES (?,?,?,?)').run(member.id, anchor, member.contribution_interval, Math.max(0, Math.round(Number(member.contribution_amount || 0) * 100)))
  }
}
