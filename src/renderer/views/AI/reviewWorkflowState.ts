export type ReviewWorkflowState = { status?: string | null } | null | undefined

export type ReviewWorkflowEntry = {
  id: string
  state: ReviewWorkflowState
  terminalStatuses: readonly string[]
}

/**
 * Zentraler Lebenszyklus für Reviews. Einzelne Fach-Workflows behalten ihre
 * fachlichen Payloads, aber die Frage „ist noch etwas offen?“ wird nicht mehr
 * an mehreren Stellen unterschiedlich beantwortet.
 */
export function isReviewWorkflowOpen(entry: ReviewWorkflowEntry) {
  return !!entry.state && !entry.terminalStatuses.includes(String(entry.state.status || ''))
}

export function openReviewWorkflowIds(entries: readonly ReviewWorkflowEntry[]) {
  return entries.filter(isReviewWorkflowOpen).map((entry) => entry.id)
}
