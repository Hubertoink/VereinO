import type { AiTagActionState, AiVoucherTagActionState } from './aiViewTypes'
import { formatIsoDate } from './aiText'

export function AiTagActionReviewCard({
  state,
  busy,
  onToggle,
  onApply
}: {
  state: AiTagActionState
  busy: boolean
  onToggle: (id: string) => void
  onApply: () => void
}) {
  const selected = state.changes.filter((change) => change.selected && !change.applied).length
  return (
    <section id="ai-review-tag-actions" className="card ai-tag-action-card">
      <div className="ai-section-head">
        <strong>Tag-Änderungen</strong>
        <span>{state.status === 'APPLIED' ? 'übernommen' : `${selected} ausgewählt`}</span>
      </div>
      <div className="ai-tag-action-list">
        {state.changes.map((change) => (
          <article
            key={change.id}
            className={`ai-tag-action-row ${change.applied ? 'is-created' : ''}`}
          >
            <label>
              <input
                type="checkbox"
                checked={change.selected || !!change.applied}
                disabled={busy || change.applied || state.status === 'APPLIED'}
                onChange={() => onToggle(change.id)}
              />
              <span
                className={`ai-tag-action-kind ai-tag-action-kind--${change.action.toLowerCase()}`}
              >
                {change.action === 'CREATE'
                  ? 'Neu'
                  : change.action === 'UPDATE'
                    ? 'Ändern'
                    : 'Löschen'}
              </span>
              <strong>{change.name}</strong>
            </label>
            <div className="ai-tag-action-values">
              <span>{change.oldDisplay}</span>
              <b aria-hidden="true">→</b>
              <strong>{change.newDisplay}</strong>
            </div>
            {change.color && <i style={{ background: change.color }} aria-hidden="true" />}
          </article>
        ))}
      </div>
      <div className="ai-review-actions">
        <span className="helper">
          {state.status === 'APPLIED'
            ? 'Diese Tag-Änderungen wurden bereits übernommen.'
            : 'Bitte vor dem Übernehmen prüfen.'}
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
          {state.status === 'APPLIED' ? 'Übernommen' : 'Tag-Änderungen übernehmen'}
        </button>
      </div>
    </section>
  )
}

export function AiVoucherTagReviewCard({
  state,
  busy,
  onToggle,
  onApply
}: {
  state: AiVoucherTagActionState
  busy: boolean
  onToggle: (id: string) => void
  onApply: () => void
}) {
  const selected = state.changes.filter((change) => change.selected && !change.applied).length
  return (
    <section id="ai-review-voucher-tags" className="card ai-voucher-action-card">
      <div className="ai-section-head">
        <strong>Buchungsänderungen</strong>
        <span>{state.status === 'APPLIED' ? 'übernommen' : `${selected} ausgewählt`}</span>
      </div>
      <div className="ai-voucher-action-summary">
        <span>Filter: Tag „{state.sourceTag}“</span>
        <strong>Ergänzen: {state.addedTags.join(', ')}</strong>
      </div>
      <div className="ai-voucher-action-list">
        {state.changes.length ? (
          state.changes.map((change) => (
            <article
              key={change.id}
              className={`ai-voucher-action-row ${change.applied ? 'is-created' : ''}`}
            >
              <label>
                <input
                  type="checkbox"
                  checked={change.selected || !!change.applied}
                  disabled={busy || change.applied || state.status === 'APPLIED'}
                  onChange={() => onToggle(change.id)}
                />
                <span>
                  <strong>{change.voucherNo}</strong>
                  <em>
                    {formatIsoDate(change.date)} · {change.description || 'ohne Beschreibung'}
                  </em>
                </span>
              </label>
              <div className="ai-voucher-tag-diff">
                <span>{change.oldTags.length ? change.oldTags.join(', ') : 'keine Tags'}</span>
                <b aria-hidden="true">→</b>
                <strong>{change.newTags.join(', ')}</strong>
              </div>
            </article>
          ))
        ) : (
          <div className="ai-empty">Keine Buchung benötigt eine Änderung.</div>
        )}
      </div>
      <div className="ai-review-actions">
        <span className="helper">
          {state.status === 'APPLIED'
            ? 'Diese Buchungsänderungen wurden bereits übernommen.'
            : 'Bitte vor dem Übernehmen prüfen.'}
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
          {state.status === 'APPLIED' ? 'Übernommen' : 'Buchungen aktualisieren'}
        </button>
      </div>
    </section>
  )
}
