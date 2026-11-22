import { getDb } from '../db/database'

export type VoucherBudgetAssignment = {
    id: number
    budgetId: number
    amount: number
    label?: string
    color?: string | null
}

export type VoucherEarmarkAssignment = {
    id: number
    earmarkId: number
    amount: number
    code?: string
    name?: string
    color?: string | null
}

type AssignmentRows<T> = Map<number, T[]>

function groupByVoucher<T>(rows: (T & { voucherId: number })[]): AssignmentRows<T> {
    const result: AssignmentRows<T> = new Map()
    for (const { voucherId, ...assignment } of rows) {
        const existing = result.get(voucherId)
        if (existing) existing.push(assignment as T)
        else result.set(voucherId, [assignment as T])
    }
    return result
}

// The split table is authoritative. Only vouchers without split rows use the legacy amount.
function assignmentsForPage(kind: 'budget' | 'earmark') {
    return `WITH selected AS (SELECT value AS id FROM json_each(?)), assignments AS (
        SELECT a.voucher_id AS voucherId, a.id, a.${kind}_id AS targetId, a.amount
        FROM voucher_${kind}s a JOIN selected s ON s.id = a.voucher_id
        UNION ALL
        SELECT v.id, 0, v.${kind}_id, COALESCE(NULLIF(v.${kind}_amount, 0), ABS(v.gross_amount), 0)
        FROM selected s JOIN vouchers v ON v.id = s.id
        WHERE v.${kind}_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM voucher_${kind}s a WHERE a.voucher_id = v.id
        )
    )`
}

export function readPageBudgets(ids: number[]): AssignmentRows<VoucherBudgetAssignment> {
    if (!ids.length) return new Map()
    const rows = getDb().prepare(`${assignmentsForPage('budget')}
        SELECT a.voucherId, a.id, a.targetId as budgetId, a.amount,
               CASE
                   WHEN b.name IS NOT NULL AND b.name <> '' THEN b.name
                   WHEN b.category_name IS NOT NULL AND b.category_name <> '' THEN printf('%04d-%s-%s', b.year, b.sphere, b.category_name)
                   WHEN b.project_name IS NOT NULL AND b.project_name <> '' THEN printf('%04d-%s-%s', b.year, b.sphere, b.project_name)
                   ELSE printf('%04d-%s', b.year, b.sphere)
               END AS label, b.color
        FROM assignments a JOIN budgets b ON b.id = a.targetId ORDER BY a.voucherId, a.id
    `).all(JSON.stringify(ids)) as (VoucherBudgetAssignment & { voucherId: number })[]
    return groupByVoucher<VoucherBudgetAssignment>(rows)
}

export function readPageEarmarks(ids: number[]): AssignmentRows<VoucherEarmarkAssignment> {
    if (!ids.length) return new Map()
    const rows = getDb().prepare(`${assignmentsForPage('earmark')}
        SELECT a.voucherId, a.id, a.targetId as earmarkId, a.amount, e.code, e.name, e.color
        FROM assignments a JOIN earmarks e ON e.id = a.targetId ORDER BY a.voucherId, a.id
    `).all(JSON.stringify(ids)) as (VoucherEarmarkAssignment & { voucherId: number })[]
    return groupByVoucher<VoucherEarmarkAssignment>(rows)
}

export function getVoucherBudgets(voucherId: number): VoucherBudgetAssignment[] {
    return readPageBudgets([voucherId]).get(voucherId) ?? []
}

export function getVoucherEarmarks(voucherId: number): VoucherEarmarkAssignment[] {
    return readPageEarmarks([voucherId]).get(voucherId) ?? []
}

export function setVoucherBudgets(
    voucherId: number,
    assignments: Array<{ budgetId: number; amount: number }>
): void {
    const db = getDb()
    const voucher = db.prepare('SELECT date, type FROM vouchers WHERE id=?').get(voucherId) as {
        date?: string
        type?: string
    } | undefined
    if (!voucher?.date) throw new Error('Beleg nicht gefunden')

    for (const assignment of assignments) {
        if (!assignment.budgetId) continue
        const budget = db.prepare(`
            SELECT id, year, start_date as startDate, end_date as endDate,
                   enforce_time_range as enforceTimeRange
            FROM budgets WHERE id=?
        `).get(assignment.budgetId) as {
            year?: number
            startDate?: string | null
            endDate?: string | null
            enforceTimeRange?: number
        } | undefined
        if (!budget) throw new Error('Budget nicht gefunden')
        if (budget.enforceTimeRange) {
            const effectiveStart = budget.startDate ?? (budget.year ? `${budget.year}-01-01` : null)
            const effectiveEnd = budget.endDate ?? (budget.year ? `${budget.year}-12-31` : null)
            if (effectiveStart && voucher.date < effectiveStart) {
                throw new Error(`Buchungsdatum liegt vor Beginn des Budgets (${effectiveStart})`)
            }
            if (effectiveEnd && voucher.date > effectiveEnd) {
                throw new Error(`Buchungsdatum liegt nach Ende des Budgets (${effectiveEnd})`)
            }
        }
    }

    db.prepare('DELETE FROM voucher_budgets WHERE voucher_id = ?').run(voucherId)
    const insert = db.prepare(
        'INSERT INTO voucher_budgets (voucher_id, budget_id, amount) VALUES (?, ?, ?)'
    )
    for (const assignment of assignments) {
        if (
            assignment.budgetId
            && (voucher.type === 'INTERNAL' ? assignment.amount !== 0 : assignment.amount > 0)
        ) {
            insert.run(voucherId, assignment.budgetId, assignment.amount)
        }
    }

    const first = assignments[0]
    if (first?.budgetId) {
        db.prepare('UPDATE vouchers SET budget_id = ?, budget_amount = ? WHERE id = ?')
            .run(first.budgetId, first.amount, voucherId)
    } else {
        db.prepare('UPDATE vouchers SET budget_id = NULL, budget_amount = NULL WHERE id = ?').run(voucherId)
    }
}

export function setVoucherEarmarks(
    voucherId: number,
    assignments: Array<{ earmarkId: number; amount: number }>
): void {
    const db = getDb()
    const voucher = db.prepare('SELECT date, type FROM vouchers WHERE id=?').get(voucherId) as {
        date?: string
        type?: string
    } | undefined
    if (!voucher?.date) throw new Error('Beleg nicht gefunden')

    for (const assignment of assignments) {
        if (!assignment.earmarkId) continue
        const earmark = db.prepare(`
            SELECT id, is_active as isActive, start_date as startDate, end_date as endDate,
                   enforce_time_range as enforceTimeRange
            FROM earmarks WHERE id=?
        `).get(assignment.earmarkId) as {
            isActive?: number
            startDate?: string | null
            endDate?: string | null
            enforceTimeRange?: number
        } | undefined
        if (!earmark) throw new Error('Zweckbindung nicht gefunden')
        if (!earmark.isActive) {
            throw new Error('Zweckbindung ist inaktiv und kann nicht verwendet werden')
        }
        if (earmark.enforceTimeRange) {
            if (earmark.startDate && voucher.date < earmark.startDate) {
                throw new Error(`Buchungsdatum liegt vor Beginn der Zweckbindung (${earmark.startDate})`)
            }
            if (earmark.endDate && voucher.date > earmark.endDate) {
                throw new Error(`Buchungsdatum liegt nach Ende der Zweckbindung (${earmark.endDate})`)
            }
        }
    }

    db.prepare('DELETE FROM voucher_earmarks WHERE voucher_id = ?').run(voucherId)
    const insert = db.prepare(
        'INSERT INTO voucher_earmarks (voucher_id, earmark_id, amount) VALUES (?, ?, ?)'
    )
    for (const assignment of assignments) {
        if (
            assignment.earmarkId
            && (voucher.type === 'INTERNAL' ? assignment.amount !== 0 : assignment.amount > 0)
        ) {
            insert.run(voucherId, assignment.earmarkId, assignment.amount)
        }
    }

    const first = assignments[0]
    if (first?.earmarkId) {
        db.prepare('UPDATE vouchers SET earmark_id = ?, earmark_amount = ? WHERE id = ?')
            .run(first.earmarkId, first.amount, voucherId)
    } else {
        db.prepare('UPDATE vouchers SET earmark_id = NULL, earmark_amount = NULL WHERE id = ?').run(voucherId)
    }
}
