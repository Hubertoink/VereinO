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
    const [qa, setQa] = useState<QA>({ 
        date: today, 
        type: 'IN', 
        sphere: 'IDEELL', 
        // Standard = BRUTTO laut Anforderung
        mode: 'GROSS',
        grossAmount: 100,
        vatRate: 0, 
        description: '', 
        paymentMethod: 'BAR'
    })
    const [files, setFiles] = useState<File[]>([])

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
            setQuickAdd(false)
            setFiles([])
            setQa({ 
                date: today, 
                type: 'IN', 
                sphere: 'IDEELL', 
                mode: 'GROSS',
                grossAmount: 100,
                vatRate: 0, 
                description: '', 
                paymentMethod: 'BAR'
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
                    setQuickAdd(false)
                    e.preventDefault() 
                } 
                return 
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [qa, files, quickAdd, onQuickSave, onOpenFilePicker])

    const openFilePicker = () => onOpenFilePicker?.()

    return { quickAdd, setQuickAdd, qa, setQa, onQuickSave, files, setFiles, openFilePicker, onDropFiles }
}

export type { QA }
