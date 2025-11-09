import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import FilterTotals from './components/FilterTotals'
import JournalTable from './components/JournalTable'
import BatchEarmarkModal from '../../components/modals/BatchEarmarkModal'
import TagsEditor from '../../components/TagsEditor'

// Type für Voucher-Zeilen
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

interface JournalViewProps {
    // Props die von App.tsx kommen
    flashId: number | null
    setFlashId: (id: number | null | ((prev: number | null) => number | null)) => void
    periodLock: { closedUntil: string } | null
    refreshKey: number
    notify: (type: 'info' | 'success' | 'error', text: string, duration?: number, action?: { label: string; onClick: () => void }) => void
    bumpDataVersion: () => void
    fmtDate: (d: string) => string
    setActivePage: (page: 'Dashboard' | 'Buchungen' | 'Zweckbindungen' | 'Budgets' | 'Reports' | 'Belege' | 'Rechnungen' | 'Mitglieder' | 'Einstellungen') => void
    setShowTimeFilter: (show: boolean) => void
    setShowMetaFilter: (show: boolean) => void
    // Shared global state
    earmarks: Array<{ id: number; code: string; name: string; color?: string | null }>
    tagDefs: Array<{ id: number; name: string; color?: string | null }>
    budgetsForEdit: Array<{ id: number; label: string }>
    budgetNames: Map<number, string>
    // Helpers
    eurFmt: Intl.NumberFormat
    friendlyError: (e: any) => string
    bufferToBase64Safe: (buf: ArrayBuffer) => string
    // Settings from App
    journalLimit: number
    setJournalLimit: (n: number) => void
    dateFmt: 'ISO' | 'PRETTY'
}

export default function JournalView({
    flashId,
    setFlashId,
    periodLock,
    refreshKey,
    notify,
    bumpDataVersion,
    fmtDate,
    setActivePage,
    setShowTimeFilter,
    setShowMetaFilter,
    earmarks,
    tagDefs,
    budgetsForEdit,
    budgetNames,
    eurFmt,
    friendlyError,
    bufferToBase64Safe,
    journalLimit: journalLimitProp,
    setJournalLimit: setJournalLimitProp,
    dateFmt
}: JournalViewProps) {
    // ==================== STATE ====================
    // Pagination & Sorting
    const [rows, setRows] = useState<VoucherRow[]>([])
    const [totalRows, setTotalRows] = useState<number>(0)
    const [page, setPage] = useState<number>(() => { 
        try { return Number(localStorage.getItem('journal.page') || '1') } 
        catch { return 1 } 
    })
    const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>(() => { 
        try { return (localStorage.getItem('journal.sort') as any) || 'DESC' } 
        catch { return 'DESC' } 
    })
    const [sortBy, setSortBy] = useState<'date' | 'gross' | 'net'>(() => { 
        try { return (localStorage.getItem('journal.sortBy') as any) || 'date' } 
        catch { return 'date' } 
    })
    
    // Nutze journalLimit aus Props (von Settings)
    const journalLimit = journalLimitProp

    // Filter states
    const [from, setFrom] = useState<string>('')
    const [to, setTo] = useState<string>('')
    const [filterSphere, setFilterSphere] = useState<'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB' | null>(null)
    const [filterType, setFilterType] = useState<'IN' | 'OUT' | 'TRANSFER' | null>(null)
    const [filterPM, setFilterPM] = useState<'BAR' | 'BANK' | null>(null)
    const [filterEarmark, setFilterEarmark] = useState<number | null>(null)
    const [filterBudgetId, setFilterBudgetId] = useState<number | null>(null)
    const [filterTag, setFilterTag] = useState<string | null>(null)
    const [q, setQ] = useState<string>('')

    // Column preferences
    type ColKey = 'actions' | 'date' | 'voucherNo' | 'type' | 'sphere' | 'description' | 'earmark' | 'budget' | 'paymentMethod' | 'attachments' | 'net' | 'vat' | 'gross'
    const defaultCols: Record<ColKey, boolean> = { 
        actions: true, date: true, voucherNo: true, type: true, sphere: true, 
        description: true, earmark: true, budget: true, paymentMethod: true, 
        attachments: true, net: true, vat: true, gross: true 
    }
    const defaultOrder: ColKey[] = ['actions', 'date', 'voucherNo', 'type', 'sphere', 'description', 'earmark', 'budget', 'paymentMethod', 'attachments', 'net', 'vat', 'gross']
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

    // Modal states
    const [showBatchEarmark, setShowBatchEarmark] = useState<boolean>(false)
    const [editRow, setEditRow] = useState<(VoucherRow & { mode?: 'NET' | 'GROSS'; transferFrom?: 'BAR' | 'BANK' | null; transferTo?: 'BAR' | 'BANK' | null }) | null>(null)
    const [deleteRow, setDeleteRow] = useState<null | { id: number; voucherNo?: string | null; description?: string | null; fromEdit?: boolean }>(null)
    const editFileInputRef = useRef<HTMLInputElement | null>(null)
    const [editRowFilesLoading, setEditRowFilesLoading] = useState<boolean>(false)
    const [editRowFiles, setEditRowFiles] = useState<Array<{ id: number; fileName: string }>>([])
    const [confirmDeleteAttachment, setConfirmDeleteAttachment] = useState<null | { id: number; fileName: string }>(null)

    // ==================== FILTER CHIPS ====================
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

    // ==================== DATA LOADING ====================
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
    // Include refreshKey so external data changes (QuickAdd, imports, etc.) trigger a reload
    }, [journalLimit, page, sortDir, sortBy, filterPM, filterSphere, filterType, from, to, filterEarmark, filterBudgetId, q, filterTag, notify, refreshKey])

    // Load on mount and filter changes
    useEffect(() => {
        loadRecent()
    }, [loadRecent])

    // Hydrate column prefs from server
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

    // Persist column prefs
    useEffect(() => {
        try { localStorage.setItem('journalCols', JSON.stringify(cols)) } catch { }
        try { window.api?.settings?.set?.({ key: 'journal.cols', value: JSON.stringify(cols) }) } catch { }
    }, [cols])
    useEffect(() => {
        try { localStorage.setItem('journalColsOrder', JSON.stringify(order)) } catch { }
        try { window.api?.settings?.set?.({ key: 'journal.order', value: JSON.stringify(order) }) } catch { }
    }, [order])

    // Load attachments when opening edit modal
    useEffect(() => {
        if (editRow?.id) {
            setEditRowFilesLoading(true)
            ;(async () => {
                try {
                    const res = await window.api?.attachments.list?.({ voucherId: editRow.id })
                    const list = (res as any)?.files || (res as any)?.rows || []
                    setEditRowFiles(list)
                } catch { setEditRowFiles([]) } finally { setEditRowFilesLoading(false) }
            })()
        } else {
            setEditRowFiles([])
        }
    }, [editRow?.id])

    // ==================== RENDER ====================
    return (
        <>
            {/* Filter Toolbar */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
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
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M3 4h18v2L14 13v6l-4 2v-8L3 6V4z" />
                    </svg>
                </button>

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
            </div>

            {/* Active Filter Chips */}
            {chips.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 8px', alignItems: 'center' }}>
                    {chips.map((c) => (
                        <span key={c.key} className="chip">
                            {c.label}
                            <button className="chip-x" onClick={c.clear} aria-label={`Filter ${c.key} löschen`}>×</button>
                        </span>
                    ))}
                    {(filterType || filterPM || filterTag || filterSphere || filterEarmark || filterBudgetId || from || to || q.trim()) && (
                        <button
                            className="btn ghost"
                            title="Alle Filter zurücksetzen"
                            onClick={() => { 
                                setFilterType(null);
                                setFilterPM(null);
                                setFilterTag(null);
                                setFilterSphere(null);
                                setFilterEarmark(null);
                                setFilterBudgetId(null);
                                setFrom('');
                                setTo('');
                                setQ('');
                                setPage(1);
                            }}
                            style={{ padding: '4px 8px', color: 'var(--accent)' }}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    )}
                </div>
            )}

            {/* Filter Totals */}
            <FilterTotals 
                refreshKey={refreshKey} 
                from={from || undefined} 
                to={to || undefined} 
                paymentMethod={filterPM || undefined} 
                sphere={filterSphere || undefined} 
                type={filterType || undefined} 
                earmarkId={filterEarmark || undefined} 
                budgetId={filterBudgetId ?? undefined} 
                q={q || undefined} 
                tag={filterTag || undefined} 
            />

            {/* Main Table Card */}
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
                        <div className="modal booking-modal" onClick={(e) => e.stopPropagation()} style={{ display: 'grid', gap: 10 }}>
                            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <h2 style={{ margin: 0 }}>
                                    {(() => {
                                        const desc = (editRow.description || '').trim()
                                        const label = desc ? `Buchung (${desc.length > 60 ? desc.slice(0,60) + '…' : desc}) bearbeiten` : `Buchung bearbeiten`
                                        return label
                                    })()}
                                </h2>
                                <button className="btn ghost" onClick={() => setEditRow(null)} title="Schließen (ESC)">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                                    </svg>
                                </button>
                            </header>

                            <form onSubmit={async (e) => {
                                e.preventDefault()
                                try {
                                    // Validate transfer direction
                                    if (editRow.type === 'TRANSFER' && (!editRow.transferFrom || !editRow.transferTo)) {
                                        notify('error', 'Bitte wähle eine Richtung für den Transfer aus.')
                                        return
                                    }
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
                                    <div className="card" style={{ padding: 12 }}>
                                        <div className="helper" style={{ marginBottom: 6 }}>Basis</div>
                                        <div className="row">
                                            <div className="field">
                                                <label>Datum <span className="req-asterisk" aria-hidden="true">*</span></label>
                                                <input className="input" type="date" value={editRow.date} onChange={(e) => setEditRow({ ...editRow, date: e.target.value })} />
                                            </div>
                                            <div className="field">
                                                <label>Art</label>
                                                <div className="btn-group" role="group" aria-label="Art wählen">
                                                    {(['IN','OUT','TRANSFER'] as const).map(t => (
                                                        <button key={t} type="button" className={`btn ${editRow.type === t ? 'btn-toggle-active' : ''} ${t==='IN' ? 'btn-type-in' : t==='OUT' ? 'btn-type-out' : ''}`} onClick={() => {
                                                            const newRow = { ...editRow, type: t }
                                                            if (t === 'TRANSFER' && (!newRow.transferFrom || !newRow.transferTo)) {
                                                                newRow.transferFrom = 'BAR'
                                                                newRow.transferTo = 'BANK'
                                                            }
                                                            setEditRow(newRow)
                                                        }}>{t}</button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="field">
                                                <label>Sphäre</label>
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
                                                    <label>Richtung <span className="req-asterisk" aria-hidden="true">*</span></label>
                                                    <select value={`${editRow.transferFrom ?? ''}->${editRow.transferTo ?? ''}`}
                                                        onChange={(e) => {
                                                            const v = e.target.value
                                                            if (v === 'BAR->BANK') setEditRow({ ...editRow, transferFrom: 'BAR', transferTo: 'BANK', paymentMethod: null })
                                                            else if (v === 'BANK->BAR') setEditRow({ ...editRow, transferFrom: 'BANK', transferTo: 'BAR', paymentMethod: null })
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
                                                            <button key={pm} type="button" className={`btn ${(editRow as any).paymentMethod === pm ? 'btn-toggle-active' : ''}`} onClick={() => setEditRow({ ...editRow, paymentMethod: pm })}>{pm === 'BAR' ? 'Bar' : 'Bank'}</button>
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
                                            {editRow.type === 'TRANSFER' ? (
                                                <div className="field" style={{ gridColumn: '1 / -1' }}>
                                                    <label>Betrag (Transfer) <span className="req-asterisk" aria-hidden="true">*</span></label>
                                                    <span className="adorn-wrap">
                                                        <input className="input input-transfer" type="number" step="0.01" value={(editRow as any).grossAmount ?? ''}
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
                                                    <div className="field">
                                                        <label>{(editRow as any).mode === 'GROSS' ? 'Brutto' : 'Netto'} <span className="req-asterisk" aria-hidden="true">*</span></label>
                                                        <div style={{ display: 'flex', gap: 8 }}>
                                                            <select className="input" value={(editRow as any).mode ?? 'NET'} onChange={(e) => setEditRow({ ...(editRow as any), mode: e.target.value as any } as any)}>
                                                                <option value="NET">Netto</option>
                                                                <option value="GROSS">Brutto</option>
                                                            </select>
                                                            <span className="adorn-wrap" style={{ flex: 1 }}>
                                                                <input className="input" type="number" step="0.01" value={(editRow as any).mode === 'GROSS' ? (editRow as any).grossAmount ?? '' : (editRow as any).netAmount ?? ''}
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
                                    </div>
                                </div>

                                {/* Block C+D – Beschreibung & Tags + Anhänge */}
                                <div className="block-grid" style={{ marginBottom: 8 }}>
                                    {/* Block C – Beschreibung & Tags */}
                                    <div className="card" style={{ padding: 12 }}>
                                        <div className="helper" style={{ marginBottom: 6 }}>Beschreibung & Tags</div>
                                        <div className="row">
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
                                    </div>

                                    {/* Block D – Anhänge */}
                                    <div
                                        className="card"
                                        style={{ padding: 12 }}
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
                                                <div className="helper">Dateien hierher ziehen oder per Button/Ctrl+U auswählen</div>
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
                                    </div>
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
        </>
    )
}
