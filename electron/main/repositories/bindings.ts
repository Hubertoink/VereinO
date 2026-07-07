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
    // Prefer voucher_earmarks; include legacy voucher earmark columns when no junction row exists.
    const wh: string[] = ['earmarkId = ?']
    const vals: any[] = [earmarkId]
    if (params?.from) { wh.push('date >= ?'); vals.push(params.from) }
    if (params?.to) { wh.push('date <= ?'); vals.push(params.to) }
    if (params?.sphere) { wh.push('sphere = ?'); vals.push(params.sphere) }
    const whereSql = ' WHERE ' + wh.join(' AND ')
    const rows = d.prepare(`
        WITH earmark_assignments AS (
            SELECT ve.voucher_id as voucherId, ve.earmark_id as earmarkId, ve.amount,
                   v.type, v.date, v.sphere
            FROM voucher_earmarks ve
            JOIN vouchers v ON v.id = ve.voucher_id
            WHERE ve.earmark_id = ?
            UNION ALL
            SELECT v.id as voucherId, v.earmark_id as earmarkId,
                   COALESCE(NULLIF(v.earmark_amount, 0), ABS(v.gross_amount), 0) as amount,
                   v.type, v.date, v.sphere
            FROM vouchers v
            WHERE v.earmark_id = ?
              AND NOT EXISTS (SELECT 1 FROM voucher_earmarks ve WHERE ve.voucher_id = v.id)
        )
        SELECT type, IFNULL(SUM(amount),0) as gross
        FROM earmark_assignments
        ${whereSql} 
        GROUP BY type
    `).all(earmarkId, earmarkId, ...vals) as any[]
    let allocated = 0, released = 0
    for (const r of rows) {
        if (r.type === 'IN') allocated += r.gross || 0
        if (r.type === 'OUT') released += r.gross || 0
        if (r.type === 'INTERNAL' && Number(r.gross || 0) > 0) allocated += Number(r.gross || 0)
        if (r.type === 'INTERNAL' && Number(r.gross || 0) < 0) released += Math.abs(Number(r.gross || 0))
    }
    const metaRow = d.prepare(`SELECT budget, start_date as startDate, end_date as endDate FROM earmarks WHERE id=?`).get(earmarkId) as any
    const budget = Number(metaRow?.budget ?? 0) || 0
    const balance = Math.round((allocated - released) * 100) / 100
    const remaining = Math.round(((budget + allocated - released) * 100)) / 100
    // Counts: total, inside, and outside relative to earmark's own date range
    const startDate = metaRow?.startDate || null
    const endDate = metaRow?.endDate || null
    const assignmentCte = `
        WITH earmark_assignments AS (
            SELECT ve.voucher_id as voucherId, ve.earmark_id as earmarkId, v.date
            FROM voucher_earmarks ve
            JOIN vouchers v ON v.id = ve.voucher_id
            WHERE ve.earmark_id = ?
            UNION ALL
            SELECT v.id as voucherId, v.earmark_id as earmarkId, v.date
            FROM vouchers v
            WHERE v.earmark_id = ?
              AND NOT EXISTS (SELECT 1 FROM voucher_earmarks ve WHERE ve.voucher_id = v.id)
        )
    `
    const totalAssignmentRow = d.prepare(`${assignmentCte} SELECT COUNT(1) as c FROM earmark_assignments`).get(earmarkId, earmarkId) as any
    const legacyAwareTotalCount = Number(totalAssignmentRow?.c || 0)
    let insideCount = legacyAwareTotalCount
    let outsideCount = 0
    if (startDate || endDate) {
        const wh2: string[] = ['1 = 1']
        const vals2: any[] = [earmarkId, earmarkId]
        if (startDate) { wh2.push('date >= ?'); vals2.push(startDate) }
        if (endDate) { wh2.push('date <= ?'); vals2.push(endDate) }
        const insideRow = d.prepare(`${assignmentCte} SELECT COUNT(1) as c FROM earmark_assignments WHERE ${wh2.join(' AND ')}`).get(...vals2) as any
        insideCount = Number(insideRow?.c || 0)
        outsideCount = Math.max(0, legacyAwareTotalCount - insideCount)
    }
    return { allocated: Math.round(allocated * 100) / 100, released: Math.round(released * 100) / 100, balance, budget, remaining, totalCount: legacyAwareTotalCount, insideCount, outsideCount, startDate, endDate }
}
