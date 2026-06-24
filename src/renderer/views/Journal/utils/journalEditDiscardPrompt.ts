export function shouldPromptDiscardForEdit({
  showBookingEditTabs,
  hasUnsavedChanges
}: {
  showBookingEditTabs: boolean
  hasUnsavedChanges: boolean
}): boolean {
  if (showBookingEditTabs) return false
  return hasUnsavedChanges
}
