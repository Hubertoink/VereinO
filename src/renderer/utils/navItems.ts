export type NavKey = 'Dashboard' | 'Buchungen' | 'Verbindlichkeiten' | 'Mitglieder' | 'Budgets' | 'Zweckbindungen' | 'Einreichungen' | 'Belege' | 'Reports' | 'Einstellungen'

/**
 * Navigation groups for visual separation:
 * - overview: Dashboard (Startseite)
 * - transactions: Buchungen, Verbindlichkeiten (Kernbereiche Geldfluss)
 * - organization: Mitglieder, Budgets, Zweckbindungen, Einreichungen (Vereinsstruktur)
 * - documents: Belege, Reports (Dokumente & Auswertungen)
 * - system: Einstellungen (Konfiguration)
 */
export type NavGroup = 'overview' | 'transactions' | 'organization' | 'documents' | 'system'

export interface NavItem {
  key: NavKey
  label: string
  group: NavGroup
  showDividerAfter?: boolean
  // Inline SVG as React nodes will be supplied by consumers to keep this file framework-light
}

export const navItems: NavItem[] = [
  // Übersicht
  { key: 'Dashboard', label: 'Dashboard', group: 'overview' },
  // Kernbereiche Geldfluss
  { key: 'Buchungen', label: 'Buchungen', group: 'transactions' },
  { key: 'Verbindlichkeiten', label: 'Verbindlichkeiten', group: 'transactions' },
  // Vereinsstruktur & Planung
  { key: 'Mitglieder', label: 'Mitglieder', group: 'organization' },
  { key: 'Budgets', label: 'Budgets', group: 'organization' },
  { key: 'Zweckbindungen', label: 'Zweckbindungen', group: 'organization' },
  { key: 'Einreichungen', label: 'Einreichungen', group: 'organization' },
  // Dokumente & Auswertungen
  { key: 'Belege', label: 'Belege', group: 'documents' },
  { key: 'Reports', label: 'Reports', group: 'documents' },
  // System
  { key: 'Einstellungen', label: 'Einstellungen', group: 'system' },
]
