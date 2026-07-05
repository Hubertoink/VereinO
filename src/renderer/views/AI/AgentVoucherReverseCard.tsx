const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

export type AiVoucherReverseState = {
  vouchers: Array<{
    id: number
    voucherNo?: string | null
    date: string
    type: 'IN' | 'OUT' | 'TRANSFER' | 'INTERNAL'
    sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB' | null
    description?: string | null
    grossAmount: number
    paymentMethod?: string | null
    paymentAccountName?: string | null
    tags?: string[]
    reversedVoucherNo?: string | null
  }>
  reason?: string | null
  sourcePrompt: string
  status: 'DRAFT' | 'APPLIED'
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

export function AgentVoucherReverseCard({
  anchorId,
  state,
  busy,
  onApply
}: {
  anchorId: string
  state: AiVoucherReverseState
  busy: boolean
  onApply: () => void
}) {
  const applied = state.status === 'APPLIED'
  return (
    <section id={anchorId} className="card ai-voucher-reverse-card">
      <div className="ai-section-head">
        <strong>Buchungen stornieren</strong>
        <span>{applied ? 'übernommen' : `${state.vouchers.length} vorbereitet`}</span>
      </div>
      {state.reason && <p className="ai-voucher-rebook-reason">{state.reason}</p>}
      <div className="ai-voucher-reverse-list">
        {state.vouchers.map((voucher) => (
          <article key={voucher.id} className={`ai-voucher-reverse-row ${voucher.reversedVoucherNo ? 'is-applied' : ''}`}>
            <span className={`ai-voucher-reverse-type ai-voucher-reverse-type--${String(voucher.type).toLowerCase()}`}>{voucher.type}</span>
            <span>
              <strong>{voucher.voucherNo || `#${voucher.id}`}</strong>
              <small>{formatDate(voucher.date)} · {typeLabel(voucher.type)} · {voucher.description || '-'}</small>
            </span>
            <em>{euro.format(Number(voucher.grossAmount || 0))}</em>
            <b>{voucher.reversedVoucherNo ? `Storno ${voucher.reversedVoucherNo}` : 'wird storniert'}</b>
          </article>
        ))}
      </div>
      <div className="ai-review-actions">
        <span className="helper">
          {applied ? 'Diese Stornos wurden bereits erstellt.' : 'Erstellt Stornobuchungen. Es wird keine Ersatzbuchung angelegt.'}
        </span>
        <button className="btn primary" type="button" disabled={busy || applied} onClick={onApply}>
          {applied ? 'Erledigt' : 'Stornos erstellen'}
        </button>
      </div>
    </section>
  )
}
