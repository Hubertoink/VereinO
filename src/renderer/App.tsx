import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ICONS } from './utils/icons'
import ActivityReportEditorModal from './views/Reports/ActivityReportEditorModal'
import JournalView from './views/Journal/JournalView'
import {
  getDefaultJournalCols,
  getDefaultJournalOrder
} from './views/Journal/utils/journalColumnVisibility'
import TagsManagerModal from './components/modals/TagsManagerModal'
import AutoBackupPromptModal from './components/modals/AutoBackupPromptModal'
import UpdateAvailableModal, {
  type UpdateModalState
} from './components/modals/UpdateAvailableModal'
import MetaFilterModal from './components/modals/MetaFilterModal'
import TimeFilterModal from './components/modals/TimeFilterModal'
import ExportOptionsModal from './components/modals/ExportOptionsModal'
import AttachmentsModal from './components/modals/AttachmentsModal'
import QuickAddModal from './components/modals/QuickAddModal'
import VoucherInfoModal from './components/modals/VoucherInfoModal'
import SetupWizardModal from './components/modals/SetupWizardModal'
import LoadingState from './components/LoadingState'
import { useQuickAdd } from './hooks/useQuickAdd'
import { ToastProvider } from './context/ToastContext'
import { useToast } from './context/useToast'
import { UIPreferencesProvider } from './context/UIPreferences'
import { useUIPreferences } from './context/useUIPreferences'
import { TopNav } from './components/layout/TopNav'
import { SideNav } from './components/layout/SideNav'
import OrgSwitcher from './components/common/OrgSwitcher'
import type { NavKey } from './utils/navItems'
import { navItems } from './utils/navItems'
import { getNavIcon } from './utils/navIcons'
import { LeaderShortcuts, type ShortcutCommand } from './components/shortcuts/LeaderShortcuts'
import { shouldPromptDiscardForEdit } from './views/Journal/utils/journalEditDiscardPrompt'
import { shouldPromptDiscardForDraftClose } from './utils/quickAddCloseBehavior'
import { base64ToFile, bufferToBase64Safe } from './utils/fileEncoding'

const ReportsView = lazy(() => import('./views/Reports/ReportsView'))
const SettingsView = lazy(() =>
  import('./views/Settings/SettingsView').then((module) => ({ default: module.SettingsView }))
)
const DashboardView = lazy(() => import('./views/Dashboard/DashboardView'))
const InvoicesView = lazy(() => import('./views/InvoicesView'))
const MembersView = lazy(() => import('./views/Mitglieder/MembersView'))
const ReceiptsView = lazy(() => import('./views/ReceiptsView'))
const SubmissionsView = lazy(() => import('./views/Submissions/SubmissionsView'))
const AdvancesView = lazy(() => import('./views/Advances/AdvancesView'))
const BudgetsView = lazy(() => import('./views/Budgets/BudgetsView'))
const EarmarksView = lazy(() => import('./views/Earmarks/EarmarksView'))
const BankImportView = lazy(() => import('./views/BankImport/BankImportView'))
const AIView = lazy(() => import('./views/AI/AIView'))
// Resolve app icon for titlebar (works with Vite bundling)
const appLogo: string = new URL('../../build/Icon.ico', import.meta.url).href

function friendlyVoucherError(e: any) {
  const msg = String(e?.message || e || '')
  if (/Zweckbindung.*liegt vor Beginn/i.test(msg))
    return 'Warnung: Das Buchungsdatum liegt vor dem Startdatum der ausgewählten Zweckbindung.'
  if (/Zweckbindung.*liegt nach Ende/i.test(msg))
    return 'Warnung: Das Buchungsdatum liegt nach dem Enddatum der ausgewählten Zweckbindung.'
  if (/Zweckbindung ist inaktiv/i.test(msg))
    return 'Warnung: Die ausgewählte Zweckbindung ist inaktiv und kann nicht verwendet werden.'
  if (/Zweckbindung würde den verfügbaren Rahmen unterschreiten/i.test(msg))
    return 'Warnung: Diese Änderung würde den verfügbaren Rahmen der Zweckbindung unterschreiten.'
  if (/UNIQUE constraint failed.*voucher_budgets/i.test(msg))
    return 'Fehler: Ein Budget kann nur einmal pro Buchung zugeordnet werden. Bitte entferne doppelte Budget-Einträge.'
  if (/UNIQUE constraint failed.*voucher_earmarks/i.test(msg))
    return 'Fehler: Eine Zweckbindung kann nur einmal pro Buchung zugeordnet werden. Bitte entferne doppelte Einträge.'
  if (/UNIQUE constraint failed/i.test(msg))
    return 'Fehler: Doppelter Eintrag - diese Kombination existiert bereits.'
  return 'Fehler: ' + msg
}

function TopHeaderOrg({
  notify
}: {
  notify?: (type: 'success' | 'error' | 'info', text: string) => void
}) {
  const [cashier, setCashier] = useState<string>('')
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const cn = await (window as any).api?.settings?.get?.({ key: 'org.cashier' })
        if (!cancelled) {
          setCashier((cn?.value as any) || '')
        }
      } catch {}
    }
    load()
    const onChanged = () => load()
    window.addEventListener('data-changed', onChanged)
    return () => {
      cancelled = true
      window.removeEventListener('data-changed', onChanged)
    }
  }, [])
  const text = cashier.trim()
  return (
    <div className="inline-flex items-center gap-8">
      <img
        src={appLogo}
        alt="VereinO"
        width={20}
        height={20}
        style={{ borderRadius: 4, display: 'block' }}
      />
      <OrgSwitcher notify={notify} />
      {text ? (
        <div className="helper text-ellipsis" title={text}>
          {text}
        </div>
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

type SetOptionalNumber = (value: number | null) => void
type SetOptionalText = (value: string | null) => void
type ClearOptionalText = (value: null) => void

function resetVoucherFilters(options: {
  setFilterEarmark: SetOptionalNumber
  setFilterBudgetId: SetOptionalNumber
  setFilterTag: SetOptionalText
  setFilterType: ClearOptionalText
  setFilterPM: ClearOptionalText
  setFilterPaymentAccountId: SetOptionalNumber
  setFilterSphere: ClearOptionalText
  setQ: (value: string) => void
  setFrom?: (value: string) => void
  setTo?: (value: string) => void
  keepDateRange?: boolean
}) {
  options.setFilterEarmark(null)
  options.setFilterBudgetId(null)
  options.setFilterTag(null)
  options.setFilterType(null)
  options.setFilterPM(null)
  options.setFilterPaymentAccountId(null)
  options.setFilterSphere(null)
  options.setQ('')
  if (!options.keepDateRange) {
    options.setFrom?.('')
    options.setTo?.('')
  }
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
    mode:
      row?.amountMode ??
      row?.mode ??
      (Number(row?.netAmount ?? 0) > 0 && row?.amountMode !== 'GROSS' ? 'NET' : 'GROSS'),
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
  return Math.round(net * (1 + vatRate / 100) * 100) / 100
}

function bookingEditTitle(row: any) {
  const desc = String(row?.description || '').trim()
  return desc
    ? `Buchung (${desc.length > 60 ? desc.slice(0, 60) + '...' : desc}) bearbeiten`
    : 'Buchung bearbeiten'
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
      ? [...row.budgets]
          .map((b: any) => ({ budgetId: Number(b.budgetId || 0), amount: Number(b.amount || 0) }))
          .sort((a: any, b: any) => a.budgetId - b.budgetId || a.amount - b.amount)
      : [],
    earmarksAssigned: Array.isArray(row.earmarksAssigned)
      ? [...row.earmarksAssigned]
          .map((e: any) => ({ earmarkId: Number(e.earmarkId || 0), amount: Number(e.amount || 0) }))
          .sort((a: any, b: any) => a.earmarkId - b.earmarkId || a.amount - b.amount)
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
    return {
      error:
        'Ein Budget kann nur einmal pro Buchung zugeordnet werden. Bitte entferne die doppelten Einträge.'
    }
  }
  const earmarkIds = earmarks.map((e: any) => e.earmarkId)
  if (new Set(earmarkIds).size !== earmarkIds.length) {
    return {
      error:
        'Eine Zweckbindung kann nur einmal pro Buchung zugeordnet werden. Bitte entferne die doppelten Einträge.'
    }
  }

  const grossAmount = bookingFormGrossAmount(row)
  const totalBudgetAmount = budgets.reduce((sum: number, b: any) => sum + Number(b.amount || 0), 0)
  if (totalBudgetAmount > grossAmount * 1.001) {
    return {
      error: `Die Summe der Budget-Beträge (${totalBudgetAmount.toFixed(2)} €) übersteigt den Buchungsbetrag (${grossAmount.toFixed(2)} €).`
    }
  }
  const totalEarmarkAmount = earmarks.reduce(
    (sum: number, e: any) => sum + Number(e.amount || 0),
    0
  )
  if (totalEarmarkAmount > grossAmount * 1.001) {
    return {
      error: `Die Summe der Zweckbindungs-Beträge (${totalEarmarkAmount.toFixed(2)} €) übersteigt den Buchungsbetrag (${grossAmount.toFixed(2)} €).`
    }
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
  const { quickAddAfterSave, allowVoucherDeletion, showBookingDraftTabs, showBookingEditTabs } =
    useUIPreferences()
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const eurFmt = useMemo(
    () => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }),
    []
  )
  const fmtDate = useCallback((s?: string) => s || '', [])
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const openedRef = useRef(false)
  const detachedDraftIdRef = useRef<string>('')
  const [loaded, setLoaded] = useState(false)
  const [earmarks, setEarmarks] = useState<
    Array<{
      id: number
      code: string
      name: string
      color?: string | null
      startDate?: string | null
      endDate?: string | null
      enforceTimeRange?: number
    }>
  >([])
  const [budgets, setBudgets] = useState<
    Array<{
      id: number
      year: number
      categoryName?: string | null
      projectName?: string | null
      name?: string | null
      startDate?: string | null
      endDate?: string | null
      color?: string | null
      isArchived?: number
      enforceTimeRange?: number
      earmarkId?: number | null
    }>
  >([])
  const [paymentAccounts, setPaymentAccounts] = useState<
    Array<{
      id: number
      name: string
      kind: 'CASH' | 'BANK' | 'PAYPAL' | 'CARD' | 'OTHER'
      iban?: string | null
      color?: string | null
      sortOrder: number
      isActive: number
    }>
  >([])
  const [tagDefs, setTagDefs] = useState<
    Array<{ id: number; name: string; color?: string | null; usage?: number }>
  >([])
  const [descSuggest, setDescSuggest] = useState<string[]>([])
  const [windowModeKind, setWindowModeKind] = useState<'create' | 'edit' | 'details'>('create')
  const [editQa, setEditQa] = useState<any | null>(null)
  const [detailVoucher, setDetailVoucher] = useState<any | null>(null)
  const [detailAttachmentsVoucher, setDetailAttachmentsVoucher] = useState<null | {
    voucherId: number
    voucherNo: string
    date: string
    description: string
  }>(null)
  const [confirmDetailReverse, setConfirmDetailReverse] = useState(false)
  const [editFiles, setEditFiles] = useState<File[]>([])
  const [editExistingFiles, setEditExistingFiles] = useState<
    Array<{ id: number; fileName: string }>
  >([])
  const [editExistingFilesLoading, setEditExistingFilesLoading] = useState(false)
  const [editInitialSnapshot, setEditInitialSnapshot] = useState('')
  const [confirmDiscardEdit, setConfirmDiscardEdit] = useState(false)
  const [confirmDiscardCreate, setConfirmDiscardCreate] = useState(false)
  const [confirmDeleteEdit, setConfirmDeleteEdit] = useState(false)

  const refreshDetailVoucher = useCallback(async () => {
    if (!detailVoucher?.id) return
    try {
      const refreshed = await window.api?.vouchers.list?.({
        limit: 1,
        voucherIds: [detailVoucher.id]
      })
      const next = (refreshed as any)?.rows?.[0]
      if (next) {
        setDetailVoucher(next)
      }
    } catch {
      // Ignore and keep current details open
    }
  }, [detailVoucher?.id])

  useEffect(() => {
    document.documentElement.classList.add('detached-quick-add-document')
    document.body.classList.add('detached-quick-add-body')

    return () => {
      document.documentElement.classList.remove('detached-quick-add-document')
      document.body.classList.remove('detached-quick-add-body')
    }
  }, [])

  const budgetsForEdit = useMemo(() => {
    const byIdEarmark = new Map(earmarks.map((e) => [e.id, e]))
    return budgets.map((budget: any) => {
      let label = ''
      if (budget.name && String(budget.name).trim()) label = String(budget.name).trim()
      else if (budget.categoryName && String(budget.categoryName).trim())
        label = `${budget.year} - ${budget.categoryName}`
      else if (budget.projectName && String(budget.projectName).trim())
        label = `${budget.year} - ${budget.projectName}`
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
          const warnings = res?.warnings
          if (warnings?.length) warnings.forEach((msg) => notify('info', 'Warnung: ' + msg))
          await window.api?.quickAdd?.notifySaved?.({
            ...res,
            draftId: detachedDraftIdRef.current,
            agentDraftId: payload?.agentDraftId
          })
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
        if (!cancelled)
          notify('error', 'Stammdaten für das Buchungsfenster konnten nicht geladen werden.')
      }
    }
    loadLookups()
    return () => {
      cancelled = true
    }
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
      } catch {}
      if (cancelled || openedRef.current) return
      detachedDraftIdRef.current = String(initial?.draftId || token || '')
      const initialFiles = Array.isArray(initial?.files)
        ? initial.files.map((file: any) =>
            base64ToFile(String(file.name || 'Datei'), String(file.dataBase64 || ''), file.mime)
          )
        : []
      openedRef.current = true
      if (initial?.mode === 'details') {
        setWindowModeKind('details')
        const initialVoucher = initial?.voucher || initial?.qa || null
        if (initialVoucher?.id) {
          setDetailVoucher(initialVoucher)
        } else if (initial?.voucherId) {
          try {
            const res = await window.api?.vouchers.list?.({
              limit: 1,
              voucherIds: [Number(initial.voucherId)]
            })
            setDetailVoucher((res as any)?.rows?.[0] || null)
          } catch {
            setDetailVoucher(null)
          }
        }
      } else if (initial?.mode === 'edit') {
        const form = voucherRowToBookingForm(
          initial?.qa || initial?.voucher || { id: initial?.voucherId }
        )
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
    return () => {
      cancelled = true
    }
  }, [openQuickAdd])

  useEffect(() => {
    if (!quickAdd || descSuggest.length > 0) return
    let cancelled = false
    async function loadSuggestions() {
      try {
        const res = await window.api?.vouchers?.recent?.({ limit: 50 })
        const uniq = new Set<string>()
        for (const row of (res as any)?.rows || []) {
          const description = String(row.description || '').trim()
          if (description) uniq.add(description)
          if (uniq.size >= 50) break
        }
        if (!cancelled) setDescSuggest(Array.from(uniq))
      } catch {}
    }
    loadSuggestions()
    return () => {
      cancelled = true
    }
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
    if (
      shouldPromptDiscardForDraftClose({
        showBookingDraftTabs,
        hasUnsavedChanges: isCreateDraftDirty()
      })
    ) {
      setConfirmDiscardCreate(true)
      return
    }
    if (showBookingDraftTabs && detachedDraftIdRef.current) {
      const draftId = detachedDraftIdRef.current
      void (async () => {
        try {
          const encodedFiles = await Promise.all(
            files.map(async (file) => ({
              name: file.name,
              dataBase64: bufferToBase64Safe(await file.arrayBuffer()),
              mime: file.type || undefined
            }))
          )
          await window.api?.quickAdd?.syncDraft?.({
            draftId,
            qa,
            files: encodedFiles,
            detached: false
          })
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
      const encoded = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          dataBase64: bufferToBase64Safe(await file.arrayBuffer()),
          mime: file.type || undefined
        }))
      )
      if (!cancelled) void window.api?.quickAdd?.syncDraft?.({ draftId, files: encoded })
    }
    syncFiles()
    return () => {
      cancelled = true
    }
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
        await window.api?.attachments.add?.({
          voucherId: Number(editQa.id),
          fileName: file.name,
          dataBase64,
          mimeType: file.type || undefined
        })
      }
      notify('success', 'Buchung gespeichert')
      const warnings = res?.warnings
      if (warnings?.length) warnings.forEach((msg) => notify('info', 'Warnung: ' + msg))
      await window.api?.quickAdd?.notifySaved?.({
        id: Number(editQa.id),
        draftId: detachedDraftIdRef.current,
        mode: 'edit'
      })
      window.api?.window?.confirmClose?.()
    } catch (e: any) {
      notify('error', friendlyVoucherError(e))
    }
  }, [editFiles, editQa, notify])

  const requestCloseDetachedEdit = useCallback(() => {
    if (
      shouldPromptDiscardForEdit({
        showBookingEditTabs,
        hasUnsavedChanges: Boolean(
          editQa && (serializeBookingForm(editQa) !== editInitialSnapshot || editFiles.length > 0)
        )
      })
    ) {
      setConfirmDiscardEdit(true)
      return
    }
    window.api?.window?.confirmClose?.()
  }, [editFiles.length, editInitialSnapshot, editQa, showBookingEditTabs])

  useEffect(() => {
    return window.api?.window?.onCloseRequested?.(() => {
      if (windowModeKind === 'details') {
        window.api?.window?.confirmClose?.()
        return
      }
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
        await window.api?.quickAdd?.notifySaved?.({
          id: Number(editQa.id),
          draftId: detachedDraftIdRef.current,
          mode: 'delete',
          deleted: true
        })
      } else {
        const res = await window.api?.vouchers.reverse?.({
          originalId: Number(editQa.id),
          reason: 'Storno statt Löschen'
        })
        notify('success', `Storno erstellt: #${res?.voucherNo || ''}`)
        await window.api?.quickAdd?.notifySaved?.({
          id: res?.id,
          originalId: Number(editQa.id),
          draftId: detachedDraftIdRef.current,
          mode: 'reverse'
        })
      }
      window.api?.window?.confirmClose?.()
    } catch (e: any) {
      notify('error', e?.message || String(e))
    }
  }, [allowVoucherDeletion, editQa, notify])

  const reverseDetachedDetails = useCallback(async () => {
    if (!detailVoucher?.id) return
    try {
      const res = await window.api?.vouchers.reverse?.({
        originalId: Number(detailVoucher.id),
        reason: 'Storno statt Löschen'
      })
      setConfirmDetailReverse(false)
      notify('success', `Storno erstellt: #${res?.voucherNo || ''}`)
      const refreshed = await window.api?.vouchers.list?.({
        limit: 1,
        voucherIds: [Number(detailVoucher.id)]
      })
      const next = (refreshed as any)?.rows?.[0]
      if (next) setDetailVoucher(next)
      window.dispatchEvent(new Event('data-changed'))
      await window.api?.quickAdd?.notifySaved?.({
        id: res?.id,
        originalId: Number(detailVoucher.id),
        draftId: detachedDraftIdRef.current,
        mode: 'reverse'
      })
    } catch (e: any) {
      notify('error', e?.message || String(e))
    }
  }, [detailVoucher, notify])

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

  if (
    !loaded ||
    (windowModeKind === 'create' && !quickAdd) ||
    (windowModeKind === 'edit' && !editQa) ||
    (windowModeKind === 'details' && !detailVoucher)
  ) {
    return <div className="detached-quick-add-loading">Buchungsfenster wird vorbereitet...</div>
  }

  if (windowModeKind === 'details' && detailVoucher) {
    return (
      <>
        <VoucherInfoModal
          voucher={detailVoucher}
          onClose={() => window.api?.window?.confirmClose?.()}
          eurFmt={eurFmt}
          fmtDate={fmtDate}
          notify={notify}
          earmarks={earmarks}
          budgets={budgetsForEdit}
          tagDefs={tagDefs}
          allowVoucherDeletion={allowVoucherDeletion}
          windowMode
          onOpenAttachments={() => {
            setDetailAttachmentsVoucher({
              voucherId: detailVoucher.id,
              voucherNo: detailVoucher.voucherNo,
              date: detailVoucher.date,
              description: detailVoucher.description || ''
            })
          }}
          onSaveMeta={async (payload) => {
            const res = await window.api?.vouchers.updateMeta?.({
              id: detailVoucher.id,
              note: payload.note,
              budgets: payload.budgets,
              earmarks: payload.earmarks,
              tags: payload.tags
            })
            if (!res) throw new Error('Buchungsdetails konnten nicht gespeichert werden.')
            const refreshed = await window.api?.vouchers.list?.({
              limit: 1,
              voucherIds: [detailVoucher.id]
            })
            const next = (refreshed as any)?.rows?.[0]
            if (next) setDetailVoucher(next)
            window.dispatchEvent(new Event('data-changed'))
            await window.api?.quickAdd?.notifySaved?.({
              id: detailVoucher.id,
              draftId: detachedDraftIdRef.current,
              mode: 'details'
            })
          }}
          onReverse={() => setConfirmDetailReverse(true)}
        />
        {confirmDetailReverse && (
          <div
            className="modal-overlay"
            role="dialog"
            aria-modal="true"
            onClick={() => setConfirmDetailReverse(false)}
            style={{ zIndex: 16000, alignItems: 'center', paddingTop: 0 }}
          >
            <div
              className="modal"
              onClick={(e) => e.stopPropagation()}
              style={{ width: 'min(460px, 92vw)' }}
            >
              <header
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8
                }}
              >
                <h2 style={{ margin: 0 }}>Buchung stornieren</h2>
                <button className="btn danger" onClick={() => setConfirmDetailReverse(false)}>
                  Schließen
                </button>
              </header>
              <p>
                Möchtest du die Buchung{' '}
                <strong>
                  #{detailVoucher.voucherNo}
                  {detailVoucher.description ? ` - ${detailVoucher.description}` : ''}
                </strong>{' '}
                stornieren? Die Originalbuchung bleibt erhalten und es wird eine Gegenbuchung
                erstellt.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <button className="btn" onClick={() => setConfirmDetailReverse(false)}>
                  Abbrechen
                </button>
                <button
                  className="btn danger"
                  onClick={() => {
                    void reverseDetachedDetails()
                  }}
                >
                  Ja, stornieren
                </button>
              </div>
            </div>
          </div>
        )}
        {detailAttachmentsVoucher && (
          <AttachmentsModal
            voucher={detailAttachmentsVoucher}
            onClose={() => setDetailAttachmentsVoucher(null)}
            onChanged={async () => {
              await refreshDetailVoucher()
            }}
          />
        )}
      </>
    )
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
          footerLeft={
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {editMutationBlockReason ? (
                <div className="helper">{editMutationBlockReason}</div>
              ) : (
                <button
                  type="button"
                  className="btn danger"
                  title={allowVoucherDeletion ? 'Löschen' : 'Stornieren'}
                  onClick={() => setConfirmDeleteEdit(true)}
                >
                  {allowVoucherDeletion ? 'Löschen' : 'Stornieren'}
                </button>
              )}
              <div className="helper">
                Ctrl+S = Speichern · Ctrl+U = Datei hinzufügen · Esc = Abbrechen
              </div>
            </div>
          }
          onClose={requestCloseDetachedEdit}
          onRequestClose={requestCloseDetachedEdit}
          confirmingClose={confirmDiscardEdit}
          onConfirmDiscard={() => window.api?.window?.confirmClose?.()}
          onCancelDiscard={() => {
            setConfirmDiscardEdit(false)
            void window.api?.window?.cancelClose?.()
          }}
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
          onOpenExistingFile={(fileId) => {
            void window.api?.attachments.open?.({ fileId })
          }}
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
            <div
              className="modal"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 520, display: 'grid', gap: 12 }}
            >
              <header
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <h2 style={{ margin: 0 }}>
                  {allowVoucherDeletion ? 'Buchung löschen' : 'Buchung stornieren'}
                </h2>
                <button
                  className="btn ghost"
                  onClick={() => setConfirmDeleteEdit(false)}
                  aria-label="Schließen"
                >
                  ✕
                </button>
              </header>
              <p style={{ margin: 0 }}>
                {allowVoucherDeletion
                  ? 'Möchtest du diese Buchung wirklich löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.'
                  : 'Möchtest du diese Buchung stornieren? Die Originalbuchung bleibt erhalten und es wird eine Gegenbuchung erstellt.'}
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn" onClick={() => setConfirmDeleteEdit(false)}>
                  Abbrechen
                </button>
                <button
                  className="btn danger"
                  onClick={() => {
                    void deleteDetachedEdit()
                  }}
                >
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
      onCancelDiscard={() => {
        setConfirmDiscardCreate(false)
        void window.api?.window?.cancelClose?.()
      }}
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
  const effectiveNavLayout = narrowOverride && navLayout === 'top' ? 'left' : navLayout

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
      } catch {
        /* ignore */
      }
    }
    loadPendingCount()
    const onChanged = () => loadPendingCount()
    window.addEventListener('data-changed', onChanged)
    return () => {
      cancelled = true
      window.removeEventListener('data-changed', onChanged)
    }
  }, [])

  // Open bank transactions count for nav badge
  const [openBankImportsCount, setOpenBankImportsCount] = useState(0)
  useEffect(() => {
    let cancelled = false
    async function loadOpenCount() {
      try {
        const res = await (window as any).api?.bankTransactions?.list?.({
          status: 'OPEN',
          limit: 1,
          page: 1
        })
        if (!cancelled) {
          setOpenBankImportsCount(res?.stats?.open || res?.total || 0)
        }
      } catch {
        /* ignore */
      }
    }
    loadOpenCount()
    const onChanged = () => loadOpenCount()
    window.addEventListener('data-changed', onChanged)
    return () => {
      cancelled = true
      window.removeEventListener('data-changed', onChanged)
    }
  }, [])

  // Due membership fees count for nav badge
  const [dueMembershipFeesCount, setDueMembershipFeesCount] = useState(0)
  useEffect(() => {
    let cancelled = false
    async function loadDueMembershipFeesCount() {
      try {
        const res = await (window as any).api?.payments?.dueSummary?.()
        if (!cancelled) {
          setDueMembershipFeesCount(res?.dueMembers || 0)
        }
      } catch {
        /* ignore */
      }
    }
    loadDueMembershipFeesCount()
    const onChanged = () => loadDueMembershipFeesCount()
    window.addEventListener('data-changed', onChanged)
    return () => {
      cancelled = true
      window.removeEventListener('data-changed', onChanged)
    }
  }, [])

  // Open invoices count for nav badge
  const [openInvoicesCount, setOpenInvoicesCount] = useState(0)
  useEffect(() => {
    let cancelled = false
    async function loadOpenCount() {
      try {
        // Count OPEN and PARTIAL invoices using total from API (limit: 1 to minimize data transfer)
        const resOpen = await (window as any).api?.invoices?.list?.({ status: 'OPEN', limit: 1 })
        const resPartial = await (window as any).api?.invoices?.list?.({
          status: 'PARTIAL',
          limit: 1
        })
        if (!cancelled) {
          const openCount = (resOpen?.total || 0) + (resPartial?.total || 0)
          setOpenInvoicesCount(openCount)
        }
      } catch {
        /* ignore */
      }
    }
    loadOpenCount()
    const onChanged = () => loadOpenCount()
    window.addEventListener('data-changed', onChanged)
    return () => {
      cancelled = true
      window.removeEventListener('data-changed', onChanged)
    }
  }, [])

  // Global data refresh key to trigger summary re-fetches across views
  const [refreshKey, setRefreshKey] = useState(0)
  const bumpDataVersion = useCallback(() => setRefreshKey((k) => k + 1), [])
  const [lastId, setLastId] = useState<number | null>(null) // Track last created voucher id
  const [flashId, setFlashId] = useState<number | null>(null) // Row highlight for newly created voucher

  useEffect(() => {
    const onDataChanged = () => bumpDataVersion()
    window.addEventListener('data-changed', onDataChanged)
    return () => window.removeEventListener('data-changed', onDataChanged)
  }, [bumpDataVersion])

  useEffect(() => {
    const off = window.api?.quickAdd?.onSaved?.((payload: any) => {
      const id = typeof payload?.id === 'number' ? payload.id : null
      if (id != null && !payload?.deleted) {
        setLastId(id)
        setFlashId(id)
        window.setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 3000)
      }
      window.dispatchEvent(new Event('data-changed'))
    })
    return () => {
      if (typeof off === 'function') off()
    }
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
      } catch {}
    }
    loadYears()
    const onChanged = () => loadYears()
    window.addEventListener('data-changed', onChanged)
    return () => {
      cancelled = true
      window.removeEventListener('data-changed', onChanged)
    }
  }, [])
  const [activePage, setActivePage] = useState<NavKey>(() => {
    try {
      return (localStorage.getItem('activePage') as NavKey) || 'Buchungen'
    } catch {
      return 'Buchungen'
    }
  })
  const [aiBusy, setAiBusy] = useState(false)
  const [aiViewMounted, setAiViewMounted] = useState(() => activePage === 'KI')
  const requiredNavItems = useMemo(
    () => new Set<NavKey>(['Dashboard', 'Buchungen', 'Einstellungen']),
    []
  )
  const defaultVisibleNavItems = useMemo(
    () => navItems.filter((item) => item.key !== 'KI').map((item) => item.key),
    []
  )
  const [visibleNavItems, setVisibleNavItemsState] = useState<NavKey[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('ui.visibleNavItems') || 'null')
      if (!Array.isArray(parsed)) return defaultVisibleNavItems
      const valid = new Set(navItems.map((item) => item.key))
      return Array.from(
        new Set([...parsed.filter((key) => valid.has(key)), ...requiredNavItems])
      ) as NavKey[]
    } catch {
      return defaultVisibleNavItems
    }
  })
  const setVisibleNavItems = useCallback(
    (items: NavKey[]) => {
      const valid = new Set(navItems.map((item) => item.key))
      const next = Array.from(
        new Set([...items.filter((key) => valid.has(key)), ...requiredNavItems])
      ) as NavKey[]
      setVisibleNavItemsState(next)
      try {
        localStorage.setItem('ui.visibleNavItems', JSON.stringify(next))
      } catch {}
    },
    [requiredNavItems]
  )
  const visibleNavSet = useMemo(() => new Set(visibleNavItems), [visibleNavItems])
  const visibleNavigationItems = useMemo(
    () => navItems.filter((item) => visibleNavSet.has(item.key)),
    [visibleNavSet]
  )
  useEffect(() => {
    if (visibleNavSet.has(activePage)) return
    setActivePage(visibleNavSet.has('Dashboard') ? 'Dashboard' : 'Buchungen')
  }, [activePage, visibleNavSet])
  useEffect(() => {
    if (activePage === 'KI') setAiViewMounted(true)
  }, [activePage])
  const [receiptTarget, setReceiptTarget] = useState<null | {
    voucherId: number
    voucherNo: string
    date: string
    description: string
  }>(null)
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

  const openSettingsTile = useCallback((tile: string) => {
    try {
      sessionStorage.setItem('settingsActiveTile', tile)
    } catch {
      /* ignore */
    }
    setActivePage('Einstellungen')
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('settings:selectTile', { detail: { tile } }))
    }, 100)
  }, [])

  useEffect(() => {
    updatePromptRef.current = updatePrompt
  }, [updatePrompt])

  // Pre-update backup toast (sent from main process)
  useEffect(() => {
    const offOk = (window as any).api?.db?.onPreUpdateBackup?.(
      (info: { fromVersion: string; toVersion: string; filePath: string; dir: string }) => {
        notify(
          'success',
          `Update erkannt (${info.fromVersion} → ${info.toVersion}). Sicherheits-Backup erstellt.`,
          9000,
          {
            label: 'Ordner öffnen',
            onClick: () => {
              try {
                ;(window as any).api?.backup?.openFolder?.()
              } catch {}
            }
          }
        )
      }
    )

    const offFail = (window as any).api?.db?.onPreUpdateBackupFailed?.(
      (info: { fromVersion: string; toVersion: string; error: string }) => {
        notify(
          'warn',
          `Update erkannt (${info.fromVersion} → ${info.toVersion}), aber Sicherheits-Backup fehlgeschlagen: ${info.error}`,
          12000,
          {
            label: 'Backup-Ordner',
            onClick: () => {
              try {
                ;(window as any).api?.backup?.openFolder?.()
              } catch {}
            }
          }
        )
      }
    )

    return () => {
      try {
        offOk?.()
      } catch {}
      try {
        offFail?.()
      } catch {}
    }
  }, [notify])
  useEffect(() => {
    // Decide locally if a prompt should be shown; mirrors logic from main but with modal UX
    let disposed = false
    ;(async () => {
      try {
        const mode = String(
          (await window.api?.settings?.get?.({ key: 'backup.auto' }))?.value || 'PROMPT'
        ).toUpperCase()
        if (mode !== 'PROMPT') return
        const intervalDays = Number(
          (await window.api?.settings?.get?.({ key: 'backup.intervalDays' }))?.value || 7
        )
        const lastAuto = Number(
          (await window.api?.settings?.get?.({ key: 'backup.lastAuto' }))?.value || 0
        )
        const now = Date.now()
        const due = !lastAuto || now - lastAuto > intervalDays * 24 * 60 * 60 * 1000
        if (!due) return
        if (!disposed) setAutoBackupPrompt({ intervalDays })
      } catch {
        /* ignore */
      }
    })()
    return () => {
      disposed = true
    }
  }, [])

  const showStartupUpdateNotice = useCallback(
    (state: UpdateModalState) => {
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
            openSettingsTile('updates')
          }
        }
      )
    },
    [notify, openSettingsTile]
  )

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
    try {
      return 'overview'
    } catch {
      return 'overview'
    }
  })

  // Period lock (year-end) status for UI controls (e.g., lock edit)
  const [periodLock, setPeriodLock] = useState<{ closedUntil: string | null } | null>(null)
  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const s = await (window as any).api?.yearEnd?.status?.()
        if (alive) setPeriodLock(s || { closedUntil: null })
      } catch {}
    }
    load()
    const onChanged = () => load()
    window.addEventListener('data-changed', onChanged)
    return () => {
      alive = false
      window.removeEventListener('data-changed', onChanged)
    }
  }, [])
  // Export options modal state (Reports)
  const [showExportOptions, setShowExportOptions] = useState<boolean>(false)
  const [showActivityReportEditor, setShowActivityReportEditor] = useState<boolean>(false)
  type AmountMode = 'POSITIVE_BOTH' | 'OUT_NEGATIVE'
  const [exportFields, setExportFields] = useState<
    Array<
      | 'date'
      | 'voucherNo'
      | 'type'
      | 'sphere'
      | 'description'
      | 'status'
      | 'paymentMethod'
      | 'netAmount'
      | 'vatAmount'
      | 'grossAmount'
      | 'tags'
    >
  >([
    'date',
    'voucherNo',
    'type',
    'sphere',
    'description',
    'status',
    'paymentMethod',
    'netAmount',
    'vatAmount',
    'grossAmount'
  ])
  const [exportOrgName, setExportOrgName] = useState<string>('')
  const [exportAmountMode, setExportAmountMode] = useState<AmountMode>('OUT_NEGATIVE')
  const [exportSortDir, setExportSortDir] = useState<'ASC' | 'DESC'>('DESC')
  const [exportType, setExportType] = useState<'standard' | 'fiscal' | 'treasurer'>('standard')
  const [fiscalYear, setFiscalYear] = useState<number>(new Date().getFullYear())
  const [includeBindings, setIncludeBindings] = useState<boolean>(false)
  const [includeVoucherList, setIncludeVoucherList] = useState<boolean>(false)
  const [includeBudgets, setIncludeBudgets] = useState<boolean>(false)
  const [includeActivityReport, setIncludeActivityReport] = useState<boolean>(false)
  const [includeInternalVouchers, setIncludeInternalVouchers] = useState<boolean>(false)

  type FiscalExportOptions = {
    includeBindings?: boolean
    includeVoucherList?: boolean
    includeBudgets?: boolean
    includeActivityReport?: boolean
    includeInactiveBindings?: boolean
    includeArchivedBudgets?: boolean
    includeInternalVouchers?: boolean
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
    includeInternalVouchers?: boolean
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
    try {
      localStorage.setItem('activePage', activePage)
    } catch {}
  }, [activePage])
  // No-op: unified reports page; keep effect to avoid removing too many deps
  useEffect(() => {
    /* unified reports */
  }, [reportsTab])
  // Open Export Options when requested from nested components
  useEffect(() => {
    function onOpenExport() {
      setShowExportOptions(true)
    }
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
      } catch {}
    }
    loadOrg()
    return () => {
      cancelled = true
    }
  }, [showExportOptions])

  // Global handler: jump from invoice detail (linked booking) to Journal view filtered
  useEffect(() => {
    function onVoucherJump(ev: any) {
      try {
        const detail = ev?.detail || {}
        const voucherId = detail.voucherId ? Number(detail.voucherId) : null
        const voucherNo = typeof detail.voucherNo === 'string' ? detail.voucherNo.trim() : ''
        const voucherDate = typeof detail.date === 'string' ? detail.date : ''

        setFilterSphere(null)
        setFilterType(null)
        setFilterPM(null)
        setFilterPaymentAccountId(null)
        setFilterEarmark(null)
        setFilterBudgetId(null)
        setFilterTag(null)

        if (voucherDate) {
          setFrom(voucherDate)
          setTo(voucherDate)
        } else {
          setFrom('')
          setTo('')
        }

        if (voucherNo) {
          setQ(voucherNo)
        } else if (typeof detail.q === 'string' && detail.q.trim()) {
          setQ(detail.q.trim())
        } else if (voucherId) {
          setQ(String(voucherId))
        } else {
          setQ('')
        }

        if (voucherId) {
          setFlashId(voucherId)
          window.setTimeout(() => setFlashId((cur) => (cur === voucherId ? null : cur)), 5000)
        }

        setActivePage('Buchungen')
        setPage(1)
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('apply-voucher-jump' as any, onVoucherJump as any)
    return () => window.removeEventListener('apply-voucher-jump' as any, onVoucherJump as any)
  }, [])

  // UI preference: date format (ISO vs PRETTY)
  type DateFmt = 'ISO' | 'PRETTY' | 'DOT'
  const [dateFmt, setDateFmt] = useState<DateFmt>(() => {
    try {
      return (localStorage.getItem('ui.dateFmt') as DateFmt) || 'ISO'
    } catch {
      return 'ISO'
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('ui.dateFmt', dateFmt)
    } catch {}
  }, [dateFmt])
  const fmtDate = useMemo(() => {
    const pretty = (s?: string) => {
      if (!s) return ''
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
      if (!m) return s
      const y = Number(m[1])
      const mo = Number(m[2])
      const d = Number(m[3])
      // Use UTC to avoid TZ shifting
      const dt = new Date(Date.UTC(y, mo - 1, d))
      const mon = dt.toLocaleString('de-DE', { month: 'short' }).replace('.', '')
      const dd = String(d).padStart(2, '0')
      return `${dd} ${mon} ${y}`
    }
    const dot = (s?: string) => {
      if (!s) return ''
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
      if (!m) return s
      return `${m[3]}.${m[2]}.${m[1]}`
    }
    return (s?: string) => (dateFmt === 'PRETTY' ? pretty(s) : dateFmt === 'DOT' ? dot(s) : s || '')
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
          if (p?.bankTransactionId) window.dispatchEvent(new Event('data-changed'))
          await window.api?.quickAdd?.notifySaved?.({
            ...res,
            agentDraftId: p?.agentDraftId
          })
        }
        return res
      } catch (e: any) {
        notify('error', friendlyError(e))
        return null
      }
    },
    () => fileInputRef.current?.click(),
    notify,
    showBookingDraftTabs,
    quickAddAfterSave
  )

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ qa?: any; files?: File[] }>).detail || {}
      if (!detail.qa) return
      openQuickAdd({ qa: detail.qa, files: detail.files || [] })
    }
    window.addEventListener('ai:open-booking-draft', handler)
    return () => window.removeEventListener('ai:open-booking-draft', handler)
  }, [openQuickAdd])

  const detachQuickAdd = useCallback(async () => {
    if (!activeDraftId) return
    try {
      const detachedFiles = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          dataBase64: bufferToBase64Safe(await file.arrayBuffer()),
          mime: file.type || undefined
        }))
      )
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
        patch.files = payload.files.map((file: any) =>
          base64ToFile(String(file.name || 'Datei'), String(file.dataBase64 || ''), file.mime)
        )
      }
      if (typeof payload?.detached === 'boolean') {
        patch.detached = payload.detached
      }
      if (Object.keys(patch).length) updateDraft(draftId, patch)
    })
    return () => {
      if (typeof off === 'function') off()
    }
  }, [updateDraft])

  useEffect(() => {
    const off = window.api?.quickAdd?.onDetachedClosed?.((payload: any) => {
      const draftId = typeof payload?.draftId === 'string' ? payload.draftId : ''
      if (!draftId) return
      markDraftDocked(draftId)
    })
    return () => {
      if (typeof off === 'function') off()
    }
  }, [markDraftDocked])

  useEffect(() => {
    const off = window.api?.quickAdd?.onSaved?.((payload: any) => {
      const draftId = typeof payload?.draftId === 'string' ? payload.draftId : ''
      if (draftId) closeDraft(draftId)
    })
    return () => {
      if (typeof off === 'function') off()
    }
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
        for (const r of res?.rows || []) {
          const d = (r.description || '').trim()
          if (d) uniq.add(d)
          if (uniq.size >= 50) break
        }
        if (alive) setDescSuggest(Array.from(uniq))
      } catch {
        /* ignore */
      }
    }
    load()
    return () => {
      alive = false
    }
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

  const openBookingDraftTab = useCallback(
    (draftId: string) => {
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
            const detachedFiles = await Promise.all(
              sourceDraft.files.map(async (file) => ({
                name: file.name,
                dataBase64: bufferToBase64Safe(await file.arrayBuffer()),
                mime: file.type || undefined
              }))
            )
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
    },
    [
      bookingDrafts,
      bookingsOpenDetached,
      markDraftDetached,
      markDraftDocked,
      quickAddAfterSave,
      reopenDraft
    ]
  )

  const closeBookingDraftTab = useCallback(
    (draftId: string) => {
      const draft = bookingDrafts.find((entry) => entry.id === draftId)
      if (draft?.detached) void window.api?.quickAdd?.closeDetached?.({ draftId })
      closeDraft(draftId)
    },
    [bookingDrafts, closeDraft]
  )

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
      const draft = showBookingDraftTabs
        ? openQuickAdd(undefined, { detached: true, showModal: false })
        : null
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
  }, [
    bookingsOpenDetached,
    dockAndOpenDraft,
    notify,
    openQuickAdd,
    quickAddAfterSave,
    showBookingDraftTabs
  ])

  // These values are displayed and changed by the global shortcut menu, so they
  // must be initialized before shortcutCommands is created.
  const [page, setPage] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('journal.page') || '1')
    } catch {
      return 1
    }
  })
  const [journalLimit, setJournalLimit] = useState<number>(50)

  const activePageShortcuts = useMemo<PageShortcutAction[]>(() => {
    const shortcuts = [...registeredPageShortcuts]
    if (activePage === 'Buchungen') {
      shortcuts.unshift({
        id: 'journal-quick-add',
        key: 'q',
        label: 'Buchung',
        action: openBookingEntry
      })
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
        children: visibleNavigationItems.map((item) => ({
          key: (
            {
              Dashboard: 'd',
              Buchungen: 'b',
              Bankimport: 'k',
              Verbindlichkeiten: 'v',
              Mitglieder: 'm',
              Vorschuesse: 'o',
              Budgets: 'p',
              Zweckbindungen: 'z',
              Einreichungen: 'i',
              Belege: 'l',
              Reports: 'r',
              Einstellungen: 'e'
            } as Record<NavKey, string>
          )[item.key],
          label: item.label,
          icon: (
            <span className={navIconColorMode === 'color' ? `icon-color-${item.key}` : ''}>
              {getNavIcon(item.key)}
            </span>
          ),
          action: () => setActivePage(item.key)
        }))
      },
      {
        key: 's',
        label: 'Suche …',
        description: 'Bereich öffnen und Suchfeld fokussieren',
        children: [
          {
            key: 'b',
            label: 'Buchungen',
            action: () => navigateAndFocus('Buchungen', '.journal-filter-toolbar__search')
          },
          {
            key: 'k',
            label: 'Bankimport',
            action: () => navigateAndFocus('Bankimport', '.bank-import-search')
          },
          {
            key: 'v',
            label: 'Verbindlichkeiten',
            action: () => navigateAndFocus('Verbindlichkeiten', '.invoices-search')
          },
          {
            key: 'm',
            label: 'Mitglieder',
            action: () => navigateAndFocus('Mitglieder', '.members-search')
          },
          {
            key: 'o',
            label: 'Vorschüsse',
            action: () => navigateAndFocus('Vorschuesse', 'input[placeholder^="Suchen (Person"]')
          }
        ]
      },
      ...(pageActions.length
        ? [
            {
              key: 'a',
              label: `Aktionen: ${navItems.find((item) => item.key === activePage)?.label ?? activePage} …`,
              description: 'Funktionen des aktuellen Bereichs',
              children: pageActions
            }
          ]
        : []),
      {
        key: 'e',
        label: 'Einstellungen & Verwaltung …',
        description: 'Häufige Verwaltungsbereiche direkt öffnen',
        icon: (
          <span className={navIconColorMode === 'color' ? 'icon-color-Einstellungen' : ''}>
            {getNavIcon('Einstellungen')}
          </span>
        ),
        children: [
          {
            key: 'n',
            label: 'Navigation & Layout …',
            description: 'Menü und Buchungstabelle direkt anpassen',
            icon: <span aria-hidden>🧭</span>,
            children: [
              {
                key: 'm',
                label: 'Menü-Layout …',
                description: `Aktuell: ${navLayout === 'left' ? 'Links' : 'Oben'}`,
                children: [
                  { key: 'l', label: 'Links (klassisch)', action: () => setNavLayout('left') },
                  { key: 'o', label: 'Oben (Icons)', action: () => setNavLayout('top') }
                ]
              },
              {
                key: 'h',
                label: 'Zeilenhöhe …',
                description: `Aktuell: ${journalRowDensity === 'compact' ? 'Kompakt' : 'Normal'}`,
                children: [
                  { key: 'n', label: 'Normal', action: () => setJournalRowDensity('normal') },
                  { key: 'k', label: 'Kompakt', action: () => setJournalRowDensity('compact') }
                ]
              },
              {
                key: 'z',
                label: 'Buchungen: Zeilenlayout …',
                description: `Aktuell: ${{ both: 'Linien + Zebra', lines: 'Nur Linien', zebra: 'Nur Zebra', none: 'Ohne Linien/Zebra' }[journalRowStyle]}`,
                children: [
                  { key: 'l', label: 'Linien + Zebra', action: () => setJournalRowStyle('both') },
                  { key: 'i', label: 'Nur Linien', action: () => setJournalRowStyle('lines') },
                  { key: 'z', label: 'Nur Zebra', action: () => setJournalRowStyle('zebra') },
                  { key: 'o', label: 'Ohne Linien/Zebra', action: () => setJournalRowStyle('none') }
                ]
              },
              {
                key: 'f',
                label: 'Farbige Menüicons umschalten',
                description: `Aktuell: ${navIconColorMode === 'color' ? 'Ein' : 'Aus'}`,
                action: () => setNavIconColorMode(navIconColorMode === 'color' ? 'mono' : 'color')
              },
              {
                key: 'b',
                label: 'Buchungsreiter umschalten',
                description: `Aktuell: ${showBookingDraftTabs ? 'Ein' : 'Aus'}`,
                action: () => setShowBookingDraftTabs(!showBookingDraftTabs)
              },
              {
                key: 'e',
                label: 'Eigenes Buchungsfenster umschalten',
                description: `Aktuell: ${bookingsOpenDetached ? 'Ein' : 'Aus'}`,
                action: () => setBookingsOpenDetached(!bookingsOpenDetached)
              },
              {
                key: 's',
                label: 'Nach dem Speichern …',
                description: `Aktuell: ${quickAddAfterSave === 'close' ? 'Schließen' : 'Neue Buchung'}`,
                children: [
                  {
                    key: 's',
                    label: 'Buchungsmodal schließen',
                    action: () => setQuickAddAfterSave('close')
                  },
                  {
                    key: 'n',
                    label: 'Neue Buchung öffnen',
                    action: () => setQuickAddAfterSave('new')
                  }
                ]
              },
              {
                key: 'd',
                label: 'Buchungen löschen …',
                description: `Aktuell: ${allowVoucherDeletion ? 'Endgültiges Löschen erlaubt' : 'Nur Storno'}`,
                children: [
                  {
                    key: 's',
                    label: 'Nur Storno erlauben',
                    action: () => setAllowVoucherDeletion(false)
                  },
                  {
                    key: 'e',
                    label: 'Endgültiges Löschen erlauben',
                    action: () => setAllowVoucherDeletion(true)
                  }
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
                key: 'e',
                label: 'Buchungen: Anzahl der Einträge …',
                description: `Aktuell: ${journalLimit}`,
                children: [
                  {
                    key: '2',
                    label: '20 Einträge',
                    action: () => {
                      setJournalLimit(20)
                      setPage(1)
                    }
                  },
                  {
                    key: '5',
                    label: '50 Einträge',
                    action: () => {
                      setJournalLimit(50)
                      setPage(1)
                    }
                  },
                  {
                    key: '0',
                    label: '100 Einträge',
                    action: () => {
                      setJournalLimit(100)
                      setPage(1)
                    }
                  }
                ]
              },
              {
                key: 'd',
                label: 'Datumsformat …',
                description: `Aktuell: ${dateFmt === 'ISO' ? '2025-01-15' : dateFmt === 'DOT' ? '15.01.2025' : '15. Jan 2025'}`,
                children: [
                  { key: 'i', label: 'ISO · 2025-01-15', action: () => setDateFmt('ISO') },
                  { key: 'l', label: 'Lesbar · 15. Jan 2025', action: () => setDateFmt('PRETTY') },
                  { key: 't', label: 'TT.MM.JJJJ · 15.01.2025', action: () => setDateFmt('DOT') }
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
          { key: 'm', label: 'KI-Muster', action: () => openSettingsTile('aiPatterns') },
          { key: 'k', label: 'Kassenprüfung', action: () => openSettingsTile('cashCheck') },
          { key: 'j', label: 'Jahresabschluss', action: () => openSettingsTile('yearEnd') },
          { key: 'u', label: 'Updates', action: () => openSettingsTile('updates') }
        ]
      }
    ]
  }, [
    activePage,
    activePageShortcuts,
    allowVoucherDeletion,
    bookingsOpenDetached,
    dateFmt,
    journalLimit,
    journalRowDensity,
    journalRowStyle,
    navIconColorMode,
    navLayout,
    navigateAndFocus,
    openBookingEntry,
    openSettingsTile,
    quickAddAfterSave,
    showBookingDraftTabs,
    visibleNavigationItems
  ])

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
      const res = await window.api?.vouchers.reverse?.({
        originalId: lastId,
        reason: 'Dev Reverse'
      })
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
      type: 'IN' | 'OUT' | 'TRANSFER' | 'INTERNAL'
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
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>(() => {
    try {
      return (localStorage.getItem('journal.sort') as any) || 'DESC'
    } catch {
      return 'DESC'
    }
  })
  const [sortBy, setSortBy] = useState<'date' | 'gross' | 'net'>(() => {
    try {
      return (localStorage.getItem('journal.sortBy') as any) || 'date'
    } catch {
      return 'date'
    }
  })
  // PaymentsAssignModal extracted to components/modals/PaymentsAssignModal.tsx
  // Buchungen (Journal) filter states
  const [from, setFrom] = useState<string>('')
  const [to, setTo] = useState<string>('')
  const [filterSphere, setFilterSphere] = useState<'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB' | null>(
    null
  )
  const [filterType, setFilterType] = useState<'IN' | 'OUT' | 'TRANSFER' | 'INTERNAL' | null>(null)
  const [filterPM, setFilterPM] = useState<'BAR' | 'BANK' | null>(null)
  const [filterPaymentAccountId, setFilterPaymentAccountId] = useState<number | null>(null)
  const [filterEarmark, setFilterEarmark] = useState<number | null>(null)
  const [filterBudgetId, setFilterBudgetId] = useState<number | null>(null)
  const [filterTag, setFilterTag] = useState<string | null>(null)
  const [q, setQ] = useState<string>('')
  // Reports filter states (separate to avoid interference with Buchungen)
  const [reportsFrom, setReportsFrom] = useState<string>('')
  const [reportsTo, setReportsTo] = useState<string>('')
  const [reportsFilterSphere, setReportsFilterSphere] = useState<
    'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB' | null
  >(null)
  const [reportsFilterType, setReportsFilterType] = useState<
    'IN' | 'OUT' | 'TRANSFER' | 'INTERNAL' | null
  >(null)
  const [reportsFilterPM, setReportsFilterPM] = useState<'BAR' | 'BANK' | null>(null)
  const [reportsFilterEarmark, setReportsFilterEarmark] = useState<number | null>(null)
  const [reportsFilterBudgetId, setReportsFilterBudgetId] = useState<number | null>(null)
  // Global Zweckbindungen (earmarks) for filters/tables
  const [earmarks, setEarmarks] = useState<
    Array<{
      id: number
      code: string
      name: string
      color?: string | null
      startDate?: string | null
      endDate?: string | null
      enforceTimeRange?: number
    }>
  >([])
  const [paymentAccounts, setPaymentAccounts] = useState<
    Array<{
      id: number
      name: string
      kind: 'CASH' | 'BANK' | 'PAYPAL' | 'CARD' | 'OTHER'
      iban?: string | null
      color?: string | null
      sortOrder: number
      isActive: number
    }>
  >([])
  async function loadEarmarks() {
    try {
      const res = await window.api?.bindings?.list?.({ activeOnly: true })
      const rows = (res as any)?.rows || []
      setEarmarks(rows)
    } catch {
      /* ignore */
    }
  }
  async function loadPaymentAccounts() {
    try {
      const res = await window.api?.paymentAccounts?.list?.()
      setPaymentAccounts((res as any)?.rows || [])
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    loadEarmarks()
    loadPaymentAccounts()
    const onChanged = () => {
      loadEarmarks()
      loadPaymentAccounts()
    }
    window.addEventListener('data-changed', onChanged)
    return () => window.removeEventListener('data-changed', onChanged)
  }, [])
  // Map of budget id -> friendly label for filter chips
  const [budgetNames, setBudgetNames] = useState<Map<number, string>>(new Map())
  const chips = useMemo(() => {
    const list: Array<{ key: string; label: string; clear: () => void }> = []
    if (from || to)
      list.push({
        key: 'range',
        label: `${from || '…'} – ${to || '…'}`,
        clear: () => {
          setFrom('')
          setTo('')
        }
      })
    if (filterSphere)
      list.push({
        key: 'sphere',
        label: `Sphäre: ${filterSphere}`,
        clear: () => setFilterSphere(null)
      })
    if (filterType)
      list.push({ key: 'type', label: `Art: ${filterType}`, clear: () => setFilterType(null) })
    if (filterPaymentAccountId != null) {
      const account = paymentAccounts.find((item) => item.id === filterPaymentAccountId)
      list.push({
        key: 'payment-account',
        label: `Zahlweg: ${account?.name || `#${filterPaymentAccountId}`}`,
        clear: () => setFilterPaymentAccountId(null)
      })
    } else if (filterPM)
      list.push({ key: 'pm', label: `Zahlweg: ${filterPM}`, clear: () => setFilterPM(null) })
    if (filterEarmark != null) {
      const em = earmarks.find((e) => e.id === filterEarmark)
      list.push({
        key: 'earmark',
        label: `Zweckbindung: ${em ? em.code : '#' + filterEarmark}`,
        clear: () => setFilterEarmark(null)
      })
    }
    if (filterBudgetId != null) {
      const label = budgetNames.get(filterBudgetId) || `#${filterBudgetId}`
      list.push({ key: 'budget', label: `Budget: ${label}`, clear: () => setFilterBudgetId(null) })
    }
    if (filterTag)
      list.push({ key: 'tag', label: `Tag: ${filterTag}`, clear: () => setFilterTag(null) })
    if (q)
      list.push({
        key: 'q',
        label: `Suche: ${q}`.slice(0, 40) + (q.length > 40 ? '…' : ''),
        clear: () => setQ('')
      })
    return list
  }, [
    from,
    to,
    filterSphere,
    filterType,
    filterPM,
    filterPaymentAccountId,
    filterEarmark,
    filterBudgetId,
    filterTag,
    earmarks,
    budgetNames,
    q,
    paymentAccounts
  ])
  // Legacy alias: older render sections still refer to activeChips; keep in sync
  const activeChips = chips

  // Global Tags state (for filters, table colorization, and tag manager)
  const [tagDefs, setTagDefs] = useState<
    Array<{ id: number; name: string; color?: string | null; usage?: number }>
  >([])
  async function loadTags() {
    try {
      const res = await window.api?.tags?.list?.({ includeUsage: true })
      if (res) setTagDefs(res.rows || [])
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    loadTags()
    const onChanged = () => loadTags()
    window.addEventListener('data-changed', onChanged)
    return () => window.removeEventListener('data-changed', onChanged)
  }, [])

  // Journal table UI: column visibility and order (Buchungen view)
  type ColKey =
    | 'actions'
    | 'date'
    | 'voucherNo'
    | 'type'
    | 'sphere'
    | 'description'
    | 'note'
    | 'earmark'
    | 'budget'
    | 'paymentMethod'
    | 'attachments'
    | 'net'
    | 'vat'
    | 'gross'
  const defaultCols: Record<ColKey, boolean> = getDefaultJournalCols() as Record<ColKey, boolean>
  const defaultOrder: ColKey[] = getDefaultJournalOrder() as ColKey[]
  // Human-readable labels for columns (used in Einstellungen > Tabelle)
  const labelForCol = (k: string): string => {
    switch (k) {
      case 'actions':
        return 'Aktionen'
      case 'date':
        return 'Datum'
      case 'voucherNo':
        return 'Nr.'
      case 'type':
        return 'Art'
      case 'sphere':
        return 'Sphäre'
      case 'description':
        return 'Beschreibung'
      case 'note':
        return 'Kommentar'
      case 'earmark':
        return 'Zweckbindung'
      case 'budget':
        return 'Budget'
      case 'paymentMethod':
        return 'Zahlweg'
      case 'attachments':
        return 'Anhänge'
      case 'net':
        return 'Netto'
      case 'vat':
        return 'USt'
      case 'gross':
        return 'Brutto'
      default:
        return k
    }
  }
  const [cols, setCols] = useState<Record<ColKey, boolean>>(() => {
    try {
      const s = localStorage.getItem('journalCols')
      const parsed = s ? JSON.parse(s) : null
      return parsed && typeof parsed === 'object' ? { ...defaultCols, ...parsed } : defaultCols
    } catch {
      return defaultCols
    }
  })
  const [order, setOrder] = useState<ColKey[]>(() => {
    try {
      const s = localStorage.getItem('journalColsOrder')
      const parsed = s ? JSON.parse(s) : null
      return Array.isArray(parsed) ? parsed : defaultOrder
    } catch {
      return defaultOrder
    }
  })
  // Try to hydrate from persisted settings (server) once on mount if present
  useEffect(() => {
    ;(async () => {
      try {
        const c = await window.api?.settings?.get?.({ key: 'journal.cols' })
        if (c?.value) {
          const parsed = JSON.parse(String(c.value))
          if (parsed && typeof parsed === 'object') setCols({ ...defaultCols, ...parsed })
        }
        const o = await window.api?.settings?.get?.({ key: 'journal.order' })
        if (o?.value) {
          const parsedO = JSON.parse(String(o.value))
          if (Array.isArray(parsedO)) setOrder(parsedO as ColKey[])
        }
      } catch {
        /* ignore */
      }
    })()
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem('journalCols', JSON.stringify(cols))
    } catch {}
    try {
      window.api?.settings?.set?.({ key: 'journal.cols', value: JSON.stringify(cols) })
    } catch {}
  }, [cols])
  useEffect(() => {
    try {
      localStorage.setItem('journalColsOrder', JSON.stringify(order))
    } catch {}
    try {
      window.api?.settings?.set?.({ key: 'journal.order', value: JSON.stringify(order) })
    } catch {}
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
  }, [
    journalLimit,
    page,
    sortDir,
    sortBy,
    filterPM,
    filterPaymentAccountId,
    filterSphere,
    filterType,
    from,
    to,
    filterEarmark,
    filterBudgetId,
    q,
    filterTag
  ])

  // Load vouchers whenever filters or page change
  useEffect(() => {
    // Removed old global loadRecent; JournalView listens to refreshKey now
  }, [activePage, loadRecent])

  // States for edit + batch modals (previously removed inadvertently)
  type VoucherRow = {
    id: number
    voucherNo: string
    date: string
    type: 'IN' | 'OUT' | 'TRANSFER' | 'INTERNAL'
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
  const [editRow, setEditRow] = useState<
    | (VoucherRow & {
        mode?: 'NET' | 'GROSS'
        transferFrom?: 'BAR' | 'BANK' | null
        transferTo?: 'BAR' | 'BANK' | null
      })
    | null
  >(null)
  const [deleteRow, setDeleteRow] = useState<null | {
    id: number
    voucherNo?: string | null
    description?: string | null
    fromEdit?: boolean
  }>(null)
  const editFileInputRef = useRef<HTMLInputElement | null>(null)
  const [editRowFilesLoading, setEditRowFilesLoading] = useState<boolean>(false)
  const [editRowFiles, setEditRowFiles] = useState<Array<{ id: number; fileName: string }>>([])
  const [confirmDeleteAttachment, setConfirmDeleteAttachment] = useState<null | {
    id: number
    fileName: string
  }>(null)
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
        } catch {
          setEditRowFiles([])
        } finally {
          setEditRowFilesLoading(false)
        }
      })()
    } else {
      setEditRowFiles([])
    }
  }, [editRow?.id])

  const eurFmt = useMemo(
    () => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }),
    []
  )

  // Zweckbindungen (Bindings) state (kept for Buchungen page dropdowns/filters)
  const [bindings, setBindings] = useState<
    Array<{
      id: number
      code: string
      name: string
      description?: string | null
      startDate?: string | null
      endDate?: string | null
      isActive: number
      color?: string | null
      budget?: number | null
      enforceTimeRange?: number
    }>
  >([])
  async function loadBindings() {
    const res = await window.api?.bindings.list?.({})
    if (res) setBindings(res.rows)
  }

  // Budgets state (kept for Buchungen page dropdowns/filters)
  const [budgets, setBudgets] = useState<
    Array<{
      id: number
      year: number
      sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
      categoryId: number | null
      projectId: number | null
      earmarkId: number | null
      amountPlanned: number
      name?: string | null
      categoryName?: string | null
      projectName?: string | null
      startDate?: string | null
      endDate?: string | null
      color?: string | null
      isArchived?: number
      enforceTimeRange?: number
    }>
  >([])
  const budgetsForEdit = useMemo(() => {
    const byIdEarmark = new Map(earmarks.map((e) => [e.id, e]))
    const makeLabel = (b: any) => {
      if (b.name && String(b.name).trim()) return String(b.name).trim()
      if (b.categoryName && String(b.categoryName).trim()) return `${b.year} - ${b.categoryName}`
      if (b.projectName && String(b.projectName).trim()) return `${b.year} - ${b.projectName}`
      if (b.earmarkId) {
        const em = byIdEarmark.get(b.earmarkId)
        if (em) return `${b.year} - ${em.code}`
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
        const byIdEarmark = new Map(earmarks.map((e) => [e.id, e]))
        for (const b of res.rows) {
          let label = ''
          if (b.name && String(b.name).trim()) label = String(b.name).trim()
          else if (b.categoryName && String(b.categoryName).trim())
            label = `${b.year} - ${b.categoryName}`
          else if (b.projectName && String(b.projectName).trim())
            label = `${b.year} - ${b.projectName}`
          else if (b.earmarkId) {
            const em: any = byIdEarmark.get(b.earmarkId)
            if (em) label = `${b.year} - ${em.code}`
          }
          if (!label) label = String(b.year)
          map.set(b.id, label)
        }
        setBudgetNames(map)
      } catch {
        /* ignore label map errors */
      }
    }
  }

  useEffect(() => {
    // Load bindings/budgets for Buchungen page (dropdown/filter needs labels)
    if (activePage === 'Buchungen') {
      loadBindings()
      loadBudgets()
    }
    if (activePage === 'Reports') {
      loadBudgets()
    }
  }, [activePage])

  // (earmarks loaded above)

  const isTopNav = effectiveNavLayout === 'top'
  return (
    <div className={`app-root-grid ${isTopNav ? 'app-root-grid--top' : 'app-root-grid--side'}`}>
      {/* Topbar with organisation header line */}
      <header
        className={`app-header ${isTopNav ? 'app-header-top' : 'app-header-left'}`}
        onDoubleClick={(e) => {
          const target = e.target as HTMLElement
          // Ignore double-clicks on interactive elements
          if (target && target.closest('button, input, select, textarea, a, [role="button"]'))
            return
          window.api?.window?.toggleMaximize?.()
        }}
      >
        <div className="app-header__left">
          <TopHeaderOrg notify={notify} />
        </div>
        {isTopNav ? <div className="app-header__drag-spacer" aria-hidden="true" /> : null}
        {isTopNav ? (
          <div className="app-header__nav no-drag" style={{ WebkitAppRegion: 'no-drag' } as any}>
            <TopNav
              activePage={activePage}
              onNavigate={setActivePage}
              navIconColorMode={navIconColorMode}
              pendingSubmissionsCount={pendingSubmissionsCount}
              openBankImportsCount={openBankImportsCount}
              openInvoicesCount={openInvoicesCount}
              dueMembershipFeesCount={dueMembershipFeesCount}
              showBadges
              items={visibleNavigationItems}
              aiBusy={aiBusy}
            />
          </div>
        ) : null}
        {isTopNav && <div className="app-header__drag-spacer" aria-hidden="true" />}
        {/* Window controls */}
        <div className="app-header__controls no-drag" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            className="btn ghost icon-btn"
            title="Minimieren"
            aria-label="Minimieren"
            onClick={() => window.api?.window?.minimize?.()}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="5" y="11" width="14" height="2" rx="1" />
            </svg>
          </button>
          <button
            className="btn ghost icon-btn"
            title="Maximieren / Wiederherstellen"
            aria-label="Maximieren"
            onClick={() => window.api?.window?.toggleMaximize?.()}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M6 6h12v12H6z" />
            </svg>
          </button>
          <button
            className="btn danger icon-btn"
            title="Schließen"
            aria-label="Schließen"
            onClick={() => window.api?.window?.close?.()}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" />
            </svg>
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
            openBankImportsCount={openBankImportsCount}
            openInvoicesCount={openInvoicesCount}
            dueMembershipFeesCount={dueMembershipFeesCount}
            showBadges
            items={visibleNavigationItems}
            aiBusy={aiBusy}
          />
        </aside>
      )}

      {/* Main content */}
      <main className={`app-main${activePage === 'Buchungen' ? ' app-main--journal' : ''}`}>
        <Suspense fallback={<LoadingState message="Bereich wird geladen…" />}>
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
              onGoToBankImport={() => setActivePage('Bankimport')}
              onGoToMembers={() => setActivePage('Mitglieder')}
              onGoToSubmissions={() => setActivePage('Einreichungen')}
              onGoToVoucher={({ voucherId, recordDate }) => {
                // Reset filters so the voucher can be found reliably
                resetVoucherFilters({
                  setFilterEarmark,
                  setFilterBudgetId,
                  setFilterTag,
                  setFilterType,
                  setFilterPM,
                  setFilterPaymentAccountId,
                  setFilterSphere,
                  setQ,
                  keepDateRange: true
                })
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
              setJournalLimit={(n: number) => {
                setJournalLimit(n)
                setPage(1)
              }}
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
              setJournalLimit={(n: number) => {
                setJournalLimit(n)
                setPage(1)
              }}
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
              visibleNavItems={visibleNavItems}
              setVisibleNavItems={setVisibleNavItems}
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
            <ReceiptsView
              openVoucher={receiptTarget}
              onVoucherOpened={() => setReceiptTarget(null)}
            />
          )}

          {activePage === 'Zweckbindungen' && (
            <EarmarksView
              from={from || undefined}
              to={to || undefined}
              filterSphere={filterSphere || undefined}
              onGoToBookings={(earmarkId) => {
                // Reset other filters first, then set earmark and navigate
                resetVoucherFilters({
                  setFilterEarmark,
                  setFilterBudgetId,
                  setFilterTag,
                  setFilterType,
                  setFilterPM,
                  setFilterPaymentAccountId,
                  setFilterSphere,
                  setQ,
                  setFrom,
                  setTo
                })
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
                resetVoucherFilters({
                  setFilterEarmark,
                  setFilterBudgetId,
                  setFilterTag,
                  setFilterType,
                  setFilterPM,
                  setFilterPaymentAccountId,
                  setFilterSphere,
                  setQ,
                  setFrom,
                  setTo
                })
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
            <MembersView registerPageShortcuts={registerPageShortcuts} />
          )}

          {activePage === 'Vorschuesse' && <AdvancesView />}

          {activePage === 'Verbindlichkeiten' && (
            <InvoicesView registerPageShortcuts={registerPageShortcuts} />
          )}

          {activePage === 'Bankimport' && (
            <BankImportView
              paymentAccounts={paymentAccounts}
              notify={notify}
              onCreateBooking={(transaction) => {
                openQuickAdd({
                  qa: {
                    date: transaction.bookingDate,
                    type: transaction.direction,
                    sphere: 'IDEELL',
                    mode: 'GROSS',
                    grossAmount: Number(transaction.amount),
                    vatRate: 0,
                    description: [transaction.counterparty, transaction.purpose]
                      .filter(Boolean)
                      .join(' · ')
                      .slice(0, 255),
                    note: [
                      transaction.endToEndId && `End-to-End-ID: ${transaction.endToEndId}`,
                      transaction.bankReference && `Bankreferenz: ${transaction.bankReference}`
                    ]
                      .filter(Boolean)
                      .join('\n'),
                    paymentMethod: 'BANK',
                    paymentAccountId: transaction.paymentAccountId,
                    paymentAccountName: transaction.paymentAccountName,
                    bankTransactionId: transaction.id
                  }
                })
              }}
              onOpenVoucher={(voucherId, voucherNo, voucherDate) => {
                window.dispatchEvent(
                  new CustomEvent('apply-voucher-jump', {
                    detail: { voucherId, voucherNo, date: voucherDate }
                  })
                )
              }}
            />
          )}

          {aiViewMounted && (
            <div className="ai-view-keepalive" hidden={activePage !== 'KI'}>
              <AIView
                notify={notify}
                onBusyChange={setAiBusy}
                onBooked={() => {
                  bumpDataVersion()
                  window.dispatchEvent(new Event('data-changed'))
                }}
              />
            </div>
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
              paymentAccounts={paymentAccounts}
            />
          )}
        </Suspense>
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
              <button
                className="btn ghost"
                onClick={cancelCloseWithOpenDrafts}
                aria-label="Schließen"
              >
                ✕
              </button>
            </header>
            <p className="booking-close-guard-modal__text">
              Es sind noch {bookingDraftTabs.length} offene Buchungstabs vorhanden. Sollen diese
              verworfen und VereinO geschlossen werden?
            </p>
            <div className="booking-close-guard-modal__actions">
              <button className="btn" onClick={cancelCloseWithOpenDrafts}>
                Abbrechen
              </button>
              <button className="btn danger" onClick={confirmCloseWithOpenDrafts}>
                Tabs schließen
              </button>
            </div>
          </div>
        </div>
      )}
      {/* removed: Confirm mark as paid modal */}
      {/* Global Floating Action Button: + Buchung (hidden on certain pages) */}
      {activePage !== 'Einstellungen' &&
        activePage !== 'Mitglieder' &&
        activePage !== 'Verbindlichkeiten' &&
        activePage !== 'Bankimport' &&
        activePage !== 'KI' &&
        activePage !== 'Budgets' &&
        activePage !== 'Zweckbindungen' &&
        activePage !== 'Vorschuesse' && (
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
              if (
                state &&
                (state.status === 'downloading' ||
                  state.status === 'downloaded' ||
                  state.status === 'error')
              ) {
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
                notify(
                  'info',
                  res?.state?.message || 'Es ist kein installierbares Update vorhanden.'
                )
              }
            } catch (e: any) {
              notify('error', `Update-Installation fehlgeschlagen: ${String(e?.message || e)}`)
            }
          }}
          onDisable={async () => {
            try {
              await window.api?.settings?.set?.({ key: 'updates.autoCheck', value: false })
              notify('info', 'Automatische Update-Hinweise wurden deaktiviert.')
            } catch {}
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
        onApply={({ from: nf, to: nt }) => {
          setFrom(nf)
          setTo(nt)
        }}
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
        onApply={({ sphere, earmarkId, budgetId }) => {
          setFilterSphere(sphere)
          setFilterEarmark(earmarkId)
          setFilterBudgetId(budgetId)
        }}
      />
      {/* Global DOM debugger overlay */}
      {/* DomDebugger removed for release */}
      {/* Global Tags Manager Modal */}
      {showTagsManager && (
        <TagsManagerModal
          onClose={() => setShowTagsManager(false)}
          notify={notify}
          onChanged={() => {
            setShowTagsManager(false)
            setShowTagsManager(true) /* simple reload of list */
          }}
        />
      )}
      {showSetupWizard && (
        <SetupWizardModal
          onClose={() => setShowSetupWizard(false)}
          navLayout={navLayout}
          setNavLayout={(v) => {
            setNavLayout(v)
            try {
              localStorage.setItem('ui.navLayout', v)
            } catch {}
          }}
          navIconColorMode={navIconColorMode}
          setNavIconColorMode={(v) => {
            setNavIconColorMode(v)
            try {
              localStorage.setItem('ui.navIconColorMode', v)
            } catch {}
          }}
          colorTheme={colorTheme}
          setColorTheme={(v) => {
            setColorTheme(v)
            try {
              localStorage.setItem('ui.colorTheme', v)
            } catch {}
            try {
              document.documentElement.setAttribute('data-color-theme', v)
            } catch {}
          }}
          journalRowStyle={journalRowStyle}
          setJournalRowStyle={(v) => {
            setJournalRowStyle(v)
            try {
              localStorage.setItem('ui.journalRowStyle', v)
            } catch {}
            try {
              document.documentElement.setAttribute('data-journal-row-style', v)
            } catch {}
          }}
          journalRowDensity={journalRowDensity}
          setJournalRowDensity={(v) => {
            setJournalRowDensity(v)
            try {
              localStorage.setItem('ui.journalRowDensity', v)
            } catch {}
            try {
              document.documentElement.setAttribute('data-journal-row-density', v)
            } catch {}
          }}
          backgroundImage={backgroundImage}
          setBackgroundImage={(v) => {
            setBackgroundImage(v)
            try {
              localStorage.setItem('ui.backgroundImage', v)
            } catch {}
            try {
              document.documentElement.setAttribute('data-background-image', v)
            } catch {}
          }}
          customBackgroundImage={customBackgroundImage}
          setCustomBackgroundImage={(v) => {
            setCustomBackgroundImage(v)
          }}
          glassModals={glassModals}
          setGlassModals={(v) => {
            setGlassModals(v)
            try {
              localStorage.setItem('ui.glassModals', String(v))
            } catch {}
            try {
              document.documentElement.setAttribute('data-glass-modals', String(v))
            } catch {}
          }}
          dateFmt={dateFmt}
          setDateFmt={(v) => {
            setDateFmt(v)
            try {
              localStorage.setItem('ui.dateFmt', v)
            } catch {}
          }}
          showBookingDraftTabs={showBookingDraftTabs}
          setShowBookingDraftTabs={(v) => {
            setShowBookingDraftTabs(v)
            try {
              localStorage.setItem('ui.showBookingDraftTabs', String(v))
            } catch {}
          }}
          showBookingEditTabs={showBookingEditTabs}
          setShowBookingEditTabs={(v) => {
            setShowBookingEditTabs(v)
            try {
              localStorage.setItem('ui.showBookingEditTabs', String(v))
            } catch {}
          }}
          bookingsOpenDetached={bookingsOpenDetached}
          setBookingsOpenDetached={(v) => {
            setBookingsOpenDetached(v)
            try {
              localStorage.setItem('ui.bookingsOpenDetached', String(v))
            } catch {}
          }}
          allowVoucherDeletion={allowVoucherDeletion}
          setAllowVoucherDeletion={(v) => {
            setAllowVoucherDeletion(v)
            try {
              localStorage.setItem('ui.allowVoucherDeletion', String(v))
            } catch {}
          }}
          quickAddAfterSave={quickAddAfterSave}
          setQuickAddAfterSave={(v) => {
            setQuickAddAfterSave(v)
            try {
              localStorage.setItem('ui.quickAddAfterSave', v)
            } catch {}
          }}
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
          includeInternalVouchers={includeInternalVouchers}
          setIncludeInternalVouchers={setIncludeInternalVouchers}
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
                  includeInternalVouchers:
                    fiscalOpts.includeInternalVouchers ?? includeInternalVouchers,
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
                  includeInternalVouchers:
                    treasurerOpts?.includeInternalVouchers ?? includeInternalVouchers,
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
// Wrapper with context providers
export default function App() {
  const isDetachedQuickAdd =
    new URLSearchParams(window.location.search).get('window') === 'quick-add'
  return (
    <UIPreferencesProvider>
      <ToastProvider>
        {isDetachedQuickAdd ? <DetachedQuickAddWindow /> : <AppInner />}
      </ToastProvider>
    </UIPreferencesProvider>
  )
}
