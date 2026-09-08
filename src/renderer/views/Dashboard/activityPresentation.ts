export const bookingKindLabel = (value: unknown) => ({ IN: 'Einnahme', OUT: 'Ausgabe', TRANSFER: 'Umbuchung', INTERNAL: 'Interne Buchung' }[String(value)] || 'Buchung')
export const paymentKindLabel = (value: unknown) => ({ BAR: 'Bar', BANK: 'Bank' }[String(value)] || '')
export const sphereLabel = (value: unknown) => ({ IDEELL: 'Ideell', ZWECK: 'Zweckbetrieb', VERMOEGEN: 'Vermögen', WGB: 'Wirtschaftlich' }[String(value)] || '—')
export function activityAction(action: unknown) {
  const key = String(action || '').toUpperCase()
  const labels: Record<string, string> = { CREATE: 'Erstellt', UPDATE: 'Geändert', UPDATE_META: 'Zuordnung geändert', DELETE: 'Gelöscht', REVERSE: 'Storniert', BOOK: 'Gebucht', SKIP: 'Übersprungen', EXECUTE: 'Ausgeführt', LINK: 'Verknüpft', UNLINK: 'Verknüpfung gelöst', CHECK: 'Geprüft', REOPEN: 'Wieder geöffnet', CLEAR_ALL: 'Gelöscht', ARCHIVE: 'Archiviert', RESTORE: 'Wiederhergestellt', IMPORT: 'Importiert', APPROVE: 'Freigegeben', REJECT: 'Abgelehnt', MARK_PAID: 'Bezahlt', PAY: 'Bezahlt' }
  return labels[key] || (key.startsWith('BATCH_ASSIGN') ? 'Sammelzuordnung' : 'Aktualisiert')
}
export function activityFallback(entity: unknown, action: unknown, id: unknown): string {
  const key = String(entity || '').toUpperCase()
  const names: Record<string, string> = { RECURRING_OCCURRENCES: 'Dauerbuchung', RECURRING_BOOKINGS: 'Dauerbuchungsvorlage', MEMBERS: 'Mitglied', MEMBER: 'Mitglied', BUDGETS: 'Budget', EARMARKS: 'Zweckbindung', BINDINGS: 'Zweckbindung', INVOICES: 'Rechnung', PARTIES: 'Geschäftspartner', TAGS: 'Tag', PAYMENT_ACCOUNTS: 'Zahlweg', SUBMISSIONS: 'Einreichung', SETTINGS: 'Einstellung', IMPORTS: 'Import', BANK_IMPORTS: 'Bankimport', VOUCHERS: 'Buchung' }
  return `${names[key] || 'Datensatz'}${id ? ` #${id}` : ''} ${activityAction(action).toLocaleLowerCase('de-DE')}`
}
