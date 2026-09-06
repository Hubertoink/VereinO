/**
 * Erstes, bewusst kleines Routing-Gateway für neue Nachrichten. Fachliche
 * Follow-ups (z. B. ein offener Mitgliederdialog) werden weiterhin vor diesem
 * Gateway behandelt, damit sie Vorrang vor einer allgemeinen Anfrage haben.
 */
export type AiDefaultPromptRoute = 'DOCUMENT_ANALYSIS' | 'FILE_TEXT_TASK' | 'BANK_IMPORT' | 'TEXT'

function wantsBookingFromFiles(prompt: string, attachedFiles: File[]) {
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

function wantsBankImportReview(prompt: string) {
  return /(bankimport|bankbeleg|kontoauszug|offene bank|bank import|banktransaktion)/i.test(prompt)
}

export function routeDefaultAiPrompt(prompt: string, attachedFiles: File[]): AiDefaultPromptRoute {
  if (attachedFiles.length) {
    return wantsBookingFromFiles(prompt, attachedFiles) ? 'DOCUMENT_ANALYSIS' : 'FILE_TEXT_TASK'
  }
  return wantsBankImportReview(prompt) ? 'BANK_IMPORT' : 'TEXT'
}
