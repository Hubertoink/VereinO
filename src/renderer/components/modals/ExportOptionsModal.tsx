import React from 'react'

export default function ExportOptionsModal({ open, onClose, fields, setFields, orgName, setOrgName, amountMode, setAmountMode, sortDir, setSortDir, onExport, dateFrom, dateTo, exportType = 'standard', setExportType, fiscalYear, setFiscalYear, includeBindings, setIncludeBindings, includeVoucherList, setIncludeVoucherList, includeBudgets, setIncludeBudgets }: {
  open: boolean
  onClose: () => void
  fields: Array<'date' | 'voucherNo' | 'type' | 'sphere' | 'description' | 'paymentMethod' | 'netAmount' | 'vatAmount' | 'grossAmount' | 'tags'>
  setFields: (f: Array<'date' | 'voucherNo' | 'type' | 'sphere' | 'description' | 'paymentMethod' | 'netAmount' | 'vatAmount' | 'grossAmount' | 'tags'>) => void
  orgName: string
  setOrgName: (v: string) => void
  amountMode: 'POSITIVE_BOTH' | 'OUT_NEGATIVE'
  setAmountMode: (m: 'POSITIVE_BOTH' | 'OUT_NEGATIVE') => void
  sortDir: 'ASC' | 'DESC'
  setSortDir: (v: 'ASC' | 'DESC') => void
  onExport: (fmt: 'CSV' | 'XLSX' | 'PDF' | 'PDF_FISCAL') => Promise<void>
  dateFrom?: string
  dateTo?: string
  exportType?: 'standard' | 'fiscal'
  setExportType?: (t: 'standard' | 'fiscal') => void
  fiscalYear?: number
  setFiscalYear?: (y: number) => void
  includeBindings?: boolean
  setIncludeBindings?: (v: boolean) => void
  includeVoucherList?: boolean
  setIncludeVoucherList?: (v: boolean) => void
  includeBudgets?: boolean
  setIncludeBudgets?: (v: boolean) => void
}) {
  const all: Array<{ key: any; label: string }> = [
    { key: 'date', label: 'Datum' },
    { key: 'voucherNo', label: 'Nr.' },
    { key: 'type', label: 'Typ' },
    { key: 'sphere', label: 'Sphäre' },
    { key: 'description', label: 'Beschreibung' },
    { key: 'paymentMethod', label: 'Zahlweg' },
    { key: 'netAmount', label: 'Netto' },
    { key: 'vatAmount', label: 'MwSt' },
    { key: 'grossAmount', label: 'Brutto' },
    { key: 'tags', label: 'Tags' }
  ]
  const toggle = (k: any) => {
    const set = new Set(fields)
    if (set.has(k)) set.delete(k)
    else set.add(k)
    setFields(Array.from(set) as any)
  }
  
  const applyJournalColumns = () => {
    try {
      const stored = localStorage.getItem('journalCols')
      if (!stored) return
      const cols = JSON.parse(stored)
      const mapping: Record<string, any> = {
        'date': 'date',
        'voucherNo': 'voucherNo',
        'type': 'type',
        'sphere': 'sphere',
        'description': 'description',
        'paymentMethod': 'paymentMethod',
        'net': 'netAmount',
        'vat': 'vatAmount',
        'gross': 'grossAmount'
      }
      const newFields: any[] = []
      Object.entries(cols).forEach(([key, visible]) => {
        if (visible && mapping[key]) {
          newFields.push(mapping[key])
        }
      })
      if (newFields.length > 0) {
        setFields(newFields as any)
      }
    } catch (e) {
      console.error('Failed to apply journal columns:', e)
    }
  }
  
  if (!open) return null
  
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i)
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2 style={{ margin: 0 }}>Export Optionen</h2>
            {(dateFrom || dateTo) && (
              <div className="helper" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <span>📅</span>
                <span>{dateFrom || '…'} – {dateTo || '…'}</span>
              </div>
            )}
          </div>
          <button className="btn danger" onClick={onClose}>Schließen</button>
        </header>
        
        {/* Export Type Selection */}
        {setExportType && (
          <div className="field" style={{ marginBottom: 16 }}>
            <label>Export-Art</label>
            <div className="btn-group" role="group">
              <button 
                className="btn" 
                onClick={() => setExportType('standard')} 
                style={{ background: exportType === 'standard' ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }}
              >
                📊 Standard (Controlling)
              </button>
              <button 
                className="btn" 
                onClick={() => setExportType('fiscal')} 
                style={{ background: exportType === 'fiscal' ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }}
              >
                🏛️ Finanzamt (Jahresabschluss)
              </button>
            </div>
            <div className="helper" style={{ fontSize: 11, marginTop: 6, opacity: 0.85 }}>
              {exportType === 'standard' 
                ? 'Standard-Export für Controlling und Analyse mit frei wählbaren Feldern und Zeitraum' 
                : 'Spezieller Jahresabschluss-Report für das Finanzamt nach § 64 AO mit Sphärentrennung'}
            </div>
          </div>
        )}
        
        {/* Fiscal Year Selection (only for fiscal export) */}
        {exportType === 'fiscal' && setFiscalYear && (
          <>
            <div className="field" style={{ gridColumn: '1 / span 2' }}>
              <label>Geschäftsjahr</label>
              <select 
                className="input" 
                value={fiscalYear || currentYear} 
                onChange={(e) => setFiscalYear(Number(e.target.value))}
              >
                {years.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <div className="helper" style={{ fontSize: 11, marginTop: 6, opacity: 0.85 }}>
                Zeitraum: 01.01.{fiscalYear || currentYear} – 31.12.{fiscalYear || currentYear}
              </div>
            </div>
            
            <div className="field" style={{ gridColumn: '1 / span 2' }}>
              <label>Zusätzliche Optionen</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label className="chip" style={{ cursor: 'pointer', userSelect: 'none' }}>
                  <input 
                    type="checkbox" 
                    checked={includeBindings ?? false} 
                    onChange={(e) => setIncludeBindings?.(e.target.checked)} 
                    style={{ marginRight: 6 }} 
                  />
                  Zweckbindungen einbeziehen
                </label>
                <label className="chip" style={{ cursor: 'pointer', userSelect: 'none' }}>
                  <input 
                    type="checkbox" 
                    checked={includeBudgets ?? false} 
                    onChange={(e) => setIncludeBudgets?.(e.target.checked)} 
                    style={{ marginRight: 6 }} 
                  />
                  Budgets einbeziehen
                </label>
                <label className="chip" style={{ cursor: 'pointer', userSelect: 'none' }}>
                  <input 
                    type="checkbox" 
                    checked={includeVoucherList ?? false} 
                    onChange={(e) => setIncludeVoucherList?.(e.target.checked)} 
                    style={{ marginRight: 6 }} 
                  />
                  Detaillierte Belegübersicht anhängen
                </label>
              </div>
            </div>
          </>
        )}
        
        {/* Standard export options (only for standard export) */}
        {exportType === 'standard' && (
          <>
            <div className="field" style={{ gridColumn: '1 / span 2' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label>Felder</label>
                <button className="btn" onClick={applyJournalColumns} title="Übernimmt die aktuelle Spaltenauswahl aus der Buchungsansicht">
                  📋 Aus Buchungsansicht übernehmen
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {all.map(f => (
                  <label key={f.key} className="chip" style={{ cursor: 'pointer', userSelect: 'none' }}>
                    <input type="checkbox" checked={fields.includes(f.key)} onChange={() => toggle(f.key)} style={{ marginRight: 6 }} />
                    {f.label}
                  </label>
                ))}
              </div>
              <div className="helper" style={{ fontSize: 11, marginTop: 6, opacity: 0.85 }}>Hinweis: Die Auswahl „Tags" gilt nur für CSV/XLSX, nicht für den PDF-Report.</div>
            </div>
            <div className="field" style={{ gridColumn: '1 / span 2' }}>
              <label>Betragsdarstellung</label>
              <div className="btn-group" role="group">
                <button className="btn" onClick={() => setAmountMode('POSITIVE_BOTH')} style={{ background: amountMode === 'POSITIVE_BOTH' ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }}>Beide positiv</button>
                <button className="btn" onClick={() => setAmountMode('OUT_NEGATIVE')} style={{ background: amountMode === 'OUT_NEGATIVE' ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }}>Ausgaben negativ</button>
              </div>
            </div>
            <div className="field" style={{ gridColumn: '1 / span 2' }}>
              <label>Sortierung (Datum)</label>
              <div className="btn-group" role="group">
                <button className="btn" onClick={() => setSortDir('ASC')} style={{ background: sortDir === 'ASC' ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }}>Aufsteigend</button>
                <button className="btn" onClick={() => setSortDir('DESC')} style={{ background: sortDir === 'DESC' ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }}>Absteigend</button>
              </div>
            </div>
          </>
        )}
        
        <div className="row">
          <div className="field" style={{ gridColumn: '1 / span 2' }}>
            <label>Organisationsname (optional)</label>
            <input className="input" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="z. B. Förderverein Muster e.V." />
          </div>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          {exportType === 'fiscal' ? (
            <button className="btn primary" onClick={() => onExport('PDF_FISCAL')}>📄 PDF (Finanzamt)</button>
          ) : (
            <>
              <button className="btn" onClick={() => onExport('CSV')}>CSV</button>
              <button className="btn" onClick={() => onExport('PDF')}>PDF</button>
              <button className="btn primary" onClick={() => onExport('XLSX')}>XLSX</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
