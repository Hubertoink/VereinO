import React from 'react'
import { navItems } from '../../utils/navItems'
import { getNavIcon } from '../../utils/navIcons'
import type { NavKey } from '../../utils/navItems'

interface SideNavProps {
  activePage: NavKey
  onNavigate: (page: NavKey) => void
  navIconColorMode: 'color' | 'mono'
  collapsed: boolean
  onToggleCollapse?: () => void
}

export function SideNav({ activePage, onNavigate, navIconColorMode, collapsed }: SideNavProps) {
  return (
    <nav aria-label="Seitenleiste" className="side-nav">
      {navItems.map((item, idx) => {
        const isActive = activePage === item.key
        const colorClass = navIconColorMode === 'color' ? `icon-color-${item.key}` : ''
        
        return (
          <React.Fragment key={item.key}>
            {idx > 0 && item.group !== navItems[idx - 1]?.group && (
              <div className="nav-divider" aria-hidden="true" />
            )}
            <button
              className={`btn ghost ${isActive ? 'active' : ''}`}
              onClick={() => onNavigate(item.key)}
              aria-current={isActive ? 'page' : undefined}
              title={item.label}
              aria-label={item.label}
              style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, background: isActive ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }}
            >
              <span className={`icon-wrapper ${colorClass}`}>
                {getNavIcon(item.key)}
              </span>
              {!collapsed && <span className="nav-label">{item.label}</span>}
            </button>
          </React.Fragment>
        )
      })}
    </nav>
  )
}
