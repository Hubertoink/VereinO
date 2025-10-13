import Database from 'better-sqlite3'
import { getDb, withTransaction } from '../db/database'

type DB = InstanceType<typeof Database>

export type Tag = { id: number; name: string; color?: string | null; scope?: 'FINANCE' | 'MEMBER' }

export function listTags(opts?: { q?: string; includeUsage?: boolean; scope?: 'FINANCE' | 'MEMBER' }) {
    const d = getDb()
    const wh: string[] = []
    const params: any[] = []
    if (opts?.q) { wh.push('name LIKE ?'); params.push(`%${opts.q}%`) }
    if (opts?.scope) { wh.push('scope = ?'); params.push(opts.scope) }
    const whereSql = wh.length ? ` WHERE ${wh.join(' AND ')}` : ''
    const rows = d.prepare(`SELECT id, name, color, scope FROM tags${whereSql} ORDER BY name`).all(...params) as any[]
    if (!opts?.includeUsage) return rows
    const withUsage = rows.map(r => {
        let c = 0
        if (String(r.scope || 'FINANCE') === 'MEMBER') {
            c = (d.prepare('SELECT COUNT(1) as c FROM member_tags WHERE tag_id = ?').get(r.id) as any)?.c || 0
        } else {
            c = (d.prepare(`SELECT (
                SELECT COUNT(1) FROM voucher_tags WHERE tag_id = ?
            ) + (
                SELECT COUNT(1) FROM invoice_tags WHERE tag_id = ?
            ) as c`).get(r.id, r.id) as any)?.c || 0
        }
        return { ...r, usage: c }
    })
    return withUsage
}

export function upsertTag(input: { id?: number; name: string; color?: string | null; scope?: 'FINANCE' | 'MEMBER' }) {
    const d = getDb()
    if (input.id) {
        d.prepare('UPDATE tags SET name = ?, color = ?, scope = COALESCE(scope, ?) WHERE id = ?').run(input.name, input.color ?? null, input.scope ?? 'FINANCE', input.id)
        return { id: input.id }
    }
    const info = d.prepare('INSERT INTO tags(name, color, scope) VALUES (?, ?, ?)').run(input.name, input.color ?? null, input.scope ?? 'FINANCE')
    return { id: Number(info.lastInsertRowid) }
}

export function deleteTag(id: number) {
    const d = getDb()
    d.prepare('DELETE FROM voucher_tags WHERE tag_id=?').run(id)
    try { d.prepare('DELETE FROM invoice_tags WHERE tag_id=?').run(id) } catch {}
    try { d.prepare('DELETE FROM member_tags WHERE tag_id=?').run(id) } catch {}
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
            const found = d.prepare("SELECT id FROM tags WHERE name = ? AND scope = 'FINANCE'").get(name) as any
            if (found?.id) { tagIds.push(found.id); continue }
            const info = d.prepare("INSERT OR IGNORE INTO tags(name, scope) VALUES (?, 'FINANCE')").run(name)
            const id = Number(info.lastInsertRowid) || (d.prepare("SELECT id FROM tags WHERE name = ? AND scope = 'FINANCE'").get(name) as any)?.id
            if (id) tagIds.push(id)
        }
        // Replace links
        d.prepare('DELETE FROM voucher_tags WHERE voucher_id = ?').run(voucherId)
        const stmt = d.prepare('INSERT OR IGNORE INTO voucher_tags(voucher_id, tag_id) VALUES (?, ?)')
        for (const tid of tagIds) stmt.run(voucherId, tid)
        return { voucherId, count: tagIds.length }
    })
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
