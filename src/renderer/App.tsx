import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import DbMigrateModal from './DbMigrateModal'
// Resolve app icon for titlebar (works with Vite bundling)
const appLogo: string = new URL('../../build/Icon.ico', import.meta.url).href

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
    // Perceived luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luminance > 0.6 ? '#000' : '#fff'
}

const EARMARK_PALETTE = ['#7C4DFF', '#2962FF', '#00B8D4', '#00C853', '#AEEA00', '#FFD600', '#FF9100', '#FF3D00', '#F50057', '#9C27B0']

function TopHeaderOrg() {
    const [org, setOrg] = useState<string>('')
    const [cashier, setCashier] = useState<string>('')
    useEffect(() => {
        let cancelled = false
        async function load() {
            try {
                const on = await (window as any).api?.settings?.get?.({ key: 'org.name' })
                const cn = await (window as any).api?.settings?.get?.({ key: 'org.cashier' })
                if (!cancelled) {
                    setOrg((on?.value as any) || '')
                    setCashier((cn?.value as any) || '')
                }
            } catch { }
        }
        load()
        const onChanged = () => load()
        window.addEventListener('data-changed', onChanged)
        return () => { cancelled = true; window.removeEventListener('data-changed', onChanged) }
    }, [])
    const text = [org || null, cashier || null].filter(Boolean).join(' | ')
    return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <img src={appLogo} alt="VereinO" width={20} height={20} style={{ borderRadius: 4, display: 'block' }} />
            {text ? (
                <div className="helper" title={text} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</div>
            ) : null}
        </div>
    )
}

export default function App() {
    // Global data refresh key to trigger summary re-fetches across views
    const [refreshKey, setRefreshKey] = useState(0)
    const bumpDataVersion = () => setRefreshKey((k) => k + 1)
    const [lastId, setLastId] = useState<number | null>(null) // Track last created voucher id
    const [flashId, setFlashId] = useState<number | null>(null) // Row highlight for newly created voucher
    // Toast notifications
    const [toasts, setToasts] = useState<Array<{ id: number; type: 'success' | 'error' | 'info'; text: string; action?: { label: string; onClick: () => void } }>>([])
    const toastIdRef = useRef(1)
    const notify = (type: 'success' | 'error' | 'info', text: string, ms = 3000, action?: { label: string; onClick: () => void }) => {
        const id = toastIdRef.current++
        setToasts(prev => [...prev, { id, type, text, action }])
        window.setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), ms)
    }
    // Map backend errors to friendlier messages (esp. earmark period issues)
    const friendlyError = (e: any) => {
        const msg = String(e?.message || e || '')
        if (/Zweckbindung.*liegt vor Beginn/i.test(msg)) return 'Warnung: Das Buchungsdatum liegt vor dem Startdatum der ausgewählten Zweckbindung.'
        if (/Zweckbindung.*liegt nach Ende/i.test(msg)) return 'Warnung: Das Buchungsdatum liegt nach dem Enddatum der ausgewählten Zweckbindung.'
        if (/Zweckbindung ist inaktiv/i.test(msg)) return 'Warnung: Die ausgewählte Zweckbindung ist inaktiv und kann nicht verwendet werden.'
        if (/Zweckbindung würde den verfügbaren Rahmen unterschreiten/i.test(msg)) return 'Warnung: Diese Änderung würde den verfügbaren Rahmen der Zweckbindung unterschreiten.'
        return 'Fehler: ' + msg
    }
    // Dynamic available years from vouchers
    const [yearsAvail, setYearsAvail] = useState<number[]>([])
    useEffect(() => {
        let cancelled = false
        async function loadYears() {
            try {
                const res = await window.api?.reports?.years?.()
                if (!cancelled && res?.years) setYearsAvail(res.years)
            } catch { }
        }
        loadYears()
        const onChanged = () => loadYears()
        window.addEventListener('data-changed', onChanged)
        return () => { cancelled = true; window.removeEventListener('data-changed', onChanged) }
    }, [])
    const [activePage, setActivePage] = useState<'Dashboard' | 'Buchungen' | 'Zweckbindungen' | 'Budgets' | 'Reports' | 'Belege' | 'Rechnungen' | 'Einstellungen'>(() => {
        try { return (localStorage.getItem('activePage') as any) || 'Buchungen' } catch { return 'Buchungen' }
    })

    const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
    // Navigation layout preference: 'left' classic sidebar vs 'top' icon-only header menu
    type NavLayout = 'left' | 'top'
    const [navLayout, setNavLayout] = useState<NavLayout>(() => {
        try { return (localStorage.getItem('ui.navLayout') as NavLayout) || 'left' } catch { return 'left' }
    })
    const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
        try { return localStorage.getItem('sidebarCollapsed') === '1' } catch { return false }
    })
    const [reportsTab, setReportsTab] = useState<string>(() => {
        try {
            const v = localStorage.getItem('reportsTab') || 'overview'
            return v === 'compare' ? 'overview' : v
        } catch { return 'overview' }
    })

    // UI preference: color theme palette
    type ColorTheme = 'default' | 'fiery-ocean' | 'peachy-delight' | 'pastel-dreamland' | 'ocean-breeze' | 'earthy-tones'
    const [colorTheme, setColorTheme] = useState<ColorTheme>(() => {
        try { return (localStorage.getItem('ui.colorTheme') as ColorTheme) || 'default' } catch { return 'default' }
    })
    useEffect(() => {
        try { localStorage.setItem('ui.colorTheme', colorTheme) } catch { }
        // apply on <html>
        try { document.documentElement.setAttribute('data-color-theme', colorTheme) } catch { }
    }, [colorTheme])
    // Period lock (year-end) status for UI controls (e.g., lock edit)
    const [periodLock, setPeriodLock] = useState<{ closedUntil: string | null } | null>(null)
    useEffect(() => {
        let alive = true
        async function load() {
            try { const s = await (window as any).api?.yearEnd?.status?.(); if (alive) setPeriodLock(s || { closedUntil: null }) } catch {}
        }
        load()
        const onChanged = () => load()
        window.addEventListener('data-changed', onChanged)
        return () => { alive = false; window.removeEventListener('data-changed', onChanged) }
    }, [])
    // Export options modal state (Reports)
    const [showExportOptions, setShowExportOptions] = useState<boolean>(false)
    type AmountMode = 'POSITIVE_BOTH' | 'OUT_NEGATIVE'
    const [exportFields, setExportFields] = useState<Array<'date' | 'voucherNo' | 'type' | 'sphere' | 'description' | 'paymentMethod' | 'netAmount' | 'vatAmount' | 'grossAmount' | 'tags'>>(['date', 'voucherNo', 'type', 'sphere', 'description', 'paymentMethod', 'netAmount', 'vatAmount', 'grossAmount'])
    const [exportOrgName, setExportOrgName] = useState<string>('')
    const [exportAmountMode, setExportAmountMode] = useState<AmountMode>('OUT_NEGATIVE')

    // DOM-Debug removed for release
    // const [domDebug, setDomDebug] = useState<boolean>(false)
    // Global Tags Manager modal state
    const [showTagsManager, setShowTagsManager] = useState<boolean>(false)
    // Time filter modal state
    const [showTimeFilter, setShowTimeFilter] = useState<boolean>(false)
    const [showMetaFilter, setShowMetaFilter] = useState<boolean>(false)
    useEffect(() => {
        try { localStorage.setItem('sidebarCollapsed', sidebarCollapsed ? '1' : '0') } catch { }
    }, [sidebarCollapsed])
    useEffect(() => { try { localStorage.setItem('ui.navLayout', navLayout) } catch { } }, [navLayout])

    useEffect(() => {
        try { localStorage.setItem('activePage', activePage) } catch { }
    }, [activePage])
    useEffect(() => {
        try { localStorage.setItem('reportsTab', reportsTab) } catch { }
    }, [reportsTab])
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
        if (filterBudgetId) chips.push({ key: 'budget', label: `Budget: #${filterBudgetId}`, clear: () => setFilterBudgetId(null) })
        if (q) chips.push({ key: 'q', label: `Suche: ${q}`.slice(0, 40) + (q.length > 40 ? '…' : ''), clear: () => setQ('') })
        return chips
    }, [from, to, filterSphere, filterType, filterPM, filterEarmark, filterBudgetId, filterTag, earmarks, q, fmtDate])

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
        'Budgets': '#00C853',
        'Zweckbindungen': '#FFD600',
        'Belege': '#FF9100',
        'Reports': '#F50057',
        'Einstellungen': '#9C27B0'
    }
    const isTopNav = navLayout === 'top'
    return (
        <div style={{ display: 'grid', gridTemplateColumns: isTopNav ? '1fr' : `${sidebarCollapsed ? '64px' : '240px'} 1fr`, gridTemplateRows: '56px 1fr', gridTemplateAreas: isTopNav ? '"top" "main"' : '"top top" "side main"', height: '100vh', overflow: 'hidden' }}>
            {/* Topbar with organisation header line */}
            <header
                style={{ gridArea: 'top', position: 'sticky', top: 0, zIndex: 1000, display: 'grid', gridTemplateColumns: isTopNav ? '1fr auto 1fr 104px' : '1fr 104px', alignItems: 'center', gap: 12, padding: '4px 8px', borderBottom: '1px solid var(--border)', backdropFilter: 'var(--blur)', background: 'color-mix(in oklab, var(--surface) 80%, transparent)', ['-webkit-app-region' as any]: 'drag' }}
                onDoubleClick={(e) => {
                    const target = e.target as HTMLElement
                    // Ignore double-clicks on interactive elements
                    if (target && target.closest('button, input, select, textarea, a, [role="button"]')) return
                    window.api?.window?.toggleMaximize?.()
                }}
            >
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ['-webkit-app-region' as any]: 'no-drag' }}>
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
                    <nav aria-label="Hauptmenü (oben)" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifySelf: 'center', ['-webkit-app-region' as any]: 'no-drag' }}>
                        {/* Groups: Dashboard | Buchungen/Rechnungen/Budgets/Zweckbindungen | Belege/Reports | Einstellungen */}
                        {[
                            [
                                { key: 'Dashboard', icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" /></svg>) }
                            ],
                            [
                                { key: 'Buchungen', icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 5h18v2H3V5zm0 6h18v2H3v-2zm0 6h12v2H3v-2z" /></svg>) },
                                { key: 'Rechnungen', icon: (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" role="img" aria-label="Rechnungen">
                                        <path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM14 3v5h5"/>
                                        <path d="M8 12h8v2H8zM8 16h8v2H8zM8 8h4v2H8z"/>
                                    </svg>
                                ) },
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
                <div style={{ display: 'inline-flex', gap: 4, justifySelf: 'end', ['-webkit-app-region' as any]: 'no-drag' }}>
                    <button className="btn ghost" title="Minimieren" aria-label="Minimieren" onClick={() => window.api?.window?.minimize?.()} style={{ width: 28, height: 28, padding: 0, display: 'grid', placeItems: 'center', borderRadius: 8 }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="11" width="14" height="2" rx="1"/></svg>
                    </button>
                    <button className="btn ghost" title="Maximieren / Wiederherstellen" aria-label="Maximieren" onClick={() => window.api?.window?.toggleMaximize?.()} style={{ width: 28, height: 28, padding: 0, display: 'grid', placeItems: 'center', borderRadius: 8 }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 6h12v12H6z"/></svg>
                    </button>
                    <button className="btn danger" title="Schließen" aria-label="Schließen" onClick={() => window.api?.window?.close?.()} style={{ width: 28, height: 28, padding: 0, display: 'grid', placeItems: 'center', borderRadius: 8 }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2"/></svg>
                    </button>
                </div>
            </header>
            {!isTopNav && (
                <aside aria-label="Seitenleiste" style={{ gridArea: 'side', display: 'flex', flexDirection: 'column', padding: 8, borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {/* Group 1: Dashboard */}
                                {[
                                    { key: 'Dashboard', label: 'Dashboard', icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" /></svg>) }
                                ].map(({ key, label, icon }) => (
                                    <button key={key} className="btn ghost" onClick={() => setActivePage(key as any)} style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, background: activePage === (key as any) ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }} title={label}>
                                        <span style={{ width: 22, display: 'inline-flex', justifyContent: 'center' }}>{icon}</span>
                                        {!sidebarCollapsed && <span>{label}</span>}
                                    </button>
                                ))}
                                <div aria-hidden style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
                                {/* Group 2: Buchungen, Rechnungen, Budgets, Zweckbindungen */}
                                {[
                                    { key: 'Buchungen', label: 'Buchungen', icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 5h18v2H3V5zm0 6h18v2H3v-2zm0 6h12v2H3v-2z" /></svg>) },
                                    { key: 'Rechnungen', label: 'Rechnungen', icon: (
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" role="img" aria-label="Rechnungen">
                                            <path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM14 3v5h5"/>
                                            <path d="M8 12h8v2H8zM8 16h8v2H8zM8 8h4v2H8z"/>
                                        </svg>
                                    ) },
                                    { key: 'Budgets', label: 'Budgets', icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 17h18v2H3v-2zm0-7h18v6H3V10zm0-5h18v2H3V5z" /></svg>) },
                                    { key: 'Zweckbindungen', label: 'Zweckbindungen', icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 7V3L1 9l11 6 9-4.91V17h2V9L12 3v4z" /></svg>) }
                                ].map(({ key, label, icon }) => (
                                    <button key={key} className="btn ghost" onClick={() => setActivePage(key as any)} style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, background: activePage === (key as any) ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }} title={label}>
                                        <span style={{ width: 22, display: 'inline-flex', justifyContent: 'center', color: navIconColorMode === 'color' ? navIconPalette[key] : undefined }}>{icon}</span>
                                        {!sidebarCollapsed && <span>{label}</span>}
                                    </button>
                                ))}
                                <div aria-hidden style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
                                {/* Group 3: Belege, Reports */}
                                {[
                                    { key: 'Belege', label: 'Belege', icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16l4-2 4 2 4-2 4 2V8l-6-6zM8 12h8v2H8v-2zm0-4h5v2H8V8z" /></svg>) },
                                    { key: 'Reports', label: 'Reports', icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 3h18v2H3V3zm2 4h14v14H5V7zm2 2v10h10V9H7z" /></svg>) }
                                ].map(({ key, label, icon }) => (
                                    <button key={key} className="btn ghost" onClick={() => setActivePage(key as any)} style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, background: activePage === (key as any) ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }} title={label}>
                                        <span style={{ width: 22, display: 'inline-flex', justifyContent: 'center', color: navIconColorMode === 'color' ? navIconPalette[key] : undefined }}>{icon}</span>
                                        {!sidebarCollapsed && <span>{label}</span>}
                                    </button>
                                ))}
                                <div aria-hidden style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
                                <button
                                    className="btn ghost"
                                    onClick={() => setActivePage('Einstellungen')}
                                    style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, background: activePage === 'Einstellungen' ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }}
                                    title="Einstellungen"
                                >
                                    <span style={{ width: 22, display: 'inline-flex', justifyContent: 'center', color: navIconColorMode === 'color' ? navIconPalette['Einstellungen'] : undefined }}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94a7.97 7.97 0 0 0 .06-1l2.03-1.58-1.92-3.32-2.39.5a7.97 7.97 0 0 0-1.73-1l-.36-2.43h-3.84l-.36 2.43a7.97 7.97 0 0 0-1.73 1l-2.39-.5-1.92 3.32L4.8 11.94c0 .34.02.67.06 1L2.83 14.5l1.92 3.32 2.39-.5c.53.4 1.12.74 1.73 1l.36 2.43h3.84l.36-2.43c.61-.26 1.2-.6 1.73-1l2.39.5 1.92-3.32-2.03-1.56zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z" /></svg>
                                    </span>
                                    {!sidebarCollapsed && <span>Einstellungen</span>}
                                </button>
                                </div>
                </aside>
            )}

            {/* Main content */}
            <main style={{ gridArea: 'main', padding: 16, overflowY: 'auto' }}>
                <div className="container">
                    {activePage === 'Dashboard' && <h1>Dashboard</h1>}
                    {activePage === 'Rechnungen' && (
                        <InvoicesView />
                    )}
                    {activePage === 'Buchungen' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                            <h1 style={{ margin: 0 }}>Buchungen</h1>
                            <input ref={searchInputRef} className="input" placeholder="Suche Buchungen (Ctrl+K)" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginLeft: 8, width: 340 }} />
                            {/* Moved Zeit & Sphäre next to search */}
                            <span style={{ color: 'var(--text-dim)' }}>Zeit:</span>
                            <button className="btn" title="Zeitraum/Jahr wählen" onClick={() => setShowTimeFilter(true)}>
                                {/* clock icon */}
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 1a11 11 0 1 0 11 11A11.013 11.013 0 0 0 12 1Zm0 20a9 9 0 1 1 9-9 9.01 9.01 0 0 1-9 9Zm.5-14h-2v6l5.2 3.12 1-1.64-4.2-2.48Z" /></svg>
                            </button>
                            <button className="btn" title="Sphäre/Zweckbindung/Budget wählen" onClick={() => setShowMetaFilter(true)}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                    <path d="M3 5h18v2H3zM6 10h12v2H6zM9 15h6v2H9z"/>
                                </svg>
                            </button>
                            {/* Compact badges for key active filters: Zweckbindung, Tag, Budget */}
                            {filterEarmark != null && (() => {
                                const em = earmarks.find(e => e.id === filterEarmark)
                                const bg = em?.color || undefined
                                const fg = contrastText(bg)
                                return (
                                    <span
                                        key="badge-earmark"
                                        className="badge"
                                        title={`Zweckbindung: ${em?.code || ('#' + filterEarmark)}`}
                                        onClick={async () => { setFilterEarmark(null); setPage(1); await loadRecent() }}
                                        style={{ cursor: 'pointer', background: bg, color: bg ? fg : undefined }}
                                    >
                                        🎯 {em?.code || ('#' + filterEarmark)}
                                    </span>
                                )
                            })()}
                            {filterTag && (() => {
                                const td = (tagDefs || []).find(t => (t.name || '').toLowerCase() === (filterTag || '').toLowerCase())
                                const bg = td?.color || undefined
                                const fg = contrastText(bg)
                                return (
                                    <span
                                        key="badge-tag"
                                        className="badge"
                                        title={`Tag: ${filterTag}`}
                                        onClick={async () => { setFilterTag(null); setPage(1); await loadRecent() }}
                                        style={{ cursor: 'pointer', background: bg, color: bg ? fg : undefined }}
                                    >
                                        # {filterTag}
                                    </span>
                                )
                            })()}
                            {filterBudgetId != null && (() => {
                                const b = budgets.find(bb => bb.id === filterBudgetId)
                                const bg = (b as any)?.color || undefined
                                const fg = contrastText(bg)
                                const label = (() => {
                                    if (!b) return `Budget #${filterBudgetId}`
                                    const nm = (b.name && b.name.trim()) || b.categoryName || b.projectName || String(b.year)
                                    return nm
                                })()
                                return (
                                    <span
                                        key="badge-budget"
                                        className="badge"
                                        title={`Budget: ${label}`}
                                        onClick={async () => { setFilterBudgetId(null); setPage(1); await loadRecent() }}
                                        style={{ cursor: 'pointer', background: bg, color: bg ? fg : undefined }}
                                    >
                                        💰 {label}
                                    </span>
                                )
                            })()}
                            {/* Active filter indicator: clears all filters on click */}
                            {activeChips.length > 0 && (
                                <button
                                    className="btn"
                                    title="Filter aktiv – Klick zum Zurücksetzen"
                                    onClick={async () => {
                                        setFrom(''); setTo(''); setFilterSphere(null); setFilterType(null); setFilterPM(null); setFilterEarmark(null); setFilterBudgetId(null); setFilterTag(null); setQ(''); setPage(1);
                                        await loadRecent()
                                    }}
                                    style={{ background: 'color-mix(in oklab, var(--accent) 20%, transparent)', borderColor: 'var(--accent)' }}
                                >
                                    Filter aktiv • Zurücksetzen
                                </button>
                            )}
                        </div>
                    )}
                    {activePage === 'Reports' && <h1>Reports</h1>}
                    {activePage === 'Zweckbindungen' && <h1>Zweckbindungen</h1>}
                    {activePage === 'Budgets' && <h1>Budgets</h1>}
                    {activePage === 'Dashboard' && (
                        <DashboardView today={today} />
                    )}
                    {activePage === 'Buchungen' && (
                        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
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
                            <button className="btn" onClick={() => loadRecent()}>Aktualisieren</button>
                            {/* Batch assign action (earmark/tags/budget) */}
                            <button
                                className="btn"
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
                                </div>
                                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <button className="btn" onClick={() => setShowExportOptions(true)}>Exportieren…</button>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button className="btn ghost" onClick={() => setReportsTab('overview')} style={{ background: reportsTab === 'overview' ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }}>Übersicht</button>
                                        <button className="btn ghost" onClick={() => setReportsTab('monthly')} style={{ background: reportsTab === 'monthly' ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }}>Monatsverlauf</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    {activePage === 'Reports' && reportsTab === 'overview' && (
                        <>
                            <ReportsSummary refreshKey={refreshKey} from={from || undefined} to={to || undefined} sphere={filterSphere || undefined} type={filterType || undefined} paymentMethod={filterPM || undefined} />
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <ReportsSphereDonut refreshKey={refreshKey} from={from || undefined} to={to || undefined} />
                                <ReportsPaymentMethodBars refreshKey={refreshKey} from={from || undefined} to={to || undefined} />
                            </div>
                        </>
                    )}
                    {activePage === 'Reports' && reportsTab === 'monthly' && (
                        <>
                            <ReportsMonthlyChart refreshKey={refreshKey} from={from || undefined} to={to || undefined} sphere={filterSphere || undefined} type={filterType || undefined} paymentMethod={filterPM || undefined} />
                            <ReportsInOutLines refreshKey={refreshKey} from={from || undefined} to={to || undefined} sphere={filterSphere || undefined} />
                        </>
                    )}

                    {activePage === 'Buchungen' && activeChips.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 8px' }}>
                            {activeChips.map((c) => (
                                <span key={c.key} className="chip">
                                    {c.label}
                                    <button className="chip-x" onClick={c.clear} aria-label={`Filter ${c.key} löschen`}>×</button>
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Status card removed; replaced by toasts */}

                    {/* Heading removed per request */}
                    {activePage === 'Buchungen' && (
                        <FilterTotals refreshKey={refreshKey} from={from || undefined} to={to || undefined} paymentMethod={filterPM || undefined} sphere={filterSphere || undefined} type={filterType || undefined} earmarkId={filterEarmark || undefined} q={q || undefined} tag={filterTag || undefined} />
                    )}
                    {activePage === 'Buchungen' && (
                        <div>
                            <div className="card">
                                {/* Pagination controls */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                                    <div className="helper">Seite {page} von {Math.max(1, Math.ceil((totalRows || 0) / journalLimit))} — {totalRows} Einträge</div>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button className="btn" onClick={() => { setPage(1) }} disabled={page <= 1} style={page <= 1 ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>⏮</button>
                                        <button className="btn" onClick={() => { setPage(p => Math.max(1, p - 1)) }} disabled={page <= 1} style={page <= 1 ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>‹ Zurück</button>
                                        <button className="btn" onClick={() => { const maxP = Math.max(1, Math.ceil((totalRows || 0) / journalLimit)); setPage(p => Math.min(maxP, p + 1)) }} disabled={page >= Math.max(1, Math.ceil((totalRows || 0) / journalLimit))} style={page >= Math.max(1, Math.ceil((totalRows || 0) / journalLimit)) ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>Weiter ›</button>
                                        <button className="btn" onClick={() => { const maxP = Math.max(1, Math.ceil((totalRows || 0) / journalLimit)); setPage(maxP) }} disabled={page >= Math.max(1, Math.ceil((totalRows || 0) / journalLimit))} style={page >= Math.max(1, Math.ceil((totalRows || 0) / journalLimit)) ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>⏭</button>
                                    </div>
                                </div>
                                <JournalTable
                                    rows={rows}
                                    order={order}
                                    cols={cols}
                                    onReorder={(o: any) => setOrder(o as any)}
                                    earmarks={earmarks}
                                    tagDefs={tagDefs}
                                    eurFmt={eurFmt}
                                    fmtDate={fmtDate}
                                    onEdit={(r) => setEditRow(r)}
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
                                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                                        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                            <h2 style={{ margin: 0 }}>Buchung bearbeiten</h2>
                                            <button className="btn danger" onClick={() => setEditRow(null)}>Schließen</button>
                                        </header>
                                        <div className="row">
                                            <div className="field">
                                                <label>Datum</label>
                                                <input className="input" type="date" value={editRow.date} onChange={(e) => setEditRow({ ...editRow, date: e.target.value })} />
                                            </div>
                                            <div className="field">
                                                <label>Art</label>
                                                <select className="input" value={editRow.type ?? ''} onChange={(e) => setEditRow({ ...editRow, type: (e.target.value as any) || undefined })}>
                                                    <option value="">—</option>
                                                    <option value="IN">IN</option>
                                                    <option value="OUT">OUT</option>
                                                    <option value="TRANSFER">TRANSFER</option>
                                                </select>
                                            </div>
                                            <div className="field">
                                                <label>Sphäre</label>
                                                <select className="input" value={editRow.sphere ?? ''} disabled={editRow.type === 'TRANSFER'} onChange={(e) => setEditRow({ ...editRow, sphere: (e.target.value as any) || undefined })}>
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
                                                    <select className="input" value={`${editRow.transferFrom ?? ''}->${editRow.transferTo ?? ''}`}
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
                                                <div className="field">
                                                    <label>Zahlweg</label>
                                                    <select className="input" value={editRow.paymentMethod ?? ''} onChange={(e) => setEditRow({ ...editRow, paymentMethod: (e.target.value as any) || null })}>
                                                        <option value="">—</option>
                                                        <option value="BAR">Bar</option>
                                                        <option value="BANK">Bank</option>
                                                    </select>
                                                </div>
                                            )}
                                            <div className="field">
                                                <label>Zweckbindung</label>
                                                <select className="input" value={(editRow.earmarkId ?? '') as any} onChange={(e) => setEditRow({ ...editRow, earmarkId: e.target.value ? Number(e.target.value) : null })}>
                                                    <option value="">—</option>
                                                    {earmarks.map(em => (
                                                        <option key={em.id} value={em.id}>{em.code} – {em.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="field">
                                                <label>Budget</label>
                                                <select className="input" value={(editRow.budgetId ?? '') as any} onChange={(e) => setEditRow({ ...editRow, budgetId: e.target.value ? Number(e.target.value) : null })}>
                                                    <option value="">—</option>
                                                    {budgetsForEdit.map(b => (
                                                        <option key={b.id} value={b.id}>{b.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="field" style={{ gridColumn: '1 / span 2' }}>
                                                <label>Beschreibung</label>
                                                <input className="input" value={editRow.description ?? ''} onChange={(e) => setEditRow({ ...editRow, description: e.target.value })} />
                                            </div>
                                            <TagsEditor
                                                label="Tags"
                                                value={editRow.tags || []}
                                                onChange={(tags) => setEditRow({ ...editRow, tags })}
                                                tagDefs={tagDefs}
                                            />
                                            {/* Attachments management */}
                                            <div className="card" style={{ gridColumn: '1 / span 2', padding: 10 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <strong>Anhänge</strong>
                                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
                                                        <button className="btn" onClick={() => editFileInputRef.current?.click?.()}>+ Datei(en)</button>
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
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 12 }}>
                                            <div>
                                                <button className="btn danger" title="Löschen" onClick={() => { setDeleteRow({ id: editRow.id, voucherNo: (editRow as any)?.voucherNo as any, description: editRow.description ?? null, fromEdit: true }); }}>
                                                    🗑 Löschen
                                                </button>
                                            </div>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <button className="btn" onClick={() => setEditRow(null)}>Abbrechen</button>
                                                <button className="btn primary" onClick={async () => {
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
                                                    const res = await window.api?.vouchers.update?.(payload)
                                                    notify('success', 'Buchung gespeichert')
                                                    const w = (res as any)?.warnings as string[] | undefined
                                                    if (w && w.length) { for (const msg of w) notify('info', 'Warnung: ' + msg) }
                                                    // Flash the updated row
                                                    setFlashId(editRow.id); window.setTimeout(() => setFlashId((cur) => (cur === editRow.id ? null : cur)), 3000)
                                                    setEditRow(null); await loadRecent(); bumpDataVersion()
                                                } catch (e: any) {
                                                    notify('error', friendlyError(e))
                                                }
                                            }}>Speichern</button>
                                            </div>
                                        </div>
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
                            tagDefs={tagDefs}
                            setTagDefs={setTagDefs}
                            notify={notify}
                            bumpDataVersion={bumpDataVersion}
                            openTagsManager={() => setShowTagsManager(true)}
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
                                        <button className="btn" onClick={loadBindings}>Aktualisieren</button>
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
                                                    <button className="btn danger" onClick={() => setDeleteBinding({ id: b.id, code: b.code, name: b.name })}>🗑</button>
                                                </td>
                                            </tr>
                                        ))}
                                        {bindings.length === 0 && (
                                            <tr>
                                                <td colSpan={6} style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Keine Zweckbindungen vorhanden.</td>
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
                                {deleteBinding && (
                                    <div className="modal-overlay" onClick={() => setDeleteBinding(null)}>
                                        <div className="modal" onClick={(e) => e.stopPropagation()}>
                                            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                                <h2 style={{ margin: 0 }}>Zweckbindung löschen</h2>
                                                <button className="btn danger" onClick={() => setDeleteBinding(null)}>Schließen</button>
                                            </header>
                                            <p>Möchtest du die Zweckbindung <strong>{deleteBinding.code}</strong> – {deleteBinding.name} wirklich löschen?</p>
                                            <div className="helper">Hinweis: Die Zuordnung bestehender Buchungen bleibt unverändert, es wird nur die Zweckbindung entfernt.</div>
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                                                <button className="btn" onClick={() => setDeleteBinding(null)}>Abbrechen</button>
                                                <button className="btn danger" onClick={async () => {
                                                    try {
                                                        await window.api?.bindings.delete?.({ id: deleteBinding.id })
                                                        notify('success', 'Zweckbindung gelöscht')
                                                        setDeleteBinding(null)
                                                        await loadBindings()
                                                        await loadEarmarks()
                                                    } catch (e: any) {
                                                        notify('error', e?.message || String(e))
                                                    }
                                                }}>Ja, löschen</button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <EarmarkUsageCards
                                bindings={bindings}
                                from={from || undefined}
                                to={to || undefined}
                                sphere={filterSphere || undefined}
                            />
                        </>
                    )}

                    {activePage === 'Budgets' && (
                        <div className="card" style={{ padding: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div className="helper">Budgets verwalten und Fortschritt verfolgen</div>
                                <button className="btn primary" onClick={() => setEditBudget({ year: new Date().getFullYear(), sphere: 'IDEELL', amountPlanned: 0, categoryId: null, projectId: null, earmarkId: null })}>+ Neu</button>
                            </div>
                            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                                <button className="btn" onClick={loadBudgets}>Aktualisieren</button>
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
                                                <button className="btn danger" onClick={() => setDeleteBudget({ id: b.id, name: b.name ?? null })}>🗑</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {/* Tiles UI */}
                            <BudgetTiles budgets={budgets as any} eurFmt={eurFmt} onEdit={(b) => setEditBudget({ id: b.id, year: b.year, sphere: b.sphere, categoryId: b.categoryId ?? null, projectId: b.projectId ?? null, earmarkId: b.earmarkId ?? null, amountPlanned: b.amountPlanned, name: b.name ?? null, categoryName: b.categoryName ?? null, projectName: b.projectName ?? null, startDate: b.startDate ?? null, endDate: b.endDate ?? null, color: b.color ?? null } as any)} />
                            {editBudget && (
                                <BudgetModal
                                    value={editBudget as any}
                                    onClose={() => setEditBudget(null)}
                                    onSaved={async () => { notify('success', 'Budget gespeichert'); await loadBudgets() }}
                                />
                            )}
                            {deleteBudget && (
                                <div className="modal-overlay" onClick={() => setDeleteBudget(null)}>
                                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                                        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                            <h2 style={{ margin: 0 }}>Budget löschen</h2>
                                            <button className="btn danger" onClick={() => setDeleteBudget(null)}>Schließen</button>
                                        </header>
                                        <p>Möchtest du das Budget {deleteBudget.name ? (<strong>"{deleteBudget.name}"</strong>) : (<strong>#{deleteBudget.id}</strong>)} wirklich löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.</p>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                                            <button className="btn" onClick={() => setDeleteBudget(null)}>Abbrechen</button>
                                            <button className="btn danger" onClick={async () => { await window.api?.budgets.delete?.({ id: deleteBudget.id }); setDeleteBudget(null); notify('success', 'Budget gelöscht'); await loadBudgets() }}>Ja, löschen</button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
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
                            <div className="card" style={{ padding: 12 }}>
                                <div className="helper" style={{ marginBottom: 6 }}>Basis</div>
                                <div className="row">
                                    <div className="field">
                                        <label>Datum</label>
                                        <input className="input" type="date" value={qa.date} onChange={(e) => setQa({ ...qa, date: e.target.value })} required />
                                    </div>
                                    <div className="field">
                                        <label>Art</label>
                                        <div className="btn-group" role="group" aria-label="Art wählen">
                                            {(['IN','OUT','TRANSFER'] as const).map(t => (
                                                <button key={t} type="button" className="btn" onClick={() => setQa({ ...qa, type: t })} style={{ background: qa.type === t ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined, color: t==='IN' ? 'var(--success)' : t==='OUT' ? 'var(--danger)' : undefined }}>{t}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="field">
                                        <label>Sphäre</label>
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
                                        <div className="field">
                                            <label>Zahlweg</label>
                                            <div className="btn-group" role="group" aria-label="Zahlweg wählen">
                                                {(['BAR','BANK'] as const).map(pm => (
                                                    <button key={pm} type="button" className="btn" onClick={() => setQa({ ...qa, paymentMethod: pm })} style={{ background: (qa as any).paymentMethod === pm ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }}>{pm === 'BAR' ? 'Bar' : 'Bank'}</button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Block B – Finanzdetails */}
                            <div className="card" style={{ padding: 12 }}>
                                <div className="helper" style={{ marginBottom: 6 }}>Finanzen</div>
                                <div className="row">
                                    {qa.type === 'TRANSFER' ? (
                                        <div className="field" style={{ gridColumn: '1 / -1' }}>
                                            <label>Betrag (Transfer)</label>
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
                                                <label>{(qa as any).mode === 'GROSS' ? 'Brutto' : 'Netto'}</label>
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
                            </div>
                            </div>

                            {/* Block C – Beschreibung & Tags */}
                            <div className="card" style={{ padding: 12, marginBottom: 8 }}>
                                <div className="helper" style={{ marginBottom: 6 }}>Beschreibung & Tags</div>
                                <div className="row">
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
                            </div>

                            {/* Block D – Anhänge */}
                            <div
                                className="card"
                                style={{ marginTop: 0, padding: 12 }}
                                onDragOver={(e) => { if (quickAdd) { e.preventDefault(); e.stopPropagation() } }}
                                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (quickAdd) onDropFiles(e.dataTransfer?.files) }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                        <strong>Anhänge</strong>
                                        <div className="helper">Dateien hierher ziehen oder per Button/Ctrl+U auswählen</div>
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
            <div className="toast-container" aria-live="polite" aria-atomic="true">
                {toasts.map(t => (
                    <div key={t.id} className={`toast ${t.type}`} role="status" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span className="title">{t.type === 'error' ? 'Fehler' : t.type === 'success' ? 'OK' : 'Info'}</span>
                        <span style={{ flex: 1 }}>{t.text}</span>
                        {t.action && (
                            <button className="btn" onClick={() => t.action?.onClick?.()}>{t.action.label}</button>
                        )}
                    </div>
                ))}
            </div>
            {/* Global Floating Action Button: + Buchung (hidden in Einstellungen) */}
            {activePage !== 'Einstellungen' && (
                <button className="fab fab-buchung" onClick={() => setQuickAdd(true)} title="+ Buchung">+ Buchung</button>
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
                                amountMode: exportAmountMode
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
        </div>
    )
}
// Meta Filter Modal: groups Sphäre, Zweckbindung, Budget
function MetaFilterModal({ open, onClose, budgets, earmarks, sphere, earmarkId, budgetId, onApply }: {
    open: boolean
    onClose: () => void
    budgets: Array<{ id: number; name?: string | null; categoryName?: string | null; projectName?: string | null; year: number }>
    earmarks: Array<{ id: number; code: string; name?: string | null }>
    sphere: null | 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
    earmarkId: number | null
    budgetId: number | null
    onApply: (v: { sphere: null | 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; earmarkId: number | null; budgetId: number | null }) => void
}) {
    const [s, setS] = useState<null | 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'>(sphere)
    const [e, setE] = useState<number | null>(earmarkId)
    const [b, setB] = useState<number | null>(budgetId)
    useEffect(() => { setS(sphere); setE(earmarkId); setB(budgetId) }, [sphere, earmarkId, budgetId, open])
    const labelForBudget = (bud: { id: number; name?: string | null; categoryName?: string | null; projectName?: string | null; year: number }) =>
        (bud.name && bud.name.trim()) || bud.categoryName || bud.projectName || String(bud.year)
    return open ? (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <h2 style={{ margin: 0 }}>Filter wählen</h2>
                    <button className="btn danger" onClick={onClose}>Schließen</button>
                </header>
                <div className="row">
                    <div className="field">
                        <label>Sphäre</label>
                        <select className="input" value={s ?? ''} onChange={(ev) => setS((ev.target.value as any) || null)}>
                            <option value="">Alle</option>
                            <option value="IDEELL">IDEELL</option>
                            <option value="ZWECK">ZWECK</option>
                            <option value="VERMOEGEN">VERMOEGEN</option>
                            <option value="WGB">WGB</option>
                        </select>
                    </div>
                    <div className="field">
                        <label>Zweckbindung</label>
                        <select className="input" value={e ?? ''} onChange={(ev) => setE(ev.target.value ? Number(ev.target.value) : null)}>
                            <option value="">Alle</option>
                            {earmarks.map(em => (
                                <option key={em.id} value={em.id}>{em.code} – {em.name || ''}</option>
                            ))}
                        </select>
                    </div>
                    <div className="field">
                        <label>Budget</label>
                        <select className="input" value={b ?? ''} onChange={(ev) => setB(ev.target.value ? Number(ev.target.value) : null)}>
                            <option value="">Alle</option>
                            {budgets.map(bu => (
                                <option key={bu.id} value={bu.id}>{labelForBudget(bu)}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                    <button className="btn" onClick={() => { setS(null); setE(null); setB(null) }}>Zurücksetzen</button>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn" onClick={onClose}>Abbrechen</button>
                        <button className="btn primary" onClick={() => { onApply({ sphere: s, earmarkId: e, budgetId: b }); onClose() }}>Übernehmen</button>
                    </div>
                </div>
            </div>
        </div>
    ) : null
}

// Time Filter Modal: controls date range and quick year selection
function TimeFilterModal({ open, onClose, yearsAvail, from, to, onApply }: {
    open: boolean
    onClose: () => void
    yearsAvail: number[]
    from: string
    to: string
    onApply: (v: { from: string; to: string }) => void
}) {
    const [f, setF] = useState<string>(from)
    const [t, setT] = useState<string>(to)
    useEffect(() => { setF(from); setT(to) }, [from, to, open])
    return open ? (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <h2 style={{ margin: 0 }}>Zeitraum wählen</h2>
                    <button className="btn danger" onClick={onClose}>Schließen</button>
                </header>
                <div className="row">
                    <div className="field">
                        <label>Von</label>
                        <input className="input" type="date" value={f} onChange={(e) => setF(e.target.value)} />
                    </div>
                    <div className="field">
                        <label>Bis</label>
                        <input className="input" type="date" value={t} onChange={(e) => setT(e.target.value)} />
                    </div>
                    <div className="field" style={{ gridColumn: '1 / span 2' }}>
                        <label>Schnellauswahl Jahr</label>
                        <select className="input" value={(() => {
                            if (!f || !t) return ''
                            const fy = f.slice(0, 4)
                            const ty = t.slice(0, 4)
                            // full-year only when matching boundaries
                            if (f === `${fy}-01-01` && t === `${fy}-12-31` && fy === ty) return fy
                            return ''
                        })()} onChange={(e) => {
                            const y = e.target.value
                            if (!y) { setF(''); setT(''); return }
                            const yr = Number(y)
                            const nf = new Date(Date.UTC(yr, 0, 1)).toISOString().slice(0, 10)
                            const nt = new Date(Date.UTC(yr, 11, 31)).toISOString().slice(0, 10)
                            setF(nf); setT(nt)
                        }}>
                            <option value="">—</option>
                            {yearsAvail.map((y) => <option key={y} value={String(y)}>{y}</option>)}
                        </select>
                    </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                    <button className="btn" onClick={() => { setF(''); setT('') }}>Zurücksetzen</button>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn" onClick={onClose}>Abbrechen</button>
                        <button className="btn primary" onClick={() => { onApply({ from: f, to: t }); onClose() }}>Übernehmen</button>
                    </div>
                </div>
            </div>
        </div>
    ) : null
}

// Export Options Modal for Reports
function ExportOptionsModal({ open, onClose, fields, setFields, orgName, setOrgName, amountMode, setAmountMode, onExport }: {
    open: boolean
    onClose: () => void
    fields: Array<'date' | 'voucherNo' | 'type' | 'sphere' | 'description' | 'paymentMethod' | 'netAmount' | 'vatAmount' | 'grossAmount' | 'tags'>
    setFields: (f: Array<'date' | 'voucherNo' | 'type' | 'sphere' | 'description' | 'paymentMethod' | 'netAmount' | 'vatAmount' | 'grossAmount' | 'tags'>) => void
    orgName: string
    setOrgName: (v: string) => void
    amountMode: 'POSITIVE_BOTH' | 'OUT_NEGATIVE'
    setAmountMode: (m: 'POSITIVE_BOTH' | 'OUT_NEGATIVE') => void
    onExport: (fmt: 'CSV' | 'XLSX' | 'PDF') => Promise<void>
}) {
    const all: Array<{ key: any; label: string }> = [
        { key: 'date', label: 'Datum' },
        { key: 'voucherNo', label: 'Nr.' },
        { key: 'type', label: 'Typ' },
        { key: 'sphere', label: 'Sphäre' },
        { key: 'description', label: 'Beschreibung' },
        { key: 'paymentMethod', label: 'Zahlweg' },
        { key: 'netAmount', label: 'Netto' },
        { key: 'vatAmount', label: 'MwSt' },
        { key: 'grossAmount', label: 'Brutto' },
        { key: 'tags', label: 'Tags' }
    ]
    const toggle = (k: any) => {
        const set = new Set(fields)
        if (set.has(k)) set.delete(k)
        else set.add(k)
        setFields(Array.from(set) as any)
    }
    return open ? createPortal(
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <h2 style={{ margin: 0 }}>Export Optionen</h2>
                    <button className="btn danger" onClick={onClose}>Schließen</button>
                </header>
                <div className="row">
                    <div className="field" style={{ gridColumn: '1 / span 2' }}>
                        <label>Felder</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {all.map(f => (
                                <label key={f.key} className="chip" style={{ cursor: 'pointer', userSelect: 'none' }}>
                                    <input type="checkbox" checked={fields.includes(f.key)} onChange={() => toggle(f.key)} style={{ marginRight: 6 }} />
                                    {f.label}
                                </label>
                            ))}
                        </div>
                    </div>
                    <div className="field" style={{ gridColumn: '1 / span 2' }}>
                        <label>Organisationsname (optional)</label>
                        <input className="input" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="z. B. Förderverein Muster e.V." />
                    </div>
                    <div className="field" style={{ gridColumn: '1 / span 2' }}>
                        <label>Betragsdarstellung</label>
                        <div className="btn-group" role="group">
                            <button className="btn" onClick={() => setAmountMode('POSITIVE_BOTH')} style={{ background: amountMode === 'POSITIVE_BOTH' ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }}>Beide positiv</button>
                            <button className="btn" onClick={() => setAmountMode('OUT_NEGATIVE')} style={{ background: amountMode === 'OUT_NEGATIVE' ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }}>Ausgaben negativ</button>
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                    <button className="btn" onClick={() => onExport('CSV')}>CSV</button>
                    <button className="btn" onClick={() => onExport('PDF')}>PDF</button>
                    <button className="btn primary" onClick={() => onExport('XLSX')}>XLSX</button>
                </div>
            </div>
        </div>, document.body
    ) : null
}
function DashboardView({ today }: { today: string }) {
    const [quote, setQuote] = useState<{ text: string; author?: string; source?: string } | null>(null)
    const [loading, setLoading] = useState(false)
    const [cashier, setCashier] = useState<string>('')
    useEffect(() => {
        let cancelled = false
        setLoading(true)
        window.api?.quotes.weekly?.({ date: today }).then((q) => { if (!cancelled) setQuote(q) }).finally(() => { if (!cancelled) setLoading(false) })
        // Load cashier name for greeting
        const load = async () => {
            try {
                const cn = await (window as any).api?.settings?.get?.({ key: 'org.cashier' })
                if (!cancelled) setCashier((cn?.value as any) || '')
            } catch { }
        }
        load()
        const onChanged = () => load()
        window.addEventListener('data-changed', onChanged)
        return () => { cancelled = true; window.removeEventListener('data-changed', onChanged) }
    }, [today])

    // Load available years for optional selection
    const [yearsAvail, setYearsAvail] = useState<number[]>([])
    useEffect(() => {
        let cancelled = false
        window.api?.reports.years?.().then(res => { if (!cancelled && res?.years) setYearsAvail(res.years) })
        const onChanged = () => { window.api?.reports.years?.().then(res => { if (!cancelled && res?.years) setYearsAvail(res.years) }) }
        window.addEventListener('data-changed', onChanged)
        return () => { cancelled = true; window.removeEventListener('data-changed', onChanged) }
    }, [])
    // KPIs with Month/Year toggle
    const [period, setPeriod] = useState<'MONAT' | 'JAHR'>(() => {
        try { return (localStorage.getItem('dashPeriod') as any) || 'MONAT' } catch { return 'MONAT' }
    })
    useEffect(() => { try { localStorage.setItem('dashPeriod', period) } catch { } }, [period])
    const [yearSel, setYearSel] = useState<number | null>(null)
    useEffect(() => {
        if (period === 'JAHR' && yearsAvail.length > 0 && (yearSel == null || !yearsAvail.includes(yearSel))) {
            setYearSel(yearsAvail[0])
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [yearsAvail, period])
    const [sum, setSum] = useState<null | { inGross: number; outGross: number; diff: number }>(null)
    // React to global data changes (e.g., new voucher)
    const [refreshKey, setRefreshKey] = useState(0)
    useEffect(() => {
        const onDataChanged = () => setRefreshKey((k) => k + 1)
        window.addEventListener('data-changed', onDataChanged)
        return () => window.removeEventListener('data-changed', onDataChanged)
    }, [])
    useEffect(() => {
        let cancelled = false
        const now = new Date()
        const y = (period === 'JAHR' && yearSel) ? yearSel : now.getUTCFullYear()
        const from = period === 'MONAT'
            ? new Date(Date.UTC(y, now.getUTCMonth(), 1)).toISOString().slice(0, 10)
            : new Date(Date.UTC(y, 0, 1)).toISOString().slice(0, 10)
        const to = period === 'MONAT'
            ? new Date(Date.UTC(y, now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
            : new Date(Date.UTC(y, 11, 31)).toISOString().slice(0, 10)
        window.api?.reports.summary?.({ from, to }).then(res => {
            if (cancelled || !res) return
            const inGross = res.byType.find(x => x.key === 'IN')?.gross || 0
            const outGrossRaw = res.byType.find(x => x.key === 'OUT')?.gross || 0
            const outGross = Math.abs(outGrossRaw)
            const diff = Math.round((inGross - outGross) * 100) / 100
            setSum({ inGross, outGross, diff })
        })
        return () => { cancelled = true }
    }, [period, refreshKey])
    const eur = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])

    return (
        <div className="card" style={{ padding: 12, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <div>
                    <div style={{ fontSize: 18, fontWeight: 600 }}>Hallo{cashier ? ` ${cashier}` : ''}</div>
                    <div className="helper">Willkommen zurück – hier ist dein Überblick.</div>
                </div>
                <div style={{ textAlign: 'right', maxWidth: 520 }}>
                    <div className="helper">Satz der Woche</div>
                    <div style={{ fontStyle: 'italic' }}>{loading ? '…' : (quote?.text || '—')}</div>
                    <div className="helper">{quote?.author || quote?.source || ''}</div>
                </div>
            </div>
            {/* KPI cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
                    <div className="btn-group" role="tablist" aria-label="Zeitraum">
                        <button className="btn ghost" onClick={() => setPeriod('MONAT')} style={{ background: period === 'MONAT' ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }}>Monat</button>
                        <button className="btn ghost" onClick={() => setPeriod('JAHR')} style={{ background: period === 'JAHR' ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }}>Jahr</button>
                    </div>
                    {period === 'JAHR' && yearsAvail.length > 1 && (
                        <select className="input" value={String((yearSel ?? yearsAvail[0]))} onChange={(e) => setYearSel(Number(e.target.value))}>
                            {yearsAvail.map((y) => (
                                <option key={y} value={String(y)}>{y}</option>
                            ))}
                        </select>
                    )}
                </div>
                <div className="card" style={{ padding: 12 }}>
                    <div className="helper">Einnahmen ({period === 'MONAT' ? 'Monat' : 'Jahr'})</div>
                    <div style={{ fontWeight: 600 }}>{eur.format(sum?.inGross || 0)}</div>
                </div>
                <div className="card" style={{ padding: 12 }}>
                    <div className="helper">Ausgaben ({period === 'MONAT' ? 'Monat' : 'Jahr'})</div>
                    <div style={{ fontWeight: 600 }}>{eur.format(sum?.outGross || 0)}</div>
                </div>
                <div className="card" style={{ padding: 12 }}>
                    <div className="helper">Saldo ({period === 'MONAT' ? 'Monat' : 'Jahr'})</div>
                    <div style={{ fontWeight: 600, color: (sum && sum.diff >= 0) ? 'var(--success)' : 'var(--danger)' }}>{eur.format(sum?.diff || 0)}</div>
                </div>
            </div>
            {/* Charts preview */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {(() => {
                    const now = new Date()
                    const y = (period === 'JAHR' && yearSel) ? yearSel : now.getUTCFullYear()
                    const f = period === 'MONAT'
                        ? new Date(Date.UTC(y, now.getUTCMonth(), 1)).toISOString().slice(0, 10)
                        : new Date(Date.UTC(y, 0, 1)).toISOString().slice(0, 10)
                    const t = period === 'MONAT'
                        ? new Date(Date.UTC(y, now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
                        : new Date(Date.UTC(y, 11, 31)).toISOString().slice(0, 10)
                    return (
                        <>
                            <ReportsMonthlyChart from={f} to={t} />
                            <ReportsCashBars from={f} to={t} />
                        </>
                    )
                })()}
            </div>
            {/* Earmarks at a glance: top active ones */}
            <DashboardEarmarksPeek />

            {/* Recent Activity: last vouchers */}
            <DashboardRecentActivity />
        </div>
    )
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
    useEffect(() => { setV(value); setDraftColor(value.color || '#00C853'); setDraftError('') }, [value])
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
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                    <button className="btn" onClick={onClose}>Abbrechen</button>
                    <button className="btn primary" onClick={async () => { await window.api?.bindings.upsert?.(v as any); onSaved(); onClose() }}>Speichern</button>
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

// Budget Modal
function BudgetModal({ value, onClose, onSaved }: { value: { id?: number; year: number; sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; amountPlanned: number; name?: string | null; categoryName?: string | null; projectName?: string | null; startDate?: string | null; endDate?: string | null; color?: string | null; categoryId?: number | null; projectId?: number | null; earmarkId?: number | null }; onClose: () => void; onSaved: () => void }) {
    const [v, setV] = useState(value)
    const [nameError, setNameError] = useState<string>('')
    const nameRef = useRef<HTMLInputElement | null>(null)
    const [showColorPicker, setShowColorPicker] = useState(false)
    const [draftColor, setDraftColor] = useState<string>(value.color || '#00C853')
    const [draftError, setDraftError] = useState<string>('')
    // Keep modal state in sync when opening with an existing budget so fields are prefilled
    useEffect(() => { setV(value); setNameError(''); setDraftColor(value.color || '#00C853'); setDraftError('') }, [value])
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
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
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
                    <table cellPadding={6} style={{ width: '100%' }}>
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
                                        <td>{fmtDateLocal(r.dueDate || '')}</td>
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
                            <button className="btn" disabled={!canPrev} onClick={() => setOffset(Math.max(0, offset - limit))}>Zurück</button>
                            <span className="helper">Seite {page} / {pages}</span>
                            <button className="btn" disabled={!canNext} onClick={() => setOffset(offset + limit)}>Weiter</button>
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
                                    <div className="badge" title="Rechnungsdatum" style={{ padding: '2px 6px' }}>
                                        <input aria-label="Datum" className="input" type="date" value={form.draft.date} onChange={e => setForm(f => f && ({ ...f, draft: { ...f.draft, date: e.target.value } }))} style={{ height: 26, padding: '2px 6px' }} />
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
                                    <label>Partei</label>
                                    <input className="input party-input" list="party-suggestions" value={form.draft.party} onChange={e => setForm(f => f && ({ ...f, draft: { ...f.draft, party: e.target.value } }))} placeholder="Name der Partei" />
                                    {/* datalist placed later */}
                                </div>
                                <div className="field">
                                    <label>Beschreibung</label>
                                    <input className="input" list="desc-suggestions" value={form.draft.description || ''} onChange={e => setForm(f => f && ({ ...f, draft: { ...f.draft, description: e.target.value } }))} placeholder="Kurzbeschreibung" />
                                </div>
                                <div className="field">
                                    <label>Betrag (EUR)</label>
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

function EarmarkUsageCards({ bindings, from, to, sphere }: { bindings: Array<{ id: number; code: string; name: string; color?: string | null; budget?: number | null }>; from?: string; to?: string; sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB' }) {
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
                return (
                    <div
                        key={b.id}
                        className="card"
                        style={{ padding: 10, cursor: 'pointer', borderTop: bg ? `4px solid ${bg}` : undefined }}
                        onClick={() => { const ev = new CustomEvent('apply-earmark-filter', { detail: { earmarkId: b.id } }); window.dispatchEvent(ev) }}
                        title={`Nach Zweckbindung ${b.code} filtern`}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                            <span className="badge" style={{ background: bg, color: fg }}>{b.code}</span>
                            <span className="helper">{b.name}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
                            <span className="badge in">IN: {fmt.format(u?.allocated ?? 0)}</span>
                            <span className="badge out">OUT: {fmt.format(u?.released ?? 0)}</span>
                            <span className="badge">Saldo: {fmt.format(u?.balance ?? 0)}</span>
                            {((u?.budget ?? 0) > 0) && (
                                <>
                                    <span className="badge" title="Anfangsbudget">Budget: {fmt.format(u?.budget ?? 0)}</span>
                                    <span className="badge" title="Verfügbar">Rest: {fmt.format(u?.remaining ?? 0)}</span>
                                </>
                            )}
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
        <div style={{ marginTop: 12 }}>
            <strong>Übersicht</strong>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, marginTop: 8 }}>
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
                                    <div className="helper">Rest</div>
                                    <div style={{ color: remaining >= 0 ? 'var(--success)' : 'var(--danger)' }}>{eurFmt.format(remaining)}</div>
                                </div>
                                <div>
                                    <div className="helper">Einnahmen (Budget)</div>
                                    <div style={{ color: 'var(--success)' }}>{eurFmt.format(inflow)}</div>
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
    const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
    useEffect(() => {
        let cancelled = false
        setLoading(true)
        window.api?.reports.summary?.({ from: props.from, to: props.to, sphere: props.sphere, type: props.type, paymentMethod: props.paymentMethod })
            .then((res) => { if (!cancelled) setData(res) })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [props.from, props.to, props.sphere, props.type, props.paymentMethod, props.refreshKey])

    return (
        <div className="card" style={{ marginTop: 12, padding: 12, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <strong>Summen</strong>
                    <div className="helper">Für den gewählten Zeitraum und die Filter.</div>
                </div>
                <button className="btn ghost" onClick={() => { const ev = new Event('open-export-options'); window.dispatchEvent(ev) }}>Exportieren</button>
            </div>
            {loading && <div>Lade …</div>}
            {data && (
                <div style={{ display: 'grid', gap: 12 }}>
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

// Utility: export an SVG node as a PNG download
function exportSvgToPng(svg: SVGSVGElement, filename: string) {
    try {
        const serializer = new XMLSerializer()
        const src = serializer.serializeToString(svg)
        const svgBlob = new Blob([src], { type: 'image/svg+xml;charset=utf-8' })
        const url = URL.createObjectURL(svgBlob)
        const img = new Image()
        const width = svg.viewBox?.baseVal?.width || svg.width?.baseVal?.value || 800
        const height = svg.viewBox?.baseVal?.height || svg.height?.baseVal?.value || 400
        img.onload = () => {
            const canvas = document.createElement('canvas')
            canvas.width = Math.ceil(width)
            canvas.height = Math.ceil(height)
            const ctx = canvas.getContext('2d')
            if (!ctx) return
            ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg') || '#fff'
            ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0)
            URL.revokeObjectURL(url)
            canvas.toBlob((blob) => {
                if (!blob) return
                const a = document.createElement('a')
                a.href = URL.createObjectURL(blob)
                a.download = filename
                document.body.appendChild(a)
                a.click()
                setTimeout(() => {
                    URL.revokeObjectURL(a.href)
                    document.body.removeChild(a)
                }, 0)
            }, 'image/png')
        }
        img.onerror = () => URL.revokeObjectURL(url)
        img.src = url
    } catch { /* noop */ }
}

function ReportsMonthlyChart(props: { refreshKey?: number; from?: string; to?: string; sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; type?: 'IN' | 'OUT' | 'TRANSFER'; paymentMethod?: 'BAR' | 'BANK' }) {
    const [loading, setLoading] = useState(false)
    const [inBuckets, setInBuckets] = useState<Array<{ month: string; gross: number }>>([])
    const [outBuckets, setOutBuckets] = useState<Array<{ month: string; gross: number }>>([])
    const [hoverIdx, setHoverIdx] = useState<number | null>(null)
    const svgRef = useRef<SVGSVGElement | null>(null)
    const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
    // Measure container width to expand chart to available space
    const containerRef = useRef<HTMLDivElement | null>(null)
    const [containerW, setContainerW] = useState<number>(0)
    useEffect(() => {
        const el = containerRef.current
        if (!el) return
        setContainerW(el.clientWidth)
        const ro = new ResizeObserver((entries) => {
            if (entries[0]) setContainerW(entries[0].contentRect.width)
        })
        ro.observe(el)
        return () => ro.disconnect()
    }, [])
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
    const maxVal = Math.max(1, ...series.map(s => Math.max(s.inGross, s.outGross)), ...saldo.map(v => Math.abs(v)))
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
                    <div className="legend">
                        <span className="legend-item"><span className="legend-swatch" style={{ background: '#2e7d32' }}></span>IN</span>
                        <span className="legend-item"><span className="legend-swatch" style={{ background: '#c62828' }}></span>OUT</span>
                        <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--accent)' }}></span>Saldo</span>
                    </div>
                    <button className="btn ghost" onClick={() => { const svg = svgRef.current; if (svg) exportSvgToPng(svg, 'monatsverlauf.png') }}>Als Bild speichern</button>
                </div>
            </div>
            {loading && <div>Lade …</div>}
            {!loading && (
                <div ref={containerRef} style={{ overflowX: 'auto' }}>
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
                                <g key={s.month} onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)}>
                                    <rect x={gx} y={yIn} width={barW} height={hIn} fill="#2e7d32" rx={3} />
                                    <rect x={gx + barW + 6} y={yOut} width={barW} height={hOut} fill="#c62828" rx={3} />
                                    {hoverIdx === i && (
                                        <g>
                                            <text x={gx + barW} y={Math.min(yIn, yOut) - 6} textAnchor="middle" fontSize="10">
                                                {`${monthLabel(s.month, true)}: IN ${eurFmt.format(s.inGross)}, OUT ${eurFmt.format(s.outGross)}, Saldo ${eurFmt.format(saldoMonth)}`}
                                            </text>
                                        </g>
                                    )}
                                    <text x={gx + barW} y={yBase + innerH + 18} textAnchor="middle" fontSize="10">{monthLabel(s.month, false)}</text>
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
                    <button className="btn ghost" onClick={() => { const svg = svgRef.current; if (svg) exportSvgToPng(svg, 'sphaeren.png') }}>Als Bild speichern</button>
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
                    <button className="btn ghost" onClick={() => { const svg = svgRef.current; if (svg) exportSvgToPng(svg, 'zahlwege.png') }}>Als Bild speichern</button>
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
                            <g key={(r.key ?? 'NULL') + i}>
                                <text x={margin.left - 8} y={y + rowH / 2} textAnchor="end" dominantBaseline="middle" fontSize="12">{label}</text>
                                <rect x={margin.left} y={yBar} width={Math.max(0, inX - margin.left)} height={10} fill="#2e7d32" rx={3} />
                                <rect x={margin.left} y={yBar + 12} width={Math.max(0, outX - margin.left)} height={10} fill="#c62828" rx={3} />
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

function ReportsInOutLines(props: { refreshKey?: number; from?: string; to?: string; sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB' }) {
    const [loading, setLoading] = useState(false)
    const [inBuckets, setInBuckets] = useState<Array<{ month: string; gross: number }>>([])
    const [outBuckets, setOutBuckets] = useState<Array<{ month: string; gross: number }>>([])
    const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
    const [hoverIdx, setHoverIdx] = useState<number | null>(null)
    // Responsive: measure container width to expand chart
    const containerRef = useRef<HTMLDivElement | null>(null)
    const [containerW, setContainerW] = useState<number>(0)
    useEffect(() => {
        const el = containerRef.current
        if (!el) return
        setContainerW(el.clientWidth)
        const ro = new ResizeObserver((entries) => {
            if (entries[0]) setContainerW(entries[0].contentRect.width)
        })
        ro.observe(el)
        return () => ro.disconnect()
    }, [])
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
                <div ref={containerRef} style={{ overflowX: 'auto' }}>
                    <svg width={width} height={height} role="img" aria-label="IN vs OUT">
                        {/* grid lines */}
                        {Array.from({ length: 4 }).map((_, i) => {
                            const y = margin.top + (innerH / 4) * i
                            return <line key={i} x1={margin.left} y1={y} x2={width - margin.right} y2={y} stroke="var(--border)" opacity={0.5} />
                        })}
                        <polyline fill="none" stroke="#2e7d32" strokeWidth="2" points={points(inBuckets)} />
                        <polyline fill="none" stroke="#c62828" strokeWidth="2" points={points(outBuckets)} />
                        {months.map((m, i) => (
                            <g key={m} onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)}>
                                {/* interactive points */}
                                <circle cx={xFor(i)} cy={yFor(inBuckets.find(b => b.month === m)?.gross || 0)} r={3} fill="#2e7d32">
                                    <title>{`IN ${monthLabel(m, true)}: ${eurFmt.format(inBuckets.find(b => b.month === m)?.gross || 0)}`}</title>
                                </circle>
                                <circle cx={xFor(i)} cy={yFor(outBuckets.find(b => b.month === m)?.gross || 0)} r={3} fill="#c62828">
                                    <title>{`OUT ${monthLabel(m, true)}: ${eurFmt.format(outBuckets.find(b => b.month === m)?.gross || 0)}`}</title>
                                </circle>
                                {/* decluttered labels: threshold-based visibility, staggered positions, separation, clamped bounds */}
                                {(() => {
                                    const inVal = inBuckets.find(b => b.month === m)?.gross || 0
                                    const outVal = outBuckets.find(b => b.month === m)?.gross || 0
                                    const SHOW_THRESHOLD = 150 // €
                                    const showIn = Math.abs(inVal) >= SHOW_THRESHOLD || hoverIdx === i
                                    const showOut = Math.abs(outVal) >= SHOW_THRESHOLD || hoverIdx === i
                                    if (!showIn && !showOut) return null

                                    const x = xFor(i)
                                    const padX = 6
                                    const padY = 3
                                    const fs = 11
                                    const inText = eurFmt.format(inVal)
                                    const outText = eurFmt.format(outVal)
                                    const estW = (t: string) => Math.max(20, Math.round(t.length * 6.2) + padX * 2)
                                    const inW = estW(inText)
                                    const outW = estW(outText)
                                    const inBaseY = yFor(inVal)
                                    const outBaseY = yFor(outVal)
                                    let inLabelY = Math.max(margin.top + 10, inBaseY - 14)
                                    let outLabelY = Math.min(margin.top + innerH - 6, outBaseY + 18)
                                    // Ensure minimum vertical separation between IN and OUT labels
                                    if (showIn && showOut && Math.abs(inLabelY - outLabelY) < 16) {
                                        inLabelY = Math.max(margin.top + 10, inLabelY - 10)
                                        outLabelY = Math.min(margin.top + innerH - 6, outLabelY + 10)
                                    }
                                    // Horizontal staggering to reduce overlap across adjacent months
                                    const dxIn = (i % 2 === 0 ? -10 : 10)
                                    const dxOut = (i % 2 === 0 ? 10 : -10)
                                    // Clamp to chart inner width
                                    const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
                                    const inTx = clamp((x + dxIn) - inW / 2, margin.left, (width - margin.right) - inW)
                                    const outTx = clamp((x + dxOut) - outW / 2, margin.left, (width - margin.right) - outW)

                                    return (
                                        <g>
                                            {showIn && (
                                                <g transform={`translate(${inTx}, ${inLabelY - (fs + padY * 2) + 4})`}>
                                                    <rect width={inW} height={fs + padY * 2} rx={6} fill="rgba(0,0,0,0.35)" stroke="#2e7d32" />
                                                    <text x={inW / 2} y={fs + padY - 4} textAnchor="middle" fontSize={fs} fill="#ffffff">{inText}</text>
                                                </g>
                                            )}
                                            {showOut && (
                                                <g transform={`translate(${outTx}, ${outLabelY - (fs + padY * 2) + 4})`}>
                                                    <rect width={outW} height={fs + padY * 2} rx={6} fill="rgba(0,0,0,0.35)" stroke="#c62828" />
                                                    <text x={outW / 2} y={fs + padY - 4} textAnchor="middle" fontSize={fs} fill="#ffffff">{outText}</text>
                                                </g>
                                            )}
                                        </g>
                                    )
                                })()}
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
function JournalTable({ rows, order, cols, onReorder, earmarks, tagDefs, eurFmt, fmtDate, onEdit, onDelete, onToggleSort, sortDir, sortBy, onTagClick, highlightId, lockedUntil }: {
    rows: Array<{ id: number; voucherNo: string; date: string; type: 'IN' | 'OUT' | 'TRANSFER'; sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; description?: string | null; paymentMethod?: 'BAR' | 'BANK' | null; transferFrom?: 'BAR' | 'BANK' | null; transferTo?: 'BAR' | 'BANK' | null; netAmount: number; vatRate: number; vatAmount: number; grossAmount: number; fileCount?: number; earmarkId?: number | null; earmarkCode?: string | null; budgetId?: number | null; budgetLabel?: string | null; tags?: string[] }>
    order: string[]
    cols: Record<string, boolean>
    onReorder: (o: string[]) => void
    earmarks: Array<{ id: number; code: string; name: string; color?: string | null }>
    tagDefs: Array<{ id: number; name: string; color?: string | null }>
    eurFmt: Intl.NumberFormat
    fmtDate: (s?: string) => string
    onEdit: (r: { id: number; date: string; description: string | null; paymentMethod: 'BAR' | 'BANK' | null; transferFrom?: 'BAR' | 'BANK' | null; transferTo?: 'BAR' | 'BANK' | null; type?: 'IN' | 'OUT' | 'TRANSFER'; sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; earmarkId?: number | null; budgetId?: number | null; tags?: string[] }) => void
    onDelete: (r: { id: number; voucherNo: string; description?: string | null }) => void
    onToggleSort: (col: 'date' | 'net' | 'gross') => void
    sortDir: 'ASC' | 'DESC'
    sortBy: 'date' | 'net' | 'gross'
    onTagClick?: (name: string) => void
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
                    <button className="btn" title="Bearbeiten" onClick={() => onEdit({ id: r.id, date: r.date, description: r.description ?? '', paymentMethod: r.paymentMethod ?? null, transferFrom: r.transferFrom ?? null, transferTo: r.transferTo ?? null, type: r.type, sphere: r.sphere, earmarkId: r.earmarkId ?? null, budgetId: r.budgetId ?? null, tags: r.tags || [] })}>✎</button>
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
                return <span className="badge" title={`Zweckbindung ${r.earmarkCode}`} style={{ background: bg || undefined, color: bg ? fg : undefined }}>{r.earmarkCode}</span>
            })() : ''}</td>
        ) : k === 'paymentMethod' ? (
            <td key={k}>{r.type === 'TRANSFER'
                ? (
                    (() => {
                        const dir = r.transferFrom && r.transferTo ? `${r.transferFrom} → ${r.transferTo}` : '—'
                        return <span className="badge">{dir}</span>
                    })()
                )
                : (r.paymentMethod ? <span className={`badge pm-${(r.paymentMethod || '').toLowerCase()}`}>{r.paymentMethod}</span> : '')}
            </td>
        ) : k === 'budget' ? (
            <td key={k} align="center">{r.budgetLabel ? (
                (() => {
                    const bg = (r as any).budgetColor || undefined; const fg = contrastText(bg); return (
                        <span className="badge" title={`Budget: ${r.budgetLabel}`} style={{ background: bg, color: bg ? fg : undefined }}>{r.budgetLabel}</span>
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
            </tbody>
        </table>
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
    tagDefs,
    setTagDefs,
    notify,
    bumpDataVersion,
    openTagsManager,
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
    colorTheme: 'default' | 'fiery-ocean' | 'peachy-delight' | 'pastel-dreamland' | 'ocean-breeze' | 'earthy-tones'
    setColorTheme: (v: 'default' | 'fiery-ocean' | 'peachy-delight' | 'pastel-dreamland' | 'ocean-breeze' | 'earthy-tones') => void
    tagDefs: Array<{ id: number; name: string; color?: string | null; usage?: number }>
    setTagDefs: React.Dispatch<React.SetStateAction<Array<{ id: number; name: string; color?: string | null; usage?: number }>>>
    notify: (type: 'success' | 'error' | 'info', text: string, ms?: number) => void
    bumpDataVersion: () => void
    openTagsManager?: () => void
}) {
    type TileKey = 'general' | 'table' | 'import' | 'storage' | 'org' | 'tags' | 'yearEnd' | 'tutorial' | 'about'
    const [active, setActive] = useState<TileKey>('general')

    function GeneralPane() {
        const sample = '2025-09-11'
        const pretty = '11 Sep 2025'
        const [showDeleteAll, setShowDeleteAll] = useState(false)
        const [deleteConfirmText, setDeleteConfirmText] = useState('')
        const canDeleteAll = deleteConfirmText === 'LÖSCHEN'
        const [showImportConfirm, setShowImportConfirm] = useState(false)
        const [busyImport, setBusyImport] = useState(false)
        return (
            <div style={{ display: 'grid', gap: 12 }}>
                <div>
                    <strong>Allgemein</strong>
                    <div className="helper">Basiseinstellungen für Listen und Anzeige.</div>
                </div>
                <div className="row">
                    <div className="field">
                        <label>Journal: Anzahl der Einträge</label>
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
                    <div className="field">
                        <label>Menü-Layout</label>
                        <select className="input" value={navLayout} onChange={(e) => setNavLayout(e.target.value as 'left' | 'top')}>
                            <option value="left">Links (klassisch)</option>
                            <option value="top">Oben (Icons, platzsparend)</option>
                        </select>
                        <div className="helper">„Oben“ blendet die Seitenleiste aus und zeigt eine kompakte Icon-Leiste im Kopfbereich.</div>
                    </div>
                    {navLayout === 'left' && (
                        <div className="field">
                            <label>Seitenleiste</label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <input
                                    type="checkbox"
                                    checked={sidebarCollapsed}
                                    onChange={(e) => setSidebarCollapsed(e.target.checked)}
                                />
                                Kompakt (nur Icons)
                            </label>
                            <div className="helper">Gilt nur für das Menü links. Beschriftungen werden ausgeblendet.</div>
                        </div>
                    )}
                    <div className="field">
                        <label>Menü-Icons</label>
                        <select className="input" value={navIconColorMode} onChange={(e) => setNavIconColorMode(e.target.value as any)}>
                            <option value="mono">Monochrom</option>
                            <option value="color">Farbig</option>
                        </select>
                        <div className="helper">Farbige Icons helfen bei der Orientierung. Monochrom ist dezenter.</div>
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
                        </select>
                        <div className="helper">Wirkt auf Akzentfarben (Buttons, Hervorhebungen). Das aktuelle Design ist Standard.</div>
                    </div>
                </div>
                <div className="card" style={{ padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <div>
                            <strong>Datenbank</strong>
                            <div className="helper">Exportiere eine Sicherung oder importiere eine bestehende SQLite-Datei.</div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
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
                    </div>
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
                <div className="card" style={{ padding: 12, borderLeft: '4px solid var(--danger)' }}>
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
                            <input type="checkbox" checked={!!cols[k]} onChange={(e) => setCols({ ...cols, [k]: e.target.checked })} /> {k}
                        </label>
                    ))}
                </div>
                {!cols['actions'] && (
                    <div className="helper" style={{ color: 'var(--danger)' }}>Ohne „Aktionen“ kannst du Zeilen nicht bearbeiten oder löschen.</div>
                )}
                <div>
                    <div className="helper">Reihenfolge:</div>
                    <DnDOrder order={order as any} cols={cols as any} onChange={(o) => setOrder(o as any)} />
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn" onClick={() => { setCols(defaultCols); setOrder(defaultOrder) }}>Preset: Standard</button>
                    <button className="btn" onClick={() => { setCols({ actions: true, date: true, voucherNo: false, type: false, sphere: false, description: true, earmark: false, paymentMethod: false, attachments: false, net: false, vat: false, gross: true } as any); setOrder(['actions', 'date', 'description', 'gross', 'voucherNo', 'type', 'sphere', 'earmark', 'paymentMethod', 'attachments', 'net', 'vat']) }}>Preset: Minimal</button>
                    <button className="btn" onClick={() => { setCols({ ...defaultCols }); setOrder(['actions', 'date', 'voucherNo', 'type', 'sphere', 'description', 'earmark', 'paymentMethod', 'attachments', 'net', 'vat', 'gross']) }}>Preset: Details</button>
                    <button className="btn" onClick={() => { setCols(defaultCols); setOrder(defaultOrder); setJournalLimit(20) }}>Zurücksetzen</button>
                </div>
            </div>
        )
    }

    function StoragePane() {
        const [info, setInfo] = useState<null | { root: string; dbPath: string; filesDir: string; configuredRoot: string | null }>(null)
    const [busy, setBusy] = useState(false) // disable buttons
        const [error, setError] = useState<string>('')
        const [migratePrompt, setMigratePrompt] = useState<null | { kind: 'useOrMigrate'; sel: { root: string; dbPath: string } } | { kind: 'migrateEmpty'; sel: { root: string } }>(null)
        const [busyAction, setBusyAction] = useState(false)

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
        useEffect(() => { refresh() }, [])

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
                    <button className="btn" disabled={busy || !info?.configuredRoot} title={!info?.configuredRoot ? 'Bereits Standard' : ''} onClick={() => doAction('reset')}>Standard wiederherstellen</button>
                </div>
                <div className="helper">Hinweise:
                    <ul style={{ margin: '4px 0 0 16px' }}>
                        <li>„Ordner wählen…“ öffnet einen Dialog. Es wird noch nichts kopiert.</li>
                        <li>Wenn im gewählten Ordner bereits eine <code>database.sqlite</code> liegt, kannst du diese verwenden oder deine aktuelle DB in diesen Ordner kopieren (migrieren).</li>
                        <li>Wenn keine Datenbank vorhanden ist, kannst du die aktuelle Datenbank in den Ordner kopieren (migrieren).</li>
                        <li>„Standard wiederherstellen“ nutzt den App-Datenordner (empfohlen, falls unsicher).</li>
                    </ul>
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
                if (res?.filePath) notify('success', `Export erstellt: ${res.filePath}`)
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

        return (
            <div style={{ display: 'grid', gap: 12 }}>
                <div>
                    <strong>Jahresabschluss</strong>
                    <div className="helper">Vorschau, Export und Abschluss des Geschäftsjahres.</div>
                </div>
                {status && (
                    <div className="card" style={{ padding: 12, background: 'var(--panel)' }}>
                        <div className="helper">Aktueller Sperrstatus</div>
                        <div>
                            {status.closedUntil
                                ? <span>Abgeschlossen bis <strong>{status.closedUntil}</strong>. Buchungen bis zu diesem Datum sind gesperrt.</span>
                                : <span>Derzeit ist kein Jahr abgeschlossen.</span>}
                        </div>
                    </div>
                )}
                <div className="row" style={{ alignItems: 'end' }}>
                    <div className="field">
                        <label>Jahr</label>
                        <select className="input" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                            {[...new Set([new Date().getFullYear(), ...yearsAvail])].sort((a, b) => b - a).map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn" disabled={busy} onClick={refresh}>Vorschau aktualisieren</button>
                        <button className="btn" disabled={busy} onClick={doExport}>Export-Paket erstellen</button>
                        <button className="btn danger" disabled={busy} onClick={() => setConfirmAction({ type: 'close' })}>Jahr abschließen…</button>
                        <button className="btn" disabled={busy} onClick={() => setConfirmAction({ type: 'reopen' })}>Wieder öffnen…</button>
                    </div>
                </div>
                {err && <div style={{ color: 'var(--danger)' }}>{err}</div>}
                {previewLoading && <div className="helper">Lade …</div>}
                {prev && (
                    <div className="card" style={{ padding: 12 }}>
                        <div className="helper">Zeitraum: {prev.from} – {prev.to}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 8 }}>
                            <div className="card" style={{ padding: 12 }}>
                                <div className="helper">Netto</div>
                                <div style={{ fontWeight: 600 }}>{eur.format(prev.totals.net)}</div>
                            </div>
                            <div className="card" style={{ padding: 12 }}>
                                <div className="helper">MwSt</div>
                                <div style={{ fontWeight: 600 }}>{eur.format(prev.totals.vat)}</div>
                            </div>
                            <div className="card" style={{ padding: 12 }}>
                                <div className="helper">Brutto</div>
                                <div style={{ fontWeight: 600 }}>{eur.format(prev.totals.gross)}</div>
                            </div>
                            <div className="card" style={{ padding: 12 }}>
                                <div className="helper">Kassenbestand (BAR/BANK; YTD)</div>
                                <div style={{ fontWeight: 600 }}>{eur.format(prev.cashBalance.BAR)} · {eur.format(prev.cashBalance.BANK)}</div>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                            <div>
                                <strong>Nach Sphäre</strong>
                                <table cellPadding={6} style={{ width: '100%', marginTop: 6 }}>
                                    <thead><tr><th align="left">Sphäre</th><th align="right">Brutto</th></tr></thead>
                                    <tbody>
                                        {prev.bySphere.map((s: any, i: number) => (
                                            <tr key={i}><td>{s.key}</td><td align="right">{eur.format(s.gross)}</td></tr>
                                        ))}
                                    </tbody>
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
                                </table>
                            </div>
                        </div>
                    </div>
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
                <div className="card" style={{ padding: 12 }}>
                    <strong>Wie funktioniert der Jahresabschluss?</strong>
                    <ul style={{ marginTop: 8 }}>
                        <li>Wählen Sie ein Jahr und klicken Sie auf „Vorschau“, um die Summen und den Kassenbestand zu prüfen.</li>
                        <li>Mit „Export-Paket erstellen“ wird eine Excel-Datei mit Zusammenfassung, Journal und Monatsübersicht unter „Dokumente/VereinPlannerExports“ gespeichert.</li>
                        <li>„Jahr abschließen…“ sperrt alle Buchungen des gewählten Jahres gegen Änderungen (Erstellen/Ändern/Löschen).</li>
                        <li>„Wieder öffnen…“ hebt die Sperre für das gewählte Jahr wieder auf. Vorgänge werden im Import-/Audit-Log protokolliert.</li>
                    </ul>
                </div>
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
function DnDOrder({ order, cols, onChange }: { order: string[]; cols: Record<string, boolean>; onChange: (o: string[]) => void }) {
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
                        <span>{k}</span>
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

                    {mode === 'BUDGET' && (
                        <>
                            <div className="field" style={{ gridColumn: '1 / span 2' }}>
                                <label>Budget</label>
                                <select className="input" value={budgetId as any} onChange={(e) => setBudgetId(e.target.value ? Number(e.target.value) : '')}>
                                    <option value="">— bitte wählen —</option>
                                    {budgets.map(b => (
                                        <option key={b.id} value={b.id}>{b.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="field" style={{ gridColumn: '1 / span 2' }}>
                                <label><input type="checkbox" checked={onlyWithout} onChange={(e) => setOnlyWithout(e.target.checked)} /> Nur Buchungen ohne Budget aktualisieren</label>
                            </div>
                        </>
                    )}

                    <div className="card" style={{ gridColumn: '1 / span 2', padding: 10 }}>
                        <div className="helper">Betroffene Buchungen: Aktuelle Filter werden angewandt (Suche, Zeitraum, Sphäre, Art, Zahlweg).</div>
                        <ul style={{ margin: '6px 0 0 16px' }}>
                            {currentFilters.q && <li>Suche: <code>{currentFilters.q}</code></li>}
                            {currentFilters.from && currentFilters.to && <li>Zeitraum: {currentFilters.from} – {currentFilters.to}</li>}
                            {currentFilters.sphere && <li>Sphäre: {currentFilters.sphere}</li>}
                            {currentFilters.type && <li>Art: {currentFilters.type}</li>}
                            {currentFilters.paymentMethod && <li>Zahlweg: {currentFilters.paymentMethod}</li>}
                            {onlyWithout && mode === 'EARMARK' && <li>Nur ohne bestehende Zweckbindung</li>}
                            {onlyWithout && mode === 'BUDGET' && <li>Nur ohne bestehendes Budget</li>}
                        </ul>
                    </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                    <button className="btn" onClick={onClose}>Abbrechen</button>
                    <button className="btn primary" disabled={busy || (mode === 'EARMARK' && !earmarkId) || (mode === 'BUDGET' && !budgetId)} onClick={run}>Übernehmen</button>
                </div>
            </div>
        </div>,
        document.body
    )
}