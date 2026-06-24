import { shouldPromptDiscardForDraftClose } from '../renderer/utils/quickAddCloseBehavior'

describe('shouldPromptDiscardForDraftClose', () => {
  it('does not prompt when booking draft tabs are enabled', () => {
    expect(shouldPromptDiscardForDraftClose({ showBookingDraftTabs: true, hasUnsavedChanges: true })).toBe(false)
  })

  it('prompts when draft tabs are disabled and changes exist', () => {
    expect(shouldPromptDiscardForDraftClose({ showBookingDraftTabs: false, hasUnsavedChanges: true })).toBe(true)
  })

  it('does not prompt when there are no changes', () => {
    expect(shouldPromptDiscardForDraftClose({ showBookingDraftTabs: false, hasUnsavedChanges: false })).toBe(false)
  })
})
