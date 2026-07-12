import React from 'react'
import { TileKey } from './types'

interface SettingsNavProps {
  active: TileKey
  onSelect: (key: TileKey) => void
}

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

const settingsIconColors: Record<TileKey, string> = {
  general: '#7C4DFF',
  table: '#2962FF',
  storage: '#00B8D4',
  docling: '#8B5CF6',
  import: '#F50057',
  org: '#26A69A',
  donations: '#FF7043',
  paymentAccounts: '#1976D2',
  tags: '#FFD600',
  aiPatterns: '#EC4899',
  cashCheck: '#00C853',
  yearEnd: '#00C853',
  updates: '#00B8D4',
  tutorial: '#FF7043',
  about: '#9C27B0',
}

function getSettingsIcon(key: TileKey): React.ReactNode {
  switch (key) {
    case 'general':
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
      return (
        <svg {...iconProps}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="3" y1="15" x2="21" y2="15" />
          <line x1="9" y1="3" x2="9" y2="21" />
        </svg>
      )
    case 'storage':
      return (
        <svg {...iconProps}>
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
        </svg>
      )
    case 'import':
      return (
        <svg {...iconProps}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      )
    case 'org':
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
    case 'donations':
      return (
        <svg {...iconProps}>
          <path d="M12 21s-7-4.35-9.5-8.2C.7 10 1.4 6.6 4.2 5.1c2.1-1.1 4.3-.3 5.8 1.3 1.5-1.6 3.7-2.4 5.8-1.3 2.8 1.5 3.5 4.9 1.7 7.7C19 16.65 12 21 12 21z" />
          <path d="M8 12h8" />
          <path d="M12 8v8" />
        </svg>
      )
    case 'paymentAccounts':
      return (
        <svg {...iconProps}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 10h18" />
          <circle cx="8" cy="14" r="1" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'tags':
      return (
        <svg {...iconProps}>
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      )
    case 'docling':
      return (
        <svg {...iconProps}>
          <path d="M7 2h7l4 4v16H7z" />
          <path d="M14 2v5h5" />
          <path d="m10 12 1.2 2.8L14 16l-2.8 1.2L10 20l-1.2-2.8L6 16l2.8-1.2L10 12z" />
        </svg>
      )
    case 'aiPatterns':
      return (
        <svg {...iconProps}>
          <path d="M12 3l1.4 4.2L18 9l-4.6 1.8L12 15l-1.4-4.2L6 9l4.6-1.8L12 3z" />
          <path d="M19 14l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z" />
          <path d="M5 15l.6 1.6L7.2 17l-1.6.6L5 19.2l-.6-1.6L2.8 17l1.6-.4L5 15z" />
        </svg>
      )
    case 'cashCheck':
      return (
        <svg {...iconProps}>
          <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
          <path d="M21 10h-4a2 2 0 0 0-2 2 2 2 0 0 0 2 2h4" />
          <path d="M7 9h5" />
        </svg>
      )
    case 'yearEnd':
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
    case 'updates':
      return (
        <svg {...iconProps}>
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
      )
    case 'tutorial':
      return (
        <svg {...iconProps}>
          <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
          <path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5" />
        </svg>
      )
    case 'about':
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

type SettingsGroup = {
  key: 'display' | 'data' | 'club' | 'admin'
  label: string
  items: Array<{ key: TileKey; label: string; shortLabel: string }>
}

const GROUPS: SettingsGroup[] = [
  {
    key: 'display',
    label: 'Darstellung',
    items: [
      { key: 'general', label: 'Darstellung', shortLabel: 'Darst.' },
      { key: 'table', label: 'Tabelle', shortLabel: 'Tab.' },
    ],
  },
  {
    key: 'data',
    label: 'Daten',
    items: [
      { key: 'storage', label: 'Speicher & Backup', shortLabel: 'Speicher' },
      { key: 'docling', label: 'Docling', shortLabel: 'Docling' },
      { key: 'import', label: 'Import', shortLabel: 'Import' },
      { key: 'updates', label: 'Updates', shortLabel: 'Updates' },
    ],
  },
  {
    key: 'club',
    label: 'Verein',
    items: [
      { key: 'org', label: 'Organisation', shortLabel: 'Orga' },
      { key: 'paymentAccounts', label: 'Konten', shortLabel: 'Konten' },
      { key: 'tags', label: 'Tags', shortLabel: 'Tags' },
      { key: 'aiPatterns', label: 'KI-Muster', shortLabel: 'KI' },
    ],
  },
  {
    key: 'admin',
    label: 'Verwaltung',
    items: [
      { key: 'cashCheck', label: 'Kassenprüfung', shortLabel: 'Kassenpr.' },
      { key: 'yearEnd', label: 'Jahresabschluss', shortLabel: 'Jahresab.' },
      { key: 'donations', label: 'Spenden', shortLabel: 'Spenden' },
    ],
  },
]

export function SettingsNav({ active, onSelect }: SettingsNavProps) {
  const activeGroupKey =
    GROUPS.find((group) => group.items.some((item) => item.key === active))?.key ?? GROUPS[0].key

  const [openGroupKey, setOpenGroupKey] = React.useState<SettingsGroup['key'] | null>(null)

  React.useEffect(() => {
    setOpenGroupKey(null)
  }, [active])

  const visibleGroupKey = openGroupKey ?? activeGroupKey
  const visibleGroup = GROUPS.find((group) => group.key === visibleGroupKey) ?? GROUPS[0]

  return (
    <div
      className="settings-nav-shell"
      onMouseLeave={() => setOpenGroupKey(null)}
    >
      <div className="settings-nav-meta">
        <span className="settings-nav-eyebrow">Bereiche</span>
      </div>

      <div className="settings-clusters" role="tablist" aria-label="Einstellungsbereiche">
        {GROUPS.map((group) => {
          const groupIsActive = group.key === activeGroupKey
          const groupIsOpen = group.key === visibleGroupKey

          return (
            <button
              key={group.key}
              type="button"
              className={`settings-cluster-trigger ${groupIsActive ? 'active' : ''} ${groupIsOpen ? 'open' : ''}`}
              onMouseEnter={() => setOpenGroupKey(group.key)}
              onFocus={() => setOpenGroupKey(group.key)}
              onClick={() => {
                if (group.key === activeGroupKey) {
                  setOpenGroupKey((current) => current === group.key ? null : group.key)
                  return
                }
                onSelect(group.items[0].key)
                setOpenGroupKey(group.key)
              }}
              aria-expanded={groupIsOpen}
            >
              <span>{group.label}</span>
              <span className="settings-cluster-caret" aria-hidden="true">⌄</span>
            </button>
          )
        })}
      </div>

      <div className="settings-subnav" role="group" aria-label={visibleGroup.label}>
        {visibleGroup.items.map((tile) => (
          <button
            key={tile.key}
            type="button"
            className={`settings-tab ${active === tile.key ? 'active' : ''}`}
            onClick={() => onSelect(tile.key)}
            aria-current={active === tile.key ? 'page' : undefined}
            title={tile.label}
          >
            <span
              className="settings-tab-icon"
              aria-hidden="true"
              style={{ color: settingsIconColors[tile.key] }}
            >
              {getSettingsIcon(tile.key)}
            </span>
            <span className="settings-tab-label settings-tab-label--full">{tile.label}</span>
            <span className="settings-tab-label settings-tab-label--short">{tile.shortLabel}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
