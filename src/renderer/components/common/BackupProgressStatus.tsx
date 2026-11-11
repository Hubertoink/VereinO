import React from 'react'
import type { BackupProgress } from '../../../../shared/backupProgress'

export default function BackupProgressStatus({ progress }: { progress: BackupProgress | null }) {
  if (!progress || progress.stage === 'error') return null
  const percent = progress.totalBytes ? Math.min(100, Math.round((progress.completedBytes || 0) / progress.totalBytes * 100)) : undefined
  return <div className="backup-progress-status" role="status" aria-live="polite">
    <strong>{progress.message}</strong>
    {progress.active && <>
      <progress aria-label={progress.message} max={100} value={percent} />
      {percent !== undefined && <span>{percent} %</span>}
    </>}
    {progress.logFilePath && !progress.active && <details>
      <summary>Sicherungsprotokoll{progress.localFilePath ? ' und lokale Kopie' : ''}</summary>
      {progress.localFilePath && <p>Lokale Sicherung: <code>{progress.localFilePath}</code></p>}
      <p>Protokoll: <code>{progress.logFilePath}</code></p>
      <button className="btn btn-sm" onClick={() => void window.api.backup.openRecoveryFolder()}>Lokalen Sicherungsordner öffnen</button>
    </details>}
  </div>
}
