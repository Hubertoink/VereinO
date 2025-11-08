import React from 'react'
import { ImportPaneProps } from '../types'
import { createPortal } from 'react-dom'
import { ImportXlsxCard } from '../components/ImportXlsxCard'

/**
 * ImportPane - Data Import (XLSX & camt.053 XML)
 * Provides full import functionality: file upload, preview, mapping, and execution.
 */
export function ImportPane({ notify }: ImportPaneProps) {
  const [showLog, setShowLog] = React.useState(false)
  const [logRows, setLogRows] = React.useState<Array<{ id: number; createdAt: string; entity: string; action: string; diff?: any | null }>>([])
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState('')

  async function loadLog() {
    setErr(''); setBusy(true)
    try {
      const res = await window.api?.audit?.recent?.({ limit: 50 })
      const all = res?.rows || []
      const onlyImports = all.filter((r: any) => r.entity === 'imports' && r.action === 'EXECUTE')
      setLogRows(onlyImports)
    } catch (e: any) { setErr(e?.message || String(e)) }
    finally { setBusy(false) }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <strong>Datenimport</strong>
          <div className="helper">Excel (.xlsx) oder camt.053 XML (.xml). Vorschau → Zuordnung prüfen → Import.</div>
          {/* Erklärungstext dauerhaft unter der Überschrift */}
          <div className="helper">
            <ul style={{ margin: '4px 0 0 16px' }}>
              <li>Empfohlen: Kopfzeile in Zeile 1, Daten ab Zeile 2. Keine zusammengeführten Zellen.</li>
              <li>Ein Datensatz pro Zeile. Summen-/Saldo-Zeilen werden ignoriert.</li>
              <li>Mindestens: Datum und Betrag (Brutto oder Netto+USt). Optional: Art, Sphäre, Zweckbindung, Zahlweg.</li>
              <li>Bank-/Bar-Split: Alternativ die vier Spalten Bank+/-, Bar+/- verwenden (erzeugt ggf. mehrere Buchungen pro Zeile).</li>
            </ul>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn" title="Import-Log anzeigen" onClick={() => { setShowLog(true); loadLog() }}>📝 Log</button>
        </div>
      </div>

      {/* Full Excel/camt.053 XML import functionality */}
      <ImportXlsxCard notify={notify} />

      {showLog && createPortal(
        <div className="modal-overlay" onClick={() => setShowLog(false)} role="dialog" aria-modal="true">
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ display: 'grid', gap: 10, width: 'min(900px, 96vw)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0 }}>Import-Log</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" onClick={loadLog} disabled={busy}>Aktualisieren</button>
                <button className="btn danger" onClick={() => setShowLog(false)}>Schließen</button>
              </div>
            </div>
            {err && <div style={{ color: 'var(--danger)' }}>{err}</div>}
            {busy && <div className="helper">Lade …</div>}
            {!busy && (
              <div style={{ overflowX: 'auto' }}>
                <table cellPadding={6} style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th align="left">Zeit</th>
                      <th align="left">Format</th>
                      <th align="right">Importiert</th>
                      <th align="right">Übersprungen</th>
                      <th align="right">Fehler</th>
                      <th align="left">Fehler-Datei</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logRows.map((r, i) => {
                      const d = r.diff || {}
                      const fmt = d.format || 'XLSX'
                      const errCnt = Number(d.errorCount || 0)
                      return (
                        <tr key={r.id || i}>
                          <td>{new Date(r.createdAt || d.when || '').toLocaleString()}</td>
                          <td>{fmt}</td>
                          <td align="right">{d.imported ?? '—'}</td>
                          <td align="right">{d.skipped ?? '—'}</td>
                          <td align="right" style={{ color: errCnt > 0 ? 'var(--danger)' : undefined }}>{errCnt}</td>
                          <td>{d.errorFilePath ? (
                            <button className="btn" onClick={() => window.api?.shell?.showItemInFolder?.(d.errorFilePath)} title={String(d.errorFilePath)}>Öffnen</button>
                          ) : '—'}</td>
                        </tr>
                      )
                    })}
                    {logRows.length === 0 && (
                      <tr><td colSpan={6} className="helper">Keine Einträge vorhanden.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>, document.body)
      }
    </div>
  )
}
