import React, { useState, useEffect, useMemo } from 'react'
import HoverTooltip from '../../../components/common/HoverTooltip'

interface FilterTotalsProps {
    refreshKey?: number
    from?: string
    to?: string
    paymentMethod?: 'BAR' | 'BANK'
    sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
    type?: 'IN' | 'OUT' | 'TRANSFER'
    earmarkId?: number
    budgetId?: number | null
    q?: string
    tag?: string
}

interface SummaryData {
    inGross: number
    outGross: number
    diff: number
    bySphere?: Array<{ key: string; gross: number }>
    byPaymentMethod?: Array<{ key: string | null; gross: number }>
    count?: number
    transferGross?: number
    inBySphere?: Array<{ key: string; gross: number }>
    outByPaymentMethod?: Array<{ key: string | null; gross: number }>
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

export default function FilterTotals({ refreshKey, from, to, paymentMethod, sphere, type, earmarkId, budgetId, q, tag }: FilterTotalsProps) {
    const [loading, setLoading] = useState(false)
    const [values, setValues] = useState<SummaryData | null>(null)
    
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
                    const basePayload = { from, to, paymentMethod, sphere, type, earmarkId, q, tag }
                    const res = await window.api?.reports.summary?.(basePayload)

                    // When no specific type is filtered, we fetch type-specific breakdowns so the
                    // “Einnahmen/Ausgaben” tooltips add up correctly.
                    let inRes: any | null = null
                    let outRes: any | null = null
                    if (!type) {
                        const [ir, or] = await Promise.all([
                            window.api?.reports.summary?.({ ...basePayload, type: 'IN' }),
                            window.api?.reports.summary?.({ ...basePayload, type: 'OUT' })
                        ])
                        inRes = ir || null
                        outRes = or || null
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
                            count: res.totals?.count,
                            transferGross,
                            inBySphere: inRes?.bySphere,
                            outByPaymentMethod: outRes?.byPaymentMethod,
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
    }, [from, to, paymentMethod, sphere, type, earmarkId, budgetId, q, tag, refreshKey])
    
    const fmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
    
    if (!values && !loading) return null
    
    const inVal = values?.inGross ?? 0
    const outVal = values?.outGross ?? 0
    const diffVal = values?.diff ?? 0
    const total = inVal + outVal
    const inPercent = total > 0 ? (inVal / total) * 100 : 50

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

    return (
        <div className="filter-totals-card">
            {/* Visual Flow Bar */}
            <div className="filter-totals-flow">
                <HoverTooltip
                    className="tooltip-modal"
                    content={<TooltipList title="Einnahmen" rows={[{ key: 'Summe', value: fmt.format(inVal), dotColor: 'var(--success)' }]} />}
                >
                    {({ ref, props }) => (
                        <div ref={ref} {...props} className="filter-totals-flow__in" style={{ width: `${inPercent}%` }} />
                    )}
                </HoverTooltip>

                <HoverTooltip
                    className="tooltip-modal"
                    content={<TooltipList title="Ausgaben" rows={[{ key: 'Summe', value: fmt.format(outVal), dotColor: 'var(--danger)' }]} />}
                >
                    {({ ref, props }) => (
                        <div ref={ref} {...props} className="filter-totals-flow__out" style={{ width: `${100 - inPercent}%` }} />
                    )}
                </HoverTooltip>
            </div>
            
            {/* Stats Grid */}
            <div className="filter-totals-stats">
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
                        <div ref={ref} {...props} tabIndex={0} className="filter-totals-stat filter-totals-stat--in">
                            <div className="filter-totals-stat__icon">↓</div>
                            <div className="filter-totals-stat__content">
                                <span className="filter-totals-stat__label">Einnahmen</span>
                                <span className="filter-totals-stat__value">{fmt.format(inVal)}</span>
                            </div>
                        </div>
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
                        <div ref={ref} {...props} tabIndex={0} className="filter-totals-stat filter-totals-stat--out">
                            <div className="filter-totals-stat__icon">↑</div>
                            <div className="filter-totals-stat__content">
                                <span className="filter-totals-stat__label">Ausgaben</span>
                                <span className="filter-totals-stat__value">{fmt.format(outVal)}</span>
                            </div>
                        </div>
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
                        <TooltipList
                            title={diffVal >= 0 ? 'Überschuss' : 'Defizit'}
                            rows={[
                                {
                                    key: diffVal >= 0 ? 'Mehr eingenommen als ausgegeben' : 'Mehr ausgegeben als eingenommen',
                                    value: fmt.format(Math.abs(diffVal)),
                                    dotColor: diffVal >= 0 ? 'var(--success)' : 'var(--danger)'
                                }
                            ]}
                        />
                    }
                >
                    {({ ref, props }) => (
                        <div
                            ref={ref}
                            {...props}
                            tabIndex={0}
                            className={`filter-totals-stat filter-totals-stat--diff ${diffVal >= 0 ? 'positive' : 'negative'}`}
                        >
                            <div className="filter-totals-stat__icon">{diffVal >= 0 ? '✓' : '!'}</div>
                            <div className="filter-totals-stat__content">
                                <span className="filter-totals-stat__label">{diffVal >= 0 ? 'Überschuss' : 'Defizit'}</span>
                                <span className="filter-totals-stat__value">{fmt.format(Math.abs(diffVal))}</span>
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
        </div>
    )
}
