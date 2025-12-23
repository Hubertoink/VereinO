/**
 * Settings View Types
 * 
 * Central type definitions for the Settings module
 */

// ============================================================================
// Navigation & Layout Types
// ============================================================================

export type TileKey =
  | 'general'
  | 'table'
  | 'storage'
  | 'import'
  | 'org'
  | 'tags'
  | 'yearEnd'
  | 'tutorial' 
  | 'about'

export type NavLayout = 'left' | 'top'

export type NavIconColorMode = 'color' | 'mono'

export type ColorTheme = 
  | 'default' 
  | 'fiery-ocean' 
  | 'peachy-delight' 
  | 'pastel-dreamland' 
  | 'ocean-breeze' 
  | 'earthy-tones' 
  | 'monochrome-harmony' 
  | 'vintage-charm'

// ============================================================================
// Journal/Table Configuration Types
// ============================================================================

export type JournalRowStyle = 'both' | 'lines' | 'zebra' | 'none'

export type JournalRowDensity = 'normal' | 'compact'

export type BackgroundImage = 'none' | 'cherry-blossom' | 'foggy-forest' | 'mountain-snow'

export type DateFmt = 'ISO' | 'PRETTY'

export type ColKey = 
  | 'actions' 
  | 'date' 
  | 'voucherNo' 
  | 'type' 
  | 'sphere' 
  | 'description' 
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
  glassModals: boolean
  setGlassModals: (v: boolean) => void
  showSubmissionBadge: boolean
  setShowSubmissionBadge: (v: boolean) => void

  // Tags
  tagDefs: TagDef[]
  setTagDefs: React.Dispatch<React.SetStateAction<TagDef[]>>

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
  glassModals: boolean
  setGlassModals: (v: boolean) => void
  dateFmt: DateFmt
  setDateFmt: (v: DateFmt) => void
  journalLimit: number
  setJournalLimit: (n: number) => void
  notify: (type: 'success' | 'error' | 'info', text: string, ms?: number, action?: { label: string; onClick: () => void }) => void
  bumpDataVersion: () => void
  openSetupWizard?: () => void
  showSubmissionBadge: boolean
  setShowSubmissionBadge: (v: boolean) => void
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

export interface OrgPaneProps {
  notify: (type: 'success' | 'error' | 'info', text: string, ms?: number, action?: { label: string; onClick: () => void }) => void
}

export interface YearEndPaneProps {
  notify: (type: 'success' | 'error' | 'info', text: string, ms?: number, action?: { label: string; onClick: () => void }) => void
  bumpDataVersion: () => void
}

export interface ImportPaneProps {
  notify: (type: 'success' | 'error' | 'info', text: string, ms?: number, action?: { label: string; onClick: () => void }) => void
}
