import React from 'react'
import { createPortal } from 'react-dom'

interface ConfirmSwitchOrgModalProps {
  orgName: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Confirmation modal for switching to a newly created organization.
 */
export default function ConfirmSwitchOrgModal({ orgName, onConfirm, onCancel }: ConfirmSwitchOrgModalProps) {
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      onCancel()
    }
    if (e.key === 'Enter') {
      onConfirm()
    }
  }

  return createPortal(
    <div className="modal-overlay" onClick={onCancel}>
      <div 
        className="modal modal-sm" 
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-switch-title"
      >
        <header className="flex justify-between items-center mb-12">
          <h2 id="confirm-switch-title" style={{ margin: 0 }}>Organisation wechseln?</h2>
          <button className="btn icon-btn" onClick={onCancel} aria-label="Schließen">✕</button>
        </header>

        <p style={{ marginBottom: 16 }}>
          Möchtest du jetzt zu <strong>"{orgName}"</strong> wechseln?
        </p>
        
        <div className="helper" style={{ marginBottom: 16 }}>
          Die App wird neu geladen und verwendet dann die Datenbank der gewählten Organisation.
        </div>

        <div className="flex justify-end gap-8">
          <button className="btn" onClick={onCancel}>
            Später
          </button>
          <button className="btn primary" onClick={onConfirm} autoFocus>
            Jetzt wechseln
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
