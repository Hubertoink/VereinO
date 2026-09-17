import type { ColorTheme } from '../../src/renderer/context/uiTheme'
import { api } from './api'
export type WebPreferences = {
  version: number
  themeMode: 'dark' | 'light'
  colorTheme: ColorTheme
  navLayout: 'left' | 'top'
  navIconColorMode: 'color' | 'mono'
}
export type WebOrganizationSettings = { name: string; version: number }
export type WebWorkflowSettings = {
  version: number
  bookingView: 'classic' | 'plus'
  showBookingDraftTabs: boolean
  showBookingEditTabs: boolean
  bookingEntryPresentation: 'modal' | 'flyout' | 'detached'
  allowVoucherDeletion: boolean
  quickAddAfterSave: 'close' | 'new'
}
export type WebTableSettings = {
  version: number
  dateFormat: 'de' | 'iso'
  journalRowStyle: 'both' | 'lines' | 'zebra' | 'none'
  journalRowDensity: 'normal' | 'compact'
  journalLimit: 20 | 50 | 100
  columns: Record<string, boolean>
  columnOrder: string[]
}
export async function loadWebPreferences(): Promise<WebPreferences> {
  return (await api<{ preferences: WebPreferences }>('/settings/preferences')).preferences
}
export async function saveWebPreferences(preferences: WebPreferences): Promise<WebPreferences> {
  return (await api<{ preferences: WebPreferences }>('/settings/preferences', 'PATCH', preferences))
    .preferences
}
export async function loadWebWorkflow(): Promise<WebWorkflowSettings> {
  return (await api<{ settings: WebWorkflowSettings }>('/settings/workflow')).settings
}
export async function saveWebWorkflow(settings: WebWorkflowSettings): Promise<WebWorkflowSettings> {
  return (await api<{ settings: WebWorkflowSettings }>('/settings/workflow', 'PATCH', settings)).settings
}
export async function loadWebTable(): Promise<WebTableSettings> {
  return (await api<{ settings: WebTableSettings }>('/settings/table')).settings
}
export async function saveWebTable(settings: WebTableSettings): Promise<WebTableSettings> {
  return (await api<{ settings: WebTableSettings }>('/settings/table', 'PATCH', settings)).settings
}
