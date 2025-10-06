import Database from 'better-sqlite3'
import { getDb, withTransaction } from '../db/database'

type DB = InstanceType<typeof Database>

export type MemberStatus = 'ACTIVE' | 'NEW' | 'PAUSED' | 'LEFT'

export type MemberRow = {
  id: number
  memberNo: string | null
  name: string
  email?: string | null
  phone?: string | null
  address?: string | null
  status: MemberStatus
  createdAt: string
  updatedAt?: string | null
  tags?: string[]
  iban?: string | null
  bic?: string | null
  contribution_amount?: number | null
  contribution_interval?: 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | null
  mandate_ref?: string | null
  mandate_date?: string | null
  join_date?: string | null
  leave_date?: string | null
  notes?: string | null
  next_due_date?: string | null
}

function setMemberTags(d: DB, memberId: number, tags?: string[]) {
  if (!tags) return
  // clear
  d.prepare('DELETE FROM member_tags WHERE member_id = ?').run(memberId)
  const clean = (tags || []).map(t => String(t).trim()).filter(Boolean)
  if (!clean.length) return
  for (const name of clean) {
    d.prepare('INSERT OR IGNORE INTO tags(name) VALUES (?)').run(name)
    const t = d.prepare('SELECT id FROM tags WHERE name = ?').get(name) as any
    if (t?.id) d.prepare('INSERT OR IGNORE INTO member_tags(member_id, tag_id) VALUES (?,?)').run(memberId, t.id)
  }
}

export function listMembers(params: { q?: string; status?: MemberStatus | 'ALL'; limit?: number; offset?: number }): { rows: MemberRow[]; total: number } {
  const d = getDb()
  const { q, status, limit = 50, offset = 0 } = params || {}
  const wh: string[] = []
  const args: any[] = []
  if (q && q.trim()) {
    const like = `%${q.trim()}%`
    wh.push('(m.name LIKE ? OR m.email LIKE ? OR m.phone LIKE ? OR m.member_no LIKE ? OR m.address LIKE ? )')
    args.push(like, like, like, like, like)
  }
  if (status && status !== 'ALL') { wh.push('m.status = ?'); args.push(status) }
  const whereSql = wh.length ? ' WHERE ' + wh.join(' AND ') : ''
  const base = `FROM members m${whereSql}`
  const total = (d.prepare(`SELECT COUNT(1) as c ${base}`).get(...args) as any)?.c || 0
  const rows = d.prepare(`
    SELECT m.id, m.member_no as memberNo, m.name, m.email, m.phone, m.address, m.status, m.created_at as createdAt, m.updated_at as updatedAt,
           m.iban as iban, m.bic as bic, m.contribution_amount as contribution_amount, m.contribution_interval as contribution_interval,
           m.mandate_ref as mandate_ref, m.mandate_date as mandate_date, m.join_date as join_date, m.leave_date as leave_date,
           m.notes as notes, m.next_due_date as next_due_date,
           (
             SELECT GROUP_CONCAT(t.name, '\u0001')
             FROM member_tags mt JOIN tags t ON t.id = mt.tag_id
             WHERE mt.member_id = m.id
           ) as tagsConcat
    ${base}
    ORDER BY m.name COLLATE NOCASE ASC, m.id ASC
    LIMIT ? OFFSET ?
  `).all(...args, limit, offset) as any[]
  const mapped: MemberRow[] = rows.map(r => ({ ...r, tags: r.tagsConcat ? String(r.tagsConcat).split('\u0001') : [] }))
  return { rows: mapped, total }
}

export function createMember(input: { memberNo?: string | null; name: string; email?: string | null; phone?: string | null; address?: string | null; status?: MemberStatus; tags?: string[] }) {
  return withTransaction((d: DB) => {
    const info = d.prepare(`INSERT INTO members(member_no, name, email, phone, address, status) VALUES (?,?,?,?,?,?)`).run(
      input.memberNo ?? null,
      input.name,
      input.email ?? null,
      input.phone ?? null,
      input.address ?? null,
      input.status ?? 'ACTIVE'
    )
    const id = Number(info.lastInsertRowid)
    setMemberTags(d, id, input.tags)
    return { id }
  })
}

export function updateMember(input: { id: number; memberNo?: string | null; name?: string; email?: string | null; phone?: string | null; address?: string | null; status?: MemberStatus; tags?: string[];
  iban?: string | null; bic?: string | null; contribution_amount?: number | null; contribution_interval?: 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | null;
  mandate_ref?: string | null; mandate_date?: string | null; join_date?: string | null; leave_date?: string | null; notes?: string | null; next_due_date?: string | null; }) {
  return withTransaction((d: DB) => {
    const cur = d.prepare('SELECT id FROM members WHERE id=?').get(input.id)
    if (!cur) throw new Error('Mitglied nicht gefunden')
    const fields: string[] = []
    const args: any[] = []
    if (input.memberNo !== undefined) { fields.push('member_no = ?'); args.push(input.memberNo) }
    if (input.name !== undefined) { fields.push('name = ?'); args.push(input.name) }
    if (input.email !== undefined) { fields.push('email = ?'); args.push(input.email) }
    if (input.phone !== undefined) { fields.push('phone = ?'); args.push(input.phone) }
    if (input.address !== undefined) { fields.push('address = ?'); args.push(input.address) }
    if (input.status !== undefined) { fields.push('status = ?'); args.push(input.status) }
    if (input.iban !== undefined) { fields.push('iban = ?'); args.push(input.iban) }
    if (input.bic !== undefined) { fields.push('bic = ?'); args.push(input.bic) }
    if (input.contribution_amount !== undefined) { fields.push('contribution_amount = ?'); args.push(input.contribution_amount) }
    if (input.contribution_interval !== undefined) { fields.push('contribution_interval = ?'); args.push(input.contribution_interval) }
    if (input.mandate_ref !== undefined) { fields.push('mandate_ref = ?'); args.push(input.mandate_ref) }
    if (input.mandate_date !== undefined) { fields.push('mandate_date = ?'); args.push(input.mandate_date) }
    if (input.join_date !== undefined) { fields.push('join_date = ?'); args.push(input.join_date) }
    if (input.leave_date !== undefined) { fields.push('leave_date = ?'); args.push(input.leave_date) }
    if (input.notes !== undefined) { fields.push('notes = ?'); args.push(input.notes) }
    if (input.next_due_date !== undefined) { fields.push('next_due_date = ?'); args.push(input.next_due_date) }
    if (fields.length) {
      fields.push("updated_at = datetime('now')")
      const sql = `UPDATE members SET ${fields.join(', ')} WHERE id = ?`
      args.push(input.id)
      d.prepare(sql).run(...args)
    }
    if (input.tags) setMemberTags(d, input.id, input.tags)
    return { id: input.id }
  })
}

export function deleteMember(id: number) {
  const d = getDb()
  d.prepare('DELETE FROM members WHERE id = ?').run(id)
  return { id }
}

export function getMemberById(id: number): MemberRow | null {
  const d = getDb()
  const r = d.prepare(`
    SELECT m.id, m.member_no as memberNo, m.name, m.email, m.phone, m.address, m.status, m.created_at as createdAt, m.updated_at as updatedAt,
           m.iban as iban, m.bic as bic, m.contribution_amount as contribution_amount, m.contribution_interval as contribution_interval,
           m.mandate_ref as mandate_ref, m.mandate_date as mandate_date, m.join_date as join_date, m.leave_date as leave_date,
           m.notes as notes, m.next_due_date as next_due_date,
           (
             SELECT GROUP_CONCAT(t.name, '\u0001')
             FROM member_tags mt JOIN tags t ON t.id = mt.tag_id
             WHERE mt.member_id = m.id
           ) as tagsConcat
    FROM members m WHERE m.id = ?
  `).get(id) as any
  if (!r) return null
  return { ...r, tags: r.tagsConcat ? String(r.tagsConcat).split('\u0001') : [] }
}
