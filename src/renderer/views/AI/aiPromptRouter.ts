import { wantsBankImportReview, wantsBookingFromFiles } from './aiText'

/**
 * Erstes, bewusst kleines Routing-Gateway für neue Nachrichten. Fachliche
 * Follow-ups (z. B. ein offener Mitgliederdialog) werden weiterhin vor diesem
 * Gateway behandelt, damit sie Vorrang vor einer allgemeinen Anfrage haben.
 */
export type AiDefaultPromptRoute = 'DOCUMENT_ANALYSIS' | 'FILE_TEXT_TASK' | 'BANK_IMPORT' | 'TEXT'

export function routeDefaultAiPrompt(prompt: string, attachedFiles: File[]): AiDefaultPromptRoute {
  if (attachedFiles.length) {
    return wantsBookingFromFiles(prompt, attachedFiles) ? 'DOCUMENT_ANALYSIS' : 'FILE_TEXT_TASK'
  }
  return wantsBankImportReview(prompt) ? 'BANK_IMPORT' : 'TEXT'
}
