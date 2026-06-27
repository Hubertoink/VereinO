import { getContrastTextColor, resolveTagDisplayColor } from '../renderer/utils/tagColors'

describe('tag color helpers', () => {
  it('uses a deterministic color for tags without stored color definitions', () => {
    const color = resolveTagDisplayColor('Team', [])
    expect(color).toBeDefined()
    expect(color).toMatch(/^hsl\(/)
  })

  it('returns readable text colors for light and dark backgrounds', () => {
    expect(getContrastTextColor('#ffffff')).toBe('#000')
    expect(getContrastTextColor('#111111')).toBe('#fff')
  })
})
