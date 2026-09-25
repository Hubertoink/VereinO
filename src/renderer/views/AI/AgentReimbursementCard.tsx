import type { ReimbursementReviewState } from '../../../../shared/reimbursementActions'

const labels = { CREATE: 'Vorgang anlegen', UPDATE: 'Angaben bearbeiten', LINK: 'Buchung zuordnen', UNLINK: 'Zuordnung lösen', DELETE: 'Vorgang entfernen' }
const money = (cents: number) => (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
export function AgentReimbursementCard({ state, busy, onApply, onToggle, onDismiss }: {
  state: ReimbursementReviewState; busy: boolean; onApply: () => void; onToggle: (id: string) => void; onDismiss: () => void
}) {
  return <section id="ai-review-reimbursements" className="card ai-agent-review-card">
    <div className="ai-section-head"><strong>Kostenerstattungen</strong><span>{state.status === 'APPLIED' ? 'Übernommen' : 'Zur Freigabe'}</span></div>
    {state.changes.map(change => {
      const c = change.command
      const before = change.before
      const removed = c.action === 'UNLINK' ? before?.links.find(link => link.linkId === c.linkId) : null
      return <article key={change.id} className="ai-invoice-review-row">
        <label><input type="checkbox" disabled={busy || change.applied} checked={change.selected} onChange={() => onToggle(change.id)} /> {change.applied ? 'Übernommen' : labels[c.action]}</label>
        <div className="ai-invoice-review-main">
          <strong>{'title' in c ? c.title : before?.title} {before ? `(#${before.id})` : ''}</strong>
          {'partner' in c && <p>Partner: {c.partner} · Fällig: {c.dueDate || 'ohne Datum'}<br />Notiz: {c.note || '–'}</p>}
          {c.action === 'UPDATE' && before && <p className="helper">Bisher: {before.title} · {before.partner} · Fällig: {before.dueDate || 'ohne Datum'} · Notiz: {before.note || '–'}</p>}
          {change.voucher && <p>{c.action === 'LINK' && c.role === 'PAYMENT' ? 'Erstattungszahlung' : 'Ausgabe'}: {change.voucher.voucherNo} · {change.voucher.date} · {change.voucher.paymentAccountName}<br />{change.voucher.description}<br />Zuordnung: {'amountCents' in c ? money(c.amountCents) : ''} (Buchung: {money(Math.round(change.voucher.grossAmount * 100))})</p>}
          {removed && <p>Zuordnung lösen: {removed.voucherNo} · {removed.date} · {money(removed.amountCents)}</p>}
          {before && <p className="helper">Aktuell: {money(before.expectedCents)} erwartet · {money(before.paidCents)} erstattet · {money(before.remainingCents)} offen</p>}
          {c.action === 'DELETE' && <p>Der Vorgang und seine Zuordnungen werden entfernt. Die Finanzbuchungen bleiben erhalten.</p>}
        </div>
      </article>
    })}
    <p className="helper">Diese Änderungen erzeugen keine zusätzlichen Finanzbuchungen.</p>
    <div className="ai-review-actions"><button className="btn ghost" disabled={busy} onClick={onDismiss}>Schließen</button><button className="btn primary" disabled={busy || !state.changes.some(c => c.selected && !c.applied)} onClick={onApply}>Änderungen übernehmen</button></div>
  </section>
}
