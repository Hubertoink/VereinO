import React, { useEffect, useState } from 'react'
import BookingPopupFrame from '../../components/modals/BookingPopupFrame'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import '../../components/finance/membershipPayments.css'
import { addDataChangedListener, dispatchDataChanged } from '../../utils/refresh'
import { useToast } from '../../context/useToast'
import { periodKeyFromDate, periodRange, type ContributionPaymentInput, type ContributionPeriod, type ContributionPreview } from '../../../../shared/membershipPayments'

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const displayDate = (value?: string | null) => value ? value.split('-').reverse().join('.') : '—'
type Status = Awaited<ReturnType<Window['api']['payments']['status']>>
type History = Awaited<ReturnType<Window['api']['payments']['history']>>['rows']
export default function MemberContributionDialog({ memberId, name, memberNo, onClose, onChanged }: {
  memberId: number; name: string; memberNo?: string; onClose: () => void; onChanged?: () => void
}) {
  const { notify } = useToast()
  const [status, setStatus] = useState<Status | null>(null)
  const [periods, setPeriods] = useState<ContributionPeriod[]>([])
  const [history, setHistory] = useState<History>([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [revision, setRevision] = useState(0)
  const [years, setYears] = useState(8)
  const [timelineOffset, setTimelineOffset] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [selectedVoucherId, setSelectedVoucherId] = useState<number | null>(null)
  const [searching, setSearching] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [search, setSearch] = useState(name)
  const [vouchers, setVouchers] = useState<Array<{ id: number; voucherNo: string; date: string; description?: string | null; available: number }>>([])
  const [ready, setReady] = useState<{ preview: ContributionPreview; input: ContributionPaymentInput } | null>(null)
  const [remove, setRemove] = useState<number | null>(null)
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) { event.preventDefault(); event.stopImmediatePropagation(); onClose() } }
    window.addEventListener('keydown', keydown, true)
    return () => window.removeEventListener('keydown', keydown, true)
  }, [busy, onClose])
  useEffect(() => addDataChangedListener(['members', 'vouchers'], () => setRevision(r => r + 1)), [])
  useEffect(() => {
    let live = true
    setError('')
    Promise.all([window.api.payments.status({ memberId }), window.api.payments.history({ memberId, limit: 100 })])
      .then(async ([s, h]) => {
        const baseYear = Math.max(new Date().getFullYear(), Number(s.nextDue?.slice(0, 4) || 0))
        const p = await window.api.payments.periods({ memberId, through: `${Math.min(2199, baseYear + years)}-12-31` })
        if (live) { setStatus(s); setPeriods(p); setHistory(h.rows); setHistoryTotal(h.total) }
      })
      .catch(reason => { if (live) setError(reason.message || String(reason)) })
    return () => { live = false }
  }, [memberId, revision, years])
  useEffect(() => {
    if (!showForm) return
    let live = true
    setSearching(true); setSelectedVoucherId(null); setReady(null)
    const timer = setTimeout(() => {
      window.api.payments.availableVouchers({ q: search }).then(rows => { if (live) setVouchers(rows) })
        .catch(reason => { if (live) { setVouchers([]); setError(reason.message || String(reason)) } })
        .finally(() => { if (live) setSearching(false) })
    }, 200)
    return () => { live = false; clearTimeout(timer) }
  }, [showForm, search, revision])
  const selectedVoucher = vouchers.find(v => v.id === selectedVoucherId)
  useEffect(() => {
    setReady(null)
    if (!selectedVoucher || !showForm) { setPreviewing(false); return }
    let live = true
    setPreviewing(true); setError('')
    const input: ContributionPaymentInput = { memberId, voucherId: selectedVoucher.id, amount: selectedVoucher.available, datePaid: selectedVoucher.date }
    window.api.payments.previewAllocation(input).then(preview => { if (live) setReady({ preview, input }) })
      .catch(reason => { if (live) setError(reason.message || String(reason)) })
      .finally(() => { if (live) setPreviewing(false) })
    return () => { live = false }
  }, [memberId, selectedVoucher, showForm, revision])
  const changed = () => { setRevision(r => r + 1); onChanged?.(); dispatchDataChanged(['members', 'vouchers']) }
  const save = async () => {
    if (!ready || busy) return
    setBusy(true)
    try {
      await window.api.payments.allocate({ ...ready.input, token: ready.preview.token })
      notify('success', 'Zahlung wurde den Beiträgen zugeordnet.'); setShowForm(false); setReady(null); changed()
    } catch (reason) { setError((reason as Error).message); setReady(null); setRevision(r => r + 1) }
    finally { setBusy(false) }
  }
  const openForm = () => { setSearch(name); setSelectedVoucherId(null); setReady(null); setShowForm(true) }
  const groups = new Map<number, History>()
  for (const row of history) if (row.receiptId) groups.set(row.receiptId, [...(groups.get(row.receiptId) || []), row])
  const now = new Date().toISOString().slice(0, 10)
  const currentStart = status?.interval ? periodRange(periodKeyFromDate(new Date(), status.interval), status.interval).start : now
  const anchor = Math.max(0, periods.findIndex(p => p.remaining > 0 || p.dueDate >= currentStart))
  const visiblePeriods = periods.slice(anchor + timelineOffset, anchor + timelineOffset + 6)
  const canAdvance = anchor + timelineOffset + 6 < periods.length
  const advance = () => {
    if (anchor + timelineOffset + 9 >= periods.length && !status?.leaveDate) setYears(y => Math.min(100, y + 3))
    setTimelineOffset(offset => offset + 3)
  }
  return <BookingPopupFrame title="Beitragsstatus" titleId={`member-contribution-${memberId}`} subtitle={`${name}${memberNo ? ` (${memberNo})` : ''} · Eintritt: ${displayDate(status?.joinDate)} · Letzte Zahlung: ${displayDate(status?.lastDate)}`}
    onClose={() => { if (!busy) onClose() }} variant="compact" anchorToTrigger={false} className="fee-modal standard-floating-modal member-contribution-modal">
    <div className="contribution-panel">
      {error && <p role="alert" className="contribution-error">{error}</p>}
      {!status ? <p role="status">Beiträge werden geladen …</p> : <>
        <div className="contribution-kpis"><div><small>Beitrag / Intervall</small><strong>{euro.format(status.amount || 0)} · {status.interval === 'MONTHLY' ? 'Monatlich' : status.interval === 'QUARTERLY' ? 'Quartalsweise' : 'Jährlich'}</strong></div>
          <div><small>Fälliger Restbetrag</small><strong>{euro.format(status.dueAmount || 0)}</strong></div>
          <div title="Bereits bezahlte Beträge für noch nicht fällige Beitragsperioden, einschließlich Teilzahlungen."><small>Vorausbezahlt</small><strong>{euro.format(status.prepaidAmount || 0)}</strong></div>
          <div><small>Nächste offene Fälligkeit</small><strong>{status.nextDue ? displayDate(status.nextDue) : 'Keine'}</strong></div>
          {(status.credit || 0) > 0 && <div title="Guthaben, das noch keiner Beitragsperiode zugeordnet ist."><small>Nicht verrechnet</small><strong>{euro.format(status.credit || 0)}</strong></div>}
        </div>
        <section aria-label="Beitragszeitstrahl"><strong>Zeitstrahl</strong>
          <div className="contribution-timeline-navigation">
            <button type="button" className="btn ghost contribution-timeline-arrow" title="Drei Intervalle zurück" aria-label="Drei Intervalle zurück" disabled={busy || timelineOffset === 0} onClick={() => setTimelineOffset(offset => Math.max(0, offset - 3))}><IconChevronLeft size={18} /></button>
            <div className="contribution-timeline">{visiblePeriods.map(p => {
              const state = p.remaining === 0 ? p.dueDate > now ? 'prepaid' : 'paid' : p.paidAmount > 0 ? 'partial' : p.dueDate <= now ? 'overdue' : 'future'
              const label = { paid: 'Bezahlt', prepaid: 'Vorausbezahlt', partial: 'Teilbezahlt', overdue: 'Überfällig', future: 'Zukünftig' }[state]
              return <div className="contribution-period" key={`${p.interval}:${p.periodKey}`} data-state={state} title={`${label} · ${euro.format(p.paidAmount)} von ${euro.format(p.expected)}`}><strong>{p.periodKey}</strong><span>{label}</span><small>{euro.format(p.paidAmount)} / {euro.format(p.expected)}</small></div>
            })}</div>
            <button type="button" className="btn ghost contribution-timeline-arrow" title="Drei Intervalle weiter" aria-label="Drei Intervalle weiter" disabled={busy || !canAdvance} onClick={advance}><IconChevronRight size={18} /></button>
          </div>
        </section>
        <div className="contribution-controls"><button className="btn primary" disabled={busy} onClick={() => openForm()}>Zahlung zuordnen</button><button className="btn" onClick={async () => {
          try { const member = await window.api.members.get({ id: memberId }); const result = await window.api.members.writeLetter({ id: memberId, name, memberNo, address: member?.address }); if (!result.ok) throw new Error(result.error || 'Brief konnte nicht geöffnet werden.') } catch (reason) { notify('error', (reason as Error).message) }
        }}>Mitglied anschreiben</button></div>
      </>}
      {showForm && <section className="contribution-form" aria-label="Zahlung zuordnen">
        <label>Buchung suchen<input className="input" value={search} disabled={busy} onChange={e => { setSearch(e.target.value); setSelectedVoucherId(null); setReady(null) }} placeholder="Buchungsnummer, Name oder Beschreibung" /></label>
        <div className="contribution-table-wrap"><table className="contribution-table contribution-voucher-table" aria-label="Noch nicht zugeordnete Buchungen">
          <thead><tr><th><span className="sr-only">Auswahl</span></th><th>Datum</th><th>Buchung</th><th>Verfügbar</th></tr></thead><tbody>
            {searching ? <tr><td colSpan={4} role="status">Buchungen werden gesucht …</td></tr> : vouchers.map(v => <tr key={v.id} className={selectedVoucherId === v.id ? 'is-selected' : ''} onClick={() => { if (!busy && selectedVoucherId !== v.id) { setSelectedVoucherId(v.id); setReady(null) } }}>
              <td><input type="radio" name={`member-voucher-${memberId}`} aria-label={`Buchung ${v.voucherNo} auswählen`} disabled={busy} checked={selectedVoucherId === v.id} onChange={() => { setSelectedVoucherId(v.id); setReady(null) }} /></td>
              <td>{displayDate(v.date)}</td><td><strong>{v.voucherNo}</strong><small>{v.description || 'Ohne Beschreibung'}</small></td><td>{euro.format(v.available)}</td>
            </tr>)}
            {!searching && !vouchers.length && <tr><td colSpan={4}>Keine noch nicht zugeordneten Einnahmen gefunden.</td></tr>}
          </tbody></table></div>
        {previewing && <p className="helper" role="status">VereinO berechnet die Verrechnung …</p>}
        {ready && <p className="helper" role="status">{euro.format(ready.preview.amount)} werden automatisch verrechnet{ready.preview.allocations.length ? `: ${ready.preview.allocations[0].periodKey} bis ${ready.preview.allocations.at(-1)!.periodKey}` : ''}.{ready.preview.allocations.at(-1)?.remaining ? ` Rest dieser Periode: ${euro.format(ready.preview.allocations.at(-1)!.remaining)}.` : ''}{ready.preview.credit > 0 ? ` Guthaben: ${euro.format(ready.preview.credit)}.` : ''}</p>}
        <div className="contribution-controls"><button className="btn primary" disabled={busy || !ready || searching || previewing} onClick={() => void save()}>Zahlung diesem Mitglied zuordnen</button><button className="btn" disabled={busy} onClick={() => setShowForm(false)}>Abbrechen</button></div>
      </section>}
      <section><strong>Zahlungshistorie</strong><div className="contribution-table-wrap"><table className="contribution-table"><thead><tr><th>Datum / Buchung</th><th>Zahlbetrag</th><th>Verteilung</th><th /></tr></thead><tbody>{[...groups].map(([id, rows]) => <tr key={id}><td>{rows[0].datePaid}<br />{rows[0].voucherNo || 'Ohne Buchungsverknüpfung'}{rows[0].active === 0 && <strong> · Storniert / gelöscht</strong>}</td><td>{euro.format(rows[0].paymentAmount || 0)}</td><td>{rows.filter(r => r.periodKey).map(r => <div key={`${r.interval}:${r.periodKey}`}>{r.periodKey}: {euro.format(r.amount)}</div>)}{status?.credits?.some(r => r.id === id) && <div>Guthaben: {euro.format(status.credits.find(r => r.id === id)!.amount)}</div>}</td><td>{remove === id ? <div className="contribution-history-actions"><button className="btn" disabled={busy} onClick={async () => { setBusy(true); try { await window.api.payments.removeReceipt({ receiptId: id }); setRemove(null); changed() } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) } }}>Zuordnung wirklich lösen</button><button className="btn" onClick={() => setRemove(null)}>Abbrechen</button></div> : <button className="btn" disabled={busy} onClick={() => setRemove(id)}>Zuordnung lösen</button>}</td></tr>)}{!groups.size && <tr><td colSpan={4}>Noch keine Zahlungen.</td></tr>}</tbody></table></div></section>
    </div>
    {history.length < historyTotal && <button className="btn" disabled={busy} onClick={async () => {
      setBusy(true)
      try { const next = await window.api.payments.history({ memberId, offset: history.length, limit: 100 }); setHistory(previous => [...previous, ...next.rows]); setHistoryTotal(next.total) }
      catch (reason) { setError((reason as Error).message) }
      finally { setBusy(false) }
    }}>Weitere Zahlungen anzeigen</button>}
  </BookingPopupFrame>
}
