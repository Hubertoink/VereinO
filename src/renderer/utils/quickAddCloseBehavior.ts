export function shouldPromptDiscardForDraftClose({
  showBookingDraftTabs,
  hasUnsavedChanges
}: {
  showBookingDraftTabs: boolean
  hasUnsavedChanges: boolean
}): boolean {
  if (showBookingDraftTabs) return false
  return hasUnsavedChanges
}
