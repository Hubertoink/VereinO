import { useEffect, useState } from 'react'
import type { MemberGroup } from '../../../../shared/memberGroups'
import { addDataChangedListener } from '../../utils/refresh'
import { resolveTagDisplayColor } from '../../utils/tagColors'

export function SidebarMemberGroups({ onSelect }: { onSelect: (id: number) => void }) {
  const [groups, setGroups] = useState<MemberGroup[]>([])
  useEffect(() => {
    let revision = 0
    const load = async () => {
      const current = ++revision
      try {
        const rows = await window.api.members.groups.list()
        if (current === revision) setGroups(rows)
      } catch {
        if (current === revision) setGroups([])
      }
    }
    void load()
    const offChange = addDataChangedListener(['members'], load)
    const offSwitch = window.api.organizations.onSwitched(() => { setGroups([]); void load() })
    return () => { revision++; offChange(); offSwitch?.() }
  }, [])
  if (!groups.length) return null
  return <div className="sidebar-recent-assignments" role="group" aria-label="Mitgliedergruppen">
    <p className="sidebar-section-caption">Gruppen</p>
    {groups.map(group => <button type="button" key={group.id} className="sidebar-recent-assignment" onClick={() => onSelect(group.id)}>
      <span className="sidebar-assignment-heading">
        <span className="sidebar-assignment-name"><span aria-hidden="true" style={{ color: resolveTagDisplayColor(group.name) }}>● </span>{group.name}</span>
        <span className="sidebar-assignment-balance">{group.memberCount}</span>
      </span>
    </button>)}
  </div>
}
