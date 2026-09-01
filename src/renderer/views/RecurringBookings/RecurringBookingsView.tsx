import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  IconCalendarCheck,
  IconCalendarPlus,
  IconCalendarX,
  IconCircleX,
  IconFilter,
  IconLink,
  IconPencil,
  IconPlayerPause,
  IconPlayerPlay,
  IconReceipt2,
  IconX
} from '@tabler/icons-react'
import AppIcon from '../../components/common/AppIcon'
import TagsEditor from '../../components/TagsEditor'
import PartySelector from '../../components/common/PartySelector'
import SelectDropdown from '../../components/common/SelectDropdown'
import DatePickerButton from '../../components/common/DatePickerButton'
import FilterDropdown from '../../components/dropdowns/FilterDropdown'
import BookingPopupFrame from '../../components/modals/BookingPopupFrame'
import BookingOptionalArea from '../../components/booking/BookingOptionalArea'
import BookingKindSwitch from '../../components/booking/BookingKindSwitch'
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
  primaryClassificationValueId: number | null
  primaryClassificationName: string | null
  primaryClassificationColor: string | null
  primaryClassificationIcon: string | null
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
type PrimaryClassification = { id: number; name: string; color: string | null; icon: string | null; isActive: boolean }

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
      trigger={<AppIcon icon={IconFilter} size="control" />}
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
    primaryClassificationValueId: null,
    primaryClassificationName: null,
    primaryClassificationColor: null,
    primaryClassificationIcon: null,
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
    primaryClassificationValueId: row.primaryClassificationValueId,
    primaryClassificationName: row.primaryClassificationName,
    primaryClassificationColor: row.primaryClassificationColor,
    primaryClassificationIcon: row.primaryClassificationIcon,
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
  anchorRect,
  onClose,
  onSaved,
  notify
}: {
  value: Draft
  paymentAccounts: PaymentAccount[]
  budgets: Lookup[]
  earmarks: Lookup[]
  tagNames: string[]
  anchorRect?: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom' | 'width' | 'height'> | null
  onClose: () => void
  onSaved: () => void
  notify: (type: 'success' | 'error' | 'info', text: string, ms?: number) => void
}) {
  const [draft, setDraft] = useState(value)
  const startDateInputRef = useRef<HTMLInputElement | null>(null)
  const nextDueDateInputRef = useRef<HTMLInputElement | null>(null)
  const endDateInputRef = useRef<HTMLInputElement | null>(null)
  const [saving, setSaving] = useState(false)
  const [visibleExtras, setVisibleExtras] = useState<Set<'budget' | 'earmark' | 'tags' | 'comment'>>(() => new Set([
    ...(value.budgets.length ? ['budget' as const] : []),
    ...(value.earmarks.length ? ['earmark' as const] : []),
    ...(value.tags.length ? ['tags' as const] : []),
    ...(value.note ? ['comment' as const] : [])
  ]))
  const [isGeneralProfile, setIsGeneralProfile] = useState(false)
  const [categories, setCategories] = useState<PrimaryClassification[]>([])
  useEffect(() => {
    let active = true
    window.api.classifications.primary.list().then((result) => {
      if (!active) return
      setIsGeneralProfile(result.profile === 'GENERAL')
      setCategories(result.values)
    }).catch(() => { if (active) setIsGeneralProfile(false) })
    return () => { active = false }
  }, [])
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
  const toggleExtra = (key: 'budget' | 'earmark' | 'tags' | 'comment') => {
    const opening = !visibleExtras.has(key)
    if (opening && key === 'budget' && draft.budgets.length === 0) addBudget()
    if (opening && key === 'earmark' && draft.earmarks.length === 0) addEarmark()
    if (!opening && key === 'budget') setDraft((current) => ({ ...current, budgets: [] }))
    if (!opening && key === 'earmark') setDraft((current) => ({ ...current, earmarks: [] }))
    if (!opening && key === 'tags') setDraft((current) => ({ ...current, tags: [] }))
    if (!opening && key === 'comment') setDraft((current) => ({ ...current, note: null }))
    setVisibleExtras((current) => {
      const next = new Set(current)
      if (opening) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const save = async () => {
    if (!draft.name.trim()) {
      notify('error', 'Bitte eine Bezeichnung angeben.')
      return
    }
    if (!(draft.amount > 0)) {
      notify('error', 'Bitte einen Betrag größer als 0 € angeben.')
      return
    }
    if (isGeneralProfile && !draft.primaryClassificationValueId) {
      notify('error', 'Bitte eine Kategorie auswählen.')
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

  return <BookingPopupFrame
    title={draft.id ? 'Dauerbuchung bearbeiten' : '+ Dauerbuchung'}
    titleId="recurring-booking-modal-title"
    subtitle="Vorlage für regelmäßig fällige Buchungen"
    onClose={onClose}
    className={`recurring-booking-modal booking-modal--type-${draft.type.toLowerCase()}`}
    variant="compact"
    anchorRect={anchorRect}
    anchorAlign="end"
    kindSwitch={<BookingKindSwitch value={draft.type} ariaLabel="Art der Dauerbuchung" options={[{ value: 'IN', label: 'Einnahme' }, { value: 'OUT', label: 'Ausgabe' }]} onChange={(value) => setDraft({ ...draft, type: value as Draft['type'] })} />}
  >

        <form className="quick-add-form recurring-booking-form" onSubmit={(event) => { event.preventDefault(); void save() }}>
          <div className="recurring-booking-form__scroll">
          <div className="block-grid block-grid-mb booking-primary-grid">
            <section className="card form-card booking-section booking-section--basis">
              <div className="booking-section-heading"><strong>Basis</strong></div>
              <div className="row booking-basis-fields">
                <div className="field booking-floating-field booking-floating-field--filled">
                  <label htmlFor="recurring-start-date">Beginn *</label>
                  <span className="booking-date-input-wrap"><input ref={startDateInputRef} id="recurring-start-date" className="input" type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value, nextDueDate: draft.id ? draft.nextDueDate : event.target.value })} /><DatePickerButton inputRef={startDateInputRef} ariaLabel="Kalender für Beginn öffnen" /></span>
                </div>
                <div className="field booking-floating-field booking-floating-field--filled">
                  <label htmlFor="recurring-sphere">{isGeneralProfile ? 'Kategorie' : 'Bereich'} *</label>
                  {isGeneralProfile ? <SelectDropdown id="recurring-sphere" value={String(draft.primaryClassificationValueId ?? '')} placeholder="Kategorie wählen" onChange={(value) => {
                    const category = categories.find((entry) => entry.id === Number(value))
                    setDraft({ ...draft, primaryClassificationValueId: value ? Number(value) : null, primaryClassificationName: category?.name || null, primaryClassificationColor: category?.color || null, primaryClassificationIcon: category?.icon || null })
                  }} ariaLabel="Kategorie der Dauerbuchung" options={categories.map((category) => ({ value: String(category.id), label: `${category.icon ? `${category.icon} ` : ''}${category.name}`, color: category.color || undefined }))} /> : <SelectDropdown id="recurring-sphere" value={draft.sphere} onChange={(value) => setDraft({ ...draft, sphere: value as Sphere })} ariaLabel="Bereich der Dauerbuchung" options={Object.entries(SPHERE_LABELS).map(([value, label]) => ({ value, label }))} />}
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

          <div className="block-grid block-grid-mb booking-secondary-grid">
            <section className="card form-card recurring-schedule-card">
              <div className="booking-section-heading"><div><strong>Wiederholung</strong><span className="helper">Fälligkeiten werden zur Bestätigung bereitgestellt.</span></div></div>
              <div className="recurring-schedule-grid">
                <div className="field booking-floating-field booking-floating-field--filled"><label htmlFor="recurring-frequency">Rhythmus *</label><SelectDropdown id="recurring-frequency" value={draft.frequency} onChange={(value) => setDraft({ ...draft, frequency: value as RecurringFrequency })} ariaLabel="Rhythmus der Dauerbuchung" options={Object.entries(FREQUENCY_LABELS).map(([value, label]) => ({ value, label }))} /></div>
                <div className="field booking-floating-field booking-floating-field--filled"><label htmlFor="recurring-next-due">Nächste Fälligkeit *</label><span className="booking-date-input-wrap"><input ref={nextDueDateInputRef} id="recurring-next-due" className="input" type="date" value={draft.nextDueDate} onChange={(event) => setDraft({ ...draft, nextDueDate: event.target.value })} /><DatePickerButton inputRef={nextDueDateInputRef} ariaLabel="Kalender für nächste Fälligkeit öffnen" /></span></div>
                <div className="field booking-floating-field booking-floating-field--filled recurring-end-date-field"><label htmlFor="recurring-end-date">Ende</label><span className="booking-date-input-wrap"><input ref={endDateInputRef} id="recurring-end-date" className="input" type="date" value={draft.endDate || ''} onChange={(event) => setDraft({ ...draft, endDate: event.target.value || null })} /><DatePickerButton inputRef={endDateInputRef} ariaLabel="Kalender für Ende öffnen" /></span></div>
                <button type="button" className={`recurring-variable-amount${draft.variableAmount ? ' is-active' : ''}`} onClick={() => setDraft({ ...draft, variableAmount: !draft.variableAmount })} aria-pressed={draft.variableAmount}><span aria-hidden="true">{draft.variableAmount ? '✓' : '+'}</span>Betrag bei Fälligkeit prüfen</button>
              </div>
            </section>
          </div>

          <BookingOptionalArea
            actions={[
              { key: 'budget', label: 'Budget', active: visibleExtras.has('budget'), count: draft.budgets.length },
              { key: 'earmark', label: 'Zweckbindung', active: visibleExtras.has('earmark'), count: draft.earmarks.length },
              { key: 'tags', label: 'Tag', active: visibleExtras.has('tags'), count: draft.tags.length },
              { key: 'comment', label: 'Kommentar', active: visibleExtras.has('comment') }
            ]}
            onToggle={(key) => toggleExtra(key as 'budget' | 'earmark' | 'tags' | 'comment')}
          >
            {visibleExtras.has('budget') && <div className="compact-booking-optional-section" aria-label="Budget-Zuordnungen">
              <div className="compact-booking-section-title"><strong>Budget</strong><button type="button" onClick={() => toggleExtra('budget')} aria-label="Budget entfernen">×</button></div>
              {draft.budgets.map((assignment, index) => <div className="compact-booking-assignment-row" key={`budget-${index}`}>
                <SelectDropdown value={assignment.budgetId ? String(assignment.budgetId) : ''} invalid={!!assignment.budgetId && budgetIds.filter((id) => id === assignment.budgetId).length > 1} placeholder="Budget wählen" onChange={(value) => setDraft((current) => ({ ...current, budgets: current.budgets.map((item, itemIndex) => itemIndex === index ? { ...item, budgetId: value ? Number(value) : 0 } : item) }))} ariaLabel={`Budget ${index + 1}`} options={budgets.filter((budget) => !budget.isArchived || budget.id === assignment.budgetId).map((budget) => ({ value: String(budget.id), label: budget.label }))} />
                <span className="adorn-wrap"><input className="input" type="number" min="0.01" step="0.01" value={assignment.amount || ''} onChange={(event) => setDraft((current) => ({ ...current, budgets: current.budgets.map((item, itemIndex) => itemIndex === index ? { ...item, amount: Number(event.target.value || 0) } : item) }))} aria-label={`Betrag für Budget ${index + 1}`} /><span className="adorn-suffix">€</span></span>
                <button type="button" className="compact-booking-remove-row" onClick={() => setDraft((current) => ({ ...current, budgets: current.budgets.filter((_, itemIndex) => itemIndex !== index) }))} aria-label={`Budget ${index + 1} entfernen`}>×</button>
              </div>)}
              <button type="button" className="compact-booking-add-row" onClick={addBudget}>+ Budgetzeile</button>
              {hasDuplicateBudgets && <small className="compact-booking-error">Ein Budget kann nur einmal zugeordnet werden.</small>}
              {budgetTotal > grossAmount + 0.001 && <small className="compact-booking-error">Budgetsumme übersteigt den Bruttobetrag.</small>}
            </div>}

            {visibleExtras.has('earmark') && <div className="compact-booking-optional-section" aria-label="Zweckbindungs-Zuordnungen">
              <div className="compact-booking-section-title"><strong>Zweckbindung</strong><button type="button" onClick={() => toggleExtra('earmark')} aria-label="Zweckbindung entfernen">×</button></div>
              {draft.earmarks.map((assignment, index) => <div className="compact-booking-assignment-row" key={`earmark-${index}`}>
                <SelectDropdown value={assignment.earmarkId ? String(assignment.earmarkId) : ''} invalid={!!assignment.earmarkId && earmarkIds.filter((id) => id === assignment.earmarkId).length > 1} placeholder="Zweckbindung wählen" onChange={(value) => setDraft((current) => ({ ...current, earmarks: current.earmarks.map((item, itemIndex) => itemIndex === index ? { ...item, earmarkId: value ? Number(value) : 0 } : item) }))} ariaLabel={`Zweckbindung ${index + 1}`} options={earmarks.filter((earmark) => earmark.isActive !== false || earmark.id === assignment.earmarkId).map((earmark) => ({ value: String(earmark.id), label: earmark.label }))} />
                <span className="adorn-wrap"><input className="input" type="number" min="0.01" step="0.01" value={assignment.amount || ''} onChange={(event) => setDraft((current) => ({ ...current, earmarks: current.earmarks.map((item, itemIndex) => itemIndex === index ? { ...item, amount: Number(event.target.value || 0) } : item) }))} aria-label={`Betrag für Zweckbindung ${index + 1}`} /><span className="adorn-suffix">€</span></span>
                <button type="button" className="compact-booking-remove-row" onClick={() => setDraft((current) => ({ ...current, earmarks: current.earmarks.filter((_, itemIndex) => itemIndex !== index) }))} aria-label={`Zweckbindung ${index + 1} entfernen`}>×</button>
              </div>)}
              <button type="button" className="compact-booking-add-row" onClick={addEarmark}>+ Zweckbindungszeile</button>
              {hasDuplicateEarmarks && <small className="compact-booking-error">Eine Zweckbindung kann nur einmal zugeordnet werden.</small>}
              {earmarkTotal > grossAmount + 0.001 && <small className="compact-booking-error">Zweckbindungssumme übersteigt den Bruttobetrag.</small>}
            </div>}

            {visibleExtras.has('tags') && <div className="compact-booking-optional-section">
              <div className="compact-booking-section-title"><strong>Tags</strong><button type="button" onClick={() => toggleExtra('tags')} aria-label="Tags entfernen">×</button></div>
              <TagsEditor value={draft.tags} onChange={(tags) => setDraft({ ...draft, tags })} tagDefs={tagDefs} />
            </div>}

            {visibleExtras.has('comment') && <div className="compact-booking-optional-section">
              <div className="compact-booking-section-title"><strong>Kommentar</strong><button type="button" onClick={() => toggleExtra('comment')} aria-label="Kommentar entfernen">×</button></div>
              <textarea className="input" rows={3} value={draft.note || ''} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="Interne Notiz oder Ablagehinweis …" />
            </div>}
          </BookingOptionalArea>
          </div>

          <footer className="modal-footer-actions">
            <div className="booking-footer-status helper">Ctrl+S = Speichern · Esc = Abbrechen</div>
            <div className="booking-modal-save-actions"><button type="button" className="btn" onClick={onClose}>Abbrechen</button><button type="submit" className="btn primary" disabled={saving}>{saving ? 'Speichert…' : 'Speichern'}</button></div>
          </footer>
        </form>
  </BookingPopupFrame>
}

export default function RecurringBookingsView({ notify }: { notify: (type: 'success' | 'error' | 'info', text: string, ms?: number) => void }) {
  const [rows, setRows] = useState<RecurringBooking[]>([])
  const [summary, setSummary] = useState({ due: 0, upcoming: 0, active: 0, paused: 0 })
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'ALL' | Status>('ALL')
  const [editing, setEditing] = useState<Draft | null>(null)
  const [editingAnchor, setEditingAnchor] = useState<Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom' | 'width' | 'height'> | null>(null)
  const [booking, setBooking] = useState<RecurringBooking | null>(null)
  const bookingDateInputRef = useRef<HTMLInputElement | null>(null)
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
    <div className="recurring-bookings-view">
      <div className="recurring-page-header">
        <h1>Dauerbuchungen</h1>
      </div>
      <div className="recurring-overview-row">
        <div className="recurring-summary-grid">
          <div className={`recurring-summary-card recurring-summary-card--due ${summary.due > 0 ? 'is-due' : ''}`}><span>Fällig</span><strong>{summary.due}</strong></div>
          <div className="recurring-summary-card recurring-summary-card--upcoming"><span>Demnächst</span><small>30 Tage</small><strong>{summary.upcoming}</strong></div>
          <div className="recurring-summary-card recurring-summary-card--active"><span>Aktiv</span><strong>{summary.active}</strong></div>
          <div className="recurring-summary-card recurring-summary-card--paused"><span>Pausiert</span><strong>{summary.paused}</strong></div>
        </div>
        <div className="recurring-page-tools">
          <div className="recurring-search-wrap">
            <input className="input" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Dauerbuchungen durchsuchen…" aria-label="Dauerbuchungen durchsuchen" />
            {q && <button className="btn ghost recurring-search-clear" type="button" onClick={() => setQ('')} aria-label="Suche leeren"><AppIcon icon={IconX} size="control" /></button>}
          </div>
          <RecurringStatusFilterDropdown value={status} onChange={setStatus} />
          <div className="filter-divider" />
          <button className="btn primary btn-with-icon" onClick={(event) => { setEditingAnchor(event.currentTarget.getBoundingClientRect()); setEditing(initialDraft()) }}><AppIcon icon={IconCalendarPlus} size="control" />Dauerbuchung</button>
        </div>
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
                    <small>{[row.counterparty, row.primaryClassificationName ? `${row.primaryClassificationIcon ? `${row.primaryClassificationIcon} ` : ''}${row.primaryClassificationName}` : SPHERE_LABELS[row.sphere], row.budgetLabel, row.earmarkLabel].filter(Boolean).join(' · ') || row.description || '—'}</small>
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
                          className="btn primary btn-with-icon"
                          disabled={linkingRecurringId === row.id}
                          onClick={() => void linkSuggestion(row)}
                          title={`${row.suggestedVoucherNo || 'Buchung'} vom ${fmtDate(row.suggestedVoucherDate)} zuordnen`}
                        >
                          {linkingRecurringId === row.id ? 'Ordnet zu…' : <><AppIcon icon={IconLink} size="inline" />Zuordnen</>}
                        </button>
                      )}
                      {row.dueCount > 0 && (
                        <button
                          className={row.suggestedVoucherId ? 'btn btn-with-icon' : 'btn primary btn-with-icon'}
                          onClick={() => openBooking(row)}
                          title={row.suggestedVoucherId ? 'Den gefundenen Treffer ignorieren und eine neue Buchung erstellen' : undefined}
                        >
                          {row.suggestedVoucherId ? <><AppIcon icon={IconReceipt2} size="inline" />Trotzdem neu</> : <><AppIcon icon={IconCalendarCheck} size="inline" />Jetzt buchen</>}
                        </button>
                      )}
                      <button className="btn ghost recurring-action-icon" onClick={(event) => { setEditingAnchor(event.currentTarget.getBoundingClientRect()); setEditing(draftFromRow(row)) }} title="Bearbeiten" aria-label={`${row.name} bearbeiten`}><AppIcon icon={IconPencil} size="control" /></button>
                      {row.dueCount > 0 && <button className="btn ghost recurring-action-icon" onClick={() => setPendingAction({ row, kind: 'skip' })} title="Fälligkeit überspringen" aria-label={`Fälligkeit von ${row.name} überspringen`}><AppIcon icon={IconCalendarX} size="control" /></button>}
                      {row.status === 'ACTIVE' && <button className="btn ghost recurring-action-icon" onClick={() => setPendingAction({ row, kind: 'pause' })} title="Dauerbuchung pausieren" aria-label={`${row.name} pausieren`}><AppIcon icon={IconPlayerPause} size="control" /></button>}
                      {row.status === 'PAUSED' && <button className="btn btn-with-icon" onClick={() => void setRowStatus(row, 'ACTIVE')}><AppIcon icon={IconPlayerPlay} size="inline" />Aktivieren</button>}
                      {row.status !== 'ENDED' && <button className="btn danger btn-with-icon" onClick={() => setPendingAction({ row, kind: 'end' })}><AppIcon icon={IconCircleX} size="inline" />Beenden</button>}
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

      {editing && <RecurringBookingModal value={editing} paymentAccounts={paymentAccounts} budgets={budgets} earmarks={earmarks} tagNames={tagNames} anchorRect={editingAnchor} notify={notify} onClose={() => { setEditing(null); setEditingAnchor(null) }} onSaved={() => { setEditing(null); setEditingAnchor(null); void load() }} />}

      {pendingAction && createPortal(
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="recurring-confirm-title">
          <div className="modal recurring-confirm-modal">
            <div className="recurring-modal-header">
              <div><h2 id="recurring-confirm-title">{pendingAction.kind === 'skip' ? 'Fälligkeit überspringen?' : pendingAction.kind === 'pause' ? 'Dauerbuchung pausieren?' : 'Dauerbuchung beenden?'}</h2><div className="helper">{pendingAction.row.name}</div></div>
              <button className="btn ghost" onClick={() => setPendingAction(null)} aria-label="Schließen"><AppIcon icon={IconX} size="control" /></button>
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
              <button className="btn ghost" onClick={() => setBooking(null)} aria-label="Schließen"><AppIcon icon={IconX} size="control" /></button>
            </div>
            <div className="recurring-book-summary">
              <label className="field"><span>Buchungsdatum</span><span className="booking-date-input-wrap"><input ref={bookingDateInputRef} className="input" type="date" value={bookingDate} onChange={(event) => setBookingDate(event.target.value)} /><DatePickerButton inputRef={bookingDateInputRef} ariaLabel="Kalender zur Auswahl des Buchungsdatums öffnen" /></span></label>
              <label className="field"><span>{booking.amountMode === 'NET' ? 'Nettobetrag' : 'Bruttobetrag'} (€)</span><input className="input" type="number" min="0.01" step="0.01" value={bookingAmount} onChange={(event) => setBookingAmount(Number(event.target.value || 0))} /></label>
              <div className="card recurring-book-preview"><span>{booking.type === 'IN' ? 'Einnahme' : 'Ausgabe'} · {booking.primaryClassificationName ? `${booking.primaryClassificationIcon ? `${booking.primaryClassificationIcon} ` : ''}${booking.primaryClassificationName}` : SPHERE_LABELS[booking.sphere]}</span><strong>{eurFmt.format(bookingAmount || 0)}</strong></div>
            </div>
            <div className="modal-footer"><div className="helper">{booking.suggestedVoucherId ? `Hinweis: ${booking.suggestedVoucherNo || 'Eine bestehende Buchung'} wurde als möglicher Treffer erkannt. Eine neue Buchung kann eine Doppelung erzeugen.` : 'Es entsteht eine nachvollziehbare Buchung.'}</div><div className="recurring-modal-actions"><button className="btn" onClick={() => setBooking(null)}>Abbrechen</button><button className="btn primary" onClick={() => void confirmBooking()} disabled={actionBusy || !bookingDate || !(bookingAmount > 0)}>{actionBusy ? 'Bucht…' : booking.suggestedVoucherId ? 'Trotzdem buchen' : 'Buchen'}</button></div></div>
          </div>
        </div>, document.body
      )}
    </div>
  )
}
