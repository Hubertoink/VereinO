import React from 'react'
import { navItems } from '../../utils/navItems'
import { getNavIcon } from '../../utils/navIcons'
import type { NavItem, NavKey } from '../../utils/navItems'
import { IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand } from '@tabler/icons-react'
import { SidebarAccounts } from './SidebarAccounts'
import { SidebarRecentAssignments, type SidebarAssignmentKind } from './SidebarRecentAssignments'
import { SidebarBankImports } from './SidebarBankImports'

export interface SideNavProps {
  activePage: NavKey
  onNavigate: (page: NavKey) => void
  navIconColorMode: 'color' | 'mono'
  collapsed: boolean
  onToggleCollapse?: () => void
  openBankImportsCount?: number
  openInvoicesCount?: number
  dueMembershipFeesCount?: number
  dueRecurringBookingsCount?: number
  showBadges?: boolean
  items?: NavItem[]
  aiBusy?: boolean
  selectedAccountId?: number | null
  onSelectAccount?: (id: number) => void
  onSelectAssignment?: (kind: SidebarAssignmentKind, id: number) => void
  onSelectBankAccount?: (id: number) => void
  appVersion?: string
  onOpenChangelog?: () => void
}

export function SideNav({ activePage, onNavigate, navIconColorMode, collapsed, onToggleCollapse, openBankImportsCount = 0, openInvoicesCount = 0, dueMembershipFeesCount = 0, dueRecurringBookingsCount = 0, showBadges = true, items = navItems, aiBusy = false, selectedAccountId, onSelectAccount, onSelectAssignment, onSelectBankAccount, appVersion, onOpenChangelog }: SideNavProps) {
  const mainItems = items.filter(item => item.group !== 'system')
  const renderItem = (item: NavItem) => {
    const isActive = activePage === item.key
    const isAiRunning = aiBusy && item.key === 'KI'
    const badgeCount = item.key === 'Bankimport' ? openBankImportsCount : item.key === 'Verbindlichkeiten' ? openInvoicesCount : item.key === 'Mitglieder' ? dueMembershipFeesCount : item.key === 'Dauerbuchungen' ? dueRecurringBookingsCount : 0
    return <React.Fragment key={item.key}>
      <button type="button" className={`btn ghost nav-btn side-nav-btn ${collapsed ? 'has-tooltip tooltip-right' : ''} ${isActive ? 'active' : ''} ${isAiRunning ? 'ai-nav-running' : ''}`} data-shortcut-nav={item.key} onClick={() => onNavigate(item.key)} aria-current={isActive ? 'page' : undefined} aria-label={`${item.label}${isAiRunning ? ': Anfrage läuft' : ''}${showBadges && badgeCount > 0 ? `, ${badgeCount} offen` : ''}`} data-tooltip={item.label} title={collapsed ? item.label : undefined}>
        <span className={`icon-wrapper ${navIconColorMode === 'color' ? `icon-color-${item.key}` : ''}`}>{getNavIcon(item.key)}</span>
        {!collapsed && <span className="nav-label">{item.label}</span>}
        {showBadges && badgeCount > 0 && <span className="nav-badge" aria-hidden="true">{badgeCount > 99 ? '99+' : badgeCount}</span>}
      </button>
      {!collapsed && item.key === 'Buchungen' && onSelectAccount && <SidebarAccounts selectedId={activePage === 'Buchungen' ? selectedAccountId : null} onSelect={onSelectAccount} />}
      {!collapsed && item.key === 'Bankimport' && onSelectBankAccount && <SidebarBankImports onSelect={onSelectBankAccount} />}
      {!collapsed && onSelectAssignment && (item.key === 'Budgets' || item.key === 'Zweckbindungen') && <SidebarRecentAssignments kind={item.key === 'Budgets' ? 'budget' : 'earmark'} onSelect={onSelectAssignment} />}
    </React.Fragment>
  }
  return (
    <nav aria-label="Seitenleiste" className={`side-nav ${collapsed ? 'side-nav--collapsed' : 'side-nav--expanded'}`}>
      <button type="button" className="btn ghost sidebar-toggle" onClick={onToggleCollapse} aria-label={collapsed ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen'} aria-expanded={!collapsed} title={collapsed ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen'}>
        {collapsed ? <IconLayoutSidebarLeftExpand size={20} /> : <><span>Navigation</span><IconLayoutSidebarLeftCollapse size={20} /></>}
      </button>
      <div className="sidebar-nav-scroll">
        {mainItems.map((item, index) => <React.Fragment key={item.key}>
          {index > 0 && item.group !== mainItems[index - 1].group && <div className="nav-divider" aria-hidden="true" />}
          {renderItem(item)}
        </React.Fragment>)}
      </div>
      <div className="sidebar-nav-footer">
        {items.filter(item => item.group === 'system').map(renderItem)}
        {appVersion && onOpenChangelog && <button type="button" className="sidebar-version" onClick={onOpenChangelog} title={`Version ${appVersion} · Changelog anzeigen`} aria-label={`Version ${appVersion}, Changelog anzeigen`}>{collapsed ? `v${appVersion}` : `VereinO · v${appVersion}`}</button>}
      </div>
    </nav>
  )
}
