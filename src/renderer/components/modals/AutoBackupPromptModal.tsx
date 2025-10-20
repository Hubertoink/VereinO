import React from 'react'

export default function AutoBackupPromptModal({ intervalDays, onClose, onBackupNow }: { intervalDays: number; onClose: () => void; onBackupNow: () => Promise<void> }) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Automatische Sicherung</h2>
          <button className="btn ghost" onClick={onClose} aria-label="Schließen">✕</button>
        </div>
        <div className="card" style={{ padding: 12 }}>
          Seit der letzten Sicherung sind mehr als {intervalDays} Tag(e) vergangen. Möchtest du jetzt ein Backup erstellen?
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={onClose}>Später</button>
          <button className="btn primary" onClick={onBackupNow}>Jetzt sichern</button>
        </div>
      </div>
    </div>
  )
}
