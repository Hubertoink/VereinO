import type Database from 'better-sqlite3'
import { getDb } from '../db/database'
import { writeAudit } from '../services/audit'
import { MEMBER_PROFILE_HISTORY_FIELDS, MemberHistoryChangeSchema, type MemberHistoryChange, type MemberHistoryEntry } from '../../../shared/memberHistory'

type DB = InstanceType<typeof Database>
type Snapshot = Record<keyof typeof MEMBER_PROFILE_HISTORY_FIELDS, MemberHistoryChange['before']>

export function memberHistorySnapshot(d: DB, memberId: number): Snapshot {
  const member = d.prepare('SELECT *, member_no AS memberNo, board_role AS boardRole FROM members WHERE id=?').get(memberId) as Record<string, string | number | null>
  const tags = d.prepare('SELECT t.name FROM member_tags mt JOIN tags t ON t.id=mt.tag_id WHERE mt.member_id=? ORDER BY t.name').all(memberId) as Array<{ name: string }>
  const plan = d.prepare('SELECT starts_on FROM membership_plans WHERE member_id=? ORDER BY starts_on DESC, id DESC LIMIT 1').get(memberId) as { starts_on: string } | undefined
  return Object.fromEntries(Object.keys(MEMBER_PROFILE_HISTORY_FIELDS).map(field => [field,
    field === 'tags' ? tags.map(tag => tag.name) : field === 'contribution_effective_date' ? plan?.starts_on ?? null : member[field] ?? null
  ])) as Snapshot
}

export function recordMemberHistory(d: DB, memberId: number, before: Snapshot | null) {
  const after = memberHistorySnapshot(d, memberId)
  const changes: MemberHistoryChange[] = []
  for (const field of Object.keys(MEMBER_PROFILE_HISTORY_FIELDS) as Array<keyof Snapshot>) {
    const previous = before?.[field] ?? (field === 'tags' ? [] : null)
    if (JSON.stringify(previous) !== JSON.stringify(after[field])) changes.push({ field, before: previous, after: after[field] })
  }
  if (changes.length) writeAudit(d, null, 'members', memberId, before ? 'UPDATE' : 'CREATE', { changes })
}

export function getMemberHistory(input: { memberId: number; beforeId?: number; limit: number }) {
  const d = getDb()
  if (!d.prepare('SELECT 1 FROM members WHERE id=?').get(input.memberId)) throw new Error('Mitglied nicht gefunden')
  // SQLite may reuse a deleted member ID; the latest creation starts a new history.
  const rows = d.prepare(`SELECT id, created_at AS createdAt, action, diff_json AS diffJson
    FROM audit_log WHERE entity='members' AND entity_id=? ${input.beforeId ? 'AND id < ?' : ''}
    AND id >= COALESCE((SELECT MAX(id) FROM audit_log WHERE entity='members' AND entity_id=? AND action='CREATE'), 0)
    AND action IN ('CREATE','UPDATE') ORDER BY id DESC LIMIT ?`)
    .all(input.memberId, ...(input.beforeId ? [input.beforeId] : []), input.memberId, input.limit + 1) as Array<{ id: number; createdAt: string; action: MemberHistoryEntry['action']; diffJson: string }>
  return {
    rows: rows.slice(0, input.limit).map(({ diffJson, ...row }) => ({ ...row, changes: MemberHistoryChangeSchema.array().parse(JSON.parse(diffJson).changes) })),
    hasMore: rows.length > input.limit
  }
}
