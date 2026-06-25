import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface ImportXlsxCardProps {
  notify?: (type: 'success' | 'error' | 'info', text: string, ms?: number, action?: { label: string; onClick: () => void }) => void
}

type DraftRow = Awaited<ReturnType<NonNullable<typeof window.api>['imports']['analyze']>>['rows'][number]
type AnalyzeResult = Awaited<ReturnType<NonNullable<typeof window.api>['imports']['analyze']>>
type ImportRule = NonNullable<Parameters<NonNullable<typeof window.api>['imports']['analyze']>[0]['rules']>[number]

const EMPTY_MAPPING: Record<string, string | null> = {
  voucherId: null,
  voucherNo: null,
  date: null,
  type: null,
  sphere: null,
  description: null,
  note: null,
  paymentMethod: null,
  paymentAccount: null,
  netAmount: null,
  vatRate: null,
  grossAmount: null,
  inGross: null,
  outGross: null,
  earmarkCode: null,
  earmarkAmount: null,
  budget: null,
  budgetAmount: null,
  tags: null,
  bankIn: null,
  bankOut: null,
  cashIn: null,
  cashOut: null,
  defaultSphere: 'IDEELL'
}

const FIELD_KEYS: Array<{ key: string; label: string; required?: boolean; enumValues?: string[] }> = [
  { key: 'voucherId', label: 'Buchungs-ID' },
  { key: 'voucherNo', label: 'Belegnummer' },
  { key: 'date', label: 'Datum', required: true },
  { key: 'description', label: 'Beschreibung' },
  { key: 'note', label: 'Kommentar' },
  { key: 'type', label: 'Art' },
  { key: 'sphere', label: 'Sphäre' },
  { key: 'paymentMethod', label: 'Zahlweg BAR/BANK' },
  { key: 'paymentAccount', label: 'Zahlkonto' },
  { key: 'grossAmount', label: 'Brutto' },
  { key: 'netAmount', label: 'Netto' },
  { key: 'vatRate', label: 'USt %' },
  { key: 'inGross', label: 'Einnahmen' },
  { key: 'outGross', label: 'Ausgaben' },
  { key: 'budget', label: 'Budget' },
  { key: 'budgetAmount', label: 'Budget-Betrag' },
  { key: 'earmarkCode', label: 'Zweckbindung' },
  { key: 'earmarkAmount', label: 'Zweckbindungs-Betrag' },
  { key: 'tags', label: 'Tags' },
  { key: 'bankIn', label: 'Bank +' },
  { key: 'bankOut', label: 'Bank -' },
  { key: 'cashIn', label: 'Bar +' },
  { key: 'cashOut', label: 'Bar -' },
  { key: 'defaultSphere', label: 'Standard-Sphäre', enumValues: ['IDEELL', 'ZWECK', 'VERMOEGEN', 'WGB'] }
]

const DEFAULT_RULES: ImportRule[] = [
  { id: 'amazon-tag', enabled: false, sourceField: 'description', contains: 'Amazon', targetField: 'tags', value: 'Verwaltung' },
  { id: 'spende-in', enabled: false, sourceField: 'description', contains: 'Spende', targetField: 'type', value: 'IN' },
  { id: 'barkasse-bar', enabled: false, sourceField: 'paymentAccount', contains: 'Barkasse', targetField: 'paymentMethod', value: 'BAR' }
]

function storageKey(headers: string[]) {
  return `vereino.import.mapping.${headers.map((h) => h.trim().toLowerCase()).join('|')}`
}

function safeJson<T>(raw: string | null, fallback: T): T {
  try { return raw ? JSON.parse(raw) as T : fallback } catch { return fallback }
}

function bufferToBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null as any, bytes.subarray(i, i + chunk) as any)
  }
  return btoa(binary)
}

export function ImportXlsxCard({ notify }: ImportXlsxCardProps) {
  const [fileName, setFileName] = useState('')
  const [base64, setBase64] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [sample, setSample] = useState<Array<Record<string, any>>>([])
  const [headerRowIndex, setHeaderRowIndex] = useState<number | null>(null)
  const [mapping, setMapping] = useState<Record<string, string | null>>(EMPTY_MAPPING)
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null)
  const [rows, setRows] = useState<DraftRow[]>([])
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [problemOnly, setProblemOnly] = useState(false)
  const [batchField, setBatchField] = useState<'tags' | 'budget' | 'paymentAccount' | 'sphere'>('tags')
  const [batchValue, setBatchValue] = useState('')
  const [rules, setRules] = useState<ImportRule[]>(() => safeJson(localStorage.getItem('vereino.import.rules'), DEFAULT_RULES))
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<null | Awaited<ReturnType<NonNullable<typeof window.api>['imports']['commitDraft']>>>(null)
  const [showErrorsModal, setShowErrorsModal] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    localStorage.setItem('vereino.import.rules', JSON.stringify(rules))
  }, [rules])

  const step = !base64 ? 0 : analysis ? 2 : 1
  const missingCount = analysis
    ? analysis.missing.tags.length + analysis.missing.budgets.length + analysis.missing.earmarks.length + analysis.missing.paymentAccounts.length
    : 0
  const visibleRows = useMemo(() => rows.filter((row) => !problemOnly || row.status !== 'ok'), [rows, problemOnly])
  const importableRows = rows.filter((row) => row.status !== 'ignored' && row.duplicateAction !== 'skip')

  async function processFile(f: File) {
    setError('')
    setResult(null)
    setAnalysis(null)
    setRows([])
    setSelected(new Set())
    setFileName(f.name)
    try {
      const b64 = bufferToBase64(await f.arrayBuffer())
      setBase64(b64)
      setBusy(true)
      try {
        if (!window.api?.imports?.preview) {
          throw new Error('Import-API ist nicht geladen. Bitte VereinO einmal komplett neu starten.')
        }
        const prev = await window.api?.imports.preview?.({ fileBase64: b64 })
        if (prev) {
          const remembered = safeJson<Record<string, string | null>>(localStorage.getItem(storageKey(prev.headers)), {})
          setHeaders(prev.headers)
          setSample(prev.sample as any)
          setHeaderRowIndex(prev.headerRowIndex ?? null)
          setMapping({ ...EMPTY_MAPPING, ...prev.suggestedMapping, ...remembered })
        }
      } finally {
        setBusy(false)
      }
    } catch (e: any) {
      setError('Datei konnte nicht gelesen werden: ' + (e?.message || String(e)))
    }
  }

  async function analyze() {
    if (!base64) return
    setBusy(true)
    setError('')
    setResult(null)
    try {
      if (!window.api?.imports?.analyze) {
        throw new Error('Der neue Import-Assistent ist im laufenden Fenster noch nicht verfügbar. Bitte VereinO einmal komplett schließen und neu starten.')
      }
      localStorage.setItem(storageKey(headers), JSON.stringify(mapping))
      const res = await window.api?.imports.analyze?.({ fileBase64: base64, mapping, rules })
      if (res) {
        setAnalysis(res)
        setRows(res.rows)
        setSelected(new Set())
        notify?.('success', `Validierung fertig: ${res.summary.errors} Fehler, ${res.summary.duplicates} Duplikate`)
      } else {
        throw new Error('Keine Antwort vom Import-Assistenten erhalten. Bitte VereinO neu starten.')
      }
    } catch (e: any) {
      setError('Validierung fehlgeschlagen: ' + (e?.message || String(e)))
    } finally {
      setBusy(false)
    }
  }

  async function createMissing() {
    if (!analysis) return
    setBusy(true)
    setError('')
    try {
      if (!window.api?.imports?.createMissing) {
        throw new Error('Stammdaten-Anlage ist im laufenden Fenster noch nicht verfügbar. Bitte VereinO einmal neu starten.')
      }
      const res = await window.api?.imports.createMissing?.(analysis.missing)
      notify?.('success', `Stammdaten angelegt: ${res?.tags || 0} Tags, ${res?.budgets || 0} Budgets, ${res?.earmarks || 0} Zweckbindungen, ${res?.paymentAccounts || 0} Konten`)
      await analyze()
    } catch (e: any) {
      setError('Stammdaten konnten nicht angelegt werden: ' + (e?.message || String(e)))
    } finally {
      setBusy(false)
    }
  }

  async function commitDraft() {
    const blocking = rows.filter((row) => row.status === 'error')
    if (blocking.length > 0) {
      setError(`Bitte zuerst ${blocking.length} fehlerhafte Zeilen korrigieren oder löschen.`)
      return
    }
    setBusy(true)
    setError('')
    try {
      if (!window.api?.imports?.commitDraft) {
        throw new Error('Entwurfs-Import ist im laufenden Fenster noch nicht verfügbar. Bitte VereinO einmal neu starten.')
      }
      const res = await window.api?.imports.commitDraft?.({ rows })
      if (res) {
        setResult(res)
        window.dispatchEvent(new Event('data-changed'))
        if ((res.errors?.length || 0) > 0 || (res.newTags?.length || 0) > 0) setShowErrorsModal(true)
        else notify?.('success', `Import übernommen: ${res.imported} importiert, ${res.skipped} übersprungen`)
      } else {
        throw new Error('Keine Antwort beim Übernehmen des Entwurfs erhalten. Bitte VereinO neu starten.')
      }
    } catch (e: any) {
      setError('Import fehlgeschlagen: ' + (e?.message || String(e)))
    } finally {
      setBusy(false)
    }
  }

  function updateRow(id: string, key: string, value: any) {
    setRows((prev) => prev.map((row) => row.id === id ? { ...row, values: { ...row.values, [key]: value }, status: row.status === 'error' ? 'warning' : row.status } : row))
  }

  function updateDuplicateAction(id: string, duplicateAction: DraftRow['duplicateAction']) {
    setRows((prev) => prev.map((row) => row.id === id ? { ...row, duplicateAction } : row))
  }

  function updateLookupRow(id: string, field: 'paymentAccount' | 'budget' | 'earmarkCode', value: string) {
    const metaField = field === 'paymentAccount' ? 'paymentAccountId' : field === 'budget' ? 'budgetId' : 'earmarkId'
    const options = field === 'paymentAccount'
      ? analysis?.lookup.paymentAccounts
      : field === 'budget'
        ? analysis?.lookup.budgets
        : analysis?.lookup.earmarks
    const selectedOption = options?.find((option) => option.label === value)
    setRows((prev) => prev.map((row) => row.id === id
      ? { ...row, values: { ...row.values, [field]: value, [metaField]: selectedOption?.id ?? null } }
      : row))
  }

  function deleteSelected() {
    if (selected.size === 0) return
    setRows((prev) => prev.filter((row) => !selected.has(row.id)))
    setSelected(new Set())
  }

  function applyBatch() {
    if (!batchValue.trim() || selected.size === 0) return
    const metaField = batchField === 'paymentAccount' ? 'paymentAccountId' : batchField === 'budget' ? 'budgetId' : null
    const options = batchField === 'paymentAccount' ? analysis?.lookup.paymentAccounts : batchField === 'budget' ? analysis?.lookup.budgets : []
    const selectedOption = options?.find((option) => option.label === batchValue)
    setRows((prev) => prev.map((row) => selected.has(row.id)
      ? { ...row, values: { ...row.values, [batchField]: batchValue, ...(metaField ? { [metaField]: selectedOption?.id ?? null } : {}) } }
      : row))
    setBatchValue('')
  }

  const Field = ({ keyName }: { keyName: string }) => {
    const f = FIELD_KEYS.find((item) => item.key === keyName)!
    const current = mapping[f.key] || ''
    return (
      <label className="mapping-field">
        <span className="mapping-field-label">{f.label}{f.required && <span className="required-mark">*</span>}</span>
        {f.enumValues ? (
          <select className="mapping-select" value={current} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value || null })}>
            {f.enumValues.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        ) : (
          <select className="mapping-select" value={current} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value || null })}>
            <option value="">- nicht zuordnen -</option>
            {headers.map((h) => <option key={h} value={h}>{h || '(leer)'}</option>)}
          </select>
        )}
      </label>
    )
  }

  return (
    <div className="card import-assistant" style={{ padding: 12 }}>
      <input ref={fileRef} type="file" accept=".xlsx,.xml" hidden onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])} />
      <div className="import-steps">
        {['Datei', 'Zuordnung', 'Validierung & Entwurf'].map((label, index) => (
          <span key={label} className={`import-step ${step >= index ? 'active' : ''}`}>{index + 1}. {label}</span>
        ))}
      </div>

      <div
        className="input"
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer?.files?.[0]; if (f) processFile(f) }}
        style={{ marginTop: 10, padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderRadius: 12, border: '1px dashed var(--border)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>Datei auswählen</button>
          <span className="helper">{fileName || 'Keine ausgewählt'}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button className="btn" onClick={async () => {
            try {
              const res = await window.api?.imports.template?.()
              if (res?.filePath) notify?.('success', `Vorlage gespeichert: ${res.filePath}`, 5000, { label: 'Ordner öffnen', onClick: () => window.api?.shell?.showItemInFolder?.(res.filePath) })
            } catch (e: any) {
              const msg = e?.message || String(e)
              if (!/abbruch/i.test(msg)) setError('Vorlage konnte nicht erstellt werden: ' + msg)
            }
          }}>Vorlage herunterladen</button>
          <button className="btn" onClick={async () => {
            try {
              const res = await window.api?.imports.testdata?.()
              if (res?.filePath) notify?.('success', `Testdatei gespeichert: ${res.filePath}`, 5000, { label: 'Ordner öffnen', onClick: () => window.api?.shell?.showItemInFolder?.(res.filePath) })
            } catch (e: any) {
              const msg = e?.message || String(e)
              if (!/abbruch/i.test(msg)) setError('Testdatei konnte nicht erstellt werden: ' + msg)
            }
          }}>Testdatei erzeugen</button>
          <button className="btn" onClick={async () => {
            try {
              const res = await window.api?.imports.editableExport?.()
              if (res?.filePath) notify?.('success', `Buchungsliste gespeichert: ${res.filePath}`, 5000, { label: 'Ordner öffnen', onClick: () => window.api?.shell?.showItemInFolder?.(res.filePath) })
            } catch (e: any) {
              const msg = e?.message || String(e)
              if (!/abbruch/i.test(msg)) setError('Buchungsliste konnte nicht erstellt werden: ' + msg)
            }
          }}>Buchungen exportieren</button>
        </div>
      </div>

      {busy && <div style={{ marginTop: 8 }}>Arbeite...</div>}
      {error && <div style={{ marginTop: 8, color: 'var(--danger)' }}>{error}</div>}

      {headers.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div>
              <strong>Kopfzeile erkannt: Zeile {headerRowIndex || 1}</strong>
              <div className="helper">VereinO merkt sich diese Zuordnung für dieselbe Tabellenstruktur automatisch.</div>
            </div>
            <button className="btn primary" onClick={analyze} disabled={busy || !base64}>Validieren & Entwurf laden</button>
          </div>
          <div className="members-mapping-grid" style={{ marginTop: 8 }}>
            <div className="mapping-section"><div className="section-title">Basis</div><Field keyName="voucherId" /><Field keyName="voucherNo" /><Field keyName="date" /><Field keyName="description" /><Field keyName="note" /><Field keyName="type" /><Field keyName="sphere" /></div>
            <div className="mapping-section"><div className="section-title">Beträge</div><Field keyName="grossAmount" /><Field keyName="netAmount" /><Field keyName="vatRate" /><Field keyName="inGross" /><Field keyName="outGross" /></div>
            <div className="mapping-section"><div className="section-title">Stammdaten</div><Field keyName="paymentMethod" /><Field keyName="paymentAccount" /><Field keyName="budget" /><Field keyName="budgetAmount" /><Field keyName="earmarkCode" /><Field keyName="earmarkAmount" /><Field keyName="tags" /></div>
            <div className="mapping-section"><div className="section-title">Split & Standard</div><Field keyName="bankIn" /><Field keyName="bankOut" /><Field keyName="cashIn" /><Field keyName="cashOut" /><Field keyName="defaultSphere" /></div>
          </div>
        </div>
      )}

      {headers.length > 0 && (
        <details className="card" style={{ marginTop: 12, padding: 10 }}>
          <summary><strong>Import-Regeln für Textmuster</strong> <span className="helper">({rules.filter((r) => r.enabled !== false).length} aktiv)</span></summary>
          <div className="helper" style={{ marginTop: 6 }}>Beispiele: Beschreibung enthält "Amazon" {'->'} Tag "Verwaltung"; Konto enthält "Barkasse" {'->'} Zahlweg BAR.</div>
          <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
            {rules.map((rule, index) => (
              <div key={rule.id || index} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 1fr 1fr 1fr 36px', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={rule.enabled !== false} onChange={(e) => setRules((prev) => prev.map((r, i) => i === index ? { ...r, enabled: e.target.checked } : r))} />
                <select className="input" value={rule.sourceField} onChange={(e) => setRules((prev) => prev.map((r, i) => i === index ? { ...r, sourceField: e.target.value as any } : r))}>
                  <option value="description">Beschreibung</option><option value="paymentAccount">Konto</option><option value="tags">Tags</option><option value="note">Kommentar</option>
                </select>
                <input className="input" placeholder="enthält..." value={rule.contains} onChange={(e) => setRules((prev) => prev.map((r, i) => i === index ? { ...r, contains: e.target.value } : r))} />
                <select className="input" value={rule.targetField} onChange={(e) => setRules((prev) => prev.map((r, i) => i === index ? { ...r, targetField: e.target.value as any } : r))}>
                  <option value="tags">Tags setzen</option><option value="type">Art setzen</option><option value="paymentMethod">Zahlweg setzen</option><option value="paymentAccount">Konto setzen</option><option value="budget">Budget setzen</option><option value="earmarkCode">Zweckbindung setzen</option><option value="sphere">Sphäre setzen</option>
                </select>
                <input className="input" placeholder="Wert" value={rule.value} onChange={(e) => setRules((prev) => prev.map((r, i) => i === index ? { ...r, value: e.target.value } : r))} />
                <button className="btn danger" onClick={() => setRules((prev) => prev.filter((_, i) => i !== index))}>x</button>
              </div>
            ))}
          </div>
          <button className="btn" style={{ marginTop: 8 }} onClick={() => setRules((prev) => [...prev, { id: String(Date.now()), enabled: true, sourceField: 'description', contains: '', targetField: 'tags', value: '' }])}>Regel hinzufügen</button>
        </details>
      )}

      {analysis && (
        <div style={{ marginTop: 12 }}>
          <div className="import-summary-grid">
            <div className="import-summary-card ok"><strong>{analysis.summary.ok}</strong><span>OK</span></div>
            <div className="import-summary-card warn"><strong>{analysis.summary.warnings}</strong><span>Warnungen</span></div>
            <div className="import-summary-card error"><strong>{analysis.summary.errors}</strong><span>Fehler</span></div>
            <div className="import-summary-card dup"><strong>{analysis.summary.duplicates}</strong><span>Duplikate</span></div>
          </div>

          {missingCount > 0 && (
            <div className="card import-missing-card" style={{ marginTop: 10, padding: 10 }}>
              <strong>Fehlende Stammdaten gefunden</strong>
              <div className="helper" style={{ marginTop: 4 }}>
                {analysis.missing.tags.length} neue Tags, {analysis.missing.budgets.length} unbekannte Budgets, {analysis.missing.earmarks.length} unbekannte Zweckbindungen, {analysis.missing.paymentAccounts.length} unbekannte Konten.
              </div>
              <div className="helper" style={{ marginTop: 6 }}>
                {[
                  ...analysis.missing.tags.map((v) => `Tag: ${v}`),
                  ...analysis.missing.budgets.map((v) => `Budget: ${v}`),
                  ...analysis.missing.earmarks.map((v) => `Zweckbindung: ${v}`),
                  ...analysis.missing.paymentAccounts.map((v) => `Konto: ${v}`)
                ].slice(0, 12).join(' | ')}
              </div>
              <button className="btn" style={{ marginTop: 8 }} onClick={createMissing}>Fehlende Stammdaten jetzt anlegen</button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
            <label className="helper"><input type="checkbox" checked={problemOnly} onChange={(e) => setProblemOnly(e.target.checked)} /> nur problematische Zeilen anzeigen</label>
            <span className="helper">{selected.size} ausgewählt</span>
            <select className="input" style={{ width: 160 }} value={batchField} onChange={(e) => setBatchField(e.target.value as any)}>
              <option value="tags">Tags</option><option value="budget">Budget</option><option value="paymentAccount">Konto</option><option value="sphere">Sphäre</option>
            </select>
            {batchField === 'paymentAccount' ? (
              <select className="input" style={{ width: 260 }} value={batchValue} onChange={(e) => setBatchValue(e.target.value)}>
                <option value="">Konto wählen...</option>
                {analysis.lookup.paymentAccounts.map((item) => <option key={item.id} value={item.label}>{item.label}</option>)}
              </select>
            ) : batchField === 'budget' ? (
              <select className="input" style={{ width: 300 }} value={batchValue} onChange={(e) => setBatchValue(e.target.value)}>
                <option value="">Budget wählen...</option>
                {analysis.lookup.budgets.map((item) => <option key={item.id} value={item.label}>{item.label}</option>)}
              </select>
            ) : batchField === 'sphere' ? (
              <select className="input" style={{ width: 180 }} value={batchValue} onChange={(e) => setBatchValue(e.target.value)}>
                <option value="">Sphäre wählen...</option><option value="IDEELL">IDEELL</option><option value="ZWECK">ZWECK</option><option value="VERMOEGEN">VERMOEGEN</option><option value="WGB">WGB</option>
              </select>
            ) : (
              <input className="input" style={{ width: 220 }} value={batchValue} onChange={(e) => setBatchValue(e.target.value)} placeholder="Tags, z.B. Verwaltung; Material" />
            )}
            <button className="btn" onClick={applyBatch} disabled={selected.size === 0 || !batchValue.trim()}>Auf Auswahl anwenden</button>
            <button className="btn danger" onClick={deleteSelected} disabled={selected.size === 0}>Auswahl löschen</button>
            <button className="btn primary" style={{ marginLeft: 'auto' }} onClick={commitDraft} disabled={busy || importableRows.length === 0}>Jetzt übernehmen ({importableRows.length})</button>
          </div>

          <div style={{ overflowX: 'auto', marginTop: 8, maxHeight: 520 }}>
            <table className="import-draft-table">
              <thead>
                <tr>
                  <th><input type="checkbox" checked={visibleRows.length > 0 && visibleRows.every((row) => selected.has(row.id))} onChange={(e) => setSelected(e.target.checked ? new Set(visibleRows.map((row) => row.id)) : new Set())} /></th>
                  <th>#</th><th>Status</th><th>Datum</th><th>Beschreibung</th><th>Art</th><th>Sphäre</th><th>Konto</th><th>Brutto</th><th>Budget</th><th>Zweckbindung</th><th>Tags</th><th>Duplikat</th><th>Hinweis</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.id} className={`import-row-${row.status}`}>
                    <td><input type="checkbox" checked={selected.has(row.id)} onChange={(e) => setSelected((prev) => { const next = new Set(prev); e.target.checked ? next.add(row.id) : next.delete(row.id); return next })} /></td>
                    <td>{row.sourceRow}</td>
                    <td>{row.status}</td>
                    <td><input value={row.values.date ?? ''} onChange={(e) => updateRow(row.id, 'date', e.target.value)} /></td>
                    <td><input value={row.values.description ?? ''} onChange={(e) => updateRow(row.id, 'description', e.target.value)} /></td>
                    <td><select value={row.values.type ?? ''} onChange={(e) => updateRow(row.id, 'type', e.target.value)}><option value="">-</option><option value="IN">IN</option><option value="OUT">OUT</option><option value="TRANSFER">TRANSFER</option><option value="INTERNAL">INTERNAL</option></select></td>
                    <td><select value={row.values.sphere ?? 'IDEELL'} onChange={(e) => updateRow(row.id, 'sphere', e.target.value)}><option value="IDEELL">IDEELL</option><option value="ZWECK">ZWECK</option><option value="VERMOEGEN">VERMOEGEN</option><option value="WGB">WGB</option></select></td>
                    <td>
                      <select value={row.values.paymentAccount ?? ''} onChange={(e) => updateLookupRow(row.id, 'paymentAccount', e.target.value)}>
                        <option value="">- Konto wählen -</option>
                        {analysis.lookup.paymentAccounts.map((item) => <option key={item.id} value={item.label}>{item.label}</option>)}
                      </select>
                    </td>
                    <td><input value={row.values.grossAmount ?? ''} onChange={(e) => updateRow(row.id, 'grossAmount', e.target.value)} /></td>
                    <td>
                      <select value={row.values.budget ?? ''} onChange={(e) => updateLookupRow(row.id, 'budget', e.target.value)}>
                        <option value="">- Budget wählen -</option>
                        {analysis.lookup.budgets.map((item) => <option key={item.id} value={item.label}>{item.label}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={row.values.earmarkCode ?? ''} onChange={(e) => updateLookupRow(row.id, 'earmarkCode', e.target.value)}>
                        <option value="">- Zweckbindung wählen -</option>
                        {analysis.lookup.earmarks.map((item) => <option key={item.id} value={item.label}>{item.label}</option>)}
                      </select>
                    </td>
                    <td><input value={row.values.tags ?? ''} onChange={(e) => updateRow(row.id, 'tags', e.target.value)} /></td>
                    <td>
                      {row.duplicateIds?.length ? (
                        <select value={row.duplicateAction || 'skip'} onChange={(e) => updateDuplicateAction(row.id, e.target.value as any)}>
                          <option value="skip">überspringen</option><option value="import">trotzdem importieren</option><option value="merge">zusammenführen</option>
                        </select>
                      ) : '-'}
                    </td>
                    <td title={row.issues.map((i) => i.message).join('\n')}>{row.issues.map((i) => i.message).join(' | ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!analysis && sample.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <strong>Vorschau</strong>
          <div style={{ overflowX: 'auto', marginTop: 6 }}>
            <table cellPadding={4} style={{ fontSize: 11 }}>
              <thead><tr><th>#</th>{headers.map((h) => <th key={h} align="left">{h || '(leer)'}</th>)}</tr></thead>
              <tbody>{sample.map((row, i) => <tr key={i}><td>{(headerRowIndex || 1) + 1 + i}</td>{headers.map((h) => <td key={h}>{String(row[h] ?? '')}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </div>
      )}

      {result && (
        <div className="card" style={{ marginTop: 8, padding: 10 }}>
          <strong>Ergebnis</strong>
          <div className="helper">Importiert: {result.imported} | Übersprungen: {result.skipped}</div>
          {(result.newTags?.length || 0) > 0 && <div className="helper" style={{ marginTop: 6 }}>Neu angelegte Tags: {result.newTags?.join(', ')}</div>}
          {result.errors?.length ? <details style={{ marginTop: 6 }}><summary>Fehlerdetails anzeigen ({result.errors.length})</summary><ul>{result.errors.slice(0, 20).map((e, idx) => <li key={idx}>Zeile {e.row}: {e.message}</li>)}</ul></details> : null}
        </div>
      )}

      {showErrorsModal && result && createPortal(
        <div className="modal-overlay" onClick={() => setShowErrorsModal(false)} role="dialog" aria-modal="true" style={{ zIndex: 10000 }}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h2 style={{ margin: 0 }}>Import abgeschlossen</h2>
              <button className="btn danger" onClick={() => setShowErrorsModal(false)}>Schließen</button>
            </header>
            <div className="helper">Importiert: {result.imported} | Übersprungen: {result.skipped} | Fehler: {result.errors?.length || 0}</div>
            {(result.newTags?.length || 0) > 0 && <div style={{ marginTop: 8 }}><strong>Neu angelegte Tags</strong><div className="helper">{result.newTags?.join(', ')}</div></div>}
            {(result.errors?.length || 0) > 0 && <ul style={{ marginTop: 12, maxHeight: 280, overflowY: 'auto' }}>{result.errors.slice(0, 50).map((e, idx) => <li key={idx}>Zeile {e.row}: {e.message}</li>)}</ul>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}><button className="btn" onClick={() => setShowErrorsModal(false)}>OK</button></div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
