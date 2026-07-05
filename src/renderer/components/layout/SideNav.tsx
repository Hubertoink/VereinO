import React from 'react'
import { navItems } from '../../utils/navItems'
import { getNavIcon } from '../../utils/navIcons'
import type { NavItem, NavKey } from '../../utils/navItems'

interface SideNavProps {
  activePage: NavKey
  onNavigate: (page: NavKey) => void
  navIconColorMode: 'color' | 'mono'
  collapsed: boolean
  onToggleCollapse?: () => void
  pendingSubmissionsCount?: number
  openBankImportsCount?: number
  openInvoicesCount?: number
  dueMembershipFeesCount?: number
  showBadges?: boolean
  items?: NavItem[]
  aiBusy?: boolean
}

export function SideNav({ activePage, onNavigate, navIconColorMode, collapsed, pendingSubmissionsCount = 0, openBankImportsCount = 0, openInvoicesCount = 0, dueMembershipFeesCount = 0, showBadges = true, items = navItems, aiBusy = false }: SideNavProps) {
  return (
    <nav aria-label="Seitenleiste" className="side-nav">
      {items.map((item, idx) => {
        const isActive = activePage === item.key
        const isAiRunning = aiBusy && item.key === 'KI'
        const colorClass = navIconColorMode === 'color' ? `icon-color-${item.key}` : ''
        
        // Determine badge count based on nav item
        let badgeCount = 0
        if (item.key === 'Einreichungen') badgeCount = pendingSubmissionsCount
        if (item.key === 'Bankimport') badgeCount = openBankImportsCount
        if (item.key === 'Verbindlichkeiten') badgeCount = openInvoicesCount
        if (item.key === 'Mitglieder') badgeCount = dueMembershipFeesCount
        
        const showBadge = showBadges && badgeCount > 0
        const badgeText = badgeCount > 99 ? '99+' : String(badgeCount)
        
        return (
          <React.Fragment key={item.key}>
            {idx > 0 && item.group !== items[idx - 1]?.group && (
              <div className="nav-divider" aria-hidden="true" />
            )}
            <button
              className={`btn ghost nav-btn has-tooltip tooltip-right ${isActive ? 'active' : ''} ${isAiRunning ? 'ai-nav-running' : ''}`}
              onClick={() => onNavigate(item.key)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={isAiRunning ? `${item.label}: Anfrage läuft` : item.label}
              data-tooltip={item.label}
            >
              <span className={`icon-wrapper ${colorClass}`}>
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
