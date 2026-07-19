import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import TagsEditor from '../../components/TagsEditor'
import PartySelector from '../../components/common/PartySelector'
import SelectDropdown from '../../components/common/SelectDropdown'
import FilterDropdown from '../../components/dropdowns/FilterDropdown'
import { addDataChangedListener, dispatchDataChanged } from '../../utils/refresh'
import { localIsoDate, type RecurringFrequency } from '../../../../shared/recurrence'

type Status = 'ACTIVE' | 'PAUSED' | 'ENDED'
type Sphere = 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
type BudgetAssignment = { budgetId: number; amount: number }
type EarmarkAssignment = { earmarkId: number; amount: number }
type PendingRecurringAction = { row: RecurringBooking; kind: 'skip' | 'pause' | 'end' }

type RecurringBooking = {
  id: number
  name: string
  type: 'IN' | 'OUT'
  sphere: Sphere
  description: string | null
  note: string | null
  counterparty: string | null
  amountMode: 'NET' | 'GROSS'
  amount: number
  variableAmount: boolean
  vatRate: number
  paymentAccountId: number | null
  paymentAccountName: string | null
  budgetId: number | null
  budgetLabel: string | null
  earmarkId: number | null
  earmarkLabel: string | null
  budgets: BudgetAssignment[]
  earmarks: EarmarkAssignment[]
  tags: string[]
  frequency: RecurringFrequency
  startDate: string
  nextDueDate: string
  endDate: string | null
  status: Status
  dueCount: number
  earliestDueDate: string | null
  lastBookedDate: string | null
  suggestedVoucherId: number | null
  suggestedVoucherNo: string | null
  suggestedVoucherDate: string | null
  suggestedVoucherDescription: string | null
  suggestedBankTransactionId: number | null
  suggestedMatchScore: number | null
}

type Draft = Omit<RecurringBooking, 'id' | 'paymentAccountName' | 'budgetLabel' | 'earmarkLabel' | 'dueCount' | 'earliestDueDate' | 'lastBookedDate' | 'suggestedVoucherId' | 'suggestedVoucherNo' | 'suggestedVoucherDate' | 'suggestedVoucherDescription' | 'suggestedBankTransactionId' | 'suggestedMatchScore'> & { id?: number }

type Lookup = { id: number; label: string; isArchived?: boolean; isActive?: boolean }
type PaymentAccount = { id: number; name: string; kind: string; isActive?: boolean }

const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  WEEKLY: 'Wöchentlich',
  MONTHLY: 'Monatlich',
  QUARTERLY: 'Quartalsweise',
  YEARLY: 'Jährlich'
}

const SPHERE_LABELS: Record<Sphere, string> = {
  IDEELL: 'Ideeller Bereich',
  ZWECK: 'Zweckbetrieb',
  VERMOEGEN: 'Vermögensverwaltung',
  WGB: 'Wirtschaftlicher Geschäftsbetrieb'
}

function RecurringStatusFilterDropdown({ value, onChange }: { value: 'ALL' | Status; onChange: (value: 'ALL' | Status) => void }) {
  const closeRef = React.useRef<(() => void) | null>(null)
  const options: Array<{ value: 'ALL' | Status; label: string; description: string }> = [
    { value: 'ALL', label: 'Alle Status', description: 'Alle Dauerbuchungen anzeigen' },
    { value: 'ACTIVE', label: 'Aktiv', description: 'Nur aktive Vorlagen' },
    { value: 'PAUSED', label: 'Pausiert', description: 'Vorübergehend angehaltene Vorlagen' },
    { value: 'ENDED', label: 'Beendet', description: 'Abgeschlossene Vorlagen' }
  ]
  return (
    <FilterDropdown
      trigger={<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 4h18v2L14 13v6l-4 2v-8L3 6V4z" /></svg>}
      title="Status filtern"
      hasActiveFilters={value !== 'ALL'}
      alignRight
      width={250}
      ariaLabel="Dauerbuchungen nach Status filtern"
      buttonTitle="Status filtern"
      colorVariant="filter"
      closeRef={closeRef}
    >
      <div className="recurring-status-filter-menu">
        {options.map((option) => <button key={option.value} type="button" className={value === option.value ? 'is-active' : ''} onClick={() => { onChange(option.value); closeRef.current?.() }}><span><strong>{option.label}</strong><small>{option.description}</small></span>{value === option.value && <b>✓</b>}</button>)}
      </div>
    </FilterDropdown>
  )
}

function initialDraft(): Draft {
  const today = localIsoDate()
  return {
    name: '',
    type: 'OUT',
    sphere: 'IDEELL',
    description: '',
    note: '',
    counterparty: '',
    amountMode: 'GROSS',
    amount: 0,
    variableAmount: false,
    vatRate: 0,
    paymentAccountId: null,
    budgetId: null,
    earmarkId: null,
    budgets: [],
    earmarks: [],
    tags: [],
    frequency: 'MONTHLY',
    startDate: today,
    nextDueDate: today,
    endDate: null,
    status: 'ACTIVE'
  }
}

function fmtDate(value?: string | null) {
  if (!value) return '—'
  return `${value.slice(8, 10)}.${value.slice(5, 7)}.${value.slice(0, 4)}`
}

function draftFromRow(row: RecurringBooking): Draft {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    sphere: row.sphere,
    description: row.description,
    note: row.note,
    counterparty: row.counterparty,
    amountMode: row.amountMode,
    amount: row.amount,
    variableAmount: row.variableAmount,
    vatRate: row.vatRate,
    paymentAccountId: row.paymentAccountId,
    budgetId: row.budgetId,
    earmarkId: row.earmarkId,
    budgets: row.budgets.length ? row.budgets : (row.budgetId ? [{ budgetId: row.budgetId, amount: row.amount }] : []),
    earmarks: row.earmarks.length ? row.earmarks : (row.earmarkId ? [{ earmarkId: row.earmarkId, amount: row.amount }] : []),
    tags: row.tags,
    frequency: row.frequency,
    startDate: row.startDate,
    nextDueDate: row.nextDueDate,
    endDate: row.endDate,
    status: row.status
  }
}

function RecurringBookingModal({
  value,
  paymentAccounts,
  budgets,
  earmarks,
  tagNames,
  onClose,
  onSaved,
  notify
}: {
  value: Draft
  paymentAccounts: PaymentAccount[]
  budgets: Lookup[]
  earmarks: Lookup[]
  tagNames: string[]
  onClose: () => void
  onSaved: () => void
  notify: (type: 'success' | 'error' | 'info', text: string, ms?: number) => void
}) {
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const tagDefs = useMemo(() => tagNames.map((name, index) => ({ id: index + 1, name })), [tagNames])
  const grossAmount = draft.amountMode === 'NET'
    ? Math.round(draft.amount * (1 + draft.vatRate / 100) * 100) / 100
    : draft.amount
  const budgetIds = draft.budgets.map((assignment) => assignment.budgetId).filter(Boolean)
  const earmarkIds = draft.earmarks.map((assignment) => assignment.earmarkId).filter(Boolean)
  const hasDuplicateBudgets = new Set(budgetIds).size !== budgetIds.length
  const hasDuplicateEarmarks = new Set(earmarkIds).size !== earmarkIds.length
  const budgetTotal = draft.budgets.reduce((total, assignment) => total + Number(assignment.amount || 0), 0)
  const earmarkTotal = draft.earmarks.reduce((total, assignment) => total + Number(assignment.amount || 0), 0)
  const addBudget = () => setDraft((current) => ({ ...current, budgets: [...current.budgets, { budgetId: 0, amount: Math.max(0, Math.round((grossAmount - budgetTotal) * 100) / 100) }] }))
  const addEarmark = () => setDraft((current) => ({ ...current, earmarks: [...current.earmarks, { earmarkId: 0, amount: Math.max(0, Math.round((grossAmount - earmarkTotal) * 100) / 100) }] }))

  const save = async () => {
    if (!draft.name.trim()) {
      notify('error', 'Bitte eine Bezeichnung angeben.')
      return
    }
    if (!(draft.amount > 0)) {
      notify('error', 'Bitte einen Betrag größer als 0 € angeben.')
      return
    }
    if (draft.budgets.some((assignment) => !assignment.budgetId || !(assignment.amount > 0)) || draft.earmarks.some((assignment) => !assignment.earmarkId || !(assignment.amount > 0))) {
      notify('error', 'Bitte alle Zuordnungen vollständig ausfüllen oder entfernen.')
      return
    }
    if (hasDuplicateBudgets || hasDuplicateEarmarks) {
      notify('error', 'Jedes Budget und jede Zweckbindung kann nur einmal zugeordnet werden.')
      return
    }
    if (budgetTotal > grossAmount + 0.001 || earmarkTotal > grossAmount + 0.001) {
      notify('error', 'Die Zuordnungssumme darf den Bruttobetrag nicht überschreiten.')
      return
    }
    setSaving(true)
    try {
      await window.api.recurringBookings.upsert({
        ...draft,
        name: draft.name.trim(),
        description: draft.description?.trim() || null,
        note: draft.note?.trim() || null,
        counterparty: draft.counterparty?.trim() || null,
        budgetId: draft.budgets[0]?.budgetId || null,
        earmarkId: draft.earmarks[0]?.earmarkId || null,
        budgets: draft.budgets,
        earmarks: draft.earmarks,
        tags: draft.tags
      })
      notify('success', draft.id ? 'Dauerbuchung aktualisiert' : 'Dauerbuchung angelegt')
      onSaved()
    } catch (error: any) {
      notify('error', String(error?.message || error))
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  return createPortal(
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="recurring-booking-modal-title">
      <div className={`modal booking-modal quick-add-modal recurring-booking-modal booking-modal--type-${draft.type.toLowerCase()}`} onClick={(event) => event.stopPropagation()}>
        <header className="modal-header-flex">
          <h2 id="recurring-booking-modal-title">{draft.id ? 'Dauerbuchung bearbeiten' : '+ Dauerbuchung'}</h2>
          <div className="booking-kind-switch recurring-booking-kind-switch" role="group" aria-label="Art der Dauerbuchung">
            {([['IN', 'Einnahme'], ['OUT', 'Ausgabe']] as const).map(([type, label]) => (
              <button key={type} type="button" className={`btn booking-kind-switch__button ${draft.type === type ? 'btn-toggle-active' : ''} ${type === 'IN' ? 'btn-type-in' : 'btn-type-out'}`} onClick={() => setDraft({ ...draft, type })} aria-pressed={draft.type === type}>{label}</button>
            ))}
          </div>
          <div className="booking-modal-header-actions">
            <button className="btn ghost booking-modal-icon-btn booking-modal-close-btn" type="button" onClick={onClose} title="Schließen (Esc)" aria-label="Schließen">✕</button>
          </div>
        </header>

        <form className="quick-add-form recurring-booking-form" onSubmit={(event) => { event.preventDefault(); void save() }}>
          <div className="card summary-card booking-ai-summary recurring-booking-summary">
            <div className="summary-text-bold">
              {draft.type === 'IN' ? 'Einnahme' : 'Ausgabe'} · <span className={draft.type === 'IN' ? 'text-success' : 'text-danger'}>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(draft.amount || 0)}</span> · {paymentAccounts.find((account) => account.id === draft.paymentAccountId)?.name || 'Konto fehlt'} · {SPHERE_LABELS[draft.sphere]}
            </div>
            <span className="helper">Vorlage für regelmäßig fällige Buchungen</span>
          </div>

          <div className="block-grid block-grid-mb booking-primary-grid">
            <section className="card form-card booking-section booking-section--basis">
              <div className="booking-section-heading"><strong>Basis</strong></div>
              <div className="row booking-basis-fields">
                <div className="field booking-floating-field booking-floating-field--filled">
                  <label htmlFor="recurring-start-date">Beginn *</label>
                  <input id="recurring-start-date" className="input" type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value, nextDueDate: draft.id ? draft.nextDueDate : event.target.value })} />
                </div>
                <div className="field booking-floating-field booking-floating-field--filled">
                  <label htmlFor="recurring-sphere">Bereich *</label>
                  <SelectDropdown id="recurring-sphere" value={draft.sphere} onChange={(value) => setDraft({ ...draft, sphere: value as Sphere })} ariaLabel="Bereich der Dauerbuchung" options={Object.entries(SPHERE_LABELS).map(([value, label]) => ({ value, label }))} />
                </div>
                <div className="field booking-floating-field booking-floating-field--filled">
                  <label htmlFor="recurring-account">Konto</label>
                  <SelectDropdown id="recurring-account" value={String(draft.paymentAccountId ?? '')} placeholder="Konto wählen" onChange={(value) => setDraft({ ...draft, paymentAccountId: value ? Number(value) : null })} ariaLabel="Konto der Dauerbuchung" options={paymentAccounts.filter((account) => account.isActive !== false).map((account) => ({ value: String(account.id), label: account.name }))} />
                </div>
              </div>
            </section>

            <section className="card form-card booking-section booking-section--finances">
              <div className="booking-section-heading"><strong>Finanzen</strong></div>
              <div className={`recurring-finance-row${draft.amountMode === 'NET' ? ' recurring-finance-row--net' : ''}`}>
                <SelectDropdown value={draft.amountMode} onChange={(value) => setDraft({ ...draft, amountMode: value as 'NET' | 'GROSS', vatRate: value === 'GROSS' ? 0 : draft.vatRate || 19 })} ariaLabel="Brutto oder Netto" options={[{ value: 'GROSS', label: 'Brutto' }, { value: 'NET', label: 'Netto' }]} />
                <div className="booking-floating-control booking-floating-control--filled finance-amount-highlight"><label htmlFor="recurring-amount">{draft.amountMode === 'NET' ? 'Netto' : 'Brutto'} *</label><span className="adorn-wrap"><input id="recurring-amount" className="input" type="number" min="0.01" step="0.01" value={draft.amount || ''} onChange={(event) => setDraft({ ...draft, amount: Number(event.target.value || 0) })} /><span className="adorn-suffix">€</span></span></div>
                {draft.amountMode === 'NET' && <SelectDropdown value={String(draft.vatRate)} onChange={(value) => setDraft({ ...draft, vatRate: Number(value) })} ariaLabel="Umsatzsteuer" options={[{ value: '0', label: '0% (steuerfrei)' }, { value: '7', label: '7% USt.' }, { value: '19', label: '19% USt.' }]} />}
              </div>
              <div className="field booking-floating-field booking-floating-field--filled booking-finance-party">
                <label htmlFor="recurring-counterparty">{draft.type === 'IN' ? 'Kunde / Zahlungspflichtiger' : 'Lieferant / Zahlungsempfänger'}</label>
                <PartySelector valueName={draft.counterparty || ''} role={draft.type === 'IN' ? 'CUSTOMER' : 'SUPPLIER'} inputId="recurring-counterparty" ariaLabel={draft.type === 'IN' ? 'Kunde oder Zahlungspflichtiger' : 'Lieferant oder Zahlungsempfänger'} onChange={({ name }) => setDraft({ ...draft, counterparty: name })} />
              </div>
            </section>
          </div>

          <section className="card form-card booking-description-card">
            <div className={`field booking-floating-field${draft.name ? ' booking-floating-field--filled' : ''}`}>
              <label htmlFor="recurring-name">Bezeichnung *</label>
              <input id="recurring-name" className="input" autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="z. B. Vereinssoftware" />
            </div>
            <div className={`field booking-floating-field recurring-description-field${draft.description ? ' booking-floating-field--filled' : ''}`}>
              <label htmlFor="recurring-description">Beschreibung</label>
              <input id="recurring-description" className="input" value={draft.description || ''} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Was wird regelmäßig gebucht?" />
            </div>
          </section>

          <section className="card form-card booking-assignments-card">
            <div className="booking-section-heading"><div><strong>Zuordnungen</strong><span className="helper">Optional für Einnahmen und Ausgaben.</span></div></div>
            <div className="recurring-assignment-group">
              <div className="quick-add-assignment-title">Budget <button type="button" className="btn ghost" onClick={addBudget} title="Weiteres Budget hinzufügen">+</button>{draft.budgets.length === 0 && <span className="helper booking-assignment-empty-hint">Kein Budget zugeordnet.</span>}</div>
              {draft.budgets.map((assignment, index) => (
                <div className="recurring-assignment-row" key={`budget-${index}`}>
                  <SelectDropdown value={assignment.budgetId ? String(assignment.budgetId) : ''} invalid={!!assignment.budgetId && budgetIds.filter((id) => id === assignment.budgetId).length > 1} placeholder="— Budget wählen —" onChange={(value) => setDraft((current) => ({ ...current, budgets: current.budgets.map((item, itemIndex) => itemIndex === index ? { ...item, budgetId: value ? Number(value) : 0 } : item) }))} ariaLabel={`Budget ${index + 1}`} options={budgets.filter((budget) => !budget.isArchived || budget.id === assignment.budgetId).map((budget) => ({ value: String(budget.id), label: budget.label }))} />
                  <span className="adorn-wrap"><input className="input" type="number" min="0.01" step="0.01" value={assignment.amount || ''} onChange={(event) => setDraft((current) => ({ ...current, budgets: current.budgets.map((item, itemIndex) => itemIndex === index ? { ...item, amount: Number(event.target.value || 0) } : item) }))} aria-label={`Betrag für Budget ${index + 1}`} /><span className="adorn-suffix">€</span></span>
                  <button type="button" className="btn ghost recurring-assignment-remove" onClick={() => setDraft((current) => ({ ...current, budgets: current.budgets.filter((_, itemIndex) => itemIndex !== index) }))} aria-label={`Budget ${index + 1} entfernen`}>×</button>
                </div>
              ))}
              {hasDuplicateBudgets && <span className="recurring-assignment-error">Ein Budget kann nur einmal zugeordnet werden.</span>}
              {budgetTotal > grossAmount + 0.001 && <span className="recurring-assignment-error">Budgetsumme übersteigt den Bruttobetrag.</span>}
            </div>
            <div className="recurring-assignment-group">
              <div className="quick-add-assignment-title">Zweckbindung <button type="button" className="btn ghost" onClick={addEarmark} title="Weitere Zweckbindung hinzufügen">+</button>{draft.earmarks.length === 0 && <span className="helper booking-assignment-empty-hint">Keine Zweckbindung zugeordnet.</span>}</div>
              {draft.earmarks.map((assignment, index) => (
                <div className="recurring-assignment-row" key={`earmark-${index}`}>
                  <SelectDropdown value={assignment.earmarkId ? String(assignment.earmarkId) : ''} invalid={!!assignment.earmarkId && earmarkIds.filter((id) => id === assignment.earmarkId).length > 1} placeholder="— Zweckbindung wählen —" onChange={(value) => setDraft((current) => ({ ...current, earmarks: current.earmarks.map((item, itemIndex) => itemIndex === index ? { ...item, earmarkId: value ? Number(value) : 0 } : item) }))} ariaLabel={`Zweckbindung ${index + 1}`} options={earmarks.filter((earmark) => earmark.isActive !== false || earmark.id === assignment.earmarkId).map((earmark) => ({ value: String(earmark.id), label: earmark.label }))} />
                  <span className="adorn-wrap"><input className="input" type="number" min="0.01" step="0.01" value={assignment.amount || ''} onChange={(event) => setDraft((current) => ({ ...current, earmarks: current.earmarks.map((item, itemIndex) => itemIndex === index ? { ...item, amount: Number(event.target.value || 0) } : item) }))} aria-label={`Betrag für Zweckbindung ${index + 1}`} /><span className="adorn-suffix">€</span></span>
                  <button type="button" className="btn ghost recurring-assignment-remove" onClick={() => setDraft((current) => ({ ...current, earmarks: current.earmarks.filter((_, itemIndex) => itemIndex !== index) }))} aria-label={`Zweckbindung ${index + 1} entfernen`}>×</button>
                </div>
              ))}
              {hasDuplicateEarmarks && <span className="recurring-assignment-error">Eine Zweckbindung kann nur einmal zugeordnet werden.</span>}
              {earmarkTotal > grossAmount + 0.001 && <span className="recurring-assignment-error">Zweckbindungssumme übersteigt den Bruttobetrag.</span>}
            </div>
          </section>

          <div className="block-grid block-grid-mb booking-secondary-grid">
            <section className="card form-card recurring-schedule-card">
              <div className="booking-section-heading"><div><strong>Wiederholung</strong><span className="helper">Fälligkeiten werden zur Bestätigung bereitgestellt.</span></div></div>
              <div className="recurring-schedule-grid">
                <div className="field booking-floating-field booking-floating-field--filled"><label htmlFor="recurring-frequency">Rhythmus *</label><SelectDropdown id="recurring-frequency" value={draft.frequency} onChange={(value) => setDraft({ ...draft, frequency: value as RecurringFrequency })} ariaLabel="Rhythmus der Dauerbuchung" options={Object.entries(FREQUENCY_LABELS).map(([value, label]) => ({ value, label }))} /></div>
                <div className="field booking-floating-field booking-floating-field--filled"><label htmlFor="recurring-next-due">Nächste Fälligkeit *</label><input id="recurring-next-due" className="input" type="date" value={draft.nextDueDate} onChange={(event) => setDraft({ ...draft, nextDueDate: event.target.value })} /></div>
                <div className="field booking-floating-field booking-floating-field--filled recurring-end-date-field"><label htmlFor="recurring-end-date">Ende</label><input id="recurring-end-date" className="input" type="date" value={draft.endDate || ''} onChange={(event) => setDraft({ ...draft, endDate: event.target.value || null })} /></div>
                <button type="button" className={`recurring-variable-amount${draft.variableAmount ? ' is-active' : ''}`} onClick={() => setDraft({ ...draft, variableAmount: !draft.variableAmount })} aria-pressed={draft.variableAmount}><span aria-hidden="true">{draft.variableAmount ? '✓' : '+'}</span>Betrag bei Fälligkeit prüfen</button>
              </div>
            </section>

            <section className="card form-card booking-optional-card">
              <details className="booking-details">
                <summary><span className="booking-details__heading"><span>Tags</span>{draft.tags.length > 0 && <span className="badge booking-tag-count">{draft.tags.length}</span>}</span></summary>
                <TagsEditor label="Tags" className="booking-tags-editor" value={draft.tags} onChange={(tags) => setDraft({ ...draft, tags })} tagDefs={tagDefs} />
              </details>
              <details className="booking-details">
                <summary><span>Kommentar</span>{draft.note && <span className="booking-comment-preview" title={draft.note}>{draft.note}</span>}</summary>
                <div className="field field-full-width booking-note-field"><textarea className="input booking-note-textarea" rows={3} value={draft.note || ''} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="Interne Notiz oder Ablagehinweis …" /></div>
              </details>
            </section>
          </div>

          <footer className="modal-footer-actions">
            <div className="booking-footer-status helper">Ctrl+S = Speichern · Esc = Abbrechen</div>
            <div className="booking-modal-save-actions"><button type="button" className="btn" onClick={onClose}>Abbrechen</button><button type="submit" className="btn primary" disabled={saving}>{saving ? 'Speichert…' : 'Speichern'}</button></div>
          </footer>
        </form>
      </div>
    </div>,
    document.body
  )
}

export default function RecurringBookingsView({ notify }: { notify: (type: 'success' | 'error' | 'info', text: string, ms?: number) => void }) {
  const [rows, setRows] = useState<RecurringBooking[]>([])
  const [summary, setSummary] = useState({ due: 0, upcoming: 0, active: 0, paused: 0 })
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'ALL' | Status>('ALL')
  const [editing, setEditing] = useState<Draft | null>(null)
  const [booking, setBooking] = useState<RecurringBooking | null>(null)
  const [bookingDate, setBookingDate] = useState(localIsoDate())
  const [bookingAmount, setBookingAmount] = useState(0)
  const [actionBusy, setActionBusy] = useState(false)
  const [pendingAction, setPendingAction] = useState<PendingRecurringAction | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [linkingRecurringId, setLinkingRecurringId] = useState<number | null>(null)
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([])
  const [budgets, setBudgets] = useState<Lookup[]>([])
  const [earmarks, setEarmarks] = useState<Lookup[]>([])
  const [tagNames, setTagNames] = useState<string[]>([])
  const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])

  const load = async () => {
    setLoading(true)
    try {
      const [listResult, summaryResult, accountsResult, budgetsResult, earmarksResult, tagsResult] = await Promise.all([
        window.api.recurringBookings.list({ status: status === 'ALL' ? undefined : status, q: q.trim() || undefined }),
        window.api.recurringBookings.summary(),
        window.api.paymentAccounts.list(),
        window.api.budgets.list({ includeArchived: true }),
        window.api.bindings.list({ activeOnly: false }),
        window.api.tags.list({ includeUsage: false })
      ])
      setRows(listResult.rows as RecurringBooking[])
      setSummary(summaryResult)
      setPaymentAccounts((accountsResult.rows || []).map((account: any) => ({ id: account.id, name: account.name, kind: account.kind, isActive: account.isActive !== 0 })))
      setBudgets((budgetsResult.rows || []).map((budget: any) => ({
        id: budget.id,
        label: budget.name?.trim() || budget.categoryName || budget.projectName || String(budget.year),
        isArchived: !!budget.isArchived
      })))
      setEarmarks((earmarksResult.rows || []).map((earmark: any) => ({ id: earmark.id, label: `${earmark.code} - ${earmark.name}`, isActive: earmark.isActive !== 0 })))
      setTagNames((tagsResult.rows || []).map((tag: any) => String(tag.name)))
    } catch (error: any) {
      notify('error', `Dauerbuchungen konnten nicht geladen werden: ${String(error?.message || error)}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180)
    return () => window.clearTimeout(timer)
  }, [q, status])

  useEffect(() => addDataChangedListener(['recurring-bookings', 'vouchers', 'bank-imports'], () => void load()), [q, status])

  const setRowStatus = async (row: RecurringBooking, nextStatus: Status) => {
    try {
      await window.api.recurringBookings.setStatus({ id: row.id, status: nextStatus })
      notify('success', nextStatus === 'ACTIVE' ? 'Dauerbuchung aktiviert' : nextStatus === 'PAUSED' ? 'Dauerbuchung pausiert' : 'Dauerbuchung beendet')
      await load()
    } catch (error: any) {
      notify('error', String(error?.message || error))
    }
  }

  const skipNext = async (row: RecurringBooking) => {
    try {
      await window.api.recurringBookings.skip({ recurringBookingId: row.id })
      notify('success', 'Fälligkeit übersprungen')
      await load()
    } catch (error: any) {
      notify('error', String(error?.message || error))
    }
  }

  const confirmPendingAction = async () => {
    if (!pendingAction) return
    setConfirmBusy(true)
    try {
      if (pendingAction.kind === 'skip') await skipNext(pendingAction.row)
      else await setRowStatus(pendingAction.row, pendingAction.kind === 'pause' ? 'PAUSED' : 'ENDED')
      setPendingAction(null)
    } finally {
      setConfirmBusy(false)
    }
  }

  const openBooking = (row: RecurringBooking) => {
    setBooking(row)
    setBookingDate(row.earliestDueDate || localIsoDate())
    setBookingAmount(row.amount)
  }

  const confirmBooking = async () => {
    if (!booking || !(bookingAmount > 0)) return
    setActionBusy(true)
    try {
      const result = await window.api.recurringBookings.book({ recurringBookingId: booking.id, bookingDate, amount: bookingAmount })
      notify('success', `Buchung erstellt: ${result.voucherNo}`)
      setBooking(null)
      await load()
    } catch (error: any) {
      notify('error', String(error?.message || error))
    } finally {
      setActionBusy(false)
    }
  }

  const linkSuggestion = async (row: RecurringBooking) => {
    if (!row.suggestedVoucherId) return
    setLinkingRecurringId(row.id)
    try {
      const result = await window.api.recurringBookings.link({
        recurringBookingId: row.id,
        voucherId: row.suggestedVoucherId
      })
      notify(
        'success',
        row.suggestedBankTransactionId
          ? `Bankbeleg wurde über ${result.voucherNo} der Dauerbuchung zugeordnet.`
          : `Bestehende Buchung ${result.voucherNo} wurde der Dauerbuchung zugeordnet.`
      )
      dispatchDataChanged(['recurring-bookings', 'vouchers', 'bank-imports'])
      await load()
    } catch (error: any) {
      notify('error', String(error?.message || error))
    } finally {
      setLinkingRecurringId(null)
    }
  }

  return (
    <div className="card recurring-bookings-view">
      <div className="recurring-page-header">
        <h1>Dauerbuchungen</h1>
        <div className="recurring-page-tools">
          <div className="recurring-search-wrap">
            <input className="input" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Dauerbuchungen durchsuchen…" aria-label="Dauerbuchungen durchsuchen" />
            {q && <button className="btn ghost recurring-search-clear" type="button" onClick={() => setQ('')} aria-label="Suche leeren">×</button>}
          </div>
          <RecurringStatusFilterDropdown value={status} onChange={setStatus} />
          <div className="filter-divider" />
          <button className="btn primary" onClick={() => setEditing(initialDraft())}>+ Dauerbuchung</button>
        </div>
      </div>

      <div className="helper recurring-page-summary">Fällige Dauerbuchungen: <strong>{summary.due}</strong><span className="summary-remaining">({summary.active} aktiv, {summary.paused} pausiert)</span></div>

      <div className="recurring-summary-grid">
        <div className={`card recurring-summary-card ${summary.due > 0 ? 'is-due' : ''}`}><span>Fällig</span><strong>{summary.due}</strong></div>
        <div className="card recurring-summary-card"><span>Demnächst (30 Tage)</span><strong>{summary.upcoming}</strong></div>
        <div className="card recurring-summary-card"><span>Aktiv</span><strong>{summary.active}</strong></div>
        <div className="card recurring-summary-card"><span>Pausiert</span><strong>{summary.paused}</strong></div>
      </div>

      <div className="recurring-table-card">

        <div className="recurring-table-scroll">
          <table className="recurring-table">
            <thead><tr><th>Bezeichnung</th><th>Rhythmus</th><th>Nächste Fälligkeit</th><th>Betrag</th><th>Konto</th><th>Status</th><th>Aktionen</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={row.dueCount > 0 ? 'recurring-row-due' : undefined}>
                  <td>
                    <strong>{row.name}</strong>
                    <small>{[row.counterparty, row.budgetLabel, row.earmarkLabel].filter(Boolean).join(' · ') || row.description || '—'}</small>
                  </td>
                  <td>{FREQUENCY_LABELS[row.frequency]}</td>
                  <td>
                    <span>{fmtDate(row.earliestDueDate || row.nextDueDate)}</span>
                    {row.dueCount > 0 && <span className="recurring-due-label">{row.dueCount} fällig</span>}
                    {row.suggestedVoucherId && (
                      <span className="recurring-match-hint" title={`${row.suggestedVoucherNo || 'Buchung'} vom ${fmtDate(row.suggestedVoucherDate)} · ${Math.round(row.suggestedMatchScore || 0)} % Übereinstimmung`}>
                        {row.suggestedBankTransactionId ? 'Bankbeleg gefunden' : 'Buchung gefunden'}
                      </span>
                    )}
                  </td>
                  <td className={row.type === 'IN' ? 'text-success' : 'text-danger'}>{eurFmt.format(row.amount)}</td>
                  <td>{row.paymentAccountName || '—'}</td>
                  <td><span className={`recurring-status recurring-status--${row.status.toLowerCase()}`}>{row.status === 'ACTIVE' ? 'Aktiv' : row.status === 'PAUSED' ? 'Pausiert' : 'Beendet'}</span></td>
                  <td>
                    <div className="recurring-actions">
                      {row.dueCount > 0 && row.suggestedVoucherId && (
                        <button
                          className="btn primary"
                          disabled={linkingRecurringId === row.id}
                          onClick={() => void linkSuggestion(row)}
                          title={`${row.suggestedVoucherNo || 'Buchung'} vom ${fmtDate(row.suggestedVoucherDate)} zuordnen`}
                        >
                          {linkingRecurringId === row.id ? 'Ordnet zu…' : 'Zuordnen'}
                        </button>
                      )}
                      {row.dueCount > 0 && (
                        <button
                          className={row.suggestedVoucherId ? 'btn' : 'btn primary'}
                          onClick={() => openBooking(row)}
                          title={row.suggestedVoucherId ? 'Den gefundenen Treffer ignorieren und eine neue Buchung erstellen' : undefined}
                        >
                          {row.suggestedVoucherId ? 'Trotzdem neu' : 'Jetzt buchen'}
                        </button>
                      )}
                      <button className="btn ghost recurring-action-icon" onClick={() => setEditing(draftFromRow(row))} title="Bearbeiten" aria-label={`${row.name} bearbeiten`}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg></button>
                      {row.dueCount > 0 && <button className="btn ghost recurring-action-icon" onClick={() => setPendingAction({ row, kind: 'skip' })} title="Fälligkeit überspringen" aria-label={`Fälligkeit von ${row.name} überspringen`}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M8 2v4M16 2v4M3 10h18M9 15l6 0M12 12l3 3-3 3" /></svg></button>}
                      {row.status === 'ACTIVE' && <button className="btn ghost recurring-action-icon" onClick={() => setPendingAction({ row, kind: 'pause' })} title="Dauerbuchung pausieren" aria-label={`${row.name} pausieren`}><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg></button>}
                      {row.status === 'PAUSED' && <button className="btn" onClick={() => void setRowStatus(row, 'ACTIVE')}>Aktivieren</button>}
                      {row.status !== 'ENDED' && <button className="btn danger" onClick={() => setPendingAction({ row, kind: 'end' })}>Beenden</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && <tr><td colSpan={7} className="recurring-empty">Keine Dauerbuchungen gefunden.</td></tr>}
              {loading && rows.length === 0 && <tr><td colSpan={7} className="recurring-empty">Dauerbuchungen werden geladen…</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {editing && <RecurringBookingModal value={editing} paymentAccounts={paymentAccounts} budgets={budgets} earmarks={earmarks} tagNames={tagNames} notify={notify} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load() }} />}

      {pendingAction && createPortal(
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="recurring-confirm-title">
          <div className="modal recurring-confirm-modal">
            <div className="recurring-modal-header">
              <div><h2 id="recurring-confirm-title">{pendingAction.kind === 'skip' ? 'Fälligkeit überspringen?' : pendingAction.kind === 'pause' ? 'Dauerbuchung pausieren?' : 'Dauerbuchung beenden?'}</h2><div className="helper">{pendingAction.row.name}</div></div>
              <button className="btn ghost" onClick={() => setPendingAction(null)} aria-label="Schließen">✕</button>
            </div>
            <p className="recurring-confirm-message">{pendingAction.kind === 'skip' ? 'Die nächste fällige Buchung wird übersprungen. Die Dauerbuchung bleibt danach aktiv.' : pendingAction.kind === 'pause' ? 'Es werden keine weiteren Fälligkeiten erzeugt, bis du die Dauerbuchung wieder aktivierst.' : 'Offene Fälligkeiten werden verworfen. Die Dauerbuchung kann anschließend nicht mehr fortgesetzt werden.'}</p>
            <div className="modal-footer"><div className="helper">Diese Aktion kann später nicht automatisch rückgängig gemacht werden.</div><div className="recurring-modal-actions"><button className="btn" onClick={() => setPendingAction(null)} disabled={confirmBusy}>Abbrechen</button><button className={pendingAction.kind === 'end' ? 'btn danger' : 'btn primary'} onClick={() => void confirmPendingAction()} disabled={confirmBusy}>{confirmBusy ? 'Wird ausgeführt…' : pendingAction.kind === 'skip' ? 'Überspringen' : pendingAction.kind === 'pause' ? 'Pausieren' : 'Beenden'}</button></div></div>
          </div>
        </div>, document.body
      )}

      {booking && createPortal(
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="recurring-book-title">
          <div className="modal recurring-book-modal">
            <div className="recurring-modal-header">
              <div><h2 id="recurring-book-title">Dauerbuchung buchen</h2><div className="helper">{booking.name} · fällig am {fmtDate(booking.earliestDueDate)}</div></div>
              <button className="btn ghost" onClick={() => setBooking(null)} aria-label="Schließen">✕</button>
            </div>
            <div className="recurring-book-summary">
              <label className="field"><span>Buchungsdatum</span><input className="input" type="date" value={bookingDate} onChange={(event) => setBookingDate(event.target.value)} /></label>
              <label className="field"><span>{booking.amountMode === 'NET' ? 'Nettobetrag' : 'Bruttobetrag'} (€)</span><input className="input" type="number" min="0.01" step="0.01" value={bookingAmount} onChange={(event) => setBookingAmount(Number(event.target.value || 0))} /></label>
              <div className="card recurring-book-preview"><span>{booking.type === 'IN' ? 'Einnahme' : 'Ausgabe'} · {SPHERE_LABELS[booking.sphere]}</span><strong>{eurFmt.format(bookingAmount || 0)}</strong></div>
            </div>
            <div className="modal-footer"><div className="helper">{booking.suggestedVoucherId ? `Hinweis: ${booking.suggestedVoucherNo || 'Eine bestehende Buchung'} wurde als möglicher Treffer erkannt. Eine neue Buchung kann eine Doppelung erzeugen.` : 'Es entsteht eine normale, nachvollziehbare Buchung.'}</div><div className="recurring-modal-actions"><button className="btn" onClick={() => setBooking(null)}>Abbrechen</button><button className="btn primary" onClick={() => void confirmBooking()} disabled={actionBusy || !bookingDate || !(bookingAmount > 0)}>{actionBusy ? 'Bucht…' : booking.suggestedVoucherId ? 'Trotzdem erstellen' : 'Buchung erstellen'}</button></div></div>
          </div>
        </div>, document.body
      )}
    </div>
  )
}
