import { useState, useEffect } from 'react'

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
    const [confirmingClose, setConfirmingClose] = useState(false)
    const habits = getBookingHabits()
    const makeDefaults = (): QA => ({
        date: today, 
        type: habits.type, 
        sphere: 'IDEELL', 
        mode: habits.mode,
        grossAmount: habits.mode === 'GROSS' ? 100 : undefined,
        netAmount: habits.mode === 'NET' ? 100 : undefined,
        vatRate: 0, 
        description: '', 
        paymentMethod: habits.paymentMethod
    })
    const [qa, setQa] = useState<QA>(makeDefaults)
    const [files, setFiles] = useState<File[]>([])

    /** Check if form has been meaningfully modified */
    function isDirty(): boolean {
        if (qa.description && qa.description.trim().length > 0) return true
        if (Array.isArray((qa as any).tags) && (qa as any).tags.length > 0) return true
        if (files.length > 0) return true
        const defs = makeDefaults()
        if ((qa.grossAmount ?? 0) !== (defs.grossAmount ?? 0)) return true
        if ((qa.netAmount ?? 0) !== (defs.netAmount ?? 0)) return true
        if (qa.vatRate !== defs.vatRate) return true
        if (Array.isArray((qa as any).budgets) && (qa as any).budgets.length > 0) return true
        if (Array.isArray((qa as any).earmarksAssigned) && (qa as any).earmarksAssigned.length > 0) return true
        return false
    }

    function requestClose() {
        if (isDirty()) {
            setConfirmingClose(true)
        } else {
            doClose()
        }
    }

    function doClose() {
        setConfirmingClose(false)
        setQuickAdd(false)
        setFiles([])
        const h = getBookingHabits()
        setQa({
            date: today,
            type: h.type,
            sphere: 'IDEELL',
            mode: h.mode,
            grossAmount: h.mode === 'GROSS' ? 100 : undefined,
            netAmount: h.mode === 'NET' ? 100 : undefined,
            vatRate: 0,
            description: '',
            paymentMethod: h.paymentMethod
        })
    }

    function cancelClose() {
        setConfirmingClose(false)
    }

    function onDropFiles(fileList: FileList | null) {
        if (!fileList) return
        const arr = Array.from(fileList)
        setFiles((prev) => [...prev, ...arr])
    }

    async function onQuickSave() {
        // Validate transfer direction
        if (qa.type === 'TRANSFER' && (!(qa as any).transferFrom || !(qa as any).transferTo)) {
            notify?.('error', 'Bitte wähle eine Richtung für den Transfer aus.')
            return
        }
        
        const payload: any = {
            date: qa.date,
            type: qa.type,
            sphere: qa.sphere,
            description: qa.description || undefined,
            vatRate: qa.vatRate
        }
        
        if (qa.type === 'TRANSFER') {
            delete payload.paymentMethod
            payload.transferFrom = (qa as any).transferFrom
            payload.transferTo = (qa as any).transferTo
            payload.vatRate = 0
            payload.grossAmount = (qa as any).grossAmount ?? 0
            delete payload.netAmount
        } else {
            payload.paymentMethod = qa.paymentMethod
            payload.transferFrom = undefined
            payload.transferTo = undefined
        }
        
        if (qa.mode === 'GROSS') {
            payload.grossAmount = qa.grossAmount ?? 0
            payload.vatRate = 0 // Brutto immer ohne Aufteilung
            delete payload.netAmount
        } else {
            payload.netAmount = qa.netAmount ?? 0
            // vatRate bleibt (0/7/19)
            delete payload.grossAmount
        }
        
        if (typeof (qa as any).earmarkId === 'number') payload.earmarkId = (qa as any).earmarkId
        if (typeof (qa as any).budgetId === 'number') payload.budgetId = (qa as any).budgetId

        // New: multiple assignments (optional)
        const budgets = Array.isArray((qa as any).budgets)
            ? ((qa as any).budgets as Array<{ budgetId: number; amount: number }>).
                filter((b) => b.budgetId && b.amount > 0).
                map((b) => ({ budgetId: Number(b.budgetId), amount: Number(b.amount) }))
            : []
        const earmarks = Array.isArray((qa as any).earmarksAssigned)
            ? ((qa as any).earmarksAssigned as Array<{ earmarkId: number; amount: number }>).
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

        if (Array.isArray((qa as any).tags)) payload.tags = (qa as any).tags

        // Convert attachments to Base64
        if (files.length) {
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
            payload.files = await Promise.all(files.map(enc))
        }

        const res = await create(payload)
        if (res) {
            // Track user habits for smart defaults
            trackBookingHabit(qa.type, qa.paymentMethod, (qa as any).mode)
            const h = getBookingHabits()
            setQuickAdd(false)
            setFiles([])
            setQa({ 
                date: today, 
                type: h.type, 
                sphere: 'IDEELL', 
                mode: h.mode,
                grossAmount: h.mode === 'GROSS' ? 100 : undefined,
                netAmount: h.mode === 'NET' ? 100 : undefined,
                vatRate: 0, 
                description: '', 
                paymentMethod: h.paymentMethod
            })
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
                setQuickAdd(true)
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
                    requestClose()
                    e.preventDefault() 
                } 
                return 
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [qa, files, quickAdd, onQuickSave, onOpenFilePicker])

    const openFilePicker = () => onOpenFilePicker?.()

    return { quickAdd, setQuickAdd, qa, setQa, onQuickSave, files, setFiles, openFilePicker, onDropFiles, requestClose, confirmingClose, doClose, cancelClose }
}

export type { QA }
