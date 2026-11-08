import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconSparkles } from '@tabler/icons-react'
import ModalHeader from '../../components/ModalHeader'
import type { BankAiBatchRow, BankBookingCandidate, BankTransaction } from '../../../../shared/bankAiBatch'
import type { ClassificationValue } from '../../../../shared/classification'
import './bankAiBatch.css'

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const date = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('.') : value
const actions = { CREATE_BOOKING: 'Neue Buchung', LINK_EXISTING: 'Bestehende Buchung zuordnen', APPLY_RECURRING: 'Dauerbuchung anwenden', MARK_CHECKED: 'Ohne Buchung prüfen', NEEDS_MANUAL_REVIEW: 'Manuelle Prüfung' }
type Outcome = { state: 'running' | 'success' | 'error'; message: string }
type Option = { id: number; name: string }
type Validation = { pending: boolean; blockers: string[] }

export default function BankAiBatchModal({ transactions, page, scope = 'aktuelle Filter', visible = true, onClose, onChanged, onReview }: {
  visible?: boolean
  scope?: string
  transactions: BankTransaction[]; page: number; onClose: () => void; onChanged: () => void
  onReview: (transaction: BankTransaction) => void
}) {
  const [rows, setRows] = useState<BankAiBatchRow[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [outcomes, setOutcomes] = useState<Record<number, Outcome>>({})
  const [edits, setEdits] = useState<Record<number, BankBookingCandidate>>({})
  const [validation, setValidation] = useState<Record<number, Validation>>({})
  const [expanded, setExpanded] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const [classifications, setClassifications] = useState<ClassificationValue[]>([])
  const [classificationLabel, setClassificationLabel] = useState('Sphäre / Kategorie')
  const [general, setGeneral] = useState(false)
  const [budgets, setBudgets] = useState<Option[]>([])
  const [bindings, setBindings] = useState<Option[]>([])
  const inFlight = useRef(false)
  const dialog = useRef<HTMLDivElement>(null)
  const selectAll = useRef<HTMLInputElement>(null)
  const completed = useRef(new Set<number>())
  const previewTokens = useRef(new Map<number, string>())
  const validationVersions = useRef(new Map<number, number>())
  const validationTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>())
  const editsRef = useRef(edits)
  editsRef.current = edits
  useEffect(() => () => {
    validationTimers.current.forEach(timer => clearTimeout(timer))
    validationVersions.current.forEach((version, id) => validationVersions.current.set(id, version + 1))
  }, [])

  useEffect(() => {
    if (!visible) return
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.focus()
    return () => previous?.focus()
  }, [visible])

  useEffect(() => {
    if (!visible) return
    let active = true
    setLoading(true)
    setError('')
    const drafts = editsRef.current
    const pending = transactions.filter(t => !completed.current.has(t.id)).map(t => t.id)
    void Promise.all([
      pending.length ? window.api.bankTransactions.previewAiBatch({ ids: pending }) : Promise.resolve([]),
      window.api.classifications.primary.list(), window.api.budgets.list(), window.api.bindings.list()
    ]).then(async ([next, primary, budgetData, bindingData]) => {
      if (!active) return
      const unchanged = new Set(next.filter(row => previewTokens.current.get(row.transaction.id) === row.token).map(row => row.transaction.id))
      for (const row of next) {
        const id = row.transaction.id
        clearTimeout(validationTimers.current.get(id))
        validationVersions.current.set(id, (validationVersions.current.get(id) ?? 0) + 1)
      }
      const checkedDrafts: Record<number, Validation> = {}
      await Promise.all(next.filter(row => unchanged.has(row.transaction.id) && drafts[row.transaction.id]).map(async row => {
        const id = row.transaction.id
        try {
          checkedDrafts[id] = { pending: false, blockers: (await window.api.bankTransactions.validateAiBatchDraft({ id, token: row.token, candidate: drafts[id] })).blockers }
        } catch (reason) { checkedDrafts[id] = { pending: false, blockers: [(reason as Error).message || String(reason)] } }
      }))
      if (!active) return
      const eligible = new Set(next.filter(row => !(checkedDrafts[row.transaction.id]?.blockers ?? row.blockers).length).map(row => row.transaction.id))
      setSelected(previous => new Set([...previous].filter(id => unchanged.has(id) && eligible.has(id))))
      setEdits(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => unchanged.has(Number(id)))))
      setValidation(checkedDrafts)
      previewTokens.current = new Map(next.map(row => [row.transaction.id, row.token]))
      setRows(previous => [...previous.filter(r => completed.current.has(r.transaction.id)), ...next])
      setClassifications(primary.values.filter(v => v.isActive))
      setGeneral(primary.profile === 'GENERAL')
      setClassificationLabel(primary.definition.primaryLabel)
      setBudgets(budgetData.rows.map(b => ({ id: b.id, name: b.name || b.categoryName || b.projectName || `Budget ${b.year} · #${b.id}` })))
      setBindings(bindingData.rows.map(b => ({ id: b.id, name: b.name })))
      setOutcomes(previous => Object.fromEntries(Object.entries(previous).filter(([, value]) => value.state === 'success')))
    }).catch(reason => { if (active) setError(reason?.message || String(reason)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [transactions, revision, visible])

  const blockersFor = (row: BankAiBatchRow) => validation[row.transaction.id]?.blockers ?? row.blockers
  const validating = Object.values(validation).some(value => value.pending)
  const available = rows.filter(row => !blockersFor(row).length && outcomes[row.transaction.id]?.state !== 'success')
  const selectedRows = available.filter(row => selected.has(row.transaction.id))
  const newCount = selectedRows.filter(r => r.transaction.aiSuggestion?.action === 'CREATE_BOOKING').length
  const recurringCount = selectedRows.filter(r => r.transaction.aiSuggestion?.action === 'APPLY_RECURRING').length
  const linkCount = selectedRows.length - newCount - recurringCount
  const successes = Object.values(outcomes).filter(o => o.state === 'success').length
  const failures = Object.values(outcomes).filter(o => o.state === 'error').length
  useEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = selectedRows.length > 0 && selectedRows.length < available.length
  }, [selectedRows.length, available.length])

  const updateCandidate = (row: BankAiBatchRow, update: Partial<BankBookingCandidate>) => {
    const id = row.transaction.id
    const candidate = { ...(edits[id] || row.candidate!), ...update }
    setEdits(previous => ({ ...previous, [id]: candidate }))
    setValidation(previous => ({ ...previous, [id]: { pending: true, blockers: previous[id]?.blockers ?? row.blockers } }))
    const version = (validationVersions.current.get(id) ?? 0) + 1
    validationVersions.current.set(id, version)
    clearTimeout(validationTimers.current.get(id))
    validationTimers.current.set(id, setTimeout(async () => {
      let blockers: string[]
      try {
        blockers = (await window.api.bankTransactions.validateAiBatchDraft({ id, token: row.token, candidate })).blockers
      } catch (reason) { blockers = [(reason as Error).message || String(reason)] }
      if (validationVersions.current.get(id) !== version) return
      setValidation(previous => ({ ...previous, [id]: { pending: false, blockers } }))
      if (blockers.length) setSelected(previous => { const next = new Set(previous); next.delete(id); return next })
    }, 250))
  }
  const apply = async () => {
    if (inFlight.current || loading || validating || !selectedRows.length) return
    inFlight.current = true
    setBusy(true)
    try {
      for (const row of selectedRows) {
        const id = row.transaction.id
        setOutcomes(previous => ({ ...previous, [id]: { state: 'running', message: 'Wird übernommen …' } }))
        try {
          const result = await window.api.bankTransactions.applyAiBatch({ id, token: row.token, candidate: edits[id] })
          completed.current.add(id)
          setSelected(previous => { const next = new Set(previous); next.delete(id); return next })
          const verb = row.transaction.aiSuggestion?.action === 'LINK_EXISTING' ? 'Zugeordnet' : 'Angelegt'
          setOutcomes(previous => ({ ...previous, [id]: { state: 'success', message: `${verb} · ${result.voucherNo}${result.warnings.length ? ` · ${result.warnings.join(' · ')}` : ''}` } }))
        } catch (reason) {
          setOutcomes(previous => ({ ...previous, [id]: { state: 'error', message: (reason as Error).message || String(reason) } }))
          // Reload a changed source automatically, but require a fresh selection.
          try {
            const [fresh] = await window.api.bankTransactions.previewAiBatch({ ids: [id] })
            if (fresh && fresh.token !== row.token) {
              setRows(previous => previous.map(r => r.transaction.id === id ? fresh : r))
              previewTokens.current.set(id, fresh.token)
              setSelected(previous => { const next = new Set(previous); next.delete(id); return next })
              setEdits(previous => { const next = { ...previous }; delete next[id]; return next })
              setValidation(previous => { const next = { ...previous }; delete next[id]; return next })
              setOutcomes(previous => ({ ...previous, [id]: { state: 'error', message: 'Vorschlag wurde geändert und automatisch neu geladen. Bitte prüfen und erneut auswählen.' } }))
            }
          } catch { /* Keep the original failure visible; reopening reloads the preview. */ }
        }
      }
    } finally {
      inFlight.current = false
      setBusy(false)
      onChanged()
    }
  }
  const classification = (candidate: BankBookingCandidate) => classifications.find(v => candidate.primaryClassificationValueId ? v.id === candidate.primaryClassificationValueId : !general && v.stableKey === candidate.sphere)
  const allocationName = (options: Option[], id: number) => options.find(o => o.id === id)?.name || `#${id}`

  return createPortal(<div className="modal-overlay bank-import-overlay" style={visible ? undefined : { display: 'none' }} onMouseDown={event => {
    if (!busy && event.target === event.currentTarget) onClose()
  }}>
    <div ref={dialog} className="modal bank-ai-batch-modal" role="dialog" aria-modal="true" aria-labelledby="bank-ai-batch-title" tabIndex={-1}
      onKeyDown={event => {
        if (event.key !== 'Tab') return
        const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || []).filter(el => el.getClientRects().length)
        const first = controls[0], last = controls[controls.length - 1]
        if (!first) { event.preventDefault(); return }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus() }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }}>
      <ModalHeader title="KI-Vorschläge prüfen" titleId="bank-ai-batch-title" icon={<IconSparkles size={24} />}
        subtitle={`Offene Bankbelege von Seite ${page} · ${scope} · ${transactions.length} Vorschläge`}
        onClose={onClose} closeDisabled={busy} />
      <div className="bank-ai-batch-intro">
        <p>Prüfe die Buchungsdaten und wähle die Vorschläge aus, die du übernehmen möchtest. Erst mit deiner Freigabe werden Buchungen angelegt oder zugeordnet.</p>
        <div className="bank-ai-batch-toolbar">
          <label><input ref={selectAll} type="checkbox" disabled={loading || busy || validating || !!error || !available.length}
            checked={!!available.length && selectedRows.length === available.length}
            onChange={event => setSelected(new Set(event.target.checked ? available.map(r => r.transaction.id) : []))} /> Alle übernahmefähigen Vorschläge auswählen</label>
        </div>
        <p className="helper" role="status" aria-live="polite">{loading ? 'Vorschläge und Zuordnungen werden geprüft …' : validating ? 'Geänderte Buchungsdaten werden geprüft …' : `${available.length} übernahmefähig · ${rows.filter(r => blockersFor(r).length).length} zu prüfen · ${successes} übernommen${failures ? ` · ${failures} fehlgeschlagen` : ''}`}</p>
        {error && <div role="alert" className="bank-ai-batch-error">Die Vorschau konnte nicht geladen werden: {error} <button className="btn bank-ai-batch-action" onClick={() => setRevision(value => value + 1)}>Erneut laden</button></div>}
      </div>
      <div className="bank-ai-batch-scroll" aria-busy={loading}>
        {!loading && !error && <table className="bank-table bank-ai-batch-table" aria-label="KI-Vorschläge zur Sammelübernahme">
          <thead><tr><th>Auswahl</th><th>Bankbeleg</th><th>Betrag</th><th>Aktion und Buchungsdaten</th><th>Prüfung / Ergebnis</th><th>Details</th></tr></thead>
          <tbody>{rows.map(row => {
            const transaction = row.transaction, id = transaction.id, suggestion = transaction.aiSuggestion
            const candidate = edits[id] || row.candidate
            const warnings = (row.warnings || []).filter(warning => !(candidate?.budgets?.length
              && /\bkein(?:e|en)?\s+budget(?:s)?\s+(?:zugeordnet|zugewiesen)\b/i.test(warning)))
            const outcome = outcomes[id]
            const blockers = blockersFor(row)
            const editable = suggestion?.action === 'CREATE_BOOKING' && transaction.status === 'OPEN' && outcome?.state !== 'success' && !busy
            const showDetails = expanded === id
            return <React.Fragment key={id}>
              <tr className={outcome?.state === 'success' ? 'bank-ai-batch-done' : ''}>
                <td><input type="checkbox" aria-label={`Bankbeleg ${id} auswählen`} checked={selected.has(id)}
                  disabled={busy || !!blockers.length || validation[id]?.pending || outcome?.state === 'success'}
                  onChange={event => setSelected(previous => { const next = new Set(previous); if (event.target.checked) next.add(id); else next.delete(id); return next })} /></td>
                <td><strong>{transaction.counterparty || 'Ohne Gegenpartei'}</strong><small>{transaction.purpose || 'Ohne Verwendungszweck'}</small><small>{date(transaction.bookingDate)} · {transaction.paymentAccountName} · #{id}</small></td>
                <td className={`bank-ai-batch-amount bank-ai-batch-amount--${transaction.direction.toLowerCase()}`}>{transaction.direction === 'OUT' ? '−' : '+'}{euro.format(transaction.amount)}</td>
                <td><strong>{suggestion ? actions[suggestion.action] : 'Kein Vorschlag'}</strong>
                  {candidate ? <><small>{candidate.description}</small><small>{classification(candidate)?.name || (general ? 'Kategorie fehlt' : candidate.sphere)} · {date(candidate.date)} · {candidate.vatRate ?? 0} % USt.</small></>
                    : <small>{suggestion?.voucherNo} {row.targetDescription}</small>}
                  {!!edits[id] && <small>Entwurf bearbeitet</small>}
                </td>
                <td aria-live="polite">{validation[id]?.pending ? <span>Entwurf wird geprüft …</span> : outcome ? <span className={`bank-ai-batch-${outcome.state}`}>{outcome.message}</span>
                  : blockers.length ? <span className="bank-ai-batch-warning">{blockers.join(' ')}</span> : <span className="bank-ai-batch-ready">Zur Übernahme bereit</span>}
                  {!!warnings.length && <small className="bank-ai-batch-hint">Hinweis: {warnings.join(' ')}</small>}</td>
                <td><div className="bank-ai-batch-actions"><button className="btn bank-ai-batch-action" disabled={busy} aria-expanded={showDetails} aria-label={`Details zu Bankbeleg ${id}`} onClick={() => setExpanded(showDetails ? null : id)}>{showDetails ? 'Zuklappen' : editable ? 'Prüfen / Bearbeiten' : 'Ansehen'}</button>
                  {!!blockers.length && <button className="btn bank-ai-batch-action" disabled={busy} onClick={() => onReview(suggestion?.action === 'CREATE_BOOKING' && candidate
                    ? { ...transaction, aiSuggestion: { ...suggestion, bookingCandidate: candidate } } : transaction)}>Einzeln prüfen</button>}</div></td>
              </tr>
              {showDetails && <tr><td colSpan={6} className="bank-ai-batch-details">
                <div><strong>Begründung der KI</strong><p>{suggestion?.reason || 'Kein Vorschlag vorhanden.'}</p>
                  {!!suggestion?.evidence.length && <p className="helper">{suggestion.evidence.join(' · ')}</p>}</div>
                {candidate && <fieldset disabled={!editable} className="bank-ai-batch-fields"><legend>{editable ? 'Buchungsentwurf bearbeiten' : 'Buchungsdaten'}</legend>
                  <label>Buchungsdatum<input className="input" type="date" value={candidate.date} onChange={event => updateCandidate(row, { date: event.target.value })} /></label>
                  <label>{classificationLabel}<select className="input" aria-label={classificationLabel} value={classification(candidate)?.id || ''} onChange={event => {
                    const value = classifications.find(v => v.id === Number(event.target.value))
                    if (value) updateCandidate(row, { primaryClassificationValueId: value.id, sphere: general ? candidate.sphere : value.stableKey })
                  }}><option value="" disabled>Bitte auswählen</option>{classifications.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
                  <label>Umsatzsteuer (%)<input className="input" type="number" min="0" max="100" step="0.01" value={candidate.vatRate ?? 0} onChange={event => updateCandidate(row, { vatRate: Number(event.target.value) })} /></label>
                  <label className="bank-ai-batch-wide">Buchungstext<input className="input" value={candidate.description} onChange={event => updateCandidate(row, { description: event.target.value })} /></label>
                  <label>Gegenpartei<input className="input" value={candidate.counterparty || ''} onChange={event => updateCandidate(row, { counterparty: event.target.value })} /></label>
                  {row.commentsEnabled && suggestion?.action === 'CREATE_BOOKING' && <label className="bank-ai-batch-wide">Kommentar<textarea className="input" aria-label="Kommentar" rows={3} value={candidate.note || ''} onChange={event => updateCandidate(row, { note: event.target.value })} /></label>}
                  <label className="bank-ai-batch-wide">Tags (durch Komma getrennt)<input className="input" value={(candidate.tags || []).join(', ')} onChange={event => updateCandidate(row, { tags: event.target.value.split(',').map(t => t.trim()) })} /></label>
                  {(['budgets', 'earmarks'] as const).map(kind => <div key={kind} className="bank-ai-batch-wide"><strong>{kind === 'budgets' ? 'Budgets' : 'Zweckbindungen'}</strong>
                    {(candidate[kind] || []).map((allocation, index) => <div className="bank-ai-batch-allocation" key={`${allocation.id}-${index}`}>
                      <span>{allocationName(kind === 'budgets' ? budgets : bindings, allocation.id)}</span>
                      <input className="input" aria-label={`Betrag ${kind === 'budgets' ? 'Budget' : 'Zweckbindung'} ${allocation.id}`} type="number" min="0.01" step="0.01" value={allocation.amount} onChange={event => updateCandidate(row, { [kind]: candidate[kind]!.map((a, i) => i === index ? { ...a, amount: Number(event.target.value) } : a) })} />
                      <button className="btn bank-ai-batch-action" onClick={() => updateCandidate(row, { [kind]: candidate[kind]!.filter((_, i) => i !== index) })}>Entfernen</button>
                    </div>)}
                    {!candidate[kind]?.length && <p className="helper">Keine Zuordnung</p>}
                    {editable && <select className="input" aria-label={kind === 'budgets' ? 'Budget hinzufügen' : 'Zweckbindung hinzufügen'} value="" onChange={event => updateCandidate(row, { [kind]: [...(candidate[kind] || []), { id: Number(event.target.value), amount: candidate.grossAmount }] })}>
                      <option value="" disabled>{kind === 'budgets' ? 'Budget hinzufügen …' : 'Zweckbindung hinzufügen …'}</option>
                      {(kind === 'budgets' ? budgets : bindings).filter(o => !candidate[kind]?.some(a => a.id === o.id)).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>}
                  </div>)}
                </fieldset>}
              </td></tr>}
            </React.Fragment>
          })}</tbody>
        </table>}
      </div>
      <footer className="bank-modal-footer bank-ai-batch-footer">
        <div><strong>{selectedRows.length} ausgewählt</strong><small>{newCount} neue Buchungen · {linkCount} Zuordnungen · {recurringCount} Dauerbuchungen</small></div>
        <button className="btn" disabled={busy} onClick={onClose}>Schließen</button>
        <button className="btn primary" disabled={loading || busy || validating || !!error || !selectedRows.length} onClick={() => void apply()}>
          {busy ? 'Wird übernommen …' : newCount === selectedRows.length && newCount ? `${newCount} ${newCount === 1 ? 'Buchung' : 'Buchungen'} anlegen` : `${selectedRows.length} ${selectedRows.length === 1 ? 'Vorschlag' : 'Vorschläge'} übernehmen`}
        </button>
      </footer>
    </div>
  </div>, document.body)
}
