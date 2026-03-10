import Database from 'better-sqlite3'
import { getDb, withTransaction } from '../db/database'

type DB = InstanceType<typeof Database>

export type Tag = { id: number; name: string; color?: string | null }

export function listTags(opts?: { q?: string; includeUsage?: boolean }) {
    const d = getDb()
    const wh: string[] = []
    const params: any[] = []
    if (opts?.q) { wh.push('name LIKE ?'); params.push(`%${opts.q}%`) }
    const whereSql = wh.length ? ` WHERE ${wh.join(' AND ')}` : ''
    const rows = d.prepare(`SELECT id, name, color FROM tags${whereSql} ORDER BY name`).all(...params) as any[]
    if (!opts?.includeUsage) return rows
    const withUsage = rows.map(r => {
        const c = (d.prepare('SELECT COUNT(1) as c FROM voucher_tags WHERE tag_id=?').get(r.id) as any)?.c || 0
        return { ...r, usage: c }
    })
    return withUsage
}

export function upsertTag(input: { id?: number; name: string; color?: string | null }) {
    const d = getDb()
    if (input.id) {
        d.prepare('UPDATE tags SET name = ?, color = ? WHERE id = ?').run(input.name, input.color ?? null, input.id)
        return { id: input.id }
    }
    const info = d.prepare('INSERT INTO tags(name, color) VALUES (?, ?)').run(input.name, input.color ?? null)
    return { id: Number(info.lastInsertRowid) }
}

export function deleteTag(id: number) {
    const d = getDb()
    d.prepare('DELETE FROM voucher_tags WHERE tag_id=?').run(id)
    d.prepare('DELETE FROM tags WHERE id=?').run(id)
    return { id }
}

export function setVoucherTags(voucherId: number, tags: string[]) {
    return withTransaction((d: DB) => {
        // Ensure tags exist
        const tagIds: number[] = []
        for (const nameRaw of tags) {
            const name = nameRaw.trim()
            if (!name) continue
            const found = d.prepare('SELECT id FROM tags WHERE name = ?').get(name) as any
            if (found?.id) { tagIds.push(found.id); continue }
            const info = d.prepare('INSERT OR IGNORE INTO tags(name) VALUES (?)').run(name)
            const id = Number(info.lastInsertRowid) || (d.prepare('SELECT id FROM tags WHERE name = ?').get(name) as any)?.id
            if (id) tagIds.push(id)
        }
        // Replace links
        d.prepare('DELETE FROM voucher_tags WHERE voucher_id = ?').run(voucherId)
        const stmt = d.prepare('INSERT OR IGNORE INTO voucher_tags(voucher_id, tag_id) VALUES (?, ?)')
        for (const tid of tagIds) stmt.run(voucherId, tid)
        return { voucherId, count: tagIds.length }
    })
}

export function tagUsage(tagId: number) {
    const d = getDb()
    const row = d.prepare(`
        SELECT
          IFNULL(SUM(CASE WHEN v.type='IN'  THEN v.gross_amount ELSE 0 END), 0) as inflow,
          IFNULL(SUM(CASE WHEN v.type='OUT' THEN v.gross_amount ELSE 0 END), 0) as spent,
          COUNT(1) as count
        FROM voucher_tags vt
        JOIN vouchers v ON v.id = vt.voucher_id
        WHERE vt.tag_id = ?
    `).get(tagId) as any
    const inflow = Number(row?.inflow || 0) || 0
    const spent = Number(row?.spent || 0) || 0
    const balance = Math.round((inflow - spent) * 100) / 100
    return { inflow: Math.round(inflow * 100) / 100, spent: Math.round(spent * 100) / 100, balance, count: row?.count || 0 }
}

export function getTagsForVoucher(voucherId: number): string[] {
    const d = getDb()
    const rows = d.prepare(`
        SELECT t.name FROM voucher_tags vt
        JOIN tags t ON t.id = vt.tag_id
        WHERE vt.voucher_id = ?
        ORDER BY t.name
    `).all(voucherId) as any[]
    return rows.map(r => r.name as string)
}
