import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { QA } from '../hooks/useQuickAdd'
import {
  AI_PATTERNS_CHANGED_EVENT,
  buildAISuggestions,
  readAISuggestionLearning,
  rememberBookingAIPattern,
  type BookingAISuggestion
} from '../utils/bookingAiPatterns'
import TagsEditor from './TagsEditor'
import HoverTooltip from './common/HoverTooltip'
import PartySelector from './common/PartySelector'
import SelectDropdown, { SuggestionInput } from './common/SelectDropdown'
import DatePickerButton from './common/DatePickerButton'
import { getInternalAssignmentValidationState } from './modals/voucherMetaValidation'
import BookingOptionalArea from './booking/BookingOptionalArea'
import { type BookingOptionalAction } from './booking/BookingOptionalActionBar'
import BookingKindSwitch from './booking/BookingKindSwitch'

type OptionalSection = 'budget' | 'earmark' | 'party' | 'tags' | 'comment' | 'attachments'
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
  kindOptions?: Array<{ value: QA['type']; label: string }>
  onSave: () => void | Promise<void>
  onClose: () => void
  onExpand: () => void
  showExpand?: boolean
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
  if (qa.counterparty?.trim() || qa.partyId) sections.add('party')
  if (qa.tags?.length) sections.add('tags')
  if (qa.note?.trim()) sections.add('comment')
  if (files.length) sections.add('attachments')
  return sections
}

export default function CompactBookingFlyout({
  qa,
  setQa,
  kindOptions = [
    { value: 'IN', label: 'Einnahme' },
    { value: 'OUT', label: 'Ausgabe' },
    { value: 'TRANSFER', label: 'Umbuchung' },
    { value: 'INTERNAL', label: 'Intern' }
  ],
  onSave,
  onClose,
  onExpand,
  showExpand = true,
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
  const amountInputRef = useRef<HTMLInputElement | null>(null)
  const dateInputRef = useRef<HTMLInputElement | null>(null)
  const aiAssistRef = useRef<HTMLDivElement | null>(null)
  const [visibleSections, setVisibleSections] = useState(() => initialSections(qa, files))
  const [classification, setClassification] = useState<null | { profile: string; label: string; values: Array<any> }>(null)
  const [aiMenuOpen, setAiMenuOpen] = useState(false)
  const [aiLearningVersion, setAiLearningVersion] = useState(0)

  useEffect(() => {
    let alive = true
    void window.api?.classifications?.primary?.list?.()
      .then((result) => {
        if (!alive || !result) return
        setClassification({ profile: result.profile, label: result.definition.primaryLabel, values: result.values || [] })
      })
      .catch(() => { if (alive) setClassification(null) })
    return () => { alive = false }
  }, [])

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

  const aiLearning = useMemo(() => readAISuggestionLearning(), [aiLearningVersion])
  const aiSuggestions = useMemo(
    () => buildAISuggestions({
      description: qa.description || '',
      grossAmount: gross,
      currentTags: qa.tags || [],
      currentType: qa.type,
      currentSphere: qa.sphere,
      currentBudgets: budgets.map((item) => ({ id: item.budgetId, amount: item.amount })),
      currentEarmarks: assignedEarmarks.map((item) => ({ id: item.earmarkId, amount: item.amount })),
      currentPaymentAccountId: qa.paymentAccountId || null,
      currentTransferFromAccountId: qa.transferFromAccountId || null,
      currentTransferToAccountId: qa.transferToAccountId || null,
      tagDefs,
      paymentAccounts: activeAccounts,
      learning: aiLearning
    }),
    [activeAccounts, aiLearning, assignedEarmarks, budgets, gross, qa.description, qa.paymentAccountId, qa.sphere, qa.tags, qa.transferFromAccountId, qa.transferToAccountId, qa.type, tagDefs]
  )

  useEffect(() => {
    const refreshLearning = () => setAiLearningVersion((value) => value + 1)
    window.addEventListener(AI_PATTERNS_CHANGED_EVENT, refreshLearning)
    window.addEventListener('storage', refreshLearning)
    return () => {
      window.removeEventListener(AI_PATTERNS_CHANGED_EVENT, refreshLearning)
      window.removeEventListener('storage', refreshLearning)
    }
  }, [])

  useEffect(() => {
    if (!aiSuggestions.length) setAiMenuOpen(false)
  }, [aiSuggestions.length])

  useEffect(() => {
    if (!aiMenuOpen) return
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (target && aiAssistRef.current?.contains(target)) return
      setAiMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutside)
    return () => document.removeEventListener('pointerdown', closeOnOutside)
  }, [aiMenuOpen])

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

  const applyAISuggestion = (suggestion: BookingAISuggestion) => {
    const next = { ...qa } as QA
    if (suggestion.type && suggestion.type !== next.type) {
      next.type = suggestion.type
      if (suggestion.type === 'TRANSFER') {
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
      } else if (suggestion.type === 'INTERNAL') {
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
          const fallback = suggestion.type === 'IN' ? defaultBank : (defaultCash || defaultBank)
          next.paymentAccountId = fallback?.id ?? null
          next.paymentAccountName = fallback?.name ?? null
          next.paymentMethod = accountMethod(fallback?.kind)
        }
      }
    }
    if (suggestion.sphere) next.sphere = suggestion.sphere
    if (suggestion.paymentAccountId && next.type !== 'TRANSFER' && next.type !== 'INTERNAL') {
      const account = accountsById.get(Number(suggestion.paymentAccountId))
      next.paymentAccountId = account?.id ?? suggestion.paymentAccountId
      next.paymentAccountName = account?.name ?? next.paymentAccountName
      next.paymentMethod = accountMethod(account?.kind) || next.paymentMethod
    }
    if (suggestion.transferFromAccountId && next.type === 'TRANSFER') {
      const account = accountsById.get(Number(suggestion.transferFromAccountId))
      next.transferFromAccountId = account?.id ?? suggestion.transferFromAccountId
      next.transferFromAccountName = account?.name ?? next.transferFromAccountName
      next.transferFrom = accountMethod(account?.kind) || next.transferFrom
    }
    if (suggestion.transferToAccountId && next.type === 'TRANSFER') {
      const account = accountsById.get(Number(suggestion.transferToAccountId))
      next.transferToAccountId = account?.id ?? suggestion.transferToAccountId
      next.transferToAccountName = account?.name ?? next.transferToAccountName
      next.transferTo = accountMethod(account?.kind) || next.transferTo
    }
    const currentTags = next.tags || []
    const tagNames = new Set(currentTags.map((tag) => tag.toLowerCase()))
    next.tags = [...currentTags, ...(suggestion.tags || []).filter((tag) => !tagNames.has(tag.toLowerCase()))]
    const currentBudgetIds = new Set(budgets.map((item) => item.budgetId))
    const currentEarmarkIds = new Set(assignedEarmarks.map((item) => item.earmarkId))
    next.budgets = [
      ...budgets,
      ...(suggestion.budgets || [])
        .filter((item) => item.id && !currentBudgetIds.has(item.id))
        .map((item) => ({ budgetId: item.id, amount: item.amountMode === 'FULL' ? gross : Number(item.amount || gross || 0) }))
    ]
    next.earmarksAssigned = [
      ...assignedEarmarks,
      ...(suggestion.earmarks || [])
        .filter((item) => item.id && !currentEarmarkIds.has(item.id))
        .map((item) => ({ earmarkId: item.id, amount: item.amountMode === 'FULL' ? gross : Number(item.amount || gross || 0) }))
    ]
    setQa(next)
    setAiMenuOpen(false)
  }

  const setSectionVisible = (section: OptionalSection) => {
    if (!visibleSections.has(section) && section === 'budget' && budgets.length === 0) {
      patchQa({ budgets: [{ budgetId: 0, amount: gross }] })
    }
    if (!visibleSections.has(section) && section === 'earmark' && assignedEarmarks.length === 0) {
      patchQa({ earmarksAssigned: [{ earmarkId: 0, amount: gross }] })
    }
    setVisibleSections((current) => {
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
    if (section === 'party') patchQa({ partyId: null, counterparty: '' })
    if (section === 'comment') patchQa({ note: '' })
    if (section === 'attachments') setFiles([])
    setVisibleSections((current) => {
      const next = new Set(current)
      next.delete(section)
      return next
    })
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

  const optionalButtons: Array<BookingOptionalAction & { key: OptionalSection }> = [
    { key: 'budget', label: 'Budget', count: budgets.length, disabled: !activeBudgets.length },
    { key: 'earmark', label: 'Zweckbindung', count: assignedEarmarks.length, disabled: !activeEarmarks.length },
    ...(qa.type === 'IN' || qa.type === 'OUT' ? [{ key: 'party' as const, label: qa.type === 'OUT' ? 'Lieferant' : 'Kunde', count: qa.counterparty?.trim() ? 1 : 0 }] : []),
    { key: 'tags', label: 'Tag', count: qa.tags?.length },
    { key: 'comment', label: 'Kommentar', count: qa.note?.trim() ? 1 : 0 },
    { key: 'attachments', label: 'Anhang', count: files.length }
  ]

  return (
    <section className={`compact-booking-flyout compact-booking-flyout--${qa.type.toLowerCase()}`} role="dialog" aria-labelledby="compact-booking-title">
      <header className="compact-booking-flyout__header">
        <div>
          <strong id="compact-booking-title">Buchung erfassen</strong>
          <small>{draftTabsEnabled ? `Aktive Buchungen · ${draftTabs.length} offen` : 'Kompakte Erfassung'}</small>
        </div>
        {draftTabsEnabled && draftTabs.length > 0 && (
          <div className="compact-booking-flyout__tab-switcher">
            <SelectDropdown
              value={activeDraftId ?? ''}
              onChange={onSelectDraft}
              ariaLabel="Buchungsreiter wechseln"
              options={draftTabs.map((draft) => ({ value: draft.id, label: draft.label, description: draft.title }))}
            />
            <button type="button" className="btn ghost compact-booking-flyout__action compact-booking-flyout__action--new" onClick={onNewDraft} aria-label="Neuen Buchungsreiter öffnen" title="Neue Buchung als weiteren Reiter öffnen">+</button>
          </div>
        )}
        <div className="compact-booking-flyout__header-actions">
          {showExpand && <button type="button" className="btn ghost compact-booking-flyout__action compact-booking-flyout__action--expand" onClick={onExpand} title="Vollständigen Dialog öffnen" aria-label="Vollständigen Buchungsdialog öffnen">↗</button>}
          <button type="button" className="btn ghost compact-booking-flyout__action compact-booking-flyout__action--close" onClick={onClose} aria-label={draftTabsEnabled ? 'Buchungsflyout parken' : 'Buchungsflyout schließen'}>✕</button>
        </div>
      </header>

      <form className="compact-booking-flyout__form" onSubmit={(event) => { event.preventDefault(); save() }}>
        <input ref={fileInputRef} type="file" multiple hidden accept=".png,.jpg,.jpeg,.pdf,.doc,.docx" onChange={(event) => onDropFiles(event.target.files)} />
        <div className="compact-booking-flyout__body">
          <BookingKindSwitch
            value={qa.type}
            ariaLabel="Buchungsart wählen"
            options={kindOptions}
            onChange={(value) => selectType(value as QA['type'])}
          />

          <div className="compact-booking-core-grid">
            <label className="compact-booking-field">
              <span>Datum *</span>
              <span className="booking-date-input-wrap">
                <input ref={dateInputRef} className="input" type="date" value={qa.date} onChange={(event) => patchQa({ date: event.target.value })} aria-label="Datum der Buchung" required />
                <DatePickerButton inputRef={dateInputRef} ariaLabel="Kalender zur Datumsauswahl öffnen" />
              </span>
            </label>

            {classification?.profile === 'GENERAL' ? (
              <label className="compact-booking-field">
                <span>Kategorie *</span>
                <SelectDropdown
                  value={String(qa.primaryClassificationValueId ?? '')}
                  onChange={(value) => patchQa({ primaryClassificationValueId: value ? Number(value) : null })}
                  ariaLabel="Kategorie der Buchung"
                  placeholder="Kategorie wählen"
                  options={classification.values.map((category) => ({
                    value: String(category.id),
                    label: category.isActive ? `${category.icon || ''} ${category.name}`.trim() : `${category.icon || ''} ${category.name} (archiviert)`.trim(),
                    color: category.color || undefined
                  }))}
                />
              </label>
            ) : qa.type !== 'TRANSFER' && (
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
                <SelectDropdown
                  value={qa.sphere}
                  onChange={(value) => patchQa({ sphere: value as QA['sphere'] })}
                  ariaLabel="Sphäre der Buchung"
                  options={[
                    { value: 'IDEELL', label: 'Ideeller Bereich' },
                    { value: 'ZWECK', label: 'Zweckbetrieb' },
                    { value: 'VERMOEGEN', label: 'Vermögensverwaltung' },
                    { value: 'WGB', label: 'Wirtschaftlicher Geschäftsbetrieb' },
                  ]}
                />
              </label>
            )}

            {qa.type === 'TRANSFER' ? (
              <>
                <label className="compact-booking-field">
                  <span>Von Konto *</span>
                  <SelectDropdown invalid={hasSameTransferAccount} placeholder="Konto wählen" style={{ color: accountsById.get(Number(qa.transferFromAccountId || 0))?.color || undefined }} value={String(qa.transferFromAccountId ?? '')} onChange={(value) => {
                    const id = value ? Number(value) : null
                    const account = accountsById.get(Number(id || 0))
                    patchQa({ transferFromAccountId: id, transferFromAccountName: account?.name ?? null, transferFrom: accountMethod(account?.kind) })
                  }} ariaLabel="Transfer von Konto" options={activeAccounts.map((account) => ({ value: String(account.id), label: account.name, color: account.color || undefined, disabled: account.id === qa.transferToAccountId }))} />
                </label>
                <label className="compact-booking-field">
                  <span>Nach Konto *</span>
                  <SelectDropdown invalid={hasSameTransferAccount} placeholder="Konto wählen" style={{ color: accountsById.get(Number(qa.transferToAccountId || 0))?.color || undefined }} value={String(qa.transferToAccountId ?? '')} onChange={(value) => {
                    const id = value ? Number(value) : null
                    const account = accountsById.get(Number(id || 0))
                    patchQa({ transferToAccountId: id, transferToAccountName: account?.name ?? null, transferTo: accountMethod(account?.kind) })
                  }} ariaLabel="Transfer nach Konto" options={activeAccounts.map((account) => ({ value: String(account.id), label: account.name, color: account.color || undefined, disabled: account.id === qa.transferFromAccountId }))} />
                </label>
              </>
            ) : qa.type !== 'INTERNAL' ? (
              <label className="compact-booking-field">
                <span>Konto *</span>
                <SelectDropdown placeholder="Konto wählen" style={{ color: accountsById.get(Number(qa.paymentAccountId || 0))?.color || undefined }} value={String(qa.paymentAccountId ?? '')} onChange={(value) => {
                  const id = value ? Number(value) : null
                  const account = accountsById.get(Number(id || 0))
                  patchQa({ paymentAccountId: id, paymentAccountName: account?.name ?? null, paymentMethod: accountMethod(account?.kind) })
                }} ariaLabel="Buchungskonto wählen" options={activeAccounts.map((account) => ({ value: String(account.id), label: account.name, color: account.color || undefined }))} />
              </label>
            ) : (
              <div className="compact-booking-field compact-booking-field--readonly"><span>Zahlweg</span><strong>Intern</strong></div>
            )}

            <label className="compact-booking-field compact-booking-field--amount">
              <span>Betrag *</span>
              <span className={`compact-booking-amount-control${qa.type !== 'TRANSFER' && qa.type !== 'INTERNAL' && qa.mode === 'NET' ? ' compact-booking-amount-control--with-vat' : ''}`}>
                {qa.type !== 'TRANSFER' && qa.type !== 'INTERNAL' && (
                  <SelectDropdown value={qa.mode ?? 'GROSS'} onChange={(value) => {
                    const mode = value as 'NET' | 'GROSS'
                    if (mode === 'NET') patchQa({ mode, netAmount: qa.netAmount ?? qa.grossAmount ?? 0, vatRate: qa.vatRate || 19 })
                    else patchQa({ mode, grossAmount: qa.grossAmount ?? gross, vatRate: 0 })
                  }} ariaLabel="Netto oder Brutto Modus" options={[{ value: 'GROSS', label: 'Brutto' }, { value: 'NET', label: 'Netto' }]} />
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
                {qa.type !== 'TRANSFER' && qa.type !== 'INTERNAL' && qa.mode === 'NET' && (
                  <SelectDropdown className="compact-booking-vat-select" value={String(qa.vatRate)} onChange={(value) => patchQa({ vatRate: Number(value) })} ariaLabel="Umsatzsteuer Prozentsatz" options={[{ value: '0', label: '0 % USt' }, { value: '7', label: '7 % USt' }, { value: '19', label: '19 % USt' }]} />
                )}
              </span>
            </label>
          </div>

          <label className="compact-booking-field compact-booking-field--description">
            <span>Beschreibung</span>
            <SuggestionInput value={qa.description} suggestions={descSuggest} onChange={(value) => patchQa({ description: value })} placeholder="Was wurde gebucht?" />
          </label>

          <BookingOptionalArea
            actions={optionalButtons.map((item) => ({ ...item, active: visibleSections.has(item.key) }))}
            onToggle={(key) => setSectionVisible(key as OptionalSection)}
          >

          {qa.type === 'INTERNAL' && (
            <div className="compact-booking-required-note">Interne Buchungen benötigen ausgeglichene Zuordnungen: Quelle negativ, Ziel positiv.</div>
          )}

          {visibleSections.has('party') && (qa.type === 'IN' || qa.type === 'OUT') && (
            <div className="compact-booking-optional-section compact-booking-party-section" aria-label="Geschäftspartner">
              <div className="compact-booking-section-title">
                <strong>{qa.type === 'OUT' ? 'Lieferant / Zahlungsempfänger' : 'Kunde / Zahlungspflichtiger'}</strong>
                <button type="button" onClick={() => removeSection('party')} aria-label="Geschäftspartner entfernen">×</button>
              </div>
              <PartySelector
                valueId={qa.partyId}
                valueName={qa.counterparty || ''}
                role={qa.type === 'OUT' ? 'SUPPLIER' : 'CUSTOMER'}
                inputId="compact-booking-party"
                ariaLabel={qa.type === 'OUT' ? 'Lieferant oder Zahlungsempfänger' : 'Kunde oder Zahlungspflichtiger'}
                menuPlacement="top"
                onChange={(selection) => patchQa({ partyId: selection.partyId, counterparty: selection.name })}
              />
            </div>
          )}

          {visibleSections.has('budget') && (
            <div className="compact-booking-optional-section" aria-label="Budget-Zuordnungen">
              <div className="compact-booking-section-title"><strong>{qa.type === 'INTERNAL' ? 'Budget (erforderlich, alternativ Zweckbindung)' : 'Budget'}</strong><button type="button" onClick={() => removeSection('budget')} aria-label="Budget-Feld entfernen">×</button></div>
              {budgets.map((assignment, index) => (
                <div className="compact-booking-assignment-row" key={`budget-${index}`}>
                  <SelectDropdown invalid={!assignment.budgetId || chosenBudgetIds.filter((id) => id === assignment.budgetId).length > 1 || invalidBudgetIds.has(assignment.budgetId)} value={assignment.budgetId ? String(assignment.budgetId) : ''} placeholder="Budget wählen" onChange={(value) => {
                    const budgetId = value ? Number(value) : 0
                    const amount = budgetId && assignmentAmountIsInvalid(assignment.amount) && gross > 0
                      ? qa.type === 'INTERNAL'
                        ? nextInternalAssignmentAmount()
                        : Math.max(0, roundCurrency(gross - assignedBudgetTotal))
                      : assignment.amount
                    const next = [...budgets]
                    next[index] = { ...assignment, budgetId, amount }
                    patchQa({ budgets: next })
                  }} ariaLabel={`Budget ${index + 1}`} options={[
                    { value: '', label: 'Budget wählen' },
                    ...activeBudgets.map((budget) => {
                      const range = budgetRange(budget)
                      const disabled = budget.enforceTimeRange ? !inRange(qa.date, range.start, range.end) : false
                      return { value: String(budget.id), label: `${budget.label}${disabled ? ' (außerhalb Zeitraum)' : ''}`, disabled }
                    })
                  ]} />
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
              <div className="compact-booking-section-title"><strong>{qa.type === 'INTERNAL' ? 'Zweckbindung (erforderlich, alternativ Budget)' : 'Zweckbindung'}</strong><button type="button" onClick={() => removeSection('earmark')} aria-label="Zweckbindungs-Feld entfernen">×</button></div>
              {assignedEarmarks.map((assignment, index) => (
                <div className="compact-booking-assignment-row" key={`earmark-${index}`}>
                  <SelectDropdown invalid={!assignment.earmarkId || chosenEarmarkIds.filter((id) => id === assignment.earmarkId).length > 1 || invalidEarmarkIds.has(assignment.earmarkId)} value={assignment.earmarkId ? String(assignment.earmarkId) : ''} placeholder="Zweckbindung wählen" onChange={(value) => {
                    const earmarkId = value ? Number(value) : 0
                    const amount = earmarkId && assignmentAmountIsInvalid(assignment.amount) && gross > 0
                      ? qa.type === 'INTERNAL'
                        ? nextInternalAssignmentAmount()
                        : Math.max(0, roundCurrency(gross - assignedEarmarkTotal))
                      : assignment.amount
                    const next = [...assignedEarmarks]
                    next[index] = { ...assignment, earmarkId, amount }
                    patchQa({ earmarksAssigned: next })
                  }} ariaLabel={`Zweckbindung ${index + 1}`} options={[
                    { value: '', label: 'Zweckbindung wählen' },
                    ...activeEarmarks.map((earmark) => {
                      const disabled = !!earmark.enforceTimeRange && !inRange(qa.date, earmark.startDate, earmark.endDate)
                      return { value: String(earmark.id), label: `${earmark.code} – ${earmark.name}${disabled ? ' (außerhalb Zeitraum)' : ''}`, disabled }
                    })
                  ]} />
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
          </BookingOptionalArea>
        </div>

        <footer className="compact-booking-flyout__footer">
          <div className="compact-booking-flyout__footer-main">
            {aiSuggestions.length > 0 && (
              <div className="booking-ai-assist compact-booking-ai-assist" ref={aiAssistRef}>
                <button
                  type="button"
                  className="btn ghost booking-ai-assist__trigger"
                  onClick={() => setAiMenuOpen((open) => !open)}
                  aria-label="Intelligente Buchungsvorschläge"
                  aria-expanded={aiMenuOpen}
                  title="Intelligente Vorschläge"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 2l1.7 5.1L19 9l-5.3 1.9L12 16l-1.7-5.1L5 9l5.3-1.9L12 2z" />
                    <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z" />
                    <path d="M5 15l.7 1.8L7.5 17.5l-1.8.7L5 20l-.7-1.8-1.8-.7 1.8-.7L5 15z" />
                  </svg>
                  <span>{aiSuggestions.length}</span>
                </button>
                {aiMenuOpen && (
                  <div className="booking-ai-assist__panel" role="dialog" aria-label="Intelligente Buchungsvorschläge">
                    <div className="booking-ai-assist__panel-head">
                      <strong>Vorschläge erkannt</strong>
                      <span>Lokal gelerntes Muster</span>
                    </div>
                    <div className="booking-ai-assist__list">
                      {aiSuggestions.map((suggestion) => (
                        <div key={suggestion.key} className="booking-ai-suggestion">
                          <div className="booking-ai-suggestion__copy">
                            <strong>{suggestion.title}</strong>
                            <span>{suggestion.reason}{suggestion.learned ? ' · gelernt' : ''}</span>
                          </div>
                          <div className="booking-ai-suggestion__chips">
                            {suggestion.type && <span className="booking-ai-chip booking-ai-chip--neutral">{suggestion.type}</span>}
                            {suggestion.sphere && <span className="booking-ai-chip booking-ai-chip--sphere">{suggestion.sphere}</span>}
                            {(suggestion.tags || []).map((tag) => <span className="booking-ai-chip booking-ai-chip--tag" key={`${suggestion.key}-${tag}`}>{tag}</span>)}
                            {(suggestion.budgets || []).map((budget) => {
                              const info = activeBudgets.find((item) => item.id === budget.id)
                              return <span className="booking-ai-chip booking-ai-chip--budget" key={`${suggestion.key}-budget-${budget.id}`}>{info?.label || `Budget #${budget.id}`}</span>
                            })}
                            {(suggestion.earmarks || []).map((earmark) => {
                              const info = activeEarmarks.find((item) => item.id === earmark.id)
                              return <span className="booking-ai-chip booking-ai-chip--earmark" key={`${suggestion.key}-earmark-${earmark.id}`}>{info ? `${info.code} ${info.name}` : `Zweckbindung #${earmark.id}`}</span>
                            })}
                          </div>
                          <div className="booking-ai-suggestion__actions">
                            <button type="button" className="btn primary booking-ai-suggestion__apply" onClick={() => applyAISuggestion(suggestion)} title="Vorschlag übernehmen" aria-label={`${suggestion.title} übernehmen`}>+</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className={validationMessage ? 'compact-booking-error' : 'compact-booking-footer-hint'} role={validationMessage ? 'alert' : undefined}>
              {validationMessage || (afterSaveDefault === 'new' ? 'Speichert und öffnet eine neue Buchung.' : 'Strg+S zum Speichern')}
            </div>
          </div>
          <div>
            <button type="submit" className="btn primary" disabled={saveBlocked}>Buchung speichern</button>
          </div>
        </footer>
      </form>
    </section>
  )
}
