import React, { useEffect, useState } from 'react'
import { IconBuilding, IconFileCertificate } from '@tabler/icons-react'
import { api, ApiError } from '../api'
import type { WebOrganizationSettings } from '../settingsApi'
import '../organizations.css'
type Certificate = {
  fileName: string
  fileData: string
  mimeType: string
  fileSize: number
  uploadDate?: string
  validFrom?: string
  validUntil?: string
}
export type OrganizationRecord = WebOrganizationSettings & {
  address?: string
  cashier?: string
  logoDataUrl?: string | null
  taxCertificate?: Certificate | null
}
const readDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'))
    reader.readAsDataURL(file)
  })
export default function OrganizationDetails({
  generalProfile = false,
  organization,
  readOnly,
  onSaved,
  onSessionExpired
}: {
  generalProfile?: boolean
  organization: OrganizationRecord
  readOnly: boolean
  onSaved: (organization: OrganizationRecord) => void
  onSessionExpired: () => void
}) {
  const [name, setName] = useState(organization.name)
  const [address, setAddress] = useState(organization.address || ''),
    [cashier, setCashier] = useState(organization.cashier || '')
  const [logo, setLogo] = useState(organization.logoDataUrl || null),
    [certificate, setCertificate] = useState<Certificate | null>(
      organization.taxCertificate || null
    )
  const [busy, setBusy] = useState(false),
    [reading, setReading] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  useEffect(() => {
    setName(organization.name)
    setAddress(organization.address || '')
    setCashier(organization.cashier || '')
    setLogo(organization.logoDataUrl || null)
    setCertificate(organization.taxCertificate || null)
  }, [organization])
  const upload = async (file: File, kind: 'logo' | 'certificate') => {
    setError('')
    setNotice('')
    setReading(true)
    try {
      const limit = (kind === 'logo' ? 1 : 5) * 1024 * 1024
      if (file.size > limit)
        throw new Error(`Die Datei darf höchstens ${kind === 'logo' ? '1' : '5'} MB groß sein.`)
      const allowed =
        kind === 'logo'
          ? ['image/png', 'image/jpeg', 'image/webp']
          : ['application/pdf', 'image/png', 'image/jpeg']
      if (!allowed.includes(file.type))
        throw new Error('Dieses Dateiformat wird nicht unterstützt.')
      const data = await readDataUrl(file)
      if (kind === 'logo') setLogo(data)
      else
        setCertificate({
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
          fileData: data.split(',')[1]
        })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Datei konnte nicht geladen werden.')
    } finally {
      setReading(false)
    }
  }
  return (
    <form
      className="web-organization-settings"
      onSubmit={async (event) => {
        event.preventDefault()
        if (busy || reading || readOnly) return
        setBusy(true)
        setError('')
        setNotice('')
        try {
          const result = await api<{ organization: OrganizationRecord }>(
            '/settings/organization',
            'PATCH',
            {
              version: organization.version,
              name: name.trim(),
              address,
              cashier,
              logoDataUrl: logo,
              taxCertificate: certificate
            }
          )
          onSaved(result.organization)
          setNotice('Organisationsdaten gespeichert.')
        } catch (cause) {
          if (cause instanceof ApiError && cause.status === 401) onSessionExpired()
          setError(
            cause instanceof Error
              ? cause.message
              : 'Organisationsdaten konnten nicht gespeichert werden.'
          )
        } finally {
          setBusy(false)
        }
      }}
    >
      <fieldset
        disabled={busy || reading}
        style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
        className="web-organization-settings"
      >
        <div className="web-org-summary card">
          <div className="web-org-summary-icon">
            <IconBuilding size={30} />
          </div>
          <div>
            <h2>{organization.name}</h2>
            <strong>{generalProfile ? 'Allgemeine Budgetverwaltung' : 'Vereinsverwaltung'}</strong>
            <p className="helper">
              Bei der Erstellung festgelegt · Organisationsart nicht änderbar
            </p>
          </div>
        </div>
        <div className="web-org-settings-grid">
          <div className="web-org-data-card">
            <div className="settings-title">
              <IconBuilding size={18} />
              <strong>Stammdaten</strong>
            </div>
            <div className="field">
              <label htmlFor="web-organization-name">Organisationsname</label>
              <input
                id="web-organization-name"
                className="input"
                value={name}
                required
                minLength={2}
                maxLength={255}
                readOnly={readOnly}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="org-address">Anschrift</label>
              <textarea
                id="org-address"
                className="input"
                rows={3}
                maxLength={2000}
                value={address}
                readOnly={readOnly}
                onChange={(event) => setAddress(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="org-cashier">
                {generalProfile ? 'Finanzverantwortliche Person' : 'Kassenwart'}
              </label>
              <input
                id="org-cashier"
                className="input"
                maxLength={255}
                value={cashier}
                readOnly={readOnly}
                onChange={(event) => setCashier(event.target.value)}
              />
            </div>
          </div>
          <div className="web-org-data-card">
            <div className="settings-title">
              <IconBuilding size={18} />
              <strong>Organisationslogo</strong>
            </div>
            <div className="field">
              <div className="web-org-logo-preview">
                {!logo && <span>Noch kein Logo hinterlegt</span>}
                {logo && (
                  <img
                    src={logo}
                    alt="Organisationslogo"
                    style={{ maxWidth: 180, maxHeight: 100, objectFit: 'contain' }}
                  />
                )}
              </div>
              {!readOnly && (
                <>
                  <label className="btn" htmlFor="org-logo-file">
                    Logo auswählen
                  </label>
                  <input
                    hidden
                    id="org-logo-file"
                    className="web-org-file-input"
                    aria-label="Organisationslogo"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) void upload(file, 'logo')
                      event.target.value = ''
                    }}
                  />
                  <span className="helper">PNG, JPEG oder WebP, höchstens 1 MB.</span>
                  {logo && (
                    <button type="button" className="btn" onClick={() => setLogo(null)}>
                      Logo entfernen
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        {!generalProfile && (
          <div className="web-org-data-card">
            <div className="settings-title">
              <IconFileCertificate size={18} />
              <strong>Steuerbefreiungsbescheid</strong>
            </div>
            {certificate ? (
              <>
                <p>
                  <a
                    className="btn"
                    href={`data:${certificate.mimeType};base64,${certificate.fileData}`}
                    download={certificate.fileName}
                  >
                    {certificate.fileName} herunterladen
                  </a>
                </p>
                <p className="helper">
                  {(certificate.fileSize / 1024).toFixed(1)} KB
                  {certificate.uploadDate
                    ? ` · Gespeichert am ${new Date(certificate.uploadDate).toLocaleDateString('de-DE')}`
                    : ' · Noch nicht gespeichert'}
                </p>
                <div className="row">
                  <div className="field">
                    <label htmlFor="org-tax-from">Gültig von</label>
                    <input
                      id="org-tax-from"
                      className="input"
                      type="date"
                      value={certificate.validFrom || ''}
                      readOnly={readOnly}
                      onChange={(event) =>
                        setCertificate({
                          ...certificate,
                          validFrom: event.target.value || undefined
                        })
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="org-tax-until">Gültig bis</label>
                    <input
                      id="org-tax-until"
                      className="input"
                      type="date"
                      value={certificate.validUntil || ''}
                      readOnly={readOnly}
                      onChange={(event) =>
                        setCertificate({
                          ...certificate,
                          validUntil: event.target.value || undefined
                        })
                      }
                    />
                  </div>
                </div>
              </>
            ) : (
              <p className="helper">Kein Bescheid hinterlegt.</p>
            )}
            {!readOnly && (
              <>
                <label className="btn" htmlFor="org-certificate-file">
                  Bescheid auswählen
                </label>
                <input
                  hidden
                  id="org-certificate-file"
                  className="web-org-file-input"
                  type="file"
                  aria-label="Steuerbefreiungsbescheid"
                  accept="application/pdf,image/png,image/jpeg"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void upload(file, 'certificate')
                    event.target.value = ''
                  }}
                />
                <p className="helper">PDF, PNG oder JPEG, höchstens 5 MB.</p>
                {certificate && (
                  <button type="button" className="btn" onClick={() => setCertificate(null)}>
                    Bescheid entfernen
                  </button>
                )}
              </>
            )}
          </div>
        )}
        {error && (
          <p role="alert" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        )}
        {notice && (
          <p role="status" style={{ color: 'var(--success)' }}>
            {notice}
          </p>
        )}
        {reading && <p role="status">Datei wird gelesen …</p>}
        {!readOnly && (
          <div className="settings-pane-actions">
            <button className="btn primary" type="submit">
              {busy ? 'Wird gespeichert …' : 'Organisationsdaten speichern'}
            </button>
          </div>
        )}
      </fieldset>
    </form>
  )
}
