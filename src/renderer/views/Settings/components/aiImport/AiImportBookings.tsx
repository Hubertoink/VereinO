import { useEffect, useRef, useState } from 'react'
import { IconAdjustmentsHorizontal, IconAlertTriangle, IconCheck, IconCircleOff, IconColumns3, IconFileText, IconPencil, IconPinned, IconSparkles, IconSum, IconX } from '@tabler/icons-react'
import type { AiImportRow } from '../../../../../../shared/aiImport'
import { fieldLabels, formatAmount, formatDate, formatEuro, matchesFilter, parseAmount, rowHints, rowState, type FieldKey, type RowFilter } from './model'
import { ClassBadge, OriginMark, StatePill, TypeBadge } from './parts'

const extraFields: FieldKey[] = ['netAmount', 'vatRate', 'tags', 'budget', 'earmarkCode']

export function AiImportBookings({ search = '', onSearch = () => {}, rows, general, editable, detailId, filter, onFilter, onOpen, onSelect, onBulk }: {
  onSearch?: (value: string) => void
  search?: string
  rows: readonly AiImportRow[]
  general: boolean
  editable: boolean
  detailId: string | null
  filter: RowFilter
  onFilter: (filter: RowFilter) => void
  onOpen: (id: string) => void
  onSelect: (ids: readonly string[], selected: boolean) => void
  onBulk: (field: string, value: string, onlyEmpty: boolean) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkField, setBulkField] = useState('paymentAccount')
  const [bulkValue, setBulkValue] = useState('')
  const [onlyEmpty, setOnlyEmpty] = useState(true)
  const headerCheck = useRef<HTMLInputElement>(null)
  const classField = general ? 'category' : 'sphere'
  const query = search.trim().toLocaleLowerCase('de')

  const states = rows.map(rowState)
  const count = (f: RowFilter) => states.filter(s => matchesFilter(s, f)).length
  const selected = rows.filter(r => r.selected)
  const balance = selected.reduce((sum, r) => sum + (parseAmount(r.draft.values.grossAmount) ?? 0) * (String(r.draft.values.type).toUpperCase() === 'OUT' ? -1 : 1), 0)
  const visible = rows.filter((r, i) => matchesFilter(states[i], filter) && (!query || Object.values(r.draft.values).join(' ').toLocaleLowerCase('de').includes(query)))
  const selectable = visible.filter(r => r.draft.status !== 'ignored')
  const allChecked = selectable.length > 0 && selectable.every(r => r.selected)
  const someChecked = selectable.some(r => r.selected)
  useEffect(() => { if (headerCheck.current) headerCheck.current.indeterminate = someChecked && !allChecked }, [someChecked, allChecked])

  const metrics: Array<{ filter: RowFilter; label: string; value: number; tone: string; Icon: typeof IconCheck }> = [
    { filter: 'all', label: 'Buchungen gesamt', value: rows.length, tone: 'neutral', Icon: IconFileText },
    { filter: 'ok', label: 'Bereit zur Übernahme', value: count('ok'), tone: 'success', Icon: IconCheck },
    { filter: 'warning', label: 'Mit Hinweis', value: count('warning'), tone: 'warning', Icon: IconAlertTriangle },
    { filter: 'error', label: 'Korrektur nötig', value: count('error'), tone: 'danger', Icon: IconX },
    { filter: 'excluded', label: 'Nicht importieren', value: count('excluded'), tone: 'muted', Icon: IconCircleOff }
  ]

  return <div className="ai-import-bookings-view">
    <div className="ai-import-metrics" role="group" aria-label="Status filtern">
      {metrics.map(m => <button type="button" key={m.filter} className={`ai-import-metric is-${m.tone}`} aria-pressed={filter === m.filter} onClick={() => onFilter(filter === m.filter ? 'all' : m.filter)}>
        <span className="ai-import-metric__icon"><m.Icon size={18} aria-hidden="true" /></span><strong>{m.value}</strong><span>{m.label}</span>
      </button>)}
      <div className="ai-import-metric is-sum"><span className="ai-import-metric__icon"><IconSum size={18} aria-hidden="true" /></span><strong>{formatEuro(balance)}</strong><span>Saldo der Auswahl</span></div>
    </div>

    <div className="ai-import-toolbar">
      <span className="ai-import-toolbar__spacer" />
      <button type="button" className="btn btn-with-icon" aria-expanded={bulkOpen} disabled={!editable} onClick={() => setBulkOpen(!bulkOpen)}><IconAdjustmentsHorizontal size={16} aria-hidden="true" />Sammeländerung</button>
      <button type="button" className="btn btn-with-icon" aria-pressed={expanded} onClick={() => setExpanded(!expanded)}><IconColumns3 size={16} aria-hidden="true" />{expanded ? 'Kompakte Spalten' : 'Alle Spalten'}</button>
    </div>

    {bulkOpen && editable && <div className="ai-import-bulk" role="group" aria-label="Sammeländerung">
      <label className="ai-import-field">Feld<select className="input" value={bulkField} onChange={e => setBulkField(e.target.value)}><option value="paymentAccount">Konto</option><option value={classField}>{general ? 'Kategorie' : 'Sphäre'}</option><option value="tags">Tags (mit ; trennen)</option><option value="budget">Budget</option></select></label>
      <label className="ai-import-field">Neuer Wert<input className="input" value={bulkValue} onChange={e => setBulkValue(e.target.value)} /></label>
      <label className="ai-import-check"><input type="checkbox" checked={onlyEmpty} onChange={e => setOnlyEmpty(e.target.checked)} /> Nur leere Felder ergänzen</label>
      <button type="button" className="btn primary" disabled={!bulkValue.trim()} onClick={() => { onBulk(bulkField, bulkValue.trim(), onlyEmpty); setBulkValue('') }}>Auf {selected.length} ausgewählte Zeilen anwenden</button>
    </div>}

    <div className="ai-import-table-scroll">
      <table className="ai-import-bookings">
        <thead><tr>
          <th className="is-check"><input ref={headerCheck} type="checkbox" aria-label="Alle sichtbaren Zeilen auswählen" disabled={!editable || !selectable.length} checked={allChecked} onChange={e => onSelect(selectable.map(r => r.draft.id), e.target.checked)} /></th>
          <th>Zeile</th><th>Datum</th><th>Beschreibung</th><th>Art</th><th>{general ? 'Kategorie' : 'Sphäre'}</th><th>Konto</th><th className="is-num">Betrag</th>
          {expanded && extraFields.map(f => <th key={f} className={['netAmount', 'vatRate'].includes(f) ? 'is-num' : undefined}>{fieldLabels[f]}</th>)}
          <th>Status</th><th className="is-hint">Hinweise</th><th className="is-action"><span className="sr-only">Aktionen</span></th>
        </tr></thead>
        <tbody>
          {visible.map(row => {
            const { id, sourceRow, values } = row.draft
            const state = rowState(row)
            const hints = rowHints(row)
            const mark = (field: string) => <OriginMark origin={row.origins[field]} reason={row.reasons[field]} />
            return <tr key={id} className={`is-${state} ${detailId === id ? 'is-active' : ''}`} onClick={() => onOpen(id)}>
              <td className="is-check" onClick={e => e.stopPropagation()}><input aria-label={`Zeile ${sourceRow} importieren`} type="checkbox" disabled={!editable || row.draft.status === 'ignored'} checked={row.selected} onChange={e => onSelect([id], e.target.checked)} /></td>
              <td><button type="button" className="ai-import-rowref" aria-label={`Zeile ${sourceRow}`} onClick={e => { e.stopPropagation(); onOpen(id) }}>{sourceRow}</button></td>
              <td className="is-nowrap">{formatDate(values.date) || <span className="ai-import-empty">—</span>}{mark('date')}</td>
              <td className="is-desc"><span title={String(values.description ?? '')}>{String(values.description ?? '') || <span className="ai-import-empty">—</span>}</span>{mark('description')}</td>
              <td><TypeBadge type={values.type} />{mark('type')}</td>
              <td className="is-nowrap"><ClassBadge value={values[classField]} sphere={!general} />{mark(classField)}</td>
              <td className="is-nowrap">{String(values.paymentAccount ?? '') || <span className="ai-import-empty">—</span>}{mark('paymentAccount')}</td>
              <td className="is-num">{values.grossAmount !== '' && values.grossAmount != null ? formatAmount(values.grossAmount) : <span className="ai-import-empty">—</span>}{mark('grossAmount')}</td>
              {expanded && extraFields.map(f => <td key={f} className={['netAmount', 'vatRate'].includes(f) ? 'is-num' : 'is-nowrap'}>{f === 'netAmount' && values[f] ? formatAmount(values[f]) : String(values[f] ?? '') || <span className="ai-import-empty">—</span>}{mark(f)}</td>)}
              <td><StatePill state={state} /></td>
              <td className="is-hint" title={hints.join('\n')}>{hints[0] || <span className="ai-import-empty">—</span>}{hints.length > 1 && <span className="ai-import-more">+{hints.length - 1}</span>}</td>
              <td className="is-action"><button type="button" className="btn ghost icon" aria-label={`Zeile ${sourceRow} bearbeiten`} title="Details & Bearbeiten" onClick={e => { e.stopPropagation(); onOpen(id) }}><IconPencil size={16} aria-hidden="true" /></button></td>
            </tr>
          })}
          {!visible.length && <tr className="ai-import-table-empty"><td colSpan={99}>Keine Buchungen für diese Auswahl.{(filter !== 'all' || query) && <button type="button" className="btn ghost" onClick={() => { onFilter('all'); onSearch('') }}>Filter zurücksetzen</button>}</td></tr>}
        </tbody>
      </table>
    </div>
    <p className="ai-import-legend" aria-label="Legende">
      <span><IconSparkles size={12} aria-hidden="true" className="is-ai" /> KI-Vorschlag</span>
      <span><IconPencil size={12} aria-hidden="true" className="is-user" /> Manuell geändert</span>
      <span><IconPinned size={12} aria-hidden="true" className="is-default" /> Nutzervorgabe</span>
      <span>Ohne Markierung: aus der Datei · {visible.length} von {rows.length} Zeilen angezeigt</span>
    </p>
  </div>
}
