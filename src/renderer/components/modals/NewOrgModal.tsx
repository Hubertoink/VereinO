import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import type { OrganizationProfile } from '../../../../shared/classification'

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
  const [profile, setProfile] = useState<OrganizationProfile>('NONPROFIT')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const canSave = name.trim().length > 0

  async function handleCreate() {
    if (!canSave || busy) return
    setBusy(true)
    setError('')
    try {
      const result = await (window as any).api?.organizations?.create?.({ name: name.trim(), profile })
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

        <fieldset className="field" style={{ border: 0, padding: 0, margin: '16px 0 0' }}>
          <legend>Verwendungsprofil</legend>
          <div className="helper" style={{ marginBottom: 8 }}>
            Das Profil legt fest, ob Buchungen nach gemeinnützigen Sphären oder frei angelegten Kategorien gegliedert werden.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            <label
              style={{
                display: 'block',
                cursor: busy ? 'default' : 'pointer',
                border: `1px solid ${profile === 'NONPROFIT' ? '#4f8cff' : 'var(--border, #3a4356)'}`,
                borderRadius: 8,
                padding: '14px 12px',
                background: profile === 'NONPROFIT' ? 'color-mix(in oklab, #4f8cff 12%, var(--surface))' : 'color-mix(in oklab, var(--surface) 94%, transparent)'
              }}
            >
              <input
                type="radio"
                name="organization-profile"
                value="NONPROFIT"
                checked={profile === 'NONPROFIT'}
                onChange={() => setProfile('NONPROFIT')}
                disabled={busy}
              />{' '}
              <strong>Verein / gemeinnützig</strong>
              <span className="helper" style={{ display: 'block', marginLeft: 22, marginTop: 3 }}>
                Nutzt die vier steuerlichen Sphären und die Vereinsfunktionen.
              </span>
            </label>
            <label
              style={{
                display: 'block',
                cursor: busy ? 'default' : 'pointer',
                border: `1px solid ${profile === 'GENERAL' ? '#22c55e' : 'var(--border, #3a4356)'}`,
                borderRadius: 8,
                padding: '14px 12px',
                background: profile === 'GENERAL' ? 'color-mix(in oklab, #22c55e 12%, var(--surface))' : 'color-mix(in oklab, var(--surface) 94%, transparent)'
              }}
            >
              <input
                type="radio"
                name="organization-profile"
                value="GENERAL"
                checked={profile === 'GENERAL'}
                onChange={() => setProfile('GENERAL')}
                disabled={busy}
              />{' '}
              <strong>Allgemeine Budgetverwaltung</strong>
              <span className="helper" style={{ display: 'block', marginLeft: 22, marginTop: 3 }}>
                Für Kleingewerbe, Projekte und Teams mit frei angelegten Kategorien.
              </span>
            </label>
          </div>
        </fieldset>

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
