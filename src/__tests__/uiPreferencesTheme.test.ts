import { isValidTheme } from '../renderer/context/uiTheme'

describe('ui preferences theme validation', () => {
  it('accepts the newer light themes used by the settings UI', () => {
    expect(isValidTheme('soft-blush')).toBe(true)
    expect(isValidTheme('professional-light')).toBe(true)
  })

  it('still rejects unknown theme ids', () => {
    expect(isValidTheme('not-a-theme')).toBe(false)
  })
})
