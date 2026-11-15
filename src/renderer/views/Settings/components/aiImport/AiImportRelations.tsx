import { IconArrowsExchange, IconCheck, IconCopy, IconHelpCircle, IconInfoCircle, IconReceiptRefund, IconArrowBackUp } from '@tabler/icons-react'
import type { AiImportRelation, AiImportRow } from '../../../../../../shared/aiImport'
import { formatAmount, formatDate, relationLabels } from './model'
import { TypeBadge } from './parts'

const relationIcons = { duplicate: IconCopy, reversal: IconArrowBackUp, refund: IconReceiptRefund, transfer: IconArrowsExchange, unclear: IconHelpCircle }

export function AiImportRelations({ relations, rows, editable, onChangeRow, onConfirmAll, onOpenRow }: {
  relations: readonly AiImportRelation[]
  rows: readonly AiImportRow[]
  editable: boolean
  onChangeRow: (id: string, field: 'selected' | 'relationsChecked', value: boolean) => void
  onConfirmAll: (ids: readonly string[]) => void
  onOpenRow: (id: string) => void
}) {
  if (!relations.length) return <div className="ai-import-empty-state"><IconCheck size={28} aria-hidden="true" /><strong>Keine möglichen Beziehungen gefunden</strong><span>Die KI hat keine Duplikate, Stornos, Erstattungen oder Umbuchungen erkannt.</span></div>

  return <div className="ai-import-relations">
    <p className="ai-import-callout is-info"><IconInfoCircle size={16} aria-hidden="true" /><span>Diese Hinweise erzeugen keine Stornos, Erstattungen oder Transfers. Wähle doppelte Zeilen ab oder bestätige, dass die Zeilen als einzelne Buchungen übernommen werden sollen.</span></p>
    {relations.map(rel => {
      const relRows = rel.rowIds.map(id => rows.find(r => r.draft.id === id)).filter((r): r is AiImportRow => !!r)
      const open = relRows.filter(r => r.selected && !r.relationsChecked)
      const Icon = relationIcons[rel.kind]
      return <section className={`ai-import-relation ${open.length ? 'is-open' : 'is-done'}`} key={rel.id} aria-label={relationLabels[rel.kind]}>
        <header>
          <span className="ai-import-relation__icon"><Icon size={18} aria-hidden="true" /></span>
          <div><h4>{relationLabels[rel.kind]}</h4><p>{rel.reason}</p></div>
          <span className={`ai-import-pill ${open.length ? 'is-warning' : 'is-ok'}`}>{open.length ? `${open.length} offen` : 'Geprüft'}</span>
          {open.length > 0 && <button type="button" className="btn" disabled={!editable} onClick={() => onConfirmAll(open.map(r => r.draft.id))}>Alle bestätigen</button>}
        </header>
        <ul>{relRows.map(row => <li key={row.draft.id} className={row.selected ? undefined : 'is-excluded'}>
          <button type="button" className="ai-import-rowref" aria-label={`Zeile ${row.draft.sourceRow} öffnen`} onClick={() => onOpenRow(row.draft.id)}>{row.draft.sourceRow}</button>
          <span className="is-nowrap">{formatDate(row.draft.values.date)}</span>
          <span className="ai-import-relation__desc">{String(row.draft.values.description ?? '')}</span>
          <TypeBadge type={row.draft.values.type} />
          <span className="is-num">{formatAmount(row.draft.values.grossAmount)}</span>
          <label className="ai-import-check"><input type="checkbox" disabled={!editable} checked={row.selected} onChange={e => onChangeRow(row.draft.id, 'selected', e.target.checked)} /> Importieren</label>
          <label className="ai-import-check"><input type="checkbox" disabled={!editable || !row.selected} checked={row.relationsChecked} onChange={e => onChangeRow(row.draft.id, 'relationsChecked', e.target.checked)} /> Beziehung geprüft</label>
        </li>)}</ul>
        {rel.voucherId && <p className="ai-import-muted">Bezieht sich auf die vorhandene Buchung #{rel.voucherId}.</p>}
      </section>
    })}
  </div>
}
