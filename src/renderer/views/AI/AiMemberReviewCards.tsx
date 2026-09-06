import type {
  AiContributionLinkState,
  AiContributionPaymentState,
  AiMemberImportState,
  AiMemberUpdateState,
  AiRecurringBookingState
} from './aiViewTypes'
import { formatIsoDate, warningClassName } from './aiText'

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

export function AiMemberImportReviewCard({
  state,
  busy,
  onApply
}: {
  state: AiMemberImportState
  busy: boolean
  onApply: () => void
}) {
  return (
    <section id="ai-review-members" className="card ai-member-review-card">
      <div className="ai-section-head">
        <strong>Mitgliederanlage</strong>
        <span>
          {state.status === 'CREATED' ? 'angelegt' : `${state.members.length} vorbereitet`}
        </span>
      </div>
      <div className="ai-member-review-list">
        {state.members.map((member, index) => (
          <article
            key={`${member.name}-${index}`}
            className={`ai-member-review-row ${member.createdId ? 'is-created' : ''}`}
          >
            <div>
              <strong>
                {member.createdMemberNo ? `${member.createdMemberNo} · ` : ''}
                {member.name}
              </strong>
              <span>
                {member.boardRole === 'V1' ? 'Vorsitzender' : member.boardRole || 'Mitglied'}
              </span>
            </div>
            <dl>
              <div>
                <dt>Geburt</dt>
                <dd>{formatIsoDate(member.birthDate)}</dd>
              </div>
              <div>
                <dt>Eintritt</dt>
                <dd>{formatIsoDate(member.joinDate)}</dd>
              </div>
              <div>
                <dt>Beitrag</dt>
                <dd>
                  {member.contributionAmount ? euro.format(member.contributionAmount) : 'fehlt'}{' '}
                  {member.contributionInterval === 'YEARLY'
                    ? 'jährlich'
                    : member.contributionInterval || ''}
                </dd>
              </div>
              <div>
                <dt>Erste Frist</dt>
                <dd>{formatIsoDate(member.nextDueDate)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
      <div className="ai-review-actions">
        <span className="helper">
          {state.status === 'CREATED'
            ? 'Diese Mitglieder wurden bereits angelegt.'
            : 'Bitte vor dem Anlegen prüfen.'}
        </span>
        <button
          className="btn primary"
          type="button"
          disabled={busy || state.status === 'CREATED'}
          onClick={onApply}
        >
          {state.status === 'CREATED' ? 'Angelegt' : 'Mitglieder anlegen'}
        </button>
      </div>
    </section>
  )
}

export function AiMemberUpdateReviewCard({
  state,
  busy,
  onToggle,
  onApply
}: {
  state: AiMemberUpdateState
  busy: boolean
  onToggle: (id: string) => void
  onApply: () => void
}) {
  const selected = state.changes.filter((change) => change.selected && !change.applied).length
  return (
    <section
      id="ai-review-member-updates"
      className="card ai-member-review-card ai-member-update-card"
    >
      <div className="ai-section-head">
        <strong>Mitgliederänderungen</strong>
        <span>{state.status === 'APPLIED' ? 'übernommen' : `${selected} ausgewählt`}</span>
      </div>
      <div className="ai-member-update-list">
        {state.changes.map((change) => (
          <article
            key={change.id}
            className={`ai-member-update-row ${change.applied ? 'is-created' : ''}`}
          >
            <label>
              <input
                type="checkbox"
                checked={change.selected || !!change.applied}
                disabled={busy || change.applied || state.status === 'APPLIED'}
                onChange={() => onToggle(change.id)}
              />
              <span>
                <strong>{change.memberName}</strong>
                <em>{change.label}</em>
              </span>
            </label>
            <div className="ai-member-update-values">
              <span>{change.oldDisplay}</span>
              <b aria-hidden="true">→</b>
              <strong>{change.newDisplay}</strong>
            </div>
            {change.applied && <small>übernommen</small>}
          </article>
        ))}
      </div>
      <div className="ai-review-actions">
        <span className="helper">
          {state.status === 'APPLIED'
            ? 'Diese Änderungen wurden bereits übernommen.'
            : 'Bitte vor dem Übernehmen prüfen.'}
        </span>
        <button
          className="btn primary"
          type="button"
          disabled={busy || state.status === 'APPLIED' || !selected}
          onClick={onApply}
        >
          {state.status === 'APPLIED' ? 'Übernommen' : 'Änderungen übernehmen'}
        </button>
      </div>
    </section>
  )
}

export function AiContributionPaymentReviewCard({
  state,
  busy,
  onApply
}: {
  state: AiContributionPaymentState
  busy: boolean
  onApply: () => void
}) {
  return (
    <section id="ai-review-contribution-payment" className="card ai-contribution-payment-card">
      <div className="ai-section-head">
        <strong>Beitragsbuchung</strong>
        <span>{state.status === 'CREATED' ? 'gebucht' : 'Review erforderlich'}</span>
      </div>
      <div
        className={`ai-contribution-payment-row ${state.status === 'CREATED' ? 'is-created' : ''}`}
      >
        <div>
          <strong>{state.description}</strong>
          <span>
            {state.status === 'CREATED' && state.voucherNo
              ? `Buchung ${state.voucherNo}`
              : 'Wird nach Freigabe erstellt und verknüpft'}
          </span>
        </div>
        <dl>
          <div>
            <dt>Mitglied</dt>
            <dd>{state.memberName}</dd>
          </div>
          <div>
            <dt>Zeitraum</dt>
            <dd>{state.periodKey}</dd>
          </div>
          <div>
            <dt>Betrag</dt>
            <dd>{euro.format(state.amount)}</dd>
          </div>
          <div>
            <dt>Offen</dt>
            <dd>{euro.format(state.dueAmount)}</dd>
          </div>
          <div>
            <dt>Datum</dt>
            <dd>{formatIsoDate(state.date)}</dd>
          </div>
          <div>
            <dt>Konto</dt>
            <dd>{state.paymentAccountName || 'kein Konto'}</dd>
          </div>
        </dl>
        {state.warnings.length ? (
          <div className="ai-evidence">
            {state.warnings.map((warning, index) => (
              <span key={index} className={warningClassName(warning)}>
                {warning}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="ai-review-actions">
        <span className="helper">
          {state.status === 'CREATED'
            ? 'Diese Beitragsbuchung wurde bereits erstellt und verknüpft.'
            : 'Erstellt eine Einnahmebuchung und markiert den Beitragszeitraum als bezahlt.'}
        </span>
        <button
          className="btn primary"
          type="button"
          disabled={busy || state.status === 'CREATED'}
          onClick={onApply}
        >
          {state.status === 'CREATED' ? 'Gebucht' : 'Buchung erstellen & verknüpfen'}
        </button>
      </div>
    </section>
  )
}

export function AiRecurringBookingReviewCard({
  state,
  busy,
  onApply
}: {
  state: AiRecurringBookingState
  busy: boolean
  onApply: () => void
}) {
  const open = state.occurrences.filter((occurrence) => !occurrence.booked).length
  return (
    <section id="ai-review-recurring-booking" className="card ai-contribution-payment-card">
      <div className="ai-section-head">
        <strong>{state.recurringBookingName}</strong>
        <span>{state.status === 'APPLIED' ? 'gebucht' : `${open} offen`}</span>
      </div>
      <div className="ai-member-update-list">
        {state.occurrences.map((occurrence) => (
          <article key={occurrence.occurrenceId} className="ai-member-update-row">
            <div>
              <strong>{formatIsoDate(occurrence.scheduledDate)}</strong>
              <span>
                {euro.format(occurrence.grossAmount || occurrence.amount)}
                {occurrence.booked && occurrence.voucherNo
                  ? ` · Buchung ${occurrence.voucherNo}`
                  : ''}
              </span>
            </div>
            {occurrence.error && (
              <small className="ai-warning ai-warning--duplicate">{occurrence.error}</small>
            )}
          </article>
        ))}
      </div>
      <div className="ai-review-actions">
        <span className="helper">
          {state.status === 'APPLIED'
            ? 'Alle ausgewählten Fälligkeiten wurden als eigene Belege erstellt.'
            : `${open} eigene Belege · Gesamt ${euro.format(state.totalAmount)}${state.bookingDate ? ` · Belegdatum ${formatIsoDate(state.bookingDate)}` : ''}`}
        </span>
        <button
          className="btn primary"
          type="button"
          disabled={busy || state.status === 'APPLIED' || !open}
          onClick={onApply}
        >
          {state.status === 'APPLIED' ? 'Gebucht' : 'Alle Fälligkeiten buchen'}
        </button>
      </div>
    </section>
  )
}

export function AiContributionLinkReviewCard({
  state,
  busy,
  onToggle,
  onApply
}: {
  state: AiContributionLinkState
  busy: boolean
  onToggle: (id: string) => void
  onApply: () => void
}) {
  const selected = state.changes.filter((change) => change.selected && !change.applied).length
  return (
    <section id="ai-review-contribution-links" className="card ai-contribution-payment-card">
      <div className="ai-section-head">
        <strong>Beitrags-Verknüpfungen</strong>
        <span>{state.status === 'APPLIED' ? 'übernommen' : `${selected} ausgewählt`}</span>
      </div>
      <div className="ai-member-update-list">
        {state.changes.map((change) => (
          <article
            key={change.id}
            className={`ai-member-update-row ${change.applied ? 'is-created' : ''}`}
          >
            <label>
              <input
                type="checkbox"
                checked={change.selected || !!change.applied}
                disabled={busy || change.applied || state.status === 'APPLIED'}
                onChange={() => onToggle(change.id)}
              />
              <span>
                <strong>{change.memberName}</strong>
                <em>{change.periodKey}</em>
              </span>
            </label>
            <div className="ai-member-update-values">
              <span>{change.voucherNo || `#${change.voucherId}`}</span>
              <b aria-hidden="true">→</b>
              <strong>{euro.format(change.amount)}</strong>
            </div>
            {change.voucherDate && <small>{formatIsoDate(change.voucherDate)}</small>}
            {change.applied && <small>verknüpft</small>}
            {change.warnings.length ? (
              <div className="ai-evidence">
                {change.warnings.map((warning, index) => (
                  <span key={index} className={warningClassName(warning)}>
                    {warning}
                  </span>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
      <div className="ai-review-actions">
        <span className="helper">
          {state.status === 'APPLIED'
            ? 'Diese Beitragszeiträume wurden bereits verknüpft.'
            : 'Markiert die ausgewählten Beitragszeiträume mit vorhandenen Buchungen als bezahlt.'}
        </span>
        <button
          className="btn primary"
          type="button"
          disabled={busy || state.status === 'APPLIED' || !selected}
          onClick={onApply}
        >
          {state.status === 'APPLIED' ? 'Verknüpft' : 'Verknüpfungen übernehmen'}
        </button>
      </div>
    </section>
  )
}
