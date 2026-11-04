import React from 'react'
import type { StoragePaneProps } from '../types'

export function DoclingPane({ notify }: Pick<StoragePaneProps, 'notify'>) {
  const [busy, setBusy] = React.useState(false)
  const [ocrStatus, setOcrStatus] = React.useState<Awaited<ReturnType<typeof window.api.ocr.status>> | null>(null)

  const refresh = React.useCallback(async () => {
    setBusy(true)
    try {
      const nextOcr = await window.api.ocr.status()
      setOcrStatus(nextOcr)
    }
    catch (error: any) { notify('error', error?.message || String(error)) }
    finally { setBusy(false) }
  }, [notify])

  React.useEffect(() => { void refresh() }, [refresh])

  return (
    <div className="storage-pane docling-pane">
      <div>
        <strong>Texterkennung</strong>
        <div className="helper">Lokale Texterkennung für Rechnungen und Scans.</div>
      </div>

      <section className="card storage-section docling-settings-card">
        <div className="docling-settings-card__head">
          <div>
            <span className="settings-title"><strong>Integrierte OCR (Tesseract)</strong></span>
            <div className="helper">Für Scans und PDFs ohne Textschicht. Wird mit VereinO installiert und arbeitet vollständig offline.</div>
          </div>
          <span className={`docling-status${ocrStatus?.available ? ' is-installed' : ''}`}>
            {busy ? 'Prüfe …' : ocrStatus?.available ? `Bereit · ${ocrStatus.languages.join(', ')}` : 'Nicht verfügbar'}
          </span>
        </div>
        {!ocrStatus?.available && ocrStatus?.error && <div className="helper docling-settings-card__error">{ocrStatus.error}</div>}
      </section>

      <button className="btn btn-sm" disabled={busy} onClick={() => void refresh()}>Erneut prüfen</button>
    </div>
  )
}
