import React, { useState } from 'react'
import { createPortal } from 'react-dom'

interface NewOrgModalProps {
  onClose: () => void
  onCreated: (org: { id: string; name: string }) => void
  notify?: (type: 'success' | 'error' | 'info', text: string) => void
}

/**
 * Modal to create a new organization with its own database.
 */
export default function NewOrgModal({ onClose, onCreated, notify }: NewOrgModalProps) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const canSave = name.trim().length > 0

  async function handleCreate() {
    if (!canSave || busy) return
    setBusy(true)
    setError('')
    try {
      const result = await (window as any).api?.organizations?.create?.({ name: name.trim() })
      if (result?.organization) {
        notify?.('success', `Organisation "${result.organization.name}" erstellt`)
        onCreated(result.organization)
      }
    } catch (e: any) {
      const msg = e?.message || String(e)
      setError(msg)
      notify?.('error', msg)
    } finally {
      setBusy(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && canSave && !busy) {
      e.preventDefault()
      handleCreate()
    }
    if (e.key === 'Escape') {
      onClose()
    }
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal" 
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-org-title"
      >
        <header className="flex justify-between items-center mb-12">
          <h2 id="new-org-title" style={{ margin: 0 }}>Neue Organisation anlegen</h2>
          <button className="btn icon-btn" onClick={onClose} aria-label="Schließen">✕</button>
        </header>

        <div className="helper" style={{ marginBottom: 16 }}>
          Jede Organisation hat eine eigene Datenbank mit separaten Buchungen, Mitgliedern und Einstellungen.
        </div>

        {error && (
          <div className="error-box" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div className="field">
          <label htmlFor="org-name-input">Name der Organisation</label>
          <input
            id="org-name-input"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z.B. Förderverein Muster e.V."
            autoFocus
            disabled={busy}
          />
        </div>

        <div className="flex justify-end gap-8" style={{ marginTop: 16 }}>
          <button className="btn" onClick={onClose} disabled={busy}>
            Abbrechen
          </button>
          <button 
            className="btn primary" 
            onClick={handleCreate}
            disabled={!canSave || busy}
          >
            {busy ? 'Erstelle…' : 'Erstellen'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
