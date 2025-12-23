import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { withTransaction, getAppDataDir, getDb } from '../db/database'
import { ensurePeriodOpen, getSetting } from '../services/settings'
import { nextVoucherSequence, makeVoucherNo } from '../services/numbering'
import { writeAudit } from '../services/audit'
import { getTagsForVoucher, setVoucherTags } from './tags'

type DB = InstanceType<typeof Database>

function round2(n: number) {
    return Math.round(n * 100) / 100
}

export function createVoucher(input: {
    date: string
    type: 'IN' | 'OUT' | 'TRANSFER'
    sphere: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
    description?: string
    netAmount?: number
    grossAmount?: number
    vatRate: number
    paymentMethod?: 'BAR' | 'BANK'
    transferFrom?: 'BAR' | 'BANK'
    transferTo?: 'BAR' | 'BANK'
    categoryId?: number
    projectId?: number
    earmarkId?: number
    earmarkAmount?: number | null
    budgetId?: number
    budgetAmount?: number | null
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
            // User provided gross; do not infer VAT/net automatically
            grossAmount = input.grossAmount
            netAmount = 0
            vatAmount = 0
        } else {
            throw new Error('Either netAmount or grossAmount must be provided')
        }

        // Earmark validations (if provided)
        if (input.earmarkId != null) {
            const em = d.prepare('SELECT id, is_active as isActive, start_date as startDate, end_date as endDate, enforce_time_range as enforceTimeRange FROM earmarks WHERE id=?').get(input.earmarkId) as any
            if (!em) throw new Error('Zweckbindung nicht gefunden')
            if (!em.isActive) throw new Error('Zweckbindung ist inaktiv und kann nicht verwendet werden')
            
            // Zeitraum-Prüfung nur wenn enforceTimeRange aktiv ist
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
                `).get(input.earmarkId, input.date) as any
                const em2 = d.prepare('SELECT budget FROM earmarks WHERE id=?').get(input.earmarkId) as any
                const budget = Number(em2?.budget ?? 0) || 0
                const currentBalance = Math.round(((balRow.allocated || 0) - (balRow.released || 0)) * 100) / 100
                const remaining = Math.round(((budget + currentBalance) * 100)) / 100
                const wouldBe = Math.round(((remaining - (grossAmount ?? 0)) * 100)) / 100
                if (wouldBe < 0) {
                    warnings.push('Zweckbindung würde den verfügbaren Rahmen unterschreiten.')
                }
            }
        }

        // Budget validations (if provided)
        if (input.budgetId != null) {
            const budget = d.prepare('SELECT id, start_date as startDate, end_date as endDate, enforce_time_range as enforceTimeRange FROM budgets WHERE id=?').get(input.budgetId) as any
            if (!budget) throw new Error('Budget nicht gefunden')
            
            // Zeitraum-Prüfung nur wenn enforceTimeRange aktiv ist
            if (budget.enforceTimeRange) {
                if (budget.startDate && input.date < budget.startDate) throw new Error(`Buchungsdatum liegt vor Beginn des Budgets (${budget.startDate})`)
                if (budget.endDate && input.date > budget.endDate) throw new Error(`Buchungsdatum liegt nach Ende des Budgets (${budget.endDate})`)
            }
        }

        const stmt = d.prepare(`
      INSERT INTO vouchers (
    year, seq_no, voucher_no, date, type, sphere, account_id, category_id, project_id, earmark_id, earmark_amount, budget_id, budget_amount, description,
        net_amount, vat_rate, vat_amount, gross_amount, payment_method, transfer_from, transfer_to, counterparty, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
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
                    input.earmarkId ?? null,
                    input.earmarkAmount ?? null,
                    input.budgetId ?? null,
                    input.budgetAmount ?? null,
                    input.description ?? null,
                    netAmount,
                    input.vatRate,
                    vatAmount,
                    grossAmount,
                    input.paymentMethod ?? null,
                    input.transferFrom ?? null,
                    input.transferTo ?? null,
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
        // Reverse uses today's date; ensure open
        ensurePeriodOpen(new Date().toISOString().slice(0, 10), d)

        const now = new Date()
        const year = now.getFullYear()
        const seq = nextVoucherSequence(d, year, original.sphere)
        const todayISO = now.toISOString().slice(0, 10)
        const voucherNo = makeVoucherNo(year, todayISO, original.sphere, seq)

        const stmt = d.prepare(`
      INSERT INTO vouchers (
        year, seq_no, voucher_no, date, type, sphere, account_id, category_id, project_id, earmark_id, description,
        net_amount, vat_rate, vat_amount, gross_amount, payment_method, counterparty, created_by, original_id
      ) VALUES (?, ?, ?, date('now'), ?, ?, ?, ?, ?, ?, 'Storno', ?, ?, ?, ?, NULL, NULL, ?, ?)
    `)
        const info = stmt.run(
            year,
            seq,
            voucherNo,
            original.type === 'IN' ? 'OUT' : original.type === 'OUT' ? 'IN' : 'TRANSFER',
            original.sphere,
            original.account_id,
            original.category_id,
            original.project_id,
            original.earmark_id,
            -original.net_amount,
            original.vat_rate,
            -original.vat_amount,
            -original.gross_amount,
            userId ?? null,
            originalId
        )
        const id = Number(info.lastInsertRowid)

        d.prepare('UPDATE vouchers SET reversed_by_id=? WHERE id=?').run(id, originalId)

        writeAudit(d, userId ?? null, 'vouchers', id, 'REVERSE', { originalId })
        return { id, voucherNo }
    })
}

export function listRecentVouchers(limit = 20) {
    const d = getDb()
    const rows = (d
        .prepare(
            `SELECT v.id, v.voucher_no as voucherNo, v.date, v.type, v.sphere, v.payment_method as paymentMethod, v.transfer_from as transferFrom, v.transfer_to as transferTo, v.description, v.net_amount as netAmount,
                            v.vat_rate as vatRate, v.vat_amount as vatAmount, v.gross_amount as grossAmount,
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
    let sql = `SELECT id, voucher_no as voucherNo, date, type, sphere, payment_method as paymentMethod, description,
                                        net_amount as netAmount, vat_rate as vatRate, vat_amount as vatAmount, gross_amount as grossAmount,
                                        (SELECT COUNT(1) FROM voucher_files vf WHERE vf.voucher_id = vouchers.id) as fileCount
                         FROM vouchers`
    const params: any[] = []
    const wh: string[] = []
    if (paymentMethod) {
        wh.push(`payment_method = ?`)
        params.push(paymentMethod)
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
    let sql = `SELECT v.id, v.voucher_no as voucherNo, v.date, v.type, v.sphere, v.payment_method as paymentMethod, v.transfer_from as transferFrom, v.transfer_to as transferTo, v.description, v.counterparty,
                                        v.net_amount as netAmount, v.vat_rate as vatRate, v.vat_amount as vatAmount, v.gross_amount as grossAmount,
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
    if (paymentMethod) { wh.push('v.payment_method = ?'); params.push(paymentMethod) }
    if (sphere) { wh.push('v.sphere = ?'); params.push(sphere) }
    if (type) { wh.push('v.type = ?'); params.push(type) }
    if (from) { wh.push('v.date >= ?'); params.push(from) }
    if (to) { wh.push('v.date <= ?'); params.push(to) }
    if (earmarkId) { wh.push('v.earmark_id = ?'); params.push(earmarkId) }
    if (budgetId) { wh.push('v.budget_id = ?'); params.push(budgetId) }
    if (q && q.trim()) {
        const like = `%${q.trim()}%`
        wh.push('(v.voucher_no LIKE ? OR v.description LIKE ? OR v.counterparty LIKE ? OR v.date LIKE ?)')
        params.push(like, like, like, like)
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
    q?: string
    tag?: string
}): { rows: any[]; total: number } {
    const d = getDb()
    const { limit = 20, offset = 0, sort = 'DESC', sortBy, paymentMethod, sphere, type, from, to, earmarkId, budgetId, q, tag } = filters
    const params: any[] = []
    const wh: string[] = []
    if (paymentMethod) { wh.push('v.payment_method = ?'); params.push(paymentMethod) }
    if (sphere) { wh.push('v.sphere = ?'); params.push(sphere) }
    if (type) { wh.push('v.type = ?'); params.push(type) }
    if (from) { wh.push('v.date >= ?'); params.push(from) }
    if (to) { wh.push('v.date <= ?'); params.push(to) }
    if (earmarkId) { wh.push('v.earmark_id = ?'); params.push(earmarkId) }
    if (budgetId) { wh.push('v.budget_id = ?'); params.push(budgetId) }
    if (q && q.trim()) {
        const like = `%${q.trim()}%`
        wh.push('(v.voucher_no LIKE ? OR v.description LIKE ? OR v.counterparty LIKE ? OR v.date LIKE ?)')
        params.push(like, like, like, like)
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
        `SELECT v.id, v.voucher_no as voucherNo, v.date, v.type, v.sphere, v.payment_method as paymentMethod, v.transfer_from as transferFrom, v.transfer_to as transferTo, v.description, v.counterparty,
                v.net_amount as netAmount, v.vat_rate as vatRate, v.vat_amount as vatAmount, v.gross_amount as grossAmount,
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
    const mapped = rows.map(r => ({ ...r, tags: (r as any).tagsConcat ? String((r as any).tagsConcat).split('\u0001') : [] }))
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
    if (params.paymentMethod) { wh.push('payment_method = ?'); args.push(params.paymentMethod) }
    if (params.sphere) { wh.push('sphere = ?'); args.push(params.sphere) }
    if (params.type) { wh.push('type = ?'); args.push(params.type) }
    if (params.from) { wh.push('date >= ?'); args.push(params.from) }
    if (params.to) { wh.push('date <= ?'); args.push(params.to) }
    if (params.q && params.q.trim()) {
        const like = `%${params.q.trim()}%`
        wh.push('(voucher_no LIKE ? OR description LIKE ? OR counterparty LIKE ? OR date LIKE ?)')
        args.push(like, like, like, like)
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
    if (params.paymentMethod) { wh.push('payment_method = ?'); args.push(params.paymentMethod) }
    if (params.sphere) { wh.push('sphere = ?'); args.push(params.sphere) }
    if (params.type) { wh.push('type = ?'); args.push(params.type) }
    if (params.from) { wh.push('date >= ?'); args.push(params.from) }
    if (params.to) { wh.push('date <= ?'); args.push(params.to) }
    if (params.q && params.q.trim()) {
        const like = `%${params.q.trim()}%`
        wh.push('(voucher_no LIKE ? OR description LIKE ? OR counterparty LIKE ? OR date LIKE ?)')
        args.push(like, like, like, like)
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
    if (params.paymentMethod) { wh.push('payment_method = ?'); args.push(params.paymentMethod) }
    if (params.sphere) { wh.push('sphere = ?'); args.push(params.sphere) }
    if (params.type) { wh.push('type = ?'); args.push(params.type) }
    if (params.from) { wh.push('date >= ?'); args.push(params.from) }
    if (params.to) { wh.push('date <= ?'); args.push(params.to) }
    if (params.q && params.q.trim()) {
        const like = `%${params.q.trim()}%`
        wh.push('(voucher_no LIKE ? OR description LIKE ? OR counterparty LIKE ? OR date LIKE ?)')
        args.push(like, like, like, like)
    }
    const whereSql = wh.length ? ' WHERE ' + wh.join(' AND ') : ''
    // Collect voucher ids
    const ids = (d.prepare(`SELECT id FROM vouchers${whereSql}`).all(...args) as any[]).map(r => r.id)
    if (!ids.length) return { updated: 0 }
    // Ensure tags exist (upsert by name)
    const exist = d.prepare('SELECT id, name FROM tags').all() as any[]
    const byName = new Map<string, number>(exist.map(r => [String(r.name).toLowerCase(), r.id]))
    const tagIds: number[] = []
    for (const nameRaw of params.tags) {
        const name = String(nameRaw || '').trim()
        if (!name) continue
        const key = name.toLowerCase()
        let id = byName.get(key)
        if (!id) {
            const info = d.prepare('INSERT INTO tags(name) VALUES (?)').run(name)
            id = Number(info.lastInsertRowid)
            byName.set(key, id)
        }
        tagIds.push(id!)
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
    sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
    type?: 'IN' | 'OUT' | 'TRANSFER'
    from?: string
    to?: string
    earmarkId?: number
    q?: string
    tag?: string
}) {
    const d = getDb()
    const { paymentMethod, sphere, type, from, to, earmarkId, q, tag } = filters
    const paramsBase: any[] = []
    const wh: string[] = []
    let joinSql = ''
    if (paymentMethod) { wh.push('v.payment_method = ?'); paramsBase.push(paymentMethod) }
    if (sphere) { wh.push('v.sphere = ?'); paramsBase.push(sphere) }
    if (type) { wh.push('v.type = ?'); paramsBase.push(type) }
    if (from) { wh.push('v.date >= ?'); paramsBase.push(from) }
    if (to) { wh.push('v.date <= ?'); paramsBase.push(to) }
    if (earmarkId != null) { wh.push('v.earmark_id = ?'); paramsBase.push(earmarkId) }
    if (q && q.trim()) {
        const like = `%${q.trim()}%`
        wh.push('(v.voucher_no LIKE ? OR v.description LIKE ? OR v.counterparty LIKE ? OR v.date LIKE ? )')
        paramsBase.push(like, like, like, like)
    }
    if (tag) {
        joinSql = ' JOIN voucher_tags vt ON vt.voucher_id = v.id JOIN tags t ON t.id = vt.tag_id'
        wh.push('t.name = ?')
        paramsBase.push(tag)
    }
    const whereSql = wh.length ? ' WHERE ' + wh.join(' AND ') : ''

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

    const byPaymentMethod = d.prepare(`
        SELECT v.payment_method as key,
               IFNULL(SUM(v.net_amount), 0) as net,
               IFNULL(SUM(v.vat_amount), 0) as vat,
               IFNULL(SUM(v.gross_amount), 0) as gross
        FROM vouchers v${joinSql}${whereSql}
        GROUP BY v.payment_method
        ORDER BY v.payment_method IS NULL, v.payment_method
    `).all(...paramsBase) as any[]

    const byType = d.prepare(`
        SELECT v.type as key,
               IFNULL(SUM(v.net_amount), 0) as net,
               IFNULL(SUM(v.vat_amount), 0) as vat,
               IFNULL(SUM(v.gross_amount), 0) as gross
        FROM vouchers v${joinSql}${whereSql}
        GROUP BY v.type
        ORDER BY v.type
    `).all(...paramsBase) as any[]

    return { totals, bySphere, byPaymentMethod, byType }
}

export function monthlyVouchers(filters: {
    from?: string
    to?: string
    paymentMethod?: 'BAR' | 'BANK'
    sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB'
    type?: 'IN' | 'OUT' | 'TRANSFER'
}) {
    const d = getDb()
    const { from, to, paymentMethod, sphere, type } = filters
    const params: any[] = []
    const wh: string[] = []
    if (from) { wh.push('date >= ?'); params.push(from) }
    if (to) { wh.push('date <= ?'); params.push(to) }
    if (paymentMethod) { wh.push('payment_method = ?'); params.push(paymentMethod) }
    if (sphere) { wh.push('sphere = ?'); params.push(sphere) }
    if (type) { wh.push('type = ?'); params.push(type) }
    const whereSql = wh.length ? ' WHERE ' + wh.join(' AND ') : ''
    const rows = d.prepare(`
        SELECT strftime('%Y-%m', date) as month,
               IFNULL(SUM(CASE WHEN type = 'IN' THEN net_amount WHEN type = 'OUT' THEN -net_amount ELSE 0 END), 0) as net,
               IFNULL(SUM(CASE WHEN type = 'IN' THEN vat_amount WHEN type = 'OUT' THEN -vat_amount ELSE 0 END), 0) as vat,
               IFNULL(SUM(CASE WHEN type = 'IN' THEN gross_amount WHEN type = 'OUT' THEN -gross_amount ELSE 0 END), 0) as gross
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
}) {
    const d = getDb()
    const { from, to, paymentMethod, sphere, type } = filters
    const params: any[] = []
    const wh: string[] = []
    if (from) { wh.push('date >= ?'); params.push(from) }
    if (to) { wh.push('date <= ?'); params.push(to) }
    if (paymentMethod) { wh.push('payment_method = ?'); params.push(paymentMethod) }
    if (sphere) { wh.push('sphere = ?'); params.push(sphere) }
    if (type) { wh.push('type = ?'); params.push(type) }
    const whereSql = wh.length ? ' WHERE ' + wh.join(' AND ') : ''
    const rows = d.prepare(`
        SELECT date,
               IFNULL(SUM(CASE WHEN type = 'IN' THEN net_amount WHEN type = 'OUT' THEN -net_amount ELSE 0 END), 0) as net,
               IFNULL(SUM(CASE WHEN type = 'IN' THEN vat_amount WHEN type = 'OUT' THEN -vat_amount ELSE 0 END), 0) as vat,
               IFNULL(SUM(CASE WHEN type = 'IN' THEN gross_amount WHEN type = 'OUT' THEN -gross_amount ELSE 0 END), 0) as gross
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
    paymentMethod?: 'BAR' | 'BANK' | null
    transferFrom?: 'BAR' | 'BANK' | null
    transferTo?: 'BAR' | 'BANK' | null
    earmarkId?: number | null
    earmarkAmount?: number | null
    budgetId?: number | null
    budgetAmount?: number | null
    tags?: string[]
    netAmount?: number
    vatRate?: number
    grossAmount?: number
}) {
    const d = getDb()
    const warnings: string[] = []
    const current = d.prepare(`
        SELECT id, year, seq_no as seqNo, voucher_no as voucherNo, date, type, sphere,
               net_amount as netAmount, vat_rate as vatRate, gross_amount as grossAmount,
               earmark_id as earmarkId, earmark_amount as earmarkAmount,
               budget_id as budgetId, budget_amount as budgetAmount,
               payment_method as paymentMethod, transfer_from as transferFrom, transfer_to as transferTo,
               description
        FROM vouchers WHERE id=?
    `).get(input.id) as any
    if (!current) throw new Error('Beleg nicht gefunden')
    // Capture tags before update for audit
    const beforeTags = getTagsForVoucher(input.id)
    const currentFull = { ...current, tags: beforeTags }
    // Enforce period lock for the voucher's existing date (block edits in closed year)
    ensurePeriodOpen(current.date, d)

    const newDate = input.date ?? current.date
    const newType = input.type ?? current.type
    const newEarmarkId = (input.earmarkId === undefined) ? current.earmarkId : input.earmarkId
    const newBudgetId = (input.budgetId === undefined) ? current.budgetId : input.budgetId

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
    if (input.paymentMethod !== undefined) { fields.push('payment_method = ?'); params.push(input.paymentMethod) }
    if (input.earmarkId !== undefined) { fields.push('earmark_id = ?'); params.push(input.earmarkId) }
    if (input.earmarkAmount !== undefined) { fields.push('earmark_amount = ?'); params.push(input.earmarkAmount) }
    if (input.transferFrom !== undefined) { fields.push('transfer_from = ?'); params.push(input.transferFrom) }
    if (input.transferTo !== undefined) { fields.push('transfer_to = ?'); params.push(input.transferTo) }
    if (input.budgetId !== undefined) { fields.push('budget_id = ?'); params.push(input.budgetId) }
    if (input.budgetAmount !== undefined) { fields.push('budget_amount = ?'); params.push(input.budgetAmount) }
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
            SELECT id, date, type, sphere, description, payment_method as paymentMethod, transfer_from as transferFrom, transfer_to as transferTo,
                   earmark_id as earmarkId, earmark_amount as earmarkAmount, budget_id as budgetId, budget_amount as budgetAmount,
                   net_amount as netAmount, vat_rate as vatRate, gross_amount as grossAmount
            FROM vouchers WHERE id=?
        `).get(input.id) as any
        const afterTags = getTagsForVoucher(input.id)
        const afterFull = { ...after, tags: afterTags }
        writeAudit(d as any, null, 'vouchers', input.id, 'UPDATE', { before: currentFull, after: afterFull, changes: input })
    } catch { /* ignore audit failures */ }
    return { id: input.id, warnings }
}

export function deleteVoucher(id: number) {
    const d = getDb()
    // Snapshot before deletion for audit
    const snap = d.prepare('SELECT id, voucher_no as voucherNo, date, type, sphere, payment_method as paymentMethod, description, net_amount as netAmount, vat_rate as vatRate, vat_amount as vatAmount, gross_amount as grossAmount, earmark_id as earmarkId, earmark_amount as earmarkAmount, budget_id as budgetId, budget_amount as budgetAmount FROM vouchers WHERE id=?').get(id) as any
    if (!snap) throw new Error('Beleg nicht gefunden')
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
        d.prepare('DELETE FROM voucher_files').run()
        d.prepare('DELETE FROM vouchers').run()
        // Optionally reset sequences
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

export function cashBalance(params: { from?: string; to?: string; sphere?: 'IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB' }) {
    const d = getDb()
    const to = params.to ?? new Date().toISOString().slice(0, 10)
    const year = to.slice(0, 4)
    // Wenn 'from' übergeben wird, nutze es; sonst Jahresanfang
    const from = params.from ?? `${year}-01-01`
    const wh: string[] = ["date >= ?", "date <= ?"]
    const vals: any[] = [from, to]
    if (params.sphere) { wh.push('sphere = ?'); vals.push(params.sphere) }
    const whereSql = ' WHERE ' + wh.join(' AND ')
    const rows = d.prepare(`
        SELECT payment_method as pm, type, IFNULL(SUM(gross_amount), 0) as gross
        FROM vouchers${whereSql}
        GROUP BY payment_method, type
    `).all(...vals) as any[]
    let bar = 0, bank = 0
    for (const r of rows) {
        const sign = r.type === 'IN' ? 1 : r.type === 'OUT' ? -1 : 0
        if (r.pm === 'BAR') bar += sign * (r.gross || 0)
        if (r.pm === 'BANK') bank += sign * (r.gross || 0)
    }
    return { BAR: Math.round(bar * 100) / 100, BANK: Math.round(bank * 100) / 100 }
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

export type VoucherBudgetAssignment = { id: number; budgetId: number; amount: number; label?: string }
export type VoucherEarmarkAssignment = { id: number; earmarkId: number; amount: number; code?: string; name?: string }

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
               END as label
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
               e.code, e.name
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
