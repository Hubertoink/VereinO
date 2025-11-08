import React from 'react'
import { StoragePaneProps } from '../types'

/**
 * StoragePane - Database Location & Backup
 * 
 * Handles:
 * - DB location selection & migration
 * - Backup creation & restoration
 * - Auto-backup settings
 */
export function StoragePane(props: StoragePaneProps) {
  return (
    <div className="settings-pane">
      <h2>Speicher & Backup</h2>
      <p className="helper">Coming soon - Phase 4</p>
    </div>
  )
}
