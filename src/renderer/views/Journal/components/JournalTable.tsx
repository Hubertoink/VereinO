import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { ICONS, IconBank, IconCash, IconArrow, IconPayPal, TransferDisplay, IconBudget, IconEarmark, IconAttachment } from '../../../utils/icons'
import HoverTooltip from '../../../components/common/HoverTooltip'
import { getTransferTooltipTitle, truncateJournalDescription } from '../utils/journalDisplayHelpers'
import type { BudgetAssignment, EarmarkAssignment, VoucherRow } from '../types'

type BudgetUsage = { inflow: number; spent: number; planned?: number; balance?: number; remaining?: number }
type EarmarkUsage = { allocated: number; released: number; budget: number; balance: number; remaining: number }
type PaymentUsage = { inflow: number; spent: number; balance: number; count?: number }

function TooltipList({
    title,
    rows,
    hint
}: {
    title: string
    rows: Array<{ key: string; value: string; dotColor?: string }>
    hint?: string
}) {
    return (
        <div>
            <div className="tooltip-modal__title">{title}</div>
            {rows.length > 0 && (
                <div className="tooltip-modal__list">
                    {rows.map((row) => (
                        <div key={row.key} className="tooltip-modal__row">
                            <span className="tooltip-modal__key" style={{ '--tooltip-dot': row.dotColor || 'var(--border)' } as React.CSSProperties}>
                                <span className="tooltip-modal__dot" />
                                {row.key}
                            </span>
                            <span className="tooltip-modal__val">{row.value}</span>
                        </div>
                    ))}
                </div>
            )}
            {hint ? <div className="tooltip-modal__hint">{hint}</div> : null}
        </div>
    )
}

function UsageHover({
    kind,
    id,
    title,
    accent,
    eurFmt,
    getUsage,
    rows,
    hint,
    children
}: {
    kind: 'budget' | 'earmark' | 'tag' | 'payment'
    id?: number
    title: string
    accent?: string | null
    eurFmt?: Intl.NumberFormat
    getUsage?: (id: number) => Promise<any>
    rows?: Array<{ key: string; value: string; dotColor?: string }>
    hint?: string
    children: React.ReactNode
}) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string>('')
    const [data, setData] = useState<any>(null)
    const aliveRef = useRef(true)

    useEffect(() => {
        return () => {
            aliveRef.current = false
        }
    }, [])

    const loadUsage = useCallback(async () => {
        if (!getUsage || id == null || data || loading) return
        setLoading(true)
        setError('')
        try {
            const res = await getUsage(id)
            if (!aliveRef.current) return
            setData(res)
        } catch (e: any) {
            if (!aliveRef.current) return
            setError(e?.message || String(e))
        } finally {
            if (!aliveRef.current) return
            setLoading(false)
        }
    }, [data, getUsage, id, loading])

    const tooltipRows = useMemo(() => {
        if (!data || !eurFmt) {
            // For tags with static rows but no loaded data yet, show static rows
            if (rows && rows.length > 0) return rows
            return []
        }
        if (kind === 'budget') {
            const u = data as BudgetUsage
            const inflow = Number(u.inflow || 0) || 0
            const spent = Number(u.spent || 0) || 0
            const stand = (u.remaining != null)
                ? Number(u.remaining || 0)
                : (u.balance != null ? Number(u.balance || 0) : (inflow - spent))
            const result = [
                { key: 'Einnahmen', value: eurFmt.format(inflow), dotColor: 'var(--success)' },
                { key: 'Ausgaben', value: eurFmt.format(spent), dotColor: 'var(--danger)' },
                { key: 'Saldo', value: eurFmt.format(stand), dotColor: accent || 'var(--accent)' }
            ]
            const planned = Number(u.planned || 0)
            if (planned) {
                result.unshift({ key: 'Budgethöhe', value: eurFmt.format(planned), dotColor: 'var(--accent)' })
            }
            return result
        }
        if (kind === 'earmark') {
            const u = data as EarmarkUsage
            const result = [
                { key: 'Einnahmen', value: eurFmt.format(Number(u.allocated || 0) || 0), dotColor: 'var(--success)' },
                { key: 'Ausgaben', value: eurFmt.format(Number(u.released || 0) || 0), dotColor: 'var(--danger)' },
                { key: 'Saldo', value: eurFmt.format(Number(u.remaining || 0) || 0), dotColor: accent || 'var(--accent)' }
            ]
            const budget = Number(u.budget || 0)
            if (budget) {
                result.unshift({ key: 'Budgethöhe', value: eurFmt.format(budget), dotColor: 'var(--accent)' })
            }
            return result
        }
        if (kind === 'payment') {
            const u = data as PaymentUsage
            const result = [
                { key: 'Einnahmen', value: eurFmt.format(Number(u.inflow || 0)), dotColor: 'var(--success)' },
                { key: 'Ausgaben', value: eurFmt.format(Number(u.spent || 0)), dotColor: 'var(--danger)' },
                { key: 'Saldo', value: eurFmt.format(Number(u.balance || 0)), dotColor: accent || 'var(--accent)' }
            ]
            if (u.count != null) result.push({ key: 'Buchungen', value: String(u.count || 0), dotColor: 'var(--text-dim)' })
            return result
        }
        // kind === 'tag'
        const u = data as { inflow: number; spent: number; balance: number; count: number }
        return [
            { key: 'Einnahmen', value: eurFmt.format(Number(u.inflow || 0)), dotColor: 'var(--success)' },
            { key: 'Ausgaben', value: eurFmt.format(Number(u.spent || 0)), dotColor: 'var(--danger)' },
            { key: 'Saldo', value: eurFmt.format(Number(u.balance || 0)), dotColor: accent || 'var(--accent)' },
            { key: 'Buchungen', value: String(u.count || 0), dotColor: 'var(--text-dim)' }
        ]
    }, [rows, data, eurFmt, kind, accent])

    const content = (
        <TooltipList
            title={title}
            rows={tooltipRows}
            hint={loading ? (tooltipRows.length > 0 ? 'Aktualisiere vollständige Werte…' : 'Lädt…') : error ? error : hint}
        />
    )

    return (
        <HoverTooltip<HTMLSpanElement>
            content={content}
            className="tooltip-modal journal-usage-tooltip"
            preferredPlacement="top"
        >
            {({ ref, props }) => (
                <span
                    ref={ref}
                    className="usage-hover"
                    aria-describedby={props['aria-describedby']}
                    onMouseEnter={(e) => {
                        void loadUsage()
                        props.onMouseEnter?.(e)
                    }}
                    onMouseLeave={(e) => {
                        props.onMouseLeave?.(e)
                    }}
                    onFocus={(e) => {
                        void loadUsage()
                        props.onFocus?.(e)
                    }}
                    onBlur={(e) => {
                        props.onBlur?.(e)
                    }}
                >
                    {children}
                </span>
            )}
        </HoverTooltip>
    )
}

function paymentKindLabel(kind?: 'CASH' | 'BANK' | 'PAYPAL' | 'CARD' | 'OTHER' | null, method?: 'BAR' | 'BANK' | null) {
    if (kind === 'CASH' || method === 'BAR') return 'Bar'
    if (kind === 'PAYPAL') return 'PayPal'
    if (kind === 'CARD') return 'Karte'
    if (kind === 'OTHER') return 'Sonstiges'
    return 'Bank'
}

function StornoHover({ linkedId, title, eurFmt, fmtDate, getVoucher, onClick, children }: {
    linkedId: number
    title: string
    eurFmt: Intl.NumberFormat
    fmtDate: (s?: string) => string
    getVoucher: (id: number) => Promise<any>
    onClick: () => void
    children: React.ReactNode
}) {
    const [voucher, setVoucher] = useState<any>(null)
    const [loading, setLoading] = useState(false)
    const loadVoucher = useCallback(async () => {
        if (voucher || loading) return
        setLoading(true)
        try { setVoucher(await getVoucher(linkedId)) } catch { setVoucher(null) } finally { setLoading(false) }
    }, [getVoucher, linkedId, loading, voucher])
    const tooltipRows = voucher ? [
        { key: 'Beleg', value: `#${voucher.voucherNo || voucher.id}` },
        { key: 'Datum', value: fmtDate(voucher.date) },
        { key: 'Beschreibung', value: voucher.description || '—' },
        { key: 'Betrag', value: eurFmt.format(Number(voucher.grossAmount || 0)), dotColor: voucher.type === 'IN' ? 'var(--success)' : 'var(--danger)' }
    ] : []
    return (
        <HoverTooltip<HTMLButtonElement>
            content={<TooltipList title={title} rows={tooltipRows} hint={loading ? 'Lädt…' : voucher ? 'Klick zeigt Original und Storno.' : 'Zum Laden hovern.'} />}
            className="tooltip-modal journal-usage-tooltip"
            preferredPlacement="top"
        >
            {({ ref, props }) => (
                <button ref={ref} type="button" className="badge storno-link-badge"
                    aria-describedby={props['aria-describedby']}
                    onMouseEnter={(e) => { void loadVoucher(); props.onMouseEnter?.(e) }}
                    onMouseLeave={props.onMouseLeave}
                    onFocus={(e) => { void loadVoucher(); props.onFocus?.(e) }}
                    onBlur={props.onBlur}
                    onClick={(e) => { e.stopPropagation(); onClick() }}>
                    {children}
                </button>
            )}
        </HoverTooltip>
    )
}

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

// LocalStorage key for column widths
const COLUMN_WIDTHS_KEY = 'journal-column-widths'

function loadColumnWidths(): Record<string, number> {
    try {
        const stored = localStorage.getItem(COLUMN_WIDTHS_KEY)
        return stored ? JSON.parse(stored) : {}
    } catch { return {} }
}

function saveColumnWidths(widths: Record<string, number>) {
    try {
        localStorage.setItem(COLUMN_WIDTHS_KEY, JSON.stringify(widths))
    } catch { /* ignore */ }
}

function paymentMethodLabel(method?: 'BAR' | 'BANK' | null) {
    if (method === 'BAR') return 'Bar'
    if (method === 'BANK') return 'Bank'
    return '—'
}

function paymentAccountIcon(kind?: 'CASH' | 'BANK' | 'PAYPAL' | 'CARD' | 'OTHER' | null, method?: 'BAR' | 'BANK' | null, size = 12) {
    if (kind === 'PAYPAL') return <IconPayPal size={size} />
    if (kind === 'CASH' || method === 'BAR') return <IconCash size={size} />
    return <IconBank size={size} />
}

interface JournalTableProps {
    rows: VoucherRow[]
    order: string[]
    cols: Record<string, boolean>
    onReorder: (o: string[]) => void
    earmarks: Array<{ id: number; code: string; name: string; color?: string | null }>
    tagDefs: Array<{ id: number; name: string; color?: string | null; usage?: number }>
    eurFmt: Intl.NumberFormat
    fmtDate: (s?: string) => string
    onEdit: (r: {
        id: number
        date: string
        description: string | null
        paymentMethod: 'BAR' | 'BANK' | null
        paymentAccountId?: number | null
        paymentAccountName?: string | null
        paymentAccountKind?: 'CASH' | 'BANK' | 'PAYPAL' | 'CARD' | 'OTHER' | null
        paymentAccountColor?: string | null
        transferFrom?: 'BAR' | 'BANK' | null
        transferTo?: 'BAR' | 'BANK' | null
        transferFromAccountId?: number | null
        transferFromAccountName?: string | null
        transferFromAccountKind?: 'CASH' | 'BANK' | 'PAYPAL' | 'CARD' | 'OTHER' | null
        transferFromAccountColor?: string | null
        transferToAccountId?: number | null
        transferToAccountName?: string | null
        transferToAccountKind?: 'CASH' | 'BANK' | 'PAYPAL' | 'CARD' | 'OTHER' | null
        transferToAccountColor?: string | null
        type?: 'IN' | 'OUT' | 'TRANSFER' | 'INTERNAL'
        sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
        earmarkId?: number | null
        earmarkAmount?: number | null
        budgetId?: number | null
        budgetAmount?: number | null
        originalId?: number | null
        originalVoucherNo?: string | null
        reversedById?: number | null
        reversedByVoucherNo?: string | null
        tags?: string[]
        netAmount?: number
        grossAmount?: number
        vatRate?: number
        amountMode?: 'NET' | 'GROSS'
        budgets?: BudgetAssignment[]
        earmarksAssigned?: EarmarkAssignment[]
    }) => void
    onDelete: (r: { id: number; voucherNo: string; description?: string | null }) => void
    onToggleSort: (col: 'date' | 'net' | 'gross' | 'budget' | 'earmark' | 'payment' | 'sphere') => void
    sortDir: 'ASC' | 'DESC'
    sortBy: 'date' | 'net' | 'gross' | 'budget' | 'earmark' | 'payment' | 'sphere'
    onTagClick?: (name: string) => void
    onEarmarkClick?: (id: number) => void
    onBudgetClick?: (id: number) => void
    onPaymentAccountClick?: (id: number) => void
    onTransferClick?: () => void
    onStornoPairClick?: (originalId: number, reversalId: number) => void
    getVoucherById?: (id: number) => Promise<any>
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
    onPaymentAccountClick,
    onTransferClick,
    onStornoPairClick,
    getVoucherById,
    highlightId,
    lockedUntil,
    onRowDoubleClick
}: JournalTableProps) {
    const dragIdx = useRef<number | null>(null)
    const visibleOrder = order.filter(k => cols[k])

    const budgetUsageCache = useRef(new Map<number, any>())
    const budgetUsageInFlight = useRef(new Map<number, Promise<any>>())
    const earmarkUsageCache = useRef(new Map<number, any>())
    const earmarkUsageInFlight = useRef(new Map<number, Promise<any>>())

    const getBudgetUsage = useCallback(async (budgetId: number) => {
        const cached = budgetUsageCache.current.get(budgetId)
        if (cached) return cached
        const inflight = budgetUsageInFlight.current.get(budgetId)
        if (inflight) return inflight
        const p = (async () => {
            const api = (window as any)?.api
            const res = await api?.budgets?.usage?.({ budgetId })
            budgetUsageCache.current.set(budgetId, res)
            return res
        })()
        budgetUsageInFlight.current.set(budgetId, p)
        try {
            return await p
        } finally {
            budgetUsageInFlight.current.delete(budgetId)
        }
    }, [])

    const getEarmarkUsage = useCallback(async (earmarkId: number) => {
        const cached = earmarkUsageCache.current.get(earmarkId)
        if (cached) return cached
        const inflight = earmarkUsageInFlight.current.get(earmarkId)
        if (inflight) return inflight
        const p = (async () => {
            const api = (window as any)?.api
            const res = await api?.bindings?.usage?.({ earmarkId })
            earmarkUsageCache.current.set(earmarkId, res)
            return res
        })()
        earmarkUsageInFlight.current.set(earmarkId, p)
        try {
            return await p
        } finally {
            earmarkUsageInFlight.current.delete(earmarkId)
        }
    }, [])

    const tagUsageCache = useRef(new Map<number, any>())
    const tagUsageInFlight = useRef(new Map<number, Promise<any>>())
    const paymentUsageCache = useRef(new Map<number, PaymentUsage>())
    const paymentUsageInFlight = useRef(new Map<number, Promise<PaymentUsage>>())

    const getTagUsage = useCallback(async (tagId: number) => {
        const cached = tagUsageCache.current.get(tagId)
        if (cached) return cached
        const inflight = tagUsageInFlight.current.get(tagId)
        if (inflight) return inflight
        const p = (async () => {
            const api = (window as any)?.api
            if (!api?.tags?.usage) throw new Error('Tag-Auswertung ist lokal nicht verfügbar.')
            const timeout = new Promise((_resolve, reject) => {
                window.setTimeout(() => reject(new Error('Tag-Auswertung dauert zu lange.')), 4500)
            })
            const res = await Promise.race([api.tags.usage({ tagId }), timeout])
            if (!res) throw new Error('Tag-Auswertung lieferte keine Daten.')
            tagUsageCache.current.set(tagId, res)
            return res
        })()
        tagUsageInFlight.current.set(tagId, p)
        try {
            return await p
        } finally {
            tagUsageInFlight.current.delete(tagId)
        }
    }, [])

    const getPaymentUsage = useCallback(async (paymentAccountId: number) => {
        const cached = paymentUsageCache.current.get(paymentAccountId)
        if (cached) return cached
        const inflight = paymentUsageInFlight.current.get(paymentAccountId)
        if (inflight) return inflight
        const p = (async () => {
            const api = (window as any)?.api
            if (!api?.reports?.summary) throw new Error('Zahlweg-Auswertung ist lokal nicht verfügbar.')
            const [inSummary, outSummary, allRows] = await Promise.all([
                api.reports.summary({ paymentAccountId, type: 'IN' }),
                api.reports.summary({ paymentAccountId, type: 'OUT' }),
                api.vouchers?.list?.({ paymentAccountId, limit: 1 })
            ])
            const inflow = Number(inSummary?.totals?.gross || 0)
            const spent = Number(outSummary?.totals?.gross || 0)
            const usage = { inflow, spent, balance: inflow - spent, count: Number(allRows?.total || 0) }
            paymentUsageCache.current.set(paymentAccountId, usage)
            return usage
        })()
        paymentUsageInFlight.current.set(paymentAccountId, p)
        try {
            return await p
        } finally {
            paymentUsageInFlight.current.delete(paymentAccountId)
        }
    }, [])

    // Column resize state
    const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => loadColumnWidths())
    const resizingCol = useRef<string | null>(null)
    const resizeStartX = useRef<number>(0)
    const resizeStartWidth = useRef<number>(0)
    const tableRef = useRef<HTMLTableElement>(null)

    // Save column widths when they change
    useEffect(() => {
        if (Object.keys(columnWidths).length > 0) {
            saveColumnWidths(columnWidths)
        }
    }, [columnWidths])

    // Handle resize start
    const handleResizeStart = useCallback((e: React.MouseEvent, colKey: string) => {
        e.preventDefault()
        e.stopPropagation()
        resizingCol.current = colKey
        resizeStartX.current = e.clientX

        // Get current column width
        const th = (e.target as HTMLElement).closest('th')
        resizeStartWidth.current = th?.offsetWidth || 100

        document.addEventListener('mousemove', handleResizeMove)
        document.addEventListener('mouseup', handleResizeEnd)
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
    }, [])

    // Handle resize move
    const handleResizeMove = useCallback((e: MouseEvent) => {
        if (!resizingCol.current || !tableRef.current) return
        const delta = e.clientX - resizeStartX.current
        const newWidth = Math.max(40, resizeStartWidth.current + delta)

        // Get container width to limit total table width
        const container = tableRef.current.parentElement
        if (container) {
            const containerWidth = container.clientWidth
            const currentTableWidth = tableRef.current.offsetWidth
            const currentColWidth = resizeStartWidth.current
            const projectedTableWidth = currentTableWidth - currentColWidth + newWidth

            // If table would exceed container, limit the column width
            if (projectedTableWidth > containerWidth && delta > 0) {
                const maxNewWidth = currentColWidth + (containerWidth - currentTableWidth)
                if (maxNewWidth > 40) {
                    setColumnWidths(prev => ({ ...prev, [resizingCol.current!]: Math.max(40, maxNewWidth) }))
                }
                return
            }
        }

        setColumnWidths(prev => ({ ...prev, [resizingCol.current!]: newWidth }))
    }, [])

    // Handle resize end
    const handleResizeEnd = useCallback(() => {
        resizingCol.current = null
        document.removeEventListener('mousemove', handleResizeMove)
        document.removeEventListener('mouseup', handleResizeEnd)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
    }, [handleResizeMove])

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
                                : k === 'note' ? <th key={k} align="left" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>Kommentar</th>
                                    : k === 'earmark' ? <th key={k} className="sortable" align="center" title="Zweckbindung" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))} onClick={() => onToggleSort('earmark')}><IconEarmark size={16} color="#FFD600" /> {renderSortIcon('earmark')}</th>
                                        : k === 'budget' ? <th key={k} className="sortable" align="center" title="Budget" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))} onClick={() => onToggleSort('budget')}><IconBudget size={16} color="#00C853" /> {renderSortIcon('budget')}</th>
                                            : k === 'paymentMethod' ? <th key={k} className="sortable" align="left" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))} onClick={() => onToggleSort('payment')}>Zahlweg {renderSortIcon('payment')}</th>
                                                : k === 'attachments' ? <th key={k} align="center" title="Anhänge" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}><IconAttachment size={16} /></th>
                                                    : k === 'net' ? <th key={k} align="right" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))} onClick={() => onToggleSort('net')} style={{ cursor: 'pointer' }}>Netto {renderSortIcon('net')}</th>
                                                        : k === 'vat' ? <th key={k} align="right" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>MwSt</th>
                                                            : <th key={k} align="right" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))} onClick={() => onToggleSort('gross')} style={{ cursor: 'pointer' }}>Brutto {renderSortIcon('gross')}</th>
    )
    const tagDefFor = useCallback((name: string) => (tagDefs || []).find(t => (t.name || '').toLowerCase() === (name || '').toLowerCase()), [tagDefs])
    const colorFor = (name: string) => tagDefFor(name)?.color
    const tagUsageFallbackRows = useMemo(() => {
        const totals = new Map<string, { inflow: number; spent: number; count: number }>()
        for (const row of rows || []) {
            for (const tagName of row.tags || []) {
                const key = String(tagName || '').toLowerCase()
                if (!key) continue
                const current = totals.get(key) || { inflow: 0, spent: 0, count: 0 }
                const amount = Number(row.grossAmount || 0) || 0
                if (row.type === 'IN') current.inflow += amount
                else if (row.type === 'OUT') current.spent += amount
                current.count += 1
                totals.set(key, current)
            }
        }
        const formatted = new Map<string, Array<{ key: string; value: string; dotColor?: string }>>()
        totals.forEach((value, key) => {
            const balance = Math.round((value.inflow - value.spent) * 100) / 100
            formatted.set(key, [
                { key: 'Einnahmen', value: eurFmt.format(Math.round(value.inflow * 100) / 100), dotColor: 'var(--success)' },
                { key: 'Ausgaben', value: eurFmt.format(Math.round(value.spent * 100) / 100), dotColor: 'var(--danger)' },
                { key: 'Saldo', value: eurFmt.format(balance), dotColor: colorFor(key) || 'var(--accent)' },
                { key: 'Buchungen', value: String(value.count), dotColor: 'var(--text-dim)' }
            ])
        })
        return formatted
    }, [colorFor, eurFmt, rows])
    const isLocked = (d: string) => {
        if (!lockedUntil) return false
        return String(d) <= String(lockedUntil)
    }

    const stornierungLabel = (value?: string | number | null) => value ? `#${value}` : ''
    const isReversalVoucher = (r: any) => !!r.originalId
    const isReversedOriginal = (r: any) => !!r.reversedById

    // Column width configuration for fixed table layout (default values)
    const defaultColWidths: Record<string, number> = {
        actions: 50,
        date: 90,
        voucherNo: 110,
        type: 70,
        sphere: 70,
        description: 200,
        note: 180,
        earmark: 120,
        budget: 130,
        paymentMethod: 95,
        attachments: 40,
        net: 85,
        vat: 70,
        gross: 95
    }

    // Get column width (user-defined or default)
    const getColWidth = (k: string): string => {
        if (columnWidths[k]) return `${columnWidths[k]}px`
        if (k === 'description') return 'auto' // description flexes
        return `${defaultColWidths[k] || 100}px`
    }

    // Render resize handle
    const ResizeHandle = ({ colKey }: { colKey: string }) => (
        <span
            className="col-resize-handle"
            onMouseDown={(e) => handleResizeStart(e, colKey)}
            onClick={(e) => e.stopPropagation()}
        />
    )

    const tdFor = (k: string, r: any) => (
        k === 'actions' ? (
            <td key={k} align="center" style={{ whiteSpace: 'nowrap' }}>
                {isLocked(r.date) ? (
                    <span className="badge" title={`Bis ${lockedUntil} abgeschlossen (Jahresabschluss)`} aria-label="Gesperrt">🔒</span>
                ) : r.isCashCheck ? (
                    <span className="badge" title="Kassenprüfung-Buchung (systemgeneriert) – nicht bearbeitbar" aria-label="Gesperrt">🔒</span>
                ) : r.isAdvancePlaceholder ? (
                    <span className="badge badge-advance-placeholder-lock" title="Vorschuss-Platzhalter (systemgeneriert) – nicht bearbeitbar" aria-label="Gesperrt">🔒</span>
                ) : isReversalVoucher(r) ? (
                    <button className="btn btn-edit" title="Stornieren" onClick={() => onDelete?.({ id: r.id, voucherNo: r.voucherNo, description: r.description ?? null })}>↺</button>
                ) : isReversedOriginal(r) ? (
                    <button className="btn btn-edit" title="Stornieren" onClick={() => onDelete?.({ id: r.id, voucherNo: r.voucherNo, description: r.description ?? null })}>↺</button>
                ) : (
                    <button className="btn btn-edit" title="Bearbeiten" onClick={() => onEdit({ id: r.id, date: r.date, description: r.description ?? '', paymentMethod: r.paymentMethod ?? null, paymentAccountId: r.paymentAccountId ?? null, paymentAccountName: r.paymentAccountName ?? null, paymentAccountKind: r.paymentAccountKind ?? null, paymentAccountColor: r.paymentAccountColor ?? null, transferFrom: r.transferFrom ?? null, transferTo: r.transferTo ?? null, transferFromAccountId: r.transferFromAccountId ?? null, transferFromAccountName: r.transferFromAccountName ?? null, transferFromAccountKind: r.transferFromAccountKind ?? null, transferFromAccountColor: r.transferFromAccountColor ?? null, transferToAccountId: r.transferToAccountId ?? null, transferToAccountName: r.transferToAccountName ?? null, transferToAccountKind: r.transferToAccountKind ?? null, transferToAccountColor: r.transferToAccountColor ?? null, type: r.type, sphere: r.sphere, earmarkId: r.earmarkId ?? null, earmarkAmount: r.earmarkAmount ?? null, budgetId: r.budgetId ?? null, budgetAmount: r.budgetAmount ?? null, originalId: r.originalId ?? null, originalVoucherNo: r.originalVoucherNo ?? null, reversedById: r.reversedById ?? null, reversedByVoucherNo: r.reversedByVoucherNo ?? null, tags: r.tags || [], netAmount: r.netAmount, grossAmount: r.grossAmount, vatRate: r.vatRate, amountMode: r.amountMode, budgets: r.budgets || [], earmarksAssigned: r.earmarksAssigned || [] })}>✎</button>
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
                <div className="journal-description-cell" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {(() => {
                        const fullText = r.description?.trim() || ''
                        const shortenedText = truncateJournalDescription(fullText, 32)
                        const hasOverflow = fullText.length > 32
                        if (!fullText) {
                            return <span className="journal-description-text" />
                        }
                        if (!hasOverflow) {
                            return <span className="journal-description-text">{shortenedText}</span>
                        }
                        return (
                            <HoverTooltip<HTMLSpanElement>
                                content={<div className="journal-description-tooltip">{fullText}</div>}
                                className="tooltip-modal"
                                preferredPlacement="top"
                                delayMs={1000}
                            >
                                {({ ref, props }) => (
                                    <span ref={ref} className="journal-description-text" {...props}>
                                        {shortenedText}
                                    </span>
                                )}
                            </HoverTooltip>
                        )
                    })()}
                    {isReversalVoucher(r) && getVoucherById ? <StornoHover linkedId={r.originalId} title="Originalbuchung" eurFmt={eurFmt} fmtDate={fmtDate} getVoucher={getVoucherById} onClick={() => onStornoPairClick?.(r.originalId, r.id)}><span className="badge-storno">Storno zu {stornierungLabel(r.originalVoucherNo || r.originalId)}</span></StornoHover> : null}
                    {isReversedOriginal(r) && getVoucherById ? <StornoHover linkedId={r.reversedById} title="Stornobuchung" eurFmt={eurFmt} fmtDate={fmtDate} getVoucher={getVoucherById} onClick={() => onStornoPairClick?.(r.id, r.reversedById)}><span className="badge-storniert">storniert durch {stornierungLabel(r.reversedByVoucherNo || r.reversedById)}</span></StornoHover> : null}
                    {r.isAdvancePlaceholder ? <span className="badge badge-advance-placeholder">Vorschuss</span> : null}
                    {(r.tags || []).map((t: string) => {
                        const tagDef = tagDefFor(t)
                        const bg = colorFor(t) || undefined
                        const fg = contrastText(bg)
                        return (
                            <UsageHover
                                key={t}
                                kind="tag"
                                id={tagDef?.id}
                                title={t}
                                accent={bg}
                                eurFmt={eurFmt}
                                getUsage={getTagUsage}
                                rows={tagUsageFallbackRows.get(String(t || '').toLowerCase())}
                                hint="Klick filtert die Buchungsliste nach diesem Tag."
                            >
                                <button
                                    className="chip"
                                    style={{ background: bg, color: bg ? fg : undefined, cursor: 'pointer' }}
                                    title={`Nach Tag "${t}" filtern`}
                                    onClick={(e) => { e.stopPropagation(); onTagClick?.(t); }}
                                >
                                    {t}
                                </button>
                            </UsageHover>
                        )
                    })}
                </div>
            </td>
        ) : k === 'note' ? (
            <td key={k} className="journal-note-cell">
                {r.note ? (
                    <span className="journal-note-text" title={r.note}>
                        {truncateJournalDescription(r.note.trim(), 56)}
                    </span>
                ) : ''}
            </td>
        ) : k === 'earmark' ? (
            <td key={k} align="center">
                {(() => {
                    // Use earmarksAssigned array if available, otherwise fall back to single earmark
                    const assignments = r.earmarksAssigned && r.earmarksAssigned.length > 0
                        ? r.earmarksAssigned
                        : r.earmarkId && r.earmarkCode
                            ? [{ earmarkId: r.earmarkId, code: r.earmarkCode, amount: 0 }]
                            : []

                    if (assignments.length === 0) return ''

                    // Function to truncate text for table display
                    const truncate = (text: string, maxLen: number = 8) =>
                        text.length > maxLen ? text.slice(0, maxLen) + '…' : text

                    return (
                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
                            {assignments.slice(0, 3).map((ea: any, idx: number) => {
                                const code = ea.code || earmarks.find(e => e.id === ea.earmarkId)?.code || `#${ea.earmarkId}`
                                const em = earmarks.find(e => e.id === ea.earmarkId || e.code === code)
                                const bg = ea.color || em?.color
                                const fg = contrastText(bg)
                                const fullLabel = code
                                const displayLabel = truncate(code)
                                return (
                                    <UsageHover
                                        key={idx}
                                        kind="earmark"
                                        id={ea.earmarkId}
                                        title={`${fullLabel}${ea.amount ? ` (${eurFmt.format(ea.amount)})` : ''}`}
                                        accent={bg}
                                        eurFmt={eurFmt}
                                        getUsage={getEarmarkUsage}
                                    >
                                        <button
                                            className="badge-earmark"
                                            style={{
                                                background: bg || undefined,
                                                color: bg ? fg : undefined,
                                                cursor: 'pointer',
                                                border: bg ? `1px solid ${bg}` : undefined,
                                                fontSize: 10,
                                                padding: '2px 4px',
                                                maxWidth: 70,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap'
                                            }}
                                            onClick={(e) => { e.stopPropagation(); if (ea.earmarkId) onEarmarkClick?.(ea.earmarkId); }}
                                            aria-label={fullLabel}
                                        >
                                            {displayLabel}
                                        </button>
                                    </UsageHover>
                                )
                            })}
                            {assignments.length > 3 && (
                                <span className="badge" style={{ fontSize: 10, padding: '2px 4px' }} title={`+${assignments.length - 3} weitere`}>
                                    +{assignments.length - 3}
                                </span>
                            )}
                        </div>
                    )
                })()}
            </td>
        ) : k === 'paymentMethod' ? (
            <td key={k}>
                {r.type === 'TRANSFER' ? (
                    (() => {
                        const from = r.transferFrom
                        const to = r.transferTo
                        const fromLabel = r.transferFromAccountName || paymentMethodLabel(from)
                        const toLabel = r.transferToAccountName || paymentMethodLabel(to)
                        const title = getTransferTooltipTitle(fromLabel, toLabel)
                        const rows = [
                            { key: 'Von', value: fromLabel, dotColor: r.transferFromAccountColor || 'var(--border)' },
                            { key: 'Nach', value: toLabel, dotColor: r.transferToAccountColor || 'var(--border)' },
                            { key: 'Betrag', value: eurFmt.format(Math.abs(Number(r.grossAmount || 0))), dotColor: 'var(--accent)' }
                        ]
                        return (
                            <UsageHover kind="payment" title={title} rows={rows} eurFmt={eurFmt}>
                                <button type="button" className={`badge pm-account-badge pm-transfer pm-transfer-${(from || '').toLowerCase()}-${(to || '').toLowerCase()}`} aria-label={title} style={{ borderColor: r.transferFromAccountColor || r.transferToAccountColor || undefined }} onClick={(e) => { e.stopPropagation(); onTransferClick?.() }}>
                                    <span className="pm-icon">
                                        {paymentAccountIcon(r.transferFromAccountKind, from)}
                                    </span>
                                    <span className="transfer-arrow">→</span>
                                    <span className="pm-icon">
                                        {paymentAccountIcon(r.transferToAccountKind, to)}
                                    </span>
                                    <span className="pm-account-badge__label">{fromLabel} → {toLabel}</span>
                                </button>
                            </UsageHover>
                        )
                    })()
                ) : (
                    r.paymentMethod ? (
                        (() => {
                            const label = r.paymentAccountName || paymentMethodLabel(r.paymentMethod)
                            const rows = [
                                { key: 'Konto', value: label, dotColor: r.paymentAccountColor || 'var(--border)' },
                                { key: 'Typ', value: paymentKindLabel(r.paymentAccountKind, r.paymentMethod), dotColor: r.paymentAccountColor || 'var(--accent)' },
                                { key: 'Betrag', value: eurFmt.format(Math.abs(Number(r.grossAmount || 0))), dotColor: r.type === 'IN' ? 'var(--success)' : 'var(--danger)' }
                            ]
                            const accountId = Number(r.paymentAccountId || 0)
                            return (
                                <UsageHover kind="payment" title="Zahlungskonto" rows={rows} eurFmt={eurFmt} getUsage={accountId ? getPaymentUsage : undefined} id={accountId || undefined}>
                                    <button type="button" className={`badge pm-account-badge pm-${(r.paymentMethod || '').toLowerCase()}`} aria-label={`Zahlweg: ${label}`} style={{ borderColor: r.paymentAccountColor || undefined }} onClick={(e) => { e.stopPropagation(); if (accountId) onPaymentAccountClick?.(accountId) }}>
                                        {paymentAccountIcon(r.paymentAccountKind, r.paymentMethod)}
                                        <span className="pm-account-badge__label">{label}</span>
                                    </button>
                                </UsageHover>
                            )
                        })()
                    ) : ''
                )}
            </td>
        ) : k === 'budget' ? (
            <td key={k} align="center">
                {(() => {
                    // Use budgets array if available, otherwise fall back to single budget
                    const assignments = r.budgets && r.budgets.length > 0
                        ? r.budgets
                        : r.budgetId && r.budgetLabel
                            ? [{ budgetId: r.budgetId, label: r.budgetLabel, amount: 0, color: (r as any).budgetColor }]
                            : []

                    if (assignments.length === 0) return ''

                    // Function to truncate text for table display
                    const truncate = (text: string, maxLen: number = 8) =>
                        text.length > maxLen ? text.slice(0, maxLen) + '…' : text

                    return (
                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
                            {assignments.slice(0, 3).map((ba: any, idx: number) => {
                                const label = ba.label || `Budget #${ba.budgetId}`
                                const bg = ba.color || undefined
                                const fg = contrastText(bg)
                                const displayLabel = truncate(label)
                                return (
                                    <UsageHover
                                        key={idx}
                                        kind="budget"
                                        id={ba.budgetId}
                                        title={`${label}${ba.amount ? ` (${eurFmt.format(ba.amount)})` : ''}`}
                                        accent={bg || null}
                                        eurFmt={eurFmt}
                                        getUsage={getBudgetUsage}
                                    >
                                        <button
                                            className="badge-budget"
                                            style={{
                                                background: bg,
                                                color: bg ? fg : undefined,
                                                cursor: 'pointer',
                                                border: bg ? `1px solid ${bg}` : undefined,
                                                fontSize: 10,
                                                padding: '2px 4px',
                                                maxWidth: 70,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap'
                                            }}
                                            onClick={(e) => { e.stopPropagation(); if (ba.budgetId) onBudgetClick?.(ba.budgetId); }}
                                            aria-label={label}
                                        >
                                            {displayLabel}
                                        </button>
                                    </UsageHover>
                                )
                            })}
                            {assignments.length > 3 && (
                                <span className="badge" style={{ fontSize: 10, padding: '2px 4px' }} title={`+${assignments.length - 3} weitere`}>
                                    +{assignments.length - 3}
                                </span>
                            )}
                        </div>
                    )
                })()}
            </td>
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
        <div className="journal-table-scroll-wrapper">
        <table className="journal-table resizable-table" cellPadding={6} ref={tableRef}>
            <colgroup>
                {visibleOrder.map((k) => (
                    <col key={k} style={{ width: getColWidth(k) }} />
                ))}
            </colgroup>
            <thead>
                <tr>
                    {visibleOrder.map((k, idx) => {
                        const isLast = idx === visibleOrder.length - 1
                        const th = thFor(k)
                        // Clone the th and add resize handle
                        return React.cloneElement(th, {
                            key: k,
                            className: `${th.props.className || ''} resizable-th`.trim(),
                            children: (
                                <>
                                    {th.props.children}
                                    {!isLast && <ResizeHandle colKey={k} />}
                                </>
                            )
                        })
                    })}
                </tr>
            </thead>
            <tbody>
                {rows.map((r) => (
                    <tr
                        key={r.id}
                        className={[
                            highlightId === r.id ? 'row-flash' : '',
                            r.isAdvancePlaceholder ? 'journal-row-advance-placeholder' : '',
                            isReversalVoucher(r) ? 'journal-row-storno' : '',
                            isReversedOriginal(r) ? 'journal-row-storniert' : ''
                        ].filter(Boolean).join(' ') || undefined}
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
        <div className="journal-table-end" aria-hidden="true">
            <span>Ende der Seite</span>
        </div>
        </div>
    )
}
