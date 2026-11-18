import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { IconChevronDown, IconChevronRight, IconPlus, IconUsersGroup } from '@tabler/icons-react'
import type { GroupChange, MemberFilters, MemberGroup } from '../../../../shared/memberGroups'
import MasterDataDialog, { FieldLabel } from '../../components/common/MasterDataDialog'
import CompactPopover from '../../components/CompactPopover'
import { getContrastTextColor, resolveTagDisplayColor } from '../../utils/tagColors'
import './memberGroups.css'

export function MemberGroupBar({ groups, active, error, selectedCount, children, onFilter, onCreate, onRetry }: {
  groups: MemberGroup[]; active: MemberFilters['groupId']; error: boolean
  selectedCount: number; children: ReactNode
  onFilter: (id?: number) => void; onCreate: () => void; onRetry: () => void
}) {
  const [open, setOpen] = useState(true)
  const [search, setSearch] = useState('')
  const strip = useRef<HTMLDivElement>(null)
  const searchable = groups.length > 6
  const term = searchable ? search.trim().toLocaleLowerCase('de-DE') : ''
  const visible = groups.filter(group => group.id === active || (open && group.name.toLocaleLowerCase('de-DE').includes(term)))
  useLayoutEffect(() => {
    const list = strip.current
    const badge = list?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (!list || !badge) return
    const reveal = () => {
      const bounds = list.getBoundingClientRect()
      const selected = badge.getBoundingClientRect()
      if (selected.left < bounds.left) list.scrollLeft += selected.left - bounds.left
      else if (selected.right > bounds.right) list.scrollLeft += selected.right - bounds.right
    }
    reveal()
    const observer = new ResizeObserver(reveal)
    observer.observe(list)
    return () => observer.disconnect()
  }, [active, groups, open, term])
  return <section className="members-board-card member-groups" aria-label="Mitgliedergruppen">
    <h2 className="members-board-title"><button type="button" className="member-groups__toggle" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="member-groups-list">
      {open ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}Gruppen
    </button></h2>
    <div ref={strip} id="member-groups-list" className="member-groups__badges">
      {open && searchable && <input type="search" className="input" aria-label="Gruppen durchsuchen" placeholder="Gruppen durchsuchen" value={search} onChange={event => setSearch(event.target.value)} />}
      {active === 'none' && <button type="button" className="member-groups__badge" aria-pressed="true" onClick={() => onFilter(undefined)}>Ohne Gruppe</button>}
      {visible.map(group => {
        const color = resolveTagDisplayColor(group.name)
        const count = group.memberCount === 1 ? '1 Mitglied' : `${group.memberCount} Mitglieder`
        return <button type="button" key={group.id} className="member-groups__badge" title={count} aria-description={count}
          aria-pressed={group.id === active} style={{ '--group-color': color, '--group-text': getContrastTextColor(color) } as CSSProperties}
          onClick={() => onFilter(group.id === active ? undefined : group.id)}>{group.name}</button>
      })}
      {open && (error ? <span className="helper">Gruppen konnten nicht geladen werden. <button className="btn" onClick={onRetry}>Erneut laden</button></span>
        : !visible.length && <span className="helper">{groups.length ? 'Keine passende Gruppe gefunden.' : 'Noch keine Gruppen angelegt.'}</span>)}
    </div>
    {selectedCount > 0 && <MemberSelectionActions count={selectedCount}>{children}</MemberSelectionActions>}
    <button type="button" className="btn btn-with-icon member-groups__create" aria-label="Neue Gruppe" title="Neue Gruppe" onClick={onCreate}><IconPlus size={14} /><span>Neue Gruppe</span></button>
  </section>
}

function MemberSelectionActions({ count, children }: { count: number; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  const [compact, setCompact] = useState(false)
  const [anchor, setAnchor] = useState<{ x: number; y: number; trigger: HTMLElement } | null>(null)
  useLayoutEffect(() => {
    const bar = root.current?.parentElement
    if (!bar) return
    const update = () => {
      const narrow = bar.clientWidth < 980
      setCompact(narrow)
      if (!narrow) setAnchor(null)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(bar)
    return () => observer.disconnect()
  }, [])

  return <div ref={root} className="member-selection" role="group" aria-label="Mitgliederauswahl">
    {compact ? <button type="button" className="btn btn-with-icon" aria-haspopup="dialog" aria-expanded={!!anchor}
      onClick={event => {
        const trigger = event.currentTarget
        const rect = trigger.getBoundingClientRect()
        setAnchor(anchor ? null : { trigger, x: rect.left, y: rect.bottom + 4 })
      }}>{count} ausgewählt <IconChevronDown size={14} /></button>
      : <><strong aria-live="polite">{count} ausgewählt</strong>{children}</>}
    {compact && anchor && <CompactPopover label="Auswahlaktionen" anchor={anchor} onClose={() => setAnchor(null)}>
      <div className="member-selection-menu" onClick={event => {
        if (!(event.target instanceof Element) || !event.target.closest('button:enabled')) return
        anchor.trigger.focus()
        setAnchor(null)
      }}>{children}</div>
    </CompactPopover>}
  </div>
}

export function MemberGroupDialog({ mode, groups, memberIds, onClose, onSaved }: {
  mode: 'create' | 'assign'; groups: MemberGroup[]; memberIds: number[]; onClose: () => void
  onSaved: (change: GroupChange, changed: number) => void
}) {
  const [target, setTarget] = useState(mode === 'create' || !groups.length ? 'new' : '')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save() {
    const change: GroupChange = target === 'new' ? { action: 'create', name: name.trim(), memberIds }
      : { action: 'add', groupId: Number(target), memberIds }
    setBusy(true)
    setError('')
    try {
      const result = await window.api.members.groups.change(change)
      onSaved(change, result.changed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Die Gruppe konnte nicht gespeichert werden.')
      setBusy(false)
    }
  }
  return <MasterDataDialog compact title={mode === 'create' ? 'Neue Gruppe' : 'Gruppe zuordnen'}
    icon={<IconUsersGroup size={20} />} busy={busy} canSave={!!target && (target !== 'new' || !!name.trim())}
    saveLabel={mode === 'create' ? 'Gruppe erstellen' : 'Zuordnen'} onClose={onClose} onSave={save}
    footerHint={mode === 'assign' ? `${memberIds.length} ausgewählt` : undefined}>
    {mode === 'assign' && groups.length > 0 && <div className="field">
      <FieldLabel htmlFor="member-group-target" required>Gruppe</FieldLabel>
      <select className="input" id="member-group-target" autoFocus value={target} onChange={event => setTarget(event.target.value)}>
        <option value="" disabled>Gruppe wählen</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
        <option value="new">Neue Gruppe erstellen…</option>
      </select>
    </div>}
    {target === 'new' && <div className="field"><FieldLabel htmlFor="member-group-name" required>Gruppenname</FieldLabel>
      <input id="member-group-name" className="input" maxLength={100} autoFocus value={name} onChange={event => setName(event.target.value)} />
    </div>}
    {error && <div role="alert">{error}</div>}
  </MasterDataDialog>
}
