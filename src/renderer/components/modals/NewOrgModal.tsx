import MasterDataDialog, { FieldLabel } from '../common/MasterDataDialog'
import { IconBuildingCommunity } from '@tabler/icons-react'
import { useState } from 'react';
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

  return <MasterDataDialog title="Neue Organisation anlegen" subtitle="Jede Organisation hat eine eigene Datenbank mit separaten Buchungen, Mitgliedern und Einstellungen." icon={<IconBuildingCommunity size={22} />} onClose={onClose} onSave={handleCreate} busy={busy} canSave={canSave} saveLabel="Erstellen">
        {error && (
          <div className="error-box" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div className="field">
          <FieldLabel htmlFor="org-name-input" required>Name der Organisation</FieldLabel>
          <input
            id="org-name-input"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z.B. Förderverein Muster e.V."
            autoFocus
            disabled={busy}
            required
          />
        </div>

        <fieldset className="field" style={{ border: 0, padding: 0, margin: '16px 0 0' }}>
          <legend>Verwendungsprofil</legend>
          <div className="helper" style={{ marginBottom: 8 }}>
            Das Profil legt fest, ob Buchungen nach gemeinnützigen Sphären oder frei angelegten Kategorien gegliedert werden.
          </div>
          <div className="dialog-form-grid">
            <label
              style={{
                display: 'block',
                cursor: busy ? 'default' : 'pointer',
                border: `1px solid ${profile === 'NONPROFIT' ? 'var(--accent)' : 'var(--border, #3a4356)'}`,
                borderRadius: 8,
                padding: '14px 12px',
                background: profile === 'NONPROFIT' ? 'color-mix(in oklab, var(--accent) 12%, var(--surface))' : 'color-mix(in oklab, var(--surface) 94%, transparent)'
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
                Nutzt die vier steuerlichen Sphären und Funktionen für gemeinnützige Vereine.
              </span>
            </label>
            <label
              style={{
                display: 'block',
                cursor: busy ? 'default' : 'pointer',
                border: `1px solid ${profile === 'GENERAL' ? 'var(--accent)' : 'var(--border, #3a4356)'}`,
                borderRadius: 8,
                padding: '14px 12px',
                background: profile === 'GENERAL' ? 'color-mix(in oklab, var(--accent) 12%, var(--surface))' : 'color-mix(in oklab, var(--surface) 94%, transparent)'
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
                Für Kleingewerbe, Projekte und Teams mit freien Kategorien und optionaler Mitgliederverwaltung.
              </span>
            </label>
          </div>
        </fieldset>

  </MasterDataDialog>
}
