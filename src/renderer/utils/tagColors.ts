type TagDefinitionLike = { name?: string | null; color?: string | null }

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function getContrastTextColor(bg?: string | null): string {
  if (!bg) return '#000'
  const normalized = bg.trim()

  const hexMatch = /^#?([0-9a-fA-F]{6})$/.exec(normalized)
  if (hexMatch) {
    const hex = hexMatch[1]
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luminance > 0.6 ? '#000' : '#fff'
  }

  const hslMatch = /^hsla?\(\s*(\d{1,3})\s+(\d{1,3})%\s+(\d{1,3})%/.exec(normalized)
  if (hslMatch) {
    const [, h, s, l] = hslMatch
    const hue = Number(h) / 360
    const sat = Number(s) / 100
    const light = Number(l) / 100
    const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat
    const p = 2 * light - q
    const toRgb = (t: number) => {
      let value = t
      if (value < 0) value += 1
      if (value > 1) value -= 1
      if (value < 1 / 6) return p + (q - p) * 6 * value
      if (value < 1 / 2) return q
      if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6
      return p
    }
    const r = Math.round(toRgb(hue + 1 / 3) * 255)
    const g = Math.round(toRgb(hue) * 255)
    const b = Math.round(toRgb(hue - 1 / 3) * 255)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luminance > 0.6 ? '#000' : '#fff'
  }

  return '#000'
}

export function resolveTagDisplayColor(name: string, tagDefs?: TagDefinitionLike[] | null): string | null {
  const normalizedName = (name || '').trim().toLowerCase()
  const match = (tagDefs || []).find((tagDef) => (tagDef.name || '').trim().toLowerCase() === normalizedName)
  if (match?.color) return match.color
  if (!normalizedName) return null

  const hash = hashString(normalizedName)
  const hue = hash % 360
  const saturation = 70 + (hash % 12)
  const lightness = 46 + (hash % 12)
  return `hsl(${hue} ${saturation}% ${lightness}%)`
}
