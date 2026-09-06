import type { AiBankLinkState } from './aiViewTypes'
import { formatIsoDate } from './aiText'

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

export function AiBankLinkReviewCard({
  state,
  busy,
  onToggle,
  onApply
}: {
  state: AiBankLinkState
  busy: boolean
  onToggle: (id: string) => void
  onApply: () => void
}) {
  const openCount = state.changes.filter((change) => change.selected && !change.applied).length
  return (
    <section id="ai-review-bank-links" className="card ai-review-card">
      <div className="ai-section-head">
        <strong>Bankbelege verknüpfen</strong>
        <span>{state.status === 'APPLIED' ? 'Erledigt' : `${openCount} offen`}</span>
      </div>
      {state.reason && <p>{state.reason}</p>}
      {state.warnings?.length ? <div className="ai-warning">{state.warnings.join(' ')}</div> : null}
      <div className="ai-voucher-action-list">
        {state.changes.map((change) => (
          <article
            key={change.id}
            className={`ai-voucher-action-row ${change.applied ? 'is-created' : ''}`}
          >
            <label>
              <input
                type="checkbox"
                checked={change.selected || change.applied}
                disabled={busy || change.applied || state.status === 'APPLIED'}
                onChange={() => onToggle(change.id)}
              />
              <span>
                <strong>Bankbeleg #{change.bankTransactionId}</strong>
                <em>
                  {formatIsoDate(change.bankBookingDate)} ·{' '}
                  {[change.bankCounterparty, change.bankPurpose].filter(Boolean).join(' - ') ||
                    'ohne Beschreibung'}{' '}
                  · {euro.format(Number(change.bankAmount || 0))}
                </em>
              </span>
            </label>
            <div className="ai-voucher-tag-diff">
              <span>
                {change.targetKind === 'RECURRING'
                  ? `Dauerbuchung: ${change.recurringBookingName || `#${change.recurringBookingId}`}`
                  : change.voucherNo || `#${change.voucherId}`}{' '}
                · {change.voucherDescription || 'ohne Beschreibung'}
              </span>
              <b aria-hidden="true">→</b>
              <strong>verknüpfen</strong>
            </div>
            {change.error && <small className="ai-warning">{change.error}</small>}
          </article>
        ))}
      </div>
      <div className="ai-review-actions">
        <span className="helper">
          {state.status === 'APPLIED'
            ? 'Diese Bankbelege wurden bereits verknüpft.'
            : 'Bankbelege werden mit bestehenden Buchungen oder passenden Dauerbuchungs-Fälligkeiten zusammengeführt; es wird nichts storniert.'}
        </span>
        <button
          className="btn primary"
          type="button"
          disabled={
            busy ||
            state.status === 'APPLIED' ||
            !state.changes.some((change) => change.selected && !change.applied)
          }
          onClick={onApply}
        >
          {state.status === 'APPLIED' ? 'Verknüpft' : 'Bankbelege verknüpfen'}
        </button>
      </div>
    </section>
  )
}
