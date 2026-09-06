import type { AiBankReviewState, AiBankReviewSuggestion } from './aiViewTypes'
import {
  bankSuggestionAmount,
  bankSuggestionLabel,
  bankSuggestionTitle,
  bankSuggestionTone
} from './aiBankReview'
import { formatIsoDate } from './aiText'

type Props = {
  review: AiBankReviewState
  busy: boolean
  onLink: (suggestion: AiBankReviewSuggestion) => void
  onApplyRecurring: (suggestion: AiBankReviewSuggestion) => void
  onOpenBooking: (suggestion: AiBankReviewSuggestion) => void
  onCreateBooking: (suggestion: AiBankReviewSuggestion) => void
  onMarkChecked: (suggestion: AiBankReviewSuggestion) => void
}

export function AiBankReviewCard({
  review,
  busy,
  onLink,
  onApplyRecurring,
  onOpenBooking,
  onCreateBooking,
  onMarkChecked
}: Props) {
  const groups = {
    matches: review.suggestions.filter(
      (item) =>
        !item.resolved && (item.action === 'LINK_EXISTING' || item.action === 'APPLY_RECURRING')
    ),
    create: review.suggestions.filter((item) => !item.resolved && item.action === 'CREATE_BOOKING'),
    manual: review.suggestions.filter(
      (item) =>
        !item.resolved && (item.action === 'NEEDS_MANUAL_REVIEW' || item.action === 'MARK_CHECKED')
    ),
    done: review.suggestions.filter((item) => !!item.resolved)
  }

  const renderActions = (suggestion: AiBankReviewSuggestion) => {
    if (suggestion.resolved)
      return (
        <span className="ai-bank-resolved">
          {suggestion.resolvedVoucherNo ? `Erledigt · ${suggestion.resolvedVoucherNo}` : 'Erledigt'}
        </span>
      )
    if (suggestion.action === 'LINK_EXISTING')
      return (
        <button
          className="btn primary"
          type="button"
          disabled={busy || !suggestion.voucherId}
          onClick={() => onLink(suggestion)}
        >
          Treffer verknüpfen
        </button>
      )
    if (suggestion.action === 'APPLY_RECURRING')
      return (
        <button
          className="btn primary"
          type="button"
          disabled={
            busy ||
            !suggestion.recurringBookingId ||
            (!suggestion.occurrenceId && !suggestion.scheduledDate)
          }
          onClick={() => onApplyRecurring(suggestion)}
        >
          Dauerbuchung zuordnen
        </button>
      )
    if (suggestion.action === 'CREATE_BOOKING')
      return (
        <>
          <button
            className="btn"
            type="button"
            disabled={busy || !suggestion.bookingCandidate}
            onClick={() => onOpenBooking(suggestion)}
          >
            Im Modal prüfen
          </button>
          <button
            className="btn primary"
            type="button"
            disabled={busy || !suggestion.bookingCandidate}
            onClick={() => onCreateBooking(suggestion)}
          >
            Direkt buchen
          </button>
        </>
      )
    if (suggestion.action === 'MARK_CHECKED')
      return (
        <button
          className="btn"
          type="button"
          disabled={busy}
          onClick={() => onMarkChecked(suggestion)}
        >
          Als geprüft markieren
        </button>
      )
    return (
      <span className="ai-bank-resolved ai-bank-resolved--muted">
        Bitte im Bankimport manuell prüfen
      </span>
    )
  }

  const renderSuggestion = (suggestion: AiBankReviewSuggestion) => {
    const transaction = suggestion.transaction || {}
    const voucherLabel =
      suggestion.voucherNo ||
      suggestion.resolvedVoucherNo ||
      (suggestion.voucherId ? `#${suggestion.voucherId}` : '')
    return (
      <article
        key={suggestion.transactionId}
        className={`ai-bank-suggestion ai-bank-suggestion--${bankSuggestionTone(suggestion)}`}
      >
        <div className="ai-bank-suggestion-main">
          <div className="ai-bank-suggestion-title">
            <span className="ai-bank-suggestion-badge">{bankSuggestionLabel(suggestion)}</span>
            <strong>Bankbeleg #{suggestion.transactionId}</strong>
            {bankSuggestionAmount(suggestion) && <em>{bankSuggestionAmount(suggestion)}</em>}
          </div>
          <p>{bankSuggestionTitle(suggestion)}</p>
          <small>
            {transaction.bookingDate || ''}
            {voucherLabel ? ` · Buchung ${voucherLabel}` : ''}
            {suggestion.recurringBookingName
              ? ` · Dauerbuchung ${suggestion.recurringBookingName}${suggestion.scheduledDate ? ` (${formatIsoDate(suggestion.scheduledDate)})` : ''}`
              : ''}
          </small>
        </div>
        <div className="ai-bank-suggestion-detail">
          <span>{suggestion.reason}</span>
          {suggestion.warnings?.length ? <small>{suggestion.warnings.join(' · ')}</small> : null}
        </div>
        <div className="ai-bank-suggestion-actions">{renderActions(suggestion)}</div>
      </article>
    )
  }

  const renderGroup = (title: string, subtitle: string, suggestions: AiBankReviewSuggestion[]) => {
    if (!suggestions.length) return null
    return (
      <section className="ai-bank-group">
        <div className="ai-bank-group-head">
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
        <div className="ai-bank-suggestion-list">{suggestions.map(renderSuggestion)}</div>
      </section>
    )
  }

  return (
    <section id="ai-review-bank" className="card ai-bank-review-card">
      <div className="ai-section-head">
        <strong>Bankimport-Vorschläge</strong>
        <span>
          {review.suggestions.filter((item) => !item.resolved).length} offen
          {review.sourceTotal ? ` · ${review.sourceTotal} geprüft` : ''}
        </span>
      </div>
      {review.filterSummary && <div className="ai-bank-filter-note">{review.filterSummary}</div>}
      {renderGroup('Sichere Treffer', 'Bestehende Buchungen verknüpfen', groups.matches)}
      {renderGroup('Neue Buchungen vorbereiten', 'Kein Treffer gefunden', groups.create)}
      {renderGroup('Manuell klären', 'Unklare oder nicht buchungsrelevante Belege', groups.manual)}
      {renderGroup('Erledigt', 'Bereits aus dieser Prüfung übernommen', groups.done)}
    </section>
  )
}
