import { IconTag, IconFolder, IconReceipt, IconShoppingCart, IconCar, IconBuilding, IconBulb, IconSpeakerphone, IconTarget, IconTool, IconCoffee } from '@tabler/icons-react'

// Tabler Icons (MIT). Compact stable keys fit the existing eight-character DB field.
export const CATEGORY_ICONS = [
  { key: 'tag', label: 'Schlagwort', icon: IconTag, legacy: '🏷️' },
  { key: 'folder', label: 'Ordner', icon: IconFolder, legacy: '📁' },
  { key: 'receipt', label: 'Beleg', icon: IconReceipt, legacy: '🧾' },
  { key: 'cart', label: 'Einkauf', icon: IconShoppingCart, legacy: '🛒' },
  { key: 'car', label: 'Fahrt', icon: IconCar, legacy: '🚗' },
  { key: 'building', label: 'Gebäude', icon: IconBuilding, legacy: '🏗️' },
  { key: 'bulb', label: 'Energie', icon: IconBulb, legacy: '💡' },
  { key: 'speaker', label: 'Öffentlichkeitsarbeit', icon: IconSpeakerphone, legacy: '📣' },
  { key: 'target', label: 'Projektziel', icon: IconTarget, legacy: '🎯' },
  { key: 'toolbox', label: 'Werkzeug', icon: IconTool, legacy: '🧰' },
  { key: 'coffee', label: 'Verpflegung', icon: IconCoffee, legacy: '☕' },
] as const

export function categoryIconKey(value?: string | null) {
  return CATEGORY_ICONS.find(item => item.key === value || item.legacy === value)?.key || null
}
