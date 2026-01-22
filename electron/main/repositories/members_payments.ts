import Database from 'better-sqlite3'
import { getDb, withTransaction } from '../db/database'
import { getSetting } from '../services/settings'

type DB = InstanceType<typeof Database>

export type Interval = 'MONTHLY'|'QUARTERLY'|'YEARLY'

export function periodKeyFromDate(d: Date, interval: Interval): string {
  const y = d.getUTCFullYear()
  if (interval === 'MONTHLY') {
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    return `${y}-${m}`
  }
  if (interval === 'QUARTERLY') {
    const q = Math.floor(d.getUTCMonth() / 3) + 1
    return `${y}-Q${q}`
  }
  return String(y)
}

export function periodRange(periodKey: string, interval: Interval): { start: string; end: string } {
  const [yStr, rest] = periodKey.split('-')
  const y = Number(yStr)
  if (interval === 'MONTHLY') {
    const m = Number(rest)
    const start = new Date(Date.UTC(y, m - 1, 1))
    const end = new Date(Date.UTC(y, m, 0))
    return { start: start.toISOString().slice(0,10), end: end.toISOString().slice(0,10) }
  }
  if (interval === 'QUARTERLY') {
    const q = Number((rest||'Q1').replace('Q',''))
    const start = new Date(Date.UTC(y, (q-1)*3, 1))
    const end = new Date(Date.UTC(y, (q)*3, 0))
    return { start: start.toISOString().slice(0,10), end: end.toISOString().slice(0,10) }
  }
  const start = new Date(Date.UTC(y, 0, 1))
  const end = new Date(Date.UTC(y, 12, 0))
  return { start: start.toISOString().slice(0,10), end: end.toISOString().slice(0,10) }
}

export function listDue(params: { interval: Interval; periodKey?: string; from?: string; to?: string; q?: string; includePaid?: boolean; memberId?: number }) {
  const d = getDb()
  const { interval, periodKey, from, to, q, includePaid, memberId } = params
  // Members with contribution configured; status filter: ACTIVE always, PAUSED optional by config, NEW excluded (option C)
  const includePaused = !!getSetting<boolean>('membership.includePaused')
  const statuses = includePaused ? ["'ACTIVE'", "'PAUSED'"] : ["'ACTIVE'"]
  const wh: string[] = [
    "m.contribution_amount IS NOT NULL",
    "m.contribution_interval IS NOT NULL",
    `m.status IN (${statuses.join(',')})`
  ]
  const args: any[] = []
  if (memberId != null) { wh.push('m.id = ?'); args.push(memberId) }
  if (q && q.trim()) { wh.push('(m.name LIKE ? OR m.email LIKE ? OR m.member_no LIKE ?)'); const like = `%${q.trim()}%`; args.push(like, like, like) }
  const members = d.prepare(`SELECT m.id, m.name, m.member_no as memberNo, m.contribution_amount as amount, m.contribution_interval as interval, m.next_due_date as nextDue, m.join_date as joinDate, m.leave_date as leaveDate, m.status
    FROM members m
    WHERE ${wh.join(' AND ')}
    ORDER BY m.name COLLATE NOCASE ASC`).all(...args) as any[]

  function* iteratePeriods(intv: Interval, startKey: string, endKey: string): Generator<string> {
    // inclusive range
    let cur = startKey
    while (true) {
      // stop condition: cur after endKey
      const cmp = comparePeriodKeys(cur, endKey, intv)
      if (cmp > 0) break
      yield cur
      cur = nextPeriod(cur, intv)
    }
  }

  function clampRangeForInterval(intv: Interval, f: string, t: string): { startKey: string; endKey: string } {
    // Derive nearest period keys from dates
    const fDate = new Date(f)
    const tDate = new Date(t)
    const startKey = periodKeyFromDate(fDate, intv)
    const endKey = periodKeyFromDate(tDate, intv)
    return { startKey, endKey }
  }

  const out: any[] = []
  for (const m of members) {
    const intv = (m.interval || interval) as Interval
    if (periodKey) {
      const pk = periodKey
      const paid = d.prepare('SELECT id, voucher_id as voucherId, verified, date_paid as datePaid FROM membership_payments WHERE member_id = ? AND period_key = ?').get(m.id, pk) as any
      out.push({
        memberId: m.id,
        name: m.name,
        memberNo: m.memberNo,
        status: m.status,
        periodKey: pk,
        interval: intv,
        amount: m.amount || 0,
        paid: paid ? 1 : 0,
        voucherId: paid?.voucherId || null,
        verified: paid?.verified || 0
      })
      continue
    }
    if (from && to) {
      // Clamp lower bound to max(joinDate, nextDue) to avoid listing periods before initial due
      const joinDate = (m.joinDate as string | undefined) || undefined
      const nextDueDate = (m.nextDue as string | undefined) || undefined
      const leaveDate = (m.leaveDate as string | undefined) || undefined
      let effFrom = from
      if (joinDate && effFrom < joinDate) effFrom = joinDate
      if (nextDueDate && effFrom < nextDueDate) effFrom = nextDueDate
      // Clamp upper bound to leave date if member has left
      let effTo = to
      if (leaveDate && effTo > leaveDate) effTo = leaveDate
      // Skip if effective range is invalid (member left before due period started)
      if (effFrom > effTo) continue
      const { startKey, endKey } = clampRangeForInterval(intv, effFrom, effTo)
      for (const pk of iteratePeriods(intv, startKey, endKey)) {
        const paid = d.prepare('SELECT id, voucher_id as voucherId, verified, date_paid as datePaid FROM membership_payments WHERE member_id = ? AND period_key = ?').get(m.id, pk) as any
        out.push({
          memberId: m.id,
          name: m.name,
          memberNo: m.memberNo,
          status: m.status,
          periodKey: pk,
          interval: intv,
          amount: m.amount || 0,
          paid: paid ? 1 : 0,
          voucherId: paid?.voucherId || null,
          verified: paid?.verified || 0
        })
      }
      continue
    }
  // Default: show the next due period for each member (fall back to today only when no nextDue configured)
  const pk = m.nextDue ? periodKeyFromDate(new Date(m.nextDue), intv) : periodKeyFromDate(new Date(), intv)
    const paid = d.prepare('SELECT id, voucher_id as voucherId, verified, date_paid as datePaid FROM membership_payments WHERE member_id = ? AND period_key = ?').get(m.id, pk) as any
    out.push({
      memberId: m.id,
      name: m.name,
      memberNo: m.memberNo,
      status: m.status,
      periodKey: pk,
      interval: intv,
      amount: m.amount || 0,
      paid: paid ? 1 : 0,
      voucherId: paid?.voucherId || null,
      verified: paid?.verified || 0
    })
  }
  const rows = out.filter(r => includePaid ? true : !r.paid)
  return { rows, total: rows.length }
}

function comparePeriodKeys(a: string, b: string, intv: Interval): number {
  if (intv === 'MONTHLY') {
    const [ay, am] = a.split('-'); const [by, bm] = b.split('-')
    const ai = Number(ay)*12 + Number(am)
    const bi = Number(by)*12 + Number(bm)
    return ai === bi ? 0 : (ai < bi ? -1 : 1)
  }
  if (intv === 'QUARTERLY') {
    const [ay, aqS] = a.split('-'); const [by, bqS] = b.split('-')
    const aq = Number((aqS||'Q1').replace('Q','')); const bq = Number((bqS||'Q1').replace('Q',''))
    const ai = Number(ay)*4 + aq
    const bi = Number(by)*4 + bq
    return ai === bi ? 0 : (ai < bi ? -1 : 1)
  }
  const ai = Number(a)
  const bi = Number(b)
  return ai === bi ? 0 : (ai < bi ? -1 : 1)
}

export function markPaid(input: { memberId: number; periodKey: string; interval: Interval; amount: number; voucherId?: number | null; datePaid?: string | null }) {
  return withTransaction((d: DB) => {
    const stmt = d.prepare(`INSERT OR IGNORE INTO membership_payments(member_id, period_key, interval, amount, date_paid, voucher_id, verified)
      VALUES (?,?,?,?,?,?,?)`)
    const verified = input.voucherId ? 1 : 0
    stmt.run(input.memberId, input.periodKey, input.interval, input.amount, input.datePaid ?? new Date().toISOString().slice(0,10), input.voucherId ?? null, verified)
    // advance next_due_date based on this payment
    try { recomputeNextDueInternal(d, input.memberId) } catch {}
    return { ok: true }
  })
}

export function unmark(input: { memberId: number; periodKey: string }) {
  const d = getDb()
  d.prepare('DELETE FROM membership_payments WHERE member_id = ? AND period_key = ?').run(input.memberId, input.periodKey)
  return { ok: true }
}

export function suggestVouchers(input: { name?: string; amount: number; periodKey: string; memberId?: number }) {
  const d = getDb()
  const { amount, name, periodKey } = input
  // Widen window: from period start - 60 days up to today (helps for older dues)
  const pr = periodRange(periodKey, guessInterval(periodKey))
  const start = new Date(pr.start); start.setUTCDate(start.getUTCDate() - 60)
  const today = new Date()
  const startISO = start.toISOString().slice(0,10)
  const endISO = today.toISOString().slice(0,10)
  
  // Match exact amount OR multiples (2x, 3x, 4x, 5x, 6x) for combined payments
  // Build amount conditions: amount ±0.05, 2*amount ±0.10, 3*amount ±0.15, etc.
  const amountConditions: string[] = []
  for (let mult = 1; mult <= 6; mult++) {
    const target = amount * mult
    const tolerance = 0.05 * mult
    amountConditions.push(`ABS(v.gross_amount - ${target}) <= ${tolerance}`)
  }
  const amountClause = `(${amountConditions.join(' OR ')})`
  
  // Build name conditions: match ANY part of the name (firstname OR lastname)
  // This helps find "Umut Mitgliedsbeitrag" when searching for "Umut Tanis"
  let nameClause = '1=1'  // Default: no name filter
  const nameParams: string[] = []
  if (name) {
    const nameParts = name.toLowerCase().split(/\s+/).filter(p => p.length >= 2)
    if (nameParts.length > 0) {
      const nameConditions = nameParts.map(() => 
        `LOWER(IFNULL(v.description,'') || ' ' || IFNULL(v.counterparty,'')) LIKE ?`
      )
      // Match if ANY name part is found OR contains 'mitglied'/'beitrag'
      nameClause = `(${nameConditions.join(' OR ')} OR LOWER(IFNULL(v.description,'')) LIKE '%mitglied%' OR LOWER(IFNULL(v.description,'')) LIKE '%beitrag%')`
      nameParts.forEach(p => nameParams.push(`%${p}%`))
    }
  }
  
  // Exclude vouchers already assigned to ANY member
  const rows = d.prepare(`
    SELECT v.id, v.voucher_no as voucherNo, v.date, v.description, v.counterparty, v.gross_amount as gross
    FROM vouchers v
    WHERE v.date BETWEEN ? AND ?
      AND ${amountClause}
      AND ${nameClause}
      AND v.id NOT IN (SELECT voucher_id FROM membership_payments WHERE voucher_id IS NOT NULL)
    ORDER BY v.date DESC
    LIMIT 10
  `).all(startISO, endISO, ...nameParams) as any[]
  return { rows }
}

function normalize(s: string) { return s.toLowerCase() }
function guessInterval(periodKey: string): Interval { return periodKey.includes('-Q') ? 'QUARTERLY' : (periodKey.includes('-') ? 'MONTHLY' : 'YEARLY') }

export function recomputeNextDue(memberId: number) {
  return withTransaction((d: DB) => {
    const m = d.prepare('SELECT contribution_interval as interval, next_due_date as nextDue, join_date as joinDate FROM members WHERE id = ?').get(memberId) as any
    if (!m?.interval) return { ok: true }
    const last = d.prepare('SELECT period_key FROM membership_payments WHERE member_id = ? ORDER BY created_at DESC LIMIT 1').get(memberId) as any
    const baseKey = last?.period_key || (m.nextDue ? periodKeyFromDate(new Date(m.nextDue), m.interval) : periodKeyFromDate(new Date(m.joinDate || new Date().toISOString().slice(0,10)), m.interval))
    const nextKey = nextPeriod(baseKey, m.interval)
    const { start } = periodRange(nextKey, m.interval)
    d.prepare('UPDATE members SET next_due_date = ?, updated_at = datetime("now") WHERE id = ?').run(start, memberId)
    return { ok: true, nextDue: start }
  })
}

// Internal helper to reuse transaction
function recomputeNextDueInternal(d: DB, memberId: number) {
  const m = d.prepare('SELECT contribution_interval as interval, next_due_date as nextDue, join_date as joinDate FROM members WHERE id = ?').get(memberId) as any
  if (!m?.interval) return
  const last = d.prepare('SELECT period_key FROM membership_payments WHERE member_id = ? ORDER BY created_at DESC LIMIT 1').get(memberId) as any
  const baseKey = last?.period_key || (m.nextDue ? periodKeyFromDate(new Date(m.nextDue), m.interval) : periodKeyFromDate(new Date(m.joinDate || new Date().toISOString().slice(0,10)), m.interval))
  const nextKey = nextPeriod(baseKey, m.interval)
  const { start } = periodRange(nextKey, m.interval)
  d.prepare('UPDATE members SET next_due_date = ?, updated_at = datetime("now") WHERE id = ?').run(start, memberId)
}

export function history(input: { memberId: number; limit?: number; offset?: number }) {
  const d = getDb()
  const limit = Math.max(1, Math.min(200, input.limit ?? 50))
  const offset = Math.max(0, input.offset ?? 0)
  const rows = d.prepare(`
    SELECT mp.period_key as periodKey, mp.interval as interval, mp.amount as amount, mp.date_paid as datePaid,
           mp.voucher_id as voucherId,
           v.voucher_no as voucherNo, v.description as description, v.counterparty as counterparty, v.gross_amount as gross
    FROM membership_payments mp
    LEFT JOIN vouchers v ON v.id = mp.voucher_id
    WHERE mp.member_id = ?
    ORDER BY mp.period_key DESC
    LIMIT ? OFFSET ?
  `).all(input.memberId, limit, offset) as any[]
  return { rows, total: rows.length }
}

export function status(input: { memberId: number }) {
  const d = getDb()
  const m = d.prepare('SELECT contribution_interval as interval, contribution_amount as amount, next_due_date as nextDue, join_date as joinDate, leave_date as leaveDate FROM members WHERE id = ?').get(input.memberId) as any
  if (!m || !m.interval) return { hasPlan: 0, state: 'NONE' as const }
  const interval = m.interval as Interval
  const amount = Number(m.amount || 0)
  const leaveDate = m.leaveDate as string | null
  let nextDue = m.nextDue as string | null
  // last paid
  const last = d.prepare('SELECT period_key as periodKey, date_paid as datePaid FROM membership_payments WHERE member_id = ? ORDER BY period_key DESC LIMIT 1').get(input.memberId) as any
  const lastPeriod = last?.periodKey || null
  const lastDate = last?.datePaid || null
  const today = new Date()
  const todayKey = periodKeyFromDate(today, interval)
  // If nextDue missing, derive from lastPeriod or joinDate (clamped to joinDate)
  if (!nextDue) {
    const baseKey = lastPeriod || periodKeyFromDate(new Date(m.joinDate || today.toISOString().slice(0,10)), interval)
    const nKey = nextPeriod(baseKey, interval)
    const { start } = periodRange(nKey, interval)
    nextDue = start
  }
  // Build set of paid period keys for overdue calc
  const paidRows = d.prepare('SELECT period_key as periodKey FROM membership_payments WHERE member_id = ?').all(input.memberId) as any[]
  const paidSet = new Set((paidRows || []).map(r => r.periodKey))
  // Determine effective end key: if member left, use leave date period, else today
  const leaveKey = leaveDate ? periodKeyFromDate(new Date(leaveDate), interval) : null
  const effectiveEndKey = leaveKey && comparePeriodKeys(leaveKey, todayKey, interval) < 0 ? leaveKey : todayKey
  // derive first unpaid (candidate): iterate forward from join or nextDue to find earliest unpaid up to effective end
  const startKeyForScan = (() => {
    if (nextDue) return periodKeyFromDate(new Date(nextDue), interval)
    if (lastPeriod) return nextPeriod(lastPeriod, interval)
    return periodKeyFromDate(new Date(m.joinDate || today.toISOString().slice(0,10)), interval)
  })()
  // count overdue: iterate periods from earliest candidate up to effective end inclusive; also keep track of firstOverdue
  let overdue = 0
  let cur = startKeyForScan
  let firstOverdue: string | null = null
  const { end: effectiveEnd } = periodRange(effectiveEndKey, interval)
  while (comparePeriodKeys(cur, effectiveEndKey, interval) <= 0) {
    const { end } = periodRange(cur, interval)
    if (end <= effectiveEnd && !paidSet.has(cur)) { overdue++; if (!firstOverdue) firstOverdue = cur }
    cur = nextPeriod(cur, interval)
  }
  const state = overdue > 0 ? 'OVERDUE' as const : 'OK' as const
  return { hasPlan: 1, interval, amount, lastPeriod, lastDate, nextDue: nextDue || null, overdue, state, joinDate: m.joinDate || null, leaveDate: leaveDate || null, firstOverdue: firstOverdue || null }
}

export function nextPeriod(pk: string, interval: Interval): string {
  if (interval === 'MONTHLY') {
    const [y,m] = pk.split('-'); const Y=Number(y), M=Number(m)
    const d = new Date(Date.UTC(Y, M-1, 1)); d.setUTCMonth(d.getUTCMonth()+1)
    return periodKeyFromDate(d, 'MONTHLY')
  }
  if (interval === 'QUARTERLY') {
    const [y,qStr] = pk.split('-'); const Y=Number(y); const Q=Number((qStr||'Q1').replace('Q',''))
    const d = new Date(Date.UTC(Y, (Q-1)*3, 1)); d.setUTCMonth(d.getUTCMonth()+3)
    return periodKeyFromDate(d, 'QUARTERLY')
  }
  const Y = Number(pk)
  const d = new Date(Date.UTC(Y+1, 0, 1))
  return periodKeyFromDate(d, 'YEARLY')
}
