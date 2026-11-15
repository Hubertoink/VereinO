import ModalHeader from '../ModalHeader'
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
        className="modal confirm-switch-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-switch-title"
      >
        <ModalHeader

          title="Organisation wechseln?"
          titleId="confirm-switch-title"
          onClose={onCancel}
          closeLabel="Schließen"
          closeOnEscape={false}
        />

        <div className="confirm-switch-body"><p style={{ marginBottom: 12 }}>
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
        </div></div>
      </div>
    </div>,
    document.body
  )
}
