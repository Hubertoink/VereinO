import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import DbMigrateModal from './DbMigrateModal'
import AutoBackupPromptModal from './components/modals/AutoBackupPromptModal'
import SmartRestoreModal from './components/modals/SmartRestoreModal'
import DbInitFailedModal from './components/modals/DbInitFailedModal'
import TimeFilterModal from './components/modals/TimeFilterModal'
import MetaFilterModal from './components/modals/MetaFilterModal'
import ExportOptionsModal from './components/modals/ExportOptionsModal'
import SetupWizardModal from './components/modals/SetupWizardModal'
import TopHeaderOrg from './components/layout/TopHeaderOrg'
import WindowControls from './components/layout/WindowControls'
import SidebarNav from './components/layout/SidebarNav'
import Toasts from './components/common/Toasts'
import useToasts from './hooks/useToasts'
import { useAutoBackupPrompt } from './app/useAppInit'
import DashboardView from './views/Dashboard/DashboardView'

// Safe ArrayBuffer -> base64 converter (chunked to avoid "Maximum call stack size exceeded")
function bufferToBase64Safe(buf: ArrayBuffer) {
    const bytes = new Uint8Array(buf)
    const chunk = 0x8000
    let binary = ''
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null as any, bytes.subarray(i, i + chunk) as any)
    }
    return btoa(binary)
}

// Simple contrast helper for hex colors (returns black or white text)
function contrastText(bg?: string | null) {
    if (!bg) return '#000'
    const m = /^#?([0-9a-fA-F]{6})$/.exec(bg.trim())
    if (!m) return '#000'
    const hex = m[1]
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return l > 0.55 ? '#000' : '#fff'
}
    // Open Export Options when requested from nested components
    useEffect(() => {
        function onOpenExport() { setShowExportOptions(true) }
        window.addEventListener('open-export-options', onOpenExport as any)
        return () => window.removeEventListener('open-export-options', onOpenExport as any)
    }, [])
    // Prefill export org name from settings when modal opens
    useEffect(() => {
        let cancelled = false
        async function loadOrg() {
            if (!showExportOptions) return
            try {
                const res = await (window as any).api?.settings?.get?.({ key: 'org.name' })
                if (!cancelled) setExportOrgName((res?.value as any) || '')
            } catch { }
        }
        loadOrg()
        return () => { cancelled = true }
    }, [showExportOptions])

    // UI preference: date format (ISO vs PRETTY)
    type DateFmt = 'ISO' | 'PRETTY'
    const [dateFmt, setDateFmt] = useState<DateFmt>(() => {
        try { return (localStorage.getItem('ui.dateFmt') as DateFmt) || 'ISO' } catch { return 'ISO' }
    })
    useEffect(() => { try { localStorage.setItem('ui.dateFmt', dateFmt) } catch { } }, [dateFmt])
    const fmtDate = useMemo(() => {
        const pretty = (s?: string) => {
            if (!s) return ''
            const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
            if (!m) return s
            const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3])
            // Use UTC to avoid TZ shifting
            const dt = new Date(Date.UTC(y, mo - 1, d))
            const mon = dt.toLocaleString('de-DE', { month: 'short' }).replace('.', '')
            const dd = String(d).padStart(2, '0')
            return `${dd} ${mon} ${y}`
        }
        return (s?: string) => dateFmt === 'PRETTY' ? pretty(s) : (s || '')
    }, [dateFmt])

    // Quick-Add modal state and actions
    const fileInputRef = useRef<HTMLInputElement | null>(null)
    // For edit-mode attachments (invoices)
    const editInvoiceFileInputRef = useRef<HTMLInputElement | null>(null)
    const [editInvoiceFiles, setEditInvoiceFiles] = useState<Array<{ id: number; fileName: string; size?: number | null; createdAt?: string | null }>>([])
    const { quickAdd, setQuickAdd, qa, setQa, onQuickSave, files, setFiles, openFilePicker, onDropFiles } = useQuickAdd(today, async (p: any) => {
        try {
            const res = await window.api?.vouchers.create?.(p)
            if (res) {
                setLastId(res.id)
                setFlashId(res.id)
                window.setTimeout(() => setFlashId((cur) => (cur === res.id ? null : cur)), 3000)
                notify('success', `Beleg erstellt: #${res.voucherNo} (Brutto ${res.grossAmount})`)
                // Surface non-blocking warnings (e.g., earmark overdraw)
                const w = (res as any).warnings as string[] | undefined
                if (w && w.length) {
                    for (const msg of w) notify('info', 'Warnung: ' + msg)
                }
                await loadRecent()
                bumpDataVersion()
            }
            return res
        } catch (e: any) {
            notify('error', friendlyError(e))
            return null
        }
    }, () => fileInputRef.current?.click())

    // Recent description suggestions for Quick-Add (autocomplete)
    const [descSuggest, setDescSuggest] = useState<string[]>([])
    useEffect(() => {
        let alive = true
        async function load() {
            try {
                if (!quickAdd) return
                const res = await window.api?.vouchers?.recent?.({ limit: 100 })
                const uniq = new Set<string>()
                for (const r of (res?.rows || [])) {
                    const d = (r.description || '').trim()
                    if (d) uniq.add(d)
                    if (uniq.size >= 50) break
                }
                if (alive) setDescSuggest(Array.from(uniq))
            } catch { /* ignore */ }
        }
        load()
        return () => { alive = false }
    }, [quickAdd])

    async function createSampleVoucher() {
        try {
            notify('info', 'Erzeuge Beleg …')
            const res = await window.api?.vouchers.create?.({
                date: today,
                type: 'IN',
                sphere: 'IDEELL',
                description: 'Dev Sample Voucher',
                netAmount: 100,
                vatRate: 19
            })
            if (res) {
                setLastId(res.id)
                setFlashId(res.id)
                window.setTimeout(() => setFlashId((cur) => (cur === res.id ? null : cur)), 3000)
                notify('success', `Beleg erstellt: #${res.voucherNo} (Brutto ${res.grossAmount})`)
                await loadRecent()
                bumpDataVersion()
            }
        } catch (e: any) {
            notify('error', 'Fehler: ' + (e?.message || String(e)))
        }
    }

    async function reverseLastVoucher() {
        if (!lastId) {
            notify('info', 'Kein zuletzt erstellter Beleg zum Stornieren.')
            return
        }
        try {
            notify('info', 'Storniere Beleg …')
            const res = await window.api?.vouchers.reverse?.({ originalId: lastId, reason: 'Dev Reverse' })
            if (res) {
                notify('success', `Storno erstellt: #${res.voucherNo}`)
                await loadRecent()
                bumpDataVersion()
            }
        } catch (e: any) {
            notify('error', 'Fehler: ' + (e?.message || String(e)))
        }
    }

    const [rows, setRows] = useState<
        Array<{
            id: number
            voucherNo: string
            date: string
            type: 'IN' | 'OUT' | 'TRANSFER'
            sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
            description?: string | null
            paymentMethod?: 'BAR' | 'BANK' | null
            transferFrom?: 'BAR' | 'BANK' | null
            transferTo?: 'BAR' | 'BANK' | null
            netAmount: number
            vatRate: number
            vatAmount: number
            grossAmount: number
            hasFiles?: boolean
            earmarkId?: number | null
            earmarkCode?: string | null
            budgetId?: number | null
            budgetLabel?: string | null
            fileCount?: number
            tags?: string[]
        }>
    >([])
    const [totalRows, setTotalRows] = useState<number>(0)
    const [page, setPage] = useState<number>(() => { try { return Number(localStorage.getItem('journal.page') || '1') } catch { return 1 } })
    const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>(() => { try { return (localStorage.getItem('journal.sort') as any) || 'DESC' } catch { return 'DESC' } })
    const [sortBy, setSortBy] = useState<'date' | 'gross' | 'net'>(() => { try { return (localStorage.getItem('journal.sortBy') as any) || 'date' } catch { return 'date' } })
    // Column settings for Buchungen table (visibility + order)
    type ColKey = 'actions' | 'date' | 'voucherNo' | 'type' | 'sphere' | 'description' | 'earmark' | 'budget' | 'paymentMethod' | 'attachments' | 'net' | 'vat' | 'gross'
    const defaultCols: Record<ColKey, boolean> = { actions: true, date: true, voucherNo: true, type: true, sphere: true, description: true, earmark: true, budget: true, paymentMethod: true, attachments: true, net: true, vat: true, gross: true }
    const defaultOrder: ColKey[] = ['actions', 'date', 'voucherNo', 'type', 'sphere', 'description', 'earmark', 'budget', 'paymentMethod', 'attachments', 'net', 'vat', 'gross']
    // Human-readable (German) labels for column keys, consistent with table headers elsewhere in the app
    const colLabels: Record<ColKey, string> = {
        actions: 'Aktionen',
        date: 'Datum',
        voucherNo: 'Nr.',
        type: 'Typ',
        sphere: 'Sphäre',
        description: 'Beschreibung',
        earmark: 'Zweckbindung',
        budget: 'Budget',
        paymentMethod: 'Zahlweg',
        attachments: 'Anhänge',
        net: 'Netto',
        vat: 'MwSt',
        gross: 'Brutto',
    }
    // Safe lookup for UI where type may be string
    function labelForCol(k: string): string { return (colLabels as any)[k] || k }
    function sanitizeOrder(raw: any): ColKey[] {
        const arr = Array.isArray(raw) ? raw.filter((k) => typeof k === 'string') : []
        const known = new Set<ColKey>(['actions', 'date', 'voucherNo', 'type', 'sphere', 'description', 'earmark', 'budget', 'paymentMethod', 'attachments', 'net', 'vat', 'gross'])
        const cleaned = arr.filter((k) => known.has(k as ColKey)) as ColKey[]
        // ensure all keys appear exactly once; append any missing in default order
        const missing = defaultOrder.filter((k) => !cleaned.includes(k))
        return [...cleaned, ...missing]
    }
    const [cols, setCols] = useState<Record<ColKey, boolean>>(() => {
        try { const raw = localStorage.getItem('journal.cols'); if (raw) return { ...defaultCols, ...JSON.parse(raw) } } catch { }
        return defaultCols
    })
    const [order, setOrder] = useState<ColKey[]>(() => {
        try { const raw = localStorage.getItem('journal.order'); if (raw) return sanitizeOrder(JSON.parse(raw)) } catch { }
        return defaultOrder
    })
    useEffect(() => { try { localStorage.setItem('journal.cols', JSON.stringify(cols)) } catch { } }, [cols])
    useEffect(() => { try { localStorage.setItem('journal.order', JSON.stringify(order)) } catch { } }, [order])

    // Preference: journal row limit
    const [journalLimit, setJournalLimit] = useState<number>(() => {
        try { return Number(localStorage.getItem('journal.limit') || '20') } catch { return 20 }
    })
    useEffect(() => { try { localStorage.setItem('journal.limit', String(journalLimit)) } catch { } }, [journalLimit])
    useEffect(() => { try { localStorage.setItem('journal.page', String(page)) } catch { } }, [page])
    useEffect(() => { try { localStorage.setItem('journal.sort', sortDir) } catch { } }, [sortDir])
    useEffect(() => { try { localStorage.setItem('journal.sortBy', sortBy) } catch { } }, [sortBy])
    const [editRow, setEditRow] = useState<null | { id: number; date: string; description: string | null; paymentMethod: 'BAR' | 'BANK' | null; transferFrom?: 'BAR' | 'BANK' | null; transferTo?: 'BAR' | 'BANK' | null; type?: 'IN' | 'OUT' | 'TRANSFER'; sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; earmarkId?: number | null; budgetId?: number | null; tags?: string[] }>(null)
    // Attachments for edit modal
    const [editRowFiles, setEditRowFiles] = useState<Array<{ id: number; fileName: string; mimeType?: string | null }>>([])
    const [editRowFilesLoading, setEditRowFilesLoading] = useState(false)
    const editFileInputRef = useRef<HTMLInputElement | null>(null)
    const [confirmDeleteAttachment, setConfirmDeleteAttachment] = useState<null | { id: number; fileName: string }>(null)
    useEffect(() => {
        let alive = true
        async function load() {
            if (!editRow) { setEditRowFiles([]); return }
            try {
                setEditRowFilesLoading(true)
                const res = await window.api?.attachments.list?.({ voucherId: editRow.id })
                if (alive) setEditRowFiles(res?.files || [])
            } catch { /* ignore for now */ }
            finally { if (alive) setEditRowFilesLoading(false) }
        }
        load()
        return () => { alive = false }
    }, [editRow?.id])
    const [deleteRow, setDeleteRow] = useState<null | { id: number; voucherNo?: string; description?: string | null; fromEdit?: boolean }>(null)

    const searchInputRef = useRef<HTMLInputElement | null>(null)
    const [q, setQ] = useState<string>('')
    async function loadRecent() {
        const offset = Math.max(0, (page - 1)) * journalLimit
        const res = await window.api?.vouchers.list?.({
            limit: journalLimit,
            offset,
            sort: sortDir,
            sortBy: sortBy,
            paymentMethod: filterPM || undefined,
            sphere: filterSphere || undefined,
            type: filterType || undefined,
            from: from || undefined,
            to: to || undefined,
            earmarkId: filterEarmark || undefined,
            budgetId: filterBudgetId || undefined,
            q: q || undefined,
            tag: filterTag || undefined
        })
        if (res) {
            let rows = res.rows
            if (filterTag) {
                rows = rows.filter(r => (r.tags || []).some((t: string) => t.toLowerCase() === filterTag.toLowerCase()))
            }
            setRows(rows)
            setTotalRows(res.total ?? 0)
        }
    }

    useEffect(() => { loadRecent() }, [])
    // Reload when page/limit/sort change
    useEffect(() => { loadRecent() }, [page, journalLimit, sortDir, sortBy])

    // Global listener to react to data changes from nested components (e.g., import)
    useEffect(() => {
        function onDataChanged() { setRefreshKey((k) => k + 1); if (activePage === 'Buchungen') loadRecent() }
        window.addEventListener('data-changed', onDataChanged)
        return () => window.removeEventListener('data-changed', onDataChanged)
        // Intentionally only depend on activePage; loadRecent reads latest state when invoked
    }, [activePage])

    // Ensure Buchungen refreshes once user navigates there after a data change (e.g., auto-post from Invoices)
    useEffect(() => {
        if (activePage === 'Buchungen') {
            // Reload list to reflect any background changes since last visit
            loadRecent()
        }
    }, [activePage, refreshKey])

    // Allow child components to trigger applying an earmark filter and jump to Buchungen
    useEffect(() => {
        function onApplyEarmark(e: Event) {
            const de = e as CustomEvent<{ earmarkId?: number }>
            setFilterEarmark(de.detail.earmarkId ?? null)
            setActivePage('Buchungen')
        }
        window.addEventListener('apply-earmark-filter', onApplyEarmark as any)
        return () => window.removeEventListener('apply-earmark-filter', onApplyEarmark as any)
    }, [])

    // Allow budget tiles to jump to Buchungen and apply a time range (year or custom range) and optionally a budget filter
    useEffect(() => {
        function onBudgetJump(e: Event) {
            const de = e as CustomEvent<{ from?: string; to?: string; q?: string; budgetId?: number }>
            if (de.detail.from) setFrom(de.detail.from)
            if (de.detail.to) setTo(de.detail.to)
            if (de.detail.q != null) setQ(de.detail.q)
            // If a specific budgetId is applied, clear free-text search to avoid mixed filters
            if (de.detail.budgetId != null) setQ('')
            if (de.detail.budgetId != null) setFilterBudgetId(de.detail.budgetId)
            setActivePage('Buchungen')
        }
        window.addEventListener('apply-budget-jump', onBudgetJump as any)
        return () => window.removeEventListener('apply-budget-jump', onBudgetJump as any)
    }, [])

    // Allow other views (e.g., Invoices) to jump to Buchungen by voucher-id or search query
    useEffect(() => {
        function onVoucherJump(e: Event) {
            const de = e as CustomEvent<{ voucherId?: number; q?: string }>
            if (de.detail.q != null) setQ(de.detail.q)
            if (de.detail.voucherId != null) setQ('#' + de.detail.voucherId)
            setActivePage('Buchungen')
        }
        window.addEventListener('apply-voucher-jump', onVoucherJump as any)
        return () => window.removeEventListener('apply-voucher-jump', onVoucherJump as any)
    }, [])

    // Filters
    const [filterPM, setFilterPM] = useState<null | 'BAR' | 'BANK'>(null)
    const [filterSphere, setFilterSphere] = useState<null | 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'>(null)
    const [filterType, setFilterType] = useState<null | 'IN' | 'OUT' | 'TRANSFER'>(null)
    const [from, setFrom] = useState<string>('')
    const [to, setTo] = useState<string>('')
    const [filterEarmark, setFilterEarmark] = useState<number | null>(null)
    const [filterBudgetId, setFilterBudgetId] = useState<number | null>(null)
    const [filterTag, setFilterTag] = useState<string | null>(null)
    // Batch earmark assignment modal state
    const [showBatchEarmark, setShowBatchEarmark] = useState<boolean>(false)
    // Debounced auto-apply filters
    useEffect(() => {
        const t = setTimeout(() => { setPage(1); loadRecent() }, 350)
        return () => clearTimeout(t)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterPM, filterSphere, filterType, from, to, filterEarmark, filterBudgetId, filterTag, sortDir, sortBy, q])

    // Active earmarks for selection in forms (used in filters and forms)
    const [earmarks, setEarmarks] = useState<Array<{ id: number; code: string; name: string; color?: string | null }>>([])
    const [tagDefs, setTagDefs] = useState<Array<{ id: number; name: string; color?: string | null; usage?: number }>>([])
    async function loadEarmarks() {
        const res = await window.api?.bindings.list?.({ activeOnly: true })
        if (res) setEarmarks(res.rows.map(r => ({ id: r.id, code: r.code, name: r.name, color: (r as any).color })))
    }
    // Load active earmarks once for forms and filters
    useEffect(() => { loadEarmarks() }, [])
    useEffect(() => {
        let cancelled = false
        async function load() {
            const res = await window.api?.tags?.list?.({})
            if (!cancelled && res?.rows) setTagDefs(res.rows)
        }
        load()
        const onTagsChanged = () => load()
        window.addEventListener('tags-changed', onTagsChanged)
        return () => { cancelled = true; window.removeEventListener('tags-changed', onTagsChanged) }
    }, [])

    // Lightweight lookup for budget names (for chips), decoupled from budgets state order
    const [budgetNames, setBudgetNames] = useState<Record<number, string>>({})
    useEffect(() => {
        let alive = true
        async function loadNames() {
            try {
                const res = await window.api?.budgets?.list?.({})
                const map: Record<number, string> = {}
                for (const b of (res?.rows || []) as any[]) {
                    const nm = (b.name && String(b.name).trim()) || b.categoryName || b.projectName || String(b.year)
                    map[b.id] = nm
                }
                if (alive) setBudgetNames(map)
            } catch { /* ignore */ }
        }
        loadNames()
        const onChanged = () => loadNames()
        window.addEventListener('data-changed', onChanged)
        return () => { alive = false; window.removeEventListener('data-changed', onChanged) }
    }, [])

    const activeChips = useMemo(() => {
        const chips: Array<{ key: string; label: string; clear: () => void }> = []
        if (from) chips.push({ key: 'from', label: `von ${fmtDate(from)}`, clear: () => setFrom('') })
        if (to) chips.push({ key: 'to', label: `bis ${fmtDate(to)}`, clear: () => setTo('') })
        if (filterSphere) chips.push({ key: 'sphere', label: `Sphäre: ${filterSphere}`, clear: () => setFilterSphere(null) })
        if (filterType) chips.push({ key: 'type', label: `Art: ${filterType}`, clear: () => setFilterType(null) })
        if (filterPM) chips.push({ key: 'pm', label: `Zahlweg: ${filterPM}`, clear: () => setFilterPM(null) })
        if (filterEarmark) {
            const em = earmarks.find(e => e.id === filterEarmark)
            chips.push({ key: 'earmark', label: `Zweckbindung: ${em?.code ?? '#' + filterEarmark}`, clear: () => setFilterEarmark(null) })
        }
        if (filterTag) chips.push({ key: 'tag', label: `Tag: ${filterTag}`, clear: () => setFilterTag(null) })
        if (filterBudgetId) {
            const label = budgetNames[filterBudgetId] || `#${filterBudgetId}`
            chips.push({ key: 'budget', label: `Budget: ${label}`, clear: () => setFilterBudgetId(null) })
        }
        if (q) chips.push({ key: 'q', label: `Suche: ${q}`.slice(0, 40) + (q.length > 40 ? '…' : ''), clear: () => setQ('') })
        return chips
    }, [from, to, filterSphere, filterType, filterPM, filterEarmark, filterBudgetId, filterTag, earmarks, budgetNames, q, fmtDate])

    const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])

    // Zweckbindungen (Bindings) state
    const [bindings, setBindings] = useState<Array<{ id: number; code: string; name: string; description?: string | null; startDate?: string | null; endDate?: string | null; isActive: number; color?: string | null; budget?: number | null }>>([])
    const [editBinding, setEditBinding] = useState<null | { id?: number; code: string; name: string; description?: string | null; startDate?: string | null; endDate?: string | null; isActive?: boolean; color?: string | null; budget?: number | null }>(null)
    const [deleteBinding, setDeleteBinding] = useState<null | { id: number; code: string; name: string }>(null)
    async function loadBindings() {
        const res = await window.api?.bindings.list?.({})
        if (res) setBindings(res.rows)
    }

    // Budgets state
    const [budgets, setBudgets] = useState<Array<{ id: number; year: number; sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; categoryId: number | null; projectId: number | null; earmarkId: number | null; amountPlanned: number; name?: string | null; categoryName?: string | null; projectName?: string | null; startDate?: string | null; endDate?: string | null; color?: string | null }>>([])
    // Derived friendly list for selects
    const budgetsForEdit = useMemo(() => {
        const byIdEarmark = new Map(earmarks.map(e => [e.id, e]))
        const makeLabel = (b: any) => {
            if (b.name && String(b.name).trim()) return String(b.name).trim()
            if (b.categoryName && String(b.categoryName).trim()) return `${b.year} · ${b.categoryName}`
            if (b.projectName && String(b.projectName).trim()) return `${b.year} · ${b.projectName}`
            if (b.earmarkId) {
                const em = byIdEarmark.get(b.earmarkId)
                if (em) return `${b.year} · 🎯 ${em.code}`
            }
            return String(b.year)
        }
        return (budgets || []).map((b) => ({ id: b.id, label: makeLabel(b) }))
    }, [budgets, earmarks])
    const [editBudget, setEditBudget] = useState<null | { id?: number; year: number; sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; categoryId?: number | null; projectId?: number | null; earmarkId?: number | null; amountPlanned: number }>(null)
    const [deleteBudget, setDeleteBudget] = useState<null | { id: number; name?: string | null }>(null)
    async function loadBudgets() {
        const res = await window.api?.budgets.list?.({})
        if (res) setBudgets(res.rows)
    }

    useEffect(() => {
        if (activePage === 'Zweckbindungen') loadBindings()
        if (activePage === 'Budgets') loadBudgets()
        // Also ensure budgets are available for forms in Buchungen
        if (activePage === 'Buchungen') { loadBudgets() }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activePage])

    // (earmarks loaded above)

    // Preference: colored vs monochrome menu icons
    type NavIconColorMode = 'color' | 'mono'
    const [navIconColorMode, setNavIconColorMode] = useState<NavIconColorMode>(() => {
        try { return (localStorage.getItem('ui.navIconColorMode') as NavIconColorMode) || 'mono' } catch { return 'mono' }
    })
    useEffect(() => { try { localStorage.setItem('ui.navIconColorMode', navIconColorMode) } catch { } }, [navIconColorMode])
    const navIconPalette: Record<string, string> = {
        'Dashboard': '#7C4DFF',
        'Buchungen': '#2962FF',
        'Rechnungen': '#00B8D4',
        'Mitglieder': '#26A69A',
        'Budgets': '#00C853',
        'Zweckbindungen': '#FFD600',
        'Belege': '#FF9100',
        'Reports': '#F50057',
        'Einstellungen': '#9C27B0'
    }
    const isTopNav = navLayout === 'top'
    // Smart restore preview state
    const [smartRestore, setSmartRestore] = useState<null | {
        current: { root: string; dbPath: string; exists: boolean; mtime?: number | null; counts?: Record<string, number>; last?: Record<string, string | null> }
        default: { root: string; dbPath: string; exists: boolean; mtime?: number | null; counts?: Record<string, number>; last?: Record<string, string | null> }
        recommendation?: 'useDefault' | 'migrateToDefault' | 'manual'
    }>(null)
    return (
        <div style={{ display: 'grid', gridTemplateColumns: isTopNav ? '1fr' : `${sidebarCollapsed ? '64px' : '240px'} 1fr`, gridTemplateRows: '56px 1fr', gridTemplateAreas: isTopNav ? '"top" "main"' : '"top top" "side main"', height: '100vh', overflow: 'hidden' }}>
            {/* Topbar with organisation header line */}
            <header
                style={{ gridArea: 'top', position: 'sticky', top: 0, zIndex: 1000, display: 'grid', gridTemplateColumns: isTopNav ? '1fr auto 1fr 104px' : '1fr 104px', alignItems: 'center', gap: 12, padding: '4px 8px', borderBottom: '1px solid var(--border)', backdropFilter: 'var(--blur)', background: 'color-mix(in oklab, var(--surface) 80%, transparent)', WebkitAppRegion: 'drag' } as any}
                onDoubleClick={(e) => {
                    const target = e.target as HTMLElement
                    // Ignore double-clicks on interactive elements
                    if (target && target.closest('button, input, select, textarea, a, [role="button"]')) return
                    window.api?.window?.toggleMaximize?.()
                }}
            >
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, WebkitAppRegion: 'no-drag' } as any}>
                    {!isTopNav && (
                        <button
                            className="btn ghost"
                            title={sidebarCollapsed ? 'Seitenleiste erweitern' : 'Seitenleiste komprimieren'}
                            aria-label="Seitenleiste umschalten"
                            onClick={() => setSidebarCollapsed(v => !v)}
                            style={{ width: 28, height: 28, padding: 0, display: 'grid', placeItems: 'center', borderRadius: 8 }}
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                <rect x="3" y="5" width="18" height="14" fill="none" stroke="currentColor" strokeWidth="2" />
                                <rect x="3" y="5" width="5" height="14" />
                            </svg>
                        </button>
                    )}
                    <TopHeaderOrg />
                </div>
                {isTopNav ? (
                    <nav aria-label="Hauptmenü (oben)" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifySelf: 'center', WebkitAppRegion: 'no-drag' } as any}>
                        {/* Groups: Dashboard | Buchungen | Rechnungen+Mitglieder | Budgets+Zweckbindungen | Belege/Reports | Einstellungen */}
                        {[
                            [
                                { key: 'Dashboard', icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" /></svg>) }
                            ],
                            // Middle cluster split into sub-groups with light separators
                            [
                                { key: 'Buchungen', icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 5h18v2H3V5zm0 6h18v2H3v-2zm0 6h12v2H3v-2z" /></svg>) }
                            ],
                            [
                                { key: 'Rechnungen', icon: (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" role="img" aria-label="Rechnungen">
                                        <path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM14 3v5h5"/>
                                        <path d="M8 12h8v2H8zM8 16h8v2H8zM8 8h4v2H8z"/>
                                    </svg>
                                ) },
                                { key: 'Mitglieder', icon: (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" role="img" aria-label="Mitglieder">
                                        <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V20h14v-3.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V20h7v-3.5c0-2.33-4.67-3.5-7-3.5z"/>
                                    </svg>
                                ) },
                            ],
                            [
                                { key: 'Budgets', icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 17h18v2H3v-2zm0-7h18v6H3V10zm0-5h18v2H3V5z" /></svg>) },
                                { key: 'Zweckbindungen', icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 7V3L1 9l11 6 9-4.91V17h2V9L12 3v4z" /></svg>) }
                            ],
                            [
                                { key: 'Belege', icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16l4-2 4 2 4-2 4 2V8l-6-6zM8 12h8v2H8v-2zm0-4h5v2H8V8z" /></svg>) },
                                { key: 'Reports', icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 3h18v2H3V3zm2 4h14v14H5V7zm2 2v10h10V9H7z" /></svg>) }
                            ],
                            [
                                { key: 'Einstellungen', icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.14 12.94a7.97 7.97 0 0 0 .06-1l2.03-1.58-1.92-3.32-2.39.5a7.97 7.97 0 0 0-1.73-1l-.36-2.43h-3.84l-.36 2.43a7.97 7.97 0 0 0-1.73 1l-2.39-.5-1.92 3.32L4.8 11.94c0 .34.02.67.06 1L2.83 14.5l1.92 3.32 2.39-.5c.53.4 1.12.74 1.73 1l.36 2.43h3.84l.36-2.43c.61-.26 1.2-.6 1.73-1l2.39.5 1.92-3.32-2.03-1.56zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z" /></svg>) }
                            ]
                        ].map((group, gi, arr) => (
                            <>
                                {group.map(({ key, icon }) => (
                                    <button
                                        key={key}
                                        className="btn ghost"
                                        onClick={() => setActivePage(key as any)}
                                        title={key}
                                        aria-label={key}
                                        style={{ width: 36, height: 36, padding: 0, display: 'grid', placeItems: 'center', borderRadius: 10, background: activePage === (key as any) ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }}
                                    >
                                        <span style={{ color: navIconColorMode === 'color' ? navIconPalette[key] : undefined }}>
                                            {icon}
                                        </span>
                                    </button>
                                ))}
                                {gi < arr.length - 1 && (
                                    <span aria-hidden style={{ display: 'inline-block', width: 1, height: 24, background: 'var(--border)', margin: '0 8px' }} />
                                )}
                            </>
                        ))}
                    </nav>
                ) : null}
                {isTopNav && <div />}
                {/* Window controls */}
                <WindowControls />
            </header>
            {!isTopNav && (
                <aside aria-label="Seitenleiste" style={{ gridArea: 'side', display: 'flex', flexDirection: 'column', padding: 8, borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
                    <SidebarNav
                        activePage={activePage as any}
                        sidebarCollapsed={sidebarCollapsed}
                        navIconColorMode={navIconColorMode}
                        onSelect={(k) => setActivePage(k as any)}
                    />
                </aside>
            )}

            {/* Main content */}
            <main style={{ gridArea: 'main', padding: 16, overflowY: 'auto' }}>
                            {/* Removed top-left Tag badge to avoid duplication with chips below */}
                            {/* Active filter indicator (global). Hidden on Buchungen, where a local inline button is rendered next to badges. */}
                            {activeChips.length > 0 && activePage !== 'Buchungen' && (
                                <button
                                    className="btn"
                                    title="Filter zurücksetzen"
                                    onClick={async () => {
                                        setFrom(''); setTo(''); setFilterSphere(null); setFilterType(null); setFilterPM(null); setFilterEarmark(null); setFilterBudgetId(null); setFilterTag(null); setQ(''); setPage(1);
                                        await loadRecent()
                                    }}
                                    style={{ background: 'color-mix(in oklab, var(--accent) 20%, transparent)', borderColor: 'var(--accent)', padding: '6px 10px' }}
                                >
                                    Filter zurücksetzen
                                </button>
                            )}
                        
                    
                    {activePage === 'Reports' && <h1>Reports</h1>}
                    {activePage === 'Zweckbindungen' && <h1>Zweckbindungen</h1>}
                    {activePage === 'Budgets' && <h1>Budgets</h1>}
                    {activePage === 'Dashboard' && (
                        <DashboardView today={today} onGoToInvoices={() => setActivePage('Rechnungen')} />
                    )}
                    {activePage === 'Buchungen' && (
                        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                            {/* Sphäre/Zweckbindung/Budget via Modal; keep rest inline */}
                            <span style={{ color: 'var(--text-dim)' }}>Art:</span>
                            <select className="input" value={filterType ?? ''} onChange={(e) => setFilterType((e.target.value as any) || null)}>
                                <option value="">Alle</option>
                                <option value="IN">IN</option>
                                <option value="OUT">OUT</option>
                                <option value="TRANSFER">TRANSFER</option>
                            </select>
                            <span style={{ color: 'var(--text-dim)' }}>Zahlweg:</span>
                            <select className="input" value={filterPM ?? ''} onChange={(e) => { const v = e.target.value as any; setFilterPM(v || null); }}>
                                <option value="">Alle</option>
                                <option value="BAR">Bar</option>
                                <option value="BANK">Bank</option>
                            </select>
                            <span style={{ color: 'var(--text-dim)' }}>Tag:</span>
                            <select className="input" value={filterTag ?? ''} onChange={(e) => setFilterTag(e.target.value || null)}>
                                <option value="">Alle</option>
                                {tagDefs.map(t => (
                                    <option key={t.id} value={t.name}>{t.name}</option>
                                ))}
                            </select>

                            {/* Textsuche */}
                            <input
                                className="input"
                                placeholder="Suche (#ID, Text, Betrag …)"
                                value={q}
                                onChange={(e) => { setQ(e.target.value); setPage(1); }}
                                style={{ minWidth: 200, flex: '1 1 260px' }}
                                aria-label="Suche"
                            />

                            {/* Icons: Zeitraum & Meta-Filter */}
                            <button
                                className="btn ghost"
                                title="Zeitraum wählen"
                                aria-label="Zeitraum wählen"
                                onClick={() => setShowTimeFilter(true)}
                                style={{ display: 'grid', placeItems: 'center' }}
                            >
                                {/* Calendar icon */}
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                    <path d="M7 2h2v2h6V2h2v2h3v18H4V4h3V2zm-1 6v12h12V8H6zm2 2h3v3H8v-3z" />
                                </svg>
                            </button>
                            <button
                                className="btn ghost"
                                title="Sphäre / Zweckbindung / Budget filtern"
                                aria-label="Sphäre / Zweckbindung / Budget filtern"
                                onClick={() => setShowMetaFilter(true)}
                                style={{ display: 'grid', placeItems: 'center' }}
                            >
                                {/* Funnel/Filter icon */}
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                    <path d="M3 4h18v2L14 13v6l-4 2v-8L3 6V4z" />
                                </svg>
                            </button>

                            {/* Refresh button removed – data reloads on filter changes and actions */}
                            <button
                                className="btn ghost"
                                title="Batch zuweisen (Zweckbindung/Tags/Budget) auf aktuelle Filter anwenden"
                                aria-label="Batch zuweisen (Zweckbindung/Tags/Budget)"
                                onClick={() => setShowBatchEarmark(true)}
                                style={{ color: '#e91e63', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <rect x="3" y="4" width="18" height="4" rx="1" />
                                    <rect x="3" y="10" width="18" height="4" rx="1" />
                                    <rect x="3" y="16" width="18" height="4" rx="1" />
                                </svg>
                            </button>
                            {/* Batch button moved to the top toolbar */}
                        </div>
                    )}
                    {activePage === 'Reports' && (
                        <div className="card" style={{ padding: 12 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'center' }}>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <span style={{ color: 'var(--text-dim)' }}>Zeitraum:</span>
                                    <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                                    <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                                    <span style={{ color: 'var(--text-dim)' }}>Jahr:</span>
                                    {/* dynamic years from vouchers */}
                                    <select className="input" value={(() => {
                                        if (!from || !to) return ''
                                        const fy = from.slice(0, 4)
                                        const ty = to.slice(0, 4)
                                        // full-year only when matching boundaries
                                        if (from === `${fy}-01-01` && to === `${fy}-12-31` && fy === ty) return fy
                                        return ''
                                    })()} onChange={(e) => {
                                        const y = e.target.value
                                        if (!y) { setFrom(''); setTo(''); return }
                                        const yr = Number(y)
                                        const f = new Date(Date.UTC(yr, 0, 1)).toISOString().slice(0, 10)
                                        const t = new Date(Date.UTC(yr, 11, 31)).toISOString().slice(0, 10)
                                        setFrom(f); setTo(t)
                                    }}>
                                        <option value="">Alle</option>
                                        {yearsAvail.map((y) => <option key={y} value={String(y)}>{y}</option>)}
                                    </select>
                                    <div className="inline-field">
                                        <span style={{ color: 'var(--text-dim)' }}>Sphäre:</span>
                                        <select className="input" value={filterSphere ?? ''} onChange={(e) => setFilterSphere((e.target.value as any) || null)}>
                                            <option value="">Alle</option>
                                            <option value="IDEELL">IDEELL</option>
                                            <option value="ZWECK">ZWECK</option>
                                            <option value="VERMOEGEN">VERMOEGEN</option>
                                            <option value="WGB">WGB</option>
                                        </select>
                                    </div>
                                    <span style={{ color: 'var(--text-dim)' }}>Art:</span>
                                    <select className="input" value={filterType ?? ''} onChange={(e) => setFilterType((e.target.value as any) || null)}>
                                        <option value="">Alle</option>
                                        <option value="IN">IN</option>
                                        <option value="OUT">OUT</option>
                                        <option value="TRANSFER">TRANSFER</option>
                                    </select>
                                    <span style={{ color: 'var(--text-dim)' }}>Zahlweg:</span>
                                    <select className="input" value={filterPM ?? ''} onChange={(e) => { const v = e.target.value as any; setFilterPM(v || null); }}>
                                        <option value="">Alle</option>
                                        <option value="BAR">Bar</option>
                                        <option value="BANK">Bank</option>
                                    </select>
                                    <button className="btn ghost" title="Filter zurücksetzen" onClick={() => { setFilterSphere(null); setFilterType(null); setFilterPM(null); setFrom(''); setTo(''); }} style={{ padding: '6px 10px' }}>Filter zurücksetzen</button>
                                </div>
                                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <button className="btn" onClick={() => setShowExportOptions(true)}>Exportieren…</button>
                                </div>
                            </div>
                        </div>
                    )}
                    {activePage === 'Reports' && (
                        <>
                            {/* Unified Reports view: KPIs + donuts/bars + monthly charts */}
                            <ReportsSummary refreshKey={refreshKey} from={from || undefined} to={to || undefined} sphere={filterSphere || undefined} type={filterType || undefined} paymentMethod={filterPM || undefined} />
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <ReportsSphereDonut refreshKey={refreshKey} from={from || undefined} to={to || undefined} />
                                <ReportsPaymentMethodBars refreshKey={refreshKey} from={from || undefined} to={to || undefined} />
                            </div>
                            <div style={{ height: 12 }} />
                            <ReportsMonthlyChart activateKey={reportsActivateKey} refreshKey={refreshKey} from={from || undefined} to={to || undefined} sphere={filterSphere || undefined} type={filterType || undefined} paymentMethod={filterPM || undefined} />
                            <ReportsInOutLines activateKey={reportsActivateKey} refreshKey={refreshKey} from={from || undefined} to={to || undefined} sphere={filterSphere || undefined} />
                        </>
                    )}

                    {activePage === 'Buchungen' && activeChips.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 8px', alignItems: 'center' }}>
                            {activeChips.map((c) => (
                                <span key={c.key} className="chip">
                                    {c.label}
                                    <button className="chip-x" onClick={c.clear} aria-label={`Filter ${c.key} löschen`}>×</button>
                                </span>
                            ))}
                            <button
                                className="btn"
                                title="Filter zurücksetzen"
                                onClick={async () => {
                                    setFrom(''); setTo(''); setFilterSphere(null); setFilterType(null); setFilterPM(null); setFilterEarmark(null); setFilterBudgetId(null); setFilterTag(null); setQ(''); setPage(1);
                                    await loadRecent()
                                }}
                                style={{ background: 'color-mix(in oklab, var(--accent) 20%, transparent)', borderColor: 'var(--accent)', padding: '6px 10px' }}
                            >
                                Filter zurücksetzen
                            </button>
                        </div>
                    )}

                    {/* Status card removed; replaced by toasts */}

                    {/* Heading removed per request */}
                    {activePage === 'Buchungen' && (
                        <FilterTotals refreshKey={refreshKey} from={from || undefined} to={to || undefined} paymentMethod={filterPM || undefined} sphere={filterSphere || undefined} type={filterType || undefined} earmarkId={filterEarmark || undefined} q={q || undefined} tag={filterTag || undefined} />
                    )}
                    {activePage === 'Buchungen' && (
                        <div className="card">
                                <JournalTable
                                    rows={rows}
                                    order={order}
                                    cols={cols}
                                    onReorder={(o: any) => setOrder(o as any)}
                                    earmarks={earmarks}
                                    tagDefs={tagDefs}
                                    eurFmt={eurFmt}
                                    fmtDate={fmtDate}
                                    onEdit={(r) => setEditRow({
                                        ...r,
                                        // defaults for amount editor
                                        mode: (r as any).grossAmount != null ? 'GROSS' : 'NET',
                                        netAmount: (r as any).netAmount ?? null,
                                        grossAmount: (r as any).grossAmount ?? null,
                                        vatRate: (r as any).vatRate ?? 0
                                    } as any)}
                                    onDelete={(r) => setDeleteRow(r)}
                                    onToggleSort={(col: 'date' | 'net' | 'gross') => {
                                        setPage(1)
                                        setSortBy(col)
                                        setSortDir(prev => (col === sortBy ? (prev === 'DESC' ? 'ASC' : 'DESC') : 'DESC'))
                                    }}
                                    sortDir={sortDir}
                                    sortBy={sortBy}
                                    highlightId={flashId}
                                    lockedUntil={periodLock?.closedUntil || null}
                                    onTagClick={async (name) => {
                                        setFilterTag(name)
                                        setActivePage('Buchungen')
                                        setPage(1)
                                        await loadRecent()
                                    }}
                                    onEarmarkClick={async (id) => {
                                        setFilterEarmark(id)
                                        setActivePage('Buchungen')
                                        setPage(1)
                                        await loadRecent()
                                    }}
                                    onBudgetClick={async (id) => {
                                        setFilterBudgetId(id)
                                        setActivePage('Buchungen')
                                        setPage(1)
                                        await loadRecent()
                                    }}
                                />
                            </div>
                            {/* Batch assign modal (earmark, tags, budget) */}
                            {showBatchEarmark && (
                                <BatchEarmarkModal
                                    onClose={() => setShowBatchEarmark(false)}
                                    earmarks={earmarks}
                                    tagDefs={tagDefs}
                                    budgets={budgetsForEdit}
                                    currentFilters={{
                                        paymentMethod: filterPM || undefined,
                                        sphere: filterSphere || undefined,
                                        type: filterType || undefined,
                                        from: from || undefined,
                                        to: to || undefined,
                                        q: q || undefined,
                                    }}
                                    onApplied={async (updated) => {
                                        notify('success', `${updated} Buchung(en) aktualisiert`)
                                        setShowBatchEarmark(false)
                                        await loadRecent()
                                        bumpDataVersion()
                                    }}
                                    notify={notify}
                                />
                            )}
                            {/* Edit Modal */}
                            {editRow && (
                                <div className="modal-overlay" onClick={() => setEditRow(null)}>
                                    <div className="modal booking-modal" onClick={(e) => e.stopPropagation()} style={{ display: 'grid', gap: 16 }}>
                                        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                            <h2 style={{ margin: 0 }}>
                                                {(() => {
                                                    const desc = (editRow.description || '').trim()
                                                    const label = desc ? `+ Buchung (${desc.length > 60 ? desc.slice(0,60) + '…' : desc}) bearbeiten` : `+ Buchung bearbeiten`
                                                    return label
                                                })()}
                                            </h2>
                                            <button className="btn danger" onClick={() => setEditRow(null)}>Schließen</button>
                                        </header>

                                        <form onSubmit={async (e) => {
                                            e.preventDefault()
                                            try {
                                                const payload: any = { id: editRow.id, date: editRow.date, description: editRow.description ?? null, type: editRow.type, sphere: editRow.sphere, earmarkId: editRow.earmarkId, budgetId: editRow.budgetId, tags: editRow.tags || [] }
                                                if (editRow.type === 'TRANSFER') {
                                                    delete payload.paymentMethod
                                                    payload.transferFrom = editRow.transferFrom ?? null
                                                    payload.transferTo = editRow.transferTo ?? null
                                                } else {
                                                    payload.paymentMethod = editRow.paymentMethod ?? null
                                                    payload.transferFrom = null
                                                    payload.transferTo = null
                                                }
                                                if ((editRow as any).mode === 'GROSS' && (editRow as any).grossAmount != null && (editRow as any).grossAmount !== '') {
                                                    payload.grossAmount = Number((editRow as any).grossAmount)
                                                    if ((editRow as any).vatRate != null) payload.vatRate = Number((editRow as any).vatRate)
                                                } else if ((editRow as any).mode === 'NET' && (editRow as any).netAmount != null && (editRow as any).netAmount !== '') {
                                                    payload.netAmount = Number((editRow as any).netAmount)
                                                    if ((editRow as any).vatRate != null) payload.vatRate = Number((editRow as any).vatRate)
                                                }
                                                const res = await window.api?.vouchers.update?.(payload)
                                                notify('success', 'Buchung gespeichert')
                                                const w = (res as any)?.warnings as string[] | undefined
                                                if (w && w.length) { for (const msg of w) notify('info', 'Warnung: ' + msg) }
                                                setFlashId(editRow.id); window.setTimeout(() => setFlashId((cur) => (cur === editRow.id ? null : cur)), 3000)
                                                setEditRow(null); await loadRecent(); bumpDataVersion()
                                            } catch (e: any) {
                                                notify('error', friendlyError(e))
                                            }
                                        }}>
                                            {/* Live Summary */}
                                            <div className="card" style={{ padding: 10, marginBottom: 8 }}>
                                                <div className="helper">Zusammenfassung</div>
                                                <div style={{ fontWeight: 600 }}>
                                                    {(() => {
                                                        const date = fmtDate(editRow.date)
                                                        const type = editRow.type
                                                        const pm = editRow.type === 'TRANSFER' ? (((editRow as any).transferFrom || '—') + ' → ' + ((editRow as any).transferTo || '—')) : ((editRow as any).paymentMethod || '—')
                                                        const amount = (() => {
                                                            if (editRow.type === 'TRANSFER') return eurFmt.format(Number((editRow as any).grossAmount || 0))
                                                            if ((editRow as any).mode === 'GROSS') return eurFmt.format(Number((editRow as any).grossAmount || 0))
                                                            const n = Number((editRow as any).netAmount || 0); const v = Number((editRow as any).vatRate || 0); const g = Math.round((n * (1 + v / 100)) * 100) / 100
                                                            return eurFmt.format(g)
                                                        })()
                                                        const sphere = editRow.sphere
                                                        return `${date} · ${type} · ${pm} · ${amount} · ${sphere}`
                                                    })()}
                                                </div>
                                            </div>

                                            {/* Blocks A+B in a side-by-side grid on wide screens */}
                                            <div className="block-grid" style={{ marginBottom: 8 }}>
                                                {/* Block A – Basisinfos */}
                                                <section className="booking-section booking-section--basis">
                                                    <div className="helper title">Basis</div>
                                                    <div className="row">
                                                        <div className="field">
                                                            <label>Datum<span className="required-asterisk" aria-hidden="true">*</span></label>
                                                            <input className="input" type="date" value={editRow.date} onChange={(e) => setEditRow({ ...editRow, date: e.target.value })} />
                                                        </div>
                                                        <div className="field booking-type-row">
                                                            <label>Art<span className="required-asterisk" aria-hidden="true">*</span></label>
                                                            <div className="segment-group" role="group" aria-label="Art wählen">
                                                                {(['IN','OUT','TRANSFER'] as const).map(t => (
                                                                    <button key={t} type="button" className={`seg-btn${editRow.type === t ? ' active' : ''}`} data-type={t} onClick={() => setEditRow({ ...editRow, type: t })}>{t}</button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                        <div className="field">
                                                            <label>Sphäre<span className="required-asterisk" aria-hidden="true">*</span></label>
                                                            <select value={editRow.sphere ?? ''} disabled={editRow.type === 'TRANSFER'} onChange={(e) => setEditRow({ ...editRow, sphere: (e.target.value as any) || undefined })}>
                                                                <option value="">—</option>
                                                                <option value="IDEELL">IDEELL</option>
                                                                <option value="ZWECK">ZWECK</option>
                                                                <option value="VERMOEGEN">VERMOEGEN</option>
                                                                <option value="WGB">WGB</option>
                                                            </select>
                                                        </div>
                                                        {editRow.type === 'TRANSFER' ? (
                                                            <div className="field">
                                                                <label>Richtung</label>
                                                                <select value={`${editRow.transferFrom ?? ''}->${editRow.transferTo ?? ''}`}
                                                                    onChange={(e) => {
                                                                        const v = e.target.value
                                                                        if (v === 'BAR->BANK') setEditRow({ ...editRow, transferFrom: 'BAR', transferTo: 'BANK', paymentMethod: null })
                                                                        else if (v === 'BANK->BAR') setEditRow({ ...editRow, transferFrom: 'BANK', transferTo: 'BAR', paymentMethod: null })
                                                                        else setEditRow({ ...editRow, transferFrom: null, transferTo: null })
                                                                    }}>
                                                                    <option value="->">—</option>
                                                                    <option value="BAR->BANK">BAR → BANK</option>
                                                                    <option value="BANK->BAR">BANK → BAR</option>
                                                                </select>
                                                            </div>
                                                        ) : (
                                                            <div className="field booking-pay-row">
                                                                <label>Zahlweg</label>
                                                                <div className="segment-group" role="group" aria-label="Zahlweg wählen">
                                                                    {(['BAR','BANK'] as const).map(pm => (
                                                                        <button key={pm} type="button" className={`seg-btn${(editRow as any).paymentMethod === pm ? ' active' : ''}`} onClick={() => setEditRow({ ...editRow, paymentMethod: pm })}>{pm === 'BAR' ? 'Bar' : 'Bank'}</button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </section>

                                                {/* Block B – Finanzdetails (restored, without pagination) */}
                                                <section className="booking-section booking-section--finances">
                                                    <div className="helper title">Finanzen</div>
                                                    <div className="row">
                                                        {editRow.type === 'TRANSFER' ? (
                                                            <div className="field" style={{ gridColumn: '1 / -1' }}>
                                                                <label>Betrag (Transfer)<span className="required-asterisk" aria-hidden="true">*</span></label>
                                                                <span className="adorn-wrap">
                                                                    <input className="input amount-input input-transfer" type="number" step="0.01" value={(editRow as any).grossAmount ?? ''}
                                                                        onChange={(e) => {
                                                                            const v = Number(e.target.value)
                                                                            setEditRow({ ...(editRow as any), grossAmount: v } as any)
                                                                        }} />
                                                                    <span className="adorn-suffix">€</span>
                                                                </span>
                                                                <div className="helper">Transfers sind umsatzsteuerneutral.</div>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <div className="field" style={{ gridColumn: '1 / span 2' }}>
                                                                    <label>{(editRow as any).mode === 'GROSS' ? 'Brutto' : 'Netto'}<span className="required-asterisk" aria-hidden="true">*</span></label>
                                                                    <div style={{ display: 'flex', gap: 8 }}>
                                                                        <select className="input" value={(editRow as any).mode ?? 'NET'} onChange={(e) => setEditRow({ ...(editRow as any), mode: e.target.value as any } as any)}>
                                                                            <option value="NET">Netto</option>
                                                                            <option value="GROSS">Brutto</option>
                                                                        </select>
                                                                        <span className="adorn-wrap">
                                                                            <input className="input amount-input" type="number" step="0.01" value={(editRow as any).mode === 'GROSS' ? (editRow as any).grossAmount ?? '' : (editRow as any).netAmount ?? ''}
                                                                                onChange={(e) => {
                                                                                    const v = Number(e.target.value)
                                                                                    if ((editRow as any).mode === 'GROSS') setEditRow({ ...(editRow as any), grossAmount: v } as any)
                                                                                    else setEditRow({ ...(editRow as any), netAmount: v } as any)
                                                                                }} />
                                                                            <span className="adorn-suffix">€</span>
                                                                        </span>
                                                                    </div>
                                                                    <div className="helper">{(editRow as any).mode === 'GROSS' ? 'Bei Brutto wird USt/Netto nicht berechnet' : 'USt wird automatisch berechnet'}</div>
                                                                </div>
                                                                {(editRow as any).mode === 'NET' && (
                                                                    <div className="field">
                                                                        <label>USt %</label>
                                                                        <input className="input" type="number" step="0.1" value={(editRow as any).vatRate ?? 0} onChange={(e) => setEditRow({ ...(editRow as any), vatRate: Number(e.target.value) } as any)} />
                                                                    </div>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                    <div className="row">
                                                        <div className="field">
                                                            <label>Budget</label>
                                                            <select value={(editRow as any).budgetId ?? ''} onChange={(e) => setEditRow({ ...editRow, budgetId: e.target.value ? Number(e.target.value) : null } as any)}>
                                                                <option value="">—</option>
                                                                {budgetsForEdit.map(b => (
                                                                    <option key={b.id} value={b.id}>{b.label}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                        <div className="field">
                                                            <label>Zweckbindung</label>
                                                            <select value={(editRow as any).earmarkId ?? ''} onChange={(e) => setEditRow({ ...editRow, earmarkId: e.target.value ? Number(e.target.value) : null } as any)}>
                                                                <option value="">—</option>
                                                                {earmarks.map(em => (
                                                                    <option key={em.id} value={em.id}>{em.code} – {em.name}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    </div>
                                                </section>
                                            </div>

                                            {/* Block C + D side by side: Meta + Attachments */}
                                            <div className="booking-meta-grid" style={{ marginBottom: 8 }}>
                                                <section className="booking-section booking-section--meta">
                                                    <div className="helper title">Beschreibung & Tags</div>
                                                    <div className="row" style={{ gridTemplateColumns: '1fr' }}>
                                                    <div className="field" style={{ gridColumn: '1 / -1' }}>
                                                        <label>Beschreibung</label>
                                                        <input className="input" value={editRow.description ?? ''} onChange={(e) => setEditRow({ ...editRow, description: e.target.value })} placeholder="z. B. Mitgliedsbeitrag, Spende …" />
                                                    </div>
                                                    <TagsEditor
                                                        label="Tags"
                                                        value={editRow.tags || []}
                                                        onChange={(tags) => setEditRow({ ...editRow, tags })}
                                                        tagDefs={tagDefs}
                                                    />
                                                    </div>
                                                </section>
                                                <section
                                                    className="booking-section booking-section--attachments"
                                                onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                                                onDrop={async (e) => {
                                                    e.preventDefault(); e.stopPropagation();
                                                    if (!editRow) return
                                                    try {
                                                        const list = Array.from(e.dataTransfer?.files || [])
                                                        for (const f of list) {
                                                            const buf = await f.arrayBuffer()
                                                            const dataBase64 = bufferToBase64Safe(buf)
                                                            await window.api?.attachments.add?.({ voucherId: editRow.id, fileName: f.name, dataBase64, mimeType: f.type || undefined })
                                                        }
                                                        const res = await window.api?.attachments.list?.({ voucherId: editRow.id })
                                                        setEditRowFiles(res?.files || [])
                                                    } catch (err: any) {
                                                        notify('error', 'Upload fehlgeschlagen: ' + (err?.message || String(err)))
                                                    }
                                                }}
                                                >
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                                        <strong>Anhänge</strong>
                                                        <div className="helper">Dateien ziehen oder per Button/Ctrl+U hinzufügen</div>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 8 }}>
                                                        <input ref={editFileInputRef} type="file" multiple hidden onChange={async (e) => {
                                                            const list = e.target.files
                                                            if (!list || !list.length || !editRow) return
                                                            try {
                                                                for (const f of Array.from(list)) {
                                                                    const buf = await f.arrayBuffer()
                                                                    const dataBase64 = bufferToBase64Safe(buf)
                                                                    await window.api?.attachments.add?.({ voucherId: editRow.id, fileName: f.name, dataBase64, mimeType: f.type || undefined })
                                                                }
                                                                const res = await window.api?.attachments.list?.({ voucherId: editRow.id })
                                                                setEditRowFiles(res?.files || [])
                                                            } catch (e: any) {
                                                                notify('error', 'Upload fehlgeschlagen: ' + (e?.message || String(e)))
                                                            } finally { if (editFileInputRef.current) editFileInputRef.current.value = '' }
                                                        }} />
                                                        <button type="button" className="btn" onClick={() => editFileInputRef.current?.click?.()}>+ Datei(en)</button>
                                                    </div>
                                                </div>
                                                {editRowFilesLoading && <div className="helper">Lade …</div>}
                                                {!editRowFilesLoading && (
                                                    editRowFiles.length ? (
                                                        <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                                                            {editRowFiles.map((f) => (
                                                                <li key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.fileName}</span>
                                                                    <button className="btn" onClick={() => window.api?.attachments.open?.({ fileId: f.id })}>Öffnen</button>
                                                                    <button className="btn" onClick={async () => {
                                                                        try {
                                                                            const r = await window.api?.attachments.saveAs?.({ fileId: f.id })
                                                                            if (r) notify('success', 'Gespeichert: ' + r.filePath)
                                                                        } catch (e: any) {
                                                                            const m = e?.message || String(e)
                                                                            if (/Abbruch/i.test(m)) return
                                                                            notify('error', 'Speichern fehlgeschlagen: ' + m)
                                                                        }
                                                                    }}>Herunterladen</button>
                                                                    <button className="btn danger" title="Löschen" onClick={() => setConfirmDeleteAttachment({ id: f.id, fileName: f.fileName })}>🗑</button>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    ) : (
                                                        <div className="helper">Keine Dateien vorhanden</div>
                                                    )
                                                )}
                                                </section>
                                            </div>
                                            {confirmDeleteAttachment && (
                                                <div className="modal-overlay" onClick={() => setConfirmDeleteAttachment(null)} role="dialog" aria-modal="true">
                                                    <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, display: 'grid', gap: 12 }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <h3 style={{ margin: 0 }}>Anhang löschen</h3>
                                                            <button
                                                                className="btn ghost"
                                                                onClick={() => setConfirmDeleteAttachment(null)}
                                                                aria-label="Schließen"
                                                                style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', borderRadius: 8 }}
                                                            >
                                                                ✕
                                                            </button>
                                                        </div>
                                                        <div>
                                                            Möchtest du den Anhang
                                                            {` `}
                                                            <strong>{confirmDeleteAttachment.fileName}</strong>
                                                            {` `}
                                                            wirklich löschen?
                                                        </div>
                                                        <div className="helper">Dieser Vorgang kann nicht rückgängig gemacht werden.</div>
                                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                                            <button className="btn" onClick={() => setConfirmDeleteAttachment(null)}>Abbrechen</button>
                                                            <button className="btn danger" onClick={async () => {
                                                                if (!editRow) { setConfirmDeleteAttachment(null); return }
                                                                try {
                                                                    await window.api?.attachments.delete?.({ fileId: confirmDeleteAttachment.id })
                                                                    const res = await window.api?.attachments.list?.({ voucherId: editRow.id })
                                                                    setEditRowFiles(res?.files || [])
                                                                    setConfirmDeleteAttachment(null)
                                                                } catch (e: any) {
                                                                    notify('error', e?.message || String(e))
                                                                }
                                                            }}>Ja, löschen</button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 12, alignItems: 'center' }}>
                                                <div>
                                                    <button type="button" className="btn danger" title="Löschen" onClick={() => { setDeleteRow({ id: editRow.id, voucherNo: (editRow as any)?.voucherNo as any, description: editRow.description ?? null, fromEdit: true }); }}>🗑 Löschen</button>
                                                </div>
                                                <div style={{ display: 'flex', gap: 8 }}>
                                                    <button type="button" className="btn" onClick={() => setEditRow(null)}>Abbrechen</button>
                                                    <button type="submit" className="btn primary">Speichern (Ctrl+S)</button>
                                                </div>
                                            </div>
                                        </form>
                                    </div>
                                </div>
                            )}

                            {/* Delete Modal */}
                            {deleteRow && (
                                <div className="modal-overlay" onClick={() => setDeleteRow(null)} style={{ alignItems: 'center', paddingTop: 0 }}>
                                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                                        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                            <h2 style={{ margin: 0 }}>Buchung löschen</h2>
                                            <button className="btn danger" onClick={() => setDeleteRow(null)}>Schließen</button>
                                        </header>
                                        <p>Möchtest du die Buchung <strong>{deleteRow.voucherNo ? `#${deleteRow.voucherNo}` : ''}{deleteRow.description ? ` ${deleteRow.voucherNo ? '– ' : ''}${deleteRow.description}` : ''}</strong> wirklich löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.</p>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                                            <button className="btn" onClick={() => setDeleteRow(null)}>Abbrechen</button>
                                            <button className="btn danger" onClick={async () => {
                                                try {
                                                    await window.api?.vouchers.delete?.({ id: deleteRow.id })
                                                    setDeleteRow(null)
                                                    // Close edit modal if deletion was initiated from edit, or if the currently edited row matches the deleted one
                                                    try {
                                                        if (deleteRow.fromEdit) setEditRow(null)
                                                        else if (editRow && editRow.id === deleteRow.id) setEditRow(null)
                                                    } catch {}
                                                    await loadRecent()
                                                    bumpDataVersion()
                                                    notify('success', 'Buchung gelöscht')
                                                } catch (e: any) {
                                                    const raw = String(e?.message || e || '')
                                                    // If delete is blocked due to linked invoice, show an explanatory toast
                                                    if (/FOREIGN KEY|constraint|invoice|posted_voucher_id/i.test(raw)) {
                                                        notify('info', 'Diese Buchung ist mit einer Rechnung verknüpft und kann nicht gelöscht werden. Bitte zuerst die Rechnung löschen – danach ist die Buchung löschbar.')
                                                    } else {
                                                        notify('error', friendlyError(e))
                                                    }
                                                }
                                            }}>Ja, löschen</button>
                                        </div>
                                    </div>
                                </div>
                            )}

                        </div>
                    )}

                    {activePage === 'Einstellungen' && (
                        <SettingsView
                            defaultCols={defaultCols}
                            defaultOrder={defaultOrder}
                            cols={cols}
                            setCols={setCols}
                            order={order}
                            setOrder={(o: string[]) => setOrder(o as any)}
                            journalLimit={journalLimit}
                            setJournalLimit={(n: number) => { setJournalLimit(n); setPage(1) }}
                            dateFmt={dateFmt}
                            setDateFmt={setDateFmt}
                            sidebarCollapsed={sidebarCollapsed}
                            setSidebarCollapsed={setSidebarCollapsed}
                            navLayout={navLayout}
                            setNavLayout={setNavLayout}
                            navIconColorMode={navIconColorMode}
                            setNavIconColorMode={setNavIconColorMode}
                            colorTheme={colorTheme}
                            setColorTheme={setColorTheme}
                            journalRowStyle={journalRowStyle}
                            setJournalRowStyle={setJournalRowStyle}
                            journalRowDensity={journalRowDensity}
                            setJournalRowDensity={setJournalRowDensity}
                            tagDefs={tagDefs}
                            setTagDefs={setTagDefs}
                            notify={notify}
                            bumpDataVersion={bumpDataVersion}
                            openTagsManager={() => setShowTagsManager(true)}
                            openSetupWizard={() => setShowSetupWizard(true)}
                            labelForCol={labelForCol}
                            onOpenSmartRestore={(prev) => setSmartRestore(prev)}
                        />
                    )}

                    {activePage === 'Belege' && (
                        <ReceiptsView />
                    )}

                    {activePage === 'Zweckbindungen' && (
                        <>
                            <div className="card" style={{ padding: 12, marginBottom: 12 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div className="helper">Zweckbindungen verwalten</div>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                            {/* Refresh button removed – use actions/filters to reload */}
                                        <button
                                            className="btn primary"
                                            onClick={() => setEditBinding({ code: '', name: '', description: null, startDate: null, endDate: null, isActive: true, color: null } as any)}
                                        >+ Neu</button>
                                    </div>
                                </div>
                                <table cellPadding={6} style={{ marginTop: 8, width: '100%' }}>
                                    <thead>
                                        <tr>
                                            <th align="left">Code</th>
                                            <th align="left">Name</th>
                                            <th align="left">Zeitraum</th>
                                            <th align="left">Status</th>
                                            <th align="right">Budget</th>
                                            <th align="left">Farbe</th>
                                            <th align="center">Aktionen</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {bindings.map(b => (
                                            <tr key={b.id}>
                                                <td>{b.code}</td>
                                                <td>{b.name}</td>
                                                <td>{(b.startDate ?? '—')} – {(b.endDate ?? '—')}</td>
                                                <td>{b.isActive ? 'aktiv' : 'inaktiv'}</td>
                                                <td align="right">{b.budget != null ? eurFmt.format(b.budget) : '—'}</td>
                                                <td>
                                                    {b.color ? (
                                                        <span title={b.color} style={{ display: 'inline-block', width: 16, height: 16, borderRadius: 4, background: b.color, verticalAlign: 'middle' }} />
                                                    ) : '—'}
                                                </td>
                                                <td align="center" style={{ whiteSpace: 'nowrap' }}>
                                                    <button className="btn" onClick={() => setEditBinding({ id: b.id, code: b.code, name: b.name, description: b.description ?? null, startDate: b.startDate ?? null, endDate: b.endDate ?? null, isActive: !!b.isActive, color: b.color ?? null, budget: (b as any).budget ?? null })}>✎</button>
                                                </td>
                                            </tr>
                                        ))}
                                        {bindings.length === 0 && (
                                            <tr>
                                                <td colSpan={7} className="helper">Keine Zweckbindungen vorhanden.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                                {editBinding && (
                                    <BindingModal
                                        value={editBinding}
                                        onClose={() => setEditBinding(null)}
                                        onSaved={async () => { notify('success', 'Zweckbindung gespeichert'); await loadBindings(); await loadEarmarks() }}
                                    />
                                )}
                                {/* Delete-Dialog für Zweckbindungen wird nun im Bearbeiten-Modal gehandhabt */}
                            </div>

                            <EarmarkUsageCards
                                bindings={bindings}
                                from={from || undefined}
                                to={to || undefined}
                                sphere={filterSphere || undefined}
                                onEdit={(b) => setEditBinding({ id: b.id, code: b.code, name: b.name, description: (bindings.find(x => x.id === b.id) as any)?.description ?? null, startDate: (bindings.find(x => x.id === b.id) as any)?.startDate ?? null, endDate: (bindings.find(x => x.id === b.id) as any)?.endDate ?? null, isActive: (bindings.find(x => x.id === b.id) as any)?.isActive ?? true, color: b.color ?? null, budget: (bindings.find(x => x.id === b.id) as any)?.budget ?? null })}
                            />
                        </>
                    )}

                    {activePage === 'Budgets' && (
                        <div className="card" style={{ padding: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div className="helper">Budgets verwalten und Fortschritt verfolgen</div>
                                <button className="btn primary" onClick={() => setEditBudget({ year: new Date().getFullYear(), sphere: 'IDEELL', amountPlanned: 0, categoryId: null, projectId: null, earmarkId: null })}>+ Neu</button>
                            </div>
                            {/* Simple table for now (legacy), will be replaced by tiles below */}
                            <table cellPadding={6} style={{ marginTop: 8, width: '100%' }}>
                                <thead>
                                    <tr>
                                        <th align="left">Jahr</th>
                                        <th align="left">Name</th>
                                        <th align="left">Kategorie</th>
                                        <th align="left">Projekt</th>
                                        <th align="left">Zeitraum</th>
                                        <th align="left">Farbe</th>
                                        <th align="right">Budget</th>
                                        <th align="center">Aktionen</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(budgets as any).map((b: any) => (
                                        <tr key={b.id}>
                                            <td>{b.year}</td>
                                            <td>{b.name ?? '—'}</td>
                                            <td>{b.categoryName ?? '—'}</td>
                                            <td>{b.projectName ?? '—'}</td>
                                            <td>{(b.startDate ?? '—')} – {(b.endDate ?? '—')}</td>
                                            <td>{b.color ? <span title={b.color} style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 4, background: b.color }} /> : '—'}</td>
                                            <td align="right">{eurFmt.format(b.amountPlanned)}</td>
                                            <td align="center" style={{ whiteSpace: 'nowrap' }}>
                                                <button className="btn" onClick={() => setEditBudget({ id: b.id, year: b.year, sphere: b.sphere, categoryId: b.categoryId ?? null, projectId: b.projectId ?? null, earmarkId: b.earmarkId ?? null, amountPlanned: b.amountPlanned, name: b.name ?? null, categoryName: b.categoryName ?? null, projectName: b.projectName ?? null, startDate: b.startDate ?? null, endDate: b.endDate ?? null, color: b.color ?? null } as any)}>✎</button>
                                            </td>
                                        </tr>
                                    ))}
                                    {(budgets as any).length === 0 && (
                                        <tr>
                                            <td colSpan={8} className="helper">Keine Budgets vorhanden.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                            {/* Delete-Dialog für Budgets wird nun im Bearbeiten-Modal gehandhabt */}
                        </div>
                    )}

                    {activePage === 'Budgets' && (
                        <BudgetTiles budgets={budgets as any} eurFmt={eurFmt} onEdit={(b) => setEditBudget({ id: b.id, year: b.year, sphere: b.sphere, categoryId: b.categoryId ?? null, projectId: b.projectId ?? null, earmarkId: b.earmarkId ?? null, amountPlanned: b.amountPlanned, name: b.name ?? null, categoryName: b.categoryName ?? null, projectName: b.projectName ?? null, startDate: b.startDate ?? null, endDate: b.endDate ?? null, color: b.color ?? null } as any)} />
                    )}

                    {activePage === 'Budgets' && editBudget && (
                        <BudgetModal
                            value={editBudget as any}
                            onClose={() => setEditBudget(null)}
                            onSaved={async () => { notify('success', 'Budget gespeichert'); await loadBudgets() }}
                        />
                    )}

                    {activePage === 'Mitglieder' && (
                        <MembersView />
                    )}

                    {activePage === 'Rechnungen' && (
                        <InvoicesView />
                    )}
            </main>

            {/* Quick-Add Modal */}
            {quickAdd && (
                <div className="modal-overlay" onClick={() => setQuickAdd(false)}>
                    <div className="modal booking-modal" onClick={(e) => e.stopPropagation()}>
                        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <h2 style={{ margin: 0 }}>+ Buchung</h2>
                            <button className="btn danger" onClick={() => { setQuickAdd(false); setFiles([]) }}>Schließen</button>
                        </header>
                        <form onSubmit={(e) => { e.preventDefault(); onQuickSave(); }}>
                            {/* Live Summary */}
                            <div className="card" style={{ padding: 10, marginBottom: 8 }}>
                                <div className="helper">Zusammenfassung</div>
                                <div style={{ fontWeight: 600 }}>
                                    {(() => {
                                        const date = fmtDate(qa.date)
                                        const type = qa.type
                                        const pm = qa.type === 'TRANSFER' ? (((qa as any).transferFrom || '—') + ' → ' + ((qa as any).transferTo || '—')) : ((qa as any).paymentMethod || '—')
                                        const amount = (() => {
                                            if (qa.type === 'TRANSFER') return eurFmt.format(Number((qa as any).grossAmount || 0))
                                            if ((qa as any).mode === 'GROSS') return eurFmt.format(Number((qa as any).grossAmount || 0))
                                            const n = Number(qa.netAmount || 0); const v = Number(qa.vatRate || 0); const g = Math.round((n * (1 + v / 100)) * 100) / 100
                                            return eurFmt.format(g)
                                        })()
                                        const sphere = qa.sphere
                                        return `${date} · ${type} · ${pm} · ${amount} · ${sphere}`
                                    })()}
                                </div>
                            </div>

                            {/* Blocks A+B in a side-by-side grid on wide screens */}
                            <div className="block-grid" style={{ marginBottom: 8 }}>
                            {/* Block A – Basisinfos */}
                            <section className="booking-section booking-section--basis">
                                <div className="helper title">Basis</div>
                                <div className="row">
                                    <div className="field">
                                        <label>Datum<span className="required-asterisk" aria-hidden="true">*</span></label>
                                        <input className="input" type="date" value={qa.date} onChange={(e) => setQa({ ...qa, date: e.target.value })} required />
                                    </div>
                                    <div className="field booking-type-row">
                                        <label>Art<span className="required-asterisk" aria-hidden="true">*</span></label>
                                        <div className="segment-group" role="group" aria-label="Art wählen">
                                            {(['IN','OUT','TRANSFER'] as const).map(t => (
                                                <button key={t} type="button" className={`seg-btn${qa.type === t ? ' active' : ''}`} data-type={t} onClick={() => setQa({ ...qa, type: t })}>{t}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="field">
                                        <label>Sphäre<span className="required-asterisk" aria-hidden="true">*</span></label>
                                        <select value={qa.sphere} disabled={qa.type === 'TRANSFER'} onChange={(e) => setQa({ ...qa, sphere: e.target.value as any })}>
                                            <option value="IDEELL">IDEELL</option>
                                            <option value="ZWECK">ZWECK</option>
                                            <option value="VERMOEGEN">VERMOEGEN</option>
                                            <option value="WGB">WGB</option>
                                        </select>
                                    </div>
                                    {qa.type === 'TRANSFER' ? (
                                        <div className="field">
                                            <label>Richtung</label>
                                            <select value={`${(qa as any).transferFrom ?? ''}->${(qa as any).transferTo ?? ''}`}
                                                onChange={(e) => {
                                                    const v = e.target.value
                                                    if (v === 'BAR->BANK') setQa({ ...(qa as any), transferFrom: 'BAR', transferTo: 'BANK', paymentMethod: undefined } as any)
                                                    else if (v === 'BANK->BAR') setQa({ ...(qa as any), transferFrom: 'BANK', transferTo: 'BAR', paymentMethod: undefined } as any)
                                                    else setQa({ ...(qa as any), transferFrom: undefined, transferTo: undefined } as any)
                                                }}>
                                                <option value="->">—</option>
                                                <option value="BAR->BANK">BAR → BANK</option>
                                                <option value="BANK->BAR">BANK → BAR</option>
                                            </select>
                                        </div>
                                    ) : (
                                        <div className="field booking-pay-row">
                                            <label>Zahlweg</label>
                                            <div className="segment-group" role="group" aria-label="Zahlweg wählen">
                                                {(['BAR','BANK'] as const).map(pm => (
                                                    <button key={pm} type="button" className={`seg-btn${(qa as any).paymentMethod === pm ? ' active' : ''}`} onClick={() => setQa({ ...qa, paymentMethod: pm })}>{pm === 'BAR' ? 'Bar' : 'Bank'}</button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </section>

                            {/* Block B – Finanzdetails */}
                            <section className="booking-section booking-section--finances">
                                <div className="helper title">Finanzen</div>
                                <div className="row">
                                    {qa.type === 'TRANSFER' ? (
                                        <div className="field" style={{ gridColumn: '1 / -1' }}>
                                            <label>Betrag (Transfer)<span className="required-asterisk" aria-hidden="true">*</span></label>
                                            <span className="adorn-wrap">
                                                <input className="input input-transfer" type="number" step="0.01" value={(qa as any).grossAmount ?? ''}
                                                    onChange={(e) => {
                                                        const v = Number(e.target.value)
                                                        setQa({ ...qa, grossAmount: v })
                                                    }} />
                                                <span className="adorn-suffix">€</span>
                                            </span>
                                            <div className="helper">Transfers sind umsatzsteuerneutral.</div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="field">
                                                <label>{(qa as any).mode === 'GROSS' ? 'Brutto' : 'Netto'}<span className="required-asterisk" aria-hidden="true">*</span></label>
                                                <div style={{ display: 'flex', gap: 8 }}>
                                                    <select className="input" value={(qa as any).mode ?? 'NET'} onChange={(e) => setQa({ ...qa, mode: e.target.value as any })}>
                                                        <option value="NET">Netto</option>
                                                        <option value="GROSS">Brutto</option>
                                                    </select>
                                                    <span className="adorn-wrap" style={{ flex: 1 }}>
                                                        <input className="input" type="number" step="0.01" value={(qa as any).mode === 'GROSS' ? (qa as any).grossAmount ?? '' : qa.netAmount}
                                                            onChange={(e) => {
                                                                const v = Number(e.target.value)
                                                                if ((qa as any).mode === 'GROSS') setQa({ ...qa, grossAmount: v })
                                                                else setQa({ ...qa, netAmount: v })
                                                            }} />
                                                        <span className="adorn-suffix">€</span>
                                                    </span>
                                                </div>
                                                <div className="helper">{(qa as any).mode === 'GROSS' ? 'Bei Brutto wird USt/Netto nicht berechnet' : 'USt wird automatisch berechnet'}</div>
                                            </div>
                                            {(qa as any).mode === 'NET' && (
                                                <div className="field">
                                                    <label>USt %</label>
                                                    <input className="input" type="number" step="0.1" value={qa.vatRate} onChange={(e) => setQa({ ...qa, vatRate: Number(e.target.value) })} />
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                                <div className="row">
                                    <div className="field">
                                        <label>Budget</label>
                                        <select value={(qa as any).budgetId ?? ''} onChange={(e) => setQa({ ...qa, budgetId: e.target.value ? Number(e.target.value) : null } as any)}>
                                            <option value="">—</option>
                                            {budgetsForEdit.map(b => (
                                                <option key={b.id} value={b.id}>{b.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="field">
                                        <label>Zweckbindung</label>
                                        <select value={(qa as any).earmarkId ?? ''} onChange={(e) => setQa({ ...qa, earmarkId: e.target.value ? Number(e.target.value) : null } as any)}>
                                            <option value="">—</option>
                                            {earmarks.map(em => (
                                                <option key={em.id} value={em.id}>{em.code} – {em.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </section>
                            </div>
                            {/* Block C + D side-by-side */}
                            <div className="booking-meta-grid" style={{ marginBottom: 8 }}>
                                <section className="booking-section booking-section--meta">
                                    <div className="helper title">Beschreibung & Tags</div>
                                    <div className="row" style={{ gridTemplateColumns: '1fr' }}>
                                        <div className="field" style={{ gridColumn: '1 / -1' }}>
                                            <label>Beschreibung</label>
                                            <input className="input" list="desc-suggestions" value={qa.description} onChange={(e) => setQa({ ...qa, description: e.target.value })} placeholder="z. B. Mitgliedsbeitrag, Spende …" />
                                            <datalist id="desc-suggestions">
                                                {descSuggest.map((d, i) => (<option key={i} value={d} />))}
                                            </datalist>
                                        </div>
                                        <TagsEditor
                                            label="Tags"
                                            value={(qa as any).tags || []}
                                            onChange={(tags) => setQa({ ...(qa as any), tags } as any)}
                                            tagDefs={tagDefs}
                                        />
                                    </div>
                                </section>
                                <section className="booking-section booking-section--attachments"
                                    onDragOver={(e) => { if (quickAdd) { e.preventDefault(); e.stopPropagation() } }}
                                    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (quickAdd) onDropFiles(e.dataTransfer?.files) }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                            <strong>Anhänge</strong>
                                            <div className="helper">Dateien ziehen oder per Button/Ctrl+U auswählen</div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => onDropFiles(e.target.files)} />
                                            <button type="button" className="btn" onClick={openFilePicker}>+ Datei(en)</button>
                                            {files.length > 0 && (
                                                <button type="button" className="btn" onClick={() => setFiles([])}>Leeren</button>
                                            )}
                                        </div>
                                    </div>
                                    {files.length > 0 && (
                                        <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                                            {files.map((f, i) => (
                                                <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                                                    <button type="button" className="btn" onClick={() => setFiles(files.filter((_, idx) => idx !== i))}>Entfernen</button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </section>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 12, alignItems: 'center' }}>
                                <div className="helper">Esc = Abbrechen · Ctrl+U = Datei hinzufügen</div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button type="button" className="btn" onClick={() => { setQuickAdd(false); setFiles([]) }}>Abbrechen</button>
                                    <button type="submit" className="btn primary">Speichern (Ctrl+S)</button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* removed: Confirm mark as paid modal */}
            {/* Toasts bottom-right */}
            <Toasts items={toasts} />
            {/* Global Floating Action Button: + Buchung (hidden in Einstellungen und Mitglieder) */}
            {activePage !== 'Einstellungen' && activePage !== 'Mitglieder' && (
                <button className="fab fab-buchung" onClick={() => setQuickAdd(true)} title="+ Buchung">+ Buchung</button>
            )}
            {/* Auto-backup prompt modal (renderer) */}
            {autoBackupPrompt && (
                <AutoBackupPromptModal
                    intervalDays={autoBackupPrompt.intervalDays}
                    onClose={() => setAutoBackupPrompt(null)}
                    onBackupNow={async () => {
                        try {
                            const res = await window.api?.backup?.make?.('auto')
                            if (res?.filePath) {
                                await window.api?.settings?.set?.({ key: 'backup.lastAuto', value: Date.now() })
                                notify('success', 'Backup erstellt')
                                window.dispatchEvent(new Event('data-changed'))
                            } else {
                                notify('error', 'Backup konnte nicht erstellt werden')
                            }
                        } catch (e: any) {
                            notify('error', e?.message || String(e))
                        } finally {
                            setAutoBackupPrompt(null)
                        }
                    }}
                />
            )}
            {/* DB init failed modal */}
            {dbInitError && (
                <DbInitFailedModal
                    message={dbInitError.message}
                    busy={dbInitBusy}
                    onUseExisting={async () => {
                        try {
                            setDbInitBusy(true)
                            await (window as any).api?.db?.location?.useExisting?.()
                            window.location.reload()
                        } catch (e: any) {
                            setDbInitBusy(false)
                            try { (window as any).alert?.('Fehler: ' + (e?.message || String(e))) } catch {}
                        }
                    }}
                    onChooseAndMigrate={async () => {
                        try {
                            setDbInitBusy(true)
                            await (window as any).api?.db?.location?.chooseAndMigrate?.()
                            window.location.reload()
                        } catch (e: any) {
                            setDbInitBusy(false)
                            try { (window as any).alert?.('Fehler: ' + (e?.message || String(e))) } catch {}
                        }
                    }}
                    onResetDefault={async () => {
                        try {
                            setDbInitBusy(true)
                            await (window as any).api?.db?.location?.resetDefault?.()
                            window.location.reload()
                        } catch (e: any) {
                            setDbInitBusy(false)
                            try { (window as any).alert?.('Fehler: ' + (e?.message || String(e))) } catch {}
                        }
                    }}
                    onImportFile={async () => {
                        try {
                            setDbInitBusy(true)
                            await (window as any).api?.db?.import?.()
                            window.location.reload()
                        } catch (e: any) {
                            setDbInitBusy(false)
                            try { (window as any).alert?.('Fehler: ' + (e?.message || String(e))) } catch {}
                        }
                    }}
                />
            )}
            {/* Time Filter Modal for Buchungen */}
            <TimeFilterModal
                open={activePage === 'Buchungen' && showTimeFilter}
                onClose={() => setShowTimeFilter(false)}
                yearsAvail={yearsAvail}
                from={from}
                to={to}
                onApply={({ from: nf, to: nt }) => { setFrom(nf); setTo(nt) }}
            />
            {/* Meta Filter Modal (Sphäre, Zweckbindung, Budget) */}
            <MetaFilterModal
                open={activePage === 'Buchungen' && showMetaFilter}
                onClose={() => setShowMetaFilter(false)}
                earmarks={earmarks}
                budgets={budgets}
                sphere={filterSphere}
                earmarkId={filterEarmark}
                budgetId={filterBudgetId}
                onApply={({ sphere, earmarkId, budgetId }) => { setFilterSphere(sphere); setFilterEarmark(earmarkId); setFilterBudgetId(budgetId) }}
            />
            {/* Global DOM debugger overlay */}
            {/* DomDebugger removed for release */}
            {/* Global Tags Manager Modal */}
            {showTagsManager && (
                <TagsManagerModal
                    onClose={() => setShowTagsManager(false)}
                    notify={notify}
                    onChanged={() => { setShowTagsManager(false); setShowTagsManager(true); /* simple reload of list */ }}
                />
            )}

            {/* Reports: Export Options Modal */}
            {activePage === 'Reports' && showExportOptions && (
                <ExportOptionsModal
                    open={showExportOptions}
                    onClose={() => setShowExportOptions(false)}
                    fields={exportFields}
                    setFields={setExportFields}
                    orgName={exportOrgName}
                    setOrgName={setExportOrgName}
                    amountMode={exportAmountMode}
                    setAmountMode={setExportAmountMode}
                    sortDir={exportSortDir}
                    setSortDir={setExportSortDir}
                    onExport={async (fmt) => {
                        try {
                            const res = await window.api?.reports.export?.({
                                type: 'JOURNAL',
                                format: fmt,
                                from: from || '',
                                to: to || '',
                                filters: { paymentMethod: filterPM || undefined, sphere: filterSphere || undefined, type: filterType || undefined },
                                fields: exportFields,
                                orgName: exportOrgName || undefined,
                                amountMode: exportAmountMode,
                                sort: exportSortDir,
                                sortBy: 'date'
                            } as any)
                            if (res) {
                                const dir = res.filePath?.replace(/\\[^\\/]+$/,'').replace(/\/[^^/]+$/, '') || ''
                                notify('success', `${fmt} exportiert: ${res.filePath}`, 6000, {
                                    label: 'Ordner öffnen',
                                    onClick: () => window.api?.shell?.showItemInFolder?.(res.filePath)
                                })
                            }
                            setShowExportOptions(false)
                        } catch (e: any) {
                            notify('error', e?.message || String(e))
                        }
                    }}
                />
            )}
            {/* First-run Setup Wizard */}
            {showSetupWizard && (
                <SetupWizardModal
                    onClose={() => setShowSetupWizard(false)}
                    navLayout={navLayout}
                    setNavLayout={setNavLayout}
                    navIconColorMode={navIconColorMode}
                    setNavIconColorMode={setNavIconColorMode}
                    colorTheme={colorTheme as any}
                    setColorTheme={setColorTheme as any}
                    journalRowStyle={journalRowStyle}
                    setJournalRowStyle={setJournalRowStyle}
                    journalRowDensity={journalRowDensity}
                    setJournalRowDensity={setJournalRowDensity}
                    existingTags={(tagDefs || []).map(t => ({ name: t.name, color: t.color || undefined }))}
                    notify={notify}
                />
            )}
            {smartRestore && (
                <SmartRestoreModal
                    preview={smartRestore}
                    onClose={() => setSmartRestore(null)}
                    onApply={async (action) => {
                        try {
                            const res = await window.api?.db?.smartRestore?.apply?.({ action })
                            if (res?.ok) {
                                notify('success', action === 'useDefault' ? 'Standard-Datenbank verwendet.' : 'Aktuelle Datenbank in Standardordner migriert.')
                                setSmartRestore(null)
                                window.dispatchEvent(new Event('data-changed'))
                                bumpDataVersion()
                            } else {
                                notify('error', 'Aktion fehlgeschlagen')
                            }
                        } catch (e: any) {
                            notify('error', e?.message || String(e))
                        }
                    }}
                />
            )}
        </div>
    )
}
// Meta Filter Modal: groups Sphäre, Zweckbindung, Budget
// MetaFilterModal extracted to components/modals/MetaFilterModal.tsx

// Time Filter Modal: controls date range and quick year selection
// TimeFilterModal extracted to components/modals/TimeFilterModal.tsx

// Export Options Modal for Reports
// ExportOptionsModal extracted to components/modals/ExportOptionsModal.tsx

// duplicate AutoBackupPromptModal removed; see single definition below
// DashboardView extracted

// AutoBackupPromptModal extracted to components/modals/AutoBackupPromptModal.tsx

// Basic Members UI: list with search and add/edit modal (Phase 1)
function MembersView() {
    const [q, setQ] = useState('')
    const [status, setStatus] = useState<'ALL' | 'ACTIVE' | 'NEW' | 'PAUSED' | 'LEFT'>('ALL')
    const [sortBy, setSortBy] = useState<'memberNo'|'name'|'email'|'status'>(() => { try { return (localStorage.getItem('members.sortBy') as any) || 'name' } catch { return 'name' } })
    const [sort, setSort] = useState<'ASC'|'DESC'>(() => { try { return (localStorage.getItem('members.sort') as any) || 'ASC' } catch { return 'ASC' } })
    useEffect(() => { try { localStorage.setItem('members.sortBy', sortBy) } catch { } }, [sortBy])
    useEffect(() => { try { localStorage.setItem('members.sort', sort) } catch { } }, [sort])
    const [rows, setRows] = useState<Array<{ id: number; memberNo?: string | null; name: string; email?: string | null; phone?: string | null; address?: string | null; status: string; boardRole?: 'V1'|'V2'|'KASSIER'|'KASSENPR1'|'KASSENPR2'|'SCHRIFT' | null; iban?: string | null; bic?: string | null; contribution_amount?: number | null; contribution_interval?: 'MONTHLY'|'QUARTERLY'|'YEARLY' | null; mandate_ref?: string | null; mandate_date?: string | null; join_date?: string | null; leave_date?: string | null; notes?: string | null; next_due_date?: string | null }>>([])
    const [total, setTotal] = useState(0)
    const [limit, setLimit] = useState(50)
    const [offset, setOffset] = useState(0)
    const [busy, setBusy] = useState(false)
    const [showPayments, setShowPayments] = useState(false)
    const [form, setForm] = useState<null | { mode: 'create' | 'edit'; draft: { id?: number; memberNo?: string | null; name: string; email?: string | null; phone?: string | null; address?: string | null; status?: 'ACTIVE'|'NEW'|'PAUSED'|'LEFT'; boardRole?: 'V1'|'V2'|'KASSIER'|'KASSENPR1'|'KASSENPR2'|'SCHRIFT' | null;
        iban?: string | null; bic?: string | null; contribution_amount?: number | null; contribution_interval?: 'MONTHLY'|'QUARTERLY'|'YEARLY' | null;
        mandate_ref?: string | null; mandate_date?: string | null; join_date?: string | null; leave_date?: string | null; notes?: string | null; next_due_date?: string | null; } }>(null)
    const [formTab, setFormTab] = useState<'PERSON'|'FINANCE'|'MANDATE'|'MEMBERSHIP'>('PERSON')
    // Members delete confirm (app-styled modal)
    const [deleteConfirm, setDeleteConfirm] = useState<null | { id: number; label: string }>(null)
    const [deleteBusy, setDeleteBusy] = useState(false)
    // Invite modal state
    const [showInvite, setShowInvite] = useState(false)
    const [inviteBusy, setInviteBusy] = useState(false)
    const [inviteEmails, setInviteEmails] = useState<string[]>([])
    const [inviteSubject, setInviteSubject] = useState<string>(() => { try { return localStorage.getItem('invite.subject') || 'Einladung zur Sitzung' } catch { return 'Einladung zur Sitzung' } })
    const [inviteBody, setInviteBody] = useState<string>(() => { try { return localStorage.getItem('invite.body') || 'Hallo zusammen,\n\nwir laden euch zur Sitzung ein.\n\nViele Grüße' } catch { return 'Hallo zusammen,\n\nwir laden euch zur Sitzung ein.\n\nViele Grüße' } })
    const [inviteActiveOnly, setInviteActiveOnly] = useState<boolean>(() => { try { return localStorage.getItem('invite.activeOnly') === '1' } catch { return false } })
    useEffect(() => { try { localStorage.setItem('invite.subject', inviteSubject) } catch {} }, [inviteSubject])
    useEffect(() => { try { localStorage.setItem('invite.body', inviteBody) } catch {} }, [inviteBody])
    useEffect(() => { try { localStorage.setItem('invite.activeOnly', inviteActiveOnly ? '1' : '0') } catch {} }, [inviteActiveOnly])

    // Column preferences for members table
    const [showColumnsModal, setShowColumnsModal] = useState(false)
    const [colPrefs, setColPrefs] = useState<{ showIBAN: boolean; showContribution: boolean; showAddress: boolean; showBoardTable: boolean; showNotes: boolean }>(() => {
        try {
            const raw = localStorage.getItem('members.columns')
            if (raw) {
                const parsed = JSON.parse(raw)
                return {
                    showIBAN: parsed.showIBAN ?? true,
                    showContribution: parsed.showContribution ?? true,
                    showAddress: parsed.showAddress ?? false,
                    showBoardTable: parsed.showBoardTable ?? false,
                    showNotes: parsed.showNotes ?? false
                }
            }
        } catch {}
        return { showIBAN: true, showContribution: true, showAddress: false, showBoardTable: false, showNotes: false }
    })
    useEffect(() => { try { localStorage.setItem('members.columns', JSON.stringify(colPrefs)) } catch {} }, [colPrefs])
    // Optional separate board table
    const [boardRows, setBoardRows] = useState<any[]>([])
    useEffect(() => {
        let alive = true
        if (!colPrefs.showBoardTable) { setBoardRows([]); return }
        ;(async () => {
            try {
                const pageSize = 200
                let ofs = 0
                let total = 0
                const acc: any[] = []
                do {
                    const res = await (window as any).api?.members?.list?.({ q: q || undefined, status, limit: pageSize, offset: ofs, sortBy: 'memberNo', sort: 'ASC' })
                    const rows = (res?.rows || []) as any[]
                    total = res?.total ?? rows.length
                    acc.push(...rows)
                    ofs += pageSize
                } while (ofs < total)
                const onlyBoard = acc.filter(r => !!r.boardRole)
                const roleOrder: Record<string, number> = { V1: 1, V2: 2, KASSIER: 3, SCHRIFT: 4, KASSENPR1: 5, KASSENPR2: 6 }
                onlyBoard.sort((a, b) => {
                    const ra = roleOrder[String(a.boardRole) as string] || 999
                    const rb = roleOrder[String(b.boardRole) as string] || 999
                    if (ra !== rb) return ra - rb
                    return String(a.name || '').localeCompare(String(b.name || ''), 'de', { sensitivity: 'base' })
                })
                if (alive) setBoardRows(onlyBoard)
            } catch {
                if (alive) setBoardRows([])
            }
        })()
        return () => { alive = false }
    }, [colPrefs.showBoardTable, q, status])

    // Helpers
    const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
    function validateIBAN(iban?: string | null): { ok: boolean; msg?: string } {
        if (!iban) return { ok: true }
        const s = iban.replace(/\s+/g, '').toUpperCase()
        if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/.test(s)) return { ok: false, msg: 'Format ungültig' }
        const rearr = s.slice(4) + s.slice(0, 4)
        const nums = rearr.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55))
        let mod = 0
        for (let i = 0; i < nums.length; i += 7) {
            const part = String(mod) + nums.slice(i, i + 7)
            mod = Number(BigInt(part) % 97n)
        }
        return { ok: mod === 1, msg: mod === 1 ? undefined : 'Prüfziffer ungültig' }
    }
    function validateBIC(bic?: string | null): { ok: boolean; msg?: string } {
        if (!bic) return { ok: true }
        const s = bic.replace(/\s+/g, '').toUpperCase()
        if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(s)) return { ok: false, msg: 'Format ungültig' }
        return { ok: true }
    }
    function nextDuePreview(amount?: number | null, interval?: 'MONTHLY'|'QUARTERLY'|'YEARLY' | null, anchor?: string | null): string | null {
        if (!amount || !interval) return null
        let d = anchor ? new Date(anchor) : new Date()
        if (isNaN(d.getTime())) d = new Date()
        const add = interval === 'MONTHLY' ? 1 : interval === 'QUARTERLY' ? 3 : 12
        d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + add, 1))
        const iso = d.toISOString().slice(0, 10)
    return `${interval === 'MONTHLY' ? 'Monatlich' : interval === 'QUARTERLY' ? 'Quartal' : 'Jährlich'}: ${eurFmt.format(amount)} → Initiale Fälligkeit ca. ${iso}`
    }

    // Required fields UX: highlight and modal
    const [requiredTouched, setRequiredTouched] = useState(false)
    const [missingRequired, setMissingRequired] = useState<string[]>([])

    // Address split helpers for future letter feature (kept local; combined into address on save)
    const [addrStreet, setAddrStreet] = useState<string>('')
    const [addrZip, setAddrZip] = useState<string>('')
    const [addrCity, setAddrCity] = useState<string>('')
    useEffect(() => {
        if (!form) return
        const a = (form.draft.address || '').trim()
        const m = /^(.*?)(?:,\s*)?(\d{4,5})?\s*([^,]*)$/.exec(a)
        if (m) { setAddrStreet(m[1]?.trim() || ''); setAddrZip(m[2]?.trim() || ''); setAddrCity(m[3]?.trim() || '') }
        else { setAddrStreet(a); setAddrZip(''); setAddrCity('') }
    }, [form?.draft.address])

    async function load() {
        setBusy(true)
        try {
            const res = await (window as any).api?.members?.list?.({ q: q || undefined, status, limit, offset, sortBy, sort })
            setRows(res?.rows || []); setTotal(res?.total || 0)
        } catch (e: any) {
            // eslint-disable-next-line no-console
            console.error('members.list failed', e)
        } finally { setBusy(false) }
    }
    useEffect(() => { load() }, [q, status, limit, offset, sortBy, sort])
    // Load invite recipients when invite modal opens
    useEffect(() => {
        if (!showInvite) return
        let alive = true
        ;(async () => {
            setInviteBusy(true)
            try {
                const pageSize = 200
                let ofs = 0
                let emails: string[] = []
                let totalCount = 0
                do {
                    const effectiveStatus = inviteActiveOnly ? 'ACTIVE' : status
                    const res = await (window as any).api?.members?.list?.({ q: q || undefined, status: effectiveStatus, limit: pageSize, offset: ofs })
                    const rows = res?.rows || []
                    totalCount = res?.total || rows.length
                    emails = emails.concat(rows.map((r: any) => String(r.email || '').trim()).filter((e: string) => !!e && /@/.test(e)))
                    ofs += pageSize
                } while (ofs < totalCount)
                const seen = new Set<string>()
                const unique = emails.filter(e => { const k = e.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true })
                if (alive) setInviteEmails(unique)
            } catch { if (alive) setInviteEmails([]) }
            finally { if (alive) setInviteBusy(false) }
        })()
        return () => { alive = false }
    }, [showInvite, q, status, inviteActiveOnly])

    // When opening create modal, reset validation and address fields
    useEffect(() => {
        if (!form) return
        if (form.mode === 'create') { setRequiredTouched(false); setMissingRequired([]); setFormTab('PERSON'); setAddrStreet(''); setAddrZip(''); setAddrCity('') }
    }, [form?.mode])

    const pages = Math.max(1, Math.ceil(total / Math.max(1, limit)))
    const page = Math.floor(offset / Math.max(1, limit)) + 1

    return (
        <div className="card" style={{ padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <h1 style={{ margin: 0 }}>Mitglieder</h1>
                    <input className="input" placeholder="Suche (Name, E-Mail, Tel., Nr.)" value={q} onChange={(e) => { setOffset(0); setQ(e.target.value) }} style={{ width: 300 }} />
                    <select className="input" value={status} onChange={(e) => { setOffset(0); setStatus(e.target.value as any) }}>
                        <option value="ALL">Alle</option>
                        <option value="ACTIVE">Aktiv</option>
                        <option value="NEW">Neu</option>
                        <option value="PAUSED">Pause</option>
                        <option value="LEFT">Ausgetreten</option>
                    </select>
                    <button className="btn ghost" title="Anzuzeigende Spalten wählen" onClick={() => setShowColumnsModal(true)}>Spalten</button>
                    {(() => { const hasFilters = !!(q.trim() || status !== 'ALL'); return hasFilters ? (
                        <button className="btn ghost" onClick={() => { setQ(''); setStatus('ALL'); setOffset(0) }}>Zurücksetzen</button>
                    ) : null })()}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div className="helper">{busy ? 'Lade…' : `Seite ${page}/${pages} – ${total} Einträge`}</div>
                    <button className="btn ghost" title="Alle gefilterten Mitglieder per E-Mail einladen" onClick={() => setShowInvite(true)}>✉ Einladen (E-Mail)</button>
                    <button className="btn primary" onClick={() => { setFormTab('PERSON'); setRequiredTouched(false); setMissingRequired([]); setAddrStreet(''); setAddrZip(''); setAddrCity(''); setForm({ mode: 'create', draft: {
                        name: '', status: 'ACTIVE', boardRole: null, memberNo: null, email: null, phone: null, address: null,
                        iban: null, bic: null, contribution_amount: null, contribution_interval: null,
                        mandate_ref: null, mandate_date: null, join_date: null, leave_date: null, notes: null, next_due_date: null
                    } }) }}>+ Neu</button>
                </div>
            </div>
            {colPrefs.showBoardTable && boardRows.length > 0 && (
                <div className="card" style={{ marginTop: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 8px 0 8px' }}>
                        <h2 style={{ margin: 0 }}>Vorstand</h2>
                        <div className="helper">{boardRows.length} Personen</div>
                    </div>
                    <table cellPadding={6} style={{ marginTop: 4, width: '100%' }}>
                        <thead>
                            <tr>
                                <th align="left">Funktion</th>
                                <th align="left">Name</th>
                                <th align="left">Nr.</th>
                                <th align="left">E-Mail</th>
                                <th align="left">Telefon</th>
                                <th align="center">Aktionen</th>
                            </tr>
                        </thead>
                        <tbody>
                            {boardRows.map((r: any) => (
                                <tr key={`board-${r.id}`}>
                                    <td>{(() => { const map: any = { V1: { label: '1. Vorsitz', color: '#00C853' }, V2: { label: '2. Vorsitz', color: '#4CAF50' }, KASSIER: { label: 'Kassier', color: '#03A9F4' }, KASSENPR1: { label: '1. Prüfer', color: '#FFC107' }, KASSENPR2: { label: '2. Prüfer', color: '#FFD54F' }, SCHRIFT: { label: 'Schriftführer', color: '#9C27B0' } }; const def = map[r.boardRole] || null; return def ? (<span className="badge" style={{ background: def.color, color: '#fff' }}>{def.label}</span>) : (r.boardRole || '—') })()}</td>
                                    <td>{r.name}</td>
                                    <td>{r.memberNo || '—'}</td>
                                    <td>{r.email || '—'}</td>
                                    <td>{r.phone || '—'}</td>
                                    <td align="center" style={{ whiteSpace: 'nowrap' }}>
                                        <button className="btn" title="Bearbeiten" onClick={() => setForm({ mode: 'edit', draft: {
                                            id: r.id,
                                            memberNo: r.memberNo ?? null,
                                            name: r.name,
                                            email: r.email ?? null,
                                            phone: r.phone ?? null,
                                            address: r.address ?? null,
                                            status: r.status as any,
                                            boardRole: (r as any).boardRole ?? null,
                                            iban: (r as any).iban ?? null,
                                            bic: (r as any).bic ?? null,
                                            contribution_amount: (r as any).contribution_amount ?? null,
                                            contribution_interval: (r as any).contribution_interval ?? null,
                                            mandate_ref: (r as any).mandate_ref ?? null,
                                            mandate_date: (r as any).mandate_date ?? null,
                                            join_date: (r as any).join_date ?? null,
                                            leave_date: (r as any).leave_date ?? null,
                                            notes: (r as any).notes ?? null,
                                            next_due_date: (r as any).next_due_date ?? null
                                        } })}>✎</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <table cellPadding={6} style={{ marginTop: 8, width: '100%' }}>
                <thead>
                    <tr>
                        <th align="left" style={{ cursor: 'pointer' }} onClick={() => { setOffset(0); setSortBy('memberNo' as any); setSort(s => (sortBy === 'memberNo' ? (s === 'ASC' ? 'DESC' : 'ASC') : 'ASC')) }}>
                            Nr. <span aria-hidden="true" style={{ color: (sortBy as any) === 'memberNo' ? 'var(--warning)' : 'var(--text-dim)' }}>{(sortBy as any) === 'memberNo' ? (sort === 'ASC' ? '↑' : '↓') : '↕'}</span>
                        </th>
                        <th align="left" style={{ cursor: 'pointer' }} onClick={() => { setOffset(0); setSortBy('name'); setSort(s => (sortBy === 'name' ? (s === 'ASC' ? 'DESC' : 'ASC') : 'ASC')) }}>
                            Name <span aria-hidden="true" style={{ color: sortBy === 'name' ? 'var(--warning)' : 'var(--text-dim)' }}>{sortBy === 'name' ? (sort === 'ASC' ? '↑' : '↓') : '↕'}</span>
                        </th>
                        <th align="left" style={{ cursor: 'pointer' }} onClick={() => { setOffset(0); setSortBy('email'); setSort(s => (sortBy === 'email' ? (s === 'ASC' ? 'DESC' : 'ASC') : 'ASC')) }}>
                            E-Mail <span aria-hidden="true" style={{ color: sortBy === 'email' ? 'var(--warning)' : 'var(--text-dim)' }}>{sortBy === 'email' ? (sort === 'ASC' ? '↑' : '↓') : '↕'}</span>
                        </th>
                        <th align="left">Telefon</th>
                        {colPrefs.showAddress && (<th align="left">Adresse</th>)}
                        {colPrefs.showIBAN && (<th align="left">IBAN</th>)}
                        {colPrefs.showContribution && (<th align="right">Beitrag</th>)}
                        <th align="left" style={{ cursor: 'pointer' }} onClick={() => { setOffset(0); setSortBy('status'); setSort(s => (sortBy === 'status' ? (s === 'ASC' ? 'DESC' : 'ASC') : 'ASC')) }}>
                            Status <span aria-hidden="true" style={{ color: sortBy === 'status' ? 'var(--warning)' : 'var(--text-dim)' }}>{sortBy === 'status' ? (sort === 'ASC' ? '↑' : '↓') : '↕'}</span>
                        </th>
                        {colPrefs.showNotes && (<th align="left">Anmerkungen</th>)}
                        <th align="center">Aktionen</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(r => (
                        <tr key={r.id}>
                            <td>{r.memberNo || '—'}</td>
                            <td>
                                <span>{r.name}</span>
                                {r.boardRole && (() => { const map: any = { V1: { label: '1. Vorsitz', color: '#00C853' }, V2: { label: '2. Vorsitz', color: '#4CAF50' }, KASSIER: { label: 'Kassier', color: '#03A9F4' }, KASSENPR1: { label: '1. Prüfer', color: '#FFC107' }, KASSENPR2: { label: '2. Prüfer', color: '#FFD54F' }, SCHRIFT: { label: 'Schriftführer', color: '#9C27B0' } }; const def = map[r.boardRole] || null; return def ? (<span className="badge" style={{ marginLeft: 8, background: def.color, color: '#fff' }}>{def.label}</span>) : null })()}
                                {((r as any).contribution_amount != null && (r as any).contribution_amount > 0 && !!(r as any).contribution_interval) ? (
                                    <MemberStatusButton memberId={r.id} name={r.name} memberNo={r.memberNo || undefined} />
                                ) : null}
                            </td>
                            <td>{r.email || '—'}</td>
                            <td>{r.phone || '—'}</td>
                            {colPrefs.showAddress && (<td>{r.address || '—'}</td>)}
                            {colPrefs.showIBAN && (<td>{r.iban || '—'}</td>)}
                            {colPrefs.showContribution && (<td align="right">{r.contribution_amount != null ? eurFmt.format(r.contribution_amount) : '—'}</td>)}
                            <td>{(() => { const s = String(r.status || '').toUpperCase(); const c = (s === 'ACTIVE') ? '#00C853' : (s === 'LEFT') ? 'var(--danger)' : '#FFD600'; return (
                                <span title={s} aria-label={`Status: ${s}`} style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: c }} />
                            ) })()}</td>
                            {colPrefs.showNotes && (
                                <td title={r.notes || undefined} style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {r.notes ? (r.notes.length > 120 ? (r.notes.slice(0, 120) + '…') : r.notes) : '—'}
                                </td>
                            )}
                            <td align="center" style={{ whiteSpace: 'nowrap' }}>
                                <button className="btn" title="Bearbeiten" onClick={() => setForm({ mode: 'edit', draft: {
                                    id: r.id,
                                    memberNo: r.memberNo ?? null,
                                    name: r.name,
                                    email: r.email ?? null,
                                    phone: r.phone ?? null,
                                    address: r.address ?? null,
                                    status: r.status as any,
                                    boardRole: (r as any).boardRole ?? null,
                                    iban: (r as any).iban ?? null,
                                    bic: (r as any).bic ?? null,
                                    contribution_amount: (r as any).contribution_amount ?? null,
                                    contribution_interval: (r as any).contribution_interval ?? null,
                                    mandate_ref: (r as any).mandate_ref ?? null,
                                    mandate_date: (r as any).mandate_date ?? null,
                                    join_date: (r as any).join_date ?? null,
                                    leave_date: (r as any).leave_date ?? null,
                                    notes: (r as any).notes ?? null,
                                    next_due_date: (r as any).next_due_date ?? null
                                } })}>✎</button>
                            </td>
                        </tr>
                    ))}
                    {rows.length === 0 && (() => { const base = 6; const colSpan = base + (colPrefs.showAddress ? 1 : 0) + (colPrefs.showIBAN ? 1 : 0) + (colPrefs.showContribution ? 1 : 0) + (colPrefs.showNotes ? 1 : 0); return (
                        <tr><td colSpan={colSpan}><div className="helper">Keine Einträge</div></td></tr>
                    )})()}
                </tbody>
            </table>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
                <div className="helper">{total} Einträge</div>
                <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn" onClick={() => setOffset(0)} disabled={offset <= 0} title="Erste">⏮</button>
                    <button className="btn" onClick={() => setOffset(v => Math.max(0, v - limit))} disabled={offset <= 0} title="Zurück">‹</button>
                    <button className="btn" onClick={() => setOffset(v => (v + limit < total ? v + limit : v))} disabled={offset + limit >= total} title="Weiter">›</button>
                </div>
            </div>

            {form && (
                <div className="modal-overlay" onClick={() => setForm(null)}>
                    <div className="modal member-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 760 }}>
                        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                            <h2 style={{ margin: 0 }}>{form.mode === 'create' ? 'Mitglied anlegen' : 'Mitglied bearbeiten'}</h2>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                {/* Info tooltip instead of right-side column */}
                                <button className="btn ghost" title={'IBAN/BIC werden live geprüft.\nBeitragsvorschau zeigt die initiale Fälligkeit.\nMit Tab lassen sich Felder schnell durchlaufen.'}>ℹ️</button>
                                <span className="badge" title="Status" style={{ background: (form.draft.status === 'ACTIVE' ? '#00C853' : form.draft.status === 'NEW' ? '#2196F3' : form.draft.status === 'PAUSED' ? '#FF9800' : 'var(--danger)'), color: '#fff' }}>{form.draft.status || '—'}</span>
                                <button className="btn" onClick={() => setForm(null)} aria-label="Schließen">×</button>
                            </div>
                        </header>
                        {/* Tabs */}
                        <div role="tablist" aria-label="Mitglied bearbeiten" style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--border)', padding: '4px 0' }}>
                                {([
                                { k: 'PERSON', label: 'Persönliches', color: '#2962FF' },
                                { k: 'FINANCE', label: 'Finanzdaten', color: '#00C853' },
                                { k: 'MANDATE', label: 'Mandat', color: '#FFD600' },
                                { k: 'MEMBERSHIP', label: 'Mitgliedschaft', color: '#7C4DFF' }
                            ] as Array<{k: any; label: string; color: string}>).map(t => {
                                const active = formTab === t.k
                                const bg = active ? 'color-mix(in oklab, ' + t.color + ' 25%, transparent)' : undefined
                                const br = active ? t.color : 'transparent'
                                return (
                                    <button key={t.k} role="tab" aria-selected={active} className="btn" onClick={() => setFormTab(t.k)}
                                        style={{ borderColor: br, background: bg, color: active ? contrastText(t.color) : undefined }}>
                                        {t.label}
                                    </button>
                                )
                            })}
                        </div>
                        <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                            <div style={{ display: 'grid', gap: 12 }}>
                                {formTab === 'PERSON' && (
                                    <div className="card" style={{ padding: 10 }}>
                                        <div className="helper" title="Name, Kontakt und Anschrift">Persönliche Daten</div>
                                        <div className="row" style={{ marginTop: 6 }}>
                                            <div className="field">
                                                <label>Mitglieds-Nr. <span className="helper" style={{ color: 'var(--danger)' }} title="Pflichtfeld">*</span></label>
                                                <input className="input" placeholder="z.B. 12345" value={form.draft.memberNo ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, memberNo: e.target.value || null } })} style={requiredTouched && (!form.draft.memberNo || !String(form.draft.memberNo).trim()) ? { borderColor: 'var(--danger)' } : undefined} />
                                                {requiredTouched && (!form.draft.memberNo || !String(form.draft.memberNo).trim()) && (<div className="helper" style={{ color: 'var(--danger)' }}>Bitte Mitgliedsnummer angeben</div>)}
                                            </div>
                                            <div className="field">
                                                <label>Name <span className="helper" style={{ color: 'var(--danger)' }} title="Pflichtfeld">*</span></label>
                                                <input className="input" placeholder="Max Mustermann" value={form.draft.name} onChange={(e) => setForm({ ...form, draft: { ...form.draft, name: e.target.value } })} style={requiredTouched && (!form.draft.name || !form.draft.name.trim()) ? { borderColor: 'var(--danger)' } : undefined} />
                                                {requiredTouched && (!form.draft.name || !form.draft.name.trim()) && (<div className="helper" style={{ color: 'var(--danger)' }}>Bitte Name angeben</div>)}
                                            </div>
                                            <div className="field"><label>E-Mail</label><input className="input" placeholder="max@example.org" value={form.draft.email ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, email: e.target.value || null } })} /></div>
                                            <div className="field"><label>Telefon</label><input className="input" placeholder="0123 4567890" value={form.draft.phone ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, phone: e.target.value || null } })} /></div>
                                            <div className="field" style={{ gridColumn: '1 / span 2' }}>
                                                <label>Adresse</label>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 1fr', gap: 6 }}>
                                                    <input className="input" placeholder="Straße und Nr." value={addrStreet} onChange={(e) => setAddrStreet(e.target.value)} />
                                                    <input className="input" placeholder="PLZ" value={addrZip} onChange={(e) => setAddrZip(e.target.value)} />
                                                    <input className="input" placeholder="Ort" value={addrCity} onChange={(e) => setAddrCity(e.target.value)} />
                                                </div>
                                            </div>
                                            <div className="field"><label>Status</label>
                                                <select className="input" value={form.draft.status ?? 'ACTIVE'} onChange={(e) => setForm({ ...form, draft: { ...form.draft, status: e.target.value as any } })}>
                                                    <option value="ACTIVE">Aktiv</option>
                                                    <option value="NEW">Neu</option>
                                                    <option value="PAUSED">Pause</option>
                                                    <option value="LEFT">Ausgetreten</option>
                                                </select>
                                            </div>
                                            <div className="field" style={{ gridColumn: '1 / span 2' }}>
                                                <label>Anmerkungen</label>
                                                <textarea className="input" rows={3} placeholder="Freitext …" value={form.draft.notes ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, notes: e.target.value || null } })} style={{ resize: 'vertical' }} />
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {formTab === 'FINANCE' && (
                                    <div className="card" style={{ padding: 10 }}>
                                        <div className="helper" title="Bankdaten und Beitrag">Finanzdaten</div>
                                        <div className="row" style={{ marginTop: 6 }}>
                                            {(() => { const v = validateIBAN(form.draft.iban); return (
                                                <div className="field"><label title="IBAN mit Prüfziffer, Leerzeichen optional">IBAN</label>
                                                    <input className="input" placeholder="DE12 3456 7890 1234 5678 90" value={form.draft.iban ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, iban: e.target.value || null } })} style={{ borderColor: v.ok ? undefined : 'var(--danger)' }} />
                                                    {!v.ok && <div className="helper" style={{ color: 'var(--danger)' }}>{v.msg}</div>}
                                                </div>
                                            ) })()}
                                            {(() => { const v = validateBIC(form.draft.bic); return (
                                                <div className="field"><label title="8 oder 11 Zeichen">BIC</label>
                                                    <input className="input" placeholder="BANKDEFFXXX" value={form.draft.bic ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, bic: e.target.value || null } })} style={{ borderColor: v.ok ? undefined : 'var(--danger)' }} />
                                                    {!v.ok && <div className="helper" style={{ color: 'var(--danger)' }}>{v.msg}</div>}
                                                </div>
                                            ) })()}
                                            <div className="field"><label title="Regelmäßiger Beitrag in Euro">Beitrag (EUR)</label>
                                                <input className="input" type="number" step="0.01" placeholder="z.B. 12,00" value={form.draft.contribution_amount ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, contribution_amount: e.target.value ? Number(e.target.value) : null } })} />
                                            </div>
                                            <div className="field"><label title="Abbuchungsintervall">Intervall</label>
                                                <select className="input" value={form.draft.contribution_interval ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, contribution_interval: (e.target.value || null) as any } })}>
                                                    <option value="">—</option>
                                                    <option value="MONTHLY">Monatlich</option>
                                                    <option value="QUARTERLY">Quartal</option>
                                                    <option value="YEARLY">Jährlich</option>
                                                </select>
                                            </div>
                                            <div className="field" style={{ gridColumn: '1 / span 2' }}>
                                                <div className="helper" aria-live="polite">{nextDuePreview(form.draft.contribution_amount ?? null, form.draft.contribution_interval ?? null, form.draft.next_due_date ?? form.draft.mandate_date ?? form.draft.join_date ?? null) || '—'}</div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {formTab === 'MANDATE' && (
                                    <div className="card" style={{ padding: 10 }}>
                                        <div className="helper" title="SEPA-Lastschrift Mandat">Mandatsinfos</div>
                                        <div className="row" style={{ marginTop: 6 }}>
                                            <div className="field"><label title="Referenz auf SEPA-Mandat">Mandats-Ref.</label><input className="input" placeholder="M-2025-001" value={form.draft.mandate_ref ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, mandate_ref: e.target.value || null } })} /></div>
                                            <div className="field"><label>Mandats-Datum</label><input className="input" type="date" placeholder="tt.mm.jjjj" value={form.draft.mandate_date ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, mandate_date: e.target.value || null } })} /></div>
                                        </div>
                                    </div>
                                )}
                                {formTab === 'MEMBERSHIP' && (
                                    <div className="card" style={{ padding: 10 }}>
                                        <div className="helper" title="Mitgliedschaftsdaten">Mitgliedschaft</div>
                                        <div className="row" style={{ marginTop: 6 }}>
                                            <div className="field"><label>Eintritt <span className="helper" style={{ color: 'var(--danger)' }} title="Pflichtfeld">*</span></label><input className="input" type="date" placeholder="tt.mm.jjjj" value={form.draft.join_date ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, join_date: e.target.value || null } })} style={requiredTouched && (!form.draft.join_date || !String(form.draft.join_date).trim()) ? { borderColor: 'var(--danger)' } : undefined} />{requiredTouched && (!form.draft.join_date || !String(form.draft.join_date).trim()) && (<div className="helper" style={{ color: 'var(--danger)' }}>Bitte Eintrittsdatum angeben</div>)}</div>
                                            <div className="field"><label>Austritt</label><input className="input" type="date" placeholder="tt.mm.jjjj" value={form.draft.leave_date ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, leave_date: e.target.value || null } })} /></div>
                                            <div className="field"><label>Initiale Fälligkeit</label><input className="input" type="date" placeholder="tt.mm.jjjj" value={form.draft.next_due_date ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, next_due_date: e.target.value || null } })} /></div>
                                            <div className="field"><label>Funktion (Vorstand)</label>
                                                <select className="input" value={form.draft.boardRole ?? ''} onChange={(e) => setForm({ ...form, draft: { ...form.draft, boardRole: (e.target.value || null) as any } })}>
                                                    <option value="">—</option>
                                                    <option value="V1">1. Vorsitz</option>
                                                    <option value="V2">2. Vorsitz</option>
                                                    <option value="KASSIER">Kassier</option>
                                                    <option value="KASSENPR1">1. Kassenprüfer</option>
                                                    <option value="KASSENPR2">2. Kassenprüfer</option>
                                                    <option value="SCHRIFT">Schriftführer</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {/* MISC tab removed; Anmerkungen jetzt unter Persönliches */}
                            </div>
                            {/* Right-side info column removed to maximize space */}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 12 }}>
                            {form.mode === 'edit' ? (
                                <button className="btn danger" onClick={() => {
                                    if (!form?.draft?.id) return
                                    const label = `${form.draft.name}${form.draft.memberNo ? ` (${form.draft.memberNo})` : ''}`
                                    setDeleteConfirm({ id: form.draft.id, label })
                                }}>🗑 Löschen</button>
                            ) : <span />}
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn" onClick={() => setForm(null)}>Abbrechen</button>
                                <button className="btn primary" onClick={async () => {
                                try {
                                    setRequiredTouched(true)
                                    const missing: string[] = []
                                    if (!form.draft.name || !form.draft.name.trim()) missing.push('Name')
                                    if (form.mode === 'create') {
                                        if (!form.draft.memberNo || !String(form.draft.memberNo).trim()) missing.push('Mitglieds-Nr.')
                                        if (!form.draft.join_date || !String(form.draft.join_date).trim()) missing.push('Eintritt')
                                    }
                                    if (missing.length) { setMissingRequired(missing); return }
                                    const addrCombined = [addrStreet, [addrZip, addrCity].filter(Boolean).join(' ')].filter(Boolean).join(', ')
                                    const payload = { ...form.draft, address: addrCombined || form.draft.address || null }
                                    if (form.mode === 'create') {
                                        await (window as any).api?.members?.create?.(payload)
                                    } else {
                                        await (window as any).api?.members?.update?.(payload)
                                    }
                                    setForm(null); setRequiredTouched(false); setMissingRequired([]); await load()
                                } catch (e: any) { alert(e?.message || String(e)) }
                            }}>Speichern</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {showColumnsModal && (
                <div className="modal-overlay" onClick={() => setShowColumnsModal(false)}>
                    <div className="modal" onClick={(e)=>e.stopPropagation()} style={{ maxWidth: 480, display: 'grid', gap: 10 }}>
                        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0 }}>Spalten auswählen</h3>
                            <button className="btn" onClick={() => setShowColumnsModal(false)}>×</button>
                        </header>
                        <div className="card" style={{ padding: 10 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <input type="checkbox" checked={colPrefs.showIBAN} onChange={(e)=>setColPrefs(p=>({ ...p, showIBAN: e.target.checked }))} />
                                IBAN anzeigen
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                                <input type="checkbox" checked={colPrefs.showContribution} onChange={(e)=>setColPrefs(p=>({ ...p, showContribution: e.target.checked }))} />
                                Beitrag anzeigen
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                                <input type="checkbox" checked={colPrefs.showAddress} onChange={(e)=>setColPrefs(p=>({ ...p, showAddress: e.target.checked }))} />
                                Adresse anzeigen
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                                <input type="checkbox" checked={colPrefs.showNotes} onChange={(e)=>setColPrefs(p=>({ ...p, showNotes: e.target.checked }))} />
                                Anmerkungen anzeigen
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                                <input type="checkbox" checked={colPrefs.showBoardTable} onChange={(e)=>setColPrefs(p=>({ ...p, showBoardTable: e.target.checked }))} />
                                Vorstand oben als eigene Tabelle
                            </label>
                            <div className="helper" style={{ marginTop: 8 }}>Tipp: Du kannst IBAN/Beitrag ausblenden und stattdessen die Adresse anzeigen.</div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button className="btn" onClick={() => setShowColumnsModal(false)}>Schließen</button>
                        </div>
                    </div>
                </div>
            )}
            {showInvite && (
                <div className="modal-overlay" onClick={() => setShowInvite(false)}>
                    <div className="modal" onClick={(e)=>e.stopPropagation()} style={{ width: 'min(96vw, 900px)', maxWidth: 900, display: 'grid', gap: 10 }}>
                        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0 }}>Einladung per E-Mail</h3>
                            <button className="btn" onClick={()=>setShowInvite(false)}>×</button>
                        </header>
                        <div className="card" style={{ padding: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                <div className="helper">Aktuelle Filter: Status = {status}, Suche = {q ? `"${q}"` : '—'}</div>
                                <label className="helper" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                    <input type="checkbox" checked={inviteActiveOnly} onChange={(e)=>setInviteActiveOnly(e.target.checked)} />
                                    Nur aktive einladen
                                </label>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                                <div className="field">
                                    <label>Betreff</label>
                                    <input className="input" value={inviteSubject} onChange={(e)=>setInviteSubject(e.target.value)} />
                                </div>
                                <div className="field">
                                    <label>Anzahl Empfänger (BCC)</label>
                                    <input className="input" value={inviteEmails.length || 0} readOnly />
                                </div>
                                <div className="field" style={{ gridColumn: '1 / span 2' }}>
                                    <label>Nachricht</label>
                                    <textarea className="input" rows={6} value={inviteBody} onChange={(e)=>setInviteBody(e.target.value)} style={{ resize: 'vertical' }} />
                                </div>
                                <div className="field" style={{ gridColumn: '1 / span 2' }}>
                                    <label>Empfänger (BCC)</label>
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                        <input className="input" readOnly value={inviteEmails.join('; ')} style={{ flex: 1 }} />
                                        <button className="btn" onClick={async ()=>{ try { await navigator.clipboard.writeText(inviteEmails.join('; ')); alert('E-Mail-Adressen kopiert') } catch { alert('Kopieren nicht möglich') } }}>Kopieren</button>
                                    </div>
                                    <div className="helper">Die Liste basiert auf der aktuellen Ansicht (Filter & Suche) und enthält nur Kontakte mit E-Mail.</div>
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div className="helper">{inviteBusy ? 'Sammle E-Mail-Adressen…' : `${inviteEmails.length} Empfänger gefunden`}</div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn" onClick={()=>setShowInvite(false)}>Abbrechen</button>
                                <button className="btn" onClick={async ()=>{ try { await navigator.clipboard.writeText(inviteEmails.join('; ')); alert(`${inviteEmails.length} E-Mail-Adressen kopiert (BCC).`) } catch { alert('Kopieren nicht möglich') } }}>Nur BCC kopieren</button>
                                <button className="btn primary" disabled={!inviteEmails.length} onClick={() => {
                                    const subject = encodeURIComponent(inviteSubject || '')
                                    const body = encodeURIComponent(inviteBody || '')
                                    const bccRaw = inviteEmails.join(',')
                                    const mailto = `mailto:?bcc=${encodeURIComponent(bccRaw)}&subject=${subject}&body=${body}`
                                    if (mailto.length <= 1800 && inviteEmails.length <= 50) {
                                        try { window.location.href = mailto } catch { /* ignore */ }
                                    } else {
                                        (async () => { try { await navigator.clipboard.writeText(inviteEmails.join('; ')); alert(`${inviteEmails.length} E-Mail-Adressen in die Zwischenablage kopiert. Füge sie als BCC in dein E-Mail-Programm ein.`) } catch { alert('Link zu lang – E-Mail-Adressen konnten nicht automatisch kopiert werden.') } })()
                                    }
                                }}>Im Mail-Programm öffnen</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {showPayments && (
                <PaymentsAssignModal onClose={() => setShowPayments(false)} />
            )}
            {missingRequired.length > 0 && (
                <div className="modal-overlay" onClick={() => setMissingRequired([])}>
                    <div className="modal" onClick={(e)=>e.stopPropagation()} style={{ maxWidth: 520, display: 'grid', gap: 10 }}>
                        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0 }}>Pflichtfelder fehlen</h3>
                            <button className="btn" onClick={() => setMissingRequired([])}>×</button>
                        </header>
                        <div className="card" style={{ padding: 10 }}>
                            <div>Bitte ergänze die folgenden Felder:</div>
                            <ul className="helper" style={{ marginTop: 6 }}>
                                {missingRequired.map((f) => (<li key={f}>{f}</li>))}
                            </ul>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button className="btn primary" onClick={() => setMissingRequired([])}>OK</button>
                        </div>
                    </div>
                </div>
            )}
            {deleteConfirm && (
                <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
                    <div className="modal" onClick={(e)=>e.stopPropagation()} style={{ maxWidth: 520, display: 'grid', gap: 10 }}>
                        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0 }}>Mitglied löschen</h3>
                            <button className="btn" onClick={() => setDeleteConfirm(null)}>×</button>
                        </header>
                        <div className="card" style={{ padding: 10 }}>
                            <div style={{ marginBottom: 6 }}>Soll das folgende Mitglied wirklich gelöscht werden?</div>
                            <div className="helper" style={{ fontWeight: 600 }}>{deleteConfirm.label}</div>
                            <div className="helper" style={{ color: 'var(--danger)', marginTop: 8 }}>Dieser Vorgang kann nicht rückgängig gemacht werden.</div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button className="btn" onClick={() => setDeleteConfirm(null)} disabled={deleteBusy}>Abbrechen</button>
                            <button className="btn danger" disabled={deleteBusy} onClick={async () => {
                                setDeleteBusy(true)
                                try {
                                    await (window as any).api?.members?.delete?.({ id: deleteConfirm.id })
                                    setDeleteConfirm(null)
                                    setForm(null)
                                    await load()
                                } catch (e: any) { alert(e?.message || String(e)) }
                                finally { setDeleteBusy(false) }
                            }}>Endgültig löschen</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function MemberStatusButton({ memberId, name, memberNo }: { memberId: number; name: string; memberNo?: string }) {
    const [open, setOpen] = useState(false)
    const [status, setStatus] = useState<any>(null)
    const [history, setHistory] = useState<any[]>([])
    const [memberData, setMemberData] = useState<any>(null)
    const [due, setDue] = useState<Array<{ periodKey: string; interval: 'MONTHLY'|'QUARTERLY'|'YEARLY'; amount: number; paid: number; voucherId?: number|null; verified?: number }>>([])
    // Per-period UI state for linking/search
    const [selVoucherByPeriod, setSelVoucherByPeriod] = useState<Record<string, number | null>>({})
    const [manualListByPeriod, setManualListByPeriod] = useState<Record<string, Array<{ id: number; voucherNo: string; date: string; description?: string|null; counterparty?: string|null; gross: number }>>>({})
    const [searchByPeriod, setSearchByPeriod] = useState<Record<string, string>>({})
    // Pagination for due rows
    const [duePage, setDuePage] = useState(1)
    const pageSize = 5
    // Preload status so the indicator has color even before opening the modal
    useEffect(() => {
        let alive = true
        async function loadStatusAndBasics() {
            try {
                const s = await (window as any).api?.payments?.status?.({ memberId })
                if (alive) setStatus(s || null)
            } catch { /* noop */ }
        }
        loadStatusAndBasics()
        // Refresh when data across the app changes (e.g., marking payments paid)
        const onChanged = () => loadStatusAndBasics()
        try { window.addEventListener('data-changed', onChanged) } catch {}
        return () => { alive = false; try { window.removeEventListener('data-changed', onChanged) } catch {} }
    }, [memberId])

    useEffect(() => {
        if (!open) return
        let alive = true
        ;(async () => {
            try {
                const s = await (window as any).api?.payments?.status?.({ memberId })
                const h = await (window as any).api?.payments?.history?.({ memberId, limit: 24 })
                const member = await (window as any).api?.members?.get?.({ id: memberId })
                if (alive) {
                    setStatus(s || null)
                    setMemberData(member || null)
                    setHistory(h?.rows || [])
                    // load due list for this member: from initial nextDue to today; only unpaid items
                    if (s?.interval) {
                        const today = new Date()
                        const from = (s?.nextDue || s?.joinDate || new Date(today.getUTCFullYear(), 0, 1).toISOString().slice(0,10))
                        const to = today.toISOString().slice(0,10)
                        const res = await (window as any).api?.payments?.listDue?.({ interval: s.interval, from, to, memberId, includePaid: false })
                        const rows = (res?.rows || []).filter((r: any) => r.memberId === memberId && !r.paid)
                        setDue(rows.map((r: any) => ({ periodKey: r.periodKey, interval: r.interval, amount: r.amount, paid: r.paid, voucherId: r.voucherId, verified: r.verified })))
                    } else { setDue([]) }
                }
            } catch { }
        })()
        return () => { alive = false }
    }, [open, memberId])
    // Reset pagination to page 1 when the due list changes
    useEffect(() => { setDuePage(1) }, [due.length])
    const color = status?.state === 'OVERDUE' ? 'var(--danger)' : status?.state === 'OK' ? 'var(--success)' : 'var(--text-dim)'
    return (
        <>
            <button className="btn ghost" title="Beitragsstatus & Historie" aria-label="Beitragsstatus & Historie" onClick={() => setOpen(true)} style={{ marginLeft: 6, width: 24, height: 24, padding: 0, borderRadius: 6, display: 'inline-grid', placeItems: 'center', color }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7V3zm1 5h-2v6h6v-2h-4V8z"/></svg>
            </button>
            {open && (
                <div className="modal-overlay" onClick={() => setOpen(false)}>
                    <div className="modal" onClick={(e)=>e.stopPropagation()} style={{ width: 'min(96vw, 1200px)', maxWidth: 1200, display: 'grid', gap: 10 }}>
                        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0 }}>Beitragsstatus</h3>
                            <button className="btn" onClick={()=>setOpen(false)}>×</button>
                        </header>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
                            <div className="helper" style={{ fontWeight: 600 }}>{name}{memberNo ? ` (${memberNo})` : ''}</div>
                            <span className="helper">•</span>
                            <span className="helper">Eintritt: {status?.joinDate || '—'}</span>
                            <span className="helper">•</span>
                            <span className="helper">Status: {status?.state === 'OVERDUE' ? `Überfällig (${status?.overdue})` : status?.state === 'OK' ? 'OK' : '—'}</span>
                            <span className="helper">•</span>
                            <span className="helper">Letzte Zahlung: {status?.lastPeriod ? `${status.lastPeriod} (${status?.lastDate||''})` : '—'}</span>
                            <span className="helper">•</span>
                            <span className="helper">Initiale Fälligkeit: {status?.nextDue || '—'}</span>
                        </div>
                        <MemberTimeline status={status} history={history} />
                        {/* Due payments for this member */}
                        <div className="card" style={{ padding: 10 }}>
                            <strong>Fällige Beiträge</strong>
                            {due.length === 0 ? (
                                <div className="helper" style={{ marginTop: 6 }}>Aktuell keine offenen Perioden.</div>
                            ) : (
                                <>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                                        <div className="helper">Seite {duePage} von {Math.max(1, Math.ceil(due.length / pageSize))} — {due.length} offen</div>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button className="btn" onClick={() => setDuePage(1)} disabled={duePage <= 1} style={duePage <= 1 ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>⏮</button>
                                            <button className="btn" onClick={() => setDuePage(p => Math.max(1, p - 1))} disabled={duePage <= 1} style={duePage <= 1 ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>‹ Zurück</button>
                                            <button className="btn" onClick={() => setDuePage(p => Math.min(Math.max(1, Math.ceil(due.length / pageSize)), p + 1))} disabled={duePage >= Math.max(1, Math.ceil(due.length / pageSize))} style={duePage >= Math.max(1, Math.ceil(due.length / pageSize)) ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>Weiter ›</button>
                                            <button className="btn" onClick={() => setDuePage(Math.max(1, Math.ceil(due.length / pageSize)))} disabled={duePage >= Math.max(1, Math.ceil(due.length / pageSize))} style={duePage >= Math.max(1, Math.ceil(due.length / pageSize)) ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>⏭</button>
                                        </div>
                                    </div>
                                    <table cellPadding={6} style={{ width: '100%', marginTop: 6 }}>
                                        <thead>
                                            <tr>
                                                <th align="left">Periode</th>
                                                <th align="right">Betrag</th>
                                                <th align="left">Verknüpfen</th>
                                                <th align="left">Aktion</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {due.slice((duePage-1)*pageSize, duePage*pageSize).map((r, i) => {
                                                const selVoucher = selVoucherByPeriod[r.periodKey] ?? null
                                                const manualList = manualListByPeriod[r.periodKey] || []
                                                const search = searchByPeriod[r.periodKey] || ''
                                                return (
                                                    <tr key={r.periodKey}>
                                                        <td>{r.periodKey}</td>
                                                        <td align="right">{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(r.amount)}</td>
                                                        <td>
                                                            <div style={{ display: 'grid', gap: 6 }}>
                                                                <select className="input" value={selVoucher ?? ''} onChange={e => setSelVoucherByPeriod(prev => ({ ...prev, [r.periodKey]: e.target.value ? Number(e.target.value) : null }))} title="Passende Buchung verknüpfen">
                                                                    <option value="">— ohne Verknüpfung —</option>
                                                                    {manualList.map(s => (
                                                                        <option key={`m-${s.id}`} value={s.id}>{s.voucherNo || s.id} · {s.date} · {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(s.gross)} · {(s.description || s.counterparty || '')}</option>
                                                                    ))}
                                                                </select>
                                                                <div style={{ display: 'flex', gap: 6 }}>
                                                                    <input className="input" placeholder="Buchung suchen…" value={search} onChange={e => setSearchByPeriod(prev => ({ ...prev, [r.periodKey]: e.target.value }))} title="Suche in Buchungen (Betrag/Datum/Text)" />
                                                                    <button className="btn" onClick={async () => {
                                                                        try {
                                                                            // widen range for earlier periods: from period start - 90 days to today
                                                                            const { start, end } = periodRangeLocal(r.periodKey)
                                                                            const s = new Date(start); s.setUTCDate(s.getUTCDate() - 90)
                                                                            const todayISO = new Date().toISOString().slice(0,10)
                                                                            const fromISO = s.toISOString().slice(0,10)
                                                                            const res = await (window as any).api?.vouchers?.list?.({ from: fromISO, to: todayISO, q: search || undefined, limit: 50 })
                                                                            const list = (res?.rows || []).map((v: any) => ({ id: v.id, voucherNo: v.voucherNo, date: v.date, description: v.description, counterparty: v.counterparty, gross: v.grossAmount }))
                                                                            setManualListByPeriod(prev => ({ ...prev, [r.periodKey]: list }))
                                                                        } catch {}
                                                                    }}>Suchen</button>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <button className="btn primary" onClick={async () => {
                                                                try {
                                                                    await (window as any).api?.payments?.markPaid?.({ memberId, periodKey: r.periodKey, interval: r.interval, amount: r.amount, voucherId: selVoucher || null })
                                                                    // refresh blocks
                                                                    const s = await (window as any).api?.payments?.status?.({ memberId })
                                                                    const h = await (window as any).api?.payments?.history?.({ memberId, limit: 24 })
                                                                    setStatus(s || null)
                                                                    setHistory(h?.rows || [])
                                                                    const nextDueList = due.filter((d) => d.periodKey !== r.periodKey)
                                                                    setDue(nextDueList)
                                                                    // cleanup per-row state
                                                                    setSelVoucherByPeriod(prev => { const { [r.periodKey]: _, ...rest } = prev; return rest })
                                                                    setManualListByPeriod(prev => { const { [r.periodKey]: _, ...rest } = prev; return rest })
                                                                    setSearchByPeriod(prev => { const { [r.periodKey]: _, ...rest } = prev; return rest })
                                                                    // adjust page if we are beyond last page after removal
                                                                    const newTotalPages = Math.max(1, Math.ceil(nextDueList.length / pageSize))
                                                                    setDuePage(p => Math.min(p, newTotalPages))
                                                                    window.dispatchEvent(new Event('data-changed'))
                                                                } catch (e: any) { alert(e?.message || String(e)) }
                                                            }}>Bezahlen</button>
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6, marginTop: 6 }}>
                                        <button className="btn" onClick={() => setDuePage(1)} disabled={duePage <= 1} style={duePage <= 1 ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>⏮</button>
                                        <button className="btn" onClick={() => setDuePage(p => Math.max(1, p - 1))} disabled={duePage <= 1} style={duePage <= 1 ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>‹ Zurück</button>
                                        <button className="btn" onClick={() => setDuePage(p => Math.min(Math.max(1, Math.ceil(due.length / pageSize)), p + 1))} disabled={duePage >= Math.max(1, Math.ceil(due.length / pageSize))} style={duePage >= Math.max(1, Math.ceil(due.length / pageSize)) ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>Weiter ›</button>
                                        <button className="btn" onClick={() => setDuePage(Math.max(1, Math.ceil(due.length / pageSize)))} disabled={duePage >= Math.max(1, Math.ceil(due.length / pageSize))} style={duePage >= Math.max(1, Math.ceil(due.length / pageSize)) ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>⏭</button>
                                    </div>
                                </>
                            )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center' }}>
                            <button className="btn primary" onClick={async ()=>{
                                try {
                                    const addr = memberData?.address || null
                                    const res = await (window as any).api?.members?.writeLetter?.({ id: memberId, name, address: addr, memberNo })
                                    if (!(res?.ok)) alert(res?.error || 'Konnte Brief nicht öffnen')
                                } catch (e: any) { alert(e?.message || String(e)) }
                            }}>Mitglied anschreiben</button>
                        </div>
                        <div className="card" style={{ padding: 10 }}>
                            <strong>Historie</strong>
                            <table cellPadding={6} style={{ width: '100%', marginTop: 6 }}>
                                <thead>
                                    <tr>
                                        <th align="left">Periode</th>
                                        <th align="left">Datum</th>
                                        <th align="right">Betrag</th>
                                        <th align="left">Beleg</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {history.map((r,i)=> (
                                        <tr key={i}>
                                            <td>{r.periodKey}</td>
                                            <td>{r.datePaid}</td>
                                            <td align="right">{new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(r.amount)}</td>
                                            <td>{r.voucherNo ? `#${r.voucherNo}` : '—'} {r.description ? `· ${r.description}` : ''}</td>
                                        </tr>
                                    ))}
                                    {history.length===0 && <tr><td colSpan={4}><div className="helper">Keine Zahlungen</div></td></tr>}
                                </tbody>
                            </table>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button className="btn" onClick={()=>setOpen(false)}>Schließen</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

function MemberTimeline({ status, history }: { status: any; history: Array<{ periodKey: string; datePaid: string; amount: number }> }) {
    // Build a horizontal timeline starting at join date and going forward to current (+a few future periods)
    const interval: 'MONTHLY'|'QUARTERLY'|'YEARLY' = status?.interval || 'MONTHLY'
    const today = new Date()
    const currentKey = (() => {
        const y = today.getUTCFullYear(); const m = today.getUTCMonth()+1
        if (interval==='MONTHLY') return `${y}-${String(m).padStart(2,'0')}`
        if (interval==='QUARTERLY') return `${y}-Q${Math.floor((m-1)/3)+1}`
        return String(y)
    })()
    // helpers to move between period keys locally
    function prevKeyLocal(key: string): string {
        const [yStr, rest] = key.split('-'); const y = Number(yStr)
        if (/^Q\d$/.test(rest||'')) { const q = Number((rest||'Q1').slice(1)); if (q>1) return `${y}-Q${q-1}`; return `${y-1}-Q4` }
        if (rest) { const m = Number(rest); if (m>1) return `${y}-${String(m-1).padStart(2,'0')}`; return `${y-1}-12` }
        return String(y-1)
    }
    function nextKeyLocal(key: string): string {
        const [yStr, rest] = key.split('-'); const y = Number(yStr)
        if (/^Q\d$/.test(rest||'')) { const q = Number((rest||'Q1').slice(1)); if (q<4) return `${y}-Q${q+1}`; return `${y+1}-Q1` }
        if (rest) { const m = Number(rest); if (m<12) return `${y}-${String(m+1).padStart(2,'0')}`; return `${y+1}-01` }
        return String(y+1)
    }
    function compareKeysLocal(a: string, b: string): number {
        if (interval === 'MONTHLY') {
            const [ay, am] = a.split('-'); const [by, bm] = b.split('-')
            const ai = Number(ay)*12 + Number(am)
            const bi = Number(by)*12 + Number(bm)
            return ai === bi ? 0 : (ai < bi ? -1 : 1)
        }
        if (interval === 'QUARTERLY') {
            const [ay, aqS] = a.split('-'); const [by, bqS] = b.split('-')
            const aq = Number((aqS||'Q1').replace('Q','')); const bq = Number((bqS||'Q1').replace('Q',''))
            const ai = Number(ay)*4 + aq
            const bi = Number(by)*4 + bq
            return ai === bi ? 0 : (ai < bi ? -1 : 1)
        }
        const ai = Number(a); const bi = Number(b)
        return ai === bi ? 0 : (ai < bi ? -1 : 1)
    }
    function periodKeyFromDateLocal(d: Date): string { return (interval==='MONTHLY' ? `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}` : interval==='QUARTERLY' ? `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth()/3)+1}` : String(d.getUTCFullYear())) }
    // Determine start at (current - pastCount) clamped to join date; end at current + futureCount
    const joinKey = (() => { try { if (!status?.joinDate) return null; const jd = new Date(status.joinDate); if (isNaN(jd.getTime())) return null; return periodKeyFromDateLocal(jd) } catch { return null } })()
    const pastCount = interval==='QUARTERLY' ? 2 : 5
    const futureCount = 3
    const startFromCurrent = (() => { let k = currentKey; for (let i=0;i<pastCount;i++) k = prevKeyLocal(k); return k })()
    let startKey = startFromCurrent
    if (joinKey && compareKeysLocal(joinKey, startKey) > 0) startKey = joinKey
    // Clamp start to the first due, so items before initial due are not shown
    const firstDueKeyForClamp = (() => {
        if (status?.nextDue) { try { return periodKeyFromDateLocal(new Date(status.nextDue)) } catch { /* ignore */ } }
        return null
    })()
    if (firstDueKeyForClamp && compareKeysLocal(firstDueKeyForClamp, startKey) > 0) startKey = firstDueKeyForClamp
    // Determine end at current plus futureCount periods
    const forward = futureCount
    let endKey = currentKey
    for (let i=0;i<forward;i++){ endKey = nextKeyLocal(endKey) }
    // Build keys from start to end (inclusive)
    const keys: string[] = []
    let k = startKey
    keys.push(k)
    while (compareKeysLocal(k, endKey) < 0) { k = nextKeyLocal(k); keys.push(k) }
    // Map paid keys
    const paidSet = new Set((history||[]).map(h=>h.periodKey))
    const nextDue = status?.nextDue || null
    // Determine first due period key (anchor) from nextDue; fall back to current if missing
    const firstDueKey = (() => {
        if (nextDue) {
            try { const d = new Date(nextDue); return periodKeyFromDateLocal(d) } catch { /* ignore */ }
        }
        return currentKey
    })()
    return (
        <div className="card" style={{ padding: 10 }}>
            <strong>Zeitstrahl</strong>
            <div style={{ marginTop: 8, overflowX: 'auto' }}>
                <svg width={Math.max(640, keys.length*56)} height={58} role="img" aria-label="Zeitstrahl Zahlungen">
                    {/* baseline */}
                    <line x1={12} y1={28} x2={Math.max(640, keys.length*56)-12} y2={28} stroke="var(--border)" strokeWidth={2} />
                    {keys.map((pk, i) => {
                        const x = 28 + i*56
                        const isCurrent = pk===currentKey
                        const isPaid = paidSet.has(pk)
                        // Overdue if unpaid and period <= current and period >= firstDue
                        const isBeforeOrEqCurrent = compareKeysLocal(pk, currentKey) <= 0
                        const isOnOrAfterFirstDue = compareKeysLocal(pk, firstDueKey) >= 0
                        const isOverdue = !isPaid && isBeforeOrEqCurrent && isOnOrAfterFirstDue
                        const color = isPaid ? 'var(--success)' : (isOverdue ? 'var(--danger)' : (isCurrent ? 'var(--warning)' : 'var(--muted)'))
                        return (
                            <g key={pk}>
                                <circle cx={x} cy={28} r={6} fill={color}>
                                    <title>{`${pk} · ${isPaid ? 'bezahlt' : (isOverdue ? 'überfällig' : (isCurrent ? 'aktuell' : 'offen'))}`}</title>
                                </circle>
                                <text x={x} y={12} textAnchor="middle" fontSize={10} fill="var(--text-dim)">{pk}</text>
                                <text x={x} y={50} textAnchor="middle" fontSize={10} fill={isPaid ? 'var(--success)' : (isOverdue ? 'var(--danger)' : 'var(--text-dim)')}>
                                    {isPaid ? 'bezahlt' : (isOverdue ? 'überfällig' : (isCurrent ? 'jetzt' : ''))}
                                </text>
                            </g>
                        )
                    })}
                    {/* next due is shown above, avoid overlaying labels here */}
                </svg>
            </div>
        </div>
    )
}

function PaymentsAssignModal({ onClose }: { onClose: () => void }) {
    const [interval, setInterval] = useState<'MONTHLY'|'QUARTERLY'|'YEARLY'>('MONTHLY')
    const [mode, setMode] = useState<'PERIOD'|'RANGE'>('PERIOD')
    const [periodKey, setPeriodKey] = useState<string>(() => {
        const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    })
    const [from, setFrom] = useState<string>('')
    const [to, setTo] = useState<string>('')
    const [q, setQ] = useState('')
    const [rows, setRows] = useState<Array<{ memberId: number; name: string; memberNo?: string|null; status: string; periodKey: string; interval: 'MONTHLY'|'QUARTERLY'|'YEARLY'; amount: number; paid: number; voucherId?: number|null; verified?: number }>>([])
    const [busy, setBusy] = useState(false)

    async function load() {
        setBusy(true)
        try {
            const payload = mode === 'PERIOD' ? { interval, periodKey, q } : { interval, from, to, q }
            const res = await (window as any).api?.payments?.listDue?.(payload)
            setRows(res?.rows || [])
        } finally { setBusy(false) }
    }
    useEffect(() => { load() }, [interval, mode, periodKey, from, to, q])

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal booking-modal" onClick={e => e.stopPropagation()} style={{ display: 'grid', gap: 10 }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <h2 style={{ margin: 0 }}>Mitgliedsbeiträge zuordnen</h2>
                    <button className="btn" onClick={onClose}>×</button>
                </header>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select className="input" value={interval} onChange={e => {
                        const v = e.target.value as any; setInterval(v)
                        // auto-adjust example periodKey
                        const d = new Date()
                        setPeriodKey(v==='MONTHLY' ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` : v==='QUARTERLY' ? `${d.getFullYear()}-Q${Math.floor(d.getMonth()/3)+1}` : String(d.getFullYear()))
                    }} title="Intervall">
                        <option value="MONTHLY">Monat</option>
                        <option value="QUARTERLY">Quartal</option>
                        <option value="YEARLY">Jahr</option>
                    </select>
                    <select className="input" value={mode} onChange={e => setMode(e.target.value as any)} title="Modus">
                        <option value="PERIOD">Periode</option>
                        <option value="RANGE">Zeitraum</option>
                    </select>
                    {mode === 'PERIOD' ? (
                        <input className="input" value={periodKey} onChange={e => setPeriodKey(sanitizePeriodKey(e.target.value, interval))} title="Periode: YYYY-MM | YYYY-Q1..Q4 | YYYY" />
                    ) : (
                        <>
                            <input className="input" type="date" value={from} onChange={e => setFrom(e.target.value)} />
                            <input className="input" type="date" value={to} onChange={e => setTo(e.target.value)} />
                        </>
                    )}
                    <input className="input" placeholder="Mitglied suchen…" value={q} onChange={e => setQ(e.target.value)} />
                    <div className="helper">{busy ? 'Lade…' : `${rows.length} Einträge`}</div>
                </div>
                <table style={{ width: '100%' }} cellPadding={6}>
                    <thead>
                        <tr>
                            <th align="left">Mitglied</th>
                            <th>Periode</th>
                            <th>Intervall</th>
                            <th align="right">Betrag</th>
                            <th>Vorschläge</th>
                            <th>Status</th>
                            <th>Aktionen</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(r => (
                            <PaymentsRow key={`${r.memberId}-${r.periodKey}`} row={r} onChanged={load} />
                        ))}
                        {rows.length === 0 && <tr><td colSpan={7}><div className="helper">Keine fälligen Beiträge</div></td></tr>}
                    </tbody>
                </table>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button className="btn" onClick={onClose}>Schließen</button>
                </div>
            </div>
        </div>
    )
}

function PaymentsRow({ row, onChanged }: { row: { memberId: number; name: string; memberNo?: string|null; status: string; periodKey: string; interval: 'MONTHLY'|'QUARTERLY'|'YEARLY'; amount: number; paid: number; voucherId?: number|null; verified?: number }; onChanged: () => void }) {
    const [suggestions, setSuggestions] = useState<Array<{ id: number; voucherNo: string; date: string; description?: string|null; counterparty?: string|null; gross: number }>>([])
    const [selVoucher, setSelVoucher] = useState<number | null>(row.voucherId ?? null)
    const [busy, setBusy] = useState(false)
    const [search, setSearch] = useState('')
    const [manualList, setManualList] = useState<Array<{ id: number; voucherNo: string; date: string; description?: string|null; counterparty?: string|null; gross: number }>>([])
    // Status & history modal
    const [showStatus, setShowStatus] = useState(false)
    const [statusData, setStatusData] = useState<any>(null)
    const [historyRows, setHistoryRows] = useState<any[]>([])
    // Preload status so the inline indicator is colored without opening the modal
    useEffect(() => {
        let alive = true
        async function loadStatus() {
            try { const s = await (window as any).api?.payments?.status?.({ memberId: row.memberId }); if (alive) setStatusData(s || null) } catch { }
        }
        loadStatus()
        const onChanged = () => loadStatus()
        try { window.addEventListener('data-changed', onChanged) } catch {}
        return () => { alive = false; try { window.removeEventListener('data-changed', onChanged) } catch {} }
    }, [row.memberId])

    useEffect(() => {
        if (!showStatus) return
        let alive = true
        ;(async () => {
            try {
                const s = await (window as any).api?.payments?.status?.({ memberId: row.memberId })
                const h = await (window as any).api?.payments?.history?.({ memberId: row.memberId, limit: 20 })
                if (alive) { setStatusData(s || null); setHistoryRows(h?.rows || []) }
            } catch { /* ignore */ }
        })()
        return () => { alive = false }
    }, [showStatus, row.memberId])

    useEffect(() => {
        let active = true
        ;(async () => {
            try {
                const res = await (window as any).api?.payments?.suggestVouchers?.({ name: row.name, amount: row.amount, periodKey: row.periodKey })
                if (active) setSuggestions(res?.rows || [])
            } catch { /* ignore */ }
        })()
        return () => { active = false }
    }, [row.memberId, row.periodKey, row.amount])

    const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
    return (
        <tr>
            <td title={row.memberNo || undefined}>
                <span>{row.name}{row.memberNo ? ` (${row.memberNo})` : ''}</span>
                <button
                    className="btn ghost"
                    title="Beitragsstatus & Historie"
                    aria-label="Beitragsstatus & Historie"
                    onClick={() => setShowStatus(true)}
                    style={{ marginLeft: 6, width: 24, height: 24, padding: 0, borderRadius: 6, display: 'inline-grid', placeItems: 'center', color: (statusData?.state === 'OVERDUE' ? 'var(--danger)' : statusData?.state === 'OK' ? 'var(--success)' : 'var(--text-dim)') }}
                >
                    {/* history icon */}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7V3zm1 5h-2v6h6v-2h-4V8z"/></svg>
                </button>
                {showStatus && (
                    <div className="modal-overlay" onClick={() => setShowStatus(false)}>
                        <div className="modal" onClick={(e)=>e.stopPropagation()} style={{ width: 'min(96vw, 1100px)', maxWidth: 1100, display: 'grid', gap: 10 }}>
                            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ margin: 0 }}>Beitragsstatus</h3>
                                <button className="btn" onClick={()=>setShowStatus(false)}>×</button>
                            </header>
                            <div className="helper" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                <span>{row.name}{row.memberNo ? ` (${row.memberNo})` : ''}</span>
                                <span className="badge" style={{ background: (statusData?.state === 'OVERDUE' ? 'var(--danger)' : statusData?.state === 'OK' ? 'var(--success)' : 'var(--muted)'), color: '#fff' }}>
                                    {statusData?.state === 'OVERDUE' ? `Überfällig (${statusData?.overdue})` : statusData?.state === 'OK' ? 'OK' : '—'}
                                </span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <div className="card" style={{ padding: 10 }}>
                                    <strong>Überblick</strong>
                                    <ul style={{ margin: '6px 0 0 16px' }}>
                                        <li>Eintritt: {statusData?.joinDate || '—'}</li>
                                        <li>Letzte Zahlung: {statusData?.lastPeriod ? `${statusData.lastPeriod} (${statusData?.lastDate||''})` : '—'}</li>
                                        <li>Initiale Fälligkeit: {statusData?.nextDue || '—'}</li>
                                    </ul>
                                </div>
                                <div className="card" style={{ padding: 10 }}>
                                    <strong>Historie</strong>
                                    <table cellPadding={6} style={{ width: '100%', marginTop: 6 }}>
                                        <thead>
                                            <tr>
                                                <th align="left">Periode</th>
                                                <th align="left">Datum</th>
                                                <th align="right">Betrag</th>
                                                <th align="left">Beleg</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {historyRows.map((r,i)=> (
                                                <tr key={i}>
                                                    <td>{r.periodKey}</td>
                                                    <td>{r.datePaid}</td>
                                                    <td align="right">{eur.format(r.amount)}</td>
                                                    <td>
                                                        {r.voucherNo ? (
                                                            <a href="#" onClick={(e)=>{ e.preventDefault(); if (r.voucherId) { const ev = new CustomEvent('apply-voucher-jump', { detail: { voucherId: r.voucherId } }); window.dispatchEvent(ev) } }}>{`#${r.voucherNo}`}</a>
                                                        ) : '—'}
                                                        {r.description ? ` · ${r.description}` : ''}
                                                    </td>
                                                </tr>
                                            ))}
                                            {historyRows.length===0 && <tr><td colSpan={4}><div className="helper">Keine Zahlungen</div></td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                                <button className="btn" onClick={()=>setShowStatus(false)}>Schließen</button>
                            </div>
                        </div>
                    </div>
                )}
            </td>
            <td>{row.periodKey}</td>
            <td>{row.interval}</td>
            <td align="right">{eur.format(row.amount)}</td>
            <td>
                <div style={{ display: 'grid', gap: 6 }}>
                    <select className="input" value={selVoucher ?? ''} onChange={e => setSelVoucher(e.target.value ? Number(e.target.value) : null)} title="Passende Buchung verknüpfen">
                        <option value="">— ohne Verknüpfung —</option>
                        {suggestions.map(s => (
                            <option key={s.id} value={s.id}>{s.voucherNo || s.id} · {s.date} · {eur.format(s.gross)} · {(s.description || s.counterparty || '')}</option>
                        ))}
                        {manualList.map(s => (
                            <option key={`m-${s.id}`} value={s.id}>{s.voucherNo || s.id} · {s.date} · {eur.format(s.gross)} · {(s.description || s.counterparty || '')}</option>
                        ))}
                    </select>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <input className="input" placeholder="Buchung suchen…" value={search} onChange={e => setSearch(e.target.value)} title="Suche in Buchungen (Betrag/Datum/Text)" />
                        <button className="btn" onClick={async () => {
                            try {
                                // widen range: search from period start - 90 days up to today to catch late postings
                                const { start } = periodRangeLocal(row.periodKey)
                                const s = new Date(start); s.setUTCDate(s.getUTCDate() - 90)
                                const todayISO = new Date().toISOString().slice(0,10)
                                const fromISO = s.toISOString().slice(0,10)
                                const res = await (window as any).api?.vouchers?.list?.({ from: fromISO, to: todayISO, q: search || undefined, limit: 50 })
                                const list = (res?.rows || []).map((v: any) => ({ id: v.id, voucherNo: v.voucherNo, date: v.date, description: v.description, counterparty: v.counterparty, gross: v.grossAmount }))
                                setManualList(list)
                            } catch {}
                        }}>Suchen</button>
                    </div>
                </div>
            </td>
            <td>{row.paid ? (row.verified ? 'bezahlt ✔︎ (verifiziert)' : 'bezahlt') : 'offen'}</td>
            <td style={{ whiteSpace: 'nowrap' }}>
                {row.paid ? (
                    <button className="btn" onClick={async () => { setBusy(true); try { await (window as any).api?.payments?.unmark?.({ memberId: row.memberId, periodKey: row.periodKey }); onChanged() } finally { setBusy(false) } }}>Rückgängig</button>
                ) : (
                    <button className="btn primary" disabled={busy} onClick={async () => { setBusy(true); try { await (window as any).api?.payments?.markPaid?.({ memberId: row.memberId, periodKey: row.periodKey, interval: row.interval, amount: row.amount, voucherId: selVoucher || null }); onChanged() } finally { setBusy(false) } }}>Als bezahlt markieren</button>
                )}
            </td>
        </tr>
    )
}

function sanitizePeriodKey(s: string, interval: 'MONTHLY'|'QUARTERLY'|'YEARLY'): string {
    const t = s.trim().toUpperCase()
    if (interval === 'MONTHLY') {
        const m = /^(\d{4})-(\d{1,2})$/.exec(t)
        if (!m) return t
        const y = m[1]; const mo = String(Math.max(1, Math.min(12, Number(m[2])))).padStart(2,'0')
        return `${y}-${mo}`
    }
    if (interval === 'QUARTERLY') {
        const m = /^(\d{4})-Q(\d)$/i.exec(t)
        if (!m) return t
        const y = m[1]; const q = Math.max(1, Math.min(4, Number(m[2])))
        return `${y}-Q${q}`
    }
    const y = /^\d{4}$/.exec(t)?.[0]
    return y || t
}

function periodRangeLocal(periodKey: string): { start: string; end: string } {
    // mirror of backend periodRange for the renderer search UX
    const [yStr, rest] = periodKey.split('-'); const y = Number(yStr)
    if (/^Q\d$/.test(rest||'')) {
        const q = Number((rest||'Q1').replace('Q',''))
        const start = new Date(Date.UTC(y, (q-1)*3, 1))
        const end = new Date(Date.UTC(y, q*3, 0))
        return { start: start.toISOString().slice(0,10), end: end.toISOString().slice(0,10) }
    }
    if (rest) {
        const m = Number(rest)
        const start = new Date(Date.UTC(y, m-1, 1))
        const end = new Date(Date.UTC(y, m, 0))
        return { start: start.toISOString().slice(0,10), end: end.toISOString().slice(0,10) }
    }
    const start = new Date(Date.UTC(y, 0, 1))
    const end = new Date(Date.UTC(y, 12, 0))
    return { start: start.toISOString().slice(0,10), end: end.toISOString().slice(0,10) }
}

function DashboardEarmarksPeek() {
    const [bindings, setBindings] = useState<Array<{ id: number; code: string; name: string; color?: string | null }>>([])
    const [usage, setUsage] = useState<Record<number, { balance: number }>>({})
    const eur = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
    useEffect(() => {
        (async () => {
            const res = await window.api?.bindings.list?.({ activeOnly: true })
            const rows = res?.rows?.slice(0, 6) || []
            setBindings(rows)
            const u: Record<number, { balance: number }> = {}
            for (const b of rows) {
                const r = await window.api?.bindings.usage?.({ earmarkId: b.id })
                if (r) u[b.id] = { balance: r.balance }
            }
            setUsage(u)
        })()
    }, [])
    if (!bindings.length) return null
    return (
        <div className="card" style={{ padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <strong>Zweckbindungen (Auszug)</strong>
                <button className="btn ghost" onClick={() => { const ev = new CustomEvent('apply-earmark-filter', { detail: { earmarkId: null } }); window.dispatchEvent(ev); }}>Zu Buchungen</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, marginTop: 8 }}>
                {bindings.map(b => {
                    const bg = b.color || undefined
                    const fg = contrastText(bg)
                    return (
                        <div key={b.id} className="card" style={{ padding: 10, borderTop: bg ? `4px solid ${bg}` : undefined }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <span className="badge" style={{ background: bg, color: fg }}>{b.code}</span>
                                <span className="helper">{b.name}</span>
                            </div>
                            <div style={{ marginTop: 6 }}>Saldo: {eur.format(usage[b.id]?.balance || 0)}</div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

function DashboardRecentActivity() {
    // Operational activity feed sourced from audit_log
    const [rows, setRows] = useState<Array<{
        id: number
        userId?: number | null
        entity: string
        entityId: number
        action: string
        createdAt: string
        diff?: any | null
    }>>([])
    const eur = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
    const fmtDateTime = useMemo(() => (iso: string) => {
        if (!iso) return ''
        // Handle common formats; prefer locale short date+time
        try {
            const dt = new Date(iso)
            if (!isNaN(dt.getTime())) return dt.toLocaleString('de-DE')
        } catch { }
        return iso
    }, [])

    const load = useCallback(async () => {
        try {
            const res = await (window as any).api?.audit?.recent?.({ limit: 20 })
            if (res?.rows) setRows(res.rows)
        } catch { /* noop */ }
    }, [])

    useEffect(() => {
        let alive = true
        ;(async () => { if (alive) await load() })()
        const onChanged = () => load()
        window.addEventListener('data-changed', onChanged)
        return () => { alive = false; window.removeEventListener('data-changed', onChanged) }
    }, [load])

    const typeBadge = (t?: 'IN' | 'OUT' | 'TRANSFER' | string | null) => {
        if (!t) return null
        const label = t === 'IN' ? 'IN' : t === 'OUT' ? 'OUT' : 'TR'
        const bg = t === 'IN' ? 'var(--success)' : t === 'OUT' ? 'var(--danger)' : 'var(--accent)'
        return <span className="badge" style={{ background: bg, color: '#fff' }}>{label}</span>
    }

    function describeVoucher(row: any) {
        const a = String(row.action || '').toUpperCase()
        const id = row.entityId
        const d = row.diff || {}
        if (a === 'CREATE') {
            const dt = d?.data || {}
            const msg = `Beleg #${id} angelegt`
            const extra: string[] = []
            if (dt?.description) extra.push(String(dt.description))
            if (typeof dt?.grossAmount === 'number') extra.push(eur.format(dt.grossAmount))
            if (dt?.type) extra.push(String(dt.type))
            return { icon: '＋', msg, badge: typeBadge(dt?.type), extra: extra.join(' · ') }
        }
        if (a === 'DELETE') {
            const snap = d?.snapshot || {}
            const label = snap?.voucherNo ? `Beleg ${snap.voucherNo}` : `Beleg #${id}`
            const msg = `${label} gelöscht`
            const extra: string[] = []
            if (snap?.description) extra.push(String(snap.description))
            if (typeof snap?.grossAmount === 'number') extra.push(eur.format(snap.grossAmount))
            return { icon: '🗑', msg, badge: typeBadge(snap?.type), extra: extra.join(' · ') }
        }
        if (a === 'UPDATE') {
            const after = d?.after || {}
            const before = d?.before || {}
            const typeCur = (after.type ?? before.type) || null
            // Determine changed keys reliably
            const changed = new Set<string>(Object.keys(d?.changes || {}).filter(k => k !== 'id'))
            for (const k of Object.keys(after)) { if (k !== 'id' && before?.hasOwnProperty(k) && before[k] !== after[k]) changed.add(k) }

            // Preferred order
            const preferred = ['description', 'sphere', 'date', 'type', 'paymentMethod', 'tags']
            const others = Array.from(changed).filter(k => !preferred.includes(k))
            const ordered = [...preferred.filter(k => changed.has(k)), ...others]

            const fmt = (v: any, key: string) => {
                if (v == null) return '—'
                if (key === 'tags' && Array.isArray(v)) return v.join(', ')
                return String(v)
            }
            const label: Record<string, string> = { description: 'Beschreibung', sphere: 'Sphäre', date: 'Datum', type: 'Art', paymentMethod: 'Zahlweg', tags: 'Tags' }
            const parts: string[] = []
            for (const k of ordered) {
                const from = fmt(before?.[k], k)
                const to = fmt(after?.[k], k)
                // Only include if actually different in string form
                if (from !== to) parts.push(`${label[k] || k}: ${from} → ${to}`)
                if (parts.length >= 4) { parts.push('…'); break }
            }
            return { icon: '✎', msg: `Beleg #${id} geändert`, badge: typeBadge(typeCur), extra: parts.join(' · ') || '—' }
        }
        if (a === 'REVERSE') {
            const orig = d?.originalId
            return { icon: '↩', msg: `Storno erstellt zu #${orig ?? '—'}`, badge: null, extra: `neuer Beleg #${id}` }
        }
        if (a === 'CLEAR_ALL') {
            const n = d?.deleted
            return { icon: '⚠', msg: `Alle Belege gelöscht`, badge: null, extra: typeof n === 'number' ? `${n} Stück` : '' }
        }
        return { icon: 'ℹ', msg: `${a} ${row.entity} #${id}`, badge: null, extra: '' }
    }

    const formatted = rows
        .filter(r => r && r.entity === 'vouchers')
        .map(r => ({ r, desc: describeVoucher(r) }))

    if (!formatted.length) return null
    return (
        <div className="card" style={{ padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <strong>Operativer Verlauf</strong>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button className="btn ghost" onClick={load} title="Aktualisieren">↻</button>
                    <button className="btn ghost" onClick={() => { const ev = new CustomEvent('apply-budget-jump', { detail: {} }); window.dispatchEvent(ev) }}>Zu Buchungen</button>
                </div>
            </div>
            <table cellPadding={6} style={{ marginTop: 8, width: '100%' }}>
                <thead>
                    <tr>
                        <th align="left" style={{ width: 180 }}>Zeit</th>
                        <th align="left" style={{ width: 60 }}>Typ</th>
                        <th align="left">Aktion</th>
                        <th align="left">Details</th>
                    </tr>
                </thead>
                <tbody>
                    {formatted.map(({ r, desc }) => (
                        <tr key={r.id}>
                            <td>{fmtDateTime(r.createdAt)}</td>
                            <td>{desc.badge}</td>
                            <td title={`${r.action} ${r.entity}`}>{desc.icon} {desc.msg}</td>
                            <td>{desc.extra || '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

// Binding Modal
function BindingModal({ value, onClose, onSaved }: { value: { id?: number; code: string; name: string; description?: string | null; startDate?: string | null; endDate?: string | null; isActive?: boolean; color?: string | null; budget?: number | null }; onClose: () => void; onSaved: () => void }) {
    const [v, setV] = useState(value)
    const [showColorPicker, setShowColorPicker] = useState(false)
    const [draftColor, setDraftColor] = useState<string>(value.color || '#00C853')
    const [draftError, setDraftError] = useState<string>('')
    const [askDelete, setAskDelete] = useState(false)
    useEffect(() => { setV(value); setDraftColor(value.color || '#00C853'); setDraftError(''); setAskDelete(false) }, [value])
    return createPortal(
        <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <h2 style={{ margin: 0 }}>{v.id ? 'Zweckbindung bearbeiten' : 'Zweckbindung anlegen'}</h2>
                    <button className="btn danger" onClick={onClose}>Schließen</button>
                </header>
                <div className="row">
                    <div className="field">
                        <label>Code</label>
                        <input className="input" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} />
                    </div>
                    <div className="field">
                        <label>Name</label>
                        <input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
                    </div>
                    <div className="field" style={{ gridColumn: '1 / span 2' }}>
                        <label>Beschreibung</label>
                        <input className="input" value={v.description ?? ''} onChange={(e) => setV({ ...v, description: e.target.value })} />
                    </div>
                    <div className="field">
                        <label>Von</label>
                        <input className="input" type="date" value={v.startDate ?? ''} onChange={(e) => setV({ ...v, startDate: e.target.value || null })} />
                    </div>
                    <div className="field">
                        <label>Bis</label>
                        <input className="input" type="date" value={v.endDate ?? ''} onChange={(e) => setV({ ...v, endDate: e.target.value || null })} />
                    </div>
                    <div className="field">
                        <label>Status</label>
                        <select className="input" value={(v.isActive ?? true) ? '1' : '0'} onChange={(e) => setV({ ...v, isActive: e.target.value === '1' })}>
                            <option value="1">aktiv</option>
                            <option value="0">inaktiv</option>
                        </select>
                    </div>
                    <div className="field">
                        <label>Budget (€)</label>
                        <input className="input" type="number" step="0.01" value={(v.budget ?? '') as any}
                            onChange={(e) => {
                                const val = e.target.value
                                setV({ ...v, budget: val === '' ? null : Number(val) })
                            }} />
                    </div>
                    <div className="field" style={{ gridColumn: '1 / span 2' }}>
                        <label>Farbe</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {EARMARK_PALETTE.map((c) => (
                                <button key={c} type="button" className="btn" onClick={() => setV({ ...v, color: c })} title={c} style={{ padding: 0, width: 28, height: 28, borderRadius: 6, border: v.color === c ? '2px solid var(--text)' : '2px solid transparent', background: c }}>
                                    <span aria-hidden="true" />
                                </button>
                            ))}
                            <button type="button" className="btn" onClick={() => setShowColorPicker(true)} title="Eigene Farbe" style={{ height: 28, background: v.color || 'var(--muted)', color: v.color ? contrastText(v.color) : 'var(--text)' }}>
                                Eigene…
                            </button>
                            <button type="button" className="btn" onClick={() => setV({ ...v, color: null })} title="Keine Farbe" style={{ height: 28 }}>Keine</button>
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 12 }}>
                    <div>
                        {!!v.id && (
                            <button className="btn danger" onClick={() => setAskDelete(true)}>🗑 Löschen</button>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn" onClick={onClose}>Abbrechen</button>
                        <button className="btn primary" onClick={async () => { await window.api?.bindings.upsert?.(v as any); onSaved(); onClose() }}>Speichern</button>
                    </div>
                </div>
            </div>
            {askDelete && v.id && (
                <div className="modal-overlay" onClick={() => setAskDelete(false)} role="dialog" aria-modal="true">
                    <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, display: 'grid', gap: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0 }}>Zweckbindung löschen</h3>
                            <button className="btn ghost" onClick={() => setAskDelete(false)} aria-label="Schließen">✕</button>
                        </div>
                        <div>Möchtest du die Zweckbindung <strong>{v.code}</strong> – {v.name} wirklich löschen?</div>
                        <div className="helper">Hinweis: Die Zuordnung bestehender Buchungen bleibt erhalten; es wird nur die Zweckbindung entfernt.</div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button className="btn" onClick={() => setAskDelete(false)}>Abbrechen</button>
                            <button className="btn danger" onClick={async () => { await window.api?.bindings.delete?.({ id: v.id as number }); setAskDelete(false); onSaved(); onClose() }}>Ja, löschen</button>
                        </div>
                    </div>
                </div>
            )}
            {showColorPicker && (
                <div className="modal-overlay" onClick={() => setShowColorPicker(false)} role="dialog" aria-modal="true">
                    <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, display: 'grid', gap: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0 }}>Eigene Farbe wählen</h3>
                            <button className="btn ghost" onClick={() => setShowColorPicker(false)} aria-label="Schließen">✕</button>
                        </div>
                        <div className="row">
                            <div className="field">
                                <label>Picker</label>
                                <input type="color" value={draftColor} onChange={(e) => { setDraftColor(e.target.value); setDraftError('') }} style={{ width: 60, height: 36, padding: 0, border: '1px solid var(--border)', borderRadius: 6, background: 'transparent' }} />
                            </div>
                            <div className="field">
                                <label>HEX</label>
                                <input className="input" value={draftColor} onChange={(e) => { setDraftColor(e.target.value); setDraftError('') }} placeholder="#00C853" />
                                {draftError && <div className="helper" style={{ color: 'var(--danger)' }}>{draftError}</div>}
                            </div>
                        </div>
                        <div className="card" style={{ padding: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 28, height: 28, borderRadius: 6, background: draftColor, border: '1px solid var(--border)' }} />
                            <div className="helper">Kontrast: <span style={{ background: draftColor, color: contrastText(draftColor), padding: '2px 6px', borderRadius: 6 }}>{contrastText(draftColor)}</span></div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button className="btn" onClick={() => setShowColorPicker(false)}>Abbrechen</button>
                            <button className="btn primary" onClick={() => {
                                const hex = draftColor.trim()
                                const ok = /^#([0-9a-fA-F]{6})$/.test(hex)
                                if (!ok) { setDraftError('Bitte gültigen HEX-Wert eingeben (z. B. #00C853)'); return }
                                setV({ ...v, color: hex })
                                setShowColorPicker(false)
                            }}>Übernehmen</button>
                        </div>
                    </div>
                </div>
            )}
        </div>,
        document.body
    )
}

// Budget Modal
function BudgetModal({ value, onClose, onSaved }: { value: { id?: number; year: number; sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; amountPlanned: number; name?: string | null; categoryName?: string | null; projectName?: string | null; startDate?: string | null; endDate?: string | null; color?: string | null; categoryId?: number | null; projectId?: number | null; earmarkId?: number | null }; onClose: () => void; onSaved: () => void }) {
    const [v, setV] = useState(value)
    const [nameError, setNameError] = useState<string>('')
    const nameRef = useRef<HTMLInputElement | null>(null)
    const [showColorPicker, setShowColorPicker] = useState(false)
    const [draftColor, setDraftColor] = useState<string>(value.color || '#00C853')
    const [draftError, setDraftError] = useState<string>('')
    const [askDelete, setAskDelete] = useState(false)
    // Keep modal state in sync when opening with an existing budget so fields are prefilled
    useEffect(() => { setV(value); setNameError(''); setDraftColor(value.color || '#00C853'); setDraftError(''); setAskDelete(false) }, [value])
    const PALETTE = ['#7C4DFF', '#2962FF', '#00B8D4', '#00C853', '#AEEA00', '#FFD600', '#FF9100', '#FF3D00', '#F50057', '#9C27B0']
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <h2 style={{ margin: 0 }}>{v.id ? 'Budget bearbeiten' : 'Budget anlegen'}</h2>
                    <button className="btn danger" onClick={onClose}>Schließen</button>
                </header>
                <div className="row">
                    <div className="field">
                        <label>Jahr</label>
                        <input className="input" type="number" value={v.year} onChange={(e) => setV({ ...v, year: Number(e.target.value) })} />
                    </div>
                    <div className="field">
                        <label>Budget (€)</label>
                        <input className="input" type="number" step="0.01" value={v.amountPlanned} onChange={(e) => setV({ ...v, amountPlanned: Number(e.target.value) })} />
                    </div>
                    <div className="field">
                        <label>Name</label>
                        <input
                            ref={nameRef}
                            className="input"
                            value={v.name ?? ''}
                            onChange={(e) => { const nv = e.target.value; setV({ ...v, name: nv }); if (nameError && nv.trim()) setNameError('') }}
                            placeholder="z. B. Jugendfreizeit"
                            style={nameError ? { borderColor: 'var(--danger)' } : undefined}
                        />
                        {nameError && (
                            <div className="helper" style={{ color: 'var(--danger)' }}>{nameError}</div>
                        )}
                    </div>
                    <div className="field">
                        <label>Kategorie</label>
                        <input className="input" value={v.categoryName ?? ''} onChange={(e) => setV({ ...v, categoryName: e.target.value || null })} placeholder="z. B. Material" />
                    </div>
                    <div className="field">
                        <label>Projekt</label>
                        <input className="input" value={v.projectName ?? ''} onChange={(e) => setV({ ...v, projectName: e.target.value || null })} placeholder="z. B. Projekt X" />
                    </div>
                    {/* Dates row */}
                    <div className="field" style={{ gridColumn: '1 / span 2', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div className="field">
                            <label>Von</label>
                            <input className="input" type="date" value={v.startDate ?? ''} onChange={(e) => setV({ ...v, startDate: e.target.value || null })} />
                        </div>
                        <div className="field">
                            <label>Bis</label>
                            <input className="input" type="date" value={v.endDate ?? ''} onChange={(e) => setV({ ...v, endDate: e.target.value || null })} />
                        </div>
                    </div>
                    <div className="field" style={{ gridColumn: '1 / span 2' }}>
                        <label>Farbe</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {PALETTE.map((c) => (
                                <button key={c} type="button" className="btn" onClick={() => setV({ ...v, color: c })} title={c} style={{ padding: 0, width: 28, height: 28, borderRadius: 6, border: v.color === c ? '2px solid var(--text)' : '2px solid transparent', background: c }}>
                                    <span aria-hidden="true" />
                                </button>
                            ))}
                            <button type="button" className="btn" onClick={() => setShowColorPicker(true)} title="Eigene Farbe" style={{ height: 28, background: v.color || 'var(--muted)', color: v.color ? contrastText(v.color) : 'var(--text)' }}>
                                Eigene…
                            </button>
                            <button type="button" className="btn" onClick={() => setV({ ...v, color: null })} title="Keine Farbe" style={{ height: 28 }}>Keine</button>
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 12 }}>
                    <div>
                        {!!v.id && (
                            <button className="btn danger" onClick={() => setAskDelete(true)}>🗑 Löschen</button>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn" onClick={onClose}>Abbrechen</button>
                        <button className="btn primary" onClick={async () => {
                        const name = (v.name || '').trim()
                        if (!name) { setNameError('Bitte Namen angeben'); nameRef.current?.focus(); return }
                        // Persist start/end dates and other fields
                        await window.api?.budgets.upsert?.({
                            id: v.id as any,
                            year: v.year,
                            sphere: v.sphere,
                            amountPlanned: v.amountPlanned,
                            name,
                            categoryName: v.categoryName ?? null,
                            projectName: v.projectName ?? null,
                            startDate: v.startDate ?? null,
                            endDate: v.endDate ?? null,
                            color: v.color ?? null,
                            categoryId: v.categoryId ?? null,
                            projectId: v.projectId ?? null,
                            earmarkId: v.earmarkId ?? null
                        } as any)
                        onSaved(); onClose()
                    }}>Speichern</button>
                    </div>
                </div>
            </div>
            {askDelete && v.id && (
                <div className="modal-overlay" onClick={() => setAskDelete(false)} role="dialog" aria-modal="true">
                    <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, display: 'grid', gap: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0 }}>Budget löschen</h3>
                            <button className="btn ghost" onClick={() => setAskDelete(false)} aria-label="Schließen">✕</button>
                        </div>
                        <div>Möchtest du das Budget <strong>{(v.name || '').trim() || ('#' + v.id)}</strong> wirklich löschen?</div>
                        <div className="helper">Dieser Vorgang kann nicht rückgängig gemacht werden.</div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button className="btn" onClick={() => setAskDelete(false)}>Abbrechen</button>
                            <button className="btn danger" onClick={async () => { await window.api?.budgets.delete?.({ id: v.id as number }); setAskDelete(false); onSaved(); onClose() }}>Ja, löschen</button>
                        </div>
                    </div>
                </div>
            )}
            {showColorPicker && (
                <div className="modal-overlay" onClick={() => setShowColorPicker(false)} role="dialog" aria-modal="true">
                    <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, display: 'grid', gap: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0 }}>Eigene Farbe wählen</h3>
                            <button className="btn ghost" onClick={() => setShowColorPicker(false)} aria-label="Schließen">✕</button>
                        </div>
                        <div className="row">
                            <div className="field">
                                <label>Picker</label>
                                <input type="color" value={draftColor} onChange={(e) => { setDraftColor(e.target.value); setDraftError('') }} style={{ width: 60, height: 36, padding: 0, border: '1px solid var(--border)', borderRadius: 6, background: 'transparent' }} />
                            </div>
                            <div className="field">
                                <label>HEX</label>
                                <input className="input" value={draftColor} onChange={(e) => { setDraftColor(e.target.value); setDraftError('') }} placeholder="#00C853" />
                                {draftError && <div className="helper" style={{ color: 'var(--danger)' }}>{draftError}</div>}
                            </div>
                        </div>
                        <div className="card" style={{ padding: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 28, height: 28, borderRadius: 6, background: draftColor, border: '1px solid var(--border)' }} />
                            <div className="helper">Kontrast: <span style={{ background: draftColor, color: contrastText(draftColor), padding: '2px 6px', borderRadius: 6 }}>{contrastText(draftColor)}</span></div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button className="btn" onClick={() => setShowColorPicker(false)}>Abbrechen</button>
                            <button className="btn primary" onClick={() => {
                                const hex = draftColor.trim()
                                const ok = /^#([0-9a-fA-F]{6})$/.test(hex)
                                if (!ok) { setDraftError('Bitte gültigen HEX-Wert eingeben (z. B. #00C853)'); return }
                                setV({ ...v, color: hex })
                                setShowColorPicker(false)
                            }}>Übernehmen</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// Invoices list with filters, pagination, and basic actions (add payment / mark paid / delete)
function InvoicesView() {
    // Filters and pagination
    const [q, setQ] = useState<string>('')
    const [status, setStatus] = useState<'ALL' | 'OPEN' | 'PARTIAL' | 'PAID'>('ALL')
    const [sphere, setSphere] = useState<'' | 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'>('')
    const [dueFrom, setDueFrom] = useState<string>('')
    const [dueTo, setDueTo] = useState<string>('')
    const [budgetId, setBudgetId] = useState<number | ''>('')
    const [tag, setTag] = useState<string>('')
    const [limit, setLimit] = useState<number>(20)
    const [offset, setOffset] = useState<number>(0)
    const [total, setTotal] = useState<number>(0)
    const [summary, setSummary] = useState<{ count: number; gross: number; paid: number; remaining: number } | null>(null)
    // Sorting (persist to localStorage)
    const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>(() => { try { return ((localStorage.getItem('invoices.sort') as 'ASC' | 'DESC') || 'ASC') } catch { return 'ASC' } })
    const [sortBy, setSortBy] = useState<'date' | 'due' | 'amount'>(() => { try { return ((localStorage.getItem('invoices.sortBy') as 'date' | 'due' | 'amount') || 'due') } catch { return 'due' } })
    // Due date modal state and available years
    const [showDueFilter, setShowDueFilter] = useState<boolean>(false)
    const [yearsAvail, setYearsAvail] = useState<number[]>([])

    // Data
    const [loading, setLoading] = useState<boolean>(true)
    const [rows, setRows] = useState<any[]>([])
    const [error, setError] = useState<string>('')
    const [tags, setTags] = useState<Array<{ id: number; name: string; color?: string | null }>>([])
    const [budgets, setBudgets] = useState<Array<{ id: number; name?: string | null; year: number }>>([])
    const [earmarks, setEarmarks] = useState<Array<{ id: number; code: string; name: string; color?: string | null }>>([])

    // Currency/date formatters (respect global date preference if set)
    const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
    const dateFmtPref = useMemo(() => {
        try { return (localStorage.getItem('ui.dateFmt') as 'ISO' | 'PRETTY') || 'ISO' } catch { return 'ISO' }
    }, [])
    const fmtDateLocal = useMemo(() => {
        const pretty = (s?: string) => {
            if (!s) return ''
            const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
            if (!m) return s || ''
            const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3])
            const dt = new Date(Date.UTC(y, mo - 1, d))
            const mon = dt.toLocaleString('de-DE', { month: 'short' }).replace('.', '')
            const dd = String(d).padStart(2, '0')
            return `${dd} ${mon} ${y}`
        }
        return (s?: string) => dateFmtPref === 'PRETTY' ? pretty(s) : (s || '')
    }, [dateFmtPref])

    // Debounce search
    const [qDebounced, setQDebounced] = useState('')
    useEffect(() => {
        const t = setTimeout(() => setQDebounced(q.trim()), 250)
        return () => clearTimeout(t)
    }, [q])

    // Load tags, budgets, earmarks (for filters/forms)
    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const t = await window.api?.tags?.list?.({})
                if (!cancelled) setTags((t?.rows || []).map(r => ({ id: r.id, name: r.name, color: r.color ?? null })))
            } catch { }
            try {
                const b = await window.api?.budgets?.list?.({})
                if (!cancelled) setBudgets((b?.rows || []).map(r => ({ id: r.id, name: r.name || r.categoryName || r.projectName || undefined, year: r.year })))
            } catch { }
            try {
                const em = await window.api?.bindings?.list?.({ activeOnly: true })
                if (!cancelled) setEarmarks((em?.rows || []).map(r => ({ id: r.id, code: r.code, name: r.name, color: r.color ?? null })))
            } catch { }
            try {
                const y = await window.api?.reports?.years?.()
                if (!cancelled && y?.years) setYearsAvail(y.years)
            } catch { }
        })()
        return () => { cancelled = true }
    }, [])

    const [flashId, setFlashId] = useState<number | null>(null)

    async function load() {
        setLoading(true)
        setError('')
        try {
            const res = await window.api?.invoices?.list?.({
                limit,
                offset,
                sort: sortDir,
                sortBy,
                status,
                sphere: sphere || undefined,
                budgetId: typeof budgetId === 'number' ? budgetId : undefined,
                q: qDebounced || undefined,
                dueFrom: dueFrom || undefined,
                dueTo: dueTo || undefined,
                tag: tag || undefined
            })
            setRows(res?.rows || [])
            setTotal(res?.total || 0)
        } catch (e: any) {
            setError(e?.message || String(e))
        } finally {
            setLoading(false)
        }
    }

    async function loadSummary() {
        try {
            const res = await window.api?.invoices?.summary?.({
                status,
                sphere: sphere || undefined,
                budgetId: typeof budgetId === 'number' ? budgetId : undefined,
                q: qDebounced || undefined,
                dueFrom: dueFrom || undefined,
                dueTo: dueTo || undefined,
                tag: tag || undefined
            })
            setSummary(res || null)
        } catch {
            setSummary(null)
        }
    }

    // Trigger load when filters/paging change
    useEffect(() => { load() }, [limit, offset, status, sphere, budgetId, qDebounced, dueFrom, dueTo, tag, sortDir, sortBy])

    // Fetch invoices summary (totals) when filters change (not paginated)
    useEffect(() => {
        loadSummary()
    }, [status, sphere, budgetId, qDebounced, dueFrom, dueTo, tag])

    // Also refresh summary when other parts of the app signal data changes (e.g., auto-posted vouchers)
    useEffect(() => {
        const onChanged = () => { loadSummary() }
        try { window.addEventListener('data-changed', onChanged) } catch {}
        return () => { try { window.removeEventListener('data-changed', onChanged) } catch {} }
    }, [status, sphere, budgetId, qDebounced, dueFrom, dueTo, tag])

    // Persist sorting prefs
    useEffect(() => { try { localStorage.setItem('invoices.sort', sortDir) } catch {} }, [sortDir])
    useEffect(() => { try { localStorage.setItem('invoices.sortBy', sortBy) } catch {} }, [sortBy])

    function clearFilters() {
        setQ(''); setStatus('ALL'); setSphere(''); setDueFrom(''); setDueTo(''); setBudgetId(''); setTag(''); setOffset(0)
    }

    const page = Math.floor(offset / limit) + 1
    const pages = Math.max(1, Math.ceil((total || 0) / (limit || 1)))
    const canPrev = offset > 0
    const canNext = offset + limit < total

    // Inline actions
    const [showPayModal, setShowPayModal] = useState<null | { id: number; party?: string; invoiceNo?: string | null; remaining: number }>(null)
    const [payDate, setPayDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
    const [payAmount, setPayAmount] = useState<string>('')
    const [busyAction, setBusyAction] = useState<boolean>(false)
    const [deleteConfirm, setDeleteConfirm] = useState<null | { id: number; party?: string; invoiceNo?: string | null }>(null)
    // Detail modal
    const [detailId, setDetailId] = useState<number | null>(null)
    const [detail, setDetail] = useState<null | { id: number; date: string; dueDate?: string | null; invoiceNo?: string | null; party: string; description?: string | null; grossAmount: number; paymentMethod?: string | null; sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; earmarkId?: number | null; budgetId?: number | null; autoPost?: number; voucherType: 'IN' | 'OUT'; postedVoucherId?: number | null; postedVoucherNo?: string | null; payments: Array<{ id: number; date: string; amount: number }>; files: Array<{ id: number; fileName: string; mimeType?: string | null; size?: number | null; createdAt?: string | null }>; tags: string[]; paidSum: number; status: 'OPEN' | 'PARTIAL' | 'PAID' }>(null)
    const [loadingDetail, setLoadingDetail] = useState<boolean>(false)
    async function openDetails(id: number) {
        setDetailId(id)
    }
    useEffect(() => {
        let cancelled = false
        async function fetchDetail() {
            if (!detailId) return
            setLoadingDetail(true)
            try {
                const d = await window.api?.invoices?.get?.({ id: detailId })
                if (!cancelled) setDetail(d || null)
            } catch (e) {
                if (!cancelled) setDetail(null)
            } finally {
                if (!cancelled) setLoadingDetail(false)
            }
        }
        fetchDetail()
        return () => { cancelled = true }
    }, [detailId])

    // Allow external components (e.g., Dashboard tile) to open an invoice detail by id
    useEffect(() => {
        function onOpen(e: any) {
            const id = Number(e?.detail?.id)
            if (isFinite(id) && id > 0) openDetails(id)
        }
        window.addEventListener('open-invoice-details', onOpen as any)
        return () => window.removeEventListener('open-invoice-details', onOpen as any)
    }, [])

    async function addPayment() {
        if (!showPayModal) return
        const amt = Number(payAmount.replace(',', '.'))
        if (!isFinite(amt) || Math.abs(amt) < 0.01) { alert('Bitte einen Betrag angeben'); return }
        // Prevent overpayment on client side
        const remainingCap = typeof showPayModal.remaining === 'number' ? Math.max(0, Math.round(showPayModal.remaining * 100) / 100) : undefined
        if (remainingCap != null && amt - remainingCap > 1e-6) {
            alert(`Der Betrag übersteigt den offenen Rest (${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(remainingCap)}).`)
            return
        }
        setBusyAction(true)
        try {
            const res = await window.api?.invoices?.addPayment?.({ invoiceId: showPayModal.id, date: payDate, amount: amt })
            if (res) {
                // update row in place
                setRows(prev => prev.map(r => r.id === showPayModal.id ? { ...r, paidSum: res.paidSum ?? (r.paidSum + amt), status: res.status } : r))
                setShowPayModal(null)
                // Notify other views (e.g., Buchungen) to refresh in case of auto-post
                try { window.dispatchEvent(new Event('data-changed')) } catch {}
                // Refresh summary immediately so totals reflect the new payment
                await loadSummary()
            }
        } catch (e: any) {
            alert(e?.message || String(e))
        } finally {
            setBusyAction(false)
        }
    }

    // removed: mark-as-paid flow (button and confirm modal)

    async function deleteInvoice(id: number) {
        setBusyAction(true)
        try {
            const res = await window.api?.invoices?.delete?.({ id })
            if (res) {
                setRows(prev => prev.filter(r => r.id !== id))
                setTotal(t => Math.max(0, t - 1))
                await loadSummary()
            }
        } catch (e: any) { alert(e?.message || String(e)) } finally { setBusyAction(false); setDeleteConfirm(null) }
    }

    const statusBadge = (s: 'OPEN' | 'PARTIAL' | 'PAID') => {
        const map: Record<string, string> = { OPEN: 'var(--danger)', PARTIAL: '#f9a825', PAID: 'var(--success)' }
        const bg = map[s] || 'var(--muted)'
        const fg = contrastText(bg)
        return <span className="badge" style={{ background: bg, color: fg }}>{s}</span>
    }

    // Create/Edit modal state and logic
    type InvoiceDraft = {
        id?: number
        date: string
        dueDate?: string | null
        invoiceNo?: string | null
        party: string
        description?: string | null
        grossAmount: string // as text input, will be parsed
        paymentMethod?: '' | 'BAR' | 'BANK'
        sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
        earmarkId?: number | ''
        budgetId?: number | ''
        autoPost: boolean
        voucherType: 'IN' | 'OUT'
        tags: string[]
    }
    const [form, setForm] = useState<null | { mode: 'create' | 'edit'; draft: InvoiceDraft; sourceRow?: any }>(null)
    const [formFiles, setFormFiles] = useState<File[]>([])
    const fileInputRef = useRef<HTMLInputElement | null>(null)
    // Edit-mode attachments for invoices
    const editInvoiceFileInputRef = useRef<HTMLInputElement | null>(null)
    const [editInvoiceFiles, setEditInvoiceFiles] = useState<Array<{ id: number; fileName: string; size?: number | null; createdAt?: string | null }>>([])
    const [formError, setFormError] = useState<string>('')
    function openCreate() {
        const today = new Date().toISOString().slice(0, 10)
        setForm({ mode: 'create', draft: { date: today, dueDate: null, invoiceNo: '', party: '', description: '', grossAmount: '', paymentMethod: 'BANK', sphere: 'IDEELL', earmarkId: '', budgetId: '', autoPost: true, voucherType: 'OUT', tags: [] } })
        setFormFiles([])
        setFormError('')
    }
    function openEdit(row: any) {
        setForm({
            mode: 'edit',
            draft: {
                id: row.id,
                date: row.date,
                dueDate: row.dueDate ?? null,
                invoiceNo: row.invoiceNo ?? '',
                party: row.party,
                description: row.description ?? '',
                grossAmount: String(row.grossAmount ?? ''),
                paymentMethod: (row.paymentMethod ?? '') as any,
                sphere: row.sphere,
                earmarkId: (typeof row.earmarkId === 'number' ? row.earmarkId : '') as any,
                budgetId: (typeof row.budgetId === 'number' ? row.budgetId : '') as any,
                autoPost: !!(row.autoPost ?? 0),
                voucherType: row.voucherType,
                tags: (row.tags || []) as string[]
            },
            sourceRow: row
        })
        setFormFiles([])
        setFormError('')
    }
    function parseAmount(input: string): number | null {
        if (!input) return null
        const s = input.replace(/\./g, '').replace(',', '.')
        const n = Number(s)
        return isFinite(n) ? Math.round(n * 100) / 100 : null
    }
    async function saveForm() {
        if (!form) return
        setFormError('')
        const d = form.draft
        if (!d.date) { setFormError('Bitte Datum angeben'); return }
        if (!d.party || !d.party.trim()) { setFormError('Bitte Partei angeben'); return }
        const amt = parseAmount(d.grossAmount)
        if (amt == null || amt <= 0) { setFormError('Bitte gültigen Betrag eingeben (> 0)'); return }

        try {
            if (form.mode === 'create') {
                // encode files
                let files: { name: string; dataBase64: string; mime?: string }[] | undefined
                if (formFiles.length) {
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
                    files = await Promise.all(formFiles.map(enc))
                }
                const payload = {
                    date: d.date,
                    dueDate: d.dueDate || null,
                    invoiceNo: (d.invoiceNo || '').trim() || null,
                    party: d.party.trim(),
                    description: (d.description || '').trim() || null,
                    grossAmount: amt,
                    paymentMethod: d.paymentMethod || null,
                    sphere: d.sphere,
                    earmarkId: (typeof d.earmarkId === 'number') ? d.earmarkId : null,
                    budgetId: (typeof d.budgetId === 'number') ? d.budgetId : null,
                    autoPost: !!d.autoPost,
                    voucherType: d.voucherType,
                    files,
                    tags: d.tags || []
                }
                const res = await window.api?.invoices?.create?.(payload as any)
                if (res?.id) {
                    setForm(null)
                    setFormFiles([])
                    setOffset(0)
                    // Flash newly created invoice row
                    setFlashId(res.id)
                    window.setTimeout(() => setFlashId((cur) => (cur === res.id ? null : cur)), 3000)
                    await Promise.all([load(), loadSummary()])
                }
            } else {
                const payload = {
                    id: d.id!,
                    date: d.date,
                    dueDate: d.dueDate || null,
                    invoiceNo: (d.invoiceNo || '').trim() || null,
                    party: d.party.trim(),
                    description: (d.description || '').trim() || null,
                    grossAmount: amt,
                    paymentMethod: d.paymentMethod || null,
                    sphere: d.sphere,
                    earmarkId: (typeof d.earmarkId === 'number') ? d.earmarkId : null,
                    budgetId: (typeof d.budgetId === 'number') ? d.budgetId : null,
                    autoPost: !!d.autoPost,
                    voucherType: d.voucherType,
                    tags: d.tags || []
                }
                const res = await window.api?.invoices?.update?.(payload as any)
                if (res?.id) {
                    setForm(null)
                    setFormFiles([])
                    // Flash the updated invoice row
                    if (payload.id) {
                        setFlashId(payload.id)
                        window.setTimeout(() => setFlashId((cur) => (cur === payload.id ? null : cur)), 3000)
                    }
                    await Promise.all([load(), loadSummary()])
                }
            }
        } catch (e: any) {
            setFormError(e?.message || String(e))
        }
    }
    function removeFileAt(i: number) {
        setFormFiles(prev => prev.filter((_, idx) => idx !== i))
    }

    // Suggestions for Party/Description (simple datalist from current rows)
    const partySuggestions = useMemo(() => {
        const set = new Set<string>()
        for (const r of rows) { if (r?.party) set.add(String(r.party)) }
        return Array.from(set).sort().slice(0, 30)
    }, [rows])
    const descSuggestions = useMemo(() => {
        const set = new Set<string>()
        for (const r of rows) { if (r?.description) set.add(String(r.description)) }
        return Array.from(set).sort().slice(0, 30)
    }, [rows])

    // Keyboard shortcuts within the form modal
    useEffect(() => {
        if (!form) return
        function onKey(e: KeyboardEvent) {
            const target = e.target as HTMLElement | null
            const tag = (target?.tagName || '').toLowerCase()
            const inEditable = !!(target && ((target as any).isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select'))
            // Esc closes
            if (e.key === 'Escape') { setForm(null); e.preventDefault(); return }
            // Enter to save (not when focusing a textarea or holding Shift)
            if (e.key === 'Enter' && !e.shiftKey && inEditable && tag !== 'textarea') { saveForm(); e.preventDefault(); return }
            // Ctrl/Cmd+U to add files (create only)
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') {
                if (form.mode === 'create') fileInputRef.current?.click(); else editInvoiceFileInputRef.current?.click();
                e.preventDefault(); return
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [form, saveForm])

    // Load files for edit mode
    useEffect(() => {
        let alive = true
        async function loadFiles() {
            try {
                if (form && form.mode === 'edit' && (form.draft as any).id) {
                    const res = await window.api?.invoiceFiles?.list?.({ invoiceId: (form.draft as any).id })
                    if (alive && res?.files) setEditInvoiceFiles(res.files as any)
                } else {
                    if (alive) setEditInvoiceFiles([])
                }
            } catch { /* ignore */ }
        }
        loadFiles()
        return () => { alive = false }
    }, [form?.mode, (form?.draft as any)?.id])

    return (
        <div className="card" style={{ padding: 12, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h1 style={{ margin: 0 }}>Rechnungen</h1>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input className="input" placeholder="Suche Rechnungen (Nr., Partei, Text)…" value={q} onChange={e => { setQ(e.target.value); setOffset(0) }} style={{ width: 280 }} />
                    <select className="input" value={status} onChange={e => { setStatus(e.target.value as any); setOffset(0) }}>
                        <option value="ALL">Alle</option>
                        <option value="OPEN">Offen</option>
                        <option value="PARTIAL">Teilweise</option>
                        <option value="PAID">Bezahlt</option>
                    </select>
                    <select className="input" value={sphere} onChange={e => { setSphere((e.target.value || '') as any); setOffset(0) }}>
                        <option value="">Sphäre: alle</option>
                        <option value="IDEELL">IDEELL</option>
                        <option value="ZWECK">ZWECK</option>
                        <option value="VERMOEGEN">VERMÖGEN</option>
                        <option value="WGB">WGB</option>
                    </select>
                    <select className="input" value={String(budgetId)} onChange={e => { const v = e.target.value; setBudgetId(v && v !== '' ? Number(v) : ''); setOffset(0) }}>
                        <option value="">Budget: alle</option>
                        {budgets.map(b => (
                            <option key={b.id} value={b.id}>{b.year}{b.name ? ` – ${b.name}` : ''}</option>
                        ))}
                    </select>
                    <select className="input" value={tag} onChange={e => { setTag(e.target.value); setOffset(0) }}>
                        <option value="">Tag: alle</option>
                        {tags.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                    </select>
                    {/* Due date filter: icon to open modal like in Buchungen */}
                    <span style={{ color: 'var(--text-dim)' }}>Fällig:</span>
                    <button className="btn" title="Fälligkeits-Zeitraum/Jahr wählen" onClick={() => setShowDueFilter(true)}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 1a11 11 0 1 0 11 11A11.013 11.013 0 0 0 12 1Zm0 20a9 9 0 1 1 9-9 9.01 9.01 0 0 1-9 9Zm.5-14h-2v6l5.2 3.12 1-1.64-4.2-2.48Z" /></svg>
                    </button>
                    {/* Optional tiny hint when active */}
                    {(dueFrom || dueTo) && (
                        <span className="helper">{dueFrom || '—'} – {dueTo || '—'}</span>
                    )}
                    {(() => { const hasFilters = !!(q.trim() || (status !== 'ALL') || sphere || budgetId || tag || dueFrom || dueTo); return hasFilters ? (
                        <button className="btn ghost" onClick={clearFilters} title="Alle Filter löschen">Filter zurücksetzen</button>
                    ) : null })()}
                    <div style={{ width: 12 }} />
                    <button className="btn primary" onClick={() => openCreate()}>+ Neu</button>
                </div>
            </div>
            {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
            {loading ? (
                <div className="helper">Lade…</div>
            ) : (
                <>
                    {summary && (
                        <div className="helper" style={{ marginBottom: 6 }}>
                            Offen gesamt: <strong>{eurFmt.format(Math.max(0, Math.round((summary.remaining || 0) * 100) / 100))}</strong>
                            <span style={{ marginLeft: 8, color: 'var(--text-dim)' }}>
                                ({summary.count} Rechnungen; Brutto {eurFmt.format(summary.gross || 0)}, Bezahlt {eurFmt.format(summary.paid || 0)})
                            </span>
                        </div>
                    )}
                    <table className="invoices-table" cellPadding={6} style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                <th align="center" title="Typ">Typ</th>
                                <th align="left">
                                    <button className="btn ghost" title="Nach Datum sortieren" onClick={() => { setSortBy('date'); setSortDir(prev => (sortBy === 'date' ? (prev === 'DESC' ? 'ASC' : 'DESC') : (prev || 'DESC'))); setOffset(0) }} style={{ padding: 0, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                                        <span>Datum</span>
                                        <span aria-hidden="true" className="sort-icon" style={{ color: sortBy === 'date' ? 'var(--warning)' : 'var(--text-dim)' }}>{sortBy === 'date' ? (sortDir === 'DESC' ? '↓' : '↑') : '↕'}</span>
                                    </button>
                                </th>
                                <th align="left">
                                    <button className="btn ghost" title="Nach Fälligkeit sortieren" onClick={() => { setSortBy('due'); setSortDir(prev => (sortBy === 'due' ? (prev === 'DESC' ? 'ASC' : 'DESC') : (prev || 'ASC'))); setOffset(0) }} style={{ padding: 0, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                                        <span>Fällig</span>
                                        <span aria-hidden="true" className="sort-icon" style={{ color: sortBy === 'due' ? 'var(--warning)' : 'var(--text-dim)' }}>{sortBy === 'due' ? (sortDir === 'DESC' ? '↓' : '↑') : '↕'}</span>
                                    </button>
                                </th>
                                <th align="left">Nr.</th>
                                <th align="left">Partei</th>
                                <th align="left">Tags</th>
                                <th align="right">
                                    <button className="btn ghost" title="Nach Betrag sortieren" onClick={() => { setSortBy('amount'); setSortDir(prev => (sortBy === 'amount' ? (prev === 'DESC' ? 'ASC' : 'DESC') : (prev || 'DESC'))); setOffset(0) }} style={{ padding: 0, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                                        <span>Brutto</span>
                                        <span aria-hidden="true" className="sort-icon" style={{ color: sortBy === 'amount' ? 'var(--warning)' : 'var(--text-dim)' }}>{sortBy === 'amount' ? (sortDir === 'DESC' ? '↓' : '↑') : '↕'}</span>
                                    </button>
                                </th>
                                <th align="right">Bezahlt</th>
                                <th align="right">Rest</th>
                                <th align="left">Status</th>
                                <th align="center" title="Anhänge">📎</th>
                                <th align="center">Aktionen</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r: any) => {
                                const remaining = Math.max(0, Math.round((Number(r.grossAmount || 0) - Number(r.paidSum || 0)) * 100) / 100)
                                return (
                                    <tr key={r.id} className={flashId === r.id ? 'row-flash' : undefined}>
                                        <td align="center" title={r.voucherType === 'IN' ? 'Einnahme' : 'Ausgabe'}>
                                            <span className="badge" style={{ background: r.voucherType === 'IN' ? 'var(--success)' : 'var(--danger)', color: 'white', padding: '2px 6px' }}>
                                                {r.voucherType === 'IN' ? '↑ IN' : '↓ OUT'}
                                            </span>
                                        </td>
                                        <td>{fmtDateLocal(r.date)}</td>
                                        {(() => {
                                            const due = r.dueDate || ''
                                            let style: React.CSSProperties | undefined
                                            let title = 'Fälligkeit'
                                            if (due) {
                                                try {
                                                    const today = new Date()
                                                    const d = new Date(due)
                                                    const diffMs = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).getTime() - new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())).getTime()
                                                    const days = Math.round(diffMs / (1000 * 60 * 60 * 24))
                                                    if (days < 0) { style = { color: 'var(--danger)', fontWeight: 600 }; title = 'Überfällig' }
                                                    else if (days <= 5) { style = { color: '#f9a825', fontWeight: 600 }; title = 'Fällig in ≤ 5 Tagen' }
                                                } catch { }
                                            }
                                            return (<td style={style} title={title}>{fmtDateLocal(due)}</td>)
                                        })()}
                                        <td>{r.invoiceNo || '—'}</td>
                                        <td>{r.party}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                {(r.tags || []).map((t: string) => {
                                                    const def = (tags || []).find(td => (td.name || '').toLowerCase() === (t || '').toLowerCase())
                                                    const bg = def?.color || undefined
                                                    const fg = bg ? contrastText(bg) : undefined
                                                    return (
                                                        <button key={t} className="chip" onClick={() => { setTag(t); setOffset(0) }} title={`Nach Tag "${t}" filtern`} style={bg ? { background: bg, color: fg, borderColor: bg } : undefined}>{t}</button>
                                                    )
                                                })}
                                            </div>
                                        </td>
                                        <td align="right">{eurFmt.format(r.grossAmount)}</td>
                                        <td align="right" title={`Summe Zahlungen`}>{eurFmt.format(r.paidSum || 0)}</td>
                                        <td align="right" style={{ color: remaining > 0 ? 'var(--danger)' : 'var(--success)' }}>{eurFmt.format(remaining)}</td>
                                        <td>{statusBadge(r.status)}</td>
                                        <td align="center">{(r.fileCount || 0) > 0 ? <span className="badge">📎 {r.fileCount}</span> : ''}</td>
                                        <td align="center" style={{ whiteSpace: 'nowrap' }}>
                                            <button className="btn" title="Details" onClick={() => openDetails(r.id)}>ℹ</button>
                                            <button className="btn" title="Bearbeiten" onClick={() => openEdit(r)}>✎</button>
                                            {remaining > 0 && r.status !== 'PAID' && (
                                                <button className="btn" title="Zahlung hinzufügen" onClick={() => { setShowPayModal({ id: r.id, party: r.party, invoiceNo: r.invoiceNo || null, remaining }); setPayAmount(String(remaining || '')) }}>{'€+'}</button>
                                            )}
                                            {/* removed: Als bezahlt markieren button */}
                                            <button className="btn danger" title="Löschen" onClick={() => setDeleteConfirm({ id: r.id, party: r.party, invoiceNo: r.invoiceNo || null })}>🗑</button>
                                        </td>
                                    </tr>
                                )
                            })}
                            {rows.length === 0 && (
                                <tr><td colSpan={12} className="helper">Keine Rechnungen gefunden.</td></tr>
                            )}
                        </tbody>
                    </table>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
                        <div className="helper">Gesamt: {total}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <label className="helper">Pro Seite</label>
                            <select className="input" value={limit} onChange={e => { setLimit(Number(e.target.value)); setOffset(0) }}>
                                <option value={10}>10</option>
                                <option value={20}>20</option>
                                <option value={50}>50</option>
                            </select>
                                <button className="btn" disabled={!canPrev} onClick={() => setOffset(0)} title="Erste Seite" aria-label="Erste Seite">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <polyline points="11 17 6 12 11 7" />
                                        <polyline points="18 17 13 12 18 7" />
                                    </svg>
                                </button>
                            <button
                                className="btn"
                                disabled={!canPrev}
                                onClick={() => setOffset(Math.max(0, offset - limit))}
                                title="Zurück"
                                aria-label="Zurück"
                                style={!canPrev ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
                            >
                                ‹
                            </button>
                            <span className="helper">Seite {page} / {pages}</span>
                            <button
                                className="btn"
                                disabled={!canNext}
                                onClick={() => setOffset(offset + limit)}
                                title="Weiter"
                                aria-label="Weiter"
                                style={!canNext ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
                            >
                                ›
                            </button>
                            <button
                                className="btn"
                                disabled={!canNext}
                                onClick={() => setOffset(Math.max(0, (pages - 1) * limit))}
                                title="Letzte Seite"
                                aria-label="Letzte Seite"
                                style={!canNext ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: 'scaleX(-1)' }}>
                                    <polyline points="11 17 6 12 11 7" />
                                    <polyline points="18 17 13 12 18 7" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* Due date range modal for Invoices */}
            <TimeFilterModal
                open={showDueFilter}
                onClose={() => setShowDueFilter(false)}
                yearsAvail={yearsAvail}
                from={dueFrom}
                to={dueTo}
                onApply={({ from: nf, to: nt }) => { setDueFrom(nf); setDueTo(nt); setOffset(0) }}
            />

            {/* Add payment modal */}
            {showPayModal && (
                <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setShowPayModal(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ display: 'grid', gap: 10, maxWidth: 420 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ margin: 0 }}>Zahlung hinzufügen</h2>
                            <button className="btn ghost" onClick={() => setShowPayModal(null)}>✕</button>
                        </div>
                        <div className="helper">{showPayModal.invoiceNo ? `Rechnung ${showPayModal.invoiceNo}` : `Rechnung #${showPayModal.id}`} · {showPayModal.party || ''}</div>
                        {typeof showPayModal.remaining === 'number' && (
                            <div className="helper">Offener Rest: <strong>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Math.max(0, Math.round(showPayModal.remaining * 100) / 100))}</strong></div>
                        )}
                        <div className="row">
                            <div className="field">
                                <label>Datum</label>
                                <input className="input" type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
                            </div>
                            <div className="field">
                                <label>Betrag (EUR)</label>
                                <input className="input" type="text" inputMode="decimal" value={payAmount} onChange={e => setPayAmount(e.target.value)} onBlur={() => {
                                    if (!showPayModal) return
                                    const cap = typeof showPayModal.remaining === 'number' ? Math.max(0, Math.round(showPayModal.remaining * 100) / 100) : undefined
                                    const v = Number(String(payAmount || '').replace(',', '.'))
                                    if (isFinite(v) && cap != null && v - cap > 1e-6) setPayAmount(String(cap))
                                }} placeholder="z. B. 199,90" />
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button className="btn" onClick={() => setShowPayModal(null)}>Abbrechen</button>
                            <button className="btn primary" disabled={busyAction} onClick={addPayment}>Speichern</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete confirm */}
            {deleteConfirm && (
                <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setDeleteConfirm(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ margin: 0 }}>Rechnung löschen</h2>
                            <button className="btn ghost" onClick={() => setDeleteConfirm(null)}>✕</button>
                        </div>
                        <div>
                            Diese Rechnung wirklich löschen?
                            <div className="helper">{deleteConfirm.invoiceNo ? `Nr. ${deleteConfirm.invoiceNo}` : `#${deleteConfirm.id}`} · {deleteConfirm.party || ''}</div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button className="btn" onClick={() => setDeleteConfirm(null)}>Abbrechen</button>
                            <button className="btn danger" disabled={busyAction} onClick={() => deleteInvoice(deleteConfirm.id)}>Ja, löschen</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create/Edit Invoice modal (redesigned) */}
            {form && createPortal(
                <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setForm(null)}>
                    <div className="modal invoice-modal" onClick={e => e.stopPropagation()} style={{ display: 'grid', gap: 10, width: 'min(1100px, 96vw)', maxHeight: '90vh', overflow: 'auto' }}>
                        {/* Header with date pill, title, status and smart summary */}
                        <div className="card" style={{ padding: 10, display: 'grid', gap: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                    <h2 style={{ margin: 0 }}>{form.mode === 'create' ? 'Rechnung anlegen' : 'Rechnung bearbeiten'}</h2>
                                    <div className="badge" title="Rechnungsdatum" style={{ padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <input aria-label="Datum" className="input" type="date" value={form.draft.date} onChange={e => setForm(f => f && ({ ...f, draft: { ...f.draft, date: e.target.value } }))} style={{ height: 26, padding: '2px 6px' }} />
                                        <span className="required-asterisk" aria-hidden="true">*</span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    {(() => { const missing: string[] = []; if (!form.draft.date) missing.push('Datum'); if (!form.draft.party?.trim()) missing.push('Partei'); const a = parseAmount(form.draft.grossAmount); if (a == null || a <= 0) missing.push('Betrag'); return missing.length ? (
                                        <span className="helper" style={{ whiteSpace: 'nowrap' }}>Fehlende Felder: {missing.join(', ')}</span>
                                    ) : null })()}
                                    {form.mode === 'edit' && form.sourceRow?.status && <span className="badge" title="Zahlstatus">{String(form.sourceRow.status)}</span>}
                                    <button className="btn ghost" onClick={() => setForm(null)} aria-label="Schließen">✕</button>
                                </div>
                            </div>
                            {/* Smart summary strip */}
                            <div className="helper" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                <span>Buchungstyp: <strong style={{ color: form.draft.voucherType === 'IN' ? 'var(--success)' : 'var(--danger)' }}>{form.draft.voucherType}</strong></span>
                                <span>Betrag: <strong>{(() => { const a = parseAmount(form.draft.grossAmount); return a != null && a > 0 ? eurFmt.format(a) : '—' })()}</strong></span>
                                <span>Fällig: <strong>{form.draft.dueDate || '—'}</strong></span>
                                <span>Zahlweg: <strong>{form.draft.paymentMethod || '—'}</strong></span>
                                <span>Sphäre: <strong>{form.draft.sphere}</strong></span>
                            </div>
                        </div>

                        {formError && <div style={{ color: 'var(--danger)' }}>{formError}</div>}

                        {/* 60/40 split */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 3fr) minmax(320px, 2fr)', gap: 12 }}>
                            {/* Left column: core fields */}
                            <div className="card" style={{ padding: 12, display: 'grid', gap: 10 }}>
                                <div className="field">
                                    <label>Rechnungsnummer</label>
                                    <input className="input" value={form.draft.invoiceNo || ''} onChange={e => setForm(f => f && ({ ...f, draft: { ...f.draft, invoiceNo: e.target.value } }))} placeholder="z. B. 2025-001" />
                                </div>
                                <div className="field">
                                    <label>Partei<span className="required-asterisk" aria-hidden="true">*</span></label>
                                    <input className="input party-input" list="party-suggestions" value={form.draft.party} onChange={e => setForm(f => f && ({ ...f, draft: { ...f.draft, party: e.target.value } }))} placeholder="Name der Partei" />
                                    {/* datalist placed later */}
                                </div>
                                <div className="field">
                                    <label>Beschreibung</label>
                                    <input className="input" list="desc-suggestions" value={form.draft.description || ''} onChange={e => setForm(f => f && ({ ...f, draft: { ...f.draft, description: e.target.value } }))} placeholder="Kurzbeschreibung" />
                                </div>
                                <div className="field">
                                    <label>Betrag (EUR)<span className="required-asterisk" aria-hidden="true">*</span></label>
                                    <input className="input amount-input" inputMode="decimal" placeholder="z. B. 199,90" value={form.draft.grossAmount} onChange={e => setForm(f => f && ({ ...f, draft: { ...f.draft, grossAmount: e.target.value } }))} style={{ fontSize: 24, paddingTop: 10, paddingBottom: 10 }} />
                                    <div className="helper">{(() => { const a = parseAmount(form.draft.grossAmount); return a != null && a > 0 ? eurFmt.format(a) : 'Bitte Betrag eingeben' })()}</div>
                                </div>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    <div className="field" style={{ minWidth: 160 }}>
                                        <label>Fällig</label>
                                        <input className="input" type="date" value={form.draft.dueDate || ''} onChange={e => setForm(f => f && ({ ...f, draft: { ...f.draft, dueDate: e.target.value || null } }))} style={{ minWidth: 0 }} />
                                    </div>
                                    <div className="field" style={{ minWidth: 160 }}>
                                        <label>Zahlweg</label>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button type="button" className="btn" style={{ width: 56, justifyContent: 'center', background: !form.draft.paymentMethod ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }} onClick={() => setForm(f => f && ({ ...f, draft: { ...f.draft, paymentMethod: '' } }))} title="Kein Zahlweg">—</button>
                                            <button type="button" className="btn" style={{ width: 80, justifyContent: 'center', background: form.draft.paymentMethod === 'BAR' ? 'color-mix(in oklab, var(--accent) 25%, transparent)' : undefined }} onClick={() => setForm(f => f && ({ ...f, draft: { ...f.draft, paymentMethod: 'BAR' } }))} title="Bar">💵 Bar</button>
                                            <button type="button" className="btn" style={{ width: 80, justifyContent: 'center', background: form.draft.paymentMethod === 'BANK' ? 'color-mix(in oklab, var(--accent) 25%, transparent)' : undefined }} onClick={() => setForm(f => f && ({ ...f, draft: { ...f.draft, paymentMethod: 'BANK' } }))} title="Bank">🏦 Bank</button>
                                        </div>
                                    </div>
                                    <div className="field" style={{ minWidth: 180 }}>
                                        <label>Buchungstyp</label>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button type="button" className="btn" style={{ width: 80, justifyContent: 'center', background: form.draft.voucherType === 'IN' ? 'color-mix(in oklab, var(--success) 25%, transparent)' : undefined }} onClick={() => setForm(f => f && ({ ...f, draft: { ...f.draft, voucherType: 'IN' } }))}>IN</button>
                                            <button type="button" className="btn" style={{ width: 80, justifyContent: 'center', background: form.draft.voucherType === 'OUT' ? 'color-mix(in oklab, var(--danger) 25%, transparent)' : undefined }} onClick={() => setForm(f => f && ({ ...f, draft: { ...f.draft, voucherType: 'OUT' } }))}>OUT</button>
                                        </div>
                                    </div>
                                </div>

                                <TagsEditor label="Tags" value={form.draft.tags} onChange={tags => setForm(f => f && ({ ...f, draft: { ...f.draft, tags } }))} tagDefs={tags} className="tags-editor" />
                            </div>

                            {/* Right column: meta and files */}
                            <div className="card" style={{ padding: 12, display: 'grid', gap: 10 }}>
                                <div className="field">
                                    <label>Sphäre <span className="helper">(Steuerlicher Bereich)</span></label>
                                    <select className="input" value={form.draft.sphere} onChange={e => setForm(f => f && ({ ...f, draft: { ...f.draft, sphere: e.target.value as any } }))}>
                                        <option value="IDEELL">IDEELL</option>
                                        <option value="ZWECK">ZWECK</option>
                                        <option value="VERMOEGEN">VERMÖGEN</option>
                                        <option value="WGB">WGB</option>
                                    </select>
                                </div>
                                <div className="field">
                                    <label>Zweckbindung</label>
                                    <select className="input" value={(form.draft.earmarkId ?? '') as any} onChange={e => setForm(f => f && ({ ...f, draft: { ...f.draft, earmarkId: e.target.value ? Number(e.target.value) : '' } }))}>
                                        <option value="">—</option>
                                        {earmarks.map(em => (
                                            <option key={em.id} value={em.id}>{em.code} – {em.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="field">
                                    <label>Budget <span className="helper">(optional)</span></label>
                                    <select className="input" value={(form.draft.budgetId ?? '') as any} onChange={e => setForm(f => f && ({ ...f, draft: { ...f.draft, budgetId: e.target.value ? Number(e.target.value) : '' } }))}>
                                        <option value="">—</option>
                                        {budgets.map(b => (
                                            <option key={b.id} value={b.id}>{b.year}{b.name ? ` – ${b.name}` : ''}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="field">
                                    <label>Auto-Buchung</label>
                                    <select className="input" value={form.draft.autoPost ? '1' : '0'} onChange={e => setForm(f => f && ({ ...f, draft: { ...f.draft, autoPost: e.target.value === '1' } }))}>
                                        <option value="1">Ja</option>
                                        <option value="0">Nein</option>
                                    </select>
                                </div>

                                {form.mode === 'create' && (
                                    <div className="field">
                                        <label>Dateien</label>
                                        <div
                                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                                            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const fl = e.dataTransfer?.files; if (fl && fl.length) setFormFiles(prev => [...prev, ...Array.from(fl)]) }}
                                            className="card"
                                            style={{ padding: 10, border: '1px dashed var(--muted)', background: 'color-mix(in oklab, var(--accent) 10%, transparent)' }}
                                        >
                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                                <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={e => { const f = Array.from(e.target.files || []); if (f.length) setFormFiles(prev => [...prev, ...f]); if (fileInputRef.current) fileInputRef.current.value = '' }} />
                                                <button className="btn" onClick={() => fileInputRef.current?.click()}>+ Dateien auswählen</button>
                                                <span className="helper">oder hierher ziehen</span>
                                            </div>
                                            {formFiles.length > 0 && (
                                                <table cellPadding={6} style={{ width: '100%', marginTop: 6 }}>
                                                    <thead><tr><th align="left">Datei</th><th align="right">Größe</th><th align="center">Aktion</th></tr></thead>
                                                    <tbody>
                                                        {formFiles.map((f, i) => (
                                                            <tr key={i}>
                                                                <td>{f.name}</td>
                                                                <td align="right">{f.size} B</td>
                                                                <td align="center"><button className="btn danger" onClick={() => removeFileAt(i)}>Entfernen</button></td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {form.mode === 'edit' && (
                                    <div className="field">
                                        <label>Dateien</label>
                                        <div
                                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                                            onDrop={async (e) => {
                                                e.preventDefault(); e.stopPropagation()
                                                const fl = e.dataTransfer?.files
                                                if (fl && fl.length && (form.draft as any).id) {
                                                    for (const f of Array.from(fl)) {
                                                        const buf = await f.arrayBuffer()
                                                        let binary = ''
                                                        const bytes = new Uint8Array(buf)
                                                        const chunk = 0x8000
                                                        for (let i = 0; i < bytes.length; i += chunk) { binary += String.fromCharCode.apply(null as any, bytes.subarray(i, i + chunk) as any) }
                                                        const dataBase64 = btoa(binary)
                                                        await window.api?.invoiceFiles?.add?.({ invoiceId: (form.draft as any).id, fileName: f.name, dataBase64, mimeType: (f as any).type || undefined })
                                                    }
                                                    const res = await window.api?.invoiceFiles?.list?.({ invoiceId: (form.draft as any).id })
                                                    setEditInvoiceFiles(res?.files || [])
                                                }
                                            }}
                                            className="card"
                                            style={{ padding: 10, border: '1px dashed var(--muted)', background: 'color-mix(in oklab, var(--accent) 10%, transparent)' }}
                                        >
                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                                <input ref={editInvoiceFileInputRef} type="file" multiple hidden onChange={async (e) => {
                                                    const files = Array.from(e.target.files || [])
                                                    try {
                                                        if (files.length && (form.draft as any).id) {
                                                            for (const f of files) {
                                                                const buf = await f.arrayBuffer()
                                                                let binary = ''
                                                                const bytes = new Uint8Array(buf)
                                                                const chunk = 0x8000
                                                                for (let i = 0; i < bytes.length; i += chunk) { binary += String.fromCharCode.apply(null as any, bytes.subarray(i, i + chunk) as any) }
                                                                const dataBase64 = btoa(binary)
                                                                await window.api?.invoiceFiles?.add?.({ invoiceId: (form.draft as any).id, fileName: f.name, dataBase64, mimeType: (f as any).type || undefined })
                                                            }
                                                            const res = await window.api?.invoiceFiles?.list?.({ invoiceId: (form.draft as any).id })
                                                            setEditInvoiceFiles(res?.files || [])
                                                        }
                                                    } finally { if (editInvoiceFileInputRef.current) editInvoiceFileInputRef.current.value = '' }
                                                }} />
                                                <button className="btn" onClick={() => editInvoiceFileInputRef.current?.click?.()}>+ Dateien auswählen</button>
                                                <span className="helper">oder hierher ziehen</span>
                                            </div>
                                            <table cellPadding={6} style={{ width: '100%', marginTop: 6 }}>
                                                <thead><tr><th align="left">Datei</th><th align="right">Größe</th><th align="center">Aktion</th></tr></thead>
                                                <tbody>
                                                    {(editInvoiceFiles || []).map((f) => (
                                                        <tr key={f.id}>
                                                            <td>{f.fileName}</td>
                                                            <td align="right">{f.size != null ? `${f.size} B` : '—'}</td>
                                                            <td align="center"><button className="btn danger" onClick={async () => {
                                                                try { await window.api?.invoiceFiles?.delete?.({ fileId: f.id }); const res = await window.api?.invoiceFiles?.list?.({ invoiceId: (form.draft as any).id }); setEditInvoiceFiles(res?.files || []) } catch (e: any) { alert(e?.message || String(e)) }
                                                            }}>Entfernen</button></td>
                                                        </tr>
                                                    ))}
                                                    {(editInvoiceFiles || []).length === 0 && <tr><td colSpan={3} className="helper">Keine Dateien.</td></tr>}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer with inline validation summary */}
                        {(() => {
                            const missing: string[] = []
                            if (!form.draft.date) missing.push('Datum')
                            if (!form.draft.party?.trim()) missing.push('Partei')
                            const a = parseAmount(form.draft.grossAmount)
                            if (a == null || a <= 0) missing.push('Betrag')
                            return (
                                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
                                    <button className="btn" onClick={() => setForm(null)}>Abbrechen (Esc)</button>
                                    <button className="btn primary" onClick={saveForm} disabled={missing.length > 0}>Speichern (Enter)</button>
                                </div>
                            )
                        })()}
                        {/* Datalists */}
                        <datalist id="party-suggestions">
                            {partySuggestions.map((p, i) => <option key={i} value={p} />)}
                        </datalist>
                        <datalist id="desc-suggestions">
                            {descSuggestions.map((p, i) => <option key={i} value={p} />)}
                        </datalist>
                    </div>
                </div>, document.body)
            }

            {/* Details modal */}
            {detailId != null && (
                <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => { setDetailId(null); setDetail(null) }}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ display: 'grid', gap: 10, maxWidth: 760 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                            <h2 style={{ margin: 0 }}>Rechnung {detail?.invoiceNo ? `#${detail.invoiceNo}` : (detail ? `#${detail.id}` : '')}</h2>
                            <div style={{ display: 'flex', gap: 6 }}>
                                {detail && <button className="btn" onClick={() => { const d = detail as any; setDetailId(null); setDetail(null); setTimeout(() => openEdit(d), 0) }}>✎ Bearbeiten</button>}
                                <button className="btn ghost" onClick={() => { setDetailId(null); setDetail(null) }}>✕</button>
                            </div>
                        </div>
                        {loadingDetail && <div className="helper">Lade Details…</div>}
                        {!loadingDetail && detail && (
                            <div style={{ display: 'grid', gap: 12 }}>
                                <div className="card" style={{ padding: 12 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                        <div style={{ display: 'grid', gap: 4 }}>
                                            <div style={{ fontWeight: 600 }}>{detail.party}</div>
                                            <div className="helper">{detail.description || '—'}</div>
                                        </div>
                                        <div>{statusBadge(detail.status)}</div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginTop: 8 }}>
                                        <div><div className="helper">Datum</div><div>{fmtDateLocal(detail.date)}</div></div>
                                        <div><div className="helper">Fällig</div><div>{fmtDateLocal(detail.dueDate || '')}</div></div>
                                        <div><div className="helper">Sphäre</div><div>{detail.sphere}</div></div>
                                        <div><div className="helper">Zahlweg</div><div>{detail.paymentMethod || '—'}</div></div>
                                        <div><div className="helper">Betrag</div><div>{eurFmt.format(detail.grossAmount)}</div></div>
                                        <div><div className="helper">Bezahlt</div><div>{eurFmt.format(detail.paidSum || 0)}</div></div>
                                        <div><div className="helper">Rest</div><div style={{ color: Math.max(0, Math.round((detail.grossAmount - (detail.paidSum || 0)) * 100) / 100) > 0 ? 'var(--danger)' : 'var(--success)' }}>{eurFmt.format(Math.max(0, Math.round((detail.grossAmount - (detail.paidSum || 0)) * 100) / 100))}</div></div>
                                        <div><div className="helper">Auto-Buchung</div><div>{(detail.autoPost ?? 0) ? 'ja' : 'nein'}</div></div>
                                        <div><div className="helper">Buchungstyp</div><div>{detail.voucherType}</div></div>
                                        <div>
                                            <div className="helper">Verknüpfte Buchung</div>
                                            <div>
                                                {(detail.postedVoucherNo || detail.postedVoucherId) ? (
                                                    <button className="chip" title="Zur Buchung springen" onClick={() => {
                                                        const q = detail.postedVoucherNo || ''
                                                        if (q) {
                                                            try { window.dispatchEvent(new CustomEvent('apply-voucher-jump', { detail: { q } })) } catch {}
                                                        } else if (detail.postedVoucherId) {
                                                            try { window.dispatchEvent(new CustomEvent('apply-voucher-jump', { detail: { voucherId: detail.postedVoucherId } })) } catch {}
                                                        }
                                                        setDetailId(null); setDetail(null)
                                                    }} style={{ color: '#fff' }}>{detail.postedVoucherNo ? detail.postedVoucherNo : `#${detail.postedVoucherId}`}</button>
                                                ) : '—'}
                                            </div>
                                        </div>
                                    </div>
                                    {(detail.tags || []).length > 0 && (
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                                            {(detail.tags || []).map(t => {
                                                const def = (tags || []).find(td => (td.name || '').toLowerCase() === (t || '').toLowerCase())
                                                const bg = def?.color || undefined
                                                const fg = bg ? contrastText(bg) : undefined
                                                return (
                                                    <button key={t} className="chip" onClick={() => { setTag(t); setOffset(0) }} title={`Nach Tag "${t}" filtern`} style={bg ? { background: bg, color: fg, borderColor: bg } : undefined}>{t}</button>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div className="card" style={{ padding: 12 }}>
                                        <strong>Zahlungen</strong>
                                        <table cellPadding={6} style={{ width: '100%', marginTop: 6 }}>
                                            <thead><tr><th align="left">Datum</th><th align="right">Betrag</th></tr></thead>
                                            <tbody>
                                                {(detail.payments || []).map(p => (
                                                    <tr key={p.id}><td>{fmtDateLocal(p.date)}</td><td align="right">{eurFmt.format(p.amount)}</td></tr>
                                                ))}
                                                {detail.payments.length === 0 && <tr><td colSpan={2} className="helper">Keine Zahlungen.</td></tr>}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="card" style={{ padding: 12 }}>
                                        <strong>Dateien</strong>
                                        <table cellPadding={6} style={{ width: '100%', marginTop: 6 }}>
                                            <thead><tr><th align="left">Datei</th><th align="right">Größe</th><th align="left">Datum</th><th align="center">Aktion</th></tr></thead>
                                            <tbody>
                                                {(detail.files || []).map(f => (
                                                    <tr key={f.id}>
                                                        <td>{f.fileName}</td>
                                                        <td align="right">{f.size != null ? `${f.size} B` : '—'}</td>
                                                        <td>{f.createdAt || '—'}</td>
                                                        <td align="center" style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                                                            <button className="btn" title="Datei öffnen" onClick={async () => {
                                                                try {
                                                                    const res = await window.api?.invoiceFiles?.open?.({ fileId: f.id })
                                                                    if (!res?.ok) alert('Datei konnte nicht geöffnet werden')
                                                                } catch (e: any) {
                                                                    alert(e?.message || String(e))
                                                                }
                                                            }}>Öffnen</button>
                                                            <button className="btn" title="Speichern unter …" onClick={async () => {
                                                                try {
                                                                    const res = await window.api?.invoiceFiles?.saveAs?.({ fileId: f.id })
                                                                    if (res?.filePath) alert(`Gespeichert: ${res.filePath}`)
                                                                } catch (e: any) {
                                                                    const msg = e?.message || String(e)
                                                                    if (!/Abbruch/i.test(msg)) alert(msg)
                                                                }
                                                            }}>Speichern…</button>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {detail.files.length === 0 && <tr><td colSpan={4} className="helper">Keine Dateien.</td></tr>}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                    <button className="btn" onClick={() => { setDetailId(null); setDetail(null) }}>Schließen</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

// Quick-Add state and logic
type QA = {
    date: string
    type: 'IN' | 'OUT' | 'TRANSFER'
    sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
    netAmount?: number
    grossAmount?: number
    vatRate: number
    description: string
    paymentMethod?: 'BAR' | 'BANK'
    mode?: 'NET' | 'GROSS'
    tags?: string[]
}

function useQuickAdd(today: string, create: (p: any) => Promise<any>, onOpenFilePicker?: () => void) {
    const [quickAdd, setQuickAdd] = useState(false)
    const [qa, setQa] = useState<QA>({ date: today, type: 'IN', sphere: 'IDEELL', grossAmount: 100, vatRate: 19, description: '', paymentMethod: 'BAR', mode: 'GROSS' })
    const [files, setFiles] = useState<File[]>([])

    function onDropFiles(fileList: FileList | null) {
        if (!fileList) return
        const arr = Array.from(fileList)
        setFiles((prev) => [...prev, ...arr])
    }

    async function onQuickSave() {
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
        if (qa.mode === 'GROSS') payload.grossAmount = qa.grossAmount ?? 0
        else payload.netAmount = qa.netAmount ?? 0
        if (typeof (qa as any).earmarkId === 'number') payload.earmarkId = (qa as any).earmarkId
        if (typeof (qa as any).budgetId === 'number') payload.budgetId = (qa as any).budgetId
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
            setQa({ date: today, type: 'IN', sphere: 'IDEELL', grossAmount: 100, vatRate: 19, description: '', paymentMethod: 'BAR', mode: 'GROSS' })
        }
    }

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            const target = e.target as HTMLElement | null
            const tag = (target?.tagName || '').toLowerCase()
            const inEditable = !!(target && ((target as any).isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select'))

            // Search focus (Ctrl+K) only when on Buchungen and not in another input
            if (!inEditable && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                try { const page = localStorage.getItem('activePage') || 'Buchungen'; if (page === 'Buchungen') { (document.querySelector('input[placeholder^="Suche Buchungen"]') as HTMLInputElement | null)?.focus(); e.preventDefault(); return } } catch { }
            }

            // Open Quick-Add robustly via Ctrl+Shift+N (no bare 'n')
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
                setQuickAdd(true); e.preventDefault(); return
            }

            // Save and Upload hotkeys only when Quick-Add is open
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { if (quickAdd) { onQuickSave(); e.preventDefault() } return }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') { if (quickAdd) { onOpenFilePicker?.(); e.preventDefault() } return }
            if (e.key === 'Escape') { if (quickAdd) { setQuickAdd(false); e.preventDefault() } return }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [qa, files, quickAdd])

    const openFilePicker = () => onOpenFilePicker?.()

    return { quickAdd, setQuickAdd, qa, setQa, onQuickSave, files, setFiles, openFilePicker, onDropFiles }
}

function TagsEditor({ label, value, onChange, tagDefs, className }: { label?: string; value: string[]; onChange: (v: string[]) => void; tagDefs: Array<{ id: number; name: string; color?: string | null }>; className?: string }) {
    const [input, setInput] = useState('')
    const [focused, setFocused] = useState(false)
    const sugg = useMemo(() => {
        const q = input.trim().toLowerCase()
        const existing = new Set((value || []).map(v => v.toLowerCase()))
        return (tagDefs || []).filter(t => !existing.has((t.name || '').toLowerCase()) && (!q || t.name.toLowerCase().includes(q))).slice(0, 8)
    }, [input, tagDefs, value])
    function addTag(name: string) {
        const n = (name || '').trim()
        if (!n) return
        if (!(value || []).includes(n)) onChange([...(value || []), n])
        setInput('')
    }
    function removeTag(name: string) {
        onChange((value || []).filter(v => v !== name))
    }
    const colorFor = (name: string) => (tagDefs || []).find(t => (t.name || '').toLowerCase() === (name || '').toLowerCase())?.color
    return (
        <div className={`field ${className || ''}`.trim()} style={{ gridColumn: '1 / span 2' }}>
            {label && <label>{label}</label>}
            <div className="input" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', minHeight: 34 }}>
                {(value || []).map((t) => {
                    const bg = colorFor(t) || undefined
                    const fg = contrastText(bg)
                    return (
                        <span key={t} className="chip" style={{ background: bg, color: bg ? fg : undefined }}>
                            {t}
                            <button className="chip-x" onClick={() => removeTag(t)} aria-label={`Tag ${t} entfernen`} type="button">×</button>
                        </span>
                    )
                })}
                {/* Quick add via dropdown */}
                <select
                    className="input"
                    value=""
                    onChange={(e) => { const name = e.target.value; if (name) addTag(name) }}
                    style={{ minWidth: 140 }}
                    title="Tag aus Liste hinzufügen"
                >
                    <option value="">+ Tag auswählen…</option>
                    {(tagDefs || []).filter(t => !(value || []).some(v => v.toLowerCase() === (t.name || '').toLowerCase())).map(t => (
                        <option key={t.id} value={t.name}>{t.name}</option>
                    ))}
                </select>
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(input) }
                        if (e.key === 'Backspace' && !input && (value || []).length) { removeTag((value || [])[value.length - 1]) }
                    }}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    placeholder={(value || []).length ? '' : 'Tag hinzufügen…'}
                    style={{ flex: 1, minWidth: 120, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)' }}
                />
            </div>
            {focused && sugg.length > 0 && (
                <div className="card" style={{ padding: 6, marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {sugg.map(s => {
                        const bg = s.color || undefined
                        const fg = contrastText(bg)
                        return <button key={s.id} type="button" className="btn" style={{ background: bg, color: bg ? fg : undefined }} onClick={() => addTag(s.name)}>{s.name}</button>
                    })}
                </div>
            )}
        </div>
    )
}

// Lightweight totals bar for current filters
function FilterTotals({ refreshKey, from, to, paymentMethod, sphere, type, earmarkId, q, tag }: { refreshKey?: number; from?: string; to?: string; paymentMethod?: 'BAR' | 'BANK'; sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; type?: 'IN' | 'OUT' | 'TRANSFER'; earmarkId?: number; q?: string; tag?: string }) {
    const [loading, setLoading] = useState(false)
    const [values, setValues] = useState<{ inGross: number; outGross: number; diff: number } | null>(null)
    useEffect(() => {
        let alive = true
        async function run() {
            setLoading(true)
            try {
                const res = await window.api?.reports.summary?.({ from, to, paymentMethod, sphere, type, earmarkId, q, tag })
                if (alive && res) {
                    const t = res.byType || []
                    const inGross = t.find(x => x.key === 'IN')?.gross || 0
                    const outGrossRaw = t.find(x => x.key === 'OUT')?.gross || 0
                    const outGross = Math.abs(outGrossRaw)
                    const diff = Math.round((inGross - outGross) * 100) / 100
                    setValues({ inGross, outGross, diff })
                }
            } finally {
                if (alive) setLoading(false)
            }
        }
        run()
        return () => { alive = false }
    }, [from, to, paymentMethod, sphere, type, earmarkId, q, tag, refreshKey])
    const fmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
    if (!values && !loading) return null
    return (
        <div className="card" style={{ padding: 8, marginBottom: 8, display: 'flex', gap: 16, alignItems: 'center' }}>
            <strong>Summe der Filterung:</strong>
            <span style={{ color: 'var(--success)' }}>IN: {fmt.format(values?.inGross ?? 0)}</span>
            <span style={{ color: 'var(--danger)' }}>OUT: {fmt.format(values?.outGross ?? 0)}</span>
            <span style={{ color: ((values?.diff ?? 0) >= 0) ? 'var(--success)' : 'var(--danger)' }}>Differenz: {fmt.format(values?.diff ?? 0)}</span>
        </div>
    )
}

function EarmarkUsageCards({ bindings, from, to, sphere, onEdit }: { bindings: Array<{ id: number; code: string; name: string; color?: string | null; budget?: number | null }>; from?: string; to?: string; sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; onEdit?: (b: any) => void }) {
    const [usage, setUsage] = useState<Record<number, { allocated: number; released: number; balance: number; budget: number; remaining: number }>>({})
    useEffect(() => {
        let alive = true
        async function run() {
            const res: Record<number, { allocated: number; released: number; balance: number; budget: number; remaining: number }> = {}
            for (const b of bindings) {
                const u = await window.api?.bindings.usage?.({ earmarkId: b.id, from, to, sphere })
                if (u) res[b.id] = u as any
            }
            if (alive) setUsage(res)
        }
        run()
        return () => { alive = false }
    }, [bindings, from, to, sphere])
    const fmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
    if (!bindings.length) return null
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, marginTop: 12 }}>
            {bindings.map(b => {
                const u = usage[b.id]
                const bg = b.color || undefined
                const fg = contrastText(bg)
                const planned = Math.max(0, u?.budget ?? 0)
                const expenses = Math.max(0, u?.released ?? 0)
                const income = Math.max(0, u?.allocated ?? 0)
                const rest = planned - expenses + income
                const title = `${b.code} – ${b.name}`
                return (
                    <div key={b.id} className="card" style={{ padding: 10, borderTop: bg ? `4px solid ${bg}` : undefined }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                            <span className="badge" style={{ background: bg, color: fg }}>{b.code}</span>
                            <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={title}>{b.name}</span>
                        </div>
                        <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                            <div>
                                <div className="helper">Geplant</div>
                                <div>{fmt.format(planned)}</div>
                            </div>
                            <div>
                                <div className="helper">Ausgaben</div>
                                <div style={{ color: 'var(--danger)' }}>{fmt.format(expenses)}</div>
                            </div>
                            <div>
                                <div className="helper">Einnahmen</div>
                                <div style={{ color: 'var(--success)' }}>{fmt.format(income)}</div>
                            </div>
                            <div>
                                <div className="helper">Rest</div>
                                <div style={{ color: rest >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmt.format(rest)}</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 8 }}>
                            <button className="btn ghost" onClick={() => { const ev = new CustomEvent('apply-earmark-filter', { detail: { earmarkId: b.id } }); window.dispatchEvent(ev) }}>Zu Buchungen</button>
                            <button className="btn" onClick={() => onEdit?.(b)}>✎ Bearbeiten</button>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

function BudgetTiles({ budgets, eurFmt, onEdit }: { budgets: Array<{ id: number; year: number; name?: string | null; categoryName?: string | null; projectName?: string | null; amountPlanned: number; color?: string | null; startDate?: string | null; endDate?: string | null; sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; categoryId?: number | null; projectId?: number | null; earmarkId?: number | null }>; eurFmt: Intl.NumberFormat; onEdit: (b: any) => void }) {
    const [usage, setUsage] = useState<Record<number, { spent: number; inflow: number; count: number; lastDate: string | null }>>({})
    useEffect(() => {
        let alive = true
        async function run() {
            const res: Record<number, { spent: number; inflow: number; count: number; lastDate: string | null }> = {}
            for (const b of budgets) {
                try {
                    const u = await window.api?.budgets.usage?.({ budgetId: b.id })
                    if (!alive) return
                    res[b.id] = u || { spent: 0, inflow: 0, count: 0, lastDate: null }
                } catch {
                    if (!alive) return
                    res[b.id] = { spent: 0, inflow: 0, count: 0, lastDate: null }
                }
            }
            if (alive) setUsage(res)
        }
        run()
        return () => { alive = false }
    }, [budgets])

    if (!budgets.length) return null
    return (
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {budgets.map((b) => {
                    const bg = b.color || undefined
                    const fg = contrastText(bg)
                    const plan = b.amountPlanned || 0
                    const spent = Math.max(0, usage[b.id]?.spent || 0)
                    const inflow = Math.max(0, usage[b.id]?.inflow || 0)
                    const remaining = plan - spent
                    const pct = plan > 0 ? Math.min(100, Math.max(0, Math.round((spent / plan) * 100))) : 0
                    const title = (b.name && b.name.trim()) || b.categoryName || b.projectName || `Budget ${b.year}`
                    return (
                        <div key={b.id} className="card" style={{ padding: 10, borderTop: bg ? `4px solid ${bg}` : undefined }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                                <span className="badge" style={{ background: bg, color: fg }}>{b.year}</span>
                                <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={title}>{title}</span>
                            </div>
                            <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                                <div>
                                    <div className="helper">Geplant</div>
                                    <div>{eurFmt.format(plan)}</div>
                                </div>
                                <div>
                                    <div className="helper">Ausgaben</div>
                                    <div style={{ color: 'var(--danger)' }}>{eurFmt.format(spent)}</div>
                                </div>
                                <div>
                                    <div className="helper">Einnahmen (Budget)</div>
                                    <div style={{ color: 'var(--success)' }}>{eurFmt.format(inflow)}</div>
                                </div>
                                <div>
                                    <div className="helper">Rest</div>
                                    <div style={{ color: remaining >= 0 ? 'var(--success)' : 'var(--danger)' }}>{eurFmt.format(remaining)}</div>
                                </div>
                                <div>
                                    <div className="helper">Buchungen</div>
                                    <div>{usage[b.id]?.count ?? 0}{usage[b.id]?.lastDate ? ` · bis ${usage[b.id]?.lastDate}` : ''}</div>
                                </div>
                                <div>
                                    <div className="helper">Fortschritt</div>
                                    <div style={{ height: 10, background: 'color-mix(in oklab, var(--accent) 15%, transparent)', borderRadius: 6, position: 'relative' }} aria-label={`Verbrauch ${pct}%`} title={`${pct}%`}>
                                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: bg || 'var(--accent)', borderRadius: 6 }} />
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 8 }}>
                                <button className="btn ghost" onClick={() => {
                                    // Jump to Buchungen for this budget's year and apply a precise budget filter
                                    const y = b.year
                                    const from = new Date(Date.UTC(y, 0, 1)).toISOString().slice(0, 10)
                                    const to = new Date(Date.UTC(y, 11, 31)).toISOString().slice(0, 10)
                                    const ev = new CustomEvent('apply-budget-jump', { detail: { from, to, budgetId: b.id } })
                                    window.dispatchEvent(ev)
                                }}>Zu Buchungen</button>
                                <button className="btn" onClick={() => onEdit(b)}>✎ Bearbeiten</button>
                            </div>
                        </div>
                    )
            })}
        </div>
    )
}

function ReportsSummary(props: { refreshKey?: number; from?: string; to?: string; sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; type?: 'IN' | 'OUT' | 'TRANSFER'; paymentMethod?: 'BAR' | 'BANK' }) {
    const [loading, setLoading] = useState(false)
    const [data, setData] = useState<null | {
        totals: { net: number; vat: number; gross: number }
        bySphere: Array<{ key: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; net: number; vat: number; gross: number }>
        byPaymentMethod: Array<{ key: 'BAR' | 'BANK' | null; net: number; vat: number; gross: number }>
        byType: Array<{ key: 'IN' | 'OUT' | 'TRANSFER'; net: number; vat: number; gross: number }>
    }>(null)
    const [monthsCount, setMonthsCount] = useState<number>(0)
    const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
    useEffect(() => {
        let cancelled = false
        setLoading(true)
        window.api?.reports.summary?.({ from: props.from, to: props.to, sphere: props.sphere, type: props.type, paymentMethod: props.paymentMethod })
            .then((res) => { if (!cancelled) setData(res) })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [props.from, props.to, props.sphere, props.type, props.paymentMethod, props.refreshKey])

    // Derive number of distinct months in range to compute averages (Ø Netto/Monat)
    useEffect(() => {
        let cancelled = false
        Promise.all([
            window.api?.reports.monthly?.({ from: props.from, to: props.to, sphere: props.sphere, type: 'IN', paymentMethod: props.paymentMethod }),
            window.api?.reports.monthly?.({ from: props.from, to: props.to, sphere: props.sphere, type: 'OUT', paymentMethod: props.paymentMethod })
        ]).then(([inRes, outRes]) => {
            if (cancelled) return
            const months = new Set<string>()
            for (const b of (inRes?.buckets || [])) months.add(b.month)
            for (const b of (outRes?.buckets || [])) months.add(b.month)
            setMonthsCount(months.size)
        }).catch(() => setMonthsCount(0))
        return () => { cancelled = true }
    }, [props.from, props.to, props.sphere, props.paymentMethod, props.refreshKey])

    return (
        <div className="card" style={{ marginTop: 12, padding: 12, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <strong>Summen</strong>
                    <div className="helper">Für den gewählten Zeitraum und die Filter.</div>
                </div>
            </div>
            {loading && <div>Lade …</div>}
            {data && (
                <div style={{ display: 'grid', gap: 12 }}>
                    {(() => {
                        const inSum = (data.byType.find(t => t.key === 'IN')?.gross || 0)
                        const outSum = (data.byType.find(t => t.key === 'OUT')?.gross || 0)
                        const net = inSum - outSum
                        const avgPerMonth = monthsCount > 0 ? (net / monthsCount) : null
                        return (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                                <div className="card" style={{ padding: 10 }}>
                                    <div className="helper">Einnahmen (Brutto)</div>
                                    <div style={{ fontWeight: 600, color: '#2e7d32' }}>{eurFmt.format(inSum)}</div>
                                </div>
                                <div className="card" style={{ padding: 10 }}>
                                    <div className="helper">Ausgaben (Brutto)</div>
                                    <div style={{ fontWeight: 600, color: '#c62828' }}>{eurFmt.format(outSum)}</div>
                                </div>
                                <div className="card" style={{ padding: 10 }}>
                                    <div className="helper">Netto</div>
                                    <div style={{ fontWeight: 600, color: (net >= 0 ? 'var(--success)' : 'var(--danger)') }}>{eurFmt.format(net)}</div>
                                </div>
                                <div className="card" style={{ padding: 10 }}>
                                    <div className="helper">Ø Netto/Monat{monthsCount > 0 ? ` (${monthsCount}m)` : ''}</div>
                                    <div style={{ fontWeight: 600 }}>{avgPerMonth != null ? eurFmt.format(avgPerMonth) : '—'}</div>
                                </div>
                            </div>
                        )
                    })()}
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        <div><div className="helper">Netto</div><div>{eurFmt.format(data.totals.net)}</div></div>
                        <div><div className="helper">MwSt</div><div>{eurFmt.format(data.totals.vat)}</div></div>
                        <div><div className="helper">Brutto</div><div>{eurFmt.format(data.totals.gross)}</div></div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                        <div>
                            <strong>Nach Sphäre</strong>
                            <ul>
                                {data.bySphere.map((r) => (
                                    <li key={r.key}><span style={{ minWidth: 90, display: 'inline-block' }}>{r.key}</span> {eurFmt.format(r.gross)}</li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <strong>Nach Zahlweg</strong>
                            <ul>
                                {data.byPaymentMethod.map((r, i) => (
                                    <li key={(r.key ?? 'NULL') + i}><span style={{ minWidth: 90, display: 'inline-block' }}>{r.key ?? '—'}</span> {eurFmt.format(r.gross)}</li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <strong>Nach Art</strong>
                            <ul>
                                {data.byType.map((r) => (
                                    <li key={r.key}><span style={{ minWidth: 90, display: 'inline-block' }}>{r.key}</span> {eurFmt.format(r.gross)}</li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function ReportsTabs() {
    const [tab, setTab] = useState<string>(() => {
        try { return localStorage.getItem('reportsTab') || 'overview' } catch { return 'overview' }
    })
    useEffect(() => { try { localStorage.setItem('reportsTab', tab) } catch { } }, [tab])
    return (
        <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn ghost" onClick={() => setTab('overview')} style={{ background: tab === 'overview' ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }}>Übersicht</button>
            <button className="btn ghost" onClick={() => setTab('monthly')} style={{ background: tab === 'monthly' ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }}>Monatsverlauf</button>
            <button className="btn ghost" onClick={() => setTab('compare')} style={{ background: tab === 'compare' ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }} disabled>Vergleich (bald)</button>
        </div>
    )
}

// Removed export-as-image helper (PDF export is sufficient)

function ReportsMonthlyChart(props: { activateKey?: number; refreshKey?: number; from?: string; to?: string; sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; type?: 'IN' | 'OUT' | 'TRANSFER'; paymentMethod?: 'BAR' | 'BANK' }) {
    const [loading, setLoading] = useState(false)
    const [inBuckets, setInBuckets] = useState<Array<{ month: string; gross: number }>>([])
    const [outBuckets, setOutBuckets] = useState<Array<{ month: string; gross: number }>>([])
    const [hoverIdx, setHoverIdx] = useState<number | null>(null)
    const [capOutliers, setCapOutliers] = useState<boolean>(() => {
        try { return localStorage.getItem('reports.capOutliers') === '1' } catch { return false }
    })
    const svgRef = useRef<SVGSVGElement | null>(null)
    const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
    // Measure container width to expand chart to available space
    const containerRef = useRef<HTMLDivElement | null>(null)
    const [containerW, setContainerW] = useState<number>(0)
    useEffect(() => {
        const el = containerRef.current
        if (!el) return
        const measure = () => {
            const rectW = el.getBoundingClientRect().width
            const parentW = el.parentElement?.clientWidth || 0
            const w = Math.max(rectW, parentW, 0)
            if (w && Math.abs(w - containerW) > 1) setContainerW(w)
        }
        measure()
        const ro = new ResizeObserver(() => measure())
        ro.observe(el)
        const onResize = () => measure()
        const onVisibility = () => { if (document.visibilityState === 'visible') { setTimeout(measure, 0); setTimeout(measure, 120) } }
        window.addEventListener('resize', onResize)
        document.addEventListener('visibilitychange', onVisibility)
        // catch late layout after tab switches
        const t0 = setTimeout(measure, 0)
        const t1 = setTimeout(measure, 120)
        const t2 = setTimeout(measure, 360)
        return () => { ro.disconnect(); window.removeEventListener('resize', onResize); document.removeEventListener('visibilitychange', onVisibility); clearTimeout(t0); clearTimeout(t1); clearTimeout(t2) }
    }, [])
    // Re-measure when Reports page becomes active (activateKey bump)
    useEffect(() => {
        const el = containerRef.current
        if (!el) return
        const measure = () => {
            const rectW = el.getBoundingClientRect().width
            const parentW = el.parentElement?.clientWidth || 0
            const w = Math.max(rectW, parentW, 0)
            if (w && Math.abs(w - containerW) > 1) setContainerW(w)
        }
        requestAnimationFrame(() => {
            measure()
            setTimeout(measure, 0)
            setTimeout(measure, 120)
            setTimeout(measure, 360)
        })
        // no cleanup needed for timeouts started here
    }, [props.activateKey])
    useEffect(() => {
        let cancelled = false
        setLoading(true)
        Promise.all([
            window.api?.reports.monthly?.({ from: props.from, to: props.to, sphere: props.sphere, type: 'IN', paymentMethod: props.paymentMethod }),
            window.api?.reports.monthly?.({ from: props.from, to: props.to, sphere: props.sphere, type: 'OUT', paymentMethod: props.paymentMethod })
        ]).then(([inRes, outRes]) => {
            if (cancelled) return
            setInBuckets((inRes?.buckets || []).map(b => ({ month: b.month, gross: b.gross })))
            setOutBuckets((outRes?.buckets || []).map(b => ({ month: b.month, gross: b.gross })))
        }).finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [props.from, props.to, props.sphere, props.paymentMethod, props.refreshKey])

    const months = Array.from(new Set([...(inBuckets.map(b => b.month)), ...(outBuckets.map(b => b.month))])).sort()
    const series = months.map(m => ({
        month: m,
        // API returns IN as positive and OUT as negative when queried without type.
        // Here we fetch separately; ensure OUT is treated as negative contribution for saldo.
        inGross: inBuckets.find(b => b.month === m)?.gross || 0,
        outGross: -(Math.abs(outBuckets.find(b => b.month === m)?.gross || 0)),
    }))
    const saldo = (() => {
        let cum = 0
        return series.map((s) => { cum += (s.inGross + s.outGross); return cum })
    })()
    // Optional: cap outliers at ~95th percentile of absolute values to improve readability
    const scaleVals = (() => {
        const vals: number[] = []
        for (const s of series) { vals.push(Math.abs(s.inGross)); vals.push(Math.abs(s.outGross)); }
        for (const v of saldo) vals.push(Math.abs(v))
        return vals
    })()
    const p95 = (arr: number[]) => {
        if (!arr.length) return 1
        const a = arr.slice().sort((x, y) => x - y)
        const idx = Math.max(0, Math.min(a.length - 1, Math.floor(0.95 * (a.length - 1))))
        return Math.max(1, a[idx])
    }
    const maxValRaw = Math.max(1, ...scaleVals)
    const maxVal = capOutliers ? p95(scaleVals) : maxValRaw
    const margin = { top: 22, right: 28, bottom: 42, left: 34 }
    const innerH = 180
    const defaultGroupW = 44
    const barW = 16
    const gap = 16
    const minWidth = Math.max(360, months.length * (defaultGroupW + gap) + margin.left + margin.right)
    const width = Math.max(containerW || 0, minWidth)
    const height = innerH + margin.top + margin.bottom
    const yBase = margin.top
    const yAxisX = margin.left - 2
    const innerW = width - (margin.left + margin.right)
    const groupW = months.length > 0 ? Math.max(40, Math.min(90, Math.floor((innerW - (months.length - 1) * gap) / months.length))) : defaultGroupW
    const monthLabel = (m: string, withYear = false) => {
        const [y, mm] = m.split('-').map(Number)
        const d = new Date(Date.UTC(y, (mm - 1) as number, 1))
        const mon = d.toLocaleString('de-DE', { month: 'short' }).replace('.', '')
        return withYear ? `${mon} ${y}` : mon
    }
    const years = useMemo(() => Array.from(new Set(months.map(m => m.slice(0, 4)))), [months])
    const xFor = (idx: number) => margin.left + idx * (groupW + gap)
    const yFor = (val: number) => yBase + (innerH - Math.round((Math.abs(val) / maxVal) * innerH))

    return (
        <div className="card" style={{ marginTop: 12, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>Monatsverlauf (Balken: IN/OUT · Linie: kumulierter Saldo)</strong>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <label className="helper" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} title="Skalierung gegen Ausreißer robuster machen (95. Perzentil)">
                        <input type="checkbox" checked={capOutliers} onChange={(e) => { const v = e.target.checked; setCapOutliers(v); try { localStorage.setItem('reports.capOutliers', v ? '1' : '0') } catch {} }} /> Ausreißer abblenden
                    </label>
                    <div className="legend">
                        <span className="legend-item"><span className="legend-swatch" style={{ background: '#2e7d32' }}></span>IN</span>
                        <span className="legend-item"><span className="legend-swatch" style={{ background: '#c62828' }}></span>OUT</span>
                        <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--accent)' }}></span>Saldo</span>
                    </div>
                </div>
            </div>
            {loading && <div>Lade …</div>}
            {!loading && (
                <div ref={containerRef} style={{ overflowX: 'auto', position: 'relative' }}>
                    {/* Focus details overlay (hover or click to pin; double-click to drilldown) */}
                    {(() => {
                        const focusIdx = (typeof hoverIdx === 'number' ? hoverIdx : null)
                        // selected pin handled on click below via title; keep hover only for now to avoid clutter
                        const idx = focusIdx
                        if (idx == null || !series[idx]) return null
                        const s = series[idx]
                        const net = s.inGross + s.outGross
                        return (
                            <div style={{ position: 'absolute', top: 6, left: 12, background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', display: 'flex', gap: 10, alignItems: 'center' }}>
                                <strong style={{ fontSize: 12 }}>{monthLabel(s.month, true)}</strong>
                                <span className="chip" style={{ background: '#2e7d32', color: '#fff' }}>IN {eurFmt.format(s.inGross)}</span>
                                <span className="chip" style={{ background: '#c62828', color: '#fff' }}>OUT {eurFmt.format(Math.abs(s.outGross))}</span>
                                <span className="chip" style={{ background: net >= 0 ? '#2e7d32' : '#c62828', color: '#fff' }}>Netto {eurFmt.format(net)}</span>
                            </div>
                        )
                    })()}
                    <svg ref={svgRef} width={width} height={height} role="img" aria-label="Monatsverlauf">
                        {/* grid lines */}
                        {Array.from({ length: 4 }).map((_, i) => {
                            const y = yBase + (innerH / 4) * i
                            return <line key={i} x1={margin.left} y1={y} x2={width - margin.right} y2={y} stroke="var(--border)" opacity={0.5} />
                        })}
                        {/* Bars and labels */}
                        {series.map((s, i) => {
                            const gx = xFor(i)
                            const hIn = Math.round((Math.abs(s.inGross) / maxVal) * innerH)
                            const hOut = Math.round((Math.abs(s.outGross) / maxVal) * innerH)
                            const yIn = yBase + (innerH - hIn)
                            const yOut = yBase + (innerH - hOut)
                            const saldoMonth = s.inGross + s.outGross
                            return (
                                <g key={s.month}>
                                    {/* Large invisible hit area per month to ease hover/click */}
                                    <rect x={gx - Math.floor(gap/2)} y={yBase} width={groupW + gap} height={innerH} fill="transparent" onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)} onClick={() => setHoverIdx(i)} onDoubleClick={() => {
                                    // Drilldown to Buchungen for this month (double-click)
                                    const [yy, mm] = s.month.split('-').map(Number)
                                    const from = new Date(Date.UTC(yy, (mm - 1) as number, 1)).toISOString().slice(0, 10)
                                    const to = new Date(Date.UTC(yy, (mm - 1) as number + 1, 0)).toISOString().slice(0, 10)
                                    const ev = new CustomEvent('apply-budget-jump', { detail: { from, to } })
                                    window.dispatchEvent(ev)
                                    }} style={{ cursor: 'pointer' }} />
                                    {/* Actual bars */}
                                    <g>
                                    <rect x={gx} y={yIn} width={barW} height={hIn} fill="#2e7d32" rx={3} />
                                    <rect x={gx + barW + 6} y={yOut} width={barW} height={hOut} fill="#c62828" rx={3} />
                                    {/* Monthly net overlay (thin bar) */}
                                    {(() => {
                                        const hNet = Math.round((Math.abs(saldoMonth) / maxVal) * innerH)
                                        const yNet = yBase + (innerH - hNet)
                                        const color = saldoMonth >= 0 ? '#2e7d32' : '#c62828'
                                        return <rect x={gx + barW - 2} y={yNet} width={6} height={hNet} fill={color} rx={2} opacity={0.7} />
                                    })()}
                                    {/* Hover text tooltip removed to avoid duplication with the overlay; keep only month label below */}
                                    <text x={gx + barW} y={yBase + innerH + 18} textAnchor="middle" fontSize="10">{monthLabel(s.month, false)}</text>
                                    {/* Remove native browser tooltip (<title>) to prevent redundant hover popups */}
                                    </g>
                                </g>
                            )
                        })}
                        {/* Saldo line */}
                        {saldo.length > 0 && (
                            <g>
                                {saldo.map((v, i) => {
                                    const x = xFor(i) + barW
                                    const y = yFor(v)
                                    return <circle key={`p-${i}`} cx={x} cy={y} r={2} fill={'var(--accent)'} />
                                })}
                                {saldo.map((v, i) => {
                                    if (i === 0) return null
                                    const x1 = xFor(i - 1) + barW
                                    const y1 = yFor(saldo[i - 1])
                                    const x2 = xFor(i) + barW
                                    const y2 = yFor(v)
                                    return <line key={`l-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={'var(--accent)'} strokeWidth={2} />
                                })}
                            </g>
                        )}
                        {/* y-axis line */}
                        <line x1={yAxisX} y1={yBase} x2={yAxisX} y2={yBase + innerH} stroke="var(--border)" />
                        {/* centered year caption */}
                        {years.length > 0 && (
                            <text x={Math.round(width / 2)} y={yBase + innerH + 34} textAnchor="middle" fontSize="11" fill="var(--text-dim)">
                                {years.length === 1 ? years[0] : `${years[0]}–${years[years.length - 1]}`}
                            </text>
                        )}
                    </svg>
                </div>
            )}
        </div>
    )
}

function ReportsSphereBars(props: { refreshKey?: number; from?: string; to?: string }) {
    const [loading, setLoading] = useState(false)
    const [data, setData] = useState<{ [k in 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB']?: { inGross: number; outGross: number } }>({})
    const [hover, setHover] = useState<null | { idx: number; which: 'IN' | 'OUT' }>(null)
    const spheres: Array<'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'> = ['IDEELL', 'ZWECK', 'VERMOEGEN', 'WGB']
    const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
    useEffect(() => {
        let cancelled = false
        setLoading(true)
        Promise.all([
            window.api?.reports.summary?.({ from: props.from, to: props.to, type: 'IN' }),
            window.api?.reports.summary?.({ from: props.from, to: props.to, type: 'OUT' })
        ]).then(([sumIn, sumOut]) => {
            if (cancelled) return
            const map: any = {}
            for (const s of spheres) map[s] = { inGross: 0, outGross: 0 }
            sumIn?.bySphere.forEach(r => { map[r.key].inGross = r.gross })
            sumOut?.bySphere.forEach(r => { map[r.key].outGross = r.gross })
            setData(map)
        }).finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [props.from, props.to, props.refreshKey])
    const entries = spheres.map(s => ({ sphere: s, inGross: data[s]?.inGross || 0, outGross: data[s]?.outGross || 0 }))
    const maxVal = Math.max(1, ...entries.map(e => Math.max(e.inGross, Math.abs(e.outGross))))
    const margin = { top: 22, right: 16, bottom: 30, left: 24 }
    const innerH = 160
    const groupWidth = 46
    const gap = 18
    const barW = 18
    const width = Math.max(280, entries.length * (groupWidth + gap) + margin.left + margin.right)
    const height = innerH + margin.top + margin.bottom
    const yBase = margin.top
    const yAxisX = margin.left - 2
    return (
        <div className="card" style={{ marginTop: 12, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>Gruppen-Bars pro Sphäre (IN/OUT, Brutto)</strong>
                <div className="legend">
                    <span className="legend-item"><span className="legend-swatch" style={{ background: '#2e7d32' }}></span>IN</span>
                    <span className="legend-item"><span className="legend-swatch" style={{ background: '#c62828' }}></span>OUT</span>
                </div>
            </div>
            {loading && <div>Lade …</div>}
            {!loading && (
                <div style={{ overflowX: 'auto' }}>
                    <svg width={width} height={height} role="img" aria-label="Gruppen-Bars pro Sphäre">
                        {/* grid lines */}
                        {Array.from({ length: 4 }).map((_, i) => {
                            const y = yBase + (innerH / 4) * i
                            return <line key={i} x1={margin.left} y1={y} x2={width - margin.right} y2={y} stroke="var(--border)" opacity={0.5} />
                        })}
                        {entries.map((e, i) => {
                            const gx = margin.left + i * (groupWidth + gap)
                            const hIn = Math.round((Math.abs(e.inGross) / maxVal) * innerH)
                            const hOut = Math.round((Math.abs(e.outGross) / maxVal) * innerH)
                            const yIn = yBase + (innerH - hIn)
                            const yOut = yBase + (innerH - hOut)
                            return (
                                <g key={e.sphere}>
                                    <g onMouseEnter={() => setHover({ idx: i, which: 'IN' })} onMouseLeave={() => setHover(null)}>
                                        <rect x={gx} y={yIn} width={barW} height={hIn} fill="#2e7d32" rx={3} />
                                        {hover && hover.idx === i && hover.which === 'IN' && (
                                            <text x={gx + barW / 2} y={Math.max(yBase + 10, yIn - 6)} textAnchor="middle" fontSize="10">{eurFmt.format(e.inGross)}</text>
                                        )}
                                    </g>
                                    <g onMouseEnter={() => setHover({ idx: i, which: 'OUT' })} onMouseLeave={() => setHover(null)}>
                                        <rect x={gx + barW + 4} y={yOut} width={barW} height={hOut} fill="#c62828" rx={3} />
                                        {hover && hover.idx === i && hover.which === 'OUT' && (
                                            <text x={gx + barW + 4 + barW / 2} y={Math.max(yBase + 10, yOut - 6)} textAnchor="middle" fontSize="10">{eurFmt.format(e.outGross)}</text>
                                        )}
                                    </g>
                                    <text x={gx + barW} y={yBase + innerH + 18} textAnchor="middle" fontSize="10">{e.sphere.slice(0, 3)}</text>
                                    <title>{`${e.sphere}\nIN: ${eurFmt.format(e.inGross)}\nOUT: ${eurFmt.format(e.outGross)}`}</title>
                                </g>
                            )
                        })}
                        <line x1={yAxisX} y1={yBase} x2={yAxisX} y2={yBase + innerH} stroke="var(--border)" />
                        {/* legend moved outside */}
                    </svg>
                </div>
            )}
        </div>
    )
}

function ReportsSphereDonut(props: { refreshKey?: number; from?: string; to?: string }) {
    const [loading, setLoading] = useState(false)
    const [rows, setRows] = useState<Array<{ key: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; gross: number }>>([])
    const svgRef = useRef<SVGSVGElement | null>(null)
    const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
    useEffect(() => {
        let cancelled = false
        setLoading(true)
        window.api?.reports.summary?.({ from: props.from, to: props.to })
            .then((res) => {
                if (cancelled || !res) return
                setRows(res.bySphere.map((r: any) => ({ key: r.key, gross: r.gross })))
            })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [props.from, props.to, props.refreshKey])
    const total = rows.reduce((a, b) => a + Math.abs(b.gross), 0) || 1
    const colors: Record<string, string> = { IDEELL: '#7e57c2', ZWECK: '#26a69a', VERMOEGEN: '#8d6e63', WGB: '#42a5f5' }
    const size = { w: 320, h: 220 }
    const cx = 110
    const cy = 110
    const outerR = 90
    const innerR = 52
    let angleAcc = -Math.PI / 2
    const arcs = rows.map((r) => {
        const frac = Math.abs(r.gross) / total
        const angle = frac * Math.PI * 2
        const start = angleAcc
        const end = angleAcc + angle
        angleAcc = end
        return { key: r.key, gross: r.gross, frac, start, end }
    })
    return (
        <div className="card" style={{ marginTop: 12, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>Nach Sphäre</strong>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div className="legend">
                        {rows.map(r => (
                            <span key={r.key} className="legend-item"><span className="legend-swatch" style={{ background: colors[r.key] }}></span>{r.key}</span>
                        ))}
                    </div>
                </div>
            </div>
            {loading && <div>Lade …</div>}
            {!loading && (
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                    <svg ref={svgRef} width={size.w} height={size.h} role="img" aria-label="Nach Sphäre">
                        {arcs.map((a, idx) => {
                            const largeArc = (a.end - a.start) > Math.PI ? 1 : 0
                            const sx = cx + outerR * Math.cos(a.start)
                            const sy = cy + outerR * Math.sin(a.start)
                            const ex = cx + outerR * Math.cos(a.end)
                            const ey = cy + outerR * Math.sin(a.end)
                            const isx = cx + innerR * Math.cos(a.end)
                            const isy = cy + innerR * Math.sin(a.end)
                            const iex = cx + innerR * Math.cos(a.start)
                            const iey = cy + innerR * Math.sin(a.start)
                            const d = [
                                `M ${sx} ${sy}`,
                                `A ${outerR} ${outerR} 0 ${largeArc} 1 ${ex} ${ey}`,
                                `L ${isx} ${isy}`,
                                `A ${innerR} ${innerR} 0 ${largeArc} 0 ${iex} ${iey}`,
                                'Z'
                            ].join(' ')
                            const mid = (a.start + a.end) / 2
                            const lx = cx + (innerR + (outerR - innerR) * 0.62) * Math.cos(mid)
                            const ly = cy + (innerR + (outerR - innerR) * 0.62) * Math.sin(mid)
                            const pct = Math.round(a.frac * 100)
                            return (
                                <g key={idx}>
                                    <path d={d} fill={colors[a.key]}>
                                        <title>{`${a.key}: ${eurFmt.format(a.gross)} (${pct}%)`}</title>
                                    </path>
                                    {pct >= 7 && (
                                        <text x={lx} y={ly} textAnchor="middle" fontSize="11" fill="#fff">{`${pct}%`}</text>
                                    )}
                                </g>
                            )
                        })}
                    </svg>
                    <div>
                        <div className="helper">Summe (Brutto)</div>
                        <div>{eurFmt.format(rows.reduce((a, b) => a + b.gross, 0))}</div>
                    </div>
                </div>
            )}
        </div>
    )
}

function ReportsPaymentMethodBars(props: { refreshKey?: number; from?: string; to?: string }) {
    const [loading, setLoading] = useState(false)
    const [data, setData] = useState<Array<{ key: 'BAR' | 'BANK' | null; inGross: number; outGross: number }>>([])
    const svgRef = useRef<SVGSVGElement | null>(null)
    const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
    const [hoverIdx, setHoverIdx] = useState<number | null>(null)
    useEffect(() => {
        let cancelled = false
        setLoading(true)
        Promise.all([
            window.api?.reports.summary?.({ from: props.from, to: props.to, type: 'IN' }),
            window.api?.reports.summary?.({ from: props.from, to: props.to, type: 'OUT' })
        ]).then(([sumIn, sumOut]) => {
            if (cancelled) return
            const keys: Array<'BAR' | 'BANK' | null> = ['BAR', 'BANK', null]
            const map: Record<string, { inGross: number; outGross: number }> = { 'BAR': { inGross: 0, outGross: 0 }, 'BANK': { inGross: 0, outGross: 0 }, 'null': { inGross: 0, outGross: 0 } }
            sumIn?.byPaymentMethod.forEach((r: any) => { const k = (r.key ?? 'null'); map[k] = map[k] || { inGross: 0, outGross: 0 }; map[k].inGross = r.gross })
            sumOut?.byPaymentMethod.forEach((r: any) => { const k = (r.key ?? 'null'); map[k] = map[k] || { inGross: 0, outGross: 0 }; map[k].outGross = r.gross })
            setData(keys.map(k => ({ key: k, inGross: map[(k ?? 'null') as any]?.inGross || 0, outGross: map[(k ?? 'null') as any]?.outGross || 0 })))
        }).finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [props.from, props.to, props.refreshKey])
    const maxVal = Math.max(1, ...data.map(d => Math.max(d.inGross, d.outGross)))
    const margin = { top: 22, right: 24, bottom: 24, left: 80 }
    const rowH = 30
    const gap = 14
    const innerH = data.length * rowH + (data.length - 1) * gap
    const height = innerH + margin.top + margin.bottom
    const width = 420
    const xFor = (val: number) => margin.left + Math.round((Math.abs(val) / maxVal) * (width - margin.left - margin.right))
    return (
        <div className="card" style={{ marginTop: 12, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>Nach Zahlweg (IN/OUT)</strong>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div className="legend">
                        <span className="legend-item"><span className="legend-swatch" style={{ background: '#2e7d32' }}></span>IN</span>
                        <span className="legend-item"><span className="legend-swatch" style={{ background: '#c62828' }}></span>OUT</span>
                    </div>
                </div>
            </div>
            {loading && <div>Lade …</div>}
            {!loading && (
                <svg ref={svgRef} width={width} height={height} role="img" aria-label="Nach Zahlweg">
                    {data.map((r, i) => {
                        const y = margin.top + i * (rowH + gap)
                        const inX = xFor(r.inGross)
                        const outX = xFor(r.outGross)
                        const yBar = y + 8
                        const label = r.key ?? '—'
                        return (
                            <g key={(r.key ?? 'NULL') + i} onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)}>
                                <text x={margin.left - 8} y={y + rowH / 2} textAnchor="end" dominantBaseline="middle" fontSize="12">{label}</text>
                                <rect x={margin.left} y={yBar} width={Math.max(0, inX - margin.left)} height={10} fill="#2e7d32" rx={3} />
                                <rect x={margin.left} y={yBar + 12} width={Math.max(0, outX - margin.left)} height={10} fill="#c62828" rx={3} />
                                {hoverIdx === i && (
                                    <g>
                                        <text x={Math.max(margin.left + 4, inX - 6)} y={yBar - 4} textAnchor="end" fontSize="11" fill="#fff">
                                            {eurFmt.format(r.inGross)}
                                        </text>
                                        <text x={Math.max(margin.left + 4, outX - 6)} y={yBar + 12 + 22} textAnchor="end" fontSize="11" fill="#fff">
                                            {eurFmt.format(r.outGross)}
                                        </text>
                                    </g>
                                )}
                                <title>{`${label}\nIN: ${eurFmt.format(r.inGross)}\nOUT: ${eurFmt.format(r.outGross)}`}</title>
                            </g>
                        )
                    })}
                    {/* x-axis base line */}
                    <line x1={margin.left - 2} y1={margin.top - 6} x2={margin.left - 2} y2={height - margin.bottom + 6} stroke="var(--border)" />
                </svg>
            )}
        </div>
    )
}

function ReportsCashBars(props: { refreshKey?: number; from?: string; to?: string }) {
    const [loading, setLoading] = useState(false)
    const [bar, setBar] = useState(0)
    const [bank, setBank] = useState(0)
    const [hover, setHover] = useState<null | 'BAR' | 'BANK'>(null)
    const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
    useEffect(() => {
        let cancelled = false
        setLoading(true)
        window.api?.reports.cashBalance?.({ to: props.to })
            .then((res) => {
                if (cancelled || !res) return
                setBar(res.BAR || 0)
                setBank(res.BANK || 0)
            })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [props.to, props.refreshKey])
    const maxVal = Math.max(1, Math.abs(bar), Math.abs(bank))
    const margin = { top: 22, right: 16, bottom: 30, left: 24 }
    const innerH = 160
    const height = innerH + margin.top + margin.bottom
    const width = 220
    const barW = 36
    const gap = 36
    const yZero = margin.top + Math.round(innerH / 2)
    const scale = (v: number) => Math.round((Math.abs(v) / maxVal) * (innerH / 2))
    return (
        <div className="card" style={{ marginTop: 12, padding: 12 }}>
            <strong>Kassenstand: Bar vs. Bank – Bestand{props.to ? ` (Stand: ${props.to})` : ''}</strong>
            {loading && <div>Lade …</div>}
            {!loading && (
                <svg width={width} height={height} role="img" aria-label="Bar und Bank">
                    {/* zero baseline */}
                    <line x1={margin.left} y1={yZero} x2={width - margin.right} y2={yZero} stroke="var(--border)" />
                    {/* grid lines above and below */}
                    {Array.from({ length: 2 }).map((_, i) => {
                        const y = yZero - ((innerH / 2) / 2) * (i + 1)
                        return <line key={'g1-' + i} x1={margin.left} y1={y} x2={width - margin.right} y2={y} stroke="var(--border)" opacity={0.4} />
                    })}
                    {Array.from({ length: 2 }).map((_, i) => {
                        const y = yZero + ((innerH / 2) / 2) * (i + 1)
                        return <line key={'g2-' + i} x1={margin.left} y1={y} x2={width - margin.right} y2={y} stroke="var(--border)" opacity={0.4} />
                    })}

                    {/* BAR */}
                    <g onMouseEnter={() => setHover('BAR')} onMouseLeave={() => setHover(null)}>
                        {(() => {
                            const h = scale(bar)
                            const x = 60
                            const y = bar >= 0 ? (yZero - h) : yZero
                            const color = bar >= 0 ? '#2e7d32' : '#c62828'
                            return <rect x={x} y={y} width={barW} height={Math.max(0, h)} fill={color} rx={3} />
                        })()}
                        {hover === 'BAR' && (
                            <text x={60 + barW / 2} y={(bar >= 0 ? (yZero - scale(bar) - 6) : (yZero + scale(bar) + 12))} textAnchor="middle" fontSize="10">{eurFmt.format(bar)}</text>
                        )}
                        <text x={60 + barW / 2} y={margin.top + innerH + 18} textAnchor="middle" fontSize="10">Bar</text>
                        <title>{`Bar: ${eurFmt.format(bar)}`}</title>
                    </g>

                    {/* BANK */}
                    <g onMouseEnter={() => setHover('BANK')} onMouseLeave={() => setHover(null)}>
                        {(() => {
                            const h = scale(bank)
                            const x = 60 + barW + gap
                            const y = bank >= 0 ? (yZero - h) : yZero
                            const color = bank >= 0 ? '#1565c0' : '#c62828'
                            return <rect x={x} y={y} width={barW} height={Math.max(0, h)} fill={color} rx={3} />
                        })()}
                        {hover === 'BANK' && (
                            <text x={60 + barW + gap + barW / 2} y={(bank >= 0 ? (yZero - scale(bank) - 6) : (yZero + scale(bank) + 12))} textAnchor="middle" fontSize="10">{eurFmt.format(bank)}</text>
                        )}
                        <text x={60 + barW + gap + barW / 2} y={margin.top + innerH + 18} textAnchor="middle" fontSize="10">Bank</text>
                        <title>{`Bank: ${eurFmt.format(bank)}`}</title>
                    </g>

                    {/* y-axis */}
                    <line x1={margin.left - 2} y1={margin.top} x2={margin.left - 2} y2={margin.top + innerH} stroke="var(--border)" />
                </svg>
            )}
        </div>
    )
}

function ReportsInOutLines(props: { activateKey?: number; refreshKey?: number; from?: string; to?: string; sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB' }) {
    const [loading, setLoading] = useState(false)
    const [inBuckets, setInBuckets] = useState<Array<{ month: string; gross: number }>>([])
    const [outBuckets, setOutBuckets] = useState<Array<{ month: string; gross: number }>>([])
    const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
    const [hoverIdx, setHoverIdx] = useState<number | null>(null)
    // Responsive: measure container width to expand chart (robust across tab switches)
    const containerRef = useRef<HTMLDivElement | null>(null)
    const [containerW, setContainerW] = useState<number>(0)
    useEffect(() => {
        const el = containerRef.current
        if (!el) return
        const measure = () => {
            const w = Math.max(el.getBoundingClientRect().width, el.parentElement?.clientWidth || 0)
            if (w && Math.abs(w - containerW) > 1) setContainerW(w)
        }
        measure()
        const ro = new ResizeObserver(() => measure())
        ro.observe(el)
        const onResize = () => measure()
        const onVis = () => { if (document.visibilityState === 'visible') { setTimeout(measure, 0); setTimeout(measure, 120) } }
        window.addEventListener('resize', onResize)
        document.addEventListener('visibilitychange', onVis)
        const t0 = setTimeout(measure, 0)
        const t1 = setTimeout(measure, 120)
        const t2 = setTimeout(measure, 360)
        return () => { ro.disconnect(); window.removeEventListener('resize', onResize); document.removeEventListener('visibilitychange', onVis); clearTimeout(t0); clearTimeout(t1); clearTimeout(t2) }
    }, [])
    // Re-measure on reports activation (tab/page switch)
    useEffect(() => {
        const el = containerRef.current
        if (!el) return
        const measure = () => {
            const w = Math.max(el.getBoundingClientRect().width, el.parentElement?.clientWidth || 0)
            if (w && Math.abs(w - containerW) > 1) setContainerW(w)
        }
        requestAnimationFrame(() => {
            measure()
            setTimeout(measure, 0)
            setTimeout(measure, 120)
            setTimeout(measure, 360)
        })
    }, [props.activateKey])
    useEffect(() => {
        let cancelled = false
        setLoading(true)
        Promise.all([
            window.api?.reports.monthly?.({ from: props.from, to: props.to, sphere: props.sphere, type: 'IN' }),
            window.api?.reports.monthly?.({ from: props.from, to: props.to, sphere: props.sphere, type: 'OUT' })
        ]).then(([inRes, outRes]) => {
            if (cancelled) return
            setInBuckets((inRes?.buckets || []).map(b => ({ month: b.month, gross: b.gross })))
            setOutBuckets((outRes?.buckets || []).map(b => ({ month: b.month, gross: b.gross })))
        }).finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [props.from, props.to, props.sphere, props.refreshKey])
    const months = Array.from(new Set([...(inBuckets.map(b => b.month)), ...(outBuckets.map(b => b.month))])).sort()
    const maxVal = Math.max(1, ...months.map(m => Math.max(Math.abs(inBuckets.find(b => b.month === m)?.gross || 0), Math.abs(outBuckets.find(b => b.month === m)?.gross || 0))))
    const margin = { top: 22, right: 22, bottom: 42, left: 30 }
    const innerH = 188
    const height = innerH + margin.top + margin.bottom
    // Base step for minimum width, but expand to container
    let baseStep = 54
    const minWidth = Math.max(340, months.length * baseStep + margin.left + margin.right)
    const width = Math.max(containerW || 0, minWidth)
    let step = baseStep
    if (containerW && months.length > 1) {
        const innerW = width - (margin.left + margin.right)
        step = Math.max(40, Math.min(140, Math.floor(innerW / (months.length - 1))))
    }
    const xFor = (idx: number) => margin.left + idx * step
    const yFor = (val: number) => margin.top + (innerH - Math.round((Math.abs(val) / maxVal) * innerH))
    const monthLabel = (m: string, withYear = false) => {
        const [y, mm] = m.split('-').map(Number)
        const d = new Date(Date.UTC(y, (mm - 1) as number, 1))
        const mon = d.toLocaleString('de-DE', { month: 'short' }).replace('.', '')
        return withYear ? `${mon} ${y}` : mon
    }
    const years = useMemo(() => Array.from(new Set(months.map(m => m.slice(0, 4)))), [months])
    const points = (arr: Array<{ month: string; gross: number }>) => months.map((m, i) => `${xFor(i)},${yFor(arr.find(b => b.month === m)?.gross || 0)}`).join(' ')
    return (
        <div className="card" style={{ marginTop: 12, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>Linienverlauf Einnahmen (IN) vs. Ausgaben (OUT) – Brutto</strong>
                <div className="legend">
                    <span className="legend-item"><span className="legend-swatch" style={{ background: '#2e7d32' }}></span>IN</span>
                    <span className="legend-item"><span className="legend-swatch" style={{ background: '#c62828' }}></span>OUT</span>
                </div>
            </div>
            {loading && <div>Lade …</div>}
            {!loading && (
                <div ref={containerRef} style={{ overflowX: 'auto', position: 'relative' }}>
                    {/* Focus details overlay */}
                    {(() => {
                        const idx = (typeof hoverIdx === 'number' ? hoverIdx : null)
                        if (idx == null) return null
                        const m = months[idx]
                        const inn = inBuckets.find(b => b.month === m)?.gross || 0
                        const out = outBuckets.find(b => b.month === m)?.gross || 0
                        return (
                            <div style={{ position: 'absolute', top: 6, left: 12, background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', display: 'flex', gap: 10, alignItems: 'center' }}>
                                <strong style={{ fontSize: 12 }}>{monthLabel(m, true)}</strong>
                                <span className="chip" style={{ background: '#2e7d32', color: '#fff' }}>IN {eurFmt.format(inn)}</span>
                                <span className="chip" style={{ background: '#c62828', color: '#fff' }}>OUT {eurFmt.format(out)}</span>
                            </div>
                        )
                    })()}
                    <svg width={width} height={height} role="img" aria-label="IN vs OUT">
                        {/* grid lines */}
                        {Array.from({ length: 4 }).map((_, i) => {
                            const y = margin.top + (innerH / 4) * i
                            return <line key={i} x1={margin.left} y1={y} x2={width - margin.right} y2={y} stroke="var(--border)" opacity={0.5} />
                        })}
                        <polyline fill="none" stroke="#2e7d32" strokeWidth="2" points={points(inBuckets)} />
                        <polyline fill="none" stroke="#c62828" strokeWidth="2" points={points(outBuckets)} />
                        {months.map((m, i) => (
                            <g key={m} style={{ cursor: 'pointer' }}>
                                {(() => {
                                    // Wide invisible hit-area that spans the month interval
                                    const left = (i === 0 ? margin.left : Math.round((xFor(i - 1) + xFor(i)) / 2))
                                    const right = (i === months.length - 1 ? (width - margin.right) : Math.round((xFor(i) + xFor(i + 1)) / 2))
                                    const hitX = Math.max(margin.left, left)
                                    const hitW = Math.max(8, right - left)
                                    return (
                                        <rect x={hitX} y={margin.top} width={hitW} height={innerH} fill="transparent"
                                            onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)} onClick={() => setHoverIdx(i)}
                                            onDoubleClick={() => {
                                                const [yy, mm] = m.split('-').map(Number)
                                                const from = new Date(Date.UTC(yy, (mm - 1) as number, 1)).toISOString().slice(0, 10)
                                                const to = new Date(Date.UTC(yy, (mm - 1) as number + 1, 0)).toISOString().slice(0, 10)
                                                const ev = new CustomEvent('apply-budget-jump', { detail: { from, to } })
                                                window.dispatchEvent(ev)
                                            }} />
                                    )
                                })()}
                                {/* interactive points */}
                                <circle cx={xFor(i)} cy={yFor(inBuckets.find(b => b.month === m)?.gross || 0)} r={3} fill="#2e7d32">
                                    <title>{`IN ${monthLabel(m, true)}: ${eurFmt.format(inBuckets.find(b => b.month === m)?.gross || 0)}`}</title>
                                </circle>
                                <circle cx={xFor(i)} cy={yFor(outBuckets.find(b => b.month === m)?.gross || 0)} r={3} fill="#c62828">
                                    <title>{`OUT ${monthLabel(m, true)}: ${eurFmt.format(outBuckets.find(b => b.month === m)?.gross || 0)}`}</title>
                                </circle>
                                {/* Wertbeschriftungen entfernt – Hover overlay zeigt Details */}
                                <text x={xFor(i)} y={margin.top + innerH + 18} textAnchor="middle" fontSize="10">{monthLabel(m, false)}</text>
                            </g>
                        ))}
                        {/* centered year caption */}
                        {years.length > 0 && (
                            <text x={Math.round(width / 2)} y={margin.top + innerH + 34} textAnchor="middle" fontSize="11" fill="var(--text-dim)">
                                {years.length === 1 ? years[0] : `${years[0]}–${years[years.length - 1]}`}
                            </text>
                        )}
                        {/* legend moved outside */}
                    </svg>
                </div>
            )}
        </div>
    )
}

function ReportsComparison(props: { refreshKey?: number; from?: string; to?: string; sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; type?: 'IN' | 'OUT' | 'TRANSFER'; paymentMethod?: 'BAR' | 'BANK' }) {
    const [loading, setLoading] = useState(false)
    const [a, setA] = useState<null | { totals: { net: number; vat: number; gross: number } }>(null)
    const [b, setB] = useState<null | { totals: { net: number; vat: number; gross: number } }>(null)
    const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])

    // Compute A = given range; B = previous period with same length
    const [rangeA, rangeB] = useMemo(() => {
        const from = props.from ? new Date(props.from) : null
        const to = props.to ? new Date(props.to) : null
        if (from && to) {
            const days = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1)
            const bTo = new Date(from.getTime() - 24 * 60 * 60 * 1000)
            const bFrom = new Date(bTo.getTime() - (days - 1) * 24 * 60 * 60 * 1000)
            const fmt = (d: Date) => d.toISOString().slice(0, 10)
            return [{ from: fmt(from), to: fmt(to) }, { from: fmt(bFrom), to: fmt(bTo) }]
        }
        // Fallback: use current month as A
        const now = new Date()
        const aFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
        const aTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))
        const bTo = new Date(aFrom.getTime() - 24 * 60 * 60 * 1000)
        const bFrom = new Date(Date.UTC(bTo.getUTCFullYear(), bTo.getUTCMonth(), 1))
        const fmt = (d: Date) => d.toISOString().slice(0, 10)
        return [{ from: fmt(aFrom), to: fmt(aTo) }, { from: fmt(bFrom), to: fmt(bTo) }]
    }, [props.from, props.to])

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        Promise.all([
            window.api?.reports.summary?.({ from: rangeA.from, to: rangeA.to, sphere: props.sphere, type: props.type, paymentMethod: props.paymentMethod }),
            window.api?.reports.summary?.({ from: rangeB.from, to: rangeB.to, sphere: props.sphere, type: props.type, paymentMethod: props.paymentMethod })
        ]).then(([sa, sb]) => {
            if (cancelled) return
            setA(sa as any)
            setB(sb as any)
        }).finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [rangeA.from, rangeA.to, rangeB.from, rangeB.to, props.sphere, props.type, props.paymentMethod, props.refreshKey])

    const delta = useMemo(() => {
        if (!a || !b) return null
        return { gross: (a.totals.gross - b.totals.gross) }
    }, [a, b])

    return (
        <div className="card" style={{ padding: 12, marginTop: 12 }}>
            <strong>Vergleich</strong>
            <div className="helper" style={{ marginTop: 4 }}>A: {rangeA.from} – {rangeA.to} | B: {rangeB.from} – {rangeB.to}</div>
            {loading && <div>Lade …</div>}
            {!loading && a && b && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 8 }}>
                    <div className="card" style={{ padding: 12 }}>
                        <div className="helper">A (Summe Brutto)</div>
                        <div style={{ fontWeight: 600 }}>{eurFmt.format(a.totals.gross)}</div>
                    </div>
                    <div className="card" style={{ padding: 12 }}>
                        <div className="helper">B (Summe Brutto)</div>
                        <div style={{ fontWeight: 600 }}>{eurFmt.format(b.totals.gross)}</div>
                    </div>
                    <div className="card" style={{ padding: 12 }}>
                        <div className="helper">Delta (A − B)</div>
                        <div style={{ fontWeight: 600, color: (delta!.gross >= 0 ? 'var(--success)' : 'var(--danger)') }}>{eurFmt.format(delta!.gross)}</div>
                    </div>
                </div>
            )}
        </div>
    )
}

// JournalTable with in-place header drag-and-drop reordering
function JournalTable({ rows, order, cols, onReorder, earmarks, tagDefs, eurFmt, fmtDate, onEdit, onDelete, onToggleSort, sortDir, sortBy, onTagClick, onEarmarkClick, onBudgetClick, highlightId, lockedUntil }: {
    rows: Array<{ id: number; voucherNo: string; date: string; type: 'IN' | 'OUT' | 'TRANSFER'; sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; description?: string | null; paymentMethod?: 'BAR' | 'BANK' | null; transferFrom?: 'BAR' | 'BANK' | null; transferTo?: 'BAR' | 'BANK' | null; netAmount: number; vatRate: number; vatAmount: number; grossAmount: number; fileCount?: number; earmarkId?: number | null; earmarkCode?: string | null; budgetId?: number | null; budgetLabel?: string | null; tags?: string[] }>
    order: string[]
    cols: Record<string, boolean>
    onReorder: (o: string[]) => void
    earmarks: Array<{ id: number; code: string; name: string; color?: string | null }>
    tagDefs: Array<{ id: number; name: string; color?: string | null }>
    eurFmt: Intl.NumberFormat
    fmtDate: (s?: string) => string
    onEdit: (r: { id: number; date: string; description: string | null; paymentMethod: 'BAR' | 'BANK' | null; transferFrom?: 'BAR' | 'BANK' | null; transferTo?: 'BAR' | 'BANK' | null; type?: 'IN' | 'OUT' | 'TRANSFER'; sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; earmarkId?: number | null; budgetId?: number | null; tags?: string[]; netAmount?: number; grossAmount?: number; vatRate?: number }) => void
    onDelete: (r: { id: number; voucherNo: string; description?: string | null }) => void
    onToggleSort: (col: 'date' | 'net' | 'gross') => void
    sortDir: 'ASC' | 'DESC'
    sortBy: 'date' | 'net' | 'gross'
    onTagClick?: (name: string) => void
    onEarmarkClick?: (id: number) => void
    onBudgetClick?: (id: number) => void
    highlightId?: number | null
    lockedUntil?: string | null
}) {
    const dragIdx = useRef<number | null>(null)
    const visibleOrder = order.filter(k => cols[k])
    function onHeaderDragStart(e: React.DragEvent<HTMLTableCellElement>, idx: number) {
        dragIdx.current = idx
        e.dataTransfer.effectAllowed = 'move'
    }
    function onHeaderDragOver(e: React.DragEvent<HTMLTableCellElement>) {
        e.preventDefault(); e.dataTransfer.dropEffect = 'move'
    }
    function onHeaderDrop(e: React.DragEvent<HTMLTableCellElement>, idx: number) {
        e.preventDefault()
        const from = dragIdx.current
        dragIdx.current = null
        if (from == null || from === idx) return
        // Reorder within full order, not just visible
        const keyFrom = visibleOrder[from]
        const keyTo = visibleOrder[idx]
        const next = order.slice()
        const a = next.indexOf(keyFrom)
        const b = next.indexOf(keyTo)
        if (a === -1 || b === -1) return
        const [moved] = next.splice(a, 1)
        next.splice(b, 0, moved)
        onReorder(next)
    }
    const renderSortIcon = (col: 'date' | 'net' | 'gross') => {
        const active = sortBy === col
        const sym = active ? (sortDir === 'DESC' ? '↓' : '↑') : '↕'
        const color = active ? 'var(--warning)' : 'var(--text-dim)'
        return <span className={`sort-icon ${active ? 'active' : 'inactive'}`} aria-hidden="true" style={{ color }}>{sym}</span>
    }
    const thFor = (k: string) => (
        k === 'actions' ? <th key={k} align="center" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>Aktionen</th>
            : k === 'date' ? <th key={k} align="left" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))} onClick={() => onToggleSort('date')} style={{ cursor: 'pointer' }}>Datum {renderSortIcon('date')}</th>
                : k === 'voucherNo' ? <th key={k} align="left" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>Nr.</th>
                    : k === 'type' ? <th key={k} align="left" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>Typ</th>
                        : k === 'sphere' ? <th key={k} align="left" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>Sphäre</th>
                            : k === 'description' ? <th key={k} align="left" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>Beschreibung</th>
                                : k === 'earmark' ? <th key={k} align="center" title="Zweckbindung" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>🎯</th>
                                    : k === 'budget' ? <th key={k} align="center" title="Budget" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>💰</th>
                                        : k === 'paymentMethod' ? <th key={k} align="left" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>Zahlweg</th>
                                            : k === 'attachments' ? <th key={k} align="center" title="Anhänge" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>📎</th>
                                                : k === 'net' ? <th key={k} align="right" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))} onClick={() => onToggleSort('net')} style={{ cursor: 'pointer' }}>Netto {renderSortIcon('net')}</th>
                                                    : k === 'vat' ? <th key={k} align="right" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>MwSt</th>
                                                        : <th key={k} align="right" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))} onClick={() => onToggleSort('gross')} style={{ cursor: 'pointer' }}>Brutto {renderSortIcon('gross')}</th>
    )
    const colorFor = (name: string) => (tagDefs || []).find(t => (t.name || '').toLowerCase() === (name || '').toLowerCase())?.color
    const isLocked = (d: string) => {
        if (!lockedUntil) return false
        return String(d) <= String(lockedUntil)
    }
    const tdFor = (k: string, r: any) => (
        k === 'actions' ? (
            <td key={k} align="center" style={{ whiteSpace: 'nowrap' }}>
                {isLocked(r.date) ? (
                    <span className="badge" title={`Bis ${lockedUntil} abgeschlossen (Jahresabschluss)`} aria-label="Gesperrt">🔒</span>
                ) : (
                    <button className="btn" title="Bearbeiten" onClick={() => onEdit({ id: r.id, date: r.date, description: r.description ?? '', paymentMethod: r.paymentMethod ?? null, transferFrom: r.transferFrom ?? null, transferTo: r.transferTo ?? null, type: r.type, sphere: r.sphere, earmarkId: r.earmarkId ?? null, budgetId: r.budgetId ?? null, tags: r.tags || [], netAmount: r.netAmount, grossAmount: r.grossAmount, vatRate: r.vatRate })}>✎</button>
                )}
            </td>
        ) : k === 'date' ? (
            <td key={k}>{fmtDate(r.date)}</td>
        ) : k === 'voucherNo' ? (
            <td key={k}>{r.voucherNo}</td>
        ) : k === 'type' ? (
            <td key={k}><span className={`badge ${r.type.toLowerCase()}`}>{r.type}</span></td>
        ) : k === 'sphere' ? (
            <td key={k}>{r.type === 'TRANSFER' ? '' : <span className={`badge sphere-${r.sphere.toLowerCase()}`}>{r.sphere}</span>}</td>
        ) : k === 'description' ? (
            <td key={k}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ minWidth: 160, flex: '1 1 auto' }}>{r.description || ''}</span>
                    {(r.tags || []).map((t: string) => {
                        const bg = colorFor(t) || undefined
                        const fg = contrastText(bg)
                        return (
                            <button
                                key={t}
                                className="chip"
                                style={{ background: bg, color: bg ? fg : undefined, cursor: 'pointer' }}
                                title={`Nach Tag "${t}" filtern`}
                                onClick={() => onTagClick?.(t)}
                            >
                                {t}
                            </button>
                        )
                    })}
                </div>
            </td>
        ) : k === 'earmark' ? (
            <td key={k} align="center">{r.earmarkCode ? (() => {
                const em = earmarks.find(e => e.code === r.earmarkCode)
                const bg = em?.color
                const fg = contrastText(bg)
                const id = r.earmarkId as number | null | undefined
                return (
                    <button
                        className="badge"
                        title={`Nach Zweckbindung ${r.earmarkCode} filtern`}
                        style={{ background: bg || undefined, color: bg ? fg : undefined, cursor: 'pointer' }}
                        onClick={() => { if (id != null) onEarmarkClick?.(id) }}
                    >
                        {r.earmarkCode}
                    </button>
                )
            })() : ''}</td>
        ) : k === 'paymentMethod' ? (
            <td key={k}>
                {r.type === 'TRANSFER' ? (
                    (() => {
                        const from = r.transferFrom
                        const to = r.transferTo
                        const title = from && to ? `${from} → ${to}` : 'Transfer'
                        return (
                            <span className="badge" title={title} aria-label={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                {from === 'BAR' ? <IconCash /> : <IconBank />}
                                <IconArrow />
                                {to === 'BAR' ? <IconCash /> : <IconBank />}
                            </span>
                        )
                    })()
                ) : (
                    r.paymentMethod ? (
                        <span className={`badge pm-${(r.paymentMethod || '').toLowerCase()}`} title={r.paymentMethod} aria-label={`Zahlweg: ${r.paymentMethod}`} style={{ display: 'inline-grid', placeItems: 'center' }}>
                            {r.paymentMethod === 'BAR' ? <IconCash /> : <IconBank />}
                        </span>
                    ) : ''
                )}
            </td>
        ) : k === 'budget' ? (
            <td key={k} align="center">{r.budgetLabel ? (
                (() => {
                    const bg = (r as any).budgetColor || undefined; const fg = contrastText(bg);
                    const id = r.budgetId as number | null | undefined
                    return (
                        <button
                            className="badge"
                            title={`Nach Budget ${r.budgetLabel} filtern`}
                            style={{ background: bg, color: bg ? fg : undefined, cursor: 'pointer' }}
                            onClick={() => { if (id != null) onBudgetClick?.(id) }}
                        >
                            {r.budgetLabel}
                        </button>
                    )
                })()
            ) : ''}</td>
        ) : k === 'attachments' ? (
            <td key={k} align="center">{typeof r.fileCount === 'number' && r.fileCount > 0 ? (<span className="badge" title={`${r.fileCount} Anhang/Anhänge`}>📎 {r.fileCount}</span>) : ''}</td>
        ) : k === 'net' ? (
            <td key={k} align="right">{eurFmt.format(r.netAmount)}</td>
        ) : k === 'vat' ? (
            <td key={k} align="right">{eurFmt.format(r.vatAmount)}</td>
        ) : (
            <td key={k} align="right" className={r.type === 'IN' ? 'gross-in' : r.type === 'OUT' ? 'gross-out' : 'gross-transfer'}>{eurFmt.format(r.grossAmount)}</td>
        )
    )
    return (
        <table className="journal-table" cellPadding={6}>
            <thead>
                <tr>
                    {visibleOrder.map((k) => thFor(k))}
                </tr>
            </thead>
            <tbody>
                {rows.map((r) => (
                    <tr key={r.id} className={highlightId === r.id ? 'row-flash' : undefined}>
                        {visibleOrder.map((k) => tdFor(k, r))}
                    </tr>
                ))}
                {rows.length === 0 && (
                    <tr>
                        <td colSpan={visibleOrder.length} className="helper">Keine Buchungen vorhanden.</td>
                    </tr>
                )}
            </tbody>
        </table>
    )
}

// Small inline icons used in table badges
function IconBank({ size = 14 }: { size?: number }) {
    const s = size
    return (
        <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 10h18" />
            <path d="M5 10v8M10 10v8M14 10v8M19 10v8" />
            <path d="M2 10l10-6 10 6" />
            <path d="M3 18h18" />
        </svg>
    )
}

function IconCash({ size = 14 }: { size?: number }) {
    const s = size
    return (
        <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="6" width="18" height="12" rx="2" />
            <circle cx="12" cy="12" r="3" />
            <path d="M7 9h.01M17 15h.01" />
        </svg>
    )
}

function IconArrow({ size = 14 }: { size?: number }) {
    const s = size
    return (
        <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" />
            <path d="M13 8l6 4-6 4" />
        </svg>
    )
}

// SettingsView: Windows-like tile layout
function SettingsView({
    defaultCols,
    defaultOrder,
    cols,
    setCols,
    order,
    setOrder,
    journalLimit,
    setJournalLimit,
    dateFmt,
    setDateFmt,
    sidebarCollapsed,
    setSidebarCollapsed,
    navLayout,
    setNavLayout,
    navIconColorMode,
    setNavIconColorMode,
    colorTheme,
    setColorTheme,
    journalRowStyle,
    setJournalRowStyle,
    journalRowDensity,
    setJournalRowDensity,
    tagDefs,
    setTagDefs,
    notify,
    bumpDataVersion,
    openTagsManager,
    openSetupWizard,
    labelForCol,
    onOpenSmartRestore,
}: {
    defaultCols: Record<string, boolean>
    defaultOrder: string[]
    cols: Record<string, boolean>
    setCols: (c: Record<string, boolean>) => void
    order: string[]
    setOrder: (o: string[]) => void
    journalLimit: number
    setJournalLimit: (n: number) => void
    dateFmt: 'ISO' | 'PRETTY'
    setDateFmt: (f: 'ISO' | 'PRETTY') => void
    sidebarCollapsed: boolean
    setSidebarCollapsed: (b: boolean) => void
    navLayout: 'left' | 'top'
    setNavLayout: (v: 'left' | 'top') => void
    navIconColorMode: 'color' | 'mono'
    setNavIconColorMode: (v: 'color' | 'mono') => void
    colorTheme: 'default' | 'fiery-ocean' | 'peachy-delight' | 'pastel-dreamland' | 'ocean-breeze' | 'earthy-tones' | 'monochrome-harmony' | 'vintage-charm'
    setColorTheme: (v: 'default' | 'fiery-ocean' | 'peachy-delight' | 'pastel-dreamland' | 'ocean-breeze' | 'earthy-tones' | 'monochrome-harmony' | 'vintage-charm') => void
    journalRowStyle: 'both' | 'lines' | 'zebra' | 'none'
    setJournalRowStyle: (v: 'both' | 'lines' | 'zebra' | 'none') => void
    journalRowDensity: 'normal' | 'compact'
    setJournalRowDensity: (v: 'normal' | 'compact') => void
    tagDefs: Array<{ id: number; name: string; color?: string | null; usage?: number }>
    setTagDefs: React.Dispatch<React.SetStateAction<Array<{ id: number; name: string; color?: string | null; usage?: number }>>>
    notify: (type: 'success' | 'error' | 'info', text: string, ms?: number) => void
    bumpDataVersion: () => void
    openTagsManager?: () => void
    openSetupWizard?: () => void
    labelForCol: (k: string) => string
    onOpenSmartRestore?: (preview: any) => void
}) {
    type TileKey = 'general' | 'table' | 'import' | 'storage' | 'org' | 'tags' | 'yearEnd' | 'tutorial' | 'about'
    const [active, setActive] = useState<TileKey>('general')

    function GeneralPane() {
        const sample = '2025-09-11'
        const pretty = '11 Sep 2025'
        const [showDeleteAll, setShowDeleteAll] = useState(false)
        const [showAdvanced, setShowAdvanced] = useState(false)
        const [deleteConfirmText, setDeleteConfirmText] = useState('')
        const canDeleteAll = deleteConfirmText === 'LÖSCHEN'
        const [showImportConfirm, setShowImportConfirm] = useState(false)
        const [busyImport, setBusyImport] = useState(false)
        return (
            <div style={{ display: 'grid', gap: 12 }}>
                {/* Quick access: Re-run setup wizard */}
                <div className="card settings-card" style={{ padding: 12 }}>
                    <div className="settings-title"><span aria-hidden>✨</span> <strong>Setup (Erststart)</strong></div>
                    <div className="settings-sub">Öffne den Einrichtungs-Assistenten erneut, um Organisation, Darstellung und Tags schnell zu konfigurieren.</div>
                    <button className="btn" onClick={() => openSetupWizard && openSetupWizard()}>Setup erneut öffnen…</button>
                </div>
                {/* Cluster 1: Darstellung & Layout */}
                <div className="card settings-card" style={{ padding: 12 }}>
                    <div className="settings-title"><span aria-hidden>🖼️</span> <strong>Aussehen & Navigation</strong></div>
                    <div className="settings-sub">Passe die Darstellung deiner Buchungen und Menüs an.</div>
                    <div className="row">
                        <div className="field">
                            <label>Buchungen: Zeilenlayout</label>
                            <select className="input" value={journalRowStyle} onChange={(e) => setJournalRowStyle(e.target.value as any)}>
                                <option value="both">Linien + Zebra</option>
                                <option value="lines">Nur Linien</option>
                                <option value="zebra">Nur Zebra</option>
                                <option value="none">Ohne Linien/Zebra</option>
                            </select>
                            <div className="helper">„Nur Linien“ entspricht der Rechnungen-Tabelle. „Zebra“ hebt jede zweite Zeile leicht hervor.</div>
                        </div>
                        <div className="field">
                            <label>Buchungen: Zeilenhöhe</label>
                            <select className="input" value={journalRowDensity} onChange={(e) => setJournalRowDensity(e.target.value as any)}>
                                <option value="normal">Normal</option>
                                <option value="compact">Kompakt</option>
                            </select>
                            <div className="helper">„Kompakt“ reduziert die vertikale Polsterung der Tabellenzellen.</div>
                        </div>
                        <div className="field">
                            <label>Menü-Layout</label>
                            <select className="input" value={navLayout} onChange={(e) => setNavLayout(e.target.value as 'left' | 'top')}>
                                <option value="left">Links (klassisch)</option>
                                <option value="top">Oben (icons)</option>
                            </select>
                            <div className="helper">„Oben“ blendet die Seitenleiste aus und zeigt eine kompakte Icon-Leiste im Kopfbereich.</div>
                        </div>
                        {navLayout === 'left' && (
                            <div className="field">
                                <div className="label-row">
                                    <label htmlFor="toggle-sidebar-compact">Kompakte Seitenleiste</label>
                                    <input id="toggle-sidebar-compact" role="switch" aria-checked={sidebarCollapsed} className="toggle" type="checkbox" checked={sidebarCollapsed} onChange={(e) => setSidebarCollapsed(e.target.checked)} />
                                </div>
                            </div>
                        )}
                        <div className="field">
                            <div className="label-row">
                                <label htmlFor="toggle-menu-icons">Farbige Menüicons</label>
                                <input id="toggle-menu-icons" role="switch" aria-checked={navIconColorMode === 'color'} className="toggle" type="checkbox" checked={navIconColorMode === 'color'} onChange={(e) => setNavIconColorMode(e.target.checked ? 'color' : 'mono')} />
                            </div>
                        </div>
                        <div className="field">
                            <label>Farb-Theme</label>
                            <select className="input" value={colorTheme} onChange={(e) => setColorTheme(e.target.value as any)}>
                                <option value="default">Standard</option>
                                <option value="fiery-ocean">Fiery Ocean</option>
                                <option value="peachy-delight">Peachy Delight</option>
                                <option value="pastel-dreamland">Pastel Dreamland</option>
                                <option value="ocean-breeze">Ocean Breeze</option>
                                <option value="earthy-tones">Earthy Tones</option>
                                <option value="monochrome-harmony">Monochrome Harmony</option>
                                <option value="vintage-charm">Vintage Charm</option>
                            </select>
                            <div className="helper">Wirkt auf Akzentfarben (Buttons, Hervorhebungen).</div>
                            <div className="swatches" aria-label="Farbvorschau">
                                <span className="swatch" style={{ background: 'var(--bg)' }} title="Hintergrund" />
                                <span className="swatch" style={{ background: 'var(--surface)' }} title="Fläche" />
                                <span className="swatch" style={{ background: 'var(--accent)' }} title="Akzent" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Cluster 2: Anzeige & Lesbarkeit */}
                <div className="card settings-card" style={{ padding: 12 }}>
                    <div className="settings-title"><span aria-hidden>🔎</span> <strong>Anzeige & Lesbarkeit</strong></div>
                    <div className="settings-sub">Kontrolliere Anzahl und Darstellung zentraler Informationen.</div>
                    <div className="row">
                        <div className="field">
                            <label>Buchungen: Anzahl der Einträge</label>
                            <select className="input" value={journalLimit} onChange={(e) => setJournalLimit(Number(e.target.value))}>
                                <option value={20}>20</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                            </select>
                        </div>
                        <div className="field">
                            <label>Datumsformat</label>
                            <select className="input" value={dateFmt} onChange={(e) => setDateFmt(e.target.value as any)}>
                                <option value="ISO">ISO (z.B. {sample})</option>
                                <option value="PRETTY">Lesbar (z.B. {pretty})</option>
                            </select>
                            <div className="helper">Wirkt u.a. in Buchungen (Datumsspalte) und Filter-Chips.</div>
                        </div>
                    </div>
                </div>

                {/* Cluster 3: Datenverwaltung & Sicherheit */}
                <div className="card settings-card" style={{ padding: 12 }}>
                    <div className="settings-title"><span aria-hidden>🗄️</span> <strong>Datenverwaltung & Sicherheit</strong></div>
                    <div className="settings-sub">Exportiere eine Sicherung oder importiere eine bestehende SQLite-Datei.</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button className="btn" onClick={async () => {
                            try {
                                const res = await window.api?.db.export?.()
                                if (res?.filePath) notify('success', `Datenbank exportiert: ${res.filePath}`)
                            } catch (e: any) {
                                notify('error', e?.message || String(e))
                            }
                        }}>Exportieren</button>
                        <button className="btn danger" onClick={() => setShowImportConfirm(true)}>Importieren…</button>
                    </div>
                    <div className="muted-sep" />
                    <button className="btn" onClick={() => setShowAdvanced(v => !v)} aria-expanded={showAdvanced} aria-controls="advanced-danger">
                        {showAdvanced ? 'Erweiterte Einstellungen ausblenden' : 'Erweiterte Einstellungen…'}
                    </button>
                    {showAdvanced && (
                        <div id="advanced-danger" className="card" style={{ padding: 12, borderLeft: '4px solid var(--danger)', marginTop: 10 }}>
                            <div style={{ display: 'grid', gap: 8 }}>
                                <div>
                                    <strong>Gefährliche Aktion</strong>
                                    <div className="helper">Alle Buchungen löschen (inkl. Anhänge). Dies kann nicht rückgängig gemacht werden.</div>
                                </div>
                                <div>
                                    <button className="btn danger" onClick={() => { setDeleteConfirmText(''); setShowDeleteAll(true) }}>Alle Buchungen löschen…</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                {showImportConfirm && (
                    <div className="modal-overlay" role="dialog" aria-modal="true">
                        <div className="modal" style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h2 style={{ margin: 0 }}>Datenbank importieren</h2>
                                <button className="btn ghost" onClick={() => setShowImportConfirm(false)}>✕</button>
                            </div>
                            <div className="helper" style={{ color: 'var(--danger)' }}>
                                Achtung: Die aktuelle Datenbank wird überschrieben. Erstelle vorher eine Sicherung, wenn du dir unsicher bist.
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                <button className="btn" onClick={() => setShowImportConfirm(false)}>Abbrechen</button>
                                <button className="btn danger" disabled={busyImport} onClick={async () => {
                                    try {
                                        setBusyImport(true)
                                        const res = await window.api?.db?.import?.()
                                        if (res?.ok) {
                                            notify('success', 'Datenbank importiert. Die App wird neu geladen …')
                                            window.dispatchEvent(new Event('data-changed'))
                                            bumpDataVersion()
                                            window.setTimeout(() => window.location.reload(), 600)
                                        }
                                    } catch (e: any) {
                                        notify('error', e?.message || String(e))
                                    } finally {
                                        setBusyImport(false)
                                        setShowImportConfirm(false)
                                    }
                                }}>Ja, fortfahren</button>
                            </div>
                        </div>
                    </div>
                )}
                {showDeleteAll && (
                    <div className="modal-overlay" role="dialog" aria-modal="true">
                        <div className="modal" style={{ display: 'grid', gap: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h2 style={{ margin: 0 }}>Alle Buchungen löschen</h2>
                                <button className="btn ghost" onClick={() => setShowDeleteAll(false)}>✕</button>
                            </div>
                            <div className="helper">Dieser Vorgang löscht ALLE Buchungen und zugehörige Anhänge dauerhaft. Dies kann nicht rückgängig gemacht werden.</div>
                            <div className="field">
                                <label>Zur Bestätigung bitte exakt "LÖSCHEN" eingeben</label>
                                <input className="input" value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.currentTarget.value)} placeholder="LÖSCHEN" />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                <button className="btn" onClick={() => setShowDeleteAll(false)}>Abbrechen</button>
                                <button className="btn danger" disabled={!canDeleteAll} onClick={async () => {
                                    try {
                                        const res = await window.api?.vouchers.clearAll?.()
                                        const n = res?.deleted ?? 0
                                        setShowDeleteAll(false)
                                        notify('success', `${n} Buchung(en) gelöscht.`)
                                        window.dispatchEvent(new Event('data-changed'))
                                        bumpDataVersion()
                                    } catch (e: any) {
                                        notify('error', e?.message || String(e))
                                    }
                                }}>Ja, alles löschen</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        )
    }

    function TablePane() {
        return (
            <div style={{ display: 'grid', gap: 12 }}>
                <div>
                    <strong>Tabelle & Darstellung</strong>
                    <div className="helper">Sichtbarkeit der Spalten und Reihenfolge. Drag & Drop zum Umordnen.</div>
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {Object.keys(defaultCols).map(k => (
                        <label key={k} title={k === 'actions' ? 'Empfohlen aktiviert' : ''} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <input type="checkbox" checked={!!cols[k]} onChange={(e) => setCols({ ...cols, [k]: e.target.checked })} /> {labelForCol(k)}
                        </label>
                    ))}
                </div>
                {!cols['actions'] && (
                    <div className="helper" style={{ color: 'var(--danger)' }}>Ohne „Aktionen“ kannst du Zeilen nicht bearbeiten oder löschen.</div>
                )}
                <div>
                    <div className="helper">Reihenfolge:</div>
                    <DnDOrder order={order as any} cols={cols as any} onChange={(o) => setOrder(o as any)} labelFor={labelForCol} />
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn" onClick={() => { setCols(defaultCols); setOrder(defaultOrder) }}>Voreinstellung: Standard</button>
                    <button className="btn" onClick={() => { setCols({ actions: true, date: true, voucherNo: false, type: false, sphere: false, description: true, earmark: false, paymentMethod: false, attachments: false, net: false, vat: false, gross: true } as any); setOrder(['actions', 'date', 'description', 'gross', 'voucherNo', 'type', 'sphere', 'earmark', 'paymentMethod', 'attachments', 'net', 'vat']) }}>Voreinstellung: Minimal</button>
                    <button className="btn" onClick={() => { setCols({ ...defaultCols }); setOrder(['actions', 'date', 'voucherNo', 'type', 'sphere', 'description', 'earmark', 'paymentMethod', 'attachments', 'net', 'vat', 'gross']) }}>Voreinstellung: Details</button>
                    <button className="btn" onClick={() => { setCols(defaultCols); setOrder(defaultOrder); setJournalLimit(20) }}>Zurücksetzen</button>
                </div>
            </div>
        )
    }

    function StoragePane() {
    const [info, setInfo] = useState<null | { root: string; dbPath: string; filesDir: string; configuredRoot: string | null }>(null)
    const [busy, setBusy] = useState(false) // disable buttons
        const [busyBackup, setBusyBackup] = useState(false)
        const [backups, setBackups] = useState<Array<{ filePath: string; size: number; mtime: number }>>([])
        const [error, setError] = useState<string>('')
        const [migratePrompt, setMigratePrompt] = useState<null | { kind: 'useOrMigrate'; sel: { root: string; dbPath: string } } | { kind: 'migrateEmpty'; sel: { root: string } }>(null)
        const [busyAction, setBusyAction] = useState(false)
    const [restoreSel, setRestoreSel] = useState<null | { filePath: string }>(null)
    const [restoreInfo, setRestoreInfo] = useState<null | { current?: Record<string, number>; backup?: Record<string, number>; error?: string }>(null)
    const [busyRestore, setBusyRestore] = useState(false)
    const [autoMode, setAutoMode] = useState<'OFF' | 'PROMPT' | 'SILENT'>('PROMPT')
    const [intervalDays, setIntervalDays] = useState<number>(7)
    const [lastAuto, setLastAuto] = useState<number | null>(null)
    const [backupDir, setBackupDir] = useState<string>('')

        async function refresh() {
            setError('')
            try {
                setBusy(true)
                const res = await window.api?.db?.location?.get?.()
                if (res) setInfo(res)
            } catch (e: any) {
                setError(e?.message || String(e))
            } finally { setBusy(false) }
        }
        async function refreshBackups() {
            try {
                const r = await window.api?.backup?.list?.()
                if (r?.ok && r?.backups) setBackups(r.backups)
            } catch { /* ignore */ }
        }
        useEffect(() => {
            refresh();
            refreshBackups();
            (async () => {
                try {
                    const d = await window.api?.backup?.getDir?.()
                    if (d?.ok && d?.dir) setBackupDir(String(d.dir))
                    const m = await window.api?.settings?.get?.({ key: 'backup.auto' })
                    const i = await window.api?.settings?.get?.({ key: 'backup.intervalDays' })
                    const l = await window.api?.settings?.get?.({ key: 'backup.lastAuto' })
                    if (m?.value) setAutoMode(String(m.value).toUpperCase() as any)
                    if (i?.value) setIntervalDays(Number(i.value) || 7)
                    if (l?.value) setLastAuto(Number(l.value) || null)
                } catch { }
            })()
        }, [])

        async function makeBackupNow() {
            setBusyBackup(true)
            try {
                const res = await window.api?.backup?.make?.('manual')
                if (res?.ok && res?.filePath) {
                    notify('success', `Backup erstellt: ${res.filePath}`)
                    await refreshBackups()
                } else {
                    notify('error', res?.error || 'Backup fehlgeschlagen')
                }
            } catch (e: any) {
                notify('error', e?.message || String(e))
            } finally { setBusyBackup(false) }
        }

        async function doAction(kind: 'pick' | 'migrate' | 'use' | 'reset') {
            setBusy(true); setError('')
            try {
                let res: any
                if (kind === 'pick') {
                    const mod = await import('./storage')
                    const sel = await mod.pickFolder()
                    if (!sel) return
                    // If folder already contains a DB, ask user which action to take
                    if (sel.hasDb) {
                        // Show custom modal to choose between using existing or migrating current DB
                        setMigratePrompt({ kind: 'useOrMigrate', sel: { root: sel.root, dbPath: sel.dbPath } })
                        return
                    } else {
                        // No DB present → show custom confirm to migrate
                        setMigratePrompt({ kind: 'migrateEmpty', sel: { root: sel.root } })
                        return
                    }
                } else if (kind === 'migrate') {
                    const mod = await import('./storage')
                    const sel = await mod.pickFolder()
                    if (!sel) return
                    res = await mod.migrateTo(sel.root)
                } else if (kind === 'use') {
                    const mod = await import('./storage')
                    const sel = await mod.pickFolder()
                    if (!sel) return
                    if (!sel.hasDb) { notify('error', 'Im gewählten Ordner wurde keine database.sqlite gefunden.'); return }
                    res = await mod.useFolder(sel.root)
                } else {
                    res = await window.api?.db?.location?.resetDefault?.()
                }
                if (res?.ok) {
                    notify('success', kind === 'reset' ? 'Datenbank auf Standard zurückgesetzt.' : 'Speicherort aktualisiert.')
                    await refresh()
                    // Daten neu laden lassen
                    window.dispatchEvent(new Event('data-changed'))
                    bumpDataVersion()
                }
            } catch (e: any) {
                const msg = e?.message || String(e)
                if (/Abbruch/i.test(msg)) return
                setError(msg)
                notify('error', msg)
            } finally { setBusy(false) }
        }

        async function applyUse(root: string) {
            try {
                setBusyAction(true)
                const mod = await import('./storage')
                const res = await mod.useFolder(root)
                if (res?.ok) {
                    notify('success', 'Speicherort aktualisiert (bestehende Datenbank verwendet).')
                    await refresh()
                    window.dispatchEvent(new Event('data-changed'))
                    bumpDataVersion()
                }
                setMigratePrompt(null)
            } catch (e: any) {
                const msg = e?.message || String(e)
                setError(msg); notify('error', msg)
            } finally { setBusyAction(false) }
        }

        async function applyMigrate(root: string) {
            try {
                setBusyAction(true)
                const mod = await import('./storage')
                const res = await mod.migrateTo(root)
                if (res?.ok) {
                    notify('success', 'Datenbank migriert und Speicherort aktualisiert.')
                    await refresh()
                    window.dispatchEvent(new Event('data-changed'))
                    bumpDataVersion()
                }
                setMigratePrompt(null)
            } catch (e: any) {
                const msg = e?.message || String(e)
                setError(msg); notify('error', msg)
            } finally { setBusyAction(false) }
        }

        return (
            <div style={{ display: 'grid', gap: 12 }}>
                <div>
                    <strong>Speicherort der Datenbank</strong>
                    <div className="helper">Wähle, wo die Datei <code>database.sqlite</code> und die Anhänge gespeichert werden.</div>
                </div>
                {/* Hinweise direkt unter der Überschrift platzieren */}
                <div className="helper">Hinweise:
                    <ul style={{ margin: '4px 0 0 16px' }}>
                        <li>„Ordner wählen…“ öffnet einen Dialog. Es wird noch nichts kopiert.</li>
                        <li>Wenn im gewählten Ordner bereits eine <code>database.sqlite</code> liegt, kannst du diese verwenden oder deine aktuelle DB in diesen Ordner kopieren (migrieren).</li>
                        <li>Wenn keine Datenbank vorhanden ist, kannst du die aktuelle Datenbank in den Ordner kopieren (migrieren).</li>
                        <li>„Standard wiederherstellen“ nutzt den App-Datenordner (empfohlen, falls unsicher).</li>
                    </ul>
                </div>
                {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
                <div className="card" style={{ padding: 12 }}>
                    {info ? (
                        <div style={{ display: 'grid', gap: 6 }}>
                            <div><span className="helper">Aktueller Ordner</span><div style={{ wordBreak: 'break-all' }}>{info.root}</div></div>
                            <div><span className="helper">Datenbank-Datei</span><div style={{ wordBreak: 'break-all' }}>{info.dbPath}</div></div>
                            <div><span className="helper">Anhänge-Ordner</span><div style={{ wordBreak: 'break-all' }}>{info.filesDir}</div></div>
                            <div><span className="helper">Benutzerdefiniert</span><div>{info.configuredRoot ? 'Ja' : 'Nein (Standard)'}</div></div>
                        </div>
                    ) : (
                        <div className="helper">Lade Informationen …</div>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn" disabled={busy} onClick={() => doAction('pick')}>Ordner wählen…</button>
                    <button className="btn" disabled={busy || !info?.configuredRoot} title={!info?.configuredRoot ? 'Bereits Standard' : ''} onClick={async () => {
                        if (!info?.configuredRoot) return
                        try {
                            setBusy(true)
                            const prev = await window.api?.db?.smartRestore?.preview?.()
                            onOpenSmartRestore && onOpenSmartRestore(prev)
                        } catch (e: any) {
                            notify('error', e?.message || String(e))
                        } finally {
                            setBusy(false)
                        }
                    }}>Standard wiederherstellen (Smart)</button>
                </div>
                {/* state hook must not be rendered; moved to top of component – leftover text removed */}
                {backupDir && (
                    <div className="helper" style={{ wordBreak: 'break-all' }}>Backup-Ordner: {backupDir}</div>
                )}
                {/* Backup Sektion */}
                <div className="card" style={{ padding: 12, marginTop: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ display: 'grid', gap: 4 }}>
                            <div className="settings-title"><strong>Backup-Einstellungen</strong></div>
                            <div className="helper">Automatische Sicherungen beim Start; manuelle Sicherungen jederzeit.</div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button className="btn" disabled={busyBackup} onClick={makeBackupNow}>Backup jetzt</button>
                            <button className="btn" onClick={async () => {
                                const r = await window.api?.backup?.setDir?.()
                                if (r?.ok) {
                                    setBackupDir(String(r.dir))
                                    const moved = (r as any)?.moved ?? 0
                                    const msg = moved > 0 ? `Backup-Ordner aktualisiert · ${moved} Sicherung(en) übernommen` : 'Backup-Ordner aktualisiert'
                                    notify('success', msg)
                                    await refreshBackups()
                                }
                            }}>Backup-Ordner wählen…</button>
                            <button className="btn" onClick={() => window.api?.backup?.openFolder?.()}>Backup-Ordner öffnen</button>
                        </div>
                    </div>
                    {/* Auto-Backup Toggle + Einstellungen */}
                    <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                        <div className="field" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <label htmlFor="toggle-auto-backup" style={{ marginRight: 12 }}>Automatisches Backup</label>
                            <input id="toggle-auto-backup" role="switch" aria-checked={autoMode !== 'OFF'} className="toggle" type="checkbox"
                                checked={autoMode !== 'OFF'}
                                onChange={async (e) => {
                                    const on = e.currentTarget.checked
                                    const next = on ? (autoMode === 'OFF' ? 'PROMPT' : autoMode) : 'OFF'
                                    setAutoMode(next as any)
                                    await window.api?.settings?.set?.({ key: 'backup.auto', value: next })
                                }} />
                        </div>
                        <div className="row">
                            <div className="field" style={{ minWidth: 160 }}>
                                <label>Modus</label>
                                <select className="input" value={autoMode} disabled={autoMode === 'OFF'} onChange={async (e) => {
                                    const v = e.target.value as 'OFF' | 'PROMPT' | 'SILENT'
                                    setAutoMode(v)
                                    await window.api?.settings?.set?.({ key: 'backup.auto', value: v })
                                }}>
                                    <option value="OFF">Aus</option>
                                    <option value="PROMPT">Nachfragen</option>
                                    <option value="SILENT">Automatisch (ohne Nachfrage)</option>
                                </select>
                            </div>
                            <div className="field" style={{ minWidth: 160 }}>
                                <label>Intervall (Tage)</label>
                                <input className="input" type="number" min={1} disabled={autoMode === 'OFF'} value={intervalDays} onChange={async (e) => {
                                    const n = Math.max(1, Number(e.target.value) || 1)
                                    setIntervalDays(n)
                                    await window.api?.settings?.set?.({ key: 'backup.intervalDays', value: n })
                                }} />
                            </div>
                        </div>
                        {/* Prominente Anzeige: Letztes Backup */}
                        <div style={{ padding: 8, borderRadius: 8, background: 'color-mix(in oklab, var(--surface) 90%, transparent)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            {(() => {
                                const last = backups && backups.length ? new Date(backups[0].mtime).toLocaleString('de-DE') : '—'
                                return <>
                                    <div><strong>Letztes Backup:</strong> <span className="helper">{last}</span></div>
                                    <div className="helper">Letztes Auto-Backup: {lastAuto ? new Date(lastAuto).toLocaleString('de-DE') : '—'}</div>
                                </>
                            })()}
                        </div>
                    </div>
                </div>
                {migratePrompt && (
                    migratePrompt.kind === 'useOrMigrate' ? (
                        <DbMigrateModal
                            mode="useOrMigrate"
                            root={migratePrompt.sel.root}
                            dbPath={migratePrompt.sel.dbPath}
                            busy={busyAction}
                            onCancel={() => setMigratePrompt(null)}
                            onUse={() => applyUse(migratePrompt.sel.root)}
                            onMigrate={() => applyMigrate(migratePrompt.sel.root)}
                        />
                    ) : (
                        <DbMigrateModal
                            mode="migrateEmpty"
                            root={migratePrompt.sel.root}
                            busy={busyAction}
                            onCancel={() => setMigratePrompt(null)}
                            onMigrate={() => applyMigrate(migratePrompt.sel.root)}
                        />
                    )
                )}
                <div className="card" style={{ padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <div><strong>Letzte Backups</strong><div className="helper">Die letzten Sicherungen im aktuellen Backup-Ordner.</div></div>
                    </div>
                    {backups.length === 0 ? (
                        <div className="helper" style={{ marginTop: 8 }}>Noch keine Backups vorhanden.</div>
                    ) : (
                        <div style={{ overflow: 'auto', maxHeight: 260, border: '1px solid var(--border)', borderRadius: 8 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>
                                        <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>Datei</th>
                                        <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>Datum</th>
                                        <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>Größe</th>
                                        <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>Aktion</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {backups.map((b, i) => (
                                        <tr key={i}>
                                            <td style={{ padding: '6px 8px', wordBreak: 'break-all', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}>{b.filePath}</td>
                                            <td style={{ padding: '6px 8px' }}>{new Date(b.mtime).toLocaleString('de-DE')}</td>
                                            <td style={{ padding: '6px 8px', textAlign: 'right' }}>{(b.size / 1024 / 1024).toFixed(2)} MB</td>
                                            <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                                                <button className="btn danger" onClick={async () => {
                                                    setRestoreSel({ filePath: b.filePath })
                                                    setRestoreInfo(null)
                                                    try {
                                                        const [cur, bak] = await Promise.all([
                                                            window.api?.backup?.inspectCurrent?.(),
                                                            window.api?.backup?.inspect?.(b.filePath)
                                                        ])
                                                        setRestoreInfo({ current: cur?.counts || {}, backup: bak?.counts || {} })
                                                    } catch (e: any) {
                                                        setRestoreInfo({ error: e?.message || String(e) })
                                                    }
                                                }}>Wiederherstellen…</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
                {restoreSel && (
                    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => !busyRestore && setRestoreSel(null)}>
                        <div className="modal" onClick={e => e.stopPropagation()} style={{ display: 'grid', gap: 12, maxWidth: 700 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <h2 style={{ margin: 0 }}>Backup wiederherstellen</h2>
                                <button className="btn ghost" onClick={() => setRestoreSel(null)} disabled={busyRestore} aria-label="Schließen" style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', borderRadius: 8 }}>✕</button>
                            </div>
                            <div className="card" style={{ padding: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span aria-hidden>🗂️</span>
                                <div className="helper" style={{ wordBreak: 'break-all' }}>{restoreSel.filePath}</div>
                            </div>
                            {!restoreInfo && <div className="helper">Lade Vergleich …</div>}
                            {restoreInfo?.error && <div style={{ color: 'var(--danger)' }}>{restoreInfo.error}</div>}
                            {restoreInfo && !restoreInfo.error && (
                                <div className="card" style={{ padding: 12 }}>
                                    <div className="helper" style={{ marginBottom: 6 }}>Vergleich: aktuelle Datenbank vs. Backup</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, alignItems: 'start' }}>
                                        <div className="helper">Tabelle</div>
                                        <div className="helper">Aktuell</div>
                                        <div className="helper">Backup</div>
                                        {Array.from(new Set([...(Object.keys(restoreInfo.current || {})), ...(Object.keys(restoreInfo.backup || {}))])).map(k => (
                                            <React.Fragment key={k}>
                                                <div>{k}</div>
                                                <div>{(restoreInfo.current || {})[k] ?? '—'}</div>
                                                <div>{(restoreInfo.backup || {})[k] ?? '—'}</div>
                                            </React.Fragment>
                                        ))}
                                    </div>
                                    <div className="helper" style={{ marginTop: 8 }}>Hinweis: Die Anzeige umfasst zentrale Tabellen (z. B. vouchers, invoices, members). Es kann zusätzliche Tabellen geben.</div>
                                </div>
                            )}
                            <div className="card" style={{ padding: 12, borderLeft: '4px solid var(--danger)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span aria-hidden>⚠️</span>
                                    <div className="helper">Achtung: Die aktuelle Datenbank wird durch das Backup ersetzt. Dieser Vorgang kann nicht rückgängig gemacht werden (außer über ein weiteres Backup).</div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                <button className="btn" onClick={() => setRestoreSel(null)} disabled={busyRestore}>Abbrechen</button>
                                <button className="btn danger" disabled={busyRestore || !restoreInfo} onClick={async () => {
                                    try {
                                        setBusyRestore(true)
                                        const r = await window.api?.backup?.restore?.(restoreSel.filePath)
                                        if (r?.ok) {
                                            notify('success', 'Backup wiederhergestellt. Die App wird neu geladen …')
                                            window.dispatchEvent(new Event('data-changed'))
                                            bumpDataVersion()
                                            window.setTimeout(() => window.location.reload(), 600)
                                        } else {
                                            notify('error', r?.error || 'Wiederherstellung fehlgeschlagen')
                                        }
                                    } catch (e: any) {
                                        notify('error', e?.message || String(e))
                                    } finally { setBusyRestore(false) }
                                }}>Ja, wiederherstellen</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        )
    }

    function TutorialPane() {
        const steps: Array<{ key: string; title: string; detail: string; action?: () => void; goto?: typeof setActive extends (v: infer T) => any ? any : any }> = [
            { key: 'filters', title: 'Buchungen filtern', detail: 'Nutze oben die Filterchips: Jahr/Zeitraum, Textsuche, Sphäre, Art (IN/OUT/TRANSFER), Zahlweg, Zweckbindung, Budget und Tags. Ergebnisse aktualisieren sich sofort.' },
            { key: 'batch', title: 'Batch-Verarbeitung', detail: 'Mit „Auswahl/Batch“ kannst du allen gefilterten Buchungen z. B. Zweckbindung, Budget oder Tags zuweisen – oder entfernen.' },
            { key: 'columns', title: 'Ansicht anpassen', detail: 'Spalten ein-/ausblenden, Reihenfolge ändern oder Presets wählen (wirkt im Journal).', action: () => setActive('table') },
            { key: 'general', title: 'Datumsformat & Listenlänge', detail: 'Datumsformat (ISO/Lesbar) und Anzahl der Einträge im Journal einstellen.', action: () => setActive('general') },
            { key: 'import', title: 'Daten importieren', detail: 'Excel (XLSX) oder camt.053 (XML) importieren – mit Vorschau.', action: () => setActive('import') },
            { key: 'yearEnd', title: 'Jahresabschluss', detail: 'Vorschau, Export (Excel) und Abschluss eines Jahres.', action: () => setActive('yearEnd') },
        ]
        return (
            <div style={{ display: 'grid', gap: 12 }}>
                <div>
                    <strong>Schnellstart-Tutorial</strong>
                    <div className="helper">Buchungen im Fokus: Filtern, Batch-Verarbeitung und passende Einstellungen.</div>
                </div>
                <div className="card" style={{ padding: 12 }}>
                    <ol style={{ margin: '4px 0 0 18px', display: 'grid', gap: 8 }}>
                        {steps.map(s => (
                            <li key={s.key}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                                    <div>
                                        <div style={{ fontWeight: 600 }}>{s.title}</div>
                                        <div className="helper">{s.detail}</div>
                                    </div>
                                    {s.action && <button className="btn" onClick={s.action}>Öffnen</button>}
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>
                <div className="helper">Tipp: In „Buchungen“ findest du die Filterchips oben. „Auswahl/Batch“ öffnet die Massenbearbeitung. Unter „Einstellungen → Tabelle & Darstellung“ passt du Spalten und Reihenfolge an. Der Jahresabschluss erstellt ein Excel mit Zusammenfassung, Journal und Monatsverlauf.</div>
            </div>
        )
    }

    function AboutPane() {
        const [ver, setVer] = useState<string>('')
        useEffect(() => {
            let mounted = true
            ;(async () => {
                try {
                    const r = await (window as any).api?.app?.version?.()
                    if (mounted) setVer(r?.version || '')
                } catch { /* ignore */ }
            })()
            return () => { mounted = false }
        }, [])
        return (
            <div style={{ display: 'grid', gap: 12 }}>
                <div>
                    <strong>Info</strong>
                    <div className="helper">Version und Kontakt</div>
                </div>
                <div className="card" style={{ padding: 12 }}>
                    <div style={{ display: 'grid', gap: 6 }}>
                        <div><span className="helper">Version</span><div>{ver || '—'}</div></div>
                        <div><span className="helper">Hersteller</span><div>Nikolas Häfner</div></div>
                        <div><span className="helper">E-Mail (Feedback)</span><div><a href="mailto:hubertoink@outlook.com">hubertoink@outlook.com</a></div></div>
                    </div>
                </div>
            </div>
        )
    }

    function YearEndPane() {
        const [yearsAvail, setYearsAvail] = useState<number[]>([])
        const [year, setYear] = useState<number>(() => new Date().getFullYear())
        const [prev, setPrev] = useState<null | { totals: { net: number; vat: number; gross: number }; bySphere: any[]; byPaymentMethod: any[]; byType: any[]; cashBalance: { BAR: number; BANK: number }; from: string; to: string }>(null)
        const [busy, setBusy] = useState(false)
    const [previewLoading, setPreviewLoading] = useState(false) // controls the preview "Lade …" only
        const [err, setErr] = useState('')
        const [status, setStatus] = useState<{ closedUntil: string | null } | null>(null)
        const [confirmAction, setConfirmAction] = useState<null | { type: 'close' | 'reopen' }>(null)
    const [lastExportPath, setLastExportPath] = useState<string | null>(null)
        const eur = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])

        // Allow closing the confirmation modal with Escape as a safety valve
        useEffect(() => {
            if (!confirmAction) return
            const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setConfirmAction(null) }
            window.addEventListener('keydown', onKey)
            return () => window.removeEventListener('keydown', onKey)
        }, [confirmAction])

        useEffect(() => {
            let cancelled = false
            window.api?.reports?.years?.().then(res => {
                if (!cancelled && res?.years) setYearsAvail(res.years)
            })
            window.api?.yearEnd?.status?.().then((s) => { if (!cancelled) setStatus(s as any) })
            return () => { cancelled = true }
        }, [])

        async function refresh() {
            setPreviewLoading(true); setErr('')
            try {
                const res = await window.api?.yearEnd?.preview?.({ year })
                if (res) setPrev(res as any)
            } catch (e: any) { setErr(e?.message || String(e)) }
            finally { setPreviewLoading(false) }
        }
        useEffect(() => { refresh() }, [year])

        async function doExport() {
            setBusy(true); setErr('')
            try {
                const res = await window.api?.yearEnd?.export?.({ year })
                if (res?.filePath) {
                    setLastExportPath(res.filePath)
                    notify('success', `Export erstellt: ${res.filePath}`)
                }
            } catch (e: any) { setErr(e?.message || String(e)); notify('error', e?.message || String(e)) }
            finally { setBusy(false) }
        }
        async function executeClose() {
            setBusy(true); setErr('')
            try {
                const res = await window.api?.yearEnd?.close?.({ year })
                if (res?.ok) {
                    notify('success', `Abgeschlossen bis ${res.closedUntil}`)
                    const s = await window.api?.yearEnd?.status?.(); setStatus(s as any)
                    await refresh()
                    window.dispatchEvent(new Event('data-changed'))
                }
            } catch (e: any) { setErr(e?.message || String(e)); notify('error', e?.message || String(e)) }
            finally { setBusy(false); setConfirmAction(null) }
        }
        async function executeReopen() {
            setBusy(true); setErr('')
            try {
                const res = await window.api?.yearEnd?.reopen?.({ year })
                if (res?.ok) {
                    notify('success', 'Periode geöffnet')
                    const s = await window.api?.yearEnd?.status?.(); setStatus(s as any)
                    await refresh()
                    window.dispatchEvent(new Event('data-changed'))
                }
            } catch (e: any) { setErr(e?.message || String(e)); notify('error', e?.message || String(e)) }
            finally { setBusy(false); setConfirmAction(null) }
        }

        // Derived UI helpers
    const closedUntil = status?.closedUntil || null
    const isLocked = !!closedUntil
    const lockedYear = isLocked ? Number(String(closedUntil).slice(0, 4)) : null
    const closeDisabled = lockedYear !== null && year <= lockedYear
    const closeDisabledHint = closeDisabled ? `Bereits abgeschlossen bis ${closedUntil}.` : ''

        return (
            <div style={{ display: 'grid', gap: 12 }}>
                <div>
                    <strong>Jahresabschluss</strong>
                    <div className="helper">Vorschau, Export und Abschluss des Geschäftsjahres.</div>
                </div>

                {/* Sektion 1: Status & Zeitraum */}
                <section className="card" style={{ padding: 12, display: 'grid', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderRadius: 10, background: isLocked ? 'color-mix(in oklab, var(--danger) 12%, transparent)' : 'color-mix(in oklab, var(--accent) 12%, transparent)' }}>
                            <span aria-hidden>{isLocked ? '🛡️' : '🛡️'}</span>
                            <div>
                                <div className="helper">Sperrstatus</div>
                                <div>
                                    {isLocked ? (
                                        <span>Abgeschlossen bis <strong>{closedUntil}</strong>. Buchungen bis zu diesem Datum sind gesperrt.</span>
                                    ) : (
                                        <span>Derzeit ist kein Jahr abgeschlossen.</span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="field" style={{ minWidth: 160 }}>
                            <label>Jahr</label>
                            <select className="input" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                                {[...new Set([new Date().getFullYear(), ...yearsAvail])].sort((a, b) => b - a).map(y => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </section>

                {/* Sektion 2: Aktionen */}
                <section className="card" style={{ padding: 12, display: 'grid', gap: 8 }}>
                    <div className="helper">Interaktive Schritte</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button className="btn" disabled={busy} onClick={doExport} title="XLSX-Export: enthält Zusammenfassung, Journal und Monatsverlauf">📤 Export-Paket</button>
                        {!closeDisabled && (
                            <button className="btn danger" disabled={busy} onClick={() => setConfirmAction({ type: 'close' })} title="Buchungen werden gesperrt, Export empfohlen">✅ Jahr abschließen…</button>
                        )}
                        {closeDisabled && (
                            <button className="btn" disabled={busy} onClick={() => setConfirmAction({ type: 'reopen' })} title="Periode wieder öffnen">Wieder öffnen…</button>
                        )}
                    </div>
                    {closeDisabled && (
                        <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}>
                            <span aria-hidden>🔒</span>
                            <div>Bereits abgeschlossen bis <strong>{closedUntil}</strong>.</div>
                        </div>
                    )}
                    {lastExportPath && (
                        <div className="card" style={{ padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <div className="helper" title={lastExportPath} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Gespeichert unter: {lastExportPath}</div>
                            <button className="btn" onClick={() => window.api?.shell?.showItemInFolder?.(lastExportPath)}>Im Ordner anzeigen</button>
                        </div>
                    )}
                </section>

                {err && <div style={{ color: 'var(--danger)' }}>{err}</div>}
                {previewLoading && <div className="helper">Lade …</div>}

                {/* Sektion 3: Finanzübersicht */}
                {prev && (
                    <section className="card" style={{ padding: 12, display: 'grid', gap: 12 }}>
                        <div className="helper">Zeitraum: {prev.from} – {prev.to}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                            <div className="card" style={{ padding: 12 }}>
                                <div className="helper">Netto</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span aria-hidden>🧾</span>
                                    <div style={{ fontWeight: 600 }}>{eur.format(prev.totals.net)}</div>
                                </div>
                            </div>
                            <div className="card" style={{ padding: 12 }}>
                                <div className="helper">MwSt</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span aria-hidden>🧾</span>
                                    <div style={{ fontWeight: 600 }}>{eur.format(prev.totals.vat)}</div>
                                </div>
                            </div>
                            <div className="card" style={{ padding: 12 }}>
                                <div className="helper">Brutto</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span aria-hidden>💰</span>
                                    <div style={{ fontWeight: 600 }}>{eur.format(prev.totals.gross)}</div>
                                </div>
                            </div>
                            <div className="card" style={{ padding: 12 }}>
                                <div className="helper">Kassenbestand (BAR/BANK; YTD)</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span aria-hidden>🏦</span>
                                    <div style={{ fontWeight: 600 }}>{eur.format(prev.cashBalance.BAR)} · {eur.format(prev.cashBalance.BANK)}</div>
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                                <strong>Nach Sphäre</strong>
                                <table cellPadding={6} style={{ width: '100%', marginTop: 6 }}>
                                    <thead><tr><th align="left">Sphäre</th><th align="right">Brutto</th></tr></thead>
                                    <tbody>
                                        {prev.bySphere.map((s: any, i: number) => (
                                            <tr key={i}><td>{s.key}</td><td align="right">{eur.format(s.gross)}</td></tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr>
                                            <td align="left"><span className="helper">Summe</span></td>
                                            <td align="right"><strong>{eur.format(prev.bySphere.reduce((a: number, x: any) => a + (Number(x.gross) || 0), 0))}</strong></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                            <div>
                                <strong>Nach Zahlweg</strong>
                                <table cellPadding={6} style={{ width: '100%', marginTop: 6 }}>
                                    <thead><tr><th align="left">Zahlweg</th><th align="right">Brutto</th></tr></thead>
                                    <tbody>
                                        {prev.byPaymentMethod.map((p: any, i: number) => (
                                            <tr key={i}><td>{p.key || '—'}</td><td align="right">{eur.format(p.gross)}</td></tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr>
                                            <td align="left"><span className="helper">Summe</span></td>
                                            <td align="right"><strong>{eur.format(prev.byPaymentMethod.reduce((a: number, x: any) => a + (Number(x.gross) || 0), 0))}</strong></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    </section>
                )}
                {confirmAction && (
                    <div className="modal-overlay" onClick={() => setConfirmAction(null)} role="dialog" aria-modal="true">
                        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, display: 'grid', gap: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ margin: 0 }}>{confirmAction.type === 'close' ? 'Jahr abschließen' : 'Periode wieder öffnen'}</h3>
                                <button className="btn ghost" onClick={() => setConfirmAction(null)} aria-label="Schließen" style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', borderRadius: 8 }}>✕</button>
                            </div>
                            {confirmAction.type === 'close' ? (
                                <div>
                                    Jahr <strong>{year}</strong> abschließen? Buchungen bis <strong>{year}-12-31</strong> sind danach gesperrt.
                                </div>
                            ) : (
                                <div>
                                    Jahr <strong>{year}</strong> wieder öffnen?
                                </div>
                            )}
                            <div className="helper">Dieser Vorgang kann später über „Wieder öffnen…“ rückgängig gemacht werden.</div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                <button className="btn" onClick={() => setConfirmAction(null)}>Abbrechen</button>
                                {confirmAction.type === 'close' ? (
                                    <button className="btn danger" onClick={executeClose} disabled={busy}>Ja, abschließen</button>
                                ) : (
                                    <button className="btn primary" onClick={executeReopen} disabled={busy}>Ja, öffnen</button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
                {/* Sektion 4: Hilfebereich */}
                <section className="card" style={{ padding: 12 }}>
                    <details>
                        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Wie funktioniert der Jahresabschluss?</summary>
                        <ul style={{ marginTop: 8 }}>
                            <li>„Export-Paket“ erstellt aktuell eine Excel-Datei (XLSX) mit Zusammenfassung, Journal und Monatsverlauf im Ordner „Dokumente/VereinPlannerExports“.</li>
                            <li>„Jahr abschließen…“ sperrt alle Buchungen des gewählten Jahres gegen Änderungen (Erstellen/Ändern/Löschen).</li>
                            <li>„Wieder öffnen…“ hebt die Sperre für das gewählte Jahr wieder auf. Vorgänge werden im Audit-Log protokolliert.</li>
                        </ul>
                    </details>
                </section>
            </div>
        )
    }

    function OrgPane() {
        const [orgName, setOrgName] = useState<string>('')
        const [cashier, setCashier] = useState<string>('')
        const [busy, setBusy] = useState(false)
        const [error, setError] = useState<string>('')
        useEffect(() => {
            let cancelled = false
            async function load() {
                try {
                    const on = await (window as any).api?.settings?.get?.({ key: 'org.name' })
                    const cn = await (window as any).api?.settings?.get?.({ key: 'org.cashier' })
                    if (!cancelled) { setOrgName((on?.value as any) || ''); setCashier((cn?.value as any) || '') }
                } catch (e: any) { if (!cancelled) setError(e?.message || String(e)) }
            }
            load()
            return () => { cancelled = true }
        }, [])
        async function save() {
            setBusy(true); setError('')
            try {
                await (window as any).api?.settings?.set?.({ key: 'org.name', value: orgName })
                await (window as any).api?.settings?.set?.({ key: 'org.cashier', value: cashier })
                notify('success', 'Organisation gespeichert')
                // broadcast for header refresh
                window.dispatchEvent(new Event('data-changed'))
            } catch (e: any) {
                setError(e?.message || String(e))
                notify('error', e?.message || String(e))
            } finally { setBusy(false) }
        }
        return (
            <div style={{ display: 'grid', gap: 12 }}>
                <div>
                    <strong>Organisation</strong>
                    <div className="helper">Name der Organisation und der Kassierer:in.</div>
                </div>
                {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
                <div className="row">
                    <div className="field">
                        <label>Name der Organisation</label>
                        <input className="input" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="z. B. Förderverein Muster e.V." />
                    </div>
                    <div className="field">
                        <label>Name (Kassier)</label>
                        <input className="input" value={cashier} onChange={(e) => setCashier(e.target.value)} placeholder="z. B. Max Mustermann" />
                    </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button className="btn primary" disabled={busy} onClick={save}>Speichern</button>
                </div>
            </div>
        )
    }

    function ImportPane() {
        const [showLog, setShowLog] = useState(false)
        const [logRows, setLogRows] = useState<Array<{ id: number; createdAt: string; entity: string; action: string; diff?: any | null }>>([])
        const [busy, setBusy] = useState(false)
        const [err, setErr] = useState('')
        async function loadLog() {
            setErr(''); setBusy(true)
            try {
                const res = await window.api?.audit?.recent?.({ limit: 50 })
                const all = res?.rows || []
                const onlyImports = all.filter(r => r.entity === 'imports' && r.action === 'EXECUTE')
                setLogRows(onlyImports)
            } catch (e: any) { setErr(e?.message || String(e)) }
            finally { setBusy(false) }
        }
        return (
            <div style={{ display: 'grid', gap: 12 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                        <div>
                            <strong>Datenimport</strong>
                            <div className="helper">Excel (.xlsx) oder camt.053 XML (.xml). Vorschau → Zuordnung prüfen → Import.</div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <details>
                                <summary className="chip" title="Hinweise zur Datei-Struktur">ⓘ</summary>
                                <div className="helper" style={{ marginTop: 6 }}>
                                    <ul style={{ margin: '4px 0 0 16px' }}>
                                        <li>Empfohlen: Kopfzeile in Zeile 1, Daten ab Zeile 2. Keine zusammengeführten Zellen.</li>
                                        <li>Ein Datensatz pro Zeile. Summen-/Saldo-Zeilen werden ignoriert.</li>
                                        <li>Mindestens: Datum und Betrag (Brutto oder Netto+USt). Optional: Art, Sphäre, Zweckbindung, Zahlweg.</li>
                                        <li>Bank-/Bar-Split: Alternativ die vier Spalten Bank+/-, Bar+/- verwenden (erzeugt ggf. mehrere Buchungen pro Zeile).</li>
                                        <li>Nutze „Vorlage herunterladen“ oder „Testdatei erzeugen“ als Referenz.</li>
                                    </ul>
                                </div>
                            </details>
                            <button className="btn" title="Import-Log anzeigen" onClick={() => { setShowLog(true); loadLog() }}>📝 Log</button>
                        </div>
                    </div>
                </div>
                <ImportXlsxCard notify={notify} />

                {showLog && createPortal(
                    <div className="modal-overlay" onClick={() => setShowLog(false)} role="dialog" aria-modal="true">
                        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ display: 'grid', gap: 10, width: 'min(900px, 96vw)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h2 style={{ margin: 0 }}>Import-Log</h2>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button className="btn" onClick={loadLog} disabled={busy}>Aktualisieren</button>
                                    <button className="btn danger" onClick={() => setShowLog(false)}>Schließen</button>
                                </div>
                            </div>
                            {err && <div style={{ color: 'var(--danger)' }}>{err}</div>}
                            {busy && <div className="helper">Lade …</div>}
                            {!busy && (
                                <div style={{ overflowX: 'auto' }}>
                                    <table cellPadding={6} style={{ width: '100%' }}>
                                        <thead>
                                            <tr>
                                                <th align="left">Zeit</th>
                                                <th align="left">Format</th>
                                                <th align="right">Importiert</th>
                                                <th align="right">Übersprungen</th>
                                                <th align="right">Fehler</th>
                                                <th align="left">Fehler-Datei</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {logRows.map((r, i) => {
                                                const d = r.diff || {}
                                                const fmt = d.format || 'XLSX'
                                                const errCnt = Number(d.errorCount || 0)
                                                return (
                                                    <tr key={r.id || i}>
                                                        <td>{new Date(r.createdAt || d.when || '').toLocaleString()}</td>
                                                        <td>{fmt}</td>
                                                        <td align="right">{d.imported ?? '—'}</td>
                                                        <td align="right">{d.skipped ?? '—'}</td>
                                                        <td align="right" style={{ color: errCnt > 0 ? 'var(--danger)' : undefined }}>{errCnt}</td>
                                                        <td>{d.errorFilePath ? (
                                                            <button className="btn" onClick={() => window.api?.shell?.showItemInFolder?.(d.errorFilePath)} title={String(d.errorFilePath)}>Öffnen</button>
                                                        ) : '—'}</td>
                                                    </tr>
                                                )
                                            })}
                                            {logRows.length === 0 && (
                                                <tr><td colSpan={6} className="helper">Keine Einträge vorhanden.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>, document.body)
                }
            </div>
        )
    }


    const tiles: Array<{ key: TileKey; title: string; desc: string; icon: React.ReactNode }> = [
        { key: 'general', title: 'Allgemein', desc: 'Basis & Listenverhalten', icon: <span>⚙️</span> },
        { key: 'org', title: 'Organisation', desc: 'Name & Kassier:in', icon: <span>🏢</span> },
        { key: 'table', title: 'Tabelle & Darstellung', desc: 'Spalten, Reihenfolge, Presets', icon: <span>📋</span> },
        { key: 'storage', title: 'Speicherort', desc: 'Datenbank & Anhänge', icon: <span>🗂️</span> },
        { key: 'import', title: 'Datenimport', desc: 'Excel (XLSX) & XML (camt.053)', icon: <span>⬇️</span> },
        { key: 'yearEnd', title: 'Jahresabschluss', desc: 'Vorschau, Export, Abschluss', icon: <span>📦</span> },
        { key: 'tags', title: 'Tags', desc: 'Farben & Namen verwalten', icon: <span>🏷️</span> },
        { key: 'tutorial', title: 'Tutorial', desc: 'Kurzanleitung & Fokus', icon: <span>🎯</span> },
        { key: 'about', title: 'Info', desc: 'Version & Kontakt', icon: <span>ℹ️</span> },
    ]

    return (
        <div className="card" style={{ padding: 12, display: 'grid', gridTemplateColumns: '300px 1fr', gap: 12 }}>
            <div style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
                <h2 style={{ margin: 0 }}>Einstellungen</h2>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                    {tiles.map(t => (
                        <button key={t.key} className="btn ghost" onClick={() => {
                            if (t.key === 'tags' && openTagsManager) { openTagsManager(); return }
                            setActive(t.key)
                        }} style={{ textAlign: 'left', padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: active === t.key ? 'color-mix(in oklab, var(--accent) 12%, transparent)' : undefined }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ width: 28, height: 28, borderRadius: 6, display: 'grid', placeItems: 'center', background: 'color-mix(in oklab, var(--accent) 20%, transparent)' }}>{t.icon}</div>
                                <div>
                                    <div style={{ fontWeight: 600 }}>{t.title}</div>
                                    <div className="helper">{t.desc}</div>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
            <div>
                {active === 'general' && <GeneralPane />}
                {active === 'table' && <TablePane />}
                {active === 'storage' && <StoragePane />}
                {active === 'import' && <ImportPane />}
                {active === 'yearEnd' && <YearEndPane />}
                {active === 'org' && <OrgPane />}
                {active === 'tutorial' && <TutorialPane />}
                {active === 'about' && <AboutPane />}
                {/* Tags pane disabled – use global modal instead */}
            </div>
        </div>
    )
}

function TagModal({ value, onClose, onSaved, notify }: { value: { id?: number; name: string; color?: string | null }; onClose: () => void; onSaved: () => void; notify?: (type: 'success' | 'error' | 'info', text: string, ms?: number) => void }) {
    const [v, setV] = useState(value)
    const [showColorPicker, setShowColorPicker] = useState(false)
    const [draftColor, setDraftColor] = useState<string>(value.color || '#00C853')
    const [draftError, setDraftError] = useState<string>('')
    useEffect(() => { setV(value); setDraftColor(value.color || '#00C853'); setDraftError('') }, [value])
    const PALETTE = ['#7C4DFF', '#2962FF', '#00B8D4', '#00C853', '#AEEA00', '#FFD600', '#FF9100', '#FF3D00', '#F50057', '#9C27B0']
    const canSave = (v.name || '').trim().length > 0
    return createPortal(
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <h2 style={{ margin: 0 }}>{v.id ? 'Tag bearbeiten' : 'Tag anlegen'}</h2>
                    <button className="btn danger" onClick={onClose}>Schließen</button>
                </header>
                <div className="row">
                    <div className="field">
                        <label>Name</label>
                        <input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
                    </div>
                    <div className="field" style={{ gridColumn: '1 / span 2' }}>
                        <label>Farbe</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {PALETTE.map((c) => (
                                <button key={c} type="button" className="btn" onClick={() => setV({ ...v, color: c })} title={c} style={{ padding: 0, width: 28, height: 28, borderRadius: 6, border: v.color === c ? '2px solid var(--text)' : '2px solid transparent', background: c }}>
                                    <span aria-hidden="true" />
                                </button>
                            ))}
                            <button type="button" className="btn" onClick={() => setShowColorPicker(true)} title="Eigene Farbe" style={{ height: 28, background: v.color || 'var(--muted)', color: v.color ? contrastText(v.color) : 'var(--text)' }}>
                                Eigene…
                            </button>
                            <button type="button" className="btn" onClick={() => setV({ ...v, color: null })} title="Keine Farbe" style={{ height: 28 }}>Keine</button>
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                    <button className="btn" onClick={onClose}>Abbrechen</button>
                    <button className="btn primary" disabled={!canSave} onClick={async () => {
                        try {
                            const payload = { ...v, name: (v.name || '').trim() }
                            if (!payload.name) { notify?.('error', 'Bitte einen Namen eingeben'); return }
                            await window.api?.tags?.upsert?.(payload as any)
                            window.dispatchEvent(new Event('tags-changed'))
                            onSaved()
                        } catch (e: any) {
                            const msg = e?.message || String(e)
                            if (notify) notify('error', msg)
                            else alert(msg)
                        }
                    }}>Speichern</button>
                </div>
            </div>
            {showColorPicker && (
                <div className="modal-overlay" onClick={() => setShowColorPicker(false)} role="dialog" aria-modal="true">
                    <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, display: 'grid', gap: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0 }}>Eigene Farbe wählen</h3>
                            <button className="btn ghost" onClick={() => setShowColorPicker(false)} aria-label="Schließen">✕</button>
                        </div>
                        <div className="row">
                            <div className="field">
                                <label>Picker</label>
                                <input type="color" value={draftColor} onChange={(e) => { setDraftColor(e.target.value); setDraftError('') }} style={{ width: 60, height: 36, padding: 0, border: '1px solid var(--border)', borderRadius: 6, background: 'transparent' }} />
                            </div>
                            <div className="field">
                                <label>HEX</label>
                                <input className="input" value={draftColor} onChange={(e) => { setDraftColor(e.target.value); setDraftError('') }} placeholder="#00C853" />
                                {draftError && <div className="helper" style={{ color: 'var(--danger)' }}>{draftError}</div>}
                            </div>
                        </div>
                        <div className="card" style={{ padding: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 28, height: 28, borderRadius: 6, background: draftColor, border: '1px solid var(--border)' }} />
                            <div className="helper">Kontrast: <span style={{ background: draftColor, color: contrastText(draftColor), padding: '2px 6px', borderRadius: 6 }}>{contrastText(draftColor)}</span></div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button className="btn" onClick={() => setShowColorPicker(false)}>Abbrechen</button>
                            <button className="btn primary" onClick={() => {
                                const hex = draftColor.trim()
                                const ok = /^#([0-9a-fA-F]{6})$/.test(hex)
                                if (!ok) { setDraftError('Bitte gültigen HEX-Wert eingeben (z. B. #00C853)'); return }
                                setV({ ...v, color: hex })
                                setShowColorPicker(false)
                            }}>Übernehmen</button>
                        </div>
                    </div>
                </div>
            )}
        </div>,
        document.body
    )
}

// Global Tags Manager Modal
function TagsManagerModal({ onClose, notify, onChanged }: { onClose: () => void; notify: (type: 'success' | 'error' | 'info', text: string, ms?: number) => void; onChanged?: () => void }) {
    const [tags, setTags] = useState<Array<{ id: number; name: string; color?: string | null; usage?: number }>>([])
    const [edit, setEdit] = useState<null | { id?: number; name: string; color?: string | null }>(null)
    const [busy, setBusy] = useState(false)
    const [deleteConfirm, setDeleteConfirm] = useState<null | { id: number; name: string }>(null)
    async function refresh() {
        try {
            setBusy(true)
            const res = await window.api?.tags?.list?.({ includeUsage: true })
            if (res?.rows) setTags(res.rows)
        } finally { setBusy(false) }
    }
    useEffect(() => { refresh() }, [])
    const PALETTE = ['#7C4DFF', '#2962FF', '#00B8D4', '#00C853', '#AEEA00', '#FFD600', '#FF9100', '#FF3D00', '#F50057', '#9C27B0']
    const colorSwatch = (c?: string | null) => c ? (<span title={c} style={{ display: 'inline-block', width: 16, height: 16, borderRadius: 4, background: c, verticalAlign: 'middle' }} />) : '—'
    return createPortal(
        <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(860px, 96vw)' }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <h2 style={{ margin: 0 }}>Tags verwalten</h2>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn" onClick={refresh} disabled={busy}>Aktualisieren</button>
                        <button className="btn primary" onClick={() => setEdit({ name: '', color: null })}>+ Neu</button>
                        <button className="btn danger" onClick={onClose}>Schließen</button>
                    </div>
                </header>
                {busy && <div className="helper">Lade …</div>}
                <table cellPadding={6} style={{ marginTop: 4, width: '100%' }}>
                    <thead>
                        <tr>
                            <th align="left">Tag</th>
                            <th align="left">Farbe</th>
                            <th align="right">Nutzung</th>
                            <th align="center">Aktionen</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tags.map(t => (
                            <tr key={t.id}>
                                <td>{t.name}</td>
                                <td>{colorSwatch(t.color)}</td>
                                <td align="right">{t.usage ?? '—'}</td>
                                <td align="center" style={{ whiteSpace: 'nowrap' }}>
                                    <button className="btn" onClick={() => setEdit({ id: t.id, name: t.name, color: t.color ?? null })}>✎</button>
                                    <button className="btn danger" onClick={() => setDeleteConfirm({ id: t.id, name: t.name })}>🗑</button>
                                </td>
                            </tr>
                        ))}
                        {tags.length === 0 && (
                            <tr><td colSpan={4} style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Keine Tags vorhanden.</td></tr>
                        )}
                    </tbody>
                </table>
                {edit && (
                    <TagModal
                        value={edit}
                        onClose={() => setEdit(null)}
                        onSaved={async () => { await refresh(); setEdit(null); notify('success', 'Tag gespeichert'); onChanged?.() }}
                        notify={notify}
                    />
                )}
                {deleteConfirm && (
                    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setDeleteConfirm(null)}>
                        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ display: 'grid', gap: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h2 style={{ margin: 0 }}>Tag löschen</h2>
                                <button className="btn ghost" onClick={() => setDeleteConfirm(null)}>✕</button>
                            </div>
                            <div>Den Tag <strong>{deleteConfirm.name}</strong> wirklich löschen?</div>
                            <div className="helper">Hinweis: Der Tag wird aus allen Buchungen entfernt.</div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                <button className="btn" onClick={() => setDeleteConfirm(null)}>Abbrechen</button>
                                <button className="btn danger" onClick={async () => {
                                    try {
                                        await window.api?.tags?.delete?.({ id: deleteConfirm.id })
                                        notify('success', `Tag "${deleteConfirm.name}" gelöscht`)
                                        setDeleteConfirm(null)
                                        await refresh()
                                        window.dispatchEvent(new Event('tags-changed'))
                                        onChanged?.()
                                    } catch (e: any) {
                                        notify('error', e?.message || String(e))
                                    }
                                }}>Ja, löschen</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body
    )
}

function ImportXlsxCard({ notify }: { notify?: (type: 'success' | 'error' | 'info', text: string, ms?: number) => void }) {
    const [fileName, setFileName] = useState<string>('')
    const [base64, setBase64] = useState<string>('')
    const [headers, setHeaders] = useState<string[]>([])
    const [sample, setSample] = useState<Array<Record<string, any>>>([])
    const [headerRowIndex, setHeaderRowIndex] = useState<number | null>(null)
    const [mapping, setMapping] = useState<Record<string, string | null>>({ date: null, type: null, sphere: null, description: null, paymentMethod: null, netAmount: null, vatRate: null, grossAmount: null, inGross: null, outGross: null, earmarkCode: null, bankIn: null, bankOut: null, cashIn: null, cashOut: null, defaultSphere: 'IDEELL' })
    const [busy, setBusy] = useState(false)
    const [result, setResult] = useState<null | { imported: number; skipped: number; errors: Array<{ row: number; message: string }>; rowStatuses?: Array<{ row: number; ok: boolean; message?: string }>; errorFilePath?: string }>(null)
    const [showErrorsModal, setShowErrorsModal] = useState(false)
    const fileRef = useRef<HTMLInputElement | null>(null)
    const [error, setError] = useState<string>('')

    function bufferToBase64(buf: ArrayBuffer) {
        const bytes = new Uint8Array(buf)
        const chunk = 0x8000
        let binary = ''
        for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null as any, bytes.subarray(i, i + chunk) as any)
        }
        return btoa(binary)
    }
    async function processFile(f: File) {
        setError('')
        setResult(null)
        setFileName(f.name)
        try {
            const buf = await f.arrayBuffer()
            const b64 = bufferToBase64(buf)
            setBase64(b64)
            setBusy(true)
            try {
                const prev = await window.api?.imports.preview?.({ fileBase64: b64 })
                if (prev) {
                    setHeaders(prev.headers)
                    setSample(prev.sample as any)
                    setMapping(prev.suggestedMapping)
                    setHeaderRowIndex((prev as any).headerRowIndex ?? null)
                }
            } finally { setBusy(false) }
        } catch (e: any) {
            setError('Datei konnte nicht gelesen werden: ' + (e?.message || String(e)))
        }
    }
    async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
        const f = e.target.files?.[0]
        if (!f) return
        await processFile(f)
    }
    function onDrop(e: React.DragEvent<HTMLDivElement>) {
        e.preventDefault(); e.stopPropagation()
        const f = e.dataTransfer?.files?.[0]
        if (f) processFile(f)
    }

    async function onImport() {
        setError('')
        if (!base64) { setError('Bitte zuerst eine XLSX-Datei auswählen.'); return }
        setBusy(true)
        try {
            const res = await window.api?.imports.execute?.({ fileBase64: base64, mapping })
            if (res) {
                setResult(res)
                // let app know data changed
                window.dispatchEvent(new Event('data-changed'))
                if ((res.errors?.length || 0) > 0) {
                    setShowErrorsModal(true)
                    if (res.errorFilePath) {
                        notify?.('info', `Fehler-Excel gespeichert: ${res.errorFilePath}`)
                    }
                } else {
                    notify?.('success', `Import abgeschlossen: ${res.imported} importiert, ${res.skipped} übersprungen`)
                }
            }
        } catch (e: any) {
            setResult(null)
            setError('Import fehlgeschlagen: ' + (e?.message || String(e)))
        } finally { setBusy(false) }
    }

    const fieldKeys: Array<{ key: string; label: string; required?: boolean; enumValues?: string[] }> = [
        { key: 'date', label: 'Datum', required: true },
        { key: 'type', label: 'Art (IN/OUT/TRANSFER)' },
        { key: 'sphere', label: 'Sphäre (IDEELL/ZWECK/VERMOEGEN/WGB)', required: true },
        { key: 'description', label: 'Beschreibung' },
        { key: 'paymentMethod', label: 'Zahlweg (BAR/BANK)' },
        { key: 'netAmount', label: 'Netto' },
        { key: 'vatRate', label: 'Umsatzsteuersatz in Prozent' },
        { key: 'grossAmount', label: 'Brutto' },
        { key: 'inGross', label: 'Einnahmen (Brutto)' },
        { key: 'outGross', label: 'Ausgaben (Brutto)' },
        { key: 'earmarkCode', label: 'Zweckbindung-Code' },
        { key: 'bankIn', label: 'Bankkonto + (Einnahmen)' },
        { key: 'bankOut', label: 'Bankkonto - (Ausgaben)' },
        { key: 'cashIn', label: 'Barkonto + (Einnahmen)' },
        { key: 'cashOut', label: 'Barkonto - (Ausgaben)' },
        { key: 'defaultSphere', label: 'Standard-Sphäre (Fallback)', enumValues: ['IDEELL', 'ZWECK', 'VERMOEGEN', 'WGB'] }
    ]

    // Helper to render a single mapping field with label and select
    const Field = ({ keyName, tooltip }: { keyName: string; tooltip?: string }) => {
        const f = fieldKeys.find(k => k.key === keyName)!
        const current = mapping[f.key] || ''
        const requiredMark = f.required ? ' *' : ''
        return (
            <label key={f.key} title={tooltip} className="field-row">
                <span className="field-label">
                    {f.label}{requiredMark}
                </span>
                {f.enumValues ? (
                    <select className="input" value={current} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value || null })}>
                        {f.enumValues.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                ) : (
                    <select className="input" value={current} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value || null })}>
                        <option value="">— nicht zuordnen —</option>
                        {headers.map(h => <option key={h} value={h}>{h || '(leer)'}</option>)}
                    </select>
                )}
            </label>
        )
    }

    return (
        <div className="card" style={{ padding: 12 }}>
            <input ref={fileRef} type="file" accept=".xlsx,.xml" hidden onChange={onPickFile} />
            <div
                className="input"
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                onDrop={onDrop}
                style={{
                    marginTop: 4,
                    padding: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    borderRadius: 12,
                    border: '1px dashed var(--border)'
                }}
                title="Datei hier ablegen oder auswählen"
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button type="button" className="btn" onClick={() => fileRef.current?.click()}>Datei auswählen</button>
                    <span className="helper">{fileName || 'Keine ausgewählt'}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn" onClick={async () => {
                        try {
                            const res = await window.api?.imports.template?.()
                            if (res) {
                                setError('')
                                setResult(null)
                                if (notify) notify('success', `Vorlage gespeichert: ${res.filePath}`)
                            }
                        } catch (e: any) {
                            const msg = e?.message || String(e)
                            if (msg && /abbruch/i.test(msg)) return
                            setError('Vorlage konnte nicht erstellt werden: ' + msg)
                            notify?.('error', 'Vorlage konnte nicht erstellt werden: ' + msg)
                        }
                    }}>Vorlage herunterladen</button>
                    <button className="btn" onClick={async () => {
                        try {
                            const res = await window.api?.imports.testdata?.()
                            if (res) {
                                setError('')
                                setResult(null)
                                if (notify) notify('success', `Testdatei gespeichert: ${res.filePath}`)
                            }
                        } catch (e: any) {
                            const msg = e?.message || String(e)
                            if (msg && /abbruch/i.test(msg)) return
                            setError('Testdatei konnte nicht erstellt werden: ' + msg)
                            notify?.('error', 'Testdatei konnte nicht erstellt werden: ' + msg)
                        }
                    }}>Testdatei erzeugen</button>
                    {/* Import-Button wandert nach unten, erscheint erst nach geladener Vorschau */}
                </div>
            </div>
            {busy && <div style={{ marginTop: 8 }}>Lade …</div>}
            {error && <div style={{ marginTop: 8, color: 'var(--danger)' }}>{error}</div>}
            {headers.length > 0 && (
                <div style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <strong>Zuordnung</strong>
                        <details>
                            <summary className="chip" title="Hinweise zur Datei-Struktur">ⓘ</summary>
                            <div className="helper" style={{ marginTop: 6 }}>
                                <ul style={{ margin: '4px 0 0 16px' }}>
                                    <li>Beste Lesbarkeit: Kopfzeile in Zeile 1, Daten ab Zeile 2.</li>
                                    <li>Erkannte Kopfzeile: Zeile {headerRowIndex || 1}.</li>
                                    <li>Keine zusammengeführten Zellen oder Leerzeilen im Kopfbereich.</li>
                                    <li>Ein Datensatz pro Zeile. Summen-/Saldo-Zeilen werden automatisch ignoriert.</li>
                                    <li>Mindestens Datum und ein Betrag (Brutto oder Netto+USt). Optional: Art (IN/OUT/TRANSFER), Sphäre, Zweckbindung, Zahlweg.</li>
                                    <li>Tipp: Nutze „Vorlage herunterladen“ bzw. „Testdatei erzeugen“ als Referenz.</li>
                                </ul>
                            </div>
                        </details>
                    </div>
                    <div className="helper">Ordne die Felder den Spaltenüberschriften deiner Datei zu.</div>
                    <div className="group-grid" style={{ marginTop: 8 }}>
                        <div className="field-group fg-meta">
                            <div className="group-title">📋 Basisdaten</div>
                            <Field keyName="date" tooltip="Datum der Buchung" />
                            <Field keyName="description" tooltip="Beschreibung / Verwendungszweck" />
                            <Field keyName="type" tooltip="Art der Buchung: Einnahme (IN), Ausgabe (OUT), Umbuchung (TRANSFER)" />
                            <Field keyName="sphere" tooltip="Sphäre aus der Datei. Wenn leer, wird die Standard-Sphäre genutzt." />
                            <Field keyName="earmarkCode" tooltip="Zweckbindung als Code/Abkürzung" />
                        </div>
                        <div className="field-group fg-amounts">
                            <div className="group-title">💶 Beträge</div>
                            <Field keyName="netAmount" tooltip="Netto-Betrag" />
                            <Field keyName="vatRate" tooltip="Umsatzsteuersatz in Prozent" />
                            <Field keyName="grossAmount" tooltip="Brutto-Betrag" />
                            <Field keyName="inGross" tooltip="Einnahmen (Brutto) – alternative Spalte" />
                            <Field keyName="outGross" tooltip="Ausgaben (Brutto) – alternative Spalte" />
                        </div>
                        <div className="field-group fg-payment">
                            <div className="group-title">💳 Zahlungsart</div>
                            <Field keyName="paymentMethod" tooltip="Zahlweg: BAR oder BANK" />
                        </div>
                        <div className="field-group fg-accounts">
                            <div className="group-title">🏦 Kontenspalten</div>
                            <Field keyName="bankIn" tooltip="Bankkonto Einnahmen (+)" />
                            <Field keyName="bankOut" tooltip="Bankkonto Ausgaben (-)" />
                            <Field keyName="cashIn" tooltip="Barkonto Einnahmen (+)" />
                            <Field keyName="cashOut" tooltip="Barkonto Ausgaben (-)" />
                        </div>
                        <div className="field-group fg-defaults">
                            <div className="group-title">⚙️ Standardwerte</div>
                            <div className="field-row" style={{ alignItems: 'center' }}>
                                <Field keyName="defaultSphere" tooltip="Fallback Sphäre, wenn keine Sphäre-Spalte zugeordnet ist" />
                                <span className="badge badge-default" title="Wird verwendet, wenn keine Sphäre-Spalte gewählt ist">Fallback</span>
                            </div>
                        </div>
                    </div>
                    <details className="mapping-summary" style={{ marginTop: 8 }}>
                        <summary>Zuordnungsübersicht</summary>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                            {fieldKeys.map(f => (
                                <div key={f.key} className="pair">
                                    <span className="k">{f.label}</span>
                                    <span className="v">{mapping[f.key] || '—'}</span>
                                </div>
                            ))}
                        </div>
                    </details>
                    <div className="helper" style={{ marginTop: 6 }}>
                        Hinweise:
                        <ul style={{ margin: '4px 0 0 16px' }}>
                            <li>Entweder Netto+USt oder Brutto muss zugeordnet sein – oder nutze die vier Spalten Bankkonto+/-, Barkonto+/-. Bei letzteren werden automatisch mehrere Buchungen je Zeile erzeugt.</li>
                            <li>„Standard-Sphäre“ wird verwendet, wenn keine Sphäre-Spalte vorhanden ist.</li>
                            <li>Summenzeilen wie „Ergebnis/Summe/Saldo“ werden automatisch übersprungen.</li>
                        </ul>
                    </div>
                </div>
            )}
            {/* Bottom-only Import button, shown once headers/preview are available */}
            {headers.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                    <button className="btn primary" onClick={onImport} disabled={!base64 || busy}>Import starten</button>
                </div>
            )}
            {sample.length > 0 && (
                <div style={{ marginTop: 12 }}>
                    <strong>Vorschau (erste 20 Zeilen)</strong>
                    <div style={{ overflowX: 'auto', marginTop: 6 }}>
                        <table cellPadding={6}>
                            <thead>
                                <tr>
                                    {headers.map(h => <th key={h} align="left">{h || '(leer)'}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {sample.map((row, i) => {
                                    // If we have a recent result, color-code by status: green for imported, dim/red for skipped/errors.
                                    const st = result?.rowStatuses?.find(rs => rs.row === ((headerRowIndex || 1) + 1 + i))
                                    const bg = st ? (st.ok ? 'color-mix(in oklab, var(--success) 12%, transparent)' : 'color-mix(in oklab, var(--danger) 10%, transparent)') : undefined
                                    const title = st?.message
                                    return (
                                        <tr key={i} style={{ background: bg }} title={title}>
                                            {headers.map(h => <td key={h}>{String(row[h] ?? '')}</td>)}
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            {result && (
                <div className="card" style={{ marginTop: 8, padding: 10 }}>
                    <strong>Ergebnis</strong>
                    <div className="helper">Importiert: {result.imported} | Übersprungen: {result.skipped}</div>
                    {result.errorFilePath && (
                        <div style={{ marginTop: 6 }}>
                            <div className="helper">Fehler-Datei gespeichert:</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                <code style={{ userSelect: 'all' }}>{result.errorFilePath}</code>
                                <button className="btn" onClick={() => { navigator.clipboard?.writeText(result.errorFilePath || ''); notify?.('info', 'Pfad in Zwischenablage kopiert') }}>Pfad kopieren</button>
                            </div>
                        </div>
                    )}
                    {result.errors?.length ? (
                        <details style={{ marginTop: 6 }}>
                            <summary>Fehlerdetails anzeigen ({result.errors.length})</summary>
                            <ul style={{ marginTop: 6 }}>
                                {result.errors.slice(0, 20).map((e, idx) => (
                                    <li key={idx}>Zeile {e.row}: {e.message}</li>
                                ))}
                                {result.errors.length > 20 && (
                                    <li>… weitere {result.errors.length - 20} Fehler</li>
                                )}
                            </ul>
                        </details>
                    ) : null}
                </div>
            )}
            {showErrorsModal && result && createPortal(
                <div className="modal-overlay" onClick={() => setShowErrorsModal(false)} role="dialog" aria-modal="true" style={{ zIndex: 10000 }}>
                    <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
                        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <h2 style={{ margin: 0 }}>Import abgeschlossen – einige Zeilen konnten nicht übernommen werden</h2>
                            <button className="btn danger" onClick={() => setShowErrorsModal(false)}>Schließen</button>
                        </header>
                        <div className="helper">Importiert: {result.imported} | Übersprungen: {result.skipped} | Fehler: {result.errors?.length || 0}</div>
                        {result.errorFilePath && (
                            <div style={{ marginTop: 8 }}>
                                <div className="helper">Die fehlgeschlagenen Zeilen wurden als Excel gespeichert unter:</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                    <code style={{ userSelect: 'all' }}>{result.errorFilePath}</code>
                                    <button className="btn" onClick={() => { navigator.clipboard?.writeText(result.errorFilePath || ''); notify?.('info', 'Pfad in Zwischenablage kopiert') }}>Pfad kopieren</button>
                                </div>
                            </div>
                        )}
                        {(result.errors?.length || 0) > 0 && (
                            <div style={{ marginTop: 12 }}>
                                <strong>Fehlerhafte Zeilen</strong>
                                <ul style={{ marginTop: 6, maxHeight: 280, overflowY: 'auto' }}>
                                    {result.errors.slice(0, 50).map((e, idx) => (
                                        <li key={idx}>Zeile {e.row}: {e.message}</li>
                                    ))}
                                    {result.errors.length > 50 && (
                                        <li>… weitere {result.errors.length - 50} Fehler – siehe gespeicherte Excel-Datei</li>
                                    )}
                                </ul>
                                <div className="helper" style={{ marginTop: 6 }}>Bitte prüfe die gelisteten Zeilen und trage die Datensätze bei Bedarf manuell nach.</div>
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                            <button className="btn" onClick={() => setShowErrorsModal(false)}>OK</button>
                        </div>
                    </div>
                </div>, document.body)
            }
        </div>
    )
}
// Simple drag-and-drop order list for columns
function DnDOrder({ order, cols, onChange, labelFor }: { order: string[]; cols: Record<string, boolean>; onChange: (o: string[]) => void; labelFor: (k: string) => string }) {
    const dragIndex = useRef<number | null>(null)
    function onDragStart(e: React.DragEvent<HTMLDivElement>, idx: number) {
        dragIndex.current = idx
        e.dataTransfer.effectAllowed = 'move'
    }
    function onDragOver(e: React.DragEvent<HTMLDivElement>) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
    }
    function onDrop(e: React.DragEvent<HTMLDivElement>, idx: number) {
        e.preventDefault()
        const from = dragIndex.current
        dragIndex.current = null
        if (from == null || from === idx) return
        const next = order.slice()
        const [moved] = next.splice(from, 1)
        next.splice(idx, 0, moved)
        onChange(next)
    }
    return (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            {order.map((k, idx) => {
                const visible = !!cols[k]
                return (
                    <div
                        key={k}
                        draggable
                        onDragStart={(e) => onDragStart(e, idx)}
                        onDragOver={onDragOver}
                        onDrop={(e) => onDrop(e, idx)}
                        title={visible ? 'Sichtbar' : 'Ausgeblendet – Reihenfolge bleibt erhalten'}
                        style={{
                            padding: '4px 8px',
                            borderRadius: 6,
                            border: '1px solid var(--border)',
                            background: visible ? 'var(--surface)' : 'color-mix(in oklab, var(--surface) 60%, transparent)',
                            opacity: visible ? 1 : 0.6,
                            cursor: 'grab',
                            userSelect: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6
                        }}
                    >
                        <span aria-hidden>☰</span>
                        <span>{labelFor(k)}</span>
                    </div>
                )
            })}
        </div>
    )
}

function ReceiptsView() {
    const [rows, setRows] = useState<Array<{ id: number; voucherNo: string; date: string; description?: string | null; fileCount?: number }>>([])
    const [page, setPage] = useState(1)
    const [limit, setLimit] = useState(20)
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(false)
    const [attachmentsModal, setAttachmentsModal] = useState<null | { voucherId: number; voucherNo: string; date: string; description: string }>(null)

    async function load() {
        setLoading(true)
        try {
            const res = await window.api?.vouchers.list?.({ limit, offset: (page - 1) * limit, sort: 'DESC' })
            if (res) {
                const withFiles = res.rows.filter(r => (r.fileCount || 0) > 0)
                setRows(withFiles.map(r => ({ id: r.id, voucherNo: r.voucherNo, date: r.date, description: r.description || '', fileCount: r.fileCount || 0 })))
                setTotal(res.total)
            }
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, [page, limit])

    // AttachmentsModal handles listing, preview and download

    return (
        <div className="card" style={{ padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>Belege</strong>
                <div className="helper">Buchungen mit angehängten Dateien</div>
            </div>
            {loading && <div>Lade …</div>}
            {!loading && rows.length > 0 && (
                <table cellPadding={6} style={{ marginTop: 8, width: '100%' }}>
                    <thead>
                        <tr>
                            <th align="left">Datum</th>
                            <th align="left">Nr.</th>
                            <th align="left">Beschreibung</th>
                            <th align="center">Belege</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(r => (
                            <tr key={r.id}>
                                <td>{r.date}</td>
                                <td>{r.voucherNo}</td>
                                <td>{r.description}</td>
                                <td align="center">
                                    <button
                                        className="btn"
                                        onClick={() => setAttachmentsModal({ voucherId: r.id, voucherNo: r.voucherNo, date: r.date, description: r.description || '' })}
                                        title="Belege anzeigen"
                                    >📎 {r.fileCount}</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            {!loading && rows.length === 0 && (
                <div className="card" style={{ padding: 16, marginTop: 12 }}>
                    <div style={{ display: 'grid', gap: 6 }}>
                        <div><strong>Keine Belege gefunden</strong></div>
                        <div className="helper">Es wurden noch keine Dateien an Buchungen angehängt. Du kannst in „Buchungen“ Belege hinzufügen oder neue Buchungen anlegen.</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn" onClick={() => (window as any).scrollTo?.(0,0) || null}>Nach oben</button>
                            <button className="btn primary" onClick={() => (document.querySelector('.fab-buchung') as HTMLButtonElement | null)?.click?.()}>+ Buchung</button>
                        </div>
                    </div>
                </div>
            )}
            {attachmentsModal && (
                <AttachmentsModal
                    voucher={attachmentsModal}
                    onClose={() => setAttachmentsModal(null)}
                />
            )}
        </div>
    )
}

function AttachmentsModal({ voucher, onClose }: { voucher: { voucherId: number; voucherNo: string; date: string; description: string }; onClose: () => void }) {
    const [files, setFiles] = useState<Array<{ id: number; fileName: string; mimeType?: string | null }>>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string>('')
    const [selectedId, setSelectedId] = useState<number | null>(null)
    const [confirmDelete, setConfirmDelete] = useState<null | { id: number; fileName: string }>(null)
    const [previewUrl, setPreviewUrl] = useState<string>('')
    const fileInputRef = useRef<HTMLInputElement | null>(null)

    useEffect(() => {
        let alive = true
        setLoading(true); setError('')
        window.api?.attachments.list?.({ voucherId: voucher.voucherId })
            .then(res => {
                if (!alive) return
                const rows = res?.files || []
                setFiles(rows)
                setSelectedId(rows[0]?.id ?? null)
            })
            .catch(e => setError(e?.message || String(e)))
            .finally(() => { if (alive) setLoading(false) })
        const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => { alive = false; window.removeEventListener('keydown', onKey) }
    }, [voucher.voucherId])

    async function refreshPreview(id: number | null) {
        setPreviewUrl('')
        if (id == null) return
        const f = files.find(x => x.id === id)
        if (!f) return
        const name = f.fileName || ''
        const mt = (f.mimeType || '').toLowerCase()
        const isImg = mt.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp)$/i.test(name)
        if (!isImg) return
        try {
            const res = await window.api?.attachments.read?.({ fileId: id })
            if (res) setPreviewUrl(`data:${res.mimeType || 'image/*'};base64,${res.dataBase64}`)
        } catch (e: any) {
            setError('Vorschau nicht möglich: ' + (e?.message || String(e)))
        }
    }

    useEffect(() => { refreshPreview(selectedId) }, [selectedId])

    const selected = files.find(f => f.id === selectedId) || null

    return createPortal(
        <div
            className="modal-overlay"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            style={{
                position: 'fixed', inset: 0,
                display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                background: 'color-mix(in oklab, var(--surface) 65%, transparent)',
                padding: '24px 16px', zIndex: 9999, overflowY: 'auto'
            }}
        >
            <div
                className="modal"
                onClick={(e) => e.stopPropagation()}
                style={{ width: 'min(980px, 96vw)', maxHeight: '92vh', overflow: 'hidden', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.25)', background: 'var(--surface)' }}
            >
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ overflow: 'hidden' }}>
                        <h2 style={{ margin: 0, fontSize: 16 }}>Belege zu #{voucher.voucherNo} – {voucher.date}</h2>
                        <div className="helper" title={voucher.description} style={{ maxWidth: '75ch', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{voucher.description || '—'}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn danger" onClick={onClose}>Schließen</button>
                        <button className="btn" disabled={!selected} onClick={() => selected && window.api?.attachments.open?.({ fileId: selected.id })}>Extern öffnen</button>
                        <button
                            className="btn"
                            disabled={!selected}
                            onClick={async () => {
                                if (!selected) return
                                try {
                                    const r = await window.api?.attachments.saveAs?.({ fileId: selected.id })
                                    if (r) alert('Gespeichert: ' + r.filePath)
                                } catch (e: any) {
                                    const m = e?.message || String(e)
                                    if (/Abbruch/i.test(m)) return
                                    alert('Speichern fehlgeschlagen: ' + m)
                                }
                            }}
                        >Herunterladen</button>
                        <input ref={fileInputRef} type="file" multiple hidden onChange={async (e) => {
                            const list = e.target.files
                            if (!list || !list.length) return
                            try {
                                for (const f of Array.from(list)) {
                                    const buf = await f.arrayBuffer()
                                    const dataBase64 = bufferToBase64Safe(buf)
                                    await window.api?.attachments.add?.({ voucherId: voucher.voucherId, fileName: f.name, dataBase64, mimeType: f.type || undefined })
                                }
                                const res = await window.api?.attachments.list?.({ voucherId: voucher.voucherId })
                                setFiles(res?.files || [])
                                setSelectedId((res?.files || [])[0]?.id ?? null)
                            } catch (e: any) {
                                alert('Upload fehlgeschlagen: ' + (e?.message || String(e)))
                            } finally {
                                if (fileInputRef.current) fileInputRef.current.value = ''
                            }
                        }} />
                        <button className="btn" onClick={() => fileInputRef.current?.click?.()}>+ Datei(en)</button>
                        <button className="btn danger" disabled={!selected} onClick={() => selected && setConfirmDelete({ id: selected.id, fileName: selected.fileName })}>🗑 Löschen</button>
                    </div>
                </header>
                {error && <div style={{ color: 'var(--danger)', margin: '0 8px 8px' }}>{error}</div>}
                {loading && <div style={{ margin: '0 8px 8px' }}>Lade …</div>}
                {!loading && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 300px) 1fr', gap: 12, minHeight: 320, padding: 8, boxSizing: 'border-box' }}>
                        <div className="card" style={{ padding: 8, overflow: 'auto', maxHeight: 'calc(92vh - 120px)' }}>
                            {files.length === 0 && <div className="helper">Keine Dateien vorhanden</div>}
                            {files.map(f => (
                                <button key={f.id} className="btn" style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 6, background: selectedId === f.id ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }} onClick={() => setSelectedId(f.id)}>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.fileName}</span>
                                </button>
                            ))}
                        </div>
                        <div className="card" style={{ padding: 8, display: 'grid', placeItems: 'center', background: 'var(--muted)', maxHeight: 'calc(92vh - 120px)', overflow: 'auto' }}>
                            {selected && previewUrl && (
                                <img src={previewUrl} alt={selected.fileName} style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain', borderRadius: 6 }} />
                            )}
                            {selected && !previewUrl && (
                                <div className="helper">Keine Vorschau verfügbar. Nutze „Extern öffnen“ oder „Herunterladen“.</div>
                            )}
                            {!selected && <div className="helper">Wähle eine Datei links aus.</div>}
                        </div>
                    </div>
                )}
                {confirmDelete && (
                    <div className="modal-overlay" onClick={() => setConfirmDelete(null)} role="dialog" aria-modal="true">
                        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, display: 'grid', gap: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ margin: 0 }}>Datei löschen</h3>
                                <button className="btn ghost" onClick={() => setConfirmDelete(null)} aria-label="Schließen">✕</button>
                            </div>
                            <div>
                                Möchtest du die Datei <strong>{confirmDelete.fileName}</strong> wirklich löschen?
                            </div>
                            <div className="helper">Dieser Vorgang kann nicht rückgängig gemacht werden.</div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                <button className="btn" onClick={() => setConfirmDelete(null)}>Abbrechen</button>
                                <button className="btn danger" onClick={async () => {
                                    try {
                                        await window.api?.attachments.delete?.({ fileId: confirmDelete.id })
                                        const res = await window.api?.attachments.list?.({ voucherId: voucher.voucherId })
                                        setFiles(res?.files || [])
                                        setSelectedId((res?.files || [])[0]?.id ?? null)
                                        setPreviewUrl('')
                                        setConfirmDelete(null)
                                    } catch (e: any) {
                                        alert('Löschen fehlgeschlagen: ' + (e?.message || String(e)))
                                    }
                                }}>Ja, löschen</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body
    )
}

// DomDebugger removed for release

// Batch assignment modal (Zweckbindung, Tags, Budget)
function BatchEarmarkModal({ onClose, earmarks, tagDefs, budgets, currentFilters, onApplied, notify }: {
    onClose: () => void
    earmarks: Array<{ id: number; code: string; name: string; color?: string | null }>
    tagDefs: Array<{ id: number; name: string; color?: string | null }>
    budgets: Array<{ id: number; label: string }>
    currentFilters: { paymentMethod?: 'BAR' | 'BANK'; sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; type?: 'IN' | 'OUT' | 'TRANSFER'; from?: string; to?: string; q?: string }
    onApplied: (updated: number) => void
    notify?: (type: 'success' | 'error' | 'info', text: string, ms?: number) => void
}) {
    const [mode, setMode] = useState<'EARMARK' | 'TAGS' | 'BUDGET'>('EARMARK')
    const [earmarkId, setEarmarkId] = useState<number | ''>('')
    const [onlyWithout, setOnlyWithout] = useState<boolean>(false)
    const [tagInput, setTagInput] = useState<string>('')
    const [selectedTags, setSelectedTags] = useState<string[]>([])
    const [budgetId, setBudgetId] = useState<number | ''>('')
    const [busy, setBusy] = useState(false)

    // helpers
    const selectedEarmark = earmarks.find(e => e.id === (typeof earmarkId === 'number' ? earmarkId : -1))
    const addTag = (t: string) => {
        const v = (t || '').trim()
        if (!v) return
        if (!selectedTags.some(x => x.toLowerCase() === v.toLowerCase())) setSelectedTags(prev => [...prev, v])
    }
    const removeTag = (name: string) => setSelectedTags(prev => prev.filter(t => t.toLowerCase() !== name.toLowerCase()))

    async function run() {
        try {
            setBusy(true)
            if (mode === 'EARMARK') {
                if (!earmarkId) { notify?.('error', 'Bitte eine Zweckbindung wählen'); return }
                const payload: any = { earmarkId: Number(earmarkId), ...currentFilters }
                if (onlyWithout) payload.onlyWithout = true
                const res = await window.api?.vouchers.batchAssignEarmark?.(payload)
                const n = res?.updated ?? 0
                onApplied(n)
                onClose()
            } else if (mode === 'TAGS') {
                const tags = selectedTags.length ? selectedTags : (tagInput || '').split(',').map(s => s.trim()).filter(Boolean)
                if (!tags.length) { notify?.('error', 'Bitte mindestens einen Tag angeben'); return }
                const res = await window.api?.vouchers.batchAssignTags?.({ tags, ...currentFilters })
                const n = res?.updated ?? 0
                onApplied(n)
                onClose()
            } else if (mode === 'BUDGET') {
                if (!budgetId) { notify?.('error', 'Bitte ein Budget wählen'); return }
                const payload: any = { budgetId: Number(budgetId), ...currentFilters }
                if (onlyWithout) payload.onlyWithout = true
                const res = await window.api?.vouchers.batchAssignBudget?.(payload)
                const n = res?.updated ?? 0
                onApplied(n)
                onClose()
            }
        } catch (e: any) {
            notify?.('error', e?.message || String(e))
        } finally { setBusy(false) }
    }

    return createPortal(
        <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <h2 style={{ margin: 0 }}>Batch zuweisen</h2>
                    <button className="btn danger" onClick={onClose}>Schließen</button>
                </header>
                <div className="row">
                    <div className="field" style={{ gridColumn: '1 / span 2' }}>
                        <label>Was soll zugewiesen werden?</label>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button className={`btn ${mode === 'EARMARK' ? 'primary' : ''}`} onClick={() => setMode('EARMARK')}>Zweckbindung</button>
                            <button className={`btn ${mode === 'TAGS' ? 'primary' : ''}`} onClick={() => setMode('TAGS')}>Tags</button>
                            <button className={`btn ${mode === 'BUDGET' ? 'primary' : ''}`} onClick={() => setMode('BUDGET')}>Budget</button>
                        </div>
                    </div>

                    {mode === 'EARMARK' && (
                        <>
                            <div className="field" style={{ gridColumn: '1 / span 2' }}>
                                <label>Zweckbindung</label>
                                <select className="input" value={earmarkId as any} onChange={(e) => setEarmarkId(e.target.value ? Number(e.target.value) : '')}>
                                    <option value="">— bitte wählen —</option>
                                    {earmarks.map(em => (
                                        <option key={em.id} value={em.id}>{em.code} – {em.name}</option>
                                    ))}
                                </select>
                                {selectedEarmark?.color && (
                                    <div className="helper" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                        <span>Farbe:</span>
                                        <span title={selectedEarmark.color || ''} style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 4, background: selectedEarmark.color || undefined }} />
                                    </div>
                                )}
                            </div>
                            <div className="field" style={{ gridColumn: '1 / span 2' }}>
                                <label><input type="checkbox" checked={onlyWithout} onChange={(e) => setOnlyWithout(e.target.checked)} /> Nur Buchungen ohne Zweckbindung aktualisieren</label>
                            </div>
                        </>
                    )}

                    {mode === 'TAGS' && (
                        <>
                            <div className="field" style={{ gridColumn: '1 / span 2' }}>
                                <label>Tags hinzufügen</label>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {(selectedTags || []).map(t => (
                                        <span key={t} className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                            {t}
                                            <button className="btn" title="Entfernen" onClick={() => removeTag(t)}>×</button>
                                        </span>
                                    ))}
                                </div>
                                <input className="input" placeholder="Tags, kommasepariert…" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && tagInput.trim()) { addTag(tagInput.trim()); setTagInput('') } }} />
                                {!!tagDefs.length && (
                                    <div className="helper">Vorschläge: {(tagDefs || []).slice(0, 8).map(t => (
                                        <button key={t.id} className="btn ghost" onClick={() => addTag(t.name)}>{t.name}</button>
                                    ))}</div>
                                )}
                                <div className="helper">Tipp: Mit Enter hinzufügen. Bereits existierende Tags werden automatisch wiederverwendet.</div>
                            </div>
                        </>
                    )}

                    {activePage === 'Buchungen' && (
                        <div className="card">
                            <JournalTable
                                rows={rows}
                                order={order}
                                cols={cols}
                                onReorder={(o: any) => setOrder(o as any)}
                                earmarks={earmarks}
                                tagDefs={tagDefs}
                                eurFmt={eurFmt}
                                fmtDate={fmtDate}
                                onEdit={(r) => setEditRow({
                                    ...r,
                                    mode: (r as any).grossAmount != null ? 'GROSS' : 'NET',
                                    netAmount: (r as any).netAmount ?? null,
                                    grossAmount: (r as any).grossAmount ?? null,
                                    vatRate: (r as any).vatRate ?? 0
                                } as any)}
                                onDelete={(r) => setDeleteRow(r)}
                                onToggleSort={(col: 'date' | 'net' | 'gross') => {
                                    setPage(1)
                                    setSortBy(col)
                                    setSortDir(prev => (col === sortBy ? (prev === 'DESC' ? 'ASC' : 'DESC') : 'DESC'))
                                }}
                                sortDir={sortDir}
                                sortBy={sortBy}
                                highlightId={flashId}
                                lockedUntil={periodLock?.closedUntil || null}
                                onTagClick={async (name) => {
                                    setFilterTag(name)
                                    setActivePage('Buchungen')
                                    setPage(1)
                                    await loadRecent()
                                }}
                                onEarmarkClick={async (id) => {
                                    setFilterEarmark(id)
                                    setActivePage('Buchungen')
                                    setPage(1)
                                    await loadRecent()
                                }}
                                onBudgetClick={async (id) => {
                                    setFilterBudgetId(id)
                                    setActivePage('Buchungen')
                                    setPage(1)
                                    await loadRecent()
                                }}
                            />
                            {/* Unified pagination footer (like Invoices) */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
                                <div className="helper">Gesamt: {totalRows}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <label className="helper">Pro Seite</label>
                                    <select className="input" value={journalLimit} onChange={e => { setJournalLimit(Number(e.target.value)); setPage(1) }} style={{ width: 80 }}>
                                        <option value={10}>10</option>
                                        <option value={20}>20</option>
                                        <option value={50}>50</option>
                                        <option value={100}>100</option>
                                    </select>
                                    <button className="btn" onClick={() => setPage(1)} disabled={page <= 1} title="Erste Seite" aria-label="Erste Seite" style={page <= 1 ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                            <polyline points="11 17 6 12 11 7" />
                                            <polyline points="18 17 13 12 18 7" />
                                        </svg>
                                    </button>
                                    <button className="btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} title="Zurück" aria-label="Zurück" style={page <= 1 ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>‹</button>
                                    <span className="helper">Seite {page} / {Math.max(1, Math.ceil((totalRows || 0) / journalLimit))}</span>
                                    <button className="btn" onClick={() => { const maxP = Math.max(1, Math.ceil((totalRows || 0) / journalLimit)); setPage(p => Math.min(maxP, p + 1)) }} disabled={page >= Math.max(1, Math.ceil((totalRows || 0) / journalLimit))} title="Weiter" aria-label="Weiter" style={page >= Math.max(1, Math.ceil((totalRows || 0) / journalLimit)) ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>›</button>
                                    <button className="btn" onClick={() => { const maxP = Math.max(1, Math.ceil((totalRows || 0) / journalLimit)); setPage(maxP) }} disabled={page >= Math.max(1, Math.ceil((totalRows || 0) / journalLimit))} title="Letzte Seite" aria-label="Letzte Seite" style={page >= Math.max(1, Math.ceil((totalRows || 0) / journalLimit)) ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: 'scaleX(-1)' }}>
                                            <polyline points="11 17 6 12 11 7" />
                                            <polyline points="18 17 13 12 18 7" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>