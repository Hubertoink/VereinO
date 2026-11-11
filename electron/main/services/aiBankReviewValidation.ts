import { AiBankImportReviewSuggestion, type TAiBankImportReviewResult } from '../ipc/schemas/ai'
import { inferMembershipSuggestion } from '../../../shared/membershipPayments'

function record(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

/** Validate each suggestion independently; never guess missing booking data or IDs. */
export function validateBankReviewResult(
  value: unknown,
  transactions: Array<{ id: number; direction: 'IN' | 'OUT'; paymentAccountName?: string | null; purpose?: string | null; counterparty?: string | null; membershipCandidates?: Array<{ memberId: number; startPeriod?: string; warnings?: string[] }>; matches?: Array<{ id: number; matchKind?: string | null; paymentAccountMismatch?: boolean | null; paymentAccountName?: string | null }> }>,
  onInvalidSuggestion?: (transactionId: number, reason: string) => void
): TAiBankImportReviewResult {
  const result = record(value)
  if (!result || !Array.isArray(result.suggestions)) {
    throw new Error('Die KI-Antwort enthält keine gültige Vorschlagsliste (suggestions). Bitte die Prüfung erneut starten.')
  }
  const rows = result.suggestions.map(record)
  const suggestions = transactions.map(({ id: transactionId, direction, paymentAccountName, purpose, counterparty, matches: bankMatches, membershipCandidates }) => {
    const matches = rows.filter((row) => row?.transactionId === transactionId)
    const candidate = matches.length === 1 ? matches[0] : null
    let invalidFields = ''
    if (candidate) {
      const booking = record(candidate.bookingCandidate)
      const normalizedBooking = booking ? {
        ...booking,
        source: booking.source ?? undefined,
        budgets: booking.budgets ?? [], earmarks: booking.earmarks ?? [], tags: booking.tags ?? [],
        warnings: booking.warnings ?? [], evidence: booking.evidence ?? []
      } : candidate.bookingCandidate
      const parsed = AiBankImportReviewSuggestion.safeParse({
        ...candidate,
        // These fields are optional metadata, not evidence for the assignment.
        warnings: candidate.warnings ?? [], evidence: candidate.evidence ?? [],
        matchedVoucher: undefined,
        bookingCandidate: candidate.action === 'CREATE_BOOKING' ? normalizedBooking : null,
        voucherId: candidate.action === 'LINK_EXISTING' ? candidate.voucherId : null,
        voucherNo: candidate.action === 'LINK_EXISTING' ? candidate.voucherNo : null,
        recurringBookingId: candidate.action === 'APPLY_RECURRING' ? candidate.recurringBookingId : null,
        recurringBookingName: candidate.action === 'APPLY_RECURRING' ? candidate.recurringBookingName : null,
        occurrenceId: candidate.action === 'APPLY_RECURRING' ? candidate.occurrenceId : null,
        scheduledDate: candidate.action === 'APPLY_RECURRING' ? candidate.scheduledDate : null
      })
      if (parsed.success) {
        const suggestion = parsed.data
        const linkedMatch = suggestion.action === 'LINK_EXISTING'
          ? bankMatches?.find(match => match.matchKind === 'VOUCHER' && match.id === suggestion.voucherId) : undefined
        if (linkedMatch?.paymentAccountMismatch) {
          const reason = `Die vorhandene Buchung liegt auf „${linkedMatch.paymentAccountName || 'ohne Konto'}“, der Bankbeleg auf „${paymentAccountName || 'ohne Konto'}“. Bitte klären, ob das Konto der Buchung falsch ist oder eine separate Zahlung vorliegt. Eine direkte Verknüpfung ist so nicht möglich.`
          onInvalidSuggestion?.(transactionId, reason)
          return { transactionId, action: 'NEEDS_MANUAL_REVIEW' as const, confidence: 0, reason, warnings: [], evidence: [] }
        }
        const assignsPayment = ['CREATE_BOOKING', 'LINK_EXISTING'].includes(suggestion.action)
        if (!assignsPayment) suggestion.membership = null
        else suggestion.membership ??= inferMembershipSuggestion({ direction, purpose }, suggestion.action, membershipCandidates)
        if (suggestion.membership && (direction !== 'IN'
          || !membershipCandidates?.some(c => c.memberId === suggestion.membership?.memberId) || membershipCandidates.length !== 1)) {
          const reason = 'Die Mitgliedszuordnung ist nicht eindeutig belegt. Bitte manuell prüfen.'
          onInvalidSuggestion?.(transactionId, reason)
          return { transactionId, action: 'NEEDS_MANUAL_REVIEW' as const, confidence: 0, reason, warnings: [], evidence: [] }
        }
        if (suggestion.membership && assignsPayment && direction === 'IN' && membershipCandidates?.length === 1) {
          const member = membershipCandidates[0]
          // Periods come from the bank purpose and the actual plan, never model guesses.
          suggestion.membership = { memberId: member.memberId, startPeriod: member.startPeriod }
          suggestion.warnings.push(...(member.warnings || []))
          if (suggestion.bookingCandidate) {
            const draft = suggestion.bookingCandidate
            if (purpose?.trim()) {
              if (draft.note === draft.description) draft.note = purpose.trim()
              draft.description = purpose.trim()
            }
            if (counterparty?.trim()) draft.counterparty = counterparty.trim()
          }
        }
        if (suggestion.bookingCandidate && suggestion.bookingCandidate.type !== direction) {
          // The import stores the original sign as direction and amount as an absolute value.
          // Model interpretation of the purpose must never reverse the actual cash flow.
          suggestion.bookingCandidate.type = direction
          suggestion.warnings.push(`Die Buchungsrichtung wurde anhand des Bankbelegs auf ${direction === 'IN' ? 'Einnahme' : 'Ausgabe'} korrigiert. Bitte Beschreibung und Zuordnung prüfen.`)
        }
        if (suggestion.action === 'LINK_EXISTING' && bankMatches && !bankMatches.some(match =>
          match.matchKind === 'VOUCHER' && match.id === suggestion.voucherId
        )) {
          invalidFields = 'voucherId (keine vorhandene Buchung aus den mitgegebenen Treffern)'
        } else return suggestion
      } else {
        invalidFields = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.') || 'Vorschlag'))].join(', ')
      }
    }
    const reason = matches.length > 1
      ? 'Die KI hat mehrere Vorschläge für diesen Bankbeleg geliefert. Bitte manuell prüfen.'
      : candidate
        ? `Der KI-Vorschlag enthält fehlende oder ungültige Angaben: ${invalidFields}. Bitte manuell prüfen.`
        : 'Die KI hat keinen eindeutig zugehörigen Vorschlag für diesen Bankbeleg geliefert. Bitte manuell prüfen.'
    onInvalidSuggestion?.(transactionId, reason)
    return {
      transactionId,
      action: 'NEEDS_MANUAL_REVIEW' as const,
      confidence: 0,
      reason,
      warnings: ['Es wurde keine Zuordnung oder Buchung übernommen.'],
      evidence: []
    }
  })
  return {
    suggestions,
    summary: typeof result.summary === 'string' ? result.summary : undefined,
    warnings: Array.isArray(result.warnings) ? result.warnings.filter((item): item is string => typeof item === 'string') : []
  }
}
