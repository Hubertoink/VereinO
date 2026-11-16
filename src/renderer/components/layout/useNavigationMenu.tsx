import React, { useEffect, useState } from 'react'
import CompactPopover from '../CompactPopover'
import type { NavItem, NavKey } from '../../utils/navItems'
import { getNavIcon } from '../../utils/navIcons'

export interface NavigationMenuProps {
  availableItems?: NavItem[]
  visibleNavItems?: NavKey[]
  requiredNavItems?: ReadonlySet<NavKey>
  onVisibleNavItemsChange?: (items: NavKey[]) => void
}

export function useNavigationMenu({ availableItems = [], visibleNavItems = [], requiredNavItems, onVisibleNavItemsChange, navIconColorMode }: NavigationMenuProps & { navIconColorMode: 'color' | 'mono' }) {
  const [anchor, setAnchor] = useState<{ x: number; y: number; trigger: HTMLElement } | null>(null)
  useEffect(() => window.api?.organizations?.onSwitched?.(() => setAnchor(null)), [])
  const onContextMenu = (event: React.MouseEvent<HTMLElement>) => {
    if (!onVisibleNavItemsChange) return
    event.preventDefault()
    event.stopPropagation()
    const trigger = (event.target as HTMLElement).closest<HTMLElement>('button') || event.currentTarget
    const rect = trigger.getBoundingClientRect()
    setAnchor({ x: event.clientX || rect.left, y: event.clientY || rect.bottom, trigger })
  }
  const menu = anchor && <CompactPopover label="Module anzeigen" anchor={anchor} onClose={() => setAnchor(null)}>
    {availableItems.map((item, index) => {
      const locked = requiredNavItems?.has(item.key) ?? false
      return <label key={item.key} className={`navigation-module${locked ? ' navigation-module--locked' : ''}${index > 0 && item.group !== availableItems[index - 1].group ? ' navigation-module--divider' : ''}`} title={locked ? 'Dieser Bereich bleibt immer sichtbar' : undefined}>
        <span className={`icon-wrapper ${navIconColorMode === 'color' ? `icon-color-${item.key}` : ''}`}>{getNavIcon(item.key)}</span>
        <span>{item.label}</span>
        <input type="checkbox" aria-label={`${item.label} in Navigation anzeigen`} checked={locked || visibleNavItems.includes(item.key)} disabled={locked}
          onChange={event => onVisibleNavItemsChange?.(event.target.checked ? [...visibleNavItems, item.key] : visibleNavItems.filter(key => key !== item.key))} />
      </label>
    })}
    <p className="compact-popover__hint">Gilt für beide Menüs dieser Organisation.</p>
  </CompactPopover>
  return { onContextMenu, menu }
}
