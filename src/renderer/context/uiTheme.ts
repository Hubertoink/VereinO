export type ColorTheme =
  | 'default'
  | 'fiery-ocean'
  | 'peachy-delight'
  | 'pastel-dreamland'
  | 'ocean-breeze'
  | 'earthy-tones'
  | 'monochrome-harmony'
  | 'vintage-charm'
  | 'soft-blush'
  | 'professional-light'

const VALID_THEMES: ColorTheme[] = ['default', 'fiery-ocean', 'peachy-delight', 'pastel-dreamland', 'ocean-breeze', 'earthy-tones', 'monochrome-harmony', 'vintage-charm', 'soft-blush', 'professional-light']

export function isValidTheme(theme: string | null | undefined): theme is ColorTheme {
  return !!theme && VALID_THEMES.includes(theme as ColorTheme)
}
