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
            backgroundImage={props.backgroundImage}
            setBackgroundImage={props.setBackgroundImage}
            glassModals={props.glassModals}
            setGlassModals={props.setGlassModals}
            dateFmt={props.dateFmt}
            setDateFmt={props.setDateFmt}
            journalLimit={props.journalLimit}
            setJournalLimit={props.setJournalLimit}
            notify={props.notify}
            bumpDataVersion={props.bumpDataVersion}
            openSetupWizard={props.openSetupWizard}
            showSubmissionBadge={props.showSubmissionBadge}
            setShowSubmissionBadge={props.setShowSubmissionBadge}
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

      {/* Developer Badge - edge anchored handle; panel retracts on mouse leave */}
      <DevBadge appVersion={appVersion} />
    </div>
  )
}

function DevBadge({ appVersion }: { appVersion: string }) {
  const [open, setOpen] = React.useState(false)
  const panelRef = React.useRef<HTMLDivElement | null>(null)
  const [panelHeight, setPanelHeight] = React.useState<number>(0)

  React.useEffect(() => {
    if (panelRef.current) {
      setPanelHeight(panelRef.current.offsetHeight)
    }
  }, [open, appVersion])
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 0,
        display: 'flex',
        alignItems: 'stretch',
        fontSize: 11.5,
        color: 'var(--text)',
        zIndex: 10,
        userSelect: 'none'
      }}
      onMouseLeave={() => setOpen(false)}
    >
      {/* Sliding panel */}
      <div
        aria-hidden={!open}
        ref={panelRef}
        style={{
          background: 'color-mix(in oklab, var(--accent) 8%, var(--surface))',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid color-mix(in oklab, var(--accent) 20%, transparent)',
          borderRight: 'none',
          borderRadius: '8px 0 0 8px',
          padding: '10px 16px 10px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          minWidth: 200,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          opacity: open ? 1 : 0,
          transition: 'transform .25s cubic-bezier(.4,0,.2,1), opacity .2s ease',
          pointerEvents: open ? 'auto' : 'none'
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 12 }}>VereinO {appVersion && `(v${appVersion})`}</div>
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
        <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>© 2025</div>
      </div>
      {/* Handle */}
      <button
        type="button"
        aria-label={open ? 'Schließen' : 'Info anzeigen'}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(!open)}
        style={{
          background: 'color-mix(in oklab, var(--accent) 40%, var(--surface))',
          color: 'var(--surface)',
          width: 34,
          height: panelHeight || 54,
          border: '1px solid color-mix(in oklab, var(--accent) 35%, transparent)',
          borderRadius: '0 8px 8px 0',
          boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          fontWeight: 700,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          outline: 'none'
        }}
      >
        {open ? '×' : '<'}
      </button>
    </div>
  )
}
