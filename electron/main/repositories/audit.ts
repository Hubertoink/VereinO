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
                    WHEN entity IN ('bank_transactions', 'BANK_TRANSACTIONS') THEN (SELECT voucher_id FROM bank_transactions bt WHERE bt.id = audit_log.entity_id)
                    ELSE NULL
                END as voucherId,
                CASE
                    WHEN entity IN ('bank_transactions', 'BANK_TRANSACTIONS') THEN (
                        SELECT v.voucher_no
                        FROM bank_transactions bt
                        LEFT JOIN vouchers v ON v.id = bt.voucher_id
                        WHERE bt.id = audit_log.entity_id
                    )
                    ELSE NULL
                END as voucherNo,
                CASE
                    WHEN entity IN ('bank_transactions', 'BANK_TRANSACTIONS') THEN (
                        SELECT v.description
                        FROM bank_transactions bt
                        LEFT JOIN vouchers v ON v.id = bt.voucher_id
                        WHERE bt.id = audit_log.entity_id
                    )
                    ELSE NULL
                END as voucherDescription,
                CASE
                    WHEN entity IN ('bank_transactions', 'BANK_TRANSACTIONS') THEN (SELECT booking_date FROM bank_transactions bt WHERE bt.id = audit_log.entity_id)
                    ELSE NULL
                END as bankBookingDate,
                CASE
                    WHEN entity IN ('bank_transactions', 'BANK_TRANSACTIONS') THEN (SELECT amount FROM bank_transactions bt WHERE bt.id = audit_log.entity_id)
                    ELSE NULL
                END as bankAmount,
                CASE
                    WHEN entity IN ('bank_transactions', 'BANK_TRANSACTIONS') THEN (SELECT direction FROM bank_transactions bt WHERE bt.id = audit_log.entity_id)
                    ELSE NULL
                END as bankDirection,
                CASE
                    WHEN entity IN ('bank_transactions', 'BANK_TRANSACTIONS') THEN (SELECT counterparty FROM bank_transactions bt WHERE bt.id = audit_log.entity_id)
                    ELSE NULL
                END as bankCounterparty,
                CASE
                    WHEN entity IN ('bank_transactions', 'BANK_TRANSACTIONS') THEN (SELECT purpose FROM bank_transactions bt WHERE bt.id = audit_log.entity_id)
                    ELSE NULL
                END as bankPurpose,
                CASE
                    WHEN entity IN ('bank_transactions', 'BANK_TRANSACTIONS') THEN (SELECT payment_accounts.name FROM bank_transactions bt LEFT JOIN payment_accounts ON payment_accounts.id = bt.payment_account_id WHERE bt.id = audit_log.entity_id)
                    ELSE NULL
                END as bankPaymentAccountName,
                CASE 
                    WHEN entity IN ('vouchers', 'VOUCHER') THEN (SELECT date FROM vouchers v WHERE v.id = audit_log.entity_id)
                    WHEN entity IN ('bank_transactions', 'BANK_TRANSACTIONS') THEN (
                        SELECT COALESCE(v.date, bt.booking_date)
                        FROM bank_transactions bt
                        LEFT JOIN vouchers v ON v.id = bt.voucher_id
                        WHERE bt.id = audit_log.entity_id
                    )
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
