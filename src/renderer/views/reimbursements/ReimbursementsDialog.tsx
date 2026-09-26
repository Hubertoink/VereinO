import ManagementKpis, { InvoicePaymentProgress, InvoiceDueHint } from '../../components/finance/ManagementKpis'
import { IconReceipt2, IconArrowsExchange, IconCalendar, IconUser, IconPencil } from '@tabler/icons-react'
import React, { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Reimbursement, ReimbursementDetail, ReimbursementRole, ReimbursementVoucher } from '../../../../shared/reimbursements'
import { addDataChangedListener, dispatchDataChanged } from '../../utils/refresh'
import './reimbursements.css'
import ReimbursementCreateForm from './ReimbursementCreateForm'

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const money = (cents: number) => euro.format(cents / 100)
const date = (value?: string | null) => value ? value.split('-').reverse().join('.') : '–'
const labels = { OPEN: 'Offen', PARTIAL: 'Teilweise erstattet', PAID: 'Erstattet' }
type Voucher = { id: number; type: string; grossAmount: number; description?: string | null }
type Notify = (type: 'success' | 'error' | 'info', text: string) => void
const message = (error: unknown) => error instanceof Error ? error.message : String(error)

function VoucherPicker({ role, initialVoucherId, maxCents, busy, submitDisabled = false, onSubmit }: {
  role: ReimbursementRole; initialVoucherId?: number; maxCents?: number; busy: boolean; submitDisabled?: boolean
  onSubmit: (voucher: ReimbursementVoucher, cents: number) => void
}) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<ReimbursementVoucher[]>([])
  const [selected, setSelected] = useState<ReimbursementVoucher | null>(null)
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const choose = (voucher: ReimbursementVoucher) => {
    setSelected(voucher)
    setAmount((Math.min(voucher.availableCents, maxCents ?? voucher.availableCents) / 100).toFixed(2))
  }
  useEffect(() => {
    let active = true
    if (initialVoucherId) void window.api.reimbursements.candidates({ role, voucherId: initialVoucherId })
      .then(result => { if (active && result[0]) choose(result[0]) })
      .catch(error => { if (active) setError(message(error)) })
    return () => { active = false }
  }, [initialVoucherId, role])
  useEffect(() => {
    let active = true
    setLoading(true)
    const timer = window.setTimeout(() => {
      void window.api.reimbursements.candidates({ role, q }).then(result => {
        if (active) { setRows(result); setError('') }
      }).catch(error => { if (active) setError(message(error)) }).finally(() => { if (active) setLoading(false) })
    }, 180)
    return () => { active = false; window.clearTimeout(timer) }
  }, [q, role])
  const numericAmount = Number(amount.replace(',', '.'))
  const cents = Math.round(numericAmount * 100)
  const valid = selected && Number.isSafeInteger(cents) && Math.abs(numericAmount * 100 - cents) < 0.000001 && cents > 0 && cents <= selected.availableCents && cents <= (maxCents ?? Infinity)
  return <section className="reimbursement-picker">
    <label>Buchung suchen<input className="input" value={q} disabled={busy} onChange={event => setQ(event.target.value)} placeholder="Buchungsnummer oder Beschreibung" /></label>
    <p className="helper">{role === 'EXPENSE' ? 'Bereits gebuchte Ausgaben auswählen. Der erwartete Erstattungsbetrag darf auch nur einen Teil der Ausgabe umfassen.' : 'Bereits gebuchte Einnahme auswählen. Bei einer Sammelzahlung nur den Anteil für diesen Vorgang zuordnen.'}</p>
    {error && <p role="alert" className="text-danger">{error}</p>}
    <div className="reimbursement-table-wrap reimbursement-candidates" aria-label="Verfügbare Buchungen">
      <table className="reimbursement-table"><thead><tr><th aria-label="Auswahl" /><th>Datum</th><th>Buchung</th><th>Zahlkonto</th><th className="money">Verfügbar</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={5}>Buchungen werden geladen …</td></tr> : rows.length ? rows.map(row => <tr key={row.id} className={selected?.id === row.id ? 'is-selected' : ''} onClick={() => { if (!busy) choose(row) }}>
          <td><input type="radio" name={`reimbursement-${role}`} aria-label={`Buchung ${row.voucherNo} auswählen`} checked={selected?.id === row.id} disabled={busy} onChange={() => choose(row)} /></td>
          <td className="nowrap">{date(row.date)}</td><td><strong>{row.description || 'Ohne Beschreibung'}</strong><small>{row.voucherNo}</small></td><td>{row.paymentAccountName || '–'}</td><td className="money">{money(row.availableCents)}</td>
        </tr>) : <tr><td colSpan={5} className="helper">Keine verfügbare {role === 'EXPENSE' ? 'Ausgabe' : 'Einnahme'} gefunden.</td></tr>}
      </tbody></table>
    </div>
    {rows.length === 100 && <p className="helper">Die 100 neuesten Treffer werden angezeigt. Bitte die Suche eingrenzen.</p>}
    {selected && <p>Ausgewählt: <strong>{selected.voucherNo}</strong> · {date(selected.date)} · {euro.format(selected.grossAmount)}</p>}
    <div className="reimbursement-picker-footer">
      <label>{role === 'EXPENSE' ? 'Erwartete Erstattung (€)' : 'Zuzuordnender Anteil (€)'}<input className="input" type="number" min="0.01" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} disabled={busy || !selected} /></label>
      <button className="btn primary" disabled={busy || submitDisabled || !valid} onClick={() => selected && onSubmit(selected, cents)}>{busy ? 'Speichert …' : role === 'EXPENSE' ? 'Ausgabe übernehmen' : 'Erstattung zuordnen'}</button>
    </div>
    {selected && !valid && amount && <p className="helper">Bitte einen positiven Betrag bis {money(Math.min(selected.availableCents, maxCents ?? Infinity))} eingeben.</p>}
  </section>
}

export default function ReimbursementsDialog({ onClose, notify, voucher, initialId, startCreate = false, onNavigate, embedded = false, toolbarTarget }: {
  onClose: () => void; notify: Notify; voucher?: Voucher; initialId?: number; startCreate?: boolean; onNavigate?: () => void; embedded?: boolean; toolbarTarget?: HTMLElement | null
}) {
  const [rows, setRows] = useState<Reimbursement[]>([])
  const [detail, setDetail] = useState<ReimbursementDetail | null>(null)
  const [creating, setCreating] = useState(startCreate)
  const [editing, setEditing] = useState(false)
  const [picker, setPicker] = useState<ReimbursementRole | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [title, setTitle] = useState(voucher?.description || '')
  const [partner, setPartner] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [note, setNote] = useState('')
  const [confirmAction, setConfirmAction] = useState<{ kind: 'delete' | 'unlink'; linkId?: number } | null>(null)
  const load = useCallback(async () => {
    try { setRows(await window.api.reimbursements.list()); setError('') }
    catch (error) { setError(message(error)) }
    finally { setLoading(false) }
  }, [])
  const open = async (id: number) => {
    try { setDetail(await window.api.reimbursements.get({ id })); setCreating(false); setEditing(false); setPicker(null); setError('') }
    catch (error) { setError(message(error)) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load(); if (initialId) void open(initialId) }, [load, initialId])
  useEffect(() => addDataChangedListener(['reimbursements', 'vouchers'], () => { void load() }), [load])
  const close = () => { if (embedded) { setDetail(null); setCreating(false); setPicker(null); setEditing(false); setConfirmAction(null) } else onClose() }
  useEffect(() => {
    if (embedded && !detail && !creating) return
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); if (!busy) close() } }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [busy, onClose, embedded, detail, creating])
  const mutate = async (run: () => Promise<ReimbursementDetail | null>, text: string) => {
    if (busy) return
    setBusy(true); setError('')
    try {
      const next = await run(); setDetail(next); setCreating(false); setEditing(false); setPicker(null); setConfirmAction(null)
      dispatchDataChanged(['reimbursements']); await load(); notify('success', text)
    } catch (error) { setError(message(error)) }
    finally { setBusy(false) }
  }
  const metadata = { title: title.trim(), partner: partner.trim(), dueDate: dueDate || null, note }
  const metadataValid = !!metadata.title && !!metadata.partner
  const form = <div className="reimbursement-form">
    <label>Bezeichnung<input className="input" maxLength={200} value={title} disabled={busy} onChange={event => setTitle(event.target.value)} placeholder="Lebensmittel Sommerfest" required /></label>
    <label>Erstattung durch<input className="input" maxLength={200} value={partner} disabled={busy} onChange={event => setPartner(event.target.value)} placeholder="Kooperationspartner" required /></label>
    <label>Fällig am (optional)<input className="input" type="date" value={dueDate} disabled={busy} onChange={event => setDueDate(event.target.value)} /></label>
    <label>Notiz / Abrechnungsreferenz<textarea className="input" maxLength={10000} value={note} disabled={busy} onChange={event => setNote(event.target.value)} placeholder="Vereinbarung, Versanddatum oder Referenz der Abrechnung" /></label>
  </div>
  const visible = rows.filter(row => (statusFilter === 'ALL' || row.status === statusFilter) && `${row.title} ${row.partner}`.toLocaleLowerCase().includes(q.toLocaleLowerCase()))
  const today = new Date().toLocaleDateString('en-CA')
  const overdue = visible.filter(row => row.remainingCents > 0 && row.dueDate && row.dueDate < today)
  const toolbar = <div className="reimbursement-overview-toolbar"><input className="input" placeholder="Partner oder Bezeichnung suchen" aria-label="Kostenerstattungen suchen" value={q} onChange={event => setQ(event.target.value)} /><select className="input" aria-label="Status filtern" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="ALL">Alle Status</option><option value="OPEN">Offen</option><option value="PARTIAL">Teilweise erstattet</option><option value="PAID">Erstattet</option></select><button className="btn primary" onClick={() => { setTitle(voucher?.type === 'OUT' ? voucher.description || '' : ''); setPartner(''); setDueDate(''); setNote(''); setCreating(true) }}>+ Erstattung erwarten</button></div>
  const overview = <div className="reimbursement-inline">
        {!(embedded && toolbarTarget) && toolbar}
        {voucher?.type === 'IN' && <p className="helper">Wähle den Vorgang und anschließend „Erstattung zuordnen“. Die aktuelle Einnahme wird vorausgewählt.</p>}
        <ManagementKpis label="Kostenerstattungsübersicht" loading={loading} items={[
          { label: 'Offene Erstattungen', value: error ? '—' : money(visible.reduce((sum, row) => sum + Math.max(0, row.remainingCents), 0)), hint: `${visible.length} Vorgänge · gefilterte Auswahl` },
          { label: 'Bereits erstattet', value: error ? '—' : money(visible.reduce((sum, row) => sum + row.paidCents, 0)), hint: 'Zugeordnete Erstattungszahlungen' },
          { label: 'Überfällig', value: error ? '—' : money(overdue.reduce((sum, row) => sum + row.remainingCents, 0)), hint: `${overdue.length} ${overdue.length === 1 ? 'überfälliger Vorgang' : 'überfällige Vorgänge'}`, tone: overdue.length ? 'warning' : undefined }
        ]} />
        {loading ? <p>Lädt …</p> : <div className="invoices-table-scroll-wrapper"><table cellPadding={6} className="invoices-table invoices-table--wide reimbursement-overview-table"><thead><tr><th>Bezeichnung</th><th>Partner</th><th>Fällig</th><th className="money">Erwartet</th><th className="money">Erstattet</th><th className="money">Rest</th><th>Status</th><th>Aktionen</th></tr></thead><tbody>
          {visible.map(row => <tr key={row.id} onClick={() => void open(row.id)}><td><button className="reimbursement-title-button" onClick={event => { event.stopPropagation(); void open(row.id) }}>{row.title}</button></td><td>{row.partner}</td><td className="nowrap">{date(row.dueDate)}<InvoiceDueHint date={row.dueDate} remaining={row.remainingCents / 100} /></td><td className="money">{money(row.expectedCents)}</td><td className="money"><InvoicePaymentProgress paid={row.paidCents / 100} gross={row.expectedCents / 100} label="erstattet" /></td><td className="money">{money(row.remainingCents)}</td><td><span className={`reimbursement-status reimbursement-status--${row.status.toLowerCase()}`}>{labels[row.status]}</span></td><td><button className="btn" onClick={event => { event.stopPropagation(); void open(row.id) }}>Info</button></td></tr>)}
          {!visible.length && <tr><td colSpan={8} className="helper">Keine Kostenerstattungen gefunden.</td></tr>}
        </tbody></table></div>}

  </div>
  if (creating && voucher?.type === 'OUT') return <ReimbursementCreateForm voucherId={voucher.id} description={voucher.description} busy={busy} error={error} onClose={close} onSave={input => void mutate(() => window.api.reimbursements.create(input), 'Kostenerstattung angelegt.')} />
  const content = <div className={embedded && !detail && !creating ? 'reimbursement-inline' : 'modal reimbursement-modal'}>
      {(!embedded || detail || creating) && <header className="reimbursement-header"><div><h2 id="reimbursement-heading">{creating ? 'Erstattung erwarten' : detail ? 'Kostenerstattung' : 'Kostenerstattungen'}</h2>{detail && <p className="reimbursement-detail-title">{detail.title}</p>}</div><button className="btn ghost" disabled={busy} onClick={close} aria-label="Schließen">×</button></header>}
      {error && <p className="reimbursement-error" role="alert">{error}</p>}
      {creating ? <>
        {form}
        {!metadataValid && <p className="helper">Bitte Bezeichnung und Kooperationspartner angeben.</p>}
        <VoucherPicker role="EXPENSE" initialVoucherId={voucher?.type === 'OUT' ? voucher.id : undefined} busy={busy} submitDisabled={!metadataValid} onSubmit={(selected, amountCents) => void mutate(() => window.api.reimbursements.create({ ...metadata, voucherId: selected.id, amountCents }), 'Kostenerstattung angelegt.')} />
      </> : detail ? <>
        <div className="reimbursement-toolbar"><span className={`reimbursement-status reimbursement-status--${detail.status.toLowerCase()}`}>{labels[detail.status]}</span><span className="reimbursement-meta"><IconUser size={15} />{detail.partner}</span>{detail.dueDate && <span className="reimbursement-meta"><IconCalendar size={15} />{date(detail.dueDate)}</span>}
          <button className="btn ghost" disabled={busy} onClick={() => { setTitle(detail.title); setPartner(detail.partner); setDueDate(detail.dueDate || ''); setNote(detail.note); setEditing(value => !value) }}><IconPencil size={14} /> Angaben bearbeiten</button></div>
        <div className="reimbursement-totals"><div>Erwartet<strong>{money(detail.expectedCents)}</strong></div><div>Erstattet<strong>{money(detail.paidCents)}</strong></div><div>Restbetrag<strong>{money(detail.remainingCents)}</strong></div></div>
        {editing ? <>{form}<button className="btn" disabled={busy || !metadataValid} onClick={() => void mutate(() => window.api.reimbursements.update({ ...metadata, id: detail.id }), 'Angaben gespeichert.')}>Angaben speichern</button></> : detail.note && <p className="reimbursement-note">{detail.note}</p>}
        {!picker && (['EXPENSE', 'PAYMENT'] as const).map(role => <section key={role} className="reimbursement-links"><div className="reimbursement-toolbar"><h3>{role === 'EXPENSE' ? <IconReceipt2 size={17} /> : <IconArrowsExchange size={17} />}{role === 'EXPENSE' ? 'Ausgaben / Belege' : 'Erstattungszahlungen'}</h3><button className="btn ghost" disabled={busy || (role === 'PAYMENT' && !detail.remainingCents)} onClick={() => setPicker(role)}>{role === 'EXPENSE' ? '+ Ausgabe' : '+ Erstattung zuordnen'}</button></div>
          <div className="reimbursement-table-wrap"><table className="reimbursement-table"><thead><tr><th>Datum</th><th>Buchung</th><th>Zahlkonto</th><th className="money">Zugeordnet</th><th aria-label="Aktionen" /></tr></thead><tbody>
          {detail.links.filter(link => link.role === role).map(link => <tr key={link.linkId}><td className="nowrap">{date(link.date)}</td><td><strong>{link.description || 'Ohne Beschreibung'}</strong><button className="reimbursement-text-link" onClick={() => { onClose(); onNavigate?.(); window.dispatchEvent(new CustomEvent('apply-voucher-jump', { detail: { voucherId: link.id, voucherNo: link.voucherNo, date: link.date } })) }}>{link.voucherNo}</button></td><td>{link.paymentAccountName || '–'}</td><td className="money">{money(link.amountCents)}</td><td><button className="btn ghost" disabled={busy} aria-label={`Zuordnung ${link.voucherNo} lösen`} onClick={() => setConfirmAction({ kind: 'unlink', linkId: link.linkId })}>Lösen</button></td></tr>)}
          {!detail.links.some(link => link.role === role) && <tr><td colSpan={5} className="helper">{role === 'EXPENSE' ? 'Noch keine Ausgabe zugeordnet.' : 'Noch keine Erstattung eingegangen.'}</td></tr>}
          </tbody></table></div>
        </section>)}
        {picker && <><div className="reimbursement-toolbar"><h3>{picker === 'EXPENSE' ? 'Weitere Ausgabe hinzufügen' : 'Erstattungszahlung auswählen'}</h3><button className="btn ghost" disabled={busy} onClick={() => setPicker(null)}>Abbrechen</button></div><VoucherPicker key={picker} role={picker} busy={busy} initialVoucherId={voucher?.type === (picker === 'EXPENSE' ? 'OUT' : 'IN') ? voucher.id : undefined} maxCents={picker === 'PAYMENT' ? detail.remainingCents : undefined} onSubmit={(selected, amountCents) => void mutate(() => window.api.reimbursements.link({ id: detail.id, voucherId: selected.id, role: picker, amountCents }), 'Buchung zugeordnet.')} /></>}
        {!picker && <p className="helper">Einen neuen Bankumsatz zuerst als Einnahme buchen oder einer vorhandenen Einnahme zuordnen. Anschließend kann die Einnahme hier als Erstattung ausgewählt werden.</p>}
        {confirmAction && <div className="reimbursement-confirm"><p>{confirmAction.kind === 'delete' ? 'Diesen Erstattungsvorgang entfernen?' : 'Diese Zuordnung lösen?'} Die Buchungen und ihre Belege bleiben erhalten.</p><button className="btn" disabled={busy} onClick={() => setConfirmAction(null)}>Abbrechen</button><button className="btn danger" disabled={busy} onClick={() => void mutate(async () => confirmAction.kind === 'delete' ? (await window.api.reimbursements.delete({ id: detail.id }), null) : window.api.reimbursements.unlink({ id: detail.id, linkId: confirmAction.linkId! }), 'Zuordnung entfernt.')}>Entfernen</button></div>}
      </> : <>
        {overview}
      </>}
      {(!embedded || detail || creating) && <footer className="reimbursement-footer">{(creating || detail) && <button className="btn" disabled={busy} onClick={() => { setDetail(null); setCreating(false); setPicker(null); setConfirmAction(null); setEditing(false) }}>Zur Übersicht</button>}{detail && !detail.paidCents && <button className="btn ghost" disabled={busy} onClick={() => setConfirmAction({ kind: 'delete' })}>Vorgang entfernen</button>}<button className="btn" disabled={busy} onClick={close}>Schließen</button></footer>}
    </div>
  const overlay = createPortal(<div className="modal-overlay reimbursement-overlay" role="dialog" aria-modal="true" aria-labelledby="reimbursement-heading" onMouseDown={event => { if (event.target === event.currentTarget && !busy) close() }}>{content}</div>, document.body)
  if (!embedded) return overlay
  const isOpen = !!detail || creating
  return <>{toolbarTarget && createPortal(toolbar, toolbarTarget)}<div aria-hidden={isOpen || undefined} ref={node => { if (isOpen) node?.setAttribute('inert', ''); else node?.removeAttribute('inert') }}>{overview}</div>{isOpen && overlay}</>
}
