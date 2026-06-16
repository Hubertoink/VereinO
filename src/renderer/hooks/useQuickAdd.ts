import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type QA = {
    date: string
    type: 'IN' | 'OUT' | 'TRANSFER'
    sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
    grossAmount?: number
    netAmount?: number
    vatRate: number
    description: string
    paymentMethod?: 'BAR' | 'BANK'
    mode?: 'NET' | 'GROSS'
    transferFrom?: 'BAR' | 'BANK'
    transferTo?: 'BAR' | 'BANK'
    budgetId?: number | null
    earmarkId?: number | null
    budgets?: Array<{ budgetId: number; amount: number }>
    earmarksAssigned?: Array<{ earmarkId: number; amount: number }>
    tags?: string[]
}

type QuickAddDraft = {
    id: string
    sequence: number
    qa: QA
    files: File[]
}

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
    notify?: (type: 'success' | 'error' | 'info', text: string) => void
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
            grossAmount: habits.mode === 'GROSS' ? 100 : undefined,
            netAmount: habits.mode === 'NET' ? 100 : undefined,
            vatRate: 0,
            description: '',
            paymentMethod: habits.paymentMethod
        }
    }, [today])

    const activeDraft = useMemo(
        () => drafts.find((draft) => draft.id === activeDraftId) ?? null,
        [drafts, activeDraftId]
    )

    const qa = activeDraft?.qa ?? makeDefaults()
    const files = activeDraft?.files ?? []

    const openQuickAdd = useCallback(() => {
        const draft: QuickAddDraft = {
            id: createDraftId(),
            sequence: nextSequenceRef.current++,
            qa: makeDefaults(),
            files: []
        }
        setDrafts((prev) => [...prev, draft])
        setActiveDraftId(draft.id)
        setQuickAdd(true)
    }, [makeDefaults])

    const reopenDraft = useCallback((draftId: string) => {
        setActiveDraftId(draftId)
        setQuickAdd(true)
    }, [])

    const parkQuickAdd = useCallback(() => {
        setQuickAdd(false)
    }, [])

    const closeDraft = useCallback((draftId: string) => {
        const remaining = drafts.filter((draft) => draft.id !== draftId)
        setDrafts(remaining)
        if (activeDraftId === draftId) {
            setActiveDraftId(remaining.at(-1)?.id ?? null)
            setQuickAdd(false)
        }
    }, [drafts, activeDraftId])

    const clearDrafts = useCallback(() => {
        setDrafts([])
        setActiveDraftId(null)
        setQuickAdd(false)
    }, [])

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

    async function onQuickSave() {
        if (!activeDraft) return

        // Validate transfer direction
        if (activeDraft.qa.type === 'TRANSFER' && (!(activeDraft.qa as any).transferFrom || !(activeDraft.qa as any).transferTo)) {
            notify?.('error', 'Bitte wähle eine Richtung für den Transfer aus.')
            return
        }
        
        const payload: any = {
            date: activeDraft.qa.date,
            type: activeDraft.qa.type,
            sphere: activeDraft.qa.sphere,
            description: activeDraft.qa.description || undefined,
            vatRate: activeDraft.qa.vatRate
        }
        
        if (activeDraft.qa.type === 'TRANSFER') {
            delete payload.paymentMethod
            payload.transferFrom = (activeDraft.qa as any).transferFrom
            payload.transferTo = (activeDraft.qa as any).transferTo
            payload.vatRate = 0
            payload.grossAmount = (activeDraft.qa as any).grossAmount ?? 0
            delete payload.netAmount
        } else {
            payload.paymentMethod = activeDraft.qa.paymentMethod
            payload.transferFrom = undefined
            payload.transferTo = undefined
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
                filter((b) => b.budgetId && b.amount > 0).
                map((b) => ({ budgetId: Number(b.budgetId), amount: Number(b.amount) }))
            : []
        const earmarks = Array.isArray((activeDraft.qa as any).earmarksAssigned)
            ? ((activeDraft.qa as any).earmarksAssigned as Array<{ earmarkId: number; amount: number }>).
                filter((e) => e.earmarkId && e.amount > 0).
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
            // Track user habits for smart defaults
            trackBookingHabit(activeDraft.qa.type, activeDraft.qa.paymentMethod, (activeDraft.qa as any).mode)
            const remaining = drafts.filter((draft) => draft.id !== activeDraft.id)
            setDrafts(remaining)
            setActiveDraftId(remaining.at(-1)?.id ?? null)
            setQuickAdd(false)
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
                openQuickAdd()
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
    }, [quickAdd, onQuickSave, onOpenFilePicker, openQuickAdd, parkQuickAdd])

    const openFilePicker = () => onOpenFilePicker?.()

    return {
        quickAdd,
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
        clearDrafts,
        hasOpenDrafts: drafts.length > 0
    }
}

export type { QA, QuickAddDraft }
