import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ICONS } from './utils/icons'
import ReportsView from './views/Reports/ReportsView'
import { SettingsView } from './views/Settings/SettingsView'
import DashboardView from './views/Dashboard/DashboardView'
import InvoicesView from './views/InvoicesView'
import MembersView from './views/Mitglieder/MembersView'
import ReceiptsView from './views/ReceiptsView'
import DashboardEarmarksPeek from './views/Dashboard/DashboardEarmarksPeek'
import JournalView from './views/Journal/JournalView'
import { createPortal } from 'react-dom'
import TagModal from './components/modals/TagModal'
import TagsManagerModal from './components/modals/TagsManagerModal'
import AutoBackupPromptModal from './components/modals/AutoBackupPromptModal'
import MetaFilterModal from './components/modals/MetaFilterModal'
import TimeFilterModal from './components/modals/TimeFilterModal'
import ExportOptionsModal from './components/modals/ExportOptionsModal'
import AttachmentsModal from './components/modals/AttachmentsModal'
import PaymentsAssignModal from './components/modals/PaymentsAssignModal'
import BatchEarmarkModal from './components/modals/BatchEarmarkModal'
import QuickAddModal from './components/modals/QuickAddModal'
import DbMigrateModal from './DbMigrateModal'
import SmartRestoreModal from './components/modals/SmartRestoreModal'
import SetupWizardModal from './components/modals/SetupWizardModal'
import EarmarkUsageCards from './components/tiles/EarmarkUsageCards'
import BudgetsView from './views/Budgets/BudgetsView'
import EarmarksView from './views/Earmarks/EarmarksView'
import { useQuickAdd } from './hooks/useQuickAdd'
import { ToastProvider, useToast } from './context/ToastContext'
import { UIPreferencesProvider, useUIPreferences } from './context/UIPreferences'
import { AppLayout } from './components/layout/AppLayout'
import { TopNav } from './components/layout/TopNav'
import { SideNav } from './components/layout/SideNav'
import type { NavKey } from './utils/navItems'
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
        <div className="inline-flex items-center gap-8">
            <img src={appLogo} alt="VereinO" width={20} height={20} style={{ borderRadius: 4, display: 'block' }} />
            {text ? (
                <div className="helper text-ellipsis" title={text}>{text}</div>
            ) : null}
        </div>
    )
}

function AppInner() {
    // Use toast context
    const { notify } = useToast()
    
    // Use UI preferences context
    const {
        navLayout,
        setNavLayout,
        sidebarCollapsed,
        setSidebarCollapsed,
        colorTheme,
        setColorTheme,
        navIconColorMode,
        setNavIconColorMode,
        dateFormat,
        setDateFormat,
        journalRowStyle,
        setJournalRowStyle,
        journalRowDensity,
        setJournalRowDensity
    } = useUIPreferences()
    
    // Global data refresh key to trigger summary re-fetches across views
    const [refreshKey, setRefreshKey] = useState(0)
    const bumpDataVersion = () => setRefreshKey((k) => k + 1)
    const [lastId, setLastId] = useState<number | null>(null) // Track last created voucher id
    const [flashId, setFlashId] = useState<number | null>(null) // Row highlight for newly created voucher
    
    // Map backend errors to friendlier messages (esp. earmark period issues)
    const friendlyError = (e: any) => {
        const msg = String(e?.message || e || '')
        if (/Zweckbindung.*liegt vor Beginn/i.test(msg)) return 'Warnung: Das Buchungsdatum liegt vor dem Startdatum der ausgew?hlten Zweckbindung.'
        if (/Zweckbindung.*liegt nach Ende/i.test(msg)) return 'Warnung: Das Buchungsdatum liegt nach dem Enddatum der ausgew?hlten Zweckbindung.'
        if (/Zweckbindung ist inaktiv/i.test(msg)) return 'Warnung: Die ausgew?hlte Zweckbindung ist inaktiv und kann nicht verwendet werden.'
        if (/Zweckbindung w?rde den verf?gbaren Rahmen unterschreiten/i.test(msg)) return 'Warnung: Diese ?nderung w?rde den verf?gbaren Rahmen der Zweckbindung unterschreiten.'
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
    const [activePage, setActivePage] = useState<NavKey>(() => {
        try { return (localStorage.getItem('activePage') as NavKey) || 'Buchungen' } catch { return 'Buchungen' }
    })
    // When switching to Reports, bump a key to trigger chart re-measures
    const [reportsActivateKey, setReportsActivateKey] = useState(0)
    useEffect(() => {
        if (activePage === 'Reports') setReportsActivateKey((k) => k + 1)
    }, [activePage])

    // Auto-backup prompt (renderer-side modal)
    const [autoBackupPrompt, setAutoBackupPrompt] = useState<null | { intervalDays: number }>(null)
    useEffect(() => {
        // Decide locally if a prompt should be shown; mirrors logic from main but with modal UX
        let disposed = false
        ;(async () => {
            try {
                const mode = String((await window.api?.settings?.get?.({ key: 'backup.auto' }))?.value || 'PROMPT').toUpperCase()
                if (mode !== 'PROMPT') return
                const intervalDays = Number((await window.api?.settings?.get?.({ key: 'backup.intervalDays' }))?.value || 7)
                const lastAuto = Number((await window.api?.settings?.get?.({ key: 'backup.lastAuto' }))?.value || 0)
                const now = Date.now()
                const due = !lastAuto || (now - lastAuto) > intervalDays * 24 * 60 * 60 * 1000
                if (!due) return
                if (!disposed) setAutoBackupPrompt({ intervalDays })
            } catch { /* ignore */ }
        })()
        return () => { disposed = true }
    }, [])

    const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
    
    // Reports view is unified now; legacy reportsTab retained only for back-compat with localStorage but unused
    const [reportsTab, setReportsTab] = useState<string>(() => {
        try { return 'overview' } catch { return 'overview' }
    })

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
    const [exportSortDir, setExportSortDir] = useState<'ASC' | 'DESC'>('DESC')
    const [exportType, setExportType] = useState<'standard' | 'fiscal'>('standard')
    const [fiscalYear, setFiscalYear] = useState<number>(new Date().getFullYear())
    const [includeBindings, setIncludeBindings] = useState<boolean>(false)
    const [includeVoucherList, setIncludeVoucherList] = useState<boolean>(false)

    // DOM-Debug removed for release
    // const [domDebug, setDomDebug] = useState<boolean>(false)
    // Global Tags Manager modal state
    const [showTagsManager, setShowTagsManager] = useState<boolean>(false)
    // Time filter modal state
    const [showTimeFilter, setShowTimeFilter] = useState<boolean>(false)
    const [showMetaFilter, setShowMetaFilter] = useState<boolean>(false)
    // Setup Wizard modal state
    const [showSetupWizard, setShowSetupWizard] = useState<boolean>(false)

    useEffect(() => {
        try { localStorage.setItem('activePage', activePage) } catch { }
    }, [activePage])
    // No-op: unified reports page; keep effect to avoid removing too many deps
    useEffect(() => { /* unified reports */ }, [reportsTab])
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

    // Global handler: jump from invoice detail (linked booking) to Journal view filtered
    useEffect(() => {
        function onVoucherJump(ev: any) {
            try {
                const detail = ev?.detail || {}
                // Switch to Buchungen view first
                setActivePage('Buchungen')
                // Apply search query or voucherId filter
                if (typeof detail.q === 'string' && detail.q.trim()) {
                    setQ(detail.q)
                    setPage(1)
                } else if (detail.voucherId) {
                    setQ('#' + String(detail.voucherId))
                    setPage(1)
                }
            } catch { /* ignore */ }
        }
        window.addEventListener('apply-voucher-jump' as any, onVoucherJump as any)
        return () => window.removeEventListener('apply-voucher-jump' as any, onVoucherJump as any)
    }, [])

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
    const { quickAdd, setQuickAdd, qa, setQa, onQuickSave, files, setFiles, openFilePicker, onDropFiles } = useQuickAdd(
        today, 
        async (p: any) => {
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
                // JournalView handles reload via refreshKey dependency; bump version to trigger it
                bumpDataVersion()
            }
            return res
        } catch (e: any) {
            notify('error', friendlyError(e))
            return null
        }
    }, () => fileInputRef.current?.click(), notify)

    // Recent description suggestions for Quick-Add (autocomplete)
    const [descSuggest, setDescSuggest] = useState<string[]>([])
    useEffect(() => {
        let alive = true
        async function load() {
            try {
                if (!quickAdd) return
                const res = await window.api?.vouchers?.recent?.({ limit: 50 })
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
            notify('info', 'Erzeuge Beleg ?')
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
                // JournalView handles reload via refreshKey dependency; bump version to trigger it
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
            notify('info', 'Storniere Beleg ?')
            const res = await window.api?.vouchers.reverse?.({ originalId: lastId, reason: 'Dev Reverse' })
            if (res) {
                notify('success', `Storno erstellt: #${res.voucherNo}`)
                // JournalView handles reload via refreshKey dependency; bump version to trigger it
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
    // PaymentsAssignModal extracted to components/modals/PaymentsAssignModal.tsx
    // Buchungen (Journal) filter states
    const [from, setFrom] = useState<string>('')
    const [to, setTo] = useState<string>('')
    const [filterSphere, setFilterSphere] = useState<'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB' | null>(null)
    const [filterType, setFilterType] = useState<'IN' | 'OUT' | 'TRANSFER' | null>(null)
    const [filterPM, setFilterPM] = useState<'BAR' | 'BANK' | null>(null)
    const [filterEarmark, setFilterEarmark] = useState<number | null>(null)
    const [filterBudgetId, setFilterBudgetId] = useState<number | null>(null)
    const [filterTag, setFilterTag] = useState<string | null>(null)
    const [q, setQ] = useState<string>('')
    // Reports filter states (separate to avoid interference with Buchungen)
    const [reportsFrom, setReportsFrom] = useState<string>('')
    const [reportsTo, setReportsTo] = useState<string>('')
    const [reportsFilterSphere, setReportsFilterSphere] = useState<'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB' | null>(null)
    const [reportsFilterType, setReportsFilterType] = useState<'IN' | 'OUT' | 'TRANSFER' | null>(null)
    const [reportsFilterPM, setReportsFilterPM] = useState<'BAR' | 'BANK' | null>(null)
    // Global Zweckbindungen (earmarks) for filters/tables
    const [earmarks, setEarmarks] = useState<Array<{ id: number; code: string; name: string; color?: string | null }>>([])
    async function loadEarmarks() {
        try {
            const res = await window.api?.bindings?.list?.({ activeOnly: true })
            const rows = (res as any)?.rows || []
            setEarmarks(rows)
        } catch { /* ignore */ }
    }
    useEffect(() => { loadEarmarks() }, [])
    // Map of budget id -> friendly label for filter chips
    const [budgetNames, setBudgetNames] = useState<Map<number, string>>(new Map())
    const chips = useMemo(() => {
        const list: Array<{ key: string; label: string; clear: () => void }> = []
        if (from || to) list.push({ key: 'range', label: `${from || '?'} ? ${to || '?'}`, clear: () => { setFrom(''); setTo('') } })
        if (filterSphere) list.push({ key: 'sphere', label: `Sphäre: ${filterSphere}`, clear: () => setFilterSphere(null) })
        if (filterType) list.push({ key: 'type', label: `Art: ${filterType}`, clear: () => setFilterType(null) })
        if (filterPM) list.push({ key: 'pm', label: `Zahlweg: ${filterPM}`, clear: () => setFilterPM(null) })
        if (filterEarmark != null) {
            const em = earmarks.find(e => e.id === filterEarmark)
            list.push({ key: 'earmark', label: `Zweckbindung: ${em ? em.code : '#' + filterEarmark}` , clear: () => setFilterEarmark(null) })
        }
        if (filterBudgetId != null) {
            const label = budgetNames.get(filterBudgetId) || `#${filterBudgetId}`
            list.push({ key: 'budget', label: `Budget: ${label}`, clear: () => setFilterBudgetId(null) })
        }
        if (filterTag) list.push({ key: 'tag', label: `Tag: ${filterTag}`, clear: () => setFilterTag(null) })
    if (q) list.push({ key: 'q', label: `Suche: ${q}`.slice(0, 40) + (q.length > 40 ? '?' : ''), clear: () => setQ('') })
        return list
    }, [from, to, filterSphere, filterType, filterPM, filterEarmark, filterBudgetId, filterTag, earmarks, budgetNames, q])
    // Legacy alias: older render sections still refer to activeChips; keep in sync
    const activeChips = chips

    // Global Tags state (for filters, table colorization, and tag manager)
    const [tagDefs, setTagDefs] = useState<Array<{ id: number; name: string; color?: string | null }>>([])
    async function loadTags() {
        try {
            const res = await window.api?.tags?.list?.({})
            if (res) setTagDefs(res.rows || [])
        } catch { /* ignore */ }
    }
    useEffect(() => {
        loadTags()
        const onChanged = () => loadTags()
        window.addEventListener('data-changed', onChanged)
        return () => window.removeEventListener('data-changed', onChanged)
    }, [])

    // Journal table UI: column visibility and order (Buchungen view)
    type ColKey = 'actions' | 'date' | 'voucherNo' | 'type' | 'sphere' | 'description' | 'earmark' | 'budget' | 'paymentMethod' | 'attachments' | 'net' | 'vat' | 'gross'
    const defaultCols: Record<ColKey, boolean> = { actions: true, date: true, voucherNo: true, type: true, sphere: true, description: true, earmark: true, budget: true, paymentMethod: true, attachments: true, net: true, vat: true, gross: true }
    const defaultOrder: ColKey[] = ['actions', 'date', 'voucherNo', 'type', 'sphere', 'description', 'earmark', 'budget', 'paymentMethod', 'attachments', 'net', 'vat', 'gross']
    // Human-readable labels for columns (used in Einstellungen > Tabelle)
    const labelForCol = (k: string): string => {
        switch (k) {
            case 'actions': return 'Aktionen'
            case 'date': return 'Datum'
            case 'voucherNo': return 'Nr.'
            case 'type': return 'Art'
            case 'sphere': return 'Sphäre'
            case 'description': return 'Beschreibung'
            case 'earmark': return 'Zweckbindung'
            case 'budget': return 'Budget'
            case 'paymentMethod': return 'Zahlweg'
            case 'attachments': return 'Anhänge'
            case 'net': return 'Netto'
            case 'vat': return 'USt'
            case 'gross': return 'Brutto'
            default: return k
        }
    }
    const [cols, setCols] = useState<Record<ColKey, boolean>>(() => {
        try {
            const s = localStorage.getItem('journalCols')
            return s ? JSON.parse(s) : defaultCols
        } catch { return defaultCols }
    })
    const [order, setOrder] = useState<ColKey[]>(() => {
        try {
            const s = localStorage.getItem('journalColsOrder')
            return s ? JSON.parse(s) : defaultOrder
        } catch { return defaultOrder }
    })
    // Try to hydrate from persisted settings (server) once on mount if present
    useEffect(() => {
        (async () => {
            try {
                const c = await window.api?.settings?.get?.({ key: 'journal.cols' })
                if (c?.value) {
                    const parsed = JSON.parse(String(c.value))
                    if (parsed && typeof parsed === 'object') setCols(parsed)
                }
                const o = await window.api?.settings?.get?.({ key: 'journal.order' })
                if (o?.value) {
                    const parsedO = JSON.parse(String(o.value))
                    if (Array.isArray(parsedO)) setOrder(parsedO as ColKey[])
                }
            } catch { /* ignore */ }
        })()
    }, [])
    useEffect(() => {
        try { localStorage.setItem('journalCols', JSON.stringify(cols)) } catch { }
        try { window.api?.settings?.set?.({ key: 'journal.cols', value: JSON.stringify(cols) }) } catch { }
    }, [cols])
    useEffect(() => {
        try { localStorage.setItem('journalColsOrder', JSON.stringify(order)) } catch { }
        try { window.api?.settings?.set?.({ key: 'journal.order', value: JSON.stringify(order) }) } catch { }
    }, [order])

    // Journal pagination limit
    const [journalLimit, setJournalLimit] = useState<number>(50)

    // Load recent vouchers (journal/buchungen data loader)
    const loadRecent = useCallback(async () => {
        try {
            const offset = (page - 1) * journalLimit
            const res = await window.api?.vouchers?.list?.({
                limit: journalLimit,
                offset,
                sort: sortDir,
                sortBy,
                paymentMethod: filterPM || undefined,
                sphere: filterSphere || undefined,
                type: filterType || undefined,
                from: from || undefined,
                to: to || undefined,
                earmarkId: filterEarmark || undefined,
                budgetId: filterBudgetId || undefined,
                q: q.trim() || undefined,
                tag: filterTag || undefined
            })
            if (res) {
                setRows(res.rows || [])
                setTotalRows(res.total || 0)
            }
        } catch (e: any) {
            notify('error', 'Fehler beim Laden: ' + (e?.message || String(e)))
        }
    }, [journalLimit, page, sortDir, sortBy, filterPM, filterSphere, filterType, from, to, filterEarmark, filterBudgetId, q, filterTag])

    // Load vouchers whenever filters or page change
    useEffect(() => {
    // Removed old global loadRecent; JournalView listens to refreshKey now
    }, [activePage, loadRecent])

    // States for edit + batch modals (previously removed inadvertently)
    type VoucherRow = {
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
    }
    const [showBatchEarmark, setShowBatchEarmark] = useState<boolean>(false)
    const [editRow, setEditRow] = useState<(VoucherRow & { mode?: 'NET' | 'GROSS'; transferFrom?: 'BAR' | 'BANK' | null; transferTo?: 'BAR' | 'BANK' | null }) | null>(null)
    const [deleteRow, setDeleteRow] = useState<null | { id: number; voucherNo?: string | null; description?: string | null; fromEdit?: boolean }>(null)
    const editFileInputRef = useRef<HTMLInputElement | null>(null)
    const [editRowFilesLoading, setEditRowFilesLoading] = useState<boolean>(false)
    const [editRowFiles, setEditRowFiles] = useState<Array<{ id: number; fileName: string }>>([])
    const [confirmDeleteAttachment, setConfirmDeleteAttachment] = useState<null | { id: number; fileName: string }>(null)
    // Refresh attachments when opening an edit modal (so neue Anhänge erscheinen beim erneuten öffnen)
    useEffect(() => {
        if (editRow?.id) {
            setEditRowFilesLoading(true)
            ;(async () => {
                try {
                    const res = await window.api?.attachments.list?.({ voucherId: editRow.id })
                    // API may return either files[] or rows[] depending on implementation; support both
                    const list = (res as any)?.files || (res as any)?.rows || []
                    setEditRowFiles(list)
                } catch { setEditRowFiles([]) } finally { setEditRowFilesLoading(false) }
            })()
        } else {
            setEditRowFiles([])
        }
    }, [editRow?.id])

    const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])

    // Zweckbindungen (Bindings) state (kept for Buchungen page dropdowns/filters)
    const [bindings, setBindings] = useState<Array<{ id: number; code: string; name: string; description?: string | null; startDate?: string | null; endDate?: string | null; isActive: number; color?: string | null; budget?: number | null }>>([])
    async function loadBindings() {
        const res = await window.api?.bindings.list?.({})
        if (res) setBindings(res.rows)
    }

    // Budgets state (kept for Buchungen page dropdowns/filters)
    const [budgets, setBudgets] = useState<Array<{ id: number; year: number; sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; categoryId: number | null; projectId: number | null; earmarkId: number | null; amountPlanned: number; name?: string | null; categoryName?: string | null; projectName?: string | null; startDate?: string | null; endDate?: string | null; color?: string | null }>>([])
    const budgetsForEdit = useMemo(() => {
        const byIdEarmark = new Map(earmarks.map(e => [e.id, e]))
        const makeLabel = (b: any) => {
            if (b.name && String(b.name).trim()) return String(b.name).trim()
            if (b.categoryName && String(b.categoryName).trim()) return `${b.year} ? ${b.categoryName}`
            if (b.projectName && String(b.projectName).trim()) return `${b.year} ? ${b.projectName}`
            if (b.earmarkId) {
                const em = byIdEarmark.get(b.earmarkId)
                if (em) return `${b.year} ? ?? ${em.code}`
            }
            return String(b.year)
        }
        return (budgets || []).map((b) => ({ id: b.id, label: makeLabel(b) }))
    }, [budgets, earmarks])
    async function loadBudgets() {
        const res = await window.api?.budgets.list?.({})
        if (res) {
            setBudgets(res.rows)
            try {
                const map = new Map<number, string>()
                const byIdEarmark = new Map(earmarks.map(e => [e.id, e]))
                for (const b of res.rows) {
                    let label = ''
                    if (b.name && String(b.name).trim()) label = String(b.name).trim()
                    else if (b.categoryName && String(b.categoryName).trim()) label = `${b.year} ? ${b.categoryName}`
                    else if (b.projectName && String(b.projectName).trim()) label = `${b.year} ? ${b.projectName}`
                    else if (b.earmarkId) {
                        const em: any = byIdEarmark.get(b.earmarkId)
                        if (em) label = `${b.year} ? ?? ${em.code}`
                    }
                    if (!label) label = String(b.year)
                    map.set(b.id, label)
                }
                setBudgetNames(map)
            } catch { /* ignore label map errors */ }
        }
    }

    useEffect(() => {
        // Load bindings/budgets for Buchungen page (dropdown/filter needs labels)
        if (activePage === 'Buchungen') { loadBindings(); loadBudgets() }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activePage])

    // (earmarks loaded above)

    // Color palette for navigation icons
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
    return (
        <div style={{ display: 'grid', gridTemplateColumns: isTopNav ? '1fr' : `${sidebarCollapsed ? '64px' : '240px'} 1fr`, gridTemplateRows: '56px 1fr', gridTemplateAreas: isTopNav ? '"top" "main"' : '"top top" "side main"', height: '100vh', overflow: 'hidden' }}>
            {/* Topbar with organisation header line */}
            <header
                style={{ gridArea: 'top', position: 'sticky', top: 0, zIndex: 1000, display: 'grid', gridTemplateColumns: isTopNav ? '1fr auto 1fr 104px' : '1fr 104px', alignItems: 'center', gap: 12, padding: '4px 8px', borderBottom: '1px solid var(--border)', backdropFilter: 'var(--blur)', background: 'color-mix(in oklab, var(--surface) 50%, transparent)', WebkitAppRegion: 'drag' } as any}
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
                            className="btn ghost icon-btn"
                            title={sidebarCollapsed ? 'Seitenleiste erweitern' : 'Seitenleiste komprimieren'}
                            aria-label="Seitenleiste umschalten"
                            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
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
                    <div style={{ display: 'inline-flex', WebkitAppRegion: 'no-drag' } as any}>
                        <TopNav
                            activePage={activePage}
                            onNavigate={setActivePage}
                            navIconColorMode={navIconColorMode}
                        />
                    </div>
                ) : null}
                {isTopNav && <div />}
                {/* Window controls */}
                <div style={{ display: 'inline-flex', gap: 4, justifySelf: 'end', WebkitAppRegion: 'no-drag' } as any}>
                    <button className="btn ghost icon-btn" title="Minimieren" aria-label="Minimieren" onClick={() => window.api?.window?.minimize?.()}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="11" width="14" height="2" rx="1"/></svg>
                    </button>
                    <button className="btn ghost icon-btn" title="Maximieren / Wiederherstellen" aria-label="Maximieren" onClick={() => window.api?.window?.toggleMaximize?.()}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 6h12v12H6z"/></svg>
                    </button>
                    <button className="btn danger icon-btn" title="Schließen" aria-label="Schließen" onClick={() => window.api?.window?.close?.()}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2"/></svg>
                    </button>
                </div>
            </header>
            {!isTopNav && (
                <aside className="app-sidebar">
                    <SideNav
                        activePage={activePage}
                        onNavigate={setActivePage}
                        navIconColorMode={navIconColorMode}
                        collapsed={sidebarCollapsed}
                    />
                </aside>
            )}

            {/* Main content */}
            <main style={{ gridArea: 'main', padding: 16, overflowY: 'auto' }}>
                    
                    {activePage === 'Reports' && (
                        <ReportsView
                            from={reportsFrom}
                            to={reportsTo}
                            setFrom={setReportsFrom}
                            setTo={setReportsTo}
                            yearsAvail={yearsAvail}
                            filterSphere={reportsFilterSphere}
                            setFilterSphere={setReportsFilterSphere}
                            filterType={reportsFilterType}
                            setFilterType={setReportsFilterType}
                            filterPM={reportsFilterPM}
                            setFilterPM={setReportsFilterPM}
                            onOpenExport={() => setShowExportOptions(true)}
                            refreshKey={refreshKey}
                            activateKey={reportsActivateKey}
                        />
                    )}
                    {activePage === 'Zweckbindungen' && <h1>Zweckbindungen</h1>}
                    {activePage === 'Budgets' && <h1>Budgets</h1>}
                    {activePage === 'Dashboard' && (
                        <DashboardView today={today} onGoToInvoices={() => setActivePage('Rechnungen')} />
                    )}
                    {activePage === 'Buchungen' && (
                        <JournalView
                            flashId={flashId}
                            setFlashId={setFlashId}
                            periodLock={periodLock}
                            refreshKey={refreshKey}
                            notify={notify}
                            bumpDataVersion={bumpDataVersion}
                            fmtDate={fmtDate}
                            setActivePage={setActivePage}
                            setShowTimeFilter={setShowTimeFilter}
                            setShowMetaFilter={setShowMetaFilter}
                            earmarks={earmarks}
                            tagDefs={tagDefs}
                            budgetsForEdit={budgetsForEdit}
                            budgetNames={budgetNames}
                            eurFmt={eurFmt}
                            friendlyError={friendlyError}
                            bufferToBase64Safe={bufferToBase64Safe}
                            journalLimit={journalLimit}
                            setJournalLimit={(n: number) => { setJournalLimit(n); setPage(1) }}
                            dateFmt={dateFmt}
                            from={from}
                            to={to}
                            filterSphere={filterSphere}
                            filterType={filterType}
                            filterPM={filterPM}
                            filterEarmark={filterEarmark}
                            filterBudgetId={filterBudgetId}
                            filterTag={filterTag}
                            q={q}
                            setFrom={setFrom}
                            setTo={setTo}
                            setFilterSphere={setFilterSphere}
                            setFilterType={setFilterType}
                            setFilterPM={setFilterPM}
                            setFilterEarmark={setFilterEarmark}
                            setFilterBudgetId={setFilterBudgetId}
                            setFilterTag={setFilterTag}
                            setQ={setQ}
                            page={page}
                            setPage={setPage}
                        />
                    )}
                    {/* Old Buchungen block removed - now using JournalView component */}

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
                            labelForCol={labelForCol}
                            openSetupWizard={() => setShowSetupWizard(true)}
                        />
                    )}

                    {activePage === 'Belege' && (
                        <ReceiptsView />
                    )}

                    {activePage === 'Zweckbindungen' && (
                        <EarmarksView
                            from={from || undefined}
                            to={to || undefined}
                            filterSphere={filterSphere || undefined}
                            onGoToBookings={(earmarkId) => {
                                // Reset other filters first, then set earmark and navigate
                                setFilterBudgetId(null)
                                setFilterTag(null)
                                setFilterType(null)
                                setFilterPM(null)
                                setFilterSphere(null)
                                setQ('')
                                setFrom('')
                                setTo('')
                                setFilterEarmark(earmarkId)
                                // Use setTimeout to ensure state updates before navigation
                                setTimeout(() => {
                                    setActivePage('Buchungen')
                                    setPage(1)
                                }, 0)
                            }}
                            onLoadEarmarks={loadEarmarks}
                            notify={notify}
                        />
                    )}

                    {activePage === 'Budgets' && (
                        <BudgetsView
                            onGoToBookings={(budgetId) => {
                                // Reset other filters first, then set budget and navigate
                                setFilterEarmark(null)
                                setFilterTag(null)
                                setFilterType(null)
                                setFilterPM(null)
                                setFilterSphere(null)
                                setQ('')
                                setFrom('')
                                setTo('')
                                setFilterBudgetId(budgetId)
                                // Use setTimeout to ensure state updates before navigation
                                setTimeout(() => {
                                    setActivePage('Buchungen')
                                    setPage(1)
                                }, 0)
                            }}
                            notify={notify}
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
                <QuickAddModal
                    qa={qa}
                    setQa={setQa}
                    onSave={onQuickSave}
                    onClose={() => setQuickAdd(false)}
                    files={files}
                    setFiles={setFiles}
                    openFilePicker={openFilePicker}
                    onDropFiles={onDropFiles}
                    fileInputRef={fileInputRef}
                    fmtDate={fmtDate}
                    eurFmt={eurFmt}
                    budgetsForEdit={budgetsForEdit}
                    earmarks={earmarks}
                    tagDefs={tagDefs}
                    descSuggest={descSuggest}
                />
            )}
            {/* removed: Confirm mark as paid modal */}
            {/* Global Floating Action Button: + Buchung (hidden on certain pages) */}
            {activePage !== 'Einstellungen' && activePage !== 'Mitglieder' && activePage !== 'Rechnungen' && activePage !== 'Budgets' && activePage !== 'Zweckbindungen' && (
                <button className="fab fab-buchung" onClick={() => setQuickAdd(true)} title="+ Buchung">
                    <span className="fab-buchung-icon">+</span>
                    <span className="fab-buchung-text">Buchung</span>
                </button>
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
            {showSetupWizard && (
                <SetupWizardModal
                    onClose={() => setShowSetupWizard(false)}
                    navLayout={navLayout}
                    setNavLayout={(v) => { setNavLayout(v); try { localStorage.setItem('ui.navLayout', v) } catch {} }}
                    navIconColorMode={navIconColorMode}
                    setNavIconColorMode={(v) => { setNavIconColorMode(v); try { localStorage.setItem('ui.navIconColorMode', v) } catch {} }}
                    colorTheme={colorTheme}
                    setColorTheme={(v) => { setColorTheme(v); try { localStorage.setItem('ui.colorTheme', v) } catch {}; try { document.documentElement.setAttribute('data-color-theme', v) } catch {} }}
                    journalRowStyle={journalRowStyle}
                    setJournalRowStyle={(v) => { setJournalRowStyle(v); try { localStorage.setItem('ui.journalRowStyle', v) } catch {}; try { document.documentElement.setAttribute('data-journal-row-style', v) } catch {} }}
                    journalRowDensity={journalRowDensity}
                    setJournalRowDensity={(v) => { setJournalRowDensity(v); try { localStorage.setItem('ui.journalRowDensity', v) } catch {}; try { document.documentElement.setAttribute('data-journal-row-density', v) } catch {} }}
                    existingTags={tagDefs as any}
                    notify={notify}
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
                    dateFrom={reportsFrom}
                    dateTo={reportsTo}
                    exportType={exportType}
                    setExportType={setExportType}
                    fiscalYear={fiscalYear}
                    setFiscalYear={setFiscalYear}
                    includeBindings={includeBindings}
                    setIncludeBindings={setIncludeBindings}
                    includeVoucherList={includeVoucherList}
                    setIncludeVoucherList={setIncludeVoucherList}
                    onExport={async (fmt) => {
                        try {
                            if (fmt === 'PDF_FISCAL') {
                                // Fiscal year report for tax office
                                const res = await (window as any).api?.reports?.exportFiscal?.({
                                    fiscalYear,
                                    includeBindings,
                                    includeVoucherList,
                                    orgName: exportOrgName || undefined
                                })
                                if (res) {
                                    notify('success', `Finanzamt-Report exportiert: ${res.filePath}`, 6000, {
                                        label: 'Ordner öffnen',
                                        onClick: () => window.api?.shell?.showItemInFolder?.(res.filePath)
                                    })
                                }
                            } else {
                                // Standard export
                                const res = await window.api?.reports.export?.({
                                    type: 'JOURNAL',
                                    format: fmt,
                                    from: reportsFrom || '',
                                    to: reportsTo || '',
                                    filters: { paymentMethod: reportsFilterPM || undefined, sphere: reportsFilterSphere || undefined, type: reportsFilterType || undefined },
                                    fields: exportFields,
                                    orgName: exportOrgName || undefined,
                                    amountMode: exportAmountMode,
                                    sort: exportSortDir,
                                    sortBy: 'date'
                                } as any)
                                if (res) {
                                    notify('success', `${fmt} exportiert: ${res.filePath}`, 6000, {
                                        label: 'Ordner öffnen',
                                        onClick: () => window.api?.shell?.showItemInFolder?.(res.filePath)
                                    })
                                }
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
// MetaFilterModal extracted to components/modals/MetaFilterModal.tsx

// Time Filter Modal: controls date range and quick year selection
// TimeFilterModal extracted to components/modals/TimeFilterModal.tsx

// Export Options Modal for Reports
// ExportOptionsModal extracted to components/modals/ExportOptionsModal.tsx

// AutoBackupPromptModal extracted to components/modals/AutoBackupPromptModal.tsx


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
                        <header className="flex justify-between items-center">
                            <h3 className="m-0">Beitragsstatus</h3>
                            <button className="btn" onClick={()=>setOpen(false)}>?</button>
                        </header>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
                            <div className="helper font-semibold">{name}{memberNo ? ` (${memberNo})` : ''}</div>
                            <span className="helper">�</span>
                            <span className="helper">Eintritt: {status?.joinDate || '?'}</span>
                            <span className="helper">?</span>
                            <span className="helper">Status: {status?.state === 'OVERDUE' ? `?berf?llig (${status?.overdue})` : status?.state === 'OK' ? 'OK' : '?'}</span>
                            <span className="helper">?</span>
                            <span className="helper">Letzte Zahlung: {status?.lastPeriod ? `${status.lastPeriod} (${status?.lastDate||''})` : '?'}</span>
                            <span className="helper">?</span>
                            <span className="helper">Initiale F?lligkeit: {status?.nextDue || '?'}</span>
                        </div>
                        <MemberTimeline status={status} history={history} />
                        {/* Due payments for this member */}
                        <div className="card p-10">
                            <strong>F?llige Beitr?ge</strong>
                            {due.length === 0 ? (
                                <div className="helper mt-6">Aktuell keine offenen Perioden.</div>
                            ) : (
                                <>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                                        <div className="helper">Seite {duePage} von {Math.max(1, Math.ceil(due.length / pageSize))} ? {due.length} offen</div>
                                        <div className="flex gap-6">
                                            <button className={`btn ${duePage <= 1 ? "opacity-60 cursor-not-allowed" : ""}`} onClick={() => setDuePage(1)} disabled={duePage <= 1}>?</button>
                                            <button className={`btn ${duePage <= 1 ? "opacity-60 cursor-not-allowed" : ""}`} onClick={() => setDuePage(p => Math.max(1, p - 1))} disabled={duePage <= 1}>‹</button>
                                            <button className={`btn ${duePage >= Math.max(1, Math.ceil(due.length / pageSize)) ? "opacity-60 cursor-not-allowed" : ""}`} onClick={() => setDuePage(p => Math.min(Math.max(1, Math.ceil(due.length / pageSize)), p + 1))} disabled={duePage >= Math.max(1, Math.ceil(due.length / pageSize))}>›</button>
                                            <button className={`btn ${duePage >= Math.max(1, Math.ceil(due.length / pageSize)) ? "opacity-60 cursor-not-allowed" : ""}`} onClick={() => setDuePage(Math.max(1, Math.ceil(due.length / pageSize)))} disabled={duePage >= Math.max(1, Math.ceil(due.length / pageSize))}>?</button>
                                        </div>
                                    </div>
                                    <table cellPadding={6} style={{ width: '100%', marginTop: 6 }}>
                                        <thead>
                                            <tr>
                                                <th align="left">Periode</th>
                                                <th align="right">Betrag</th>
                                                <th align="left">Verkn?pfen</th>
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
                                                            <div className="grid gap-6">
                                                                <select className="input" value={selVoucher ?? ''} onChange={e => setSelVoucherByPeriod(prev => ({ ...prev, [r.periodKey]: e.target.value ? Number(e.target.value) : null }))} title="Passende Buchung verkn?pfen">
                                                                    <option value="">? ohne Verkn?pfung ?</option>
                                                                    {manualList.map(s => (
                                                                        <option key={`m-${s.id}`} value={s.id}>{s.voucherNo || s.id} ? {s.date} ? {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(s.gross)} ? {(s.description || s.counterparty || '')}</option>
                                                                    ))}
                                                                </select>
                                                                <div className="flex gap-6">
                                                                    <input className="input" placeholder="Buchung suchen?" value={search} onChange={e => setSearchByPeriod(prev => ({ ...prev, [r.periodKey]: e.target.value }))} title="Suche in Buchungen (Betrag/Datum/Text)" />
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
                                    {/* Duplicate pagination controls removed (footer) to avoid redundancy */}
                                </>
                            )}
                        </div>
                        <div className="flex justify-start items-center">
                            <button className="btn primary" onClick={async ()=>{
                                try {
                                    const addr = memberData?.address || null
                                    const res = await (window as any).api?.members?.writeLetter?.({ id: memberId, name, address: addr, memberNo })
                                    if (!(res?.ok)) alert(res?.error || 'Konnte Brief nicht öffnen')
                                } catch (e: any) { alert(e?.message || String(e)) }
                            }}>Mitglied anschreiben</button>
                        </div>
                        <div className="card p-10">
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
                                            <td>{r.voucherNo ? `#${r.voucherNo}` : '?'} {r.description ? `? ${r.description}` : ''}</td>
                                        </tr>
                                    ))}
                                    {history.length===0 && <tr><td colSpan={4}><div className="helper">Keine Zahlungen</div></td></tr>}
                                </tbody>
                            </table>
                        </div>
                        <div className="flex justify-end">
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
        <div className="card p-10">
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
                                    <title>{`${pk} ? ${isPaid ? 'bezahlt' : (isOverdue ? '?berf?llig' : (isCurrent ? 'aktuell' : 'offen'))}`}</title>
                                </circle>
                                <text x={x} y={12} textAnchor="middle" fontSize={10} fill="var(--text-dim)">{pk}</text>
                                <text x={x} y={50} textAnchor="middle" fontSize={10} fill={isPaid ? 'var(--success)' : (isOverdue ? 'var(--danger)' : 'var(--text-dim)')}>
                                    {isPaid ? 'bezahlt' : (isOverdue ? '?berf?llig' : (isCurrent ? 'jetzt' : ''))}
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

/* INLINE PaymentsAssignModal content removed */

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


// Binding Modal
// BindingModal extracted to components/modals/BindingModal.tsx

// Budget Modal
// BudgetModal extracted to components/modals/BudgetModal.tsx

// Invoices View
// InvoicesView extracted to views/InvoicesView.tsx

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
                            <button className="chip-x" onClick={() => removeTag(t)} aria-label={`Tag ${t} entfernen`} type="button">?</button>
                        </span>
                    )
                })}
                {/* Quick add via dropdown */}
                <select
                    className="input"
                    value=""
                    onChange={(e) => { const name = e.target.value; if (name) addTag(name) }}
                    style={{ minWidth: 140 }}
                    title="Tag aus Liste hinzuf?gen"
                >
                    <option value="">+ Tag ausw?hlen?</option>
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
                    placeholder={(value || []).length ? '' : 'Tag hinzuf?gen?'}
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
function FilterTotals({ refreshKey, from, to, paymentMethod, sphere, type, earmarkId, budgetId, q, tag }: { refreshKey?: number; from?: string; to?: string; paymentMethod?: 'BAR' | 'BANK'; sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; type?: 'IN' | 'OUT' | 'TRANSFER'; earmarkId?: number; budgetId?: number | null; q?: string; tag?: string }) {
    const [loading, setLoading] = useState(false)
    const [values, setValues] = useState<{ inGross: number; outGross: number; diff: number } | null>(null)
    useEffect(() => {
        let alive = true
        async function run() {
            setLoading(true)
            try {
                if (typeof budgetId === 'number') {
                    const u = await window.api?.budgets.usage?.({ budgetId, from, to })
                    const inflow = Math.max(0, Number(u?.inflow || 0))
                    const spent = Math.max(0, Number(u?.spent || 0))
                    const diff = Math.round((inflow - spent) * 100) / 100
                    if (alive) setValues({ inGross: inflow, outGross: spent, diff })
                } else {
                    const res = await window.api?.reports.summary?.({ from, to, paymentMethod, sphere, type, earmarkId, q, tag })
                    if (alive && res) {
                        const t = res.byType || []
                        const inGross = t.find((x: any) => x.key === 'IN')?.gross || 0
                        const outGrossRaw = t.find((x: any) => x.key === 'OUT')?.gross || 0
                        const outGross = Math.abs(outGrossRaw)
                        const diff = Math.round((inGross - outGross) * 100) / 100
                        setValues({ inGross, outGross, diff })
                    }
                }
            } finally {
                if (alive) setLoading(false)
            }
        }
        run()
        return () => { alive = false }
    }, [from, to, paymentMethod, sphere, type, earmarkId, budgetId, q, tag, refreshKey])
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

// EarmarkUsageCards moved to components/tiles/EarmarkUsageCards

// Reports-* component implementations removed (moved to dedicated files under components/reports and views/Dashboard/charts)

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
        const sym = active ? (sortDir === 'DESC' ? ICONS.ARROW_DOWN : ICONS.ARROW_UP) : ICONS.ARROW_BOTH
        const color = active ? 'var(--warning)' : 'var(--text-dim)'
        return <span className={`sort-icon ${active ? 'active' : 'inactive'}`} aria-hidden="true" style={{ color }}>{sym}</span>
    }
    const thFor = (k: string) => (
        k === 'actions' ? <th key={k} align="center" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>Aktionen</th>
            : k === 'date' ? <th key={k} align="left" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))} onClick={() => onToggleSort('date')} className="cursor-pointer">Datum {renderSortIcon('date')}</th>
                : k === 'voucherNo' ? <th key={k} align="left" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>Nr.</th>
                    : k === 'type' ? <th key={k} align="left" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>Art</th>
                        : k === 'sphere' ? <th key={k} align="left" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>Sphäre</th>
                            : k === 'description' ? <th key={k} align="left" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>Beschreibung</th>
                                : k === 'earmark' ? <th key={k} align="center" title="Zweckbindung" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>??</th>
                                    : k === 'budget' ? <th key={k} align="center" title="Budget" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>??</th>
                                        : k === 'paymentMethod' ? <th key={k} align="left" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>Zahlweg</th>
                                            : k === 'attachments' ? <th key={k} align="center" title="Anhänge" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>??</th>
                                                : k === 'net' ? <th key={k} align="right" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))} onClick={() => onToggleSort('net')} className="cursor-pointer">Netto {renderSortIcon('net')}</th>
                                                    : k === 'vat' ? <th key={k} align="right" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>MwSt</th>
                                                        : <th key={k} align="right" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))} onClick={() => onToggleSort('gross')} className="cursor-pointer">Brutto {renderSortIcon('gross')}</th>
    )
    const colorFor = (name: string) => (tagDefs || []).find(t => (t.name || '').toLowerCase() === (name || '').toLowerCase())?.color
    const isLocked = (d: string) => {
        if (!lockedUntil) return false
        return String(d) <= String(lockedUntil)
    }
    const tdFor = (k: string, r: any) => (
        k === 'actions' ? (
            <td key={k} align="center" className="text-nowrap">
                {isLocked(r.date) ? (
                    <span className="badge" title={`Bis ${lockedUntil} abgeschlossen (Jahresabschluss)`} aria-label="Gesperrt">??</span>
                ) : (
                    <button className="btn" title="Bearbeiten" onClick={() => onEdit({ id: r.id, date: r.date, description: r.description ?? '', paymentMethod: r.paymentMethod ?? null, transferFrom: r.transferFrom ?? null, transferTo: r.transferTo ?? null, type: r.type, sphere: r.sphere, earmarkId: r.earmarkId ?? null, budgetId: r.budgetId ?? null, tags: r.tags || [], netAmount: r.netAmount, grossAmount: r.grossAmount, vatRate: r.vatRate })}>?</button>
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
                <div className="flex items-center gap-6 flex-wrap">
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
                        const title = from && to ? `${from} ? ${to}` : 'Transfer'
                        return (
                            <span className="badge inline-flex items-center gap-6" title={title} aria-label={title}>
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
            <td key={k} align="center">{typeof r.fileCount === 'number' && r.fileCount > 0 ? (<span className="badge" title={`${r.fileCount} Anhang/Anhänge`}>?? {r.fileCount}</span>) : ''}</td>
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

// Wrapper with context providers
export default function App() {
    return (
        <UIPreferencesProvider>
            <ToastProvider>
                <AppInner />
            </ToastProvider>
        </UIPreferencesProvider>
    )
}
