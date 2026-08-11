import Database from 'better-sqlite3'
import { getDb, withTransaction } from '../db/database'
import { resolvePrimaryClassificationValueId } from './classifications'

type DB = InstanceType<typeof Database>

export type BudgetKey = {
    year: number
    sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
    primaryClassificationValueId?: number | null
    categoryId?: number | null
    projectId?: number | null
    earmarkId?: number | null
}

export function upsertBudget(input: Partial<{ id: number }> &
    BudgetKey &
    { amountPlanned: number } &
    {
        name?: string | null
        categoryName?: string | null
        projectName?: string | null
        startDate?: string | null
        endDate?: string | null
        color?: string | null
        isArchived?: boolean
        enforceTimeRange?: boolean
    }) {
    return withTransaction((d: DB) => {
        const primaryClassificationValueId = resolvePrimaryClassificationValueId(d, {
            legacySphere: input.sphere,
            primaryClassificationValueId: input.primaryClassificationValueId
        })
        if (input.id != null) {
            // Update by explicit id
            d.prepare(
                `UPDATE budgets SET year=?, sphere=?, primary_classification_value_id=?, category_id=?, project_id=?, earmark_id=?, amount_planned=?, name=?, category_name=?, project_name=?, start_date=?, end_date=?, color=?, is_archived=?, enforce_time_range=? WHERE id=?`
            ).run(
                input.year,
                input.sphere,
                primaryClassificationValueId,
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
                (input.isArchived ?? false) ? 1 : 0,
                (input.enforceTimeRange ?? false) ? 1 : 0,
                input.id
            )
            return { id: input.id, updated: true }
        } else {
            // Insert a new budget row
            const info = d
                .prepare(
                    `INSERT INTO budgets(year, sphere, primary_classification_value_id, category_id, project_id, earmark_id, amount_planned, name, category_name, project_name, start_date, end_date, color, is_archived, enforce_time_range) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
                )
                .run(
                    input.year,
                    input.sphere,
                    primaryClassificationValueId,
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
                    (input.isArchived ?? false) ? 1 : 0,
                    (input.enforceTimeRange ?? false) ? 1 : 0
                )
            return { id: Number(info.lastInsertRowid), created: true }
        }
    })
}

export function listBudgets(params: {
    year?: number
    sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
    primaryClassificationValueId?: number | null
    earmarkId?: number | null
    includeArchived?: boolean
    archivedOnly?: boolean
}) {
    const d = getDb()
    const wh: string[] = []
    const vals: any[] = []
    if (params.year != null) { wh.push('year = ?'); vals.push(params.year) }
    if (params.sphere) { wh.push('sphere = ?'); vals.push(params.sphere) }
    if (params.primaryClassificationValueId != null) { wh.push('primary_classification_value_id = ?'); vals.push(params.primaryClassificationValueId) }
    if (params.earmarkId !== undefined) { wh.push('IFNULL(earmark_id,-1) = IFNULL(?, -1)'); vals.push(params.earmarkId) }
    if (params.archivedOnly) {
        wh.push('is_archived = 1')
    } else if (!params.includeArchived) {
        // Default: hide archived budgets
        wh.push('is_archived = 0')
    }
    const whereSql = wh.length ? ' WHERE ' + wh.join(' AND ') : ''
    const rows = d.prepare(`SELECT b.id, b.year, b.sphere, b.primary_classification_value_id as primaryClassificationValueId, cv.name as primaryClassificationName, cv.color as primaryClassificationColor, cv.icon as primaryClassificationIcon, b.category_id as categoryId, b.project_id as projectId, b.earmark_id as earmarkId, b.amount_planned as amountPlanned,
        b.name, b.category_name as categoryName, b.project_name as projectName, b.start_date as startDate, b.end_date as endDate, b.color, b.is_archived as isArchived, b.enforce_time_range as enforceTimeRange
        FROM budgets b LEFT JOIN classification_values cv ON cv.id = b.primary_classification_value_id${whereSql.replaceAll('sphere', 'b.sphere').replaceAll('year', 'b.year').replaceAll('earmark_id', 'b.earmark_id').replaceAll('is_archived', 'b.is_archived').replaceAll('primary_classification_value_id', 'b.primary_classification_value_id')} ORDER BY b.year DESC, b.sphere`).all(...vals) as any[]
    return rows
}

export function deleteBudget(id: number) {
    const d = getDb()
    d.prepare('DELETE FROM budgets WHERE id=?').run(id)
    return { id }
}

export function budgetUsage(input: { budgetId: number; from?: string; to?: string }) {
    const d = getDb()
    // Prefer voucher_budgets; include legacy voucher budget columns when no junction row exists.
    // Der from/to Parameter wird nur für Dashboard-Zeitfilter verwendet.
    const row = d.prepare(`
        WITH budget_assignments AS (
            SELECT vb.voucher_id as voucherId, vb.budget_id as budgetId, vb.amount,
                   v.type, v.date
            FROM voucher_budgets vb
            JOIN vouchers v ON v.id = vb.voucher_id
            WHERE vb.budget_id = ?
            UNION ALL
            SELECT v.id as voucherId, v.budget_id as budgetId,
                   COALESCE(NULLIF(v.budget_amount, 0), ABS(v.gross_amount), 0) as amount,
                   v.type, v.date
            FROM vouchers v
            WHERE v.budget_id = ?
              AND NOT EXISTS (SELECT 1 FROM voucher_budgets vb WHERE vb.voucher_id = v.id)
        )
        SELECT
          IFNULL(SUM(CASE WHEN type='OUT' THEN amount WHEN type='INTERNAL' AND amount < 0 THEN ABS(amount) ELSE 0 END), 0) as spent,
          IFNULL(SUM(CASE WHEN type='IN' THEN amount WHEN type='INTERNAL' AND amount > 0 THEN amount ELSE 0 END), 0) as inflow,
          COUNT(1) as count,
          MAX(date) as lastDate
        FROM budget_assignments
    `).get(input.budgetId, input.budgetId) as any

        const plannedRow = d.prepare(`SELECT amount_planned as planned FROM budgets WHERE id=?`).get(input.budgetId) as any
        const planned = Number(plannedRow?.planned ?? 0) || 0
        const spent = Number(row.spent || 0) || 0
        const inflow = Number(row.inflow || 0) || 0
        const balance = Math.round((inflow - spent) * 100) / 100
        const remaining = Math.round((planned + inflow - spent) * 100) / 100
    // Counts inside/outside relative to budget's own date range
    const meta = d.prepare(`SELECT start_date as startDate, end_date as endDate FROM budgets WHERE id=?`).get(input.budgetId) as any
    const startDate = meta?.startDate || null
    const endDate = meta?.endDate || null
    let countInside = 0
    let countOutside = 0
    const assignmentCte = `
        WITH budget_assignments AS (
            SELECT vb.voucher_id as voucherId, vb.budget_id as budgetId, v.date
            FROM voucher_budgets vb
            JOIN vouchers v ON v.id = vb.voucher_id
            WHERE vb.budget_id = ?
            UNION ALL
            SELECT v.id as voucherId, v.budget_id as budgetId, v.date
            FROM vouchers v
            WHERE v.budget_id = ?
              AND NOT EXISTS (SELECT 1 FROM voucher_budgets vb WHERE vb.voucher_id = v.id)
        )
    `
    const totalAssignmentRow = d.prepare(`${assignmentCte} SELECT COUNT(1) as c FROM budget_assignments`).get(input.budgetId, input.budgetId) as any
    const legacyAwareTotalCount = Number(totalAssignmentRow?.c || 0)
    countInside = legacyAwareTotalCount
    if (startDate || endDate) {
        const wh2: string[] = ['1 = 1']
        const vals2: any[] = [input.budgetId, input.budgetId]
        if (startDate) { wh2.push('date >= ?'); vals2.push(startDate) }
        if (endDate) { wh2.push('date <= ?'); vals2.push(endDate) }
        const insideRow = d.prepare(`${assignmentCte} SELECT COUNT(1) as c FROM budget_assignments WHERE ${wh2.join(' AND ')}`).get(...vals2) as any
        countInside = Number(insideRow?.c || 0)
        countOutside = Math.max(0, legacyAwareTotalCount - countInside)
    }
    return { spent, inflow, planned, balance, remaining, count: row.count || 0, lastDate: row.lastDate || null, countInside, countOutside, startDate, endDate }
}
