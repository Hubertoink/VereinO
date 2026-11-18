import React, { useState, useEffect, useMemo } from 'react'
import { accountPositionAt, type BalanceAccount } from '../../../utils/accountBalance'
import BookingBalanceStat from '../../../components/booking/BookingBalanceStat'
import { localIsoDate } from '../../../../../shared/recurrence'
import HoverTooltip from '../../../components/common/HoverTooltip'
import { buildFilterTotalsPayload } from '../utils/filterTotalsPayload'

interface FilterTotalsProps {
    paymentAccounts: BalanceAccount[]
    primaryClassificationValueId?: number
    stornoPairIds?: [number, number] | null
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
    bySphere?: Array<{ key: string; color?: string | null; gross: number }>
    byPrimaryClassification?: Array<{ key: string; color?: string | null; gross: number }>
    byPaymentMethod?: Array<{ key: string | null; gross: number }>
    count?: number
    transferGross?: number
    inBySphere?: Array<{ key: string; color?: string | null; gross: number }>
    inByPrimaryClassification?: Array<{ key: string; color?: string | null; gross: number }>
    classificationProfile?: 'NONPROFIT' | 'GENERAL'
    inByPaymentMethod?: Array<{ key: string | null; gross: number }>
    outByPaymentMethod?: Array<{ key: string | null; gross: number }>
    position?: ReturnType<typeof accountPositionAt>
    cutoff?: string
    positionLabel?: string
    bookingAccounts?: { accountId: number | null; key: string; bookingNet?: number; color?: string | null }[]
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

export default function FilterTotals({ paymentAccounts, primaryClassificationValueId, stornoPairIds, refreshKey, from, to, paymentMethod, paymentAccountId, sphere, type, earmarkId, budgetId, q, tag, onOpenVoucher }: FilterTotalsProps) {
    const [values, setValues] = useState<SummaryData | null>(null)
    const [recentKind, setRecentKind] = useState<'IN' | 'OUT' | null>(null)
    const [recentRows, setRecentRows] = useState<any[]>([])
    const [recentLoading, setRecentLoading] = useState(false)
    const recentPopoverRef = React.useRef<HTMLDivElement | null>(null)
    const incomeStatRef = React.useRef<HTMLButtonElement | null>(null)
    const expenseStatRef = React.useRef<HTMLButtonElement | null>(null)
    
    const showPosition = !(from && to && from > to) && !stornoPairIds && !type && !sphere && !primaryClassificationValueId && !earmarkId && !budgetId && !q?.trim() && !tag

    const cutoff = showPosition ? to || localIsoDate() : undefined
    useEffect(() => {
        let alive = true
        async function run() {
            try {
                const basePayload = buildFilterTotalsPayload({ from, to, paymentMethod, paymentAccountId, sphere, primaryClassificationValueId, type, earmarkId, q, tag })
                if (stornoPairIds) {
                    const result = await window.api.vouchers.list({ ...basePayload, budgetId: budgetId ?? undefined, voucherIds: stornoPairIds, limit: 2, offset: 0 })
                    const sum = (type: string) => result.rows.filter(row => row.type === type).reduce((amount, row) => amount + row.grossAmount, 0)
                    const inGross = sum('IN'), outGross = sum('OUT')
                    if (alive) setValues({ inGross, outGross, diff: inGross - outGross })
                } else if (typeof budgetId === 'number') {
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
                    const res = await window.api?.reports.summary?.(basePayload)

                    // When no specific type is filtered, we fetch type-specific breakdowns so the
                    // “Einnahmen/Ausgaben” tooltips add up correctly.
                    let inRes: any | null = null
                    let outRes: any | null = null
                    let position: SummaryData['position']
                    if (!type) {
                        const [ir, or, cb] = await Promise.all([
                            window.api?.reports.summary?.({ ...basePayload, type: 'IN' }),
                            window.api?.reports.summary?.({ ...basePayload, type: 'OUT' }),
                            cutoff ? window.api?.reports.cashBalance?.({ to: cutoff }) : undefined
                        ])
                        inRes = ir || null
                        outRes = or || null
                        if (cb && cutoff) position = accountPositionAt(cb, paymentAccounts, { to: cutoff, paymentAccountId, paymentMethod })
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
                            byPrimaryClassification: res.byPrimaryClassification,
                            classificationProfile: res.classificationProfile,
                            byPaymentMethod: res.byPaymentMethod,
                            transferGross,
                            inBySphere: inRes?.bySphere,
                            inByPrimaryClassification: inRes?.byPrimaryClassification,
                            inByPaymentMethod: inRes?.byPaymentMethod,
                            outByPaymentMethod: outRes?.byPaymentMethod,
                            position, cutoff,
                            positionLabel: paymentAccountId || paymentMethod ? 'Kontostand' : 'Gesamtbestand',
                            bookingAccounts: res.byPaymentAccount?.filter(a => paymentAccountId == null || a.accountId === paymentAccountId || a.bookingNet),
                            inCount: inRes?.totals?.count,
                            outCount: outRes?.totals?.count
                        })
                    }
                }
            } catch (error) {
                if (alive) {
                    setValues(null)
                    console.error('Buchungssummen konnten nicht geladen werden.', error)
                }
            }
        }
        run()
        return () => { alive = false }
    }, [from, to, paymentMethod, paymentAccountId, sphere, type, earmarkId, budgetId, q, tag, refreshKey, primaryClassificationValueId, cutoff, paymentAccounts, stornoPairIds])
    
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
    
    if (!values) return null
    
    const inVal = values?.inGross ?? 0
    const outVal = values?.outGross ?? 0
    const diffVal = values?.diff ?? 0
    const plannedVal = values?.planned ?? 0
    const hasPlannedBudget = plannedVal > 0
    const remainingVal = values?.remaining ?? (plannedVal + diffVal)
    const summaryVal = hasPlannedBudget ? remainingVal : diffVal
    const summaryLabel = hasPlannedBudget ? 'Rest' : diffVal >= 0 ? 'Überschuss' : 'Defizit'
    const isGeneralProfile = values?.classificationProfile === 'GENERAL'
    const classificationSource = isGeneralProfile
        ? (type === 'IN' ? (values?.byPrimaryClassification || []) : !type ? (values?.inByPrimaryClassification || []) : (values?.byPrimaryClassification || []))
        : (type === 'IN' ? (values?.bySphere || []) : !type ? (values?.inBySphere || []) : (values?.bySphere || []))
    const totalClassificationSource = isGeneralProfile
        ? (values?.byPrimaryClassification || [])
        : (values?.bySphere || [])
    const outPaymentSource = type === 'OUT' ? (values?.byPaymentMethod || []) : !type ? (values?.outByPaymentMethod || []) : (values?.byPaymentMethod || [])

    const sphereRows = classificationSource
        .filter((s) => s.gross !== 0)
        .map((s) => ({
            key: isGeneralProfile ? s.key : (SPHERE_LABELS[s.key] || s.key),
            value: fmt.format(Math.abs(s.gross)),
            dotColor: isGeneralProfile ? (s.color || '#888') : (SPHERE_COLORS[s.key] || '#888')
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
            const payload = buildFilterTotalsPayload({ from, to, paymentMethod, paymentAccountId, sphere, primaryClassificationValueId, earmarkId, q, tag })
            const result = await window.api?.vouchers.list?.({ ...payload, budgetId, voucherIds: stornoPairIds ?? undefined, type: kind, limit: 10, offset: 0, sort: 'DESC' } as any)
            setRecentRows((result as any)?.rows || [])
        } catch {
            setRecentRows([])
        } finally {
            setRecentLoading(false)
        }
    }

    return (
        <div className="filter-totals-card" ref={recentPopoverRef}>
            <div className="filter-totals-compact-row">
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
                {values.planned !== undefined ? (
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
                                <div className="filter-totals-stat__icon">{hasPlannedBudget ? '€' : summaryVal >= 0 ? '✓' : '!'}</div>
                                <div className="filter-totals-stat__content">
                                    <span className="filter-totals-stat__label">{summaryLabel}</span>
                                    <span className="filter-totals-stat__value">{fmt.format(Math.abs(summaryVal))}</span>
                                </div>
                            </div>
                        )}
                    </HoverTooltip>
                ) : <BookingBalanceStat layout="classic" kind="period" income={inVal} expense={outVal} accounts={values.bookingAccounts} />}
                {values.cutoff && <BookingBalanceStat layout="classic" kind="position" label={values.positionLabel ?? 'Gesamtbestand'}
                    date={new Intl.DateTimeFormat('de-DE').format(new Date(values.cutoff + 'T12:00:00'))} position={values.position} />}
                </div>

                {/* Classification breakdown mini badges */}
                {totalClassificationSource.filter(s => s.gross !== 0).length > 1 && (
                    <div className="filter-totals-spheres">
                        {totalClassificationSource.filter(s => s.gross !== 0).map(s => (
                            <HoverTooltip
                                key={s.key}
                                className="tooltip-modal"
                                content={
                                    <TooltipList
                                        title={isGeneralProfile ? s.key : (SPHERE_LABELS[s.key] || s.key)}
                                        rows={[{ key: 'Betrag', value: fmt.format(Math.abs(s.gross)), dotColor: isGeneralProfile ? (s.color || '#888') : (SPHERE_COLORS[s.key] || '#888') }]}
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
                                        style={{ '--sphere-color': isGeneralProfile ? (s.color || '#888') : (SPHERE_COLORS[s.key] || '#888') } as React.CSSProperties}
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
            </div>
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
