import React from 'react'
import { TileKey } from './types'

interface SettingsNavProps {
  active: TileKey
  onSelect: (key: TileKey) => void
}

/**
 * Settings Icons - Lucide-style outline icons
 * Consistent with the main navigation icons
 */
const iconProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

// Settings tab icon colors (matching app style)
const settingsIconColors: Record<TileKey, string> = {
  general: '#7C4DFF',     // Purple - Appearance/Display
  table: '#2962FF',       // Blue - Table
  storage: '#00B8D4',     // Cyan - Storage & Backup
  import: '#F50057',      // Pink/Red - Import
  org: '#26A69A',         // Teal - Organization
  tags: '#FFD600',        // Yellow - Tags
  yearEnd: '#00C853',     // Green - Year End
  tutorial: '#FF7043',    // Orange - Tutorial
  about: '#9C27B0',       // Purple - About
}

function getSettingsIcon(key: TileKey): React.ReactNode {
  switch (key) {
    case 'general':
      // Palette/Appearance icon
      return (
        <svg {...iconProps}>
          <circle cx="13.5" cy="6.5" r="2.5" />
          <path d="M22 12c0 6-4.5 10-10 10S2 18 2 12 6.5 2 12 2a10 10 0 0 1 8 4" />
          <circle cx="7" cy="12" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="12" cy="17" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="17" cy="12" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'table':
      // Table/Grid icon
      return (
        <svg {...iconProps}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="3" y1="15" x2="21" y2="15" />
          <line x1="9" y1="3" x2="9" y2="21" />
        </svg>
      )
    case 'storage':
      // Database/Storage icon
      return (
        <svg {...iconProps}>
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
        </svg>
      )
    case 'import':
      // Upload/Import icon
      return (
        <svg {...iconProps}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      )
    case 'org':
      // Building/Organization icon
      return (
        <svg {...iconProps}>
          <rect x="4" y="2" width="16" height="20" rx="2" />
          <path d="M9 22v-4h6v4" />
          <line x1="8" y1="6" x2="8" y2="6.01" />
          <line x1="12" y1="6" x2="12" y2="6.01" />
          <line x1="16" y1="6" x2="16" y2="6.01" />
          <line x1="8" y1="10" x2="8" y2="10.01" />
          <line x1="12" y1="10" x2="12" y2="10.01" />
          <line x1="16" y1="10" x2="16" y2="10.01" />
          <line x1="8" y1="14" x2="8" y2="14.01" />
          <line x1="12" y1="14" x2="12" y2="14.01" />
          <line x1="16" y1="14" x2="16" y2="14.01" />
        </svg>
      )
    case 'tags':
      // Tag icon
      return (
        <svg {...iconProps}>
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      )
    case 'yearEnd':
      // Calendar/Year-End icon
      return (
        <svg {...iconProps}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <path d="M8 14h.01" />
          <path d="M12 14h.01" />
          <path d="M16 14h.01" />
          <path d="M8 18h.01" />
          <path d="M12 18h.01" />
          <path d="M16 18h.01" />
        </svg>
      )
    case 'tutorial':
      // Graduation cap / Learning icon
      return (
        <svg {...iconProps}>
          <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
          <path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5" />
        </svg>
      )
    case 'about':
      // Info icon
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      )
    default:
      return null
  }
}

/**
 * SettingsNav - Tile-based Navigation for Settings
 * 
 * File tab (Aktenreiter) layout for switching between settings categories
 */
export function SettingsNav({ active, onSelect }: SettingsNavProps) {
  const tiles: Array<{ key: TileKey; label: string }> = [
    { key: 'general', label: 'Darstellung' },
    { key: 'table', label: 'Tabelle' },
    { key: 'storage', label: 'Speicher & Backup' },
    { key: 'import', label: 'Import' },
    { key: 'org', label: 'Organisation' },
    { key: 'tags', label: 'Tags' },
    { key: 'yearEnd', label: 'Jahresabschluss' },
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
          <span 
            className="settings-tab-icon" 
            aria-hidden="true"
            style={{ color: settingsIconColors[tile.key] }}
          >
            {getSettingsIcon(tile.key)}
          </span>
          <span>{tile.label}</span>
        </button>
      ))}
    </div>
  )
}
