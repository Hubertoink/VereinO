import React, { useState, useEffect, useMemo } from 'react'
import HoverTooltip from '../../../components/common/HoverTooltip'
import { buildFilterTotalsPayload } from '../utils/filterTotalsPayload'

interface FilterTotalsProps {
    refreshKey?: number
    from?: string
    to?: string
    paymentMethod?: 'BAR' | 'BANK'
    paymentAccountId?: number | null
    sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
    type?: 'IN' | 'OUT' | 'TRANSFER' | 'INTERNAL'
    earmarkId?: number
    budgetId?: number | null
    q?: string
    tag?: string
    onOpenVoucher?: (voucher: any) => void
}

interface SummaryData {
    inGross: number
    outGross: number
    diff: number
    planned?: number
    remaining?: number
    bySphere?: Array<{ key: string; gross: number }>
    byPaymentMethod?: Array<{ key: string | null; gross: number }>
    count?: number
    transferGross?: number
    inBySphere?: Array<{ key: string; gross: number }>
    inByPaymentMethod?: Array<{ key: string | null; gross: number }>
    outByPaymentMethod?: Array<{ key: string | null; gross: number }>
    /** Net cash position per payment method (includes transfers) from cashBalance API */
    cashBalanceBAR?: number
    cashBalanceBANK?: number
    inCount?: number
    outCount?: number
}

const SPHERE_LABELS: Record<string, string> = {
    IDEELL: 'Ideeller Bereich',
    ZWECK: 'Zweckbetrieb',
    VERMOEGEN: 'Vermögensverwaltung',
    WGB: 'Wirtschaftlicher Geschäftsbetrieb'
}

const SPHERE_COLORS: Record<string, string> = {
    IDEELL: '#7C4DFF',
    ZWECK: '#00BCD4',
    VERMOEGEN: '#FF9800',
    WGB: '#E91E63'
}

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
                    {rows.map((r) => (
                        <div key={r.key} className="tooltip-modal__row">
                            <span className="tooltip-modal__key" style={{ '--tooltip-dot': r.dotColor || 'var(--border)' } as React.CSSProperties}>
                                <span className="tooltip-modal__dot" />
                                {r.key}
                            </span>
                            <span className="tooltip-modal__val">{r.value}</span>
                        </div>
                    ))}
                </div>
            )}
            {hint && <div className="tooltip-modal__hint">{hint}</div>}
        </div>
    )
}

export default function FilterTotals({ refreshKey, from, to, paymentMethod, paymentAccountId, sphere, type, earmarkId, budgetId, q, tag, onOpenVoucher }: FilterTotalsProps) {
    const [loading, setLoading] = useState(false)
    const [values, setValues] = useState<SummaryData | null>(null)
    const [recentKind, setRecentKind] = useState<'IN' | 'OUT' | null>(null)
    const [recentRows, setRecentRows] = useState<any[]>([])
    const [recentLoading, setRecentLoading] = useState(false)
    const recentPopoverRef = React.useRef<HTMLDivElement | null>(null)
    const incomeStatRef = React.useRef<HTMLButtonElement | null>(null)
    const expenseStatRef = React.useRef<HTMLButtonElement | null>(null)
    
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
                    const planned = Math.max(0, Number(u?.planned || 0))
                    const remaining = Math.round(Number(u?.remaining ?? planned + diff) * 100) / 100
                    if (alive) setValues({ inGross: inflow, outGross: spent, diff, planned, remaining })
                } else if (typeof earmarkId === 'number') {
                    const u = await window.api?.bindings?.usage?.({ earmarkId, from, to, sphere })
                    const inflow = Math.max(0, Number(u?.allocated || 0))
                    const spent = Math.max(0, Number(u?.released || 0))
                    const diff = Math.round((inflow - spent) * 100) / 100
                    const planned = Math.max(0, Number(u?.budget || 0))
                    const remaining = Math.round(Number(u?.remaining ?? planned + diff) * 100) / 100
                    if (alive) setValues({ inGross: inflow, outGross: spent, diff, planned, remaining })
                } else {
                    const basePayload = buildFilterTotalsPayload({ from, to, paymentMethod, paymentAccountId, sphere, type, earmarkId, q, tag })
                    const res = await window.api?.reports.summary?.(basePayload)

                    // When no specific type is filtered, we fetch type-specific breakdowns so the
                    // “Einnahmen/Ausgaben” tooltips add up correctly.
                    let inRes: any | null = null
                    let outRes: any | null = null
                    let cbRes: { BAR: number; BANK: number } | null = null
                    if (!type) {
                        const [ir, or, cb] = await Promise.all([
                            window.api?.reports.summary?.({ ...basePayload, type: 'IN' }),
                            window.api?.reports.summary?.({ ...basePayload, type: 'OUT' }),
                            window.api?.reports.cashBalance?.({ from, to, sphere, budgetId: undefined, paymentAccountId: paymentAccountId ?? undefined })
                        ])
                        inRes = ir || null
                        outRes = or || null
                        cbRes = cb || null
                    }

                    if (alive && res) {
                        const t = res.byType || []
                        const inGross = t.find((x: any) => x.key === 'IN')?.gross || 0
                        const outGrossRaw = t.find((x: any) => x.key === 'OUT')?.gross || 0
                        const outGross = Math.abs(outGrossRaw)
                        const transferGrossRaw = t.find((x: any) => x.key === 'TRANSFER')?.gross || 0
                        const transferGross = Math.abs(transferGrossRaw)
                        const diff = Math.round((inGross - outGross) * 100) / 100
                        setValues({
                            inGross,
                            outGross,
                            diff,
                            bySphere: res.bySphere,
                            byPaymentMethod: res.byPaymentMethod,
                            transferGross,
                            inBySphere: inRes?.bySphere,
                            inByPaymentMethod: inRes?.byPaymentMethod,
                            outByPaymentMethod: outRes?.byPaymentMethod,
                            cashBalanceBAR: cbRes?.BAR,
                            cashBalanceBANK: cbRes?.BANK,
                            inCount: inRes?.totals?.count,
                            outCount: outRes?.totals?.count
                        })
                    }
                }
            } finally {
                if (alive) setLoading(false)
            }
        }
        run()
        return () => { alive = false }
    }, [from, to, paymentMethod, paymentAccountId, sphere, type, earmarkId, budgetId, q, tag, refreshKey])
    
    const fmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])

    useEffect(() => {
        if (!recentKind) return
        const closeOnOutsideClick = (event: MouseEvent) => {
            if (recentPopoverRef.current && !recentPopoverRef.current.contains(event.target as Node)) setRecentKind(null)
        }
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setRecentKind(null)
        }
        document.addEventListener('mousedown', closeOnOutsideClick)
        document.addEventListener('keydown', closeOnEscape)
        return () => {
            document.removeEventListener('mousedown', closeOnOutsideClick)
            document.removeEventListener('keydown', closeOnEscape)
        }
    }, [recentKind])
    
    if (!values && !loading) return null
    
    const inVal = values?.inGross ?? 0
    const outVal = values?.outGross ?? 0
    const diffVal = values?.diff ?? 0
    const plannedVal = values?.planned ?? 0
    const hasPlannedBudget = plannedVal > 0
    const remainingVal = values?.remaining ?? (plannedVal + diffVal)
    const summaryVal = hasPlannedBudget ? remainingVal : diffVal
    const summaryLabel = hasPlannedBudget ? 'Rest' : diffVal >= 0 ? 'Überschuss' : 'Defizit'
    const total = inVal + outVal
    const inPercent = total > 0 ? (inVal / total) * 100 : 50
    // With a defined budget, the flow bar represents the budget status instead of
    // the ratio of incoming to outgoing bookings. Clamp the visible values to the
    // budget amount so an overdrawn budget is shown as fully consumed.
    const availableBudgetForFlow = hasPlannedBudget ? Math.min(plannedVal, Math.max(0, remainingVal)) : 0
    const consumedBudgetForFlow = hasPlannedBudget ? plannedVal - availableBudgetForFlow : 0
    const greenFlowAmount = hasPlannedBudget ? availableBudgetForFlow : inVal
    const redFlowAmount = hasPlannedBudget ? consumedBudgetForFlow : outVal
    const greenFlowPercent = hasPlannedBudget ? (availableBudgetForFlow / plannedVal) * 100 : inPercent

    const sphereSource = type === 'IN' ? (values?.bySphere || []) : !type ? (values?.inBySphere || []) : (values?.bySphere || [])
    const outPaymentSource = type === 'OUT' ? (values?.byPaymentMethod || []) : !type ? (values?.outByPaymentMethod || []) : (values?.byPaymentMethod || [])

    const sphereRows = sphereSource
        .filter((s) => s.gross !== 0)
        .map((s) => ({
            key: SPHERE_LABELS[s.key] || s.key,
            value: fmt.format(Math.abs(s.gross)),
            dotColor: SPHERE_COLORS[s.key] || '#888'
        }))

    const pmRows = outPaymentSource
        .filter((p) => p.gross !== 0)
        .map((p) => ({
            key: p.key === 'BAR' ? 'Bar' : p.key === 'BANK' ? 'Bank' : 'Unbekannt',
            value: fmt.format(Math.abs(p.gross)),
            dotColor: p.key === 'BAR' ? 'var(--warning)' : p.key === 'BANK' ? 'var(--info)' : 'var(--border)'
        }))

    const inCountHint = typeof values?.inCount === 'number' ? `${values.inCount} Einträge` : (typeof values?.count === 'number' ? `${values.count} Einträge` : undefined)
    const outCountHint = typeof values?.outCount === 'number' ? `${values.outCount} Einträge` : (typeof values?.count === 'number' ? `${values.count} Einträge` : undefined)
    const transferHint = values?.transferGross && values.transferGross !== 0
        ? `Transfers: ${fmt.format(values.transferGross)} (nicht Teil der Ausgaben)`
        : undefined
    const recentPopoverLeft = recentKind === 'IN' ? incomeStatRef.current?.offsetLeft : expenseStatRef.current?.offsetLeft

    const toggleRecentBookings = async (kind: 'IN' | 'OUT') => {
        if (recentKind === kind) {
            setRecentKind(null)
            return
        }

        setRecentKind(kind)
        setRecentLoading(true)
        try {
            const payload = buildFilterTotalsPayload({ from, to, paymentMethod, paymentAccountId, sphere, earmarkId, q, tag })
            const result = await window.api?.vouchers.list?.({ ...payload, budgetId, type: kind, limit: 10, offset: 0, sort: 'DESC' } as any)
            setRecentRows((result as any)?.rows || [])
        } catch {
            setRecentRows([])
        } finally {
            setRecentLoading(false)
        }
    }

    return (
        <div className="filter-totals-card" ref={recentPopoverRef}>
            {/* Visual Flow Bar */}
            <div className="filter-totals-flow">
                <HoverTooltip
                    className="tooltip-modal"
                    content={<TooltipList title={hasPlannedBudget ? 'Budgetstand' : 'Einnahmen'} rows={[{ key: hasPlannedBudget ? 'Verfügbar' : 'Summe', value: fmt.format(greenFlowAmount), dotColor: 'var(--success)' }]} />}
                >
                    {({ ref, props }) => (
                        <div ref={ref} {...props} className="filter-totals-flow__in" style={{ width: `${greenFlowPercent}%` }} />
                    )}
                </HoverTooltip>

                <HoverTooltip
                    className="tooltip-modal"
                    content={<TooltipList title={hasPlannedBudget ? 'Budgetstand' : 'Ausgaben'} rows={[{ key: hasPlannedBudget ? 'Verbraucht' : 'Summe', value: fmt.format(redFlowAmount), dotColor: 'var(--danger)' }]} />}
                >
                    {({ ref, props }) => (
                        <div ref={ref} {...props} className="filter-totals-flow__out" style={{ width: `${100 - greenFlowPercent}%` }} />
                    )}
                </HoverTooltip>
            </div>
            
            {/* Stats Grid */}
            <div className="filter-totals-stats">
                {hasPlannedBudget && (
                    <HoverTooltip
                        className="tooltip-modal"
                        content={<TooltipList title="Budget" rows={[{ key: 'Festgelegt', value: fmt.format(plannedVal), dotColor: 'var(--accent)' }]} />}
                    >
                        {({ ref, props }) => (
                            <div ref={ref} {...props} tabIndex={0} className="filter-totals-stat filter-totals-stat--diff">
                                <div className="filter-totals-stat__icon">€</div>
                                <div className="filter-totals-stat__content">
                                    <span className="filter-totals-stat__label">Budget</span>
                                    <span className="filter-totals-stat__value">{fmt.format(plannedVal)}</span>
                                </div>
                            </div>
                        )}
                    </HoverTooltip>
                )}
                {/* IN Card */}
                <HoverTooltip
                    className="tooltip-modal"
                    content={
                        <TooltipList
                            title={sphereRows.length > 0 ? 'Einnahmen · Verteilung nach Sphäre' : 'Einnahmen'}
                            rows={sphereRows.length > 0 ? sphereRows : [{ key: 'Summe', value: fmt.format(inVal), dotColor: 'var(--success)' }]}
                            hint={inCountHint}
                        />
                    }
                >
                    {({ ref, props }) => (
                        <button ref={(node) => { ref(node); incomeStatRef.current = node }} {...props} type="button" onClick={() => void toggleRecentBookings('IN')} className="filter-totals-stat filter-totals-stat--in" aria-expanded={recentKind === 'IN'} aria-controls="recent-income-bookings">
                            <div className="filter-totals-stat__icon">↓</div>
                            <div className="filter-totals-stat__content">
                                <span className="filter-totals-stat__label">Einnahmen</span>
                                <span className="filter-totals-stat__value">{fmt.format(inVal)}</span>
                            </div>
                        </button>
                    )}
                </HoverTooltip>
                
                {/* OUT Card */}
                <HoverTooltip
                    className="tooltip-modal"
                    content={
                        <TooltipList
                            title={pmRows.length > 0 ? 'Ausgaben · Verteilung nach Zahlungsart' : 'Ausgaben'}
                            rows={pmRows.length > 0 ? pmRows : [{ key: 'Summe', value: fmt.format(outVal), dotColor: 'var(--danger)' }]}
                            hint={[outCountHint, transferHint].filter(Boolean).join(' · ') || undefined}
                        />
                    }
                >
                    {({ ref, props }) => (
                        <button ref={(node) => { ref(node); expenseStatRef.current = node }} {...props} type="button" onClick={() => void toggleRecentBookings('OUT')} className="filter-totals-stat filter-totals-stat--out" aria-expanded={recentKind === 'OUT'} aria-controls="recent-expense-bookings">
                            <div className="filter-totals-stat__icon">↑</div>
                            <div className="filter-totals-stat__content">
                                <span className="filter-totals-stat__label">Ausgaben</span>
                                <span className="filter-totals-stat__value">{fmt.format(outVal)}</span>
                            </div>
                        </button>
                    )}
                </HoverTooltip>
                
                {/* Divider */}
                <div className="filter-totals-divider">
                    <span>=</span>
                </div>
                
                {/* Diff Card */}
                <HoverTooltip
                    className="tooltip-modal"
                    content={
                        (() => {
                            const diffRows: Array<{ key: string; value: string; dotColor?: string }> = hasPlannedBudget
                                ? [
                                    { key: 'Budget', value: fmt.format(plannedVal), dotColor: 'var(--accent)' },
                                    { key: 'Einnahmen', value: fmt.format(inVal), dotColor: 'var(--success)' },
                                    { key: 'Ausgaben', value: fmt.format(outVal), dotColor: 'var(--danger)' },
                                    { key: 'Rest', value: fmt.format(remainingVal), dotColor: remainingVal >= 0 ? 'var(--success)' : 'var(--danger)' }
                                ]
                                : [{
                                    key: diffVal >= 0 ? 'Mehr eingenommen als ausgegeben' : 'Mehr ausgegeben als eingenommen',
                                    value: fmt.format(Math.abs(diffVal)),
                                    dotColor: diffVal >= 0 ? 'var(--success)' : 'var(--danger)'
                                }]
                            // Use cashBalance values (includes transfers) when available
                            const barVal = values?.cashBalanceBAR
                            const bankVal = values?.cashBalanceBANK
                            if (typeof barVal === 'number' || typeof bankVal === 'number') {
                                const bar = Math.round((barVal || 0) * 100) / 100
                                const bank = Math.round((bankVal || 0) * 100) / 100
                                if (bar !== 0 || bank !== 0) {
                                    diffRows.push(
                                        { key: 'Bar', value: fmt.format(bar), dotColor: 'var(--warning)' },
                                        { key: 'Bank', value: fmt.format(bank), dotColor: 'var(--info)' }
                                    )
                                }
                            }
                            return (
                                <TooltipList
                                    title={hasPlannedBudget ? 'Restbudget' : diffVal >= 0 ? 'Überschuss' : 'Defizit'}
                                    rows={diffRows}
                                />
                            )
                        })()
                    }
                >
                    {({ ref, props }) => (
                        <div
                            ref={ref}
                            {...props}
                            tabIndex={0}
                            className={`filter-totals-stat filter-totals-stat--diff ${summaryVal >= 0 ? 'positive' : 'negative'}`}
                        >
                            <div className="filter-totals-stat__icon">{hasPlannedBudget ? '€' : diffVal >= 0 ? '✓' : '!'}</div>
                            <div className="filter-totals-stat__content">
                                <span className="filter-totals-stat__label">{summaryLabel}</span>
                                <span className="filter-totals-stat__value">{fmt.format(Math.abs(summaryVal))}</span>
                            </div>
                        </div>
                    )}
                </HoverTooltip>
            </div>
            
            {/* Sphere breakdown mini badges */}
            {values?.bySphere && values.bySphere.filter(s => s.gross !== 0).length > 1 && (
                <div className="filter-totals-spheres">
                    {values.bySphere.filter(s => s.gross !== 0).map(s => (
                        <HoverTooltip
                            key={s.key}
                            className="tooltip-modal"
                            content={
                                <TooltipList
                                    title={SPHERE_LABELS[s.key] || s.key}
                                    rows={[{ key: 'Betrag', value: fmt.format(Math.abs(s.gross)), dotColor: SPHERE_COLORS[s.key] || '#888' }]}
                                    hint={inCountHint}
                                />
                            }
                        >
                            {({ ref, props }) => (
                                <span
                                    ref={ref}
                                    {...props}
                                    tabIndex={0}
                                    className="filter-totals-sphere-badge"
                                    style={{ '--sphere-color': SPHERE_COLORS[s.key] || '#888' } as React.CSSProperties}
                                >
                                    <span className="filter-totals-sphere-badge__dot" />
                                    <span className="filter-totals-sphere-badge__label">{s.key}</span>
                                    <span className="filter-totals-sphere-badge__value">{fmt.format(Math.abs(s.gross))}</span>
                                </span>
                            )}
                        </HoverTooltip>
                    ))}
                </div>
            )}
            {recentKind && (
                <div id={recentKind === 'IN' ? 'recent-income-bookings' : 'recent-expense-bookings'} className={`filter-totals-recent-popover filter-totals-recent-popover--${recentKind.toLowerCase()}`} style={{ left: recentPopoverLeft }} role="dialog" aria-label={`Letzte ${recentKind === 'IN' ? 'Einnahmen' : 'Ausgaben'}`}>
                    <div className="filter-totals-recent-popover__header">
                        <strong>Letzte 10 {recentKind === 'IN' ? 'Einnahmen' : 'Ausgaben'}</strong>
                        <span>Doppelklick für Details</span>
                    </div>
                    {recentLoading ? <div className="filter-totals-recent-popover__empty">Lade Buchungen …</div> : recentRows.length === 0 ? (
                        <div className="filter-totals-recent-popover__empty">Keine passenden Buchungen.</div>
                    ) : (
                        <div className="filter-totals-recent-popover__list">
                            {recentRows.map((row) => (
                                <button key={row.id} type="button" className="filter-totals-recent-row" title="Doppelklick öffnet die Details" onDoubleClick={() => { setRecentKind(null); onOpenVoucher?.(row) }}>
                                    <span className="filter-totals-recent-row__date">{row.date}</span>
                                    <span className="filter-totals-recent-row__description">{row.description || 'Ohne Beschreibung'}</span>
                                    <strong>{fmt.format(Math.abs(Number(row.grossAmount || 0)))}</strong>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
