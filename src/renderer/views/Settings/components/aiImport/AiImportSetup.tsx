import { useRef, useState } from 'react'
import { IconAlertTriangle, IconChevronRight, IconFileSpreadsheet, IconHistory, IconInfoCircle, IconUpload } from '@tabler/icons-react'
import type { AiImportOptions, AiImportPreview, AiImportSession } from '../../../../../../shared/aiImport'
import { fieldLabels, statusLabels, type FieldKey } from './model'

type RecentJob = Pick<AiImportSession, 'id' | 'fileName' | 'status' | 'updatedAt'>

export function AiImportSetup({ recent, busy, fileName, preview, sheetName, mapping, options, onOpenJob, onDeleteJob, onFile, onDropError, onSheet, onMapping, onOptions }: {
  recent: readonly RecentJob[]
  busy: boolean
  fileName?: string
  preview: AiImportPreview | null
  sheetName: string
  mapping: Record<string, string | null>
  options: AiImportOptions
  onOpenJob: (id: string) => void
  onDeleteJob: (id: string) => void
  onFile: (file: File) => void
  onDropError: (message: string) => void
  onSheet: (name: string) => void
  onMapping: (mapping: Record<string, string | null>) => void
  onOptions: (options: AiImportOptions) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [contextJob, setContextJob] = useState<string | null>(null)
  const [deleteJob, setDeleteJob] = useState<string | null>(null)
  const general = preview?.profile === 'GENERAL'
  const sheet = preview?.sheets.find(s => s.name === sheetName)
  const fields = (Object.keys(fieldLabels) as FieldKey[]).filter(f => general ? f !== 'sphere' : f !== 'category')
  const recognized = fields.filter(f => mapping[f]).length
  const missing = [!mapping.date && 'Datum', !mapping.description && 'Beschreibung', !mapping.grossAmount && !mapping.inGross && !mapping.outGross && 'Betrag'].filter(Boolean) as string[]

  return <div className="ai-import-setup">
    {recent.length > 0 && !fileName && <section className="ai-import-section" aria-labelledby="ai-import-recent-title">
      <header className="ai-import-section__head"><IconHistory size={18} aria-hidden="true" /><div><h3 id="ai-import-recent-title">Gespeicherte Importaufträge ({recent.length})</h3><p>Angefangene Prüfungen fortsetzen – Änderungen bleiben erhalten.</p></div></header>
      <ul className="ai-import-recent">{recent.map(job => {
        const date = new Date(job.updatedAt).toLocaleDateString('de-DE')
        return <li key={job.id} onContextMenu={e => { e.preventDefault(); setContextJob(job.id) }}><button type="button" disabled={busy} aria-label={`${job.fileName} · ${statusLabels[job.status]} · ${date}`} onClick={() => onOpenJob(job.id)}>
          <IconFileSpreadsheet size={18} aria-hidden="true" /><span className="ai-import-recent__name">{job.fileName}</span><span className="ai-import-recent__date">{date}</span>
          <span className={`ai-import-pill is-job-${job.status}`}>{statusLabels[job.status]}</span><IconChevronRight size={16} aria-hidden="true" />
        </button>{contextJob === job.id && <div role="menu" aria-label="Importauftrag" onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); setContextJob(null) } }}><button autoFocus role="menuitem" disabled={busy} onClick={() => { setDeleteJob(job.id); setContextJob(null) }}>Importauftrag entfernen</button><button role="menuitem" onClick={() => setContextJob(null)}>Abbrechen</button></div>}</li>
      })}</ul>
    </section>}
    {deleteJob && <div className="ai-import-delete-confirm" role="alertdialog" aria-modal="true" aria-label="Importauftrag entfernen?"><h3>Importauftrag entfernen?</h3><p>Der gespeicherte Entwurf wird gelöscht. Bereits übernommene Buchungen bleiben erhalten. Eine laufende Analyse wird beendet.</p><button className="btn" disabled={busy} onClick={() => setDeleteJob(null)}>Behalten</button><button className="btn danger" disabled={busy} onClick={() => { onDeleteJob(deleteJob); setDeleteJob(null) }}>Entfernen</button></div>}

    <section className="ai-import-section" aria-labelledby="ai-import-file-title">
      <header className="ai-import-section__head"><span className="ai-import-section__num">1</span><div><h3 id="ai-import-file-title">Datei auswählen</h3><p>Excel (.xlsx) oder CSV bis 10 MB, höchstens 500 Buchungszeilen.</p></div></header>
      <input ref={fileRef} type="file" accept=".xlsx,.csv" hidden onChange={e => { if (e.target.files?.[0]) onFile(e.target.files[0]); e.target.value = '' }} />
      <div className={`ai-import-file ${dragging ? 'is-dragging' : ''} ${fileName ? 'has-file' : ''}`}
        onDragEnter={e => { e.preventDefault(); setDragging(true) }}
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = busy ? 'none' : 'copy' }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false) }}
        onDrop={e => { e.preventDefault(); setDragging(false); if (busy) return; if (e.dataTransfer.files.length !== 1) { onDropError('Bitte genau eine Datei ablegen.'); return } onFile(e.dataTransfer.files[0]) }}>
        <span className="ai-import-file__icon">{fileName ? <IconFileSpreadsheet size={24} aria-hidden="true" /> : <IconUpload size={24} aria-hidden="true" />}</span>
        {fileName ? <div className="ai-import-file__text"><strong>{fileName}</strong><span>{sheet ? `${sheet.count} Zeilen im Blatt „${sheet.name}“ · Kopfzeile ${sheet.headerRow}` : 'Datei wird gelesen …'}</span></div>
          : <div className="ai-import-file__text"><strong>Datei hier ablegen</strong><span>oder über den Dateidialog auswählen</span></div>}
        <button type="button" className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>{fileName ? 'Andere Datei wählen' : 'Excel / CSV auswählen'}</button>
      </div>
      {preview && preview.sheets.length > 1 && <label className="ai-import-field ai-import-field--inline">Tabellenblatt<select className="input" disabled={busy} value={sheetName} onChange={e => onSheet(e.target.value)}>{preview.sheets.map(s => <option key={s.name} value={s.name}>{s.name} · {s.count} Zeilen</option>)}</select></label>}
    </section>

    {preview && sheet && <>
      <section className="ai-import-section" aria-labelledby="ai-import-mapping-title">
        <header className="ai-import-section__head"><span className="ai-import-section__num">2</span><div><h3 id="ai-import-mapping-title">Spalten prüfen</h3><p>{recognized} von {fields.length} Feldern erkannt. Nicht erkannte Felder ergänzt die KI, soweit möglich.</p></div></header>
        {missing.length > 0 && <p className="ai-import-callout is-warning"><IconAlertTriangle size={16} aria-hidden="true" />Keine Spalte für {missing.join(', ')} erkannt. Bitte unten zuordnen.</p>}
        <ul className="ai-import-mapping-chips">{fields.filter(f => mapping[f]).map(f => <li key={f}><span>{fieldLabels[f]}</span><b title={mapping[f] || ''}>{mapping[f]}</b></li>)}</ul>
        <details className="ai-import-disclosure" open={missing.length > 0 || undefined}><summary>Spaltenzuordnung anpassen</summary>
          <div className="ai-import-mapping">{fields.map(field => <label key={field} className="ai-import-field">{fieldLabels[field]}<select className="input" disabled={busy} value={mapping[field] || ''} onChange={e => onMapping({ ...mapping, [field]: e.target.value || null })}><option value="">Nicht zugeordnet</option>{sheet.headers.map(h => <option key={h}>{h}</option>)}</select></label>)}</div>
          <div className="ai-import-table-scroll ai-import-sample"><table><caption>Vorschau der ersten Zeilen</caption><thead><tr>{sheet.headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{sheet.sample.slice(0, 3).map((r, i) => <tr key={i}>{sheet.headers.map(h => <td key={h}>{String(r[h] ?? '')}</td>)}</tr>)}</tbody></table></div>
        </details>
      </section>

      <section className="ai-import-section" aria-labelledby="ai-import-rules-title">
        <header className="ai-import-section__head"><span className="ai-import-section__num">3</span><div><h3 id="ai-import-rules-title">Zuordnungsregeln</h3><p>Lege fest, wie frei die KI Konten, Tags und Budgets vorschlagen darf.</p></div></header>
        <div className="ai-import-setup-grid">
          <label className="ai-import-field">Standardkonto für leere Kontofelder<select className="input" disabled={busy} value={options.defaultAccount} onChange={e => onOptions({ ...options, defaultAccount: e.target.value })}><option value="">Aus Datei / KI-Vorschlag</option>{preview.accounts.map((a, i) => <option key={`${a.id}-${i}`} value={a.label}>{a.label}</option>)}</select></label>
          <label className="ai-import-field">Tags<select className="input" disabled={busy} value={options.tags} onChange={e => onOptions({ ...options, tags: e.target.value as AiImportOptions['tags'] })}><option value="none">Nur Angaben aus der Datei</option><option value="existing">Vorhandene Tags zuordnen</option><option value="suggest">Auch gemeinsame neue Tags vorschlagen</option></select></label>
          <label className="ai-import-field">Budgets<select className="input" disabled={busy} value={options.budgets} onChange={e => onOptions({ ...options, budgets: e.target.value as AiImportOptions['budgets'] })}><option value="none">Nur Angaben aus der Datei</option><option value="existing">Vorhandene Budgets zuordnen</option><option value="suggest">Auch neue Budgetgruppen vorschlagen</option></select></label>
          {general && <label className="ai-import-check"><input type="checkbox" disabled={busy} checked={options.suggestCategories} onChange={e => onOptions({ ...options, suggestCategories: e.target.checked })} /> Neue Kategorien vorschlagen, wenn keine vorhandene passt</label>}
        </div>
      </section>

      <section className="ai-import-section" aria-labelledby="ai-import-guidance-title">
        <header className="ai-import-section__head"><span className="ai-import-section__num">4</span><div><h3 id="ai-import-guidance-title">Kontext für die KI <span className="ai-import-optional">optional</span></h3><p>Kurze Hinweise verbessern die Zuordnung deutlich.</p></div></header>
        <label className="ai-import-field">Hinweise an die KI<textarea className="input" rows={3} maxLength={4000} disabled={busy} value={options.guidance} onChange={e => onOptions({ ...options, guidance: e.target.value })} placeholder="Zum Beispiel: Die Liste enthält Ausgaben unserer Barkasse. Tags bitte grob nach Material, Fahrtkosten und Veranstaltungen gruppieren." /></label>
      </section>

      <p className="ai-import-callout is-info"><IconInfoCircle size={16} aria-hidden="true" /><span>Tabelleninhalte und benötigte Stammdaten werden an deinen eingerichteten KI-Anbieter gesendet. Die Analyse verändert keine Buchungen oder Stammdaten – du prüfst alles, bevor etwas übernommen wird.</span></p>
      {!preview.hasApiKey && <p className="ai-import-callout is-danger" role="alert"><IconAlertTriangle size={16} aria-hidden="true" />Bitte zuerst in den KI-Einstellungen einen Anbieter und API-Schlüssel einrichten.</p>}
    </>}
  </div>
}
