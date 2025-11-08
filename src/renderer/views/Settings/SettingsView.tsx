import React, { useState } from 'react'
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
 */
export function SettingsView(props: SettingsProps) {
  const [activeTile, setActiveTile] = useState<TileKey>('general')

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
        
        {activeTile === 'import' && <ImportPane />}
        
        {activeTile === 'org' && <OrgPane />}
        
        {activeTile === 'tags' && (
          <TagsPane
            tagDefs={props.tagDefs}
            setTagDefs={props.setTagDefs}
            notify={props.notify}
            bumpDataVersion={props.bumpDataVersion}
            openTagsManager={props.openTagsManager}
          />
        )}
        
        {activeTile === 'yearEnd' && <YearEndPane />}
      </div>
    </div>
  )
}
