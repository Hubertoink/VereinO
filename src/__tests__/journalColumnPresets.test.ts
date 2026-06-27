import {
  getDetailsJournalColumnPreset,
  getMinimalJournalColumnPreset,
  getStandardJournalColumnPreset
} from '../renderer/views/Journal/utils/journalColumnPresets'

describe('journal column presets', () => {
  it('removes actions from all presets when deletion actions are not allowed', () => {
    for (const preset of [
      getStandardJournalColumnPreset(false),
      getMinimalJournalColumnPreset(false),
      getDetailsJournalColumnPreset(false)
    ]) {
      expect(preset.cols.actions).toBe(false)
      expect(preset.order).not.toContain('actions')
    }
  })

  it('keeps actions available when deletion actions are allowed', () => {
    expect(getStandardJournalColumnPreset(true).cols.actions).toBe(true)
    expect(getMinimalJournalColumnPreset(true).order[0]).toBe('actions')
    expect(getDetailsJournalColumnPreset(true).order[0]).toBe('actions')
  })
})
