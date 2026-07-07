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

export function getVoucherBudgets(voucherId: number): VoucherBudgetAssignment[] {
    const db = getDb()
    return db.prepare(`
        SELECT vb.id, vb.budget_id as budgetId, vb.amount,
               CASE
                   WHEN b.name IS NOT NULL AND b.name <> '' THEN b.name
                   WHEN b.category_name IS NOT NULL AND b.category_name <> '' THEN printf('%04d-%s-%s', b.year, b.sphere, b.category_name)
                   WHEN b.project_name IS NOT NULL AND b.project_name <> '' THEN printf('%04d-%s-%s', b.year, b.sphere, b.project_name)
                   ELSE printf('%04d-%s', b.year, b.sphere)
               END as label,
               b.color
        FROM voucher_budgets vb
        JOIN budgets b ON b.id = vb.budget_id
        WHERE vb.voucher_id = ?
        ORDER BY vb.id
    `).all(voucherId) as VoucherBudgetAssignment[]
}

export function getVoucherEarmarks(voucherId: number): VoucherEarmarkAssignment[] {
    const db = getDb()
    return db.prepare(`
        SELECT ve.id, ve.earmark_id as earmarkId, ve.amount,
               e.code, e.name, e.color
        FROM voucher_earmarks ve
        JOIN earmarks e ON e.id = ve.earmark_id
        WHERE ve.voucher_id = ?
        ORDER BY ve.id
    `).all(voucherId) as VoucherEarmarkAssignment[]
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
