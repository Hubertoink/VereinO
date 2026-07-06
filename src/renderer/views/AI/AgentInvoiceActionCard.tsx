import type { TInvoiceCreateInput } from '../../../../electron/main/ipc/schemas'

export type AiInvoiceActionChange = {
  id: string
  action: 'CREATE'
  invoice: TInvoiceCreateInput
  selected: boolean
  applied?: boolean
  createdId?: number | null
}

export type AiInvoiceActionState = {
  changes: AiInvoiceActionChange[]
  reason?: string | null
  sourcePrompt: string
  status: 'DRAFT' | 'APPLIED'
}

type Props = {
  anchorId: string
  state: AiInvoiceActionState
  busy: boolean
  onToggle: (id: string) => void
  onApply: () => void
}

function invoiceTypeLabel(type: TInvoiceCreateInput['voucherType']) {
  return type === 'IN' ? 'Forderung' : 'Verbindlichkeit'
}

function invoiceTypeClass(type: TInvoiceCreateInput['voucherType']) {
  return type === 'IN' ? 'ai-invoice-kind--in' : 'ai-invoice-kind--out'
}

function moneyLabel(value: number) {
  return `${Number(value || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`
}

function metaItems(invoice: TInvoiceCreateInput) {
  return [
    { label: 'Datum', value: invoice.date },
    { label: 'Fällig', value: invoice.dueDate || 'offen' },
    { label: 'Sphäre', value: invoice.sphere },
    invoice.invoiceNo ? { label: 'Nr.', value: invoice.invoiceNo } : null,
    invoice.budgetId != null ? { label: 'Budget', value: `#${invoice.budgetId}` } : null,
    invoice.earmarkId != null ? { label: 'Zweck', value: `#${invoice.earmarkId}` } : null
  ].filter(Boolean) as Array<{ label: string; value: string }>
}

export function AgentInvoiceActionCard({ anchorId, state, busy, onToggle, onApply }: Props) {
  const openChanges = state.changes.filter((change) => !change.applied)
  const selectedOpen = openChanges.filter((change) => change.selected)

  return (
    <section id={anchorId} className="card ai-agent-review-card">
      <div className="ai-section-head">
        <strong>Forderungen & Verbindlichkeiten</strong>
        <span>{state.status === 'APPLIED' ? 'übernommen' : `${selectedOpen.length}/${openChanges.length} ausgewählt`}</span>
      </div>
      {state.reason && <div className="ai-invoice-review-note">{state.reason}</div>}
      <div className="ai-invoice-review-list">
        {state.changes.length ? state.changes.map((change) => {
          const invoice = change.invoice
          return (
            <article key={change.id} className={`ai-invoice-review-row ${change.applied ? 'is-applied' : ''}`}>
              <label className="ai-invoice-review-select">
                <input
                  type="checkbox"
                  checked={change.selected && !change.applied}
                  disabled={change.applied || state.status === 'APPLIED'}
                  onChange={() => onToggle(change.id)}
                />
                <span>{change.applied ? 'Übernommen' : 'Auswählen'}</span>
              </label>
              <div className="ai-invoice-review-main">
                <div className="ai-invoice-review-titleline">
                  <span className={`ai-invoice-kind ${invoiceTypeClass(invoice.voucherType)}`}>{invoiceTypeLabel(invoice.voucherType)}</span>
                  <strong>{invoice.party}</strong>
                </div>
                <p>{invoice.description || 'Keine Beschreibung hinterlegt.'}</p>
                <div className="ai-invoice-review-meta">
                  {metaItems(invoice).map((item) => (
                    <span key={`${change.id}-${item.label}`}><b>{item.label}</b>{item.value}</span>
                  ))}
                </div>
              </div>
              <aside className="ai-invoice-review-amount">
                <strong>{moneyLabel(invoice.grossAmount)}</strong>
                <span>{invoice.tags?.length ? invoice.tags.join(', ') : 'ohne Tags'}</span>
                {change.createdId && <em>Erstellt als #{change.createdId}</em>}
              </aside>
            </article>
          )
        }) : (
          <div className="ai-empty">Keine Forderung oder Verbindlichkeit vorbereitet.</div>
        )}
      </div>
      <div className="ai-review-actions">
        <span className="helper">{state.status === 'APPLIED' ? 'Diese offenen Posten wurden bereits angelegt.' : 'Bitte vor dem Anlegen prüfen.'}</span>
        <button
          className="btn primary"
          type="button"
          disabled={busy || state.status === 'APPLIED' || !state.changes.some((change) => change.selected && !change.applied)}
          onClick={onApply}
        >
          {state.status === 'APPLIED' ? 'Angelegt' : 'Anlegen'}
        </button>
      </div>
    </section>
  )
}