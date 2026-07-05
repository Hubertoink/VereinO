import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import FilterTotals from './components/FilterTotals'
import JournalTable from './components/JournalTable'
import VoucherInfoModal from '../../components/modals/VoucherInfoModal'
import TagsEditor from '../../components/TagsEditor'
import { BatchAssignDropdown, FilterDropdown, MetaFilterDropdown, TimeFilterDropdown } from '../../components/dropdowns'
import { getEffectiveJournalCols, getEffectiveJournalOrder } from './utils/journalColumnVisibility'
import {
    getDetailsJournalColumnPreset,
    getMinimalJournalColumnPreset,
    getStandardJournalColumnPreset
} from './utils/journalColumnPresets'
import { buildVoucherUpdatePayloadFromEditRow, serializeEditRow } from './utils/journalEditState'
import { shouldPromptDiscardForEdit } from './utils/journalEditDiscardPrompt'
import { getInternalAssignmentValidationState } from '../../components/modals/voucherMetaValidation'
import {
    DEFAULT_ORDER as SHARED_DEFAULT_ORDER,
    LABEL_FOR_COL,
    type BookingEditTab as SharedBookingEditTab,
    type BudgetAssignment,
    type ColKey as SharedColKey,
    type EarmarkAssignment,
    type EditVoucherRow as SharedEditVoucherRow,
    type VoucherRow
} from './types'

type EditVoucherRow = SharedEditVoucherRow

type BookingEditTab = SharedBookingEditTab

type ColKey = SharedColKey

const DEFAULT_ORDER: ColKey[] = SHARED_DEFAULT_ORDER

type PageShortcutAction = {
    id: string
    key: string
    label: string
    action: () => void
}

interface JournalViewProps {
    registerPageShortcuts?: (shortcuts: PageShortcutAction[]) => void
    // Props die von App.tsx kommen
    flashId: number | null
    setFlashId: (id: number | null | ((prev: number | null) => number | null)) => void
    periodLock: { closedUntil: string | null } | null
    refreshKey: number
    notify: (type: 'info' | 'success' | 'error', text: string, duration?: number, action?: { label: string; onClick: () => void }) => void
    bumpDataVersion: () => void
    fmtDate: (d: string) => string
    setActivePage: (page: 'Dashboard' | 'Buchungen' | 'Zweckbindungen' | 'Budgets' | 'Reports' | 'Belege' | 'Verbindlichkeiten' | 'Mitglieder' | 'Einstellungen') => void
    // Deprecated (kept for compatibility): dropdowns are now inline
    setShowTimeFilter?: (show: boolean) => void
    setShowMetaFilter?: (show: boolean) => void
    yearsAvail: number[]
    budgets: Array<{ id: number; year: number; name?: string | null; categoryName?: string | null; projectName?: string | null; color?: string | null }>
    // Shared global state
    earmarks: Array<{ id: number; code: string; name: string; color?: string | null }>
    paymentAccounts: Array<{ id: number; name: string; kind: 'CASH' | 'BANK' | 'PAYPAL' | 'CARD' | 'OTHER'; iban?: string | null; color?: string | null; sortOrder: number; isActive: number }>
    tagDefs: Array<{ id: number; name: string; color?: string | null; usage?: number }>
    budgetsForEdit: Array<{ id: number; label: string; year?: number; startDate?: string | null; endDate?: string | null; enforceTimeRange?: number; isArchived?: number; color?: string | null }>
    budgetNames: Map<number, string>
    // Helpers
    eurFmt: Intl.NumberFormat
    friendlyError: (e: any) => string
    bufferToBase64Safe: (buf: ArrayBuffer) => string
    // Settings from App
    journalLimit: number
    setJournalLimit: (n: number) => void
    dateFmt: 'ISO' | 'PRETTY' | 'DOT'
    // Column visibility & order (shared with Settings)
    cols: Record<ColKey, boolean>
    setCols: (cols: Record<ColKey, boolean>) => void
    order: ColKey[]
    setOrder: (order: ColKey[]) => void
    // Filter states from App
    from?: string
    to?: string
    filterSphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB' | null
    filterType?: 'IN' | 'OUT' | 'TRANSFER' | 'INTERNAL' | null
    filterPM?: 'BAR' | 'BANK' | null
    filterPaymentAccountId?: number | null
    filterEarmark?: number | null
    filterBudgetId?: number | null
    filterTag?: string | null
    q?: string
    setFrom?: (v: string) => void
    setTo?: (v: string) => void
    setFilterSphere?: (v: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB' | null) => void
    setFilterType?: (v: 'IN' | 'OUT' | 'TRANSFER' | 'INTERNAL' | null) => void
    setFilterPM?: (v: 'BAR' | 'BANK' | null) => void
    setFilterPaymentAccountId?: (v: number | null) => void
    setFilterEarmark?: (v: number | null) => void
    setFilterBudgetId?: (v: number | null) => void
    setFilterTag?: (v: string | null) => void
    setQ?: (v: string) => void
    page?: number
    setPage?: (v: number) => void
    showBookingDraftTabs?: boolean
    bookingDraftTabs?: Array<{ id: string; label: string; title: string; isActive: boolean; isDetached?: boolean }>
    onOpenBookingDraft?: (draftId: string) => void
    onCloseBookingDraft?: (draftId: string) => void
    showBookingEditTabs?: boolean
    bookingsOpenDetached?: boolean
    allowVoucherDeletion?: boolean
    onOpenVoucherAttachments?: (voucher: { voucherId: number; voucherNo: string; date: string; description: string }) => void
}

export default function JournalView({
    flashId,
    setFlashId,
    registerPageShortcuts,
    periodLock,
    refreshKey,
    notify,
    bumpDataVersion,
    fmtDate,
    setActivePage,
    setShowTimeFilter: _setShowTimeFilter,
    setShowMetaFilter: _setShowMetaFilter,
    yearsAvail,
    budgets,
    earmarks,
    paymentAccounts,
    tagDefs,
    budgetsForEdit,
    budgetNames,
    eurFmt,
    friendlyError,
    bufferToBase64Safe,
    journalLimit: journalLimitProp,
    setJournalLimit: setJournalLimitProp,
    dateFmt,
    // Column visibility & order from App
    cols,
    setCols,
    order,
    setOrder,
    // Filter props from App
    from: fromProp,
    to: toProp,
    filterSphere: filterSphereProp,
    filterType: filterTypeProp,
    filterPM: filterPMProp,
    filterPaymentAccountId: filterPaymentAccountIdProp,
    filterEarmark: filterEarmarkProp,
    filterBudgetId: filterBudgetIdProp,
    filterTag: filterTagProp,
    q: qProp,
    setFrom: setFromProp,
    setTo: setToProp,
    setFilterSphere: setFilterSphereProp,
    setFilterType: setFilterTypeProp,
    setFilterPM: setFilterPMProp,
    setFilterPaymentAccountId: setFilterPaymentAccountIdProp,
    setFilterEarmark: setFilterEarmarkProp,
    setFilterBudgetId: setFilterBudgetIdProp,
    setFilterTag: setFilterTagProp,
    setQ: setQProp,
    page: pageProp,
    setPage: setPageProp,
    showBookingDraftTabs = false,
    bookingDraftTabs = [],
    onOpenBookingDraft,
    onCloseBookingDraft,
    showBookingEditTabs = false,
    bookingsOpenDetached = false,
    allowVoucherDeletion = false,
    onOpenVoucherAttachments
}: JournalViewProps) {
    const paymentMethodLabel = useCallback((method?: 'BAR' | 'BANK' | null) => {
        if (method === 'BAR') return 'Bar'
        if (method === 'BANK') return 'Bank'
        return '—'
    }, [])

    const paymentAccountsById = useMemo(
        () => new Map((paymentAccounts || []).map((account) => [account.id, account])),
        [paymentAccounts]
    )
    const activePaymentAccounts = useMemo(
        () => (paymentAccounts || []).filter((account) => account.isActive !== 0),
        [paymentAccounts]
    )
    const defaultCashAccount = useMemo(
        () => activePaymentAccounts.find((account) => account.kind === 'CASH') ?? activePaymentAccounts[0] ?? null,
        [activePaymentAccounts]
    )
    const defaultBankAccount = useMemo(
        () => activePaymentAccounts.find((account) => account.kind === 'BANK')
            ?? activePaymentAccounts.find((account) => account.id !== defaultCashAccount?.id)
            ?? activePaymentAccounts[0]
            ?? null,
        [activePaymentAccounts, defaultCashAccount]
    )

    // ==================== STATE ====================
    // Pagination & Sorting
    const [rows, setRows] = useState<VoucherRow[]>([])
    const [totalRows, setTotalRows] = useState<number>(0)
    const [stornoPairIds, setStornoPairIds] = useState<[number, number] | null>(null)
    const voucherTooltipCache = useRef(new Map<number, VoucherRow>())
    const [page, setPage] = useState<number>(() => {
        try { return Number(localStorage.getItem('journal.page') || '1') }
        catch { return 1 }
    })
    const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>(() => {
        try { return (localStorage.getItem('journal.sortDir') as any) || 'DESC' }
        catch { return 'DESC' }
    })
    const [sortBy, setSortBy] = useState<'date' | 'gross' | 'net' | 'budget' | 'earmark' | 'payment' | 'sphere'>(() => {
        try { return (localStorage.getItem('journal.sortBy') as any) || 'date' }
        catch { return 'date' }
    })

    // Nutze journalLimit aus Props (von Settings)
    const journalLimit = journalLimitProp

    // Filter states - use from props if available, otherwise local state
    const [from, setFrom] = useState<string>('')
    const [to, setTo] = useState<string>('')
    const [filterSphere, setFilterSphere] = useState<'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB' | null>(null)
    const [filterType, setFilterType] = useState<'IN' | 'OUT' | 'TRANSFER' | 'INTERNAL' | null>(null)
    const [filterPM, setFilterPM] = useState<'BAR' | 'BANK' | null>(null)
    const [filterPaymentAccountId, setFilterPaymentAccountId] = useState<number | null>(null)
    const [filterEarmark, setFilterEarmark] = useState<number | null>(null)
    const [filterBudgetId, setFilterBudgetId] = useState<number | null>(null)
    const [filterTag, setFilterTag] = useState<string | null>(null)
    const [q, setQ] = useState<string>('')

    // Use props if provided, otherwise use local state
    const activeFrom = fromProp !== undefined ? fromProp : from
    const activeTo = toProp !== undefined ? toProp : to
    const activeFilterSphere = filterSphereProp !== undefined ? filterSphereProp : filterSphere
    const activeFilterType = filterTypeProp !== undefined ? filterTypeProp : filterType
    const activeFilterPM = filterPMProp !== undefined ? filterPMProp : filterPM
    const activeFilterPaymentAccountId = filterPaymentAccountIdProp !== undefined ? filterPaymentAccountIdProp : filterPaymentAccountId
    const activeFilterEarmark = filterEarmarkProp !== undefined ? filterEarmarkProp : filterEarmark
    const activeFilterBudgetId = filterBudgetIdProp !== undefined ? filterBudgetIdProp : filterBudgetId
    const activeFilterTag = filterTagProp !== undefined ? filterTagProp : filterTag
    const activeQ = qProp !== undefined ? qProp : q
    const activePage = pageProp !== undefined ? pageProp : page

    // Setters that use props if available
    const activeSetFrom = setFromProp || setFrom
    const activeSetTo = setToProp || setTo
    const activeSetFilterSphere = setFilterSphereProp || setFilterSphere
    const activeSetFilterType = setFilterTypeProp || setFilterType
    const activeSetFilterPM = setFilterPMProp || setFilterPM
    const activeSetFilterPaymentAccountId = setFilterPaymentAccountIdProp || setFilterPaymentAccountId
    const activeSetFilterEarmark = setFilterEarmarkProp || setFilterEarmark
    const activeSetFilterBudgetId = setFilterBudgetIdProp || setFilterBudgetId
    const activeSetFilterTag = setFilterTagProp || setFilterTag
    const activeSetQ = setQProp || setQ
    const activeSetPage = setPageProp || setPage

    // Column preferences now come from props (shared with Settings)

    const hasCustomCols = useMemo(() => Object.values(cols).some((v) => v === false), [cols])
    const hasCustomOrder = useMemo(() => {
        if (order.length !== DEFAULT_ORDER.length) return true
        return order.some((k, idx) => k !== DEFAULT_ORDER[idx])
    }, [order])

    // Drag-and-drop state for column reorder
    const [draggedCol, setDraggedCol] = useState<ColKey | null>(null)
    const [dropTarget, setDropTarget] = useState<number | null>(null)

    const moveCol = useCallback(
        (col: ColKey, toIndex: number) => {
            const fromIndex = order.indexOf(col)
            if (fromIndex === -1 || fromIndex === toIndex || fromIndex === toIndex - 1) return
            const next = order.filter((c) => c !== col)
            // Wenn wir nach unten verschieben, müssen wir den Index anpassen
            const insertAt = toIndex > fromIndex ? toIndex - 1 : toIndex
            next.splice(insertAt, 0, col)
            setOrder(next)
        },
        [order, setOrder]
    )

    const presetStandard = useCallback(() => {
        const preset = getStandardJournalColumnPreset(allowVoucherDeletion)
        setCols(preset.cols)
        setOrder(preset.order)
    }, [allowVoucherDeletion, setCols, setOrder])

    const presetMinimal = useCallback(() => {
        const preset = getMinimalJournalColumnPreset(allowVoucherDeletion)
        setCols(preset.cols)
        setOrder(preset.order)
    }, [allowVoucherDeletion, setCols, setOrder])

    const presetDetails = useCallback(() => {
        const preset = getDetailsJournalColumnPreset(allowVoucherDeletion)
        setCols(preset.cols)
        setOrder(preset.order)
    }, [allowVoucherDeletion, setCols, setOrder])

    // Modal states
    const [infoVoucher, setInfoVoucher] = useState<VoucherRow | null>(null)
    const [editRow, setEditRowState] = useState<EditVoucherRow | null>(null)
    const [bookingEditTabs, setBookingEditTabs] = useState<BookingEditTab[]>([])
    const [activeEditTabId, setActiveEditTabId] = useState<string | null>(null)
    const [deleteRow, setDeleteRow] = useState<null | { id: number; voucherNo?: string | null; description?: string | null; fromEdit?: boolean }>(null)
    const editFileInputRef = useRef<HTMLInputElement | null>(null)
    const searchInputRef = useRef<HTMLInputElement | null>(null)
    const timeFilterRef = useRef<HTMLDivElement | null>(null)
    const metaFilterRef = useRef<HTMLDivElement | null>(null)
    const columnsFilterRef = useRef<HTMLDivElement | null>(null)
    const batchAssignRef = useRef<HTMLDivElement | null>(null)
    const [editRowFilesLoading, setEditRowFilesLoading] = useState<boolean>(false)
    const [editRowFiles, setEditRowFiles] = useState<Array<{ id: number; fileName: string }>>([])
    const [confirmDeleteAttachment, setConfirmDeleteAttachment] = useState<null | { id: number; fileName: string; voucherId: number }>(null)
    const [confirmDiscardEdit, setConfirmDiscardEdit] = useState(false)
    const [editRowInitialSnapshot, setEditRowInitialSnapshot] = useState<string | null>(null)

    const journalCols = useMemo(() => getEffectiveJournalCols(cols, allowVoucherDeletion), [allowVoucherDeletion, cols])

    const journalOrder = useMemo(() => getEffectiveJournalOrder(order, allowVoucherDeletion), [allowVoucherDeletion, order])

    const setEditRow = useCallback((next: React.SetStateAction<EditVoucherRow | null>) => {
        setEditRowState((prev) => {
            const resolved = typeof next === 'function'
                ? (next as (prev: EditVoucherRow | null) => EditVoucherRow | null)(prev)
                : next

            if (showBookingEditTabs && activeEditTabId) {
                setBookingEditTabs((tabs) => {
                    if (!resolved) return tabs.filter((tab) => tab.id !== activeEditTabId)
                    return tabs.map((tab) => tab.id === activeEditTabId ? { ...tab, row: resolved } : tab)
                })
            }

            return resolved
        })
    }, [activeEditTabId, showBookingEditTabs])

    const editHasUnsavedChanges = useMemo(() => {
        if (!editRow || !editRowInitialSnapshot) return false
        const current = serializeEditRow(editRow)
        return current !== editRowInitialSnapshot
    }, [editRow, editRowInitialSnapshot, serializeEditRow])

    const voucherMutationBlockReason = useCallback((row: Partial<VoucherRow> | null | undefined) => {
        if (!row) return ''
        if (row.originalId) {
            const ref = row.originalVoucherNo ? ` #${row.originalVoucherNo}` : ''
            return `Diese Stornobuchung ist mit der Originalbuchung${ref} verknüpft und kann nicht bearbeitet oder erneut storniert werden.`
        }
        if (row.reversedById) {
            const ref = row.reversedByVoucherNo ? ` #${row.reversedByVoucherNo}` : ''
            return `Diese Buchung wurde bereits storniert${ref ? ` durch${ref}` : ''} und kann nicht mehr bearbeitet werden.`
        }
        return ''
    }, [])

    const hasActiveFilters = useMemo(() => {
        return Boolean(stornoPairIds || activeFilterType || activeFilterPM || activeFilterPaymentAccountId || activeFilterTag || activeFilterSphere || activeFilterEarmark || activeFilterBudgetId || activeFrom || activeTo || activeQ.trim())
    }, [activeFilterBudgetId, activeFilterEarmark, activeFilterPM, activeFilterPaymentAccountId, activeFilterSphere, activeFilterTag, activeFilterType, activeFrom, activeQ, activeTo, stornoPairIds])

    const resetAllFilters = useCallback(() => {
        activeSetFilterType(null)
        activeSetFilterPM(null)
        activeSetFilterPaymentAccountId(null)
        activeSetFilterTag(null)
        activeSetFilterSphere(null)
        activeSetFilterEarmark(null)
        activeSetFilterBudgetId(null)
        activeSetFrom('')
        activeSetTo('')
        activeSetQ('')
        setStornoPairIds(null)
        activeSetPage(1)
    }, [activeSetFilterBudgetId, activeSetFilterEarmark, activeSetFilterPM, activeSetFilterPaymentAccountId, activeSetFilterSphere, activeSetFilterTag, activeSetFilterType, activeSetFrom, activeSetPage, activeSetQ, activeSetTo])

    const clickShortcutTrigger = useCallback((container: HTMLDivElement | null) => {
        const button = container?.querySelector('button') as HTMLButtonElement | null
        if (!button) return
        button.click()
        button.focus()
    }, [])

    const journalPageShortcuts = useMemo<PageShortcutAction[]>(() => {
        const shortcuts: PageShortcutAction[] = [
            {
                id: 'journal-search',
                key: 's',
                label: 'Suche',
                action: () => {
                    searchInputRef.current?.focus()
                    searchInputRef.current?.select()
                }
            },
            {
                id: 'journal-time-filter',
                key: 't',
                label: 'Zeitraum',
                action: () => clickShortcutTrigger(timeFilterRef.current)
            },
            {
                id: 'journal-meta-filter',
                key: 'f',
                label: 'Filter',
                action: () => clickShortcutTrigger(metaFilterRef.current)
            },
            {
                id: 'journal-columns',
                key: 'c',
                label: 'Spalten',
                action: () => clickShortcutTrigger(columnsFilterRef.current)
            },
            {
                id: 'journal-batch-assign',
                key: 'a',
                label: 'Batch',
                action: () => clickShortcutTrigger(batchAssignRef.current)
            }
        ]

        if (hasActiveFilters) {
            shortcuts.push({
                id: 'journal-reset-filters',
                key: 'x',
                label: 'Reset',
                action: resetAllFilters
            })
        }

        return shortcuts
    }, [clickShortcutTrigger, hasActiveFilters, resetAllFilters])

    useEffect(() => {
        if (!registerPageShortcuts) return
        registerPageShortcuts(journalPageShortcuts)
    }, [journalPageShortcuts, registerPageShortcuts])

    useEffect(() => {
        if (!registerPageShortcuts) return
        return () => registerPageShortcuts([])
    }, [registerPageShortcuts])

    const activateBookingEditTab = useCallback((tab: BookingEditTab) => {
        setActiveEditTabId(tab.id)
        setEditRowState(tab.row)
        setEditRowInitialSnapshot(tab.initialSnapshot)
        setConfirmDiscardEdit(false)
    }, [])

    const openEditRow = useCallback((row: EditVoucherRow) => {
        const snapshot = serializeEditRow(row) || ''

        if (!showBookingEditTabs) {
            setActiveEditTabId(null)
            setConfirmDiscardEdit(false)
            setEditRowInitialSnapshot(snapshot)
            setEditRowState(row)
            return
        }

        const tabId = `edit-${row.id}`
        const existing = bookingEditTabs.find((tab) => tab.id === tabId)
        if (existing) {
            if (existing.detached) {
                setActiveEditTabId(existing.id)
                setEditRowInitialSnapshot(existing.initialSnapshot)
                setEditRowState(null)
                setConfirmDiscardEdit(false)
                void window.api?.quickAdd?.focusDetached?.({ draftId: existing.id })
                return
            }
            activateBookingEditTab(existing)
            return
        }

        const tab = { id: tabId, row, initialSnapshot: snapshot, detached: false }
        setBookingEditTabs((tabs) => [...tabs, tab])
        activateBookingEditTab(tab)
    }, [activateBookingEditTab, bookingEditTabs, serializeEditRow, showBookingEditTabs])

    const closeEditModalNow = useCallback(() => {
        setConfirmDiscardEdit(false)

        if (showBookingEditTabs && activeEditTabId) {
            setActiveEditTabId(null)
            setEditRowInitialSnapshot(null)
            setEditRowState(null)
            return
        }

        setActiveEditTabId(null)
        setEditRowInitialSnapshot(null)
        setEditRowState(null)
    }, [activeEditTabId, showBookingEditTabs])

    const requestCloseEditModal = useCallback(() => {
        if (showBookingEditTabs && activeEditTabId) {
            closeEditModalNow()
            return
        }
        if (shouldPromptDiscardForEdit({ showBookingEditTabs, hasUnsavedChanges: Boolean(editRow && editHasUnsavedChanges) })) {
            setConfirmDiscardEdit(true)
            return
        }
        closeEditModalNow()
    }, [activeEditTabId, closeEditModalNow, editHasUnsavedChanges, editRow, showBookingEditTabs])

    const closeBookingEditTab = useCallback((tabId: string) => {
        const target = bookingEditTabs.find((tab) => tab.id === tabId)
        if (!target) return

        if (target.detached) {
            void window.api?.quickAdd?.closeDetached?.({ draftId: tabId })
            const remaining = bookingEditTabs.filter((tab) => tab.id !== tabId)
            setBookingEditTabs(remaining)
            if (activeEditTabId === tabId) {
                const nextTab = remaining.at(-1) ?? null
                setActiveEditTabId(nextTab?.id ?? null)
                setEditRowInitialSnapshot(nextTab?.initialSnapshot ?? null)
                setEditRowState(nextTab?.detached ? null : (nextTab?.row ?? null))
            }
            setConfirmDiscardEdit(false)
            return
        }

        const targetHasUnsavedChanges = serializeEditRow(target.row) !== target.initialSnapshot
        if (targetHasUnsavedChanges) {
            activateBookingEditTab(target)
            setConfirmDiscardEdit(true)
            return
        }

        const remaining = bookingEditTabs.filter((tab) => tab.id !== tabId)
        setBookingEditTabs(remaining)

        if (activeEditTabId === tabId) {
            const nextTab = remaining.at(-1) ?? null
            setActiveEditTabId(nextTab?.id ?? null)
            setEditRowInitialSnapshot(nextTab?.initialSnapshot ?? null)
            setEditRowState(nextTab?.row ?? null)
        }
    }, [activateBookingEditTab, activeEditTabId, bookingEditTabs, serializeEditRow])

    const openDetachedEdit = useCallback(async (
        row: EditVoucherRow,
        closeInline = false
    ) => {
        const blockReason = voucherMutationBlockReason(row)
        if (blockReason) {
            notify('info', blockReason)
            return false
        }
        const draftId = `edit-${row.id}`
        const snapshot = serializeEditRow(row) || ''
        try {
            const res = await window.api?.quickAdd?.openDetached?.({
                mode: 'edit',
                draftId,
                voucherId: row.id,
                qa: row,
                files: []
            })
            if (!res?.ok) {
                notify('error', res?.error || 'Buchungsfenster konnte nicht geöffnet werden.')
                return false
            }
            if (showBookingEditTabs) {
                setBookingEditTabs((tabs) => {
                    const nextTab: BookingEditTab = { id: draftId, row, initialSnapshot: snapshot, detached: true }
                    const existingIndex = tabs.findIndex((tab) => tab.id === draftId)
                    if (existingIndex >= 0) return tabs.map((tab) => tab.id === draftId ? nextTab : tab)
                    return [...tabs, nextTab]
                })
                setActiveEditTabId(draftId)
                setEditRowInitialSnapshot(snapshot)
                setEditRowState(null)
                setConfirmDiscardEdit(false)
            } else if (closeInline) {
                closeEditModalNow()
            }
            return true
        } catch (e: any) {
            notify('error', 'Buchungsfenster konnte nicht geöffnet werden: ' + String(e?.message || e))
            return false
        }
    }, [closeEditModalNow, notify, serializeEditRow, showBookingEditTabs, voucherMutationBlockReason])

    const openVoucherDetails = useCallback(async (row: VoucherRow) => {
        if (!bookingsOpenDetached) {
            setInfoVoucher(row)
            return
        }
        try {
            const res = await window.api?.quickAdd?.openDetached?.({
                mode: 'details',
                draftId: `details-${row.id}-${Date.now()}`,
                voucherId: row.id,
                voucher: row
            })
            if (!res?.ok) {
                notify('error', res?.error || 'Buchungsdetails konnten nicht im Fenster geöffnet werden.')
                return
            }
        } catch (e: any) {
            notify('error', 'Buchungsdetails konnten nicht geöffnet werden: ' + String(e?.message || e))
        }
    }, [bookingsOpenDetached, notify])

    const openBookingEditTab = useCallback(async (tab: BookingEditTab) => {
        if (!tab.detached) {
            activateBookingEditTab(tab)
            return
        }

        setActiveEditTabId(tab.id)
        setEditRowInitialSnapshot(tab.initialSnapshot)
        setEditRowState(null)
        setConfirmDiscardEdit(false)

        const focusResult = await window.api?.quickAdd?.focusDetached?.({ draftId: tab.id })
        if (focusResult?.ok) return

        // The user may have closed the detached window while its tab remains open.
        // Recreate it from the tab state instead of leaving the tab unresponsive.
        await openDetachedEdit(tab.row)
    }, [activateBookingEditTab, openDetachedEdit])

    useEffect(() => {
        const off = window.api?.quickAdd?.onSaved?.((payload: any) => {
            const draftId = typeof payload?.draftId === 'string' ? payload.draftId : ''
            if (payload?.mode === 'details' || draftId.startsWith('details-')) {
                void loadRecent()
                window.dispatchEvent(new Event('data-changed'))
                return
            }
            if (!draftId.startsWith('edit-')) return

            setBookingEditTabs((tabs) => {
                const remaining = tabs.filter((tab) => tab.id !== draftId)
                if (remaining.length === tabs.length) return tabs

                setActiveEditTabId((current) => {
                    if (current !== draftId) return current
                    const nextTab = remaining.at(-1) ?? null
                    setEditRowInitialSnapshot(nextTab?.initialSnapshot ?? null)
                    setEditRowState(nextTab?.detached ? null : (nextTab?.row ?? null))
                    setConfirmDiscardEdit(false)
                    return nextTab?.id ?? null
                })

                return remaining
            })
        })
        return () => { if (typeof off === 'function') off() }
    }, [])

    // ==================== FILTER CHIPS ====================
    const chips = useMemo(() => {
        const list: Array<{ key: string; label: string; clear: () => void; color?: string | null }> = []
        if (activeFrom || activeTo) list.push({ key: 'range', label: `${activeFrom || '…'} – ${activeTo || '…'}`, clear: () => { activeSetFrom(''); activeSetTo('') } })
        if (activeFilterSphere) list.push({ key: 'sphere', label: `Sphäre: ${activeFilterSphere}`, clear: () => activeSetFilterSphere(null) })
        if (activeFilterType) list.push({ key: 'type', label: `Art: ${activeFilterType}`, clear: () => activeSetFilterType(null) })
        if (activeFilterPaymentAccountId != null) {
            const account = paymentAccountsById.get(Number(activeFilterPaymentAccountId))
            list.push({ key: 'payment-account', label: `Zahlweg: ${account?.name || `#${activeFilterPaymentAccountId}`}`, clear: () => activeSetFilterPaymentAccountId(null), color: account?.color })
        } else if (activeFilterPM) list.push({ key: 'pm', label: `Zahlweg: ${activeFilterPM}`, clear: () => activeSetFilterPM(null) })
        if (activeFilterEarmark != null) {
            const em = earmarks.find(e => e.id === activeFilterEarmark)
            list.push({ key: 'earmark', label: `Zweckbindung: ${em ? em.code : '#' + activeFilterEarmark}`, clear: () => activeSetFilterEarmark(null), color: em?.color })
        }
        if (activeFilterBudgetId != null) {
            const normalizedBudgetId = Number(activeFilterBudgetId)
            const budgetItem = budgets.find(b => Number(b.id) === normalizedBudgetId)
            const label =
                budgetNames.get(normalizedBudgetId) ||
                ((budgetItem?.name && budgetItem.name.trim()) || budgetItem?.categoryName || budgetItem?.projectName ||
                    (budgetItem ? String(budgetItem.year) : `#${normalizedBudgetId}`))
            list.push({ key: 'budget', label: `Budget: ${label}`, clear: () => activeSetFilterBudgetId(null), color: budgetItem?.color })
        }
        if (activeFilterTag) {
            const tagDef = tagDefs.find(t => t.name.toLowerCase() === activeFilterTag.toLowerCase())
            list.push({ key: 'tag', label: `Tag: ${activeFilterTag}`, clear: () => activeSetFilterTag(null), color: tagDef?.color })
        }
        if (activeQ) list.push({ key: 'q', label: `Suche: ${activeQ}`.slice(0, 40) + (activeQ.length > 40 ? '…' : ''), clear: () => activeSetQ('') })
        if (stornoPairIds) list.push({ key: 'storno-pair', label: 'Original + Storno', clear: () => setStornoPairIds(null) })
        return list
    }, [activeFrom, activeTo, activeFilterSphere, activeFilterType, activeFilterPM, activeFilterPaymentAccountId, activeFilterEarmark, activeFilterBudgetId, activeFilterTag, earmarks, budgetNames, budgets, tagDefs, activeQ, stornoPairIds, paymentAccountsById, activeSetFilterPaymentAccountId])

    // ==================== DATA LOADING ====================
    const loadRecent = useCallback(async () => {
        try {
            const offset = (activePage - 1) * journalLimit
            const res = await window.api?.vouchers?.list?.({
                limit: journalLimit,
                offset,
                sort: sortDir,
                sortBy,
                paymentMethod: activeFilterPM || undefined,
                paymentAccountId: activeFilterPaymentAccountId || undefined,
                sphere: activeFilterSphere || undefined,
                type: activeFilterType || undefined,
                from: activeFrom || undefined,
                to: activeTo || undefined,
                earmarkId: activeFilterEarmark || undefined,
                budgetId: activeFilterBudgetId || undefined,
                voucherIds: stornoPairIds || undefined,
                q: activeQ.trim() || undefined,
                tag: activeFilterTag || undefined
            })
            if (res) {
                setRows(res.rows || [])
                setTotalRows(res.total || 0)
            }
        } catch (e: any) {
            notify('error', 'Fehler beim Laden: ' + (e?.message || String(e)))
        }
    // Include refreshKey so external data changes (QuickAdd, imports, etc.) trigger a reload
    }, [journalLimit, activePage, sortDir, sortBy, activeFilterPM, activeFilterPaymentAccountId, activeFilterSphere, activeFilterType, activeFrom, activeTo, activeFilterEarmark, activeFilterBudgetId, activeQ, activeFilterTag, stornoPairIds, notify, refreshKey])

    const getVoucherById = useCallback(async (id: number) => {
        const cached = voucherTooltipCache.current.get(id)
        if (cached) return cached
        const res = await window.api?.vouchers?.list?.({ limit: 1, voucherIds: [id] })
        const voucher = res?.rows?.[0]
        if (voucher) voucherTooltipCache.current.set(id, voucher as VoucherRow)
        return voucher || null
    }, [])

    const filterStornoPair = useCallback((originalId: number, reversalId: number) => {
        activeSetFrom('')
        activeSetTo('')
        activeSetFilterSphere(null)
        activeSetFilterType(null)
        activeSetFilterPM(null)
        activeSetFilterEarmark(null)
        activeSetFilterBudgetId(null)
        activeSetFilterTag(null)
        activeSetQ('')
        activeSetPage(1)
        setStornoPairIds([originalId, reversalId])
    }, [activeSetFrom, activeSetTo, activeSetFilterSphere, activeSetFilterType, activeSetFilterPM, activeSetFilterEarmark, activeSetFilterBudgetId, activeSetFilterTag, activeSetQ, activeSetPage])

    // Load on mount and filter changes
    useEffect(() => {
        loadRecent()
    }, [loadRecent])

    useEffect(() => {
        const onChanged = () => {
            void loadRecent()
        }
        window.addEventListener('data-changed', onChanged)
        return () => window.removeEventListener('data-changed', onChanged)
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

    // Keyboard shortcuts for edit modal (Ctrl+S to save, Esc to close)
    useEffect(() => {
        if (!editRow) return

        const handleKeyDown = (e: KeyboardEvent) => {
            // Ctrl+S or Cmd+S to save
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault()
                // Trigger form submit by finding and clicking the submit button or dispatching submit event
                const form = document.querySelector('.booking-modal form') as HTMLFormElement | null
                if (form) {
                    form.requestSubmit()
                }
                return
            }

            // Escape to close
            if (e.key === 'Escape') {
                e.preventDefault()
                requestCloseEditModal()
                return
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [editRow, requestCloseEditModal])

    const bookingTabs = useMemo(() => {
        const draftTabs = showBookingDraftTabs
            ? bookingDraftTabs.map((draft) => ({ ...draft, kind: 'draft' as const }))
            : []

        const editTabs = showBookingEditTabs
            ? bookingEditTabs.map((tab) => {
                const desc = (tab.row.description || '').trim()
                const ref = tab.row.voucherNo ? `#${tab.row.voucherNo}` : `#${tab.row.id}`
                const label = desc ? `${ref} ${desc}` : `${ref} bearbeiten`
                return {
                    id: tab.id,
                    kind: 'edit' as const,
                    label,
                    title: `Bearbeitung: ${label}`,
                    isActive: tab.id === activeEditTabId,
                    isDetached: !!tab.detached
                }
            })
            : []

        return [...draftTabs, ...editTabs]
    }, [activeEditTabId, bookingDraftTabs, bookingEditTabs, showBookingDraftTabs, showBookingEditTabs])

    // ==================== RENDER ====================
    return (
        <div className="journal-view">
            {/* Filter Toolbar */}
            <div className="journal-filter-toolbar">
                <div className="journal-filter-toolbar__search-wrap">
                    <input
                        ref={searchInputRef}
                        className="input journal-filter-toolbar__search"
                        placeholder="Suche (#ID, Text, Betrag …)"
                        value={activeQ}
                        onChange={(e) => {
                            activeSetQ(e.target.value)
                            activeSetPage(1)
                        }}
                        aria-label="Suche"
                    />
                </div>

                <div className="filter-divider" />

                {/* Filter-Cluster: Zeit- und Meta-Filter */}
                <div ref={timeFilterRef} className="toolbar-icon">
                    <TimeFilterDropdown
                        yearsAvail={yearsAvail}
                        from={activeFrom}
                        to={activeTo}
                        tooltip="Zeitraum filtern"
                        onApply={({ from: nf, to: nt }) => {
                            activeSetFrom(nf)
                            activeSetTo(nt)
                            activeSetPage(1)
                        }}
                    />
                </div>

                <div ref={metaFilterRef} className="toolbar-icon">
                    <MetaFilterDropdown
                        budgets={budgets}
                        earmarks={earmarks}
                        paymentAccounts={paymentAccounts}
                        tagDefs={tagDefs}
                        filterType={activeFilterType}
                        filterPM={activeFilterPM}
                        paymentAccountId={activeFilterPaymentAccountId}
                        filterTag={activeFilterTag}
                        sphere={activeFilterSphere}
                        earmarkId={activeFilterEarmark}
                        budgetId={activeFilterBudgetId}
                        tooltip="Filter nach Art, Sphäre, Tags …"
                        onApply={({ filterType, filterPM, paymentAccountId, filterTag, sphere, earmarkId, budgetId }) => {
                            activeSetFilterType(filterType)
                            activeSetFilterPM(filterPM)
                            activeSetFilterPaymentAccountId(paymentAccountId ?? null)
                            activeSetFilterTag(filterTag)
                            activeSetFilterSphere(sphere)
                            activeSetFilterEarmark(earmarkId)
                            activeSetFilterBudgetId(budgetId)
                            activeSetPage(1)
                        }}
                    />
                </div>

                <div className="filter-divider" />

                {/* Anzeige-Cluster: Spaltenauswahl */}
                <div ref={columnsFilterRef} className="toolbar-icon">
                    <FilterDropdown
                        trigger={
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                <path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z" />
                            </svg>
                        }
                        title="Spalten"
                        hasActiveFilters={false}
                        alignRight
                        width={380}
                        ariaLabel="Spalten wählen"
                        buttonTitle="Spalten wählen"
                        colorVariant="display"
                        tooltip="Spalten & Reihenfolge"
                    >
                        <div className="filter-dropdown__actions" style={{ marginTop: 0 }}>
                            <button className="btn" type="button" onClick={presetStandard}>Standard</button>
                            <button className="btn" type="button" onClick={presetMinimal}>Minimal</button>
                            <div className="filter-dropdown__actions-right">
                                <button className="btn" type="button" onClick={presetDetails}>Details</button>
                            </div>
                        </div>

                        {!journalCols.actions && allowVoucherDeletion && (
                            <div className="helper" style={{ color: 'var(--danger)', marginTop: 8 }}>
                                Ohne „Aktionen" kannst du Zeilen nicht bearbeiten oder löschen.
                            </div>
                        )}

                        <div className="filter-dropdown__info" style={{ marginTop: 10, marginBottom: 6 }}>
                            Ziehe Zeilen per Drag & Drop – der Balken zeigt die Einfügeposition.
                        </div>

                        <div
                            className="filter-dropdown__col-list"
                            onDragOver={(e) => {
                                if (!draggedCol) return
                                e.preventDefault()
                            }}
                            onDragLeave={(e) => {
                                // Nur clearen wenn wir wirklich die Liste verlassen
                                const relatedTarget = e.relatedTarget as Node | null
                                if (!e.currentTarget.contains(relatedTarget)) {
                                    setDropTarget(null)
                                }
                            }}
                            onDrop={(e) => {
                                e.preventDefault()
                                if (!draggedCol || dropTarget == null) {
                                    setDraggedCol(null)
                                    setDropTarget(null)
                                    return
                                }
                                moveCol(draggedCol, dropTarget)
                                setDraggedCol(null)
                                setDropTarget(null)
                            }}
                        >
                            {journalOrder.map((k, idx) => {
                                const fromIdx = journalOrder.indexOf(draggedCol as ColKey)
                                // Indikator vor diesem Element anzeigen?
                                const showIndicatorBefore = dropTarget === idx && draggedCol && fromIdx !== idx && fromIdx !== idx - 1
                                // Indikator nach dem letzten Element?
                                const isLast = idx === journalOrder.length - 1
                                const showIndicatorAfter = isLast && dropTarget === journalOrder.length && draggedCol && fromIdx !== journalOrder.length - 1

                                return (
                                    <React.Fragment key={k}>
                                        {showIndicatorBefore && <div className="filter-dropdown__drop-indicator" />}
                                        <div
                                            className={`filter-dropdown__col-row ${draggedCol === k ? 'dragging' : ''}`}
                                            draggable
                                            onDragStart={(e) => {
                                                setDraggedCol(k)
                                                setDropTarget(null)
                                                e.dataTransfer.effectAllowed = 'move'
                                                e.dataTransfer.setData('text/plain', k)
                                                // Kurze Verzögerung damit der Browser das Ghost-Image korrekt erstellt
                                                requestAnimationFrame(() => {
                                                    setDropTarget(idx)
                                                })
                                            }}
                                            onDragEnd={() => {
                                                setDraggedCol(null)
                                                setDropTarget(null)
                                            }}
                                            onDragOver={(e) => {
                                                if (!draggedCol || draggedCol === k) return
                                                e.preventDefault()
                                                e.stopPropagation()
                                                e.dataTransfer.dropEffect = 'move'

                                                const rowEl = e.currentTarget as HTMLDivElement
                                                const rect = rowEl.getBoundingClientRect()
                                                const midY = rect.top + rect.height / 2
                                                const newTarget = e.clientY < midY ? idx : idx + 1
                                                if (newTarget !== dropTarget) {
                                                    setDropTarget(newTarget)
                                                }
                                            }}
                                            onDrop={(e) => {
                                                e.preventDefault()
                                                e.stopPropagation()
                                                if (!draggedCol || dropTarget == null) return
                                                moveCol(draggedCol, dropTarget)
                                                setDraggedCol(null)
                                                setDropTarget(null)
                                            }}
                                        >
                                            <div className="filter-dropdown__col-drag-handle" aria-hidden="true" title="Ziehen zum Sortieren">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                                    <circle cx="9" cy="5" r="2" />
                                                    <circle cx="15" cy="5" r="2" />
                                                    <circle cx="9" cy="12" r="2" />
                                                    <circle cx="15" cy="12" r="2" />
                                                    <circle cx="9" cy="19" r="2" />
                                                    <circle cx="15" cy="19" r="2" />
                                                </svg>
                                            </div>
                                            <label className="filter-dropdown__col-label">
                                                <input
                                                    type="checkbox"
                                                    checked={!!journalCols[k as ColKey]}
                                                    onChange={(e) => {
                                                        e.stopPropagation()
                                                        setCols({ ...journalCols, [k]: e.target.checked } as Record<ColKey, boolean>)
                                                    }}
                                                />
                                                <span>{LABEL_FOR_COL[k as ColKey] || k}</span>
                                            </label>
                                        </div>
                                        {showIndicatorAfter && <div className="filter-dropdown__drop-indicator" />}
                                    </React.Fragment>
                                )
                            })}
                        </div>
                    </FilterDropdown>
                </div>

                <div className="filter-divider" />

                {/* Aktionen-Cluster: Batch-Zuweisung */}
                <div ref={batchAssignRef} className="toolbar-icon">
                    <BatchAssignDropdown
                    earmarks={earmarks}
                    tagDefs={tagDefs}
                    budgets={budgetsForEdit}
                    tooltip="Batch-Zuweisung auf gefilterte Buchungen"
                    currentFilters={{
                        paymentMethod: activeFilterPM || undefined,
                        paymentAccountId: activeFilterPaymentAccountId ?? undefined,
                        sphere: activeFilterSphere || undefined,
                        type: activeFilterType || undefined,
                        from: activeFrom || undefined,
                        to: activeTo || undefined,
                        q: activeQ.trim() || undefined,
                        earmarkId: activeFilterEarmark || undefined,
                        budgetId: activeFilterBudgetId || undefined,
                        tag: activeFilterTag || undefined
                    }}
                    onApplied={async (updated) => {
                        if (updated > 0) {
                            await loadRecent()
                            bumpDataVersion()
                        }
                    }}
                    notify={notify}
                    />
                </div>
            </div>

            {/* Active Filter Chips */}
            {chips.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 8px', alignItems: 'center' }}>
                    {chips.map((c) => {
                        const bg = c.color || undefined
                        const fg = bg ? (parseInt(bg.slice(1), 16) > 0x7fffff ? '#222' : '#fff') : undefined
                        return (
                            <span key={c.key} className="chip" style={bg ? { background: bg, color: fg, borderColor: bg } : undefined}>
                                {c.label}
                                <button className="chip-x" onClick={c.clear} aria-label={`Filter ${c.key} löschen`} style={bg ? { color: fg } : undefined}>×</button>
                            </span>
                        )
                    })}
                    {hasActiveFilters && (
                        <button
                            className="btn ghost"
                            title="Alle Filter zurücksetzen"
                            onClick={resetAllFilters}
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
                from={activeFrom || undefined}
                to={activeTo || undefined}
                paymentMethod={activeFilterPM || undefined}
                paymentAccountId={activeFilterPaymentAccountId ?? undefined}
                sphere={activeFilterSphere || undefined}
                type={activeFilterType || undefined}
                earmarkId={activeFilterEarmark || undefined}
                budgetId={activeFilterBudgetId ?? undefined}
                q={activeQ || undefined}
                tag={activeFilterTag || undefined}
            />

            {/* Main Table Card */}
            <div className="journal-table-section">
                <div className="card journal-table-card">
                    {bookingTabs.length > 0 && (
                        <div className="booking-draft-tabs" aria-label="Offene Buchungstabs">
                            {bookingTabs.map((draft) => (
                                <div
                                    key={draft.id}
                                    className={`booking-draft-tab${draft.isActive ? ' booking-draft-tab--active' : ''}${draft.isDetached ? ' booking-draft-tab--detached' : ''}${draft.kind === 'edit' ? ' booking-draft-tab--edit' : ''}`}
                                >
                                    <button
                                        type="button"
                                        className="booking-draft-tab__open"
                                        title={draft.title}
                                        onClick={() => {
                                            if (draft.kind === 'edit') {
                                                const tab = bookingEditTabs.find((entry) => entry.id === draft.id)
                                                if (!tab) return
                                                void openBookingEditTab(tab)
                                            } else {
                                                onOpenBookingDraft?.(draft.id)
                                            }
                                        }}
                                    >
                                        <span className="booking-draft-tab__label">{draft.label}</span>
                                        {draft.kind === 'edit' && <span className="booking-draft-tab__badge">Bearbeitung</span>}
                                        {draft.isDetached && <span className="booking-draft-tab__badge">abgedockt</span>}
                                    </button>
                                    <button
                                        type="button"
                                        className="booking-draft-tab__close"
                                        aria-label={`${draft.label} schließen`}
                                        onClick={() => {
                                            if (draft.kind === 'edit') closeBookingEditTab(draft.id)
                                            else onCloseBookingDraft?.(draft.id)
                                        }}
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    {/* Pagination controls */}
                    <div className="pagination-bar">
                        <div className="pagination-bar__info">
                            <div className="pagination-bar__stat">
                                <span>Gesamt:</span>
                                <span className="pagination-bar__stat-value">{totalRows}</span>
                            </div>
                            <div className="pagination-bar__divider" />
                            <div className="pagination-bar__stat">
                                <span>Seite:</span>
                                <span className="pagination-bar__stat-value">{activePage} / {Math.max(1, Math.ceil((totalRows || 0) / journalLimit))}</span>
                            </div>
                            <div className="helper" style={{ marginLeft: 8 }}>
                                Doppelklick für Details{!allowVoucherDeletion ? ' – Stornieren in Details' : ''}
                            </div>
                        </div>
                        <div className="pagination-bar__controls">
                            <button className="btn pagination-bar__btn" onClick={() => { activeSetPage(1) }} disabled={activePage <= 1} title="Erste">«</button>
                            <button className="btn pagination-bar__btn" onClick={() => { activeSetPage(Math.max(1, activePage - 1)) }} disabled={activePage <= 1} title="Zurück">‹</button>
                            <button className="btn pagination-bar__btn" onClick={() => { const maxP = Math.max(1, Math.ceil((totalRows || 0) / journalLimit)); activeSetPage(Math.min(maxP, activePage + 1)) }} disabled={activePage >= Math.max(1, Math.ceil((totalRows || 0) / journalLimit))} title="Weiter">›</button>
                            <button className="btn pagination-bar__btn" onClick={() => { const maxP = Math.max(1, Math.ceil((totalRows || 0) / journalLimit)); activeSetPage(maxP) }} disabled={activePage >= Math.max(1, Math.ceil((totalRows || 0) / journalLimit))} title="Letzte">»</button>
                        </div>
                    </div>

                    <JournalTable
                        rows={rows}
                        order={journalOrder}
                        cols={journalCols}
                        onSetColumnVisibility={(columnKey, visible) => setCols({ ...journalCols, [columnKey]: visible } as Record<ColKey, boolean>)}
                        onReorder={(o: any) => setOrder(o as any)}
                        earmarks={earmarks}
                        tagDefs={tagDefs}
                        eurFmt={eurFmt}
                        fmtDate={(s?: string) => fmtDate(s || '')}
                        getVoucherById={getVoucherById}
                        onStornoPairClick={filterStornoPair}
                        onEdit={(r) => {
                            const nextEdit = {
                                ...r,
                                mode: (r as any).amountMode ?? (((r as any).netAmount ?? 0) > 0 ? 'NET' : 'GROSS'),
                                netAmount: (r as any).netAmount ?? null,
                                grossAmount: (r as any).grossAmount ?? null,
                                vatRate: (r as any).vatRate ?? 0
                            } as any
                            const blockReason = voucherMutationBlockReason(nextEdit)
                            if (blockReason) {
                                notify('info', blockReason)
                                return
                            }
                            if (bookingsOpenDetached) {
                                void openDetachedEdit(nextEdit)
                                return
                            }
                            openEditRow(nextEdit)
                        }}
                        onDelete={(r) => setDeleteRow(r)}
                        onToggleSort={(col: 'date' | 'net' | 'gross' | 'budget' | 'earmark' | 'payment' | 'sphere') => {
                            setPage(1)
                            setSortBy(col)
                            setSortDir(prev => (col === sortBy ? (prev === 'DESC' ? 'ASC' : 'DESC') : 'DESC'))
                        }}
                        sortDir={sortDir}
                        sortBy={sortBy}
                        highlightId={flashId}
                        lockedUntil={periodLock?.closedUntil || null}
                        onTagClick={async (name) => {
                            activeSetFilterTag(name)
                            setActivePage('Buchungen')
                            activeSetPage(1)
                            await loadRecent()
                        }}
                        onEarmarkClick={async (id) => {
                            activeSetFilterEarmark(id)
                            setActivePage('Buchungen')
                            activeSetPage(1)
                            await loadRecent()
                        }}
                        onBudgetClick={async (id) => {
                            const normalizedId = Number(id)
                            if (!Number.isFinite(normalizedId) || normalizedId <= 0) return
                            activeSetFilterBudgetId(normalizedId)
                            setActivePage('Buchungen')
                            activeSetPage(1)
                            await loadRecent()
                        }}
                        onPaymentAccountClick={async (id) => {
                            const normalizedId = Number(id)
                            if (!Number.isFinite(normalizedId) || normalizedId <= 0) return
                            activeSetFilterPM(null)
                            activeSetFilterPaymentAccountId(normalizedId)
                            setActivePage('Buchungen')
                            activeSetPage(1)
                            await loadRecent()
                        }}
                        onTransferClick={async () => {
                            activeSetFilterType('TRANSFER')
                            activeSetFilterPM(null)
                            activeSetFilterPaymentAccountId(null)
                            setActivePage('Buchungen')
                            activeSetPage(1)
                            await loadRecent()
                        }}
                        onRowDoubleClick={(row) => { void openVoucherDetails(row) }}
                    />
                </div>

                {/* Edit Modal */}
                {editRow && (
                    <div className="modal-overlay journal-edit-modal-overlay">
                        <div className="modal booking-modal journal-edit-modal" onClick={(e) => e.stopPropagation()}>
                            <header className="journal-edit-modal__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <h2 style={{ margin: 0 }}>
                                    {(() => {
                                        const desc = (editRow.description || '').trim()
                                        const label = desc ? `Buchung (${desc.length > 60 ? desc.slice(0,60) + '…' : desc}) bearbeiten` : `Buchung bearbeiten`
                                        return label
                                    })()}
                                </h2>
                                <div className="booking-modal-header-actions">
                                    <button className="btn ghost" type="button" onClick={() => { void openDetachedEdit(editRow, true) }} title="In eigenes Fenster abdocken">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                            <path d="M15 3h6v6" />
                                            <path d="M10 14 21 3" />
                                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                        </svg>
                                    </button>
                                    <button className="btn ghost" onClick={requestCloseEditModal} title="Schließen (ESC)">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                                        </svg>
                                    </button>
                                </div>
                            </header>

                            {confirmDiscardEdit && (
                                <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.55)', display: 'grid', placeItems: 'center' }}>
                                    <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, width: '90vw', padding: '22px 24px', borderRadius: 14, border: '2px solid var(--accent)' }}>
                                        <div style={{ fontSize: 28, marginBottom: 6, textAlign: 'center' }}>⚠️</div>
                                        <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, textAlign: 'center' }}>Ungespeicherte Änderungen</h3>
                                        <p style={{ margin: '0 0 16px', fontSize: 13, opacity: 0.85, lineHeight: 1.45, textAlign: 'center' }}>
                                            Diese Buchung wurde verändert. Möchtest du die Änderungen wirklich verwerfen?
                                        </p>
                                        <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                                            <button type="button" className="btn" onClick={() => setConfirmDiscardEdit(false)}>
                                                Weiter bearbeiten
                                            </button>
                                            <button type="button" className="btn danger" onClick={closeEditModalNow}>
                                                Änderungen verwerfen
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <form className="journal-edit-modal__form" onSubmit={async (e) => {
                                e.preventDefault()
                                try {
                                    const blockReason = voucherMutationBlockReason(editRow)
                                    if (blockReason) {
                                        notify('info', blockReason)
                                        return
                                    }
                                    // Validate transfer direction
                                    if (editRow.type === 'TRANSFER' && (!editRow.transferFromAccountId || !editRow.transferToAccountId)) {
                                        notify('error', 'Bitte wähle Quell- und Zielkonto für den Transfer aus.')
                                        return
                                    }
                                    if (editRow.type !== 'TRANSFER' && editRow.type !== 'INTERNAL' && !editRow.paymentAccountId) {
                                        notify('error', 'Bitte wähle ein Konto für die Buchung aus.')
                                        return
                                    }
                                    const budgetsListForValidation = ((editRow as any).budgets || [])
                                    // Build budgets array from the new multi-assignment UI
                                    const budgets = budgetsListForValidation
                                        .filter((b: BudgetAssignment) => b.budgetId && (editRow.type === 'INTERNAL' ? b.amount !== 0 : b.amount > 0))
                                        .map((b: BudgetAssignment) => ({ budgetId: b.budgetId, amount: b.amount }))
                                    const earmarksListForValidation = ((editRow as any).earmarksAssigned || [])
                                    // Build earmarks array from the new multi-assignment UI
                                    const earmarksArr = earmarksListForValidation
                                        .filter((e: EarmarkAssignment) => e.earmarkId && (editRow.type === 'INTERNAL' ? e.amount !== 0 : e.amount > 0))
                                        .map((e: EarmarkAssignment) => ({ earmarkId: e.earmarkId, amount: e.amount }))
                                    const internalAssignmentValidation = getInternalAssignmentValidationState({
                                        budgets: budgetsListForValidation.map((b: BudgetAssignment) => ({ budgetId: b.budgetId, amount: b.amount })),
                                        earmarks: earmarksListForValidation.map((e: EarmarkAssignment) => ({ earmarkId: e.earmarkId, amount: e.amount })),
                                        isInternal: editRow.type === 'INTERNAL',
                                        grossAmount: Number((editRow as any).grossAmount) || 0,
                                    })

                                    // Validate: No duplicate budgets
                                    const budgetIds = budgets.map((b: { budgetId: number }) => b.budgetId)
                                    if (new Set(budgetIds).size !== budgetIds.length) {
                                        notify('error', 'Ein Budget kann nur einmal pro Buchung zugeordnet werden. Bitte entferne die doppelten Einträge.')
                                        return
                                    }
                                    // Validate: No duplicate earmarks
                                    const earmarkIds = earmarksArr.map((e: { earmarkId: number }) => e.earmarkId)
                                    if (new Set(earmarkIds).size !== earmarkIds.length) {
                                        notify('error', 'Eine Zweckbindung kann nur einmal pro Buchung zugeordnet werden. Bitte entferne die doppelten Einträge.')
                                        return
                                    }
                                    // Validate: Total budget amount should not exceed gross amount
                                    const totalBudgetAmount = budgets.reduce((sum: number, b: { amount: number }) => sum + b.amount, 0)
                                    const grossAmount = Number((editRow as any).grossAmount) || 0
                                    if (editRow.type === 'INTERNAL' && !internalAssignmentValidation.hasValidAssignments) {
                                        notify('error', internalAssignmentValidation.budgetHint || internalAssignmentValidation.earmarkHint || 'Interne Buchungen brauchen Budget- oder Zweckbindungs-Zeilen mit Quelle negativ, Ziel positiv und Summe 0.')
                                        return
                                    }
                                    const totalEarmarkAmount = earmarksArr.reduce((sum: number, e: { amount: number }) => sum + e.amount, 0)
                                    if (editRow.type !== 'INTERNAL' && totalBudgetAmount > grossAmount * 1.001) { // small tolerance for rounding
                                        notify('error', `Die Summe der Budget-Beträge (${totalBudgetAmount.toFixed(2)} €) übersteigt den Buchungsbetrag (${grossAmount.toFixed(2)} €).`)
                                        return
                                    }
                                    // Validate: Total earmark amount should not exceed gross amount
                                    if (editRow.type !== 'INTERNAL' && totalEarmarkAmount > grossAmount * 1.001) {
                                        notify('error', `Die Summe der Zweckbindungs-Beträge (${totalEarmarkAmount.toFixed(2)} €) übersteigt den Buchungsbetrag (${grossAmount.toFixed(2)} €).`)
                                        return
                                    }

                                    const payload = buildVoucherUpdatePayloadFromEditRow(editRow, budgets, earmarksArr)
                                    const res = await window.api?.vouchers.update?.(payload)
                                    notify('success', 'Buchung gespeichert')
                                    const w = (res as any)?.warnings as string[] | undefined
                                    if (w && w.length) { for (const msg of w) notify('info', 'Warnung: ' + msg) }
                                    setFlashId(editRow.id); window.setTimeout(() => setFlashId((cur) => (cur === editRow.id ? null : cur)), 3000)
                                    closeEditModalNow(); await loadRecent(); bumpDataVersion()
                                } catch (e: any) {
                                    notify('error', friendlyError(e))
                                }
                            }}>
                                {/* Live Summary */}
                                <div className="card journal-edit-modal__summary" style={{ padding: 10, marginBottom: 8 }}>
                                    <div className="helper">Zusammenfassung</div>
                                    <div style={{ fontWeight: 600 }}>
                                        {(() => {
                                            const date = fmtDate(editRow.date)
                                            const type = editRow.type
                                            const pm = editRow.type === 'TRANSFER'
                                                ? `${editRow.transferFromAccountName || paymentAccountsById.get(Number(editRow.transferFromAccountId || 0))?.name || paymentMethodLabel(editRow.transferFrom)} → ${editRow.transferToAccountName || paymentAccountsById.get(Number(editRow.transferToAccountId || 0))?.name || paymentMethodLabel(editRow.transferTo)}`
                                                : editRow.type === 'INTERNAL'
                                                    ? 'intern'
                                                    : (editRow.paymentAccountName || paymentAccountsById.get(Number(editRow.paymentAccountId || 0))?.name || paymentMethodLabel(editRow.paymentMethod))
                                            const amount = (() => {
                                                if (editRow.type === 'TRANSFER' || editRow.type === 'INTERNAL') return eurFmt.format(Number((editRow as any).grossAmount || 0))
                                                if ((editRow as any).mode === 'GROSS') return eurFmt.format(Number((editRow as any).grossAmount || 0))
                                                const n = Number((editRow as any).netAmount || 0); const v = Number((editRow as any).vatRate || 0); const g = Math.round((n * (1 + v / 100)) * 100) / 100
                                                return eurFmt.format(g)
                                            })()
                                            const sphere = editRow.sphere
                                            const amountColor = type === 'IN' ? 'var(--success)' : type === 'OUT' ? 'var(--danger)' : type === 'INTERNAL' ? 'var(--muted)' : 'inherit'
                                            return <>{date} · {type} · {pm} · <span style={{ color: amountColor }}>{amount}</span> · {sphere}</>
                                        })()}
                                    </div>
                                </div>

                                {/* Blocks A+B in a side-by-side grid on wide screens */}
                                <div className="block-grid journal-edit-modal__block-grid" style={{ marginBottom: 8 }}>
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
                                                <div className="btn-group booking-type-group" role="group" aria-label="Art wählen">
                                                    {(['IN','OUT','TRANSFER','INTERNAL'] as const).map(t => (
                                                        <button key={t} type="button" className={`btn ${editRow.type === t ? 'btn-toggle-active' : ''} ${t==='IN' ? 'btn-type-in' : t==='OUT' ? 'btn-type-out' : ''}`} onClick={() => {
                                                            const newRow = { ...editRow, type: t }
                                                            if (t === 'TRANSFER' && (!newRow.transferFromAccountId || !newRow.transferToAccountId)) {
                                                                newRow.transferFromAccountId = defaultCashAccount?.id ?? null
                                                                newRow.transferFromAccountName = defaultCashAccount?.name ?? null
                                                                newRow.transferFrom = defaultCashAccount?.kind === 'CASH' ? 'BAR' : 'BANK'
                                                                newRow.transferToAccountId = defaultBankAccount?.id ?? null
                                                                newRow.transferToAccountName = defaultBankAccount?.name ?? null
                                                                newRow.transferTo = defaultBankAccount?.kind === 'CASH' ? 'BAR' : 'BANK'
                                                                newRow.paymentAccountId = null
                                                                newRow.paymentAccountName = null
                                                            } else if (t === 'INTERNAL') {
                                                                newRow.paymentAccountId = null
                                                                newRow.paymentAccountName = null
                                                                newRow.paymentMethod = null
                                                                newRow.transferFromAccountId = null
                                                                newRow.transferToAccountId = null
                                                                newRow.vatRate = 0
                                                                ;(newRow as any).mode = 'GROSS'
                                                            } else if (t !== 'TRANSFER' && !newRow.paymentAccountId) {
                                                                const fallback = defaultCashAccount ?? defaultBankAccount
                                                                newRow.paymentAccountId = fallback?.id ?? null
                                                                newRow.paymentAccountName = fallback?.name ?? null
                                                                newRow.paymentMethod = fallback?.kind === 'CASH' ? 'BAR' : 'BANK'
                                                            }
                                                            setEditRow(newRow)
                                                        }}>{t === 'IN' ? 'IN' : t === 'OUT' ? 'OUT' : t === 'TRANSFER' ? 'TRAN' : 'INT'}</button>
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
                                                <div className="field" style={{ gridColumn: 'span 2' }}>
                                                    <label>Kontotransfer <span className="req-asterisk" aria-hidden="true">*</span></label>
                                                    <div className="flex gap-8">
                                                        <select className="input" value={String(editRow.transferFromAccountId ?? '')} required style={{ color: paymentAccountsById.get(Number(editRow.transferFromAccountId || 0))?.color || undefined }}
                                                            onChange={(e) => {
                                                                const nextId = e.target.value ? Number(e.target.value) : null
                                                                const nextAccount = nextId ? paymentAccountsById.get(nextId) : undefined
                                                                setEditRow({ ...editRow, transferFromAccountId: nextId, transferFromAccountName: nextAccount?.name ?? null, transferFromAccountKind: nextAccount?.kind ?? null, transferFromAccountColor: nextAccount?.color ?? null, transferFrom: nextAccount?.kind === 'CASH' ? 'BAR' : nextAccount ? 'BANK' : null, paymentMethod: null })
                                                            }}>
                                                            <option value="">Von Konto wählen</option>
                                                            {activePaymentAccounts.map((account) => <option key={`edit-from-${account.id}`} value={account.id} style={{ color: account.color || undefined }}>{account.name}</option>)}
                                                        </select>
                                                        <select className="input" value={String(editRow.transferToAccountId ?? '')} required style={{ color: paymentAccountsById.get(Number(editRow.transferToAccountId || 0))?.color || undefined }}
                                                            onChange={(e) => {
                                                                const nextId = e.target.value ? Number(e.target.value) : null
                                                                const nextAccount = nextId ? paymentAccountsById.get(nextId) : undefined
                                                                setEditRow({ ...editRow, transferToAccountId: nextId, transferToAccountName: nextAccount?.name ?? null, transferToAccountKind: nextAccount?.kind ?? null, transferToAccountColor: nextAccount?.color ?? null, transferTo: nextAccount?.kind === 'CASH' ? 'BAR' : nextAccount ? 'BANK' : null, paymentMethod: null })
                                                            }}>
                                                            <option value="">Nach Konto wählen</option>
                                                            {activePaymentAccounts.map((account) => <option key={`edit-to-${account.id}`} value={account.id} style={{ color: account.color || undefined }}>{account.name}</option>)}
                                                        </select>
                                                    </div>
                                                </div>
                                            ) : editRow.type === 'INTERNAL' ? (
                                                <div className="field">
                                                    <label>Konto</label>
                                                    <div className="badge pm-internal" style={{ alignSelf: 'start' }}>intern</div>
                                                </div>
                                            ) : (
                                                <div className="field">
                                                    <label>Konto</label>
                                                    <select className="input" value={String(editRow.paymentAccountId ?? '')} required style={{ color: paymentAccountsById.get(Number(editRow.paymentAccountId || 0))?.color || undefined }}
                                                        onChange={(e) => {
                                                            const nextId = e.target.value ? Number(e.target.value) : null
                                                            const nextAccount = nextId ? paymentAccountsById.get(nextId) : undefined
                                                            setEditRow({ ...editRow, paymentAccountId: nextId, paymentAccountName: nextAccount?.name ?? null, paymentAccountKind: nextAccount?.kind ?? null, paymentAccountColor: nextAccount?.color ?? null, paymentMethod: nextAccount?.kind === 'CASH' ? 'BAR' : nextAccount ? 'BANK' : null })
                                                        }}>
                                                        <option value="">Konto wählen</option>
                                                        {activePaymentAccounts.map((account) => <option key={`edit-account-${account.id}`} value={account.id} style={{ color: account.color || undefined }}>{account.name}</option>)}
                                                    </select>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Block B – Finanzdetails */}
                                    <div className="card card-finance" style={{ padding: 12 }}>
                                        <div className="helper" style={{ marginBottom: 6 }}>Finanzen</div>
                                        <div className="row">
                                            {editRow.type === 'TRANSFER' ? (
                                                <div className="field finance-amount-highlight" style={{ gridColumn: '1 / -1' }}>
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
                                                    <div className="field finance-amount-highlight">
                                                        <label>{(editRow as any).mode === 'GROSS' ? 'Brutto' : 'Netto'} <span className="req-asterisk" aria-hidden="true">*</span></label>
                                                        <div style={{ display: 'flex', gap: 8 }}>
                                                            <select
                                                                className="input"
                                                                value={(editRow as any).mode ?? 'NET'}
                                                                onChange={(e) => {
                                                                    const nextMode = e.target.value as 'NET' | 'GROSS'
                                                                    if (nextMode === 'NET') {
                                                                        const currentNet = Number((editRow as any).netAmount)
                                                                        const currentGross = Number((editRow as any).grossAmount)
                                                                        const shouldPrefillFromGross = (!Number.isFinite(currentNet) || currentNet === 0) && Number.isFinite(currentGross)
                                                                        setEditRow({
                                                                            ...(editRow as any),
                                                                            mode: nextMode,
                                                                            ...(shouldPrefillFromGross ? { netAmount: currentGross } : {})
                                                                        } as any)
                                                                        return
                                                                    }
                                                                    setEditRow({ ...(editRow as any), mode: nextMode } as any)
                                                                }}
                                                            >
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
                                                            <select className="input" value={(editRow as any).vatRate ?? 19} onChange={(e) => setEditRow({ ...(editRow as any), vatRate: Number(e.target.value) } as any)}>
                                                                <option value="0">0% (steuerfrei)</option>
                                                                <option value="7">7% (ermäßigt)</option>
                                                                <option value="19">19% (Regelsteuersatz)</option>
                                                            </select>
                                                        </div>
                                                    )}
                                                </>
                                            )}
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
                                                            const currentBudgets = (editRow as any).budgets || []
                                                            const amount = editRow.type === 'INTERNAL' && currentBudgets.length === 0 ? -((editRow as any).grossAmount || 0) : ((editRow as any).grossAmount || 0)
                                                            setEditRow({ ...editRow, budgets: [...currentBudgets, { budgetId: 0, amount }] } as any)
                                                        }}
                                                        title="Weiteres Budget hinzufügen"
                                                    >+</button>
                                                </label>
                                                {(() => {
                                                    const budgetsList = (editRow as any).budgets || []
                                                    const budgetIds = budgetsList.filter((b: BudgetAssignment) => b.budgetId).map((b: BudgetAssignment) => b.budgetId)
                                                    const hasDuplicateBudgets = new Set(budgetIds).size !== budgetIds.length
                                                    const totalBudgetAmount = budgetsList.reduce((sum: number, b: BudgetAssignment) => sum + (b.amount || 0), 0)
                                                    const grossAmt = Number((editRow as any).grossAmount) || 0
                                                    const exceedsTotal = editRow.type !== 'INTERNAL' && totalBudgetAmount > grossAmt * 1.001
                                                    const internalBudgetValidation = getInternalAssignmentValidationState({
                                                        budgets: budgetsList.map((b: BudgetAssignment) => ({ budgetId: b.budgetId, amount: b.amount })),
                                                        earmarks: [],
                                                        isInternal: editRow.type === 'INTERNAL',
                                                        grossAmount: grossAmt,
                                                    })
                                                    const hasBalancedInternalBudgets = budgetsList.length > 0
                                                        && budgetsList.some((b: BudgetAssignment) => b.budgetId && Number(b.amount) < 0)
                                                        && budgetsList.some((b: BudgetAssignment) => b.budgetId && Number(b.amount) > 0)
                                                        && Math.abs(totalBudgetAmount) <= 0.001
                                                    return (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                            {budgetsList.length > 0 ? (
                                                                budgetsList.map((ba: BudgetAssignment, idx: number) => {
                                                                    const isDuplicate = budgetIds.filter((id: number) => id === ba.budgetId).length > 1
                                                                    return (
                                                                        <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                                        <select
                                                                            style={{ flex: 1, borderColor: isDuplicate ? 'var(--danger)' : undefined }}
                                                                            value={ba.budgetId || ''}
                                                                            onChange={(e) => {
                                                                                const newBudgets = [...budgetsList]
                                                                                newBudgets[idx] = { ...newBudgets[idx], budgetId: e.target.value ? Number(e.target.value) : 0 }
                                                                                setEditRow({ ...editRow, budgets: newBudgets } as any)
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
                                                                                        {active.map((b: any) => (
                                                                                            <option key={b.id} value={b.id}>{b.label}</option>
                                                                                        ))}
                                                                                    </>
                                                                                )
                                                                            })()}
                                                                        </select>
                                                                        <span className="adorn-wrap" style={{ width: 110 }}>
                                                                            <input
                                                                                className="input"
                                                                                type="number"
                                                                                step="0.01"
                                                                                min={editRow.type === 'INTERNAL' ? undefined : '0'}
                                                                                value={ba.amount ?? ''}
                                                                                onChange={(e) => {
                                                                                    const newBudgets = [...budgetsList]
                                                                                    newBudgets[idx] = { ...newBudgets[idx], amount: e.target.value ? Number(e.target.value) : 0 }
                                                                                    setEditRow({ ...editRow, budgets: newBudgets } as any)
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
                                                                                const newBudgets = budgetsList.filter((_: any, i: number) => i !== idx)
                                                                                setEditRow({ ...editRow, budgets: newBudgets } as any)
                                                                            }}
                                                                            title="Entfernen"
                                                                        >✕</button>
                                                                    </div>
                                                                    )
                                                                })
                                                            ) : null}
                                                            {hasDuplicateBudgets && (
                                                                <div className="helper" style={{ color: 'var(--danger)' }}>⚠ Ein Budget kann nur einmal zugeordnet werden</div>
                                                            )}
                                                            {exceedsTotal && (
                                                                <div className="helper" style={{ color: 'var(--danger)' }}>⚠ Summe ({totalBudgetAmount.toFixed(2)} €) übersteigt Buchungsbetrag ({grossAmt.toFixed(2)} €)</div>
                                                            )}
                                                            {editRow.type === 'INTERNAL' && internalBudgetValidation.budgetHint ? (
                                                                <div className="helper" style={{ color: 'var(--danger)' }}>{internalBudgetValidation.budgetHint}</div>
                                                            ) : null}
                                                            {!budgetsList.length && editRow.type === 'INTERNAL' ? (
                                                                <div className="helper" style={{ fontStyle: 'italic', opacity: 0.7 }}>Kein Budget zugeordnet. Klicke + zum Hinzufügen.</div>
                                                            ) : null}
                                                        </div>
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
                                                            const currentEarmarks = (editRow as any).earmarksAssigned || []
                                                            const amount = editRow.type === 'INTERNAL' && currentEarmarks.length === 0 ? -((editRow as any).grossAmount || 0) : ((editRow as any).grossAmount || 0)
                                                            setEditRow({ ...editRow, earmarksAssigned: [...currentEarmarks, { earmarkId: 0, amount }] } as any)
                                                        }}
                                                        title="Weitere Zweckbindung hinzufügen"
                                                    >+</button>
                                                </label>
                                                {(() => {
                                                    const earmarksList = (editRow as any).earmarksAssigned || []
                                                    const earmarkIds = earmarksList.filter((e: EarmarkAssignment) => e.earmarkId).map((e: EarmarkAssignment) => e.earmarkId)
                                                    const hasDuplicateEarmarks = new Set(earmarkIds).size !== earmarkIds.length
                                                    const totalEarmarkAmount = earmarksList.reduce((sum: number, e: EarmarkAssignment) => sum + (e.amount || 0), 0)
                                                    const grossAmt = Number((editRow as any).grossAmount) || 0
                                                    const exceedsTotal = editRow.type !== 'INTERNAL' && totalEarmarkAmount > grossAmt * 1.001
                                                    const internalEarmarkValidation = getInternalAssignmentValidationState({
                                                        budgets: [],
                                                        earmarks: earmarksList.map((e: EarmarkAssignment) => ({ earmarkId: e.earmarkId, amount: e.amount })),
                                                        isInternal: editRow.type === 'INTERNAL',
                                                        grossAmount: grossAmt,
                                                    })
                                                    const hasBalancedInternalEarmarks = earmarksList.length > 0
                                                        && earmarksList.some((e: EarmarkAssignment) => e.earmarkId && Number(e.amount) < 0)
                                                        && earmarksList.some((e: EarmarkAssignment) => e.earmarkId && Number(e.amount) > 0)
                                                        && Math.abs(totalEarmarkAmount) <= 0.001
                                                    return (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                            {earmarksList.length > 0 ? (
                                                                earmarksList.map((ea: EarmarkAssignment, idx: number) => {
                                                                    const isDuplicate = earmarkIds.filter((id: number) => id === ea.earmarkId).length > 1
                                                                    return (
                                                                        <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                                        <select
                                                                            style={{ flex: 1, borderColor: isDuplicate ? 'var(--danger)' : undefined }}
                                                                            value={ea.earmarkId || ''}
                                                                            onChange={(e) => {
                                                                                const newEarmarks = [...earmarksList]
                                                                                newEarmarks[idx] = { ...newEarmarks[idx], earmarkId: e.target.value ? Number(e.target.value) : 0 }
                                                                                setEditRow({ ...editRow, earmarksAssigned: newEarmarks } as any)
                                                                            }}
                                                                        >
                                                                            <option value="">— Zweckbindung wählen —</option>
                                                                            {ea.earmarkId && !(earmarks || []).some((em: any) => em?.id === ea.earmarkId) ? (
                                                                                <option key={`arch-${ea.earmarkId}`} value={ea.earmarkId}>
                                                                                    {(ea.code ? ea.code : ('#' + ea.earmarkId))} – {ea.name || ''} (archiviert)
                                                                                </option>
                                                                            ) : null}
                                                                            {(earmarks || []).map((em: any) => (
                                                                                <option key={em.id} value={em.id}>{em.code} – {em.name}</option>
                                                                            ))}
                                                                        </select>
                                                                        <span className="adorn-wrap" style={{ width: 110 }}>
                                                                            <input
                                                                                className="input"
                                                                                type="number"
                                                                                step="0.01"
                                                                                min={editRow.type === 'INTERNAL' ? undefined : '0'}
                                                                                value={ea.amount ?? ''}
                                                                                onChange={(e) => {
                                                                                    const newEarmarks = [...earmarksList]
                                                                                    newEarmarks[idx] = { ...newEarmarks[idx], amount: e.target.value ? Number(e.target.value) : 0 }
                                                                                    setEditRow({ ...editRow, earmarksAssigned: newEarmarks } as any)
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
                                                                                const newEarmarks = earmarksList.filter((_: any, i: number) => i !== idx)
                                                                                setEditRow({ ...editRow, earmarksAssigned: newEarmarks } as any)
                                                                            }}
                                                                            title="Entfernen"
                                                                        >✕</button>
                                                                    </div>
                                                                    )
                                                                })
                                                            ) : null}
                                                            {hasDuplicateEarmarks && (
                                                                <div className="helper" style={{ color: 'var(--danger)' }}>⚠ Eine Zweckbindung kann nur einmal zugeordnet werden</div>
                                                            )}
                                                            {exceedsTotal && (
                                                                <div className="helper" style={{ color: 'var(--danger)' }}>⚠ Summe ({totalEarmarkAmount.toFixed(2)} €) übersteigt Buchungsbetrag ({grossAmt.toFixed(2)} €)</div>
                                                            )}
                                                            {editRow.type === 'INTERNAL' && internalEarmarkValidation.earmarkHint ? (
                                                                <div className="helper" style={{ color: 'var(--danger)' }}>{internalEarmarkValidation.earmarkHint}</div>
                                                            ) : null}
                                                            {!earmarksList.length && editRow.type === 'INTERNAL' ? (
                                                                <div className="helper" style={{ fontStyle: 'italic', opacity: 0.7 }}>Keine Zweckbindung zugeordnet. Klicke + zum Hinzufügen.</div>
                                                            ) : null}
                                                        </div>
                                                    )
                                                })()}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Block C+D – Beschreibung & Tags + Anhänge */}
                                <div className="block-grid block-grid-meta journal-edit-modal__block-grid" style={{ marginBottom: 8 }}>
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
                                        <div className="field booking-note-field" style={{ marginBottom: 10 }}>
                                            <label>Kommentar</label>
                                            <textarea
                                                className="input booking-note-textarea"
                                                rows={3}
                                                value={editRow.note ?? ''}
                                                onChange={(e) => setEditRow({ ...editRow, note: e.target.value })}
                                                placeholder="Interne Notiz, Rückfrage, Ablagehinweis ..."
                                            />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                                <strong>Anhänge</strong>
                                                {editRowFiles.length > 0 && <div className="helper">Dateien hierher ziehen</div>}
                                            </div>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <input ref={editFileInputRef} type="file" multiple hidden accept=".png,.jpg,.jpeg,.pdf,.doc,.docx" onChange={async (e) => {
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
                                                            <button
                                                                type="button"
                                                                className="btn danger"
                                                                title="Löschen"
                                                                onClick={(e) => {
                                                                    e.preventDefault()
                                                                    e.stopPropagation()
                                                                    if (editRow) {
                                                                        setConfirmDeleteAttachment({ id: f.id, fileName: f.fileName, voucherId: editRow.id })
                                                                    }
                                                                }}
                                                            >🗑</button>
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : (
                                                <div
                                                    className="journal-edit-modal__empty-attachments"
                                                    style={{
                                                        marginTop: 8,
                                                        padding: 20,
                                                        border: '2px dashed var(--border)',
                                                        borderRadius: 8,
                                                        textAlign: 'center',
                                                        cursor: 'pointer'
                                                    }}
                                                    onClick={() => editFileInputRef.current?.click?.()}
                                                >
                                                    <div style={{ fontSize: 24, marginBottom: 4 }}>📎</div>
                                                    <div className="helper">Dateien hierher ziehen oder klicken</div>
                                                </div>
                                            )
                                        )}
                                    </div>
                                </div>

                                {/* Confirmation Modal for Attachment Deletion */}
                                {confirmDeleteAttachment && (
                                    <div className="modal-overlay" onClick={() => setConfirmDeleteAttachment(null)} role="dialog" aria-modal="true">
                                        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, display: 'grid', gap: 12 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <h3 style={{ margin: 0 }}>Anhang löschen</h3>
                                                <button
                                                    type="button"
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
                                                <button type="button" className="btn" onClick={() => setConfirmDeleteAttachment(null)}>Abbrechen</button>
                                                <button type="button" className="btn danger" onClick={async () => {
                                                    try {
                                                        await window.api?.attachments.delete?.({ fileId: confirmDeleteAttachment.id })
                                                        const res = await window.api?.attachments.list?.({ voucherId: confirmDeleteAttachment.voucherId })
                                                        setEditRowFiles(res?.files || [])
                                                        setConfirmDeleteAttachment(null)
                                                        notify('success', 'Anhang gelöscht')
                                                        // Refresh the table to update attachment count
                                                        await loadRecent()
                                                    } catch (e: any) {
                                                        notify('error', e?.message || String(e))
                                                    }
                                                }}>Ja, löschen</button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="journal-edit-modal__footer" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 12, alignItems: 'center' }}>
                                    <div>
                                        {voucherMutationBlockReason(editRow) ? (
                                            <div className="helper">{voucherMutationBlockReason(editRow)}</div>
                                        ) : (
                                            <button
                                                type="button"
                                                className="btn danger"
                                                title={allowVoucherDeletion ? 'Löschen' : 'Stornieren'}
                                                onClick={() => { setDeleteRow({ id: editRow.id, voucherNo: (editRow as any)?.voucherNo as any, description: editRow.description ?? null, fromEdit: true }); }}
                                            >
                                                {allowVoucherDeletion ? '🗑 Löschen' : 'Stornieren'}
                                            </button>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button type="button" className="btn" onClick={requestCloseEditModal}>Abbrechen</button>
                                        <button type="submit" className="btn primary" disabled={!!voucherMutationBlockReason(editRow)}>Speichern (Ctrl+S)</button>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Delete Modal */}
                {deleteRow && (
                    <div className="modal-overlay" onClick={() => setDeleteRow(null)} style={{ alignItems: 'center', paddingTop: 0, zIndex: 16000 }}>
                        <div className="modal" onClick={(e) => e.stopPropagation()}>
                            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <h2 style={{ margin: 0 }}>{allowVoucherDeletion ? 'Buchung löschen' : 'Buchung stornieren'}</h2>
                                <button className="btn danger" onClick={() => setDeleteRow(null)}>Schließen</button>
                            </header>
                            <p>
                                Möchtest du die Buchung <strong>{deleteRow.voucherNo ? `#${deleteRow.voucherNo}` : ''}{deleteRow.description ? ` ${deleteRow.voucherNo ? '– ' : ''}${deleteRow.description}` : ''}</strong>{' '}
                                {allowVoucherDeletion
                                    ? 'wirklich löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.'
                                    : 'stornieren? Die Originalbuchung bleibt erhalten und es wird eine Gegenbuchung erstellt.'}
                            </p>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                                <button className="btn" onClick={() => setDeleteRow(null)}>Abbrechen</button>
                                <button className="btn danger" onClick={async () => {
                                    try {
                                        const res = allowVoucherDeletion
                                            ? await window.api?.vouchers.delete?.({ id: deleteRow.id })
                                            : await window.api?.vouchers.reverse?.({ originalId: deleteRow.id, reason: 'Storno statt Löschen' })
                                        setDeleteRow(null)
                                        // Close edit modal if deletion was initiated from edit, or if the currently edited row matches the deleted one
                                        try {
                                            if (deleteRow.fromEdit) closeEditModalNow()
                                            else if (editRow && editRow.id === deleteRow.id) closeEditModalNow()
                                        } catch {}
                                        await loadRecent()
                                        if (infoVoucher && infoVoucher.id === deleteRow.id) {
                                            try {
                                                const refreshed = await window.api?.vouchers.list?.({ limit: 1, voucherIds: [deleteRow.id] })
                                                const next = refreshed?.rows?.[0] as VoucherRow | undefined
                                                if (next) {
                                                    setInfoVoucher(next)
                                                    voucherTooltipCache.current.set(next.id, next)
                                                }
                                            } catch { /* keep current details if refresh fails */ }
                                        }
                                        bumpDataVersion()
                                        if (!allowVoucherDeletion && (res as any)?.id) {
                                            setFlashId((res as any).id)
                                            window.setTimeout(() => setFlashId((cur) => (cur === (res as any).id ? null : cur)), 3000)
                                        }
                                        notify('success', allowVoucherDeletion ? 'Buchung gelöscht' : `Storno erstellt: #${(res as any)?.voucherNo || ''}`)
                                    } catch (e: any) {
                                        const raw = String(e?.message || e || '')
                                        if (allowVoucherDeletion && /FOREIGN KEY|constraint|invoice|posted_voucher_id/i.test(raw)) {
                                            notify('info', 'Diese Buchung ist mit einer Verbindlichkeit verknüpft und kann nicht gelöscht werden. Bitte zuerst die Verbindlichkeit löschen – danach ist die Buchung löschbar.')
                                        } else {
                                            notify('error', friendlyError(e))
                                        }
                                    }
                                }}>{allowVoucherDeletion ? 'Ja, löschen' : 'Ja, stornieren'}</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Voucher Info Modal */}
                {infoVoucher && (
                    <VoucherInfoModal
                        voucher={infoVoucher}
                        onClose={() => setInfoVoucher(null)}
                        eurFmt={eurFmt}
                        fmtDate={fmtDate}
                        notify={notify}
                        earmarks={earmarks}
                        budgets={budgetsForEdit}
                        tagDefs={tagDefs}
                        allowVoucherDeletion={allowVoucherDeletion}
                        windowMode={bookingsOpenDetached}
                        onSaveMeta={async (payload) => {
                            const res = await window.api?.vouchers.updateMeta?.({
                                id: infoVoucher.id,
                                note: payload.note,
                                budgets: payload.budgets,
                                earmarks: payload.earmarks,
                                tags: payload.tags
                            })
                            if (!res) throw new Error('Buchungsdetails konnten nicht gespeichert werden.')
                            const refreshed = await window.api?.vouchers.list?.({ limit: 1, voucherIds: [infoVoucher.id] })
                            const next = refreshed?.rows?.[0] as VoucherRow | undefined
                            if (next) {
                                setInfoVoucher(next)
                                voucherTooltipCache.current.set(next.id, next)
                            } else {
                                setInfoVoucher((cur) => cur ? {
                                    ...cur,
                                    note: payload.note,
                                    tags: payload.tags,
                                    budgets: payload.budgets.map((b) => ({
                                        budgetId: b.budgetId,
                                        amount: b.amount,
                                        label: budgetsForEdit.find((budget) => budget.id === b.budgetId)?.label
                                    })),
                                    earmarksAssigned: payload.earmarks.map((e) => {
                                        const found = earmarks.find((em) => em.id === e.earmarkId)
                                        return {
                                            earmarkId: e.earmarkId,
                                            amount: e.amount,
                                            code: found?.code,
                                            name: found?.name,
                                            color: found?.color
                                        }
                                    })
                                } : cur)
                            }
                            await loadRecent()
                            window.dispatchEvent(new Event('data-changed'))
                        }}
                        onReverse={() => {
                            setDeleteRow({ id: infoVoucher.id, voucherNo: infoVoucher.voucherNo, description: infoVoucher.description ?? null, fromEdit: false })
                        }}
                        onOpenAttachments={() => {
                            onOpenVoucherAttachments?.({
                                voucherId: infoVoucher.id,
                                voucherNo: infoVoucher.voucherNo,
                                date: infoVoucher.date,
                                description: infoVoucher.description || '',
                            })
                            setInfoVoucher(null)
                        }}
                    />
                )}
            </div>
        </div>
    )
}
