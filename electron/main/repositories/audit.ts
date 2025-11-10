import { getDb } from '../db/database'

export function listRecentAudit(limit = 20) {
    const d = getDb()
    // Include underlying record date (voucher/invoice/member) for context in the dashboard activity list.
    // Using scalar subqueries keeps this simple and performant for small LIMIT values.
    const rows = d
        .prepare(
            `SELECT 
                id, 
                user_id as userId, 
                entity, 
                entity_id as entityId, 
                action, 
                diff_json as diffJson, 
                created_at as createdAt,
                CASE 
                    WHEN entity IN ('vouchers', 'VOUCHER') THEN (SELECT date FROM vouchers v WHERE v.id = audit_log.entity_id)
                    WHEN entity IN ('invoices', 'INVOICE') THEN (SELECT date FROM invoices i WHERE i.id = audit_log.entity_id)
                    WHEN entity IN ('members', 'MEMBER') THEN (SELECT created_at FROM members m WHERE m.id = audit_log.entity_id)
                    ELSE NULL
                END as recordDate
             FROM audit_log 
             ORDER BY id DESC 
             LIMIT ?`
        )
        .all(limit) as any[]
    return rows.map(r => ({ ...r, diff: safeParseJson(r.diffJson), diffJson: undefined }))
}

function safeParseJson(s: string | null | undefined): any {
    if (!s) return null
    try { return JSON.parse(String(s)) } catch { return null }
}
