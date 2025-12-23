import React from 'react'
import { TileKey } from './types'

interface SettingsNavProps {
  active: TileKey
  onSelect: (key: TileKey) => void
}

/**
 * SettingsNav - Tile-based Navigation for Settings
 * 
 * File tab (Aktenreiter) layout for switching between settings categories
 */
export function SettingsNav({ active, onSelect }: SettingsNavProps) {
  const tiles: Array<{ key: TileKey; icon: string; label: string }> = [
    { key: 'general', icon: '🖼️', label: 'Darstellung' },
    { key: 'table', icon: '📋', label: 'Tabelle' },
    { key: 'storage', icon: '🗄️', label: 'Speicher & Backup' },
    { key: 'import', icon: '📥', label: 'Import' },
    { key: 'org', icon: '🏢', label: 'Organisation' },
    { key: 'tags', icon: '🏷️', label: 'Tags' },
    { key: 'yearEnd', icon: '📆', label: 'Jahresabschluss' },
    { key: 'cloud', icon: '☁️', label: 'Cloud-Modus' },
  ]

  return (
    <div className="settings-tabs">
      {tiles.map((tile) => (
        <button
          key={tile.key}
          className={`settings-tab ${active === tile.key ? 'active' : ''}`}
          onClick={() => onSelect(tile.key)}
          aria-current={active === tile.key ? 'page' : undefined}
        >
          <span className="settings-tab-icon" aria-hidden="true">
            {tile.icon}
          </span>
          <span>{tile.label}</span>
        </button>
      ))}
    </div>
  )
}
