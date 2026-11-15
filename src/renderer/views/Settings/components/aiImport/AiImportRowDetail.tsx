import { IconAlertTriangle, IconChevronLeft, IconChevronRight, IconInfoCircle, IconX } from '@tabler/icons-react'
import type { AiImportRow } from '../../../../../../shared/aiImport'
import { budgetYearAcknowledgement } from '../../../../../../shared/aiImport'
import { fieldLabels, rowState, SPHERES, type FieldKey } from './model'
import { StatePill } from './parts'
import { useEffect, useRef, useState } from 'react'
import DatePickerButton from '../../../../components/common/DatePickerButton'
import { formatEuro, formatDate, parseAmount } from './model'
import { ClassBadge, OriginMark, TypeBadge } from './parts'

const layout: Array<{ field: FieldKey; wide?: boolean }> = [
  { field: 'date' }, { field: 'type' }, { field: 'description', wide: true }, { field: 'category' }, { field: 'sphere' }, { field: 'paymentAccount' },
  { field: 'grossAmount' }, { field: 'netAmount' }, { field: 'vatRate' }, { field: 'tags', wide: true }, { field: 'budget' }, { field: 'budgetAmount' },
  { field: 'earmarkCode' }, { field: 'earmarkAmount' }
]
const listFields = new Set<string>(['category', 'paymentAccount', 'budget', 'earmarkCode'])

export function AiImportRowDetail({ row, general, editable, sheetName, position, onChange, onClose, onPrev, onNext }: {
  row: AiImportRow
  general: boolean
  editable: boolean
  sheetName: string
  position: string
  onChange: (field: string, value: unknown) => void
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
}) {
  const n = row.draft.sourceRow
  const panelRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => { if (previous?.isConnected) previous.focus() }
  }, [])
  const dateInputRef = useRef<HTMLInputElement>(null)
  const rawDate = String(row.draft.values.date || '')
  const parsedDate = new Date(`${rawDate}T00:00:00Z`)
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && Number.isFinite(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === rawDate
  const [editingId, setEditingId] = useState<string | null>(null)
  const editing = editingId === row.draft.id
  const fields = layout.filter(({ field }) => general ? field !== 'sphere' : field !== 'category')
  const deviations = Object.values(row.reasons).filter(r => r.includes('weicht'))
  const net = parseAmount(row.draft.values.netAmount)
  const amount = parseAmount(row.draft.values.grossAmount) ?? (net == null ? null : net * (1 + (parseAmount(row.draft.values.vatRate) ?? 0) / 100))
  const budgetPeriodBlocked = row.draft.issues.some(i => i.code === 'budgetId' && i.level === 'error')

  return <aside ref={panelRef} tabIndex={-1} role="dialog" aria-modal="false" className="ai-import-detail" aria-label={`Details Zeile ${n}`} onKeyDown={e => {
    if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); e.stopPropagation(); onClose() }
  }}>
    <header className="ai-import-detail__head">
      <div><h3>Buchungsdetails</h3><span className="ai-import-muted">Zeile {n} · {position}</span></div>
      <StatePill state={rowState(row)} />
      <span className="ai-import-toolbar__spacer" />
      <button type="button" className="btn ghost icon" aria-label="Vorherige Zeile" disabled={!onPrev} onClick={onPrev}><IconChevronLeft size={16} aria-hidden="true" /></button>
      <button type="button" className="btn ghost icon" aria-label="Nächste Zeile" disabled={!onNext} onClick={onNext}><IconChevronRight size={16} aria-hidden="true" /></button>
      <button type="button" className="btn ghost icon" aria-label="Details schließen" onClick={onClose}><IconX size={16} aria-hidden="true" /></button>
    </header>
    <div className="ai-import-detail__body">
      <div className={`ai-import-detail-summary ${row.draft.values.type === 'OUT' ? 'is-out' : 'is-in'}`}><strong>{amount == null ? '—' : `${row.draft.values.type === 'OUT' ? '−' : '+'}${formatEuro(Math.abs(amount))}`}</strong><p>{String(row.draft.values.description || 'Ohne Beschreibung')}</p></div>
      <label className="ai-import-switch"><input type="checkbox" disabled={!editable || row.draft.status === 'ignored'} checked={row.selected} onChange={e => onChange('selected', e.target.checked)} /> Diese Zeile importieren</label>
      {(row.draft.issues.length > 0 || deviations.length > 0) && <ul className="ai-import-issue-list">
        {row.draft.issues.map((issue, i) => <li key={i} className={`is-${issue.level}`}>{issue.level === 'info' ? <IconInfoCircle size={16} aria-hidden="true" /> : <IconAlertTriangle size={16} aria-hidden="true" />}<span>{issue.message}{issue.code === 'budgetYear' && issue.level === 'warning' && !budgetPeriodBlocked && <><small className="ai-import-warning-help">Passt diese Zuordnung für dich, kannst du sie beibehalten. Das Buchungsdatum bleibt unverändert.</small><button type="button" className="btn" disabled={!editable} onClick={() => onChange('acceptedBudgetYear', budgetYearAcknowledgement(row.draft.values, issue.message))}>Zuordnung beibehalten</button></>}</span></li>)}
        {deviations.map(text => <li key={text} className="is-warning"><IconAlertTriangle size={16} aria-hidden="true" />{text}</li>)}
      </ul>}
      {!editing && <dl className="ai-import-detail-facts">{fields.filter(f => !['description', 'grossAmount', 'netAmount', 'vatRate'].includes(f.field)).map(({ field }) => <div key={field}><dt>{fieldLabels[field]}</dt><dd>{field === 'type' ? <TypeBadge type={row.draft.values.type} /> : field === 'category' || field === 'sphere' ? <ClassBadge value={row.draft.values[field]} sphere={field === 'sphere'} /> : field === 'date' ? formatDate(row.draft.values.date) : String(row.draft.values[field] || '—')}</dd></div>)}</dl>}
      {editing && <div className="ai-import-detail__form">
        {fields.map(({ field, wide }) => {
          const label = fieldLabels[field]
          const origin = row.origins[field]
          const value = row.draft.values[field] ?? ''
          const aria = `${label} Zeile ${n}`
          return <div key={field} className={`ai-import-field ${wide ? 'is-wide' : ''}`}>
            <span className="ai-import-field__label">{label}<OriginMark origin={origin} reason={row.reasons[field] === 'Im Entwurf geändert.' ? undefined : row.reasons[field]} /></span>
            {field === 'date' ? <><span className="booking-date-input-wrap"><input ref={dateInputRef} type="date" className="input" aria-label={aria} aria-invalid={!!rawDate && !validDate} disabled={!editable} value={validDate ? rawDate : ''} onChange={e => onChange('date', e.target.value)} /><DatePickerButton inputRef={dateInputRef} disabled={!editable} ariaLabel={`Kalender für Zeile ${n} öffnen`} /></span>{rawDate && !validDate && <small className="ai-import-invalid-date">Ungültiger Datumswert: {rawDate}. Bitte ein gültiges Datum wählen.</small>}</> : field === 'type' || field === 'sphere'
              ? <select className="input" aria-label={aria} disabled={!editable} value={String(value)} onChange={e => onChange(field, e.target.value)}><option value="">Bitte wählen</option>{(field === 'type' ? ['IN', 'OUT'] : SPHERES).map(v => <option key={v}>{v}</option>)}</select>
              : <input className="input" aria-label={aria} disabled={!editable} value={String(value)} list={listFields.has(field) ? `ai-import-list-${field}` : undefined} onChange={e => onChange(field, e.target.value)} />}
            {row.reasons[field] && row.reasons[field] !== 'Im Entwurf geändert.' && origin !== 'source' && <small className="ai-import-muted">{row.reasons[field]}</small>}
          </div>
        })}
      </div>}
      <details className="ai-import-source" aria-label="Originalquelle">
        <summary>Originalquelle: {sheetName}, Zeile {n}</summary>
        <dl>{Object.entries(row.draft.original).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{String(v ?? '') || '—'}</dd></div>)}</dl>
      </details>
    </div>
    <footer className="ai-import-detail-footer"><button className="btn primary" disabled={!editable} onClick={() => setEditingId(editing ? null : row.draft.id)}>{editing ? 'Details anzeigen' : 'Bearbeiten'}</button></footer>
  </aside>
}
