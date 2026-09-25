import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReimbursementMetadata, ReimbursementVoucher } from '../../../../shared/reimbursements'

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

export default function ReimbursementCreateForm({ voucherId, description, busy, error, onClose, onSave }: {
  voucherId: number; description?: string | null; busy: boolean; error: string
  onClose: () => void
  onSave: (input: ReimbursementMetadata & { voucherId: number; amountCents: number }) => void
}) {
  const [source, setSource] = useState<ReimbursementVoucher | null>(null)
  const [loading, setLoading] = useState(true)
  const [sourceError, setSourceError] = useState('')
  const [title, setTitle] = useState(description || '')
  const [partner, setPartner] = useState('')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [note, setNote] = useState('')
  const [showDueDate, setShowDueDate] = useState(false)
  const [showNote, setShowNote] = useState(false)
  useEffect(() => {
    let active = true
    setLoading(true); setSource(null); setSourceError('')
    void window.api.reimbursements.candidates({ role: 'EXPENSE', voucherId }).then(rows => {
      if (!active) return
      const row = rows[0]
      if (!row) { setSourceError('Für diese Ausgabe ist kein Erstattungsbetrag mehr verfügbar.'); return }
      setSource(row); setAmount((row.availableCents / 100).toFixed(2))
    }).catch(error => { if (active) setSourceError(error instanceof Error ? error.message : String(error)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [voucherId])
  const numeric = Number(amount.replace(',', '.'))
  const cents = Math.round(numeric * 100)
  const validAmount = !!source && Number.isSafeInteger(cents) && Math.abs(numeric * 100 - cents) < 0.000001 && cents > 0 && cents <= source.availableCents
  const valid = validAmount && !!title.trim() && !!partner.trim()
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (busy || !valid) return
    onSave({ voucherId, amountCents: cents, title: title.trim(), partner: partner.trim(), dueDate: dueDate || null, note })
  }
  return createPortal(<div className="modal-overlay reimbursement-overlay" role="dialog" aria-modal="true" aria-labelledby="reimbursement-create-heading" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <form className="modal reimbursement-create" onSubmit={submit}>
      <header className="reimbursement-create-header"><h2 id="reimbursement-create-heading">Erstattung erwarten</h2><button type="button" className="btn ghost" disabled={busy} onClick={onClose} aria-label="Schließen">×</button></header>
      <div className="reimbursement-create-body">
        <section className="reimbursement-source" aria-label="Zugehörige Ausgabe">
          <span className="reimbursement-field-label">Zugehörige Ausgabe</span>
          {loading ? <p className="helper">Buchung wird geladen …</p> : source && <>
            <div className="reimbursement-source-heading"><strong>{source.description || 'Ohne Beschreibung'}</strong><strong>{euro.format(source.grossAmount)}</strong></div>
            <p>{source.date.split('-').reverse().join('.')} · {source.paymentAccountName || 'Ohne Zahlkonto'}<br />{source.voucherNo}</p>
          </>}
          {sourceError && <p role="alert">{sourceError}</p>}
        </section>
        {error && <p className="reimbursement-error" role="alert">{error}</p>}
        <label className="reimbursement-create-field"><span className="reimbursement-field-label">Erwarteter Betrag *</span><span className="reimbursement-amount-input"><input className="input" type="number" min="0.01" max={source ? source.availableCents / 100 : undefined} step="0.01" value={amount} onChange={event => setAmount(event.target.value)} required disabled={busy || !source} /><span>€</span></span></label>
        {source && <p className="helper reimbursement-amount-hint">Bis {euro.format(source.availableCents / 100)} verfügbar · auch eine Teilerstattung ist möglich.</p>}
        <label className="reimbursement-create-field"><span className="reimbursement-field-label">Erstattung durch *</span><input className="input" maxLength={200} value={partner} disabled={busy} onChange={event => setPartner(event.target.value)} placeholder="Kooperationspartner" required autoFocus /></label>
        <label className="reimbursement-create-field"><span className="reimbursement-field-label">Bezeichnung *</span><input className="input" maxLength={200} value={title} disabled={busy} onChange={event => setTitle(event.target.value)} placeholder="Zum Beispiel Lebensmittel Sommerfest" required /></label>
        <section className="reimbursement-extra">
          <span className="reimbursement-field-label">Weitere Angaben</span>
          <div className="reimbursement-extra-actions"><button type="button" className="btn" disabled={busy} aria-expanded={showDueDate} onClick={() => setShowDueDate(value => !value)}>{showDueDate ? '−' : '+'} Fälligkeit{dueDate ? ' · 1' : ''}</button><button type="button" className="btn" disabled={busy} aria-expanded={showNote} onClick={() => setShowNote(value => !value)}>{showNote ? '−' : '+'} Notiz{note ? ' · 1' : ''}</button></div>
          {showDueDate && <label className="reimbursement-create-field"><span className="reimbursement-field-label">Fällig am (optional)</span><input className="input" type="date" value={dueDate} disabled={busy} onChange={event => setDueDate(event.target.value)} /></label>}
          {showNote && <label className="reimbursement-create-field"><span className="reimbursement-field-label">Notiz / Abrechnungsreferenz</span><textarea className="input" maxLength={10000} value={note} disabled={busy} onChange={event => setNote(event.target.value)} placeholder="Vereinbarung oder Referenz der Abrechnung" /></label>}
        </section>
      </div>
      <footer className="reimbursement-create-footer"><span className="helper">Die Ausgabe ist bereits gebucht.</span><button className="btn primary" type="submit" disabled={busy || !valid}>{busy ? 'Speichert …' : 'Erstattung anlegen'}</button></footer>
    </form>
  </div>, document.body)
}
