import { shouldPromptDiscardForEdit } from '../renderer/views/Journal/utils/journalEditDiscardPrompt'

describe('shouldPromptDiscardForEdit', () => {
  it('does not prompt when booking edit tabs are enabled and deletion is allowed', () => {
    expect(shouldPromptDiscardForEdit({ showBookingEditTabs: true, hasUnsavedChanges: true })).toBe(false)
  })

  it('does not prompt when edit tabs are active but deletion is disabled', () => {
    expect(shouldPromptDiscardForEdit({ showBookingEditTabs: true, hasUnsavedChanges: true })).toBe(false)
  })

  it('prompts when edits are unsaved and tabs are disabled', () => {
    expect(shouldPromptDiscardForEdit({ showBookingEditTabs: false, hasUnsavedChanges: true })).toBe(true)
  })

  it('does not prompt when there are no unsaved changes', () => {
    expect(shouldPromptDiscardForEdit({ showBookingEditTabs: false, hasUnsavedChanges: false })).toBe(false)
  })
})
