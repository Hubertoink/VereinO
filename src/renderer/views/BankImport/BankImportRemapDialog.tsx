import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconX } from '@tabler/icons-react'
import AppIcon from '../../components/common/AppIcon'
import type { TBankImportRemapPreviewOutput } from '../../../../electron/main/ipc/schemas'
import './bankImportRemap.css'

type Field = 'counterparty' | 'counterpartyIban' | 'purpose' | 'reference' | 'endToEndId'
type Mapping = Partial<Record<Field, string | null>>
const fields: Array<{ key: Field; label: string }> = [
  { key: 'counterparty', label: 'Gegenpartei' },
  { key: 'counterpartyIban', label: 'IBAN Gegenkonto' },
  { key: 'purpose', label: 'Verwendungszweck' },
  { key: 'reference', label: 'Bankreferenz' },
  { key: 'endToEndId', label: 'End-to-End-ID' }
]

export default function BankImportRemapDialog({ batchId, onClose, onApplied, notify }: {
  batchId: number
  onClose: () => void
  onApplied: () => void
  notify: (type: 'success' | 'error' | 'info', message: string) => void
}) {
  const [mapping, setMapping] = useState<Mapping | null>(null)
  const [preview, setPreview] = useState<TBankImportRemapPreviewOutput | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    void window.api.bankImports.remapPreview({ batchId, mapping: mapping ?? undefined })
      .then(result => {
        if (!active) return
        setPreview(result)
        if (mapping === null) setMapping(result.mapping)
      })
      .catch(reason => { if (active) setError(reason?.message || String(reason)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [batchId, mapping])

  const apply = async () => {
    if (!mapping || !preview?.changeCount || loading || saving) return
    setSaving(true)
    setError('')
    try {
      const result = await window.api.bankImports.remapApply({ batchId, mapping })
      notify('success', `${result.updated} Bankbeleg(e) aktualisiert.`)
      onApplied()
      onClose()
    } catch (reason: any) {
      setError(reason?.message || String(reason))
    } finally {
      setSaving(false)
    }
  }

  return createPortal(<div className="modal-overlay bank-import-remap-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose() }}>
    <div className="modal bank-import-remap-dialog" role="dialog" aria-modal="true" aria-label="Spaltenzuordnungen aktualisieren">
      <header className="bank-import-remap-header"><div><h2>Spaltenzuordnungen aktualisieren</h2><p>{preview?.fileName || 'CSV-Import'} · {preview?.paymentAccountName || 'Zahlkonto'}</p></div><button className="btn ghost" aria-label="Schließen" disabled={saving} onClick={onClose}><AppIcon icon={IconX} size="control" /></button></header>
      <div className="bank-import-remap-body">
        <p>Wähle die Spalten, deren Angaben bei den vorhandenen Bankbelegen korrigiert werden sollen. Datum, Betrag und Buchungszuordnungen bleiben erhalten.</p>
        {preview && <div className="bank-import-remap-grid">{fields.map(field => <label className="field" key={field.key}><span>{field.label}</span><select className="input" value={mapping?.[field.key] || ''} disabled={saving} onChange={event => setMapping(current => ({ ...current, [field.key]: event.target.value || null }))}><option value="">Nicht aktualisieren</option>{preview.headers.map(header => <option key={header} value={header}>{header}</option>)}</select></label>)}</div>}
        {preview && <p className="bank-import-remap-summary" role="status">{loading ? 'Vorschau wird berechnet …' : `${preview.changeCount} von ${preview.totalRows} Bankbelegen würden aktualisiert.`} Leere CSV-Werte überschreiben bestehende Angaben nicht.</p>}
        {preview && !loading && <div className="bank-import-remap-preview" aria-label="Änderungsvorschau">{preview.rows.filter(row => row.changed).map(row => <div className="bank-import-remap-row" key={row.id}><strong>Bankbeleg #{row.id} · {row.bookingDate} · {row.amount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</strong>{fields.filter(field => mapping?.[field.key] && row.current[field.key] !== row.proposed[field.key]).map(field => <div key={field.key}><span>{field.label}</span><del>{row.current[field.key] || '–'}</del><b>→ {row.proposed[field.key]}</b></div>)}</div>)}{preview.changeCount === 0 && <p>Für diese Spalten sind keine Änderungen nötig.</p>}{preview.changeCount > preview.rows.length && <small>Die Vorschau zeigt die ersten {preview.rows.length} Änderungen.</small>}</div>}
        {error && <p className="inline-error" role="alert">{error}</p>}
      </div>
      <footer className="bank-import-remap-footer"><button className="btn" disabled={saving} onClick={onClose}>Schließen</button><button className="btn primary" disabled={!preview?.changeCount || loading || saving} onClick={() => void apply()}>{saving ? 'Wird aktualisiert …' : `${preview?.changeCount || 0} Beleg(e) aktualisieren`}</button></footer>
    </div>
  </div>, document.body)
}
