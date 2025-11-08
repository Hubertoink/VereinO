import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'

interface ImportXlsxCardProps {
  notify?: (type: 'success' | 'error' | 'info', text: string, ms?: number, action?: { label: string; onClick: () => void }) => void
}

export function ImportXlsxCard({ notify }: ImportXlsxCardProps) {
  const [fileName, setFileName] = useState<string>('')
  const [base64, setBase64] = useState<string>('')
  const [headers, setHeaders] = useState<string[]>([])
  const [sample, setSample] = useState<Array<Record<string, any>>>([])
  const [headerRowIndex, setHeaderRowIndex] = useState<number | null>(null)
  const [mapping, setMapping] = useState<Record<string, string | null>>({
    date: null,
    type: null,
    sphere: null,
    description: null,
    paymentMethod: null,
    netAmount: null,
    vatRate: null,
    grossAmount: null,
    inGross: null,
    outGross: null,
    earmarkCode: null,
    bankIn: null,
    bankOut: null,
    cashIn: null,
    cashOut: null,
    defaultSphere: 'IDEELL'
  })
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<null | {
    imported: number
    skipped: number
    errors: Array<{ row: number; message: string }>
    rowStatuses?: Array<{ row: number; ok: boolean; message?: string }>
    errorFilePath?: string
  }>(null)
  const [showErrorsModal, setShowErrorsModal] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [error, setError] = useState<string>('')

  function bufferToBase64(buf: ArrayBuffer) {
    const bytes = new Uint8Array(buf)
    const chunk = 0x8000
    let binary = ''
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null as any, bytes.subarray(i, i + chunk) as any)
    }
    return btoa(binary)
  }

  async function processFile(f: File) {
    setError('')
    setResult(null)
    setFileName(f.name)
    try {
      const buf = await f.arrayBuffer()
      const b64 = bufferToBase64(buf)
      setBase64(b64)
      setBusy(true)
      try {
        const prev = await window.api?.imports.preview?.({ fileBase64: b64 })
        if (prev) {
          setHeaders(prev.headers)
          setSample(prev.sample as any)
          setMapping(prev.suggestedMapping)
          setHeaderRowIndex((prev as any).headerRowIndex ?? null)
        }
      } finally {
        setBusy(false)
      }
    } catch (e: any) {
      setError('Datei konnte nicht gelesen werden: ' + (e?.message || String(e)))
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    await processFile(f)
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    const f = e.dataTransfer?.files?.[0]
    if (f) processFile(f)
  }

  async function onImport() {
    setError('')
    if (!base64) {
      setError('Bitte zuerst eine XLSX-Datei auswählen.')
      return
    }
    setBusy(true)
    try {
      const res = await window.api?.imports.execute?.({ fileBase64: base64, mapping })
      if (res) {
        setResult(res)
        // let app know data changed
        window.dispatchEvent(new Event('data-changed'))
        if ((res.errors?.length || 0) > 0) {
          setShowErrorsModal(true)
          if (res.errorFilePath) {
            notify?.('info', `Fehler-Excel gespeichert: ${res.errorFilePath}`)
          }
        } else {
          notify?.('success', `Import abgeschlossen: ${res.imported} importiert, ${res.skipped} übersprungen`)
        }
      }
    } catch (e: any) {
      setResult(null)
      setError('Import fehlgeschlagen: ' + (e?.message || String(e)))
    } finally {
      setBusy(false)
    }
  }

  const fieldKeys: Array<{ key: string; label: string; required?: boolean; enumValues?: string[] }> = [
    { key: 'date', label: 'Datum', required: true },
    { key: 'type', label: 'Art (IN/OUT/TRANSFER)' },
    { key: 'sphere', label: 'Sphäre (IDEELL/ZWECK/VERMOEGEN/WGB)', required: true },
    { key: 'description', label: 'Beschreibung' },
    { key: 'paymentMethod', label: 'Zahlweg (BAR/BANK)' },
    { key: 'netAmount', label: 'Netto' },
    { key: 'vatRate', label: 'Umsatzsteuersatz in Prozent' },
    { key: 'grossAmount', label: 'Brutto' },
    { key: 'inGross', label: 'Einnahmen (Brutto)' },
    { key: 'outGross', label: 'Ausgaben (Brutto)' },
    { key: 'earmarkCode', label: 'Zweckbindung-Code' },
    { key: 'bankIn', label: 'Bankkonto + (Einnahmen)' },
    { key: 'bankOut', label: 'Bankkonto - (Ausgaben)' },
    { key: 'cashIn', label: 'Barkonto + (Einnahmen)' },
    { key: 'cashOut', label: 'Barkonto - (Ausgaben)' },
    {
      key: 'defaultSphere',
      label: 'Standard-Sphäre (Fallback)',
      enumValues: ['IDEELL', 'ZWECK', 'VERMOEGEN', 'WGB']
    }
  ]

  // Helper to render a single mapping field with label and select
  const Field = ({ keyName, tooltip }: { keyName: string; tooltip?: string }) => {
    const f = fieldKeys.find((k) => k.key === keyName)!
    const current = mapping[f.key] || ''
    const requiredMark = f.required ? ' *' : ''
    return (
      <label key={f.key} title={tooltip} className="field-row">
        <span className="field-label">
          {f.label}
          {requiredMark}
        </span>
        {f.enumValues ? (
          <select
            className="input"
            value={current}
            onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value || null })}
          >
            {f.enumValues.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        ) : (
          <select
            className="input"
            value={current}
            onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value || null })}
          >
            <option value="">— nicht zuordnen —</option>
            {headers.map((h) => (
              <option key={h} value={h}>
                {h || '(leer)'}
              </option>
            ))}
          </select>
        )}
      </label>
    )
  }

  return (
    <div className="card" style={{ padding: 12 }}>
      <input ref={fileRef} type="file" accept=".xlsx,.xml" hidden onChange={onPickFile} />
      <div
        className="input"
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onDrop={onDrop}
        style={{
          marginTop: 4,
          padding: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          borderRadius: 12,
          border: '1px dashed var(--border)'
        }}
        title="Datei hier ablegen oder auswählen"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            Datei auswählen
          </button>
          <span className="helper">{fileName || 'Keine ausgewählt'}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn"
            onClick={async () => {
              try {
                const res = await window.api?.imports.template?.()
                if (res?.filePath) {
                  setError('')
                  setResult(null)
                  if (notify) {
                    notify('success', `Vorlage gespeichert: ${res.filePath}`, 5000, {
                      label: 'Ordner öffnen',
                      onClick: () => window.api?.shell?.showItemInFolder?.(res.filePath)
                    })
                  }
                }
              } catch (e: any) {
                const msg = e?.message || String(e)
                if (msg && /abbruch/i.test(msg)) return
                setError('Vorlage konnte nicht erstellt werden: ' + msg)
                notify?.('error', 'Vorlage konnte nicht erstellt werden: ' + msg)
              }
            }}
          >
            Vorlage herunterladen
          </button>
          <button
            className="btn"
            onClick={async () => {
              try {
                const res = await window.api?.imports.testdata?.()
                if (res?.filePath) {
                  setError('')
                  setResult(null)
                  if (notify) {
                    notify('success', `Testdatei gespeichert: ${res.filePath}`, 5000, {
                      label: 'Ordner öffnen',
                      onClick: () => window.api?.shell?.showItemInFolder?.(res.filePath)
                    })
                  }
                }
              } catch (e: any) {
                const msg = e?.message || String(e)
                if (msg && /abbruch/i.test(msg)) return
                setError('Testdatei konnte nicht erstellt werden: ' + msg)
                notify?.('error', 'Testdatei konnte nicht erstellt werden: ' + msg)
              }
            }}
          >
            Testdatei erzeugen
          </button>
          {/* Import-Button wandert nach unten, erscheint erst nach geladener Vorschau */}
        </div>
      </div>
      {busy && <div style={{ marginTop: 8 }}>Lade …</div>}
      {error && <div style={{ marginTop: 8, color: 'var(--danger)' }}>{error}</div>}
      {headers.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <strong>Zuordnung</strong>
          </div>
          <div className="helper" style={{ marginTop: 6 }}>
            <ul style={{ margin: '4px 0 0 16px' }}>
              <li>Beste Lesbarkeit: Kopfzeile in Zeile 1, Daten ab Zeile 2 (erkannte Kopfzeile: Zeile {headerRowIndex || 1}).</li>
              <li>Keine zusammengeführten Zellen oder Leerzeilen im Kopfbereich.</li>
              <li>Ein Datensatz pro Zeile. Summen-/Saldo-Zeilen werden automatisch ignoriert.</li>
              <li>Mindestens Datum und ein Betrag (Brutto oder Netto+USt). Optional: Art (IN/OUT/TRANSFER), Sphäre, Zweckbindung, Zahlweg.</li>
              <li>Tipp: Nutze "Vorlage herunterladen" bzw. "Testdatei erzeugen" als Referenz.</li>
            </ul>
          </div>
          <div className="helper">Ordne die Felder den Spaltenüberschriften deiner Datei zu.</div>
          <div className="group-grid" style={{ marginTop: 8 }}>
            <div className="field-group fg-meta">
              <div className="group-title">📋 Basisdaten</div>
              <Field keyName="date" tooltip="Datum der Buchung" />
              <Field keyName="description" tooltip="Beschreibung / Verwendungszweck" />
              <Field
                keyName="type"
                tooltip="Art der Buchung: Einnahme (IN), Ausgabe (OUT), Umbuchung (TRANSFER)"
              />
              <Field
                keyName="sphere"
                tooltip="Sphäre aus der Datei. Wenn leer, wird die Standard-Sphäre genutzt."
              />
              <Field keyName="earmarkCode" tooltip="Zweckbindung als Code/Abkürzung" />
            </div>
            <div className="field-group fg-amounts">
              <div className="group-title">💶 Beträge</div>
              <Field keyName="netAmount" tooltip="Netto-Betrag" />
              <Field keyName="vatRate" tooltip="Umsatzsteuersatz in Prozent" />
              <Field keyName="grossAmount" tooltip="Brutto-Betrag" />
              <Field keyName="inGross" tooltip="Einnahmen (Brutto) — alternative Spalte" />
              <Field keyName="outGross" tooltip="Ausgaben (Brutto) — alternative Spalte" />
            </div>
            <div className="field-group fg-payment">
              <div className="group-title">💳 Zahlungsart</div>
              <Field keyName="paymentMethod" tooltip="Zahlweg: BAR oder BANK" />
            </div>
            <div className="field-group fg-accounts">
              <div className="group-title">🏪 Kontenspalten</div>
              <Field keyName="bankIn" tooltip="Bankkonto Einnahmen (+)" />
              <Field keyName="bankOut" tooltip="Bankkonto Ausgaben (-)" />
              <Field keyName="cashIn" tooltip="Barkonto Einnahmen (+)" />
              <Field keyName="cashOut" tooltip="Barkonto Ausgaben (-)" />
            </div>
            <div className="field-group fg-defaults">
              <div className="group-title">⚙️ Standardwerte</div>
              <div className="field-row" style={{ alignItems: 'center' }}>
                <Field
                  keyName="defaultSphere"
                  tooltip="Fallback Sphäre, wenn keine Sphäre-Spalte zugeordnet ist"
                />
                <span
                  className="badge badge-default"
                  title="Wird verwendet, wenn keine Sphäre-Spalte gewählt ist"
                >
                  Fallback
                </span>
              </div>
            </div>
          </div>
          <details className="mapping-summary" style={{ marginTop: 8 }}>
            <summary>Zuordnungsübersicht</summary>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {fieldKeys.map((f) => (
                <div key={f.key} className="pair">
                  <span className="k">{f.label}</span>
                  <span className="v">{mapping[f.key] || '—'}</span>
                </div>
              ))}
            </div>
          </details>
          <div className="helper" style={{ marginTop: 6 }}>
            Hinweise:
            <ul style={{ margin: '4px 0 0 16px' }}>
              <li>
                Entweder Netto+USt oder Brutto muss zugeordnet sein — oder nutze die vier Spalten
                Bankkonto+/-, Barkonto+/-. Bei letzteren werden automatisch mehrere Buchungen je Zeile
                erzeugt.
              </li>
              <li>"Standard-Sphäre" wird verwendet, wenn keine Sphäre-Spalte vorhanden ist.</li>
              <li>
                Summenzeilen wie "Ergebnis/Summe/Saldo" werden automatisch übersprungen.
              </li>
            </ul>
          </div>
        </div>
      )}
      {/* Bottom-only Import button, shown once headers/preview are available */}
      {headers.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn primary" onClick={onImport} disabled={!base64 || busy}>
            Import starten
          </button>
        </div>
      )}
      {sample.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <strong>Vorschau (erste 20 Zeilen)</strong>
          <div style={{ overflowX: 'auto', marginTop: 6 }}>
            <table cellPadding={6}>
              <thead>
                <tr>
                  {headers.map((h) => (
                    <th key={h} align="left">
                      {h || '(leer)'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sample.map((row, i) => {
                  // If we have a recent result, color-code by status: green for imported, dim/red for skipped/errors.
                  const st = result?.rowStatuses?.find(
                    (rs) => rs.row === (headerRowIndex || 1) + 1 + i
                  )
                  const bg = st
                    ? st.ok
                      ? 'color-mix(in oklab, var(--success) 12%, transparent)'
                      : 'color-mix(in oklab, var(--danger) 10%, transparent)'
                    : undefined
                  const title = st?.message
                  return (
                    <tr key={i} style={{ background: bg }} title={title}>
                      {headers.map((h) => (
                        <td key={h}>{String(row[h] ?? '')}</td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {result && (
        <div className="card" style={{ marginTop: 8, padding: 10 }}>
          <strong>Ergebnis</strong>
          <div className="helper">
            Importiert: {result.imported} | Übersprungen: {result.skipped}
          </div>
          {result.errorFilePath && (
            <div style={{ marginTop: 6 }}>
              <div className="helper">Fehler-Datei gespeichert:</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <code style={{ userSelect: 'all' }}>{result.errorFilePath}</code>
                <button
                  className="btn"
                  onClick={() => {
                    navigator.clipboard?.writeText(result.errorFilePath || '')
                    notify?.('info', 'Pfad in Zwischenablage kopiert')
                  }}
                >
                  Pfad kopieren
                </button>
              </div>
            </div>
          )}
          {result.errors?.length ? (
            <details style={{ marginTop: 6 }}>
              <summary>Fehlerdetails anzeigen ({result.errors.length})</summary>
              <ul style={{ marginTop: 6 }}>
                {result.errors.slice(0, 20).map((e, idx) => (
                  <li key={idx}>
                    Zeile {e.row}: {e.message}
                  </li>
                ))}
                {result.errors.length > 20 && <li>… weitere {result.errors.length - 20} Fehler</li>}
              </ul>
            </details>
          ) : null}
        </div>
      )}
      {showErrorsModal &&
        result &&
        createPortal(
          <div
            className="modal-overlay"
            onClick={() => setShowErrorsModal(false)}
            role="dialog"
            aria-modal="true"
            style={{ zIndex: 10000 }}
          >
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
              <header
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8
                }}
              >
                <h2 style={{ margin: 0 }}>
                  Import abgeschlossen — einige Zeilen konnten nicht übernommen werden
                </h2>
                <button className="btn danger" onClick={() => setShowErrorsModal(false)}>
                  Schließen
                </button>
              </header>
              <div className="helper">
                Importiert: {result.imported} | Übersprungen: {result.skipped} | Fehler:{' '}
                {result.errors?.length || 0}
              </div>
              {result.errorFilePath && (
                <div style={{ marginTop: 8 }}>
                  <div className="helper">
                    Die fehlgeschlagenen Zeilen wurden als Excel gespeichert unter:
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <code style={{ userSelect: 'all' }}>{result.errorFilePath}</code>
                    <button
                      className="btn"
                      onClick={() => {
                        navigator.clipboard?.writeText(result.errorFilePath || '')
                        notify?.('info', 'Pfad in Zwischenablage kopiert')
                      }}
                    >
                      Pfad kopieren
                    </button>
                  </div>
                </div>
              )}
              {(result.errors?.length || 0) > 0 && (
                <div style={{ marginTop: 12 }}>
                  <strong>Fehlerhafte Zeilen</strong>
                  <ul style={{ marginTop: 6, maxHeight: 280, overflowY: 'auto' }}>
                    {result.errors.slice(0, 50).map((e, idx) => (
                      <li key={idx}>
                        Zeile {e.row}: {e.message}
                      </li>
                    ))}
                    {result.errors.length > 50 && (
                      <li>
                        … weitere {result.errors.length - 50} Fehler — siehe gespeicherte Excel-Datei
                      </li>
                    )}
                  </ul>
                  <div className="helper" style={{ marginTop: 6 }}>
                    Bitte prüfe die gelisteten Zeilen und trage die Datensätze bei Bedarf manuell nach.
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <button className="btn" onClick={() => setShowErrorsModal(false)}>
                  OK
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
