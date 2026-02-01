import React from 'react'
import { ImportPaneProps } from '../types'
import { createPortal } from 'react-dom'
import { ImportXlsxCard } from '../components/ImportXlsxCard'
import { MembersImportCard } from '../components/MembersImportCard'

type ImportTab = 'vouchers' | 'members'

// Lucide-style icon props
const iconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

// Vouchers/Receipt icon
const VouchersIcon = () => (
  <svg {...iconProps}>
    <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z" />
    <path d="M8 10h8" />
    <path d="M8 14h4" />
  </svg>
)

// Members/Users icon
const MembersIcon = () => (
  <svg {...iconProps}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)

/**
 * ImportPane - Data Import (XLSX & camt.053 XML)
 * Provides full import functionality: file upload, preview, mapping, and execution.
 */
export function ImportPane({ notify }: ImportPaneProps) {
  const [activeTab, setActiveTab] = React.useState<ImportTab>('vouchers')
  const [showLog, setShowLog] = React.useState(false)
  const [logRows, setLogRows] = React.useState<Array<{ id: number; createdAt: string; entity: string; action: string; diff?: any | null }>>([])
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState('')

  async function loadLog() {
    setErr(''); setBusy(true)
    try {
      const res = await window.api?.audit?.recent?.({ limit: 50 })
      const all = res?.rows || []
      const onlyImports = all.filter((r: any) => 
        (r.entity === 'imports' || r.entity === 'members_import') && r.action === 'EXECUTE'
      )
      setLogRows(onlyImports)
    } catch (e: any) { setErr(e?.message || String(e)) }
    finally { setBusy(false) }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <strong>Datenimport</strong>
          <div className="helper">Importiere Buchungen oder Mitglieder aus Excel-Dateien.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn" title="Import-Log anzeigen" onClick={() => { setShowLog(true); loadLog() }}>📝 Log</button>
        </div>
      </div>

      {/* Tab Buttons */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        <button
          className={`btn ${activeTab === 'vouchers' ? 'primary' : ''}`}
          onClick={() => setActiveTab('vouchers')}
          style={{ 
            borderRadius: '8px 8px 0 0',
            borderBottom: activeTab === 'vouchers' ? '2px solid var(--accent)' : '2px solid transparent',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <VouchersIcon /> Buchungen
        </button>
        <button
          className={`btn ${activeTab === 'members' ? 'primary' : ''}`}
          onClick={() => setActiveTab('members')}
          style={{ 
            borderRadius: '8px 8px 0 0',
            borderBottom: activeTab === 'members' ? '2px solid var(--accent)' : '2px solid transparent',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <MembersIcon /> Mitglieder
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'vouchers' && (
        <div>
          <div className="helper" style={{ marginBottom: 8 }}>
            Excel (.xlsx) oder camt.053 XML (.xml). Vorschau → Zuordnung prüfen → Import.
            <ul style={{ margin: '4px 0 0 16px' }}>
              <li>Empfohlen: Kopfzeile in Zeile 1, Daten ab Zeile 2. Keine zusammengeführten Zellen.</li>
              <li>Ein Datensatz pro Zeile. Summen-/Saldo-Zeilen werden ignoriert.</li>
              <li>Mindestens: Datum und Betrag (Brutto oder Netto+USt). Optional: Art, Sphäre, Zweckbindung, Zahlweg.</li>
              <li>Bank-/Bar-Split: Alternativ die vier Spalten Bank+/-, Bar+/- verwenden (erzeugt ggf. mehrere Buchungen pro Zeile).</li>
            </ul>
          </div>
          <ImportXlsxCard notify={notify} />
        </div>
      )}

      {activeTab === 'members' && (
        <div>
          <div className="helper" style={{ marginBottom: 8 }}>
            Excel (.xlsx) mit Mitgliederdaten. Vorschau → Zuordnung prüfen → Import.
            <ul style={{ margin: '4px 0 0 16px' }}>
              <li>Pflichtfelder: Mitgliedsnummer, Eintrittsdatum und Name (oder Vor-/Nachname).</li>
              <li>Optional: E-Mail, Telefon, Adresse, Status, Beitrag, SEPA-Daten, Notizen.</li>
              <li>Adresse kann vollständig oder als Straße/PLZ/Ort aufgeteilt sein.</li>
              <li>Bestehende Mitglieder können optional aktualisiert werden (nach Mitgliedsnummer).</li>
            </ul>
          </div>
          <MembersImportCard notify={notify} />
        </div>
      )}

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
                      <th align="left">Typ</th>
                      <th align="right">Importiert</th>
                      <th align="right">Aktualisiert</th>
                      <th align="right">Übersprungen</th>
                      <th align="right">Fehler</th>
                      <th align="left">Fehler-Datei</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logRows.map((r, i) => {
                      const d = r.diff || {}
                      const isMember = r.entity === 'members_import'
                      const fmt = isMember ? 'Mitglieder' : (d.format || 'Buchungen')
                      const errCnt = Number(d.errorCount || 0)
                      return (
                        <tr key={r.id || i}>
                          <td>{new Date(r.createdAt || d.when || '').toLocaleString()}</td>
                          <td>{fmt}</td>
                          <td align="right">{d.imported ?? '—'}</td>
                          <td align="right">{d.updated ?? '—'}</td>
                          <td align="right">{d.skipped ?? '—'}</td>
                          <td align="right" style={{ color: errCnt > 0 ? 'var(--danger)' : undefined }}>{errCnt}</td>
                          <td>{d.errorFilePath ? (
                            <button className="btn" onClick={() => window.api?.shell?.showItemInFolder?.(d.errorFilePath)} title={String(d.errorFilePath)}>Öffnen</button>
                          ) : '—'}</td>
                        </tr>
                      )
                    })}
                    {logRows.length === 0 && (
                      <tr><td colSpan={7} className="helper">Keine Einträge vorhanden.</td></tr>
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
