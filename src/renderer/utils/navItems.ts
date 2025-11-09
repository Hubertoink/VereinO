export type NavKey = 'Dashboard' | 'Buchungen' | 'Rechnungen' | 'Mitglieder' | 'Budgets' | 'Zweckbindungen' | 'Belege' | 'Reports' | 'Einstellungen'

export type NavGroup = 'dashboard' | 'core' | 'reports' | 'settings'

export interface NavItem {
  key: NavKey
  label: string
  group: NavGroup
  showDividerAfter?: boolean
  // Inline SVG as React nodes will be supplied by consumers to keep this file framework-light
}

export const navItems: NavItem[] = [
  { key: 'Dashboard', label: 'Dashboard', group: 'dashboard' },
  { key: 'Buchungen', label: 'Buchungen', group: 'core', showDividerAfter: true },
  { key: 'Rechnungen', label: 'Rechnungen', group: 'core', showDividerAfter: true },
  { key: 'Mitglieder', label: 'Mitglieder', group: 'core' },
  { key: 'Budgets', label: 'Budgets', group: 'core' },
  { key: 'Zweckbindungen', label: 'Zweckbindungen', group: 'core' },
  { key: 'Belege', label: 'Belege', group: 'reports' },
  { key: 'Reports', label: 'Reports', group: 'reports' },
  { key: 'Einstellungen', label: 'Einstellungen', group: 'settings' },
]
