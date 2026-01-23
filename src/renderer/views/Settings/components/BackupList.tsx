import React from 'react'
import { BackupInfo } from '../types'

interface BackupListProps {
  backups: BackupInfo[]
  onRestore: (filePath: string) => void
}

/**
 * BackupList - Modern Backup Overview
 * 
 * Shows backup files in a clean card-based layout
 */
export function BackupList({ backups, onRestore }: BackupListProps) {
  if (backups.length === 0) {
    return (
      <div className="backup-empty-state">
        <span className="backup-empty-icon" aria-hidden="true">📂</span>
        <span className="backup-empty-text">Noch keine Sicherungen vorhanden</span>
      </div>
    )
  }

  // Extract just the filename from full path for cleaner display
  const getFileName = (filePath: string) => {
    const parts = filePath.replace(/\\/g, '/').split('/')
    return parts[parts.length - 1] || filePath
  }

  // Parse backup type from filename
  const getBackupType = (fileName: string): 'manual' | 'auto' => {
    return fileName.includes('_manual') ? 'manual' : 'auto'
  }

  // Format date nicely
  const formatDate = (mtime: number) => {
    const date = new Date(mtime)
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })
  }
  const formatTime = (mtime: number) => {
    const date = new Date(mtime)
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="backup-list">
      {backups.map((b, i) => {
        const fileName = getFileName(b.filePath)
        const type = getBackupType(fileName)
        const sizeMB = (b.size / 1024 / 1024).toFixed(1)
        
        return (
          <div key={i} className="backup-item">
            <div className="backup-item__icon" aria-hidden="true">
              {type === 'manual' ? '💾' : '⏰'}
            </div>
            <div className="backup-item__info">
              <div className="backup-item__meta">
                <span className={`backup-item__badge backup-item__badge--${type}`}>
                  {type === 'manual' ? 'Manuell' : 'Automatisch'}
                </span>
                <span className="backup-item__size">{sizeMB} MB</span>
              </div>
              <div className="backup-item__date">
                {formatDate(b.mtime)} · {formatTime(b.mtime)}
              </div>
            </div>
            <button 
              className="backup-item__restore"
              onClick={() => onRestore(b.filePath)}
              aria-label={`Sicherung vom ${formatDate(b.mtime)} wiederherstellen`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
              </svg>
              <span>Wiederherstellen</span>
            </button>
          </div>
        )
      })}
    </div>
  )
}
