import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconHistory } from '@tabler/icons-react'
import ModalHeader from '../../components/ModalHeader'
import { MEMBER_HISTORY_FIELDS, type MemberHistoryChange, type MemberHistoryEntry } from '../../../../shared/memberHistory'
import './memberHistory.css'

const labels: Record<string, string> = {
  ACTIVE: 'Aktiv', NEW: 'Neu', PAUSED: 'Pausiert', LEFT: 'Ausgetreten',
  MONTHLY: 'Monatlich', QUARTERLY: 'Vierteljährlich', YEARLY: 'Jährlich',
  V1: '1. Vorsitz', V2: '2. Vorsitz', KASSIER: 'Kassier', KASSENPR1: '1. Kassenprüfung',
  KASSENPR2: '2. Kassenprüfung', SCHRIFT: 'Schriftführung'
}
const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const timestamp = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'medium' })

function displayValue(field: MemberHistoryChange['field'], value: MemberHistoryChange['before']) {
  if (value === null || value === '' || (Array.isArray(value) && !value.length)) return '—'
  if (Array.isArray(value)) return value.join(', ')
  if (field === 'contribution_amount' && typeof value === 'number') return euro.format(value)
  if (['status', 'boardRole', 'contribution_interval'].includes(field)) return labels[String(value)] || String(value)
  if ((field.endsWith('_date') || field === 'contribution_effective_date') && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value).split('-').reverse().join('.')
  return String(value)
}

export default function MemberHistoryModal({ memberId, name, onClose }: { memberId: number; name: string; onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null)
  const [rows, setRows] = useState<MemberHistoryEntry[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [beforeId, setBeforeId] = useState<number>()
  const [retry, setRetry] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    setLoading(true)
    setError('')
    window.api.members.history({ memberId, beforeId, limit: 30 }).then(result => {
      if (!live) return
      setRows(previous => beforeId ? [...previous, ...result.rows] : result.rows)
      setHasMore(result.hasMore)
    }).catch(() => {
      if (live) setError('Der Änderungsverlauf konnte nicht geladen werden.')
    }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [memberId, beforeId, retry])

  useLayoutEffect(() => {
    const trigger = document.activeElement as HTMLElement | null
    dialog.current?.querySelector<HTMLButtonElement>('.modal-close-button')?.focus()
    return () => { if (trigger?.isConnected) trigger.focus() }
  }, [])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        onClose()
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        event.stopImmediatePropagation()
      } else if (event.key === 'Tab') {
        const focusable = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]') || []).filter(el => el.getClientRects().length)
        const first = focusable[0], last = focusable[focusable.length - 1]
        if (!dialog.current?.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus() }
        else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return createPortal(<div className="modal-overlay member-history-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={dialog} className="modal member-history-modal" role="dialog" aria-modal="true" aria-labelledby="member-history-title">
      <ModalHeader title="Änderungsverlauf" titleId="member-history-title" subtitle={name} icon={<IconHistory size={20} />} onClose={onClose} closeLabel="Historie schließen" closeOnEscape={false} />
      <div className="member-history-body" tabIndex={0} aria-label="Gespeicherte Änderungen" aria-busy={loading}>
        <p className="helper">Nur gespeicherte Änderungen werden angezeigt. Änderungen vor Einführung des Verlaufs sind nicht enthalten.</p>
        {!loading && !error && !rows.length && <p>Noch keine Änderungen protokolliert.</p>}
        <ol className="member-history-list">
          {rows.map(entry => <li key={entry.id} className="member-history-entry">
            <div className="member-history-entry-heading"><strong>{entry.action === 'CREATE' ? 'Mitglied angelegt' : 'Mitglied geändert'}</strong><time dateTime={entry.createdAt}>{timestamp.format(new Date(entry.createdAt))}</time></div>
            <dl>{entry.changes.map(change => <div className="member-history-change" key={change.field}>
              <dt>{MEMBER_HISTORY_FIELDS[change.field]}</dt>
              <dd><span className="helper">Vorher</span><span>{displayValue(change.field, change.before)}</span></dd>
              <dd><span className="helper">Nachher</span><span>{displayValue(change.field, change.after)}</span></dd>
            </div>)}</dl>
          </li>)}
        </ol>
        {loading && <p role="status">Verlauf wird geladen …</p>}
        {error && <div role="alert"><p>{error}</p><button className="btn" type="button" onClick={() => setRetry(value => value + 1)}>Erneut versuchen</button></div>}
        {hasMore && !error && <button className="btn" type="button" disabled={loading} onClick={() => setBeforeId(rows[rows.length - 1]?.id)}>Ältere Änderungen laden</button>}
      </div>
    </div>
  </div>, document.body)
}
