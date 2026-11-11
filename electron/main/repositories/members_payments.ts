import { getDb, withTransaction } from '../db/database'
import { getSetting } from '../services/settings'
import { periodRange, type ContributionInterval as Interval } from '../../../shared/membershipPayments'
import { activeReceipt, allocateContributionPayment, availableVoucherAmount, contributionPeriods, contributionStatus, refreshNextDue } from './membershipLedger'
export { periodKeyFromDate, periodRange, nextPeriod } from '../../../shared/membershipPayments'
export type { ContributionInterval as Interval } from '../../../shared/membershipPayments'
export type MemberPaymentStatusInput = { id: number; contribution_interval?: Interval | null; contribution_amount?: number | null; next_due_date?: string | null; join_date?: string | null; leave_date?: string | null }

export function listDue(params: { interval: Interval; periodKey?: string; from?: string; to?: string; q?: string; includePaid?: boolean; memberId?: number; dueThroughToday?: boolean }) {
  const d = getDb()
  const members = d.prepare(`SELECT * FROM members WHERE (? IS NULL OR id=?) AND (status='ACTIVE' OR (? AND status='PAUSED')) ORDER BY name COLLATE NOCASE`).all(params.memberId ?? null, params.memberId ?? null, getSetting('membership.includePaused') ? 1 : 0) as any[]
  const rows: any[] = []
  for (const member of members) {
    if (params.q && !`${member.name} ${member.member_no} ${member.email}`.toLocaleLowerCase('de-DE').includes(params.q.toLocaleLowerCase('de-DE'))) continue
    const status = contributionStatus(member.id, d)
    const from = params.periodKey ? periodRange(params.periodKey, params.interval).start : params.from
    const through = params.periodKey ? periodRange(params.periodKey, params.interval).end : params.to || (params.dueThroughToday ? new Date().toISOString().slice(0, 10) : ('nextDue' in status ? status.nextDue : null)) || new Date().toISOString().slice(0, 10)
    const periods = contributionPeriods(member.id, through, d).filter(p => p.interval === params.interval && (!from || p.dueDate >= from) && (params.includePaid || p.remaining > 0))
    for (const period of periods) {
      if (!params.periodKey && !params.from && !params.to && !params.dueThroughToday && period.dueDate !== ('nextDue' in status ? status.nextDue : null)) continue
      rows.push({ memberId: member.id, name: member.name, memberNo: member.member_no, status: member.status, ...period,
        amount: period.remaining, paid: period.remaining === 0 ? 1 : 0, voucherId: null, verified: period.paidAmount > 0 ? 1 : 0 })
    }
  }
  return { rows, total: rows.length }
}

export function markPaid(input: { memberId: number; periodKey: string; interval: Interval; amount: number; voucherId?: number | null; datePaid?: string | null }) {
  const period = contributionPeriods(input.memberId, periodRange(input.periodKey, input.interval).end).find(p => p.periodKey === input.periodKey && p.interval === input.interval)
  if (!period) throw new Error('Diese Periode liegt außerhalb des Beitragsplans.')
  if (period.remaining === 0) return { ok: true }
  return allocateContributionPayment({ ...input, allocations: [{ periodKey: input.periodKey, interval: input.interval, amount: input.amount }] })
}

export function unmark(input: { memberId: number; periodKey: string }) {
  return withTransaction(d => {
    d.prepare('DELETE FROM membership_allocations WHERE period_id IN (SELECT id FROM membership_periods WHERE member_id=? AND period_key=?)').run(input.memberId, input.periodKey)
    return refreshNextDue(input.memberId, d)
  })
}

const normalize = (s: string) => s.toLocaleLowerCase('de-DE').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
export function suggestVouchers(input: { name?: string | null; amount: number; periodKey: string; memberId?: number }) {
  const d = getDb()
  const member = input.memberId ? d.prepare('SELECT name,member_no FROM members WHERE id=?').get(input.memberId) as any : null
  const name = normalize(member?.name || input.name || '')
  const candidates = d.prepare(`SELECT id,voucher_no as voucherNo,date,description,counterparty,gross_amount as gross FROM vouchers
    WHERE type='IN' AND original_id IS NULL AND reversed_by_id IS NULL ORDER BY date DESC,id DESC`).all() as any[]
  const rows = candidates.flatMap(row => {
    const text = normalize(`${row.description || ''} ${row.counterparty || ''}`)
    if (!(name && text.includes(name)) && !(member?.member_no && text.split(' ').includes(normalize(member.member_no)))) return []
    const available = availableVoucherAmount(row.id, d).available
    return available > 0 ? [{ ...row, available }] : []
  }).slice(0, 20)
  return { rows }
}

export function recomputeNextDue(memberId: number) { return withTransaction(d => refreshNextDue(memberId, d)) }
export function status(input: { memberId: number }) { return contributionStatus(input.memberId) }
export function getMemberPaymentStatuses(members: MemberPaymentStatusInput[]) {
  return new Map(members.map(member => [member.id, contributionStatus(member.id)]))
}
export function history(input: { memberId: number; limit?: number; offset?: number }) {
  const d = getDb()
  const rows = d.prepare(`SELECT r.id as receiptId,p.period_key as periodKey,p.interval,
    COALESCE(a.amount_cents,r.amount_cents)/100.0 as amount,r.amount_cents/100.0 as paymentAmount,r.date_paid as datePaid,
    r.voucher_id as voucherId,v.voucher_no as voucherNo,v.description,v.counterparty,v.gross_amount as gross,
    CASE WHEN ${activeReceipt} THEN 1 ELSE 0 END as active
    FROM membership_receipts r LEFT JOIN vouchers v ON v.id=r.voucher_id
    LEFT JOIN membership_allocations a ON a.receipt_id=r.id LEFT JOIN membership_periods p ON p.id=a.period_id
    WHERE r.member_id=? ORDER BY r.date_paid DESC,r.id DESC,p.due_date`).all(input.memberId) as any[]
  return { rows: rows.slice(input.offset || 0, (input.offset || 0) + Math.min(500, input.limit || 50)), total: rows.length }
}
export function dueSummary() {
  const d = getDb()
  const members = d.prepare("SELECT id FROM members WHERE status='ACTIVE' OR (? AND status='PAUSED')").all(getSetting('membership.includePaused') ? 1 : 0) as { id: number }[]
  let dueMembers = 0, duePeriods = 0, dueAmount = 0
  for (const member of members) {
    const s = contributionStatus(member.id, d)
    if ((s.overdue || 0) > 0) { dueMembers++; duePeriods += s.overdue || 0; dueAmount += Math.round((s.dueAmount || 0) * 100) }
  }
  return { dueMembers, duePeriods, dueAmount: dueAmount / 100 }
}
