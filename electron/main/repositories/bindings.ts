import Database from 'better-sqlite3'
import { getDb, withTransaction } from '../db/database'

type DB = InstanceType<typeof Database>

export type Binding = {
    id: number
    code: string
    name: string
    description?: string | null
    startDate?: string | null
    endDate?: string | null
    isActive: number
    color?: string | null
    budget?: number | null
    enforceTimeRange?: number
}

export function listBindings(params?: { activeOnly?: boolean }) {
    const d = getDb()
    const wh: string[] = []
    const vals: any[] = []
    if (params?.activeOnly) { wh.push('is_active = 1') }
    const whereSql = wh.length ? ' WHERE ' + wh.join(' AND ') : ''
    const rows = d.prepare(`SELECT id, code, name, description, start_date as startDate, end_date as endDate, is_active as isActive, color, budget, enforce_time_range as enforceTimeRange FROM earmarks${whereSql} ORDER BY code`).all(...vals) as any[]
    return rows
}

export function upsertBinding(input: { id?: number; code: string; name: string; description?: string | null; startDate?: string | null; endDate?: string | null; isActive?: boolean; color?: string | null; budget?: number | null; enforceTimeRange?: boolean }) {
    return withTransaction((d: DB) => {
        if (input.id) {
            d.prepare(`UPDATE earmarks SET code=?, name=?, description=?, start_date=?, end_date=?, is_active=?, color=?, budget=?, enforce_time_range=? WHERE id=?`).run(
                input.code, input.name, input.description ?? null, input.startDate ?? null, input.endDate ?? null, (input.isActive ?? true) ? 1 : 0, input.color ?? null, input.budget ?? null, (input.enforceTimeRange ?? false) ? 1 : 0, input.id
            )
            return { id: input.id, updated: true }
        }
        const info = d.prepare(`INSERT INTO earmarks(code, name, description, start_date, end_date, is_active, color, budget, enforce_time_range) VALUES (?,?,?,?,?,?,?,?,?)`).run(
            input.code, input.name, input.description ?? null, input.startDate ?? null, input.endDate ?? null, (input.isActive ?? true) ? 1 : 0, input.color ?? null, input.budget ?? null, (input.enforceTimeRange ?? false) ? 1 : 0
        )
        return { id: Number(info.lastInsertRowid), created: true }
    })
}

export function deleteBinding(id: number) {
    const d = getDb()
    const used = d.prepare('SELECT COUNT(1) as c FROM vouchers WHERE earmark_id=?').get(id) as any
    if ((used?.c || 0) > 0) {
        throw new Error('Zweckbindung wird in Buchungen verwendet und kann nicht gelöscht werden. Bitte archivieren (inaktiv setzen).')
    }
    d.prepare('DELETE FROM earmarks WHERE id=?').run(id)
    return { id }
}

export function bindingUsage(earmarkId: number, params?: { from?: string; to?: string; sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB' }) {
    const d = getDb()
    // Berechnung über die Junction-Tabelle voucher_earmarks für mehrere Zuordnungen pro Buchung
    const wh: string[] = ['ve.earmark_id = ?']
    const vals: any[] = [earmarkId]
    if (params?.from) { wh.push('v.date >= ?'); vals.push(params.from) }
    if (params?.to) { wh.push('v.date <= ?'); vals.push(params.to) }
    if (params?.sphere) { wh.push('v.sphere = ?'); vals.push(params.sphere) }
    const whereSql = ' WHERE ' + wh.join(' AND ')
    const rows = d.prepare(`
        SELECT v.type, IFNULL(SUM(ve.amount),0) as gross 
        FROM voucher_earmarks ve 
        JOIN vouchers v ON v.id = ve.voucher_id
        ${whereSql} 
        GROUP BY v.type
    `).all(...vals) as any[]
    let allocated = 0, released = 0
    for (const r of rows) {
        if (r.type === 'IN') allocated += r.gross || 0
        if (r.type === 'OUT') released += r.gross || 0
    }
    const metaRow = d.prepare(`SELECT budget, start_date as startDate, end_date as endDate FROM earmarks WHERE id=?`).get(earmarkId) as any
    const budget = Number(metaRow?.budget ?? 0) || 0
    const balance = Math.round((allocated - released) * 100) / 100
    const remaining = Math.round(((budget + allocated - released) * 100)) / 100
    // Counts: total, inside, and outside relative to earmark's own date range
    const totalCountRow = d.prepare(`SELECT COUNT(1) as c FROM voucher_earmarks WHERE earmark_id=?`).get(earmarkId) as any
    const totalCount = Number(totalCountRow?.c || 0)
    const startDate = metaRow?.startDate || null
    const endDate = metaRow?.endDate || null
    let insideCount = totalCount
    let outsideCount = 0
    if (startDate || endDate) {
        const wh2: string[] = ['ve.earmark_id = ?']
        const vals2: any[] = [earmarkId]
        if (startDate) { wh2.push('v.date >= ?'); vals2.push(startDate) }
        if (endDate) { wh2.push('v.date <= ?'); vals2.push(endDate) }
        const insideRow = d.prepare(`SELECT COUNT(1) as c FROM voucher_earmarks ve JOIN vouchers v ON v.id = ve.voucher_id WHERE ${wh2.join(' AND ')}`).get(...vals2) as any
        insideCount = Number(insideRow?.c || 0)
        outsideCount = Math.max(0, totalCount - insideCount)
    }
    return { allocated: Math.round(allocated * 100) / 100, released: Math.round(released * 100) / 100, balance, budget, remaining, totalCount, insideCount, outsideCount, startDate, endDate }
}
