import ExcelJS from 'exceljs'
import { Buffer as NodeBuffer } from 'node:buffer'
import { createVoucher } from '../repositories/vouchers'
import { getDb } from '../db/database'
import { writeAudit } from './audit'
import { XMLParser } from 'fast-xml-parser'

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
}

const FIELD_KEYS = ['date', 'type', 'sphere', 'description', 'paymentMethod', 'netAmount', 'vatRate', 'grossAmount', 'inGross', 'outGross', 'earmarkCode', 'bankIn', 'bankOut', 'cashIn', 'cashOut', 'defaultSphere'] as const
export type FieldKey = typeof FIELD_KEYS[number]

function normalizeHeader(h: string) {
    const s = (h || '').toString().trim().toLowerCase()
    return s
}

function suggestMapping(headers: string[]): Record<string, string | null> {
    const map: Record<string, string | null> = {
        date: null, type: null, sphere: null, description: null, paymentMethod: null, netAmount: null, vatRate: null, grossAmount: null, inGross: null, outGross: null, earmarkCode: null,
        bankIn: null, bankOut: null, cashIn: null, cashOut: null, defaultSphere: 'IDEELL'
    }
    for (const h of headers) {
        const n = normalizeHeader(h)
        if (!map.date && /(datum|date)/.test(n)) map.date = h
        else if (!map.type && /(art|type|in|out|transfer)/.test(n)) map.type = h
        else if (!map.sphere && /(sph|sphäre|sphere)/.test(n)) map.sphere = h
        else if (!map.description && /(beschreibung|text|zweck|desc|bezeichnung)/.test(n)) map.description = h
        else if (!map.paymentMethod && /(zahlweg|payment|bar|bank|konto)/.test(n)) map.paymentMethod = h
        else if (!map.netAmount && /(netto|net)/.test(n)) map.netAmount = h
        else if (!map.vatRate && /(ust|mwst|vat)/.test(n)) map.vatRate = h
        else if (!map.inGross && /(ein|einnahm|eingang)/.test(n) && /(brutto|betrag|amount)?/.test(n)) map.inGross = h
        else if (!map.outGross && /(ausgab|ausgang)/.test(n) && /(brutto|betrag|amount)?/.test(n)) map.outGross = h
        else if (!map.grossAmount && /(brutto|gross|betrag|amount)/.test(n)) map.grossAmount = h
        else if (!map.earmarkCode && /(zweckbindung|earmark|code)/.test(n)) map.earmarkCode = h
        else if (!map.bankIn && /bank|konto/.test(n) && (/\+/.test(n) || /(ein|eingang|einnahm)/.test(n))) map.bankIn = h
        else if (!map.bankOut && /bank|konto/.test(n) && (/-/.test(n) || /(ausgab|ausgang)/.test(n))) map.bankOut = h
        else if (!map.cashIn && /(bar|kasse|barkonto)/.test(n) && (/\+/.test(n) || /(ein|einnahm)/.test(n))) map.cashIn = h
        else if (!map.cashOut && /(bar|kasse|barkonto)/.test(n) && (/-/.test(n) || /(ausgab)/.test(n))) map.cashOut = h
    }
    return map
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
        bankIn: 'Bank +', bankOut: 'Bank -', cashIn: null, cashOut: null, defaultSphere: 'IDEELL'
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
    return { imported, skipped, errors, rowStatuses }
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
            if (!date) {
                const txt = [rawDate, get('description')].map(x => (x == null ? '' : String(x))).join(' ').toLowerCase()
                if (/ergebnis|summe|saldo/.test(txt)) { skipped++; track(r, false, 'Summen-/Saldozeile übersprungen'); continue }
                throw new Error('Datum fehlt/ungültig')
            }
            const type = parseEnum(get('type'), ['IN', 'OUT', 'TRANSFER'] as const)
            const sphere = parseEnum(get('sphere'), ['IDEELL', 'ZWECK', 'VERMOEGEN', 'WGB'] as const) || parseEnum(mapping['defaultSphere'] || 'IDEELL', ['IDEELL', 'ZWECK', 'VERMOEGEN', 'WGB'] as const) || 'IDEELL'
            const description = get('description') != null ? String(get('description')) : undefined
            const paymentMethod = parseEnum(get('paymentMethod'), ['BAR', 'BANK'] as const)
            let netAmount = parseNumber(get('netAmount'))
            let vatRate = parseNumber(get('vatRate')) ?? 19
            let grossAmount = parseNumber(get('grossAmount'))
            const inGross = parseNumber(get('inGross'))
            const outGross = parseNumber(get('outGross'))

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
                const pm = paymentMethod || 'BANK'
                if (inGross != null && inGross !== 0) ops.push({ pm: pm as any, t: 'IN', amount: Math.abs(inGross) })
                if (outGross != null && outGross !== 0) ops.push({ pm: pm as any, t: 'OUT', amount: Math.abs(outGross) })
            }

            // Infer type from sign if not provided
            const signSource = grossAmount ?? netAmount
            let t: 'IN' | 'OUT' | 'TRANSFER' = (type as any) || 'IN'
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
                if (earmarkIdByCode.has(code)) earmarkId = earmarkIdByCode.get(code)
                else {
                    const row = d.prepare('SELECT id FROM earmarks WHERE code = ?').get(code) as any
                    if (row?.id) { earmarkIdByCode.set(code, row.id); earmarkId = row.id }
                    else throw new Error(`Zweckbindung nicht gefunden: ${code}`)
                }
            }

            if (ops.length > 0) {
                // From bank/cash columns; create one voucher per non-zero op
                for (const op of ops) {
                    const payload: any = { date, type: op.t, sphere, description, paymentMethod: op.pm, vatRate: 0, grossAmount: op.amount }
                    if (earmarkId != null) payload.earmarkId = earmarkId
                    await Promise.resolve(createVoucher(payload))
                    imported++
                }
                track(r, true)
            } else {
                // Build payload: prefer gross if present
                const payload: any = { date, type: t, sphere, description, paymentMethod, vatRate }
                if (grossAmount != null) payload.grossAmount = grossAmount
                else if (netAmount != null) payload.netAmount = netAmount
                else { skipped++; track(r, false, 'Kein Betrag (Netto/Brutto)'); continue }
                if (earmarkId != null) payload.earmarkId = earmarkId
                await Promise.resolve(createVoucher(payload))
                imported++
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
    return { imported, skipped, errors, rowStatuses, errorFilePath }
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
    // Intro text
    ws.addRow(['Verein Finanzplaner – Importvorlage'])
    ws.addRow(['Hinweise:'])
    ws.addRow(['1) Trage die Buchungen in die Tabelle ab Zeile 4 ein. 2) Summen-/Saldozeilen überspringt der Import automatisch. 3) Sphäre bitte aus der Liste wählen.'])
    ws.getRow(1).font = { bold: true, size: 14 }
    ws.getRow(2).font = { bold: true }
    ws.addRow([])
    // Define table aligned with app logic
    // Removed 'Anmerkungen' column – not used by the app
    const columns = ['Datum', 'Beschreibung', 'Art (IN/OUT/TRANSFER)', 'Zahlweg (BAR/BANK)', 'Einnahmen (Brutto)', 'Ausgaben (Brutto)', 'USt %', 'Sphäre', 'Zweckbindung-Code']
    ws.columns = [
        { width: 12 }, { width: 40 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 10 }, { width: 14 }, { width: 18 }
    ]
    ws.addTable({
        name: 'Buchungen',
        ref: 'A4',
        headerRow: true,
        totalsRow: false,
        columns: columns.map((c) => ({ name: c })),
        rows: [
            ['2025-01-15', 'Beispiel: Mitgliedsbeitrag', 'IN', 'BANK', 50, '', 0, 'IDEELL', '']
        ]
    })
    // Freeze header + intro
    ws.views = [{ state: 'frozen', ySplit: 4 }]
        // Data validations: C=Art, D=Zahlweg, H=Sphäre
        ; (ws as any).dataValidations?.add('C5:C10000', { type: 'list', allowBlank: true, formulae: ['"IN,OUT,TRANSFER"'] })
        ; (ws as any).dataValidations?.add('D5:D10000', { type: 'list', allowBlank: true, formulae: ['"BAR,BANK"'] })
        ; (ws as any).dataValidations?.add('H5:H10000', { type: 'list', allowBlank: true, formulae: ['"IDEELL,ZWECK,VERMOEGEN,WGB"'] })

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
        '  Quelle = Csv.Document(File.Contents("C:/Pfad/zu/datei.csv"),[Delimiter=";", Columns=9, Encoding=65001, QuoteStyle=QuoteStyle.None]),',
        '  Header = Table.PromoteHeaders(Quelle, [PromoteAllScalars=true]),',
        '  Umbenannt = Table.RenameColumns(Header, {',
        '    {"Datum","Datum"},',
        '    {"Text","Beschreibung"},',
        '    {"Typ","Art (IN/OUT/TRANSFER)"},',
        '    {"Zahlweg","Zahlweg (BAR/BANK)"},',
        '    {"Einnahmen","Einnahmen (Brutto)"},',
        '    {"Ausgaben","Ausgaben (Brutto)"},',
        '    {"USt%","USt %"},',
        '    {"Sphaere","Sphäre"}',
        '  }),',
        '  Typen = Table.TransformColumnTypes(Umbenannt, {{"Datum", type date}, {"Einnahmen (Brutto)", type number}, {"Ausgaben (Brutto)", type number}, {"USt %", type number}})',
        'in',
        '  Typen'
    ].join('\n')
    tips.addRow([mCode])
    tips.getColumn(1).width = 140
    tips.getRow(10).alignment = { vertical: 'top', wrapText: true }

    // Save file
    const fs = await import('node:fs')
    const path = await import('node:path')
    const os = await import('node:os')
    let filePath = destPath
    if (!filePath) {
        const baseDir = path.join(os.homedir(), 'Documents', 'VereinPlannerExports')
        try { fs.mkdirSync(baseDir, { recursive: true }) } catch { }
        const when = new Date()
        const stamp = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}_${String(when.getHours()).padStart(2, '0')}${String(when.getMinutes()).padStart(2, '0')}`
        filePath = path.join(baseDir, `Import_Vorlage_${stamp}.xlsx`)
    }
    await wb.xlsx.writeFile(filePath!)
    return { filePath: filePath! }
}

// Generate a test XLSX with several example rows following the template columns
export async function generateImportTestData(destPath?: string): Promise<{ filePath: string }> {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Import')
    // Intro rows similar to template
    ws.addRow(['Verein Finanzplaner – Testdaten'])
    ws.addRow(['Diese Datei enthält Beispielbuchungen für den Import.'])
    ws.addRow(['Die Kopfzeile steht in Zeile 4, darunter die Daten.'])
    ws.getRow(1).font = { bold: true, size: 14 }
    ws.getRow(2).font = { bold: true }
    ws.addRow([])

    const columns = ['Datum', 'Beschreibung', 'Art (IN/OUT/TRANSFER)', 'Zahlweg (BAR/BANK)', 'Einnahmen (Brutto)', 'Ausgaben (Brutto)', 'USt %', 'Sphäre', 'Zweckbindung-Code']
    ws.columns = [
        { width: 12 }, { width: 40 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 10 }, { width: 14 }, { width: 18 }
    ]

    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')

    const rows: any[] = [
        [`${y}-${m}-01`, 'Mitgliedsbeitrag', 'IN', 'BANK', 50, '', 0, 'IDEELL', ''],
        [`${y}-${m}-02`, 'Bürobedarf', 'OUT', 'BANK', '', 23.5, 19, 'IDEELL', ''],
        [`${y}-${m}-03`, 'Spende bar', 'IN', 'BAR', 20, '', 0, 'IDEELL', ''],
        [`${y}-${m}-04`, 'Reparatur', 'OUT', 'BAR', '', 45, 7, 'ZWECK', ''],
        [`${y}-${m}-05`, 'Kuchenverkauf', 'IN', 'BANK', 120, '', 7, 'IDEELL', ''],
        [`${y}-${m}-06`, 'Miete Saal', 'OUT', 'BANK', '', 300, 0, 'IDEELL', ''],
        [`${y}-${m}-07`, 'Erstattung Material', 'IN', 'BANK', 35.5, '', 0, 'ZWECK', ''],
        [`${y}-${m}-08`, 'Fahrtkosten', 'OUT', 'BAR', '', 17.8, 0, 'ZWECK', ''],
        [`${y}-${m}-09`, 'Flohmarkt', 'IN', 'BAR', 88.9, '', 0, 'IDEELL', ''],
        [`${y}-${m}-10`, 'Summe', '', '', '', '', '', '', '']
    ]

    ws.addTable({ name: 'Buchungen', ref: 'A4', headerRow: true, totalsRow: false, columns: columns.map(n => ({ name: n })), rows })
    ws.views = [{ state: 'frozen', ySplit: 4 }]

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
