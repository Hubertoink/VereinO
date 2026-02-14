import React from 'react'
import TagsEditor from '../TagsEditor'
import type { QA } from '../../hooks/useQuickAdd'

type BudgetAssignment = { budgetId: number; amount: number }
type EarmarkAssignment = { earmarkId: number; amount: number }

interface QuickAddModalProps {
    qa: QA
    setQa: (qa: QA) => void
    onSave: () => void
    onClose: () => void
    files: File[]
    setFiles: (files: File[]) => void
    openFilePicker: () => void
    onDropFiles: (files: FileList | null) => void
    fileInputRef: React.RefObject<HTMLInputElement>
    fmtDate: (d: string) => string
    eurFmt: Intl.NumberFormat
    budgetsForEdit: Array<{ id: number; label: string; year?: number; startDate?: string | null; endDate?: string | null; enforceTimeRange?: number; isArchived?: number; color?: string | null }>
    earmarks: Array<{ id: number; code: string; name: string; color?: string | null; startDate?: string | null; endDate?: string | null; enforceTimeRange?: number }>
    tagDefs: Array<{ id: number; name: string; color?: string | null }>
    descSuggest: string[]
    title?: string
}

function inRange(dateISO: string, startISO?: string | null, endISO?: string | null) {
    if (startISO && dateISO < startISO) return false
    if (endISO && dateISO > endISO) return false
    return true
}

function budgetEffectiveRange(b: { year?: number; startDate?: string | null; endDate?: string | null; enforceTimeRange?: number }) {
    const enforce = !!b.enforceTimeRange
    if (!enforce) return { enforce: false as const, start: null as string | null, end: null as string | null }

    const year = typeof b.year === 'number' ? b.year : null
    const start = b.startDate ?? (year != null ? `${year}-01-01` : null)
    const end = b.endDate ?? (year != null ? `${year}-12-31` : null)
    return { enforce: true as const, start, end }
}

function fmtRange(start?: string | null, end?: string | null) {
    if (start && end) return `${start} – ${end}`
    if (start) return `ab ${start}`
    if (end) return `bis ${end}`
    return ''
}

/**
 * QuickAddModal - Buchung schnell erfassen
 * 
 * Modal für das schnelle Erfassen von Buchungen mit allen Details
 * Extrahiert aus App.tsx für bessere Wartbarkeit
 */
export default function QuickAddModal({
    qa,
    setQa,
    onSave,
    onClose,
    files,
    setFiles,
    openFilePicker,
    onDropFiles,
    fileInputRef,
    fmtDate,
    eurFmt,
    budgetsForEdit,
    earmarks,
    tagDefs,
    descSuggest,
    title
}: QuickAddModalProps) {
    const grossAmt = (() => {
        if (qa.type === 'TRANSFER') return Number((qa as any).grossAmount || 0)
        if ((qa as any).mode === 'GROSS') return Number((qa as any).grossAmount || 0)
        const n = Number(qa.netAmount || 0)
        const v = Number(qa.vatRate || 0)
        return Math.round((n * (1 + v / 100)) * 100) / 100
    })()

    const budgetsList: BudgetAssignment[] = ((qa as any).budgets || [])
    const earmarksList: EarmarkAssignment[] = ((qa as any).earmarksAssigned || [])

    const invalidBudgetIds = new Set(
        budgetsList
            .filter((b) => !!b.budgetId)
            .filter((b) => {
                const info = budgetsForEdit.find((x) => x.id === b.budgetId)
                if (!info) return false
                const eff = budgetEffectiveRange(info)
                if (!eff.enforce) return false
                return !inRange(qa.date, eff.start, eff.end)
            })
            .map((b) => b.budgetId)
    )

    const invalidEarmarkIds = new Set(
        earmarksList
            .filter((e) => !!e.earmarkId)
            .filter((e) => {
                const em = earmarks.find((x) => x.id === e.earmarkId)
                if (!em) return false
                if (!em.enforceTimeRange) return false
                return !inRange(qa.date, em.startDate ?? null, em.endDate ?? null)
            })
            .map((e) => e.earmarkId)
    )

    const hasOutOfRange = invalidBudgetIds.size > 0 || invalidEarmarkIds.size > 0

    const activeEarmarks = React.useMemo(() => {
        return (earmarks || []).filter((em: any) => {
            // In DB/IPC: archived Zweckbindungen are represented as isActive = 0
            if (em?.isActive === 0 || em?.isActive === false) return false
            return true
        })
    }, [earmarks])

    return (
        <div className="modal-overlay">
            <div className="modal booking-modal" onClick={(e) => e.stopPropagation()}>
                <header className="modal-header-flex">
                    <h2>{title || '+ Buchung'}</h2>
                    <button className="btn ghost" onClick={() => { onClose(); setFiles([]) }} title="Schließen (ESC)">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                        </svg>
                    </button>
                </header>
                
                <form onSubmit={(e) => { e.preventDefault(); if (!hasOutOfRange) onSave(); }}>
                    {/* Live Summary */}
                    <div className="card summary-card">
                        <div className="helper">Zusammenfassung</div>
                        <div className="summary-text-bold">
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
                                const amountColor = type === 'IN' ? 'var(--success)' : type === 'OUT' ? 'var(--danger)' : 'inherit'
                                return <>{date} · {type} · {pm} · <span style={{ color: amountColor }}>{amount}</span> · {sphere}</>
                            })()}
                        </div>
                    </div>

                    {/* Blocks A+B in a side-by-side grid on wide screens */}
                    <div className="block-grid block-grid-mb">
                        {/* Block A – Basisinfos */}
                        <div className="card form-card">
                            <div className="helper helper-mb">Basis</div>
                            <div className="row">
                                <div className="field">
                                    <label>Datum <span className="req-asterisk" aria-hidden="true">*</span></label>
                                    <input className="input" type="date" value={qa.date} onChange={(e) => setQa({ ...qa, date: e.target.value })} aria-label="Datum der Buchung" required />
                                </div>
                                <div className="field">
                                    <label>Art</label>
                                    <div className="btn-group" role="group" aria-label="Art wählen">
                                        {(['IN','OUT','TRANSFER'] as const).map(t => (
                                            <button key={t} type="button" 
                                                className={`btn ${qa.type === t ? 'btn-toggle-active' : ''} ${t === 'IN' ? 'btn-type-in' : t === 'OUT' ? 'btn-type-out' : ''}`}
                                                onClick={() => {
                                                    const newQa = { ...qa, type: t }
                                                    if (t === 'TRANSFER' && (!(newQa as any).transferFrom || !(newQa as any).transferTo)) {
                                                        (newQa as any).transferFrom = 'BAR';
                                                        (newQa as any).transferTo = 'BANK'
                                                    }
                                                    setQa(newQa)
                                                }}>{t}</button>
                                        ))}
                                    </div>
                                </div>
                                <div className="field">
                                    <label>Sphäre</label>
                                    <select value={qa.sphere} disabled={qa.type === 'TRANSFER'} onChange={(e) => setQa({ ...qa, sphere: e.target.value as any })} aria-label="Sphäre der Buchung">
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
                                            }}
                                            aria-label="Transfer-Richtung">
                                            <option value="BAR->BANK">BAR → BANK</option>
                                            <option value="BANK->BAR">BANK → BAR</option>
                                        </select>
                                    </div>
                                ) : (
                                    <div className="field">
                                        <label>Zahlweg</label>
                                        <div className="btn-group" role="group" aria-label="Zahlweg wählen">
                                            {(['BAR','BANK'] as const).map(pm => (
                                                <button key={pm} type="button" 
                                                    className={`btn ${(qa as any).paymentMethod === pm ? 'btn-toggle-active' : ''}`}
                                                    onClick={() => setQa({ ...qa, paymentMethod: pm })}>{pm === 'BAR' ? 'Bar' : 'Bank'}</button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Block B – Finanzdetails */}
                        <div className="card form-card card-finance">
                            <div className="helper helper-mb">Finanzen</div>
                            <div className="row">
                                {qa.type === 'TRANSFER' ? (
                                    <div className="field field-full-width finance-amount-highlight">
                                        <label>Betrag (Transfer) <span className="req-asterisk" aria-hidden="true">*</span></label>
                                        <span className="adorn-wrap">
                                            <input className="input input-transfer" type="number" step="0.01" value={(qa as any).grossAmount ?? ''}
                                                onChange={(e) => {
                                                    const v = Number(e.target.value)
                                                    setQa({ ...qa, grossAmount: v })
                                                }}
                                                aria-label="Transfer-Betrag" />
                                            <span className="adorn-suffix">€</span>
                                        </span>
                                        <div className="helper">Transfers sind umsatzsteuerneutral.</div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="field finance-amount-highlight">
                                            <label>{(qa as any).mode === 'GROSS' ? 'Brutto' : 'Netto'} <span className="req-asterisk" aria-hidden="true">*</span></label>
                                            <div className="flex-gap-8">
                                                <select
                                                    className="input"
                                                    value={(qa as any).mode ?? 'NET'}
                                                    onChange={(e) => {
                                                        const newMode = e.target.value as 'NET' | 'GROSS'
                                                        const next = { ...qa, mode: newMode } as any
                                                        if (newMode === 'NET') {
                                                            // Falls kein Netto gesetzt ist, aus Brutto übernehmen
                                                            if (next.netAmount == null || isNaN(next.netAmount)) {
                                                                if (typeof next.grossAmount === 'number') next.netAmount = next.grossAmount
                                                                else next.netAmount = 0
                                                            }
                                                            // Wenn bisher vatRate=0 (vom Brutto-Modus), setze Standard auf 19%
                                                            if (Number(next.vatRate) === 0) next.vatRate = 19
                                                        } else if (newMode === 'GROSS') {
                                                            // Wechsel zu Brutto: vatRate immer 0, Brutto ggf. aus Netto berechnen
                                                            if (typeof next.netAmount === 'number' && (next.grossAmount == null || isNaN(next.grossAmount))) {
                                                                const rate = Number(next.vatRate) || 0
                                                                next.grossAmount = Math.round((next.netAmount * (1 + rate / 100)) * 100) / 100
                                                            }
                                                            next.vatRate = 0
                                                        }
                                                        setQa(next)
                                                    }}
                                                    aria-label="Netto oder Brutto Modus"
                                                >
                                                    <option value="NET">Netto</option>
                                                    <option value="GROSS">Brutto</option>
                                                </select>
                                                <span className="adorn-wrap flex-1">
                                                    <input className="input" type="number" step="0.01" value={(qa as any).mode === 'GROSS' ? (qa as any).grossAmount ?? '' : qa.netAmount}
                                                        onChange={(e) => {
                                                            const v = Number(e.target.value)
                                                            if ((qa as any).mode === 'GROSS') setQa({ ...qa, grossAmount: v })
                                                            else setQa({ ...qa, netAmount: v })
                                                        }}
                                                        aria-label={(qa as any).mode === 'GROSS' ? 'Brutto-Betrag' : 'Netto-Betrag'} />
                                                    <span className="adorn-suffix">€</span>
                                                </span>
                                            </div>
                                            <div className="helper">{(qa as any).mode === 'GROSS' ? 'Bei Brutto wird USt/Netto nicht berechnet' : 'USt wird automatisch berechnet'}</div>
                                        </div>
                                        {(qa as any).mode === 'NET' && (
                                            <div className="field">
                                                <label>USt %</label>
                                                <select
                                                    className="input"
                                                    value={String(qa.vatRate)}
                                                    onChange={(e) => setQa({ ...qa, vatRate: Number(e.target.value) })}
                                                    aria-label="Umsatzsteuer Prozentsatz"
                                                >
                                                    <option value="0">0% (steuerfrei)</option>
                                                    <option value="7">7%</option>
                                                    <option value="19">19%</option>
                                                </select>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                            <div className="row">
                                <div className="field" style={{ gridColumn: '1 / -1' }}>
                                    {hasOutOfRange && (
                                        <div className="helper" style={{ color: 'var(--danger)', marginTop: 6 }}>⚠ Es sind Zuordnungen außerhalb des gültigen Zeitraums ausgewählt. Speichern ist blockiert.</div>
                                    )}
                                </div>
                            </div>

                            {/* Budget Zuordnungen (mehrfach möglich) */}
                            <div className="row">
                                <div className="field" style={{ gridColumn: '1 / -1' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        Budget
                                        <button
                                            type="button"
                                            className="btn ghost"
                                            style={{ padding: '2px 6px', fontSize: '0.85rem' }}
                                            onClick={() => {
                                                const current = ((qa as any).budgets || []) as BudgetAssignment[]
                                                setQa({ ...(qa as any), budgets: [...current, { budgetId: 0, amount: grossAmt }] } as any)
                                            }}
                                            title="Weiteres Budget hinzufügen"
                                        >+</button>
                                    </label>
                                    {(() => {
                                        const budgetIds = budgetsList.filter((b) => b.budgetId).map((b) => b.budgetId)
                                        const hasDuplicateBudgets = new Set(budgetIds).size !== budgetIds.length
                                        const totalBudgetAmount = budgetsList.reduce((sum, b) => sum + (b.amount || 0), 0)
                                        const exceedsTotal = totalBudgetAmount > grossAmt * 1.001
                                        return budgetsList.length > 0 ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                {budgetsList.map((ba, idx) => {
                                                    const isDuplicate = budgetIds.filter((id) => id === ba.budgetId).length > 1
                                                    const isInvalid = ba.budgetId && invalidBudgetIds.has(ba.budgetId)
                                                    return (
                                                        <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                            <select
                                                                style={{ flex: 1, borderColor: (isDuplicate || isInvalid) ? 'var(--danger)' : undefined, opacity: isInvalid ? 0.8 : 1 }}
                                                                value={ba.budgetId || ''}
                                                                onChange={(e) => {
                                                                    const next = [...budgetsList]
                                                                    next[idx] = { ...next[idx], budgetId: e.target.value ? Number(e.target.value) : 0 }
                                                                    setQa({ ...(qa as any), budgets: next } as any)
                                                                }}
                                                            >
                                                                <option value="">— Budget wählen —</option>
                                                                {(() => {
                                                                    const active = (budgetsForEdit || []).filter((b: any) => !b?.isArchived)
                                                                    const activeIds = new Set(active.map((b: any) => b.id))
                                                                    const selectedId = Number(ba.budgetId || 0)
                                                                    const selectedMissing = selectedId && !activeIds.has(selectedId)
                                                                    const selected = selectedMissing ? (budgetsForEdit || []).find((b: any) => b.id === selectedId) : null
                                                                    return (
                                                                        <>
                                                                            {selectedMissing ? (
                                                                                <option value={selectedId} disabled>
                                                                                    {(selected as any)?.label ?? `Budget #${selectedId}`} (archiviert)
                                                                                </option>
                                                                            ) : null}
                                                                            {active.map((b: any) => {
                                                                    const eff = budgetEffectiveRange(b)
                                                                    const disabled = eff.enforce ? !inRange(qa.date, eff.start, eff.end) : false
                                                                    const suffix = eff.enforce ? ` (${fmtRange(eff.start, eff.end) || 'Zeitraum'})` : ''
                                                                    return (
                                                                        <option key={b.id} value={b.id} disabled={disabled}>{b.label}{suffix}</option>
                                                                    )
                                                                            })}
                                                                        </>
                                                                    )
                                                                })()}
                                                            </select>
                                                            <span className="adorn-wrap" style={{ width: 110 }}>
                                                                <input
                                                                    className="input"
                                                                    type="number"
                                                                    step="0.01"
                                                                    min="0"
                                                                    value={ba.amount ?? ''}
                                                                    onChange={(e) => {
                                                                        const next = [...budgetsList]
                                                                        next[idx] = { ...next[idx], amount: e.target.value ? Number(e.target.value) : 0 }
                                                                        setQa({ ...(qa as any), budgets: next } as any)
                                                                    }}
                                                                    title="Betrag für dieses Budget"
                                                                />
                                                                <span className="adorn-suffix">€</span>
                                                            </span>
                                                            <button
                                                                type="button"
                                                                className="btn ghost"
                                                                style={{ padding: '2px 6px', color: 'var(--danger)' }}
                                                                onClick={() => {
                                                                    const next = budgetsList.filter((_, i) => i !== idx)
                                                                    setQa({ ...(qa as any), budgets: next } as any)
                                                                }}
                                                                title="Entfernen"
                                                            >✕</button>
                                                        </div>
                                                    )
                                                })}
                                                {hasDuplicateBudgets && (
                                                    <div className="helper" style={{ color: 'var(--danger)' }}>⚠ Ein Budget kann nur einmal zugeordnet werden</div>
                                                )}
                                                {exceedsTotal && (
                                                    <div className="helper" style={{ color: 'var(--danger)' }}>⚠ Summe ({totalBudgetAmount.toFixed(2)} €) übersteigt Buchungsbetrag ({grossAmt.toFixed(2)} €)</div>
                                                )}
                                                {invalidBudgetIds.size > 0 && (
                                                    <div className="helper" style={{ color: 'var(--danger)' }}>⚠ Mindestens ein Budget ist für dieses Datum nicht gültig</div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="helper" style={{ fontStyle: 'italic', opacity: 0.7 }}>Kein Budget zugeordnet. Klicke + zum Hinzufügen.</div>
                                        )
                                    })()}
                                </div>
                            </div>

                            {/* Zweckbindung Zuordnungen (mehrfach möglich) */}
                            <div className="row">
                                <div className="field" style={{ gridColumn: '1 / -1' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        Zweckbindung
                                        <button
                                            type="button"
                                            className="btn ghost"
                                            style={{ padding: '2px 6px', fontSize: '0.85rem' }}
                                            onClick={() => {
                                                const current = ((qa as any).earmarksAssigned || []) as EarmarkAssignment[]
                                                setQa({ ...(qa as any), earmarksAssigned: [...current, { earmarkId: 0, amount: grossAmt }] } as any)
                                            }}
                                            title="Weitere Zweckbindung hinzufügen"
                                        >+</button>
                                    </label>
                                    {(() => {
                                        const earmarkIds = earmarksList.filter((e) => e.earmarkId).map((e) => e.earmarkId)
                                        const hasDuplicateEarmarks = new Set(earmarkIds).size !== earmarkIds.length
                                        const totalEarmarkAmount = earmarksList.reduce((sum, e) => sum + (e.amount || 0), 0)
                                        const exceedsTotal = totalEarmarkAmount > grossAmt * 1.001
                                        return earmarksList.length > 0 ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                {earmarksList.map((ea, idx) => {
                                                    const isDuplicate = earmarkIds.filter((id) => id === ea.earmarkId).length > 1
                                                    const isInvalid = ea.earmarkId && invalidEarmarkIds.has(ea.earmarkId)
                                                    return (
                                                        <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                            <select
                                                                style={{ flex: 1, borderColor: (isDuplicate || isInvalid) ? 'var(--danger)' : undefined, opacity: isInvalid ? 0.8 : 1 }}
                                                                value={ea.earmarkId || ''}
                                                                onChange={(e) => {
                                                                    const next = [...earmarksList]
                                                                    next[idx] = { ...next[idx], earmarkId: e.target.value ? Number(e.target.value) : 0 }
                                                                    setQa({ ...(qa as any), earmarksAssigned: next } as any)
                                                                }}
                                                            >
                                                                <option value="">— Zweckbindung wählen —</option>
                                                                {activeEarmarks.map((em) => {
                                                                    const disabled = em.enforceTimeRange ? !inRange(qa.date, em.startDate ?? null, em.endDate ?? null) : false
                                                                    const suffix = em.enforceTimeRange ? ` (${fmtRange(em.startDate ?? null, em.endDate ?? null) || 'Zeitraum'})` : ''
                                                                    return (
                                                                        <option key={em.id} value={em.id} disabled={disabled}>{em.code} – {em.name}{suffix}</option>
                                                                    )
                                                                })}
                                                            </select>
                                                            <span className="adorn-wrap" style={{ width: 110 }}>
                                                                <input
                                                                    className="input"
                                                                    type="number"
                                                                    step="0.01"
                                                                    min="0"
                                                                    value={ea.amount ?? ''}
                                                                    onChange={(e) => {
                                                                        const next = [...earmarksList]
                                                                        next[idx] = { ...next[idx], amount: e.target.value ? Number(e.target.value) : 0 }
                                                                        setQa({ ...(qa as any), earmarksAssigned: next } as any)
                                                                    }}
                                                                    title="Betrag für diese Zweckbindung"
                                                                />
                                                                <span className="adorn-suffix">€</span>
                                                            </span>
                                                            <button
                                                                type="button"
                                                                className="btn ghost"
                                                                style={{ padding: '2px 6px', color: 'var(--danger)' }}
                                                                onClick={() => {
                                                                    const next = earmarksList.filter((_, i) => i !== idx)
                                                                    setQa({ ...(qa as any), earmarksAssigned: next } as any)
                                                                }}
                                                                title="Entfernen"
                                                            >✕</button>
                                                        </div>
                                                    )
                                                })}
                                                {hasDuplicateEarmarks && (
                                                    <div className="helper" style={{ color: 'var(--danger)' }}>⚠ Eine Zweckbindung kann nur einmal zugeordnet werden</div>
                                                )}
                                                {exceedsTotal && (
                                                    <div className="helper" style={{ color: 'var(--danger)' }}>⚠ Summe ({totalEarmarkAmount.toFixed(2)} €) übersteigt Buchungsbetrag ({grossAmt.toFixed(2)} €)</div>
                                                )}
                                                {invalidEarmarkIds.size > 0 && (
                                                    <div className="helper" style={{ color: 'var(--danger)' }}>⚠ Mindestens eine Zweckbindung ist für dieses Datum nicht gültig</div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="helper" style={{ fontStyle: 'italic', opacity: 0.7 }}>Keine Zweckbindung zugeordnet. Klicke + zum Hinzufügen.</div>
                                        )
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Blocks C+D in a side-by-side grid */}
                    <div className="block-grid block-grid-mb block-grid-meta">
                        {/* Block C – Beschreibung & Tags */}
                        <div className="card form-card">
                            <div className="helper helper-mb">Beschreibung & Tags</div>
                            <div className="row">
                                <div className="field field-full-width">
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
                            className="card attachment-card"
                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDropFiles(e.dataTransfer?.files) }}
                        >
                            <div className="attachment-header">
                                <div className="attachment-title">
                                    <strong>Anhänge</strong>
                                    {files.length > 0 && <div className="helper">Dateien hierher ziehen</div>}
                                </div>
                                <div className="flex-gap-8">
                                    <input ref={fileInputRef} type="file" multiple hidden accept=".png,.jpg,.jpeg,.pdf,.doc,.docx" onChange={(e) => onDropFiles(e.target.files)} />
                                    <button type="button" className="btn" onClick={openFilePicker}>+ Datei(en)</button>
                                    {files.length > 0 && (
                                        <button type="button" className="btn" onClick={() => setFiles([])}>Leeren</button>
                                    )}
                                </div>
                            </div>
                            {files.length > 0 ? (
                                <ul className="file-list">
                                    {files.map((f, i) => (
                                        <li key={i} className="file-list-item">
                                            <span className="file-name">{f.name}</span>
                                            <button type="button" className="btn" onClick={() => setFiles(files.filter((_, idx) => idx !== i))}>Entfernen</button>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div 
                                    style={{ 
                                        marginTop: 6, 
                                        padding: 12, 
                                        border: '2px dashed var(--border)', 
                                        borderRadius: 8, 
                                        textAlign: 'center',
                                        cursor: 'pointer'
                                    }}
                                    onClick={openFilePicker}
                                >
                                    <div style={{ fontSize: 20, marginBottom: 4 }}>📎</div>
                                    <div className="helper">Dateien hierher ziehen oder klicken</div>
                                </div>
                            )}
                        </div>
                    </div>
                    
                    <div className="modal-footer-actions">
                        <div className="helper">Ctrl+S = Speichern · Ctrl+U = Datei hinzufügen · Esc = Abbrechen</div>
                        <button type="submit" className="btn primary" disabled={hasOutOfRange}>Speichern</button>
                    </div>
                </form>
            </div>
        </div>
    )
}
