import React from 'react'
import { IconDatabase, IconFolder, IconFolderOpen, IconPaperclip } from '@tabler/icons-react'
import { LocationInfo } from '../types'

interface LocationInfoDisplayProps {
  info: LocationInfo | null
  onError: (message: string) => void
}

export function LocationInfoDisplay({ info, onError }: LocationInfoDisplayProps) {
  if (!info) return <div className="helper" role="status">Speicherort wird geladen …</div>

  const open = async (value: string, file: boolean) => {
    try {
      const result = file ? await window.api.shell.showItemInFolder(value) : await window.api.shell.openPath(value)
      if (!result.ok) onError(result.error || 'Der Speicherort konnte nicht geöffnet werden.')
    } catch (error) { onError(error instanceof Error ? error.message : String(error)) }
  }
  const locations = [
    { label: 'Arbeitsordner', value: info.root, icon: IconFolder, file: false, action: 'Arbeitsordner im Explorer öffnen' },
    { label: 'Datenbank', value: info.dbPath, icon: IconDatabase, file: true, action: 'Datenbank im Explorer anzeigen' },
    { label: 'Belege & Anhänge', value: info.filesDir, icon: IconPaperclip, file: false, action: 'Belege und Anhänge im Explorer öffnen' }
  ]
  return <div className="storage-location-paths">
    {locations.map(({ label, value, icon: Icon, file, action }, index) => <button
      key={label} type="button" className={`storage-location-path${index === 0 ? ' storage-location-path--root' : ''}`}
      aria-label={action} title={`${action}: ${value}`} onClick={() => void open(value, file)}>
      <Icon size={19} className="storage-location-path__icon" aria-hidden="true" />
      <span className="storage-location-path__copy"><strong>{label}</strong><code>{value}</code></span>
      <IconFolderOpen size={18} className="storage-location-path__open" aria-hidden="true" />
    </button>)}
  </div>
}
