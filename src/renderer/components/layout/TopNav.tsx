import React from 'react'
import { navItems } from '../../utils/navItems'
import { getNavIcon } from '../../utils/navIcons'
import type { NavKey } from '../../utils/navItems'

interface TopNavProps {
  activePage: NavKey
  onNavigate: (page: NavKey) => void
  navIconColorMode: 'color' | 'mono'
}

export function TopNav({ activePage, onNavigate, navIconColorMode }: TopNavProps) {
  return (
    <nav aria-label="Hauptmenü (oben)" className="top-nav">
      {navItems.map((item, idx) => {
        const isActive = activePage === item.key
        const colorClass = navIconColorMode === 'color' ? `icon-color-${item.key}` : ''
        const showDividerBefore = idx > 0 && item.group !== navItems[idx - 1]?.group
        const showDividerAfter = item.showDividerAfter
        
        return (
          <React.Fragment key={item.key}>
            {showDividerBefore && (
              <span className="divider-v" aria-hidden="true" />
            )}
            <button
              className={`btn ghost nav-btn ${isActive ? 'active' : ''}`}
              onClick={() => onNavigate(item.key)}
              aria-current={isActive ? 'page' : undefined}
              title={item.label}
              aria-label={item.label}
            >
              <span className={colorClass}>
                {getNavIcon(item.key)}
              </span>
            </button>
            {showDividerAfter && (
              <span className="divider-v" aria-hidden="true" />
            )}
          </React.Fragment>
        )
      })}
    </nav>
  )
}
