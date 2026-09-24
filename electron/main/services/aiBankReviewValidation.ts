import { AiBankImportReviewSuggestion, type TAiBankImportReviewResult } from '../ipc/schemas/ai'

function record(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

/** Validate each suggestion independently; never guess missing booking data or IDs. */
export function validateBankReviewResult(value: unknown, transactionIds: number[]): TAiBankImportReviewResult {
  const result = record(value)
  if (!result || !Array.isArray(result.suggestions)) {
    throw new Error('Die KI-Antwort enthält keine gültige Vorschlagsliste (suggestions). Bitte die Prüfung erneut starten.')
  }
  const rows = result.suggestions.map(record)
  const suggestions = transactionIds.map((transactionId) => {
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
      if (parsed.success) return parsed.data
      invalidFields = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.') || 'Vorschlag'))].join(', ')
    }
    return {
      transactionId,
      action: 'NEEDS_MANUAL_REVIEW' as const,
      confidence: 0,
      reason: matches.length > 1
        ? 'Die KI hat mehrere Vorschläge für diesen Bankbeleg geliefert. Bitte manuell prüfen.'
        : candidate
          ? `Der KI-Vorschlag enthält fehlende oder ungültige Angaben: ${invalidFields}. Bitte manuell prüfen.`
          : 'Die KI hat keinen eindeutig zugehörigen Vorschlag für diesen Bankbeleg geliefert. Bitte manuell prüfen.',
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
