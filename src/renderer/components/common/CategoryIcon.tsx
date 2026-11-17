
import { IconTag } from '@tabler/icons-react'
import { CATEGORY_ICONS, categoryIconKey } from '../../utils/categoryIcons'

export default function CategoryIcon({ value, size = 15 }: { value?: string | null; size?: number }) {
  if (!value) return null
  const Icon = CATEGORY_ICONS.find(item => item.key === categoryIconKey(value))?.icon || IconTag
  return <Icon size={size} stroke={1.7} aria-hidden="true" style={{ flexShrink: 0, verticalAlign: '-0.16em', marginInlineEnd: 4 }} />
}
