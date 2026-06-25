import ExcelJS from 'exceljs'
import { Buffer as NodeBuffer } from 'node:buffer'
import { createVoucher } from '../repositories/vouchers'
import { updateVoucher } from '../repositories/vouchers'
import { getPaymentAccountById, paymentMethodForAccountKind, upsertPaymentAccount } from '../repositories/paymentAccounts'
import { upsertBudget } from '../repositories/budgets'
import { upsertBinding } from '../repositories/bindings'
import { ensureTag } from '../repositories/tags'
import { getDb } from '../db/database'
import { writeAudit } from './audit'
import { XMLParser } from 'fast-xml-parser'
import { dialog, app } from 'electron'
import path from 'path'

export type ImportPreview = {
    headers: string[]
    sample: any[]
    suggestedMapping: Record<string, string | null>
    headerRowIndex: number
}

export type ImportExecuteResult = {
    imported: number
    skipped: number
    errors: Array<{ row: number; message: string }>
    rowStatuses?: Array<{ row: number; ok: boolean; message?: string }>
    newTags?: string[]
}

export type ImportRule = {
    id?: string
    enabled?: boolean
    sourceField: 'description' | 'paymentAccount' | 'tags' | 'note'
    contains: string
    targetField: 'tags' | 'type' | 'paymentMethod' | 'paymentAccount' | 'budget' | 'earmarkCode' | 'sphere'
    value: string
}

export type ImportDraftIssue = {
    level: 'error' | 'warning' | 'info'
    code: string
    message: string
}

export type ImportDraftRow = {
    id: string
    sourceRow: number
    status: 'ok' | 'warning' | 'error' | 'duplicate' | 'ignored'
    duplicateAction?: 'skip' | 'import' | 'merge'
    duplicateIds?: number[]
    issues: ImportDraftIssue[]
    original: Record<string, any>
    values: Record<string, any>
}

export type ImportAnalyzeResult = ImportPreview & {
    rows: ImportDraftRow[]
    summary: {
        total: number
        ok: number
        warnings: number
        errors: number
        duplicates: number
        ignored: number
    }
    missing: {
        tags: string[]
        budgets: string[]
        earmarks: string[]
        paymentAccounts: string[]
    }
    lookup: {
        paymentAccounts: LookupOption[]
        budgets: LookupOption[]
        earmarks: LookupOption[]
        tags: string[]
    }
}

export type ImportDraftCommitResult = ImportExecuteResult & { errorFilePath?: string }

const FIELD_KEYS = [
    'voucherId',
    'voucherNo',
    'date',
    'type',
    'sphere',
    'description',
    'note',
    'paymentMethod',
    'paymentAccount',
    'netAmount',
    'vatRate',
    'grossAmount',
    'inGross',
    'outGross',
    'earmarkCode',
    'earmarkAmount',
    'budget',
    'budgetAmount',
    'tags',
    'bankIn',
    'bankOut',
    'cashIn',
    'cashOut',
    'defaultSphere'
] as const
export type FieldKey = typeof FIELD_KEYS[number]

function normalizeHeader(h: string) {
    const s = (h || '').toString().trim().toLowerCase()
    return s
}

function suggestMapping(headers: string[]): Record<string, string | null> {
    const map: Record<string, string | null> = {
        voucherId: null, voucherNo: null, date: null, type: null, sphere: null, description: null, note: null, paymentMethod: null, paymentAccount: null,
        netAmount: null, vatRate: null, grossAmount: null, inGross: null, outGross: null, earmarkCode: null, earmarkAmount: null, budget: null, budgetAmount: null,
        tags: null, bankIn: null, bankOut: null, cashIn: null, cashOut: null, defaultSphere: 'IDEELL'
    }
    for (const h of headers) {
        const n = normalizeHeader(h)
        if (!map.voucherId && /(buchungs-?id|beleg-?id|voucher.?id|\bid\b)/.test(n)) map.voucherId = h
        else if (!map.voucherNo && /(beleg.?nr|belegnummer|voucher.?no|buchungsnummer|\bnr\b)/.test(n)) map.voucherNo = h
        else if (!map.date && /(datum|date)/.test(n)) map.date = h
        else if (!map.type && /(art|type|in|out|transfer)/.test(n)) map.type = h
        else if (!map.sphere && /(sph|sphäre|sphere)/.test(n)) map.sphere = h
        else if (!map.description && /(beschreibung|text|zweck|desc|bezeichnung)/.test(n)) map.description = h
        else if (!map.note && /(kommentar|notiz|notizen|hinweis|note)/.test(n)) map.note = h
        else if (!map.paymentMethod && /(zahlweg|payment.?method|payment method|zahlart)/.test(n)) map.paymentMethod = h
        else if (!map.paymentAccount && /(konto|zahlkonto|payment.?account)/.test(n)) map.paymentAccount = h
        else if (!map.netAmount && /(netto|net)/.test(n)) map.netAmount = h
        else if (!map.vatRate && /(ust|mwst|vat)/.test(n)) map.vatRate = h
        else if (!map.inGross && /(ein|einnahm|eingang)/.test(n) && /(brutto|betrag|amount)?/.test(n)) map.inGross = h
        else if (!map.outGross && /(ausgab|ausgang)/.test(n) && /(brutto|betrag|amount)?/.test(n)) map.outGross = h
        else if (!map.grossAmount && /(brutto|gross|betrag|amount)/.test(n)) map.grossAmount = h
        else if (!map.earmarkCode && /(zweckbindung|earmark|code)/.test(n)) map.earmarkCode = h
        else if (!map.earmarkAmount && /(zweckbindung.*betrag|earmark.*amount)/.test(n)) map.earmarkAmount = h
        else if (!map.budget && /(budget)/.test(n)) map.budget = h
        else if (!map.budgetAmount && /(budget.*betrag|budget.*amount)/.test(n)) map.budgetAmount = h
        else if (!map.tags && /(tag|tags|schlagwort)/.test(n)) map.tags = h
        else if (!map.bankIn && /bank|konto/.test(n) && (/\+/.test(n) || /(ein|eingang|einnahm)/.test(n))) map.bankIn = h
        else if (!map.bankOut && /bank|konto/.test(n) && (/-/.test(n) || /(ausgab|ausgang)/.test(n))) map.bankOut = h
        else if (!map.cashIn && /(bar|kasse|barkonto)/.test(n) && (/\+/.test(n) || /(ein|einnahm)/.test(n))) map.cashIn = h
        else if (!map.cashOut && /(bar|kasse|barkonto)/.test(n) && (/-/.test(n) || /(ausgab)/.test(n))) map.cashOut = h
    }
    return map
}

function parseTagsValue(v: any): string[] {
    if (v == null || v === '') return []
    const seen = new Set<string>()
    const tags: string[] = []
    for (const part of String(v).split(/[;,]/)) {
        const name = part.trim()
        const key = name.toLowerCase()
        if (!name || seen.has(key)) continue
        seen.add(key)
        tags.push(name)
    }
    return tags
}

function loadTagNameSet(d = getDb()): Set<string> {
    const rows = d.prepare('SELECT name FROM tags').all() as any[]
    return new Set(rows.map(r => String(r.name || '').trim().toLowerCase()).filter(Boolean))
}

function rememberNewTags(tags: string[], knownTags: Set<string>, newTags: Set<string>) {
    for (const tag of tags) {
        const key = tag.trim().toLowerCase()
        if (!key || knownTags.has(key)) continue
        knownTags.add(key)
        newTags.add(tag.trim())
    }
}

type LookupOption = { id: number; label: string }

function buildPaymentAccountOptions(d = getDb()): LookupOption[] {
    const rows = d.prepare(`
        SELECT id, name, kind
        FROM payment_accounts
        WHERE is_active = 1
        ORDER BY sort_order ASC, name COLLATE NOCASE ASC, id ASC
    `).all() as Array<{ id: number; name: string; kind: string }>
    return rows.map((row) => ({
        id: row.id,
        label: `#${row.id} | ${row.name} [${row.kind}]`
    }))
}

function buildBudgetOptions(d = getDb()): LookupOption[] {
    const rows = d.prepare(`
        SELECT id, year, sphere, name, category_name as categoryName, project_name as projectName, is_archived as isArchived
        FROM budgets
        ORDER BY is_archived ASC, year DESC, sphere ASC, COALESCE(name, category_name, project_name, '') COLLATE NOCASE ASC, id ASC
    `).all() as Array<{ id: number; year: number; sphere: string; name?: string | null; categoryName?: string | null; projectName?: string | null; isArchived?: number }>
    return rows.map((row) => {
        const base = row.name || row.categoryName || row.projectName || `Budget ${row.id}`
        const archived = row.isArchived ? ' [archiviert]' : ''
        return { id: row.id, label: `#${row.id} | ${row.year} · ${row.sphere} · ${base}${archived}` }
    })
}

function buildEarmarkOptions(d = getDb()): LookupOption[] {
    const rows = d.prepare(`
        SELECT id, code, name, is_active as isActive
        FROM earmarks
        ORDER BY code COLLATE NOCASE ASC, name COLLATE NOCASE ASC, id ASC
    `).all() as Array<{ id: number; code: string; name: string; isActive?: number }>
    return rows.map((row) => ({
        id: row.id,
        label: `#${row.id} | ${row.code} · ${row.name}${row.isActive === 0 ? ' [inaktiv]' : ''}`
    }))
}

function buildTagOptions(d = getDb()): string[] {
    const rows = d.prepare(`SELECT name FROM tags ORDER BY name COLLATE NOCASE ASC`).all() as Array<{ name: string }>
    return rows.map((row) => row.name).filter(Boolean)
}

function extractIdFromLookup(value: any): number | undefined {
    if (value == null || value === '') return undefined
    if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
    const text = String(value).trim()
    const match = /^#?\s*(\d+)\b/.exec(text)
    return match ? Number(match[1]) : undefined
}

function normalizeLookupKey(value: any): string {
    return String(value ?? '').trim().toLowerCase()
}

function findLookupId(
    value: any,
    options: LookupOption[],
    aliases: string[] = []
): number | undefined {
    const directId = extractIdFromLookup(value)
    if (directId != null) return directId
    const key = normalizeLookupKey(value)
    if (!key) return undefined
    const byLabel = options.find((option) => normalizeLookupKey(option.label) === key)
    if (byLabel) return byLabel.id
    if (aliases.length > 0) {
        const byAlias = options.find((option, index) => normalizeLookupKey(aliases[index]) === key)
        if (byAlias) return byAlias.id
    }
    return undefined
}

function ensureLookupSheet(wb: ExcelJS.Workbook, name = 'Listen') {
    const existing = wb.getWorksheet(name)
    if (existing) return existing
    const ws = wb.addWorksheet(name)
    ws.state = 'hidden'
    return ws
}

function populateLookupSheet(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet) {
    const paymentAccounts = buildPaymentAccountOptions()
    const budgets = buildBudgetOptions()
    const earmarks = buildEarmarkOptions()
    const tags = buildTagOptions()
    const paymentAccountLabels = paymentAccounts.length ? paymentAccounts.map((option) => option.label) : ['']
    const budgetLabels = budgets.length ? budgets.map((option) => option.label) : ['']
    const earmarkLabels = earmarks.length ? earmarks.map((option) => option.label) : ['']
    const tagLabels = tags.length ? tags : ['']

    ws.getCell('A1').value = 'Konten'
    paymentAccountLabels.forEach((label, index) => { ws.getCell(index + 2, 1).value = label })
    ws.getCell('B1').value = 'Budgets'
    budgetLabels.forEach((label, index) => { ws.getCell(index + 2, 2).value = label })
    ws.getCell('C1').value = 'Zweckbindungen'
    earmarkLabels.forEach((label, index) => { ws.getCell(index + 2, 3).value = label })
    ws.getCell('D1').value = 'Tags'
    tagLabels.forEach((tag, index) => { ws.getCell(index + 2, 4).value = tag })
    ws.columns = [{ width: 36 }, { width: 44 }, { width: 40 }, { width: 24 }]

    const definedNames = (wb as any).definedNames
    definedNames.add(`'${ws.name}'!$A$2:$A$${paymentAccountLabels.length + 1}`, 'PaymentAccounts')
    definedNames.add(`'${ws.name}'!$B$2:$B$${budgetLabels.length + 1}`, 'Budgets')
    definedNames.add(`'${ws.name}'!$C$2:$C$${earmarkLabels.length + 1}`, 'Earmarks')
    definedNames.add(`'${ws.name}'!$D$2:$D$${tagLabels.length + 1}`, 'TagsList')
}

function addListValidation(ws: ExcelJS.Worksheet, range: string, formula: string) {
    ; (ws as any).dataValidations?.add(range, { type: 'list', allowBlank: true, formulae: [formula] })
}

export async function previewXlsx(base64: string): Promise<ImportPreview> {
    const wb = new ExcelJS.Workbook()
    const buf = NodeBuffer.from(base64, 'base64')
    await (wb as any).xlsx.load(buf as any)
    const pick = pickWorksheet(wb)
    if (!pick) throw new Error('Keine Tabelle gefunden')
    const { ws, headerRowIdx, headers, idxByHeader } = pick
    const sample: any[] = []
    const maxR = Math.min(ws.actualRowCount, headerRowIdx + 20)
    for (let r = headerRowIdx + 1; r <= maxR; r++) {
        const rowObj: any = {}
        headers.forEach((h, i) => {
            const col = idxByHeader[h] || (i + 1)
            rowObj[h || `col${i + 1}`] = normalizeCellValue(ws.getRow(r).getCell(col).value)
        })
        sample.push(rowObj)
    }
    const suggestedMapping = suggestMapping(headers)
    return { headers, sample, suggestedMapping, headerRowIndex: headerRowIdx }
}

// --- CAMT.053 (ISO 20022) support ---
type CamtEntry = {
    date: string // booking date (YYYY-MM-DD)
    amount: number
    currency?: string
    creditDebit: 'CR' | 'DB'
    purpose?: string
    name?: string
    iban?: string
    endToEndId?: string
    entryRef?: string
}

function detectFileType(base64: string): 'XLSX' | 'CAMT' | 'UNKNOWN' {
    try {
        const head = NodeBuffer.from(base64.slice(0, 2000), 'base64')
        // ZIP magic for XLSX
        if (head.length >= 2 && head[0] === 0x50 && head[1] === 0x4b) return 'XLSX'
        const s = head.toString('utf8').trim().slice(0, 200).toLowerCase()
        if (s.includes('<?xml') && (s.includes('bk2cstmr') || s.includes('bktocstmr') || s.includes('camt.053') || s.includes('<document'))) return 'CAMT'
    } catch { }
    return 'UNKNOWN'
}

function toISODate(s?: string): string | undefined {
    if (!s) return undefined
    const m = /^([0-9]{4})-?([0-9]{2})-?([0-9]{2})/.exec(String(s))
    if (!m) return undefined
    return `${m[1]}-${m[2]}-${m[3]}`
}

function arrayify<T>(x: T | T[] | undefined | null): T[] { return x == null ? [] : (Array.isArray(x) ? x : [x]) }

function parseCamtXml(xml: string): CamtEntry[] {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text' })
    const doc: any = parser.parse(xml)
    // camt messages may use Document.BkToCstmrStmt (camt.053) or BkToCstmrAcctRpt (camt.052)
    const root = doc?.Document || doc?.['ns:Document'] || doc
    const stmt = root?.BkToCstmrStmt || root?.['ns:BkToCstmrStmt'] || root?.BkToCstmrAcctRpt || root?.['ns:BkToCstmrAcctRpt']
    if (!stmt) return []
    const stmts = arrayify(stmt.Stmt || stmt.Rpt)
    const entries: CamtEntry[] = []
    for (const s of stmts) {
        const ntries = arrayify(s.Ntry)
        for (const n of ntries) {
            const crdb = (n.CdtDbtInd || '').toString().toUpperCase() as 'CR' | 'DB'
            // Amount can be either as object with attributes or plain value
            let amt = n.Amt
            let amountStr = ''
            let currency: string | undefined
            if (amt && typeof amt === 'object') {
                amountStr = String(amt['#text'] ?? '')
                currency = String(amt['@_Ccy'] ?? amt['@_ccy'] ?? '') || undefined
            } else {
                amountStr = String(amt ?? '')
            }
            const amount = Number(amountStr.replace(',', '.'))
            const date = toISODate(n.BookgDt?.Dt || n.ValDt?.Dt || n.ValDt?.DtTm || n.BookgDt?.DtTm) || ''
            // Pull details: remittance, name, IBAN, endToEndId, entry ref
            let purpose = ''
            let name = ''
            let iban = ''
            let endToEndId = ''
            const ref = (n.NtryRef || '').toString()
            const dtlsArr = arrayify(n.NtryDtls?.TxDtls)
            for (const t of dtlsArr) {
                const rmt = t.RmtInf
                const u = rmt?.Ustrd
                if (u) {
                    const lines = arrayify<string>(u).map(v => String(v)).filter(Boolean)
                    const joined = lines.join(' | ')
                    if (joined) purpose = purpose ? purpose : joined
                }
                const rltd = t.RltdPties || t.RltdAgts
                const cdtr = rltd?.Cdtr || t.Cdtr
                const dbtr = rltd?.Dbtr || t.Dbtr
                const party = crdb === 'CR' ? dbtr : cdtr // counterparty: for CREDIT (incoming), the debtor paid us; for DEBIT (outgoing), the creditor received
                const nm = party?.Nm || party?.['Nm']
                if (nm && !name) name = String(nm)
                const acct = t.RltdAcct || party?.Acct
                const id = acct?.Id
                const ibanRaw = id?.IBAN || id?.Iban || id?.['IBAN']
                if (ibanRaw && !iban) iban = String(ibanRaw)
                const refs = t.RmtInf?.Strd?.CdtrRefInf?.Ref || t.RmtInf?.Strd?.CdtrRefInf?.Tp?.Cd || t.RmtInf?.Strd?.RfrdDocInf?.Nb
                const e2e = t.RmtInf?.Strd?.CdtrRefInf?.Ref || t.RmtInf?.Strd?.RfrdDocInf?.Nb || t.RmtInf?.Strd?.RfrdDocInf?.LineDtls?.Id || t.RmtInf?.Ustrd
                const e2e2 = t?.Refs?.EndToEndId || t?.Refs?.TxId
                if (!endToEndId) endToEndId = String(e2e2 || refs || e2e || '').trim()
            }
            if (!purpose) {
                const u2 = n?.AddtlNtryInf || n?.RmtInf?.Ustrd
                if (u2) purpose = arrayify<string>(u2).map(v => String(v)).join(' | ')
            }
            entries.push({ date, amount, currency, creditDebit: (crdb === 'CR' ? 'CR' : 'DB'), purpose: purpose || undefined, name: name || undefined, iban: iban || undefined, endToEndId: endToEndId || undefined, entryRef: ref || undefined })
        }
    }
    return entries
}

export async function previewCamt(base64: string): Promise<ImportPreview> {
    const xml = NodeBuffer.from(base64, 'base64').toString('utf8')
    const entries = parseCamtXml(xml)
    // Build synthetic table like CSV for mapping UI reuse
    const headers = ['Datum', 'Text', 'Bank +', 'Bank -', 'Währung', 'Gegenpartei', 'IBAN', 'EndToEndId', 'Ref']
    const sample = entries.slice(0, 50).map((e) => ({
        'Datum': e.date,
        'Text': [e.purpose, e.name].filter(Boolean).join(' · '),
        'Bank +': e.creditDebit === 'CR' ? (isFinite(e.amount) ? Number(Math.abs(e.amount).toFixed(2)) : '') : '',
        'Bank -': e.creditDebit === 'DB' ? (isFinite(e.amount) ? Number(Math.abs(e.amount).toFixed(2)) : '') : '',
        'Währung': e.currency || 'EUR',
        'Gegenpartei': e.name || '',
        'IBAN': e.iban || '',
        'EndToEndId': e.endToEndId || '',
        'Ref': e.entryRef || ''
    }))
    const suggestedMapping: Record<string, string | null> = {
        date: 'Datum', type: null, sphere: null, description: 'Text', paymentMethod: null, netAmount: null, vatRate: null, grossAmount: null, inGross: null, outGross: null, earmarkCode: null,
        tags: null, bankIn: 'Bank +', bankOut: 'Bank -', cashIn: null, cashOut: null, defaultSphere: 'IDEELL'
    }
    return { headers, sample, suggestedMapping, headerRowIndex: 1 }
}

export async function executeCamt(base64: string, mapping: Record<FieldKey, string | null>): Promise<ImportExecuteResult & { errorFilePath?: string }> {
    const xml = NodeBuffer.from(base64, 'base64').toString('utf8')
    const entries = parseCamtXml(xml)
    const d = getDb()
    let imported = 0, skipped = 0
    const errors: Array<{ row: number; message: string }> = []
    const rowStatuses: Array<{ row: number; ok: boolean; message?: string }> = []
    const track = (row: number, ok: boolean, message?: string) => { if (rowStatuses.length < 1000) rowStatuses.push({ row, ok, message }) }
    const defaultSphere = (mapping?.defaultSphere as any) as ('IDEELL' | 'ZWECK' | 'VERMOEGEN' | 'WGB') || 'IDEELL'

    let row = 2 // pretend header at 1
    for (const e of entries) {
        try {
            if (!e.date || !isFinite(e.amount)) { skipped++; track(row, false, 'Kein Datum oder Betrag'); row++; continue }
            const amount = Math.abs(Number(e.amount))
            const type = e.creditDebit === 'CR' ? 'IN' : 'OUT'
            const description = [e.purpose, e.name, e.endToEndId].filter(Boolean).join(' · ').slice(0, 255)
            // Duplicate detection: same date + amount + description (first 120 chars)
            const descKey = description.slice(0, 120)
            const dup = d.prepare("SELECT id FROM vouchers WHERE date = ? AND payment_method = 'BANK' AND ROUND(gross_amount, 2) = ROUND(?, 2) AND COALESCE(description,'') LIKE ? LIMIT 1").get(e.date, amount, descKey + '%') as any
            if (dup?.id) { skipped++; track(row, false, 'Duplikat erkannt'); row++; continue }
            await Promise.resolve(createVoucher({ date: e.date, type: type as any, sphere: defaultSphere, description, paymentMethod: 'BANK', vatRate: 0, grossAmount: amount }))
            imported++
            track(row, true)
        } catch (err: any) {
            skipped++
            const msg = err?.message || String(err)
            errors.push({ row, message: msg })
            track(row, false, msg)
        }
        row++
    }
    return { imported, skipped, errors, rowStatuses, newTags: [] }
}

export async function previewFile(base64: string): Promise<ImportPreview> {
    const t = detectFileType(base64)
    if (t === 'CAMT') return previewCamt(base64)
    // default to XLSX
    return previewXlsx(base64)
}

export async function executeFile(base64: string, mapping: Record<FieldKey, string | null>): Promise<ImportExecuteResult & { errorFilePath?: string }> {
    const t = detectFileType(base64)
    const db = getDb()
    let res: ImportExecuteResult & { errorFilePath?: string }
    if (t === 'CAMT') res = await executeCamt(base64, mapping)
    else res = await executeXlsx(base64, mapping)
    try {
        // Persist a compact audit entry for the Import Log modal
        writeAudit(db as any, null, 'imports', 0, 'EXECUTE', {
            format: t,
            imported: res.imported,
            skipped: res.skipped,
            errorCount: (res.errors?.length) || 0,
            newTagCount: (res.newTags?.length) || 0,
            errorFilePath: res.errorFilePath || null,
            when: new Date().toISOString()
        })
    } catch { /* ignore audit failures */ }
    return res
}

function parseEnum<T extends string>(v: any, set: readonly T[], fallback?: T): T | undefined {
    if (v == null) return fallback
    const s = String(v).trim().toUpperCase()
    const m = set.find(x => x === s)
    return m ?? fallback
}

function parseNumber(v: any): number | undefined {
    if (v == null || v === '') return undefined
    if (typeof v === 'number') return v
    const s = String(v)
        .replace(/\u00A0/g, ' ')
        .replace(/[€\s]/g, '')
        .replace(/\./g, '')
        .replace(',', '.')
    const n = Number(s)
    return isFinite(n) ? n : undefined
}

function parseDate(v: any): string | undefined {
    if (v == null) return undefined
    if (v instanceof Date) return v.toISOString().slice(0, 10)
    if (typeof v === 'number' && isFinite(v)) {
        // Excel serial date
        const ms = (v - 25569) * 24 * 60 * 60 * 1000
        return new Date(ms).toISOString().slice(0, 10)
    }
    const s = String(v).trim()
    // Try common formats: DD.MM.YYYY or YYYY-MM-DD
    const dm = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s)
    if (dm) {
        const d = new Date(Date.UTC(Number(dm[3]), Number(dm[2]) - 1, Number(dm[1])))
        return d.toISOString().slice(0, 10)
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
    // Excel serial?
    const n = Number(s)
    if (isFinite(n) && n > 25569) { // Excel serial date (approx)
        const ms = (n - 25569) * 24 * 60 * 60 * 1000
        return new Date(ms).toISOString().slice(0, 10)
    }
    return undefined
}

function getImportLookups(d = getDb()) {
    const paymentAccounts = buildPaymentAccountOptions(d)
    const paymentAccountAliases = (d.prepare(`SELECT id, name FROM payment_accounts`).all() as Array<{ id: number; name: string }>)
        .map((row) => row.name)
    const budgets = buildBudgetOptions(d)
    const budgetAliases = (d.prepare(`
        SELECT id, year, sphere, name, category_name as categoryName, project_name as projectName
        FROM budgets
    `).all() as Array<{ id: number; year: number; sphere: string; name?: string | null; categoryName?: string | null; projectName?: string | null }>)
        .map((row) => row.name || row.categoryName || row.projectName || `${row.year} ${row.sphere} ${row.id}`)
    const earmarks = buildEarmarkOptions(d)
    const earmarkAliases = (d.prepare(`SELECT id, code, name FROM earmarks`).all() as Array<{ id: number; code: string; name: string }>)
        .map((row) => `${row.code} ${row.name}`)
    const tags = buildTagOptions(d)
    return {
        paymentAccounts,
        paymentAccountAliases,
        budgets,
        budgetAliases,
        earmarks,
        earmarkAliases,
        tags
    }
}

function uniqueSorted(values: Iterable<string>) {
    return Array.from(new Set(Array.from(values).map((v) => String(v || '').trim()).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, 'de'))
}

function getRowValue(
    ws: ExcelJS.Worksheet,
    idxByHeader: Record<string, number>,
    mapping: Record<FieldKey, string | null>,
    rowNumber: number,
    key: FieldKey
) {
    const h = mapping[key]
    if (!h) return undefined
    const col = idxByHeader[h]
    return col ? normalizeCellValue(ws.getRow(rowNumber).getCell(col).value) : undefined
}

function looksLikeSummaryRow(rawDate: any, description: any) {
    const txt = [rawDate, description].map(x => (x == null ? '' : String(x))).join(' ').toLowerCase()
    return /ergebnis|summe|saldo/.test(txt)
}

function applyImportRules(values: Record<string, any>, rules?: ImportRule[]) {
    for (const rule of rules || []) {
        if (rule.enabled === false) continue
        const needle = String(rule.contains || '').trim().toLowerCase()
        if (!needle) continue
        const hay = String(values[rule.sourceField] ?? '').toLowerCase()
        if (!hay.includes(needle)) continue
        if (rule.targetField === 'tags') {
            const current = parseTagsValue(values.tags)
            const additions = parseTagsValue(rule.value)
            values.tags = uniqueSorted([...current, ...additions]).join('; ')
        } else {
            values[rule.targetField] = rule.value
        }
    }
}

function issue(level: ImportDraftIssue['level'], code: string, message: string): ImportDraftIssue {
    return { level, code, message }
}

function statusFromIssues(issues: ImportDraftIssue[], duplicateIds: number[]): ImportDraftRow['status'] {
    if (issues.some((i) => i.level === 'error')) return 'error'
    if (duplicateIds.length > 0) return 'duplicate'
    if (issues.some((i) => i.level === 'warning')) return 'warning'
    return 'ok'
}

function detectDuplicateIds(d: ReturnType<typeof getDb>, values: Record<string, any>) {
    const date = parseDate(values.date)
    const gross = parseNumber(values.grossAmount)
    const desc = String(values.description || '').trim().slice(0, 80)
    if (!date || gross == null || !desc) return []
    const rows = d.prepare(`
        SELECT id
        FROM vouchers
        WHERE date = ?
          AND ROUND(gross_amount, 2) = ROUND(?, 2)
          AND COALESCE(description, '') LIKE ?
        ORDER BY id DESC
        LIMIT 5
    `).all(date, Math.abs(gross), desc + '%') as Array<{ id: number }>
    return rows.map((row) => Number(row.id)).filter(Boolean)
}

function normalizeDraftValues(
    values: Record<string, any>,
    lookups: ReturnType<typeof getImportLookups>,
    d: ReturnType<typeof getDb>
) {
    const issues: ImportDraftIssue[] = []
    const date = parseDate(values.date)
    if (!date) issues.push(issue('error', 'date', 'Datum fehlt oder ist unklar.'))
    values.date = date || String(values.date ?? '')

    const type = parseEnum(values.type, ['IN', 'OUT', 'TRANSFER', 'INTERNAL'] as const)
    const sphere = parseEnum(values.sphere, ['IDEELL', 'ZWECK', 'VERMOEGEN', 'WGB'] as const) || 'IDEELL'
    values.type = type || ''
    values.sphere = sphere

    const paymentMethod = parseEnum(values.paymentMethod, ['BAR', 'BANK'] as const)
    const paymentAccountId = findLookupId(values.paymentAccount, lookups.paymentAccounts, lookups.paymentAccountAliases)
    const paymentAccount = paymentAccountId != null ? getPaymentAccountById(paymentAccountId, d) : undefined
    values.paymentAccountId = paymentAccountId ?? null
    values.paymentMethod = paymentMethodForAccountKind(paymentAccount?.kind) ?? paymentMethod ?? values.paymentMethod ?? ''
    if (values.paymentAccount && paymentAccountId == null) {
        issues.push(issue('warning', 'paymentAccount', `Konto nicht gefunden: ${values.paymentAccount}`))
    }

    const budgetId = findLookupId(values.budget, lookups.budgets, lookups.budgetAliases)
    values.budgetId = budgetId ?? null
    if (values.budget && budgetId == null) issues.push(issue('warning', 'budget', `Budget nicht gefunden: ${values.budget}`))

    const earmarkId = findLookupId(values.earmarkCode, lookups.earmarks, lookups.earmarkAliases)
    values.earmarkId = earmarkId ?? null
    if (values.earmarkCode && earmarkId == null) issues.push(issue('warning', 'earmark', `Zweckbindung nicht gefunden: ${values.earmarkCode}`))

    const grossAmount = parseNumber(values.grossAmount)
    const netAmount = parseNumber(values.netAmount)
    values.grossAmount = grossAmount ?? ''
    values.netAmount = netAmount ?? ''
    values.vatRate = parseNumber(values.vatRate) ?? 0
    values.budgetAmount = parseNumber(values.budgetAmount) ?? ''
    values.earmarkAmount = parseNumber(values.earmarkAmount) ?? ''

    if (grossAmount == null && netAmount == null) issues.push(issue('error', 'amount', 'Kein Betrag erkannt.'))
    if (!type && grossAmount != null) values.type = grossAmount < 0 ? 'OUT' : 'IN'
    if (!values.type) issues.push(issue('warning', 'type', 'Art fehlt; VereinO nimmt IN an.'))

    const knownTags = new Set(lookups.tags.map((tag) => tag.trim().toLowerCase()))
    const tags = parseTagsValue(values.tags)
    values.tags = tags.join('; ')
    const missingTags = tags.filter((tag) => !knownTags.has(tag.trim().toLowerCase()))
    if (missingTags.length > 0) issues.push(issue('info', 'tags', `Neue Tags: ${missingTags.join(', ')}`))

    const duplicateIds = detectDuplicateIds(d, { ...values, grossAmount: grossAmount ?? netAmount })
    if (duplicateIds.length > 0) issues.push(issue('warning', 'duplicate', `Mögliches Duplikat: Buchung #${duplicateIds[0]}`))

    return { issues, duplicateIds }
}

function buildDraftRow(
    id: string,
    sourceRow: number,
    original: Record<string, any>,
    values: Record<string, any>,
    lookups: ReturnType<typeof getImportLookups>,
    rules: ImportRule[] | undefined,
    d: ReturnType<typeof getDb>
): ImportDraftRow {
    applyImportRules(values, rules)
    const { issues, duplicateIds } = normalizeDraftValues(values, lookups, d)
    return {
        id,
        sourceRow,
        status: statusFromIssues(issues, duplicateIds),
        duplicateAction: duplicateIds.length ? 'skip' : 'import',
        duplicateIds,
        issues,
        original,
        values
    }
}

async function analyzeCamtFile(
    base64: string,
    mapping: Record<FieldKey, string | null>,
    rules?: ImportRule[]
): Promise<ImportAnalyzeResult> {
    const xml = NodeBuffer.from(base64, 'base64').toString('utf8')
    const entries = parseCamtXml(xml)
    const preview = await previewCamt(base64)
    const d = getDb()
    const lookups = getImportLookups(d)
    const rows = entries.map((entry, index) => {
        const original = {
            'Datum': entry.date,
            'Text': [entry.purpose, entry.name].filter(Boolean).join(' · '),
            'Bank +': entry.creditDebit === 'CR' ? Math.abs(entry.amount) : '',
            'Bank -': entry.creditDebit === 'DB' ? Math.abs(entry.amount) : '',
            'Währung': entry.currency || 'EUR',
            'Gegenpartei': entry.name || '',
            'IBAN': entry.iban || '',
            'EndToEndId': entry.endToEndId || '',
            'Ref': entry.entryRef || ''
        }
        const valueFor = (key: FieldKey) => {
            const mapped = mapping[key]
            return mapped ? (original as any)[mapped] : undefined
        }
        const values: Record<string, any> = {
            voucherId: '',
            voucherNo: valueFor('voucherNo') ?? '',
            date: valueFor('date') ?? entry.date,
            type: entry.creditDebit === 'CR' ? 'IN' : 'OUT',
            sphere: valueFor('sphere') ?? mapping.defaultSphere ?? 'IDEELL',
            description: valueFor('description') ?? original.Text,
            note: valueFor('note') ?? '',
            paymentMethod: valueFor('paymentMethod') ?? 'BANK',
            paymentAccount: valueFor('paymentAccount') ?? '',
            grossAmount: Math.abs(entry.amount),
            netAmount: valueFor('netAmount') ?? '',
            vatRate: valueFor('vatRate') ?? 0,
            budget: valueFor('budget') ?? '',
            budgetAmount: valueFor('budgetAmount') ?? '',
            earmarkCode: valueFor('earmarkCode') ?? '',
            earmarkAmount: valueFor('earmarkAmount') ?? '',
            tags: valueFor('tags') ?? ''
        }
        return buildDraftRow(`${index + 2}:camt`, index + 2, original, values, lookups, rules, d)
    })
    const missing = {
        tags: uniqueSorted(rows.flatMap((row) => parseTagsValue(row.values.tags)).filter((tag) => !lookups.tags.map((t) => t.toLowerCase()).includes(tag.toLowerCase()))),
        budgets: uniqueSorted(rows.filter((row) => row.values.budget && !row.values.budgetId).map((row) => String(row.values.budget))),
        earmarks: uniqueSorted(rows.filter((row) => row.values.earmarkCode && !row.values.earmarkId).map((row) => String(row.values.earmarkCode))),
        paymentAccounts: uniqueSorted(rows.filter((row) => row.values.paymentAccount && !row.values.paymentAccountId).map((row) => String(row.values.paymentAccount)))
    }
    const summary = {
        total: rows.length,
        ok: rows.filter((row) => row.status === 'ok').length,
        warnings: rows.filter((row) => row.status === 'warning').length,
        errors: rows.filter((row) => row.status === 'error').length,
        duplicates: rows.filter((row) => row.status === 'duplicate').length,
        ignored: rows.filter((row) => row.status === 'ignored').length
    }
    return {
        ...preview,
        rows,
        summary,
        missing,
        lookup: {
            paymentAccounts: lookups.paymentAccounts,
            budgets: lookups.budgets,
            earmarks: lookups.earmarks,
            tags: lookups.tags
        }
    }
}

export async function analyzeFile(
    base64: string,
    mapping: Record<FieldKey, string | null>,
    rules?: ImportRule[]
): Promise<ImportAnalyzeResult> {
    if (detectFileType(base64) === 'CAMT') return analyzeCamtFile(base64, mapping, rules)
    const wb = new ExcelJS.Workbook()
    const buf = NodeBuffer.from(base64, 'base64')
    await (wb as any).xlsx.load(buf as any)
    const pick = pickWorksheet(wb)
    if (!pick) throw new Error('Keine Tabelle gefunden')
    const { ws, headerRowIdx, headers, idxByHeader } = pick
    const d = getDb()
    const lookups = getImportLookups(d)
    const suggestedMapping = suggestMapping(headers)
    const rows: ImportDraftRow[] = []

    for (let r = headerRowIdx + 1; r <= ws.actualRowCount; r++) {
        const original: Record<string, any> = {}
        headers.forEach((h, i) => {
            const col = idxByHeader[h] || (i + 1)
            original[h || `col${i + 1}`] = normalizeCellValue(ws.getRow(r).getCell(col).value)
        })
        const get = (key: FieldKey) => getRowValue(ws, idxByHeader, mapping, r, key)
        const rawDate = get('date')
        const description = get('description')
        if (looksLikeSummaryRow(rawDate, description)) {
            rows.push({
                id: `${r}:ignored`,
                sourceRow: r,
                status: 'ignored',
                duplicateAction: 'skip',
                duplicateIds: [],
                issues: [issue('info', 'summary', 'Summen-/Saldozeile wird übersprungen.')],
                original,
                values: { date: rawDate ?? '', description: description ?? '' }
            })
            continue
        }

        const baseValues: Record<string, any> = {
            voucherId: get('voucherId') ?? '',
            voucherNo: get('voucherNo') ?? '',
            date: rawDate ?? '',
            type: get('type') ?? '',
            sphere: get('sphere') ?? mapping.defaultSphere ?? 'IDEELL',
            description: description ?? '',
            note: get('note') ?? '',
            paymentMethod: get('paymentMethod') ?? '',
            paymentAccount: get('paymentAccount') ?? '',
            netAmount: get('netAmount') ?? '',
            vatRate: get('vatRate') ?? 0,
            grossAmount: get('grossAmount') ?? '',
            budget: get('budget') ?? '',
            budgetAmount: get('budgetAmount') ?? '',
            earmarkCode: get('earmarkCode') ?? '',
            earmarkAmount: get('earmarkAmount') ?? '',
            tags: get('tags') ?? ''
        }

        const ops: Array<{ suffix: string; type: 'IN' | 'OUT'; paymentMethod?: 'BAR' | 'BANK'; amount: number }> = []
        const bankIn = parseNumber(get('bankIn'))
        const bankOut = parseNumber(get('bankOut'))
        const cashIn = parseNumber(get('cashIn'))
        const cashOut = parseNumber(get('cashOut'))
        const inGross = parseNumber(get('inGross'))
        const outGross = parseNumber(get('outGross'))
        if (bankIn != null && bankIn !== 0) ops.push({ suffix: 'bankIn', type: 'IN', paymentMethod: 'BANK', amount: Math.abs(bankIn) })
        if (bankOut != null && bankOut !== 0) ops.push({ suffix: 'bankOut', type: 'OUT', paymentMethod: 'BANK', amount: Math.abs(bankOut) })
        if (cashIn != null && cashIn !== 0) ops.push({ suffix: 'cashIn', type: 'IN', paymentMethod: 'BAR', amount: Math.abs(cashIn) })
        if (cashOut != null && cashOut !== 0) ops.push({ suffix: 'cashOut', type: 'OUT', paymentMethod: 'BAR', amount: Math.abs(cashOut) })
        if (inGross != null && inGross !== 0) ops.push({ suffix: 'inGross', type: 'IN', amount: Math.abs(inGross) })
        if (outGross != null && outGross !== 0) ops.push({ suffix: 'outGross', type: 'OUT', amount: Math.abs(outGross) })

        if (ops.length > 0) {
            for (const op of ops) {
                rows.push(buildDraftRow(`${r}:${op.suffix}`, r, original, {
                    ...baseValues,
                    type: op.type,
                    paymentMethod: op.paymentMethod ?? baseValues.paymentMethod,
                    grossAmount: op.amount
                }, lookups, rules, d))
            }
        } else {
            rows.push(buildDraftRow(`${r}:main`, r, original, baseValues, lookups, rules, d))
        }
    }

    const missing = {
        tags: uniqueSorted(rows.flatMap((row) => parseTagsValue(row.values.tags)).filter((tag) => !lookups.tags.map((t) => t.toLowerCase()).includes(tag.toLowerCase()))),
        budgets: uniqueSorted(rows.filter((row) => row.values.budget && !row.values.budgetId).map((row) => String(row.values.budget))),
        earmarks: uniqueSorted(rows.filter((row) => row.values.earmarkCode && !row.values.earmarkId).map((row) => String(row.values.earmarkCode))),
        paymentAccounts: uniqueSorted(rows.filter((row) => row.values.paymentAccount && !row.values.paymentAccountId).map((row) => String(row.values.paymentAccount)))
    }
    const summary = {
        total: rows.length,
        ok: rows.filter((row) => row.status === 'ok').length,
        warnings: rows.filter((row) => row.status === 'warning').length,
        errors: rows.filter((row) => row.status === 'error').length,
        duplicates: rows.filter((row) => row.status === 'duplicate').length,
        ignored: rows.filter((row) => row.status === 'ignored').length
    }
    const sample = rows.slice(0, 50).map((row) => row.original)
    return {
        headers,
        sample,
        suggestedMapping,
        headerRowIndex: headerRowIdx,
        rows,
        summary,
        missing,
        lookup: {
            paymentAccounts: lookups.paymentAccounts,
            budgets: lookups.budgets,
            earmarks: lookups.earmarks,
            tags: lookups.tags
        }
    }
}

function draftPayload(row: ImportDraftRow, d = getDb()) {
    const values = row.values || {}
    const date = parseDate(values.date)
    if (!date) throw new Error('Datum fehlt/ungültig')
    const type = parseEnum(values.type, ['IN', 'OUT', 'TRANSFER', 'INTERNAL'] as const, 'IN') || 'IN'
    const sphere = parseEnum(values.sphere, ['IDEELL', 'ZWECK', 'VERMOEGEN', 'WGB'] as const, 'IDEELL') || 'IDEELL'
    const paymentMethod = parseEnum(values.paymentMethod, ['BAR', 'BANK'] as const)
    const paymentAccountId = values.paymentAccountId != null
        ? Number(values.paymentAccountId)
        : findLookupId(values.paymentAccount, buildPaymentAccountOptions(d), (d.prepare(`SELECT id, name FROM payment_accounts`).all() as any[]).map((r) => r.name))
    const paymentAccount = paymentAccountId ? getPaymentAccountById(paymentAccountId, d) : undefined
    const resolvedPaymentMethod = paymentMethodForAccountKind(paymentAccount?.kind) ?? paymentMethod ?? undefined
    const grossAmount = parseNumber(values.grossAmount)
    const netAmount = parseNumber(values.netAmount)
    if (grossAmount == null && netAmount == null) throw new Error('Kein Betrag (Netto/Brutto)')
    const payload: any = {
        date,
        type,
        sphere,
        description: values.description != null ? String(values.description) : undefined,
        note: values.note != null ? String(values.note) : undefined,
        paymentMethod: resolvedPaymentMethod,
        paymentAccountId: paymentAccountId || undefined,
        vatRate: parseNumber(values.vatRate) ?? 0,
        tags: parseTagsValue(values.tags)
    }
    if (grossAmount != null) payload.grossAmount = Math.abs(grossAmount)
    else payload.netAmount = Math.abs(netAmount!)
    const budgetId = values.budgetId != null && values.budgetId !== '' ? Number(values.budgetId) : findLookupId(values.budget, buildBudgetOptions(d))
    if (budgetId) payload.budgetId = budgetId
    const budgetAmount = parseNumber(values.budgetAmount)
    if (budgetAmount != null) payload.budgetAmount = budgetAmount
    const earmarkId = values.earmarkId != null && values.earmarkId !== '' ? Number(values.earmarkId) : findLookupId(values.earmarkCode, buildEarmarkOptions(d))
    if (earmarkId) payload.earmarkId = earmarkId
    const earmarkAmount = parseNumber(values.earmarkAmount)
    if (earmarkAmount != null) payload.earmarkAmount = earmarkAmount
    return payload
}

export async function commitImportDraft(rows: ImportDraftRow[]): Promise<ImportDraftCommitResult> {
    const d = getDb()
    let imported = 0
    let skipped = 0
    const errors: Array<{ row: number; message: string }> = []
    const rowStatuses: Array<{ row: number; ok: boolean; message?: string }> = []
    const knownTags = loadTagNameSet(d)
    const newTags = new Set<string>()
    for (const row of rows) {
        try {
            if (row.status === 'ignored' || row.duplicateAction === 'skip') {
                skipped++
                rowStatuses.push({ row: row.sourceRow, ok: true, message: row.status === 'ignored' ? 'Übersprungen' : 'Duplikat übersprungen' })
                continue
            }
            if (row.status === 'error') throw new Error(row.issues.find((i) => i.level === 'error')?.message || 'Zeile enthält Fehler')
            const payload = draftPayload(row, d)
            const mergeId = row.duplicateAction === 'merge' ? row.duplicateIds?.[0] : undefined
            if (mergeId) await Promise.resolve(updateVoucher({ id: mergeId, ...payload }))
            else await Promise.resolve(createVoucher(payload))
            rememberNewTags(payload.tags || [], knownTags, newTags)
            imported++
            rowStatuses.push({ row: row.sourceRow, ok: true })
        } catch (e: any) {
            skipped++
            const message = e?.message || String(e)
            errors.push({ row: row.sourceRow, message })
            rowStatuses.push({ row: row.sourceRow, ok: false, message })
        }
    }
    return { imported, skipped, errors, rowStatuses, newTags: Array.from(newTags).sort((a, b) => a.localeCompare(b, 'de')) }
}

export function createMissingImportMasterData(input: Partial<ImportAnalyzeResult['missing']>) {
    const d = getDb()
    const created = { tags: 0, budgets: 0, earmarks: 0, paymentAccounts: 0 }
    for (const tag of input.tags || []) {
        if (ensureTag(d as any, tag)?.created) created.tags++
    }
    const year = new Date().getFullYear()
    for (const budget of input.budgets || []) {
        const name = String(budget || '').trim()
        if (!name) continue
        upsertBudget({ year, sphere: 'IDEELL', amountPlanned: 0, name })
        created.budgets++
    }
    for (const earmark of input.earmarks || []) {
        const raw = String(earmark || '').trim()
        if (!raw) continue
        const code = raw.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || `IMPORT-${created.earmarks + 1}`
        upsertBinding({ code, name: raw, isActive: true })
        created.earmarks++
    }
    for (const account of input.paymentAccounts || []) {
        const name = String(account || '').trim()
        if (!name) continue
        const kind = /(bar|cash|kasse)/i.test(name) ? 'CASH' : 'BANK'
        upsertPaymentAccount({ name, kind, isActive: true })
        created.paymentAccounts++
    }
    return created
}

export async function executeXlsx(base64: string, mapping: Record<FieldKey, string | null>): Promise<ImportExecuteResult & { errorFilePath?: string }> {
    const wb = new ExcelJS.Workbook()
    const buf = NodeBuffer.from(base64, 'base64')
    await (wb as any).xlsx.load(buf as any)
    const pick = pickWorksheet(wb)
    if (!pick) throw new Error('Keine Tabelle gefunden')
    const { ws, headerRowIdx, headers, idxByHeader } = pick

    // Earmark lookup cache
    const d = getDb()
    const earmarkIdByCode = new Map<string, number>()
    const knownTags = loadTagNameSet(d)
    const newTags = new Set<string>()
    const paymentAccountOptions = buildPaymentAccountOptions(d)
    const paymentAccountAliases = (d.prepare(`SELECT id, name FROM payment_accounts`).all() as Array<{ id: number; name: string }>)
        .map((row) => row.name)
    const budgetOptions = buildBudgetOptions(d)
    const budgetAliases = (d.prepare(`
        SELECT id, year, sphere, name, category_name as categoryName, project_name as projectName
        FROM budgets
    `).all() as Array<{ id: number; year: number; sphere: string; name?: string | null; categoryName?: string | null; projectName?: string | null }>)
        .map((row) => row.name || row.categoryName || row.projectName || `${row.year} ${row.sphere} ${row.id}`)
    const earmarkOptions = buildEarmarkOptions(d)
    const earmarkAliases = (d.prepare(`SELECT id, code, name FROM earmarks`).all() as Array<{ id: number; code: string; name: string }>)
        .map((row) => `${row.code} ${row.name}`)

    let imported = 0, skipped = 0
    const errors: Array<{ row: number; message: string }> = []
    const rowStatuses: Array<{ row: number; ok: boolean; message?: string }> = []
    const track = (row: number, ok: boolean, message?: string) => {
        // Limit to first 1000 entries to avoid huge payloads
        if (rowStatuses.length < 1000) rowStatuses.push({ row, ok, message })
    }

    for (let r = headerRowIdx + 1; r <= ws.actualRowCount; r++) {
        try {
            const get = (key: FieldKey): any => {
                const h = mapping[key]
                if (!h) return undefined
                const col = idxByHeader[h]
                const raw = col ? ws.getRow(r).getCell(col).value : undefined
                return normalizeCellValue(raw)
            }
            const rawDate = get('date')
            const date = parseDate(rawDate)
            const voucherId = parseNumber(get('voucherId'))
            const voucherNo = get('voucherNo') != null ? String(get('voucherNo')).trim() : ''
            if (!date) {
                const txt = [rawDate, get('description')].map(x => (x == null ? '' : String(x))).join(' ').toLowerCase()
                if (/ergebnis|summe|saldo/.test(txt)) { skipped++; track(r, false, 'Summen-/Saldozeile übersprungen'); continue }
                throw new Error('Datum fehlt/ungültig')
            }
            const type = parseEnum(get('type'), ['IN', 'OUT', 'TRANSFER', 'INTERNAL'] as const)
            const sphere = parseEnum(get('sphere'), ['IDEELL', 'ZWECK', 'VERMOEGEN', 'WGB'] as const) || parseEnum(mapping['defaultSphere'] || 'IDEELL', ['IDEELL', 'ZWECK', 'VERMOEGEN', 'WGB'] as const) || 'IDEELL'
            const description = get('description') != null ? String(get('description')) : undefined
            const note = get('note') != null ? String(get('note')) : undefined
            const tags = parseTagsValue(get('tags'))
            const paymentMethod = parseEnum(get('paymentMethod'), ['BAR', 'BANK'] as const)
            const paymentAccountId = findLookupId(get('paymentAccount'), paymentAccountOptions, paymentAccountAliases)
            const paymentAccount = paymentAccountId != null ? getPaymentAccountById(paymentAccountId, d) : undefined
            const resolvedPaymentMethod = paymentMethodForAccountKind(paymentAccount?.kind) ?? paymentMethod ?? undefined
            let netAmount = parseNumber(get('netAmount'))
            let vatRate = parseNumber(get('vatRate')) ?? 19
            let grossAmount = parseNumber(get('grossAmount'))
            const inGross = parseNumber(get('inGross'))
            const outGross = parseNumber(get('outGross'))
            const budgetAmount = parseNumber(get('budgetAmount'))
            const earmarkAmount = parseNumber(get('earmarkAmount'))

            // Special columns: bank/cash in/out
            const bankIn = parseNumber(get('bankIn'))
            const bankOut = parseNumber(get('bankOut'))
            const cashIn = parseNumber(get('cashIn'))
            const cashOut = parseNumber(get('cashOut'))
            type Op = { pm: 'BAR' | 'BANK'; t: 'IN' | 'OUT'; amount: number }
            const ops: Op[] = []
            if (bankIn != null && bankIn !== 0) ops.push({ pm: 'BANK', t: 'IN', amount: Math.abs(bankIn) })
            if (bankOut != null && bankOut !== 0) ops.push({ pm: 'BANK', t: 'OUT', amount: Math.abs(bankOut) })
            if (cashIn != null && cashIn !== 0) ops.push({ pm: 'BAR', t: 'IN', amount: Math.abs(cashIn) })
            if (cashOut != null && cashOut !== 0) ops.push({ pm: 'BAR', t: 'OUT', amount: Math.abs(cashOut) })
            // If user supplied separate in/out columns (single paymentMethod), translate into ops
            if ((inGross != null && inGross !== 0) || (outGross != null && outGross !== 0)) {
                const pm = resolvedPaymentMethod || 'BANK'
                if (inGross != null && inGross !== 0) ops.push({ pm: pm as any, t: 'IN', amount: Math.abs(inGross) })
                if (outGross != null && outGross !== 0) ops.push({ pm: pm as any, t: 'OUT', amount: Math.abs(outGross) })
            }

            // Infer type from sign if not provided
            const signSource = grossAmount ?? netAmount
            let t: 'IN' | 'OUT' | 'TRANSFER' | 'INTERNAL' = (type as any) || 'IN'
            if (!type && signSource != null) {
                if (signSource < 0) t = 'OUT'
                else if (signSource > 0) t = 'IN'
            }
            // Normalize amounts: use absolute values
            if (grossAmount != null) grossAmount = Math.abs(grossAmount)
            if (netAmount != null) netAmount = Math.abs(netAmount)

            // Earmark by code
            let earmarkId: number | undefined
            const earmarkCodeVal = get('earmarkCode')
            if (earmarkCodeVal != null && String(earmarkCodeVal).trim()) {
                const code = String(earmarkCodeVal).trim()
                const foundByLookup = findLookupId(code, earmarkOptions, earmarkAliases)
                if (foundByLookup != null) {
                    earmarkId = foundByLookup
                } else if (earmarkIdByCode.has(code)) {
                    earmarkId = earmarkIdByCode.get(code)
                } else {
                    const row = d.prepare('SELECT id FROM earmarks WHERE code = ?').get(code) as any
                    if (row?.id) { earmarkIdByCode.set(code, row.id); earmarkId = row.id }
                    else throw new Error(`Zweckbindung nicht gefunden: ${code}`)
                }
            }
            const budgetId = findLookupId(get('budget'), budgetOptions, budgetAliases)

            const existing = (() => {
                if (voucherId != null && Number.isFinite(voucherId) && voucherId > 0) {
                    const row = d.prepare('SELECT id FROM vouchers WHERE id = ?').get(Number(voucherId)) as any
                    if (row?.id) return row
                }
                if (voucherNo) {
                    const row = d.prepare('SELECT id FROM vouchers WHERE voucher_no = ?').get(voucherNo) as any
                    if (row?.id) return row
                }
                return null
            })()

            if (ops.length > 0) {
                if (existing?.id) throw new Error('Bestehende Buchungen mit Split-Spalten können nicht per Sammelzeile aktualisiert werden. Bitte Brutto/Netto verwenden.')
                // From bank/cash columns; create one voucher per non-zero op
                for (const op of ops) {
                    const payload: any = { date, type: op.t, sphere, description, note, paymentMethod: op.pm, paymentAccountId, vatRate: 0, grossAmount: op.amount }
                    if (earmarkId != null) payload.earmarkId = earmarkId
                    if (earmarkAmount != null) payload.earmarkAmount = earmarkAmount
                    if (budgetId != null) payload.budgetId = budgetId
                    if (budgetAmount != null) payload.budgetAmount = budgetAmount
                    if (tags.length) payload.tags = tags
                    await Promise.resolve(createVoucher(payload))
                    rememberNewTags(tags, knownTags, newTags)
                    imported++
                }
                track(r, true)
            } else {
                if (existing?.id) {
                    const payload: any = { id: existing.id, date, type: t, sphere, description, note, vatRate }
                    if (paymentAccountId !== undefined) payload.paymentAccountId = paymentAccountId
                    if (resolvedPaymentMethod !== undefined) payload.paymentMethod = resolvedPaymentMethod
                    if (grossAmount != null) payload.grossAmount = Math.abs(grossAmount)
                    else if (netAmount != null) payload.netAmount = Math.abs(netAmount)
                    if (earmarkId !== undefined) payload.earmarkId = earmarkId ?? null
                    if (earmarkAmount !== undefined) payload.earmarkAmount = earmarkAmount ?? null
                    if (budgetId !== undefined) payload.budgetId = budgetId ?? null
                    if (budgetAmount !== undefined) payload.budgetAmount = budgetAmount ?? null
                    payload.tags = tags
                    await Promise.resolve(updateVoucher(payload))
                    rememberNewTags(tags, knownTags, newTags)
                    imported++
                } else {
                    // Build payload: prefer gross if present
                    const payload: any = { date, type: t, sphere, description, note, paymentMethod: resolvedPaymentMethod, paymentAccountId, vatRate }
                    if (grossAmount != null) payload.grossAmount = grossAmount
                    else if (netAmount != null) payload.netAmount = netAmount
                    else { skipped++; track(r, false, 'Kein Betrag (Netto/Brutto)'); continue }
                    if (earmarkId != null) payload.earmarkId = earmarkId
                    if (earmarkAmount != null) payload.earmarkAmount = earmarkAmount
                    if (budgetId != null) payload.budgetId = budgetId
                    if (budgetAmount != null) payload.budgetAmount = budgetAmount
                    if (tags.length) payload.tags = tags
                    await Promise.resolve(createVoucher(payload))
                    rememberNewTags(tags, knownTags, newTags)
                    imported++
                }
                track(r, true)
            }
        } catch (e: any) {
            skipped++
            errors.push({ row: r, message: e?.message || String(e) })
            track(r, false, e?.message || String(e))
        }
    }
    // If there are errors, write an Excel file with the failed rows for easier correction
    let errorFilePath: string | undefined
    if (errors.length > 0) {
        const errWb = new ExcelJS.Workbook()
        const errWs = errWb.addWorksheet('Fehler')
        // Columns: Zeile + original headers + Fehler
        const headersWithMeta = ['Zeile', ...headers, 'Fehler']
        errWs.addRow(headersWithMeta)
        for (const e of errors) {
            const rowVals: any[] = []
            rowVals.push(e.row)
            for (const h of headers) {
                const col = idxByHeader[h]
                const v = col ? ws.getRow(e.row).getCell(col).value : undefined
                rowVals.push(normalizeCellValue(v))
            }
            rowVals.push(e.message)
            errWs.addRow(rowVals)
        }
        try {
            const fs = await import('node:fs')
            const path = await import('node:path')
            const os = await import('node:os')
            const baseDir = path.join(os.homedir(), 'Documents', 'VereinPlannerExports')
            try { fs.mkdirSync(baseDir, { recursive: true }) } catch { }
            const when = new Date()
            const stamp = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}_${String(when.getHours()).padStart(2, '0')}${String(when.getMinutes()).padStart(2, '0')}${String(when.getSeconds()).padStart(2, '0')}`
            errorFilePath = path.join(baseDir, `Import_Fehler_${stamp}.xlsx`)
            await (errWb as any).xlsx.writeFile(errorFilePath)
        } catch { /* ignore file save errors */ }
    }
    return { imported, skipped, errors, rowStatuses, errorFilePath, newTags: Array.from(newTags).sort((a, b) => a.localeCompare(b, 'de')) }
}

// Heuristics: detect header row within first 20 rows
function detectHeader(ws: ExcelJS.Worksheet): { headerRowIdx: number; headers: string[]; idxByHeader: Record<string, number>; score: number } {
    const maxScan = Math.min(20, ws.actualRowCount)
    let bestIdx = 1
    let bestScore = -1
    let bestHeaders: string[] = []
    let bestIdxByHeader: Record<string, number> = {}
    for (let r = 1; r <= maxScan; r++) {
        const row = ws.getRow(r)
        const headers: string[] = []
        const cols: number[] = []
        let nonEmpty = 0
        row.eachCell((cell, colNumber) => {
            const v = String(normalizeCellValue(cell.value) ?? '').trim()
            headers.push(v)
            cols.push(colNumber)
            if (v) nonEmpty++
        })
        if (headers.length === 0 || nonEmpty < 2) continue
        const joined = headers.map(h => h.toLowerCase()).join(' | ')
        let score = 0
        if (/(^|\W)(datum|date)(\W|$)/.test(joined)) score += 3
        if (/(beschreibung|bezeichnung|zweck|text|desc)/.test(joined)) score += 2
        const hasBankPlus = /(bank|konto).*(\+|ein|eingang|einnahm)/.test(joined)
        const hasBankMinus = /(bank|konto).*(-|ausgab|ausgang)/.test(joined)
        const hasCashPlus = /(bar|kasse|barkonto).*(\+|ein|einnahm)/.test(joined)
        const hasCashMinus = /(bar|kasse|barkonto).*(-|ausgab)/.test(joined)
        if (hasBankPlus) score += 2
        if (hasBankMinus) score += 2
        if (hasCashPlus) score += 2
        if (hasCashMinus) score += 2
        if (/(brutto|betrag|amount)/.test(joined)) score += 1
        if (score > bestScore) {
            bestScore = score
            bestIdx = r
            bestHeaders = headers
            // Build mapping name -> actual column number for this candidate
            const map: Record<string, number> = {}
            headers.forEach((h, i) => { map[h] = cols[i] })
            bestIdxByHeader = map
        }
    }
    // Fallback to row 1 if nothing matched
    if (bestScore < 0) {
        const row = ws.getRow(1)
        const headers: string[] = []
        const cols: number[] = []
        row.eachCell((cell, colNumber) => { headers.push(String(normalizeCellValue(cell.value) ?? '').trim()); cols.push(colNumber) })
        bestHeaders = headers
        bestIdx = 1
        const map: Record<string, number> = {}
        headers.forEach((h, i) => { map[h] = cols[i] })
        bestIdxByHeader = map
    }
    const idxByHeader: Record<string, number> = bestIdxByHeader
    return { headerRowIdx: bestIdx, headers: bestHeaders, idxByHeader, score: bestScore }
}

// Choose the worksheet that most likely contains the import table
function pickWorksheet(wb: ExcelJS.Workbook): { ws: ExcelJS.Worksheet; headerRowIdx: number; headers: string[]; idxByHeader: Record<string, number> } | null {
    let best: { ws: ExcelJS.Worksheet; headerRowIdx: number; headers: string[]; idxByHeader: Record<string, number>; score: number } | null = null
    for (const ws of wb.worksheets) {
        const det = detectHeader(ws)
        if (!best || det.score > best.score) {
            best = { ws, ...det }
        }
    }
    if (!best) return null
    const { ws, headerRowIdx, headers, idxByHeader } = best
    return { ws, headerRowIdx, headers, idxByHeader }
}

// Normalize ExcelJS cell.value into primitive string/number/Date where possible
function normalizeCellValue(v: any): any {
    if (v == null) return v
    if (typeof v === 'string' || typeof v === 'number' || v instanceof Date) return v
    if (typeof v === 'object') {
        // Rich text
        if ((v as any).richText && Array.isArray((v as any).richText)) {
            try { return (v as any).richText.map((p: any) => p.text).join('') } catch { }
        }
        // Hyperlink
        if ((v as any).text && typeof (v as any).text === 'string') return (v as any).text
        // Formula result
        if (Object.prototype.hasOwnProperty.call(v, 'result')) return (v as any).result
        if ((v as any).formula && Object.prototype.hasOwnProperty.call(v, 'result')) return (v as any).result
    }
    return String(v)
}

// Generate a simple template XLSX file and return where it was saved
export async function generateImportTemplate(destPath?: string): Promise<{ filePath: string }> {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Import')
    const lookupSheet = ensureLookupSheet(wb)
    populateLookupSheet(wb, lookupSheet)
    // Intro text
    ws.addRow(['VereinO – Dynamische Importvorlage'])
    ws.addRow(['Hinweise:'])
    ws.addRow(['1) Lege zuerst Konten, Budgets, Zweckbindungen und Tags in VereinO an. 2) Nutze dann diese Vorlage mit den aktuellen Listen. 3) Mehrfach-Tags mit ; trennen.'])
    ws.getRow(1).font = { bold: true, size: 14 }
    ws.getRow(2).font = { bold: true }
    ws.addRow([])
    const columns = ['Datum', 'Beschreibung', 'Kommentar', 'Art (IN/OUT/TRANSFER)', 'Sphäre', 'Konto', 'Einnahmen (Brutto)', 'Ausgaben (Brutto)', 'Netto', 'USt %', 'Budget', 'Budget-Betrag', 'Zweckbindung', 'Zweckbindungs-Betrag', 'Tags']
    ws.columns = [
        { width: 12 }, { width: 34 }, { width: 24 }, { width: 18 }, { width: 14 }, { width: 30 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 10 }, { width: 34 }, { width: 14 }, { width: 32 }, { width: 18 }, { width: 28 }
    ]
    const firstAccount = buildPaymentAccountOptions()[0]?.label || ''
    const firstBudget = buildBudgetOptions()[0]?.label || ''
    const firstEarmark = buildEarmarkOptions()[0]?.label || ''
    ws.addTable({
        name: 'Buchungen',
        ref: 'A4',
        headerRow: true,
        totalsRow: false,
        columns: columns.map((c) => ({ name: c })),
        rows: [
            ['2025-01-15', 'Beispiel: Mitgliedsbeitrag', '', 'IN', 'IDEELL', firstAccount, 50, '', '', 0, firstBudget, 50, firstEarmark, 50, 'Mitglieder; Beitrag']
        ]
    })
    // Freeze header + intro
    ws.views = [{ state: 'frozen', ySplit: 4 }]
    addListValidation(ws, 'D5:D10000', '"IN,OUT,TRANSFER,INTERNAL"')
    addListValidation(ws, 'E5:E10000', '"IDEELL,ZWECK,VERMOEGEN,WGB"')
    addListValidation(ws, 'F5:F10000', '=PaymentAccounts')
    addListValidation(ws, 'K5:K10000', '=Budgets')
    addListValidation(ws, 'M5:M10000', '=Earmarks')

    // Power Query guidance
    const tips = wb.addWorksheet('PowerQuery_Hinweis')
    tips.addRow(['Power Query – Schnellstart'])
    tips.getRow(1).font = { bold: true, size: 14 }
    tips.addRow(['So kannst du Daten aus einer CSV/Excel-Datei in die Tabelle "Buchungen" laden:'])
    tips.addRow(['1) Daten > Daten abrufen > Aus Datei > Aus Text/CSV (oder Aus Arbeitsmappe)'])
    tips.addRow(['2) Im Power Query-Editor Spalten umbenennen auf: ' + columns.join(', ')])
    tips.addRow(['3) Werte als Dezimalzahlen (de-DE) interpretieren; Datum als Datum.'])
    tips.addRow(['4) Schließen & laden > In Tabelle – und Zielbereich A5 auf Blatt "Import" auswählen.'])
    tips.addRow(['Optional: Kopiere folgenden M-Code in den Erweiterten Editor und passe Quellen/Umbenennungen an.'])
    tips.addRow([])
    tips.addRow(['Beispiel-M-Code:'])
    const mCode = [
        'let',
        '  Quelle = Csv.Document(File.Contents("C:/Pfad/zu/datei.csv"),[Delimiter=";", Columns=10, Encoding=65001, QuoteStyle=QuoteStyle.None]),',
        '  Header = Table.PromoteHeaders(Quelle, [PromoteAllScalars=true]),',
        '  Umbenannt = Table.RenameColumns(Header, {',
        '    {"Datum","Datum"},',
        '    {"Text","Beschreibung"},',
        '    {"Typ","Art (IN/OUT/TRANSFER)"},',
        '    {"Konto","Konto"},',
        '    {"Einnahmen","Einnahmen (Brutto)"},',
        '    {"Ausgaben","Ausgaben (Brutto)"},',
        '    {"Netto","Netto"},',
        '    {"USt%","USt %"},',
        '    {"Sphaere","Sphäre"},',
        '    {"Budget","Budget"},',
        '    {"Zweckbindung","Zweckbindung"},',
        '    {"Tags","Tags"}',
        '  }),',
        '  Typen = Table.TransformColumnTypes(Umbenannt, {{"Datum", type date}, {"Einnahmen (Brutto)", type number}, {"Ausgaben (Brutto)", type number}, {"Netto", type number}, {"USt %", type number}})',
        'in',
        '  Typen'
    ].join('\n')
    tips.addRow([mCode])
    tips.getColumn(1).width = 140
    tips.getRow(10).alignment = { vertical: 'top', wrapText: true }

    // Save file with dialog
    let filePath = destPath
    if (!filePath) {
        const result = await dialog.showSaveDialog({
            title: 'Buchungen-Vorlage speichern',
            defaultPath: path.join(app.getPath('downloads'), 'Buchungen-Vorlage.xlsx'),
            filters: [{ name: 'Excel', extensions: ['xlsx'] }]
        })
        
        if (result.canceled || !result.filePath) {
            throw new Error('Abbruch durch Benutzer')
        }
        filePath = result.filePath
    }
    await wb.xlsx.writeFile(filePath!)
    return { filePath: filePath! }
}

// Generate a test XLSX with several example rows following the template columns
export async function generateImportTestData(destPath?: string): Promise<{ filePath: string }> {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Import')
    const lookupSheet = ensureLookupSheet(wb)
    populateLookupSheet(wb, lookupSheet)
    // Intro rows similar to template
    ws.addRow(['Verein Finanzplaner – Testdaten'])
    ws.addRow(['Diese Datei enthält Beispielbuchungen für den Import.'])
    ws.addRow(['Die Kopfzeile steht in Zeile 4, darunter die Daten.'])
    ws.getRow(1).font = { bold: true, size: 14 }
    ws.getRow(2).font = { bold: true }
    ws.addRow([])

    const columns = ['Datum', 'Beschreibung', 'Kommentar', 'Art (IN/OUT/TRANSFER)', 'Sphäre', 'Konto', 'Einnahmen (Brutto)', 'Ausgaben (Brutto)', 'Netto', 'USt %', 'Budget', 'Budget-Betrag', 'Zweckbindung', 'Zweckbindungs-Betrag', 'Tags']
    ws.columns = [
        { width: 12 }, { width: 34 }, { width: 22 }, { width: 18 }, { width: 14 }, { width: 30 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 10 }, { width: 34 }, { width: 14 }, { width: 32 }, { width: 18 }, { width: 28 }
    ]

    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')

    const account = buildPaymentAccountOptions()[0]?.label || ''
    const budget = buildBudgetOptions()[0]?.label || ''
    const earmark = buildEarmarkOptions()[0]?.label || ''
    const rows: any[] = [
        [`${y}-${m}-01`, 'Mitgliedsbeitrag', '', 'IN', 'IDEELL', account, 50, '', '', 0, budget, 50, earmark, 50, 'Mitglieder; Beitrag'],
        [`${y}-${m}-02`, 'Bürobedarf', 'Ordner und Papier', 'OUT', 'IDEELL', account, '', 23.5, '', 19, budget, 23.5, '', '', 'Verwaltung, Material'],
        [`${y}-${m}-03`, 'Spende', '', 'IN', 'IDEELL', account, 20, '', '', 0, '', '', earmark, 20, 'Spende'],
        [`${y}-${m}-04`, 'Reparatur', '', 'OUT', 'ZWECK', account, '', 45, '', 7, budget, 45, earmark, 45, 'Instandhaltung'],
        [`${y}-${m}-05`, 'Kuchenverkauf', 'Sommerfest', 'IN', 'IDEELL', account, 120, '', '', 7, budget, 120, '', '', 'Veranstaltung; Verkauf'],
        [`${y}-${m}-06`, 'Miete Saal', '', 'OUT', 'IDEELL', account, '', 300, '', 0, budget, 300, '', '', 'Miete'],
        [`${y}-${m}-07`, 'Erstattung Material', '', 'IN', 'ZWECK', account, 35.5, '', '', 0, budget, 35.5, '', '', 'Material'],
        [`${y}-${m}-08`, 'Fahrtkosten', '', 'OUT', 'ZWECK', account, '', 17.8, '', 0, '', '', earmark, 17.8, 'Fahrtkosten'],
        [`${y}-${m}-09`, 'Flohmarkt', '', 'IN', 'IDEELL', account, 88.9, '', '', 0, budget, 88.9, '', '', 'Veranstaltung'],
        [`${y}-${m}-10`, 'Summe', '', '', '', '', '', '', '', '', '', '', '', '', '']
    ]

    ws.addTable({ name: 'Buchungen', ref: 'A4', headerRow: true, totalsRow: false, columns: columns.map(n => ({ name: n })), rows })
    ws.views = [{ state: 'frozen', ySplit: 4 }]
    addListValidation(ws, 'D5:D10000', '"IN,OUT,TRANSFER,INTERNAL"')
    addListValidation(ws, 'E5:E10000', '"IDEELL,ZWECK,VERMOEGEN,WGB"')
    addListValidation(ws, 'F5:F10000', '=PaymentAccounts')
    addListValidation(ws, 'K5:K10000', '=Budgets')
    addListValidation(ws, 'M5:M10000', '=Earmarks')

    const fs = await import('node:fs')
    const path = await import('node:path')
    const os = await import('node:os')
    let filePath = destPath
    if (!filePath) {
        const baseDir = path.join(os.homedir(), 'Documents', 'VereinPlannerExports')
        try { fs.mkdirSync(baseDir, { recursive: true }) } catch { }
        const when = new Date()
        const stamp = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}_${String(when.getHours()).padStart(2, '0')}${String(when.getMinutes()).padStart(2, '0')}`
        filePath = path.join(baseDir, `Import_Testdaten_${stamp}.xlsx`)
    }
    await wb.xlsx.writeFile(filePath!)
    return { filePath: filePath! }
}

export async function exportEditableVouchersWorkbook(destPath?: string): Promise<{ filePath: string }> {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Buchungen')
    const lookupSheet = ensureLookupSheet(wb)
    populateLookupSheet(wb, lookupSheet)
    ws.addRow(['VereinO – Bearbeitbare Buchungsliste'])
    ws.addRow(['Ändere Werte direkt in dieser Tabelle und importiere sie anschließend wieder über den Buchungsimport.'])
    ws.addRow(['Wichtig: Buchungs-ID und Belegnummer nicht verändern. Mehrfach-Tags mit ; trennen.'])
    ws.addRow([])
    ws.getRow(1).font = { bold: true, size: 14 }
    ws.getRow(2).font = { bold: true }

    const columns = ['Buchungs-ID', 'Belegnummer', 'Datum', 'Beschreibung', 'Kommentar', 'Art (IN/OUT/TRANSFER)', 'Sphäre', 'Konto', 'Brutto', 'Netto', 'USt %', 'Budget', 'Budget-Betrag', 'Zweckbindung', 'Zweckbindungs-Betrag', 'Tags']
    ws.columns = [
        { width: 12 }, { width: 16 }, { width: 12 }, { width: 34 }, { width: 24 }, { width: 18 }, { width: 14 }, { width: 30 }, { width: 14 }, { width: 14 }, { width: 10 }, { width: 34 }, { width: 14 }, { width: 32 }, { width: 18 }, { width: 28 }
    ]
    const rows = dprepareVoucherExportRows()
    ws.addTable({
        name: 'BearbeitbareBuchungen',
        ref: 'A4',
        headerRow: true,
        totalsRow: false,
        columns: columns.map((name) => ({ name })),
        rows
    })
    ws.views = [{ state: 'frozen', ySplit: 4 }]
    addListValidation(ws, 'F5:F10000', '"IN,OUT,TRANSFER,INTERNAL"')
    addListValidation(ws, 'G5:G10000', '"IDEELL,ZWECK,VERMOEGEN,WGB"')
    addListValidation(ws, 'H5:H10000', '=PaymentAccounts')
    addListValidation(ws, 'L5:L10000', '=Budgets')
    addListValidation(ws, 'N5:N10000', '=Earmarks')

    let filePath = destPath
    if (!filePath) {
        const result = await dialog.showSaveDialog({
            title: 'Bearbeitbare Buchungsliste speichern',
            defaultPath: path.join(app.getPath('downloads'), 'Buchungen-Bearbeiten.xlsx'),
            filters: [{ name: 'Excel', extensions: ['xlsx'] }]
        })
        if (result.canceled || !result.filePath) throw new Error('Abbruch durch Benutzer')
        filePath = result.filePath
    }
    await wb.xlsx.writeFile(filePath!)
    return { filePath: filePath! }
}

function dprepareVoucherExportRows(): any[][] {
    const d = getDb()
    const rows = d.prepare(`
        SELECT
            v.id,
            v.voucher_no as voucherNo,
            v.date,
            v.description,
            v.note,
            v.type,
            v.sphere,
            v.payment_account_id as paymentAccountId,
            pa.name as paymentAccountName,
            pa.kind as paymentAccountKind,
            v.gross_amount as grossAmount,
            v.net_amount as netAmount,
            v.vat_rate as vatRate,
            v.budget_id as budgetId,
            v.budget_amount as budgetAmount,
            v.earmark_id as earmarkId,
            v.earmark_amount as earmarkAmount,
            e.code as earmarkCode,
            e.name as earmarkName,
            b.year as budgetYear,
            b.sphere as budgetSphere,
            b.name as budgetName,
            b.category_name as budgetCategoryName,
            b.project_name as budgetProjectName,
            (
                SELECT GROUP_CONCAT(t.name, '; ')
                FROM voucher_tags vt
                JOIN tags t ON t.id = vt.tag_id
                WHERE vt.voucher_id = v.id
            ) as tags
        FROM vouchers v
        LEFT JOIN payment_accounts pa ON pa.id = v.payment_account_id
        LEFT JOIN budgets b ON b.id = v.budget_id
        LEFT JOIN earmarks e ON e.id = v.earmark_id
        ORDER BY v.date DESC, v.id DESC
    `).all() as any[]
    return rows.map((row) => {
        const accountLabel = row.paymentAccountId ? `#${row.paymentAccountId} | ${row.paymentAccountName || 'Konto'} [${row.paymentAccountKind || 'BANK'}]` : ''
        const budgetBase = row.budgetName || row.budgetCategoryName || row.budgetProjectName || (row.budgetId ? `Budget ${row.budgetId}` : '')
        const budgetLabel = row.budgetId ? `#${row.budgetId} | ${row.budgetYear} · ${row.budgetSphere} · ${budgetBase}` : ''
        const earmarkLabel = row.earmarkId ? `#${row.earmarkId} | ${row.earmarkCode || ''} · ${row.earmarkName || ''}`.trim() : ''
        return [
            row.id,
            row.voucherNo,
            row.date,
            row.description || '',
            row.note || '',
            row.type,
            row.sphere,
            accountLabel,
            row.grossAmount,
            row.netAmount,
            row.vatRate,
            budgetLabel,
            row.budgetAmount ?? '',
            earmarkLabel,
            row.earmarkAmount ?? '',
            row.tags || ''
        ]
    })
}
