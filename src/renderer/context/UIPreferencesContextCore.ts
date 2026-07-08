import { createContext } from 'react'
import type { ColorTheme } from './uiTheme'

export type NavLayout = 'top' | 'left'
export type NavIconColorMode = 'color' | 'mono'
export type DateFormat = 'de' | 'iso'
export type JournalRowStyle = 'both' | 'lines' | 'zebra' | 'none'
export type JournalRowDensity = 'normal' | 'compact'
export type BackgroundImage = 'none' | 'cherry-blossom' | 'foggy-forest' | 'mountain-snow' | 'custom' | 'niko-bg'
export type QuickAddAfterSave = 'close' | 'new'

interface UIPreferencesContextValue {
  navLayout: NavLayout
  setNavLayout: (val: NavLayout) => void
  sidebarCollapsed: boolean
  setSidebarCollapsed: (val: boolean) => void
  colorTheme: ColorTheme
  setColorTheme: (val: ColorTheme) => void
  navIconColorMode: NavIconColorMode
  setNavIconColorMode: (val: NavIconColorMode) => void
  dateFormat: DateFormat
  setDateFormat: (val: DateFormat) => void
  journalRowStyle: JournalRowStyle
  setJournalRowStyle: (val: JournalRowStyle) => void
  journalRowDensity: JournalRowDensity
  setJournalRowDensity: (val: JournalRowDensity) => void
  showBookingDraftTabs: boolean
  setShowBookingDraftTabs: (val: boolean) => void
  showBookingEditTabs: boolean
  setShowBookingEditTabs: (val: boolean) => void
  bookingsOpenDetached: boolean
  setBookingsOpenDetached: (val: boolean) => void
  allowVoucherDeletion: boolean
  setAllowVoucherDeletion: (val: boolean) => void
  quickAddAfterSave: QuickAddAfterSave
  setQuickAddAfterSave: (val: QuickAddAfterSave) => void
  backgroundImage: BackgroundImage
  setBackgroundImage: (val: BackgroundImage) => void
  customBackgroundImage: string | null
  setCustomBackgroundImage: (val: string | null) => void
  glassModals: boolean
  setGlassModals: (val: boolean) => void
}

export const UIPreferencesContext = createContext<UIPreferencesContextValue | null>(null)
