export const webNavKeys = ['Dashboard', 'Buchungen', 'Dauerbuchungen', 'Bankimport', 'Belege', 'Mitglieder', 'Budgets', 'Zweckbindungen', 'Reports', 'KI', 'Einreichungen', 'Einstellungen'] as const
export type WebNavKey = typeof webNavKeys[number]
export const lockedWebNavKeys: readonly WebNavKey[] = ['Dashboard', 'Buchungen', 'Einreichungen', 'Einstellungen']
