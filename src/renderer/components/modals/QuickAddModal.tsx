import React from 'react'
import TagsEditor from '../TagsEditor'
import type { QA } from '../../hooks/useQuickAdd'
import WindowControls from '../layout/WindowControls'

type BudgetAssignment = { budgetId: number; amount: number }
type EarmarkAssignment = { earmarkId: number; amount: number }
type ExistingAttachment = { id: number; fileName: string }
type PaymentAccount = { id: number; name: string; kind: 'CASH' | 'BANK' | 'PAYPAL' | 'CARD' | 'OTHER'; iban?: string | null; color?: string | null; sortOrder: number; isActive: number }

interface QuickAddModalProps {
    qa: QA
    setQa: (qa: QA) => void
    onSave: () => void
    onSaveAndNew?: () => void
    onSaveAndClose?: () => void
    afterSaveDefault?: 'close' | 'new'
    saveLabel?: string
    showSaveMenu?: boolean
    footerHint?: string
    footerLeft?: React.ReactNode
    onClose: () => void
    onDetach?: () => void
    windowMode?: boolean
    onRequestClose?: () => void
    confirmingClose?: boolean
    onConfirmDiscard?: () => void
    onCancelDiscard?: () => void
    files: File[]
    setFiles: (files: File[]) => void
    openFilePicker: () => void
    onDropFiles: (files: FileList | null) => void
    fileInputRef: React.RefObject<HTMLInputElement>
    fmtDate: (d: string) => string
    eurFmt: Intl.NumberFormat
    budgetsForEdit: Array<{ id: number; label: string; year?: number; startDate?: string | null; endDate?: string | null; enforceTimeRange?: number; isArchived?: number; color?: string | null }>
    earmarks: Array<{ id: number; code: string; name: string; color?: string | null; startDate?: string | null; endDate?: string | null; enforceTimeRange?: number }>
    paymentAccounts?: PaymentAccount[]
    tagDefs: Array<{ id: number; name: string; color?: string | null }>
    descSuggest: string[]
    title?: string
    existingFiles?: ExistingAttachment[]
    existingFilesLoading?: boolean
    onOpenExistingFile?: (fileId: number) => void | Promise<void>
    onDownloadExistingFile?: (fileId: number) => void | Promise<void>
    onDeleteExistingFile?: (file: ExistingAttachment) => void | Promise<void>
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

function paymentMethodLabel(method?: 'BAR' | 'BANK' | null) {
    if (method === 'BAR') return 'Bar'
    if (method === 'BANK') return 'Bank'
    return '—'
}

function accountMethod(kind?: PaymentAccount['kind'] | null): 'BAR' | 'BANK' | null {
    if (!kind) return null
    return kind === 'CASH' ? 'BAR' : 'BANK'
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
    onSaveAndNew,
    onSaveAndClose,
    saveLabel,
    showSaveMenu = true,
    footerHint,
    footerLeft,
    onClose,
    onDetach,
    windowMode,
    onRequestClose,
    confirmingClose,
    onConfirmDiscard,
    onCancelDiscard,
    files,
    setFiles,
    openFilePicker,
    onDropFiles,
    fileInputRef,
    fmtDate,
    eurFmt,
    budgetsForEdit,
    earmarks,
    paymentAccounts = [],
    tagDefs,
    descSuggest,
    title,
    existingFiles = [],
    existingFilesLoading = false,
    onOpenExistingFile,
    onDownloadExistingFile,
    onDeleteExistingFile
}: QuickAddModalProps) {
    const dateInputRef = React.useRef<HTMLInputElement | null>(null)
    const amountInputRef = React.useRef<HTMLInputElement | null>(null)
    const descriptionInputRef = React.useRef<HTMLInputElement | null>(null)
    const tagsInputRef = React.useRef<HTMLInputElement | null>(null)
    const modalRef = React.useRef<HTMLDivElement | null>(null)
    const dragStartRef = React.useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null)
    const [dragOffset, setDragOffset] = React.useState({ x: 0, y: 0 })
    const [saveMenuOpen, setSaveMenuOpen] = React.useState(false)

    const grossAmt = (() => {
        if (qa.type === 'TRANSFER') return Number((qa as any).grossAmount || 0)
        if ((qa as any).mode === 'GROSS') return Number((qa as any).grossAmount || 0)
        const n = Number(qa.netAmount || 0)
        const v = Number(qa.vatRate || 0)
        return Math.round((n * (1 + v / 100)) * 100) / 100
    })()

    const budgetsList: BudgetAssignment[] = ((qa as any).budgets || [])
    const earmarksList: EarmarkAssignment[] = ((qa as any).earmarksAssigned || [])
    const availableBudgets = React.useMemo(
        () => (budgetsForEdit || []).filter((budget) => !budget?.isArchived),
        [budgetsForEdit]
    )
    const hasAvailableBudgets = availableBudgets.length > 0
    const activePaymentAccounts = React.useMemo(
        () => (paymentAccounts || []).filter((account) => account.isActive !== 0),
        [paymentAccounts]
    )
    const paymentAccountsById = React.useMemo(
        () => new Map(activePaymentAccounts.map((account) => [account.id, account])),
        [activePaymentAccounts]
    )
    const defaultCashAccount = React.useMemo(
        () => activePaymentAccounts.find((account) => account.kind === 'CASH') ?? activePaymentAccounts[0] ?? null,
        [activePaymentAccounts]
    )
    const defaultBankAccount = React.useMemo(
        () => activePaymentAccounts.find((account) => account.kind === 'BANK')
            ?? activePaymentAccounts.find((account) => account.id !== defaultCashAccount?.id)
            ?? activePaymentAccounts[0]
            ?? null,
        [activePaymentAccounts, defaultCashAccount]
    )
    const financeAccountColor = React.useMemo(() => {
        if (qa.type === 'TRANSFER') {
            const fromColor = paymentAccountsById.get(Number((qa as any).transferFromAccountId || 0))?.color
            const toColor = paymentAccountsById.get(Number((qa as any).transferToAccountId || 0))?.color
            return fromColor || toColor || undefined
        }
        return paymentAccountsById.get(Number((qa as any).paymentAccountId || 0))?.color || undefined
    }, [paymentAccountsById, qa])
    const activeEarmarks = React.useMemo(() => {
        return (earmarks || []).filter((em: any) => {
            // In DB/IPC: archived Zweckbindungen are represented as isActive = 0
            if (em?.isActive === 0 || em?.isActive === false) return false
            return true
        })
    }, [earmarks])
    const hasAvailableEarmarks = activeEarmarks.length > 0

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
    const hasInvalidAmount = !Number.isFinite(grossAmt) || grossAmt <= 0
    const amountError = 'Bitte einen Betrag größer als 0 € eingeben.'
    const saveBlocked = hasOutOfRange || hasInvalidAmount
    const saveAndNew = onSaveAndNew ?? onSave
    const saveAndClose = onSaveAndClose ?? onSave
    const defaultSaveLabel = saveLabel || 'Speichern'
    const canDrag = !windowMode
    const hasAnyAttachment = files.length > 0 || existingFiles.length > 0

    const focusInput = React.useCallback((input: HTMLInputElement | null) => {
        if (!input) return
        input.focus()
        input.select()
    }, [])

    React.useEffect(() => {
        window.setTimeout(() => focusInput(amountInputRef.current), 0)
    }, [focusInput])

    const clampDragOffset = React.useCallback((x: number, y: number) => {
        const modal = modalRef.current
        if (!modal) return { x, y }
        const rect = modal.getBoundingClientRect()
        const margin = 12
        const minX = margin - rect.left + dragOffset.x
        const maxX = window.innerWidth - margin - rect.right + dragOffset.x
        const minY = margin - rect.top + dragOffset.y
        const maxY = window.innerHeight - margin - rect.bottom + dragOffset.y
        return {
            x: Math.min(maxX, Math.max(minX, x)),
            y: Math.min(maxY, Math.max(minY, y))
        }
    }, [dragOffset.x, dragOffset.y])

    const startDrag = React.useCallback((e: React.PointerEvent<HTMLElement>) => {
        if (!canDrag) return
        if (e.button !== 0) return
        const target = e.target as HTMLElement | null
        if (target?.closest('button, input, select, textarea, a')) return
        dragStartRef.current = {
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            originX: dragOffset.x,
            originY: dragOffset.y
        }
        e.currentTarget.setPointerCapture(e.pointerId)
    }, [canDrag, dragOffset.x, dragOffset.y])

    const moveDrag = React.useCallback((e: React.PointerEvent<HTMLElement>) => {
        if (!canDrag) return
        const start = dragStartRef.current
        if (!start || start.pointerId !== e.pointerId) return
        const nextX = start.originX + e.clientX - start.startX
        const nextY = start.originY + e.clientY - start.startY
        setDragOffset(clampDragOffset(nextX, nextY))
    }, [canDrag, clampDragOffset])

    const endDrag = React.useCallback((e: React.PointerEvent<HTMLElement>) => {
        if (!canDrag) return
        const start = dragStartRef.current
        if (!start || start.pointerId !== e.pointerId) return
        dragStartRef.current = null
        try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { }
    }, [canDrag])

    const addBudgetAssignment = React.useCallback(() => {
        if (!hasAvailableBudgets) return
        const current = ((qa as any).budgets || []) as BudgetAssignment[]
        setQa({ ...(qa as any), budgets: [...current, { budgetId: 0, amount: grossAmt }] } as any)
    }, [grossAmt, hasAvailableBudgets, qa, setQa])

    const addEarmarkAssignment = React.useCallback(() => {
        if (!hasAvailableEarmarks) return
        const current = ((qa as any).earmarksAssigned || []) as EarmarkAssignment[]
        setQa({ ...(qa as any), earmarksAssigned: [...current, { earmarkId: 0, amount: grossAmt }] } as any)
    }, [grossAmt, hasAvailableEarmarks, qa, setQa])

    const closeModal = React.useCallback(() => {
        if (onRequestClose) onRequestClose()
        else {
            onClose()
            setFiles([])
        }
    }, [onClose, onRequestClose, setFiles])

    const lastGrossAmtRef = React.useRef(grossAmt)

    React.useEffect(() => {
        const previousGross = lastGrossAmtRef.current
        if (previousGross === grossAmt) return

        let nextQa: QA | null = null

        if (budgetsList.length === 1 && Math.abs((budgetsList[0]?.amount || 0) - previousGross) < 0.001) {
            nextQa = {
                ...(nextQa ?? qa),
                budgets: [{ ...budgetsList[0], amount: grossAmt }]
            } as QA
        }

        if (earmarksList.length === 1 && Math.abs((earmarksList[0]?.amount || 0) - previousGross) < 0.001) {
            nextQa = {
                ...(nextQa ?? qa),
                earmarksAssigned: [{ ...earmarksList[0], amount: grossAmt }]
            } as QA
        }

        if (nextQa) setQa(nextQa)
        lastGrossAmtRef.current = grossAmt
    }, [grossAmt, budgetsList, earmarksList, qa, setQa])

    return (
        <div className={`modal-overlay quick-add-modal-overlay${windowMode ? ' detached-quick-add-overlay' : ''}`} role="dialog" aria-modal="true">
            <div
                ref={modalRef}
                className={`modal booking-modal quick-add-modal${windowMode ? ' detached-quick-add-modal' : ''}`}
                onClick={(e) => e.stopPropagation()}
                style={windowMode ? undefined : { transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }}
            >
                <header
                    className={`modal-header-flex${canDrag ? ' booking-modal-drag-handle' : ''}${windowMode ? ' detached-booking-titlebar' : ''}`}
                    title={canDrag || windowMode ? 'Zum Verschieben ziehen' : undefined}
                    onPointerDown={startDrag}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                >
                    <h2>{title || '+ Buchung'}</h2>
                    <div className="booking-modal-header-actions">
                        {onDetach && (
                            <button className="btn ghost booking-modal-icon-btn" type="button" onClick={onDetach} title="In eigenes Fenster abdocken" aria-label="In eigenes Fenster abdocken">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M15 3h6v6" />
                                    <path d="M10 14 21 3" />
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                </svg>
                            </button>
                        )}
                        {windowMode ? (
                            <div onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                                <WindowControls onClose={closeModal} />
                            </div>
                        ) : (
                            <button className="btn ghost booking-modal-icon-btn booking-modal-close-btn" type="button" onClick={closeModal} onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} title="Schließen (ESC)" aria-label="Schließen">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                                </svg>
                            </button>
                        )}
                    </div>
                </header>

                {/* Unsaved changes confirmation */}
                {confirmingClose && (
                    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.55)', display: 'grid', placeItems: 'center' }}>
                        <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400, width: '90vw', padding: '24px 28px', borderRadius: 14, border: '2px solid var(--accent)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', textAlign: 'center' }}>
                            <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
                            <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700 }}>Ungespeicherte Änderungen</h3>
                            <p style={{ margin: '0 0 20px', fontSize: 13, opacity: 0.8, lineHeight: 1.5 }}>
                                Du hast Änderungen an dieser Buchung vorgenommen.<br/>Möchtest du diese wirklich verwerfen?
                            </p>
                            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                                <button type="button" className="btn" onClick={onCancelDiscard} style={{ background: 'color-mix(in oklab, var(--accent) 20%, transparent)', fontWeight: 600 }}>
                                    Fortsetzen
                                </button>
                                <button type="button" className="btn" onClick={onConfirmDiscard} style={{ background: 'color-mix(in oklab, var(--danger) 80%, transparent)', color: '#fff', fontWeight: 600 }}>
                                    Verwerfen
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                
                <form
                    className="quick-add-form"
                    onSubmit={(e) => { e.preventDefault(); if (!saveBlocked) onSave(); }}
                >
                    {/* Live Summary */}
                    <div className="card summary-card">
                        <div className="helper">Zusammenfassung</div>
                        <div className="summary-text-bold">
                            {(() => {
                                const date = fmtDate(qa.date)
                                const type = qa.type
                                const pm = qa.type === 'TRANSFER'
                                    ? `${(qa as any).transferFromAccountName || paymentAccountsById.get(Number((qa as any).transferFromAccountId || 0))?.name || paymentMethodLabel((qa as any).transferFrom)} → ${(qa as any).transferToAccountName || paymentAccountsById.get(Number((qa as any).transferToAccountId || 0))?.name || paymentMethodLabel((qa as any).transferTo)}`
                                    : ((qa as any).paymentAccountName || paymentAccountsById.get(Number((qa as any).paymentAccountId || 0))?.name || paymentMethodLabel((qa as any).paymentMethod))
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
                                    <input ref={dateInputRef} className="input" type="date" value={qa.date} onChange={(e) => setQa({ ...qa, date: e.target.value })} aria-label="Datum der Buchung" required />
                                </div>
                                <div className="field">
                                    <label>Art</label>
                                    <div className="btn-group" role="group" aria-label="Art wählen">
                                        {(['IN','OUT','TRANSFER'] as const).map(t => (
                                            <button key={t} type="button" 
                                                className={`btn ${qa.type === t ? 'btn-toggle-active' : ''} ${t === 'IN' ? 'btn-type-in' : t === 'OUT' ? 'btn-type-out' : ''}`}
                                                onClick={() => {
                                                    const newQa = { ...qa, type: t }
                                                    if (t === 'TRANSFER' && (!(newQa as any).transferFromAccountId || !(newQa as any).transferToAccountId)) {
                                                        (newQa as any).transferFromAccountId = defaultCashAccount?.id ?? null
                                                        ;(newQa as any).transferFromAccountName = defaultCashAccount?.name ?? null
                                                        ;(newQa as any).transferFrom = accountMethod(defaultCashAccount?.kind) ?? 'BAR'
                                                        ;(newQa as any).transferToAccountId = defaultBankAccount?.id ?? null
                                                        ;(newQa as any).transferToAccountName = defaultBankAccount?.name ?? null
                                                        ;(newQa as any).transferTo = accountMethod(defaultBankAccount?.kind) ?? 'BANK'
                                                        ;(newQa as any).paymentAccountId = null
                                                        ;(newQa as any).paymentAccountName = null
                                                    } else if (t !== 'TRANSFER' && !(newQa as any).paymentAccountId) {
                                                        const fallback = defaultCashAccount ?? defaultBankAccount
                                                        ;(newQa as any).paymentAccountId = fallback?.id ?? null
                                                        ;(newQa as any).paymentAccountName = fallback?.name ?? null
                                                        ;(newQa as any).paymentMethod = accountMethod(fallback?.kind) ?? (newQa as any).paymentMethod
                                                    }
                                                    setQa(newQa)
                                                }}>
                                                {t === 'IN' ? '+ IN' : t === 'OUT' ? '− OUT' : '⇄ TRANSFER'}
                                            </button>
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
                                    <div className="field field-full-width">
                                        <label>Kontotransfer <span className="req-asterisk" aria-hidden="true">*</span></label>
                                        <div className="flex gap-8">
                                            <select
                                                className="input"
                                                value={String((qa as any).transferFromAccountId ?? '')}
                                                required
                                                style={{ color: paymentAccountsById.get(Number((qa as any).transferFromAccountId || 0))?.color || undefined }}
                                                onChange={(e) => {
                                                    const nextId = e.target.value ? Number(e.target.value) : null
                                                    const nextAccount = nextId ? paymentAccountsById.get(nextId) : undefined
                                                    setQa({
                                                        ...(qa as any),
                                                        transferFromAccountId: nextId,
                                                        transferFromAccountName: nextAccount?.name ?? null,
                                                        transferFrom: accountMethod(nextAccount?.kind) ?? undefined,
                                                        paymentMethod: undefined,
                                                    } as any)
                                                }}
                                                aria-label="Transfer von Konto"
                                            >
                                                <option value="">Von Konto wählen</option>
                                                {activePaymentAccounts.map((account) => (
                                                    <option key={`from-${account.id}`} value={account.id} style={{ color: account.color || undefined }}>{account.name}</option>
                                                ))}
                                            </select>
                                            <select
                                                className="input"
                                                value={String((qa as any).transferToAccountId ?? '')}
                                                required
                                                style={{ color: paymentAccountsById.get(Number((qa as any).transferToAccountId || 0))?.color || undefined }}
                                                onChange={(e) => {
                                                    const nextId = e.target.value ? Number(e.target.value) : null
                                                    const nextAccount = nextId ? paymentAccountsById.get(nextId) : undefined
                                                    setQa({
                                                        ...(qa as any),
                                                        transferToAccountId: nextId,
                                                        transferToAccountName: nextAccount?.name ?? null,
                                                        transferTo: accountMethod(nextAccount?.kind) ?? undefined,
                                                        paymentMethod: undefined,
                                                    } as any)
                                                }}
                                                aria-label="Transfer nach Konto"
                                            >
                                                <option value="">Nach Konto wählen</option>
                                                {activePaymentAccounts.map((account) => (
                                                    <option key={`to-${account.id}`} value={account.id} style={{ color: account.color || undefined }}>{account.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="field">
                                        <label>Konto</label>
                                        <select
                                            className="input"
                                            value={String((qa as any).paymentAccountId ?? '')}
                                            required
                                            style={{ color: paymentAccountsById.get(Number((qa as any).paymentAccountId || 0))?.color || undefined }}
                                            onChange={(e) => {
                                                const nextId = e.target.value ? Number(e.target.value) : null
                                                const nextAccount = nextId ? paymentAccountsById.get(nextId) : undefined
                                                setQa({
                                                    ...(qa as any),
                                                    paymentAccountId: nextId,
                                                    paymentAccountName: nextAccount?.name ?? null,
                                                    paymentMethod: accountMethod(nextAccount?.kind) ?? undefined,
                                                } as any)
                                            }}
                                            aria-label="Buchungskonto wählen"
                                        >
                                            <option value="">Konto wählen</option>
                                            {activePaymentAccounts.map((account) => (
                                                <option key={account.id} value={account.id} style={{ color: account.color || undefined }}>{account.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Block B – Finanzdetails */}
                        <div className="card form-card card-finance" style={{ '--booking-account-color': financeAccountColor || 'var(--accent)' } as React.CSSProperties}>
                            <div className="helper helper-mb">Finanzen</div>
                            <div className="row">
                                {qa.type === 'TRANSFER' ? (
                                    <div className="field field-full-width finance-amount-highlight">
                                        <label>
                                            Betrag (Transfer) <span className="req-asterisk" aria-hidden="true">*</span>
                                            {hasInvalidAmount && <span className="booking-field-error has-tooltip" data-tooltip={amountError} tabIndex={0}>!</span>}
                                        </label>
                                        <span className="adorn-wrap">
                                            <input ref={amountInputRef} className={`input input-transfer ${hasInvalidAmount ? 'input-error' : ''}`} type="number" step="0.01" value={(qa as any).grossAmount ?? ''}
                                                onChange={(e) => {
                                                    const v = Number(e.target.value)
                                                    setQa({ ...qa, grossAmount: v })
                                                }}
                                                aria-label="Transfer-Betrag"
                                                aria-invalid={hasInvalidAmount} />
                                            <span className="adorn-suffix">€</span>
                                        </span>
                                        <div className="helper">Transfers sind umsatzsteuerneutral.</div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="field finance-amount-highlight">
                                            <label>
                                                {(qa as any).mode === 'GROSS' ? 'Brutto' : 'Netto'} <span className="req-asterisk" aria-hidden="true">*</span>
                                                {hasInvalidAmount && <span className="booking-field-error has-tooltip" data-tooltip={amountError} tabIndex={0}>!</span>}
                                            </label>
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
                                                    <input ref={amountInputRef} className={`input ${hasInvalidAmount ? 'input-error' : ''}`} type="number" step="0.01" value={(qa as any).mode === 'GROSS' ? (qa as any).grossAmount ?? '' : qa.netAmount}
                                                        onChange={(e) => {
                                                            const v = Number(e.target.value)
                                                            if ((qa as any).mode === 'GROSS') setQa({ ...qa, grossAmount: v })
                                                            else setQa({ ...qa, netAmount: v })
                                                        }}
                                                        aria-label={(qa as any).mode === 'GROSS' ? 'Brutto-Betrag' : 'Netto-Betrag'}
                                                        aria-invalid={hasInvalidAmount} />
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
                                    <div className="quick-add-assignment-title">
                                        Budget
                                        {hasAvailableBudgets ? (
                                            <button
                                                type="button"
                                                className="btn ghost"
                                                style={{ padding: '2px 6px', fontSize: '0.85rem' }}
                                                onClick={addBudgetAssignment}
                                                title="Weiteres Budget hinzufügen"
                                            >
                                                +
                                            </button>
                                        ) : (
                                            <span className="helper" style={{ fontWeight: 400 }}>Kein Budget vorhanden</span>
                                        )}
                                    </div>
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
                                                                    const activeIds = new Set(availableBudgets.map((b: any) => b.id))
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
                                                                            {availableBudgets.map((b: any) => {
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
                                            <div className="helper" style={{ fontStyle: 'italic', opacity: 0.7 }}>
                                                {hasAvailableBudgets ? 'Kein Budget zugeordnet. Klicke + zum Hinzufügen.' : 'Kein Budget vorhanden.'}
                                            </div>
                                        )
                                    })()}
                                </div>
                            </div>

                            {/* Zweckbindung Zuordnungen (mehrfach möglich) */}
                            <div className="row">
                                <div className="field" style={{ gridColumn: '1 / -1' }}>
                                    <div className="quick-add-assignment-title">
                                        Zweckbindung
                                        {hasAvailableEarmarks ? (
                                            <button
                                                type="button"
                                                className="btn ghost"
                                                style={{ padding: '2px 6px', fontSize: '0.85rem' }}
                                                onClick={addEarmarkAssignment}
                                                title="Weitere Zweckbindung hinzufügen"
                                            >
                                                +
                                            </button>
                                        ) : (
                                            <span className="helper" style={{ fontWeight: 400 }}>Keine Zweckbindung vorhanden</span>
                                        )}
                                    </div>
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
                                            <div className="helper" style={{ fontStyle: 'italic', opacity: 0.7 }}>
                                                {hasAvailableEarmarks ? 'Keine Zweckbindung zugeordnet. Klicke + zum Hinzufügen.' : 'Keine Zweckbindung vorhanden.'}
                                            </div>
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
                                    <input ref={descriptionInputRef} className="input" list="desc-suggestions" value={qa.description} onChange={(e) => setQa({ ...qa, description: e.target.value })} placeholder="z. B. Mitgliedsbeitrag, Spende …" />
                                    <datalist id="desc-suggestions">
                                        {descSuggest.map((d, i) => (<option key={i} value={d} />))}
                                    </datalist>
                                </div>
                                <TagsEditor
                                    label="Tags"
                                    value={(qa as any).tags || []}
                                    onChange={(tags) => setQa({ ...(qa as any), tags } as any)}
                                    tagDefs={tagDefs}
                                    inputRef={tagsInputRef}
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
                                    {hasAnyAttachment && <div className="helper">Dateien hierher ziehen</div>}
                                </div>
                                <div className="flex-gap-8">
                                    <input ref={fileInputRef} type="file" multiple hidden accept=".png,.jpg,.jpeg,.pdf,.doc,.docx" onChange={(e) => onDropFiles(e.target.files)} />
                                    <button type="button" className="btn" onClick={openFilePicker}>
                                        + Datei(en)
                                    </button>
                                    {files.length > 0 && (
                                        <button type="button" className="btn" onClick={() => setFiles([])}>Leeren</button>
                                    )}
                                </div>
                            </div>
                            {existingFilesLoading ? (
                                <div className="helper" style={{ marginTop: 8 }}>Lade ...</div>
                            ) : hasAnyAttachment ? (
                                <ul className="file-list">
                                    {existingFiles.map((f) => (
                                        <li key={`existing-${f.id}`} className="file-list-item">
                                            <span className="file-name">{f.fileName}</span>
                                            <div className="flex-gap-8">
                                                {onOpenExistingFile && (
                                                    <button type="button" className="btn" onClick={() => { void onOpenExistingFile(f.id) }}>Öffnen</button>
                                                )}
                                                {onDownloadExistingFile && (
                                                    <button type="button" className="btn" onClick={() => { void onDownloadExistingFile(f.id) }}>Speichern</button>
                                                )}
                                                {onDeleteExistingFile && (
                                                    <button type="button" className="btn danger" title="Löschen" onClick={() => { void onDeleteExistingFile(f) }}>Löschen</button>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                    {files.map((f, i) => (
                                        <li key={`new-${i}-${f.name}`} className="file-list-item">
                                            <span className="file-name">{f.name}</span>
                                            <div className="flex-gap-8">
                                                <span className="helper">neu</span>
                                                <button type="button" className="btn" onClick={() => setFiles(files.filter((_, idx) => idx !== i))}>Entfernen</button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="quick-add-dropzone" onClick={openFilePicker}>
                                    <div className="quick-add-dropzone__icon">📎</div>
                                    <div className="helper">Dateien hierher ziehen oder klicken</div>
                                </div>
                            )}
                        </div>
                    </div>
                    
                    <div className="modal-footer-actions">
                        <div>
                            {footerLeft}
                            {!footerLeft && <div className="helper">{footerHint || 'Ctrl+S = Speichern · Ctrl+U = Datei hinzufügen · Esc = Abbrechen'}</div>}
                        </div>
                        <div className="booking-modal-save-actions" onBlur={(e) => {
                            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSaveMenuOpen(false)
                        }}>
                            {showSaveMenu ? (
                                <div className="booking-split-save">
                                    <button
                                        type="submit"
                                        className="btn primary booking-split-save__main"
                                        disabled={saveBlocked}
                                    >
                                        {defaultSaveLabel}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn primary booking-split-save__arrow"
                                        disabled={saveBlocked}
                                        aria-label="Weitere Speicheraktionen"
                                        aria-haspopup="menu"
                                        aria-expanded={saveMenuOpen}
                                        onClick={() => setSaveMenuOpen((open) => !open)}
                                    >
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                            <path d="M7 10l5 5 5-5H7z" />
                                        </svg>
                                    </button>
                                    {saveMenuOpen && (
                                        <div className="booking-split-save__menu" role="menu">
                                            <button type="button" role="menuitem" onClick={() => { setSaveMenuOpen(false); saveAndClose() }}>
                                                Speichern & schließen
                                            </button>
                                            <button type="button" role="menuitem" onClick={() => { setSaveMenuOpen(false); saveAndNew() }}>
                                                Speichern & neu
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <button
                                    type="submit"
                                    className="btn primary"
                                    disabled={saveBlocked}
                                >
                                    {defaultSaveLabel}
                                </button>
                            )}
                        </div>
                    </div>
                </form>
            </div>
        </div>
    )
}
