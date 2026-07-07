import ExcelJS from 'exceljs'
import { getDb } from '../db/database'
import { getSetting, setSetting } from './settings'
import { createExportPath } from './exportPaths'
import { summarizeVouchers, monthlyVouchers, listVouchersAdvanced, cashBalance as getCashBalance } from '../repositories/vouchers'
import { writeAudit } from './audit'
import { voucherStatusKind, voucherStatusText } from './voucherStatus'

export async function preview(year: number) {
    const from = `${year}-01-01`
    const to = `${year}-12-31`
    const summary = summarizeVouchers({ from, to } as any)
    const cashBalance = getCashBalance({ to })
    // Extract IN and OUT totals
    const inType = (summary.byType as any[]).find((t: any) => t.key === 'IN') || { net: 0, vat: 0, gross: 0 }
    const outType = (summary.byType as any[]).find((t: any) => t.key === 'OUT') || { net: 0, vat: 0, gross: 0 }
    const round2 = (n: number) => Math.round(n * 100) / 100
    const adjustedTotals = {
        ...summary.totals,
        inGross: round2(Number(inType.gross || 0)),
        outGross: round2(Number(outType.gross || 0)),
        // Show saldo for gross (Einnahmen − Ausgaben)
        gross: round2(Number(inType.gross || 0) - Number(outType.gross || 0))
        // Note: net and vat remain as simple sums to preserve existing breakdown expectations
    }
    return { year, from, to, totals: adjustedTotals, bySphere: summary.bySphere, byPaymentMethod: summary.byPaymentMethod, byPaymentAccount: (summary as any).byPaymentAccount, byType: summary.byType, cashBalance }
}

function paymentAccountLabel(row: any) {
    if (row?.type === 'TRANSFER') {
        const from = row.transferFromAccountName || (row.transferFrom === 'BAR' ? 'Bar' : row.transferFrom === 'BANK' ? 'Bank' : '')
        const to = row.transferToAccountName || (row.transferTo === 'BAR' ? 'Bar' : row.transferTo === 'BANK' ? 'Bank' : '')
        return from && to ? `${from} -> ${to}` : 'Transfer'
    }
    return row?.paymentAccountName || (row?.paymentMethod === 'BAR' ? 'Bar' : row?.paymentMethod === 'BANK' ? 'Bank' : '')
}

export async function exportPackage(year: number): Promise<{ filePath: string }> {
    const from = `${year}-01-01`
    const to = `${year}-12-31`
    const stamp = `${year}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`
    const filePath = createExportPath(`Jahresabschluss_${stamp}.xlsx`)

    const wb = new ExcelJS.Workbook()
    // Summary sheet
    const summary = summarizeVouchers({ from, to } as any)
    const ws1 = wb.addWorksheet('Zusammenfassung')
    const orgName = (getSetting<string>('org.name') || '').trim()
    ws1.addRow([`Jahresabschluss ${year}${orgName ? ` – ${orgName}` : ''}`])
    ws1.addRow([`Zeitraum: ${from} – ${to}`])
    ws1.addRow([])
    // Totals: Einnahmen, Ausgaben, Jahresabschluss (IN - OUT)
    const totalIN = (summary.byType.find((t: any) => t.key === 'IN')?.gross || 0)
    const totalOUT = (summary.byType.find((t: any) => t.key === 'OUT')?.gross || 0)
    const jahresabschluss = totalIN - totalOUT
    ws1.addRow(['Einnahmen (Brutto)', 'Ausgaben (Brutto)', 'Jahresabschluss (Brutto)'])
    ws1.addRow([totalIN, totalOUT, jahresabschluss])
    ws1.getRow(1).font = { bold: true, size: 14 }
    // Make columns wider to avoid #### truncation and truncated headings
    ws1.getColumn(1).width = 24
    ws1.getColumn(2).width = 16
    ws1.getColumn(3).width = 16
    ws1.getColumn(2).alignment = { horizontal: 'right' }
    ws1.getColumn(3).alignment = { horizontal: 'right' }
    // Currency formatting for totals row (trailing €)
    const CURRENCY_FMT = '#,##0.00 "€";[Red]-#,##0.00 "€"'
    const totalsRow = ws1.getRow(5)
    for (let c = 1; c <= 3; c++) totalsRow.getCell(c).numFmt = CURRENCY_FMT
    // By sphere table below
    ws1.addRow([])
    ws1.addRow(['Nach Sphäre', '', ''])
    ws1.getRow(ws1.rowCount).font = { bold: true }
    ws1.addRow(['Sphäre', 'Brutto', 'Netto'])
    for (const s of summary.bySphere) {
        const r = ws1.addRow([s.key, s.gross, s.net])
        r.getCell(2).numFmt = CURRENCY_FMT
        r.getCell(3).numFmt = CURRENCY_FMT
    }
    // Keep sphere table readable
    ws1.getColumn(1).width = Math.max(ws1.getColumn(1).width || 0, 18)
    ws1.getColumn(2).width = Math.max(ws1.getColumn(2).width || 0, 16)
    ws1.getColumn(3).width = Math.max(ws1.getColumn(3).width || 0, 16)

    ws1.addRow([])
    ws1.addRow(['Nach Zahlungskonto', '', ''])
    ws1.getRow(ws1.rowCount).font = { bold: true }
    ws1.addRow(['Konto', 'Brutto', 'Netto'])
    const paymentAccountRows = Array.isArray((summary as any).byPaymentAccount) && (summary as any).byPaymentAccount.length
        ? (summary as any).byPaymentAccount
        : summary.byPaymentMethod.map((p: any) => ({ key: p.key === 'BAR' ? 'Bar' : p.key === 'BANK' ? 'Bank' : 'Ohne Konto', gross: p.gross, net: p.net }))
    for (const account of paymentAccountRows) {
        const r = ws1.addRow([account.key, account.gross, account.net])
        r.getCell(2).numFmt = CURRENCY_FMT
        r.getCell(3).numFmt = CURRENCY_FMT
    }

    // Journal sheet
    const rows = listVouchersAdvanced({ from, to, limit: 200000 })
    const ws2 = wb.addWorksheet('Journal')
    const head = ['Datum', 'Nr.', 'Typ', 'Sphäre', 'Beschreibung', 'Status', 'Zahlweg', 'Netto', 'MwSt', 'Brutto', 'Tags']
    ws2.addRow(head)
    const startRow = 2
    for (const r of rows) {
        const status = voucherStatusText(r)
        const row = ws2.addRow([
            r.date,
            r.voucherNo,
            r.type,
            r.sphere,
            r.description ?? '',
            status,
            paymentAccountLabel(r),
            Number(r.netAmount?.toFixed?.(2) ?? r.netAmount),
            Number(r.vatAmount?.toFixed?.(2) ?? r.vatAmount),
            Number(r.grossAmount?.toFixed?.(2) ?? r.grossAmount),
            (r.tags || []).join(', ')
        ])
        const kind = voucherStatusKind(r)
        if (kind === 'storno') {
            row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF1F1' } }
        } else if (kind === 'storniert') {
            row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F1F1' } }
            row.font = { color: { argb: 'FF555555' } }
        }
        // Currency formatting for numeric columns (trailing €)
        row.getCell(8).numFmt = CURRENCY_FMT
        row.getCell(9).numFmt = CURRENCY_FMT
        row.getCell(10).numFmt = CURRENCY_FMT
    }
    ws2.getRow(1).font = { bold: true }
    // Column widths and alignments
    ws2.getColumn(1).width = 12 // Datum
    ws2.getColumn(2).width = 8  // Nr.
    ws2.getColumn(3).width = 10 // Typ
    ws2.getColumn(4).width = 10 // Sphäre
    ws2.getColumn(5).width = 40 // Beschreibung
    ws2.getColumn(6).width = 28 // Status
    ws2.getColumn(7).width = 12 // Zahlweg
    ws2.getColumn(8).width = 14 // Netto
    ws2.getColumn(9).width = 14 // MwSt
    ws2.getColumn(10).width = 14 // Brutto
    ws2.getColumn(11).width = 20 // Tags
    ws2.getColumn(5).alignment = { wrapText: true }
    ws2.getColumn(6).alignment = { wrapText: true }
    ws2.getColumn(8).alignment = { horizontal: 'right' }
    ws2.getColumn(9).alignment = { horizontal: 'right' }
    ws2.getColumn(10).alignment = { horizontal: 'right' }
    // Freeze header row
    ;(ws2 as any).views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }]
    // Add a stable AutoFilter on the header
    try { (ws2 as any).autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: head.length }
    } } catch {}

    // Monthly sheet
    const ws3 = wb.addWorksheet('Monate (Brutto-Saldo)')
    ws3.addRow(['Monat', 'Saldo (IN-OUT)'])
    const months = monthlyVouchers({ from, to })
    for (const m of months) {
        const r = ws3.addRow([m.month, Number(m.gross?.toFixed?.(2) ?? m.gross)])
        r.getCell(2).numFmt = CURRENCY_FMT
    }
    ws3.getRow(1).font = { bold: true }
    // Column widths and alignment
    ws3.getColumn(1).width = 10
    ws3.getColumn(2).width = 16
    ws3.getColumn(2).alignment = { horizontal: 'right' }

    await wb.xlsx.writeFile(filePath)
    return { filePath }
}

export function closeYear(year: number): { ok: boolean; closedUntil: string } {
    const d = getDb()
    // Cumulative barrier model: closing a year locks all dates <= 31.12.year
    const closedUntil = `${year}-12-31`
    setSetting('period_lock', { closedUntil }, d)
    try { writeAudit(d as any, null, 'yearEnd', year, 'CLOSE', { closedUntil }) } catch {}
    return { ok: true, closedUntil }
}

export function reopenAfter(year: number): { ok: boolean; closedUntil: string | null } {
    const d = getDb()
    const current = getSetting<{ closedUntil?: string | null; years?: number[] }>('period_lock', d) || {}
    let nextClosedUntil: string | null = null
    if (current.closedUntil) {
        // If the barrier equals the provided year, move it to the previous year; otherwise leave as is
        const curY = Number(String(current.closedUntil).slice(0, 4))
        if (year >= curY) {
            const prevY = curY - 1
            nextClosedUntil = prevY >= 1900 ? `${prevY}-12-31` : null
        } else {
            // Asked to reopen a year older than the barrier, keep barrier
            nextClosedUntil = current.closedUntil
        }
    } else if (Array.isArray(current.years) && current.years.length) {
        // Legacy: derive barrier from max year after removing provided year
        const remain = current.years.filter((y) => y < year)
        if (remain.length) nextClosedUntil = `${Math.max(...remain)}-12-31`
        else nextClosedUntil = null
    }
    setSetting('period_lock', { closedUntil: nextClosedUntil }, d)
    try { writeAudit(d as any, null, 'yearEnd', year, 'REOPEN', { closedUntil: nextClosedUntil }) } catch {}
    return { ok: true, closedUntil: nextClosedUntil }
}

export function status(): { closedUntil: string | null } {
    const d = getDb()
    const s = getSetting<{ closedUntil?: string | null; years?: number[] }>('period_lock', d) || {}
    if (s.closedUntil) return { closedUntil: s.closedUntil }
    if (Array.isArray(s.years) && s.years.length > 0) {
        // Legacy migration path: treat max year as barrier
        const y = Math.max(...s.years)
        return { closedUntil: `${y}-12-31` }
    }
    return { closedUntil: null }
}
