import type { TVoucherCreateInput } from '../../../../electron/main/ipc/schemas'

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

export type AiVoucherRebookState = {
  original: {
    id: number
    voucherNo?: string | null
    date: string
    type: 'IN' | 'OUT' | 'TRANSFER' | 'INTERNAL'
    sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
    description?: string | null
    grossAmount: number
    vatRate?: number | null
    paymentMethod?: 'BAR' | 'BANK' | null
    paymentAccountId?: number | null
    paymentAccountName?: string | null
    tags?: string[]
  }
  replacement: TVoucherCreateInput & {
    paymentAccountName?: string | null
    budgets?: Array<{ budgetId: number; amount: number }>
    earmarks?: Array<{ earmarkId: number; amount: number }>
  }
  reason?: string | null
  sourcePrompt: string
  status: 'DRAFT' | 'APPLIED'
  reversalVoucherNo?: string | null
  newVoucherNo?: string | null
}

function typeLabel(value?: string | null) {
  if (value === 'IN') return 'Einnahme'
  if (value === 'OUT') return 'Ausgabe'
  if (value === 'TRANSFER') return 'Umbuchung'
  if (value === 'INTERNAL') return 'Intern'
  return '-'
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value
}

export function AgentVoucherRebookCard({
  anchorId,
  state,
  busy,
  onApply
}: {
  anchorId: string
  state: AiVoucherRebookState
  busy: boolean
  onApply: () => void
}) {
  const applied = state.status === 'APPLIED'
  return (
    <section id={anchorId} className="card ai-voucher-rebook-card">
      <div className="ai-section-head">
        <strong>Buchung stornieren & neu anlegen</strong>
        <span>{applied ? 'übernommen' : 'Review erforderlich'}</span>
      </div>
      {state.reason && <p className="ai-voucher-rebook-reason">{state.reason}</p>}
      <div className="ai-voucher-rebook-grid">
        <article className="ai-voucher-rebook-panel ai-voucher-rebook-panel--original">
          <span>Original wird storniert</span>
          <strong>{state.original.voucherNo || `#${state.original.id}`} · {typeLabel(state.original.type)}</strong>
          <dl>
            <div><dt>Datum</dt><dd>{formatDate(state.original.date)}</dd></div>
            <div><dt>Betrag</dt><dd>{euro.format(Number(state.original.grossAmount || 0))}</dd></div>
            <div><dt>Konto</dt><dd>{state.original.paymentAccountName || state.original.paymentMethod || '-'}</dd></div>
            <div><dt>Text</dt><dd>{state.original.description || '-'}</dd></div>
          </dl>
        </article>
        <article className="ai-voucher-rebook-panel ai-voucher-rebook-panel--replacement">
          <span>Ersatzbuchung</span>
          <strong>{typeLabel(state.replacement.type)} · {euro.format(Number(state.replacement.grossAmount || 0))}</strong>
          <dl>
            <div><dt>Datum</dt><dd>{formatDate(state.replacement.date)}</dd></div>
            <div><dt>Sphäre</dt><dd>{state.replacement.sphere}</dd></div>
            <div><dt>Konto</dt><dd>{state.replacement.paymentAccountName || state.replacement.paymentMethod || '-'}</dd></div>
            <div><dt>Text</dt><dd>{state.replacement.description || '-'}</dd></div>
          </dl>
          {state.replacement.tags?.length ? (
            <div className="ai-voucher-rebook-tags">
              {state.replacement.tags.map((tag) => <span key={tag}>{tag}</span>)}
            </div>
          ) : null}
        </article>
      </div>
      <div className="ai-review-actions">
        <span className="helper">
          {applied
            ? `Storno ${state.reversalVoucherNo || ''} und Ersatz ${state.newVoucherNo || ''} wurden erstellt.`
            : 'Führt zuerst das Storno aus und legt danach die korrigierte Ersatzbuchung an.'}
        </span>
        <button className="btn primary" type="button" disabled={busy || applied} onClick={onApply}>
          {applied ? 'Erledigt' : 'Stornieren & neu anlegen'}
        </button>
      </div>
    </section>
  )
}
