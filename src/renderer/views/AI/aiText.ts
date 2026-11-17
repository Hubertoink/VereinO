/**
 * Framework-unabhängige Text- und Darstellungshelfer der KI-Ansicht.
 *
 * Diese Funktionen dürfen weder React- noch IPC-Zustand kennen. Dadurch können
 * Erkennung, Formatierung und Routing separat getestet werden.
 */
export { normalizeLookup } from '../../../../shared/textLookup'

export function parseGermanDate(value: string) {
  const match = String(value || '').match(/\b(\d{1,2})\.(\d{1,2})\.(20\d{2}|19\d{2})\b/)
  if (!match) return null
  const day = match[1].padStart(2, '0')
  const month = match[2].padStart(2, '0')
  return `${match[3]}-${month}-${day}`
}

export function formatIsoDate(value?: string | null) {
  if (!value) return '-'
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value
}

export function isoDate(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function statusLabel(status: string) {
  if (status === 'DRAFT') return 'Entwurf'
  if (status === 'QUEUED') return 'Wartet'
  if (status === 'PROCESSING') return 'In Arbeit'
  if (status === 'NEEDS_REVIEW') return 'Review'
  if (status === 'APPROVED') return 'Gebucht'
  if (status === 'REJECTED') return 'Abgelehnt'
  if (status === 'FAILED') return 'Fehler'
  return status
}

export function typeLabel(type: string) {
  if (type === 'BOOKING_FROM_DOCUMENTS') return 'Beleganalyse'
  if (type === 'MEMBER_TEXT') return 'Mitgliedertext'
  if (type === 'REPORT_TEXT') return 'Berichtstext'
  return type
}

export function warningClassName(warning: string) {
  const duplicate = /(doppelt|duplikat|bereits.*buchung|bereits.*vorhanden|double|duplicate)/i.test(
    String(warning || '')
  )
  return duplicate ? 'ai-warning ai-warning--duplicate' : 'ai-warning'
}

export function wantsBookingFromFiles(prompt: string, attachedFiles: File[]) {
  const normalized = prompt.toLowerCase()
  const hasSpreadsheet = attachedFiles.some((file) => /\.(xlsx|xls|csv|tsv)$/i.test(file.name))
  if (
    /(buchung|buchungen|buchungsvorschlag|buchungsvorschläge|buche|buchen|verbuch|anlegen|lege.*buch|erstelle.*buch|rechnung|beleg|quittung|zahlung|ausgabe|ausgaben|einnahme|einnahmen|kassenzettel)/i.test(
      normalized
    )
  )
    return true
  if (
    hasSpreadsheet &&
    /(import|stammdaten|tag|tags|kategorie|kategorien|mitglied|mitglieder|tabelle|spalten|zuordnung)/i.test(
      normalized
    )
  )
    return false
  return !hasSpreadsheet
}

export function wantsBankImportReview(prompt: string) {
  return /(bankimport|bankbeleg|kontoauszug|offene bank|bank import|banktransaktion)/i.test(prompt)
}
