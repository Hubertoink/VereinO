import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getInternalAssignmentValidationState } from '../components/modals/voucherMetaValidation'
import type { LocalInvoiceScanDraftState } from '../components/modals/LocalInvoiceScanModal'

type QA = {
    date: string
    type: 'IN' | 'OUT' | 'TRANSFER' | 'INTERNAL'
    sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
    grossAmount?: number
    netAmount?: number
    vatRate: number
    description: string
    note?: string | null
    paymentMethod?: 'BAR' | 'BANK'
    paymentAccountId?: number | null
    paymentAccountName?: string | null
    mode?: 'NET' | 'GROSS'
    transferFrom?: 'BAR' | 'BANK'
    transferTo?: 'BAR' | 'BANK'
    transferFromAccountId?: number | null
    transferFromAccountName?: string | null
    transferToAccountId?: number | null
    transferToAccountName?: string | null
    budgetId?: number | null
    earmarkId?: number | null
    budgets?: Array<{ budgetId: number; amount: number }>
    earmarksAssigned?: Array<{ earmarkId: number; amount: number }>
    tags?: string[]
    bankTransactionId?: number
}

type QuickAddDraft = {
    id: string
    sequence: number
    qa: QA
    files: File[]
    detached?: boolean
    kind?: 'booking' | 'invoice'
    invoiceState?: LocalInvoiceScanDraftState
    invoiceBatchJobId?: number
}

type QuickAddAfterSave = 'close' | 'new'
type QuickAddSaveMode = QuickAddAfterSave | 'default'
type OpenQuickAddOptions = { detached?: boolean; showModal?: boolean; kind?: 'booking' | 'invoice' }

function createDraftId() {
    return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Read user booking habits from localStorage */
function getBookingHabits(): { type: 'IN' | 'OUT'; paymentMethod: 'BAR' | 'BANK'; mode: 'NET' | 'GROSS' } {
    const defaults = { type: 'IN' as const, paymentMethod: 'BAR' as const, mode: 'GROSS' as const }
    try {
        const raw = localStorage.getItem('bookingHabits')
        if (!raw) return defaults
        const h = JSON.parse(raw)
        // Determine most frequent for each field
        const topType = getMostFrequent(h.types, ['IN', 'OUT']) as 'IN' | 'OUT' || defaults.type
        const topPM = getMostFrequent(h.paymentMethods, ['BAR', 'BANK']) as 'BAR' | 'BANK' || defaults.paymentMethod
        const topMode = getMostFrequent(h.modes, ['NET', 'GROSS']) as 'NET' | 'GROSS' || defaults.mode
        return { type: topType, paymentMethod: topPM, mode: topMode }
    } catch {
        return defaults
    }
}

function getMostFrequent(counts: Record<string, number> | undefined, validKeys: string[]): string | null {
    if (!counts) return null
    let best: string | null = null
    let bestCount = 0
    for (const key of validKeys) {
        const c = Number(counts[key]) || 0
        if (c > bestCount) { bestCount = c; best = key }
    }
    return best
}

/** Track a booking habit in localStorage */
function trackBookingHabit(type: string, paymentMethod: string | undefined, mode: string | undefined) {
    try {
        const raw = localStorage.getItem('bookingHabits')
        const h = raw ? JSON.parse(raw) : { types: {}, paymentMethods: {}, modes: {} }
        if (!h.types) h.types = {}
        if (!h.paymentMethods) h.paymentMethods = {}
        if (!h.modes) h.modes = {}
        if (type === 'IN' || type === 'OUT') {
            h.types[type] = (Number(h.types[type]) || 0) + 1
        }
        if (paymentMethod === 'BAR' || paymentMethod === 'BANK') {
            h.paymentMethods[paymentMethod] = (Number(h.paymentMethods[paymentMethod]) || 0) + 1
        }
        if (mode === 'NET' || mode === 'GROSS') {
            h.modes[mode] = (Number(h.modes[mode]) || 0) + 1
        }
        localStorage.setItem('bookingHabits', JSON.stringify(h))
    } catch { }
}

function bookingGrossAmount(qa: QA) {
    if (qa.type === 'TRANSFER' || qa.type === 'INTERNAL') return Number((qa as any).grossAmount || 0)
    if ((qa as any).mode === 'GROSS') return Number((qa as any).grossAmount || 0)
    const net = Number(qa.netAmount || 0)
    const vatRate = Number(qa.vatRate || 0)
    return Math.round((net * (1 + vatRate / 100)) * 100) / 100
}

/**
 * useQuickAdd Hook
 * 
 * Manages state and logic for the Quick Add booking modal
 * Extracted from App.tsx for better maintainability
 */
export function useQuickAdd(
    today: string, 
    create: (p: any) => Promise<any>, 
    onOpenFilePicker?: () => void,
    notify?: (type: 'success' | 'error' | 'info', text: string) => void,
    draftTabsEnabled: boolean = true,
    afterSaveDefault: QuickAddAfterSave = 'close'
) {
    const [quickAdd, setQuickAdd] = useState(false)
    const [drafts, setDrafts] = useState<QuickAddDraft[]>([])
    const [activeDraftId, setActiveDraftId] = useState<string | null>(null)
    const nextSequenceRef = useRef(1)

    const makeDefaults = useCallback((): QA => {
        const habits = getBookingHabits()
        return {
            date: today,
            type: habits.type,
            sphere: 'IDEELL',
            mode: habits.mode,
            grossAmount: undefined,
            netAmount: undefined,
            vatRate: 0,
            description: '',
            note: '',
            paymentMethod: habits.paymentMethod
        }
    }, [today])

    const makeNextDefaults = useCallback((previous: QA): QA => {
        const mode = (previous as any).mode === 'NET' ? 'NET' : 'GROSS'
        const next: QA = {
            date: previous.date || today,
            type: previous.type,
            sphere: previous.sphere,
            mode,
            vatRate: mode === 'NET' ? Number(previous.vatRate || 0) : 0,
            description: '',
            note: '',
            tags: []
        }

        if (previous.type === 'TRANSFER') {
            next.transferFrom = (previous as any).transferFrom || 'BAR'
            next.transferTo = (previous as any).transferTo || 'BANK'
            next.transferFromAccountId = (previous as any).transferFromAccountId ?? null
            next.transferFromAccountName = (previous as any).transferFromAccountName ?? null
            next.transferToAccountId = (previous as any).transferToAccountId ?? null
            next.transferToAccountName = (previous as any).transferToAccountName ?? null
            next.grossAmount = undefined
        } else if (previous.type !== 'INTERNAL') {
            next.paymentMethod = previous.paymentMethod || getBookingHabits().paymentMethod
            next.paymentAccountId = (previous as any).paymentAccountId ?? null
            next.paymentAccountName = (previous as any).paymentAccountName ?? null
            if (mode === 'NET') next.netAmount = undefined
            else next.grossAmount = undefined
        }

        return next
    }, [today])

    const activeDraft = useMemo(
        () => drafts.find((draft) => draft.id === activeDraftId) ?? null,
        [drafts, activeDraftId]
    )

    const qa = activeDraft?.qa ?? makeDefaults()
    const files = activeDraft?.files ?? []
    const activeDraftKind = activeDraft?.kind ?? 'booking'
    const activeInvoiceState = activeDraft?.invoiceState

    const openQuickAdd = useCallback((initial?: { qa?: QA; files?: File[]; invoiceState?: LocalInvoiceScanDraftState; invoiceBatchJobId?: number }, options?: OpenQuickAddOptions) => {
        const detached = !!options?.detached
        const showModal = options?.showModal ?? !detached
        const draft: QuickAddDraft = {
            id: createDraftId(),
            sequence: nextSequenceRef.current++,
            qa: initial?.qa ?? makeDefaults(),
            files: initial?.files ?? [],
            detached,
            kind: options?.kind ?? 'booking',
            invoiceState: initial?.invoiceState,
            invoiceBatchJobId: initial?.invoiceBatchJobId
        }
        setDrafts((prev) => draftTabsEnabled ? [...prev, draft] : [draft])
        setActiveDraftId(showModal ? draft.id : null)
        setQuickAdd(showModal)
        return draft
    }, [draftTabsEnabled, makeDefaults])

    const reopenDraft = useCallback((draftId: string) => {
        const draft = drafts.find((entry) => entry.id === draftId)
        if (draft?.detached) return
        setActiveDraftId(draftId)
        setQuickAdd(true)
    }, [drafts])

    const parkQuickAdd = useCallback(() => {
        if (!draftTabsEnabled) {
            setDrafts([])
            setActiveDraftId(null)
        }
        setQuickAdd(false)
    }, [draftTabsEnabled])

    const closeDraft = useCallback((draftId: string) => {
        const remaining = drafts.filter((draft) => draft.id !== draftId)
        setDrafts(remaining)
        if (activeDraftId === draftId) {
            setActiveDraftId(remaining.at(-1)?.id ?? null)
            setQuickAdd(false)
        }
    }, [drafts, activeDraftId])

    const markDraftDetached = useCallback((draftId: string) => {
        setDrafts((prev) => prev.map((draft) => (
            draft.id === draftId ? { ...draft, detached: true } : draft
        )))
        if (activeDraftId === draftId) {
            setActiveDraftId(null)
            setQuickAdd(false)
        }
    }, [activeDraftId])

    const markDraftDocked = useCallback((draftId: string) => {
        setDrafts((prev) => prev.map((draft) => (
            draft.id === draftId ? { ...draft, detached: false } : draft
        )))
    }, [])

    const dockAndOpenDraft = useCallback((draftId: string) => {
        setDrafts((prev) => prev.map((draft) => (
            draft.id === draftId ? { ...draft, detached: false } : draft
        )))
        setActiveDraftId(draftId)
        setQuickAdd(true)
    }, [])

    const updateDraft = useCallback((draftId: string, patch: { qa?: QA; files?: File[]; detached?: boolean; kind?: 'booking' | 'invoice'; invoiceState?: LocalInvoiceScanDraftState; invoiceBatchJobId?: number }) => {
        setDrafts((prev) => prev.map((draft) => (
            draft.id === draftId ? { ...draft, ...patch } : draft
        )))
    }, [])

    const clearDrafts = useCallback(() => {
        setDrafts([])
        setActiveDraftId(null)
        setQuickAdd(false)
    }, [])

    useEffect(() => {
        if (draftTabsEnabled || quickAdd || drafts.length === 0) return
        setDrafts([])
        setActiveDraftId(null)
    }, [draftTabsEnabled, drafts.length, quickAdd])

    const setQa = useCallback((nextQa: QA) => {
        if (!activeDraftId) return
        setDrafts((prev) => prev.map((draft) => (
            draft.id === activeDraftId ? { ...draft, qa: nextQa } : draft
        )))
    }, [activeDraftId])

    const setFiles = useCallback((nextFiles: File[]) => {
        if (!activeDraftId) return
        setDrafts((prev) => prev.map((draft) => (
            draft.id === activeDraftId ? { ...draft, files: nextFiles } : draft
        )))
    }, [activeDraftId])

    function onDropFiles(fileList: FileList | null) {
        if (!fileList) return
        const arr = Array.from(fileList)
        setFiles([...files, ...arr])
    }

    async function onQuickSave(mode: QuickAddSaveMode = 'default') {
        if (!activeDraft) return

        if (!Number.isFinite(bookingGrossAmount(activeDraft.qa)) || bookingGrossAmount(activeDraft.qa) <= 0) {
            notify?.('error', 'Bitte gib einen Betrag größer als 0 € ein.')
            return
        }

        // Validate transfer direction
        if (activeDraft.qa.type === 'TRANSFER' && (!(activeDraft.qa as any).transferFromAccountId || !(activeDraft.qa as any).transferToAccountId)) {
            notify?.('error', 'Bitte wähle Quell- und Zielkonto für den Transfer aus.')
            return
        }
        if (activeDraft.qa.type !== 'TRANSFER' && activeDraft.qa.type !== 'INTERNAL' && !(activeDraft.qa as any).paymentAccountId) {
            notify?.('error', 'Bitte wähle ein Konto für die Buchung aus.')
            return
        }
        if (activeDraft.qa.type === 'INTERNAL') {
            const internalBudgets = (Array.isArray((activeDraft.qa as any).budgets) ? (activeDraft.qa as any).budgets : [])
                .filter((b: any) => b.budgetId && Number(b.amount) !== 0)
            const internalEarmarks = (Array.isArray((activeDraft.qa as any).earmarksAssigned) ? (activeDraft.qa as any).earmarksAssigned : [])
                .filter((e: any) => e.earmarkId && Number(e.amount) !== 0)
            const internalAssignmentValidation = getInternalAssignmentValidationState({
                budgets: internalBudgets,
                earmarks: internalEarmarks,
                isInternal: true,
                grossAmount: bookingGrossAmount(activeDraft.qa),
            })
            if (!internalAssignmentValidation.hasValidAssignments) {
                notify?.('error', internalAssignmentValidation.budgetHint || internalAssignmentValidation.earmarkHint || 'Interne Buchungen brauchen Budget- oder Zweckbindungs-Zeilen mit Quelle negativ, Ziel positiv und Summe 0.')
                return
            }
        }

        const payload: any = {
            date: activeDraft.qa.date,
            type: activeDraft.qa.type,
            sphere: activeDraft.qa.sphere,
            description: activeDraft.qa.description || undefined,
            note: activeDraft.qa.note?.trim() ? activeDraft.qa.note.trim() : null,
            vatRate: activeDraft.qa.vatRate
        }
        if (typeof (activeDraft.qa as any).agentDraftId === 'string') {
            payload.agentDraftId = (activeDraft.qa as any).agentDraftId
        }
        
        if (activeDraft.qa.type === 'TRANSFER') {
            delete payload.paymentMethod
            payload.transferFrom = (activeDraft.qa as any).transferFrom
            payload.transferTo = (activeDraft.qa as any).transferTo
            payload.paymentAccountId = null
            payload.transferFromAccountId = (activeDraft.qa as any).transferFromAccountId ?? null
            payload.transferToAccountId = (activeDraft.qa as any).transferToAccountId ?? null
            payload.vatRate = 0
            payload.grossAmount = (activeDraft.qa as any).grossAmount ?? 0
            delete payload.netAmount
        } else if (activeDraft.qa.type === 'INTERNAL') {
            delete payload.paymentMethod
            payload.paymentAccountId = null
            payload.transferFrom = undefined
            payload.transferTo = undefined
            payload.transferFromAccountId = null
            payload.transferToAccountId = null
            payload.vatRate = 0
            payload.grossAmount = Math.abs(bookingGrossAmount(activeDraft.qa))
            delete payload.netAmount
        } else {
            payload.paymentMethod = activeDraft.qa.paymentMethod
            payload.paymentAccountId = (activeDraft.qa as any).paymentAccountId ?? null
            payload.transferFrom = undefined
            payload.transferTo = undefined
            payload.transferFromAccountId = null
            payload.transferToAccountId = null
        }
        
        if (activeDraft.qa.mode === 'GROSS') {
            payload.grossAmount = activeDraft.qa.grossAmount ?? 0
            payload.vatRate = 0 // Brutto immer ohne Aufteilung
            delete payload.netAmount
        } else {
            payload.netAmount = activeDraft.qa.netAmount ?? 0
            // vatRate bleibt (0/7/19)
            delete payload.grossAmount
        }
        
        if (typeof (activeDraft.qa as any).earmarkId === 'number') payload.earmarkId = (activeDraft.qa as any).earmarkId
        if (typeof (activeDraft.qa as any).budgetId === 'number') payload.budgetId = (activeDraft.qa as any).budgetId

        // New: multiple assignments (optional)
        const budgets = Array.isArray((activeDraft.qa as any).budgets)
            ? ((activeDraft.qa as any).budgets as Array<{ budgetId: number; amount: number }>).
                filter((b) => b.budgetId && (activeDraft.qa.type === 'INTERNAL' ? b.amount !== 0 : b.amount > 0)).
                map((b) => ({ budgetId: Number(b.budgetId), amount: Number(b.amount) }))
            : []
        const earmarks = Array.isArray((activeDraft.qa as any).earmarksAssigned)
            ? ((activeDraft.qa as any).earmarksAssigned as Array<{ earmarkId: number; amount: number }>).
                filter((e) => e.earmarkId && (activeDraft.qa.type === 'INTERNAL' ? e.amount !== 0 : e.amount > 0)).
                map((e) => ({ earmarkId: Number(e.earmarkId), amount: Number(e.amount) }))
            : []

        if (budgets.length) {
            payload.budgets = budgets
            // Sync legacy fields (first assignment)
            payload.budgetId = budgets[0].budgetId
            payload.budgetAmount = budgets[0].amount
        }
        if (earmarks.length) {
            payload.earmarks = earmarks
            // Sync legacy fields (first assignment)
            payload.earmarkId = earmarks[0].earmarkId
            payload.earmarkAmount = earmarks[0].amount
        }

        if (Array.isArray((activeDraft.qa as any).tags)) payload.tags = (activeDraft.qa as any).tags
        if (typeof (activeDraft.qa as any).bankTransactionId === 'number') {
            payload.bankTransactionId = (activeDraft.qa as any).bankTransactionId
        }

        // Convert attachments to Base64
        if (activeDraft.files.length) {
            const enc = async (f: File) => {
                const buf = await f.arrayBuffer()
                let binary = ''
                const bytes = new Uint8Array(buf)
                const chunk = 0x8000
                for (let i = 0; i < bytes.length; i += chunk) {
                    binary += String.fromCharCode.apply(null as any, bytes.subarray(i, i + chunk) as any)
                }
                const dataBase64 = btoa(binary)
                return { name: f.name, dataBase64, mime: f.type || undefined }
            }
            payload.files = await Promise.all(activeDraft.files.map(enc))
        }

        const res = await create(payload)
        if (res) {
            if (activeDraft.invoiceBatchJobId) {
                try {
                    await window.api.ai.invoiceBatch.approve({ id: activeDraft.invoiceBatchJobId, voucherId: res.id })
                } catch (error: any) {
                    notify?.('error', `Buchung wurde gespeichert, die Submit-PDF aber nicht entfernt: ${error?.message || String(error)}`)
                }
            }
            // Track user habits for smart defaults
            trackBookingHabit(activeDraft.qa.type, activeDraft.qa.paymentMethod, (activeDraft.qa as any).mode)
            const saveMode: QuickAddAfterSave = mode === 'default' ? afterSaveDefault : mode
            if (saveMode === 'new') {
                const nextDraft: QuickAddDraft = {
                    id: createDraftId(),
                    sequence: nextSequenceRef.current++,
                    qa: makeNextDefaults(activeDraft.qa),
                    files: []
                }
                setDrafts((prev) => {
                    const remaining = prev.filter((draft) => draft.id !== activeDraft.id)
                    return draftTabsEnabled ? [...remaining, nextDraft] : [nextDraft]
                })
                setActiveDraftId(nextDraft.id)
                setQuickAdd(true)
            } else {
                const remaining = drafts.filter((draft) => draft.id !== activeDraft.id)
                setDrafts(remaining)
                setActiveDraftId(remaining.at(-1)?.id ?? null)
                setQuickAdd(false)
            }
        }
    }

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            const target = e.target as HTMLElement | null
            const tag = (target?.tagName || '').toLowerCase()
            const inEditable = !!(target && ((target as any).isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select'))

            // Search focus (Ctrl+K) only when on Buchungen and not in another input
            if (!inEditable && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                try { 
                    const page = localStorage.getItem('activePage') || 'Buchungen'
                    if (page === 'Buchungen') { 
                        (document.querySelector('input[placeholder^="Suche Buchungen"]') as HTMLInputElement | null)?.focus()
                        e.preventDefault()
                        return 
                    } 
                } catch { }
            }

            // Open Quick-Add robustly via Ctrl+Shift+N (no bare 'n')
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
                let openDetached = false
                try { openDetached = localStorage.getItem('ui.bookingsOpenDetached') === 'true' } catch { }
                if (openDetached) {
                    void (async () => {
                        const draft = draftTabsEnabled ? openQuickAdd(undefined, { detached: true, showModal: false }) : null
                        try {
                            const res = await window.api?.quickAdd?.openDetached?.({
                                draftId: draft?.id,
                                qa: draft?.qa,
                                files: [],
                                afterSaveDefault
                            })
                            if (!res?.ok) {
                                notify?.('error', res?.error || 'Buchungsfenster konnte nicht geöffnet werden.')
                                if (draft) dockAndOpenDraft(draft.id)
                                else openQuickAdd()
                            }
                        } catch (err: any) {
                            notify?.('error', 'Buchungsfenster konnte nicht geöffnet werden: ' + String(err?.message || err))
                            if (draft) dockAndOpenDraft(draft.id)
                            else openQuickAdd()
                        }
                    })()
                } else {
                    openQuickAdd()
                }
                e.preventDefault()
                return
            }

            // Save and Upload hotkeys only when Quick-Add is open
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { 
                if (quickAdd) { 
                    onQuickSave()
                    e.preventDefault() 
                } 
                return 
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') { 
                if (quickAdd) { 
                    onOpenFilePicker?.()
                    e.preventDefault() 
                } 
                return 
            }
            if (e.key === 'Escape') { 
                if (quickAdd) { 
                    parkQuickAdd()
                    e.preventDefault() 
                } 
                return 
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [afterSaveDefault, dockAndOpenDraft, draftTabsEnabled, notify, quickAdd, onQuickSave, onOpenFilePicker, openQuickAdd, parkQuickAdd])

    const openFilePicker = () => onOpenFilePicker?.()

    return {
        quickAdd,
        activeDraftKind,
        activeInvoiceState,
        qa,
        setQa,
        onQuickSave,
        files,
        setFiles,
        openFilePicker,
        onDropFiles,
        openQuickAdd,
        parkQuickAdd,
        bookingDrafts: drafts,
        activeDraftId,
        reopenDraft,
        closeDraft,
        markDraftDetached,
        markDraftDocked,
        dockAndOpenDraft,
        updateDraft,
        clearDrafts,
        hasOpenDrafts: draftTabsEnabled && drafts.length > 0
    }
}

export type { QA }
