/**
 * Settings View Types
 * 
 * Central type definitions for the Settings module
 */

import type { NavKey } from '../../utils/navItems'
import type {
  BackgroundImage,
  JournalRowDensity,
  JournalRowStyle,
  NavIconColorMode,
  NavLayout,
  QuickAddAfterSave
} from '../../context/UIPreferencesContextCore'
import type { ColorTheme } from '../../context/uiTheme'

// ============================================================================
// Navigation & Layout Types
// ============================================================================

export type TileKey =
  | 'general'
  | 'table'
  | 'storage'
  | 'docling'
  | 'import'
  | 'org'
  | 'donations'
  | 'paymentAccounts'
  | 'tags'
  | 'aiPatterns'
  | 'cashCheck'
  | 'yearEnd'
  | 'updates'
  | 'tutorial' 
  | 'about'

// ============================================================================
// Journal/Table Configuration Types
// ============================================================================

export type DateFmt = 'ISO' | 'PRETTY' | 'DOT'

export type ColKey = 
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

// ============================================================================
// Backup & Storage Types
// ============================================================================

export type AutoBackupMode = 'OFF' | 'PROMPT' | 'SILENT'

export interface BackupInfo {
  filePath: string
  size: number
  mtime: number
}

export interface LocationInfo {
  root: string
  dbPath: string
  filesDir: string
  configuredRoot: string | null
}

export interface RestoreInfo {
  current?: Record<string, number>
  backup?: Record<string, number>
  error?: string
}

// ============================================================================
// Tag Types
// ============================================================================

export interface TagDef {
  id: number
  name: string
  color?: string | null
  usage?: number
}

export interface PaymentAccount {
  id: number
  name: string
  kind: 'CASH' | 'BANK' | 'PAYPAL' | 'CARD' | 'OTHER'
  iban?: string | null
  color?: string | null
  sortOrder: number
  isActive: number
}

// ============================================================================
// Settings Props (Main Component Interface)
// ============================================================================

export interface SettingsProps {
  // Table Configuration
  defaultCols: Record<ColKey, boolean>
  defaultOrder: ColKey[]
  cols: Record<ColKey, boolean>
  setCols: (c: Record<ColKey, boolean>) => void
  order: ColKey[]
  setOrder: (o: ColKey[]) => void
  journalLimit: number
  setJournalLimit: (n: number) => void
  labelForCol: (k: string) => string

  // UI Preferences
  dateFmt: DateFmt
  setDateFmt: (f: DateFmt) => void
  sidebarCollapsed: boolean
  setSidebarCollapsed: (b: boolean) => void
  navLayout: NavLayout
  setNavLayout: (v: NavLayout) => void
  navIconColorMode: NavIconColorMode
  setNavIconColorMode: (v: NavIconColorMode) => void
  colorTheme: ColorTheme
  setColorTheme: (v: ColorTheme) => void
  journalRowStyle: JournalRowStyle
  setJournalRowStyle: (v: JournalRowStyle) => void
  journalRowDensity: JournalRowDensity
  setJournalRowDensity: (v: JournalRowDensity) => void
  backgroundImage: BackgroundImage
  setBackgroundImage: (v: BackgroundImage) => void
  customBackgroundImage: string | null
  setCustomBackgroundImage: (v: string | null) => void
  glassModals: boolean
  setGlassModals: (v: boolean) => void
  showBookingDraftTabs: boolean
  setShowBookingDraftTabs: (v: boolean) => void
  showBookingEditTabs: boolean
  setShowBookingEditTabs: (v: boolean) => void
  bookingsOpenDetached: boolean
  setBookingsOpenDetached: (v: boolean) => void
  allowVoucherDeletion: boolean
  setAllowVoucherDeletion: (v: boolean) => void
  quickAddAfterSave: QuickAddAfterSave
  setQuickAddAfterSave: (v: QuickAddAfterSave) => void
  visibleNavItems: NavKey[]
  setVisibleNavItems: (v: NavKey[]) => void

  // Tags
  tagDefs: TagDef[]
  setTagDefs: React.Dispatch<React.SetStateAction<TagDef[]>>
  paymentAccounts: PaymentAccount[]
  setPaymentAccounts: React.Dispatch<React.SetStateAction<PaymentAccount[]>>

  // Callbacks
  notify: (type: 'success' | 'error' | 'info', text: string, ms?: number, action?: { label: string; onClick: () => void }) => void
  bumpDataVersion: () => void
  openTagsManager?: () => void
  openSetupWizard?: () => void
}

// ============================================================================
// Pane-specific Props
// ============================================================================

export interface GeneralPaneProps {
  navLayout: NavLayout
  setNavLayout: (v: NavLayout) => void
  sidebarCollapsed: boolean
  setSidebarCollapsed: (b: boolean) => void
  navIconColorMode: NavIconColorMode
  setNavIconColorMode: (v: NavIconColorMode) => void
  colorTheme: ColorTheme
  setColorTheme: (v: ColorTheme) => void
  journalRowStyle: JournalRowStyle
  setJournalRowStyle: (v: JournalRowStyle) => void
  journalRowDensity: JournalRowDensity
  setJournalRowDensity: (v: JournalRowDensity) => void
  backgroundImage: BackgroundImage
  setBackgroundImage: (v: BackgroundImage) => void
  customBackgroundImage: string | null
  setCustomBackgroundImage: (v: string | null) => void
  glassModals: boolean
  setGlassModals: (v: boolean) => void
  dateFmt: DateFmt
  setDateFmt: (v: DateFmt) => void
  journalLimit: number
  setJournalLimit: (n: number) => void
  notify: (type: 'success' | 'error' | 'info', text: string, ms?: number, action?: { label: string; onClick: () => void }) => void
  bumpDataVersion: () => void
  openSetupWizard?: () => void
  showBookingDraftTabs: boolean
  setShowBookingDraftTabs: (v: boolean) => void
  showBookingEditTabs: boolean
  setShowBookingEditTabs: (v: boolean) => void
  bookingsOpenDetached: boolean
  setBookingsOpenDetached: (v: boolean) => void
  allowVoucherDeletion: boolean
  setAllowVoucherDeletion: (v: boolean) => void
  quickAddAfterSave: QuickAddAfterSave
  setQuickAddAfterSave: (v: QuickAddAfterSave) => void
  visibleNavItems: NavKey[]
  setVisibleNavItems: (v: NavKey[]) => void
}

export interface TablePaneProps {
  cols: Record<ColKey, boolean>
  setCols: (c: Record<ColKey, boolean>) => void
  order: ColKey[]
  setOrder: (o: ColKey[]) => void
  defaultCols: Record<ColKey, boolean>
  defaultOrder: ColKey[]
  journalLimit: number
  setJournalLimit: (n: number) => void
  labelForCol: (k: string) => string
  allowVoucherDeletion: boolean
}

export interface StoragePaneProps {
  notify: (type: 'success' | 'error' | 'info', text: string, ms?: number, action?: { label: string; onClick: () => void }) => void
  bumpDataVersion: () => void
}

export interface TagsPaneProps {
  tagDefs: TagDef[]
  setTagDefs: React.Dispatch<React.SetStateAction<TagDef[]>>
  notify: (type: 'success' | 'error' | 'info', text: string, ms?: number, action?: { label: string; onClick: () => void }) => void
  bumpDataVersion: () => void
  openTagsManager?: () => void
}

export interface PaymentAccountsPaneProps {
  paymentAccounts: PaymentAccount[]
  setPaymentAccounts: React.Dispatch<React.SetStateAction<PaymentAccount[]>>
  notify: (type: 'success' | 'error' | 'info', text: string, ms?: number, action?: { label: string; onClick: () => void }) => void
  bumpDataVersion: () => void
}

export interface OrgPaneProps {
  notify: (type: 'success' | 'error' | 'info', text: string, ms?: number, action?: { label: string; onClick: () => void }) => void
}

export interface YearEndPaneProps {
  notify: (type: 'success' | 'error' | 'info', text: string, ms?: number, action?: { label: string; onClick: () => void }) => void
  bumpDataVersion: () => void
}

export interface CashCheckPaneProps {
  notify: (type: 'success' | 'error' | 'info', text: string, ms?: number, action?: { label: string; onClick: () => void }) => void
  bumpDataVersion: () => void
}

export interface ImportPaneProps {
  notify: (type: 'success' | 'error' | 'info', text: string, ms?: number, action?: { label: string; onClick: () => void }) => void
}
