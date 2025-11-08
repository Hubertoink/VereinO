import React from 'react'
import { GeneralPaneProps } from '../types'

/**
 * GeneralPane - Darstellung & Layout Settings
 * 
 * Handles:
 * - Theme selection
 * - Navigation layout (left/top)
 * - Journal row style & density
 * - Date format
 * - Data management (export/import DB)
 */
export function GeneralPane(props: GeneralPaneProps) {
  return (
    <div className="settings-pane">
      <h2>Allgemeine Einstellungen</h2>
      <p className="helper">Coming soon - Phase 4</p>
    </div>
  )
}
