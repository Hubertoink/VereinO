import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ICONS } from './utils/icons'
import ReportsView from './views/Reports/ReportsView'
import ActivityReportEditorModal from './views/Reports/ActivityReportEditorModal'
import { SettingsView } from './views/Settings/SettingsView'
import DashboardView from './views/Dashboard/DashboardView'
import InvoicesView from './views/InvoicesView'
import MembersView from './views/Mitglieder/MembersView'
import ReceiptsView from './views/ReceiptsView'
import DashboardEarmarksPeek from './views/Dashboard/DashboardEarmarksPeek'
import JournalView from './views/Journal/JournalView'
import SubmissionsView from './views/Submissions/SubmissionsView'
import AdvancesView from './views/Advances/AdvancesView'
import { createPortal } from 'react-dom'
import TagModal from './components/modals/TagModal'
import TagsManagerModal from './components/modals/TagsManagerModal'
import AutoBackupPromptModal from './components/modals/AutoBackupPromptModal'
import UpdateAvailableModal, { type UpdateModalState } from './components/modals/UpdateAvailableModal'
import MetaFilterModal from './components/modals/MetaFilterModal'
import TimeFilterModal from './components/modals/TimeFilterModal'
import ExportOptionsModal from './components/modals/ExportOptionsModal'
import AttachmentsModal from './components/modals/AttachmentsModal'
import PaymentsAssignModal from './components/modals/PaymentsAssignModal'
import BatchEarmarkModal from './components/modals/BatchEarmarkModal'
import QuickAddModal from './components/modals/QuickAddModal'
import DbMigrateModal from './DbMigrateModal'
import SmartRestoreModal from './components/modals/SmartRestoreModal'
import SetupWizardModal from './components/modals/SetupWizardModal'
import EarmarkUsageCards from './components/tiles/EarmarkUsageCards'
import BudgetsView from './views/Budgets/BudgetsView'
import EarmarksView from './views/Earmarks/EarmarksView'
import { useQuickAdd } from './hooks/useQuickAdd'
import { ToastProvider, useToast } from './context/ToastContext'
import { UIPreferencesProvider, useUIPreferences } from './context/UIPreferences'
import { AppLayout } from './components/layout/AppLayout'
import { TopNav } from './components/layout/TopNav'
import { SideNav } from './components/layout/SideNav'
import OrgSwitcher from './components/common/OrgSwitcher'
import type { NavKey } from './utils/navItems'
import { navItems } from './utils/navItems'
import { getNavIcon } from './utils/navIcons'
import { LeaderShortcuts, type ShortcutCommand } from './components/shortcuts/LeaderShortcuts'
import { shouldPromptDiscardForEdit } from './views/Journal/utils/journalEditDiscardPrompt'
import { shouldPromptDiscardForDraftClose } from './utils/quickAddCloseBehavior'
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

function base64ToFile(name: string, dataBase64: string, mime?: string) {
    const binary = atob(dataBase64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    return new File([bytes], name, { type: mime || '' })
}

function friendlyVoucherError(e: any) {
    const msg = String(e?.message || e || '')
    if (/Zweckbindung.*liegt vor Beginn/i.test(msg)) return 'Warnung: Das Buchungsdatum liegt vor dem Startdatum der ausgewählten Zweckbindung.'
    if (/Zweckbindung.*liegt nach Ende/i.test(msg)) return 'Warnung: Das Buchungsdatum liegt nach dem Enddatum der ausgewählten Zweckbindung.'
    if (/Zweckbindung ist inaktiv/i.test(msg)) return 'Warnung: Die ausgewählte Zweckbindung ist inaktiv und kann nicht verwendet werden.'
    if (/Zweckbindung würde den verfügbaren Rahmen unterschreiten/i.test(msg)) return 'Warnung: Diese Änderung würde den verfügbaren Rahmen der Zweckbindung unterschreiten.'
    if (/UNIQUE constraint failed.*voucher_budgets/i.test(msg)) return 'Fehler: Ein Budget kann nur einmal pro Buchung zugeordnet werden. Bitte entferne doppelte Budget-Einträge.'
    if (/UNIQUE constraint failed.*voucher_earmarks/i.test(msg)) return 'Fehler: Eine Zweckbindung kann nur einmal pro Buchung zugeordnet werden. Bitte entferne doppelte Einträge.'
    if (/UNIQUE constraint failed/i.test(msg)) return 'Fehler: Doppelter Eintrag - diese Kombination existiert bereits.'
    return 'Fehler: ' + msg
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
function TopHeaderOrg({ notify }: { notify?: (type: 'success' | 'error' | 'info', text: string) => void }) {
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
        <div className="inline-flex items-center gap-8">
            <img src={appLogo} alt="VereinO" width={20} height={20} style={{ borderRadius: 4, display: 'block' }} />
            <OrgSwitcher notify={notify} />
            {text ? (
                <div className="helper text-ellipsis" title={text}>{text}</div>
            ) : null}
        </div>
    )
}

type PageShortcutAction = {
    id: string
    key: string
    label: string
    action: () => void
}

function voucherRowToBookingForm(row: any) {
    return {
        ...row,
        id: Number(row?.id),
        date: row?.date || new Date().toISOString().slice(0, 10),
        type: row?.type || 'IN',
        sphere: row?.sphere || 'IDEELL',
        description: row?.description ?? '',
        paymentMethod: row?.paymentMethod ?? undefined,
        paymentAccountId: row?.paymentAccountId ?? null,
        paymentAccountName: row?.paymentAccountName ?? null,
        transferFrom: row?.transferFrom ?? undefined,
        transferTo: row?.transferTo ?? undefined,
        transferFromAccountId: row?.transferFromAccountId ?? null,
        transferFromAccountName: row?.transferFromAccountName ?? null,
        transferToAccountId: row?.transferToAccountId ?? null,
        transferToAccountName: row?.transferToAccountName ?? null,
        mode: row?.amountMode ?? row?.mode ?? ((Number(row?.netAmount ?? 0) > 0 && row?.amountMode !== 'GROSS') ? 'NET' : 'GROSS'),
        netAmount: row?.netAmount ?? undefined,
        grossAmount: row?.grossAmount ?? undefined,
        vatRate: row?.vatRate ?? 0,
        tags: Array.isArray(row?.tags) ? row.tags : [],
        budgets: Array.isArray(row?.budgets) ? row.budgets : [],
        earmarksAssigned: Array.isArray(row?.earmarksAssigned) ? row.earmarksAssigned : []
    }
}

function bookingFormGrossAmount(row: any) {
    if (row?.type === 'TRANSFER') return Number(row?.grossAmount || 0)
    if ((row?.mode ?? 'GROSS') === 'GROSS') return Number(row?.grossAmount || 0)
    const net = Number(row?.netAmount || 0)
    const vatRate = Number(row?.vatRate || 0)
    return Math.round((net * (1 + vatRate / 100)) * 100) / 100
}

function bookingEditTitle(row: any) {
    const desc = String(row?.description || '').trim()
    return desc ? `Buchung (${desc.length > 60 ? desc.slice(0, 60) + '...' : desc}) bearbeiten` : 'Buchung bearbeiten'
}

function voucherMutationBlockReason(row: any) {
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
}

function serializeBookingForm(row: any) {
    if (!row) return ''
    return JSON.stringify({
        date: row.date || '',
        type: row.type || null,
        sphere: row.sphere || null,
        description: (row.description || '').trim(),
        paymentMethod: row.paymentMethod || null,
        paymentAccountId: row.paymentAccountId || null,
        transferFrom: row.transferFrom || null,
        transferTo: row.transferTo || null,
        transferFromAccountId: row.transferFromAccountId || null,
        transferToAccountId: row.transferToAccountId || null,
        mode: row.mode || 'GROSS',
        grossAmount: Number(row.grossAmount ?? 0),
        netAmount: Number(row.netAmount ?? 0),
        vatRate: Number(row.vatRate ?? 0),
        tags: Array.isArray(row.tags) ? [...row.tags].sort() : [],
        budgets: Array.isArray(row.budgets)
            ? [...row.budgets].map((b: any) => ({ budgetId: Number(b.budgetId || 0), amount: Number(b.amount || 0) })).sort((a: any, b: any) => a.budgetId - b.budgetId || a.amount - b.amount)
            : [],
        earmarksAssigned: Array.isArray(row.earmarksAssigned)
            ? [...row.earmarksAssigned].map((e: any) => ({ earmarkId: Number(e.earmarkId || 0), amount: Number(e.amount || 0) })).sort((a: any, b: any) => a.earmarkId - b.earmarkId || a.amount - b.amount)
            : []
    })
}

function buildVoucherUpdatePayloadFromForm(row: any): { payload?: any; error?: string } {
    if (!row?.id) return { error: 'Buchung konnte nicht gespeichert werden: ID fehlt.' }
    const blockReason = voucherMutationBlockReason(row)
    if (blockReason) return { error: blockReason }
    if (row.type === 'TRANSFER' && (!row.transferFromAccountId || !row.transferToAccountId)) {
        return { error: 'Bitte wähle Quell- und Zielkonto für den Transfer aus.' }
    }

    const budgets = Array.isArray(row.budgets)
        ? row.budgets
            .filter((b: any) => b.budgetId && Number(b.amount) > 0)
            .map((b: any) => ({ budgetId: Number(b.budgetId), amount: Number(b.amount) }))
        : []
    const earmarks = Array.isArray(row.earmarksAssigned)
        ? row.earmarksAssigned
            .filter((e: any) => e.earmarkId && Number(e.amount) > 0)
            .map((e: any) => ({ earmarkId: Number(e.earmarkId), amount: Number(e.amount) }))
        : []

    const budgetIds = budgets.map((b: any) => b.budgetId)
    if (new Set(budgetIds).size !== budgetIds.length) {
        return { error: 'Ein Budget kann nur einmal pro Buchung zugeordnet werden. Bitte entferne die doppelten Einträge.' }
    }
    const earmarkIds = earmarks.map((e: any) => e.earmarkId)
    if (new Set(earmarkIds).size !== earmarkIds.length) {
        return { error: 'Eine Zweckbindung kann nur einmal pro Buchung zugeordnet werden. Bitte entferne die doppelten Einträge.' }
    }

    const grossAmount = bookingFormGrossAmount(row)
    const totalBudgetAmount = budgets.reduce((sum: number, b: any) => sum + Number(b.amount || 0), 0)
    if (totalBudgetAmount > grossAmount * 1.001) {
        return { error: `Die Summe der Budget-Beträge (${totalBudgetAmount.toFixed(2)} €) übersteigt den Buchungsbetrag (${grossAmount.toFixed(2)} €).` }
    }
    const totalEarmarkAmount = earmarks.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0)
    if (totalEarmarkAmount > grossAmount * 1.001) {
        return { error: `Die Summe der Zweckbindungs-Beträge (${totalEarmarkAmount.toFixed(2)} €) übersteigt den Buchungsbetrag (${grossAmount.toFixed(2)} €).` }
    }

    const payload: any = {
        id: Number(row.id),
        date: row.date,
        description: row.description ?? null,
        type: row.type,
        sphere: row.sphere,
        earmarkId: earmarks.length > 0 ? earmarks[0].earmarkId : null,
        earmarkAmount: earmarks.length > 0 ? earmarks[0].amount : null,
        budgetId: budgets.length > 0 ? budgets[0].budgetId : null,
        budgetAmount: budgets.length > 0 ? budgets[0].amount : null,
        budgets,
        earmarks,
        tags: Array.isArray(row.tags) ? row.tags : []
    }

    if (row.type === 'TRANSFER') {
        payload.paymentMethod = null
        payload.paymentAccountId = null
        payload.transferFrom = row.transferFrom ?? null
        payload.transferTo = row.transferTo ?? null
        payload.transferFromAccountId = row.transferFromAccountId ?? null
        payload.transferToAccountId = row.transferToAccountId ?? null
        payload.grossAmount = Number(row.grossAmount || 0)
        payload.vatRate = 0
        payload.amountMode = 'GROSS'
    } else {
        payload.paymentMethod = row.paymentMethod ?? null
        payload.paymentAccountId = row.paymentAccountId ?? null
        payload.transferFrom = null
        payload.transferTo = null
        payload.transferFromAccountId = null
        payload.transferToAccountId = null
        if ((row.mode ?? 'GROSS') === 'GROSS') {
            payload.grossAmount = Number(row.grossAmount || 0)
            payload.vatRate = 0
            payload.amountMode = 'GROSS'
        } else {
            payload.netAmount = Number(row.netAmount || 0)
            payload.vatRate = Number(row.vatRate || 0)
            payload.amountMode = 'NET'
        }
    }

    return { payload }
}

function DetachedQuickAddWindow() {
    const { notify } = useToast()
    const { quickAddAfterSave, allowVoucherDeletion, showBookingDraftTabs, showBookingEditTabs } = useUIPreferences()
    const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
    const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])
    const fmtDate = useCallback((s?: string) => s || '', [])
    const fileInputRef = useRef<HTMLInputElement | null>(null)
    const openedRef = useRef(false)
    const detachedDraftIdRef = useRef<string>('')
    const [loaded, setLoaded] = useState(false)
    const [earmarks, setEarmarks] = useState<Array<{ id: number; code: string; name: string; color?: string | null; startDate?: string | null; endDate?: string | null; enforceTimeRange?: number }>>([])
    const [budgets, setBudgets] = useState<Array<{ id: number; year: number; categoryName?: string | null; projectName?: string | null; name?: string | null; startDate?: string | null; endDate?: string | null; color?: string | null; isArchived?: number; enforceTimeRange?: number; earmarkId?: number | null }>>([])
    const [paymentAccounts, setPaymentAccounts] = useState<Array<{ id: number; name: string; kind: 'CASH' | 'BANK' | 'PAYPAL' | 'CARD' | 'OTHER'; iban?: string | null; color?: string | null; sortOrder: number; isActive: number }>>([])
    const [tagDefs, setTagDefs] = useState<Array<{ id: number; name: string; color?: string | null; usage?: number }>>([])
    const [descSuggest, setDescSuggest] = useState<string[]>([])
    const [windowModeKind, setWindowModeKind] = useState<'create' | 'edit'>('create')
    const [editQa, setEditQa] = useState<any | null>(null)
    const [editFiles, setEditFiles] = useState<File[]>([])
    const [editExistingFiles, setEditExistingFiles] = useState<Array<{ id: number; fileName: string }>>([])
    const [editExistingFilesLoading, setEditExistingFilesLoading] = useState(false)
    const [editInitialSnapshot, setEditInitialSnapshot] = useState('')
    const [confirmDiscardEdit, setConfirmDiscardEdit] = useState(false)
    const [confirmDiscardCreate, setConfirmDiscardCreate] = useState(false)
    const [confirmDeleteEdit, setConfirmDeleteEdit] = useState(false)

    const budgetsForEdit = useMemo(() => {
        const byIdEarmark = new Map(earmarks.map(e => [e.id, e]))
        return budgets.map((budget: any) => {
            let label = ''
            if (budget.name && String(budget.name).trim()) label = String(budget.name).trim()
            else if (budget.categoryName && String(budget.categoryName).trim()) label = `${budget.year} - ${budget.categoryName}`
            else if (budget.projectName && String(budget.projectName).trim()) label = `${budget.year} - ${budget.projectName}`
            else if (budget.earmarkId) {
                const earmark = byIdEarmark.get(budget.earmarkId)
                if (earmark) label = `${budget.year} - ${earmark.code}`
            }
            if (!label) label = String(budget.year)
            return {
                id: budget.id,
                label,
                year: budget.year,
                startDate: budget.startDate ?? null,
                endDate: budget.endDate ?? null,
                enforceTimeRange: budget.enforceTimeRange ?? 0,
                isArchived: budget.isArchived ?? 0,
                color: budget.color ?? null
            }
        })
    }, [budgets, earmarks])

    const {
        quickAdd,
        qa,
        setQa,
        onQuickSave,
        files,
        setFiles,
        openFilePicker,
        onDropFiles,
        openQuickAdd
    } = useQuickAdd(
        today,
        async (payload: any) => {
            try {
                const res = await window.api?.vouchers.create?.(payload)
                if (res) {
                    notify('success', `Beleg erstellt: #${res.voucherNo} (Brutto ${res.grossAmount})`)
                    const warnings = (res as any).warnings as string[] | undefined
                    if (warnings?.length) warnings.forEach((msg) => notify('info', 'Warnung: ' + msg))
                    await window.api?.quickAdd?.notifySaved?.({ ...res, draftId: detachedDraftIdRef.current })
                }
                return res
            } catch (e: any) {
                notify('error', friendlyVoucherError(e))
                return null
            }
        },
        () => fileInputRef.current?.click(),
        notify,
        false,
        quickAddAfterSave
    )

    useEffect(() => {
        let cancelled = false
        async function loadLookups() {
            try {
                const [bindingsRes, budgetsRes, paymentAccountsRes, tagsRes] = await Promise.all([
                    window.api?.bindings?.list?.({ activeOnly: true }),
                    window.api?.budgets?.list?.({ includeArchived: true } as any),
                    window.api?.paymentAccounts?.list?.(),
                    window.api?.tags?.list?.({ includeUsage: true })
                ])
                if (cancelled) return
                setEarmarks((bindingsRes as any)?.rows || [])
                setBudgets((budgetsRes as any)?.rows || [])
                setPaymentAccounts((paymentAccountsRes as any)?.rows || [])
                setTagDefs((tagsRes as any)?.rows || [])
            } catch {
                if (!cancelled) notify('error', 'Stammdaten für das Buchungsfenster konnten nicht geladen werden.')
            }
        }
        loadLookups()
        return () => { cancelled = true }
    }, [notify])

    useEffect(() => {
        if (openedRef.current) return
        let cancelled = false
        async function openInitialDraft() {
            const token = new URLSearchParams(window.location.search).get('token') || ''
            let initial: any = null
            try {
                if (token) {
                    const res = await window.api?.quickAdd?.detachedInitial?.({ token })
                    initial = res?.initial || null
                }
            } catch { }
            if (cancelled || openedRef.current) return
            detachedDraftIdRef.current = String(initial?.draftId || token || '')
            const initialFiles = Array.isArray(initial?.files)
                ? initial.files.map((file: any) => base64ToFile(String(file.name || 'Datei'), String(file.dataBase64 || ''), file.mime))
                : []
            openedRef.current = true
            if (initial?.mode === 'edit') {
                const form = voucherRowToBookingForm(initial?.qa || initial?.voucher || { id: initial?.voucherId })
                setWindowModeKind('edit')
                setEditQa(form)
                setEditFiles(initialFiles)
                setEditInitialSnapshot(serializeBookingForm(form))
            } else {
                setWindowModeKind('create')
                openQuickAdd(initial?.qa ? { qa: initial.qa, files: initialFiles } : undefined)
            }
            setLoaded(true)
        }
        openInitialDraft()
        return () => { cancelled = true }
    }, [openQuickAdd])

    useEffect(() => {
        if (!quickAdd || descSuggest.length > 0) return
        let cancelled = false
        async function loadSuggestions() {
            try {
                const res = await window.api?.vouchers?.recent?.({ limit: 50 })
                const uniq = new Set<string>()
                for (const row of ((res as any)?.rows || [])) {
                    const description = String(row.description || '').trim()
                    if (description) uniq.add(description)
                    if (uniq.size >= 50) break
                }
                if (!cancelled) setDescSuggest(Array.from(uniq))
            } catch { }
        }
        loadSuggestions()
        return () => { cancelled = true }
    }, [quickAdd, descSuggest.length])

    useEffect(() => {
        if (windowModeKind === 'create' && openedRef.current && loaded && !quickAdd) {
            window.api?.window?.confirmClose?.()
        }
    }, [loaded, quickAdd, windowModeKind])

    const isCreateDraftDirty = useCallback(() => {
        if (!qa) return false
        const draft = qa as any
        const textFields = ['description', 'voucherNo', 'note', 'receiptNo']
        if (textFields.some((key) => String(draft?.[key] ?? '').trim())) return true
        if (Number(draft?.grossAmount || 0) > 0 || Number(draft?.netAmount || 0) > 0) return true
        if (draft?.budgetId || draft?.earmarkId || draft?.tagIds?.length) return true
        if (files.length > 0) return true
        return false
    }, [files.length, qa])

    const requestCloseDetachedCreate = useCallback(() => {
        if (shouldPromptDiscardForDraftClose({
            showBookingDraftTabs,
            hasUnsavedChanges: isCreateDraftDirty()
        })) {
            setConfirmDiscardCreate(true)
            return
        }
        if (showBookingDraftTabs && detachedDraftIdRef.current) {
            const draftId = detachedDraftIdRef.current
            void (async () => {
                try {
                    const encodedFiles = await Promise.all(files.map(async (file) => ({
                        name: file.name,
                        dataBase64: bufferToBase64Safe(await file.arrayBuffer()),
                        mime: file.type || undefined
                    })))
                    await window.api?.quickAdd?.syncDraft?.({ draftId, qa, files: encodedFiles, detached: false })
                } catch {
                    // Closing the detached window should still succeed even if the last sync fails.
                }
                await window.api?.window?.confirmClose?.()
            })()
            return
        }
        window.api?.window?.confirmClose?.()
    }, [files, isCreateDraftDirty, qa, showBookingDraftTabs])

    useEffect(() => {
        const draftId = detachedDraftIdRef.current
        if (!loaded || !quickAdd || !draftId) return
        const timeout = window.setTimeout(() => {
            void window.api?.quickAdd?.syncDraft?.({ draftId, qa })
        }, 200)
        return () => window.clearTimeout(timeout)
    }, [loaded, quickAdd, qa])

    useEffect(() => {
        const draftId = detachedDraftIdRef.current
        if (!loaded || !quickAdd || !draftId) return
        let cancelled = false
        async function syncFiles() {
            const encoded = await Promise.all(files.map(async (file) => ({
                name: file.name,
                dataBase64: bufferToBase64Safe(await file.arrayBuffer()),
                mime: file.type || undefined
            })))
            if (!cancelled) void window.api?.quickAdd?.syncDraft?.({ draftId, files: encoded })
        }
        syncFiles()
        return () => { cancelled = true }
    }, [files, loaded, quickAdd])

    const refreshEditAttachments = useCallback(async (voucherId: number) => {
        setEditExistingFilesLoading(true)
        try {
            const res = await window.api?.attachments.list?.({ voucherId })
            setEditExistingFiles((res as any)?.files || (res as any)?.rows || [])
        } catch {
            setEditExistingFiles([])
        } finally {
            setEditExistingFilesLoading(false)
        }
    }, [])

    useEffect(() => {
        if (windowModeKind !== 'edit' || !editQa?.id) return
        void refreshEditAttachments(Number(editQa.id))
    }, [editQa?.id, refreshEditAttachments, windowModeKind])

    const saveDetachedEdit = useCallback(async () => {
        if (!editQa?.id) return
        const { payload, error } = buildVoucherUpdatePayloadFromForm(editQa)
        if (error) {
            notify('error', error)
            return
        }
        try {
            const res = await window.api?.vouchers.update?.(payload)
            for (const file of editFiles) {
                const dataBase64 = bufferToBase64Safe(await file.arrayBuffer())
                await window.api?.attachments.add?.({ voucherId: Number(editQa.id), fileName: file.name, dataBase64, mimeType: file.type || undefined })
            }
            notify('success', 'Buchung gespeichert')
            const warnings = (res as any)?.warnings as string[] | undefined
            if (warnings?.length) warnings.forEach((msg) => notify('info', 'Warnung: ' + msg))
            await window.api?.quickAdd?.notifySaved?.({ id: Number(editQa.id), draftId: detachedDraftIdRef.current, mode: 'edit' })
            window.api?.window?.confirmClose?.()
        } catch (e: any) {
            notify('error', friendlyVoucherError(e))
        }
    }, [editFiles, editQa, notify])

    const requestCloseDetachedEdit = useCallback(() => {
        if (shouldPromptDiscardForEdit({
            showBookingEditTabs,
            hasUnsavedChanges: Boolean(editQa && (serializeBookingForm(editQa) !== editInitialSnapshot || editFiles.length > 0))
        })) {
            setConfirmDiscardEdit(true)
            return
        }
        window.api?.window?.confirmClose?.()
    }, [editFiles.length, editInitialSnapshot, editQa, showBookingEditTabs])

    useEffect(() => {
        return window.api?.window?.onCloseRequested?.(() => {
            if (windowModeKind === 'edit') {
                requestCloseDetachedEdit()
                return
            }
            requestCloseDetachedCreate()
        })
    }, [requestCloseDetachedCreate, requestCloseDetachedEdit, windowModeKind])

    const deleteDetachedEdit = useCallback(async () => {
        if (!editQa?.id) return
        const blockReason = voucherMutationBlockReason(editQa)
        if (blockReason) {
            setConfirmDeleteEdit(false)
            notify('info', blockReason)
            return
        }
        try {
            if (allowVoucherDeletion) {
                await window.api?.vouchers.delete?.({ id: Number(editQa.id) })
                notify('success', 'Buchung gelöscht')
                await window.api?.quickAdd?.notifySaved?.({ id: Number(editQa.id), draftId: detachedDraftIdRef.current, mode: 'delete', deleted: true })
            } else {
                const res = await window.api?.vouchers.reverse?.({ originalId: Number(editQa.id), reason: 'Storno statt Löschen' })
                notify('success', `Storno erstellt: #${res?.voucherNo || ''}`)
                await window.api?.quickAdd?.notifySaved?.({ id: res?.id, originalId: Number(editQa.id), draftId: detachedDraftIdRef.current, mode: 'reverse' })
            }
            window.api?.window?.confirmClose?.()
        } catch (e: any) {
            notify('error', e?.message || String(e))
        }
    }, [allowVoucherDeletion, editQa, notify])

    useEffect(() => {
        if (windowModeKind !== 'edit' || !editQa) return
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault()
                void saveDetachedEdit()
                return
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') {
                e.preventDefault()
                const blockReason = voucherMutationBlockReason(editQa)
                if (blockReason) {
                    notify('info', blockReason)
                    return
                }
                fileInputRef.current?.click()
                return
            }
            if (e.key === 'Escape') {
                e.preventDefault()
                requestCloseDetachedEdit()
            }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [editQa, notify, requestCloseDetachedEdit, saveDetachedEdit, windowModeKind])

    if (!loaded || (windowModeKind === 'create' && !quickAdd) || (windowModeKind === 'edit' && !editQa)) {
        return <div className="detached-quick-add-loading">Buchungsfenster wird vorbereitet...</div>
    }

    if (windowModeKind === 'edit' && editQa) {
        const editMutationBlockReason = voucherMutationBlockReason(editQa)
        return (
            <>
                <QuickAddModal
                    qa={editQa}
                    setQa={setEditQa}
                    onSave={saveDetachedEdit}
                    saveLabel="Speichern"
                    showSaveMenu={false}
                    footerLeft={(
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                            {editMutationBlockReason ? (
                                <div className="helper">{editMutationBlockReason}</div>
                            ) : (
                                <button type="button" className="btn danger" title={allowVoucherDeletion ? 'Löschen' : 'Stornieren'} onClick={() => setConfirmDeleteEdit(true)}>
                                    {allowVoucherDeletion ? 'Löschen' : 'Stornieren'}
                                </button>
                            )}
                            <div className="helper">Ctrl+S = Speichern · Ctrl+U = Datei hinzufügen · Esc = Abbrechen</div>
                        </div>
                    )}
                    onClose={requestCloseDetachedEdit}
                    onRequestClose={requestCloseDetachedEdit}
                    confirmingClose={confirmDiscardEdit}
                    onConfirmDiscard={() => window.api?.window?.confirmClose?.()}
                    onCancelDiscard={() => { setConfirmDiscardEdit(false); void window.api?.window?.cancelClose?.() }}
                    files={editFiles}
                    setFiles={setEditFiles}
                    openFilePicker={() => {
                        if (editMutationBlockReason) {
                            notify('info', editMutationBlockReason)
                            return
                        }
                        fileInputRef.current?.click()
                    }}
                    onDropFiles={(fileList) => {
                        if (editMutationBlockReason) {
                            notify('info', editMutationBlockReason)
                            return
                        }
                        if (!fileList) return
                        setEditFiles((prev) => [...prev, ...Array.from(fileList)])
                    }}
                    fileInputRef={fileInputRef}
                    fmtDate={fmtDate}
                    eurFmt={eurFmt}
                    budgetsForEdit={budgetsForEdit}
                    earmarks={earmarks}
                    paymentAccounts={paymentAccounts}
                    tagDefs={tagDefs}
                    descSuggest={descSuggest}
                    title={bookingEditTitle(editQa)}
                    existingFiles={editExistingFiles}
                    existingFilesLoading={editExistingFilesLoading}
                    onOpenExistingFile={(fileId) => { void window.api?.attachments.open?.({ fileId }) }}
                    onDownloadExistingFile={async (fileId) => {
                        try {
                            const res = await window.api?.attachments.saveAs?.({ fileId })
                            if (res?.filePath) notify('success', 'Gespeichert: ' + res.filePath)
                        } catch (e: any) {
                            const msg = String(e?.message || e)
                            if (!/Abbruch/i.test(msg)) notify('error', 'Speichern fehlgeschlagen: ' + msg)
                        }
                    }}
                    onDeleteExistingFile={async (file) => {
                        if (editMutationBlockReason) {
                            notify('info', editMutationBlockReason)
                            return
                        }
                        try {
                            await window.api?.attachments.delete?.({ fileId: file.id })
                            await refreshEditAttachments(Number(editQa.id))
                            notify('success', 'Anhang gelöscht')
                        } catch (e: any) {
                            notify('error', e?.message || String(e))
                        }
                    }}
                    windowMode
                />
                {confirmDeleteEdit && !editMutationBlockReason && (
                    <div className="modal-overlay" role="dialog" aria-modal="true" style={{ zIndex: 10000 }}>
                        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, display: 'grid', gap: 12 }}>
                            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h2 style={{ margin: 0 }}>{allowVoucherDeletion ? 'Buchung löschen' : 'Buchung stornieren'}</h2>
                                <button className="btn ghost" onClick={() => setConfirmDeleteEdit(false)} aria-label="Schließen">✕</button>
                            </header>
                            <p style={{ margin: 0 }}>
                                {allowVoucherDeletion
                                    ? 'Möchtest du diese Buchung wirklich löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.'
                                    : 'Möchtest du diese Buchung stornieren? Die Originalbuchung bleibt erhalten und es wird eine Gegenbuchung erstellt.'}
                            </p>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                <button className="btn" onClick={() => setConfirmDeleteEdit(false)}>Abbrechen</button>
                                <button className="btn danger" onClick={() => { void deleteDetachedEdit() }}>
                                    {allowVoucherDeletion ? 'Ja, löschen' : 'Ja, stornieren'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </>
        )
    }

    return (
        <QuickAddModal
            qa={qa}
            setQa={setQa}
            onSave={onQuickSave}
            onSaveAndNew={() => onQuickSave('new')}
            onSaveAndClose={() => onQuickSave('close')}
            afterSaveDefault={quickAddAfterSave}
            onClose={requestCloseDetachedCreate}
            onRequestClose={requestCloseDetachedCreate}
            files={files}
            setFiles={setFiles}
            openFilePicker={openFilePicker}
            onDropFiles={onDropFiles}
            fileInputRef={fileInputRef}
            fmtDate={fmtDate}
            eurFmt={eurFmt}
            budgetsForEdit={budgetsForEdit}
            earmarks={earmarks}
            paymentAccounts={paymentAccounts}
            tagDefs={tagDefs}
            descSuggest={descSuggest}
            windowMode
            confirmingClose={confirmDiscardCreate}
            onConfirmDiscard={() => window.api?.window?.confirmClose?.()}
            onCancelDiscard={() => { setConfirmDiscardCreate(false); void window.api?.window?.cancelClose?.() }}
        />
    )
}

function AppInner() {
    // Use toast context
    const { notify } = useToast()
    
    // Use UI preferences context
    const {
        navLayout,
        setNavLayout,
        sidebarCollapsed,
        setSidebarCollapsed,
        colorTheme,
        setColorTheme,
        navIconColorMode,
        setNavIconColorMode,
        dateFormat,
        setDateFormat,
        journalRowStyle,
        setJournalRowStyle,
        journalRowDensity,
        setJournalRowDensity,
        backgroundImage,
        setBackgroundImage,
        customBackgroundImage,
        setCustomBackgroundImage,
        glassModals,
        setGlassModals,
        showBookingDraftTabs,
        setShowBookingDraftTabs,
        showBookingEditTabs,
        setShowBookingEditTabs,
        bookingsOpenDetached,
        setBookingsOpenDetached,
        allowVoucherDeletion,
        setAllowVoucherDeletion,
        quickAddAfterSave,
        setQuickAddAfterSave
    } = useUIPreferences()

    // ── Auto-switch: force side-nav when window is too narrow for top-nav ──
    const NAV_SWITCH_THRESHOLD = 960
    const [narrowOverride, setNarrowOverride] = useState(false)

    useEffect(() => {
        const check = () => setNarrowOverride(window.innerWidth < NAV_SWITCH_THRESHOLD)
        check() // initial
        window.addEventListener('resize', check)
        return () => window.removeEventListener('resize', check)
    }, [])

    // Effective layout: user preference wins when wide enough, side-nav forced when narrow
    const effectiveNavLayout = (narrowOverride && navLayout === 'top') ? 'left' : navLayout

    // Pending submissions count for nav badge
    const [pendingSubmissionsCount, setPendingSubmissionsCount] = useState(0)
    useEffect(() => {
        let cancelled = false
        async function loadPendingCount() {
            try {
                // Use limit: 1 and total from API (efficient count)
                const res = await (window as any).api?.submissions?.list?.({ status: 'pending', limit: 1 })
                if (!cancelled) {
                    setPendingSubmissionsCount(res?.total || 0)
                }
            } catch { /* ignore */ }
        }
        loadPendingCount()
        const onChanged = () => loadPendingCount()
        window.addEventListener('data-changed', onChanged)
        return () => { cancelled = true; window.removeEventListener('data-changed', onChanged) }
    }, [])
    
    // Open invoices count for nav badge
    const [openInvoicesCount, setOpenInvoicesCount] = useState(0)
    useEffect(() => {
        let cancelled = false
        async function loadOpenCount() {
            try {
                // Count OPEN and PARTIAL invoices using total from API (limit: 1 to minimize data transfer)
                const resOpen = await (window as any).api?.invoices?.list?.({ status: 'OPEN', limit: 1 })
                const resPartial = await (window as any).api?.invoices?.list?.({ status: 'PARTIAL', limit: 1 })
                if (!cancelled) {
                    const openCount = (resOpen?.total || 0) + (resPartial?.total || 0)
                    setOpenInvoicesCount(openCount)
                }
            } catch { /* ignore */ }
        }
        loadOpenCount()
        const onChanged = () => loadOpenCount()
        window.addEventListener('data-changed', onChanged)
        return () => { cancelled = true; window.removeEventListener('data-changed', onChanged) }
    }, [])
    
    // Global data refresh key to trigger summary re-fetches across views
    const [refreshKey, setRefreshKey] = useState(0)
    const bumpDataVersion = () => setRefreshKey((k) => k + 1)
    const [lastId, setLastId] = useState<number | null>(null) // Track last created voucher id
    const [flashId, setFlashId] = useState<number | null>(null) // Row highlight for newly created voucher

    useEffect(() => {
        const off = window.api?.quickAdd?.onSaved?.((payload: any) => {
            const id = typeof payload?.id === 'number' ? payload.id : null
            if (id != null && !payload?.deleted) {
                setLastId(id)
                setFlashId(id)
                window.setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 3000)
            }
            bumpDataVersion()
            window.dispatchEvent(new Event('data-changed'))
        })
        return () => { if (typeof off === 'function') off() }
    }, [])

    // Map backend errors to friendlier messages (esp. earmark period issues)
    const friendlyError = friendlyVoucherError
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
    const [activePage, setActivePage] = useState<NavKey>(() => {
        try { return (localStorage.getItem('activePage') as NavKey) || 'Buchungen' } catch { return 'Buchungen' }
    })
    const [registeredPageShortcuts, setRegisteredPageShortcuts] = useState<PageShortcutAction[]>([])
    const registerPageShortcuts = useCallback((shortcuts: PageShortcutAction[]) => {
        setRegisteredPageShortcuts(shortcuts)
    }, [])
    // When switching to Reports, bump a key to trigger chart re-measures
    const [reportsActivateKey, setReportsActivateKey] = useState(0)
    useEffect(() => {
        if (activePage === 'Reports') setReportsActivateKey((k) => k + 1)
    }, [activePage])

    // Auto-backup prompt (renderer-side modal)
    const [autoBackupPrompt, setAutoBackupPrompt] = useState<null | { intervalDays: number }>(null)
    const [updatePrompt, setUpdatePrompt] = useState<UpdateModalState | null>(null)
    const updatePromptRef = useRef<UpdateModalState | null>(null)
    const autoUpdateCheckInFlight = useRef(false)
    const startupUpdateNoticeShown = useRef(false)

    useEffect(() => {
        updatePromptRef.current = updatePrompt
    }, [updatePrompt])

    // Pre-update backup toast (sent from main process)
    useEffect(() => {
        const offOk = (window as any).api?.db?.onPreUpdateBackup?.((info: { fromVersion: string; toVersion: string; filePath: string; dir: string }) => {
            notify(
                'success',
                `Update erkannt (${info.fromVersion} → ${info.toVersion}). Sicherheits-Backup erstellt.`,
                9000,
                {
                    label: 'Ordner öffnen',
                    onClick: () => {
                        try { (window as any).api?.backup?.openFolder?.() } catch { }
                    }
                }
            )
        })

        const offFail = (window as any).api?.db?.onPreUpdateBackupFailed?.((info: { fromVersion: string; toVersion: string; error: string }) => {
            notify(
                'warn',
                `Update erkannt (${info.fromVersion} → ${info.toVersion}), aber Sicherheits-Backup fehlgeschlagen: ${info.error}`,
                12000,
                {
                    label: 'Backup-Ordner',
                    onClick: () => {
                        try { (window as any).api?.backup?.openFolder?.() } catch { }
                    }
                }
            )
        })

        return () => {
            try { offOk?.() } catch { }
            try { offFail?.() } catch { }
        }
    }, [notify])
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

    const showStartupUpdateNotice = useCallback((state: UpdateModalState) => {
        if (startupUpdateNoticeShown.current) return
        startupUpdateNoticeShown.current = true
        const version = state.availableVersion || state.downloadedVersion
        notify(
            'info',
            version ? `VereinO ${version} ist verfügbar.` : 'Ein Update für VereinO ist verfügbar.',
            10000,
            {
                label: 'Einstellungen öffnen',
                onClick: () => {
                    setActivePage('Einstellungen')
                    window.setTimeout(() => {
                        window.dispatchEvent(new CustomEvent('settings:selectTile', { detail: { tile: 'general' } }))
                    }, 0)
                }
            }
        )
    }, [notify])

    useEffect(() => {
        let disposed = false

        const off = window.api?.updates?.onStateChanged?.((state) => {
            if (disposed || !state) return
            if (state.status === 'available' || state.status === 'downloaded') {
                if (autoUpdateCheckInFlight.current) {
                    showStartupUpdateNotice(state as UpdateModalState)
                } else if (updatePromptRef.current) {
                    setUpdatePrompt(state as UpdateModalState)
                }
                return
            }
            if (updatePromptRef.current && (state.status === 'downloading' || state.status === 'error')) {
                setUpdatePrompt(state as UpdateModalState)
            }
        })

        ;(async () => {
            try {
                const initial = await window.api?.updates?.getState?.()
                if (initial?.status === 'unsupported') return

                const enabled = (await window.api?.settings?.get?.({ key: 'updates.autoCheck' }))?.value
                if (enabled === false) return

                autoUpdateCheckInFlight.current = true
                const state = await window.api?.updates?.check?.()
                if (!disposed && (state?.status === 'available' || state?.status === 'downloaded')) {
                    showStartupUpdateNotice(state as UpdateModalState)
                }
            } catch {
                // Automatic checks should stay quiet unless an update is actually found.
            } finally {
                autoUpdateCheckInFlight.current = false
            }
        })()

        return () => {
            disposed = true
            if (typeof off === 'function') off()
        }
    }, [showStartupUpdateNotice])

    const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
    
    // Reports view is unified now; legacy reportsTab retained only for back-compat with localStorage but unused
    const [reportsTab, setReportsTab] = useState<string>(() => {
        try { return 'overview' } catch { return 'overview' }
    })

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
    const [showActivityReportEditor, setShowActivityReportEditor] = useState<boolean>(false)
    type AmountMode = 'POSITIVE_BOTH' | 'OUT_NEGATIVE'
    const [exportFields, setExportFields] = useState<Array<'date' | 'voucherNo' | 'type' | 'sphere' | 'description' | 'status' | 'paymentMethod' | 'netAmount' | 'vatAmount' | 'grossAmount' | 'tags'>>(['date', 'voucherNo', 'type', 'sphere', 'description', 'status', 'paymentMethod', 'netAmount', 'vatAmount', 'grossAmount'])
    const [exportOrgName, setExportOrgName] = useState<string>('')
    const [exportAmountMode, setExportAmountMode] = useState<AmountMode>('OUT_NEGATIVE')
    const [exportSortDir, setExportSortDir] = useState<'ASC' | 'DESC'>('DESC')
    const [exportType, setExportType] = useState<'standard' | 'fiscal' | 'treasurer'>('standard')
    const [fiscalYear, setFiscalYear] = useState<number>(new Date().getFullYear())
    const [includeBindings, setIncludeBindings] = useState<boolean>(false)
    const [includeVoucherList, setIncludeVoucherList] = useState<boolean>(false)
    const [includeBudgets, setIncludeBudgets] = useState<boolean>(false)
    const [includeActivityReport, setIncludeActivityReport] = useState<boolean>(true)

    type FiscalExportOptions = {
        includeBindings?: boolean
        includeVoucherList?: boolean
        includeBudgets?: boolean
        includeActivityReport?: boolean
        includeInactiveBindings?: boolean
        includeArchivedBudgets?: boolean
        selectedBindingIds?: number[]
        selectedBudgetIds?: number[]
    }

    type TreasurerExportOptions = {
        cashBalanceDate?: string
        includeMembers?: boolean
        includeInvoices?: boolean
        includeBindings?: boolean
        includeBudgets?: boolean
        includeTagSummary?: boolean
        includeVoucherList?: boolean
        includeTags?: boolean
        voucherListFrom?: string
        voucherListTo?: string
        voucherListSort?: 'ASC' | 'DESC'
    }

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

    // Global handler: jump from invoice detail (linked booking) to Journal view filtered
    useEffect(() => {
        function onVoucherJump(ev: any) {
            try {
                const detail = ev?.detail || {}
                // Switch to Buchungen view first
                setActivePage('Buchungen')
                // Apply search query or voucherId filter
                if (typeof detail.q === 'string' && detail.q.trim()) {
                    setQ(detail.q)
                    setPage(1)
                } else if (detail.voucherId) {
                    setQ('#' + String(detail.voucherId))
                    setPage(1)
                }
            } catch { /* ignore */ }
        }
        window.addEventListener('apply-voucher-jump' as any, onVoucherJump as any)
        return () => window.removeEventListener('apply-voucher-jump' as any, onVoucherJump as any)
    }, [])

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
    const {
        quickAdd,
        qa,
        setQa,
        onQuickSave,
        files,
        setFiles,
        openFilePicker,
        onDropFiles,
        openQuickAdd,
        parkQuickAdd,
        bookingDrafts,
        activeDraftId,
        reopenDraft,
        closeDraft,
        markDraftDetached,
        markDraftDocked,
        dockAndOpenDraft,
        updateDraft,
        clearDrafts,
        hasOpenDrafts
    } = useQuickAdd(
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
                // JournalView handles reload via refreshKey dependency; bump version to trigger it
                bumpDataVersion()
            }
            return res
        } catch (e: any) {
            notify('error', friendlyError(e))
            return null
        }
    }, () => fileInputRef.current?.click(), notify, showBookingDraftTabs, quickAddAfterSave)

    const detachQuickAdd = useCallback(async () => {
        if (!activeDraftId) return
        try {
            const detachedFiles = await Promise.all(files.map(async (file) => ({
                name: file.name,
                dataBase64: bufferToBase64Safe(await file.arrayBuffer()),
                mime: file.type || undefined
            })))
            const res = await window.api?.quickAdd?.openDetached?.({
                draftId: activeDraftId,
                qa,
                files: detachedFiles,
                afterSaveDefault: quickAddAfterSave
            })
            if (!res?.ok) {
                notify('error', res?.error || 'Buchungsfenster konnte nicht geöffnet werden.')
                return
            }
            markDraftDetached(activeDraftId)
        } catch (e: any) {
            notify('error', 'Buchungsfenster konnte nicht geöffnet werden: ' + String(e?.message || e))
        }
    }, [activeDraftId, files, markDraftDetached, notify, qa, quickAddAfterSave])

    useEffect(() => {
        const off = window.api?.quickAdd?.onDetachedDraftSync?.((payload: any) => {
            const draftId = typeof payload?.draftId === 'string' ? payload.draftId : ''
            if (!draftId) return
            const patch: any = {}
            if (payload.qa) patch.qa = payload.qa
            if (Array.isArray(payload.files)) {
                patch.files = payload.files.map((file: any) => base64ToFile(String(file.name || 'Datei'), String(file.dataBase64 || ''), file.mime))
            }
            if (typeof payload?.detached === 'boolean') {
                patch.detached = payload.detached
            }
            if (Object.keys(patch).length) updateDraft(draftId, patch)
        })
        return () => { if (typeof off === 'function') off() }
    }, [updateDraft])

    useEffect(() => {
        const off = window.api?.quickAdd?.onDetachedClosed?.((payload: any) => {
            const draftId = typeof payload?.draftId === 'string' ? payload.draftId : ''
            if (!draftId) return
            markDraftDocked(draftId)
        })
        return () => { if (typeof off === 'function') off() }
    }, [markDraftDocked])

    useEffect(() => {
        const off = window.api?.quickAdd?.onSaved?.((payload: any) => {
            const draftId = typeof payload?.draftId === 'string' ? payload.draftId : ''
            if (draftId) closeDraft(draftId)
        })
        return () => { if (typeof off === 'function') off() }
    }, [closeDraft])

    const [showOpenBookingTabsClosePrompt, setShowOpenBookingTabsClosePrompt] = useState(false)

    // Recent description suggestions for Quick-Add (autocomplete)
    const [descSuggest, setDescSuggest] = useState<string[]>([])
    useEffect(() => {
        let alive = true
        async function load() {
            try {
                if (!quickAdd) return
                const res = await window.api?.vouchers?.recent?.({ limit: 50 })
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

    const bookingDraftTabs = useMemo(() => {
        return bookingDrafts.map((draft) => {
            const desc = draft.qa.description.trim()
            const dateLabel = fmtDate(draft.qa.date)
            return {
                id: draft.id,
                label: desc ? `${desc} · ${dateLabel}` : `${dateLabel} · #${draft.sequence}`,
                title: `${desc ? `${desc} · ${dateLabel}` : `${dateLabel} · Entwurf ${draft.sequence}`}${draft.detached ? ' · abgedockt' : ''}`,
                isActive: draft.id === activeDraftId,
                isDetached: !!draft.detached
            }
        })
    }, [activeDraftId, bookingDrafts, fmtDate])

    const openBookingDraftTab = useCallback((draftId: string) => {
        const draft = bookingDrafts.find((entry) => entry.id === draftId)
        if (!draft) return

        if (draft.detached || bookingsOpenDetached) {
            void (async () => {
                const focusRes = await window.api?.quickAdd?.focusDetached?.({ draftId })
                if (focusRes?.ok) {
                    markDraftDetached(draftId)
                    return
                }
                const sourceDraft = bookingDrafts.find((entry) => entry.id === draftId)
                if (!sourceDraft) return
                try {
                    const detachedFiles = await Promise.all(sourceDraft.files.map(async (file) => ({
                        name: file.name,
                        dataBase64: bufferToBase64Safe(await file.arrayBuffer()),
                        mime: file.type || undefined
                    })))
                    const res = await window.api?.quickAdd?.openDetached?.({
                        draftId,
                        qa: sourceDraft.qa,
                        files: detachedFiles,
                        afterSaveDefault: quickAddAfterSave
                    })
                    if (!res?.ok) {
                        markDraftDocked(draftId)
                        reopenDraft(draftId)
                        return
                    }
                    markDraftDetached(draftId)
                } catch {
                    markDraftDocked(draftId)
                    reopenDraft(draftId)
                }
            })()
            return
        }
        reopenDraft(draftId)
    }, [bookingDrafts, bookingsOpenDetached, markDraftDetached, markDraftDocked, quickAddAfterSave, reopenDraft])

    const closeBookingDraftTab = useCallback((draftId: string) => {
        const draft = bookingDrafts.find((entry) => entry.id === draftId)
        if (draft?.detached) void window.api?.quickAdd?.closeDetached?.({ draftId })
        closeDraft(draftId)
    }, [bookingDrafts, closeDraft])

    useEffect(() => {
        return window.api?.window?.onCloseRequested?.(() => {
            if (hasOpenDrafts) {
                setShowOpenBookingTabsClosePrompt(true)
                return
            }
            void window.api?.window?.confirmClose?.()
        })
    }, [hasOpenDrafts])

    const confirmCloseWithOpenDrafts = useCallback(() => {
        clearDrafts()
        setShowOpenBookingTabsClosePrompt(false)
        void window.api?.window?.confirmClose?.()
    }, [clearDrafts])

    const cancelCloseWithOpenDrafts = useCallback(() => {
        setShowOpenBookingTabsClosePrompt(false)
    }, [])

    const openBookingEntry = useCallback(() => {
        if (!bookingsOpenDetached) {
            openQuickAdd()
            return
        }
        void (async () => {
            const draft = showBookingDraftTabs ? openQuickAdd(undefined, { detached: true, showModal: false }) : null
            try {
                const res = await window.api?.quickAdd?.openDetached?.({
                    draftId: draft?.id,
                    qa: draft?.qa,
                    files: [],
                    afterSaveDefault: quickAddAfterSave
                })
                if (!res?.ok) {
                    notify('error', res?.error || 'Buchungsfenster konnte nicht geöffnet werden.')
                    if (draft) dockAndOpenDraft(draft.id)
                    else openQuickAdd()
                }
            } catch (e: any) {
                notify('error', 'Buchungsfenster konnte nicht geöffnet werden: ' + String(e?.message || e))
                if (draft) dockAndOpenDraft(draft.id)
                else openQuickAdd()
            }
        })()
    }, [bookingsOpenDetached, dockAndOpenDraft, notify, openQuickAdd, quickAddAfterSave, showBookingDraftTabs])

    // These values are displayed and changed by the global shortcut menu, so they
    // must be initialized before shortcutCommands is created.
    const [page, setPage] = useState<number>(() => { try { return Number(localStorage.getItem('journal.page') || '1') } catch { return 1 } })
    const [journalLimit, setJournalLimit] = useState<number>(50)

    const activePageShortcuts = useMemo<PageShortcutAction[]>(() => {
        const shortcuts = [...registeredPageShortcuts]
        if (activePage === 'Buchungen') {
            shortcuts.unshift({ id: 'journal-quick-add', key: 'q', label: 'Buchung', action: openBookingEntry })
        }
        return shortcuts
    }, [activePage, openBookingEntry, registeredPageShortcuts])

    const navigateAndFocus = useCallback((page: NavKey, selector: string) => {
        setActivePage(page)
        window.setTimeout(() => {
            const input = document.querySelector(selector) as HTMLInputElement | null
            input?.focus()
            input?.select()
        }, 100)
    }, [])

    const openSettingsTile = useCallback((tile: string) => {
        try { sessionStorage.setItem('settingsActiveTile', tile) } catch { /* ignore */ }
        setActivePage('Einstellungen')
        window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent('settings:selectTile', { detail: { tile } }))
        }, 100)
    }, [])

    const shortcutCommands = useMemo<ShortcutCommand[]>(() => {
        const pageActions = activePageShortcuts.map((shortcut) => ({
            key: shortcut.key,
            label: shortcut.label,
            action: shortcut.action
        }))

        return [
            {
                key: 'n',
                label: 'Neue Buchung',
                description: 'Öffnet einen neuen Buchungsentwurf',
                action: openBookingEntry
            },
            {
                key: 'g',
                label: 'Gehe zu …',
                description: 'Bereich in VereinO öffnen',
                children: navItems.map((item) => ({
                    key: ({
                        Dashboard: 'd', Buchungen: 'b', Verbindlichkeiten: 'v', Mitglieder: 'm',
                        Vorschuesse: 'o', Budgets: 'p', Zweckbindungen: 'z', Einreichungen: 'i',
                        Belege: 'l', Reports: 'r', Einstellungen: 'e'
                    } as Record<NavKey, string>)[item.key],
                    label: item.label,
                    icon: <span className={navIconColorMode === 'color' ? `icon-color-${item.key}` : ''}>{getNavIcon(item.key)}</span>,
                    action: () => setActivePage(item.key)
                }))
            },
            {
                key: 's',
                label: 'Suche …',
                description: 'Bereich öffnen und Suchfeld fokussieren',
                children: [
                    { key: 'b', label: 'Buchungen', action: () => navigateAndFocus('Buchungen', '.journal-filter-toolbar__search') },
                    { key: 'v', label: 'Verbindlichkeiten', action: () => navigateAndFocus('Verbindlichkeiten', '.invoices-search') },
                    { key: 'm', label: 'Mitglieder', action: () => navigateAndFocus('Mitglieder', '.members-search') },
                    { key: 'o', label: 'Vorschüsse', action: () => navigateAndFocus('Vorschuesse', 'input[placeholder^="Suchen (Person"]') }
                ]
            },
            ...(pageActions.length ? [{
                key: 'a',
                label: `Aktionen: ${navItems.find((item) => item.key === activePage)?.label ?? activePage} …`,
                description: 'Funktionen des aktuellen Bereichs',
                children: pageActions
            }] : []),
            {
                key: 'e',
                label: 'Einstellungen & Verwaltung …',
                description: 'Häufige Verwaltungsbereiche direkt öffnen',
                icon: <span className={navIconColorMode === 'color' ? 'icon-color-Einstellungen' : ''}>{getNavIcon('Einstellungen')}</span>,
                children: [
                    {
                        key: 'n',
                        label: 'Navigation & Layout …',
                        description: 'Menü und Buchungstabelle direkt anpassen',
                        icon: <span aria-hidden>🧭</span>,
                        children: [
                            {
                                key: 'm', label: 'Menü-Layout …', description: `Aktuell: ${navLayout === 'left' ? 'Links' : 'Oben'}`, children: [
                                    { key: 'l', label: 'Links (klassisch)', action: () => setNavLayout('left') },
                                    { key: 'o', label: 'Oben (Icons)', action: () => setNavLayout('top') }
                                ]
                            },
                            {
                                key: 'h', label: 'Zeilenhöhe …', description: `Aktuell: ${journalRowDensity === 'compact' ? 'Kompakt' : 'Normal'}`, children: [
                                    { key: 'n', label: 'Normal', action: () => setJournalRowDensity('normal') },
                                    { key: 'k', label: 'Kompakt', action: () => setJournalRowDensity('compact') }
                                ]
                            },
                            {
                                key: 'z', label: 'Buchungen: Zeilenlayout …', description: `Aktuell: ${{ both: 'Linien + Zebra', lines: 'Nur Linien', zebra: 'Nur Zebra', none: 'Ohne Linien/Zebra' }[journalRowStyle]}`, children: [
                                    { key: 'l', label: 'Linien + Zebra', action: () => setJournalRowStyle('both') },
                                    { key: 'i', label: 'Nur Linien', action: () => setJournalRowStyle('lines') },
                                    { key: 'z', label: 'Nur Zebra', action: () => setJournalRowStyle('zebra') },
                                    { key: 'o', label: 'Ohne Linien/Zebra', action: () => setJournalRowStyle('none') }
                                ]
                            },
                            { key: 'f', label: 'Farbige Menüicons umschalten', description: `Aktuell: ${navIconColorMode === 'color' ? 'Ein' : 'Aus'}`, action: () => setNavIconColorMode(navIconColorMode === 'color' ? 'mono' : 'color') },
                            { key: 'b', label: 'Buchungsreiter umschalten', description: `Aktuell: ${showBookingDraftTabs ? 'Ein' : 'Aus'}`, action: () => setShowBookingDraftTabs(!showBookingDraftTabs) },
                            { key: 'e', label: 'Eigenes Buchungsfenster umschalten', description: `Aktuell: ${bookingsOpenDetached ? 'Ein' : 'Aus'}`, action: () => setBookingsOpenDetached(!bookingsOpenDetached) },
                            {
                                key: 's', label: 'Nach dem Speichern …', description: `Aktuell: ${quickAddAfterSave === 'close' ? 'Schließen' : 'Neue Buchung'}`, children: [
                                    { key: 's', label: 'Buchungsmodal schließen', action: () => setQuickAddAfterSave('close') },
                                    { key: 'n', label: 'Neue Buchung öffnen', action: () => setQuickAddAfterSave('new') }
                                ]
                            },
                            {
                                key: 'd', label: 'Buchungen löschen …', description: `Aktuell: ${allowVoucherDeletion ? 'Endgültiges Löschen erlaubt' : 'Nur Storno'}`, children: [
                                    { key: 's', label: 'Nur Storno erlauben', action: () => setAllowVoucherDeletion(false) },
                                    { key: 'e', label: 'Endgültiges Löschen erlauben', action: () => setAllowVoucherDeletion(true) }
                                ]
                            }
                        ]
                    },
                    {
                        key: 'a',
                        label: 'Anzeige & Lesbarkeit …',
                        description: 'Eintragszahl und Datumsformat direkt anpassen',
                        icon: <span aria-hidden>🔎</span>,
                        children: [
                            {
                                key: 'e', label: 'Buchungen: Anzahl der Einträge …', description: `Aktuell: ${journalLimit}`, children: [
                                    { key: '2', label: '20 Einträge', action: () => { setJournalLimit(20); setPage(1) } },
                                    { key: '5', label: '50 Einträge', action: () => { setJournalLimit(50); setPage(1) } },
                                    { key: '0', label: '100 Einträge', action: () => { setJournalLimit(100); setPage(1) } }
                                ]
                            },
                            {
                                key: 'd', label: 'Datumsformat …', description: `Aktuell: ${dateFmt === 'ISO' ? '2025-01-15' : '15. Jan 2025'}`, children: [
                                    { key: 'i', label: 'ISO · 2025-01-15', action: () => setDateFmt('ISO') },
                                    { key: 'l', label: 'Lesbar · 15. Jan 2025', action: () => setDateFmt('PRETTY') }
                                ]
                            }
                        ]
                    },
                    { key: 'd', label: 'Darstellung', action: () => openSettingsTile('general') },
                    { key: 't', label: 'Tabelle', action: () => openSettingsTile('table') },
                    { key: 's', label: 'Speicher & Backup', action: () => openSettingsTile('storage') },
                    { key: 'i', label: 'Import', action: () => openSettingsTile('import') },
                    { key: 'o', label: 'Organisation', action: () => openSettingsTile('org') },
                    { key: 'p', label: 'Spenden', action: () => openSettingsTile('donations') },
                    { key: 'g', label: 'Tags', action: () => openSettingsTile('tags') },
                    { key: 'k', label: 'Kassenprüfung', action: () => openSettingsTile('cashCheck') },
                    { key: 'j', label: 'Jahresabschluss', action: () => openSettingsTile('yearEnd') }
                ]
            }
        ]
    }, [activePage, activePageShortcuts, allowVoucherDeletion, bookingsOpenDetached, dateFmt, journalLimit, journalRowDensity, journalRowStyle, navIconColorMode, navLayout, navigateAndFocus, openBookingEntry, openSettingsTile, quickAddAfterSave, showBookingDraftTabs])

    async function createSampleVoucher() {
        try {
            notify('info', 'Erzeuge Beleg ?')
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
                // JournalView handles reload via refreshKey dependency; bump version to trigger it
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
            notify('info', 'Storniere Beleg ?')
            const res = await window.api?.vouchers.reverse?.({ originalId: lastId, reason: 'Dev Reverse' })
            if (res) {
                notify('success', `Storno erstellt: #${res.voucherNo}`)
                // JournalView handles reload via refreshKey dependency; bump version to trigger it
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
    const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>(() => { try { return (localStorage.getItem('journal.sort') as any) || 'DESC' } catch { return 'DESC' } })
    const [sortBy, setSortBy] = useState<'date' | 'gross' | 'net'>(() => { try { return (localStorage.getItem('journal.sortBy') as any) || 'date' } catch { return 'date' } })
    // PaymentsAssignModal extracted to components/modals/PaymentsAssignModal.tsx
    // Buchungen (Journal) filter states
    const [from, setFrom] = useState<string>('')
    const [to, setTo] = useState<string>('')
    const [filterSphere, setFilterSphere] = useState<'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB' | null>(null)
    const [filterType, setFilterType] = useState<'IN' | 'OUT' | 'TRANSFER' | null>(null)
    const [filterPM, setFilterPM] = useState<'BAR' | 'BANK' | null>(null)
    const [filterPaymentAccountId, setFilterPaymentAccountId] = useState<number | null>(null)
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
    const [reportsFilterEarmark, setReportsFilterEarmark] = useState<number | null>(null)
    const [reportsFilterBudgetId, setReportsFilterBudgetId] = useState<number | null>(null)
    // Global Zweckbindungen (earmarks) for filters/tables
    const [earmarks, setEarmarks] = useState<Array<{ id: number; code: string; name: string; color?: string | null; startDate?: string | null; endDate?: string | null; enforceTimeRange?: number }>>([])
    const [paymentAccounts, setPaymentAccounts] = useState<Array<{ id: number; name: string; kind: 'CASH' | 'BANK' | 'PAYPAL' | 'CARD' | 'OTHER'; iban?: string | null; color?: string | null; sortOrder: number; isActive: number }>>([])
    async function loadEarmarks() {
        try {
            const res = await window.api?.bindings?.list?.({ activeOnly: true })
            const rows = (res as any)?.rows || []
            setEarmarks(rows)
        } catch { /* ignore */ }
    }
    async function loadPaymentAccounts() {
        try {
            const res = await window.api?.paymentAccounts?.list?.()
            setPaymentAccounts((res as any)?.rows || [])
        } catch { /* ignore */ }
    }
    useEffect(() => {
        loadEarmarks()
        loadPaymentAccounts()
        const onChanged = () => { loadEarmarks(); loadPaymentAccounts() }
        window.addEventListener('data-changed', onChanged)
        return () => window.removeEventListener('data-changed', onChanged)
    }, [])
    // Map of budget id -> friendly label for filter chips
    const [budgetNames, setBudgetNames] = useState<Map<number, string>>(new Map())
    const chips = useMemo(() => {
        const list: Array<{ key: string; label: string; clear: () => void }> = []
        if (from || to) list.push({ key: 'range', label: `${from || '?'} ? ${to || '?'}`, clear: () => { setFrom(''); setTo('') } })
        if (filterSphere) list.push({ key: 'sphere', label: `Sphäre: ${filterSphere}`, clear: () => setFilterSphere(null) })
        if (filterType) list.push({ key: 'type', label: `Art: ${filterType}`, clear: () => setFilterType(null) })
        if (filterPaymentAccountId != null) {
            const account = paymentAccounts.find((item) => item.id === filterPaymentAccountId)
            list.push({ key: 'payment-account', label: `Zahlweg: ${account?.name || `#${filterPaymentAccountId}`}`, clear: () => setFilterPaymentAccountId(null) })
        } else if (filterPM) list.push({ key: 'pm', label: `Zahlweg: ${filterPM}`, clear: () => setFilterPM(null) })
        if (filterEarmark != null) {
            const em = earmarks.find(e => e.id === filterEarmark)
            list.push({ key: 'earmark', label: `Zweckbindung: ${em ? em.code : '#' + filterEarmark}` , clear: () => setFilterEarmark(null) })
        }
        if (filterBudgetId != null) {
            const label = budgetNames.get(filterBudgetId) || `#${filterBudgetId}`
            list.push({ key: 'budget', label: `Budget: ${label}`, clear: () => setFilterBudgetId(null) })
        }
        if (filterTag) list.push({ key: 'tag', label: `Tag: ${filterTag}`, clear: () => setFilterTag(null) })
    if (q) list.push({ key: 'q', label: `Suche: ${q}`.slice(0, 40) + (q.length > 40 ? '?' : ''), clear: () => setQ('') })
        return list
    }, [from, to, filterSphere, filterType, filterPM, filterPaymentAccountId, filterEarmark, filterBudgetId, filterTag, earmarks, budgetNames, q, paymentAccounts])
    // Legacy alias: older render sections still refer to activeChips; keep in sync
    const activeChips = chips

    // Global Tags state (for filters, table colorization, and tag manager)
    const [tagDefs, setTagDefs] = useState<Array<{ id: number; name: string; color?: string | null; usage?: number }>>([])
    async function loadTags() {
        try {
            const res = await window.api?.tags?.list?.({ includeUsage: true })
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
    // Human-readable labels for columns (used in Einstellungen > Tabelle)
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
                paymentAccountId: filterPaymentAccountId || undefined,
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
    }, [journalLimit, page, sortDir, sortBy, filterPM, filterPaymentAccountId, filterSphere, filterType, from, to, filterEarmark, filterBudgetId, q, filterTag])

    // Load vouchers whenever filters or page change
    useEffect(() => {
    // Removed old global loadRecent; JournalView listens to refreshKey now
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
    // Refresh attachments when opening an edit modal (so neue Anhänge erscheinen beim erneuten öffnen)
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
    const [bindings, setBindings] = useState<Array<{ id: number; code: string; name: string; description?: string | null; startDate?: string | null; endDate?: string | null; isActive: number; color?: string | null; budget?: number | null; enforceTimeRange?: number }>>([])
    async function loadBindings() {
        const res = await window.api?.bindings.list?.({})
        if (res) setBindings(res.rows)
    }

    // Budgets state (kept for Buchungen page dropdowns/filters)
    const [budgets, setBudgets] = useState<Array<{ id: number; year: number; sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; categoryId: number | null; projectId: number | null; earmarkId: number | null; amountPlanned: number; name?: string | null; categoryName?: string | null; projectName?: string | null; startDate?: string | null; endDate?: string | null; color?: string | null; isArchived?: number; enforceTimeRange?: number }>>([])
    const budgetsForEdit = useMemo(() => {
        const byIdEarmark = new Map(earmarks.map(e => [e.id, e]))
        const makeLabel = (b: any) => {
            if (b.name && String(b.name).trim()) return String(b.name).trim()
            if (b.categoryName && String(b.categoryName).trim()) return `${b.year} ? ${b.categoryName}`
            if (b.projectName && String(b.projectName).trim()) return `${b.year} ? ${b.projectName}`
            if (b.earmarkId) {
                const em = byIdEarmark.get(b.earmarkId)
                if (em) return `${b.year} ? ?? ${em.code}`
            }
            return String(b.year)
        }
        return (budgets || []).map((b) => ({
            id: b.id,
            label: makeLabel(b),
            year: b.year,
            startDate: b.startDate ?? null,
            endDate: b.endDate ?? null,
            enforceTimeRange: (b as any).enforceTimeRange ?? 0,
            isArchived: (b as any).isArchived ?? 0,
            color: (b as any).color ?? null
        }))
    }, [budgets, earmarks])
    async function loadBudgets() {
        // Include archived budgets so filters/edit views can still resolve labels/colors.
        const res = await window.api?.budgets.list?.({ includeArchived: true } as any)
        if (res) {
            setBudgets(res.rows)
            try {
                const map = new Map<number, string>()
                const byIdEarmark = new Map(earmarks.map(e => [e.id, e]))
                for (const b of res.rows) {
                    let label = ''
                    if (b.name && String(b.name).trim()) label = String(b.name).trim()
                    else if (b.categoryName && String(b.categoryName).trim()) label = `${b.year} ? ${b.categoryName}`
                    else if (b.projectName && String(b.projectName).trim()) label = `${b.year} ? ${b.projectName}`
                    else if (b.earmarkId) {
                        const em: any = byIdEarmark.get(b.earmarkId)
                        if (em) label = `${b.year} ? ?? ${em.code}`
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
        if (activePage === 'Reports') { loadBudgets() }
         
    }, [activePage])

    // (earmarks loaded above)

    // Color palette for navigation icons
    const navIconPalette: Record<string, string> = {
        'Dashboard': '#7C4DFF',
        'Buchungen': '#2962FF',
        'Verbindlichkeiten': '#00B8D4',
        'Mitglieder': '#26A69A',
        'Vorschuesse': '#4CAF50',
        'Budgets': '#00C853',
        'Zweckbindungen': '#FFD600',
        'Belege': '#FF9100',
        'Reports': '#F50057',
        'Einstellungen': '#9C27B0'
    }
    const isTopNav = effectiveNavLayout === 'top'
    return (
        <div className={`app-root-grid ${isTopNav ? 'app-root-grid--top' : 'app-root-grid--side'}`}>
            {/* Topbar with organisation header line */}
            <header
                className={`app-header ${isTopNav ? 'app-header-top' : 'app-header-left'}`}
                onDoubleClick={(e) => {
                    const target = e.target as HTMLElement
                    // Ignore double-clicks on interactive elements
                    if (target && target.closest('button, input, select, textarea, a, [role="button"]')) return
                    window.api?.window?.toggleMaximize?.()
                }}
            >
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, WebkitAppRegion: 'no-drag' } as any}>
                    <TopHeaderOrg notify={notify} />
                </div>
                {isTopNav ? (
                    <div style={{ display: 'inline-flex', WebkitAppRegion: 'no-drag' } as any}>
                        <TopNav
                            activePage={activePage}
                            onNavigate={setActivePage}
                            navIconColorMode={navIconColorMode}
                            pendingSubmissionsCount={pendingSubmissionsCount}
                            openInvoicesCount={openInvoicesCount}
                            showBadges
                        />
                    </div>
                ) : null}
                {isTopNav && <div />}
                {/* Window controls */}
                <div style={{ display: 'inline-flex', gap: 4, justifySelf: 'end', WebkitAppRegion: 'no-drag' } as any}>
                    <button className="btn ghost icon-btn" title="Minimieren" aria-label="Minimieren" onClick={() => window.api?.window?.minimize?.()}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="11" width="14" height="2" rx="1"/></svg>
                    </button>
                    <button className="btn ghost icon-btn" title="Maximieren / Wiederherstellen" aria-label="Maximieren" onClick={() => window.api?.window?.toggleMaximize?.()}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 6h12v12H6z"/></svg>
                    </button>
                    <button className="btn danger icon-btn" title="Schließen" aria-label="Schließen" onClick={() => window.api?.window?.close?.()}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2"/></svg>
                    </button>
                </div>
            </header>
            {!isTopNav && (
                <aside className="app-sidebar">
                    <SideNav
                        activePage={activePage}
                        onNavigate={setActivePage}
                        navIconColorMode={navIconColorMode}
                        collapsed={true}
                        pendingSubmissionsCount={pendingSubmissionsCount}
                        openInvoicesCount={openInvoicesCount}
                        showBadges
                    />
                </aside>
            )}

            {/* Main content */}
            <main className={`app-main${activePage === 'Buchungen' ? ' app-main--journal' : ''}`}>
                    
                    {activePage === 'Reports' && (
                        <ReportsView
                            from={reportsFrom}
                            to={reportsTo}
                            setFrom={setReportsFrom}
                            setTo={setReportsTo}
                            yearsAvail={yearsAvail}
                            filterSphere={reportsFilterSphere}
                            setFilterSphere={setReportsFilterSphere}
                            filterType={reportsFilterType}
                            setFilterType={setReportsFilterType}
                            filterPM={reportsFilterPM}
                            setFilterPM={setReportsFilterPM}
                            filterEarmark={reportsFilterEarmark}
                            setFilterEarmark={setReportsFilterEarmark}
                            filterBudgetId={reportsFilterBudgetId}
                            setFilterBudgetId={setReportsFilterBudgetId}
                            budgets={budgets}
                            earmarks={earmarks}
                            onOpenExport={() => setShowExportOptions(true)}
                            onOpenActivityReport={() => setShowActivityReportEditor(true)}
                            refreshKey={refreshKey}
                            activateKey={reportsActivateKey}
                        />
                    )}
                    {activePage === 'Zweckbindungen' && <h1>Zweckbindungen</h1>}
                    {activePage === 'Budgets' && <h1>Budgets</h1>}
                    {activePage === 'Dashboard' && (
                        <DashboardView
                            today={today}
                            onGoToInvoices={() => setActivePage('Verbindlichkeiten')}
                            onGoToVoucher={({ voucherId, recordDate }) => {
                                // Reset filters so the voucher can be found reliably
                                setFilterEarmark(null)
                                setFilterBudgetId(null)
                                setFilterTag(null)
                                setFilterType(null)
                                setFilterPM(null)
                                setFilterPaymentAccountId(null)
                                setFilterSphere(null)
                                setQ(voucherId ? `#${voucherId}` : '')

                                // Pin to the voucher date to avoid time-range filtering issues
                                if (recordDate) {
                                    setFrom(recordDate)
                                    setTo(recordDate)
                                } else {
                                    setFrom('')
                                    setTo('')
                                }

                                setFlashId(voucherId)
                                window.setTimeout(() => {
                                    setFlashId((cur) => (cur === voucherId ? null : cur))
                                }, 5000)

                                // Ensure state updates apply before navigation
                                setTimeout(() => {
                                    setActivePage('Buchungen')
                                    setPage(1)
                                }, 0)
                            }}
                        />
                    )}
                    {activePage === 'Buchungen' && (
                        <JournalView
                            flashId={flashId}
                            setFlashId={setFlashId}
                            registerPageShortcuts={registerPageShortcuts}
                            periodLock={periodLock}
                            refreshKey={refreshKey}
                            notify={notify}
                            bumpDataVersion={bumpDataVersion}
                            fmtDate={fmtDate}
                            setActivePage={setActivePage}
                            setShowTimeFilter={setShowTimeFilter}
                            setShowMetaFilter={setShowMetaFilter}
                            yearsAvail={yearsAvail}
                            budgets={budgets}
                            earmarks={earmarks}
                            paymentAccounts={paymentAccounts}
                            tagDefs={tagDefs}
                            budgetsForEdit={budgetsForEdit}
                            budgetNames={budgetNames}
                            eurFmt={eurFmt}
                            friendlyError={friendlyError}
                            bufferToBase64Safe={bufferToBase64Safe}
                            journalLimit={journalLimit}
                            setJournalLimit={(n: number) => { setJournalLimit(n); setPage(1) }}
                            dateFmt={dateFmt}
                            cols={cols}
                            setCols={setCols}
                            order={order}
                            setOrder={setOrder}
                            from={from}
                            to={to}
                            filterSphere={filterSphere}
                            filterType={filterType}
                            filterPM={filterPM}
                            filterPaymentAccountId={filterPaymentAccountId}
                            filterEarmark={filterEarmark}
                            filterBudgetId={filterBudgetId}
                            filterTag={filterTag}
                            q={q}
                            setFrom={setFrom}
                            setTo={setTo}
                            setFilterSphere={setFilterSphere}
                            setFilterType={setFilterType}
                            setFilterPM={setFilterPM}
                            setFilterPaymentAccountId={setFilterPaymentAccountId}
                            setFilterEarmark={setFilterEarmark}
                            setFilterBudgetId={setFilterBudgetId}
                            setFilterTag={setFilterTag}
                            setQ={setQ}
                            page={page}
                            setPage={setPage}
                            showBookingDraftTabs={showBookingDraftTabs}
                            bookingDraftTabs={bookingDraftTabs}
                            onOpenBookingDraft={openBookingDraftTab}
                            onCloseBookingDraft={closeBookingDraftTab}
                            showBookingEditTabs={showBookingEditTabs}
                            bookingsOpenDetached={bookingsOpenDetached}
                            allowVoucherDeletion={allowVoucherDeletion}
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
                            backgroundImage={backgroundImage}
                            setBackgroundImage={setBackgroundImage}
                            customBackgroundImage={customBackgroundImage}
                            setCustomBackgroundImage={setCustomBackgroundImage}
                            glassModals={glassModals}
                            setGlassModals={setGlassModals}
                            showBookingDraftTabs={showBookingDraftTabs}
                            setShowBookingDraftTabs={setShowBookingDraftTabs}
                            showBookingEditTabs={showBookingEditTabs}
                            setShowBookingEditTabs={setShowBookingEditTabs}
                            bookingsOpenDetached={bookingsOpenDetached}
                            setBookingsOpenDetached={setBookingsOpenDetached}
                            allowVoucherDeletion={allowVoucherDeletion}
                            setAllowVoucherDeletion={setAllowVoucherDeletion}
                            quickAddAfterSave={quickAddAfterSave}
                            setQuickAddAfterSave={setQuickAddAfterSave}
                            tagDefs={tagDefs}
                            setTagDefs={setTagDefs}
                            paymentAccounts={paymentAccounts}
                            setPaymentAccounts={setPaymentAccounts}
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
                                // Reset other filters first, then set earmark and navigate
                                setFilterBudgetId(null)
                                setFilterTag(null)
                                setFilterType(null)
                                setFilterPM(null)
                                setFilterPaymentAccountId(null)
                                setFilterSphere(null)
                                setQ('')
                                setFrom('')
                                setTo('')
                                setFilterEarmark(earmarkId)
                                // Use setTimeout to ensure state updates before navigation
                                setTimeout(() => {
                                    setActivePage('Buchungen')
                                    setPage(1)
                                }, 0)
                            }}
                            onLoadEarmarks={loadEarmarks}
                            notify={notify}
                        />
                    )}

                    {activePage === 'Budgets' && (
                        <BudgetsView
                            onGoToBookings={(budgetId) => {
                                // Reset other filters first, then set budget and navigate
                                setFilterEarmark(null)
                                setFilterTag(null)
                                setFilterType(null)
                                setFilterPM(null)
                                setFilterPaymentAccountId(null)
                                setFilterSphere(null)
                                setQ('')
                                setFrom('')
                                setTo('')
                                setFilterBudgetId(budgetId)
                                // Use setTimeout to ensure state updates before navigation
                                setTimeout(() => {
                                    setActivePage('Buchungen')
                                    setPage(1)
                                }, 0)
                            }}
                            notify={notify}
                        />
                    )}

                    {activePage === 'Mitglieder' && (
                        <MembersView
                            registerPageShortcuts={registerPageShortcuts}
                        />
                    )}

                    {activePage === 'Vorschuesse' && (
                        <AdvancesView />
                    )}

                    {activePage === 'Verbindlichkeiten' && (
                        <InvoicesView
                            registerPageShortcuts={registerPageShortcuts}
                        />
                    )}

                    {activePage === 'Einreichungen' && (
                        <SubmissionsView
                            notify={notify}
                            bumpDataVersion={bumpDataVersion}
                            eurFmt={eurFmt}
                            fmtDate={fmtDate}
                            earmarks={earmarks}
                            budgetsForEdit={budgetsForEdit}
                            tagDefs={tagDefs}
                        />
                    )}
            </main>

            <LeaderShortcuts commands={shortcutCommands} />

{/* Quick-Add Modal */}
            {quickAdd && (
                <QuickAddModal
                    key={activeDraftId ?? 'quick-add'}
                    qa={qa}
                    setQa={setQa}
                    onSave={onQuickSave}
                    onSaveAndNew={() => onQuickSave('new')}
                    onSaveAndClose={() => onQuickSave('close')}
                    afterSaveDefault={quickAddAfterSave}
                    onClose={parkQuickAdd}
                    onRequestClose={parkQuickAdd}
                    onDetach={detachQuickAdd}
                    files={files}
                    setFiles={setFiles}
                    openFilePicker={openFilePicker}
                    onDropFiles={onDropFiles}
                    fileInputRef={fileInputRef}
                    fmtDate={fmtDate}
                    eurFmt={eurFmt}
                    budgetsForEdit={budgetsForEdit}
                    earmarks={earmarks}
                    paymentAccounts={paymentAccounts}
                    tagDefs={tagDefs}
                    descSuggest={descSuggest}
                />
            )}
            {showOpenBookingTabsClosePrompt && (
                <div className="modal-overlay" role="dialog" aria-modal="true">
                    <div className="modal booking-close-guard-modal" onClick={(e) => e.stopPropagation()}>
                        <header className="booking-close-guard-modal__header">
                            <h2>Offene Buchungstabs</h2>
                            <button className="btn ghost" onClick={cancelCloseWithOpenDrafts} aria-label="Schließen">
                                ✕
                            </button>
                        </header>
                        <p className="booking-close-guard-modal__text">
                            Es sind noch {bookingDraftTabs.length} offene Buchungstabs vorhanden. Sollen diese verworfen und VereinO geschlossen werden?
                        </p>
                        <div className="booking-close-guard-modal__actions">
                            <button className="btn" onClick={cancelCloseWithOpenDrafts}>Abbrechen</button>
                            <button className="btn danger" onClick={confirmCloseWithOpenDrafts}>Tabs schließen</button>
                        </div>
                    </div>
                </div>
            )}
            {/* removed: Confirm mark as paid modal */}
            {/* Global Floating Action Button: + Buchung (hidden on certain pages) */}
            {activePage !== 'Einstellungen' && activePage !== 'Mitglieder' && activePage !== 'Verbindlichkeiten' && activePage !== 'Budgets' && activePage !== 'Zweckbindungen' && activePage !== 'Vorschuesse' && (
                <button className="fab fab-buchung" onClick={openBookingEntry} title="+ Buchung">
                    <span className="fab-buchung-icon">+</span>
                    <span className="fab-buchung-text">Buchung</span>
                </button>
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
            {updatePrompt && (
                <UpdateAvailableModal
                    state={updatePrompt}
                    onClose={() => setUpdatePrompt(null)}
                    onDownload={async () => {
                        try {
                            const state = await window.api?.updates?.download?.()
                            if (state && (state.status === 'downloading' || state.status === 'downloaded' || state.status === 'error')) {
                                setUpdatePrompt(state as UpdateModalState)
                            }
                        } catch (e: any) {
                            notify('error', `Update-Download fehlgeschlagen: ${String(e?.message || e)}`)
                        }
                    }}
                    onInstall={async () => {
                        try {
                            const res = await window.api?.updates?.install?.()
                            if (!res?.ok) {
                                notify('info', res?.state?.message || 'Es ist kein installierbares Update vorhanden.')
                            }
                        } catch (e: any) {
                            notify('error', `Update-Installation fehlgeschlagen: ${String(e?.message || e)}`)
                        }
                    }}
                    onDisable={async () => {
                        try {
                            await window.api?.settings?.set?.({ key: 'updates.autoCheck', value: false })
                            notify('info', 'Automatische Update-Hinweise wurden deaktiviert.')
                        } catch { }
                        setUpdatePrompt(null)
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
                    backgroundImage={backgroundImage}
                    setBackgroundImage={(v) => { setBackgroundImage(v); try { localStorage.setItem('ui.backgroundImage', v) } catch {}; try { document.documentElement.setAttribute('data-background-image', v) } catch {} }}
                    customBackgroundImage={customBackgroundImage}
                    setCustomBackgroundImage={(v) => { setCustomBackgroundImage(v) }}
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
                    dateFrom={reportsFrom}
                    dateTo={reportsTo}
                    exportType={exportType}
                    setExportType={setExportType}
                    fiscalYear={fiscalYear}
                    setFiscalYear={setFiscalYear}
                    includeBindings={includeBindings}
                    setIncludeBindings={setIncludeBindings}
                    includeVoucherList={includeVoucherList}
                    setIncludeVoucherList={setIncludeVoucherList}
                    includeBudgets={includeBudgets}
                    setIncludeBudgets={setIncludeBudgets}
                    includeActivityReport={includeActivityReport}
                    setIncludeActivityReport={setIncludeActivityReport}
                    onExport={async (fmt, reportOpts) => {
                        try {
                            if (fmt === 'PDF_FISCAL') {
                                const fiscalOpts = (reportOpts || {}) as FiscalExportOptions
                                // Fiscal year report for tax office
                                const res = await (window as any).api?.reports?.exportFiscal?.({
                                    fiscalYear,
                                    includeBindings: fiscalOpts.includeBindings ?? includeBindings,
                                    includeVoucherList: fiscalOpts.includeVoucherList ?? includeVoucherList,
                                    includeBudgets: fiscalOpts.includeBudgets ?? includeBudgets,
                                    includeActivityReport: fiscalOpts.includeActivityReport ?? includeActivityReport,
                                    includeInactiveBindings: fiscalOpts.includeInactiveBindings ?? false,
                                    includeArchivedBudgets: fiscalOpts.includeArchivedBudgets ?? false,
                                    bindingIds: fiscalOpts.selectedBindingIds,
                                    budgetIds: fiscalOpts.selectedBudgetIds,
                                    orgName: exportOrgName || undefined
                                })
                                if (res) {
                                    notify('success', `Finanzamt-Report exportiert: ${res.filePath}`, 6000, {
                                        label: 'Ordner öffnen',
                                        onClick: () => window.api?.shell?.showItemInFolder?.(res.filePath)
                                    })
                                }
                            } else if (fmt === 'PDF_TREASURER') {
                                const treasurerOpts = (reportOpts || {}) as TreasurerExportOptions
                                const res = await (window as any).api?.reports?.exportTreasurer?.({
                                    fiscalYear,
                                    orgName: exportOrgName || undefined,
                                    cashBalanceDate: treasurerOpts?.cashBalanceDate,
                                    includeMembers: treasurerOpts?.includeMembers,
                                    includeInvoices: treasurerOpts?.includeInvoices,
                                    includeBindings: treasurerOpts?.includeBindings,
                                    includeBudgets: treasurerOpts?.includeBudgets,
                                    includeTagSummary: treasurerOpts?.includeTagSummary,
                                    includeVoucherList: treasurerOpts?.includeVoucherList,
                                    includeTags: treasurerOpts?.includeTags,
                                    voucherListFrom: treasurerOpts?.voucherListFrom,
                                    voucherListTo: treasurerOpts?.voucherListTo,
                                    voucherListSort: treasurerOpts?.voucherListSort
                                })
                                if (res) {
                                    notify('success', `Kassierbericht exportiert: ${res.filePath}`, 6000, {
                                        label: 'Ordner öffnen',
                                        onClick: () => window.api?.shell?.showItemInFolder?.(res.filePath)
                                    })
                                }
                            } else {
                                // Standard export
                                const res = await window.api?.reports.export?.({
                                    type: 'JOURNAL',
                                    format: fmt,
                                    from: reportsFrom || '',
                                    to: reportsTo || '',
                                    filters: {
                                        paymentMethod: reportsFilterPM || undefined,
                                        sphere: reportsFilterSphere || undefined,
                                        type: reportsFilterType || undefined,
                                        earmarkId: reportsFilterEarmark || undefined,
                                        budgetId: reportsFilterBudgetId || undefined
                                    },
                                    fields: exportFields,
                                    orgName: exportOrgName || undefined,
                                    amountMode: exportAmountMode,
                                    sort: exportSortDir,
                                    sortBy: 'date'
                                } as any)
                                if (res) {
                                    notify('success', `${fmt} exportiert: ${res.filePath}`, 6000, {
                                        label: 'Ordner öffnen',
                                        onClick: () => window.api?.shell?.showItemInFolder?.(res.filePath)
                                    })
                                }
                            }
                            setShowExportOptions(false)
                        } catch (e: any) {
                            notify('error', e?.message || String(e))
                        }
                    }}
                />
            )}

            {activePage === 'Reports' && showActivityReportEditor && (
                <ActivityReportEditorModal
                    open={showActivityReportEditor}
                    onClose={() => setShowActivityReportEditor(false)}
                    fiscalYear={fiscalYear}
                    setFiscalYear={setFiscalYear}
                    yearsAvail={yearsAvail}
                    budgets={budgets}
                    notify={notify}
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
                        <header className="flex justify-between items-center">
                            <h3 className="m-0">Beitragsstatus</h3>
                            <button className="btn" onClick={()=>setOpen(false)}>?</button>
                        </header>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
                            <div className="helper font-semibold">{name}{memberNo ? ` (${memberNo})` : ''}</div>
                            <span className="helper">�</span>
                            <span className="helper">Eintritt: {status?.joinDate || '?'}</span>
                            <span className="helper">?</span>
                            <span className="helper">Status: {status?.state === 'OVERDUE' ? `?berf?llig (${status?.overdue})` : status?.state === 'OK' ? 'OK' : '?'}</span>
                            <span className="helper">?</span>
                            <span className="helper">Letzte Zahlung: {status?.lastPeriod ? `${status.lastPeriod} (${status?.lastDate||''})` : '?'}</span>
                            <span className="helper">?</span>
                            <span className="helper">Initiale F?lligkeit: {status?.nextDue || '?'}</span>
                        </div>
                        <MemberTimeline status={status} history={history} />
                        {/* Due payments for this member */}
                        <div className="card p-10">
                            <strong>F?llige Beitr?ge</strong>
                            {due.length === 0 ? (
                                <div className="helper mt-6">Aktuell keine offenen Perioden.</div>
                            ) : (
                                <>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                                        <div className="helper">Seite {duePage} von {Math.max(1, Math.ceil(due.length / pageSize))} ? {due.length} offen</div>
                                        <div className="flex gap-6">
                                            <button className={`btn ${duePage <= 1 ? "opacity-60 cursor-not-allowed" : ""}`} onClick={() => setDuePage(1)} disabled={duePage <= 1}>?</button>
                                            <button className={`btn ${duePage <= 1 ? "opacity-60 cursor-not-allowed" : ""}`} onClick={() => setDuePage(p => Math.max(1, p - 1))} disabled={duePage <= 1}>‹</button>
                                            <button className={`btn ${duePage >= Math.max(1, Math.ceil(due.length / pageSize)) ? "opacity-60 cursor-not-allowed" : ""}`} onClick={() => setDuePage(p => Math.min(Math.max(1, Math.ceil(due.length / pageSize)), p + 1))} disabled={duePage >= Math.max(1, Math.ceil(due.length / pageSize))}>›</button>
                                            <button className={`btn ${duePage >= Math.max(1, Math.ceil(due.length / pageSize)) ? "opacity-60 cursor-not-allowed" : ""}`} onClick={() => setDuePage(Math.max(1, Math.ceil(due.length / pageSize)))} disabled={duePage >= Math.max(1, Math.ceil(due.length / pageSize))}>?</button>
                                        </div>
                                    </div>
                                    <table cellPadding={6} style={{ width: '100%', marginTop: 6 }}>
                                        <thead>
                                            <tr>
                                                <th align="left">Periode</th>
                                                <th align="right">Betrag</th>
                                                <th align="left">Verkn?pfen</th>
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
                                                            <div className="grid gap-6">
                                                                <select className="input" value={selVoucher ?? ''} onChange={e => setSelVoucherByPeriod(prev => ({ ...prev, [r.periodKey]: e.target.value ? Number(e.target.value) : null }))} title="Passende Buchung verkn?pfen">
                                                                    <option value="">? ohne Verkn?pfung ?</option>
                                                                    {manualList.map(s => (
                                                                        <option key={`m-${s.id}`} value={s.id}>{s.voucherNo || s.id} ? {s.date} ? {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(s.gross)} ? {(s.description || s.counterparty || '')}</option>
                                                                    ))}
                                                                </select>
                                                                <div className="flex gap-6">
                                                                    <input className="input" placeholder="Buchung suchen?" value={search} onChange={e => setSearchByPeriod(prev => ({ ...prev, [r.periodKey]: e.target.value }))} title="Suche in Buchungen (Betrag/Datum/Text)" />
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
                        <div className="flex justify-start items-center">
                            <button className="btn primary" onClick={async ()=>{
                                try {
                                    const addr = memberData?.address || null
                                    const res = await (window as any).api?.members?.writeLetter?.({ id: memberId, name, address: addr, memberNo })
                                    if (!(res?.ok)) alert(res?.error || 'Konnte Brief nicht öffnen')
                                } catch (e: any) { alert(e?.message || String(e)) }
                            }}>Mitglied anschreiben</button>
                        </div>
                        <div className="card p-10">
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
                                            <td>{r.voucherNo ? `#${r.voucherNo}` : '?'} {r.description ? `? ${r.description}` : ''}</td>
                                        </tr>
                                    ))}
                                    {history.length===0 && <tr><td colSpan={4}><div className="helper">Keine Zahlungen</div></td></tr>}
                                </tbody>
                            </table>
                        </div>
                        <div className="flex justify-end">
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
        <div className="card p-10">
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
                                    <title>{`${pk} ? ${isPaid ? 'bezahlt' : (isOverdue ? '?berf?llig' : (isCurrent ? 'aktuell' : 'offen'))}`}</title>
                                </circle>
                                <text x={x} y={12} textAnchor="middle" fontSize={10} fill="var(--text-dim)">{pk}</text>
                                <text x={x} y={50} textAnchor="middle" fontSize={10} fill={isPaid ? 'var(--success)' : (isOverdue ? 'var(--danger)' : 'var(--text-dim)')}>
                                    {isPaid ? 'bezahlt' : (isOverdue ? '?berf?llig' : (isCurrent ? 'jetzt' : ''))}
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
                            <button className="chip-x" onClick={() => removeTag(t)} aria-label={`Tag ${t} entfernen`} type="button">?</button>
                        </span>
                    )
                })}
                {/* Quick add via dropdown */}
                <select
                    className="input"
                    value=""
                    onChange={(e) => { const name = e.target.value; if (name) addTag(name) }}
                    style={{ minWidth: 140 }}
                    title="Tag aus Liste hinzuf?gen"
                >
                    <option value="">+ Tag ausw?hlen?</option>
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
                    placeholder={(value || []).length ? '' : 'Tag hinzuf?gen?'}
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
import FilterTotalsComponent from './views/Journal/components/FilterTotals'
const FilterTotals = FilterTotalsComponent

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
            : k === 'date' ? <th key={k} align="left" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))} onClick={() => onToggleSort('date')} className="cursor-pointer">Datum {renderSortIcon('date')}</th>
                : k === 'voucherNo' ? <th key={k} align="left" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>Nr.</th>
                    : k === 'type' ? <th key={k} align="left" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>Art</th>
                        : k === 'sphere' ? <th key={k} align="left" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>Sphäre</th>
                            : k === 'description' ? <th key={k} align="left" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>Beschreibung</th>
                                : k === 'earmark' ? <th key={k} align="center" title="Zweckbindung" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>??</th>
                                    : k === 'budget' ? <th key={k} align="center" title="Budget" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>??</th>
                                        : k === 'paymentMethod' ? <th key={k} align="left" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>Zahlweg</th>
                                            : k === 'attachments' ? <th key={k} align="center" title="Anhänge" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>??</th>
                                                : k === 'net' ? <th key={k} align="right" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))} onClick={() => onToggleSort('net')} className="cursor-pointer">Netto {renderSortIcon('net')}</th>
                                                    : k === 'vat' ? <th key={k} align="right" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))}>MwSt</th>
                                                        : <th key={k} align="right" draggable onDragStart={(e) => onHeaderDragStart(e, visibleOrder.indexOf(k))} onDragOver={onHeaderDragOver} onDrop={(e) => onHeaderDrop(e, visibleOrder.indexOf(k))} onClick={() => onToggleSort('gross')} className="cursor-pointer">Brutto {renderSortIcon('gross')}</th>
    )
    const colorFor = (name: string) => (tagDefs || []).find(t => (t.name || '').toLowerCase() === (name || '').toLowerCase())?.color
    const isLocked = (d: string) => {
        if (!lockedUntil) return false
        return String(d) <= String(lockedUntil)
    }
    const tdFor = (k: string, r: any) => (
        k === 'actions' ? (
            <td key={k} align="center" className="text-nowrap">
                {isLocked(r.date) ? (
                    <span className="badge" title={`Bis ${lockedUntil} abgeschlossen (Jahresabschluss)`} aria-label="Gesperrt">??</span>
                ) : (
                    <button className="btn" title="Bearbeiten" onClick={() => onEdit({ id: r.id, date: r.date, description: r.description ?? '', paymentMethod: r.paymentMethod ?? null, transferFrom: r.transferFrom ?? null, transferTo: r.transferTo ?? null, type: r.type, sphere: r.sphere, earmarkId: r.earmarkId ?? null, budgetId: r.budgetId ?? null, tags: r.tags || [], netAmount: r.netAmount, grossAmount: r.grossAmount, vatRate: r.vatRate })}>?</button>
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
                <div className="flex items-center gap-6 flex-wrap">
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
                        const title = from && to ? `${from === 'BAR' ? 'Bar' : 'Bank'} → ${to === 'BAR' ? 'Bar' : 'Bank'}` : 'Transfer'
                        return (
                            <span className={`badge pm-transfer pm-transfer-${(from || '').toLowerCase()}-${(to || '').toLowerCase()}`} title={title} aria-label={title}>
                                <span className="pm-icon">
                                    {from === 'BAR' ? <IconCash size={16} /> : <IconBank size={16} />}
                                </span>
                                <span className="transfer-arrow">→</span>
                                <span className="pm-icon">
                                    {to === 'BAR' ? <IconCash size={16} /> : <IconBank size={16} />}
                                </span>
                            </span>
                        )
                    })()
                ) : (
                    r.paymentMethod ? (
                        <span className={`badge pm-${(r.paymentMethod || '').toLowerCase()}`} title={r.paymentMethod === 'BAR' ? 'Bar' : 'Bank'} aria-label={`Zahlweg: ${r.paymentMethod === 'BAR' ? 'Bar' : 'Bank'}`}>
                            {r.paymentMethod === 'BAR' ? <IconCash size={18} /> : <IconBank size={18} />}
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
            <td key={k} align="center">{typeof r.fileCount === 'number' && r.fileCount > 0 ? (<span className="badge" title={`${r.fileCount} Anhang/Anhänge`}>?? {r.fileCount}</span>) : ''}</td>
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
        </div>
    )
}

// Small inline icons used in table badges
function IconBank({ size = 14 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 2L1 8h18L10 2z" fill="#3b82f6" />
            <rect x="3" y="9" width="2" height="6" rx="0.5" fill="#3b82f6" />
            <rect x="7" y="9" width="2" height="6" rx="0.5" fill="#3b82f6" />
            <rect x="11" y="9" width="2" height="6" rx="0.5" fill="#3b82f6" />
            <rect x="15" y="9" width="2" height="6" rx="0.5" fill="#3b82f6" />
            <rect x="1" y="15.5" width="18" height="2.5" rx="0.5" fill="#3b82f6" />
        </svg>
    )
}

function IconCash({ size = 14 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="4" width="18" height="12" rx="2" fill="#22c55e" />
            <rect x="3" y="6" width="14" height="8" rx="1" fill="none" stroke="#16a34a" strokeWidth="0.8" strokeDasharray="2 1" opacity="0.5" />
            <text x="10" y="13" textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff" fontFamily="sans-serif">€</text>
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

// Wrapper with context providers
export default function App() {
    const isDetachedQuickAdd = new URLSearchParams(window.location.search).get('window') === 'quick-add'
    return (
        <UIPreferencesProvider>
            <ToastProvider>
                {isDetachedQuickAdd ? <DetachedQuickAddWindow /> : <AppInner />}
            </ToastProvider>
        </UIPreferencesProvider>
    )
}
