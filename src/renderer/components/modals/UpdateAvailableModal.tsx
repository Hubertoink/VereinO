import React from 'react'

export type UpdateModalState = {
  status: 'available' | 'downloading' | 'downloaded' | 'error'
  currentVersion: string
  availableVersion: string | null
  downloadedVersion: string | null
  downloadProgress: number | null
  message: string | null
}

type Props = {
  state: UpdateModalState
  onClose: () => void
  onDownload: () => Promise<void>
  onInstall: () => Promise<void>
  onDisable: () => Promise<void>
}

export default function UpdateAvailableModal({ state, onClose, onDownload, onInstall, onDisable }: Props) {
  const version = state.downloadedVersion || state.availableVersion || 'neu'
  const isDownloading = state.status === 'downloading'
  const progress = typeof state.downloadProgress === 'number' ? Math.max(0, Math.min(100, state.downloadProgress)) : 0

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal update-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Update verfügbar</h2>
          <button className="btn ghost" onClick={onClose} aria-label="Schließen">×</button>
        </div>

        <div className="card update-modal__summary">
          <div>
            <strong>VereinO {version}</strong>
            <div className="helper">Installiert ist Version {state.currentVersion || 'unbekannt'}.</div>
          </div>
          <span className="badge">Neu</span>
        </div>

        <p className="helper" style={{ margin: 0 }}>
          {state.message || 'Eine neue Version kann heruntergeladen und anschließend installiert werden.'}
        </p>

        {isDownloading && (
          <div className="update-modal__progress" aria-label={`Download ${progress}%`}>
            <div className="update-modal__progress-bar" style={{ width: `${progress}%` }} />
          </div>
        )}

        <div className="modal-actions-between">
          <button className="btn ghost" onClick={() => { void onDisable() }}>
            Nicht mehr anzeigen
          </button>
          <div className="modal-actions-end">
            <button className="btn" onClick={onClose}>Schließen</button>
            {state.status === 'downloaded' ? (
              <button className="btn primary" onClick={() => { void onInstall() }}>
                Installieren
              </button>
            ) : state.status !== 'error' ? (
              <button
                className="btn primary"
                disabled={isDownloading}
                onClick={() => { void onDownload() }}
              >
                {isDownloading ? 'Download läuft...' : 'Download starten'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
