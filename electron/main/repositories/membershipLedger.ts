import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import { getDb, withTransaction } from '../db/database'
import { writeAudit } from '../services/audit'
import { nextPeriod, periodKeyFromDate, periodRange, type ContributionInterval, type ContributionPaymentInput, type ContributionPeriod, type ContributionPreview } from '../../../shared/membershipPayments'

type DB = InstanceType<typeof Database>
const today = () => new Date().toISOString().slice(0, 10)
const cents = (n: number) => Math.round(n * 100)
export const activeReceipt = "(r.source = 'MANUAL' OR (v.id IS NOT NULL AND v.type = 'IN' AND v.original_id IS NULL AND v.reversed_by_id IS NULL))"
type Plan = { starts_on: string; interval: ContributionInterval; amount_cents: number }

export function initializeMemberPlan(d: DB, memberId: number) {
  const member = d.prepare('SELECT * FROM members WHERE id=?').get(memberId) as any
  if (!member) throw new Error('Mitglied nicht gefunden.')
  if (member.contribution_interval && !d.prepare('SELECT 1 FROM membership_plans WHERE member_id=?').get(memberId)) {
    const start = member.next_due_date || member.join_date || today()
    d.prepare('INSERT INTO membership_plans(member_id,starts_on,interval,amount_cents) VALUES (?,?,?,?)').run(memberId, start, member.contribution_interval, Math.max(0, cents(member.contribution_amount || 0)))
  }
  return member
}

export function contributionPeriods(memberId: number, through: string, d = getDb()): ContributionPeriod[] {
  const member = d.prepare('SELECT * FROM members WHERE id=?').get(memberId) as any
  if (!member) throw new Error('Mitglied nicht gefunden.')
  const plans = d.prepare('SELECT * FROM membership_plans WHERE member_id=? ORDER BY starts_on').all(memberId) as Plan[]
  const result = new Map<string, ContributionPeriod>()
  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i]
    if (plan.amount_cents <= 0) continue
    let key = periodKeyFromDate(new Date(plan.starts_on), plan.interval)
    for (let n = 0; n < 3600; n++) {
      const range = periodRange(key, plan.interval)
      const dueDate = range.start < plan.starts_on ? plan.starts_on : range.start
      if (dueDate > through || (member.leave_date && dueDate > member.leave_date) || (plans[i + 1] && dueDate >= plans[i + 1].starts_on)) break
      result.set(`${plan.interval}:${key}`, { periodKey: key, interval: plan.interval, dueDate, expected: plan.amount_cents / 100, paidAmount: 0, remaining: plan.amount_cents / 100 })
      key = nextPeriod(key, plan.interval)
    }
  }
  const stored = d.prepare(`SELECT p.*, COALESCE(SUM(CASE WHEN ${activeReceipt} THEN a.amount_cents ELSE 0 END),0) as paid_cents
    FROM membership_periods p LEFT JOIN membership_allocations a ON a.period_id=p.id
    LEFT JOIN membership_receipts r ON r.id=a.receipt_id LEFT JOIN vouchers v ON v.id=r.voucher_id
    WHERE p.member_id=? GROUP BY p.id`).all(memberId) as any[]
  for (const row of stored) {
    if (row.due_date > through || (member.leave_date && row.due_date > member.leave_date)) continue
    result.set(`${row.interval}:${row.period_key}`, { periodKey: row.period_key, interval: row.interval, dueDate: row.due_date,
      expected: row.expected_cents / 100, paidAmount: row.paid_cents / 100, remaining: Math.max(0, row.expected_cents - row.paid_cents) / 100 })
  }
  return [...result.values()].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.periodKey.localeCompare(b.periodKey))
}

function storePeriod(d: DB, memberId: number, period: ContributionPeriod) {
  d.prepare('INSERT OR IGNORE INTO membership_periods(member_id,period_key,interval,due_date,expected_cents) VALUES (?,?,?,?,?)').run(memberId, period.periodKey, period.interval, period.dueDate, cents(period.expected))
  return (d.prepare('SELECT id FROM membership_periods WHERE member_id=? AND period_key=? AND interval=?').get(memberId, period.periodKey, period.interval) as { id: number }).id
}

// Freeze accrued obligations before a tariff change; prepaid periods retain their agreed amount.
export function prepareMemberPlanChange(d: DB, before: any, input: any) {
  initializeMemberPlan(d, before.id)
  const changed = (input.contribution_amount !== undefined && input.contribution_amount !== before.contribution_amount)
    || (input.contribution_interval !== undefined && input.contribution_interval !== before.contribution_interval)
    || (input.next_due_date && input.next_due_date !== before.next_due_date) || input.contribution_effective_date
  if (!changed) return
  const interval = input.contribution_interval ?? before.contribution_interval
  if (!interval) return
  const plans = d.prepare('SELECT * FROM membership_plans WHERE member_id=? ORDER BY starts_on').all(before.id) as Plan[]
  const start = input.contribution_effective_date || (input.next_due_date && input.next_due_date !== before.next_due_date ? input.next_due_date
    : periodRange(nextPeriod(periodKeyFromDate(new Date(), interval), interval), interval).start)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isFinite(Date.parse(start)) || new Date(start).toISOString().slice(0, 10) !== start || (before.join_date && start < before.join_date)) throw new Error('Bitte ein gültiges Datum für die Beitragsänderung ab Eintritt angeben.')
  if (plans.length && start < today()) throw new Error('Beitragsänderungen können ab heute oder für die Zukunft gelten. Bereits entstandene Beiträge bleiben erhalten.')
  for (const period of contributionPeriods(before.id, start, d)) if (period.dueDate < start) storePeriod(d, before.id, period)
  // Future revisions may be replaced, but never rewrite periods with an allocation.
  d.prepare('DELETE FROM membership_plans WHERE member_id=? AND starts_on>=?').run(before.id, start)
  d.prepare('INSERT INTO membership_plans(member_id,starts_on,interval,amount_cents) VALUES (?,?,?,?)').run(before.id, start, interval,
    input.contribution_interval === null || input.contribution_amount === null ? 0 : Math.max(0, cents(input.contribution_amount ?? before.contribution_amount ?? 0)))
  if (!plans.length && before.contribution_interval) initializeMemberPlan(d, before.id)
}

export function availableVoucherAmount(voucherId: number, d = getDb()) {
  const voucher = d.prepare('SELECT * FROM vouchers WHERE id=?').get(voucherId) as any
  if (!voucher || voucher.type !== 'IN' || voucher.original_id || voucher.reversed_by_id) throw new Error('Nur eine gültige Einnahme kann Beiträgen zugeordnet werden.')
  const reserved = (d.prepare('SELECT COALESCE(SUM(amount_cents),0) as amount FROM membership_receipts WHERE voucher_id=?').get(voucherId) as any).amount
  return { voucher, available: Math.max(0, cents(voucher.gross_amount) - reserved) / 100 }
}

export function availableContributionVouchers(q = '') {
  const d = getDb()
  return d.prepare(`SELECT id,voucher_no as voucherNo,date,description,counterparty,
    (ROUND(gross_amount*100)-COALESCE((SELECT SUM(r.amount_cents) FROM membership_receipts r WHERE r.voucher_id=vouchers.id),0))/100.0 as available FROM vouchers
    WHERE type='IN' AND original_id IS NULL AND reversed_by_id IS NULL
    AND (?='' OR COALESCE(description,'') LIKE ? OR COALESCE(counterparty,'') LIKE ? OR voucher_no LIKE ?)
    AND available>0 ORDER BY date DESC,id DESC LIMIT 50`).all(q.trim(), `%${q.trim()}%`, `%${q.trim()}%`, `%${q.trim()}%`) as Array<{ id: number; voucherNo: string; date: string; description: string | null; available: number }>
}

function creditReceipts(memberId: number, d = getDb()) {
  return d.prepare(`SELECT r.id, r.date_paid as datePaid, r.voucher_id as voucherId, r.amount_cents,
    r.amount_cents-COALESCE(SUM(a.amount_cents),0) as credit_cents
    FROM membership_receipts r LEFT JOIN vouchers v ON v.id=r.voucher_id LEFT JOIN membership_allocations a ON a.receipt_id=r.id
    WHERE r.member_id=? AND ${activeReceipt} GROUP BY r.id HAVING credit_cents>0`).all(memberId) as Array<{ id: number; datePaid: string; voucherId: number | null; amount_cents: number; credit_cents: number }>
}

export function previewContributionPayment(input: ContributionPaymentInput, d = getDb()): ContributionPreview {
  const member = d.prepare('SELECT * FROM members WHERE id=?').get(input.memberId) as any
  if (!member) throw new Error('Mitglied nicht gefunden.')
  if (!Number.isFinite(input.amount) || !Number.isSafeInteger(cents(input.amount)) || cents(input.amount) <= 0 || Math.abs(input.amount * 100 - cents(input.amount)) > 0.00001) throw new Error('Bitte einen positiven Betrag mit höchstens zwei Nachkommastellen angeben.')
  const paidDate = input.datePaid || today()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidDate) || !Number.isFinite(Date.parse(paidDate)) || new Date(paidDate).toISOString().slice(0, 10) !== paidDate) throw new Error('Ungültiges Zahlungsdatum.')
  let available: number | null = null
  if (input.receiptId) {
    const receipt = creditReceipts(input.memberId, d).find(r => r.id === input.receiptId)
    if (!receipt || input.voucherId) throw new Error('Dieses Guthaben ist nicht verfügbar.')
    available = receipt.credit_cents / 100
  } else if (input.voucherId) available = availableVoucherAmount(input.voucherId, d).available
  if (available != null && cents(input.amount) > cents(available)) throw new Error(`Der verfügbare Zahlungsbetrag beträgt nur ${available.toFixed(2)} €.`)
  const periods = contributionPeriods(input.memberId, '2199-12-31', d)
  let startDate = ''
  if (input.startPeriod) {
    const period = periods.find(p => p.periodKey === input.startPeriod)
    if (!period) throw new Error('Die Startperiode liegt außerhalb des Beitragsplans.')
    startDate = period.dueDate
  }
  let remaining = cents(input.amount)
  const allocations: ContributionPreview['allocations'] = []
  const selected = input.allocations
  const seen = new Set<string>()
  for (const entry of selected ?? periods.filter(p => p.dueDate >= startDate && p.remaining > 0).map(p => ({ periodKey: p.periodKey, interval: p.interval, amount: p.remaining }))) {
    if (!selected && remaining === 0) break
    const key = `${entry.interval}:${entry.periodKey}`
    if (seen.has(key)) throw new Error('Eine Periode darf nur einmal in der Aufteilung stehen.')
    seen.add(key)
    const period = periods.find(p => p.periodKey === entry.periodKey && p.interval === entry.interval)
    const amount = selected ? cents(entry.amount) : Math.min(cents(entry.amount), remaining)
    if (!period || !Number.isFinite(entry.amount) || amount <= 0 || amount > cents(period.remaining) || amount > remaining || Math.abs(entry.amount * 100 - cents(entry.amount)) > 0.00001) throw new Error('Die Beitragsaufteilung übersteigt den offenen Betrag oder die Zahlung. Bitte aktualisieren.')
    allocations.push({ periodKey: period.periodKey, interval: period.interval, amount: amount / 100, expected: period.expected, paidBefore: period.paidAmount, remaining: (cents(period.remaining) - amount) / 100, dueDate: period.dueDate })
    remaining -= amount
  }
  const preview = { memberId: member.id, memberName: member.name, amount: input.amount, credit: remaining / 100, allocations }
  const token = createHash('sha256').update(JSON.stringify({ preview, available, receiptId: input.receiptId, voucherId: input.voucherId, paidDate,
    receipts: d.prepare('SELECT id,amount_cents,voucher_id FROM membership_receipts WHERE member_id=? ORDER BY id').all(input.memberId),
    plan: d.prepare('SELECT * FROM membership_plans WHERE member_id=? ORDER BY starts_on').all(input.memberId), leaveDate: member.leave_date })).digest('hex')
  return { ...preview, token }
}

export function allocateContributionPayment(input: ContributionPaymentInput) {
  return withTransaction(d => {
    const preview = previewContributionPayment(input, d)
    if (input.token && input.token !== preview.token) throw new Error('Beitrag oder Zahlung wurde geändert. Bitte die Aufteilung erneut prüfen.')
    const datePaid = input.voucherId ? availableVoucherAmount(input.voucherId, d).voucher.date : input.datePaid || today()
    const receiptId = input.receiptId || Number(d.prepare('INSERT INTO membership_receipts(member_id,voucher_id,source,amount_cents,date_paid) VALUES (?,?,?,?,?)')
      .run(input.memberId, input.voucherId || null, input.voucherId ? 'BOOKING' : 'MANUAL', cents(input.amount), datePaid).lastInsertRowid)
    for (const allocation of preview.allocations) {
      const periodId = storePeriod(d, input.memberId, { ...allocation, paidAmount: allocation.paidBefore })
      d.prepare('INSERT INTO membership_allocations(receipt_id,period_id,amount_cents) VALUES (?,?,?) ON CONFLICT(receipt_id,period_id) DO UPDATE SET amount_cents=amount_cents+excluded.amount_cents').run(receiptId, periodId, cents(allocation.amount))
    }
    refreshNextDue(input.memberId, d)
    writeAudit(d, null, 'membership_receipts', receiptId, input.receiptId ? 'ALLOCATE_CREDIT' : 'CREATE', { memberId: input.memberId, voucherId: input.voucherId || null, amount: input.amount, allocations: preview.allocations, credit: preview.credit })
    return { ok: true, receiptId, preview }
  })
}

export function contributionStatus(memberId: number, d = getDb()) {
  const member = d.prepare('SELECT * FROM members WHERE id=?').get(memberId) as any
  if (!member) return { hasPlan: 0 as const, state: 'NONE' as const, prepaidAmount: 0 }
  const plans = d.prepare('SELECT * FROM membership_plans WHERE member_id=? ORDER BY starts_on DESC').all(memberId) as Plan[]
  const credits = creditReceipts(memberId, d).map(r => ({ id: r.id, voucherId: r.voucherId, datePaid: r.datePaid, amount: r.credit_cents / 100 }))
  if (!plans.length) return { hasPlan: 0 as const, state: 'NONE' as const, prepaidAmount: 0, credit: credits.reduce((sum, r) => sum + cents(r.amount), 0) / 100, credits }
  const lastStored = (d.prepare('SELECT MAX(due_date) as date FROM membership_periods WHERE member_id=?').get(memberId) as { date: string | null }).date
  const horizon = [today(), plans[0]?.starts_on || '', lastStored || ''].sort().at(-1)!
  const periods = contributionPeriods(memberId, `${Math.min(2199, Number(horizon.slice(0, 4)) + 1)}-12-31`, d)
  const unpaid = periods.filter(p => p.remaining > 0)
  const due = unpaid.filter(p => p.dueDate <= today())
  const last = d.prepare(`SELECT r.date_paid as datePaid,p.period_key as periodKey FROM membership_receipts r
    LEFT JOIN vouchers v ON v.id=r.voucher_id LEFT JOIN membership_allocations a ON a.receipt_id=r.id LEFT JOIN membership_periods p ON p.id=a.period_id
    WHERE r.member_id=? AND ${activeReceipt} ORDER BY r.date_paid DESC,r.id DESC,p.due_date DESC LIMIT 1`).get(memberId) as any
  return { hasPlan: 1 as const, state: due.length ? 'OVERDUE' as const : 'OK' as const,
    interval: (plans.find(p => p.starts_on <= today()) || plans.at(-1)!).interval, amount: (plans.find(p => p.starts_on <= today()) || plans.at(-1)!).amount_cents / 100,
    nextDue: unpaid[0]?.dueDate || null, overdue: due.length, dueAmount: due.reduce((sum, p) => sum + cents(p.remaining), 0) / 100,
    prepaidAmount: periods.filter(p => p.dueDate > today()).reduce((sum, p) => sum + cents(p.paidAmount), 0) / 100,
    firstOverdue: due[0]?.periodKey || null, lastPeriod: last?.periodKey || null, lastDate: last?.datePaid || null,
    joinDate: member.join_date, leaveDate: member.leave_date, credit: credits.reduce((sum, r) => sum + cents(r.amount), 0) / 100, credits }
}

export function refreshNextDue(memberId: number, d = getDb()) {
  const status = contributionStatus(memberId, d)
  if ('nextDue' in status) d.prepare("UPDATE members SET next_due_date=?,updated_at=datetime('now') WHERE id=?").run(status.nextDue, memberId)
  return { ok: true, nextDue: 'nextDue' in status ? status.nextDue : null }
}

export function removeContributionReceipt(receiptId: number) {
  return withTransaction(d => {
    const receipt = d.prepare('SELECT * FROM membership_receipts WHERE id=?').get(receiptId) as any
    if (!receipt) throw new Error('Zahlungszuordnung nicht gefunden.')
    const allocations = d.prepare('SELECT * FROM membership_allocations WHERE receipt_id=?').all(receiptId)
    d.prepare('DELETE FROM membership_receipts WHERE id=?').run(receiptId)
    refreshNextDue(receipt.member_id, d)
    writeAudit(d, null, 'membership_receipts', receiptId, 'DELETE', { receipt, allocations })
    return { ok: true }
  })
}

export function refreshMembershipVoucher(voucherId: number, d: DB) {
  for (const r of d.prepare('SELECT DISTINCT member_id FROM membership_receipts WHERE voucher_id=?').all(voucherId) as any[]) refreshNextDue(r.member_id, d)
}

export function reconcileMemberCredit(memberId: number, d: DB) {
  const member = d.prepare('SELECT leave_date FROM members WHERE id=?').get(memberId) as { leave_date: string | null }
  if (member.leave_date) {
    d.prepare('DELETE FROM membership_allocations WHERE period_id IN (SELECT id FROM membership_periods WHERE member_id=? AND due_date>?)').run(memberId, member.leave_date)
    d.prepare('DELETE FROM membership_periods WHERE member_id=? AND due_date>?').run(memberId, member.leave_date)
  }
  for (const receipt of creditReceipts(memberId, d)) {
    const input = { memberId, receiptId: receipt.id, amount: receipt.credit_cents / 100 }
    if (previewContributionPayment(input, d).allocations.length) allocateContributionPayment(input)
  }
  refreshNextDue(memberId, d)
}
