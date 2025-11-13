import React, { useState, useEffect } from 'react'
import { SettingsProps, TileKey } from './types'
import { SettingsNav } from './SettingsNav'
import { GeneralPane } from './panes/GeneralPane'
import { TablePane } from './panes/TablePane'
import { StoragePane } from './panes/StoragePane'
import { ImportPane } from './panes/ImportPane'
import { OrgPane } from './panes/OrgPane'
import { TagsPane } from './panes/TagsPane'
import { YearEndPane } from './panes/YearEndPane'

/**
 * SettingsView - Main Settings Container
 * 
 * Refactored from App.tsx to improve maintainability
 * Uses tile-based navigation to switch between settings categories
 * Persists last visited pane in sessionStorage
 */
export function SettingsView(props: SettingsProps) {
  const [activeTile, setActiveTile] = useState<TileKey>(() => {
    try {
      const saved = sessionStorage.getItem('settingsActiveTile')
      return (saved as TileKey) || 'general'
    } catch {
      return 'general'
    }
  })

  const [appVersion, setAppVersion] = useState<string>('')

  useEffect(() => {
    try {
      sessionStorage.setItem('settingsActiveTile', activeTile)
    } catch {
      // ignore
    }
  }, [activeTile])

  useEffect(() => {
    ;(window.api as any).app.version()
      .then((res: any) => setAppVersion(res?.version || ''))
      .catch(() => setAppVersion(''))
  }, [])

  return (
    <div className="settings-container">
      <h1>Einstellungen</h1>
      
      <SettingsNav active={activeTile} onSelect={setActiveTile} />
      
      <div className="settings-content">
        {activeTile === 'general' && (
          <GeneralPane
            navLayout={props.navLayout}
            setNavLayout={props.setNavLayout}
            sidebarCollapsed={props.sidebarCollapsed}
            setSidebarCollapsed={props.setSidebarCollapsed}
            navIconColorMode={props.navIconColorMode}
            setNavIconColorMode={props.setNavIconColorMode}
            colorTheme={props.colorTheme}
            setColorTheme={props.setColorTheme}
            journalRowStyle={props.journalRowStyle}
            setJournalRowStyle={props.setJournalRowStyle}
            journalRowDensity={props.journalRowDensity}
            setJournalRowDensity={props.setJournalRowDensity}
            dateFmt={props.dateFmt}
            setDateFmt={props.setDateFmt}
            journalLimit={props.journalLimit}
            setJournalLimit={props.setJournalLimit}
            notify={props.notify}
            bumpDataVersion={props.bumpDataVersion}
            openSetupWizard={props.openSetupWizard}
          />
        )}
        
        {activeTile === 'table' && (
          <TablePane
            cols={props.cols}
            setCols={props.setCols}
            order={props.order}
            setOrder={props.setOrder}
            defaultCols={props.defaultCols}
            defaultOrder={props.defaultOrder}
            journalLimit={props.journalLimit}
            setJournalLimit={props.setJournalLimit}
            labelForCol={props.labelForCol}
          />
        )}
        
        {activeTile === 'storage' && (
          <StoragePane
            notify={props.notify}
            bumpDataVersion={props.bumpDataVersion}
          />
        )}
        
  {activeTile === 'import' && <ImportPane notify={props.notify} />}

  {activeTile === 'org' && <OrgPane notify={props.notify} />}
        
        {activeTile === 'tags' && (
          <TagsPane
            tagDefs={props.tagDefs}
            setTagDefs={props.setTagDefs}
            notify={props.notify}
            bumpDataVersion={props.bumpDataVersion}
            openTagsManager={props.openTagsManager}
          />
        )}
        
        {activeTile === 'yearEnd' && (
          <YearEndPane
            notify={props.notify}
            bumpDataVersion={props.bumpDataVersion}
          />
        )}
      </div>

      {/* Developer Badge - Cookie-Banner style with hover expand */}
      <div
        className="dev-badge-tab"
        style={{
          position: 'fixed',
          bottom: 16,
          right: -195,
          padding: '10px 14px',
          paddingLeft: 20,
          background: 'color-mix(in oklab, var(--accent) 8%, var(--surface))',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid color-mix(in oklab, var(--accent) 20%, transparent)',
          borderRadius: '8px 0 0 8px',
          fontSize: 11.5,
          color: 'var(--text)',
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 0,
          transition: 'right 0.3s ease-in-out',
          cursor: 'pointer',
          minWidth: 200
        }}
        onMouseEnter={(e) => e.currentTarget.style.right = '0px'}
        onMouseLeave={(e) => e.currentTarget.style.right = '-180px'}
      >
        <div style={{ fontWeight: 600, fontSize: 12 }}>
          VereinO {appVersion && `(v${appVersion})`}
        </div>
        <div style={{ opacity: 0.85 }}>
          erstellt von{' '}
          <a
            href="mailto:hubertoink@outlook.com"
            style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}
            title="hubertoink@outlook.com"
          >
            Hubertoink
          </a>
        </div>
        <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>
          © 2025
        </div>
      </div>
    </div>
  )
}
