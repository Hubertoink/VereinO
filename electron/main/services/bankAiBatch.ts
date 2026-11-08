import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { BankAiBatchApplyInput, BankAiBatchResult, BankAiBatchRow, BankBookingCandidate, BankTransaction } from '../../../shared/bankAiBatch'
import { getDb, withTransaction } from '../db/database'
import { findBankTransactionMatches, getBankTransaction, linkBankTransaction } from '../repositories/bankTransactions'
import { createVoucher } from '../repositories/vouchers'
import { bookRecurringOccurrence, getRecurringBankAssignments, listRecurringBookings } from '../repositories/recurringBookings'
import { resolvePrimaryClassificationValueId } from '../repositories/classifications'
import { AiBookingCandidate } from '../ipc/schemas/ai'
import { VoucherCreateInput } from '../ipc/schemas'
import { ensurePeriodOpen } from './settings'
import { recurringPeriodDescription } from '../../../shared/recurrence'
import { aiBookingComment, filterOptionalAssignmentWarnings } from '../../../shared/aiBookingPolicy'
import { aiBookingCommentsEnabled, currentAiBookingComment } from './aiBookingPolicy'

export const BankAiBatchPreviewInput = z.object({ ids: z.array(z.number().int().positive()).min(1).max(50) })
export const BankAiBatchApplySchema = z.object({
  id: z.number().int().positive(), token: z.string().length(64),
  candidate: AiBookingCandidate.extend({ date: z.string(), description: z.string(), vatRate: z.number() }).optional()
})

function bookingPayload(transaction: BankTransaction, candidate: BankBookingCandidate) {
  const parsed = AiBookingCandidate.safeParse(candidate)
  if (!parsed.success) throw new Error('Der Entwurf enthält fehlende oder ungültige Buchungsdaten. Bitte einzeln bearbeiten.')
  const c = parsed.data
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date) || !Number.isFinite(Date.parse(c.date)) || new Date(c.date).toISOString().slice(0, 10) !== c.date) {
    throw new Error('Bitte ein gültiges Buchungsdatum angeben.')
  }
  if (!c.description.trim()) throw new Error('Ein Buchungstext ist erforderlich.')
  if (c.type !== transaction.direction || Math.round(c.grossAmount * 100) !== Math.round(transaction.amount * 100)
    || (c.paymentAccountId != null && c.paymentAccountId !== transaction.paymentAccountId)
    || (c.paymentMethod != null && c.paymentMethod !== 'BANK')) {
    throw new Error('Betrag, Richtung und Zahlkonto müssen dem Bankbeleg entsprechen. Bitte einzeln prüfen.')
  }
  resolvePrimaryClassificationValueId(getDb(), { legacySphere: c.sphere, primaryClassificationValueId: c.primaryClassificationValueId })
  ensurePeriodOpen(c.date, getDb())
  return VoucherCreateInput.parse({
    date: c.date, type: c.type, sphere: c.sphere,
    primaryClassificationValueId: c.primaryClassificationValueId ?? undefined,
    description: c.description.trim(), counterparty: c.counterparty ?? transaction.counterparty,
    grossAmount: c.grossAmount, vatRate: c.vatRate, paymentMethod: 'BANK', paymentAccountId: transaction.paymentAccountId,
    budgets: c.budgets.map(b => ({ budgetId: b.id, amount: b.amount })),
    earmarks: c.earmarks.map(e => ({ earmarkId: e.id, amount: e.amount })), tags: c.tags.map(t => t.trim()).filter(Boolean),
    note: currentAiBookingComment(c.note),
    bankTransactionId: transaction.id
  })
}

// Recomputed inside the same transaction as the write. The token binds consent
// to the displayed source, suggestion and target, including recurring settings.
export function previewBankAiBatchRow(id: number, editedCandidate?: BankBookingCandidate): BankAiBatchRow {
  const transaction = getBankTransaction(id) as BankTransaction
  const commentsEnabled = aiBookingCommentsEnabled()
  const suggestion = transaction.aiSuggestion
  const blockers: string[] = []
  // Model prose is advisory. Required fields, bank consistency, duplicate checks
  // and explicit NEEDS_MANUAL_REVIEW determine whether approval is blocked.
  const warnings = filterOptionalAssignmentWarnings([...(suggestion?.warnings ?? []), ...((suggestion?.bookingCandidate as { warnings?: string[] } | null)?.warnings ?? [])])
  let candidate: BankBookingCandidate | null = editedCandidate ?? suggestion?.bookingCandidate ?? null
  let target: unknown = null
  let targetDescription = ''
  if (transaction.status !== 'OPEN') blockers.push('Dieser Bankbeleg ist bereits erledigt.')
  if (!suggestion) blockers.push('Kein KI-Vorschlag vorhanden. Bitte erneut mit KI prüfen.')
  if (suggestion) {
    if (findBankTransactionMatches({ id, linkedOnly: true }).length) blockers.push('Mögliche Doppelbuchung. Bitte einzeln prüfen.')
    if (suggestion.action === 'CREATE_BOOKING') {
      // A newly available existing match must not silently become a second booking.
      if (findBankTransactionMatches({ id, forAiReview: true }).length) blockers.push('Es gibt passende Buchungen oder Dauerbuchungen. Bitte einzeln prüfen.')
      if (!candidate) blockers.push('Der Buchungsentwurf fehlt.')
      else {
        candidate = { ...candidate, note: aiBookingComment(commentsEnabled, candidate.note), counterparty: editedCandidate ? candidate.counterparty : transaction.counterparty?.trim() || candidate.counterparty || '' }
        try { bookingPayload(transaction, candidate) } catch (error) { blockers.push((error as Error).message) }
      }
    } else if (suggestion.action === 'LINK_EXISTING' || suggestion.action === 'APPLY_RECURRING') {
      const matches = findBankTransactionMatches({ id, forAiReview: true })
      const match = matches.find((m: any) => suggestion.action === 'LINK_EXISTING'
        ? m.matchKind !== 'RECURRING' && m.id === suggestion.voucherId && !m.paymentAccountMismatch
        : m.matchKind === 'RECURRING' && m.recurringBookingId === suggestion.recurringBookingId
          && (suggestion.occurrenceId ? m.occurrenceId === suggestion.occurrenceId : m.scheduledDate === suggestion.scheduledDate))
      if (!match) blockers.push('Die vorgeschlagene Zuordnung ist nicht mehr passend. Bitte einzeln prüfen.')
      target = match ?? null
      targetDescription = match?.description || ''
      if (suggestion.action === 'APPLY_RECURRING') {
        const recurring = listRecurringBookings({ status: 'ACTIVE' }).find(r => r.id === suggestion.recurringBookingId)
        if (!recurring) blockers.push('Die Dauerbuchung ist nicht mehr aktiv.')
        if (recurring) {
          const assignments = getRecurringBankAssignments(recurring.id, transaction.amount)
          candidate = {
            date: transaction.bookingDate, type: transaction.direction, sphere: recurring.sphere,
            primaryClassificationValueId: recurring.primaryClassificationValueId,
            description: recurringPeriodDescription(recurring.description || recurring.name, recurring.frequency, match?.scheduledDate || suggestion.scheduledDate || transaction.bookingDate), counterparty: recurring.counterparty,
            grossAmount: transaction.amount, vatRate: recurring.vatRate, paymentMethod: 'BANK', paymentAccountId: transaction.paymentAccountId,
            budgets: assignments.budgets.map(b => ({ id: b.budgetId, amount: b.amount })),
            earmarks: assignments.earmarks.map(e => ({ id: e.earmarkId, amount: e.amount })), tags: recurring.tags
          }
          // Avoid volatile matching suggestions/due counts in the fingerprint.
          target = { match, candidate, name: recurring.name, note: recurring.note, status: recurring.status }
          try { bookingPayload(transaction, candidate) } catch (error) { blockers.push((error as Error).message) }
        }
      }
    } else blockers.push(suggestion.action === 'MARK_CHECKED'
      ? 'Ohne Buchung prüfen: bitte einzeln bestätigen.' : 'Dieser Vorschlag benötigt eine manuelle Prüfung.')
  }
  const token = createHash('sha256').update(JSON.stringify({ transaction, target, commentsEnabled })).digest('hex')
  return { transaction, token, candidate, commentsEnabled, blockers: [...new Set(blockers)], warnings: [...new Set(warnings)], targetDescription }
}

export function previewBankAiBatch(ids: number[]) {
  return [...new Set(ids)].map(id => previewBankAiBatchRow(id))
}

export function validateBankAiBatchDraft(input: BankAiBatchApplyInput) {
  const row = previewBankAiBatchRow(input.id, input.candidate)
  if (row.token !== input.token) throw new Error('Der Vorschlag wurde zwischenzeitlich geändert. Bitte die Sammelprüfung erneut öffnen.')
  if (row.transaction.aiSuggestion?.action !== 'CREATE_BOOKING') throw new Error('Nur neue Buchungsentwürfe können hier bearbeitet werden.')
  return { blockers: row.blockers }
}

export function applyBankAiBatchRow(input: BankAiBatchApplyInput): BankAiBatchResult {
  return withTransaction(() => {
    const row = previewBankAiBatchRow(input.id, input.candidate)
    if (row.token !== input.token) throw new Error('Bankbeleg, Vorschlag oder Zuordnung wurde geändert. Bitte die Vorschau aktualisieren und erneut auswählen.')
    if (row.blockers.length) throw new Error(row.blockers.join(' '))
    const suggestion = row.transaction.aiSuggestion!
    if (suggestion.action === 'CREATE_BOOKING') {
      const result = createVoucher(bookingPayload(row.transaction, input.candidate ?? row.candidate!))
      return { voucherId: result.id, voucherNo: result.voucherNo, warnings: result.warnings ?? [] }
    }
    if (input.candidate) throw new Error('Nur neue Buchungsentwürfe können hier bearbeitet werden.')
    if (suggestion.action === 'LINK_EXISTING') {
      const result = linkBankTransaction({ id: input.id, voucherId: suggestion.voucherId! })
      return { voucherId: suggestion.voucherId!, voucherNo: String(result.voucherNo || suggestion.voucherNo || suggestion.voucherId), warnings: [] }
    }
    if (suggestion.action === 'APPLY_RECURRING') {
      const result = bookRecurringOccurrence({ recurringBookingId: suggestion.recurringBookingId!,
        occurrenceId: suggestion.occurrenceId ?? undefined, scheduledDate: suggestion.scheduledDate ?? undefined,
        bookingDate: row.transaction.bookingDate, amount: row.transaction.amount, bankTransactionId: input.id })
      return { voucherId: result.id, voucherNo: result.voucherNo, warnings: result.warnings ?? [] }
    }
    throw new Error('Dieser Vorschlag kann nur einzeln geprüft werden.')
  })
}
