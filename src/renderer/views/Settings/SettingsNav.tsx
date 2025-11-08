import React from 'react'
import { TileKey } from './types'

interface SettingsNavProps {
  active: TileKey
  onSelect: (key: TileKey) => void
}

/**
 * SettingsNav - Tile-based Navigation for Settings
 * 
 * Windows-like tile layout for switching between settings categories
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
  ]

  return (
    <div 
      className="settings-tiles" 
      style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', 
        gap: 12, 
        marginBottom: 16 
      }}
    >
      {tiles.map((tile) => (
        <button
          key={tile.key}
          className={`btn ${active === tile.key ? 'primary' : ''}`}
          onClick={() => onSelect(tile.key)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px 12px',
            gap: 8,
            minHeight: 80,
            textAlign: 'center',
            background: active === tile.key 
              ? 'color-mix(in oklab, var(--accent) 15%, transparent)' 
              : undefined,
          }}
          aria-current={active === tile.key ? 'page' : undefined}
        >
          <span style={{ fontSize: 28 }} aria-hidden="true">
            {tile.icon}
          </span>
          <span style={{ fontSize: 13, fontWeight: 500 }}>
            {tile.label}
          </span>
        </button>
      ))}
    </div>
  )
}
