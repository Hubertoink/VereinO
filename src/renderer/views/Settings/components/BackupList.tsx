import React from 'react'
import { BackupInfo } from '../types'

interface BackupListProps {
  backups: BackupInfo[]
  onRestore: (filePath: string) => void
}

/**
 * BackupList - Table of Available Backups
 * 
 * Shows backup files with timestamp, size, and restore action
 */
export function BackupList({ backups, onRestore }: BackupListProps) {
  if (backups.length === 0) {
    return (
      <div className="helper" style={{ marginTop: 8 }}>
        Noch keine Backups vorhanden.
      </div>
    )
  }

  return (
    <div style={{ overflow: 'auto', maxHeight: 260, border: '1px solid var(--border)', borderRadius: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
              Datei
            </th>
            <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
              Datum
            </th>
            <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
              Größe
            </th>
            <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
              Aktion
            </th>
          </tr>
        </thead>
        <tbody>
          {backups.map((b, i) => (
            <tr key={i}>
              <td 
                style={{ 
                  padding: '6px 8px', 
                  wordBreak: 'break-all', 
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' 
                }}
              >
                {b.filePath}
              </td>
              <td style={{ padding: '6px 8px' }}>
                {new Date(b.mtime).toLocaleString('de-DE')}
              </td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                {(b.size / 1024 / 1024).toFixed(2)} MB
              </td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                <button 
                  className="btn danger" 
                  onClick={() => onRestore(b.filePath)}
                >
                  Wiederherstellen…
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
