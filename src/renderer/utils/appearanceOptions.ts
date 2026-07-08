import type { BackgroundImage } from '../context/UIPreferencesContextCore'
import type { ColorTheme } from '../context/uiTheme'
import type { DateFmt } from '../views/Settings/types'

export const COLOR_THEME_OPTIONS: Array<{ id: ColorTheme; name: string; mode: 'auto' | 'dark' | 'light' }> = [
  { id: 'default', name: 'Standard', mode: 'auto' },
  { id: 'fiery-ocean', name: 'Fiery Ocean', mode: 'dark' },
  { id: 'peachy-delight', name: 'Peachy Delight', mode: 'dark' },
  { id: 'pastel-dreamland', name: 'Pastel Dreamland', mode: 'dark' },
  { id: 'ocean-breeze', name: 'Ocean Breeze', mode: 'dark' },
  { id: 'earthy-tones', name: 'Earthy Tones', mode: 'dark' },
  { id: 'monochrome-harmony', name: 'Monochrome', mode: 'dark' },
  { id: 'vintage-charm', name: 'Vintage Charm', mode: 'dark' },
  { id: 'soft-blush', name: 'Soft Blush', mode: 'light' },
  { id: 'professional-light', name: 'Professional', mode: 'light' },
]

export const BACKGROUND_IMAGE_OPTIONS: Array<{ id: BackgroundImage; name: string; compactName: string; icon?: string }> = [
  { id: 'none', name: 'Keins', compactName: 'Keins' },
  { id: 'cherry-blossom', name: 'Kirschblüten', compactName: 'Kirschblüten', icon: 'CB' },
  { id: 'foggy-forest', name: 'Nebliger Wald', compactName: 'Nebelwald', icon: 'NF' },
  { id: 'mountain-snow', name: 'Schneeberge', compactName: 'Bergschnee', icon: 'SB' },
  { id: 'niko-bg', name: 'Niko BG', compactName: 'Niko BG', icon: 'NB' },
  { id: 'custom', name: 'Eigenes', compactName: 'Eigenes...', icon: '+' },
]

export const DATE_FORMAT_OPTIONS: Array<{ id: DateFmt; label: string }> = [
  { id: 'ISO', label: '2025-01-15' },
  { id: 'PRETTY', label: '15. Jan 2025' },
  { id: 'DOT', label: '15.01.2025' },
]
