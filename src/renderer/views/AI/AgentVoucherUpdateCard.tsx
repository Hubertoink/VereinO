const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

export type AiVoucherBudgetAssignment = {
  budgetId?: number | null
  label?: string | null
  amount?: number | null
}

export type AiVoucherUpdateChange = {
  id: string
  voucherId: number
  voucherNo: string
  date: string
  type?: string | null
  description?: string | null
  grossAmount?: number | null
  oldBudgetId?: number | null
  oldBudgetLabel?: string | null
  newBudgetId?: number | null
  newBudgetLabel?: string | null
  newBudgetAmount?: number | null
  newBudgets?: AiVoucherBudgetAssignment[]
  oldEarmarkId?: number | null
  oldEarmarkLabel?: string | null
  newEarmarkId?: number | null
  newEarmarkLabel?: string | null
  newEarmarkAmount?: number | null
  oldTags?: string[]
  newTags?: string[]
  noteAppend?: string | null
  selected: boolean
  applied?: boolean
}

export type AiVoucherUpdateState = {
  changes: AiVoucherUpdateChange[]
  reason?: string | null
  sourcePrompt: string
  status: 'DRAFT' | 'APPLIED'
}

type Props = {
  state: AiVoucherUpdateState
  busy: boolean
  onToggle: (id: string) => void
  onApply: () => void
  anchorId?: string
}

function formatIsoDate(value?: string | null) {
  if (!value) return '-'
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value
}

function amountSuffix(value?: number | null) {
  const amount = Math.abs(Number(value || 0))
  return amount > 0 ? ` (${euro.format(amount)})` : ''
}

function targetSummary(change: AiVoucherUpdateChange) {
  const budgetSummary = change.newBudgets?.length
    ? `Budget: ${change.newBudgets.map((budget) => `${budget.label || (budget.budgetId ? `Budget #${budget.budgetId}` : 'Budget')}${amountSuffix(budget.amount)}`).join(', ')}`
    : change.newBudgetLabel
      ? `Budget: ${change.newBudgetLabel}${amountSuffix(change.newBudgetAmount)}`
      : null
  return [
    budgetSummary,
    change.newEarmarkLabel ? `Zweck: ${change.newEarmarkLabel}${amountSuffix(change.newEarmarkAmount)}` : null,
    change.newTags?.length ? `Tags: ${change.newTags.join(', ')}` : null
  ].filter(Boolean).join(' · ') || 'Metadaten aktualisieren'
}

export function AgentVoucherUpdateCard({ state, busy, onToggle, onApply, anchorId }: Props) {
  const selectedCount = state.changes.filter((change) => change.selected && !change.applied).length
  const canApply = state.status !== 'APPLIED' && selectedCount > 0

  return (
    <section id={anchorId} className="card ai-voucher-action-card">
      <div className="ai-section-head">
        <strong>Agent-Buchungsreview</strong>
        <span>{state.status === 'APPLIED' ? 'übernommen' : `${selectedCount} ausgewählt`}</span>
      </div>
      {state.reason && <div className="ai-voucher-action-summary">{state.reason}</div>}
      <div className="ai-voucher-action-list">
        {state.changes.map((change) => (
          <article key={change.id} className={`ai-voucher-action-row ${change.applied ? 'is-created' : ''}`}>
            <label>
              <input
                type="checkbox"
                checked={change.selected || change.applied}
                disabled={busy || change.applied || state.status === 'APPLIED'}
                onChange={() => onToggle(change.id)}
              />
              <span>
                <strong>{change.voucherNo}</strong>
                <em>{formatIsoDate(change.date)} · {change.description || 'ohne Beschreibung'} · {euro.format(Math.abs(Number(change.grossAmount || 0)))}</em>
              </span>
            </label>
            <div className="ai-voucher-tag-diff">
              <span>
                {[change.oldBudgetLabel ? `Budget: ${change.oldBudgetLabel}` : 'kein Budget', change.oldEarmarkLabel ? `Zweck: ${change.oldEarmarkLabel}` : null].filter(Boolean).join(' · ')}
              </span>
              <b aria-hidden="true">→</b>
              <strong>{targetSummary(change)}</strong>
            </div>
          </article>
        ))}
      </div>
      <div className="ai-review-actions">
        <span className="helper">{state.status === 'APPLIED' ? 'Diese Agent-Änderungen wurden bereits übernommen.' : 'Bitte vor dem Übernehmen prüfen.'}</span>
        <button
          className="btn primary"
          type="button"
          disabled={busy || !canApply}
          onClick={onApply}
        >
          {state.status === 'APPLIED' ? 'Übernommen' : 'Änderungen übernehmen'}
        </button>
      </div>
    </section>
  )
}
