import Database from 'better-sqlite3'
import { getDb, withTransaction } from '../db/database'

type DB = InstanceType<typeof Database>

export type BudgetKey = {
    year: number
    sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
    categoryId?: number | null
    projectId?: number | null
    earmarkId?: number | null
}

export function upsertBudget(input: Partial<{ id: number }> & BudgetKey & { amountPlanned: number } & { name?: string | null; categoryName?: string | null; projectName?: string | null; startDate?: string | null; endDate?: string | null; color?: string | null; enforceTimeRange?: boolean }) {
    return withTransaction((d: DB) => {
        if (input.id != null) {
            // Update by explicit id
            d.prepare(
                `UPDATE budgets SET year=?, sphere=?, category_id=?, project_id=?, earmark_id=?, amount_planned=?, name=?, category_name=?, project_name=?, start_date=?, end_date=?, color=?, enforce_time_range=? WHERE id=?`
            ).run(
                input.year,
                input.sphere,
                input.categoryId ?? null,
                input.projectId ?? null,
                input.earmarkId ?? null,
                input.amountPlanned,
                input.name ?? null,
                input.categoryName ?? null,
                input.projectName ?? null,
                input.startDate ?? null,
                input.endDate ?? null,
                input.color ?? null,
                (input.enforceTimeRange ?? false) ? 1 : 0,
                input.id
            )
            return { id: input.id, updated: true }
        } else {
            // Insert a new budget row
            const info = d
                .prepare(
                    `INSERT INTO budgets(year, sphere, category_id, project_id, earmark_id, amount_planned, name, category_name, project_name, start_date, end_date, color, enforce_time_range) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
                )
                .run(
                    input.year,
                    input.sphere,
                    input.categoryId ?? null,
                    input.projectId ?? null,
                    input.earmarkId ?? null,
                    input.amountPlanned,
                    input.name ?? null,
                    input.categoryName ?? null,
                    input.projectName ?? null,
                    input.startDate ?? null,
                    input.endDate ?? null,
                    input.color ?? null,
                    (input.enforceTimeRange ?? false) ? 1 : 0
                )
            return { id: Number(info.lastInsertRowid), created: true }
        }
    })
}

export function listBudgets(params: { year?: number; sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; earmarkId?: number | null }) {
    const d = getDb()
    const wh: string[] = []
    const vals: any[] = []
    if (params.year != null) { wh.push('year = ?'); vals.push(params.year) }
    if (params.sphere) { wh.push('sphere = ?'); vals.push(params.sphere) }
    if (params.earmarkId !== undefined) { wh.push('IFNULL(earmark_id,-1) = IFNULL(?, -1)'); vals.push(params.earmarkId) }
    const whereSql = wh.length ? ' WHERE ' + wh.join(' AND ') : ''
    const rows = d.prepare(`SELECT id, year, sphere, category_id as categoryId, project_id as projectId, earmark_id as earmarkId, amount_planned as amountPlanned,
        name, category_name as categoryName, project_name as projectName, start_date as startDate, end_date as endDate, color, enforce_time_range as enforceTimeRange
        FROM budgets${whereSql} ORDER BY year DESC, sphere`).all(...vals) as any[]
    return rows
}

export function deleteBudget(id: number) {
    const d = getDb()
    d.prepare('DELETE FROM budgets WHERE id=?').run(id)
    return { id }
}

export function budgetUsage(input: { budgetId: number; from?: string; to?: string }) {
    const d = getDb()
    // Berechnung über die Junction-Tabelle voucher_budgets für mehrere Zuordnungen pro Buchung
    // Der from/to Parameter wird nur für Dashboard-Zeitfilter verwendet
    const row = d.prepare(`
        SELECT
          IFNULL(SUM(CASE WHEN v.type='OUT' THEN vb.amount ELSE 0 END), 0) as spent,
          IFNULL(SUM(CASE WHEN v.type='IN' THEN vb.amount ELSE 0 END), 0) as inflow,
          COUNT(1) as count,
          MAX(v.date) as lastDate
        FROM voucher_budgets vb
        JOIN vouchers v ON v.id = vb.voucher_id
        WHERE vb.budget_id = ?
    `).get(input.budgetId) as any
    // Counts inside/outside relative to budget's own date range
    const meta = d.prepare(`SELECT start_date as startDate, end_date as endDate FROM budgets WHERE id=?`).get(input.budgetId) as any
    const totalCountRow = d.prepare(`SELECT COUNT(1) as c FROM voucher_budgets WHERE budget_id=?`).get(input.budgetId) as any
    const totalCount = Number(totalCountRow?.c || 0)
    const startDate = meta?.startDate || null
    const endDate = meta?.endDate || null
    let countInside = totalCount
    let countOutside = 0
    if (startDate || endDate) {
        const wh2: string[] = ['vb.budget_id = ?']
        const vals2: any[] = [input.budgetId]
        if (startDate) { wh2.push('v.date >= ?'); vals2.push(startDate) }
        if (endDate) { wh2.push('v.date <= ?'); vals2.push(endDate) }
        const insideRow = d.prepare(`SELECT COUNT(1) as c FROM voucher_budgets vb JOIN vouchers v ON v.id = vb.voucher_id WHERE ${wh2.join(' AND ')}`).get(...vals2) as any
        countInside = Number(insideRow?.c || 0)
        countOutside = Math.max(0, totalCount - countInside)
    }
    return { spent: row.spent || 0, inflow: row.inflow || 0, count: row.count || 0, lastDate: row.lastDate || null, countInside, countOutside, startDate, endDate }
}
