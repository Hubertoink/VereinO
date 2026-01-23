import React, { useState, useEffect } from 'react'

export type MemberExportField = 
  | 'memberNo' 
  | 'name' 
  | 'email' 
  | 'phone' 
  | 'address' 
  | 'status' 
  | 'boardRole' 
  | 'iban' 
  | 'bic' 
  | 'contribution_amount' 
  | 'contribution_interval' 
  | 'mandate_ref' 
  | 'mandate_date' 
  | 'join_date' 
  | 'leave_date' 
  | 'notes'

export type MemberExportStatus = 'ALL' | 'ACTIVE' | 'NEW' | 'PAUSED' | 'LEFT'

interface MembersExportModalProps {
  open: boolean
  onClose: () => void
  currentFilter?: MemberExportStatus
  currentQuery?: string
}

const ALL_FIELDS: Array<{ key: MemberExportField; label: string; default: boolean }> = [
  { key: 'memberNo', label: 'Nr.', default: true },
  { key: 'name', label: 'Name', default: true },
  { key: 'email', label: 'E-Mail', default: true },
  { key: 'phone', label: 'Telefon', default: true },
  { key: 'address', label: 'Adresse', default: true },
  { key: 'status', label: 'Status', default: true },
  { key: 'boardRole', label: 'Vorstand', default: false },
  { key: 'join_date', label: 'Eintritt', default: true },
  { key: 'leave_date', label: 'Austritt', default: false },
  { key: 'iban', label: 'IBAN', default: false },
  { key: 'bic', label: 'BIC', default: false },
  { key: 'contribution_amount', label: 'Beitrag', default: false },
  { key: 'contribution_interval', label: 'Intervall', default: false },
  { key: 'mandate_ref', label: 'Mandat-Ref', default: false },
  { key: 'mandate_date', label: 'Mandat-Dat.', default: false },
  { key: 'notes', label: 'Notizen', default: false }
]

const STATUS_OPTIONS: Array<{ value: MemberExportStatus; label: string }> = [
  { value: 'ALL', label: 'Alle Mitglieder' },
  { value: 'ACTIVE', label: 'Nur aktive' },
  { value: 'NEW', label: 'Nur neue' },
  { value: 'PAUSED', label: 'Nur pausierte' },
  { value: 'LEFT', label: 'Nur ausgetretene' }
]

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Aktiv',
  NEW: 'Neu',
  PAUSED: 'Pause',
  LEFT: 'Austritt'
}

const BOARD_ROLE_LABELS: Record<string, string> = {
  V1: '1. Vors.',
  V2: '2. Vors.',
  KASSIER: 'Kassier',
  KASSENPR1: '1. Prüfer',
  KASSENPR2: '2. Prüfer',
  SCHRIFT: 'Schriftf.'
}

export default function MembersExportModal({ open, onClose, currentFilter = 'ALL', currentQuery = '' }: MembersExportModalProps) {
  const [statusFilter, setStatusFilter] = useState<MemberExportStatus>(currentFilter)
  const [useSearchQuery, setUseSearchQuery] = useState(!!currentQuery)
  const [searchQuery, setSearchQuery] = useState(currentQuery)
  const [selectedFields, setSelectedFields] = useState<Set<MemberExportField>>(() => {
    const defaults = new Set<MemberExportField>()
    ALL_FIELDS.forEach(f => { if (f.default) defaults.add(f.key) })
    return defaults
  })
  const [sortBy, setSortBy] = useState<'memberNo' | 'name'>('memberNo')
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('ASC')
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [exportedPath, setExportedPath] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<any[]>([])
  const [previewTotal, setPreviewTotal] = useState(0)

  // Load preview data
  useEffect(() => {
    if (!open) return
    let alive = true
    ;(async () => {
      try {
        const res = await (window as any).api?.members?.list?.({
          q: useSearchQuery ? searchQuery : undefined,
          status: statusFilter === 'ALL' ? undefined : statusFilter,
          limit: 5,
          offset: 0,
          sortBy,
          sort: sortDir
        })
        if (alive) {
          setPreviewData(res?.rows || [])
          setPreviewTotal(res?.total || 0)
        }
      } catch {
        if (alive) {
          setPreviewData([])
          setPreviewTotal(0)
        }
      }
    })()
    return () => { alive = false }
  }, [open, statusFilter, useSearchQuery, searchQuery, sortBy, sortDir])

  if (!open) return null

  const toggleField = (key: MemberExportField) => {
    setSelectedFields(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const selectAll = () => {
    setSelectedFields(new Set(ALL_FIELDS.map(f => f.key)))
  }

  const selectDefaults = () => {
    const defaults = new Set<MemberExportField>()
    ALL_FIELDS.forEach(f => { if (f.default) defaults.add(f.key) })
    setSelectedFields(defaults)
  }

  const deselectAll = () => {
    setSelectedFields(new Set(['memberNo', 'name']))
  }

  const handleExport = async (format: 'XLSX' | 'PDF') => {
    if (selectedFields.size === 0) {
      setError('Bitte mindestens ein Feld auswählen.')
      return
    }

    setExporting(true)
    setError(null)
    setSuccess(null)

    try {
      const payload = {
        format,
        status: statusFilter,
        q: useSearchQuery ? searchQuery : undefined,
        fields: Array.from(selectedFields),
        sortBy,
        sortDir
      }
      const result = await (window as any).api?.members?.export?.(payload)
      if (result?.filePath) {
        setExportedPath(result.filePath)
        setSuccess(`Export gespeichert: ${result.filePath}`)
      } else {
        setError('Export fehlgeschlagen.')
      }
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setExporting(false)
    }
  }

  // Get ordered fields for preview (only selected ones)
  const orderedSelectedFields = ALL_FIELDS.filter(f => selectedFields.has(f.key))

  // Format cell value for preview
  const formatCell = (member: any, field: MemberExportField): string => {
    const value = member[field]
    if (value === null || value === undefined || value === '') return '—'
    
    switch (field) {
      case 'status':
        return STATUS_LABELS[value] || value
      case 'boardRole':
        return BOARD_ROLE_LABELS[value] || value
      case 'contribution_amount':
        return typeof value === 'number' ? `${value.toFixed(2)} €` : value
      case 'join_date':
      case 'leave_date':
      case 'mandate_date':
        try {
          const d = new Date(value)
          if (!isNaN(d.getTime())) return d.toLocaleDateString('de-DE')
        } catch {}
        return value
      default:
        const str = String(value)
        return str.length > 20 ? str.slice(0, 18) + '…' : str
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal members-export-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <header className="members-export-header">
          <h2>Mitglieder exportieren</h2>
          <button className="btn ghost" onClick={onClose} aria-label="Schließen" title="Schließen">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </header>

        <div className="members-export-content">
          {/* Filter & Sort Row */}
          <div className="members-export-row">
            <div className="members-export-section" style={{ flex: 1 }}>
              <div className="helper" style={{ marginBottom: 6 }}>Filter</div>
              <select 
                className="input" 
                value={statusFilter} 
                onChange={(e) => setStatusFilter(e.target.value as MemberExportStatus)}
              >
                {STATUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <label className="members-export-checkbox-label" style={{ marginTop: 8 }}>
                <input 
                  type="checkbox" 
                  checked={useSearchQuery} 
                  onChange={(e) => setUseSearchQuery(e.target.checked)} 
                />
                <span>Suchbegriff</span>
              </label>
              {useSearchQuery && (
                <input 
                  className="input" 
                  placeholder="Name, E-Mail, Nr. ..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ marginTop: 4 }}
                />
              )}
            </div>
            <div className="members-export-section" style={{ flex: 1 }}>
              <div className="helper" style={{ marginBottom: 6 }}>Sortierung</div>
              <div className="members-export-sort-group">
                <select className="input" value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
                  <option value="memberNo">Nr.</option>
                  <option value="name">Name</option>
                </select>
                <button 
                  className={`btn members-export-sort-btn ${sortDir === 'ASC' ? 'active' : ''}`}
                  onClick={() => setSortDir('ASC')}
                  title="Aufsteigend"
                >
                  ↑
                </button>
                <button 
                  className={`btn members-export-sort-btn ${sortDir === 'DESC' ? 'active' : ''}`}
                  onClick={() => setSortDir('DESC')}
                  title="Absteigend"
                >
                  ↓
                </button>
              </div>
            </div>
          </div>

          {/* Fields Section */}
          <div className="members-export-section">
            <div className="members-export-fields-header">
              <div className="helper">Spalten ({selectedFields.size})</div>
              <div className="members-export-field-actions">
                <button className="btn btn-small" onClick={selectAll}>Alle</button>
                <button className="btn btn-small" onClick={selectDefaults}>Standard</button>
                <button className="btn btn-small" onClick={deselectAll}>Min</button>
              </div>
            </div>
            <div className="members-export-fields-grid">
              {ALL_FIELDS.map(field => (
                <label key={field.key} className="members-export-field-item">
                  <input 
                    type="checkbox" 
                    checked={selectedFields.has(field.key)}
                    onChange={() => toggleField(field.key)}
                    disabled={field.key === 'name'}
                  />
                  <span>{field.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Preview Table */}
          <div className="members-export-preview">
            <div className="members-export-preview-header">
              <span className="helper">Vorschau</span>
              <span className="members-export-preview-count">{previewTotal} Mitglieder</span>
            </div>
            <div className="members-export-preview-table-wrap">
              <table className="members-export-preview-table">
                <thead>
                  <tr>
                    {orderedSelectedFields.map(f => (
                      <th key={f.key}>{f.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.length === 0 ? (
                    <tr>
                      <td colSpan={orderedSelectedFields.length} style={{ textAlign: 'center', opacity: 0.6 }}>
                        Keine Daten
                      </td>
                    </tr>
                  ) : (
                    previewData.map((member, idx) => (
                      <tr key={member.id || idx}>
                        {orderedSelectedFields.map(f => (
                          <td key={f.key}>{formatCell(member, f.key)}</td>
                        ))}
                      </tr>
                    ))
                  )}
                  {previewTotal > 5 && (
                    <tr className="members-export-preview-more">
                      <td colSpan={orderedSelectedFields.length}>
                        … und {previewTotal - 5} weitere
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Error/Success Messages */}
          {error && (
            <div className="members-export-message members-export-error">
              ⚠️ {error}
            </div>
          )}
          {success && (
            <div className="members-export-message members-export-success">
              <span>✓ {success}</span>
              {exportedPath && (
                <button 
                  className="btn btn-small members-export-open-folder"
                  onClick={() => (window as any).api?.shell?.showItemInFolder?.(exportedPath)}
                  title="Ordner öffnen"
                >
                  📂 Öffnen
                </button>
              )}
            </div>
          )}
        </div>

        <footer className="members-export-footer">
          <div className="members-export-actions">
            <button 
              className="btn members-export-btn-excel" 
              onClick={() => handleExport('XLSX')} 
              disabled={exporting || selectedFields.size === 0}
            >
              {exporting ? '...' : 'Excel (.xlsx)'}
            </button>
            <button 
              className="btn members-export-btn-pdf" 
              onClick={() => handleExport('PDF')} 
              disabled={exporting || selectedFields.size === 0}
            >
              {exporting ? '...' : 'PDF'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
