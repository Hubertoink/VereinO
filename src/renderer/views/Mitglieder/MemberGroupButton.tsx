import { useState, type ButtonHTMLAttributes } from 'react'
import { IconPencil, IconTrash } from '@tabler/icons-react'
import type { MemberGroup } from '../../../../shared/memberGroups'
import CompactPopover from '../../components/CompactPopover'
import { dispatchDataChanged } from '../../utils/refresh'

export default function MemberGroupButton({ group, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { group: MemberGroup }) {
  const [anchor, setAnchor] = useState<{ trigger: HTMLElement; x: number; y: number } | null>(null)
  const [mode, setMode] = useState<'menu' | 'rename' | 'delete'>('menu')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  function open(trigger: HTMLElement, x: number, y: number) {
    if (busy) return
    setMode('menu')
    setName(group.name)
    setError('')
    setAnchor({ trigger, x, y })
  }
  async function save() {
    if (mode === 'menu' || busy) return
    setBusy(true)
    setError('')
    try {
      await window.api.members.groups.change(mode === 'delete' ? { action: 'delete', groupId: group.id } : { action: 'rename', groupId: group.id, name: name.trim() })
      setAnchor(null)
      anchor?.trigger.focus()
      dispatchDataChanged(['members'])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Die Änderung konnte nicht gespeichert werden.')
    } finally {
      setBusy(false)
    }
  }
  return <>
    <button {...props} type="button" onContextMenu={event => {
      event.preventDefault()
      event.stopPropagation()
      open(event.currentTarget, event.clientX, event.clientY)
    }} onKeyDown={event => {
      if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
      event.preventDefault()
      event.stopPropagation()
      const rect = event.currentTarget.getBoundingClientRect()
      open(event.currentTarget, rect.left, rect.bottom)
    }}>{children}</button>
    {anchor && <CompactPopover label={group.name} anchor={anchor} onClose={() => setAnchor(null)} className="member-group-menu">
      {mode === 'menu' ? <div className="member-group-menu__options">
        <button className="btn ghost btn-with-icon" onClick={() => setMode('rename')}><IconPencil size={15} />Umbenennen</button>
        <button className="btn ghost btn-with-icon" onClick={() => setMode('delete')}><IconTrash size={15} />Gruppe löschen</button>
      </div> : <form onSubmit={event => { event.preventDefault(); event.stopPropagation(); void save() }}>
        {mode === 'rename' ? <label className="field">Gruppenname
          <input className="input" maxLength={100} autoFocus value={name} onFocus={e => e.target.select()} onChange={e => setName(e.target.value)} />
        </label> : <p>Gruppe und Zuordnungen löschen? Alle Mitglieder bleiben erhalten.</p>}
        {error && <div role="alert">{error}</div>}
        <div className="member-group-menu__actions">
          <button type="button" autoFocus={mode === 'delete'} className="btn" disabled={busy} onClick={() => { setAnchor(null); anchor.trigger.focus() }}>Abbrechen</button>
          <button type="submit" className={mode === 'delete' ? 'btn danger' : 'btn primary'} disabled={busy || (mode === 'rename' && (!name.trim() || name.trim() === group.name))}>
            {mode === 'delete' ? 'Endgültig löschen' : 'Speichern'}
          </button>
        </div>
      </form>}
    </CompactPopover>}
  </>
}
