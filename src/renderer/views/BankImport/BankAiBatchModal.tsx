import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconAlertTriangle, IconCalendarRepeat, IconCircleCheckFilled, IconClipboardCheck, IconLink, IconReceipt, IconSparkles, IconUserCheck } from '@tabler/icons-react'
import ModalHeader from '../../components/ModalHeader'
import HoverTooltip from '../../components/common/HoverTooltip'
import BankAiDraftEditor, { type BankDraftOption, type BankDraftTag } from './BankAiDraftEditor'
import ContributionAllocationEditor from '../../components/finance/ContributionAllocationEditor'
import type { ContributionPaymentInput, ContributionPreview } from '../../../../shared/membershipPayments'
import type { BankAiBatchRow, BankBookingCandidate, BankTransaction } from '../../../../shared/bankAiBatch'
import type { ClassificationValue } from '../../../../shared/classification'
import './bankAiBatch.css'

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const date = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('.') : value
const actions = { CREATE_BOOKING: 'Neue Buchung', LINK_EXISTING: 'Bestehende Buchung zuordnen', APPLY_RECURRING: 'Dauerbuchung anwenden', MARK_CHECKED: 'Ohne Buchung prüfen', NEEDS_MANUAL_REVIEW: 'Manuelle Prüfung' }
type Outcome = { state: 'running' | 'success' | 'error'; message: string }
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
  const [membershipEdits, setMembershipEdits] = useState<Record<number, { preview: ContributionPreview; input: ContributionPaymentInput } | null>>({})
  const [validation, setValidation] = useState<Record<number, Validation>>({})
  const [expanded, setExpanded] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const [classifications, setClassifications] = useState<ClassificationValue[]>([])
  const [classificationLabel, setClassificationLabel] = useState('Sphäre / Kategorie')
  const [general, setGeneral] = useState(false)
  const [budgets, setBudgets] = useState<BankDraftOption[]>([])
  const [bindings, setBindings] = useState<BankDraftOption[]>([])
  const [tagDefs, setTagDefs] = useState<BankDraftTag[]>([])
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
      window.api.classifications.primary.list(), window.api.budgets.list(), window.api.bindings.list(), window.api.tags.list()
    ]).then(async ([next, primary, budgetData, bindingData, tags]) => {
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
      setMembershipEdits(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => unchanged.has(Number(id)))))
      setValidation(checkedDrafts)
      previewTokens.current = new Map(next.map(row => [row.transaction.id, row.token]))
      setRows(previous => [...previous.filter(r => completed.current.has(r.transaction.id)), ...next])
      setClassifications(primary.values.filter(v => v.isActive))
      setGeneral(primary.profile === 'GENERAL')
      setClassificationLabel(primary.definition.primaryLabel)
      setBudgets(budgetData.rows.map(b => ({ id: b.id, name: b.name || b.categoryName || b.projectName || `Budget ${b.year} · #${b.id}` })))
      setBindings(bindingData.rows.map(b => ({ id: b.id, name: b.name })))
      setTagDefs(tags.rows)
      setOutcomes(previous => Object.fromEntries(Object.entries(previous).filter(([, value]) => value.state === 'success')))
    }).catch(reason => { if (active) setError(reason?.message || String(reason)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [transactions, revision, visible])

  const blockersFor = (row: BankAiBatchRow) => validation[row.transaction.id]?.blockers ?? row.blockers
  const validating = Object.values(validation).some(value => value.pending) || Object.values(membershipEdits).some(value => value === null)
  const available = rows.filter(row => !blockersFor(row).length && outcomes[row.transaction.id]?.state !== 'success')
  const selectedRows = available.filter(row => selected.has(row.transaction.id))
  const newCount = selectedRows.filter(r => r.transaction.aiSuggestion?.action === 'CREATE_BOOKING').length
  const recurringCount = selectedRows.filter(r => r.transaction.aiSuggestion?.action === 'APPLY_RECURRING').length
  const linkCount = selectedRows.length - newCount - recurringCount
  const membershipCount = selectedRows.filter(row => row.membershipPreview).length
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
          const memberEdit = membershipEdits[id]
          const result = await window.api.bankTransactions.applyAiBatch({ id, token: row.token, candidate: edits[id], membershipAllocation: memberEdit ? { allocations: memberEdit.preview.allocations } : undefined })
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
              setMembershipEdits(previous => { const next = { ...previous }; delete next[id]; return next })
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
            const ActionIcon = suggestion?.action === 'LINK_EXISTING' ? IconLink : suggestion?.action === 'APPLY_RECURRING' ? IconCalendarRepeat : suggestion?.action === 'MARK_CHECKED' ? IconClipboardCheck : suggestion?.action === 'CREATE_BOOKING' ? IconReceipt : IconAlertTriangle
            return <React.Fragment key={id}>
              <tr className={[outcome?.state === 'success' ? 'bank-ai-batch-done' : '', showDetails ? 'bank-ai-batch-expanded' : ''].filter(Boolean).join(' ')}>
                <td><input type="checkbox" aria-label={`Bankbeleg ${id} auswählen`} checked={selected.has(id)}
                  disabled={busy || !!blockers.length || validation[id]?.pending || outcome?.state === 'success'}
                  onChange={event => setSelected(previous => { const next = new Set(previous); if (event.target.checked) next.add(id); else next.delete(id); return next })} /></td>
                <td><strong>{transaction.counterparty || 'Ohne Gegenpartei'}</strong><small>{transaction.purpose || 'Ohne Verwendungszweck'}</small><small>{date(transaction.bookingDate)} · {transaction.paymentAccountName} · #{id}</small></td>
                <td className={`bank-ai-batch-amount bank-ai-batch-amount--${transaction.direction.toLowerCase()}`}>{transaction.direction === 'OUT' ? '−' : '+'}{euro.format(transaction.amount)}</td>
                <td>
                  <div className="bank-ai-batch-booking-step"><ActionIcon size={18} aria-hidden="true" /><div>
                    <strong className="bank-ai-batch-step-title">{suggestion ? actions[suggestion.action] : 'Kein Vorschlag'}</strong>
                    {candidate ? <><p className="bank-ai-batch-description">{candidate.description}</p><small>{classification(candidate)?.name || (general ? 'Kategorie fehlt' : candidate.sphere)} · {date(candidate.date)} · {candidate.vatRate ?? 0} % USt.</small></>
                      : <small>{suggestion?.voucherNo} {row.targetDescription}</small>}
                    {!!edits[id] && <small>Entwurf bearbeitet</small>}
                  </div></div>
                  {row.membershipPreview && <div className="bank-ai-batch-membership-step">
                    <IconUserCheck size={18} aria-hidden="true" /><div>
                      <span className="bank-ai-batch-step-label">Anschließend</span>
                      <strong className="bank-ai-batch-step-title">Beitragszahlung zuordnen</strong>
                      <span className="bank-ai-batch-member-name">{row.membershipPreview.memberName}</span>
                      {row.membershipPreview.allocations.length > 0 && <small>{row.membershipPreview.allocations.length} {row.membershipPreview.allocations.length === 1 ? 'Beitragsperiode' : 'Beitragsperioden'} · {row.membershipPreview.allocations[0]?.periodKey}{row.membershipPreview.allocations.length > 1 ? ` – ${row.membershipPreview.allocations.at(-1)?.periodKey}` : ''}</small>}
                      {row.membershipPreview.credit > 0 && <small>Guthaben: {euro.format(row.membershipPreview.credit)}</small>}
                    </div>
                  </div>}
                </td>
                <td aria-live="polite">{validation[id]?.pending ? <span>Entwurf wird geprüft …</span> : outcome ? <span className={`bank-ai-batch-${outcome.state}`}>{outcome.message}</span>
                  : blockers.length ? <span className="bank-ai-batch-warning">{blockers.join(' ')}</span> : <HoverTooltip content="Zur Übernahme bereit">
                    {({ ref, props }) => <span ref={ref} {...props} tabIndex={0} role="img" aria-label="Zur Übernahme bereit" className="bank-ai-batch-ready"><IconCircleCheckFilled size={23} aria-hidden="true" /></span>}
                  </HoverTooltip>}
                  {!!warnings.length && <small className="bank-ai-batch-hint">Hinweis: {warnings.join(' ')}</small>}</td>
                <td><div className="bank-ai-batch-actions"><button className="btn bank-ai-batch-action" disabled={busy} aria-expanded={showDetails} aria-label={`Details zu Bankbeleg ${id}`} onClick={() => setExpanded(showDetails ? null : id)}>{showDetails ? 'Zuklappen' : editable ? 'Prüfen / Bearbeiten' : 'Ansehen'}</button>
                  {!!blockers.length && <button className="btn bank-ai-batch-action" disabled={busy} onClick={() => onReview(suggestion?.action === 'CREATE_BOOKING' && candidate
                    ? { ...transaction, aiSuggestion: { ...suggestion, bookingCandidate: candidate } } : transaction)}>Einzeln prüfen</button>}</div></td>
              </tr>
              {showDetails && <tr className="bank-ai-batch-detail-row"><td colSpan={6} className="bank-ai-batch-details">
                {row.membershipPreview && <ContributionAllocationEditor key={`${id}:${row.token}`} disabled={busy} source={{ memberId: row.membershipPreview.memberId, amount: transaction.amount, datePaid: transaction.bookingDate, voucherId: suggestion?.action === 'LINK_EXISTING' ? suggestion.voucherId : undefined, startPeriod: row.membershipPreview.allocations[0]?.periodKey }} onReady={(preview, input) => setMembershipEdits(previous => ({ ...previous, [id]: preview ? { preview, input } : null }))} />}
                <div className="bank-ai-batch-detail-layout">
                  <aside className="bank-ai-batch-reason" aria-label="Begründung der KI">
                    <div className="bank-ai-batch-reason-heading"><IconSparkles size={21} aria-hidden="true" /><h3>Begründung der KI</h3></div>
                    <p>{suggestion?.reason || 'Kein Vorschlag vorhanden.'}</p>
                    {!!suggestion?.evidence.length && <div className="bank-ai-batch-evidence"><strong>Hinweise aus dem Beleg</strong><ul>{suggestion.evidence.map((evidence, index) => <li key={index}>{evidence}</li>)}</ul></div>}
                  </aside>
                  {candidate && <BankAiDraftEditor candidate={candidate} editable={editable}
                    commentsEnabled={row.commentsEnabled && suggestion?.action === 'CREATE_BOOKING'}
                    classifications={classifications} classificationLabel={classificationLabel} general={general}
                    budgets={budgets} bindings={bindings} tagDefs={tagDefs} onChange={update => updateCandidate(row, update)} />}
                </div>
              </td></tr>}
            </React.Fragment>
          })}</tbody>
        </table>}
      </div>
      <footer className="bank-modal-footer bank-ai-batch-footer">
        <div className="bank-ai-batch-selection"><strong>{selectedRows.length} ausgewählt</strong><small>{newCount} neue Buchungen · {linkCount} Zuordnungen · {recurringCount} Dauerbuchungen{membershipCount ? ` · ${membershipCount} ${membershipCount === 1 ? 'Beitragszuordnung' : 'Beitragszuordnungen'}` : ''}</small></div>
        <div className="bank-ai-batch-footer-actions">
        <button className="btn" disabled={busy} onClick={onClose}>Schließen</button>
        <button className="btn primary" disabled={loading || busy || validating || !!error || !selectedRows.length} onClick={() => void apply()}>
          {busy ? 'Wird übernommen …' : newCount === selectedRows.length && newCount ? `${newCount} ${newCount === 1 ? 'Buchung' : 'Buchungen'} anlegen` : `${selectedRows.length} ${selectedRows.length === 1 ? 'Vorschlag' : 'Vorschläge'} übernehmen`}
        </button>
        </div>
      </footer>
    </div>
  </div>, document.body)
}
