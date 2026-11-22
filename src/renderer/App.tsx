import {
  friendlyVoucherError,
  voucherRowToBookingForm,
  serializeBookingForm,
  buildVoucherUpdatePayloadFromForm,
  persistBookingEdit,
  type BookingEditForm
} from './views/BookingsPlus/bookingEdit'
import { scannedInvoiceToBooking } from './utils/scannedInvoiceToBooking'
import { currentAiDraftComment } from './utils/aiBookingDraft'
import { openReportBookings } from './utils/reportNavigation'
import ModalHeader from './components/ModalHeader'
import PageTutorials from './components/tutorials/PageTutorials'
import { resolveBankDraftParty } from './utils/bankDraftParty'
import { bankDraftSourceFromTransaction } from './types/bankDraftSource'
import { markOrganizationReady } from './utils/organizationTransition'
import { usePageHistory } from './hooks/usePageHistory'
import { useOverlayScrollLock } from './hooks/useOverlayScrollLock'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  getDefaultJournalCols,
  getDefaultJournalOrder
} from './views/Journal/utils/journalColumnVisibility'
import type { UpdateModalState } from './components/modals/UpdateAvailableModal'
import type { UpdateState } from '../types/api'
import { UpdateNoticeContext, type UpdateNotice } from './context/UpdateNoticeContext'
import LoadingState from './components/LoadingState'
import ReceiptWidget from './components/ReceiptWidget'
import { useQuickAdd } from './hooks/useQuickAdd'
import type { LocalInvoiceScanDraftState } from './components/modals/LocalInvoiceScanModal'
import type { InvoiceAiGuidance } from './types/invoiceAiGuidance'
import type { OrganizationProfile } from '../../shared/classification'
import { ToastProvider } from './context/ToastContext'
import { useToast } from './context/useToast'
import { UIPreferencesProvider } from './context/UIPreferences'
import { useUIPreferences } from './context/useUIPreferences'
import { TopNav } from './components/layout/TopNav'
import { AppSidebar } from './components/layout/AppSidebar'
import WindowControls from './components/layout/WindowControls'
import OrgSwitcher from './components/common/OrgSwitcher'
import { SidebarBookingActions } from './components/layout/SidebarBookingActions'
import { useSidebarFlyoutPosition } from './hooks/useSidebarFlyoutPosition'
import InvoiceBatchControl from './components/InvoiceBatchControl'
import CompactBookingFlyout from './components/CompactBookingFlyout'
import QuickAddModal from './components/modals/QuickAddModal'
import type { NavKey } from './utils/navItems'
import { navItems } from './utils/navItems'

import { LeaderShortcuts, type ShortcutCommand } from './components/shortcuts/LeaderShortcuts'
import { notifyBookingSaved } from './utils/notifyBookingSaved'
import {
  base64ToFile,
  encodeFileForUpload,
  encodeFilesForUpload,
  uploadPayloadToFile
} from './utils/fileEncoding'
import { invoiceDraftTabText } from './utils/invoiceDraftLabel'
import type { DashboardTaskTarget } from '../../shared/dashboardTasks'
import { selectAiDraftBookingType } from './utils/aiBookingDraft'
import { addDataChangedListener, dispatchDataChanged } from './utils/refresh'

const DetachedQuickAddWindow = lazy(() => import('./DetachedQuickAddWindow'))
const ReportsView = lazy(() => import('./views/Reports/ReportsView'))
const JournalView = lazy(() => import('./views/Journal/JournalView'))
const BookingsPlusView = lazy(() => import('./views/BookingsPlus/BookingsPlusView'))
const RecurringBookingsView = lazy(() => import('./views/RecurringBookings/RecurringBookingsView'))
const TagsManagerModal = lazy(() => import('./components/modals/TagsManagerModal'))
const AutoBackupPromptModal = lazy(() => import('./components/modals/AutoBackupPromptModal'))
const UpdateAvailableModal = lazy(() => import('./components/modals/UpdateAvailableModal'))
const MetaFilterModal = lazy(() => import('./components/modals/MetaFilterModal'))
const TimeFilterModal = lazy(() => import('./components/modals/TimeFilterModal'))
const LocalInvoiceScanModal = lazy(() => import('./components/modals/LocalInvoiceScanModal'))
const SetupWizardModal = lazy(() => import('./components/modals/SetupWizardModal'))
const SettingsView = lazy(() =>
  import('./views/Settings/SettingsView').then((module) => ({ default: module.SettingsView }))
)
const DashboardPlusView = lazy(() => import('./views/DashboardPlus/DashboardPlusView'))
const InvoicesView = lazy(() => import('./views/InvoicesView'))
const MembersView = lazy(() => import('./views/Mitglieder/MembersView'))
const ReceiptsView = lazy(() => import('./views/ReceiptsView'))
const AdvancesView = lazy(() => import('./views/Advances/AdvancesView'))
const BudgetsView = lazy(() => import('./views/Budgets/BudgetsView'))
const EarmarksView = lazy(() => import('./views/Earmarks/EarmarksView'))
const BankImportView = lazy(() => import('./views/BankImport/BankImportView'))
const AIView = lazy(() => import('./views/AI/AIView'))
// Resolve app icon for titlebar (works with Vite bundling)
const appLogo: string = new URL('../../build/Icon.ico', import.meta.url).href

// The active organization has its own database.  Keeping the visible modules
// there prevents a change to the top navigation of one organization from
// changing every other organization as well.
const VISIBLE_NAV_ITEMS_SETTING_KEY = 'ui.visibleNavItems'
const LEGACY_VISIBLE_NAV_ITEMS_MIGRATION_KEY = 'ui.visibleNavItems.migratedToOrganizationSettings'

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
    const removeDataChangedListener = addDataChangedListener(['settings', 'organizations'], onChanged)
    return () => {
      cancelled = true
      removeDataChangedListener()
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
        <div className="helper text-ellipsis app-header__cashier" title={text}>
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

const goToShortcutKeys = {
  Dashboard: 'd',
  DashboardPlus: 'f',
  Buchungen: 'b',
  BuchungenPlus: 'j',
  Dauerbuchungen: 'u',
  Bankimport: 'k',
  Verbindlichkeiten: 'v',
  Mitglieder: 'm',
  Vorschuesse: 'o',
  Budgets: 'p',
  Zweckbindungen: 'z',
  KI: 'a',
  Belege: 'l',
  Reports: 'r',
  Einstellungen: 'e'
} satisfies Record<NavKey, string>

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
  setFilterPrimaryClassification?: SetOptionalNumber
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
  options.setFilterPrimaryClassification?.(null)
  options.setQ('')
  if (!options.keepDateRange) {
    options.setFrom?.('')
    options.setTo?.('')
  }
}

function currentLocalMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

const BANK_DESCRIPTION_IBAN_PATTERN = /\b[A-Z]{2}\d{2}(?:[\s-]?[A-Z0-9]){11,30}\b/gi
const BANK_DESCRIPTION_IBAN_WITH_LABEL_PATTERN =
  /\b(?:IBAN|KONTO|KTO)\s*:?\s*[A-Z]{2}\d{2}(?:[\s-]?[A-Z0-9]){11,30}\b/gi

function bankDescriptionPart(value?: string | null) {
  return String(value || '')
    .replace(BANK_DESCRIPTION_IBAN_WITH_LABEL_PATTERN, ' ')
    .replace(BANK_DESCRIPTION_IBAN_PATTERN, ' ')
    .replace(/\s+([,.;:|])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildBankBookingDescription(transaction: {
  counterparty?: string | null
  purpose?: string | null
}) {
  const purpose = bankDescriptionPart(transaction.purpose)
  const counterparty = bankDescriptionPart(transaction.counterparty)
  const normalizedPurpose = purpose.toLocaleLowerCase('de-DE')
  const parts = [
    purpose,
    counterparty && !normalizedPurpose.includes(counterparty.toLocaleLowerCase('de-DE'))
      ? counterparty
      : ''
  ].filter(Boolean)
  return (parts.join(' · ') || counterparty || 'Bankbeleg').slice(0, 255)
}

function aiInvoiceResultToDraft(result: any): LocalInvoiceScanDraftState {
  const amount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : ''
  const budgets = Array.isArray(result?.budgets)
    ? result.budgets.map((item: any) => ({ budgetId: Number(item.id), amount: Number(item.amount) }))
    : []
  const earmarksAssigned = Array.isArray(result?.earmarks)
    ? result.earmarks.map((item: any) => ({ earmarkId: Number(item.id), amount: Number(item.amount) }))
    : []
  const tags = Array.isArray(result?.tags) ? result.tags.map(String) : []
  return {
    partyId: typeof result?.partyId === 'number' ? result.partyId : null,
    partyCreationSource: { name: result?.supplier || '', iban: result?.counterpartyIban },
    fields: {
      supplier: result?.supplier || '',
      invoiceNumber: result?.invoiceNumber || '',
      invoiceDate: result?.invoiceDate || '',
      dueDate: result?.dueDate || '',
      grossAmount: amount(result?.grossAmount),
      netAmount: amount(result?.netAmount),
      taxAmount: amount(result?.taxAmount),
      iban: result?.iban || '',
      description: result?.description || ''
    },
    budgets,
    earmarksAssigned,
    tags,
    note: Array.isArray(result?.warnings) ? result.warnings.join('\n') : '',
    bookingMeta: {
      type: result?.type === 'IN' ? 'IN' : 'OUT',
      sphere: result?.sphere || 'IDEELL',
      primaryClassificationValueId: result?.primaryClassificationValueId ?? null,
      paymentMethod: result?.paymentMethod === 'BAR' ? 'BAR' : 'BANK',
      paymentAccountId: result?.paymentAccountId ?? null
    },
    visibleSections: [
      ...(budgets.length ? ['budgets' as const] : []),
      ...(earmarksAssigned.length ? ['earmarks' as const] : []),
      ...(tags.length ? ['tags' as const] : []),
      ...(Array.isArray(result?.warnings) && result.warnings.length ? ['comment' as const] : [])
    ]
  }
}

function AppInner() {
  // Use toast context
  const { notify } = useToast()

  // Use UI preferences context
  const {
    displayDensity,
    setDisplayDensity,
    navLayout,
    setNavLayout,
    sidebarBookingActions,
    setSidebarBookingActions,
    sidebarCollapsed,
    setSidebarCollapsed,
    colorTheme,
    setColorTheme,
    navIconColorMode,
    setNavIconColorMode,
    journalRowStyle,
    setJournalRowStyle,
    journalRowDensity,
    setJournalRowDensity,
    backgroundImage,
    setBackgroundImage,
    backgroundImageVisibility,
    setBackgroundImageVisibility,
    customBackgroundImage,
    setCustomBackgroundImage,
    glassModals,
    setGlassModals,
    showBookingDraftTabs,
    setShowBookingDraftTabs,
    bookingView,
    setBookingView,
    showBookingEditTabs,
    setShowBookingEditTabs,
    bookingEntryPresentation,
    setBookingEntryPresentation,
    allowVoucherDeletion,
    setAllowVoucherDeletion,
    quickAddAfterSave,
    setQuickAddAfterSave
  } = useUIPreferences()
  const [shortcutBookingFlyout, setShortcutBookingFlyout] = useState(false)
  const effectiveBookingEntryPresentation = shortcutBookingFlyout ? 'flyout' : bookingEntryPresentation
  const bookingsOpenDetached = bookingEntryPresentation === 'detached'

  // ── Auto-switch: force side-nav when window is too narrow for top-nav ──
  const NAV_SWITCH_THRESHOLD = 960
  const [narrowOverride, setNarrowOverride] = useState(() => window.innerWidth < NAV_SWITCH_THRESHOLD)

  useEffect(() => {
    const check = () => setNarrowOverride(window.innerWidth < NAV_SWITCH_THRESHOLD)
    check() // initial
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Effective layout: user preference wins when wide enough, side-nav forced when narrow
  const effectiveNavLayout = narrowOverride && navLayout === 'top' ? 'left' : navLayout
  const useSidebarActions = navLayout === 'left' && sidebarBookingActions
  const sidebarFlyoutPosition = useSidebarFlyoutPosition(useSidebarActions, 560)

  const [organizationProfile, setOrganizationProfile] = useState<OrganizationProfile>('NONPROFIT')

  useEffect(() => {
    let alive = true
    void window.api?.classifications?.primary?.list?.()
      .then((result) => {
        if (alive && result?.profile) setOrganizationProfile(result.profile)
      })
      .catch(() => {
        // Existing installations remain in the established non-profit mode if
        // the profile table cannot be read during startup recovery.
      })
      .finally(() => { if (alive) markOrganizationReady('profile') })
    return () => { alive = false }
  }, [])

  // Open bank transactions count for nav badge
  const [openBankImportsCount, setOpenBankImportsCount] = useState(0)

  // Due membership fees count for nav badge
  const [dueMembershipFeesCount, setDueMembershipFeesCount] = useState(0)

  // Open invoices count for nav badge
  const [openInvoicesCount, setOpenInvoicesCount] = useState(0)

  // Fällige Dauerbuchungen für das Navigations-Badge
  const [dueRecurringBookingsCount, setDueRecurringBookingsCount] = useState(0)

  // Global data refresh key to trigger summary re-fetches across views
  const [refreshKey, setRefreshKey] = useState(0)
  const bumpDataVersion = useCallback(() => setRefreshKey((k) => k + 1), [])
  const [fabNearJournalEnd, setFabNearJournalEnd] = useState(false)
  const [flashId, setFlashId] = useState<number | null>(null) // Row highlight for newly created voucher

  useEffect(() => {
    const onDataChanged = () => bumpDataVersion()
    return addDataChangedListener(
      ['vouchers', 'members', 'invoices', 'bank-imports', 'budgets', 'earmarks', 'tags', 'organizations', 'recurring-bookings'],
      onDataChanged
    )
  }, [bumpDataVersion])

  useEffect(() => {
    const off = window.api?.quickAdd?.onSaved?.((payload: any) => {
      const id = typeof payload?.id === 'number' ? payload.id : null
      if (id != null && !payload?.deleted) {
        setFlashId(id)
        window.setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 3000)
      }
      dispatchDataChanged(['vouchers'])
    })
    return () => {
      if (typeof off === 'function') off()
    }
  }, [])

  // Map backend errors to friendlier messages (esp. earmark period issues)
  const friendlyError = friendlyVoucherError
  // Dynamic available years from vouchers
  const [yearsAvail, setYearsAvail] = useState<number[]>([])
  const [activePage, setActivePage] = useState<NavKey>(() => {
    try {
      const saved = localStorage.getItem('activePage') as NavKey
      return saved === 'DashboardPlus' ? 'Dashboard' : saved === 'BuchungenPlus' ? 'Buchungen' : navItems.some(item => item.key === saved) ? saved : 'Buchungen'
    } catch {
      return 'Buchungen'
    }
  })
  const isClassicBookings = activePage === 'Buchungen' && bookingView === 'classic'
  const isPlusBookings = activePage === 'Buchungen' && bookingView === 'plus'
  const [bookingJumpRevision, setBookingJumpRevision] = useState(0)
  const [plusCalendarSelection, setPlusCalendarSelection] = useState(() => ({
    month: currentLocalMonth(), from: '', to: ''
  }))
  const [plusEditQa, setPlusEditQa] = useState<BookingEditForm | null>(null)
  const [plusEditInitialSnapshot, setPlusEditInitialSnapshot] = useState('')
  const [plusEditFiles, setPlusEditFiles] = useState<File[]>([])
  const [plusEditExpanded, setPlusEditExpanded] = useState(false)
  const [plusEditDiscardOpen, setPlusEditDiscardOpen] = useState(false)
  const [plusEditSaving, setPlusEditSaving] = useState(false)
  const plusEditRequest = useRef(0)
  const plusEditSaveInFlight = useRef(false)
  const plusEditFileInputRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => window.api?.organizations?.onSwitched?.(() => {
    setPlusCalendarSelection({ month: currentLocalMonth(), from: '', to: '' })
    setPlusEditQa(null)
    setPlusEditFiles([])
  }), [])
  usePageHistory(activePage, setActivePage)
  const [dashboardTaskTarget, setDashboardTaskTarget] = useState<DashboardTaskTarget | null>(null)
  const [dashboardTaskPage, setDashboardTaskPage] = useState<NavKey | null>(null)
  useEffect(() => { if (activePage !== dashboardTaskPage) { setDashboardTaskTarget(null); setDashboardTaskPage(null) } }, [activePage, dashboardTaskPage])
  const [membersOrganizationId, setMembersOrganizationId] = useState<string>()
  useEffect(() => window.api.organizations.onSwitched(org => {
    setMembersOrganizationId(org.id)
    setDashboardTaskTarget(null)
    setDashboardTaskPage(null)
  }), [])
  useOverlayScrollLock()
  useEffect(() => {
    if (!isClassicBookings) {
      setFabNearJournalEnd(false)
      return
    }
    let cleanup: (() => void) | undefined
    let cancelled = false
    const attachObserver = () => {
      if (cancelled) return
      const marker = document.querySelector('.journal-table-end')
      if (!marker) {
        window.setTimeout(attachObserver, 120)
        return
      }
      const observer = new IntersectionObserver(
        ([entry]) => setFabNearJournalEnd(Boolean(entry?.isIntersecting)),
        { threshold: 0.2 }
      )
      observer.observe(marker)
      cleanup = () => observer.disconnect()
    }
    attachObserver()
    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [isClassicBookings, refreshKey])
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
  const normalizeVisibleNavItems = useCallback(
    (items: unknown, includeRecurringBookings = false): NavKey[] => {
      const source = Array.isArray(items) ? items : []
      const valid = new Set(navItems.map((item) => item.key))
      const upgraded = includeRecurringBookings ? [...source, 'Dauerbuchungen'] : source
      return Array.from(
        new Set([...upgraded.filter((key): key is NavKey => typeof key === 'string' && valid.has(key as NavKey)), ...requiredNavItems])
      ) as NavKey[]
    },
    [requiredNavItems]
  )
  const [visibleNavItems, setVisibleNavItemsState] = useState<NavKey[]>(defaultVisibleNavItems)

  useEffect(() => {
    let alive = true

    const loadVisibleNavItems = async () => {
      try {
        const saved = await window.api?.settings?.get?.<unknown>({ key: VISIBLE_NAV_ITEMS_SETTING_KEY })
        if (!alive) return

        if (Array.isArray(saved?.value)) {
          const next = normalizeVisibleNavItems(saved.value)
          setVisibleNavItemsState(next)
          if (JSON.stringify(next) !== JSON.stringify(saved.value)) {
            await window.api.settings.set({ key: VISIBLE_NAV_ITEMS_SETTING_KEY, value: next })
          }
          return
        }

        // Preserve existing installations once. New organizations deliberately
        // start with the default modules instead of inheriting another org's UI.
        const hasMigratedLegacySetting = localStorage.getItem(LEGACY_VISIBLE_NAV_ITEMS_MIGRATION_KEY) === 'true'
        let legacyItems: unknown = null
        if (!hasMigratedLegacySetting) {
          try {
            legacyItems = JSON.parse(localStorage.getItem(VISIBLE_NAV_ITEMS_SETTING_KEY) || 'null')
          } catch {
            legacyItems = null
          }
        }

        const usesLegacyItems = Array.isArray(legacyItems)
        const needsRecurringBookingsUpgrade = localStorage.getItem('ui.recurringBookingsNavIntroduced') !== 'true'
        const next = usesLegacyItems
          ? normalizeVisibleNavItems(legacyItems, needsRecurringBookingsUpgrade)
          : defaultVisibleNavItems

        setVisibleNavItemsState(next)
        await window.api?.settings?.set?.({ key: VISIBLE_NAV_ITEMS_SETTING_KEY, value: next })
        if (usesLegacyItems && needsRecurringBookingsUpgrade) {
          localStorage.setItem('ui.recurringBookingsNavIntroduced', 'true')
        }
        localStorage.setItem(LEGACY_VISIBLE_NAV_ITEMS_MIGRATION_KEY, 'true')
      } catch (error) {
        // The UI remains usable with the safe default if persistence is not
        // available (for example during a recovery startup).
        console.warn('Sichtbare Navigationsmodule konnten nicht geladen werden:', error)
        if (alive) setVisibleNavItemsState(defaultVisibleNavItems)
      }
    }

    void loadVisibleNavItems().finally(() => { if (alive) markOrganizationReady('navigation') })
    const off = window.api?.organizations?.onSwitched?.(() => {
      void loadVisibleNavItems()
    })

    return () => {
      alive = false
      off?.()
    }
  }, [defaultVisibleNavItems, normalizeVisibleNavItems])

  const setVisibleNavItems = useCallback(
    (items: NavKey[]) => {
      const next = normalizeVisibleNavItems(items)
      setVisibleNavItemsState(next)
      void window.api?.settings?.set?.({ key: VISIBLE_NAV_ITEMS_SETTING_KEY, value: next })
        .catch((error: unknown) => console.warn('Sichtbare Navigationsmodule konnten nicht gespeichert werden:', error))
    },
    [normalizeVisibleNavItems]
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
  const [knownUpdateState, setKnownUpdateState] = useState<UpdateState | null>(null)
  const updateNotice = useMemo<UpdateNotice>(() => {
    if (!knownUpdateState || !['available', 'downloading', 'downloaded'].includes(knownUpdateState.status)) return { version: null }
    return {
      version: knownUpdateState.downloadedVersion || knownUpdateState.availableVersion,
      openUpdate: () => setUpdatePrompt(knownUpdateState as UpdateModalState)
    }
  }, [knownUpdateState])
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

    let stateRevision = 0
    const off = window.api?.updates?.onStateChanged?.((state) => {
      if (disposed || !state) return
      stateRevision++
      setKnownUpdateState(state)
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
        if (disposed) return
        // A newer event may arrive before the initial IPC response.
        if (stateRevision === 0 && initial) setKnownUpdateState(initial)
        if (initial?.status === 'unsupported') return

        const enabled = (await window.api?.settings?.get?.({ key: 'updates.autoCheck' }))?.value
        if (enabled === false) return

        autoUpdateCheckInFlight.current = true
        const checkRevision = stateRevision
        const state = await window.api?.updates?.check?.()
        if (!disposed && state && checkRevision === stateRevision) setKnownUpdateState(state)
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


  // Period lock (year-end) status for UI controls (e.g., lock edit)
  const [periodLock, setPeriodLock] = useState<{ closedUntil: string | null } | null>(null)
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
  const setupOfferedOrganizations = useRef(new Set<string>())

  useEffect(() => {
    try {
      localStorage.setItem('activePage', activePage)
    } catch {}
  }, [activePage])
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
        setBookingJumpRevision(value => value + 1)
        const voucherId = detail.voucherId ? Number(detail.voucherId) : null
        const voucherNo = typeof detail.voucherNo === 'string' ? detail.voucherNo.trim() : ''
        const voucherDate = typeof detail.date === 'string' ? detail.date : ''
        const reportFrom = typeof detail.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(detail.from) ? detail.from : ''
        const reportTo = typeof detail.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(detail.to) ? detail.to : ''

        setFilterSphere(null)
        setFilterType(null)
        setFilterPM(null)
        setFilterPaymentAccountId(null)
        setFilterEarmark(null)
        setFilterBudgetId(null)
        setFilterTag(null)
        setFilterPrimaryClassificationValueId(null)
        setFlashId(null)

        if (voucherDate) {
          setFrom(voucherDate)
          setTo(voucherDate)
          setPlusCalendarSelection(current => ({ ...current, month: voucherDate.slice(0, 7), from: voucherDate, to: voucherDate }))
        } else if (reportFrom && reportTo) {
          setFrom(reportFrom); setTo(reportTo)
          setFilterType(detail.type === 'IN' || detail.type === 'OUT' ? detail.type : null)
          setPlusCalendarSelection({ month: reportTo.slice(0, 7), from: reportFrom, to: reportTo })
        } else {
          setFrom('')
          setTo('')
          setPlusCalendarSelection(current => ({ ...current, from: '', to: '' }))
        }

        if (voucherNo) {
          setQ(voucherNo)
        } else if (typeof detail.q === 'string' && detail.q.trim()) {
          setQ(detail.q.trim())
        } else if (voucherId) {
          setQ(`#${voucherId}`)
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
    activeDraftKind,
    activeInvoiceState,
    activeInvoiceGuidance,
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
          setFlashId(res.id)
          window.setTimeout(() => setFlashId((cur) => (cur === res.id ? null : cur)), 3000)
          notify('success', `Beleg erstellt: #${res.voucherNo} (Brutto ${res.grossAmount})`)
          // Surface non-blocking warnings (e.g., earmark overdraw)
          const w = (res as any).warnings as string[] | undefined
          if (w && w.length) {
            for (const msg of w) notify('info', 'Warnung: ' + msg)
          }
          if (p?.bankTransactionId) dispatchDataChanged(['bank-imports'])
          notifyBookingSaved({
            ...res,
            mode: 'create',
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
    quickAddAfterSave,
    effectiveBookingEntryPresentation
  )
  const [forceFullBookingDialog, setForceFullBookingDialog] = useState(false)
  const previousBookingEntryPresentationRef = useRef(bookingEntryPresentation)

  useEffect(() => {
    setForceFullBookingDialog(false)
  }, [bookingEntryPresentation])

  useEffect(() => {
    if (!quickAdd) {
      setForceFullBookingDialog(false)
      setShortcutBookingFlyout(false)
    }
  }, [quickAdd])

  useEffect(() => {
    if (effectiveBookingEntryPresentation === 'flyout' && quickAdd && activeDraftKind === 'booking') {
      window.dispatchEvent(new Event('compact-booking-flyout-opened'))
    }
  }, [activeDraftKind, effectiveBookingEntryPresentation, quickAdd])

  useEffect(() => {
    if (
      effectiveBookingEntryPresentation !== 'flyout'
      || !quickAdd
      || activeDraftKind !== 'booking'
      || forceFullBookingDialog
    ) return

    const parkOnOutsideMouseDown = (event: MouseEvent) => {
      if (!event.isTrusted) return
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest([
        '.compact-booking-flyout-anchor',
        '.bank-draft-source',
        '.booking-attachment-preview',
        '.sidebar-booking-actions',
        '.fab-buchung',
        '.select-dropdown__menu--portal',
        '.party-selector__menu--portal',
        '.party-editor-overlay'
      ].join(', '))) return
      parkQuickAdd()
    }

    document.addEventListener('mousedown', parkOnOutsideMouseDown, true)
    return () => document.removeEventListener('mousedown', parkOnOutsideMouseDown, true)
  }, [activeDraftKind, effectiveBookingEntryPresentation, forceFullBookingDialog, parkQuickAdd, quickAdd])

  useEffect(() => {
    const parkForInvoiceFlyout = () => {
      if (effectiveBookingEntryPresentation === 'flyout' && quickAdd && activeDraftKind === 'booking') {
        parkQuickAdd()
      }
    }
    const parkForBookingEditor = () => {
      if (effectiveBookingEntryPresentation === 'flyout' && quickAdd && activeDraftKind === 'booking') {
        parkQuickAdd()
      }
    }
    window.addEventListener('invoice-upload-flyout-opened', parkForInvoiceFlyout)
    window.addEventListener('booking-editor-opened', parkForBookingEditor)
    return () => {
      window.removeEventListener('invoice-upload-flyout-opened', parkForInvoiceFlyout)
      window.removeEventListener('booking-editor-opened', parkForBookingEditor)
    }
  }, [activeDraftKind, effectiveBookingEntryPresentation, parkQuickAdd, quickAdd])

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ qa?: any; files?: File[] }>).detail || {}
      if (!detail.qa) return

      // KI-Entwürfe können geöffnet werden, ohne dass die Person zuvor das
      // Journal besucht hat. Die Auswahlfelder brauchen dann die Stammdaten
      // bereits vor dem ersten Rendern des Buchungsdialogs.
      void Promise.allSettled([loadBudgets(), loadEarmarks()]).then(async () => {
        const bankParty = detail.qa.bankReviewSource
          ? await resolveBankDraftParty({
            counterparty: detail.qa.bankReviewSource.counterparty || detail.qa.counterparty,
            counterpartyIban: detail.qa.bankReviewSource.counterpartyIban
          }, input => window.api.parties.list(input))
          : null
        openQuickAdd({
          qa: selectAiDraftBookingType({ ...detail.qa, ...bankParty, note: await currentAiDraftComment(detail.qa.note) }),
          files: detail.files || []
        })
      })
    }
    window.addEventListener('ai:open-booking-draft', handler)
    return () => window.removeEventListener('ai:open-booking-draft', handler)
  }, [openQuickAdd])

  useEffect(() => {
    const openAgent = () => {
      if (!visibleNavSet.has('KI')) setVisibleNavItems([...visibleNavItems, 'KI'])
      setActivePage('KI')
    }
    window.addEventListener('ai:continue-agent', openAgent)
    return () => window.removeEventListener('ai:continue-agent', openAgent)
  }, [visibleNavSet, visibleNavItems, setVisibleNavItems])

  const detachQuickAdd = useCallback(async () => {
    if (!activeDraftId) return
    try {
      const detachedFiles = await encodeFilesForUpload(files)
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
    const previous = previousBookingEntryPresentationRef.current
    previousBookingEntryPresentationRef.current = bookingEntryPresentation
    if (
      previous !== 'detached'
      && bookingEntryPresentation === 'detached'
      && quickAdd
      && activeDraftKind === 'booking'
    ) {
      void detachQuickAdd()
    }
  }, [activeDraftKind, bookingEntryPresentation, detachQuickAdd, quickAdd])

  useEffect(() => {
    const off = window.api?.quickAdd?.onDetachedDraftSync?.((payload: any) => {
      const draftId = typeof payload?.draftId === 'string' ? payload.draftId : ''
      if (!draftId) return
      const patch: any = {}
      if (payload.qa) patch.qa = payload.qa
      if (Array.isArray(payload.files)) {
        patch.files = payload.files.map((file: any) => uploadPayloadToFile({
          ...file,
          name: String(file.name || 'Datei')
        }))
      }
      if (typeof payload?.detached === 'boolean') {
        patch.detached = payload.detached
      }
      if (payload?.kind === 'booking' || payload?.kind === 'invoice') {
        patch.kind = payload.kind
      }
      if (payload?.invoiceState) {
        patch.invoiceState = payload.invoiceState
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
      if (draft.kind === 'invoice') {
        const tabText = invoiceDraftTabText(draft.invoiceState?.fields.description, !!draft.detached)
        return {
          id: draft.id,
          type: draft.qa.type,
          label: tabText.label,
          title: tabText.title,
          isActive: draft.id === activeDraftId && quickAdd,
          isDetached: !!draft.detached
        }
      }
      const desc = draft.qa.description.trim()
      const dateLabel = fmtDate(draft.qa.date)
      return {
        id: draft.id,
        type: draft.qa.type,
        label: desc ? `${desc} · ${dateLabel}` : `${dateLabel} · #${draft.sequence}`,
        title: `${desc ? `${desc} · ${dateLabel}` : `${dateLabel} · Entwurf ${draft.sequence}`}${draft.detached ? ' · abgedockt' : ''}`,
        isActive: draft.id === activeDraftId && quickAdd,
        isDetached: !!draft.detached
      }
    })
  }, [activeDraftId, bookingDrafts, fmtDate, quickAdd])

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
            const detachedFiles = await encodeFilesForUpload(sourceDraft.files)
            const res = await window.api?.quickAdd?.openDetached?.({
              draftId,
              mode: sourceDraft.kind === 'invoice' ? 'invoice' : 'create',
              qa: sourceDraft.qa,
              files: detachedFiles,
              invoiceState: sourceDraft.invoiceState,
              invoiceGuidance: sourceDraft.invoiceGuidance,
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

  const triggerBookingEntry = useCallback(() => {
    if (
      bookingEntryPresentation === 'flyout'
      && quickAdd
      && activeDraftKind === 'booking'
      && !showBookingDraftTabs
    ) {
      parkQuickAdd()
      return
    }
    openBookingEntry()
  }, [activeDraftKind, bookingEntryPresentation, openBookingEntry, parkQuickAdd, quickAdd, showBookingDraftTabs])

  const openJournalInvoiceScan = useCallback((file: File, guidance?: InvoiceAiGuidance) => {
    if (!bookingsOpenDetached) {
      openQuickAdd({ files: [file], invoiceGuidance: guidance }, { kind: 'invoice' })
      return
    }
    const draft = openQuickAdd({ files: [file], invoiceGuidance: guidance }, { detached: true, showModal: false, kind: 'invoice' })
    void (async () => {
      try {
        const encodedFile = await encodeFileForUpload(file)
        const response = await window.api?.quickAdd?.openDetached?.({
          draftId: draft.id,
          mode: 'invoice',
          kind: 'invoice',
          files: [encodedFile],
          invoiceGuidance: guidance,
          afterSaveDefault: quickAddAfterSave
        })
        if (!response?.ok) {
          notify('error', response?.error || 'Rechnungsfenster konnte nicht geöffnet werden.')
          dockAndOpenDraft(draft.id)
        }
      } catch (error: any) {
        notify('error', 'Rechnungsfenster konnte nicht geöffnet werden: ' + String(error?.message || error))
        dockAndOpenDraft(draft.id)
      }
    })()
  }, [bookingsOpenDetached, dockAndOpenDraft, notify, openQuickAdd, quickAddAfterSave])

  const reviewBatchInvoice = useCallback(async (jobId: number) => {
    try {
      const item = await window.api.ai.invoiceBatch.get({ id: jobId })
      if (item.status !== 'NEEDS_REVIEW' || !item.result || !item.file?.dataBase64) {
        notify('info', 'Dieser Rechnungsentwurf ist noch nicht bereit.')
        return
      }
      const file = base64ToFile(
        item.fileName,
        item.file.dataBase64,
        item.file.mimeType || 'application/pdf'
      )
      openQuickAdd({
        files: [file],
        invoiceState: aiInvoiceResultToDraft(item.result),
        invoiceGuidance: item.guidance || undefined,
        invoiceBatchJobId: jobId
      }, { kind: 'invoice' })
    } catch (error: any) {
      notify('error', error?.message || String(error))
    }
  }, [notify, openQuickAdd])

  // Journal display preferences.
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
    if (isClassicBookings) {
      shortcuts.unshift({
        id: 'journal-quick-add',
        key: 'q',
        label: 'Buchung',
        action: triggerBookingEntry
      })
    }
    return shortcuts
  }, [isClassicBookings, registeredPageShortcuts, triggerBookingEntry])

  const shortcutCommands = useMemo<ShortcutCommand[]>(() => [
    {
      key: 'n', label: 'Neue Buchung', global: true,
      description: 'Buchungserfassung als Flyout öffnen',
      action: () => {
        openQuickAdd()
        setShortcutBookingFlyout(true)
      }
    },
    ...(visibleNavigationItems.some(item => item.key === 'KI') ? [{
      key: 'a', label: 'KI aufrufen', global: true,
      target: '[data-shortcut-nav="KI"]',
      action: () => setActivePage('KI')
    }] : []),
    ...visibleNavigationItems.filter(item => item.key !== 'KI').map((item) => ({
      key: goToShortcutKeys[item.key], label: item.label,
      target: `[data-shortcut-nav="${item.key}"]`,
      action: () => setActivePage(item.key)
    })),
    ...activePageShortcuts.map((shortcut) => ({
      key: shortcut.key, label: shortcut.label, action: shortcut.action
    }))
  ], [activePageShortcuts, openQuickAdd, visibleNavigationItems])

  // PaymentsAssignModal extracted to components/modals/PaymentsAssignModal.tsx
  // Buchungen (Journal) filter states
  const [from, setFrom] = useState<string>('')
  const [to, setTo] = useState<string>('')
  const [filterSphere, setFilterSphere] = useState<'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB' | null>(
    null
  )
  const [filterPrimaryClassificationValueId, setFilterPrimaryClassificationValueId] = useState<number | null>(null)
  const [filterType, setFilterType] = useState<'IN' | 'OUT' | 'TRANSFER' | 'INTERNAL' | null>(null)
  const [filterPM, setFilterPM] = useState<'BAR' | 'BANK' | null>(null)
  const [filterPaymentAccountId, setFilterPaymentAccountId] = useState<number | null>(null)
  const [filterEarmark, setFilterEarmark] = useState<number | null>(null)
  const [filterBudgetId, setFilterBudgetId] = useState<number | null>(null)
  const [filterTag, setFilterTag] = useState<string | null>(null)
  const [q, setQ] = useState<string>('')
  const bookingLinkFilters = useMemo(() => ({
    q, from, to, type: filterType || '', sphere: filterSphere || '',
    account: filterPaymentAccountId ? String(filterPaymentAccountId) : '',
    budget: filterBudgetId ? String(filterBudgetId) : '',
    earmark: filterEarmark ? String(filterEarmark) : '', tag: filterTag || ''
  }), [q, from, to, filterType, filterSphere, filterPaymentAccountId, filterBudgetId, filterEarmark, filterTag])
  const updateBookingLinkFilter = useCallback((key: string, value: string) => {
    switch (key) {
      case 'q': setQ(value); setFlashId(null); break
      case 'from': setFrom(value); break
      case 'to': setTo(value); break
      case 'type': setFilterType(value as typeof filterType); break
      case 'sphere': setFilterSphere(value as typeof filterSphere); break
      case 'account': setFilterPaymentAccountId(value ? Number(value) : null); break
      case 'budget': setFilterBudgetId(value ? Number(value) : null); break
      case 'earmark': setFilterEarmark(value ? Number(value) : null); break
      case 'tag': setFilterTag(value || null); break
    }
  }, [])
  const resetBookingLinkFilters = useCallback(() => {
    resetVoucherFilters({ setFilterEarmark, setFilterBudgetId, setFilterTag, setFilterType, setFilterPM, setFilterPaymentAccountId, setFilterSphere, setQ, setFrom, setTo })
    setFilterPrimaryClassificationValueId(null)
    setFlashId(null)
    setPage(1)
  }, [])
  const openSidebarAccount = (id: number) => {
    resetBookingLinkFilters()
    setFilterPaymentAccountId(id)
    setPlusCalendarSelection({ month: currentLocalMonth(), from: '', to: '' })
    setBookingJumpRevision(value => value + 1)
    setActivePage('Buchungen')
  }
  const openSidebarAssignment = (kind: 'budget' | 'earmark', id: number) => {
    resetBookingLinkFilters()
    if (kind === 'budget') setFilterBudgetId(id)
    else setFilterEarmark(id)
    setPlusCalendarSelection({ month: currentLocalMonth(), from: '', to: '' })
    setBookingJumpRevision(value => value + 1)
    setActivePage('Buchungen')
  }
  const openPlusEdit = useCallback(async (row: { id: number }) => {
    if (plusEditSaveInFlight.current) return
    const request = ++plusEditRequest.current
    try {
      const result = await window.api.vouchers.list({ limit: 1, voucherIds: [row.id] })
      if (request !== plusEditRequest.current) return
      const current = result.rows[0]
      if (!current) throw new Error('Buchung wurde nicht gefunden.')
      const form = voucherRowToBookingForm(current)
      setPlusEditQa(form)
      setPlusEditInitialSnapshot(serializeBookingForm(form))
      setPlusEditFiles([])
      setPlusEditExpanded(false)
      setPlusEditDiscardOpen(false)
      window.dispatchEvent(new Event('booking-editor-opened'))
    } catch (error) {
      if (request === plusEditRequest.current) notify('error', error instanceof Error ? error.message : String(error))
    }
  }, [notify])
  const closePlusEdit = useCallback(() => {
    plusEditRequest.current++
    setPlusEditQa(null)
    setPlusEditFiles([])
    setPlusEditDiscardOpen(false)
    setPlusEditExpanded(false)
  }, [])
  const requestClosePlusEdit = useCallback(() => {
    if (plusEditSaveInFlight.current) return
    if (plusEditQa && (serializeBookingForm(plusEditQa) !== plusEditInitialSnapshot || plusEditFiles.length > 0)) {
      setPlusEditDiscardOpen(true)
    } else closePlusEdit()
  }, [closePlusEdit, plusEditFiles.length, plusEditInitialSnapshot, plusEditQa])
  const savePlusEdit = useCallback(async () => {
    if (!plusEditQa || plusEditSaveInFlight.current) return
    const { payload, error } = buildVoucherUpdatePayloadFromForm(plusEditQa)
    if (!payload) { notify('error', error); return }
    plusEditSaveInFlight.current = true
    setPlusEditSaving(true)
    try {
      const result = await persistBookingEdit(payload, plusEditFiles, file => {
        setPlusEditFiles(current => current.filter(item => item !== file))
      })
      notify('success', 'Buchung gespeichert')
      result?.warnings?.forEach(message => notify('info', 'Warnung: ' + message))
      closePlusEdit()
      dispatchDataChanged(['vouchers'])
    } catch (error) {
      notify('error', friendlyVoucherError(error))
    } finally {
      plusEditSaveInFlight.current = false
      setPlusEditSaving(false)
    }
  }, [closePlusEdit, notify, plusEditFiles, plusEditQa])
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
  // Global Tags state (for filters, table colorization, and tag manager)
  const [tagDefs, setTagDefs] = useState<
    Array<{ id: number; name: string; color?: string | null; usage?: number }>
  >([])
  useEffect(() => {
    let cancelled = false

    const loadBootstrap = async () => {
      try {
        const data = await window.api.app.bootstrap()
        if (cancelled) return
        setOpenBankImportsCount(data.counts.openBankImports)
        setDueMembershipFeesCount(data.counts.dueMembershipFees)
        setOpenInvoicesCount(data.counts.openInvoices)
        setDueRecurringBookingsCount(data.counts.dueRecurringBookings)
        setYearsAvail(data.years)
        setEarmarks(data.earmarks as typeof earmarks)
        setPaymentAccounts(data.paymentAccounts as typeof paymentAccounts)
        setTagDefs(data.tags as typeof tagDefs)
        setPeriodLock(data.periodLock)

        const [setup, active] = await Promise.all([
          window.api.settings.get({ key: 'setup.completed' }),
          window.api.organizations.active(),
        ])
        if (cancelled) return
        if (setup.value !== true && active.organization) {
          if (!setupOfferedOrganizations.current.has(active.organization.id)) {
            setupOfferedOrganizations.current.add(active.organization.id)
            setShowSetupWizard(true)
          }
          // The setup handles backup preferences; don't stack a backup prompt over it.
          return
        }
        const { mode, intervalDays, lastAuto } = data.backup
        const due = !lastAuto || Date.now() - lastAuto > intervalDays * 24 * 60 * 60 * 1000
        if (mode === 'PROMPT' && due) setAutoBackupPrompt({ intervalDays })
      } catch {
        // Individual views keep their own error handling for essential data.
      } finally {
        if (!cancelled) markOrganizationReady('bootstrap')
      }
    }

    const scheduleInitialLoad = () => {
      const requestIdle = (window as any).requestIdleCallback as
        | ((callback: () => void, options?: { timeout: number }) => number)
        | undefined
      if (requestIdle) return requestIdle(() => void loadBootstrap(), { timeout: 500 })
      return window.setTimeout(() => void loadBootstrap(), 0)
    }

    const taskId = scheduleInitialLoad()
    const onChanged = () => void loadBootstrap()
    const removeDataChangedListener = addDataChangedListener(
      ['vouchers', 'members', 'invoices', 'bank-imports', 'budgets', 'earmarks', 'tags', 'organizations', 'settings', 'recurring-bookings'],
      onChanged
    )
    return () => {
      cancelled = true
      removeDataChangedListener()
      const cancelIdle = (window as any).cancelIdleCallback as ((id: number) => void) | undefined
      if (cancelIdle) cancelIdle(taskId)
      else window.clearTimeout(taskId)
    }
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
  const journalPrefsHydrated = useRef(false)
  // Try to hydrate from persisted settings (server) once on mount if present
  useEffect(() => {
    ;(async () => {
      try {
        const [c, o] = await Promise.all([
          window.api?.settings?.get?.({ key: 'journal.cols' }),
          window.api?.settings?.get?.({ key: 'journal.order' })
        ])
        if (c?.value) {
          const parsed = JSON.parse(String(c.value))
          if (parsed && typeof parsed === 'object') setCols({ ...defaultCols, ...parsed })
        }
        if (o?.value) {
          const parsedO = JSON.parse(String(o.value))
          if (Array.isArray(parsedO)) setOrder(parsedO as ColKey[])
        }
      } catch {
        /* ignore */
      } finally {
        journalPrefsHydrated.current = true
      }
    })()
  }, [])
  useEffect(() => {
    if (!journalPrefsHydrated.current) return
    try {
      localStorage.setItem('journalCols', JSON.stringify(cols))
    } catch {}
    try {
      window.api?.settings?.set?.({ key: 'journal.cols', value: JSON.stringify(cols) })
    } catch {}
  }, [cols])
  useEffect(() => {
    if (!journalPrefsHydrated.current) return
    try {
      localStorage.setItem('journalColsOrder', JSON.stringify(order))
    } catch {}
    try {
      window.api?.settings?.set?.({ key: 'journal.order', value: JSON.stringify(order) })
    } catch {}
  }, [order])

  const eurFmt = useMemo(
    () => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }),
    []
  )

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
  const budgetNames = useMemo(() => new Map(budgetsForEdit.map(b => [b.id, b.label])), [budgetsForEdit])
  async function loadBudgets() {
    // Include archived budgets so filters/edit views can still resolve labels/colors.
    const res = await window.api?.budgets.list?.({ includeArchived: true } as any)
    if (res) {
      setBudgets(res.rows)

    }
  }

  useEffect(() => {
    // Ein Buchungsentwurf kann direkt aus der KI geöffnet werden. Dann sind
    // dieselben Stammdaten wie im Journal erforderlich, auch ohne Seitenwechsel.
    if (isClassicBookings || isPlusBookings || quickAdd) {
      loadBudgets()
      loadEarmarks()
    }
    if (activePage === 'Reports') {
      loadBudgets()
    }
  }, [activePage, isClassicBookings, isPlusBookings, quickAdd])

  // (earmarks loaded above)

  const isTopNav = effectiveNavLayout === 'top'

  return (
    <UpdateNoticeContext.Provider value={updateNotice}>
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
              availableItems={navItems}
              visibleNavItems={visibleNavItems}
              requiredNavItems={requiredNavItems}
              onVisibleNavItemsChange={setVisibleNavItems}
              activePage={activePage}
              onNavigate={setActivePage}
              navIconColorMode={navIconColorMode}
              openBankImportsCount={openBankImportsCount}
              openInvoicesCount={openInvoicesCount}
              dueMembershipFeesCount={dueMembershipFeesCount}
              dueRecurringBookingsCount={dueRecurringBookingsCount}
              showBadges
              items={visibleNavigationItems}
              aiBusy={aiBusy}
            />
          </div>
        ) : null}
        {isTopNav && <div className="app-header__drag-spacer" aria-hidden="true" />}
        {/* Window controls */}
        <div className="app-header__controls no-drag" data-shortcut-ignore style={{ WebkitAppRegion: 'no-drag' } as any}>
          <WindowControls />
        </div>
      </header>
      {!isTopNav && (
          <AppSidebar
            footerActions={useSidebarActions ? <SidebarBookingActions onNewBooking={triggerBookingEntry} onNewInvoice={openJournalInvoiceScan} onReview={id => void reviewBatchInvoice(id)} notify={notify} paymentAccounts={paymentAccounts} /> : undefined}
            availableItems={navItems}
            visibleNavItems={visibleNavItems}
            requiredNavItems={requiredNavItems}
            onVisibleNavItemsChange={setVisibleNavItems}
            activePage={activePage}
            onNavigate={setActivePage}
            navIconColorMode={navIconColorMode}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
            selectedAccountId={filterPaymentAccountId}
            onSelectAccount={openSidebarAccount}
            onSelectAssignment={openSidebarAssignment}
            onSelectMemberGroup={id => {
              setDashboardTaskTarget({ kind: 'members', filter: 'group', id })
              setDashboardTaskPage('Mitglieder')
              setActivePage('Mitglieder')
            }}
            onSelectMembershipFees={() => {
              setDashboardTaskTarget({ kind: 'members', filter: 'overdue' })
              setDashboardTaskPage('Mitglieder')
              setActivePage('Mitglieder')
            }}
            onSelectBankAccount={accountId => {
              setDashboardTaskTarget({ kind: 'bank', accountId, filter: 'open' })
              setDashboardTaskPage('Bankimport')
              setActivePage('Bankimport')
            }}
            openBankImportsCount={openBankImportsCount}
            openInvoicesCount={openInvoicesCount}
            dueMembershipFeesCount={dueMembershipFeesCount}
            dueRecurringBookingsCount={dueRecurringBookingsCount}
            showBadges
            items={visibleNavigationItems}
            aiBusy={aiBusy}
          />
      )}

      {/* Main content */}
      <PageTutorials page={activePage} bookingView={bookingView} setBookingView={setBookingView} openSettings={openSettingsTile} />
      <main className={`app-main${isClassicBookings ? ' app-main--journal' : isPlusBookings ? ' app-main--bookings-plus' : ''}`}>
        <Suspense fallback={<LoadingState message="Bereich wird geladen…" />}>
          {activePage === 'Reports' && (
            <ReportsView
              paymentAccounts={paymentAccounts}
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
              showExportOptions={showExportOptions}
              setShowExportOptions={setShowExportOptions}
              exportOptions={{
                fields: exportFields,
                setFields: setExportFields,
                orgName: exportOrgName,
                setOrgName: setExportOrgName,
                amountMode: exportAmountMode,
                setAmountMode: setExportAmountMode,
                sortDir: exportSortDir,
                setSortDir: setExportSortDir,
                dateFrom: reportsFrom,
                dateTo: reportsTo,
                exportType,
                setExportType,
                fiscalYear,
                setFiscalYear,
                includeBindings,
                setIncludeBindings,
                includeVoucherList,
                setIncludeVoucherList,
                includeBudgets,
                setIncludeBudgets,
                includeActivityReport,
                setIncludeActivityReport,
                includeInternalVouchers,
                setIncludeInternalVouchers,
                onExport: async (fmt, reportOpts) => {
                  try {
                    if (fmt === 'PDF_FISCAL') {
                      const fiscalOpts = (reportOpts || {}) as FiscalExportOptions
                      const res = await (window as any).api?.reports?.exportFiscal?.({
                        fiscalYear,
                        includeBindings: fiscalOpts.includeBindings ?? includeBindings,
                        includeVoucherList: fiscalOpts.includeVoucherList ?? includeVoucherList,
                        includeBudgets: fiscalOpts.includeBudgets ?? includeBudgets,
                        includeActivityReport: fiscalOpts.includeActivityReport ?? includeActivityReport,
                        includeInactiveBindings: fiscalOpts.includeInactiveBindings ?? false,
                        includeArchivedBudgets: fiscalOpts.includeArchivedBudgets ?? false,
                        includeInternalVouchers: fiscalOpts.includeInternalVouchers ?? includeInternalVouchers,
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
                        includeInternalVouchers: treasurerOpts?.includeInternalVouchers ?? includeInternalVouchers,
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
                }
              }}
              showActivityReportEditor={showActivityReportEditor}
              setShowActivityReportEditor={setShowActivityReportEditor}
              activityReportOptions={{
                fiscalYear,
                setFiscalYear,
                yearsAvail,
                budgets,
                notify
              }}
              refreshKey={refreshKey}
              activateKey={reportsActivateKey}
            />
          )}
          {activePage === 'Dashboard' && <DashboardPlusView membersEnabled={visibleNavSet.has('Mitglieder')} generalProfile={organizationProfile === 'GENERAL'} today={today} drafts={bookingDraftTabs} onOpenDraft={openBookingDraftTab} onTaskNavigate={target => {
            const pages: Record<DashboardTaskTarget['kind'], NavKey> = { bank: 'Bankimport', members: 'Mitglieder', invoices: 'Verbindlichkeiten', receivables: 'Verbindlichkeiten', recurring: 'Dauerbuchungen', reimbursements: 'Verbindlichkeiten', advances: 'Vorschuesse', drafts: 'Buchungen', budgets: 'Budgets', bindings: 'Zweckbindungen', backup: 'Einstellungen', ai: 'KI' }
            const page = pages[target.kind]
            if (!visibleNavSet.has(page)) setVisibleNavItems([...visibleNavItems, page])
            setDashboardTaskTarget(target)
            setDashboardTaskPage(page)
            if (target.kind === 'backup') sessionStorage.setItem('settingsActiveTile', 'storage')
            setActivePage(page)
          }} onGoToBookings={source => {
            if (source) openReportBookings(source)
            else setActivePage('Buchungen')
          }} onGoToInvoices={() => setActivePage('Verbindlichkeiten')} onGoToMembers={() => setActivePage('Mitglieder')} onGoToBudgets={() => setActivePage('Budgets')} onGoToBindings={() => setActivePage('Zweckbindungen')} onGoToAI={() => { if (!visibleNavSet.has('KI')) setVisibleNavItems([...visibleNavItems, 'KI']); setActivePage('KI') }} onGoToVoucher={({ voucherId, recordDate }) => {
            resetVoucherFilters({ setFilterEarmark, setFilterBudgetId, setFilterTag, setFilterType, setFilterPM, setFilterPaymentAccountId, setFilterSphere, setQ, keepDateRange: true })
            setQ(`#${voucherId}`); setFrom(recordDate?.slice(0, 10) || ''); setTo(recordDate?.slice(0, 10) || ''); setPlusCalendarSelection(current => ({ month: recordDate?.slice(0, 7) || current.month, from: recordDate?.slice(0, 10) || '', to: recordDate?.slice(0, 10) || '' })); setFlashId(voucherId); setPage(1); setActivePage('Buchungen')
            window.setTimeout(() => setFlashId(current => current === voucherId ? null : current), 5000)
          }} />}
          {isClassicBookings && (
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
          {isPlusBookings && (
            <BookingsPlusView yearsAvail={yearsAvail} showCreationActions={!useSidebarActions} onFilterChange={updateBookingLinkFilter} onResetFilters={resetBookingLinkFilters} calendarSelection={plusCalendarSelection} onCalendarSelectionChange={setPlusCalendarSelection} jumpRevision={bookingJumpRevision} externalFilters={bookingLinkFilters} flashId={flashId} fmtDate={fmtDate} showBookingDraftTabs={showBookingDraftTabs} bookingDraftTabs={bookingDraftTabs} onOpenBookingDraft={openBookingDraftTab} onCloseBookingDraft={closeBookingDraftTab} onNewBooking={openBookingEntry} onEditBooking={openPlusEdit} bookingEntryPresentation={bookingEntryPresentation} onNewInvoice={openJournalInvoiceScan} onReviewInvoice={(id) => void reviewBatchInvoice(id)} notify={notify} paymentAccounts={paymentAccounts} budgets={budgetsForEdit} earmarks={earmarks} tagDefs={tagDefs} allowVoucherDeletion={allowVoucherDeletion} closedUntil={periodLock?.closedUntil} generalProfile={organizationProfile === 'GENERAL'} />
          )}
          {activePage === 'Dauerbuchungen' && (
            <RecurringBookingsView notify={notify} initialTask={dashboardTaskTarget} />
          )}
          {/* Old Buchungen block removed - now using JournalView component */}

          {activePage === 'Einstellungen' && (
            <SettingsView
              organizationProfile={organizationProfile}
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
              displayDensity={displayDensity}
              setDisplayDensity={setDisplayDensity}
              sidebarBookingActions={sidebarBookingActions}
              setSidebarBookingActions={setSidebarBookingActions}
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
              backgroundImageVisibility={backgroundImageVisibility}
              setBackgroundImageVisibility={setBackgroundImageVisibility}
              customBackgroundImage={customBackgroundImage}
              setCustomBackgroundImage={setCustomBackgroundImage}
              glassModals={glassModals}
              setGlassModals={setGlassModals}
              showBookingDraftTabs={showBookingDraftTabs}
              bookingView={bookingView}
              setBookingView={setBookingView}
              setShowBookingDraftTabs={setShowBookingDraftTabs}
              showBookingEditTabs={showBookingEditTabs}
              setShowBookingEditTabs={setShowBookingEditTabs}
              bookingEntryPresentation={bookingEntryPresentation}
              setBookingEntryPresentation={setBookingEntryPresentation}
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
            <MembersView key={membersOrganizationId} registerPageShortcuts={registerPageShortcuts} initialTask={dashboardTaskTarget} />
          )}

          {activePage === 'Vorschuesse' && <AdvancesView />}

          {activePage === 'Verbindlichkeiten' && (
            <InvoicesView registerPageShortcuts={registerPageShortcuts} initialTask={dashboardTaskTarget} />
          )}

          {activePage === 'Bankimport' && (
            <BankImportView
              initialTask={dashboardTaskTarget}
              paymentAccounts={paymentAccounts}
              notify={notify}
              onCreateBooking={(transaction, acknowledgedBankVoucherIds) => {
                openQuickAdd({
                  qa: {
                    date: transaction.bookingDate,
                    type: transaction.direction,
                    bookingTypeSelected: true,
                    sphere: 'IDEELL',
                    mode: 'GROSS',
                    grossAmount: Number(transaction.amount),
                    vatRate: 0,
                    description: buildBankBookingDescription(transaction),
                    note: [
                      transaction.endToEndId && `End-to-End-ID: ${transaction.endToEndId}`,
                      transaction.bankReference && `Bankreferenz: ${transaction.bankReference}`
                    ]
                      .filter(Boolean)
                      .join('\n'),
                    paymentMethod: 'BANK',
                    paymentAccountId: transaction.paymentAccountId,
                    paymentAccountName: transaction.paymentAccountName,
                    counterparty: transaction.counterparty || '',
                    partyCreationSource: { name: transaction.counterparty || '', iban: transaction.counterpartyIban },
                    bankTransactionId: transaction.id,
                    bankReviewSource: bankDraftSourceFromTransaction(transaction),
                    acknowledgedBankVoucherIds
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
                  dispatchDataChanged(['vouchers', 'members', 'budgets', 'earmarks'])
                }}
              />
            </div>
          )}

        </Suspense>
      </main>

      <LeaderShortcuts commands={shortcutCommands} />

      {plusEditQa && bookingEntryPresentation === 'flyout' && !plusEditExpanded && (
        <>
          <div className="compact-booking-flyout-dismiss compact-booking-flyout-dismiss--dimmed" aria-hidden="true" />
          <div className="compact-booking-flyout-anchor" style={sidebarFlyoutPosition}>
            <CompactBookingFlyout notify={notify}
              key={`edit-${plusEditQa.id}`}
              title="Buchung bearbeiten"
              saveLabel={plusEditSaving ? 'Speichert …' : 'Änderungen speichern'}
              qa={plusEditQa}
              setQa={next => setPlusEditQa({ ...next, id: plusEditQa.id })}
              onSave={savePlusEdit}
              onClose={requestClosePlusEdit}
              onExpand={() => setPlusEditExpanded(true)}
              files={plusEditFiles}
              setFiles={setPlusEditFiles}
              onDropFiles={fileList => { if (fileList) setPlusEditFiles(current => [...current, ...Array.from(fileList)]) }}
              openFilePicker={() => plusEditFileInputRef.current?.click()}
              fileInputRef={plusEditFileInputRef}
              budgetsForEdit={budgetsForEdit}
              earmarks={earmarks}
              paymentAccounts={paymentAccounts}
              tagDefs={tagDefs}
              descSuggest={descSuggest}
              afterSaveDefault="close"
              draftTabsEnabled={false}
              draftTabs={[]}
              activeDraftId={null}
              onSelectDraft={() => {}}
              onNewDraft={() => {}}
            />
          </div>
        </>
      )}
      {plusEditQa && (bookingEntryPresentation === 'modal' || plusEditExpanded) && (
        <QuickAddModal notify={notify}
          key={`edit-${plusEditQa.id}`}
          title="Buchung bearbeiten"
          saveLabel={plusEditSaving ? 'Speichert …' : 'Änderungen speichern'}
          showSaveMenu={false}
          qa={plusEditQa}
          setQa={next => setPlusEditQa({ ...next, id: plusEditQa.id })}
          onSave={savePlusEdit}
          onClose={requestClosePlusEdit}
          onRequestClose={requestClosePlusEdit}
          files={plusEditFiles}
          setFiles={setPlusEditFiles}
          onDropFiles={fileList => { if (fileList) setPlusEditFiles(current => [...current, ...Array.from(fileList)]) }}
          openFilePicker={() => plusEditFileInputRef.current?.click()}
          fileInputRef={plusEditFileInputRef}
          fmtDate={fmtDate}
          eurFmt={eurFmt}
          budgetsForEdit={budgetsForEdit}
          earmarks={earmarks}
          paymentAccounts={paymentAccounts}
          tagDefs={tagDefs}
          descSuggest={descSuggest}
        />
      )}
      {plusEditDiscardOpen && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="card" role="alertdialog" aria-label="Ungespeicherte Änderungen" style={{ maxWidth: 420, padding: 24 }}>
            <h3>Ungespeicherte Änderungen</h3>
            <p>Möchtest du die Änderungen an dieser Buchung verwerfen?</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn" onClick={() => setPlusEditDiscardOpen(false)}>Weiter bearbeiten</button>
              <button type="button" className="btn danger" onClick={closePlusEdit}>Änderungen verwerfen</button>
            </div>
          </div>
        </div>
      )}

      {/* Quick-Add: full dialog or optional compact flyout */}
      {quickAdd && activeDraftKind === 'booking' && effectiveBookingEntryPresentation === 'flyout' && !forceFullBookingDialog && (
        <div className={`compact-booking-flyout-dismiss compact-booking-flyout-dismiss--dimmed${shortcutBookingFlyout ? ' compact-booking-flyout-dismiss--shortcut' : ''}`} aria-hidden="true" />
      )}
      {quickAdd && activeDraftKind === 'booking' && effectiveBookingEntryPresentation === 'flyout' && !forceFullBookingDialog && (
        <div style={sidebarFlyoutPosition} className={`compact-booking-flyout-anchor${shortcutBookingFlyout ? ' compact-booking-flyout-anchor--shortcut' : ''}${isClassicBookings ? ' compact-booking-flyout-anchor--journal' : ''}${fabNearJournalEnd ? ' compact-booking-flyout-anchor--journal-end' : ''}`}>
          <CompactBookingFlyout notify={notify}
            key={activeDraftId ?? 'compact-quick-add'}
            qa={qa}
            setQa={setQa}
            onSave={onQuickSave}
            onClose={parkQuickAdd}
            onExpand={() => setForceFullBookingDialog(true)}
            files={files}
            setFiles={setFiles}
            openFilePicker={openFilePicker}
            onDropFiles={onDropFiles}
            fileInputRef={fileInputRef}
            budgetsForEdit={budgetsForEdit}
            earmarks={earmarks}
            paymentAccounts={paymentAccounts}
            tagDefs={tagDefs}
            descSuggest={descSuggest}
            afterSaveDefault={quickAddAfterSave}
            draftTabsEnabled={showBookingDraftTabs}
            draftTabs={bookingDraftTabs.filter((tab) => {
              const draft = bookingDrafts.find((entry) => entry.id === tab.id)
              return draft?.kind !== 'invoice' && !draft?.detached
            })}
            activeDraftId={activeDraftId}
            onSelectDraft={openBookingDraftTab}
            onNewDraft={triggerBookingEntry}
          />
        </div>
      )}
      {quickAdd && activeDraftKind === 'booking' && (effectiveBookingEntryPresentation !== 'flyout' || forceFullBookingDialog) && (
        <QuickAddModal notify={notify}
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
      {quickAdd && activeDraftKind === 'invoice' && activeDraftId && (
        <LocalInvoiceScanModal
          onClose={parkQuickAdd}
          onCreateInvoice={async (result) => {
            const converted = scannedInvoiceToBooking(result)
            if (!converted.initial) {
              notify('error', `Bitte ergänze: ${(converted.missing || []).join(', ')}.`)
              return false
            }
            updateDraft(activeDraftId, {
              qa: converted.initial.qa,
              files: converted.initial.files,
              kind: 'booking'
            })
            return true
          }}
          budgetsForEdit={budgetsForEdit}
          earmarks={earmarks}
          tagDefs={tagDefs}
          submitLabel="Als Buchung übernehmen"
          commentAriaLabel="Kommentar zur Buchung"
          closeOnCreate={false}
          initialFile={files[0]}
          initialState={activeInvoiceState}
          aiGuidance={activeInvoiceGuidance}
          onDraftChange={(state) => {
            updateDraft(activeDraftId, {
              files: [state.file],
              invoiceState: state
            })
          }}
        />
      )}
      {showOpenBookingTabsClosePrompt && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal modal-inset-header booking-close-guard-modal" onClick={(e) => e.stopPropagation()}>
            <ModalHeader
              className="booking-close-guard-modal__header"
              title="Offene Buchungstabs"
              onClose={cancelCloseWithOpenDrafts}
              closeLabel="Schließen"
              closeOnEscape={false}
            />
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
      {/* Journal action */}
      {!useSidebarActions && (isClassicBookings ? (
        <div
          className={`journal-fab-cluster${fabNearJournalEnd ? ' journal-fab-cluster--journal-end' : ''}`}
          role="group"
          aria-label="Journal-Aktionen"
        >
          <InvoiceBatchControl
            onNewInvoice={openJournalInvoiceScan}
            onReview={(id) => void reviewBatchInvoice(id)}
            notify={notify}
            paymentAccounts={paymentAccounts}
          />
          <button
            className="fab fab-buchung"
            onClick={triggerBookingEntry}
            title="+ Buchung"
          >
            <span className="fab-buchung-icon">+</span>
            <span className="fab-buchung-text">Buchung</span>
          </button>
        </div>
      ) : (
        !isPlusBookings &&
        activePage !== 'Dauerbuchungen' &&
        activePage !== 'Einstellungen' &&
        activePage !== 'Mitglieder' &&
        activePage !== 'Verbindlichkeiten' &&
        activePage !== 'Bankimport' &&
        activePage !== 'KI' &&
        activePage !== 'Budgets' &&
        activePage !== 'Zweckbindungen' &&
        activePage !== 'Vorschuesse' && (
          <button className="fab fab-buchung" onClick={triggerBookingEntry} title="+ Buchung">
            <span className="fab-buchung-icon">+</span>
            <span className="fab-buchung-text">Buchung</span>
          </button>
        )
      ))}
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
                notify(res.warning ? 'info' : 'success', res.warning || 'Backup erstellt')
                dispatchDataChanged(['settings'])
              } else {
                notify('error', res?.error || 'Backup konnte nicht erstellt werden')
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
        open={isClassicBookings && showTimeFilter}
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
        open={isClassicBookings && showMetaFilter}
        onClose={() => setShowMetaFilter(false)}
        earmarks={earmarks}
        budgets={budgets}
        sphere={filterSphere}
        primaryClassificationValueId={filterPrimaryClassificationValueId}
        earmarkId={filterEarmark}
        budgetId={filterBudgetId}
        onApply={({ sphere, primaryClassificationValueId, earmarkId, budgetId }) => {
          setFilterSphere(sphere)
          setFilterPrimaryClassificationValueId(primaryClassificationValueId)
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
          bookingView={bookingView}
          setBookingView={setBookingView}
          colorTheme={colorTheme}
          setColorTheme={setColorTheme}
          existingTags={tagDefs as any}
          notify={notify}
        />
      )}

    </div>
    </UpdateNoticeContext.Provider>
  )
}
// Wrapper with context providers
export default function App() {
  const isReceiptWidget = new URLSearchParams(window.location.search).get('window') === 'receipt-widget'
  const isDetachedQuickAdd =
    new URLSearchParams(window.location.search).get('window') === 'quick-add'
  return (
    <UIPreferencesProvider>
      <ToastProvider>
        <Suspense fallback={<LoadingState message="VereinO wird geladen …" />}>
          {isReceiptWidget ? <ReceiptWidget /> : isDetachedQuickAdd ? <DetachedQuickAddWindow /> : <AppInner />}
        </Suspense>
      </ToastProvider>
    </UIPreferencesProvider>
  )
}
