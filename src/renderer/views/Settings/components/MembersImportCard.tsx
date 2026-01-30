import { useState, useRef, useMemo, memo, useCallback } from 'react'
import { createPortal } from 'react-dom'

interface MembersImportCardProps {
  notify?: (type: 'success' | 'error' | 'info', text: string, ms?: number, action?: { label: string; onClick: () => void }) => void
}

type MembersImportResult = {
  imported: number
  updated: number
  skipped: number
  errors: Array<{ row: number; message: string }>
  rowStatuses?: Array<{ row: number; ok: boolean; message?: string }>
  errorFilePath?: string
}

type SampleRow = Record<string, any> & { _rowIndex?: number; _isHintRow?: boolean }

// ============================================================================
// Editable Cell Component (memoized to prevent focus loss)
// ============================================================================
interface EditableCellProps {
  rowIndex: number
  header: string
  originalValue: string
  editedValue: string | undefined
  isMissing: boolean
  isEdited: boolean
  onEdit: (rowIndex: number, header: string, value: string) => void
}

const EditableCell = memo(function EditableCell({ 
  rowIndex, header, originalValue, editedValue, isMissing, isEdited, onEdit 
}: EditableCellProps) {
  const currentValue = editedValue ?? originalValue
  
  return (
    <td style={{ padding: 2 }}>
      <input
        type="text"
        value={currentValue}
        onChange={(e) => onEdit(rowIndex, header, e.target.value)}
        style={{
          width: '100%',
          minWidth: 70,
          padding: '3px 5px',
          border: isMissing ? '2px solid var(--warning)' : (isEdited ? '2px solid var(--primary)' : '1px solid var(--border)'),
          borderRadius: 4,
          background: isEdited ? 'color-mix(in oklab, var(--primary) 5%, var(--bg))' : 'var(--bg)',
          color: 'var(--text)',
          fontSize: 11
        }}
        placeholder={isMissing ? 'Pflicht!' : undefined}
      />
    </td>
  )
})

// ============================================================================
// Preview Table Component (memoized)
// ============================================================================
interface PreviewTableProps {
  sample: SampleRow[]
  headers: string[]
  mapping: Record<string, string | null>
  result: MembersImportResult | null
  headerRowIndex: number | null
  editedRows: Record<number, Record<string, string>>
  onEditCell: (rowIndex: number, header: string, value: string) => void
  onResetEdits: () => void
  validateRow: (row: SampleRow, rowIdx: number) => string[]
}

const PreviewTable = memo(function PreviewTable({ 
  sample, headers, mapping, result, headerRowIndex, editedRows, onEditCell, onResetEdits, validateRow 
}: PreviewTableProps) {
  const hintRowCount = sample.filter(r => r._isHintRow).length
  
  // Check which columns are mapped to required fields
  const requiredMappedCols = useMemo(() => {
    const cols = new Set<string>()
    if (mapping.memberNo) cols.add(mapping.memberNo)
    if (mapping.join_date) cols.add(mapping.join_date)
    if (mapping.name) cols.add(mapping.name)
    if (mapping.firstName) cols.add(mapping.firstName)
    if (mapping.lastName) cols.add(mapping.lastName)
    return cols
  }, [mapping])
  
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <strong>Vorschau (erste 20 Zeilen)</strong>
        {hintRowCount > 0 && (
          <span style={{ 
            fontSize: 11, 
            color: 'var(--muted)', 
            background: 'var(--bg-alt)', 
            padding: '2px 6px', 
            borderRadius: 4 
          }}>
            {hintRowCount} Hinweis-Zeile(n) werden übersprungen
          </span>
        )}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table cellPadding={4} style={{ fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ width: 30, textAlign: 'center' }}>#</th>
              <th style={{ width: 50, textAlign: 'center' }}>Status</th>
              {headers.map((h) => (
                <th key={h} align="left" style={{ 
                  background: requiredMappedCols.has(h) ? 'color-mix(in oklab, var(--primary) 10%, transparent)' : undefined,
                  padding: '4px 6px'
                }}>
                  {h || '(leer)'}
                  {requiredMappedCols.has(h) && <span style={{ color: 'var(--danger)', marginLeft: 2 }}>*</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sample.map((row, i) => {
              const isHint = row._isHintRow
              const rowIdx = row._rowIndex ?? i
              const missingFields = isHint ? [] : validateRow(row, i)
              const hasErrors = missingFields.length > 0
              
              const st = result?.rowStatuses?.find(
                (rs) => rs.row === (headerRowIndex || 1) + 1 + i
              )
              
              // Determine background
              let bg = undefined
              if (isHint) {
                bg = 'color-mix(in oklab, var(--muted) 8%, transparent)'
              } else if (st) {
                bg = st.ok
                  ? 'color-mix(in oklab, var(--success) 12%, transparent)'
                  : 'color-mix(in oklab, var(--danger) 10%, transparent)'
              } else if (hasErrors) {
                bg = 'color-mix(in oklab, var(--warning) 10%, transparent)'
              }
              
              return (
                <tr 
                  key={i} 
                  style={{ 
                    background: bg,
                    opacity: isHint ? 0.5 : 1,
                    textDecoration: isHint ? 'line-through' : undefined
                  }} 
                  title={isHint ? 'Hinweis-Zeile (wird übersprungen)' : (st?.message || (hasErrors ? `Fehlende Felder: ${missingFields.join(', ')}` : undefined))}
                >
                  <td style={{ textAlign: 'center', fontSize: 10, color: 'var(--muted)' }}>
                    {rowIdx}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {isHint ? (
                      <span style={{ fontSize: 9, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                        ⏭️
                      </span>
                    ) : hasErrors ? (
                      <span style={{ fontSize: 9, color: 'var(--warning)', whiteSpace: 'nowrap' }} title={missingFields.join(', ')}>
                        ⚠️
                      </span>
                    ) : (
                      <span style={{ fontSize: 9, color: 'var(--success)' }}>✓</span>
                    )}
                  </td>
                  {headers.map((h) => {
                    const originalValue = String(row[h] ?? '')
                    const editedValue = editedRows[i]?.[h]
                    const isEdited = editedValue !== undefined
                    const isMissing = !isHint && missingFields.includes(h)
                    const isRequired = requiredMappedCols.has(h)
                    
                    // Make cell editable if it's a required field and not a hint row
                    if (isRequired && !isHint) {
                      return (
                        <EditableCell
                          key={h}
                          rowIndex={i}
                          header={h}
                          originalValue={originalValue}
                          editedValue={editedValue}
                          isMissing={isMissing}
                          isEdited={isEdited}
                          onEdit={onEditCell}
                        />
                      )
                    }
                    
                    // Regular cell
                    return (
                      <td key={h} style={{ 
                        opacity: isHint ? 0.6 : 1,
                        fontStyle: isHint ? 'italic' : undefined,
                        padding: '4px 6px',
                        maxWidth: 150,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {editedValue ?? originalValue}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {Object.keys(editedRows).length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--primary)' }}>
            ✏️ {Object.keys(editedRows).length} Zeile(n) bearbeitet
          </span>
          <button 
            className="btn secondary" 
            style={{ fontSize: 10, padding: '2px 6px' }}
            onClick={onResetEdits}
          >
            Zurücksetzen
          </button>
        </div>
      )}
    </div>
  )
})

// ============================================================================
// Main Component
// ============================================================================
export function MembersImportCard({ notify }: MembersImportCardProps) {
  const [fileName, setFileName] = useState<string>('')
  const [base64, setBase64] = useState<string>('')
  const [headers, setHeaders] = useState<string[]>([])
  const [sample, setSample] = useState<SampleRow[]>([])
  const [editedRows, setEditedRows] = useState<Record<number, Record<string, string>>>({})
  const [headerRowIndex, setHeaderRowIndex] = useState<number | null>(null)
  const [mapping, setMapping] = useState<Record<string, string | null>>({
    memberNo: null,
    name: null,
    firstName: null,
    lastName: null,
    email: null,
    phone: null,
    address: null,
    street: null,
    zip: null,
    city: null,
    status: null,
    join_date: null,
    leave_date: null,
    contribution_amount: null,
    contribution_interval: null,
    iban: null,
    bic: null,
    mandate_ref: null,
    mandate_date: null,
    notes: null
  })
  const [updateExisting, setUpdateExisting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<MembersImportResult | null>(null)
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
    setEditedRows({})
    setFileName(f.name)
    try {
      const buf = await f.arrayBuffer()
      const b64 = bufferToBase64(buf)
      setBase64(b64)
      setBusy(true)
      try {
        const prev = await (window as any).api?.members?.import?.preview?.({ fileBase64: b64 })
        if (prev) {
          setHeaders(prev.headers)
          setSample(prev.sample as SampleRow[])
          setMapping(prev.suggestedMapping)
          setHeaderRowIndex(prev.headerRowIndex ?? null)
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
      // Convert editedRows to format: { rowIndex: { headerName: value } }
      const rowEdits: Record<number, Record<string, string>> = {}
      for (const [idx, edits] of Object.entries(editedRows)) {
        const rowIndex = sample[Number(idx)]?._rowIndex
        if (rowIndex !== undefined) {
          rowEdits[rowIndex] = edits
        }
      }
      
      const res = await (window as any).api?.members?.import?.execute?.({ 
        fileBase64: base64, 
        mapping,
        updateExisting,
        rowEdits // Send edits to backend
      })
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
          const parts = []
          if (res.imported > 0) parts.push(`${res.imported} importiert`)
          if (res.updated > 0) parts.push(`${res.updated} aktualisiert`)
          if (res.skipped > 0) parts.push(`${res.skipped} übersprungen`)
          notify?.('success', `Import abgeschlossen: ${parts.join(', ')}`)
        }
      }
    } catch (e: any) {
      setResult(null)
      setError('Import fehlgeschlagen: ' + (e?.message || String(e)))
    } finally {
      setBusy(false)
    }
  }

  const fieldKeys: Array<{ key: string; label: string; required?: boolean; hint?: string }> = [
    { key: 'memberNo', label: 'Mitgliedsnummer', required: true, hint: 'Eindeutige Nummer' },
    { key: 'name', label: 'Name (vollständig)', hint: 'Alternativ: Vor-/Nachname' },
    { key: 'firstName', label: 'Vorname', hint: 'Alternativ zu Name' },
    { key: 'lastName', label: 'Nachname', hint: 'Alternativ zu Name' },
    { key: 'email', label: 'E-Mail' },
    { key: 'phone', label: 'Telefon' },
    { key: 'address', label: 'Adresse (vollständig)', hint: 'Alternativ: Straße/PLZ/Ort' },
    { key: 'street', label: 'Straße', hint: 'Alternativ zu Adresse' },
    { key: 'zip', label: 'PLZ', hint: 'Alternativ zu Adresse' },
    { key: 'city', label: 'Ort', hint: 'Alternativ zu Adresse' },
    { key: 'status', label: 'Status', hint: 'ACTIVE, NEW, PAUSED, LEFT' },
    { key: 'join_date', label: 'Eintrittsdatum', required: true, hint: 'TT.MM.JJJJ oder JJJJ-MM-TT' },
    { key: 'leave_date', label: 'Austrittsdatum', hint: 'TT.MM.JJJJ oder JJJJ-MM-TT' },
    { key: 'contribution_amount', label: 'Beitragshöhe', hint: 'in EUR' },
    { key: 'contribution_interval', label: 'Beitragsintervall', hint: 'MONTHLY, QUARTERLY, YEARLY' },
    { key: 'iban', label: 'IBAN' },
    { key: 'bic', label: 'BIC' },
    { key: 'mandate_ref', label: 'SEPA-Mandatsreferenz' },
    { key: 'mandate_date', label: 'Mandatsdatum' },
    { key: 'notes', label: 'Notizen' }
  ]

  // Helper: get required columns based on current mapping
  const getRequiredColumns = useMemo(() => {
    const required: string[] = []
    // memberNo is always required
    if (mapping.memberNo) required.push(mapping.memberNo)
    // join_date is always required
    if (mapping.join_date) required.push(mapping.join_date)
    // either name OR (firstName AND lastName)
    const hasName = !!mapping.name
    const hasFirstLast = !!mapping.firstName && !!mapping.lastName
    if (hasName && mapping.name) required.push(mapping.name)
    if (!hasName && hasFirstLast) {
      if (mapping.firstName) required.push(mapping.firstName)
      if (mapping.lastName) required.push(mapping.lastName)
    }
    return required
  }, [mapping])

  // Validate a row and return missing required fields (by header name)
  const validateRow = useCallback((row: SampleRow, rowIdx: number): string[] => {
    const missing: string[] = []
    const edited = editedRows[rowIdx] || {}
    
    // memberNo
    if (mapping.memberNo) {
      const val = edited[mapping.memberNo] ?? row[mapping.memberNo]
      if (!val || String(val).trim() === '') {
        missing.push(mapping.memberNo)
      }
    } else {
      missing.push('Mitgliedsnummer (nicht zugeordnet)')
    }
    
    // join_date
    if (mapping.join_date) {
      const val = edited[mapping.join_date] ?? row[mapping.join_date]
      if (!val || String(val).trim() === '') {
        missing.push(mapping.join_date)
      }
    } else {
      missing.push('Eintrittsdatum (nicht zugeordnet)')
    }
    
    // name check
    const hasName = mapping.name && String(edited[mapping.name] ?? row[mapping.name] ?? '').trim()
    const hasFirstName = mapping.firstName && String(edited[mapping.firstName] ?? row[mapping.firstName] ?? '').trim()
    const hasLastName = mapping.lastName && String(edited[mapping.lastName] ?? row[mapping.lastName] ?? '').trim()
    
    if (!hasName && !hasFirstName && !hasLastName) {
      if (mapping.name) {
        missing.push(mapping.name)
      } else if (mapping.firstName || mapping.lastName) {
        if (!hasFirstName && mapping.firstName) missing.push(mapping.firstName)
        if (!hasLastName && mapping.lastName) missing.push(mapping.lastName)
      } else {
        missing.push('Name (nicht zugeordnet)')
      }
    }
    
    return missing
  }, [mapping, editedRows])

  // Stable callback for editing cells (prevents re-renders)
  const handleEditCell = useCallback((rowIndex: number, header: string, value: string) => {
    setEditedRows(prev => ({
      ...prev,
      [rowIndex]: {
        ...(prev[rowIndex] || {}),
        [header]: value
      }
    }))
  }, [])

  const handleResetEdits = useCallback(() => {
    setEditedRows({})
  }, [])

  // Compact field component for mapping - shows label with selected column
  const Field = ({ keyName }: { keyName: string }) => {
    const f = fieldKeys.find((k) => k.key === keyName)!
    const current = mapping[f.key] || ''
    const isAssigned = !!current
    return (
      <div className="mapping-field" title={f.hint}>
        <div className="mapping-field-label">
          {f.label}
          {f.required && <span className="required-mark">*</span>}
        </div>
        <select
          className="mapping-select"
          value={current}
          onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value || null })}
          style={{
            borderColor: isAssigned ? 'var(--success)' : undefined,
            background: isAssigned ? 'color-mix(in oklab, var(--success) 8%, var(--bg))' : undefined
          }}
        >
          <option value="">— nicht zuordnen —</option>
          {headers.map((h) => (
            <option key={h} value={h}>{h || '(leer)'}</option>
          ))}
        </select>
      </div>
    )
  }

  return (
    <div className="card" style={{ padding: 12 }}>
      <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={onPickFile} />
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
                const res = await (window as any).api?.members?.import?.template?.()
                if (res?.filePath) {
                  setError('')
                  setResult(null)
                  notify?.('success', `Vorlage gespeichert: ${res.filePath}`, 5000, {
                    label: 'Ordner öffnen',
                    onClick: () => (window as any).api?.shell?.showItemInFolder?.(res.filePath)
                  })
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
                const res = await (window as any).api?.members?.import?.testdata?.()
                if (res?.filePath) {
                  setError('')
                  setResult(null)
                  notify?.('success', `Testdatei gespeichert: ${res.filePath}`, 5000, {
                    label: 'Ordner öffnen',
                    onClick: () => (window as any).api?.shell?.showItemInFolder?.(res.filePath)
                  })
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
        </div>
      </div>
      {busy && <div style={{ marginTop: 8 }}>Lade …</div>}
      {error && <div style={{ marginTop: 8, color: 'var(--danger)' }}>{error}</div>}
      {headers.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <strong>Zuordnung</strong>
            <span className="helper">Kopfzeile: Zeile {headerRowIndex || 1} • Felder mit * sind Pflichtfelder</span>
          </div>
          
          {/* Compact mapping grid */}
          <div className="members-mapping-grid">
            <div className="mapping-section">
              <div className="section-title">👤 Basisdaten</div>
              <Field keyName="memberNo" />
              <Field keyName="name" />
              <Field keyName="firstName" />
              <Field keyName="lastName" />
              <Field keyName="status" />
            </div>
            <div className="mapping-section">
              <div className="section-title">📱 Kontakt</div>
              <Field keyName="email" />
              <Field keyName="phone" />
            </div>
            <div className="mapping-section">
              <div className="section-title">🏠 Adresse</div>
              <Field keyName="address" />
              <Field keyName="street" />
              <Field keyName="zip" />
              <Field keyName="city" />
            </div>
            <div className="mapping-section">
              <div className="section-title">📅 Mitgliedschaft</div>
              <Field keyName="join_date" />
              <Field keyName="leave_date" />
            </div>
            <div className="mapping-section">
              <div className="section-title">💳 Beitrag & SEPA</div>
              <Field keyName="contribution_amount" />
              <Field keyName="contribution_interval" />
              <Field keyName="iban" />
              <Field keyName="bic" />
              <Field keyName="mandate_ref" />
              <Field keyName="mandate_date" />
            </div>
            <div className="mapping-section">
              <div className="section-title">📝 Sonstiges</div>
              <Field keyName="notes" />
            </div>
          </div>
          
          {/* Update existing toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer', fontSize: 12 }}>
            <input
              type="checkbox"
              checked={updateExisting}
              onChange={(e) => setUpdateExisting(e.target.checked)}
            />
            <span>Bestehende Mitglieder aktualisieren (anhand Mitgliedsnummer)</span>
          </label>
        </div>
      )}
      
      {/* Import button */}
      {headers.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <button className="btn primary" onClick={onImport} disabled={!base64 || busy}>
            Import starten
          </button>
        </div>
      )}
      
      {/* Preview table */}
      {sample.length > 0 && (
        <PreviewTable
          sample={sample}
          headers={headers}
          mapping={mapping}
          result={result}
          headerRowIndex={headerRowIndex}
          editedRows={editedRows}
          onEditCell={handleEditCell}
          onResetEdits={handleResetEdits}
          validateRow={validateRow}
        />
      )}
      
      {/* Result card */}
      {result && (
        <div className="card" style={{ marginTop: 8, padding: 10 }}>
          <strong>Ergebnis</strong>
          <div className="helper">
            Importiert: {result.imported} | Aktualisiert: {result.updated} | Übersprungen: {result.skipped}
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
      
      {/* Errors Modal */}
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
                Importiert: {result.imported} | Aktualisiert: {result.updated} | Übersprungen: {result.skipped} | Fehler:{' '}
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
                    Bitte prüfe die gelisteten Zeilen und trage die Mitglieder bei Bedarf manuell nach.
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
