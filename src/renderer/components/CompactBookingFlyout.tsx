import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { QA } from '../hooks/useQuickAdd'
import { rememberBookingAIPattern } from '../utils/bookingAiPatterns'
import TagsEditor from './TagsEditor'
import DatePickerButton from './common/DatePickerButton'
import HoverTooltip from './common/HoverTooltip'
import { getInternalAssignmentValidationState } from './modals/voucherMetaValidation'

type OptionalSection = 'budget' | 'earmark' | 'tags' | 'comment' | 'attachments'
type BudgetAssignment = { budgetId: number; amount: number }
type EarmarkAssignment = { earmarkId: number; amount: number }

type BudgetOption = {
  id: number
  label: string
  year?: number
  startDate?: string | null
  endDate?: string | null
  enforceTimeRange?: number
  isArchived?: number
}

type EarmarkOption = {
  id: number
  code: string
  name: string
  startDate?: string | null
  endDate?: string | null
  enforceTimeRange?: number
  isActive?: number
}

type PaymentAccount = {
  id: number
  name: string
  kind: 'CASH' | 'BANK' | 'PAYPAL' | 'CARD' | 'OTHER'
  color?: string | null
  isActive: number
}

type Props = {
  qa: QA
  setQa: (qa: QA) => void
  onSave: () => void | Promise<void>
  onClose: () => void
  onExpand: () => void
  files: File[]
  setFiles: (files: File[]) => void
  onDropFiles: (files: FileList | null) => void
  openFilePicker: () => void
  fileInputRef: React.RefObject<HTMLInputElement>
  budgetsForEdit: BudgetOption[]
  earmarks: EarmarkOption[]
  paymentAccounts: PaymentAccount[]
  tagDefs: Array<{ id: number; name: string; color?: string | null }>
  descSuggest: string[]
  afterSaveDefault: 'close' | 'new'
  draftTabsEnabled: boolean
  draftTabs: Array<{ id: string; label: string; title: string }>
  activeDraftId: string | null
  onSelectDraft: (draftId: string) => void
  onNewDraft: () => void
}

function accountMethod(kind?: PaymentAccount['kind'] | null): 'BAR' | 'BANK' | undefined {
  if (!kind) return undefined
  return kind === 'CASH' ? 'BAR' : 'BANK'
}

function grossAmount(qa: QA) {
  if (qa.type === 'TRANSFER' || qa.type === 'INTERNAL' || qa.mode === 'GROSS') {
    return Number(qa.grossAmount || 0)
  }
  const net = Number(qa.netAmount || 0)
  return Math.round(net * (1 + Number(qa.vatRate || 0) / 100) * 100) / 100
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}

function fillEmptyAssignmentAmounts<T extends { amount: number }>(assignments: T[], nextGross: number): T[] {
  if (!Number.isFinite(nextGross) || nextGross <= 0) return assignments
  const assigned = assignments.reduce((sum, assignment) => {
    const amount = Number(assignment.amount)
    return Number.isFinite(amount) && amount > 0 ? sum + amount : sum
  }, 0)
  let remaining = Math.max(0, roundCurrency(nextGross - assigned))
  return assignments.map((assignment) => {
    const amount = Number(assignment.amount)
    if (Number.isFinite(amount) && amount > 0) return assignment
    const nextAmount = remaining
    remaining = 0
    return { ...assignment, amount: nextAmount }
  })
}

function inRange(date: string, start?: string | null, end?: string | null) {
  if (start && date < start) return false
  if (end && date > end) return false
  return true
}

function budgetRange(budget: BudgetOption) {
  if (!budget.enforceTimeRange) return { start: null, end: null }
  return {
    start: budget.startDate ?? (budget.year ? `${budget.year}-01-01` : null),
    end: budget.endDate ?? (budget.year ? `${budget.year}-12-31` : null)
  }
}

function initialSections(qa: QA, files: File[]) {
  const sections = new Set<OptionalSection>()
  if (qa.budgets?.length) sections.add('budget')
  if (qa.earmarksAssigned?.length) sections.add('earmark')
  if (qa.tags?.length) sections.add('tags')
  if (qa.note?.trim()) sections.add('comment')
  if (files.length) sections.add('attachments')
  if (qa.type === 'INTERNAL') {
    sections.add('budget')
    sections.add('earmark')
  }
  return sections
}

export default function CompactBookingFlyout({
  qa,
  setQa,
  onSave,
  onClose,
  onExpand,
  files,
  setFiles,
  onDropFiles,
  openFilePicker,
  fileInputRef,
  budgetsForEdit,
  earmarks,
  paymentAccounts,
  tagDefs,
  descSuggest,
  afterSaveDefault,
  draftTabsEnabled,
  draftTabs,
  activeDraftId,
  onSelectDraft,
  onNewDraft
}: Props) {
  const dateInputRef = useRef<HTMLInputElement | null>(null)
  const amountInputRef = useRef<HTMLInputElement | null>(null)
  const [visibleSections, setVisibleSections] = useState(() => initialSections(qa, files))

  const gross = grossAmount(qa)
  const budgets = (qa.budgets || []) as BudgetAssignment[]
  const assignedEarmarks = (qa.earmarksAssigned || []) as EarmarkAssignment[]
  const activeBudgets = useMemo(
    () => budgetsForEdit.filter((budget) => !budget.isArchived),
    [budgetsForEdit]
  )
  const activeEarmarks = useMemo(
    () => earmarks.filter((earmark) => earmark.isActive !== 0),
    [earmarks]
  )
  const activeAccounts = useMemo(
    () => paymentAccounts.filter((account) => account.isActive !== 0),
    [paymentAccounts]
  )
  const accountsById = useMemo(
    () => new Map(activeAccounts.map((account) => [account.id, account])),
    [activeAccounts]
  )
  const defaultCash = activeAccounts.find((account) => account.kind === 'CASH') ?? activeAccounts[0]
  const defaultBank = activeAccounts.find((account) => account.kind === 'BANK')
    ?? activeAccounts.find((account) => account.id !== defaultCash?.id)
    ?? activeAccounts[0]

  const invalidBudgetIds = new Set(
    budgets
      .filter((assignment) => assignment.budgetId)
      .filter((assignment) => {
        const budget = budgetsForEdit.find((item) => item.id === assignment.budgetId)
        if (!budget?.enforceTimeRange) return false
        const range = budgetRange(budget)
        return !inRange(qa.date, range.start, range.end)
      })
      .map((assignment) => assignment.budgetId)
  )
  const invalidEarmarkIds = new Set(
    assignedEarmarks
      .filter((assignment) => assignment.earmarkId)
      .filter((assignment) => {
        const earmark = earmarks.find((item) => item.id === assignment.earmarkId)
        return !!earmark?.enforceTimeRange && !inRange(qa.date, earmark.startDate, earmark.endDate)
      })
      .map((assignment) => assignment.earmarkId)
  )
  const internalValidation = getInternalAssignmentValidationState({
    budgets,
    earmarks: assignedEarmarks,
    isInternal: qa.type === 'INTERNAL',
    grossAmount: gross
  })
  const hasInvalidAmount = !Number.isFinite(gross) || gross <= 0
  const hasMissingAccount = qa.type === 'TRANSFER'
    ? !qa.transferFromAccountId || !qa.transferToAccountId
    : qa.type === 'INTERNAL'
      ? false
      : !qa.paymentAccountId
  const hasSameTransferAccount = qa.type === 'TRANSFER'
    && !!qa.transferFromAccountId
    && qa.transferFromAccountId === qa.transferToAccountId
  const chosenBudgetIds = budgets.filter((assignment) => assignment.budgetId).map((assignment) => assignment.budgetId)
  const chosenEarmarkIds = assignedEarmarks.filter((assignment) => assignment.earmarkId).map((assignment) => assignment.earmarkId)
  const hasDuplicateBudgets = new Set(chosenBudgetIds).size !== chosenBudgetIds.length
  const hasDuplicateEarmarks = new Set(chosenEarmarkIds).size !== chosenEarmarkIds.length
  const assignmentAmountIsInvalid = (amount: number) => {
    const numeric = Number(amount)
    return !Number.isFinite(numeric) || (qa.type === 'INTERNAL' ? numeric === 0 : numeric <= 0)
  }
  const hasIncompleteBudgets = budgets.some((assignment) => !assignment.budgetId || assignmentAmountIsInvalid(assignment.amount))
  const hasIncompleteEarmarks = assignedEarmarks.some((assignment) => !assignment.earmarkId || assignmentAmountIsInvalid(assignment.amount))
  const assignedBudgetTotal = budgets.reduce((sum, assignment) => {
    const amount = assignment.budgetId ? Number(assignment.amount) : 0
    return Number.isFinite(amount) && amount > 0 ? sum + amount : sum
  }, 0)
  const assignedEarmarkTotal = assignedEarmarks.reduce((sum, assignment) => {
    const amount = assignment.earmarkId ? Number(assignment.amount) : 0
    return Number.isFinite(amount) && amount > 0 ? sum + amount : sum
  }, 0)
  const hasBudgetOverAllocation = qa.type !== 'INTERNAL' && gross > 0 && assignedBudgetTotal > gross + 0.001
  const hasEarmarkOverAllocation = qa.type !== 'INTERNAL' && gross > 0 && assignedEarmarkTotal > gross + 0.001
  const hasOutOfRange = invalidBudgetIds.size > 0 || invalidEarmarkIds.size > 0
  const hasInvalidAssignments = hasIncompleteBudgets || hasIncompleteEarmarks
    || hasDuplicateBudgets || hasDuplicateEarmarks
    || hasBudgetOverAllocation || hasEarmarkOverAllocation
  const saveBlocked = !qa.date || hasInvalidAmount || hasMissingAccount || hasSameTransferAccount
    || hasInvalidAssignments || hasOutOfRange
    || (qa.type === 'INTERNAL' && !internalValidation.hasValidAssignments)
  const validationMessage = (() => {
    if (!qa.date) return 'Bitte ein Buchungsdatum wählen.'
    if (hasInvalidAmount) return 'Bitte einen Betrag größer als 0 € eingeben.'
    if (hasMissingAccount) return qa.type === 'TRANSFER' ? 'Bitte Quell- und Zielkonto wählen.' : 'Bitte ein Buchungskonto wählen.'
    if (hasSameTransferAccount) return 'Quell- und Zielkonto müssen verschieden sein.'
    if (hasIncompleteBudgets) return `Bitte jede Budgetzeile mit Budget und ${qa.type === 'INTERNAL' ? 'einem Betrag ungleich 0 €' : 'einem Betrag größer als 0 €'} vervollständigen.`
    if (hasIncompleteEarmarks) return `Bitte jede Zweckbindungszeile mit Zweckbindung und ${qa.type === 'INTERNAL' ? 'einem Betrag ungleich 0 €' : 'einem Betrag größer als 0 €'} vervollständigen.`
    if (hasDuplicateBudgets) return 'Ein Budget kann nur einmal zugeordnet werden.'
    if (hasDuplicateEarmarks) return 'Eine Zweckbindung kann nur einmal zugeordnet werden.'
    if (hasBudgetOverAllocation) return 'Die Budgetsumme darf den Buchungsbetrag nicht überschreiten.'
    if (hasEarmarkOverAllocation) return 'Die Zweckbindungssumme darf den Buchungsbetrag nicht überschreiten.'
    if (hasOutOfRange) return 'Eine Zuordnung ist für dieses Buchungsdatum nicht gültig.'
    if (qa.type === 'INTERNAL' && !internalValidation.hasValidAssignments) {
      return internalValidation.budgetHint || internalValidation.earmarkHint
    }
    return ''
  })()

  useEffect(() => {
    window.setTimeout(() => amountInputRef.current?.focus(), 0)
  }, [])

  useEffect(() => {
    if (qa.type !== 'INTERNAL') return
    setVisibleSections((current) => new Set([...current, 'budget', 'earmark']))
  }, [qa.type])

  const patchQa = (patch: Partial<QA>) => setQa({ ...qa, ...patch } as QA)

  const selectType = (type: QA['type']) => {
    const next = { ...qa, type } as QA
    if (type === 'TRANSFER') {
      next.mode = 'GROSS'
      next.vatRate = 0
      next.transferFromAccountId = next.transferFromAccountId ?? defaultCash?.id ?? null
      next.transferFromAccountName = accountsById.get(Number(next.transferFromAccountId || 0))?.name ?? defaultCash?.name ?? null
      next.transferFrom = accountMethod(accountsById.get(Number(next.transferFromAccountId || 0))?.kind ?? defaultCash?.kind)
      next.transferToAccountId = next.transferToAccountId ?? defaultBank?.id ?? null
      next.transferToAccountName = accountsById.get(Number(next.transferToAccountId || 0))?.name ?? defaultBank?.name ?? null
      next.transferTo = accountMethod(accountsById.get(Number(next.transferToAccountId || 0))?.kind ?? defaultBank?.kind)
      next.paymentAccountId = null
      next.paymentAccountName = null
    } else if (type === 'INTERNAL') {
      next.mode = 'GROSS'
      next.vatRate = 0
      next.paymentAccountId = null
      next.paymentAccountName = null
      next.paymentMethod = undefined
      next.transferFromAccountId = null
      next.transferToAccountId = null
    } else {
      next.transferFromAccountId = null
      next.transferToAccountId = null
      if (!next.paymentAccountId) {
        const fallback = next.paymentMethod === 'BANK' ? defaultBank : defaultCash ?? defaultBank
        next.paymentAccountId = fallback?.id ?? null
        next.paymentAccountName = fallback?.name ?? null
        next.paymentMethod = accountMethod(fallback?.kind)
      }
    }
    setQa(next)
  }

  const setSectionVisible = (section: OptionalSection) => {
    if (!visibleSections.has(section) && section === 'budget' && budgets.length === 0 && qa.type !== 'INTERNAL') {
      patchQa({ budgets: [{ budgetId: 0, amount: gross }] })
    }
    if (!visibleSections.has(section) && section === 'earmark' && assignedEarmarks.length === 0 && qa.type !== 'INTERNAL') {
      patchQa({ earmarksAssigned: [{ earmarkId: 0, amount: gross }] })
    }
    setVisibleSections((current) => {
      if (qa.type === 'INTERNAL' && (section === 'budget' || section === 'earmark')) return current
      const next = new Set(current)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })
  }

  const removeSection = (section: OptionalSection) => {
    if (section === 'budget') patchQa({ budgets: [] })
    if (section === 'earmark') patchQa({ earmarksAssigned: [] })
    if (section === 'tags') patchQa({ tags: [] })
    if (section === 'comment') patchQa({ note: '' })
    if (section === 'attachments') setFiles([])
    if (qa.type !== 'INTERNAL' || (section !== 'budget' && section !== 'earmark')) {
      setVisibleSections((current) => {
        const next = new Set(current)
        next.delete(section)
        return next
      })
    }
  }

  const nextInternalAssignmentAmount = () => {
    const amounts = [...budgets, ...assignedEarmarks]
      .filter((assignment) => ('budgetId' in assignment ? assignment.budgetId : assignment.earmarkId))
      .map((assignment) => Number(assignment.amount))
      .filter((amount) => Number.isFinite(amount) && amount !== 0)
    const sourceTotal = amounts.reduce((sum, amount) => amount < 0 ? sum + Math.abs(amount) : sum, 0)
    const targetTotal = amounts.reduce((sum, amount) => amount > 0 ? sum + amount : sum, 0)

    if (sourceTotal === 0) return -gross
    if (targetTotal === 0) return gross
    if (sourceTotal < gross - 0.001) return -roundCurrency(gross - sourceTotal)
    if (targetTotal < gross - 0.001) return roundCurrency(gross - targetTotal)
    return 0
  }

  const addBudget = () => {
    if (!activeBudgets.length) return
    if (qa.type === 'INTERNAL') {
      const amount = nextInternalAssignmentAmount()
      patchQa({ budgets: [...budgets, { budgetId: 0, amount }] })
      return
    }
    const amount = Math.max(0, roundCurrency(gross - assignedBudgetTotal))
    patchQa({ budgets: [...budgets, { budgetId: 0, amount }] })
  }

  const addEarmark = () => {
    if (!activeEarmarks.length) return
    const amount = qa.type === 'INTERNAL'
      ? nextInternalAssignmentAmount()
      : Math.max(0, roundCurrency(gross - assignedEarmarkTotal))
    patchQa({ earmarksAssigned: [...assignedEarmarks, { earmarkId: 0, amount }] })
  }

  const save = () => {
    if (saveBlocked) return
    rememberBookingAIPattern({
      description: qa.description || '',
      grossAmount: gross,
      tags: qa.tags || [],
      type: qa.type,
      sphere: qa.sphere,
      budgets,
      earmarks: assignedEarmarks,
      paymentAccountId: qa.type === 'IN' || qa.type === 'OUT' ? qa.paymentAccountId : null,
      transferFromAccountId: qa.type === 'TRANSFER' ? qa.transferFromAccountId : null,
      transferToAccountId: qa.type === 'TRANSFER' ? qa.transferToAccountId : null
    })
    void onSave()
  }

  const optionalButtons: Array<{ key: OptionalSection; label: string; count?: number; disabled?: boolean }> = [
    { key: 'budget', label: 'Budget', count: budgets.length, disabled: !activeBudgets.length },
    { key: 'earmark', label: 'Zweckbindung', count: assignedEarmarks.length, disabled: !activeEarmarks.length },
    { key: 'tags', label: 'Tag', count: qa.tags?.length },
    { key: 'comment', label: 'Kommentar', count: qa.note?.trim() ? 1 : 0 },
    { key: 'attachments', label: 'Anhang', count: files.length }
  ]

  return (
    <section className={`compact-booking-flyout compact-booking-flyout--${qa.type.toLowerCase()}`} role="dialog" aria-labelledby="compact-booking-title">
      <header className="compact-booking-flyout__header">
        <div>
          <strong id="compact-booking-title">Buchung erfassen</strong>
          <small>{draftTabsEnabled ? `Als aktiver Buchungsreiter geöffnet · ${draftTabs.length} offen` : 'Kompakte Erfassung'}</small>
        </div>
        {draftTabsEnabled && draftTabs.length > 0 && (
          <div className="compact-booking-flyout__tab-switcher">
            <select
              className="input"
              value={activeDraftId ?? ''}
              onChange={(event) => onSelectDraft(event.target.value)}
              aria-label="Buchungsreiter wechseln"
              title="Offenen Buchungsentwurf wechseln"
            >
              {draftTabs.map((draft) => <option key={draft.id} value={draft.id} title={draft.title}>{draft.label}</option>)}
            </select>
            <button type="button" className="btn ghost" onClick={onNewDraft} aria-label="Neuen Buchungsreiter öffnen" title="Neue Buchung als weiteren Reiter öffnen">+</button>
          </div>
        )}
        <div className="compact-booking-flyout__header-actions">
          <button type="button" className="btn ghost" onClick={onExpand} title="Vollständigen Dialog öffnen" aria-label="Vollständigen Buchungsdialog öffnen">↗</button>
          <button type="button" className="btn ghost" onClick={onClose} aria-label={draftTabsEnabled ? 'Buchungsflyout parken' : 'Buchungsflyout schließen'}>✕</button>
        </div>
      </header>

      <form className="compact-booking-flyout__form" onSubmit={(event) => { event.preventDefault(); save() }}>
        <input ref={fileInputRef} type="file" multiple hidden accept=".png,.jpg,.jpeg,.pdf,.doc,.docx" onChange={(event) => onDropFiles(event.target.files)} />
        <div className="compact-booking-flyout__body">
          <div className="compact-booking-kind" role="group" aria-label="Buchungsart wählen">
            {([['IN', 'Einnahme'], ['OUT', 'Ausgabe'], ['TRANSFER', 'Umbuchung'], ['INTERNAL', 'Intern']] as const).map(([type, label]) => (
              <button key={type} type="button" className={qa.type === type ? 'is-active' : ''} aria-pressed={qa.type === type} onClick={() => selectType(type)}>{label}</button>
            ))}
          </div>

          <div className="compact-booking-core-grid">
            <label className="compact-booking-field">
              <span>Datum *</span>
              <span className="booking-date-input-wrap">
                <input ref={dateInputRef} className="input" type="date" value={qa.date} onChange={(event) => patchQa({ date: event.target.value })} aria-label="Datum der Buchung" required />
                <DatePickerButton inputRef={dateInputRef} ariaLabel="Kalender zur Datumsauswahl öffnen" />
              </span>
            </label>

            {qa.type !== 'TRANSFER' && (
              <label className="compact-booking-field">
                <span className="booking-field-label-row">
                  <span>Bereich</span>
                  <HoverTooltip<HTMLButtonElement>
                    preferredPlacement="bottom"
                    className="tooltip-modal booking-sphere-tooltip"
                    content={(
                      <div className="booking-sphere-tooltip__content">
                        <strong>Steuerliche Bereiche</strong>
                        <div><b>Ideeller Bereich:</b> Satzungsarbeit ohne entgeltliche Marktleistung.</div>
                        <div><b>Zweckbetrieb:</b> Wirtschaftliche Tätigkeit, die unmittelbar dem Satzungszweck dient.</div>
                        <div><b>Vermögensverwaltung:</b> Erträge aus Vereinsvermögen, etwa Zinsen oder Vermietung.</div>
                        <div><b>Wirtschaftlicher Geschäftsbetrieb:</b> Entgeltliche Tätigkeiten außerhalb des Zweckbetriebs.</div>
                      </div>
                    )}
                  >
                    {({ ref, props }) => (
                      <button
                        ref={ref}
                        {...props}
                        type="button"
                        className="booking-inline-info"
                        aria-label="Erklärung zu den steuerlichen Bereichen"
                      >
                        i
                      </button>
                    )}
                  </HoverTooltip>
                </span>
                <select className="input" value={qa.sphere} onChange={(event) => patchQa({ sphere: event.target.value as QA['sphere'] })} aria-label="Sphäre der Buchung">
                  <option value="IDEELL">Ideeller Bereich</option>
                  <option value="ZWECK">Zweckbetrieb</option>
                  <option value="VERMOEGEN">Vermögensverwaltung</option>
                  <option value="WGB">Wirtschaftlicher Geschäftsbetrieb</option>
                </select>
              </label>
            )}

            {qa.type === 'TRANSFER' ? (
              <>
                <label className="compact-booking-field">
                  <span>Von Konto *</span>
                  <select className={`input${hasSameTransferAccount ? ' input-error' : ''}`} style={{ color: accountsById.get(Number(qa.transferFromAccountId || 0))?.color || undefined }} value={String(qa.transferFromAccountId ?? '')} onChange={(event) => {
                    const id = event.target.value ? Number(event.target.value) : null
                    const account = accountsById.get(Number(id || 0))
                    patchQa({ transferFromAccountId: id, transferFromAccountName: account?.name ?? null, transferFrom: accountMethod(account?.kind) })
                  }} aria-label="Transfer von Konto" aria-invalid={hasSameTransferAccount}>
                    <option value="">Konto wählen</option>
                    {activeAccounts.map((account) => <option key={account.id} value={account.id} disabled={account.id === qa.transferToAccountId} style={{ color: account.color || undefined }}>{account.name}</option>)}
                  </select>
                </label>
                <label className="compact-booking-field">
                  <span>Nach Konto *</span>
                  <select className={`input${hasSameTransferAccount ? ' input-error' : ''}`} style={{ color: accountsById.get(Number(qa.transferToAccountId || 0))?.color || undefined }} value={String(qa.transferToAccountId ?? '')} onChange={(event) => {
                    const id = event.target.value ? Number(event.target.value) : null
                    const account = accountsById.get(Number(id || 0))
                    patchQa({ transferToAccountId: id, transferToAccountName: account?.name ?? null, transferTo: accountMethod(account?.kind) })
                  }} aria-label="Transfer nach Konto" aria-invalid={hasSameTransferAccount}>
                    <option value="">Konto wählen</option>
                    {activeAccounts.map((account) => <option key={account.id} value={account.id} disabled={account.id === qa.transferFromAccountId} style={{ color: account.color || undefined }}>{account.name}</option>)}
                  </select>
                </label>
              </>
            ) : qa.type !== 'INTERNAL' ? (
              <label className="compact-booking-field">
                <span>Konto *</span>
                <select className="input" style={{ color: accountsById.get(Number(qa.paymentAccountId || 0))?.color || undefined }} value={String(qa.paymentAccountId ?? '')} onChange={(event) => {
                  const id = event.target.value ? Number(event.target.value) : null
                  const account = accountsById.get(Number(id || 0))
                  patchQa({ paymentAccountId: id, paymentAccountName: account?.name ?? null, paymentMethod: accountMethod(account?.kind) })
                }} aria-label="Buchungskonto wählen">
                  <option value="">Konto wählen</option>
                  {activeAccounts.map((account) => <option key={account.id} value={account.id} style={{ color: account.color || undefined }}>{account.name}</option>)}
                </select>
              </label>
            ) : (
              <div className="compact-booking-field compact-booking-field--readonly"><span>Zahlweg</span><strong>Intern</strong></div>
            )}

            <label className="compact-booking-field compact-booking-field--amount">
              <span>Betrag *</span>
              <span className="compact-booking-amount-control">
                {qa.type !== 'TRANSFER' && qa.type !== 'INTERNAL' && (
                  <select className="input" value={qa.mode ?? 'GROSS'} onChange={(event) => {
                    const mode = event.target.value as 'NET' | 'GROSS'
                    if (mode === 'NET') patchQa({ mode, netAmount: qa.netAmount ?? qa.grossAmount ?? 0, vatRate: qa.vatRate || 19 })
                    else patchQa({ mode, grossAmount: qa.grossAmount ?? gross, vatRate: 0 })
                  }} aria-label="Netto oder Brutto Modus">
                    <option value="GROSS">Brutto</option>
                    <option value="NET">Netto</option>
                  </select>
                )}
                <span className="adorn-wrap">
                  <input ref={amountInputRef} className={`input amount-input${hasInvalidAmount ? ' input-error' : ''}`} type="number" step="0.01" value={(qa.type === 'TRANSFER' || qa.type === 'INTERNAL' || qa.mode === 'GROSS') ? qa.grossAmount ?? '' : qa.netAmount ?? ''} onFocus={(event) => event.currentTarget.select()} onChange={(event) => {
                    const value = event.target.value === '' ? undefined : Number(event.target.value)
                    const usesGrossInput = qa.type === 'TRANSFER' || qa.type === 'INTERNAL' || qa.mode === 'GROSS'
                    const nextGross = usesGrossInput
                      ? Number(value || 0)
                      : roundCurrency(Number(value || 0) * (1 + Number(qa.vatRate || 0) / 100))
                    const patch: Partial<QA> = usesGrossInput ? { grossAmount: value } : { netAmount: value }
                    if (qa.type !== 'INTERNAL' && nextGross > 0) {
                      if (budgets.length) patch.budgets = fillEmptyAssignmentAmounts(budgets, nextGross)
                      if (assignedEarmarks.length) patch.earmarksAssigned = fillEmptyAssignmentAmounts(assignedEarmarks, nextGross)
                    }
                    patchQa(patch)
                  }} aria-label={(qa.type === 'TRANSFER' || qa.type === 'INTERNAL' || qa.mode === 'GROSS') ? 'Brutto-Betrag' : 'Netto-Betrag'} />
                  <span className="adorn-suffix">€</span>
                </span>
              </span>
            </label>

            {qa.type !== 'TRANSFER' && qa.type !== 'INTERNAL' && qa.mode === 'NET' && (
              <label className="compact-booking-field">
                <span>USt</span>
                <select className="input" value={String(qa.vatRate)} onChange={(event) => patchQa({ vatRate: Number(event.target.value) })} aria-label="Umsatzsteuer Prozentsatz">
                  <option value="0">0 %</option><option value="7">7 %</option><option value="19">19 %</option>
                </select>
              </label>
            )}
          </div>

          <label className="compact-booking-field compact-booking-field--description">
            <span>Beschreibung</span>
            <input className="input" list="compact-booking-descriptions" value={qa.description} onChange={(event) => patchQa({ description: event.target.value })} placeholder="Was wurde gebucht?" />
            <datalist id="compact-booking-descriptions">{descSuggest.map((description) => <option key={description} value={description} />)}</datalist>
          </label>

          <div className="compact-booking-optional-bar" aria-label="Weitere Buchungsfelder">
            <span>Weitere Angaben</span>
            <div>
              {optionalButtons.map((item) => (
                <button key={item.key} type="button" className={visibleSections.has(item.key) ? 'is-active' : ''} aria-pressed={visibleSections.has(item.key)} disabled={item.disabled} onClick={() => setSectionVisible(item.key)}>
                  {visibleSections.has(item.key) ? '−' : '+'} {item.label}{item.count ? ` · ${item.count}` : ''}
                </button>
              ))}
            </div>
          </div>

          {qa.type === 'INTERNAL' && (
            <div className="compact-booking-required-note">Interne Buchungen benötigen ausgeglichene Zuordnungen: Quelle negativ, Ziel positiv.</div>
          )}

          {visibleSections.has('budget') && (
            <div className="compact-booking-optional-section" aria-label="Budget-Zuordnungen">
              <div className="compact-booking-section-title"><strong>{qa.type === 'INTERNAL' ? 'Budget (erforderlich, alternativ Zweckbindung)' : 'Budget'}</strong>{qa.type !== 'INTERNAL' && <button type="button" onClick={() => removeSection('budget')} aria-label="Budget-Feld entfernen">×</button>}</div>
              {budgets.map((assignment, index) => (
                <div className="compact-booking-assignment-row" key={`budget-${index}`}>
                  <select className={`input${(!assignment.budgetId || chosenBudgetIds.filter((id) => id === assignment.budgetId).length > 1 || invalidBudgetIds.has(assignment.budgetId)) ? ' input-error' : ''}`} value={assignment.budgetId || ''} onChange={(event) => {
                    const budgetId = event.target.value ? Number(event.target.value) : 0
                    const amount = budgetId && assignmentAmountIsInvalid(assignment.amount) && gross > 0
                      ? qa.type === 'INTERNAL'
                        ? nextInternalAssignmentAmount()
                        : Math.max(0, roundCurrency(gross - assignedBudgetTotal))
                      : assignment.amount
                    const next = [...budgets]
                    next[index] = { ...assignment, budgetId, amount }
                    patchQa({ budgets: next })
                  }} aria-label={`Budget ${index + 1}`} aria-invalid={!assignment.budgetId || chosenBudgetIds.filter((id) => id === assignment.budgetId).length > 1 || invalidBudgetIds.has(assignment.budgetId)}>
                    <option value="">Budget wählen</option>
                    {activeBudgets.map((budget) => {
                      const range = budgetRange(budget)
                      const disabled = budget.enforceTimeRange ? !inRange(qa.date, range.start, range.end) : false
                      return <option key={budget.id} value={budget.id} disabled={disabled}>{budget.label}{disabled ? ' (außerhalb Zeitraum)' : ''}</option>
                    })}
                  </select>
                  <span className="adorn-wrap"><input className={`input${assignmentAmountIsInvalid(assignment.amount) ? ' input-error' : ''}`} type="number" step="0.01" min={qa.type === 'INTERNAL' ? undefined : '0.01'} value={assignment.amount ?? ''} onChange={(event) => {
                    const next = [...budgets]
                    next[index] = { ...assignment, amount: event.target.value === '' ? 0 : Number(event.target.value) }
                    patchQa({ budgets: next })
                  }} aria-label={`Budgetbetrag ${index + 1}`} aria-invalid={assignmentAmountIsInvalid(assignment.amount)} /><span className="adorn-suffix">€</span></span>
                  <button type="button" className="compact-booking-remove-row" onClick={() => patchQa({ budgets: budgets.filter((_, itemIndex) => itemIndex !== index) })} aria-label={`Budget ${index + 1} entfernen`}>×</button>
                </div>
              ))}
              <button type="button" className="compact-booking-add-row" onClick={addBudget} disabled={!activeBudgets.length || hasInvalidAmount || hasIncompleteBudgets || (qa.type === 'INTERNAL' && hasIncompleteEarmarks)}>+ Budgetzeile</button>
              {hasIncompleteBudgets && <small className="compact-booking-error">Bitte Budget und einen gültigen Betrag in jeder Zeile ergänzen.</small>}
              {!hasIncompleteBudgets && hasDuplicateBudgets && <small className="compact-booking-error">Ein Budget kann nur einmal zugeordnet werden.</small>}
              {!hasIncompleteBudgets && !hasDuplicateBudgets && hasBudgetOverAllocation && <small className="compact-booking-error">Budgetsumme übersteigt den Buchungsbetrag.</small>}
              {invalidBudgetIds.size > 0 && <small className="compact-booking-error">Budget außerhalb des gültigen Zeitraums.</small>}
            </div>
          )}

          {visibleSections.has('earmark') && (
            <div className="compact-booking-optional-section" aria-label="Zweckbindungs-Zuordnungen">
              <div className="compact-booking-section-title"><strong>{qa.type === 'INTERNAL' ? 'Zweckbindung (erforderlich, alternativ Budget)' : 'Zweckbindung'}</strong>{qa.type !== 'INTERNAL' && <button type="button" onClick={() => removeSection('earmark')} aria-label="Zweckbindungs-Feld entfernen">×</button>}</div>
              {assignedEarmarks.map((assignment, index) => (
                <div className="compact-booking-assignment-row" key={`earmark-${index}`}>
                  <select className={`input${(!assignment.earmarkId || chosenEarmarkIds.filter((id) => id === assignment.earmarkId).length > 1 || invalidEarmarkIds.has(assignment.earmarkId)) ? ' input-error' : ''}`} value={assignment.earmarkId || ''} onChange={(event) => {
                    const earmarkId = event.target.value ? Number(event.target.value) : 0
                    const amount = earmarkId && assignmentAmountIsInvalid(assignment.amount) && gross > 0
                      ? qa.type === 'INTERNAL'
                        ? nextInternalAssignmentAmount()
                        : Math.max(0, roundCurrency(gross - assignedEarmarkTotal))
                      : assignment.amount
                    const next = [...assignedEarmarks]
                    next[index] = { ...assignment, earmarkId, amount }
                    patchQa({ earmarksAssigned: next })
                  }} aria-label={`Zweckbindung ${index + 1}`} aria-invalid={!assignment.earmarkId || chosenEarmarkIds.filter((id) => id === assignment.earmarkId).length > 1 || invalidEarmarkIds.has(assignment.earmarkId)}>
                    <option value="">Zweckbindung wählen</option>
                    {activeEarmarks.map((earmark) => {
                      const disabled = !!earmark.enforceTimeRange && !inRange(qa.date, earmark.startDate, earmark.endDate)
                      return <option key={earmark.id} value={earmark.id} disabled={disabled}>{earmark.code} – {earmark.name}{disabled ? ' (außerhalb Zeitraum)' : ''}</option>
                    })}
                  </select>
                  <span className="adorn-wrap"><input className={`input${assignmentAmountIsInvalid(assignment.amount) ? ' input-error' : ''}`} type="number" step="0.01" min={qa.type === 'INTERNAL' ? undefined : '0.01'} value={assignment.amount ?? ''} onChange={(event) => {
                    const next = [...assignedEarmarks]
                    next[index] = { ...assignment, amount: event.target.value === '' ? 0 : Number(event.target.value) }
                    patchQa({ earmarksAssigned: next })
                  }} aria-label={`Zweckbindungsbetrag ${index + 1}`} aria-invalid={assignmentAmountIsInvalid(assignment.amount)} /><span className="adorn-suffix">€</span></span>
                  <button type="button" className="compact-booking-remove-row" onClick={() => patchQa({ earmarksAssigned: assignedEarmarks.filter((_, itemIndex) => itemIndex !== index) })} aria-label={`Zweckbindung ${index + 1} entfernen`}>×</button>
                </div>
              ))}
              <button type="button" className="compact-booking-add-row" onClick={addEarmark} disabled={!activeEarmarks.length || hasInvalidAmount || hasIncompleteEarmarks || (qa.type === 'INTERNAL' && hasIncompleteBudgets)}>+ Zweckbindungszeile</button>
              {hasIncompleteEarmarks && <small className="compact-booking-error">Bitte Zweckbindung und einen gültigen Betrag in jeder Zeile ergänzen.</small>}
              {!hasIncompleteEarmarks && hasDuplicateEarmarks && <small className="compact-booking-error">Eine Zweckbindung kann nur einmal zugeordnet werden.</small>}
              {!hasIncompleteEarmarks && !hasDuplicateEarmarks && hasEarmarkOverAllocation && <small className="compact-booking-error">Zweckbindungssumme übersteigt den Buchungsbetrag.</small>}
              {invalidEarmarkIds.size > 0 && <small className="compact-booking-error">Zweckbindung außerhalb des gültigen Zeitraums.</small>}
            </div>
          )}

          {visibleSections.has('tags') && (
            <div className="compact-booking-optional-section">
              <div className="compact-booking-section-title"><strong>Tags</strong><button type="button" onClick={() => removeSection('tags')} aria-label="Tag-Feld entfernen">×</button></div>
              <TagsEditor value={qa.tags || []} onChange={(tags) => patchQa({ tags })} tagDefs={tagDefs} />
            </div>
          )}

          {visibleSections.has('comment') && (
            <div className="compact-booking-optional-section">
              <div className="compact-booking-section-title"><strong>Kommentar</strong><button type="button" onClick={() => removeSection('comment')} aria-label="Kommentar-Feld entfernen">×</button></div>
              <textarea className="input" rows={3} value={qa.note || ''} onChange={(event) => patchQa({ note: event.target.value })} placeholder="Interne Notiz oder Ablagehinweis …" aria-label="Kommentar zur Buchung" />
            </div>
          )}

          {visibleSections.has('attachments') && (
            <div className="compact-booking-optional-section" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onDropFiles(event.dataTransfer.files) }}>
              <div className="compact-booking-section-title"><strong>Anhänge</strong><button type="button" onClick={() => removeSection('attachments')} aria-label="Anhänge entfernen">×</button></div>
              <button type="button" className="compact-booking-add-row" onClick={openFilePicker}>+ Datei auswählen</button>
              {!!files.length && <div className="compact-booking-files">{files.map((file, index) => <span key={`${file.name}-${index}`}>{file.name}<button type="button" onClick={() => setFiles(files.filter((_, fileIndex) => fileIndex !== index))} aria-label={`${file.name} entfernen`}>×</button></span>)}</div>}
            </div>
          )}
        </div>

        <footer className="compact-booking-flyout__footer">
          <div className={validationMessage ? 'compact-booking-error' : 'compact-booking-footer-hint'} role={validationMessage ? 'alert' : undefined}>
            {validationMessage || (afterSaveDefault === 'new' ? 'Speichert und öffnet eine neue Buchung.' : 'Strg+S zum Speichern')}
          </div>
          <div>
            <button type="submit" className="btn primary" disabled={saveBlocked}>Buchung speichern</button>
          </div>
        </footer>
      </form>
    </section>
  )
}
