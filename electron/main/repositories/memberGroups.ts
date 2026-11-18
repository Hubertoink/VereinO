import { getDb, withTransaction } from '../db/database'
import { writeAudit } from '../services/audit'
import type { GroupChange, MemberGroup } from '../../../shared/memberGroups'

export function listMemberGroups(): MemberGroup[] {
  return getDb().prepare(`SELECT g.id, g.name, COUNT(gm.member_id) AS memberCount
    FROM member_groups g LEFT JOIN member_group_members gm ON gm.group_id=g.id
    GROUP BY g.id ORDER BY g.name_key`).all() as MemberGroup[]
}

export function changeMemberGroup(input: GroupChange) {
  return withTransaction(db => {
    let groupId: number
    if (input.action === 'create') {
      const name = input.name.trim().normalize('NFC')
      const nameKey = name.toLocaleLowerCase('de-DE')
      const insert = db.prepare('INSERT INTO member_groups(name, name_key) VALUES (?, ?) ON CONFLICT(name_key) DO NOTHING').run(name, nameKey)
      if (!insert.changes) throw new Error('Eine Gruppe mit diesem Namen existiert bereits.')
      groupId = Number(insert.lastInsertRowid)
    } else {
      groupId = input.groupId
      if (!db.prepare('SELECT id FROM member_groups WHERE id=?').get(groupId)) throw new Error('Gruppe nicht gefunden.')
    }
    const ids = [...new Set(input.memberIds)]
    const count = db.prepare('SELECT COUNT(*) AS n FROM members WHERE id IN (SELECT value FROM json_each(?))').get(JSON.stringify(ids)) as { n: number }
    if (count.n !== ids.length) throw new Error('Ein ausgewähltes Mitglied existiert nicht mehr. Bitte aktualisiere die Auswahl.')
    const names = db.prepare(`SELECT g.name FROM member_groups g JOIN member_group_members gm ON gm.group_id=g.id
      WHERE gm.member_id=? ORDER BY g.name_key`)
    const groupsOf = (id: number) => (names.all(id) as { name: string }[]).map(group => group.name)
    const change = db.prepare(input.action === 'remove'
      ? 'DELETE FROM member_group_members WHERE member_id=? AND group_id=?'
      : 'INSERT INTO member_group_members(member_id, group_id) VALUES (?, ?) ON CONFLICT DO NOTHING')
    let changed = 0
    for (const id of ids) {
      const before = groupsOf(id)
      if (!change.run(id, groupId).changes) continue
      writeAudit(db, null, 'members', id, 'UPDATE', { changes: [{ field: 'groups', before, after: groupsOf(id) }] })
      changed++
    }
    return { groupId, changed }
  })
}
