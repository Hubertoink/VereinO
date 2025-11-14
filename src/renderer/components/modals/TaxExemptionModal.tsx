import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { TaxExemptionCertificate } from '../../../../shared/types'

interface TaxExemptionModalProps {
  onClose: () => void
  onSaved?: () => void
}

// Safe ArrayBuffer -> base64 converter (chunked to avoid call stack overflow)
function bufferToBase64Safe(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null as any, bytes.subarray(i, i + chunk) as any)
  }
  return btoa(binary)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

export default function TaxExemptionModal({ onClose, onSaved }: TaxExemptionModalProps) {
  const [certificate, setCertificate] = useState<TaxExemptionCertificate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [previewUrl, setPreviewUrl] = useState<string>('')
  const [validFrom, setValidFrom] = useState<string>('')
  const [validUntil, setValidUntil] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    ;(window as any).api?.taxExemption?.get?.()
      .then((res: any) => {
        if (!alive) return
        const cert = res?.certificate
        setCertificate(cert)
        if (cert) {
          setValidFrom(cert.validFrom || '')
          setValidUntil(cert.validUntil || '')
          // Only generate preview URL for image types; PDFs get icon preview
          const isImage = cert.mimeType.startsWith('image/')
          if (isImage) {
            setPreviewUrl(`data:${cert.mimeType};base64,${cert.fileData}`)
          } else {
            setPreviewUrl('')
          }
        }
      })
      .catch((e: any) => setError(e?.message || String(e)))
      .finally(() => { if (alive) setLoading(false) })

    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && !busy) onClose()
      if ((ev.ctrlKey || ev.metaKey) && ev.key === 's') {
        ev.preventDefault()
        handleSaveValidity()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      alive = false
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  async function handleFileSelect(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0]
    if (!file) return

    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      setError('Nur PDF, JPG und PNG Dateien sind erlaubt')
      return
    }

    // Validate file size (5 MB)
    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      setError(`Datei zu groß. Maximum: ${Math.round(maxSize / 1024 / 1024)} MB`)
      return
    }

    setBusy(true)
    setError('')

    try {
      const buffer = await file.arrayBuffer()
      const base64 = bufferToBase64Safe(buffer)

      await (window as any).api?.taxExemption?.save?.({
        fileName: file.name,
        fileData: base64,
        mimeType: file.type,
        fileSize: file.size,
        validFrom: validFrom || undefined,
        validUntil: validUntil || undefined
      })

      // Reload certificate
      const res = await (window as any).api?.taxExemption?.get?.()
      const cert = res?.certificate
      setCertificate(cert)
      if (cert) {
        const isImage = cert.mimeType.startsWith('image/')
        if (isImage) {
          setPreviewUrl(`data:${cert.mimeType};base64,${cert.fileData}`)
        } else {
          setPreviewUrl('')
        }
      }

      onSaved?.()
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleSaveValidity() {
    if (!certificate) return
    setBusy(true)
    setError('')
    try {
      await (window as any).api?.taxExemption?.updateValidity?.({
        validFrom: validFrom || undefined,
        validUntil: validUntil || undefined
      })
      // Reload
      const res = await (window as any).api?.taxExemption?.get?.()
      setCertificate(res?.certificate)
      onSaved?.()
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    setError('')
    try {
      await (window as any).api?.taxExemption?.delete?.()
      setCertificate(null)
      setPreviewUrl('')
      setValidFrom('')
      setValidUntil('')
      setConfirmDelete(false)
      onSaved?.()
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleDownload() {
    if (!certificate) return
    try {
      // Create download link
      const link = document.createElement('a')
      link.href = `data:${certificate.mimeType};base64,${certificate.fileData}`
      link.download = certificate.fileName
      link.click()
    } catch (e: any) {
      setError('Download fehlgeschlagen: ' + (e?.message || String(e)))
    }
  }

  const isPdf = certificate?.mimeType === 'application/pdf'
  const isImage = certificate?.mimeType.startsWith('image/')

  function renderPreview() {
    if (!certificate) return null
    return (
      <div
        style={{
          flex: 1,
          border: '1px solid var(--border)',
          borderRadius: 8,
          overflow: 'hidden',
          minHeight: 260,
          maxHeight: '50vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--background)',
          position: 'relative'
        }}
      >
        {isImage && previewUrl && (
          <img
            src={previewUrl}
            alt="Bescheid Vorschau"
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        )}
        {isPdf && (
          <div style={{ textAlign: 'center', color: 'var(--text-dim)' }}>
            <div style={{ fontSize: 64, lineHeight: 1, marginBottom: 12 }}>📄</div>
            <div style={{ fontWeight: 500 }}>PDF Bescheid</div>
            <div className="helper" style={{ fontSize: 12 }}>Zum Speichern oder Ersetzen unten Aktionen nutzen</div>
          </div>
        )}
        {!isPdf && !isImage && (
          <div style={{ textAlign: 'center', color: 'var(--text-dim)' }}>
            <div style={{ fontSize: 56, lineHeight: 1, marginBottom: 12 }}>📎</div>
            <div>Keine Vorschau verfügbar</div>
          </div>
        )}
      </div>
    )
  }

  return createPortal(
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        background: 'color-mix(in oklab, var(--surface) 65%, transparent)',
        padding: '24px 16px',
        zIndex: 9999,
        overflowY: 'auto'
      }}
    >
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(920px, 96vw)',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 12,
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          background: 'var(--surface)'
        }}
      >
        {/* Header */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>📄 Steuerbefreiungsbescheid</h2>
            <div className="helper">Gemeinnützigkeitsbescheid für Spendenbescheinigungen</div>
          </div>
          <button className="btn ghost" onClick={onClose} aria-label="Schließen" style={{ fontSize: 20 }}>
            ✕
          </button>
        </header>

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, color: 'var(--text-dim)' }}>
            <div>Lade...</div>
          </div>
        )}
        {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}

        {!loading && !certificate && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div
              style={{
                border: '2px dashed var(--border)',
                borderRadius: 8,
                padding: 48,
                textAlign: 'center',
                color: 'var(--text-dim)'
              }}
            >
              <div style={{ fontSize: 48, marginBottom: 16 }}>📎</div>
              <div style={{ marginBottom: 8 }}>Kein Bescheid hinterlegt</div>
              <div className="helper" style={{ marginBottom: 16 }}>
                Laden Sie Ihren Gemeinnützigkeitsbescheid hoch (PDF, JPG, PNG - max. 5 MB)
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              <button
                className="btn primary"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
              >
                + Bescheid hochladen
              </button>
            </div>
          </div>
        )}

        {!loading && certificate && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minHeight: 0 }}>
            {/* Preview */}
            {renderPreview()}

            {/* File Info */}
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>{certificate.fileName}</strong>
                  <div className="helper">
                    {formatBytes(certificate.fileSize)} · Hochgeladen:{' '}
                    {new Date(certificate.uploadDate).toLocaleDateString('de-DE')}
                  </div>
                </div>
              </div>

              {/* Validity Dates */}
              <div className="row">
                <div className="field">
                  <label>Gültig von (optional)</label>
                  <input
                    className="input"
                    type="date"
                    value={validFrom}
                    onChange={(e) => setValidFrom(e.target.value)}
                    disabled={busy}
                  />
                </div>
                <div className="field">
                  <label>Gültig bis (optional)</label>
                  <input
                    className="input"
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    disabled={busy}
                  />
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn" onClick={handleDownload} disabled={busy}>
                  💾 Als Datei speichern
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
                <button className="btn" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                  📎 Neuen Bescheid hochladen
                </button>
                {!confirmDelete ? (
                  <button className="btn danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
                    🗑️ Bescheid löschen
                  </button>
                ) : (
                  <>
                    <button className="btn danger" onClick={handleDelete} disabled={busy}>
                      ⚠️ Wirklich löschen?
                    </button>
                    <button className="btn" onClick={() => setConfirmDelete(false)} disabled={busy}>
                      Abbrechen
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 16,
            paddingTop: 16,
            borderTop: '1px solid var(--border)'
          }}
        >
          <div className="helper" style={{ fontSize: 12 }}>
            Esc = Schließen{certificate ? ' · Strg+S = Speichern' : ''}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {certificate && (
              <button className="btn primary" onClick={handleSaveValidity} disabled={busy}>
                Speichern
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
