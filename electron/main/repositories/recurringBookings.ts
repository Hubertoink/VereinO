import Database from 'better-sqlite3'
import { localIsoDate, recurringPeriodDescription, type RecurringFrequency } from '../../../shared/recurrence'
import { recurringGrossAmount, scoreRecurringMatch } from '../../../shared/recurringMatching'
import { getDb, withTransaction } from '../db/database'
import { createVoucher } from './vouchers'
import { writeAudit } from '../services/audit'
import { materializeDueOccurrences, materializeRecurringBookingThrough } from './recurringOccurrences'

type DB = InstanceType<typeof Database>

export type RecurringBookingInput = {
  id?: number
  name: string
  type: 'IN' | 'OUT'
  sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
  description?: string | null
  note?: string | null
  counterparty?: string | null
  amountMode: 'NET' | 'GROSS'
  amount: number
  variableAmount?: boolean
  vatRate: number
  paymentAccountId?: number | null
  budgetId?: number | null
  earmarkId?: number | null
  budgets?: Array<{ budgetId: number; amount: number }>
  earmarks?: Array<{ earmarkId: number; amount: number }>
  tags?: string[]
  frequency: RecurringFrequency
  startDate: string
  nextDueDate: string
  endDate?: string | null
  status?: 'ACTIVE' | 'PAUSED' | 'ENDED'
}

function parseTags(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value || '[]'))
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
  } catch {
    return []
  }
}

function parseAssignments(value: unknown, kind: 'budgetId' | 'earmarkId', fallbackId?: number | null, fallbackAmount = 0) {
  try {
    const parsed = JSON.parse(String(value || '[]'))
    if (Array.isArray(parsed) && parsed.length) {
      return parsed
        .map((item) => ({ [kind]: Number(item?.[kind] || 0), amount: Number(item?.amount || 0) }))
        .filter((item) => item[kind] > 0 && item.amount > 0)
    }
  } catch { /* fall through to legacy columns */ }
  return fallbackId ? [{ [kind]: Number(fallbackId), amount: Number(fallbackAmount || 0) }] : []
}

function mapRow(row: any) {
  return {
    id: Number(row.id),
    name: String(row.name),
    type: row.type,
    sphere: row.sphere,
    description: row.description ?? null,
    note: row.note ?? null,
    counterparty: row.counterparty ?? null,
    amountMode: row.amountMode,
    amount: Number(row.amount || 0),
    variableAmount: !!row.variableAmount,
    vatRate: Number(row.vatRate || 0),
    paymentAccountId: row.paymentAccountId == null ? null : Number(row.paymentAccountId),
    paymentAccountName: row.paymentAccountName ?? null,
    paymentAccountKind: row.paymentAccountKind ?? null,
    budgetId: row.budgetId == null ? null : Number(row.budgetId),
    budgetLabel: row.budgetLabel ?? null,
    earmarkId: row.earmarkId == null ? null : Number(row.earmarkId),
    earmarkLabel: row.earmarkLabel ?? null,
    budgets: parseAssignments(row.budgetAssignmentsJson, 'budgetId', row.budgetId, row.amount),
    earmarks: parseAssignments(row.earmarkAssignmentsJson, 'earmarkId', row.earmarkId, row.amount),
    tags: parseTags(row.tagsJson),
    frequency: row.frequency,
    startDate: row.startDate,
    nextDueDate: row.nextDueDate,
    endDate: row.endDate ?? null,
    status: row.status,
    dueCount: Number(row.dueCount || 0),
    earliestDueDate: row.earliestDueDate ?? null,
    lastBookedDate: row.lastBookedDate ?? null,
    suggestedVoucherId: row.suggestedVoucherId == null ? null : Number(row.suggestedVoucherId),
    suggestedVoucherNo: row.suggestedVoucherNo ?? null,
    suggestedVoucherDate: row.suggestedVoucherDate ?? null,
    suggestedVoucherDescription: row.suggestedVoucherDescription ?? null,
    suggestedBankTransactionId: row.suggestedBankTransactionId == null ? null : Number(row.suggestedBankTransactionId),
    suggestedMatchScore: row.suggestedMatchScore == null ? null : Number(row.suggestedMatchScore),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt ?? null
  }
}

function bestVoucherSuggestion(d: DB, recurring: any) {
  if (!recurring.earliestDueDate || !recurring.paymentAccountId) return null
  const expectedGrossAmount = recurringGrossAmount(recurring.amountMode, recurring.amount, recurring.vatRate)
  const candidates = d.prepare(`
    SELECT v.id, v.voucher_no as voucherNo, v.date, v.type, v.description, v.note, v.counterparty,
      v.gross_amount as grossAmount, v.payment_account_id as paymentAccountId,
      bt.id as bankTransactionId
    FROM vouchers v
    LEFT JOIN bank_transactions bt ON bt.voucher_id = v.id AND bt.status = 'LINKED'
    WHERE v.reversed_by_id IS NULL
      AND v.type = ?
      AND v.payment_account_id = ?
      AND ABS(julianday(v.date) - julianday(?)) <= 14
      AND NOT EXISTS (
        SELECT 1 FROM recurring_occurrences used
        WHERE used.voucher_id = v.id AND used.status = 'BOOKED'
      )
    ORDER BY CASE WHEN bt.id IS NULL THEN 1 ELSE 0 END,
      ABS(julianday(v.date) - julianday(?)), v.id DESC
    LIMIT 30
  `).all(recurring.type, recurring.paymentAccountId, recurring.earliestDueDate, recurring.earliestDueDate) as any[]

  return candidates
    .map((candidate) => {
      const match = scoreRecurringMatch({
        scheduledDate: recurring.earliestDueDate,
        bookingDate: candidate.date,
        recurringType: recurring.type,
        bookingType: candidate.type,
        expectedGrossAmount,
        bookingGrossAmount: Number(candidate.grossAmount),
        variableAmount: !!recurring.variableAmount,
        recurringPaymentAccountId: recurring.paymentAccountId,
        bookingPaymentAccountId: candidate.paymentAccountId,
        recurringText: [recurring.name, recurring.description, recurring.counterparty].filter(Boolean).join(' '),
        bookingText: [candidate.description, candidate.note, candidate.counterparty].filter(Boolean).join(' ')
      })
      return match ? { ...candidate, ...match } : null
    })
    .filter(Boolean)
    .sort((a: any, b: any) => Number(b.bankTransactionId != null) - Number(a.bankTransactionId != null) || b.score - a.score || a.dateDistance - b.dateDistance)[0] ?? null
}

const baseSelect = `
  SELECT rb.id, rb.name, rb.type, rb.sphere, rb.description, rb.note, rb.counterparty,
         rb.amount_mode as amountMode, rb.amount, rb.variable_amount as variableAmount,
         rb.vat_rate as vatRate, rb.payment_account_id as paymentAccountId,
         pa.name as paymentAccountName, pa.kind as paymentAccountKind,
         rb.budget_id as budgetId,
         COALESCE(NULLIF(b.name, ''), NULLIF(b.category_name, ''), NULLIF(b.project_name, ''), CAST(b.year AS TEXT)) as budgetLabel,
         rb.earmark_id as earmarkId,
         CASE WHEN e.id IS NULL THEN NULL ELSE e.code || ' - ' || e.name END as earmarkLabel,
          rb.budget_assignments_json as budgetAssignmentsJson, rb.earmark_assignments_json as earmarkAssignmentsJson,
          rb.tags_json as tagsJson, rb.frequency, rb.start_date as startDate,
         rb.next_due_date as nextDueDate, rb.end_date as endDate, rb.status,
         rb.created_at as createdAt, rb.updated_at as updatedAt,
         (SELECT COUNT(*) FROM recurring_occurrences ro WHERE ro.recurring_booking_id=rb.id AND ro.status='DUE') as dueCount,
         (SELECT MIN(ro.scheduled_date) FROM recurring_occurrences ro WHERE ro.recurring_booking_id=rb.id AND ro.status='DUE') as earliestDueDate,
         (SELECT MAX(ro.scheduled_date) FROM recurring_occurrences ro WHERE ro.recurring_booking_id=rb.id AND ro.status='BOOKED') as lastBookedDate
  FROM recurring_bookings rb
  LEFT JOIN payment_accounts pa ON pa.id=rb.payment_account_id
  LEFT JOIN budgets b ON b.id=rb.budget_id
  LEFT JOIN earmarks e ON e.id=rb.earmark_id
`

export function listRecurringBookings(input?: { status?: 'ACTIVE' | 'PAUSED' | 'ENDED'; q?: string }) {
  const d = getDb()
  materializeDueOccurrences(d)
  const where: string[] = []
  const params: unknown[] = []
  if (input?.status) {
    where.push('rb.status=?')
    params.push(input.status)
  }
  if (input?.q?.trim()) {
    where.push(`(rb.name LIKE ? OR rb.description LIKE ? OR rb.counterparty LIKE ?)`)
    const q = `%${input.q.trim()}%`
    params.push(q, q, q)
  }
  const sql = `${baseSelect}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY dueCount DESC, COALESCE(earliestDueDate, rb.next_due_date), rb.name COLLATE NOCASE`
  return (d.prepare(sql).all(...params) as any[]).map((row) => {
    const suggestion = Number(row.dueCount || 0) > 0 ? bestVoucherSuggestion(d, row) : null
    return mapRow({
      ...row,
      suggestedVoucherId: suggestion?.id ?? null,
      suggestedVoucherNo: suggestion?.voucherNo ?? null,
      suggestedVoucherDate: suggestion?.date ?? null,
      suggestedVoucherDescription: suggestion?.description ?? null,
      suggestedBankTransactionId: suggestion?.bankTransactionId ?? null,
      suggestedMatchScore: suggestion?.score ?? null
    })
  })
}

export function recurringBookingsSummary() {
  const d = getDb()
  materializeDueOccurrences(d)
  const today = localIsoDate()
  const upcomingEnd = new Date()
  upcomingEnd.setDate(upcomingEnd.getDate() + 30)
  const upcomingEndIso = localIsoDate(upcomingEnd)
  const counts = d.prepare(`
    SELECT
      (SELECT COUNT(*) FROM recurring_occurrences WHERE status='DUE') as due,
      SUM(CASE WHEN status='ACTIVE' THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN status='PAUSED' THEN 1 ELSE 0 END) as paused,
      SUM(CASE WHEN status='ACTIVE' AND next_due_date > ? AND next_due_date <= ? THEN 1 ELSE 0 END) as upcoming
    FROM recurring_bookings
  `).get(today, upcomingEndIso) as any
  return {
    due: Number(counts?.due || 0),
    active: Number(counts?.active || 0),
    paused: Number(counts?.paused || 0),
    upcoming: Number(counts?.upcoming || 0)
  }
}

export function upsertRecurringBooking(input: RecurringBookingInput) {
  const d = getDb()
  const name = input.name.trim()
  if (!name) throw new Error('Bitte eine Bezeichnung angeben.')
  if (!(input.amount > 0)) throw new Error('Bitte einen Betrag größer als 0 € angeben.')
  if (input.endDate && input.endDate < input.startDate) throw new Error('Das Enddatum darf nicht vor dem Beginn liegen.')
  if (input.nextDueDate < input.startDate) throw new Error('Die nächste Fälligkeit darf nicht vor dem Beginn liegen.')

  const budgets = (input.budgets || []).filter((assignment) => assignment.budgetId && assignment.amount > 0).map((assignment) => ({ budgetId: Number(assignment.budgetId), amount: Number(assignment.amount) }))
  const earmarks = (input.earmarks || []).filter((assignment) => assignment.earmarkId && assignment.amount > 0).map((assignment) => ({ earmarkId: Number(assignment.earmarkId), amount: Number(assignment.amount) }))
  const legacyBudgets = budgets.length ? budgets : (input.budgetId ? [{ budgetId: Number(input.budgetId), amount: input.amount }] : [])
  const legacyEarmarks = earmarks.length ? earmarks : (input.earmarkId ? [{ earmarkId: Number(input.earmarkId), amount: input.amount }] : [])
  const data = [
    name,
    input.type,
    input.sphere,
    input.description?.trim() || null,
    input.note?.trim() || null,
    input.counterparty?.trim() || null,
    input.amountMode,
    input.amount,
    input.variableAmount ? 1 : 0,
    input.vatRate,
    input.paymentAccountId ?? null,
    legacyBudgets[0]?.budgetId ?? null,
    legacyEarmarks[0]?.earmarkId ?? null,
    JSON.stringify(legacyBudgets),
    JSON.stringify(legacyEarmarks),
    JSON.stringify((input.tags || []).map((tag) => tag.trim()).filter(Boolean)),
    input.frequency,
    Number(input.nextDueDate.slice(8, 10)),
    input.startDate,
    input.nextDueDate,
    input.endDate || null,
    input.status || 'ACTIVE'
  ]

  if (input.id) {
    const before = d.prepare('SELECT * FROM recurring_bookings WHERE id=?').get(input.id)
    if (!before) throw new Error('Dauerbuchung nicht gefunden.')
    d.prepare(`
      UPDATE recurring_bookings SET
        name=?, type=?, sphere=?, description=?, note=?, counterparty=?, amount_mode=?, amount=?, variable_amount=?, vat_rate=?,
        payment_account_id=?, budget_id=?, earmark_id=?, budget_assignments_json=?, earmark_assignments_json=?, tags_json=?, frequency=?, anchor_day=?, start_date=?, next_due_date=?, end_date=?, status=?, updated_at=datetime('now')
      WHERE id=?
    `).run(...data, input.id)
    writeAudit(d, null, 'recurring_bookings', input.id, 'UPDATE', { before, input })
    return { id: input.id }
  }

  const result = d.prepare(`
    INSERT INTO recurring_bookings(
      name, type, sphere, description, note, counterparty, amount_mode, amount, variable_amount, vat_rate,
      payment_account_id, budget_id, earmark_id, budget_assignments_json, earmark_assignments_json, tags_json, frequency, anchor_day, start_date, next_due_date, end_date, status
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(...data)
  const id = Number(result.lastInsertRowid)
  writeAudit(d, null, 'recurring_bookings', id, 'CREATE', { input })
  return { id }
}

export function setRecurringBookingStatus(id: number, status: 'ACTIVE' | 'PAUSED' | 'ENDED') {
  const d = getDb()
  const before = d.prepare('SELECT id, name, status FROM recurring_bookings WHERE id=?').get(id) as any
  if (!before) throw new Error('Dauerbuchung nicht gefunden.')
  d.prepare(`UPDATE recurring_bookings SET status=?, updated_at=datetime('now') WHERE id=?`).run(status, id)
  if (status === 'ENDED') {
    d.prepare(`UPDATE recurring_occurrences SET status='SKIPPED', updated_at=datetime('now') WHERE recurring_booking_id=? AND status='DUE'`).run(id)
  }
  writeAudit(d, null, 'recurring_bookings', id, 'STATUS', { before: before.status, after: status })
  return { id, status }
}

export function skipRecurringOccurrence(recurringBookingId: number) {
  const d = getDb()
  materializeDueOccurrences(d)
  const occurrence = d.prepare(`
    SELECT id, scheduled_date as scheduledDate FROM recurring_occurrences
    WHERE recurring_booking_id=? AND status='DUE'
    ORDER BY scheduled_date LIMIT 1
  `).get(recurringBookingId) as any
  if (!occurrence) throw new Error('Für diese Dauerbuchung ist aktuell kein Termin fällig.')
  d.prepare(`UPDATE recurring_occurrences SET status='SKIPPED', updated_at=datetime('now') WHERE id=?`).run(occurrence.id)
  writeAudit(d, null, 'recurring_occurrences', occurrence.id, 'SKIP', occurrence)
  return { id: Number(occurrence.id), scheduledDate: occurrence.scheduledDate }
}

export function linkRecurringOccurrence(input: { recurringBookingId: number; voucherId: number }) {
  return withTransaction((d) => {
    materializeDueOccurrences(d)
    const recurring = d.prepare(`${baseSelect} WHERE rb.id=?`).get(input.recurringBookingId) as any
    if (!recurring) throw new Error('Dauerbuchung nicht gefunden.')
    const occurrence = d.prepare(`
      SELECT id, scheduled_date as scheduledDate FROM recurring_occurrences
      WHERE recurring_booking_id=? AND status='DUE'
      ORDER BY scheduled_date LIMIT 1
    `).get(input.recurringBookingId) as any
    if (!occurrence) throw new Error('Für diese Dauerbuchung ist aktuell kein Termin fällig.')
    const voucher = d.prepare(`
      SELECT id, voucher_no as voucherNo, date, type, gross_amount as grossAmount,
        payment_account_id as paymentAccountId, description, note, counterparty,
        reversed_by_id as reversedById
      FROM vouchers WHERE id=?
    `).get(input.voucherId) as any
    if (!voucher) throw new Error('Buchung nicht gefunden.')
    if (voucher.reversedById) throw new Error('Eine stornierte Buchung kann nicht zugeordnet werden.')
    const alreadyUsed = d.prepare(`
      SELECT id FROM recurring_occurrences
      WHERE voucher_id=? AND status='BOOKED' AND id<>?
    `).get(input.voucherId, occurrence.id)
    if (alreadyUsed) throw new Error('Diese Buchung ist bereits einer anderen Dauerbuchung zugeordnet.')

    const match = scoreRecurringMatch({
      scheduledDate: occurrence.scheduledDate,
      bookingDate: voucher.date,
      recurringType: recurring.type,
      bookingType: voucher.type,
      expectedGrossAmount: recurringGrossAmount(recurring.amountMode, recurring.amount, recurring.vatRate),
      bookingGrossAmount: Number(voucher.grossAmount),
      variableAmount: !!recurring.variableAmount,
      recurringPaymentAccountId: recurring.paymentAccountId,
      bookingPaymentAccountId: voucher.paymentAccountId,
      recurringText: [recurring.name, recurring.description, recurring.counterparty].filter(Boolean).join(' '),
      bookingText: [voucher.description, voucher.note, voucher.counterparty].filter(Boolean).join(' ')
    })
    if (!match) throw new Error('Buchung und Dauerbuchung passen bei Konto, Art, Betrag oder Zeitraum nicht zusammen.')

    const update = d.prepare(`
      UPDATE recurring_occurrences
      SET status='BOOKED', voucher_id=?, booked_at=datetime('now'), updated_at=datetime('now')
      WHERE id=? AND status='DUE'
    `).run(voucher.id, occurrence.id)
    if (update.changes !== 1) throw new Error('Diese Fälligkeit wurde bereits verarbeitet.')
    writeAudit(d, null, 'recurring_occurrences', occurrence.id, 'LINK', {
      voucherId: voucher.id,
      scheduledDate: occurrence.scheduledDate,
      matchScore: match.score
    })
    return {
      occurrenceId: Number(occurrence.id),
      scheduledDate: occurrence.scheduledDate,
      voucherId: Number(voucher.id),
      voucherNo: voucher.voucherNo
    }
  })
}

export function bookRecurringOccurrence(input: { recurringBookingId: number; occurrenceId?: number; scheduledDate?: string; bookingDate: string; amount?: number; bankTransactionId?: number }) {
  return withTransaction((d) => {
    materializeDueOccurrences(d)
    if (!input.occurrenceId && input.scheduledDate) {
      materializeRecurringBookingThrough(d, input.recurringBookingId, input.scheduledDate)
    }
    const recurring = d.prepare(`${baseSelect} WHERE rb.id=?`).get(input.recurringBookingId) as any
    if (!recurring) throw new Error('Dauerbuchung nicht gefunden.')
    const occurrence = d.prepare(`
      SELECT id, scheduled_date as scheduledDate FROM recurring_occurrences
      WHERE recurring_booking_id=? AND status='DUE'
        ${input.occurrenceId ? 'AND id=?' : input.scheduledDate ? 'AND scheduled_date=?' : ''}
      ORDER BY scheduled_date LIMIT 1
    `).get(...(input.occurrenceId
      ? [input.recurringBookingId, input.occurrenceId]
      : input.scheduledDate
        ? [input.recurringBookingId, input.scheduledDate]
        : [input.recurringBookingId])) as any
    if (!occurrence) throw new Error('Für diese Dauerbuchung ist aktuell kein Termin fällig.')

    const bankTransaction = input.bankTransactionId
      ? d.prepare(`
          SELECT id, status, booking_date as bookingDate, direction, amount,
            payment_account_id as paymentAccountId
          FROM bank_transactions WHERE id=?
        `).get(input.bankTransactionId) as any
      : null
    if (input.bankTransactionId && !bankTransaction) throw new Error('Bankbeleg nicht gefunden.')
    if (bankTransaction?.status !== 'OPEN') throw new Error('Der Bankbeleg ist bereits erledigt.')
    if (bankTransaction && bankTransaction.direction !== recurring.type) throw new Error('Bankbeleg und Dauerbuchung haben unterschiedliche Buchungsarten.')
    if (bankTransaction && Number(bankTransaction.paymentAccountId) !== Number(recurring.paymentAccountId)) {
      throw new Error('Bankbeleg und Dauerbuchung verwenden unterschiedliche Zahlkonten.')
    }
    if (bankTransaction) {
      const match = scoreRecurringMatch({
        scheduledDate: occurrence.scheduledDate,
        bookingDate: bankTransaction.bookingDate,
        recurringType: recurring.type,
        bookingType: bankTransaction.direction,
        expectedGrossAmount: recurringGrossAmount(recurring.amountMode, recurring.amount, recurring.vatRate),
        bookingGrossAmount: Number(bankTransaction.amount),
        variableAmount: !!recurring.variableAmount,
        recurringPaymentAccountId: recurring.paymentAccountId,
        bookingPaymentAccountId: bankTransaction.paymentAccountId,
        recurringText: [recurring.name, recurring.description, recurring.counterparty].filter(Boolean).join(' '),
        bookingText: ''
      })
      if (!match) throw new Error('Bankbeleg und Dauerbuchung passen bei Konto, Art, Betrag oder Zeitraum nicht zusammen.')
    }

    const bookingDate = bankTransaction?.bookingDate || input.bookingDate
    const amount = bankTransaction
      ? Number(bankTransaction.amount)
      : Number(input.amount ?? recurring.amount ?? 0)
    const assignmentAmount = bankTransaction
      ? amount
      : recurring.amountMode === 'NET'
      ? Math.round(amount * (1 + Number(recurring.vatRate || 0) / 100) * 100) / 100
      : amount
    const budgets = parseAssignments(recurring.budgetAssignmentsJson, 'budgetId', recurring.budgetId, assignmentAmount) as Array<{ budgetId: number; amount: number }>
    const earmarks = parseAssignments(recurring.earmarkAssignmentsJson, 'earmarkId', recurring.earmarkId, assignmentAmount) as Array<{ earmarkId: number; amount: number }>
    const voucher = createVoucher({
      date: input.bookingDate,
      type: recurring.type,
      sphere: recurring.sphere,
      description: recurringPeriodDescription(recurring.description || recurring.name, recurring.frequency, occurrence.scheduledDate),
      note: recurring.note || null,
      counterparty: recurring.counterparty || null,
      ...(bankTransaction || recurring.amountMode === 'GROSS' ? { grossAmount: amount } : { netAmount: amount }),
      vatRate: Number(recurring.vatRate || 0),
      paymentAccountId: recurring.paymentAccountId ?? null,
      budgets: budgets.length ? budgets : undefined,
      earmarks: earmarks.length ? earmarks : undefined,
      tags: parseTags(recurring.tagsJson),
      bankTransactionId: bankTransaction?.id
    })

    const update = d.prepare(`
      UPDATE recurring_occurrences
      SET status='BOOKED', voucher_id=?, booked_at=datetime('now'), updated_at=datetime('now')
      WHERE id=? AND status='DUE'
    `).run(voucher.id, occurrence.id)
    if (update.changes !== 1) throw new Error('Diese Fälligkeit wurde bereits verarbeitet.')
    writeAudit(d, null, 'recurring_occurrences', occurrence.id, 'BOOK', {
      voucherId: voucher.id,
      bookingDate,
      bankTransactionId: bankTransaction?.id ?? null
    })
    return { ...voucher, occurrenceId: Number(occurrence.id), scheduledDate: occurrence.scheduledDate }
  })
}
