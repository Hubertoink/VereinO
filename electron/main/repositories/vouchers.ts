import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { withTransaction, getAppDataDir, getDb } from '../db/database'
import { ensurePeriodOpen, getSetting } from '../services/settings'
import { nextVoucherSequence, makeVoucherNo } from '../services/numbering'
import { writeAudit } from '../services/audit'
import { ensureTag, getTagsForVoucher, setVoucherTags } from './tags'
import { getDefaultPaymentAccountIdForMethod, getPaymentAccountById, paymentMethodForAccountKind } from './paymentAccounts'

type DB = InstanceType<typeof Database>

function round2(n: number) {
    return Math.round(n * 100) / 100
}

function normalizeVoucherSearchQuery(raw?: string): { text: string; id: number | null } | null {
    if (!raw) return null
    const trimmed = String(raw).trim()
    if (!trimmed) return null
    const text = trimmed.startsWith('#') ? trimmed.slice(1).trim() : trimmed
    const id = /^\d+$/.test(text) ? Number(text) : null
    return { text, id }
}

function getAdvancePlaceholderRef(d: DB, voucherId: number) {
        return d.prepare(`
                SELECT id
                FROM member_advances
                WHERE placeholder_voucher_id = ?
                    AND (resolved_at IS NULL OR resolved_at = '')
                LIMIT 1
        `).get(voucherId) as any
}

function resolveVoucherPaymentFields(
    d: DB,
    input: {
        type?: 'IN' | 'OUT' | 'TRANSFER'
        paymentMethod?: 'BAR' | 'BANK' | null
        transferFrom?: 'BAR' | 'BANK' | null
        transferTo?: 'BAR' | 'BANK' | null
        paymentAccountId?: number | null
        transferFromAccountId?: number | null
        transferToAccountId?: number | null
    },
    current?: {
        type?: 'IN' | 'OUT' | 'TRANSFER'
        paymentMethod?: 'BAR' | 'BANK' | null
        transferFrom?: 'BAR' | 'BANK' | null
        transferTo?: 'BAR' | 'BANK' | null
        paymentAccountId?: number | null
        transferFromAccountId?: number | null
        transferToAccountId?: number | null
    }
) {
    const nextType = input.type ?? current?.type ?? 'IN'

    if (nextType === 'TRANSFER') {
        const fromId = input.transferFromAccountId ?? current?.transferFromAccountId ?? (input.transferFrom ? getDefaultPaymentAccountIdForMethod(input.transferFrom, d) : null) ?? (current?.transferFrom ? getDefaultPaymentAccountIdForMethod(current.transferFrom, d) : null)
        const toId = input.transferToAccountId ?? current?.transferToAccountId ?? (input.transferTo ? getDefaultPaymentAccountIdForMethod(input.transferTo, d) : null) ?? (current?.transferTo ? getDefaultPaymentAccountIdForMethod(current.transferTo, d) : null)
        const fromAccount = fromId ? getPaymentAccountById(fromId, d) : undefined
        const toAccount = toId ? getPaymentAccountById(toId, d) : undefined
        return {
            paymentAccountId: null,
            paymentMethod: null,
            transferFromAccountId: fromId ?? null,
            transferFrom: paymentMethodForAccountKind(fromAccount?.kind) ?? input.transferFrom ?? current?.transferFrom ?? null,
            transferToAccountId: toId ?? null,
            transferTo: paymentMethodForAccountKind(toAccount?.kind) ?? input.transferTo ?? current?.transferTo ?? null,
            paymentAccountName: null,
            transferFromAccountName: fromAccount?.name ?? null,
            transferToAccountName: toAccount?.name ?? null,
        }
    }

    const paymentAccountId = input.paymentAccountId ?? current?.paymentAccountId ?? (input.paymentMethod ? getDefaultPaymentAccountIdForMethod(input.paymentMethod, d) : null) ?? (current?.paymentMethod ? getDefaultPaymentAccountIdForMethod(current.paymentMethod, d) : null)
    const paymentAccount = paymentAccountId ? getPaymentAccountById(paymentAccountId, d) : undefined
    return {
        paymentAccountId: paymentAccountId ?? null,
        paymentMethod: paymentMethodForAccountKind(paymentAccount?.kind) ?? input.paymentMethod ?? current?.paymentMethod ?? null,
        transferFromAccountId: null,
        transferFrom: null,
        transferToAccountId: null,
        transferTo: null,
        paymentAccountName: paymentAccount?.name ?? null,
        transferFromAccountName: null,
        transferToAccountName: null,
    }
}

export function createVoucher(input: {
    date: string
    type: 'IN' | 'OUT' | 'TRANSFER'
    sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
    description?: string
    note?: string | null
    netAmount?: number
    grossAmount?: number
    vatRate: number
    paymentMethod?: 'BAR' | 'BANK'
    transferFrom?: 'BAR' | 'BANK'
    transferTo?: 'BAR' | 'BANK'
    paymentAccountId?: number | null
    transferFromAccountId?: number | null
    transferToAccountId?: number | null
    categoryId?: number
    projectId?: number
    earmarkId?: number
    earmarkAmount?: number | null
    budgetId?: number
    budgetAmount?: number | null
    budgets?: Array<{ budgetId: number; amount: number }>
    earmarks?: Array<{ earmarkId: number; amount: number }>
    createdBy?: number | null
    files?: { name: string; dataBase64: string; mime?: string }[]
    tags?: string[]
}) {
    return withTransaction((d: DB) => {
        const warnings: string[] = []
        ensurePeriodOpen(input.date, d)
        const date = new Date(input.date)
        const year = date.getFullYear()
        // sequence and voucherNo will be (re)generated inside retry loop
        // compute based on provided net or gross
        let netAmount: number
        let grossAmount: number
        let vatAmount: number
        if (typeof input.netAmount === 'number') {
            netAmount = input.netAmount
            vatAmount = round2((netAmount * input.vatRate) / 100)
            grossAmount = round2(netAmount + vatAmount)
        } else if (typeof input.grossAmount === 'number') {
            // User provided gross; derive net/vat from vatRate (0% => net === gross)
            grossAmount = input.grossAmount
            const rate = Number(input.vatRate ?? 0)
            netAmount = round2(grossAmount / (1 + rate / 100))
            vatAmount = round2(grossAmount - netAmount)
        } else {
            throw new Error('Either netAmount or grossAmount must be provided')
        }

        const earmarkAssignments: Array<{ earmarkId: number; amount: number }> = Array.isArray((input as any).earmarks) && (input as any).earmarks.length
            ? (input as any).earmarks
            : (input.earmarkId != null ? [{ earmarkId: input.earmarkId, amount: Number(input.earmarkAmount ?? grossAmount ?? 0) }] : [])

        const budgetAssignments: Array<{ budgetId: number; amount: number }> = Array.isArray((input as any).budgets) && (input as any).budgets.length
            ? (input as any).budgets
            : (input.budgetId != null ? [{ budgetId: input.budgetId, amount: Number(input.budgetAmount ?? grossAmount ?? 0) }] : [])

        // Earmark validations (single or multiple)
        for (const ea of earmarkAssignments) {
            if (!ea?.earmarkId) continue
            const em = d.prepare('SELECT id, is_active as isActive, start_date as startDate, end_date as endDate, enforce_time_range as enforceTimeRange, budget FROM earmarks WHERE id=?').get(ea.earmarkId) as any
            if (!em) throw new Error('Zweckbindung nicht gefunden')
            if (!em.isActive) throw new Error('Zweckbindung ist inaktiv und kann nicht verwendet werden')

            if (em.enforceTimeRange) {
                if (em.startDate && input.date < em.startDate) throw new Error(`Buchungsdatum liegt vor Beginn der Zweckbindung (${em.startDate})`)
                if (em.endDate && input.date > em.endDate) throw new Error(`Buchungsdatum liegt nach Ende der Zweckbindung (${em.endDate})`)
            }

            // Negative-balance protection (using junction table)
            const cfg = (getSetting<{ allowNegative?: boolean }>('earmark', d) || { allowNegative: false })
            if (!cfg.allowNegative && input.type === 'OUT') {
                const balRow = d.prepare(`
                    SELECT
                      IFNULL(SUM(CASE WHEN v.type='IN' THEN ve.amount ELSE 0 END),0) as allocated,
                      IFNULL(SUM(CASE WHEN v.type='OUT' THEN ve.amount ELSE 0 END),0) as released
                    FROM voucher_earmarks ve
                    JOIN vouchers v ON v.id = ve.voucher_id
                    WHERE ve.earmark_id = ? AND v.date <= ?
                `).get(ea.earmarkId, input.date) as any
                const budget = Number(em?.budget ?? 0) || 0
                const currentBalance = Math.round(((balRow.allocated || 0) - (balRow.released || 0)) * 100) / 100
                const remaining = Math.round(((budget + currentBalance) * 100)) / 100
                const wouldBe = Math.round(((remaining - (ea.amount ?? 0)) * 100)) / 100
                if (wouldBe < 0) warnings.push('Zweckbindung würde den verfügbaren Rahmen unterschreiten.')
            }
        }

        // Budget validations (single or multiple)
        for (const ba of budgetAssignments) {
            if (!ba?.budgetId) continue
            const budget = d.prepare('SELECT id, year, start_date as startDate, end_date as endDate, enforce_time_range as enforceTimeRange FROM budgets WHERE id=?').get(ba.budgetId) as any
            if (!budget) throw new Error('Budget nicht gefunden')

            if (budget.enforceTimeRange) {
                const effStart = budget.startDate ?? (budget.year ? `${budget.year}-01-01` : null)
                const effEnd = budget.endDate ?? (budget.year ? `${budget.year}-12-31` : null)
                if (effStart && input.date < effStart) throw new Error(`Buchungsdatum liegt vor Beginn des Budgets (${effStart})`)
                if (effEnd && input.date > effEnd) throw new Error(`Buchungsdatum liegt nach Ende des Budgets (${effEnd})`)
            }
        }

                const paymentFields = resolveVoucherPaymentFields(d, input)

        const stmt = d.prepare(`
      INSERT INTO vouchers (
        year, seq_no, voucher_no, date, type, sphere, account_id, category_id, project_id, earmark_id, earmark_amount, budget_id, budget_amount, description, note,
                                net_amount, vat_rate, vat_amount, gross_amount, amount_mode, payment_method, transfer_from, transfer_to, payment_account_id, transfer_from_account_id, transfer_to_account_id, counterparty, created_by
                                ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
    `)

        let id: number | null = null
        let lastVoucherNo: string = ''
        // Retry a few times in case of rare UNIQUE collisions on voucher_no/seq
        for (let attempt = 0; attempt < 5; attempt++) {
            const seq = nextVoucherSequence(d, year, input.sphere)
            const voucherNo = makeVoucherNo(year, input.date, input.sphere, seq)
            lastVoucherNo = voucherNo
            try {
                const info = stmt.run(
                    year,
                    seq,
                    voucherNo,
                    input.date,
                    input.type,
                    input.sphere,
                    input.categoryId ?? null,
                    input.projectId ?? null,
                    (earmarkAssignments[0]?.earmarkId ?? input.earmarkId) ?? null,
                    (earmarkAssignments[0]?.amount ?? input.earmarkAmount) ?? null,
                    (budgetAssignments[0]?.budgetId ?? input.budgetId) ?? null,
                    (budgetAssignments[0]?.amount ?? input.budgetAmount) ?? null,
                    input.description ?? null,
                    input.note ?? null,
                    netAmount,
                    input.vatRate,
                    vatAmount,
                    grossAmount,
                    typeof input.grossAmount === 'number' ? 'GROSS' : 'NET',
                    paymentFields.paymentMethod,
                    paymentFields.transferFrom,
                    paymentFields.transferTo,
                    paymentFields.paymentAccountId,
                    paymentFields.transferFromAccountId,
                    paymentFields.transferToAccountId,
                    input.createdBy ?? null
                )
                id = Number(info.lastInsertRowid)
                break
            } catch (e: any) {
                const msg = String(e?.message || '')
                const code = String((e as any)?.code || '')
                const isUnique = code.includes('SQLITE_CONSTRAINT') || /UNIQUE constraint failed/i.test(msg)
                if (!isUnique) throw e
                // otherwise, retry (generate next sequence)
                if (attempt === 4) throw new Error('Konnte Belegnummer nicht vergeben (UNIQUE). Bitte erneut versuchen.')
            }
        }
        if (!id) throw new Error('Belegerstellung fehlgeschlagen')

        // Persist multiple assignments into junction tables (if any)
        if (budgetAssignments.length) {
            d.prepare('DELETE FROM voucher_budgets WHERE voucher_id = ?').run(id)
            const stmtB = d.prepare('INSERT INTO voucher_budgets (voucher_id, budget_id, amount) VALUES (?, ?, ?)')
            for (const a of budgetAssignments) {
                if (a.budgetId && a.amount > 0) stmtB.run(id, a.budgetId, a.amount)
            }
        }
        if (earmarkAssignments.length) {
            d.prepare('DELETE FROM voucher_earmarks WHERE voucher_id = ?').run(id)
            const stmtE = d.prepare('INSERT INTO voucher_earmarks (voucher_id, earmark_id, amount) VALUES (?, ?, ?)')
            for (const a of earmarkAssignments) {
                if (a.earmarkId && a.amount > 0) stmtE.run(id, a.earmarkId, a.amount)
            }
        }

        if (input.files?.length) {
            const { filesDir } = getAppDataDir()
            for (const f of input.files) {
                const buff = Buffer.from(f.dataBase64, 'base64')
                const safeName = `${id}-${Date.now()}-${f.name.replace(/[^a-zA-Z0-9_.-]/g, '_')}`
                const abs = path.join(filesDir, safeName)
                fs.writeFileSync(abs, buff)
                d.prepare(
                    ' INSERT INTO voucher_files(voucher_id, file_name, file_path, mime_type, size) VALUES (?,?,?,?,?) '
                ).run(id, f.name, abs, f.mime ?? null, buff.length)
            }
        }

        // assign tags if provided
        if (input.tags && input.tags.length) {
            setVoucherTags(id, input.tags)
        }

        writeAudit(d, input.createdBy ?? null, 'vouchers', id, 'CREATE', {
            id,
            data: input
        })

        return { id, voucherNo: lastVoucherNo, grossAmount, warnings }
    })
}

export function reverseVoucher(originalId: number, userId: number | null) {
    return withTransaction((d: DB) => {
        const original = d.prepare('SELECT * FROM vouchers WHERE id=?').get(originalId) as any
        if (!original) throw new Error('Original voucher not found')
        if (original.reversed_by_id) throw new Error('Diese Buchung wurde bereits storniert.')
        if (original.original_id) throw new Error('Stornobuchungen können nicht erneut storniert werden.')
        // Reverse uses today's date; ensure open
        ensurePeriodOpen(new Date().toISOString().slice(0, 10), d)

        const now = new Date()
        const year = now.getFullYear()
        const seq = nextVoucherSequence(d, year, original.sphere)
        const todayISO = now.toISOString().slice(0, 10)
        const voucherNo = makeVoucherNo(year, todayISO, original.sphere, seq)
        const reverseType = original.type === 'IN' ? 'OUT' : original.type === 'OUT' ? 'IN' : 'TRANSFER'
        const reverseDescription = `Storno zu ${original.voucher_no}${original.description ? ` - ${original.description}` : ''}`
        const reverseNet = Math.abs(Number(original.net_amount || 0))
        const reverseVat = Math.abs(Number(original.vat_amount || 0))
        const reverseGross = Math.abs(Number(original.gross_amount || 0))
        const reversePaymentMethod = original.type === 'TRANSFER' ? null : (original.payment_method ?? null)
        const reverseTransferFrom = original.type === 'TRANSFER' ? (original.transfer_to ?? null) : null
        const reverseTransferTo = original.type === 'TRANSFER' ? (original.transfer_from ?? null) : null

        const stmt = d.prepare(`
      INSERT INTO vouchers (
        year, seq_no, voucher_no, date, type, sphere, account_id, category_id, project_id,
        earmark_id, earmark_amount, budget_id, budget_amount, description, note,
        net_amount, vat_rate, vat_amount, gross_amount, amount_mode,
        payment_method, transfer_from, transfer_to, counterparty, created_by, original_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
    `)
        const info = stmt.run(
            year,
            seq,
            voucherNo,
            todayISO,
            reverseType,
            original.sphere,
            original.account_id,
            original.category_id,
            original.project_id,
            original.earmark_id,
            original.earmark_amount == null ? null : Math.abs(Number(original.earmark_amount)),
            original.budget_id,
            original.budget_amount == null ? null : Math.abs(Number(original.budget_amount)),
            reverseDescription,
            null,
            reverseNet,
            original.vat_rate,
            reverseVat,
            reverseGross,
            original.amount_mode ?? 'NET',
            reversePaymentMethod,
            reverseTransferFrom,
            reverseTransferTo,
            userId ?? null,
            originalId
        )
        const id = Number(info.lastInsertRowid)

        const originalBudgets = d.prepare('SELECT budget_id as budgetId, amount FROM voucher_budgets WHERE voucher_id = ?').all(originalId) as Array<{ budgetId: number; amount: number }>
        if (originalBudgets.length) {
            const stmtB = d.prepare('INSERT INTO voucher_budgets (voucher_id, budget_id, amount) VALUES (?, ?, ?)')
            for (const a of originalBudgets) {
                const amount = Math.abs(Number(a.amount || 0))
                if (a.budgetId && amount > 0) stmtB.run(id, a.budgetId, amount)
            }
        }

        const originalEarmarks = d.prepare('SELECT earmark_id as earmarkId, amount FROM voucher_earmarks WHERE voucher_id = ?').all(originalId) as Array<{ earmarkId: number; amount: number }>
        if (originalEarmarks.length) {
            const stmtE = d.prepare('INSERT INTO voucher_earmarks (voucher_id, earmark_id, amount) VALUES (?, ?, ?)')
            for (const a of originalEarmarks) {
                const amount = Math.abs(Number(a.amount || 0))
                if (a.earmarkId && amount > 0) stmtE.run(id, a.earmarkId, amount)
            }
        }

        const originalTags = getTagsForVoucher(originalId)
        const reverseTagNames = [...originalTags, 'Storno']
        const tagIds: number[] = []
        for (const name of reverseTagNames) {
            const tag = ensureTag(d, name)
            if (tag?.id) tagIds.push(tag.id)
        }
        if (tagIds.length) {
            const tagStmt = d.prepare('INSERT OR IGNORE INTO voucher_tags(voucher_id, tag_id) VALUES (?, ?)')
            for (const tagId of tagIds) tagStmt.run(id, tagId)
        }

        d.prepare('UPDATE vouchers SET reversed_by_id=? WHERE id=?').run(id, originalId)

        writeAudit(d, userId ?? null, 'vouchers', id, 'REVERSE', { originalId })
        return { id, voucherNo }
    })
}

export function listRecentVouchers(limit = 20) {
    const d = getDb()
    const rows = (d
        .prepare(
            `SELECT v.id, v.voucher_no as voucherNo, v.date, v.type, v.sphere, v.payment_method as paymentMethod, v.transfer_from as transferFrom, v.transfer_to as transferTo, v.description, v.note, v.net_amount as netAmount,
                            v.vat_rate as vatRate, v.vat_amount as vatAmount, v.gross_amount as grossAmount, v.amount_mode as amountMode,
                            v.original_id as originalId,
                            (SELECT ov.voucher_no FROM vouchers ov WHERE ov.id = v.original_id) as originalVoucherNo,
                            v.reversed_by_id as reversedById,
                            (SELECT rv.voucher_no FROM vouchers rv WHERE rv.id = v.reversed_by_id) as reversedByVoucherNo,
                            (SELECT COUNT(1) FROM voucher_files vf WHERE vf.voucher_id = v.id) as fileCount,
                            v.earmark_id as earmarkId,
                            v.earmark_amount as earmarkAmount,
                            (SELECT e.code FROM earmarks e WHERE e.id = v.earmark_id) as earmarkCode,
                            v.budget_id as budgetId,
                            v.budget_amount as budgetAmount,
                            (
                                SELECT CASE
                                    WHEN b.name IS NOT NULL AND b.name <> '' THEN b.name
                                    WHEN b.category_name IS NOT NULL AND b.category_name <> '' THEN printf('%04d-%s-%s', b.year, b.sphere, b.category_name)
                                    WHEN b.project_name IS NOT NULL AND b.project_name <> '' THEN printf('%04d-%s-%s', b.year, b.sphere, b.project_name)
                                    ELSE printf('%04d-%s-%s', b.year, b.sphere, COALESCE(b.category_id, COALESCE(b.project_id, COALESCE(b.earmark_id, ''))))
                                END FROM budgets b WHERE b.id = v.budget_id
                            ) as budgetLabel,
                            (SELECT b.color FROM budgets b WHERE b.id = v.budget_id) as budgetColor,
                            (
                                SELECT GROUP_CONCAT(t.name, '\u0001')
                                FROM voucher_tags vt JOIN tags t ON t.id = vt.tag_id
                                WHERE vt.voucher_id = v.id
                            ) as tagsConcat
             FROM vouchers v ORDER BY v.date DESC, v.id DESC LIMIT ?`
        )
        .all(limit)) as any[]
    // Map concatenated tags to array
    return rows.map(r => ({ ...r, tags: (r as any).tagsConcat ? String((r as any).tagsConcat).split('\u0001') : [] }))
}

export function listVouchersFiltered({ limit = 20, paymentMethod }: { limit?: number; paymentMethod?: 'BAR' | 'BANK' }) {
    const d = getDb()
    let sql = `SELECT id, voucher_no as voucherNo, date, type, sphere, payment_method as paymentMethod, transfer_from as transferFrom, transfer_to as transferTo,
                                        payment_account_id as paymentAccountId,
                                        transfer_from_account_id as transferFromAccountId,
                                        transfer_to_account_id as transferToAccountId,
                                        (SELECT name FROM payment_accounts pa WHERE pa.id = vouchers.payment_account_id) as paymentAccountName,
                                        (SELECT kind FROM payment_accounts pa WHERE pa.id = vouchers.payment_account_id) as paymentAccountKind,
                                        (SELECT color FROM payment_accounts pa WHERE pa.id = vouchers.payment_account_id) as paymentAccountColor,
                                        (SELECT name FROM payment_accounts pa WHERE pa.id = vouchers.transfer_from_account_id) as transferFromAccountName,
                                        (SELECT kind FROM payment_accounts pa WHERE pa.id = vouchers.transfer_from_account_id) as transferFromAccountKind,
                                        (SELECT color FROM payment_accounts pa WHERE pa.id = vouchers.transfer_from_account_id) as transferFromAccountColor,
                                        (SELECT name FROM payment_accounts pa WHERE pa.id = vouchers.transfer_to_account_id) as transferToAccountName,
                                        (SELECT kind FROM payment_accounts pa WHERE pa.id = vouchers.transfer_to_account_id) as transferToAccountKind,
                                        (SELECT color FROM payment_accounts pa WHERE pa.id = vouchers.transfer_to_account_id) as transferToAccountColor,
                                        description, note,
                                        net_amount as netAmount, vat_rate as vatRate, vat_amount as vatAmount, gross_amount as grossAmount, amount_mode as amountMode,
                                        original_id as originalId,
                                        (SELECT ov.voucher_no FROM vouchers ov WHERE ov.id = vouchers.original_id) as originalVoucherNo,
                                        reversed_by_id as reversedById,
                                        (SELECT rv.voucher_no FROM vouchers rv WHERE rv.id = vouchers.reversed_by_id) as reversedByVoucherNo,
                                        (SELECT COUNT(1) FROM voucher_files vf WHERE vf.voucher_id = vouchers.id) as fileCount
                         FROM vouchers`
    const params: any[] = []
    const wh: string[] = []
    if (paymentMethod) {
        wh.push(`(payment_method = ? OR (type = 'TRANSFER' AND (transfer_from = ? OR transfer_to = ?)))`)
        params.push(paymentMethod, paymentMethod, paymentMethod)
    }
    if (wh.length) sql += ` WHERE ` + wh.join(' AND ')
    sql += ` ORDER BY date DESC, id DESC LIMIT ?`
    params.push(limit)
    return d.prepare(sql).all(...params) as any[]
}

export function listVouchersAdvanced(filters: {
    limit?: number
    offset?: number
    sort?: 'ASC' | 'DESC'
    // Extended sort keys
    sortBy?: 'date' | 'gross' | 'net' | 'attachments' | 'budget' | 'earmark' | 'payment' | 'sphere'
    paymentMethod?: 'BAR' | 'BANK'
    paymentAccountId?: number | null
    sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
    type?: 'IN' | 'OUT' | 'TRANSFER'
    from?: string
    to?: string
    earmarkId?: number
    budgetId?: number
    q?: string
    tag?: string
}) {
    const d = getDb()
    const { limit = 20, offset = 0, sort = 'DESC', sortBy, paymentMethod, sphere, type, from, to, earmarkId, budgetId, q, tag } = filters
    let sql = `SELECT v.id, v.voucher_no as voucherNo, v.date, v.type, v.sphere, v.payment_method as paymentMethod, v.transfer_from as transferFrom, v.transfer_to as transferTo,
                                        v.payment_account_id as paymentAccountId,
                                        v.transfer_from_account_id as transferFromAccountId,
                                        v.transfer_to_account_id as transferToAccountId,
                                        (SELECT pa.name FROM payment_accounts pa WHERE pa.id = v.payment_account_id) as paymentAccountName,
                                        (SELECT pa.kind FROM payment_accounts pa WHERE pa.id = v.payment_account_id) as paymentAccountKind,
                                        (SELECT pa.color FROM payment_accounts pa WHERE pa.id = v.payment_account_id) as paymentAccountColor,
                                        (SELECT pa.name FROM payment_accounts pa WHERE pa.id = v.transfer_from_account_id) as transferFromAccountName,
                                        (SELECT pa.kind FROM payment_accounts pa WHERE pa.id = v.transfer_from_account_id) as transferFromAccountKind,
                                        (SELECT pa.color FROM payment_accounts pa WHERE pa.id = v.transfer_from_account_id) as transferFromAccountColor,
                                        (SELECT pa.name FROM payment_accounts pa WHERE pa.id = v.transfer_to_account_id) as transferToAccountName,
                                        (SELECT pa.kind FROM payment_accounts pa WHERE pa.id = v.transfer_to_account_id) as transferToAccountKind,
                                        (SELECT pa.color FROM payment_accounts pa WHERE pa.id = v.transfer_to_account_id) as transferToAccountColor,
                                        v.description, v.note, v.counterparty,
                                        v.net_amount as netAmount, v.vat_rate as vatRate, v.vat_amount as vatAmount, v.gross_amount as grossAmount, v.amount_mode as amountMode,
                                        v.original_id as originalId,
                                        (SELECT ov.voucher_no FROM vouchers ov WHERE ov.id = v.original_id) as originalVoucherNo,
                                        v.reversed_by_id as reversedById,
                                        (SELECT rv.voucher_no FROM vouchers rv WHERE rv.id = v.reversed_by_id) as reversedByVoucherNo,
                                        (SELECT COUNT(1) FROM voucher_files vf WHERE vf.voucher_id = v.id) as fileCount,
                                        v.earmark_id as earmarkId,
                                        v.earmark_amount as earmarkAmount,
                                        (SELECT e.code FROM earmarks e WHERE e.id = v.earmark_id) as earmarkCode,
                                        v.budget_id as budgetId,
                                        v.budget_amount as budgetAmount,
                                        (
                                            SELECT CASE
                                                WHEN b.name IS NOT NULL AND b.name <> '' THEN b.name
                                                WHEN b.category_name IS NOT NULL AND b.category_name <> '' THEN printf('%04d-%s-%s', b.year, b.sphere, b.category_name)
                                                WHEN b.project_name IS NOT NULL AND b.project_name <> '' THEN printf('%04d-%s-%s', b.year, b.sphere, b.project_name)
                                                ELSE printf('%04d-%s-%s', v.year, v.sphere, COALESCE(b.category_id, COALESCE(b.project_id, COALESCE(b.earmark_id, ''))))
                                            END FROM budgets b WHERE b.id = v.budget_id
                                        ) as budgetLabel,
                                        (SELECT b.color FROM budgets b WHERE b.id = v.budget_id) as budgetColor,
                                        (
                                            SELECT GROUP_CONCAT(t.name, '\u0001')
                                            FROM voucher_tags vt JOIN tags t ON t.id = vt.tag_id
                                            WHERE vt.voucher_id = v.id
                                        ) as tagsConcat
                         FROM vouchers v`
    const params: any[] = []
    const wh: string[] = []
    if (paymentMethod) { wh.push('(v.payment_method = ? OR (v.type = \'TRANSFER\' AND (v.transfer_from = ? OR v.transfer_to = ?)))'); params.push(paymentMethod, paymentMethod, paymentMethod) }
    if (sphere) { wh.push('v.sphere = ?'); params.push(sphere) }
    if (type) { wh.push('v.type = ?'); params.push(type) }
    if (from) { wh.push('v.date >= ?'); params.push(from) }
    if (to) { wh.push('v.date <= ?'); params.push(to) }
    if (earmarkId) { wh.push('v.earmark_id = ?'); params.push(earmarkId) }
    if (budgetId) { wh.push('v.budget_id = ?'); params.push(budgetId) }
    {
        const nq = normalizeVoucherSearchQuery(q)
        if (nq) {
            const like = `%${nq.text}%`
            if (nq.id != null) {
                wh.push('(v.id = ? OR v.voucher_no LIKE ? OR v.description LIKE ? OR v.counterparty LIKE ? OR v.date LIKE ?)')
                params.push(nq.id, like, like, like, like)
            } else {
                wh.push('(v.voucher_no LIKE ? OR v.description LIKE ? OR v.counterparty LIKE ? OR v.date LIKE ?)')
                params.push(like, like, like, like)
            }
        }
    }
    if (tag) {
        sql += ' JOIN voucher_tags vt ON vt.voucher_id = v.id JOIN tags t ON t.id = vt.tag_id'
        wh.push('t.name = ?')
        params.push(tag)
    }
    if (wh.length) sql += ' WHERE ' + wh.join(' AND ')
    const dir = (sort === 'ASC' ? 'ASC' : 'DESC')
    // Map sort key to SQL expression (include aliases from SELECT)
    const orderExpr = (() => {
        switch (sortBy) {
            case 'gross': return 'v.gross_amount'
            case 'net': return 'v.net_amount'
            case 'attachments': return 'fileCount'
            case 'budget': return 'budgetLabel COLLATE NOCASE'
            case 'earmark': return 'earmarkCode COLLATE NOCASE'
            case 'payment': return 'v.payment_method COLLATE NOCASE'
            case 'sphere': return 'v.sphere'
            case 'date': default: return 'v.date'
        }
    })()
    sql += ` ORDER BY ${orderExpr} ${dir}, v.id ${dir} LIMIT ? OFFSET ?`
    params.push(limit, offset)
    const rows = d.prepare(sql).all(...params) as any[]
    // Map concatenated tags to array
    return rows.map(r => ({ ...r, tags: (r as any).tagsConcat ? String((r as any).tagsConcat).split('\u0001') : [] }))
}

export function listVouchersAdvancedPaged(filters: {
    limit?: number
    offset?: number
    sort?: 'ASC' | 'DESC'
    // Extended sort keys
    sortBy?: 'date' | 'gross' | 'net' | 'attachments' | 'budget' | 'earmark' | 'payment' | 'sphere'
    paymentMethod?: 'BAR' | 'BANK'
    sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
    type?: 'IN' | 'OUT' | 'TRANSFER'
    from?: string
    to?: string
    earmarkId?: number
    budgetId?: number
    voucherIds?: number[]
    q?: string
    tag?: string
}): { rows: any[]; total: number } {
    const d = getDb()
    const { limit = 20, offset = 0, sort = 'DESC', sortBy, paymentMethod, paymentAccountId, sphere, type, from, to, earmarkId, budgetId, voucherIds, q, tag } = filters
    const params: any[] = []
    const wh: string[] = []
    if (paymentMethod) { wh.push('(v.payment_method = ? OR (v.type = \'TRANSFER\' AND (v.transfer_from = ? OR v.transfer_to = ?)))'); params.push(paymentMethod, paymentMethod, paymentMethod) }
    if (paymentAccountId) { wh.push('(v.payment_account_id = ? OR (v.type = \'TRANSFER\' AND (v.transfer_from_account_id = ? OR v.transfer_to_account_id = ?)))'); params.push(paymentAccountId, paymentAccountId, paymentAccountId) }
    if (sphere) { wh.push('v.sphere = ?'); params.push(sphere) }
    if (type) { wh.push('v.type = ?'); params.push(type) }
    if (from) { wh.push('v.date >= ?'); params.push(from) }
    if (to) { wh.push('v.date <= ?'); params.push(to) }
    if (earmarkId) { wh.push('v.earmark_id = ?'); params.push(earmarkId) }
    if (budgetId) { wh.push('v.budget_id = ?'); params.push(budgetId) }
    if (voucherIds?.length) {
        wh.push(`v.id IN (${voucherIds.map(() => '?').join(', ')})`)
        params.push(...voucherIds)
    }
    {
        const nq = normalizeVoucherSearchQuery(q)
        if (nq) {
            const like = `%${nq.text}%`
            if (nq.id != null) {
                wh.push('(v.id = ? OR v.voucher_no LIKE ? OR v.description LIKE ? OR v.counterparty LIKE ? OR v.date LIKE ?)')
                params.push(nq.id, like, like, like, like)
            } else {
                wh.push('(v.voucher_no LIKE ? OR v.description LIKE ? OR v.counterparty LIKE ? OR v.date LIKE ?)')
                params.push(like, like, like, like)
            }
        }
    }
    let joinSql = ''
    if (tag) {
        joinSql = ' JOIN voucher_tags vt ON vt.voucher_id = v.id JOIN tags t ON t.id = vt.tag_id'
        wh.push('t.name = ?')
        params.push(tag)
    }
    const whereSql = wh.length ? ' WHERE ' + wh.join(' AND ') : ''
    const total = (d.prepare(`SELECT COUNT(1) as c FROM vouchers v${joinSql}${whereSql}`).get(...params) as any)?.c || 0
    // Determine ORDER BY expression
    const orderExpr = (() => {
        switch (sortBy) {
            case 'gross': return 'v.gross_amount'
            case 'net': return 'v.net_amount'
            case 'attachments': return 'fileCount'
            case 'budget': return 'budgetLabel COLLATE NOCASE'
            case 'earmark': return 'earmarkCode COLLATE NOCASE'
            case 'payment': return 'v.payment_method COLLATE NOCASE'
            case 'sphere': return 'v.sphere'
            case 'date': default: return 'v.date'
        }
    })()
    const rows = d.prepare(
        `SELECT v.id, v.voucher_no as voucherNo, v.date, v.type, v.sphere, v.payment_method as paymentMethod, v.transfer_from as transferFrom, v.transfer_to as transferTo,
            v.payment_account_id as paymentAccountId,
            v.transfer_from_account_id as transferFromAccountId,
            v.transfer_to_account_id as transferToAccountId,
            (SELECT pa.name FROM payment_accounts pa WHERE pa.id = v.payment_account_id) as paymentAccountName,
            (SELECT pa.kind FROM payment_accounts pa WHERE pa.id = v.payment_account_id) as paymentAccountKind,
            (SELECT pa.color FROM payment_accounts pa WHERE pa.id = v.payment_account_id) as paymentAccountColor,
            (SELECT pa.name FROM payment_accounts pa WHERE pa.id = v.transfer_from_account_id) as transferFromAccountName,
            (SELECT pa.kind FROM payment_accounts pa WHERE pa.id = v.transfer_from_account_id) as transferFromAccountKind,
            (SELECT pa.color FROM payment_accounts pa WHERE pa.id = v.transfer_from_account_id) as transferFromAccountColor,
            (SELECT pa.name FROM payment_accounts pa WHERE pa.id = v.transfer_to_account_id) as transferToAccountName,
            (SELECT pa.kind FROM payment_accounts pa WHERE pa.id = v.transfer_to_account_id) as transferToAccountKind,
            (SELECT pa.color FROM payment_accounts pa WHERE pa.id = v.transfer_to_account_id) as transferToAccountColor,
            v.description, v.note, v.counterparty,
            v.net_amount as netAmount, v.vat_rate as vatRate, v.vat_amount as vatAmount, v.gross_amount as grossAmount, v.amount_mode as amountMode,
                v.original_id as originalId,
                (SELECT ov.voucher_no FROM vouchers ov WHERE ov.id = v.original_id) as originalVoucherNo,
                v.reversed_by_id as reversedById,
                (SELECT rv.voucher_no FROM vouchers rv WHERE rv.id = v.reversed_by_id) as reversedByVoucherNo,
                EXISTS(SELECT 1 FROM cash_checks cc WHERE cc.voucher_id = v.id) as isCashCheck,
            EXISTS(SELECT 1 FROM member_advances ma WHERE ma.placeholder_voucher_id = v.id AND (ma.resolved_at IS NULL OR ma.resolved_at = '')) as isAdvancePlaceholder,
                (SELECT COUNT(1) FROM voucher_files vf WHERE vf.voucher_id = v.id) as fileCount,
                v.earmark_id as earmarkId,
                v.earmark_amount as earmarkAmount,
                (SELECT e.code FROM earmarks e WHERE e.id = v.earmark_id) as earmarkCode,
                v.budget_id as budgetId,
                v.budget_amount as budgetAmount,
                (
                    SELECT CASE
                        WHEN b.name IS NOT NULL AND b.name <> '' THEN b.name
                        WHEN b.category_name IS NOT NULL AND b.category_name <> '' THEN printf('%04d-%s-%s', b.year, b.sphere, b.category_name)
                        WHEN b.project_name IS NOT NULL AND b.project_name <> '' THEN printf('%04d-%s-%s', b.year, b.sphere, b.project_name)
                        ELSE printf('%04d-%s-%s', v.year, v.sphere, COALESCE(b.category_id, COALESCE(b.project_id, COALESCE(b.earmark_id, ''))))
                    END FROM budgets b WHERE b.id = v.budget_id
                ) as budgetLabel,
                (SELECT b.color FROM budgets b WHERE b.id = v.budget_id) as budgetColor,
                (
                    SELECT GROUP_CONCAT(t.name, '\u0001')
                    FROM voucher_tags vt JOIN tags t ON t.id = vt.tag_id
                    WHERE vt.voucher_id = v.id
                ) as tagsConcat
         FROM vouchers v${joinSql}${whereSql}
         ORDER BY ${orderExpr} ${sort === 'ASC' ? 'ASC' : 'DESC'}, v.id ${sort === 'ASC' ? 'ASC' : 'DESC'}
         LIMIT ? OFFSET ?`
    ).all(...params, limit, offset) as any[]
    const mapped = rows.map(r => ({
        ...r,
        isCashCheck: !!(r as any).isCashCheck,
        isAdvancePlaceholder: !!(r as any).isAdvancePlaceholder,
        tags: (r as any).tagsConcat ? String((r as any).tagsConcat).split('\u0001') : []
    }))
    return { rows: mapped, total }
}

// Batch-assign an earmarkId to vouchers matching filters
export function batchAssignEarmark(params: {
    earmarkId: number
    paymentMethod?: 'BAR' | 'BANK'
    sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
    type?: 'IN' | 'OUT' | 'TRANSFER'
    from?: string
    to?: string
    q?: string
    onlyWithout?: boolean // when true, only rows where earmark_id IS NULL
}) {
    const d = getDb()
    const wh: string[] = []
    const args: any[] = []
    wh.push('original_id IS NULL AND reversed_by_id IS NULL')
    if (params.paymentMethod) { wh.push('(payment_method = ? OR (type = \'TRANSFER\' AND (transfer_from = ? OR transfer_to = ?)))'); args.push(params.paymentMethod, params.paymentMethod, params.paymentMethod) }
    if (params.sphere) { wh.push('sphere = ?'); args.push(params.sphere) }
    if (params.type) { wh.push('type = ?'); args.push(params.type) }
    if (params.from) { wh.push('date >= ?'); args.push(params.from) }
    if (params.to) { wh.push('date <= ?'); args.push(params.to) }
    {
        const nq = normalizeVoucherSearchQuery(params.q)
        if (nq) {
            const like = `%${nq.text}%`
            if (nq.id != null) {
                wh.push('(id = ? OR voucher_no LIKE ? OR description LIKE ? OR counterparty LIKE ? OR date LIKE ?)')
                args.push(nq.id, like, like, like, like)
            } else {
                wh.push('(voucher_no LIKE ? OR description LIKE ? OR counterparty LIKE ? OR date LIKE ?)')
                args.push(like, like, like, like)
            }
        }
    }
    if (params.onlyWithout) wh.push('earmark_id IS NULL')
    const whereSql = wh.length ? ' WHERE ' + wh.join(' AND ') : ''

    // Validate earmark exists and active
    const em = d.prepare('SELECT id, is_active as isActive FROM earmarks WHERE id=?').get(params.earmarkId) as any
    if (!em) throw new Error('Zweckbindung nicht gefunden')
    if (!em.isActive) throw new Error('Zweckbindung ist inaktiv und kann nicht verwendet werden')

    const res = d.prepare(`UPDATE vouchers SET earmark_id = ?${whereSql}`).run(params.earmarkId, ...args)
    const updated = Number(res.changes || 0)
    
    // Log batch assignment to audit
    if (updated > 0) {
        const earmarkInfo = d.prepare('SELECT code, name FROM earmarks WHERE id=?').get(params.earmarkId) as any
        writeAudit(
            d,
            null,
            'VOUCHER',
            0,
            'BATCH_ASSIGN_EARMARK',
            { earmarkId: params.earmarkId, earmarkCode: earmarkInfo?.code, earmarkName: earmarkInfo?.name, count: updated, filters: params }
        )
    }
    
    return { updated }
}

// Batch-assign a budgetId to vouchers matching filters
export function batchAssignBudget(params: {
    budgetId: number
    paymentMethod?: 'BAR' | 'BANK'
    sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
    type?: 'IN' | 'OUT' | 'TRANSFER'
    from?: string
    to?: string
    q?: string
    onlyWithout?: boolean
}) {
    const d = getDb()
    const wh: string[] = []
    const args: any[] = []
    wh.push('original_id IS NULL AND reversed_by_id IS NULL')
    if (params.paymentMethod) { wh.push('(payment_method = ? OR (type = \'TRANSFER\' AND (transfer_from = ? OR transfer_to = ?)))'); args.push(params.paymentMethod, params.paymentMethod, params.paymentMethod) }
    if (params.sphere) { wh.push('sphere = ?'); args.push(params.sphere) }
    if (params.type) { wh.push('type = ?'); args.push(params.type) }
    if (params.from) { wh.push('date >= ?'); args.push(params.from) }
    if (params.to) { wh.push('date <= ?'); args.push(params.to) }
    {
        const nq = normalizeVoucherSearchQuery(params.q)
        if (nq) {
            const like = `%${nq.text}%`
            if (nq.id != null) {
                wh.push('(id = ? OR voucher_no LIKE ? OR description LIKE ? OR counterparty LIKE ? OR date LIKE ?)')
                args.push(nq.id, like, like, like, like)
            } else {
                wh.push('(voucher_no LIKE ? OR description LIKE ? OR counterparty LIKE ? OR date LIKE ?)')
                args.push(like, like, like, like)
            }
        }
    }
    if (params.onlyWithout) wh.push('budget_id IS NULL')
    const whereSql = wh.length ? ' WHERE ' + wh.join(' AND ') : ''

    // Validate budget exists
    const b = d.prepare('SELECT id FROM budgets WHERE id=?').get(params.budgetId) as any
    if (!b) throw new Error('Budget nicht gefunden')
    const res = d.prepare(`UPDATE vouchers SET budget_id = ?${whereSql}`).run(params.budgetId, ...args)
    const updated = Number(res.changes || 0)
    
    // Log batch assignment to audit
    if (updated > 0) {
        const budgetInfo = d.prepare('SELECT name, year FROM budgets WHERE id=?').get(params.budgetId) as any
        writeAudit(
            d,
            null,
            'VOUCHER',
            0,
            'BATCH_ASSIGN_BUDGET',
            { budgetId: params.budgetId, budgetName: budgetInfo?.name, budgetYear: budgetInfo?.year, count: updated, filters: params }
        )
    }
    
    return { updated }
}

// Batch-assign tags to vouchers matching filters (adds tags, does not remove existing)
export function batchAssignTags(params: {
    tags: string[]
    paymentMethod?: 'BAR' | 'BANK'
    sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
    type?: 'IN' | 'OUT' | 'TRANSFER'
    from?: string
    to?: string
    q?: string
}) {
    const d = getDb()
    const wh: string[] = []
    const args: any[] = []
    wh.push('original_id IS NULL AND reversed_by_id IS NULL')
    if (params.paymentMethod) { wh.push('(payment_method = ? OR (type = \'TRANSFER\' AND (transfer_from = ? OR transfer_to = ?)))'); args.push(params.paymentMethod, params.paymentMethod, params.paymentMethod) }
    if (params.sphere) { wh.push('sphere = ?'); args.push(params.sphere) }
    if (params.type) { wh.push('type = ?'); args.push(params.type) }
    if (params.from) { wh.push('date >= ?'); args.push(params.from) }
    if (params.to) { wh.push('date <= ?'); args.push(params.to) }
    {
        const nq = normalizeVoucherSearchQuery(params.q)
        if (nq) {
            const like = `%${nq.text}%`
            if (nq.id != null) {
                wh.push('(id = ? OR voucher_no LIKE ? OR description LIKE ? OR counterparty LIKE ? OR date LIKE ?)')
                args.push(nq.id, like, like, like, like)
            } else {
                wh.push('(voucher_no LIKE ? OR description LIKE ? OR counterparty LIKE ? OR date LIKE ?)')
                args.push(like, like, like, like)
            }
        }
    }
    const whereSql = wh.length ? ' WHERE ' + wh.join(' AND ') : ''
    // Collect voucher ids
    const ids = (d.prepare(`SELECT id FROM vouchers${whereSql}`).all(...args) as any[]).map(r => r.id)
    if (!ids.length) return { updated: 0 }
    const tagIds: number[] = []
    for (const nameRaw of params.tags) {
        const name = String(nameRaw || '').trim()
        if (!name) continue
        const tag = ensureTag(d, name)
        if (tag?.id) tagIds.push(tag.id)
    }
    if (!tagIds.length) return { updated: 0 }
    const stmt = d.prepare('INSERT OR IGNORE INTO voucher_tags(voucher_id, tag_id) VALUES (?, ?)')
    let count = 0
    for (const vid of ids) {
        for (const tid of tagIds) {
            const r = stmt.run(vid, tid)
            count += Number(r.changes || 0)
        }
    }
    // updated = number of vouchers touched (approximate: unique vids with at least one insert)
    const updated = ids.length
    
    // Log batch assignment to audit
    if (updated > 0) {
        writeAudit(
            d,
            null,
            'VOUCHER',
            0,
            'BATCH_ASSIGN_TAGS',
            { tags: params.tags, count: updated, filters: params }
        )
    }
    
    return { updated }
}

export function summarizeVouchers(filters: {
    paymentMethod?: 'BAR' | 'BANK'
    paymentAccountId?: number | null
    sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
    type?: 'IN' | 'OUT' | 'TRANSFER'
    from?: string
    to?: string
    earmarkId?: number
    budgetId?: number
    q?: string
    tag?: string
}) {
    const d = getDb()
    const { paymentMethod, paymentAccountId, sphere, type, from, to, earmarkId, budgetId, q, tag } = filters
    const normalizedPaymentAccountId = paymentAccountId != null ? Number(paymentAccountId) : null
    const paramsBase: any[] = []
    const wh: string[] = []
    let joinSql = ''
    if (paymentMethod) { wh.push('(v.payment_method = ? OR (v.type = \'TRANSFER\' AND (v.transfer_from = ? OR v.transfer_to = ?)))'); paramsBase.push(paymentMethod, paymentMethod, paymentMethod) }
    if (normalizedPaymentAccountId) { wh.push('(v.payment_account_id = ? OR (v.type = \'TRANSFER\' AND (v.transfer_from_account_id = ? OR v.transfer_to_account_id = ?)))'); paramsBase.push(normalizedPaymentAccountId, normalizedPaymentAccountId, normalizedPaymentAccountId) }
    if (sphere) { wh.push('v.sphere = ?'); paramsBase.push(sphere) }
    // When both type and paymentMethod are active, include TRANSFERs that act as
    // the requested type for this payment method (e.g. transfer_to=pm → IN).
    if (type && normalizedPaymentAccountId && (type === 'IN' || type === 'OUT')) {
        if (type === 'IN') {
            wh.push(`(v.type = 'IN' OR (v.type = 'TRANSFER' AND v.transfer_to_account_id = ?))`)
            paramsBase.push(normalizedPaymentAccountId)
        } else {
            wh.push(`(v.type = 'OUT' OR (v.type = 'TRANSFER' AND v.transfer_from_account_id = ?))`)
            paramsBase.push(normalizedPaymentAccountId)
        }
    } else if (type && paymentMethod && (type === 'IN' || type === 'OUT')) {
        if (type === 'IN') {
            wh.push(`(v.type = 'IN' OR (v.type = 'TRANSFER' AND v.transfer_to = ?))`)
            paramsBase.push(paymentMethod)
        } else {
            wh.push(`(v.type = 'OUT' OR (v.type = 'TRANSFER' AND v.transfer_from = ?))`)
            paramsBase.push(paymentMethod)
        }
    } else if (type) { wh.push('v.type = ?'); paramsBase.push(type) }
    if (from) { wh.push('v.date >= ?'); paramsBase.push(from) }
    if (to) { wh.push('v.date <= ?'); paramsBase.push(to) }
    if (earmarkId != null) { wh.push('v.earmark_id = ?'); paramsBase.push(earmarkId) }
    if (budgetId != null) { wh.push('v.budget_id = ?'); paramsBase.push(budgetId) }
    {
        const nq = normalizeVoucherSearchQuery(q)
        if (nq) {
            const like = `%${nq.text}%`
            if (nq.id != null) {
                wh.push('(v.id = ? OR v.voucher_no LIKE ? OR v.description LIKE ? OR v.counterparty LIKE ? OR v.date LIKE ? )')
                paramsBase.push(nq.id, like, like, like, like)
            } else {
                wh.push('(v.voucher_no LIKE ? OR v.description LIKE ? OR v.counterparty LIKE ? OR v.date LIKE ? )')
                paramsBase.push(like, like, like, like)
            }
        }
    }
    if (tag) {
        joinSql = ' JOIN voucher_tags vt ON vt.voucher_id = v.id JOIN tags t ON t.id = vt.tag_id'
        wh.push('t.name = ?')
        paramsBase.push(tag)
    }
    const whereSql = wh.length ? ' WHERE ' + wh.join(' AND ') : ''

    // When paymentMethod filter is active, remap transfer direction via type:
    // transfer_from = pm → treated as OUT (money leaves this Zahlweg)
    // transfer_to = pm → treated as IN (money enters this Zahlweg)
    // Amounts stay positive (same convention as regular IN/OUT vouchers in the DB).
    const pmAdjustedType = paymentMethod
        ? `CASE WHEN v.type = 'TRANSFER' AND v.transfer_from = '${paymentMethod}' THEN 'OUT' WHEN v.type = 'TRANSFER' AND v.transfer_to = '${paymentMethod}' THEN 'IN' ELSE v.type END`
        : normalizedPaymentAccountId
            ? `CASE WHEN v.type = 'TRANSFER' AND v.transfer_from_account_id = ${normalizedPaymentAccountId} THEN 'OUT' WHEN v.type = 'TRANSFER' AND v.transfer_to_account_id = ${normalizedPaymentAccountId} THEN 'IN' ELSE v.type END`
        : 'v.type'

    const totals = d.prepare(`
        SELECT
            IFNULL(SUM(v.net_amount), 0) as net,
            IFNULL(SUM(v.vat_amount), 0) as vat,
            IFNULL(SUM(v.gross_amount), 0) as gross
        FROM vouchers v${joinSql}${whereSql}
    `).get(...paramsBase) as any

    const bySphere = d.prepare(`
        SELECT v.sphere as key,
               IFNULL(SUM(v.net_amount), 0) as net,
               IFNULL(SUM(v.vat_amount), 0) as vat,
               IFNULL(SUM(v.gross_amount), 0) as gross
        FROM vouchers v${joinSql}${whereSql}
        GROUP BY v.sphere
        ORDER BY v.sphere
    `).all(...paramsBase) as any[]

    let byPaymentMethod: any[]
    if (paymentMethod) {
        // When paymentMethod filter is active, all matched vouchers belong to that pm
        byPaymentMethod = d.prepare(`
            SELECT '${paymentMethod}' as key,
                   IFNULL(SUM(v.net_amount), 0) as net,
                   IFNULL(SUM(v.vat_amount), 0) as vat,
                   IFNULL(SUM(v.gross_amount), 0) as gross
            FROM vouchers v${joinSql}${whereSql}
            GROUP BY key
            ORDER BY key IS NULL, key
        `).all(...paramsBase) as any[]
    } else {
        // Without filter: use CTE to correctly split TRANSFER amounts between
        // their source (transfer_from) and destination (transfer_to) payment methods
        byPaymentMethod = d.prepare(`
            WITH filtered AS (
                SELECT v.payment_method, v.type, v.transfer_from, v.transfer_to,
                       v.net_amount, v.vat_amount, v.gross_amount
                FROM vouchers v${joinSql}${whereSql}
            )
            SELECT pm as key,
                   IFNULL(SUM(net_amount), 0) as net,
                   IFNULL(SUM(vat_amount), 0) as vat,
                   IFNULL(SUM(gross_amount), 0) as gross
            FROM (
                SELECT CASE WHEN type != 'TRANSFER' THEN payment_method ELSE transfer_from END as pm,
                       net_amount, vat_amount, gross_amount
                FROM filtered
                UNION ALL
                SELECT transfer_to as pm, net_amount, vat_amount, gross_amount
                FROM filtered WHERE type = 'TRANSFER'
            ) sub
            GROUP BY pm
            ORDER BY pm IS NULL, pm
        `).all(...paramsBase) as any[]
    }

    const byPaymentAccount = d.prepare(`
        WITH filtered AS (
            SELECT v.payment_account_id, v.type, v.transfer_from_account_id, v.transfer_to_account_id,
                   v.net_amount, v.vat_amount, v.gross_amount
            FROM vouchers v${joinSql}${whereSql}
        )
        SELECT sub.account_id as accountId,
               COALESCE(pa.name, 'Ohne Konto') as key,
               pa.kind as kind,
               pa.color as color,
               IFNULL(SUM(sub.net_amount), 0) as net,
               IFNULL(SUM(sub.vat_amount), 0) as vat,
               IFNULL(SUM(sub.gross_amount), 0) as gross
        FROM (
            SELECT CASE WHEN type != 'TRANSFER' THEN payment_account_id ELSE transfer_from_account_id END as account_id,
                   net_amount, vat_amount, gross_amount
            FROM filtered
            UNION ALL
            SELECT transfer_to_account_id as account_id, net_amount, vat_amount, gross_amount
            FROM filtered WHERE type = 'TRANSFER'
        ) sub
        LEFT JOIN payment_accounts pa ON pa.id = sub.account_id
        GROUP BY sub.account_id, pa.name, pa.kind, pa.color, pa.sort_order
        ORDER BY sub.account_id IS NULL, pa.sort_order, pa.name
    `).all(...paramsBase) as any[]

    const byType = d.prepare(`
        SELECT ${pmAdjustedType} as key,
               IFNULL(SUM(v.net_amount), 0) as net,
               IFNULL(SUM(v.vat_amount), 0) as vat,
               IFNULL(SUM(v.gross_amount), 0) as gross
        FROM vouchers v${joinSql}${whereSql}
        GROUP BY ${pmAdjustedType}
        ORDER BY ${pmAdjustedType}
    `).all(...paramsBase) as any[]

    return { totals, bySphere, byPaymentMethod, byPaymentAccount, byType }
}

export function monthlyVouchers(filters: {
    from?: string
    to?: string
    paymentMethod?: 'BAR' | 'BANK'
    sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
    type?: 'IN' | 'OUT' | 'TRANSFER'
    earmarkId?: number
    budgetId?: number
}) {
    const d = getDb()
    const { from, to, paymentMethod, sphere, type, earmarkId, budgetId } = filters
    const params: any[] = []
    const wh: string[] = []
    if (from) { wh.push('date >= ?'); params.push(from) }
    if (to) { wh.push('date <= ?'); params.push(to) }
    if (paymentMethod) { wh.push('(payment_method = ? OR (type = \'TRANSFER\' AND (transfer_from = ? OR transfer_to = ?)))'); params.push(paymentMethod, paymentMethod, paymentMethod) }
    if (sphere) { wh.push('sphere = ?'); params.push(sphere) }
    // When both type and paymentMethod are active, include TRANSFERs that act as
    // the requested type for this payment method (e.g. transfer_to=pm → IN).
    if (type && paymentMethod && (type === 'IN' || type === 'OUT')) {
        if (type === 'IN') {
            wh.push(`(type = 'IN' OR (type = 'TRANSFER' AND transfer_to = ?))`)
            params.push(paymentMethod)
        } else {
            wh.push(`(type = 'OUT' OR (type = 'TRANSFER' AND transfer_from = ?))`)
            params.push(paymentMethod)
        }
    } else if (type) { wh.push('type = ?'); params.push(type) }
    if (earmarkId != null) { wh.push('earmark_id = ?'); params.push(earmarkId) }
    if (budgetId != null) { wh.push('budget_id = ?'); params.push(budgetId) }
    const whereSql = wh.length ? ' WHERE ' + wh.join(' AND ') : ''
    // When paymentMethod is active, remap transfers: transfer_from=pm → outflow, transfer_to=pm → inflow
    const netExpr = paymentMethod
        ? `CASE WHEN type = 'IN' THEN net_amount WHEN type = 'OUT' THEN -net_amount WHEN type = 'TRANSFER' AND transfer_from = '${paymentMethod}' THEN -ABS(net_amount) WHEN type = 'TRANSFER' AND transfer_to = '${paymentMethod}' THEN ABS(net_amount) ELSE 0 END`
        : `CASE WHEN type = 'IN' THEN net_amount WHEN type = 'OUT' THEN -net_amount ELSE 0 END`
    const vatExpr = paymentMethod
        ? `CASE WHEN type = 'IN' THEN vat_amount WHEN type = 'OUT' THEN -vat_amount WHEN type = 'TRANSFER' AND transfer_from = '${paymentMethod}' THEN -ABS(vat_amount) WHEN type = 'TRANSFER' AND transfer_to = '${paymentMethod}' THEN ABS(vat_amount) ELSE 0 END`
        : `CASE WHEN type = 'IN' THEN vat_amount WHEN type = 'OUT' THEN -vat_amount ELSE 0 END`
    const grossExpr = paymentMethod
        ? `CASE WHEN type = 'IN' THEN gross_amount WHEN type = 'OUT' THEN -gross_amount WHEN type = 'TRANSFER' AND transfer_from = '${paymentMethod}' THEN -ABS(gross_amount) WHEN type = 'TRANSFER' AND transfer_to = '${paymentMethod}' THEN ABS(gross_amount) ELSE 0 END`
        : `CASE WHEN type = 'IN' THEN gross_amount WHEN type = 'OUT' THEN -gross_amount ELSE 0 END`
    const rows = d.prepare(`
        SELECT strftime('%Y-%m', date) as month,
               IFNULL(SUM(${netExpr}), 0) as net,
               IFNULL(SUM(${vatExpr}), 0) as vat,
               IFNULL(SUM(${grossExpr}), 0) as gross
        FROM vouchers${whereSql}
        GROUP BY strftime('%Y-%m', date)
        ORDER BY month ASC
    `).all(...params) as any[]
    return rows
}

export function dailyVouchers(filters: {
    from?: string
    to?: string
    paymentMethod?: 'BAR' | 'BANK'
    sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
    type?: 'IN' | 'OUT' | 'TRANSFER'
    earmarkId?: number
    budgetId?: number
}) {
    const d = getDb()
    const { from, to, paymentMethod, sphere, type, earmarkId, budgetId } = filters
    const params: any[] = []
    const wh: string[] = []
    if (from) { wh.push('date >= ?'); params.push(from) }
    if (to) { wh.push('date <= ?'); params.push(to) }
    if (paymentMethod) { wh.push('(payment_method = ? OR (type = \'TRANSFER\' AND (transfer_from = ? OR transfer_to = ?)))'); params.push(paymentMethod, paymentMethod, paymentMethod) }
    if (sphere) { wh.push('sphere = ?'); params.push(sphere) }
    // When both type and paymentMethod are active, include TRANSFERs that act as
    // the requested type for this payment method (e.g. transfer_to=pm → IN).
    if (type && paymentMethod && (type === 'IN' || type === 'OUT')) {
        if (type === 'IN') {
            wh.push(`(type = 'IN' OR (type = 'TRANSFER' AND transfer_to = ?))`)
            params.push(paymentMethod)
        } else {
            wh.push(`(type = 'OUT' OR (type = 'TRANSFER' AND transfer_from = ?))`)
            params.push(paymentMethod)
        }
    } else if (type) { wh.push('type = ?'); params.push(type) }
    if (earmarkId != null) { wh.push('earmark_id = ?'); params.push(earmarkId) }
    if (budgetId != null) { wh.push('budget_id = ?'); params.push(budgetId) }
    const whereSql = wh.length ? ' WHERE ' + wh.join(' AND ') : ''
    // When paymentMethod is active, remap transfers: transfer_from=pm → outflow, transfer_to=pm → inflow
    const netExpr = paymentMethod
        ? `CASE WHEN type = 'IN' THEN net_amount WHEN type = 'OUT' THEN -net_amount WHEN type = 'TRANSFER' AND transfer_from = '${paymentMethod}' THEN -ABS(net_amount) WHEN type = 'TRANSFER' AND transfer_to = '${paymentMethod}' THEN ABS(net_amount) ELSE 0 END`
        : `CASE WHEN type = 'IN' THEN net_amount WHEN type = 'OUT' THEN -net_amount ELSE 0 END`
    const vatExpr = paymentMethod
        ? `CASE WHEN type = 'IN' THEN vat_amount WHEN type = 'OUT' THEN -vat_amount WHEN type = 'TRANSFER' AND transfer_from = '${paymentMethod}' THEN -ABS(vat_amount) WHEN type = 'TRANSFER' AND transfer_to = '${paymentMethod}' THEN ABS(vat_amount) ELSE 0 END`
        : `CASE WHEN type = 'IN' THEN vat_amount WHEN type = 'OUT' THEN -vat_amount ELSE 0 END`
    const grossExpr = paymentMethod
        ? `CASE WHEN type = 'IN' THEN gross_amount WHEN type = 'OUT' THEN -gross_amount WHEN type = 'TRANSFER' AND transfer_from = '${paymentMethod}' THEN -ABS(gross_amount) WHEN type = 'TRANSFER' AND transfer_to = '${paymentMethod}' THEN ABS(gross_amount) ELSE 0 END`
        : `CASE WHEN type = 'IN' THEN gross_amount WHEN type = 'OUT' THEN -gross_amount ELSE 0 END`
    const rows = d.prepare(`
        SELECT date,
               IFNULL(SUM(${netExpr}), 0) as net,
               IFNULL(SUM(${vatExpr}), 0) as vat,
               IFNULL(SUM(${grossExpr}), 0) as gross
        FROM vouchers${whereSql}
        GROUP BY date
        ORDER BY date ASC
    `).all(...params) as any[]
    return rows
}

export function updateVoucher(input: {
    id: number
    date?: string
    type?: 'IN' | 'OUT' | 'TRANSFER'
    sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
    description?: string | null
    note?: string | null
    paymentMethod?: 'BAR' | 'BANK' | null
    transferFrom?: 'BAR' | 'BANK' | null
    transferTo?: 'BAR' | 'BANK' | null
    paymentAccountId?: number | null
    transferFromAccountId?: number | null
    transferToAccountId?: number | null
    earmarkId?: number | null
    earmarkAmount?: number | null
    budgetId?: number | null
    budgetAmount?: number | null
    tags?: string[]
    netAmount?: number
    vatRate?: number
    grossAmount?: number
    amountMode?: 'NET' | 'GROSS'
}) {
    const d = getDb()
    const warnings: string[] = []
    const current = d.prepare(`
        SELECT id, year, seq_no as seqNo, voucher_no as voucherNo, date, type, sphere,
               net_amount as netAmount, vat_rate as vatRate, gross_amount as grossAmount,
               earmark_id as earmarkId, earmark_amount as earmarkAmount,
               budget_id as budgetId, budget_amount as budgetAmount,
               payment_account_id as paymentAccountId,
               transfer_from_account_id as transferFromAccountId,
               transfer_to_account_id as transferToAccountId,
               payment_method as paymentMethod, transfer_from as transferFrom, transfer_to as transferTo,
               description, note, amount_mode as amountMode,
               original_id as originalId, reversed_by_id as reversedById
        FROM vouchers WHERE id=?
    `).get(input.id) as any
    if (!current) throw new Error('Beleg nicht gefunden')
    if (current.originalId) throw new Error('Stornobuchungen sind fest mit der Originalbuchung verknüpft und können nicht bearbeitet werden.')
    if (current.reversedById) throw new Error('Diese Buchung wurde bereits storniert und kann nicht mehr bearbeitet werden.')
    // Capture tags before update for audit
    const beforeTags = getTagsForVoucher(input.id)
    const currentFull = { ...current, tags: beforeTags }

    // System lock: cash-check vouchers are audit-relevant and must not be editable
    const cashCheckRef = d.prepare('SELECT id FROM cash_checks WHERE voucher_id = ? LIMIT 1').get(input.id) as any
    if (cashCheckRef) throw new Error('Kassenprüfungsbuchungen sind systemgeneriert und können nicht bearbeitet werden.')

    const advancePlaceholderRef = getAdvancePlaceholderRef(d, input.id)
    if (advancePlaceholderRef) throw new Error('Vorschuss-Platzhalter sind systemgeneriert und können nicht bearbeitet werden.')

    // Enforce period lock for the voucher's existing date (block edits in closed year)
    ensurePeriodOpen(current.date, d)

    const newDate = input.date ?? current.date
    const newType = input.type ?? current.type
    const newEarmarkId = (input.earmarkId === undefined) ? current.earmarkId : input.earmarkId
    const newBudgetId = (input.budgetId === undefined) ? current.budgetId : input.budgetId
    const paymentFields = resolveVoucherPaymentFields(d, input, current)

    // Additional check when date actually changes (ensures new date is open too)
    if (input.date != null) ensurePeriodOpen(newDate, d)

    // Earmark validations if earmark set
    if (newEarmarkId != null) {
        const em = d.prepare('SELECT id, is_active as isActive, start_date as startDate, end_date as endDate, budget, enforce_time_range as enforceTimeRange FROM earmarks WHERE id=?').get(newEarmarkId) as any
        if (!em) throw new Error('Zweckbindung nicht gefunden')
        if (!em.isActive) throw new Error('Zweckbindung ist inaktiv und kann nicht verwendet werden')
        
        // Zeitraum-Prüfung nur wenn enforceTimeRange aktiv ist
        if (em.enforceTimeRange) {
            if (em.startDate && newDate < em.startDate) throw new Error(`Buchungsdatum liegt vor Beginn der Zweckbindung (${em.startDate})`)
            if (em.endDate && newDate > em.endDate) throw new Error(`Buchungsdatum liegt nach Ende der Zweckbindung (${em.endDate})`)
        }

        const cfg = (getSetting<{ allowNegative?: boolean }>('earmark', d) || { allowNegative: false })
        if (!cfg.allowNegative && newType === 'OUT') {
            const balRow = d.prepare(`
                SELECT
                  IFNULL(SUM(CASE WHEN v.type='IN' THEN ve.amount ELSE 0 END),0) as allocated,
                  IFNULL(SUM(CASE WHEN v.type='OUT' THEN ve.amount ELSE 0 END),0) as released
                FROM voucher_earmarks ve
                JOIN vouchers v ON v.id = ve.voucher_id
                WHERE ve.earmark_id = ? AND v.date <= ? AND v.id <> ?
            `).get(newEarmarkId, newDate, input.id) as any
            const balance = Math.round(((balRow.allocated || 0) - (balRow.released || 0)) * 100) / 100
            const budget = Number(em?.budget ?? 0) || 0
            const remaining = Math.round(((budget + balance) * 100)) / 100
            const wouldBe = Math.round(((remaining - (current.grossAmount || 0)) * 100)) / 100
            if (wouldBe < 0) warnings.push('Zweckbindung würde den verfügbaren Rahmen unterschreiten.')
        }
    }

    // Budget validations if budget set
    if (newBudgetId != null) {
        const budget = d.prepare('SELECT id, start_date as startDate, end_date as endDate, enforce_time_range as enforceTimeRange FROM budgets WHERE id=?').get(newBudgetId) as any
        if (!budget) throw new Error('Budget nicht gefunden')
        
        // Zeitraum-Prüfung nur wenn enforceTimeRange aktiv ist
        if (budget.enforceTimeRange) {
            if (budget.startDate && newDate < budget.startDate) throw new Error(`Buchungsdatum liegt vor Beginn des Budgets (${budget.startDate})`)
            if (budget.endDate && newDate > budget.endDate) throw new Error(`Buchungsdatum liegt nach Ende des Budgets (${budget.endDate})`)
        }
    }

    const fields: string[] = []
    const params: any[] = []
    if (input.date != null) { fields.push('date = ?'); params.push(input.date) }
    if (input.type != null) { fields.push('type = ?'); params.push(input.type) }
    if (input.sphere != null) { fields.push('sphere = ?'); params.push(input.sphere) }
    if (input.description !== undefined) { fields.push('description = ?'); params.push(input.description) }
    if (input.note !== undefined) { fields.push('note = ?'); params.push(input.note) }
    if (input.paymentMethod !== undefined || input.paymentAccountId !== undefined || input.type === 'TRANSFER' || current.type === 'TRANSFER') { fields.push('payment_method = ?'); params.push(paymentFields.paymentMethod) }
    if (input.earmarkId !== undefined) { fields.push('earmark_id = ?'); params.push(input.earmarkId) }
    if (input.earmarkAmount !== undefined) { fields.push('earmark_amount = ?'); params.push(input.earmarkAmount) }
    if (input.transferFrom !== undefined || input.transferFromAccountId !== undefined || input.type === 'TRANSFER' || current.type === 'TRANSFER') { fields.push('transfer_from = ?'); params.push(paymentFields.transferFrom) }
    if (input.transferTo !== undefined || input.transferToAccountId !== undefined || input.type === 'TRANSFER' || current.type === 'TRANSFER') { fields.push('transfer_to = ?'); params.push(paymentFields.transferTo) }
    if (input.paymentAccountId !== undefined || input.type !== undefined || current.type === 'TRANSFER') { fields.push('payment_account_id = ?'); params.push(paymentFields.paymentAccountId) }
    if (input.transferFromAccountId !== undefined || input.type !== undefined || current.type === 'TRANSFER') { fields.push('transfer_from_account_id = ?'); params.push(paymentFields.transferFromAccountId) }
    if (input.transferToAccountId !== undefined || input.type !== undefined || current.type === 'TRANSFER') { fields.push('transfer_to_account_id = ?'); params.push(paymentFields.transferToAccountId) }
    if (input.budgetId !== undefined) { fields.push('budget_id = ?'); params.push(input.budgetId) }
    if (input.budgetAmount !== undefined) { fields.push('budget_amount = ?'); params.push(input.budgetAmount) }
    if (input.amountMode !== undefined) { fields.push('amount_mode = ?'); params.push(input.amountMode) }
    // If sphere or year changes, re-number voucher (year, seq_no, voucher_no)
    const targetSphere = input.sphere ?? current.sphere
    const targetYear = Number(newDate?.slice(0, 4) || String(current.year))
    const sphereChanged = input.sphere != null && input.sphere !== current.sphere
    const yearChanged = Number(targetYear) !== Number(current.year)
    if (sphereChanged || yearChanged) {
        const seq = nextVoucherSequence(d as any, targetYear, targetSphere)
        const newNo = makeVoucherNo(targetYear, newDate, targetSphere, seq)
        fields.push('year = ?')
        params.push(targetYear)
        fields.push('seq_no = ?')
        params.push(seq)
        fields.push('voucher_no = ?')
        params.push(newNo)
        if (current.voucherNo && current.voucherNo !== newNo) warnings.push(`Belegnummer neu vergeben: ${current.voucherNo} → ${newNo}`)
    }

    // Amount updates (optional)
    let setAmounts = false
    if (input.grossAmount != null) {
        fields.push('gross_amount = ?')
        params.push(input.grossAmount)
        if (input.amountMode === undefined) {
            fields.push('amount_mode = ?')
            params.push('GROSS')
        }
        // If gross is provided, we don't infer net/vat unless vatRate also provided
        if (input.vatRate != null) {
            fields.push('vat_rate = ?')
            params.push(input.vatRate)
            fields.push('net_amount = ?')
            const net = Math.round((Number(input.grossAmount) / (1 + Number(input.vatRate)/100)) * 100) / 100
            params.push(net)
            fields.push('vat_amount = ?')
            const vat = Math.round((Number(input.grossAmount) - net) * 100) / 100
            params.push(vat)
        }
        setAmounts = true
    } else if (input.netAmount != null) {
        fields.push('net_amount = ?')
        params.push(input.netAmount)
        if (input.amountMode === undefined) {
            fields.push('amount_mode = ?')
            params.push('NET')
        }
        const rate = input.vatRate != null ? Number(input.vatRate) : (current.vatRate ?? 0)
        fields.push('vat_rate = ?')
        params.push(rate)
        const vat = Math.round((Number(input.netAmount) * rate / 100) * 100) / 100
        fields.push('vat_amount = ?')
        params.push(vat)
        const gross = Math.round(((Number(input.netAmount) + vat) * 100)) / 100
        fields.push('gross_amount = ?')
        params.push(gross)
        setAmounts = true
    } else if (input.vatRate != null) {
        // Update vatRate with recompute from existing net if available
        const rate = Number(input.vatRate)
        const curNet = current?.netAmount ?? 0
        fields.push('vat_rate = ?')
        params.push(rate)
        const vat = Math.round((curNet * rate / 100) * 100) / 100
        fields.push('vat_amount = ?')
        params.push(vat)
        const gross = Math.round(((curNet + vat) * 100)) / 100
        fields.push('gross_amount = ?')
        params.push(gross)
        setAmounts = true
    }
    if (!fields.length && !input.tags && !setAmounts) return { id: input.id, warnings }
    params.push(input.id)
    d.prepare(`UPDATE vouchers SET ${fields.join(', ')} WHERE id = ?`).run(...params)
    // Apply tag changes before snapshotting 'after' so audit contains new tags state
    if (input.tags) setVoucherTags(input.id, input.tags)
    try {
        const after = d.prepare(`
            SELECT id, date, type, sphere, description, note, payment_method as paymentMethod, transfer_from as transferFrom, transfer_to as transferTo,
                   earmark_id as earmarkId, earmark_amount as earmarkAmount, budget_id as budgetId, budget_amount as budgetAmount,
                     net_amount as netAmount, vat_rate as vatRate, gross_amount as grossAmount, amount_mode as amountMode
            FROM vouchers WHERE id=?
        `).get(input.id) as any
        const afterTags = getTagsForVoucher(input.id)
        const afterFull = { ...after, tags: afterTags }
        writeAudit(d as any, null, 'vouchers', input.id, 'UPDATE', { before: currentFull, after: afterFull, changes: input })
    } catch { /* ignore audit failures */ }
    return { id: input.id, warnings }
}

export function updateVoucherMeta(input: {
    id: number
    note?: string | null
    budgetId?: number | null
    budgetAmount?: number | null
    earmarkId?: number | null
    earmarkAmount?: number | null
    budgets?: Array<{ budgetId: number; amount: number }>
    earmarks?: Array<{ earmarkId: number; amount: number }>
    tags?: string[]
}) {
    const d = getDb()
    const current = d.prepare(`
        SELECT id, voucher_no as voucherNo, date, type, sphere, note, gross_amount as grossAmount,
               earmark_id as earmarkId, earmark_amount as earmarkAmount,
               budget_id as budgetId, budget_amount as budgetAmount,
               original_id as originalId, reversed_by_id as reversedById
        FROM vouchers WHERE id=?
    `).get(input.id) as any
    if (!current) throw new Error('Beleg nicht gefunden')
    if (current.originalId) throw new Error('Stornobuchungen können nachträglich nicht geändert werden.')
    if (current.reversedById) throw new Error('Stornierte Buchungen können nachträglich nicht geändert werden.')
    const grossLimit = Math.abs(Number(current.grossAmount || 0))

    const beforeFull = {
        ...current,
        tags: getTagsForVoucher(input.id),
        budgets: getVoucherBudgets(input.id),
        earmarks: getVoucherEarmarks(input.id),
    }

    const fields: string[] = []
    const params: any[] = []

    if (input.note !== undefined) {
        fields.push('note = ?')
        params.push(input.note)
    }

    const normalizedBudgets = input.budgets !== undefined
        ? input.budgets.filter((b) => b?.budgetId && Number(b.amount) > 0).map((b) => ({ budgetId: Number(b.budgetId), amount: Number(b.amount) }))
        : undefined
    const normalizedEarmarks = input.earmarks !== undefined
        ? input.earmarks.filter((e) => e?.earmarkId && Number(e.amount) > 0).map((e) => ({ earmarkId: Number(e.earmarkId), amount: Number(e.amount) }))
        : undefined

    if (normalizedBudgets !== undefined) {
        const budgetTotal = normalizedBudgets.reduce((sum, b) => sum + Number(b.amount || 0), 0)
        if (budgetTotal > grossLimit + 0.001) throw new Error('Budget-Zuordnungen dürfen den Bruttobetrag nicht übersteigen.')
        fields.push('budget_id = ?', 'budget_amount = ?')
        params.push(normalizedBudgets[0]?.budgetId ?? null, normalizedBudgets[0]?.amount ?? null)
    } else {
        if (input.budgetId !== undefined) { fields.push('budget_id = ?'); params.push(input.budgetId) }
        if (input.budgetAmount !== undefined) { fields.push('budget_amount = ?'); params.push(input.budgetAmount) }
    }

    if (normalizedEarmarks !== undefined) {
        const earmarkTotal = normalizedEarmarks.reduce((sum, e) => sum + Number(e.amount || 0), 0)
        if (earmarkTotal > grossLimit + 0.001) throw new Error('Zweckbindungs-Zuordnungen dürfen den Bruttobetrag nicht übersteigen.')
        fields.push('earmark_id = ?', 'earmark_amount = ?')
        params.push(normalizedEarmarks[0]?.earmarkId ?? null, normalizedEarmarks[0]?.amount ?? null)
    } else {
        if (input.earmarkId !== undefined) { fields.push('earmark_id = ?'); params.push(input.earmarkId) }
        if (input.earmarkAmount !== undefined) { fields.push('earmark_amount = ?'); params.push(input.earmarkAmount) }
    }

    if (fields.length) {
        params.push(input.id)
        d.prepare(`UPDATE vouchers SET ${fields.join(', ')} WHERE id = ?`).run(...params)
    }
    if (normalizedBudgets !== undefined) setVoucherBudgets(input.id, normalizedBudgets)
    if (normalizedEarmarks !== undefined) setVoucherEarmarks(input.id, normalizedEarmarks)
    if (input.tags !== undefined) setVoucherTags(input.id, input.tags)

    try {
        const after = d.prepare(`
            SELECT id, voucher_no as voucherNo, date, type, sphere, note,
                   earmark_id as earmarkId, earmark_amount as earmarkAmount,
                   budget_id as budgetId, budget_amount as budgetAmount
            FROM vouchers WHERE id=?
        `).get(input.id) as any
        const afterFull = {
            ...after,
            tags: getTagsForVoucher(input.id),
            budgets: getVoucherBudgets(input.id),
            earmarks: getVoucherEarmarks(input.id),
        }
        writeAudit(d as any, null, 'vouchers', input.id, 'UPDATE_META', { before: beforeFull, after: afterFull, changes: input })
    } catch { /* ignore audit failures */ }

    return { id: input.id }
}

export function deleteVoucher(id: number, options?: { allowAdvancePlaceholder?: boolean }) {
    const d = getDb()
    // Snapshot before deletion for audit
    const snap = d.prepare('SELECT id, voucher_no as voucherNo, date, type, sphere, payment_method as paymentMethod, description, net_amount as netAmount, vat_rate as vatRate, vat_amount as vatAmount, gross_amount as grossAmount, earmark_id as earmarkId, earmark_amount as earmarkAmount, budget_id as budgetId, budget_amount as budgetAmount, original_id as originalId, reversed_by_id as reversedById FROM vouchers WHERE id=?').get(id) as any
    if (!snap) throw new Error('Beleg nicht gefunden')
    if (snap.originalId) throw new Error('Stornobuchungen sind Teil der Storno-Kette und können nicht gelöscht werden.')
    if (snap.reversedById) throw new Error('Diese Buchung wurde bereits storniert und kann nicht gelöscht werden.')

    if (!options?.allowAdvancePlaceholder) {
        const advancePlaceholderRef = getAdvancePlaceholderRef(d, id)
        if (advancePlaceholderRef) throw new Error('Vorschuss-Platzhalter sind systemgeneriert und können nicht gelöscht werden.')
    }

    // Block deletion in closed year
    ensurePeriodOpen(snap.date, d)
    // Optional: cascade delete files on disk
    const files = d.prepare('SELECT file_path FROM voucher_files WHERE voucher_id=?').all(id) as any[]
    d.prepare('DELETE FROM voucher_files WHERE voucher_id=?').run(id)
    d.prepare('DELETE FROM vouchers WHERE id=?').run(id)
    for (const f of files) {
        try { fs.unlinkSync(f.file_path) } catch { }
    }
    try { writeAudit(d as any, null, 'vouchers', id, 'DELETE', { snapshot: snap }) } catch { }
    return { id }
}
export function clearAllVouchers() {
    return withTransaction((d: DB) => {
        // Collect file paths before deletion
        const files = d.prepare('SELECT file_path FROM voucher_files').all() as any[]
        const countRow = d.prepare('SELECT COUNT(1) as c FROM vouchers').get() as any
        const deleted = Number(countRow?.c || 0)

        // Clear self-referencing FKs (no CASCADE) so vouchers can be deleted
        d.prepare('UPDATE vouchers SET reversed_by_id = NULL, original_id = NULL').run()

        // Clear FK references from invoices (no CASCADE)
        d.prepare('UPDATE invoices SET posted_voucher_id = NULL WHERE posted_voucher_id IS NOT NULL').run()

        // Clear FK references from membership_payments (ON DELETE SET NULL, but be explicit)
        d.prepare('UPDATE membership_payments SET voucher_id = NULL WHERE voucher_id IS NOT NULL').run()

        // Delete from junction/child tables (CASCADE should handle these,
        // but explicit deletion avoids issues if PRAGMA foreign_keys is off in the transaction)
        d.prepare('DELETE FROM voucher_budgets').run()
        d.prepare('DELETE FROM voucher_earmarks').run()
        d.prepare('DELETE FROM voucher_tags').run()
        d.prepare('DELETE FROM voucher_files').run()

        // Now safe to delete all vouchers
        d.prepare('DELETE FROM vouchers').run()

        // Reset sequences
        d.prepare('DELETE FROM voucher_sequences').run()

        // Remove files from disk
        for (const f of files) {
            try { fs.unlinkSync(f.file_path) } catch { }
        }
        // Audit entry (system)
        try { writeAudit(d as any, null, 'vouchers', 0, 'CLEAR_ALL', { deleted }) } catch { }
        return { deleted }
    })
}

export function cashBalance(params: { from?: string; to?: string; sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'; budgetId?: number }) {
    const d = getDb()
    const to = params.to ?? new Date().toISOString().slice(0, 10)
    // Wenn 'from' übergeben wird, nutze es; sonst gesamter Zeitraum (kein Untergrenze)
    const from = params.from
    const wh: string[] = ["v.date <= @to"]
    const bind: Record<string, any> = { to }
    if (from) { wh.push('v.date >= @from'); bind.from = from }
    if (params.sphere) { wh.push('v.sphere = @sphere'); bind.sphere = params.sphere }

    const budgetId = (typeof params.budgetId === 'number' && Number.isFinite(params.budgetId)) ? params.budgetId : undefined

    let joinSql = ''
    let grossExpr = 'v.gross_amount'
    if (budgetId != null) {
        bind.budgetId = budgetId
        // When budgetId is provided, compute movement based on budget allocation amounts.
        // Prefer junction table voucher_budgets; fallback to legacy columns (budget_id/budget_amount).
        joinSql = ' LEFT JOIN voucher_budgets vb ON vb.voucher_id = v.id AND vb.budget_id = @budgetId '
        wh.push('(vb.budget_id IS NOT NULL OR v.budget_id = @budgetId)')
        grossExpr = `CASE
            WHEN vb.amount IS NOT NULL THEN vb.amount
            WHEN v.budget_id = @budgetId THEN COALESCE(v.budget_amount, v.gross_amount)
            ELSE 0
        END`
    }

    const whereSql = ' WHERE ' + wh.join(' AND ')
    const rows = d.prepare(`
        SELECT v.payment_method as pm,
               v.type as type,
               v.transfer_from as transferFrom,
               v.transfer_to as transferTo,
               COALESCE(v.payment_account_id,
                   CASE v.payment_method
                       WHEN 'BAR' THEN (SELECT id FROM payment_accounts WHERE kind = 'CASH' ORDER BY sort_order, id LIMIT 1)
                       WHEN 'BANK' THEN (SELECT id FROM payment_accounts WHERE kind = 'BANK' ORDER BY sort_order, id LIMIT 1)
                       ELSE NULL
                   END
               ) as paymentAccountId,
               COALESCE(v.transfer_from_account_id,
                   CASE v.transfer_from
                       WHEN 'BAR' THEN (SELECT id FROM payment_accounts WHERE kind = 'CASH' ORDER BY sort_order, id LIMIT 1)
                       WHEN 'BANK' THEN (SELECT id FROM payment_accounts WHERE kind = 'BANK' ORDER BY sort_order, id LIMIT 1)
                       ELSE NULL
                   END
               ) as transferFromAccountId,
               COALESCE(v.transfer_to_account_id,
                   CASE v.transfer_to
                       WHEN 'BAR' THEN (SELECT id FROM payment_accounts WHERE kind = 'CASH' ORDER BY sort_order, id LIMIT 1)
                       WHEN 'BANK' THEN (SELECT id FROM payment_accounts WHERE kind = 'BANK' ORDER BY sort_order, id LIMIT 1)
                       ELSE NULL
                   END
               ) as transferToAccountId,
               IFNULL(SUM(${grossExpr}), 0) as gross
        FROM vouchers v${joinSql}${whereSql}
        GROUP BY v.payment_method, v.type, v.transfer_from, v.transfer_to, paymentAccountId, transferFromAccountId, transferToAccountId
    `).all(bind) as any[]
    const accountRows = d.prepare(`
        SELECT id, name, kind, color, sort_order as sortOrder, is_active as isActive
        FROM payment_accounts
        ORDER BY sort_order, name, id
    `).all() as Array<{ id: number; name: string; kind: string; color?: string | null; sortOrder: number; isActive: number }>
    const accountBalances = new Map<number, { id: number; name: string; kind: string; color?: string | null; balance: number; sortOrder: number; isActive: number }>()
    for (const account of accountRows) {
        accountBalances.set(account.id, { ...account, balance: 0 })
    }
    const addAccountBalance = (accountId: unknown, amount: number) => {
        const id = Number(accountId)
        if (!Number.isFinite(id)) return
        const existing = accountBalances.get(id)
        if (existing) {
            existing.balance += amount
            return
        }
        accountBalances.set(id, { id, name: `Konto #${id}`, kind: 'OTHER', color: null, balance: amount, sortOrder: 9999, isActive: 1 })
    }
    let bar = 0, bank = 0
    for (const r of rows) {
        if (r.type === 'TRANSFER') {
            // Transfer: subtract from source, add to destination
            const amt = r.gross || 0
            if (r.transferFrom === 'BAR') bar -= amt
            if (r.transferFrom === 'BANK') bank -= amt
            if (r.transferTo === 'BAR') bar += amt
            if (r.transferTo === 'BANK') bank += amt
            addAccountBalance(r.transferFromAccountId, -amt)
            addAccountBalance(r.transferToAccountId, amt)
        } else {
            const sign = r.type === 'IN' ? 1 : r.type === 'OUT' ? -1 : 0
            if (r.pm === 'BAR') bar += sign * (r.gross || 0)
            if (r.pm === 'BANK') bank += sign * (r.gross || 0)
            addAccountBalance(r.paymentAccountId, sign * (r.gross || 0))
        }
    }
    const accounts = Array.from(accountBalances.values())
        .map((account) => ({ ...account, balance: Math.round(account.balance * 100) / 100 }))
        .filter((account) => account.isActive !== 0 || Math.abs(account.balance) > 0.0001)
        .sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name) || (a.id - b.id))
    return { BAR: Math.round(bar * 100) / 100, BANK: Math.round(bank * 100) / 100, accounts }
}

// Distinct voucher years present in the database
export function listVoucherYears(): number[] {
    const d = getDb()
    const rows = d.prepare("SELECT DISTINCT CAST(strftime('%Y', date) AS INTEGER) as year FROM vouchers ORDER BY year DESC").all() as any[]
    return rows.map(r => Number(r.year)).filter((y) => Number.isFinite(y))
}

// Attachments
export function listFilesForVoucher(voucherId: number) {
    const d = getDb()
    const rows = d.prepare(`
        SELECT id, file_name as fileName, file_path as filePath, mime_type as mimeType, size, created_at as createdAt
        FROM voucher_files WHERE voucher_id = ? ORDER BY created_at DESC, id DESC
    `).all(voucherId) as any[]
    return rows
}

export function getFileById(fileId: number) {
    const d = getDb()
    const row = d.prepare(`
        SELECT id, voucher_id as voucherId, file_name as fileName, file_path as filePath, mime_type as mimeType, size, created_at as createdAt
        FROM voucher_files WHERE id = ?
    `).get(fileId) as any
    return row
}

export function addFileToVoucher(voucherId: number, fileName: string, dataBase64: string, mime?: string) {
    const d = getDb()
    const { filesDir } = getAppDataDir()
    const buff = Buffer.from(dataBase64, 'base64')
    const safeName = `${voucherId}-${Date.now()}-${fileName.replace(/[^a-zA-Z0-9_.-]/g, '_')}`
    const abs = path.join(filesDir, safeName)
    fs.writeFileSync(abs, buff)
    const info = d.prepare('INSERT INTO voucher_files(voucher_id, file_name, file_path, mime_type, size) VALUES (?,?,?,?,?)').run(voucherId, fileName, abs, mime ?? null, buff.length)
    const id = Number(info.lastInsertRowid)
    return { id }
}

export function deleteVoucherFile(fileId: number) {
    const d = getDb()
    const row = d.prepare('SELECT file_path as filePath FROM voucher_files WHERE id=?').get(fileId) as any
    d.prepare('DELETE FROM voucher_files WHERE id=?').run(fileId)
    try { if (row?.filePath && fs.existsSync(row.filePath)) fs.unlinkSync(row.filePath) } catch { /* ignore */ }
    return { id: fileId }
}

// ─────────────────────────────────────────────────────────────────────────────
// Junction table functions for multiple budgets/earmarks per voucher
// ─────────────────────────────────────────────────────────────────────────────

export type VoucherBudgetAssignment = { id: number; budgetId: number; amount: number; label?: string; color?: string | null }
export type VoucherEarmarkAssignment = { id: number; earmarkId: number; amount: number; code?: string; name?: string; color?: string | null }

/** Get all budget assignments for a voucher */
export function getVoucherBudgets(voucherId: number): VoucherBudgetAssignment[] {
    const d = getDb()
    const rows = d.prepare(`
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
    return rows
}

/** Get all earmark assignments for a voucher */
export function getVoucherEarmarks(voucherId: number): VoucherEarmarkAssignment[] {
    const d = getDb()
    const rows = d.prepare(`
        SELECT ve.id, ve.earmark_id as earmarkId, ve.amount,
               e.code, e.name, e.color
        FROM voucher_earmarks ve
        JOIN earmarks e ON e.id = ve.earmark_id
        WHERE ve.voucher_id = ?
        ORDER BY ve.id
    `).all(voucherId) as VoucherEarmarkAssignment[]
    return rows
}

/** Set budget assignments for a voucher (replaces existing) */
export function setVoucherBudgets(voucherId: number, assignments: Array<{ budgetId: number; amount: number }>) {
    const d = getDb()
    const voucher = d.prepare('SELECT date FROM vouchers WHERE id=?').get(voucherId) as any
    if (!voucher?.date) throw new Error('Beleg nicht gefunden')

    // Validate time range for each budget assignment
    for (const a of assignments) {
        if (!a?.budgetId) continue
        const budget = d.prepare('SELECT id, year, start_date as startDate, end_date as endDate, enforce_time_range as enforceTimeRange FROM budgets WHERE id=?').get(a.budgetId) as any
        if (!budget) throw new Error('Budget nicht gefunden')
        if (budget.enforceTimeRange) {
            const effStart = budget.startDate ?? (budget.year ? `${budget.year}-01-01` : null)
            const effEnd = budget.endDate ?? (budget.year ? `${budget.year}-12-31` : null)
            if (effStart && voucher.date < effStart) throw new Error(`Buchungsdatum liegt vor Beginn des Budgets (${effStart})`)
            if (effEnd && voucher.date > effEnd) throw new Error(`Buchungsdatum liegt nach Ende des Budgets (${effEnd})`)
        }
    }

    d.prepare('DELETE FROM voucher_budgets WHERE voucher_id = ?').run(voucherId)
    const stmt = d.prepare('INSERT INTO voucher_budgets (voucher_id, budget_id, amount) VALUES (?, ?, ?)')
    for (const a of assignments) {
        if (a.budgetId && a.amount > 0) {
            stmt.run(voucherId, a.budgetId, a.amount)
        }
    }
    // Sync legacy columns for backwards compatibility (use first assignment)
    if (assignments.length > 0 && assignments[0].budgetId) {
        d.prepare('UPDATE vouchers SET budget_id = ?, budget_amount = ? WHERE id = ?')
            .run(assignments[0].budgetId, assignments[0].amount, voucherId)
    } else {
        d.prepare('UPDATE vouchers SET budget_id = NULL, budget_amount = NULL WHERE id = ?').run(voucherId)
    }
}

/** Set earmark assignments for a voucher (replaces existing) */
export function setVoucherEarmarks(voucherId: number, assignments: Array<{ earmarkId: number; amount: number }>) {
    const d = getDb()
    const voucher = d.prepare('SELECT date FROM vouchers WHERE id=?').get(voucherId) as any
    if (!voucher?.date) throw new Error('Beleg nicht gefunden')

    // Validate time range and activity for each earmark assignment
    for (const a of assignments) {
        if (!a?.earmarkId) continue
        const em = d.prepare('SELECT id, is_active as isActive, start_date as startDate, end_date as endDate, enforce_time_range as enforceTimeRange FROM earmarks WHERE id=?').get(a.earmarkId) as any
        if (!em) throw new Error('Zweckbindung nicht gefunden')
        if (!em.isActive) throw new Error('Zweckbindung ist inaktiv und kann nicht verwendet werden')
        if (em.enforceTimeRange) {
            if (em.startDate && voucher.date < em.startDate) throw new Error(`Buchungsdatum liegt vor Beginn der Zweckbindung (${em.startDate})`)
            if (em.endDate && voucher.date > em.endDate) throw new Error(`Buchungsdatum liegt nach Ende der Zweckbindung (${em.endDate})`)
        }
    }

    d.prepare('DELETE FROM voucher_earmarks WHERE voucher_id = ?').run(voucherId)
    const stmt = d.prepare('INSERT INTO voucher_earmarks (voucher_id, earmark_id, amount) VALUES (?, ?, ?)')
    for (const a of assignments) {
        if (a.earmarkId && a.amount > 0) {
            stmt.run(voucherId, a.earmarkId, a.amount)
        }
    }
    // Sync legacy columns for backwards compatibility (use first assignment)
    if (assignments.length > 0 && assignments[0].earmarkId) {
        d.prepare('UPDATE vouchers SET earmark_id = ?, earmark_amount = ? WHERE id = ?')
            .run(assignments[0].earmarkId, assignments[0].amount, voucherId)
    } else {
        d.prepare('UPDATE vouchers SET earmark_id = NULL, earmark_amount = NULL WHERE id = ?').run(voucherId)
    }
}

/** Add a single budget assignment to a voucher */
export function addVoucherBudget(voucherId: number, budgetId: number, amount: number): { id: number } {
    const d = getDb()
    const info = d.prepare('INSERT OR REPLACE INTO voucher_budgets (voucher_id, budget_id, amount) VALUES (?, ?, ?)')
        .run(voucherId, budgetId, amount)
    return { id: Number(info.lastInsertRowid) }
}

/** Add a single earmark assignment to a voucher */
export function addVoucherEarmark(voucherId: number, earmarkId: number, amount: number): { id: number } {
    const d = getDb()
    const info = d.prepare('INSERT OR REPLACE INTO voucher_earmarks (voucher_id, earmark_id, amount) VALUES (?, ?, ?)')
        .run(voucherId, earmarkId, amount)
    return { id: Number(info.lastInsertRowid) }
}

/** Remove a budget assignment by id */
export function removeVoucherBudget(assignmentId: number) {
    const d = getDb()
    d.prepare('DELETE FROM voucher_budgets WHERE id = ?').run(assignmentId)
    return { id: assignmentId }
}

/** Remove an earmark assignment by id */
export function removeVoucherEarmark(assignmentId: number) {
    const d = getDb()
    d.prepare('DELETE FROM voucher_earmarks WHERE id = ?').run(assignmentId)
    return { id: assignmentId }
}

/** Get total budget allocation for a voucher */
export function getVoucherBudgetTotal(voucherId: number): number {
    const d = getDb()
    const row = d.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM voucher_budgets WHERE voucher_id = ?')
        .get(voucherId) as { total: number }
    return row.total
}

/** Get total earmark allocation for a voucher */
export function getVoucherEarmarkTotal(voucherId: number): number {
    const d = getDb()
    const row = d.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM voucher_earmarks WHERE voucher_id = ?')
        .get(voucherId) as { total: number }
    return row.total
}
