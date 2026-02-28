import React, { useState, useEffect, useMemo } from 'react'

// Preview row type
interface PreviewRow {
  id: number
  date: string
  voucherNo: number
  type: 'IN' | 'OUT' | 'TRANSFER'
  sphere: string
  description: string
  paymentMethod: string
  netAmount: number
  vatRate: number
  grossAmount: number
  tags?: string[]
}

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
  onExport: (fmt: 'CSV' | 'XLSX' | 'PDF' | 'PDF_FISCAL' | 'PDF_TREASURER', treasurerOpts?: { includeMembers?: boolean; includeInvoices?: boolean; includeBindings?: boolean; includeBudgets?: boolean; includeTagSummary?: boolean; includeVoucherList?: boolean; includeTags?: boolean; voucherListFrom?: string; voucherListTo?: string; voucherListSort?: 'ASC' | 'DESC' }) => Promise<void>
  dateFrom?: string
  dateTo?: string
  exportType?: 'standard' | 'fiscal' | 'treasurer'
  setExportType?: (t: 'standard' | 'fiscal' | 'treasurer') => void
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

  // Treasurer report local state
  const [trIncludeMembers, setTrIncludeMembers] = useState(true)
  const [trIncludeInvoices, setTrIncludeInvoices] = useState(true)
  const [trIncludeBindings, setTrIncludeBindings] = useState(true)
  const [trIncludeBudgets, setTrIncludeBudgets] = useState(true)
  const [trIncludeTagSummary, setTrIncludeTagSummary] = useState(false)
  const [trIncludeVoucherList, setTrIncludeVoucherList] = useState(false)
  const [trIncludeTags, setTrIncludeTags] = useState(false)
  const [trVoucherListFrom, setTrVoucherListFrom] = useState('')
  const [trVoucherListTo, setTrVoucherListTo] = useState('')
  const [trVoucherListSort, setTrVoucherListSort] = useState<'ASC' | 'DESC'>('ASC')

  // Available voucher years
  const [availableYears, setAvailableYears] = useState<number[]>([])

  // Preview data state
  const [previewData, setPreviewData] = useState<PreviewRow[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewTotal, setPreviewTotal] = useState(0)
  const PREVIEW_LIMIT = 5

  // Load available years when modal opens
  useEffect(() => {
    if (!open) return
    let cancelled = false
    async function loadYears() {
      try {
        const res = await (window as any).api?.reports?.years?.()
        if (!cancelled && res?.years) {
          const currentYear = new Date().getFullYear()
          const yrs = new Set<number>(res.years)
          yrs.add(currentYear)
          setAvailableYears(Array.from(yrs).sort((a, b) => b - a))
        }
      } catch (e) {
        console.error('Failed to load voucher years:', e)
      }
    }
    loadYears()
    return () => { cancelled = true }
  }, [open])

  // Load preview data when modal opens or filters change
  useEffect(() => {
    if (!open) return
    let cancelled = false

    async function loadPreview() {
      setPreviewLoading(true)
      try {
        // Determine date range based on export type
        let from = dateFrom || ''
        let to = dateTo || ''
        if (exportType === 'fiscal' && fiscalYear) {
          from = `${fiscalYear}-01-01`
          to = `${fiscalYear}-12-31`
        }

        const res = await (window as any).api?.vouchers?.list?.({
          from,
          to,
          limit: PREVIEW_LIMIT,
          offset: 0,
          sort: sortDir
        })

        if (!cancelled && res) {
          setPreviewData(res.rows || [])
          setPreviewTotal(res.total || 0)
        }
      } catch (e) {
        console.error('Failed to load preview:', e)
      } finally {
        if (!cancelled) setPreviewLoading(false)
      }
    }

    loadPreview()
    return () => { cancelled = true }
  }, [open, dateFrom, dateTo, exportType, fiscalYear, sortDir])

  // Format currency
  const eurFmt = useMemo(() => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }), [])

  // Format amount based on mode
  const formatAmount = (amount: number, type: string) => {
    if (amountMode === 'OUT_NEGATIVE' && type === 'OUT') {
      return eurFmt.format(-Math.abs(amount))
    }
    return eurFmt.format(amount)
  }

  // Get field label
  const getFieldLabel = (key: string) => all.find(f => f.key === key)?.label || key
  
  if (!open) return null
  
  const currentYear = new Date().getFullYear()
  const years = availableYears.length > 0 ? availableYears : [currentYear]
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900, width: '95vw' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0 }}>Export Optionen</h2>
              {(dateFrom || dateTo) && (
                <div className="helper" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <span>📅</span>
                  <span>{dateFrom || '…'} – {dateTo || '…'}</span>
                </div>
              )}
            </div>

            {setExportType && (
              <div>
                <div className="btn-group" role="tablist" aria-label="Export-Art">
                  <button
                    className="btn"
                    role="tab"
                    aria-selected={exportType === 'standard'}
                    onClick={() => setExportType('standard')}
                    style={{ background: exportType === 'standard' ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }}
                  >
                    📊 Standard (Controlling)
                  </button>
                  <button
                    className="btn"
                    role="tab"
                    aria-selected={exportType === 'fiscal'}
                    onClick={() => setExportType('fiscal')}
                    style={{ background: exportType === 'fiscal' ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }}
                  >
                    🏛️ Finanzamt (Jahresabschluss)
                  </button>
                  <button
                    className="btn"
                    role="tab"
                    aria-selected={exportType === 'treasurer'}
                    onClick={() => setExportType('treasurer')}
                    style={{ background: exportType === 'treasurer' ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }}
                  >
                    📋 Kassierbericht (Mitglieder)
                  </button>
                </div>
                <div className="helper" style={{ fontSize: 11, marginTop: 6, opacity: 0.85 }}>
                  {exportType === 'standard'
                    ? 'Standard-Export für Controlling und Analyse mit frei wählbaren Feldern und Zeitraum'
                    : exportType === 'fiscal'
                    ? 'Spezieller Jahresabschluss-Report für das Finanzamt nach § 64 AO mit Sphärentrennung'
                    : 'Übersichtlicher Kassenbericht als PDF für die Mitgliederversammlung mit allen wichtigen KPIs'}
                </div>
              </div>
            )}
          </div>
          <button 
            className="btn ghost" 
            onClick={onClose} 
            aria-label="Schließen"
            style={{ width: 32, height: 32, padding: 0, display: 'grid', placeItems: 'center', fontSize: 18 }}
          >
            ×
          </button>
        </header>
        
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

        {/* Treasurer report options (Kassierbericht) */}
        {exportType === 'treasurer' && setFiscalYear && (
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
                Berichtszeitraum: 01.01.{fiscalYear || currentYear} – 31.12.{fiscalYear || currentYear}
              </div>
            </div>

            <div className="field" style={{ gridColumn: '1 / span 2' }}>
              <label>Sektionen im Bericht</label>
              <div className="helper" style={{ fontSize: 11, marginBottom: 8, opacity: 0.85 }}>
                Kassenstand, Einnahmen/Ausgaben, Kassenprüfung und Sphären sind immer enthalten. Leere Sektionen werden automatisch ausgeblendet.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label className="chip" style={{ cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox" checked={trIncludeMembers} onChange={(e) => setTrIncludeMembers(e.target.checked)} style={{ marginRight: 6 }} />
                  Mitglieder-Statistik
                </label>
                <label className="chip" style={{ cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox" checked={trIncludeInvoices} onChange={(e) => setTrIncludeInvoices(e.target.checked)} style={{ marginRight: 6 }} />
                  Offene Verbindlichkeiten
                </label>
                <label className="chip" style={{ cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox" checked={trIncludeBindings} onChange={(e) => setTrIncludeBindings(e.target.checked)} style={{ marginRight: 6 }} />
                  Aktive Zweckbindungen
                </label>
                <label className="chip" style={{ cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox" checked={trIncludeBudgets} onChange={(e) => setTrIncludeBudgets(e.target.checked)} style={{ marginRight: 6 }} />
                  Budgets
                </label>
                <label className="chip" style={{ cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox" checked={trIncludeTagSummary} onChange={(e) => setTrIncludeTagSummary(e.target.checked)} style={{ marginRight: 6 }} />
                  Auswertung nach Tags
                </label>
                <label className="chip" style={{ cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox" checked={trIncludeVoucherList} onChange={(e) => setTrIncludeVoucherList(e.target.checked)} style={{ marginRight: 6 }} />
                  Einzelbuchungen als Anhang
                </label>
                {trIncludeVoucherList && (
                  <label className="chip" style={{ cursor: 'pointer', userSelect: 'none', marginLeft: 16 }}>
                    <input type="checkbox" checked={trIncludeTags} onChange={(e) => setTrIncludeTags(e.target.checked)} style={{ marginRight: 6 }} />
                    Tags in Buchungsliste anzeigen
                  </label>
                )}
              </div>
            </div>

            {trIncludeVoucherList && (
              <div className="field" style={{ gridColumn: '1 / span 2', paddingLeft: 16, borderLeft: '3px solid var(--accent)' }}>
                <label>Buchungsauflistung – Zeitraum &amp; Sortierung</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 6 }}>
                  <div>
                    <label className="helper" style={{ fontSize: 11 }}>Von</label>
                    <input type="date" className="input" value={trVoucherListFrom || `${fiscalYear || currentYear}-01-01`} onChange={(e) => setTrVoucherListFrom(e.target.value)} />
                  </div>
                  <div>
                    <label className="helper" style={{ fontSize: 11 }}>Bis</label>
                    <input type="date" className="input" value={trVoucherListTo || `${fiscalYear || currentYear}-12-31`} onChange={(e) => setTrVoucherListTo(e.target.value)} />
                  </div>
                  <div>
                    <label className="helper" style={{ fontSize: 11 }}>Sortierung</label>
                    <div className="btn-group" role="group">
                      <button className="btn" onClick={() => setTrVoucherListSort('ASC')} style={{ background: trVoucherListSort === 'ASC' ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }}>Aufsteigend</button>
                      <button className="btn" onClick={() => setTrVoucherListSort('DESC')} style={{ background: trVoucherListSort === 'DESC' ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }}>Absteigend</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Betragsdarstellung</label>
                <div className="btn-group" role="group">
                  <button className="btn" onClick={() => setAmountMode('POSITIVE_BOTH')} style={{ background: amountMode === 'POSITIVE_BOTH' ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }}>Beide positiv</button>
                  <button className="btn" onClick={() => setAmountMode('OUT_NEGATIVE')} style={{ background: amountMode === 'OUT_NEGATIVE' ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }}>Ausgaben negativ</button>
                </div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Sortierung (Datum)</label>
                <div className="btn-group" role="group">
                  <button className="btn" onClick={() => setSortDir('ASC')} style={{ background: sortDir === 'ASC' ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }}>Aufsteigend</button>
                  <button className="btn" onClick={() => setSortDir('DESC')} style={{ background: sortDir === 'DESC' ? 'color-mix(in oklab, var(--accent) 15%, transparent)' : undefined }}>Absteigend</button>
                </div>
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

        {/* Preview Section */}
        {exportType === 'standard' && fields.length > 0 && (
          <div className="field" style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                Vorschau
                <span className="helper" style={{ fontWeight: 400 }}>
                  ({previewTotal} Buchungen, zeige {Math.min(PREVIEW_LIMIT, previewData.length)})
                </span>
              </label>
            </div>
            <div style={{ 
              border: '1px solid var(--border)', 
              borderRadius: 8, 
              overflow: 'hidden',
              background: 'var(--surface)'
            }}>
              {previewLoading ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)' }}>
                  Lade Vorschau...
                </div>
              ) : previewData.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)' }}>
                  Keine Buchungen im gewählten Zeitraum
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="table" style={{ fontSize: 12, marginBottom: 0 }}>
                    <thead>
                      <tr>
                        {fields.map(key => (
                          <th key={key} style={{ whiteSpace: 'nowrap', padding: '8px 10px' }}>
                            {getFieldLabel(key)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.map(row => (
                        <tr key={row.id}>
                          {fields.map(key => {
                            let value: React.ReactNode = ''
                            switch (key) {
                              case 'date':
                                value = row.date
                                break
                              case 'voucherNo':
                                value = row.voucherNo
                                break
                              case 'type':
                                value = (
                                  <span className={`badge ${row.type.toLowerCase()}`}>
                                    {row.type === 'IN' ? '↓ E' : row.type === 'OUT' ? '↑ A' : '⇄ U'}
                                  </span>
                                )
                                break
                              case 'sphere':
                                value = row.sphere || '—'
                                break
                              case 'description':
                                value = (
                                  <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                                    {row.description || '—'}
                                  </span>
                                )
                                break
                              case 'paymentMethod':
                                value = row.paymentMethod === 'CASH' ? '💵 Bar' : row.paymentMethod === 'BANK' ? '🏦 Bank' : '—'
                                break
                              case 'netAmount':
                                value = <span style={{ color: row.type === 'OUT' && amountMode === 'OUT_NEGATIVE' ? 'var(--danger)' : undefined }}>{formatAmount(row.netAmount, row.type)}</span>
                                break
                              case 'vatAmount':
                                const vatAmount = row.grossAmount - row.netAmount
                                value = eurFmt.format(vatAmount)
                                break
                              case 'grossAmount':
                                value = <span style={{ color: row.type === 'OUT' && amountMode === 'OUT_NEGATIVE' ? 'var(--danger)' : undefined, fontWeight: 500 }}>{formatAmount(row.grossAmount, row.type)}</span>
                                break
                              case 'tags':
                                value = row.tags?.length ? row.tags.join(', ') : '—'
                                break
                            }
                            return (
                              <td key={key} style={{ padding: '8px 10px', whiteSpace: key === 'description' ? 'normal' : 'nowrap' }}>
                                {value}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {previewTotal > PREVIEW_LIMIT && !previewLoading && (
                <div style={{ 
                  padding: '8px 12px', 
                  background: 'color-mix(in oklab, var(--accent) 8%, transparent)',
                  borderTop: '1px solid var(--border)',
                  fontSize: 11,
                  color: 'var(--text-dim)',
                  textAlign: 'center'
                }}>
                  ... und {previewTotal - PREVIEW_LIMIT} weitere Buchungen
                </div>
              )}
            </div>
          </div>
        )}
        
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          {exportType === 'fiscal' ? (
            <button 
              className="btn" 
              onClick={() => onExport('PDF_FISCAL')}
              style={{ background: 'color-mix(in oklab, #e53935 85%, transparent)', color: '#fff' }}
            >
              📄 PDF (Finanzamt)
            </button>
          ) : exportType === 'treasurer' ? (
            <button 
              className="btn" 
              onClick={() => onExport('PDF_TREASURER', {
                includeMembers: trIncludeMembers,
                includeInvoices: trIncludeInvoices,
                includeBindings: trIncludeBindings,
                includeBudgets: trIncludeBudgets,
                includeTagSummary: trIncludeTagSummary,
                includeVoucherList: trIncludeVoucherList,
                includeTags: trIncludeVoucherList ? trIncludeTags : false,
                voucherListFrom: trIncludeVoucherList ? (trVoucherListFrom || `${fiscalYear || currentYear}-01-01`) : undefined,
                voucherListTo: trIncludeVoucherList ? (trVoucherListTo || `${fiscalYear || currentYear}-12-31`) : undefined,
                voucherListSort: trVoucherListSort
              })}
              style={{ background: 'color-mix(in oklab, #1565c0 85%, transparent)', color: '#fff' }}
            >
              📋 PDF (Kassierbericht)
            </button>
          ) : (
            <>
              <button 
                className="btn" 
                onClick={() => onExport('CSV')}
                style={{ background: 'color-mix(in oklab, #607d8b 75%, transparent)', color: '#fff' }}
              >
                CSV
              </button>
              <button 
                className="btn" 
                onClick={() => onExport('PDF')}
                style={{ background: 'color-mix(in oklab, #e53935 85%, transparent)', color: '#fff' }}
              >
                PDF
              </button>
              <button 
                className="btn" 
                onClick={() => onExport('XLSX')}
                style={{ background: 'color-mix(in oklab, #43a047 85%, transparent)', color: '#fff' }}
              >
                XLSX
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
