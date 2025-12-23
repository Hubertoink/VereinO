import React from 'react'
import { navItems } from '../../utils/navItems'
import { getNavIcon } from '../../utils/navIcons'
import type { NavKey } from '../../utils/navItems'

interface TopNavProps {
  activePage: NavKey
  onNavigate: (page: NavKey) => void
  navIconColorMode: 'color' | 'mono'
  pendingSubmissionsCount?: number
  openInvoicesCount?: number
  showBadges?: boolean
}

export function TopNav({ activePage, onNavigate, navIconColorMode, pendingSubmissionsCount = 0, openInvoicesCount = 0, showBadges = true }: TopNavProps) {
  return (
    <nav aria-label="Hauptmenü (oben)" className="top-nav">
      {navItems.map((item, idx) => {
        const isActive = activePage === item.key
        const colorClass = navIconColorMode === 'color' ? `icon-color-${item.key}` : ''
        const showDividerBefore = idx > 0 && item.group !== navItems[idx - 1]?.group
        
        // Determine badge count based on nav item
        let badgeCount = 0
        if (item.key === 'Einreichungen') badgeCount = pendingSubmissionsCount
        if (item.key === 'Verbindlichkeiten') badgeCount = openInvoicesCount
        
        const showBadge = showBadges && badgeCount > 0
        const badgeText = badgeCount > 99 ? '99+' : String(badgeCount)
        
        return (
          <React.Fragment key={item.key}>
            {showDividerBefore && (
              <span className="divider-v" aria-hidden="true" />
            )}
            <button
              className={`btn ghost nav-btn has-tooltip ${isActive ? 'active' : ''}`}
              onClick={() => onNavigate(item.key)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={item.label}
              data-tooltip={item.label}
            >
              <span className={colorClass}>
                {getNavIcon(item.key)}
              </span>
              {showBadge && (
                <span className="nav-badge" aria-label={`${badgeCount} offen`}>{badgeText}</span>
              )}
            </button>
          </React.Fragment>
        )
      })}
    </nav>
  )
}
