import React, { useRef } from 'react'
import { ICONS, IconBank, IconCash, IconArrow, TransferDisplay } from '../../../utils/icons'

// Helper function for contrast text color
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

interface JournalTableProps {
    rows: Array<{
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
        fileCount?: number
        earmarkId?: number | null
        earmarkCode?: string | null
        budgetId?: number | null
        budgetLabel?: string | null
        tags?: string[]
    }>
    order: string[]
    cols: Record<string, boolean>
    onReorder: (o: string[]) => void
    earmarks: Array<{ id: number; code: string; name: string; color?: string | null }>
    tagDefs: Array<{ id: number; name: string; color?: string | null }>
    eurFmt: Intl.NumberFormat
    fmtDate: (s?: string) => string
    onEdit: (r: {
        id: number
        date: string
        description: string | null
        paymentMethod: 'BAR' | 'BANK' | null
        transferFrom?: 'BAR' | 'BANK' | null
        transferTo?: 'BAR' | 'BANK' | null
        type?: 'IN' | 'OUT' | 'TRANSFER'
        sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
        earmarkId?: number | null
        budgetId?: number | null
        tags?: string[]
        netAmount?: number
        grossAmount?: number
        vatRate?: number
    }) => void
    onDelete: (r: { id: number; voucherNo: string; description?: string | null }) => void
    onToggleSort: (col: 'date' | 'net' | 'gross' | 'budget' | 'earmark' | 'payment' | 'sphere') => void
    sortDir: 'ASC' | 'DESC'
    sortBy: 'date' | 'net' | 'gross' | 'budget' | 'earmark' | 'payment' | 'sphere'
    onTagClick?: (name: string) => void
    onEarmarkClick?: (id: number) => void
    onBudgetClick?: (id: number) => void
    highlightId?: number | null
    lockedUntil?: string | null
    onRowDoubleClick?: (row: any) => void
}

export default function JournalTable({
    rows,
    order,
    cols,
    onReorder,
    earmarks,
    tagDefs,
    eurFmt,
    fmtDate,
    onEdit,
    onDelete,
    onToggleSort,
    sortDir,
    sortBy,
    onTagClick,
    onEarmarkClick,
    onBudgetClick,
    highlightId,
    lockedUntil,
    onRowDoubleClick
}: JournalTableProps) {
    const dragIdx = useRef<number | null>(null)
    const visibleOrder = order.filter(k => cols[k])

    function onHeaderDragStart(e: React.DragEvent<HTMLTableCellElement>, idx: number) {
        dragIdx.current = idx
        e.dataTransfer.effectAllowed = 'move'
    }
    function onHeaderDragOver(e: React.DragEvent<HTMLTableCellElement>) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
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
    const renderSortIcon = (col: 'date' | 'net' | 'gross' | 'budget' | 'earmark' | 'payment' | 'sphere') => {
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
                        : k === 'sphere' ? <th key={k} className="sortable" align="left" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))} onClick={() => onToggleSort('sphere')}>Sphäre {renderSortIcon('sphere')}</th>
                            : k === 'description' ? <th key={k} align="left" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>Beschreibung</th>
                                : k === 'earmark' ? <th key={k} className="sortable" align="center" title="Zweckbindung" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))} onClick={() => onToggleSort('earmark')}>🎯 {renderSortIcon('earmark')}</th>
                                    : k === 'budget' ? <th key={k} className="sortable" align="center" title="Budget" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))} onClick={() => onToggleSort('budget')}>💰 {renderSortIcon('budget')}</th>
                                        : k === 'paymentMethod' ? <th key={k} className="sortable" align="left" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))} onClick={() => onToggleSort('payment')}>Zahlweg {renderSortIcon('payment')}</th>
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

    // Column width configuration for fixed table layout
    const colWidths: Record<string, string> = {
        actions: '50px',
        date: '90px',
        voucherNo: '110px',
        type: '70px',
        sphere: '70px',
        description: 'auto', // flex to fill remaining space
        earmark: '120px',
        budget: '130px',
        paymentMethod: '95px',
        attachments: '40px',
        net: '85px',
        vat: '70px',
        gross: '95px'
    }

    const tdFor = (k: string, r: any) => (
        k === 'actions' ? (
            <td key={k} align="center" style={{ whiteSpace: 'nowrap' }}>
                {isLocked(r.date) ? (
                    <span className="badge" title={`Bis ${lockedUntil} abgeschlossen (Jahresabschluss)`} aria-label="Gesperrt">🔒</span>
                ) : (
                    <button className="btn btn-edit" title="Bearbeiten" onClick={() => onEdit({ id: r.id, date: r.date, description: r.description ?? '', paymentMethod: r.paymentMethod ?? null, transferFrom: r.transferFrom ?? null, transferTo: r.transferTo ?? null, type: r.type, sphere: r.sphere, earmarkId: r.earmarkId ?? null, budgetId: r.budgetId ?? null, tags: r.tags || [], netAmount: r.netAmount, grossAmount: r.grossAmount, vatRate: r.vatRate })}>✎</button>
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
                                onClick={(e) => { e.stopPropagation(); onTagClick?.(t); }}
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
                        className="badge-earmark"
                        title={`Nach Zweckbindung ${r.earmarkCode} filtern`}
                        style={{ background: bg || undefined, color: bg ? fg : undefined, cursor: 'pointer', border: bg ? `1px solid ${bg}` : undefined }}
                        onClick={(e) => { e.stopPropagation(); if (id != null) onEarmarkClick?.(id); }}
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
                            <span className="badge pm-transfer" title={title} aria-label={title}>
                                <span className={`pm-icon ${from === 'BAR' ? 'pm-bar-icon' : 'pm-bank-icon'}`}>
                                    {from === 'BAR' ? <IconCash /> : <IconBank />}
                                </span>
                                <IconArrow />
                                <span className={`pm-icon ${to === 'BAR' ? 'pm-bar-icon' : 'pm-bank-icon'}`}>
                                    {to === 'BAR' ? <IconCash /> : <IconBank />}
                                </span>
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
                    const bg = (r as any).budgetColor || undefined
                    const fg = contrastText(bg)
                    const id = r.budgetId as number | null | undefined
                    return (
                        <button
                            className="badge-budget"
                            title={`Nach Budget ${r.budgetLabel} filtern`}
                            style={{ background: bg, color: bg ? fg : undefined, cursor: 'pointer', border: bg ? `1px solid ${bg}` : undefined }}
                            onClick={(e) => { e.stopPropagation(); if (id != null) onBudgetClick?.(id); }}
                        >
                            {r.budgetLabel}
                        </button>
                    )
                })()
            ) : ''}</td>
        ) : k === 'attachments' ? (
            <td key={k} align="center">{(r.fileCount && r.fileCount > 0) ? <span className="badge" title={`${r.fileCount} Anhang${r.fileCount > 1 ? 'e' : ''}`}>📎</span> : ''}</td>
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
            <colgroup>
                {visibleOrder.map((k) => (
                    <col key={k} style={{ width: colWidths[k] || 'auto' }} />
                ))}
            </colgroup>
            <thead>
                <tr>
                    {visibleOrder.map((k) => thFor(k))}
                </tr>
            </thead>
            <tbody>
                {rows.map((r) => (
                    <tr 
                        key={r.id} 
                        className={highlightId === r.id ? 'row-flash' : undefined}
                        onDoubleClick={() => onRowDoubleClick?.(r)}
                    >
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