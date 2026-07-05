export type AgentMasterDataChange = {
  id: string
  action: 'CREATE' | 'UPDATE' | 'DELETE'
  name: string
  oldDisplay: string
  newDisplay: string
  selected: boolean
  applied?: boolean
}

type AgentMasterDataChangeState = {
  changes: AgentMasterDataChange[]
  reason?: string | null
  status: 'DRAFT' | 'APPLIED'
}

type Props = {
  anchorId: string
  title: string
  entityLabel: string
  state: AgentMasterDataChangeState
  busy: boolean
  onToggle: (id: string) => void
  onApply: () => void
}

function actionLabel(action: AgentMasterDataChange['action']) {
  if (action === 'CREATE') return 'Neu'
  if (action === 'UPDATE') return 'Ändern'
  return 'Löschen'
}

export function AgentMasterDataChangeCard({ anchorId, title, entityLabel, state, busy, onToggle, onApply }: Props) {
  const selectedCount = state.changes.filter((change) => change.selected && !change.applied).length
  const canApply = state.status !== 'APPLIED' && selectedCount > 0

  return (
    <section id={anchorId} className="card ai-masterdata-card">
      <div className="ai-section-head">
        <strong>{title}</strong>
        <span>{state.status === 'APPLIED' ? 'übernommen' : `${selectedCount} ausgewählt`}</span>
      </div>
      {state.reason && <div className="ai-masterdata-summary">{state.reason}</div>}
      <div className="ai-masterdata-list">
        {state.changes.map((change) => (
          <article key={change.id} className={`ai-masterdata-row ${change.applied ? 'is-created' : ''}`}>
            <label>
              <input
                type="checkbox"
                checked={change.selected || change.applied}
                disabled={busy || change.applied || state.status === 'APPLIED'}
                onChange={() => onToggle(change.id)}
              />
              <span className={`ai-masterdata-kind ai-masterdata-kind--${change.action.toLowerCase()}`}>
                {actionLabel(change.action)}
              </span>
              <strong>{change.name}</strong>
            </label>
            <div className="ai-masterdata-values">
              <span>{change.oldDisplay}</span>
              <b aria-hidden="true">→</b>
              <strong>{change.newDisplay}</strong>
            </div>
            {change.applied && <small>übernommen</small>}
          </article>
        ))}
      </div>
      <div className="ai-review-actions">
        <span className="helper">{state.status === 'APPLIED' ? `Diese ${entityLabel} wurden bereits übernommen.` : 'Bitte vor dem Übernehmen prüfen.'}</span>
        <button className="btn primary" type="button" disabled={busy || !canApply} onClick={onApply}>
          {state.status === 'APPLIED' ? 'Übernommen' : `${entityLabel} übernehmen`}
        </button>
      </div>
    </section>
  )
}
