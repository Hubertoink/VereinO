import React from 'react'
import HoverTooltip from '../../../components/common/HoverTooltip'
import type { StoragePaneProps } from '../types'

export function DoclingPane({ notify }: Pick<StoragePaneProps, 'notify'>) {
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState<Awaited<ReturnType<typeof window.api.docling.status>> | null>(null)

  const refresh = React.useCallback(async (force = false) => {
    setBusy(true)
    try { setStatus(await window.api.docling.status(force)) }
    catch (error: any) { notify('error', error?.message || String(error)) }
    finally { setBusy(false) }
  }, [notify])

  React.useEffect(() => { void refresh() }, [refresh])

  return (
    <div className="storage-pane docling-pane">
      <div>
        <strong>Docling</strong>
        <div className="helper">Lokale Dokumentanalyse für Rechnungen, Scans und Batch-Grundentwürfe.</div>
      </div>

      <section className="card storage-section docling-settings-card">
        <div className="docling-settings-card__head">
          <div>
            <span className="settings-title">
              <strong>Lokale Dokumentanalyse</strong>
              <HoverTooltip<HTMLButtonElement>
                preferredPlacement="bottom"
                content={(
                  <span>
                    Docling wird nicht automatisch installiert. Installiere Python 3 und führe in
                    PowerShell <code>py -3 -m pip install docling</code> aus. Falls der Python-Launcher
                    fehlt, nutze <code>python -m pip install docling</code>. Danach erneut prüfen.
                    Dokumente bleiben bei der Verarbeitung auf diesem Gerät.
                  </span>
                )}
              >
                {({ ref, props }) => (
                  <button ref={ref} {...props} type="button" className="settings-info-icon" aria-label="Installationshilfe für Docling">i</button>
                )}
              </HoverTooltip>
            </span>
            <div className="helper">Optionales lokales OCR und Layoutverständnis ohne Cloud-Upload.</div>
          </div>
          <span className={`docling-status${status?.installed ? ' is-installed' : ''}`}>
            {busy ? 'Prüfe …' : status?.installed ? `Installiert${status.version ? ` · ${status.version}` : ''}` : 'Nicht installiert'}
          </span>
        </div>

        <div className="docling-settings-card__controls">
          <label className="settings-toggle-card__copy" htmlFor="toggle-docling">
            <strong>Docling verwenden</strong>
            <span>{status?.enabled ? `Aktiv über ${status.runtime || 'Python'}` : 'Bestehende Verarbeitung bleibt unverändert.'}</span>
          </label>
          <input
            id="toggle-docling"
            role="switch"
            aria-checked={Boolean(status?.enabled)}
            className="toggle"
            type="checkbox"
            checked={Boolean(status?.enabled)}
            disabled={busy || !status?.installed}
            onChange={async (event) => {
              setBusy(true)
              try {
                const next = await window.api.docling.setEnabled(event.target.checked)
                setStatus(next)
                notify('success', next.enabled ? 'Docling aktiviert.' : 'Docling deaktiviert.')
              } catch (error: any) { notify('error', error?.message || String(error)) }
              finally { setBusy(false) }
            }}
          />
          <button className="btn btn-sm" disabled={busy} onClick={() => void refresh(true)}>Erneut prüfen</button>
        </div>

        {!status?.installed && status?.error && <div className="helper docling-settings-card__error">{status.error}</div>}
      </section>
    </div>
  )
}
