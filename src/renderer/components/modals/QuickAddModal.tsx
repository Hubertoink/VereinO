import React from 'react'
import TagsEditor from '../TagsEditor'
import HoverTooltip from '../common/HoverTooltip'
import PartySelector from '../common/PartySelector'
import SelectDropdown, { SuggestionInput } from '../common/SelectDropdown'
import type { QA } from '../../hooks/useQuickAdd'
import WindowControls from '../layout/WindowControls'
import { getInternalAssignmentValidationState } from './voucherMetaValidation'
import { getContrastTextColor, resolveTagDisplayColor } from '../../utils/tagColors'
import { distributeAmountEvenly, isAmountEvenlyDistributed } from '../../utils/budgetDistribution'
import {
    AI_PATTERNS_CHANGED_EVENT,
    buildAISuggestions,
    readAISuggestionLearning,
    rememberBookingAIPattern,
    type BookingAISuggestion
} from '../../utils/bookingAiPatterns'

type BudgetAssignment = { budgetId: number; amount: number }
type EarmarkAssignment = { earmarkId: number; amount: number }
type ExistingAttachment = { id: number; fileName: string }
type PaymentAccount = { id: number; name: string; kind: 'CASH' | 'BANK' | 'PAYPAL' | 'CARD' | 'OTHER'; iban?: string | null; color?: string | null; sortOrder: number; isActive: number }
type AISuggestionPartKey =
    | 'type'
    | 'sphere'
    | 'paymentAccount'
    | 'transferFromAccount'
    | 'transferToAccount'
    | `tag:${string}`
    | `budget:${number}`
    | `earmark:${number}`

function AttachmentActionIcon({ kind }: { kind: 'add' | 'open' | 'save' | 'remove' | 'clear' }) {
    const common = { width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
    if (kind === 'add') return <svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M12 12v6M9 15h6"/></svg>
    if (kind === 'open') return <svg {...common}><path d="M14 3h7v7M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>
    if (kind === 'save') return <svg {...common}><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>
    if (kind === 'clear') return <svg {...common}><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14"/><path d="M10 11v6M14 11v6"/></svg>
    return <svg {...common}><path d="M6 6l12 12M18 6 6 18"/></svg>
}

interface QuickAddModalProps {
    qa: QA
    setQa: (qa: QA) => void
    onSave: () => void
    onSaveAndNew?: () => void
    onSaveAndClose?: () => void
    afterSaveDefault?: 'close' | 'new'
    saveLabel?: string
    showSaveMenu?: boolean
    footerHint?: string
    footerLeft?: React.ReactNode
    onClose: () => void
    onDetach?: () => void
    windowMode?: boolean
    onRequestClose?: () => void
    confirmingClose?: boolean
    onConfirmDiscard?: () => void
    onCancelDiscard?: () => void
    files: File[]
    setFiles: (files: File[]) => void
    openFilePicker: () => void
    onDropFiles: (files: FileList | null) => void
    fileInputRef: React.RefObject<HTMLInputElement>
    fmtDate: (d: string) => string
    eurFmt: Intl.NumberFormat
    budgetsForEdit: Array<{ id: number; label: string; year?: number; startDate?: string | null; endDate?: string | null; enforceTimeRange?: number; isArchived?: number; color?: string | null }>
    earmarks: Array<{ id: number; code: string; name: string; color?: string | null; startDate?: string | null; endDate?: string | null; enforceTimeRange?: number }>
    paymentAccounts?: PaymentAccount[]
    tagDefs: Array<{ id: number; name: string; color?: string | null }>
    descSuggest: string[]
    title?: string
    existingFiles?: ExistingAttachment[]
    existingFilesLoading?: boolean
    onOpenExistingFile?: (fileId: number) => void | Promise<void>
    onDownloadExistingFile?: (fileId: number) => void | Promise<void>
    onDeleteExistingFile?: (file: ExistingAttachment) => void | Promise<void>
}

function inRange(dateISO: string, startISO?: string | null, endISO?: string | null) {
    if (startISO && dateISO < startISO) return false
    if (endISO && dateISO > endISO) return false
    return true
}

function budgetEffectiveRange(b: { year?: number; startDate?: string | null; endDate?: string | null; enforceTimeRange?: number }) {
    const enforce = !!b.enforceTimeRange
    if (!enforce) return { enforce: false as const, start: null as string | null, end: null as string | null }

    const year = typeof b.year === 'number' ? b.year : null
    const start = b.startDate ?? (year != null ? `${year}-01-01` : null)
    const end = b.endDate ?? (year != null ? `${year}-12-31` : null)
    return { enforce: true as const, start, end }
}

function fmtRange(start?: string | null, end?: string | null) {
    if (start && end) return `${start} – ${end}`
    if (start) return `ab ${start}`
    if (end) return `bis ${end}`
    return ''
}

function paymentMethodLabel(method?: 'BAR' | 'BANK' | null) {
    if (method === 'BAR') return 'Bar'
    if (method === 'BANK') return 'Bank'
    return '—'
}

function accountMethod(kind?: PaymentAccount['kind'] | null): 'BAR' | 'BANK' | null {
    if (!kind) return null
    return kind === 'CASH' ? 'BAR' : 'BANK'
}

const BOOKING_TYPE_LABELS: Record<QA['type'], string> = {
    IN: 'Einnahme',
    OUT: 'Ausgabe',
    TRANSFER: 'Umbuchung',
    INTERNAL: 'Intern'
}

const SPHERE_LABELS: Record<QA['sphere'], string> = {
    IDEELL: 'Ideeller Bereich',
    ZWECK: 'Zweckbetrieb',
    VERMOEGEN: 'Vermögensverwaltung',
    WGB: 'Wirtschaftlicher Geschäftsbetrieb'
}

/**
 * QuickAddModal - Buchung schnell erfassen
 * 
 * Modal für das schnelle Erfassen von Buchungen mit allen Details
 * Extrahiert aus App.tsx für bessere Wartbarkeit
 */
export default function QuickAddModal({
    qa,
    setQa,
    onSave,
    onSaveAndNew,
    onSaveAndClose,
    saveLabel,
    showSaveMenu = true,
    footerHint,
    footerLeft,
    onClose,
    onDetach,
    windowMode,
    onRequestClose,
    confirmingClose,
    onConfirmDiscard,
    onCancelDiscard,
    files,
    setFiles,
    openFilePicker,
    onDropFiles,
    fileInputRef,
    fmtDate,
    eurFmt,
    budgetsForEdit,
    earmarks,
    paymentAccounts = [],
    tagDefs,
    descSuggest,
    title,
    existingFiles = [],
    existingFilesLoading = false,
    onOpenExistingFile,
    onDownloadExistingFile,
    onDeleteExistingFile
}: QuickAddModalProps) {
    const dateInputRef = React.useRef<HTMLInputElement | null>(null)
    const amountInputRef = React.useRef<HTMLInputElement | null>(null)
    const tagsInputRef = React.useRef<HTMLInputElement | null>(null)
    const modalRef = React.useRef<HTMLDivElement | null>(null)
    const aiAssistRef = React.useRef<HTMLDivElement | null>(null)
    const dragStartRef = React.useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null)
    const [dragOffset, setDragOffset] = React.useState({ x: 0, y: 0 })
    const [saveMenuOpen, setSaveMenuOpen] = React.useState(false)
    const [aiMenuOpen, setAiMenuOpen] = React.useState(false)
    const [aiLearningVersion, setAiLearningVersion] = React.useState(0)
    const [aiDisabledParts, setAiDisabledParts] = React.useState<Record<string, AISuggestionPartKey[]>>({})

    const grossAmt = (() => {
        if (qa.type === 'TRANSFER' || qa.type === 'INTERNAL') return Number((qa as any).grossAmount || 0)
        if ((qa as any).mode === 'GROSS') return Number((qa as any).grossAmount || 0)
        const n = Number(qa.netAmount || 0)
        const v = Number(qa.vatRate || 0)
        return Math.round((n * (1 + v / 100)) * 100) / 100
    })()

    const budgetsList: BudgetAssignment[] = ((qa as any).budgets || [])
    const earmarksList: EarmarkAssignment[] = ((qa as any).earmarksAssigned || [])
    const budgetAutoDistributionRef = React.useRef(
        budgetsList.length === 0 || isAmountEvenlyDistributed(budgetsList.map((budget) => budget.amount), grossAmt)
    )
    const availableBudgets = React.useMemo(
        () => (budgetsForEdit || []).filter((budget) => !budget?.isArchived),
        [budgetsForEdit]
    )
    const hasAvailableBudgets = availableBudgets.length > 0
    const activePaymentAccounts = React.useMemo(
        () => (paymentAccounts || []).filter((account) => account.isActive !== 0),
        [paymentAccounts]
    )
    const paymentAccountsById = React.useMemo(
        () => new Map(activePaymentAccounts.map((account) => [account.id, account])),
        [activePaymentAccounts]
    )
    const defaultCashAccount = React.useMemo(
        () => activePaymentAccounts.find((account) => account.kind === 'CASH') ?? activePaymentAccounts[0] ?? null,
        [activePaymentAccounts]
    )
    const defaultBankAccount = React.useMemo(
        () => activePaymentAccounts.find((account) => account.kind === 'BANK')
            ?? activePaymentAccounts.find((account) => account.id !== defaultCashAccount?.id)
            ?? activePaymentAccounts[0]
            ?? null,
        [activePaymentAccounts, defaultCashAccount]
    )
    const financeAccountColor = React.useMemo(() => {
        if (qa.type === 'TRANSFER') {
            const fromColor = paymentAccountsById.get(Number((qa as any).transferFromAccountId || 0))?.color
            const toColor = paymentAccountsById.get(Number((qa as any).transferToAccountId || 0))?.color
            return fromColor || toColor || undefined
        }
        return paymentAccountsById.get(Number((qa as any).paymentAccountId || 0))?.color || undefined
    }, [paymentAccountsById, qa])
    const activeEarmarks = React.useMemo(() => {
        return (earmarks || []).filter((em: any) => {
            // In DB/IPC: archived Zweckbindungen are represented as isActive = 0
            if (em?.isActive === 0 || em?.isActive === false) return false
            return true
        })
    }, [earmarks])
    const hasAvailableEarmarks = activeEarmarks.length > 0

    const invalidBudgetIds = new Set(
        budgetsList
            .filter((b) => !!b.budgetId)
            .filter((b) => {
                const info = budgetsForEdit.find((x) => x.id === b.budgetId)
                if (!info) return false
                const eff = budgetEffectiveRange(info)
                if (!eff.enforce) return false
                return !inRange(qa.date, eff.start, eff.end)
            })
            .map((b) => b.budgetId)
    )

    const invalidEarmarkIds = new Set(
        earmarksList
            .filter((e) => !!e.earmarkId)
            .filter((e) => {
                const em = earmarks.find((x) => x.id === e.earmarkId)
                if (!em) return false
                if (!em.enforceTimeRange) return false
                return !inRange(qa.date, em.startDate ?? null, em.endDate ?? null)
            })
            .map((e) => e.earmarkId)
    )

    const hasOutOfRange = invalidBudgetIds.size > 0 || invalidEarmarkIds.size > 0
    const hasInvalidAmount = !Number.isFinite(grossAmt) || grossAmt <= 0
    const hasMissingAccount = qa.type === 'TRANSFER'
        ? !(qa as any).transferFromAccountId || !(qa as any).transferToAccountId
        : qa.type === 'INTERNAL'
            ? false
            : !(qa as any).paymentAccountId
    const internalAssignmentValidation = getInternalAssignmentValidationState({
        budgets: budgetsList,
        earmarks: earmarksList,
        isInternal: qa.type === 'INTERNAL',
        grossAmount: grossAmt,
    })
    const internalAssignmentBlocked = qa.type === 'INTERNAL' && !internalAssignmentValidation.hasValidAssignments
    const saveBlocked = hasOutOfRange || hasInvalidAmount || hasMissingAccount || internalAssignmentBlocked
    const bookingValidationMessage = footerLeft
        ? null
        : hasInvalidAmount
            ? 'Bitte einen Betrag größer als 0 € eingeben.'
            : hasMissingAccount
                ? 'Bitte ein Buchungskonto auswählen.'
                : hasOutOfRange
                    ? 'Eine Zuordnung ist für das Buchungsdatum nicht gültig.'
                    : internalAssignmentBlocked
                        ? 'Interne Buchungen benötigen ausgeglichene Zuordnungen.'
                        : null
    const saveAndNew = onSaveAndNew ?? onSave
    const saveAndClose = onSaveAndClose ?? onSave
    const defaultSaveLabel = saveLabel || 'Speichern'
    const canDrag = !windowMode
    const hasAnyAttachment = files.length > 0 || existingFiles.length > 0
    const aiLearning = React.useMemo(() => readAISuggestionLearning(), [aiLearningVersion])
    const aiSuggestions = React.useMemo(
        () => buildAISuggestions({
            description: qa.description || '',
            grossAmount: grossAmt,
            currentTags: (qa as any).tags || [],
            currentType: qa.type,
            currentSphere: qa.sphere,
            currentBudgets: budgetsList.map((item) => ({ id: item.budgetId, amount: item.amount })),
            currentEarmarks: earmarksList.map((item) => ({ id: item.earmarkId, amount: item.amount })),
            currentPaymentAccountId: (qa as any).paymentAccountId || null,
            currentTransferFromAccountId: (qa as any).transferFromAccountId || null,
            currentTransferToAccountId: (qa as any).transferToAccountId || null,
            tagDefs,
            paymentAccounts: activePaymentAccounts,
            learning: aiLearning
        }),
        [activePaymentAccounts, aiLearning, qa.description, qa.sphere, qa.type, (qa as any).tags, (qa as any).paymentAccountId, (qa as any).transferFromAccountId, (qa as any).transferToAccountId, budgetsList, earmarksList, grossAmt, tagDefs]
    )

    React.useEffect(() => {
        if (!aiSuggestions.length) setAiMenuOpen(false)
    }, [aiSuggestions.length])

    React.useEffect(() => {
        if (!aiMenuOpen) return
        const closeOnOutside = (event: PointerEvent) => {
            const target = event.target as Node | null
            if (target && aiAssistRef.current?.contains(target)) return
            setAiMenuOpen(false)
        }
        document.addEventListener('pointerdown', closeOnOutside)
        return () => document.removeEventListener('pointerdown', closeOnOutside)
    }, [aiMenuOpen])

    React.useEffect(() => {
        setAiDisabledParts((current) => {
            const activeKeys = new Set(aiSuggestions.map((suggestion) => suggestion.key))
            const next = Object.fromEntries(Object.entries(current).filter(([key]) => activeKeys.has(key)))
            return Object.keys(next).length === Object.keys(current).length ? current : next
        })
    }, [aiSuggestions])

    React.useEffect(() => {
        const refreshLearning = () => setAiLearningVersion((value) => value + 1)
        window.addEventListener(AI_PATTERNS_CHANGED_EVENT, refreshLearning)
        window.addEventListener('storage', refreshLearning)
        return () => {
            window.removeEventListener(AI_PATTERNS_CHANGED_EVENT, refreshLearning)
            window.removeEventListener('storage', refreshLearning)
        }
    }, [])

    const rememberCurrentBookingPattern = React.useCallback((draft: QA = qa) => {
        rememberBookingAIPattern({
            description: draft.description || '',
            grossAmount: grossAmt,
            tags: (draft as any).tags || [],
            type: draft.type,
            sphere: draft.sphere,
            budgets: ((draft as any).budgets || []) as BudgetAssignment[],
            earmarks: ((draft as any).earmarksAssigned || []) as EarmarkAssignment[],
            paymentAccountId: draft.type === 'TRANSFER' || draft.type === 'INTERNAL' ? null : Number((draft as any).paymentAccountId || 0) || null,
            transferFromAccountId: draft.type === 'TRANSFER' ? Number((draft as any).transferFromAccountId || 0) || null : null,
            transferToAccountId: draft.type === 'TRANSFER' ? Number((draft as any).transferToAccountId || 0) || null : null,
        })
        setAiLearningVersion((value) => value + 1)
    }, [grossAmt, qa])

    const isAISuggestionPartDisabled = React.useCallback((suggestionKey: string, partKey: AISuggestionPartKey) => (
        aiDisabledParts[suggestionKey]?.includes(partKey) || false
    ), [aiDisabledParts])

    const toggleAISuggestionPart = React.useCallback((suggestionKey: string, partKey: AISuggestionPartKey) => {
        setAiDisabledParts((current) => {
            const currentParts = current[suggestionKey] || []
            const nextParts = currentParts.includes(partKey)
                ? currentParts.filter((key) => key !== partKey)
                : [...currentParts, partKey]
            const next = { ...current }
            if (nextParts.length) next[suggestionKey] = nextParts
            else delete next[suggestionKey]
            return next
        })
    }, [])

    const activeSuggestion = React.useCallback((suggestion: BookingAISuggestion): BookingAISuggestion => {
        const disabled = new Set(aiDisabledParts[suggestion.key] || [])
        return {
            ...suggestion,
            type: disabled.has('type') ? undefined : suggestion.type,
            sphere: disabled.has('sphere') ? undefined : suggestion.sphere,
            paymentAccountId: disabled.has('paymentAccount') ? undefined : suggestion.paymentAccountId,
            transferFromAccountId: disabled.has('transferFromAccount') ? undefined : suggestion.transferFromAccountId,
            transferToAccountId: disabled.has('transferToAccount') ? undefined : suggestion.transferToAccountId,
            tags: (suggestion.tags || []).filter((tag) => !disabled.has(`tag:${tag}`)),
            budgets: (suggestion.budgets || []).filter((budget) => !disabled.has(`budget:${budget.id}`)),
            earmarks: (suggestion.earmarks || []).filter((earmark) => !disabled.has(`earmark:${earmark.id}`)),
        }
    }, [aiDisabledParts])

    const applyAISuggestion = React.useCallback((suggestion: BookingAISuggestion) => {
        const active = activeSuggestion(suggestion)
        const currentTags = ((qa as any).tags || []) as string[]
        const currentTagsLower = new Set(currentTags.map((tag) => tag.toLowerCase()))
        const nextTags = [
            ...currentTags,
            ...(active.tags || []).filter((tag) => !currentTagsLower.has(tag.toLowerCase()))
        ]
        const currentBudgetIds = new Set(budgetsList.map((item) => item.budgetId))
        const currentEarmarkIds = new Set(earmarksList.map((item) => item.earmarkId))
        const nextBudgets = [
            ...budgetsList,
            ...(active.budgets || [])
                .filter((item) => item.id && !currentBudgetIds.has(item.id))
                .map((item) => ({ budgetId: item.id, amount: item.amountMode === 'FULL' ? grossAmt : Number(item.amount || grossAmt || 0) }))
        ]
        const nextEarmarks = [
            ...earmarksList,
            ...(active.earmarks || [])
                .filter((item) => item.id && !currentEarmarkIds.has(item.id))
                .map((item) => ({ earmarkId: item.id, amount: item.amountMode === 'FULL' ? grossAmt : Number(item.amount || grossAmt || 0) }))
        ]
        const nextQa: any = {
            ...(qa as any),
            tags: nextTags,
            budgets: nextBudgets,
            earmarksAssigned: nextEarmarks
        }
        if (active.sphere) nextQa.sphere = active.sphere
        if (active.type && active.type !== qa.type) {
            nextQa.type = active.type
            if (active.type === 'TRANSFER') {
                nextQa.transferFromAccountId = nextQa.transferFromAccountId || defaultCashAccount?.id || null
                nextQa.transferFromAccountName = nextQa.transferFromAccountName || defaultCashAccount?.name || null
                nextQa.transferFrom = nextQa.transferFrom || accountMethod(defaultCashAccount?.kind) || 'BAR'
                nextQa.transferToAccountId = nextQa.transferToAccountId || defaultBankAccount?.id || null
                nextQa.transferToAccountName = nextQa.transferToAccountName || defaultBankAccount?.name || null
                nextQa.transferTo = nextQa.transferTo || accountMethod(defaultBankAccount?.kind) || 'BANK'
                nextQa.paymentAccountId = null
                nextQa.paymentAccountName = null
                nextQa.paymentMethod = null
            } else if (active.type !== 'INTERNAL') {
                const fallback = active.type === 'IN' ? defaultBankAccount : (defaultCashAccount || defaultBankAccount)
                nextQa.paymentAccountId = nextQa.paymentAccountId || fallback?.id || null
                nextQa.paymentAccountName = nextQa.paymentAccountName || fallback?.name || null
                nextQa.paymentMethod = accountMethod(paymentAccountsById.get(Number(nextQa.paymentAccountId || 0))?.kind) || nextQa.paymentMethod
            }
        }
        if (active.paymentAccountId && nextQa.type !== 'TRANSFER' && nextQa.type !== 'INTERNAL') {
            const account = paymentAccountsById.get(Number(active.paymentAccountId))
            nextQa.paymentAccountId = account?.id ?? active.paymentAccountId
            nextQa.paymentAccountName = account?.name ?? nextQa.paymentAccountName
            nextQa.paymentMethod = accountMethod(account?.kind) || nextQa.paymentMethod
            nextQa.transferFromAccountId = null
            nextQa.transferFromAccountName = null
            nextQa.transferToAccountId = null
            nextQa.transferToAccountName = null
        }
        if ((active.transferFromAccountId || active.transferToAccountId) && nextQa.type === 'TRANSFER') {
            if (active.transferFromAccountId) {
                const fromAccount = paymentAccountsById.get(Number(active.transferFromAccountId))
                nextQa.transferFromAccountId = fromAccount?.id ?? active.transferFromAccountId
                nextQa.transferFromAccountName = fromAccount?.name ?? nextQa.transferFromAccountName
                nextQa.transferFrom = accountMethod(fromAccount?.kind) || nextQa.transferFrom
            }
            if (active.transferToAccountId) {
                const toAccount = paymentAccountsById.get(Number(active.transferToAccountId))
                nextQa.transferToAccountId = toAccount?.id ?? active.transferToAccountId
                nextQa.transferToAccountName = toAccount?.name ?? nextQa.transferToAccountName
                nextQa.transferTo = accountMethod(toAccount?.kind) || nextQa.transferTo
            }
            nextQa.paymentAccountId = null
            nextQa.paymentAccountName = null
            nextQa.paymentMethod = null
        }
        if ((active.budgets || []).length > 0) {
            budgetAutoDistributionRef.current = isAmountEvenlyDistributed(
                nextBudgets.map((budget) => budget.amount),
                grossAmt
            )
        }
        setQa(nextQa as QA)
        rememberCurrentBookingPattern(nextQa as QA)
        setAiMenuOpen(false)
    }, [activeSuggestion, budgetsList, defaultBankAccount, defaultCashAccount, earmarksList, grossAmt, paymentAccountsById, qa, rememberCurrentBookingPattern, setQa])

    const handleSave = React.useCallback(() => {
        rememberCurrentBookingPattern()
        onSave()
    }, [onSave, rememberCurrentBookingPattern])

    const handleSaveAndNew = React.useCallback(() => {
        rememberCurrentBookingPattern()
        saveAndNew()
    }, [rememberCurrentBookingPattern, saveAndNew])

    const handleSaveAndClose = React.useCallback(() => {
        rememberCurrentBookingPattern()
        saveAndClose()
    }, [rememberCurrentBookingPattern, saveAndClose])

    const selectBookingType = React.useCallback((type: QA['type']) => {
        const nextQa = { ...qa, type } as QA
        if (type === 'TRANSFER' && (!(nextQa as any).transferFromAccountId || !(nextQa as any).transferToAccountId)) {
            ;(nextQa as any).transferFromAccountId = defaultCashAccount?.id ?? null
            ;(nextQa as any).transferFromAccountName = defaultCashAccount?.name ?? null
            ;(nextQa as any).transferFrom = accountMethod(defaultCashAccount?.kind) ?? 'BAR'
            ;(nextQa as any).transferToAccountId = defaultBankAccount?.id ?? null
            ;(nextQa as any).transferToAccountName = defaultBankAccount?.name ?? null
            ;(nextQa as any).transferTo = accountMethod(defaultBankAccount?.kind) ?? 'BANK'
            ;(nextQa as any).paymentAccountId = null
            ;(nextQa as any).paymentAccountName = null
        } else if (type === 'INTERNAL') {
            ;(nextQa as any).paymentAccountId = null
            ;(nextQa as any).paymentAccountName = null
            ;(nextQa as any).paymentMethod = undefined
            ;(nextQa as any).transferFromAccountId = null
            ;(nextQa as any).transferToAccountId = null
            ;(nextQa as any).vatRate = 0
            ;(nextQa as any).mode = 'GROSS'
        } else if (type !== 'TRANSFER' && !(nextQa as any).paymentAccountId) {
            const fallback = defaultCashAccount ?? defaultBankAccount
            ;(nextQa as any).paymentAccountId = fallback?.id ?? null
            ;(nextQa as any).paymentAccountName = fallback?.name ?? null
            ;(nextQa as any).paymentMethod = accountMethod(fallback?.kind) ?? (nextQa as any).paymentMethod
        }
        setQa(nextQa)
    }, [defaultBankAccount, defaultCashAccount, qa, setQa])

    const tagByName = React.useMemo(() => new Map(tagDefs.map((tag) => [tag.name.toLowerCase(), tag])), [tagDefs])
    const budgetById = React.useMemo(() => new Map((budgetsForEdit || []).map((budget) => [budget.id, budget])), [budgetsForEdit])
    const earmarkById = React.useMemo(() => new Map((earmarks || []).map((earmark) => [earmark.id, earmark])), [earmarks])

    const assignmentAmount = React.useCallback((amount?: number, amountMode?: 'FULL' | 'FIXED') => {
        if (amountMode === 'FULL') return eurFmt.format(grossAmt)
        if (typeof amount === 'number' && Number.isFinite(amount) && amount > 0) return eurFmt.format(amount)
        return null
    }, [eurFmt, grossAmt])

    const focusInput = React.useCallback((input: HTMLInputElement | null) => {
        if (!input) return
        input.focus()
        input.select()
    }, [])

    React.useEffect(() => {
        window.setTimeout(() => focusInput(amountInputRef.current), 0)
    }, [focusInput])

    const clampDragOffset = React.useCallback((x: number, y: number) => {
        const modal = modalRef.current
        if (!modal) return { x, y }
        const rect = modal.getBoundingClientRect()
        const margin = 12
        const minX = margin - rect.left + dragOffset.x
        const maxX = window.innerWidth - margin - rect.right + dragOffset.x
        const minY = margin - rect.top + dragOffset.y
        const maxY = window.innerHeight - margin - rect.bottom + dragOffset.y
        return {
            x: Math.min(maxX, Math.max(minX, x)),
            y: Math.min(maxY, Math.max(minY, y))
        }
    }, [dragOffset.x, dragOffset.y])

    const startDrag = React.useCallback((e: React.PointerEvent<HTMLElement>) => {
        if (!canDrag) return
        if (e.button !== 0) return
        const target = e.target as HTMLElement | null
        if (target?.closest('button, input, select, textarea, a')) return
        dragStartRef.current = {
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            originX: dragOffset.x,
            originY: dragOffset.y
        }
        e.currentTarget.setPointerCapture(e.pointerId)
    }, [canDrag, dragOffset.x, dragOffset.y])

    const moveDrag = React.useCallback((e: React.PointerEvent<HTMLElement>) => {
        if (!canDrag) return
        const start = dragStartRef.current
        if (!start || start.pointerId !== e.pointerId) return
        const nextX = start.originX + e.clientX - start.startX
        const nextY = start.originY + e.clientY - start.startY
        setDragOffset(clampDragOffset(nextX, nextY))
    }, [canDrag, clampDragOffset])

    const endDrag = React.useCallback((e: React.PointerEvent<HTMLElement>) => {
        if (!canDrag) return
        const start = dragStartRef.current
        if (!start || start.pointerId !== e.pointerId) return
        dragStartRef.current = null
        try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { }
    }, [canDrag])

    const addBudgetAssignment = React.useCallback(() => {
        if (!hasAvailableBudgets) return
        const current = ((qa as any).budgets || []) as BudgetAssignment[]
        if (qa.type === 'INTERNAL') {
            const amount = current.length === 0 ? -grossAmt : grossAmt
            setQa({ ...(qa as any), budgets: [...current, { budgetId: 0, amount }] } as any)
            return
        }

        const next = [...current, { budgetId: 0, amount: 0 }]
        if (budgetAutoDistributionRef.current) {
            const amounts = distributeAmountEvenly(grossAmt, next.length)
            next.forEach((budget, index) => { budget.amount = amounts[index] })
        }
        setQa({ ...(qa as any), budgets: next } as any)
    }, [grossAmt, hasAvailableBudgets, qa, setQa])

    const addEarmarkAssignment = React.useCallback(() => {
        if (!hasAvailableEarmarks) return
        const current = ((qa as any).earmarksAssigned || []) as EarmarkAssignment[]
        const amount = qa.type === 'INTERNAL' && current.length === 0 ? -grossAmt : grossAmt
        setQa({ ...(qa as any), earmarksAssigned: [...current, { earmarkId: 0, amount }] } as any)
    }, [grossAmt, hasAvailableEarmarks, qa, setQa])

    const closeModal = React.useCallback(() => {
        if (onRequestClose) onRequestClose()
        else {
            onClose()
            setFiles([])
        }
    }, [onClose, onRequestClose, setFiles])

    const lastGrossAmtRef = React.useRef(grossAmt)

    React.useEffect(() => {
        if (budgetsList.length === 0) budgetAutoDistributionRef.current = true
    }, [budgetsList.length])

    React.useEffect(() => {
        const previousGross = lastGrossAmtRef.current
        if (previousGross === grossAmt) return

        let nextQa: QA | null = null

        if (qa.type !== 'INTERNAL' && budgetsList.length > 0 && budgetAutoDistributionRef.current) {
            const amounts = distributeAmountEvenly(grossAmt, budgetsList.length)
            nextQa = {
                ...(nextQa ?? qa),
                budgets: budgetsList.map((budget, index) => ({ ...budget, amount: amounts[index] }))
            } as QA
        } else if (qa.type === 'INTERNAL' && budgetsList.length === 1 && Math.abs((budgetsList[0]?.amount || 0) - previousGross) < 0.001) {
            nextQa = {
                ...(nextQa ?? qa),
                budgets: [{ ...budgetsList[0], amount: grossAmt }]
            } as QA
        }

        if (earmarksList.length === 1 && Math.abs((earmarksList[0]?.amount || 0) - previousGross) < 0.001) {
            nextQa = {
                ...(nextQa ?? qa),
                earmarksAssigned: [{ ...earmarksList[0], amount: grossAmt }]
            } as QA
        }

        if (nextQa) setQa(nextQa)
        lastGrossAmtRef.current = grossAmt
    }, [grossAmt, budgetsList, earmarksList, qa, setQa])

    return (
        <div className={`modal-overlay quick-add-modal-overlay${windowMode ? ' detached-quick-add-overlay' : ''}`} role="dialog" aria-modal="true">
            <div
                ref={modalRef}
                className={`modal booking-modal quick-add-modal booking-modal--type-${qa.type.toLowerCase()}${windowMode ? ' detached-quick-add-modal' : ''}`}
                onClick={(e) => e.stopPropagation()}
                style={windowMode ? undefined : { transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }}
            >
                <header
                    className={`modal-header-flex${canDrag ? ' booking-modal-drag-handle' : ''}${windowMode ? ' detached-booking-titlebar' : ''}`}
                    title={canDrag || windowMode ? 'Zum Verschieben ziehen' : undefined}
                    onPointerDown={startDrag}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                >
                    <h2>{title || '+ Buchung'}</h2>
                    <div className="booking-kind-switch" role="group" aria-label="Buchungsart wählen">
                        {([
                            ['IN', 'Einnahme'],
                            ['OUT', 'Ausgabe'],
                            ['TRANSFER', 'Umbuchung'],
                            ['INTERNAL', 'Intern']
                        ] as const).map(([type, label]) => (
                            <button
                                key={type}
                                type="button"
                                className={`btn booking-kind-switch__button ${qa.type === type ? 'btn-toggle-active' : ''} ${type === 'IN' ? 'btn-type-in' : type === 'OUT' ? 'btn-type-out' : ''}`}
                                onClick={() => selectBookingType(type)}
                                aria-pressed={qa.type === type}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className="booking-modal-header-actions">
                        {onDetach && (
                            <button className="btn ghost booking-modal-icon-btn" type="button" onClick={onDetach} title="In eigenes Fenster abdocken" aria-label="In eigenes Fenster abdocken">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M15 3h6v6" />
                                    <path d="M10 14 21 3" />
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                </svg>
                            </button>
                        )}
                        {windowMode ? (
                            <div onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                                <WindowControls onClose={closeModal} />
                            </div>
                        ) : (
                            <button className="btn ghost booking-modal-icon-btn booking-modal-close-btn" type="button" onClick={closeModal} onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} title="Schließen (ESC)" aria-label="Schließen">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                                </svg>
                            </button>
                        )}
                    </div>
                </header>

                {/* Unsaved changes confirmation */}
                {confirmingClose && (
                    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.55)', display: 'grid', placeItems: 'center' }}>
                        <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400, width: '90vw', padding: '24px 28px', borderRadius: 14, border: '2px solid var(--accent)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', textAlign: 'center' }}>
                            <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
                            <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700 }}>Ungespeicherte Änderungen</h3>
                            <p style={{ margin: '0 0 20px', fontSize: 13, opacity: 0.8, lineHeight: 1.5 }}>
                                Du hast Änderungen an dieser Buchung vorgenommen.<br/>Möchtest du diese wirklich verwerfen?
                            </p>
                            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                                <button type="button" className="btn" onClick={onCancelDiscard} style={{ background: 'color-mix(in oklab, var(--accent) 20%, transparent)', fontWeight: 600 }}>
                                    Fortsetzen
                                </button>
                                <button type="button" className="btn" onClick={onConfirmDiscard} style={{ background: 'color-mix(in oklab, var(--danger) 80%, transparent)', color: '#fff', fontWeight: 600 }}>
                                    Verwerfen
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                
                <form
                    className="quick-add-form"
                    onSubmit={(e) => { e.preventDefault(); if (!saveBlocked) handleSave(); }}
                >
                    {/* Live Summary */}
                    <div className={`card summary-card booking-ai-summary ${aiSuggestions.length ? 'booking-ai-summary--active' : ''}`}>
                        <div className="booking-ai-summary__main">
                            <div className="summary-text-bold">
                                {(() => {
                                    const date = fmtDate(qa.date)
                                    const type = qa.type
                                    const pm = qa.type === 'TRANSFER'
                                        ? `${(qa as any).transferFromAccountName || paymentAccountsById.get(Number((qa as any).transferFromAccountId || 0))?.name || paymentMethodLabel((qa as any).transferFrom)} → ${(qa as any).transferToAccountName || paymentAccountsById.get(Number((qa as any).transferToAccountId || 0))?.name || paymentMethodLabel((qa as any).transferTo)}`
                                        : qa.type === 'INTERNAL'
                                            ? 'Intern'
                                            : ((qa as any).paymentAccountName || paymentAccountsById.get(Number((qa as any).paymentAccountId || 0))?.name || 'Konto fehlt')
                                    const amount = (() => {
                                        if (qa.type === 'TRANSFER') return eurFmt.format(Number((qa as any).grossAmount || 0))
                                        if ((qa as any).mode === 'GROSS') return eurFmt.format(Number((qa as any).grossAmount || 0))
                                        const n = Number(qa.netAmount || 0); const v = Number(qa.vatRate || 0); const g = Math.round((n * (1 + v / 100)) * 100) / 100
                                        return eurFmt.format(g)
                                    })()
                                    const sphere = qa.sphere
                                    const amountColor = type === 'IN' ? 'var(--success)' : type === 'OUT' ? 'var(--danger)' : 'inherit'
                                    return <>{BOOKING_TYPE_LABELS[type]} · <span style={{ color: amountColor }}>{amount}</span> · {pm} · {date}{type !== 'TRANSFER' ? ` · ${SPHERE_LABELS[sphere]}` : ''}</>
                                })()}
                            </div>
                        </div>
                        {aiSuggestions.length > 0 && (
                            <div className="booking-ai-assist" ref={aiAssistRef}>
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
                                            <span>Lokal gelerntes MVP</span>
                                        </div>
                                        <div className="booking-ai-assist__list">
                                            {aiSuggestions.map((suggestion) => {
                                                const typeClass = suggestion.type === 'IN' ? 'booking-ai-chip--in' : suggestion.type === 'OUT' ? 'booking-ai-chip--out' : 'booking-ai-chip--neutral'
                                                const chipClass = (partKey: AISuggestionPartKey, extra = '') => `booking-ai-chip ${extra} ${isAISuggestionPartDisabled(suggestion.key, partKey) ? 'booking-ai-chip--disabled' : ''}`
                                                const active = activeSuggestion(suggestion)
                                                const hasActiveParts = !!active.type || !!active.sphere || !!active.paymentAccountId || !!active.transferFromAccountId || !!active.transferToAccountId || !!active.tags?.length || !!active.budgets?.length || !!active.earmarks?.length
                                                return (
                                                <div key={suggestion.key} className="booking-ai-suggestion">
                                                    <div className="booking-ai-suggestion__copy">
                                                        <strong>{suggestion.title}</strong>
                                                        <span>{suggestion.reason}{suggestion.learned ? ' · gelernt' : ''}</span>
                                                    </div>
                                                    <div className="booking-ai-suggestion__chips">
                                                        {suggestion.type && (
                                                            <button
                                                                type="button"
                                                                className={chipClass('type', typeClass)}
                                                                onClick={() => toggleAISuggestionPart(suggestion.key, 'type')}
                                                                aria-pressed={!isAISuggestionPartDisabled(suggestion.key, 'type')}
                                                                title="Art für diese Übernahme ein-/ausschließen"
                                                            >
                                                                {suggestion.type}
                                                            </button>
                                                        )}
                                                        {suggestion.sphere && (
                                                            <button
                                                                type="button"
                                                                className={chipClass('sphere', 'booking-ai-chip--sphere')}
                                                                onClick={() => toggleAISuggestionPart(suggestion.key, 'sphere')}
                                                                aria-pressed={!isAISuggestionPartDisabled(suggestion.key, 'sphere')}
                                                                title="Sphäre für diese Übernahme ein-/ausschließen"
                                                            >
                                                                {suggestion.sphere}
                                                            </button>
                                                        )}
                                                        {suggestion.paymentAccountId && (() => {
                                                            const partKey: AISuggestionPartKey = 'paymentAccount'
                                                            const account = paymentAccountsById.get(Number(suggestion.paymentAccountId))
                                                            return (
                                                                <button
                                                                    type="button"
                                                                    className={chipClass(partKey, 'booking-ai-chip--account')}
                                                                    onClick={() => toggleAISuggestionPart(suggestion.key, partKey)}
                                                                    aria-pressed={!isAISuggestionPartDisabled(suggestion.key, partKey)}
                                                                    title="Konto für diese Übernahme ein-/ausschließen"
                                                                    style={!isAISuggestionPartDisabled(suggestion.key, partKey) && account?.color ? {
                                                                        borderColor: account.color,
                                                                        background: `${account.color}24`,
                                                                        color: account.color
                                                                    } : undefined}
                                                                >
                                                                    Konto: {account?.name || `#${suggestion.paymentAccountId}`}
                                                                </button>
                                                            )
                                                        })()}
                                                        {suggestion.transferFromAccountId && (() => {
                                                            const partKey: AISuggestionPartKey = 'transferFromAccount'
                                                            const account = paymentAccountsById.get(Number(suggestion.transferFromAccountId))
                                                            return (
                                                                <button
                                                                    type="button"
                                                                    className={chipClass(partKey, 'booking-ai-chip--account')}
                                                                    onClick={() => toggleAISuggestionPart(suggestion.key, partKey)}
                                                                    aria-pressed={!isAISuggestionPartDisabled(suggestion.key, partKey)}
                                                                    title="Quellkonto für diese Übernahme ein-/ausschließen"
                                                                    style={!isAISuggestionPartDisabled(suggestion.key, partKey) && account?.color ? {
                                                                        borderColor: account.color,
                                                                        background: `${account.color}24`,
                                                                        color: account.color
                                                                    } : undefined}
                                                                >
                                                                    Von: {account?.name || `#${suggestion.transferFromAccountId}`}
                                                                </button>
                                                            )
                                                        })()}
                                                        {suggestion.transferToAccountId && (() => {
                                                            const partKey: AISuggestionPartKey = 'transferToAccount'
                                                            const account = paymentAccountsById.get(Number(suggestion.transferToAccountId))
                                                            return (
                                                                <button
                                                                    type="button"
                                                                    className={chipClass(partKey, 'booking-ai-chip--account')}
                                                                    onClick={() => toggleAISuggestionPart(suggestion.key, partKey)}
                                                                    aria-pressed={!isAISuggestionPartDisabled(suggestion.key, partKey)}
                                                                    title="Zielkonto für diese Übernahme ein-/ausschließen"
                                                                    style={!isAISuggestionPartDisabled(suggestion.key, partKey) && account?.color ? {
                                                                        borderColor: account.color,
                                                                        background: `${account.color}24`,
                                                                        color: account.color
                                                                    } : undefined}
                                                                >
                                                                    Nach: {account?.name || `#${suggestion.transferToAccountId}`}
                                                                </button>
                                                            )
                                                        })()}
                                                        {(suggestion.tags || []).map((tag) => {
                                                            const partKey: AISuggestionPartKey = `tag:${tag}`
                                                            const tagDef = tagByName.get(tag.toLowerCase())
                                                            return (
                                                                <button
                                                                    type="button"
                                                                    key={tag}
                                                                    className={chipClass(partKey, 'booking-ai-chip--tag')}
                                                                    onClick={() => toggleAISuggestionPart(suggestion.key, partKey)}
                                                                    aria-pressed={!isAISuggestionPartDisabled(suggestion.key, partKey)}
                                                                    title="Tag für diese Übernahme ein-/ausschließen"
                                                                    style={!isAISuggestionPartDisabled(suggestion.key, partKey) && tagDef?.color ? {
                                                                        borderColor: tagDef.color,
                                                                        background: `${tagDef.color}26`,
                                                                        color: tagDef.color
                                                                    } : undefined}
                                                                >
                                                                    {tag}
                                                                </button>
                                                            )
                                                        })}
                                                        {(suggestion.budgets || []).map((budget) => {
                                                            const partKey: AISuggestionPartKey = `budget:${budget.id}`
                                                            const info = budgetById.get(budget.id)
                                                            const amount = assignmentAmount(budget.amount, budget.amountMode)
                                                            return (
                                                                <button
                                                                    type="button"
                                                                    key={`budget-${budget.id}`}
                                                                    className={chipClass(partKey, 'booking-ai-chip--budget')}
                                                                    onClick={() => toggleAISuggestionPart(suggestion.key, partKey)}
                                                                    aria-pressed={!isAISuggestionPartDisabled(suggestion.key, partKey)}
                                                                    title="Budget für diese Übernahme ein-/ausschließen"
                                                                    style={!isAISuggestionPartDisabled(suggestion.key, partKey) && info?.color ? {
                                                                        borderColor: info.color,
                                                                        background: `${info.color}22`,
                                                                        color: info.color
                                                                    } : undefined}
                                                                >
                                                                    {info?.label || `Budget #${budget.id}`}{amount ? ` · ${amount}` : ''}
                                                                </button>
                                                            )
                                                        })}
                                                        {(suggestion.earmarks || []).map((earmark) => {
                                                            const partKey: AISuggestionPartKey = `earmark:${earmark.id}`
                                                            const info = earmarkById.get(earmark.id)
                                                            const amount = assignmentAmount(earmark.amount, earmark.amountMode)
                                                            return (
                                                                <button
                                                                    type="button"
                                                                    key={`earmark-${earmark.id}`}
                                                                    className={chipClass(partKey, 'booking-ai-chip--earmark')}
                                                                    onClick={() => toggleAISuggestionPart(suggestion.key, partKey)}
                                                                    aria-pressed={!isAISuggestionPartDisabled(suggestion.key, partKey)}
                                                                    title="Zweckbindung für diese Übernahme ein-/ausschließen"
                                                                    style={!isAISuggestionPartDisabled(suggestion.key, partKey) && info?.color ? {
                                                                        borderColor: info.color,
                                                                        background: `${info.color}22`,
                                                                        color: info.color
                                                                    } : undefined}
                                                                >
                                                                    {info ? `${info.code} ${info.name}` : `Zweckbindung #${earmark.id}`}{amount ? ` · ${amount}` : ''}
                                                                </button>
                                                            )
                                                        })}
                                                    </div>
                                                    <div className="booking-ai-suggestion__actions">
                                                        <button type="button" className="btn primary booking-ai-suggestion__apply" onClick={() => applyAISuggestion(suggestion)} disabled={!hasActiveParts} title="Aktive Bestandteile übernehmen" aria-label="Aktive Bestandteile übernehmen">+</button>
                                                    </div>
                                                </div>
                                            )})}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Blocks A+B in a side-by-side grid on wide screens */}
                    <div className="block-grid block-grid-mb booking-primary-grid">
                        {/* Block A – Basisinfos */}
                        <div className="card form-card">
                            <div className="helper helper-mb">Basis</div>
                            <div className="row booking-basis-fields">
                                <div className={`field booking-floating-field${qa.date ? ' booking-floating-field--filled' : ''}`}>
                                    <label htmlFor="quick-add-date">Datum <span className="req-asterisk" aria-hidden="true">*</span></label>
                                    <span className="booking-date-input-wrap">
                                        <input id="quick-add-date" ref={dateInputRef} className="input" type="date" value={qa.date} onChange={(e) => setQa({ ...qa, date: e.target.value })} aria-label="Datum der Buchung" required />
                                        <button
                                            type="button"
                                            className="booking-date-picker-button"
                                            aria-label="Kalender zur Datumsauswahl öffnen"
                                            onClick={() => dateInputRef.current?.showPicker()}
                                        >
                                            <svg className="booking-date-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none">
                                                <rect x="3" y="5" width="18" height="16" rx="2" />
                                                <path d="M16 3v4M8 3v4M3 10h18" />
                                            </svg>
                                        </button>
                                    </span>
                                </div>
                                {qa.type !== 'TRANSFER' && (
                                    <div className="field booking-floating-field booking-floating-field--filled booking-floating-field--with-info">
                                        <label htmlFor="quick-add-sphere">Bereich</label>
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
                                                    className="booking-inline-info booking-floating-field__info"
                                                    aria-label="Erklärung zu den steuerlichen Bereichen"
                                                >
                                                    i
                                                </button>
                                            )}
                                        </HoverTooltip>
                                        <SelectDropdown
                                            id="quick-add-sphere"
                                            value={qa.sphere}
                                            onChange={(value) => setQa({ ...qa, sphere: value as any })}
                                            ariaLabel="Sphäre der Buchung"
                                            options={[
                                                { value: 'IDEELL', label: 'Ideeller Bereich' },
                                                { value: 'ZWECK', label: 'Zweckbetrieb' },
                                                { value: 'VERMOEGEN', label: 'Vermögensverwaltung' },
                                                { value: 'WGB', label: 'Wirtschaftlicher Geschäftsbetrieb' },
                                            ]}
                                        />
                                    </div>
                                )}
                                {qa.type === 'TRANSFER' ? (
                                    <div className="field field-full-width">
                                        <label>Kontotransfer <span className="req-asterisk" aria-hidden="true">*</span></label>
                                        <div className="flex gap-8">
                                            <SelectDropdown
                                                value={String((qa as any).transferFromAccountId ?? '')}
                                                placeholder="Von Konto wählen"
                                                style={{ color: paymentAccountsById.get(Number((qa as any).transferFromAccountId || 0))?.color || undefined }}
                                                onChange={(value) => {
                                                    const nextId = value ? Number(value) : null
                                                    const nextAccount = nextId ? paymentAccountsById.get(nextId) : undefined
                                                    setQa({
                                                        ...(qa as any),
                                                        transferFromAccountId: nextId,
                                                        transferFromAccountName: nextAccount?.name ?? null,
                                                        transferFrom: accountMethod(nextAccount?.kind) ?? undefined,
                                                        paymentMethod: undefined,
                                                    } as any)
                                                }}
                                                ariaLabel="Transfer von Konto"
                                                options={activePaymentAccounts.map((account) => ({ value: String(account.id), label: account.name, color: account.color || undefined }))}
                                            />
                                            <SelectDropdown
                                                value={String((qa as any).transferToAccountId ?? '')}
                                                placeholder="Nach Konto wählen"
                                                style={{ color: paymentAccountsById.get(Number((qa as any).transferToAccountId || 0))?.color || undefined }}
                                                onChange={(value) => {
                                                    const nextId = value ? Number(value) : null
                                                    const nextAccount = nextId ? paymentAccountsById.get(nextId) : undefined
                                                    setQa({
                                                        ...(qa as any),
                                                        transferToAccountId: nextId,
                                                        transferToAccountName: nextAccount?.name ?? null,
                                                        transferTo: accountMethod(nextAccount?.kind) ?? undefined,
                                                        paymentMethod: undefined,
                                                    } as any)
                                                }}
                                                ariaLabel="Transfer nach Konto"
                                                options={activePaymentAccounts.map((account) => ({ value: String(account.id), label: account.name, color: account.color || undefined }))}
                                            />
                                        </div>
                                    </div>
                                ) : qa.type === 'INTERNAL' ? (
                                    <div className="field">
                                        <label>Zahlweg</label>
                                        <div className="badge pm-account-badge pm-internal">intern</div>
                                    </div>
                                ) : (
                                    <div className="field booking-floating-field booking-floating-field--filled">
                                        <label htmlFor="quick-add-account">Konto <span className="req-asterisk" aria-hidden="true">*</span></label>
                                        <SelectDropdown
                                            id="quick-add-account"
                                            value={String((qa as any).paymentAccountId ?? '')}
                                            placeholder="Konto wählen"
                                            style={{ color: paymentAccountsById.get(Number((qa as any).paymentAccountId || 0))?.color || undefined }}
                                            onChange={(value) => {
                                                const nextId = value ? Number(value) : null
                                                const nextAccount = nextId ? paymentAccountsById.get(nextId) : undefined
                                                setQa({
                                                    ...(qa as any),
                                                    paymentAccountId: nextId,
                                                    paymentAccountName: nextAccount?.name ?? null,
                                                    paymentMethod: accountMethod(nextAccount?.kind) ?? undefined,
                                                } as any)
                                            }}
                                            ariaLabel="Buchungskonto wählen"
                                            options={activePaymentAccounts.map((account) => ({ value: String(account.id), label: account.name, color: account.color || undefined }))}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Block B – Finanzdetails */}
                        <div className="card form-card card-finance" style={{ '--booking-account-color': financeAccountColor || 'var(--accent)' } as React.CSSProperties}>
                            <div className="helper helper-mb">Finanzen</div>
                            <div className="row">
                                {qa.type === 'TRANSFER' ? (
                                    <div className="field field-full-width finance-amount-highlight">
                                        <span className={`adorn-wrap booking-floating-control${(qa as any).grossAmount !== null && (qa as any).grossAmount !== undefined && (qa as any).grossAmount !== '' ? ' booking-floating-control--filled' : ''}`}>
                                            <label htmlFor="quick-add-transfer-amount">Betrag (Transfer) <span className="req-asterisk" aria-hidden="true">*</span></label>
                                            <input id="quick-add-transfer-amount" ref={amountInputRef} className={`input input-transfer ${hasInvalidAmount ? 'input-error' : ''}`} type="number" step="0.01" value={(qa as any).grossAmount ?? ''}
                                                onFocus={(e) => e.currentTarget.select()}
                                                onClick={(e) => e.currentTarget.select()}
                                                onChange={(e) => {
                                                    const v = Number(e.target.value)
                                                    setQa({ ...qa, grossAmount: v })
                                                }}
                                                aria-label="Transfer-Betrag"
                                                aria-invalid={hasInvalidAmount} />
                                            <span className="adorn-suffix">€</span>
                                        </span>
                                    </div>
                                ) : (
                                    <>
                                        <div className="field finance-amount-highlight">
                                            <div className="flex-gap-8">
                                                <span className="booking-select-shell">
                                                    <SelectDropdown
                                                        value={(qa as any).mode ?? 'NET'}
                                                        onChange={(value) => {
                                                            const newMode = value as 'NET' | 'GROSS'
                                                            const next = { ...qa, mode: newMode } as any
                                                            if (newMode === 'NET') {
                                                                // Falls kein Netto gesetzt ist, aus Brutto übernehmen
                                                                if (next.netAmount == null || isNaN(next.netAmount)) {
                                                                    if (typeof next.grossAmount === 'number') next.netAmount = next.grossAmount
                                                                    else next.netAmount = 0
                                                                }
                                                                // Wenn bisher vatRate=0 (vom Brutto-Modus), setze Standard auf 19%
                                                                if (Number(next.vatRate) === 0) next.vatRate = 19
                                                            } else if (newMode === 'GROSS') {
                                                                // Wechsel zu Brutto: vatRate immer 0, Brutto ggf. aus Netto berechnen
                                                                if (typeof next.netAmount === 'number' && (next.grossAmount == null || isNaN(next.grossAmount))) {
                                                                    const rate = Number(next.vatRate) || 0
                                                                    next.grossAmount = Math.round((next.netAmount * (1 + rate / 100)) * 100) / 100
                                                                }
                                                                next.vatRate = 0
                                                            }
                                                            setQa(next)
                                                        }}
                                                        ariaLabel="Netto oder Brutto Modus"
                                                        options={[
                                                            { value: 'NET', label: 'Netto' },
                                                            { value: 'GROSS', label: 'Brutto' },
                                                        ]}
                                                    />
                                                </span>
                                                <span className={`adorn-wrap flex-1 booking-floating-control${((qa as any).mode === 'GROSS' ? (qa as any).grossAmount : qa.netAmount) !== null && ((qa as any).mode === 'GROSS' ? (qa as any).grossAmount : qa.netAmount) !== undefined && ((qa as any).mode === 'GROSS' ? (qa as any).grossAmount : qa.netAmount) !== '' ? ' booking-floating-control--filled' : ''}`}>
                                                    <label htmlFor="quick-add-amount">{(qa as any).mode === 'GROSS' ? 'Brutto' : 'Netto'} <span className="req-asterisk" aria-hidden="true">*</span></label>
                                                    <input id="quick-add-amount" ref={amountInputRef} className={`input amount-input ${hasInvalidAmount ? 'input-error' : ''}`} type="number" step="0.01" value={(qa as any).mode === 'GROSS' ? (qa as any).grossAmount ?? '' : qa.netAmount ?? ''}
                                                        onFocus={(e) => e.currentTarget.select()}
                                                        onClick={(e) => e.currentTarget.select()}
                                                        onChange={(e) => {
                                                            const v = Number(e.target.value)
                                                            if ((qa as any).mode === 'GROSS') setQa({ ...qa, grossAmount: v })
                                                            else setQa({ ...qa, netAmount: v })
                                                        }}
                                                        aria-label={(qa as any).mode === 'GROSS' ? 'Brutto-Betrag' : 'Netto-Betrag'}
                                                        aria-invalid={hasInvalidAmount} />
                                                    <span className="adorn-suffix">€</span>
                                                </span>
                                            </div>
                                        </div>
                                        {(qa as any).mode === 'NET' && (
                                            <div className="field booking-floating-field booking-floating-field--filled">
                                                <label htmlFor="quick-add-vat-rate">USt %</label>
                                                <SelectDropdown
                                                    id="quick-add-vat-rate"
                                                    value={String(qa.vatRate)}
                                                    onChange={(value) => setQa({ ...qa, vatRate: Number(value) })}
                                                    ariaLabel="Umsatzsteuer Prozentsatz"
                                                    options={[
                                                        { value: '0', label: '0% (steuerfrei)' },
                                                        { value: '7', label: '7%' },
                                                        { value: '19', label: '19%' },
                                                    ]}
                                                />
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                            {(qa.type === 'IN' || qa.type === 'OUT') && (
                                <div className="field field-full-width booking-floating-field booking-floating-field--filled booking-finance-party">
                                    <label htmlFor="quick-add-party">{qa.type === 'OUT' ? 'Lieferant / Zahlungsempfänger' : 'Kunde / Zahlungspflichtiger'}</label>
                                    <PartySelector
                                        valueId={qa.partyId}
                                        valueName={qa.counterparty || ''}
                                        role={qa.type === 'OUT' ? 'SUPPLIER' : 'CUSTOMER'}
                                        inputId="quick-add-party"
                                        onChange={(selection) => setQa({ ...qa, partyId: selection.partyId, counterparty: selection.name })}
                                    />
                                </div>
                            )}
                            <div className="row">
                                <div className="field" style={{ gridColumn: '1 / -1' }}>
                                    {hasOutOfRange && (
                                        <div className="helper" style={{ color: 'var(--danger)', marginTop: 6 }}>⚠ Es sind Zuordnungen außerhalb des gültigen Zeitraums ausgewählt. Speichern ist blockiert.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="card form-card booking-description-card">
                        <div className="field field-full-width booking-floating-field booking-floating-field--filled">
                            <label htmlFor="quick-add-description">Beschreibung</label>
                            <SuggestionInput
                                id="quick-add-description"
                                value={qa.description}
                                suggestions={descSuggest}
                                onChange={(value) => setQa({ ...qa, description: value })}
                                placeholder="Was wurde gebucht? z. B. Mitgliedsbeitrag Juli"
                            />
                        </div>
                    </div>

                    <div className={`card form-card booking-assignments-card${qa.type === 'INTERNAL' ? ' booking-assignments-card--required' : ''}`}>
                        <div className="booking-section-heading">
                            <div>
                                <strong>Zuordnungen</strong>
                                <div className="helper">Optional für Einnahmen und Ausgaben, erforderlich für interne Buchungen.</div>
                            </div>
                            {(budgetsList.length > 0 || earmarksList.length > 0) && (
                                <span className="badge">{budgetsList.length + earmarksList.length} ausgewählt</span>
                            )}
                        </div>

                            {/* Budget Zuordnungen (mehrfach möglich) */}
                            <div className="row">
                                <div className="field" style={{ gridColumn: '1 / -1' }}>
                                    <div className="quick-add-assignment-title">
                                        Budget
                                        {hasAvailableBudgets ? (
                                            <button
                                                type="button"
                                                className="btn ghost"
                                                style={{ padding: '2px 6px', fontSize: '0.85rem' }}
                                                onClick={addBudgetAssignment}
                                                title="Weiteres Budget hinzufügen"
                                            >
                                                +
                                            </button>
                                        ) : (
                                            <span className="helper" style={{ fontWeight: 400 }}>Kein Budget vorhanden</span>
                                        )}
                                        {hasAvailableBudgets && budgetsList.length === 0 && (
                                            <span className="helper booking-assignment-empty-hint" title="Klicke + zum Hinzufügen.">Kein Budget zugeordnet.</span>
                                        )}
                                    </div>
                                    {(() => {
                                        const budgetIds = budgetsList.filter((b) => b.budgetId).map((b) => b.budgetId)
                                        const hasDuplicateBudgets = new Set(budgetIds).size !== budgetIds.length
                                        const totalBudgetAmount = budgetsList.reduce((sum, b) => sum + (b.amount || 0), 0)
                                        const exceedsTotal = qa.type !== 'INTERNAL' && totalBudgetAmount > grossAmt * 1.001
                                        return budgetsList.length > 0 ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                {budgetsList.map((ba, idx) => {
                                                    const isDuplicate = budgetIds.filter((id) => id === ba.budgetId).length > 1
                                                    const isInvalid = ba.budgetId && invalidBudgetIds.has(ba.budgetId)
                                                    return (
                                                        <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                            <SelectDropdown
                                                                style={{ flex: 1, opacity: isInvalid ? 0.8 : 1 }}
                                                                value={ba.budgetId ? String(ba.budgetId) : ''}
                                                                invalid={!!(isDuplicate || isInvalid)}
                                                                placeholder="— Budget wählen —"
                                                                onChange={(value) => {
                                                                    const next = [...budgetsList]
                                                                    next[idx] = { ...next[idx], budgetId: value ? Number(value) : 0 }
                                                                    setQa({ ...(qa as any), budgets: next } as any)
                                                                }}
                                                                options={[
                                                                    { value: '', label: '— Budget wählen —' },
                                                                    ...(() => {
                                                                    const activeIds = new Set(availableBudgets.map((b: any) => b.id))
                                                                    const selectedId = Number(ba.budgetId || 0)
                                                                    const selectedMissing = selectedId && !activeIds.has(selectedId)
                                                                    const selected = selectedMissing ? (budgetsForEdit || []).find((b: any) => b.id === selectedId) : null
                                                                    return [
                                                                        ...(selectedMissing ? [{ value: String(selectedId), label: `${(selected as any)?.label ?? `Budget #${selectedId}`} (archiviert)`, disabled: true }] : []),
                                                                        ...availableBudgets.map((b: any) => {
                                                                    const eff = budgetEffectiveRange(b)
                                                                    const disabled = eff.enforce ? !inRange(qa.date, eff.start, eff.end) : false
                                                                    const suffix = eff.enforce ? ` (${fmtRange(eff.start, eff.end) || 'Zeitraum'})` : ''
                                                                    return { value: String(b.id), label: `${b.label}${suffix}`, disabled }
                                                                        })
                                                                    ]
                                                                })()
                                                                ]}
                                                            />
                                                            <span className="adorn-wrap" style={{ width: 110 }}>
                                                                <input
                                                                    className="input"
                                                                    type="number"
                                                                    step="0.01"
                                                                    min={qa.type === 'INTERNAL' ? undefined : '0'}
                                                                    value={ba.amount ?? ''}
                                                                    onChange={(e) => {
                                                                        budgetAutoDistributionRef.current = false
                                                                        const next = [...budgetsList]
                                                                        next[idx] = { ...next[idx], amount: e.target.value ? Number(e.target.value) : 0 }
                                                                        setQa({ ...(qa as any), budgets: next } as any)
                                                                    }}
                                                                    title="Betrag für dieses Budget"
                                                                />
                                                                <span className="adorn-suffix">€</span>
                                                            </span>
                                                            <button
                                                                type="button"
                                                                className="btn ghost"
                                                                style={{ padding: '2px 6px', color: 'var(--danger)' }}
                                                                onClick={() => {
                                                                    const remaining = budgetsList.filter((_, i) => i !== idx)
                                                                    const amounts = qa.type !== 'INTERNAL' && budgetAutoDistributionRef.current
                                                                        ? distributeAmountEvenly(grossAmt, remaining.length)
                                                                        : []
                                                                    const next = amounts.length
                                                                        ? remaining.map((budget, index) => ({ ...budget, amount: amounts[index] }))
                                                                        : remaining
                                                                    setQa({ ...(qa as any), budgets: next } as any)
                                                                }}
                                                                title="Entfernen"
                                                            >✕</button>
                                                        </div>
                                                    )
                                                })}
                                                {hasDuplicateBudgets && (
                                                    <div className="helper" style={{ color: 'var(--danger)' }}>⚠ Ein Budget kann nur einmal zugeordnet werden</div>
                                                )}
                                                {qa.type !== 'INTERNAL' && budgetsList.length > 1 && budgetAutoDistributionRef.current && (
                                                    <div className="helper">Automatisch gleichmäßig verteilt – manuelle Änderungen bleiben erhalten.</div>
                                                )}
                                                {exceedsTotal && (
                                                    <div className="helper" style={{ color: 'var(--danger)' }}>⚠ Summe ({totalBudgetAmount.toFixed(2)} €) übersteigt Buchungsbetrag ({grossAmt.toFixed(2)} €)</div>
                                                )}
                                                {qa.type === 'INTERNAL' && budgetsList.length > 0 && internalAssignmentValidation.budgetHint && (
                                                    <div className="helper" style={{ color: 'var(--danger)' }}>{internalAssignmentValidation.budgetHint}</div>
                                                )}
                                                {invalidBudgetIds.size > 0 && (
                                                    <div className="helper" style={{ color: 'var(--danger)' }}>⚠ Mindestens ein Budget ist für dieses Datum nicht gültig</div>
                                                )}
                                            </div>
                                        ) : null
                                    })()}
                                </div>
                            </div>

                            {/* Zweckbindung Zuordnungen (mehrfach möglich) */}
                            <div className="row">
                                <div className="field" style={{ gridColumn: '1 / -1' }}>
                                    <div className="quick-add-assignment-title">
                                        Zweckbindung
                                        {hasAvailableEarmarks ? (
                                            <button
                                                type="button"
                                                className="btn ghost"
                                                style={{ padding: '2px 6px', fontSize: '0.85rem' }}
                                                onClick={addEarmarkAssignment}
                                                title="Weitere Zweckbindung hinzufügen"
                                            >
                                                +
                                            </button>
                                        ) : (
                                            <span className="helper" style={{ fontWeight: 400 }}>Keine Zweckbindung vorhanden</span>
                                        )}
                                        {hasAvailableEarmarks && earmarksList.length === 0 && (
                                            <span className="helper booking-assignment-empty-hint" title="Klicke + zum Hinzufügen.">Keine Zweckbindung zugeordnet.</span>
                                        )}
                                    </div>
                                    {(() => {
                                        const earmarkIds = earmarksList.filter((e) => e.earmarkId).map((e) => e.earmarkId)
                                        const hasDuplicateEarmarks = new Set(earmarkIds).size !== earmarkIds.length
                                        const totalEarmarkAmount = earmarksList.reduce((sum, e) => sum + (e.amount || 0), 0)
                                        const exceedsTotal = qa.type !== 'INTERNAL' && totalEarmarkAmount > grossAmt * 1.001
                                        return earmarksList.length > 0 ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                {earmarksList.map((ea, idx) => {
                                                    const isDuplicate = earmarkIds.filter((id) => id === ea.earmarkId).length > 1
                                                    const isInvalid = ea.earmarkId && invalidEarmarkIds.has(ea.earmarkId)
                                                    return (
                                                        <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                            <SelectDropdown
                                                                style={{ flex: 1, opacity: isInvalid ? 0.8 : 1 }}
                                                                value={ea.earmarkId ? String(ea.earmarkId) : ''}
                                                                invalid={!!(isDuplicate || isInvalid)}
                                                                placeholder="— Zweckbindung wählen —"
                                                                onChange={(value) => {
                                                                    const next = [...earmarksList]
                                                                    next[idx] = { ...next[idx], earmarkId: value ? Number(value) : 0 }
                                                                    setQa({ ...(qa as any), earmarksAssigned: next } as any)
                                                                }}
                                                                options={[
                                                                    { value: '', label: '— Zweckbindung wählen —' },
                                                                    ...activeEarmarks.map((em) => {
                                                                    const disabled = em.enforceTimeRange ? !inRange(qa.date, em.startDate ?? null, em.endDate ?? null) : false
                                                                    const suffix = em.enforceTimeRange ? ` (${fmtRange(em.startDate ?? null, em.endDate ?? null) || 'Zeitraum'})` : ''
                                                                    return { value: String(em.id), label: `${em.code} – ${em.name}${suffix}`, disabled }
                                                                    })
                                                                ]}
                                                            />
                                                            <span className="adorn-wrap" style={{ width: 110 }}>
                                                                <input
                                                                    className="input"
                                                                    type="number"
                                                                    step="0.01"
                                                                    min={qa.type === 'INTERNAL' ? undefined : '0'}
                                                                    value={ea.amount ?? ''}
                                                                    onChange={(e) => {
                                                                        const next = [...earmarksList]
                                                                        next[idx] = { ...next[idx], amount: e.target.value ? Number(e.target.value) : 0 }
                                                                        setQa({ ...(qa as any), earmarksAssigned: next } as any)
                                                                    }}
                                                                    title="Betrag für diese Zweckbindung"
                                                                />
                                                                <span className="adorn-suffix">€</span>
                                                            </span>
                                                            <button
                                                                type="button"
                                                                className="btn ghost"
                                                                style={{ padding: '2px 6px', color: 'var(--danger)' }}
                                                                onClick={() => {
                                                                    const next = earmarksList.filter((_, i) => i !== idx)
                                                                    setQa({ ...(qa as any), earmarksAssigned: next } as any)
                                                                }}
                                                                title="Entfernen"
                                                            >✕</button>
                                                        </div>
                                                    )
                                                })}
                                                {hasDuplicateEarmarks && (
                                                    <div className="helper" style={{ color: 'var(--danger)' }}>⚠ Eine Zweckbindung kann nur einmal zugeordnet werden</div>
                                                )}
                                                {exceedsTotal && (
                                                    <div className="helper" style={{ color: 'var(--danger)' }}>⚠ Summe ({totalEarmarkAmount.toFixed(2)} €) übersteigt Buchungsbetrag ({grossAmt.toFixed(2)} €)</div>
                                                )}
                                                {qa.type === 'INTERNAL' && earmarksList.length > 0 && internalAssignmentValidation.earmarkHint && (
                                                    <div className="helper" style={{ color: 'var(--danger)' }}>{internalAssignmentValidation.earmarkHint}</div>
                                                )}
                                                {invalidEarmarkIds.size > 0 && (
                                                    <div className="helper" style={{ color: 'var(--danger)' }}>⚠ Mindestens eine Zweckbindung ist für dieses Datum nicht gültig</div>
                                                )}
                                            </div>
                                        ) : null
                                    })()}
                                </div>
                            </div>
                        </div>

                    <div className="block-grid block-grid-mb booking-secondary-grid">
                        <div className="card form-card booking-optional-card">
                            <details className="booking-details">
                                <summary>
                                    <span className="booking-details__heading">
                                        <span>Tags</span>
                                        {((qa as any).tags || []).length > 0 && (
                                            <>
                                                <span className="badge booking-tag-count">{((qa as any).tags || []).length}</span>
                                                <span className="booking-tag-summary" aria-label="Ausgewählte Tags">
                                                    {((qa as any).tags || []).slice(0, 3).map((tag: string) => {
                                                        const background = resolveTagDisplayColor(tag, tagDefs)
                                                        const foreground = getContrastTextColor(background)
                                                        return (
                                                            <span
                                                                key={tag}
                                                                className="booking-tag-summary__badge"
                                                                style={background ? { background, borderColor: background, color: foreground } : undefined}
                                                                title={tag}
                                                            >
                                                                {tag}
                                                            </span>
                                                        )
                                                    })}
                                                    {((qa as any).tags || []).length > 3 && (
                                                        <span className="booking-tag-summary__more">+{((qa as any).tags || []).length - 3}</span>
                                                    )}
                                                </span>
                                            </>
                                        )}
                                    </span>
                                </summary>
                                <TagsEditor
                                    label="Tags"
                                    className="booking-tags-editor"
                                    value={(qa as any).tags || []}
                                    onChange={(tags) => setQa({ ...(qa as any), tags } as any)}
                                    tagDefs={tagDefs}
                                    inputRef={tagsInputRef}
                                />
                            </details>
                            <details className="booking-details">
                                <summary>
                                    <span>Kommentar</span>
                                    {(qa as any).note && (
                                        <span className="booking-comment-preview" title={(qa as any).note}>
                                            {(qa as any).note}
                                        </span>
                                    )}
                                </summary>
                                <div className="field field-full-width booking-note-field">
                                    <textarea
                                        className="input booking-note-textarea"
                                        rows={3}
                                        value={(qa as any).note || ''}
                                        onChange={(e) => setQa({ ...(qa as any), note: e.target.value } as any)}
                                        placeholder="Interne Notiz, Rückfrage oder Ablagehinweis …"
                                        aria-label="Kommentar zur Buchung"
                                    />
                                </div>
                            </details>
                        </div>

                        <div
                            className="card attachment-card"
                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDropFiles(e.dataTransfer?.files) }}
                        >
                            <div className="attachment-header">
                                <div className="attachment-title">
                                    <strong>Anhänge</strong>
                                    {hasAnyAttachment && <div className="helper">Dateien hierher ziehen</div>}
                                </div>
                                <div className="attachment-actions attachment-actions--header">
                                    <input ref={fileInputRef} type="file" multiple hidden accept=".png,.jpg,.jpeg,.pdf,.doc,.docx" onChange={(e) => onDropFiles(e.target.files)} />
                                    <button type="button" className="attachment-icon-btn" onClick={openFilePicker} title="Dateien hinzufügen" aria-label="Dateien hinzufügen">
                                        <AttachmentActionIcon kind="add" />
                                    </button>
                                    {files.length > 0 && (
                                        <button type="button" className="attachment-icon-btn attachment-icon-btn--danger" onClick={() => setFiles([])} title="Alle neuen Anhänge entfernen" aria-label="Alle neuen Anhänge entfernen">
                                            <AttachmentActionIcon kind="clear" />
                                        </button>
                                    )}
                                </div>
                            </div>
                            {existingFilesLoading ? (
                                <div className="helper" style={{ marginTop: 8 }}>Lade ...</div>
                            ) : hasAnyAttachment ? (
                                <ul className="file-list">
                                    {existingFiles.map((f) => (
                                        <li key={`existing-${f.id}`} className="file-list-item">
                                            <span className="file-name" title={f.fileName}>{f.fileName}</span>
                                            <div className="attachment-actions attachment-actions--row">
                                                {onOpenExistingFile && (
                                                    <button type="button" className="attachment-icon-btn" title="Öffnen" aria-label={`${f.fileName} öffnen`} onClick={() => { void onOpenExistingFile(f.id) }}><AttachmentActionIcon kind="open" /></button>
                                                )}
                                                {onDownloadExistingFile && (
                                                    <button type="button" className="attachment-icon-btn" title="Speichern" aria-label={`${f.fileName} speichern`} onClick={() => { void onDownloadExistingFile(f.id) }}><AttachmentActionIcon kind="save" /></button>
                                                )}
                                                {onDeleteExistingFile && (
                                                    <button type="button" className="attachment-icon-btn attachment-icon-btn--danger" title="Löschen" aria-label={`${f.fileName} löschen`} onClick={() => { void onDeleteExistingFile(f) }}><AttachmentActionIcon kind="clear" /></button>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                    {files.map((f, i) => (
                                        <li key={`new-${i}-${f.name}`} className="file-list-item">
                                            <span className="file-name" title={f.name}>{f.name}</span>
                                            <div className="attachment-actions attachment-actions--row">
                                                <span className="helper">neu</span>
                                                <button type="button" className="attachment-icon-btn attachment-icon-btn--danger" title="Entfernen" aria-label={`${f.name} entfernen`} onClick={() => setFiles(files.filter((_, idx) => idx !== i))}><AttachmentActionIcon kind="remove" /></button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="quick-add-dropzone" onClick={openFilePicker}>
                                    <div className="quick-add-dropzone__icon">📎</div>
                                    <div className="helper">Dateien hierher ziehen oder klicken</div>
                                </div>
                            )}
                        </div>
                    </div>
                    
                    <div className="modal-footer-actions">
                        <div className="booking-footer-status" role="status">
                            {footerLeft}
                            {bookingValidationMessage && (
                                <div className="booking-validation-badge" aria-live="polite">
                                    {bookingValidationMessage}
                                </div>
                            )}
                            {!footerLeft && !saveBlocked && <div className="helper">{footerHint || 'Ctrl+S Speichern · Ctrl+U Datei · Esc Abbrechen'}</div>}
                        </div>
                        <div className="booking-modal-save-actions" onBlur={(e) => {
                            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSaveMenuOpen(false)
                        }}>
                            <button type="button" className="btn ghost" onClick={closeModal}>Abbrechen</button>
                            {showSaveMenu ? (
                                <div className="booking-split-save">
                                    <button
                                        type="submit"
                                        className="btn primary booking-split-save__main"
                                        disabled={saveBlocked}
                                    >
                                        {defaultSaveLabel}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn primary booking-split-save__arrow"
                                        disabled={saveBlocked}
                                        aria-label="Weitere Speicheraktionen"
                                        aria-haspopup="menu"
                                        aria-expanded={saveMenuOpen}
                                        onClick={() => setSaveMenuOpen((open) => !open)}
                                    >
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                            <path d="M7 10l5 5 5-5H7z" />
                                        </svg>
                                    </button>
                                    {saveMenuOpen && (
                                        <div className="booking-split-save__menu" role="menu">
                                            <button type="button" role="menuitem" onClick={() => { setSaveMenuOpen(false); handleSaveAndClose() }}>
                                                Speichern & schließen
                                            </button>
                                            <button type="button" role="menuitem" onClick={() => { setSaveMenuOpen(false); handleSaveAndNew() }}>
                                                Speichern & neu
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <button
                                    type="submit"
                                    className="btn primary"
                                    disabled={saveBlocked}
                                >
                                    {defaultSaveLabel}
                                </button>
                            )}
                        </div>
                    </div>
                </form>
            </div>
        </div>
    )
}
