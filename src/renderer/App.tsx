import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ICONS } from './utils/icons'
import ReportsView from './views/Reports/ReportsView'
import { SettingsView } from './views/Settings/SettingsView'
import DashboardView from './views/Dashboard/DashboardView'
import InvoicesView from './views/InvoicesView'
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
import DbMigrateModal from './DbMigrateModal'
import SmartRestoreModal from './components/modals/SmartRestoreModal'
import SetupWizardModal from './components/modals/SetupWizardModal'
import EarmarkUsageCards from './components/tiles/EarmarkUsageCards'
import BudgetsView from './views/Budgets/BudgetsView'
import EarmarksView from './views/Earmarks/EarmarksView'
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
    const [activePage, setActivePage] = useState<'Dashboard' | 'Buchungen' | 'Zweckbindungen' | 'Budgets' | 'Reports' | 'Belege' | 'Rechnungen' | 'Mitglieder' | 'Einstellungen'>(() => {
        try { return (localStorage.getItem('activePage') as any) || 'Buchungen' } catch { return 'Buchungen' }
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
    // Navigation layout preference: 'left' classic sidebar vs 'top' icon-only header menu
    type NavLayout = 'left' | 'top'
    const [navLayout, setNavLayout] = useState<NavLayout>(() => {
        try { return (localStorage.getItem('ui.navLayout') as NavLayout) || 'left' } catch { return 'left' }
    })
    const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
        try { return localStorage.getItem('sidebarCollapsed') === '1' } catch { return false }
    })
    // Reports view is unified now; legacy reportsTab retained only for back-compat with localStorage but unused
    const [reportsTab, setReportsTab] = useState<string>(() => {
        try { return 'overview' } catch { return 'overview' }
    })

    // UI preference: color theme palette
    type ColorTheme = 'default' | 'fiery-ocean' | 'peachy-delight' | 'pastel-dreamland' | 'ocean-breeze' | 'earthy-tones' | 'monochrome-harmony' | 'vintage-charm'
    const [colorTheme, setColorTheme] = useState<ColorTheme>(() => {
        try { return (localStorage.getItem('ui.colorTheme') as ColorTheme) || 'default' } catch { return 'default' }
    })
    useEffect(() => {
        try { localStorage.setItem('ui.colorTheme', colorTheme) } catch { }
        // apply on <html>
        try { document.documentElement.setAttribute('data-color-theme', colorTheme) } catch { }
    }, [colorTheme])
    // UI preference: journal table row style and density (Buchungen)
    type JournalRowStyle = 'both' | 'lines' | 'zebra' | 'none'
    type JournalRowDensity = 'normal' | 'compact'
    const [journalRowStyle, setJournalRowStyle] = useState<JournalRowStyle>(() => {
        try { return (localStorage.getItem('ui.journalRowStyle') as JournalRowStyle) || 'both' } catch { return 'both' }
    })
    const [journalRowDensity, setJournalRowDensity] = useState<JournalRowDensity>(() => {
        try { return (localStorage.getItem('ui.journalRowDensity') as JournalRowDensity) || 'normal' } catch { return 'normal' }
    })
    useEffect(() => {
        try { localStorage.setItem('ui.journalRowStyle', journalRowStyle) } catch { }
        try { document.documentElement.setAttribute('data-journal-row-style', journalRowStyle) } catch { }
    }, [journalRowStyle])
    useEffect(() => {
        try { localStorage.setItem('ui.journalRowDensity', journalRowDensity) } catch { }
        try { document.documentElement.setAttribute('data-journal-row-density', journalRowDensity) } catch { }
    }, [journalRowDensity])
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
        try { localStorage.setItem('sidebarCollapsed', sidebarCollapsed ? '1' : '0') } catch { }
    }, [sidebarCollapsed])
    useEffect(() => { try { localStorage.setItem('ui.navLayout', navLayout) } catch { } }, [navLayout])

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
                await loadRecent()
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
        if (from || to) list.push({ key: 'range', label: `${from || '…'} – ${to || '…'}`, clear: () => { setFrom(''); setTo('') } })
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
    if (q) list.push({ key: 'q', label: `Suche: ${q}`.slice(0, 40) + (q.length > 40 ? '…' : ''), clear: () => setQ('') })
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
    // Humanâ€‘readable labels for columns (used in Einstellungen > Tabelle)
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
        if (activePage === 'Buchungen') loadRecent()
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
    // Refresh attachments when opening an edit modal (so neue Anhänge erscheinen beim erneuten Öffnen)
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
                    else if (b.categoryName && String(b.categoryName).trim()) label = `${b.year} · ${b.categoryName}`
                    else if (b.projectName && String(b.projectName).trim()) label = `${b.year} · ${b.projectName}`
                    else if (b.earmarkId) {
                        const em: any = byIdEarmark.get(b.earmarkId)
                        if (em) label = `${b.year} · 🎯 ${em.code}`
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
                                { key: 'Mitglieder', icon: (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" role="img" aria-label="Mitglieder">
                                        <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V20h14v-3.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V20h7v-3.5c0-2.33-4.67-3.5-7-3.5z"/>
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
                            <React.Fragment key={`nav-group-${gi}`}>
                                {group.map(({ key, icon }) => (
                                    <React.Fragment key={key}>
                                        <button
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
                                        {(['Buchungen','Rechnungen','Mitglieder'] as const).includes(key as any) && (
                                            <span aria-hidden style={{ display: 'inline-block', width: 1, height: 24, background: 'var(--border)', margin: '0 8px' }} />
                                        )}
                                    </React.Fragment>
                                ))}
                                {gi < arr.length - 1 && (
                                    <span aria-hidden style={{ display: 'inline-block', width: 1, height: 24, background: 'var(--border)', margin: '0 8px' }} />
                                )}
                            </React.Fragment>
                        ))}
                    </nav>
                ) : null}
                {isTopNav && <div />}
                {/* Window controls */}
                <div style={{ display: 'inline-flex', gap: 4, justifySelf: 'end', WebkitAppRegion: 'no-drag' } as any}>
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
                                {/* Group 2: Buchungen, Rechnungen, Mitglieder, Budgets, Zweckbindungen */}
                                {[
                                    { key: 'Buchungen', label: 'Buchungen', icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 5h18v2H3V5zm0 6h18v2H3v-2zm0 6h12v2H3v-2z" /></svg>) },
                                    { key: 'Rechnungen', label: 'Rechnungen', icon: (
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" role="img" aria-label="Rechnungen">
                                            <path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM14 3v5h5"/>
                                            <path d="M8 12h8v2H8zM8 16h8v2H8zM8 8h4v2H8z"/>
                                        </svg>
                                    ) },
                                    { key: 'Mitglieder', label: 'Mitglieder', icon: (
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" role="img" aria-label="Mitglieder">
                                            <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V20h14v-3.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V20h7v-3.5c0-2.33-4.67-3.5-7-3.5z"/>
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
                    
                    {activePage === 'Reports' && (
                        <ReportsView
                            from={from}
                            to={to}
                            setFrom={setFrom}
                            setTo={setTo}
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
                                setFilterEarmark(earmarkId)
                                setActivePage('Buchungen')
                                setPage(1)
                            }}
                            onLoadEarmarks={loadEarmarks}
                            notify={notify}
                        />
                    )}

                    {activePage === 'Budgets' && (
                        <BudgetsView
                            onGoToBookings={(budgetId) => {
                                setFilterBudgetId(budgetId)
                                setActivePage('Buchungen')
                                setPage(1)
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
                            {/* Block A â€“ Basisinfos */}
                            <div className="card" style={{ padding: 12 }}>
                                <div className="helper" style={{ marginBottom: 6 }}>Basis</div>
                                <div className="row">
                                    <div className="field">
                                        <label>Datum <span className="req-asterisk" aria-hidden="true">*</span></label>
                                        <input className="input" type="date" value={qa.date} onChange={(e) => setQa({ ...qa, date: e.target.value })} required />
                                    </div>
                                    <div className="field">
                                        <label>Art</label>
                                        <div className="btn-group" role="group" aria-label="Art wählen">
                                            {(['IN','OUT','TRANSFER'] as const).map(t => (
                                                <button key={t} type="button" className="btn" onClick={() => {
                                                    const newQa = { ...qa, type: t }
                                                    if (t === 'TRANSFER' && (!(newQa as any).transferFrom || !(newQa as any).transferTo)) {
                                                        (newQa as any).transferFrom = 'BAR';
                                                        (newQa as any).transferTo = 'BANK'
                                                    }
                                                    setQa(newQa)
                                                }} style={{ background: qa.type === t ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined, color: t==='IN' ? 'var(--success)' : t==='OUT' ? 'var(--danger)' : undefined }}>{t}</button>
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
                                            <label>Richtung <span className="req-asterisk" aria-hidden="true">*</span></label>
                                            <select value={`${(qa as any).transferFrom ?? ''}->${(qa as any).transferTo ?? ''}`}
                                                onChange={(e) => {
                                                    const v = e.target.value
                                                    if (v === 'BAR->BANK') setQa({ ...(qa as any), transferFrom: 'BAR', transferTo: 'BANK', paymentMethod: undefined } as any)
                                                    else if (v === 'BANK->BAR') setQa({ ...(qa as any), transferFrom: 'BANK', transferTo: 'BAR', paymentMethod: undefined } as any)
                                                }}>
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

                            {/* Block B â€“ Finanzdetails */}
                            <div className="card" style={{ padding: 12 }}>
                                <div className="helper" style={{ marginBottom: 6 }}>Finanzen</div>
                                <div className="row">
                                    {qa.type === 'TRANSFER' ? (
                                        <div className="field" style={{ gridColumn: '1 / -1' }}>
                                            <label>Betrag (Transfer) <span className="req-asterisk" aria-hidden="true">*</span></label>
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
                                                <label>{(qa as any).mode === 'GROSS' ? 'Brutto' : 'Netto'} <span className="req-asterisk" aria-hidden="true">*</span></label>
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

                            {/* Block C+D – Beschreibung & Tags + Anhänge */}
                            <div className="block-grid" style={{ marginBottom: 8 }}>
                                {/* Block C â€“ Beschreibung & Tags */}
                                <div className="card" style={{ padding: 12 }}>
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
                                    style={{ padding: 12 }}
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
            {/* Global Floating Action Button: + Buchung (hidden in Einstellungen, Mitglieder und Rechnungen) */}
            {activePage !== 'Einstellungen' && activePage !== 'Mitglieder' && activePage !== 'Rechnungen' && (
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

// Basic Members UI: list with search and add/edit modal (Phase 1)
function MembersView() {
    const [q, setQ] = useState(() => { try { return localStorage.getItem('members.q') || '' } catch { return '' } })
    const [status, setStatus] = useState<'ALL' | 'ACTIVE' | 'NEW' | 'PAUSED' | 'LEFT'>(() => { try { return (localStorage.getItem('members.status') as any) || 'ALL' } catch { return 'ALL' } })
    const [sortBy, setSortBy] = useState<'memberNo'|'name'|'email'|'status'>(() => { try { return (localStorage.getItem('members.sortBy') as any) || 'name' } catch { return 'name' } })
    const [sort, setSort] = useState<'ASC'|'DESC'>(() => { try { return (localStorage.getItem('members.sort') as any) || 'ASC' } catch { return 'ASC' } })
    useEffect(() => { try { localStorage.setItem('members.q', q) } catch { } }, [q])
    useEffect(() => { try { localStorage.setItem('members.status', status) } catch { } }, [status])
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
                        <button 
                            className="btn ghost" 
                            title="Alle Filter zurücksetzen"
                            onClick={() => { setQ(''); setStatus('ALL'); setOffset(0) }}
                            style={{ padding: '4px 8px', color: 'var(--accent)' }}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
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
                            Nr. <span aria-hidden="true" style={{ color: (sortBy as any) === 'memberNo' ? 'var(--warning)' : 'var(--text-dim)' }}>{(sortBy as any) === 'memberNo' ? (sort === 'ASC' ? ICONS.ARROW_UP : ICONS.ARROW_DOWN) : ICONS.ARROW_BOTH}</span>
                        </th>
                        <th align="left" style={{ cursor: 'pointer' }} onClick={() => { setOffset(0); setSortBy('name'); setSort(s => (sortBy === 'name' ? (s === 'ASC' ? 'DESC' : 'ASC') : 'ASC')) }}>
                            Name <span aria-hidden="true" style={{ color: sortBy === 'name' ? 'var(--warning)' : 'var(--text-dim)' }}>{sortBy === 'name' ? (sort === 'ASC' ? ICONS.ARROW_UP : ICONS.ARROW_DOWN) : ICONS.ARROW_BOTH}</span>
                        </th>
                        <th align="left" style={{ cursor: 'pointer' }} onClick={() => { setOffset(0); setSortBy('email'); setSort(s => (sortBy === 'email' ? (s === 'ASC' ? 'DESC' : 'ASC') : 'ASC')) }}>
                            E-Mail <span aria-hidden="true" style={{ color: sortBy === 'email' ? 'var(--warning)' : 'var(--text-dim)' }}>{sortBy === 'email' ? (sort === 'ASC' ? ICONS.ARROW_UP : ICONS.ARROW_DOWN) : ICONS.ARROW_BOTH}</span>
                        </th>
                        <th align="left">Telefon</th>
                        {colPrefs.showAddress && (<th align="left">Adresse</th>)}
                        {colPrefs.showIBAN && (<th align="left">IBAN</th>)}
                        {colPrefs.showContribution && (<th align="right">Beitrag</th>)}
                        <th align="left" style={{ cursor: 'pointer' }} onClick={() => { setOffset(0); setSortBy('status'); setSort(s => (sortBy === 'status' ? (s === 'ASC' ? 'DESC' : 'ASC') : 'ASC')) }}>
                            Status <span aria-hidden="true" style={{ color: sortBy === 'status' ? 'var(--warning)' : 'var(--text-dim)' }}>{sortBy === 'status' ? (sort === 'ASC' ? ICONS.ARROW_UP : ICONS.ARROW_DOWN) : ICONS.ARROW_BOTH}</span>
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
                    <button className="btn" onClick={() => setOffset(0)} disabled={offset <= 0} title="Erste">«</button>
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
                                {/* Info tooltip entfernt */}
                                <span className="badge" title="Status" style={{ background: (form.draft.status === 'ACTIVE' ? '#00C853' : form.draft.status === 'NEW' ? '#2196F3' : form.draft.status === 'PAUSED' ? '#FF9800' : 'var(--danger)'), color: '#fff' }}>{form.draft.status || '—'}</span>
                                <button className="btn" onClick={() => setForm(null)} aria-label="Schließen">✕</button>
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
                            <button className="btn" onClick={() => setShowColumnsModal(false)}>Ã—</button>
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
                            <button className="btn" onClick={()=>setShowInvite(false)}>✕</button>
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
                            <button className="btn" onClick={() => setMissingRequired([])}>✕</button>
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
                            <button className="btn" onClick={() => setDeleteConfirm(null)}>✕</button>
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
                            <button className="btn" onClick={()=>setOpen(false)}>✕</button>
                        </header>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
                            <div className="helper" style={{ fontWeight: 600 }}>{name}{memberNo ? ` (${memberNo})` : ''}</div>
                            <span className="helper">â€¢</span>
                            <span className="helper">Eintritt: {status?.joinDate || '—'}</span>
                            <span className="helper">•</span>
                            <span className="helper">Status: {status?.state === 'OVERDUE' ? `überfällig (${status?.overdue})` : status?.state === 'OK' ? 'OK' : '—'}</span>
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
                                    {/* Duplicate pagination controls removed (footer) to avoid redundancy */}
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

function useQuickAdd(
    today: string, 
    create: (p: any) => Promise<any>, 
    onOpenFilePicker?: () => void,
    notify?: (type: 'success' | 'error' | 'info', text: string) => void
) {
    const [quickAdd, setQuickAdd] = useState(false)
    const [qa, setQa] = useState<QA>({ date: today, type: 'IN', sphere: 'IDEELL', grossAmount: 100, vatRate: 19, description: '', paymentMethod: 'BAR', mode: 'GROSS' })
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
            : k === 'date' ? <th key={k} align="left" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))} onClick={() => onToggleSort('date')} style={{ cursor: 'pointer' }}>Datum {renderSortIcon('date')}</th>
                : k === 'voucherNo' ? <th key={k} align="left" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>Nr.</th>
                    : k === 'type' ? <th key={k} align="left" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>Art</th>
                        : k === 'sphere' ? <th key={k} align="left" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>Sphäre</th>
                            : k === 'description' ? <th key={k} align="left" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>Beschreibung</th>
                                : k === 'earmark' ? <th key={k} align="center" title="Zweckbindung" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>ðŸŽ¯</th>
                                    : k === 'budget' ? <th key={k} align="center" title="Budget" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>ðŸ’°</th>
                                        : k === 'paymentMethod' ? <th key={k} align="left" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>Zahlweg</th>
                                            : k === 'attachments' ? <th key={k} align="center" title="Anhänge" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>ðŸ“Ž</th>
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
                    <span className="badge" title={`Bis ${lockedUntil} abgeschlossen (Jahresabschluss)`} aria-label="Gesperrt">ðŸ”’</span>
                ) : (
                    <button className="btn" title="Bearbeiten" onClick={() => onEdit({ id: r.id, date: r.date, description: r.description ?? '', paymentMethod: r.paymentMethod ?? null, transferFrom: r.transferFrom ?? null, transferTo: r.transferTo ?? null, type: r.type, sphere: r.sphere, earmarkId: r.earmarkId ?? null, budgetId: r.budgetId ?? null, tags: r.tags || [], netAmount: r.netAmount, grossAmount: r.grossAmount, vatRate: r.vatRate })}>âœŽ</button>
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
                        const title = from && to ? `${from} â†’ ${to}` : 'Transfer'
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
            <td key={k} align="center">{typeof r.fileCount === 'number' && r.fileCount > 0 ? (<span className="badge" title={`${r.fileCount} Anhang/Anhänge`}>ðŸ“Ž {r.fileCount}</span>) : ''}</td>
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
            {loading && <div>Lade â€¦</div>}
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
                                    >ðŸ“Ž {r.fileCount}</button>
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

