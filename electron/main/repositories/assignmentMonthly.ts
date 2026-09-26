import { getDb } from '../db/database'

/** The same allocation amounts drive totals and trends, including legacy and internal entries. */
export function assignmentMonthly(kind: 'budget' | 'earmark', id: number, filters: { from?: string; to?: string; sphere?: string } = {}) {
    const column = kind === 'budget' ? 'budget' : 'earmark'
    const table = kind === 'budget' ? 'voucher_budgets' : 'voucher_earmarks'
    const where = ['1 = 1']
    const values: (string | number)[] = [id, id]
    if (filters.from) { where.push('date >= ?'); values.push(filters.from) }
    if (filters.to) { where.push('date <= ?'); values.push(filters.to) }
    if (filters.sphere) { where.push('sphere = ?'); values.push(filters.sphere) }
    return getDb().prepare(`
        WITH assignments AS (
            SELECT a.amount, v.type, v.date, v.sphere FROM ${table} a
            JOIN vouchers v ON v.id = a.voucher_id WHERE a.${column}_id = ?
            UNION ALL
            SELECT COALESCE(NULLIF(v.${column}_amount, 0), ABS(v.gross_amount), 0), v.type, v.date, v.sphere
            FROM vouchers v WHERE v.${column}_id = ?
            AND NOT EXISTS (SELECT 1 FROM ${table} a WHERE a.voucher_id = v.id)
        )
        SELECT substr(date, 1, 7) AS month,
            ROUND(SUM(CASE WHEN type='IN' THEN amount WHEN type='INTERNAL' AND amount > 0 THEN amount ELSE 0 END), 2) AS inflow,
            ROUND(SUM(CASE WHEN type='OUT' THEN amount WHEN type='INTERNAL' AND amount < 0 THEN -amount ELSE 0 END), 2) AS spent,
            COUNT(*) AS count, MAX(date) AS lastDate
        FROM assignments WHERE ${where.join(' AND ')} GROUP BY substr(date, 1, 7) ORDER BY month
    `).all(...values) as Array<{ month: string; inflow: number; spent: number; count: number; lastDate: string }>
}
