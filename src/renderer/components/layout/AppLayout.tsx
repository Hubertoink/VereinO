import React from 'react'

interface AppLayoutProps {
  navLayout: 'top' | 'left'
  sidebarCollapsed: boolean
  onToggleSidebar?: () => void
  headerLeft?: React.ReactNode
  headerCenter?: React.ReactNode
  headerRight?: React.ReactNode
  renderTopNav?: () => React.ReactNode
  renderSideNav?: () => React.ReactNode
  children: React.ReactNode
}

export function AppLayout({
  navLayout,
  sidebarCollapsed,
  headerLeft,
  headerCenter,
  headerRight,
  renderTopNav,
  renderSideNav,
  children
}: AppLayoutProps) {
  const isTopNav = navLayout === 'top'

  return (
    <div className="app-root-grid" data-nav-layout={navLayout} data-sidebar-collapsed={sidebarCollapsed}>
      <header className="app-header">
        {headerLeft}
        {isTopNav && headerCenter}
        {headerRight}
      </header>
      
      {!isTopNav && renderSideNav && (
        <aside className="app-sidebar">
          {renderSideNav()}
        </aside>
      )}
      
      <main className="app-main">
        {children}
      </main>
    </div>
  )
}
