import React from 'react'
import { LocationInfo } from '../types'

interface LocationInfoDisplayProps {
  info: LocationInfo | null
}

/**
 * LocationInfoDisplay - Shows current database location
 * 
 * Displays root folder, database file path, and attachments folder
 */
export function LocationInfoDisplay({ info }: LocationInfoDisplayProps) {
  if (!info) {
    return (
      <div className="card" style={{ padding: 12 }}>
        <div className="helper">Lade Informationen …</div>
      </div>
    )
  }

  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ display: 'grid', gap: 6 }}>
        <div>
          <span className="helper">Aktueller Ordner</span>
          <div style={{ wordBreak: 'break-all' }}>{info.root}</div>
        </div>
        <div>
          <span className="helper">Datenbank-Datei</span>
          <div style={{ wordBreak: 'break-all' }}>{info.dbPath}</div>
        </div>
        <div>
          <span className="helper">Anhänge-Ordner</span>
          <div style={{ wordBreak: 'break-all' }}>{info.filesDir}</div>
        </div>
        <div>
          <span className="helper">Benutzerdefiniert</span>
          <div>{info.configuredRoot ? 'Ja' : 'Nein (Standard)'}</div>
        </div>
      </div>
    </div>
  )
}
