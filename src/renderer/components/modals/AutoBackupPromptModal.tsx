import ModalHeader from '../ModalHeader'
import React from 'react'
import { useBackupProgress } from '../../hooks/useBackupProgress'
import BackupProgressStatus from '../common/BackupProgressStatus'

export default function AutoBackupPromptModal({ intervalDays, onClose, onBackupNow }: { intervalDays: number; onClose: () => void; onBackupNow: () => Promise<void> }) {
  const progress = useBackupProgress()
  const [submitting, setSubmitting] = React.useState(false)
  const busy = submitting || !!progress?.active
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={busy ? undefined : onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
        <ModalHeader
          title="Automatische Sicherung"
          onClose={onClose}
          closeDisabled={busy}
          closeLabel="Schließen"
          closeOnEscape={false}
        />
        <div className="card" style={{ padding: 12 }}>
          Seit der letzten Sicherung sind mehr als {intervalDays} Tag(e) vergangen. Möchtest du jetzt ein Backup erstellen?
        </div>
        {submitting && <BackupProgressStatus progress={progress} />}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" disabled={busy} onClick={onClose}>Später</button>
          <button className="btn primary" disabled={busy} onClick={async () => {
            setSubmitting(true)
            try { await onBackupNow() } finally { setSubmitting(false) }
          }}>{busy ? 'Sicherung läuft …' : 'Jetzt sichern'}</button>
        </div>
      </div>
    </div>
  )
}
